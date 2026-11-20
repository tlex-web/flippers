import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import type { BallId, BallSpec, BallState, CollisionEvent } from "../physics/types";
import {
  BALLS_PER_GAME,
  GameSession,
  type FlipperGate,
  type GameSessionWorld,
} from "./game-session";
import { NUDGE_COOLDOWN_STEPS, NUDGE_IMPULSE, WARNING_FLASH_STEPS } from "./tuning";

/**
 * GameSession contracts:
 * - score (plan 04-01 Task 2, GAME-01 precision edge): the score is an exact,
 *   non-negative, saturating integer;
 * - 3-ball FSM (plan 04-05 Task 2, GAME-02): start, serve, drain, game over and
 *   restart, against a spy world and a real `CollisionRouter` over a scripted
 *   source. Each simulated step is `dispatch()` then `service()`, as in main.ts.
 * - nudge and tilt (plan 04-06 Task 2, GAME-03, R9-R11): the direction table,
 *   the warning window, the tilted state, and the tilt costing only the current
 *   ball, against the same spy world (which also records every impulse).
 * - flipper relay (plan 04-08 Task 2, GAME-03, R11): every `setEnabled` call
 *   the session makes on its `FlipperGate`, recorded by the rig.
 */

/** A flipper gate that ignores every call (the score and FSM cases do not read it). */
const NO_GATE: FlipperGate = { setEnabled: () => {} };

/**
 * The ONE place a score-contract session is built: a minimal spy world (addBall
 * hands out increasing ids, removeBall does nothing) and a router over an empty
 * source, then `onStart()` so the session is live for the award cases.
 */
function makeSession(): GameSession {
  let nextId: BallId = 0;
  const world: GameSessionWorld = {
    addBall: () => nextId++,
    removeBall: () => {},
    getBalls: () => [],
    applyImpulse: () => {},
  };
  const router = new CollisionRouter({ drainEvents: () => [] });
  const session = new GameSession(world, router, { x: 0, y: 0 }, NO_GATE);
  session.onStart();
  return session;
}

describe("GameSession score (GAME-01)", () => {
  it("a freshly started session has score 0 and is live", () => {
    const s = makeSession();
    expect(s.getScore()).toBe(0);
    expect(s.isLive()).toBe(true);
  });

  it("award(1000) twice gives 2000", () => {
    const s = makeSession();
    s.award(1000);
    s.award(1000);
    expect(s.getScore()).toBe(2000);
  });

  it("negative, fractional, NaN and infinite points leave the score unchanged", () => {
    const s = makeSession();
    s.award(1000);
    s.award(-1);
    s.award(1.5);
    s.award(Number.NaN);
    s.award(Number.POSITIVE_INFINITY);
    expect(s.getScore()).toBe(1000);
  });

  it("saturates at Number.MAX_SAFE_INTEGER", () => {
    const s = makeSession();
    s.award(Number.MAX_SAFE_INTEGER);
    s.award(1);
    expect(s.getScore()).toBe(Number.MAX_SAFE_INTEGER);
  });
});

/** Spawn the FSM serves to. */
const SPAWN: BallSpec = { x: 3.15, y: 6.2 };

/** First id the spy world hands out. */
const FIRST_ID = 10;

type Call = { readonly op: "add"; readonly spec: BallSpec } | { readonly op: "remove"; readonly id: BallId };

interface Impulse {
  readonly id: BallId;
  readonly ix: number;
  readonly iy: number;
}

interface Rig {
  readonly session: GameSession;
  /** Every add/remove world call, in order. */
  readonly calls: Call[];
  /** Every applyImpulse call, in order. */
  readonly impulses: Impulse[];
  /** Every FlipperGate.setEnabled value, in order. */
  readonly gate: boolean[];
  /** Advance the session clock `n` fixed steps. */
  tick(n: number): void;
  /** Balls currently in the spy world (added and not yet removed). */
  liveCount(): number;
  /** Deliver `events` as one bus batch WITHOUT the service() that follows it. */
  dispatchOnly(...events: CollisionEvent[]): void;
  /** Run one step whose bus batch is `events`: dispatch, then service. */
  step(...events: CollisionEvent[]): void;
}

function drainOf(ballId: BallId): CollisionEvent {
  return {
    type: "ball-wall",
    ballId,
    elementKind: "drain",
    elementId: 600,
    point: { x: 0, y: 0 },
    normalImpulse: 0,
  };
}

/** A spy ball snapshot: only the id is read. */
function spyBall(id: BallId): BallState {
  return { id, x: 0, y: 0, vx: 0, vy: 0, radius: 0.2, angle: 0 };
}

/**
 * The spy world: addBall hands out increasing ids from FIRST_ID, getBalls
 * reports every live ball plus `extraBallIds` (untracked balls on the table),
 * and applyImpulse is recorded.
 */
function makeRig(extraBallIds: readonly BallId[] = []): Rig {
  const calls: Call[] = [];
  const impulses: Impulse[] = [];
  const gate: boolean[] = [];
  const live = new Set<BallId>();
  let nextId: BallId = FIRST_ID;
  const world: GameSessionWorld = {
    addBall: (spec) => {
      calls.push({ op: "add", spec });
      live.add(nextId);
      return nextId++;
    },
    removeBall: (id) => {
      calls.push({ op: "remove", id });
      live.delete(id);
    },
    getBalls: () => [...live, ...extraBallIds].map(spyBall),
    applyImpulse: (id, ix, iy) => {
      impulses.push({ id, ix, iy });
    },
  };
  let batch: CollisionEvent[] = [];
  const router = new CollisionRouter({ drainEvents: () => batch });
  const session = new GameSession(world, router, SPAWN, {
    setEnabled: (enabled) => {
      gate.push(enabled);
    },
  });
  const dispatchOnly = (...events: CollisionEvent[]): void => {
    batch = events;
    router.dispatch();
    batch = [];
  };
  return {
    session,
    calls,
    impulses,
    gate,
    tick: (n) => {
      for (let i = 0; i < n; i++) session.tick();
    },
    liveCount: () => live.size,
    dispatchOnly,
    step: (...events) => {
      dispatchOnly(...events);
      session.service();
    },
  };
}

/** Start a game and drain the active ball `n` times. */
function startAndDrain(r: Rig, n: number): void {
  r.session.onStart();
  for (let i = 0; i < n; i++) r.step(drainOf(r.session.activeBallId));
}

describe("GameSession 3-ball FSM (GAME-02)", () => {
  it("boots into game-over: ball 0, never played, no ball, not live, awards ignored", () => {
    const r = makeRig();
    expect(r.session.getState()).toBe("game-over");
    expect(r.session.getBall()).toBe(0);
    expect(r.session.hasPlayed()).toBe(false);
    expect(r.session.activeBallId).toBe(-1);
    expect(r.calls).toEqual([]);
    expect(r.session.isLive()).toBe(false);
    r.session.award(1000);
    expect(r.session.getScore()).toBe(0);
  });

  it("onStart() serves one ball to the spawn and starts ball 1 at score 0", () => {
    const r = makeRig();
    expect(r.session.onStart()).toBe(true);
    expect(r.calls).toEqual([{ op: "add", spec: SPAWN }]);
    expect(r.session.activeBallId).toBe(FIRST_ID);
    expect(r.session.getBall()).toBe(1);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getScore()).toBe(0);
    expect(r.session.hasPlayed()).toBe(true);
    expect(r.session.isLive()).toBe(true);
  });

  it("a second onStart() while playing returns false and adds nothing", () => {
    const r = makeRig();
    r.session.onStart();
    r.session.award(500);
    expect(r.session.onStart()).toBe(false);
    expect(r.calls).toHaveLength(1);
    expect(r.session.getBall()).toBe(1);
    expect(r.session.getScore()).toBe(500);
    expect(r.session.activeBallId).toBe(FIRST_ID);
  });

  it("a drain of the active ball removes it BEFORE serving the next, then ball 2", () => {
    const r = makeRig();
    r.session.onStart();
    r.step(drainOf(FIRST_ID));
    expect(r.calls).toEqual([
      { op: "add", spec: SPAWN },
      { op: "remove", id: FIRST_ID },
      { op: "add", spec: SPAWN },
    ]);
    expect(r.session.getBall()).toBe(2);
    expect(r.session.activeBallId).toBe(FIRST_ID + 1);
    expect(r.session.getState()).toBe("playing");
  });

  it("the bus listener only records: the world is touched in service(), not dispatch()", () => {
    const r = makeRig();
    r.session.onStart();
    r.dispatchOnly(drainOf(FIRST_ID));
    expect(r.calls).toHaveLength(1);
    expect(r.session.activeBallId).toBe(FIRST_ID);
    r.session.service();
    expect(r.calls).toHaveLength(3);
    expect(r.session.activeBallId).toBe(FIRST_ID + 1);
    expect(r.liveCount()).toBe(1);
  });

  it("a drain event for a non-active id is ignored: no remove, no add", () => {
    const r = makeRig();
    r.session.onStart();
    r.step(drainOf(FIRST_ID + 99));
    expect(r.calls).toHaveLength(1);
    expect(r.session.getBall()).toBe(1);
    expect(r.session.activeBallId).toBe(FIRST_ID);
  });

  it("600 steps with no drain event never remove or respawn the parked ball (CR-01)", () => {
    const r = makeRig();
    r.session.onStart();
    for (let i = 0; i < 600; i++) r.step();
    expect(r.calls).toHaveLength(1);
    expect(r.session.activeBallId).toBe(FIRST_ID);
    expect(r.session.getBall()).toBe(1);
  });

  it("the third drain removes the ball, serves nothing, and ends the game with the score kept", () => {
    const r = makeRig();
    startAndDrain(r, BALLS_PER_GAME - 1);
    r.session.award(4200);
    const last = r.session.activeBallId;
    const callsBefore = r.calls.length;
    r.step(drainOf(last));
    expect(r.calls.slice(callsBefore)).toEqual([{ op: "remove", id: last }]);
    expect(r.session.getState()).toBe("game-over");
    expect(r.session.activeBallId).toBe(-1);
    expect(r.liveCount()).toBe(0);
    expect(r.session.getScore()).toBe(4200);
    expect(r.session.isLive()).toBe(false);
    expect(r.session.getBall()).toBe(BALLS_PER_GAME);
    r.session.award(1000);
    expect(r.session.getScore()).toBe(4200);
  });

  it("after game over, steps and stray drain events change nothing", () => {
    const r = makeRig();
    startAndDrain(r, BALLS_PER_GAME);
    const callsBefore = r.calls.length;
    for (let i = 0; i < 120; i++) r.step(drainOf(-1));
    expect(r.calls).toHaveLength(callsBefore);
    expect(r.session.getState()).toBe("game-over");
  });

  it("onStart() after game over resets the score to 0 and the ball to 1", () => {
    const r = makeRig();
    r.session.onStart();
    r.session.award(7000);
    for (let i = 0; i < BALLS_PER_GAME; i++) r.step(drainOf(r.session.activeBallId));
    expect(r.session.getScore()).toBe(7000);
    expect(r.session.onStart()).toBe(true);
    expect(r.session.getScore()).toBe(0);
    expect(r.session.getBall()).toBe(1);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.hasPlayed()).toBe(true);
    expect(r.liveCount()).toBe(1);
  });

  it("two drain events for the active id in one batch remove it once and serve once", () => {
    const r = makeRig();
    r.session.onStart();
    r.step(drainOf(FIRST_ID), drainOf(FIRST_ID));
    expect(r.calls).toEqual([
      { op: "add", spec: SPAWN },
      { op: "remove", id: FIRST_ID },
      { op: "add", spec: SPAWN },
    ]);
    expect(r.session.getBall()).toBe(2);
  });
});

/** Nudge, then tick through the cooldown, `n` times: `n` accepted nudges. */
function nudgeTimes(r: Rig, n: number): void {
  for (let i = 0; i < n; i++) {
    if (i > 0) r.tick(NUDGE_COOLDOWN_STEPS);
    r.session.onNudge("left");
  }
}

describe("GameSession nudge and tilt (GAME-03, R9-R11)", () => {
  it("direction table: left gives +x, right gives -x, up gives -y, to every ball", () => {
    const r = makeRig([77]);
    r.session.onStart();
    r.session.onNudge("left");
    r.tick(NUDGE_COOLDOWN_STEPS);
    r.session.onNudge("right");
    r.tick(NUDGE_COOLDOWN_STEPS);
    r.session.onNudge("up");
    expect(r.impulses).toEqual([
      { id: FIRST_ID, ix: NUDGE_IMPULSE, iy: 0 },
      { id: 77, ix: NUDGE_IMPULSE, iy: 0 },
      { id: FIRST_ID, ix: -NUDGE_IMPULSE, iy: 0 },
      { id: 77, ix: -NUDGE_IMPULSE, iy: 0 },
      { id: FIRST_ID, ix: 0, iy: -NUDGE_IMPULSE },
      { id: 77, ix: 0, iy: -NUDGE_IMPULSE },
    ]);
  });

  it("onNudge in game-over applies nothing", () => {
    const r = makeRig([77]);
    r.session.onNudge("left");
    r.session.onNudge("up");
    expect(r.impulses).toEqual([]);
  });

  it("the third rapid nudge warns: isWarning() is true for exactly WARNING_FLASH_STEPS ticks", () => {
    const r = makeRig();
    r.session.onStart();
    nudgeTimes(r, 2);
    expect(r.session.isWarning()).toBe(false);
    r.tick(NUDGE_COOLDOWN_STEPS);
    r.session.onNudge("left");
    expect(r.session.isWarning()).toBe(true);
    expect(r.session.getTiltLevel()).toBeCloseTo(2.75, 9);
    r.tick(WARNING_FLASH_STEPS - 1);
    expect(r.session.isWarning()).toBe(true);
    r.tick(1);
    expect(r.session.isWarning()).toBe(false);
    expect(r.session.getState()).toBe("playing");
  });

  it("the fourth rapid nudge tilts: state tilted, not live, awards ignored, no warning shown", () => {
    const r = makeRig();
    r.session.onStart();
    r.session.award(3000);
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    expect(r.session.getTiltLevel()).toBeCloseTo(3.625, 9);
    expect(r.session.isLive()).toBe(false);
    expect(r.session.isWarning()).toBe(false);
    r.session.award(1000);
    expect(r.session.getScore()).toBe(3000);
    expect(r.session.onStart()).toBe(false);
  });

  it("while tilted, onNudge applies no impulse and does not move the meter", () => {
    const r = makeRig();
    r.session.onStart();
    nudgeTimes(r, 4);
    const impulsesAtTilt = r.impulses.length;
    const levelAtTilt = r.session.getTiltLevel();
    r.tick(NUDGE_COOLDOWN_STEPS);
    const levelBefore = r.session.getTiltLevel();
    expect(levelBefore).toBeLessThan(levelAtTilt); // the meter still decays
    r.session.onNudge("left");
    r.session.onNudge("up");
    expect(r.impulses).toHaveLength(impulsesAtTilt);
    expect(r.session.getTiltLevel()).toBe(levelBefore);
  });

  it("a drain while tilted on ball 1 serves ball 2 playing, with a reset meter and the score kept", () => {
    const r = makeRig();
    r.session.onStart();
    r.session.award(2500);
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    const tilted = r.session.activeBallId;
    r.step(drainOf(tilted));
    expect(r.calls.slice(-2)).toEqual([
      { op: "remove", id: tilted },
      { op: "add", spec: SPAWN },
    ]);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getBall()).toBe(2);
    expect(r.session.isLive()).toBe(true);
    expect(r.session.getTiltLevel()).toBe(0);
    r.tick(NUDGE_COOLDOWN_STEPS);
    r.session.onNudge("left");
    expect(r.session.isWarning()).toBe(false);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getTiltLevel()).toBe(1);
    expect(r.session.getScore()).toBe(2500);
  });

  it("a serve clears a live warning window", () => {
    const r = makeRig();
    r.session.onStart();
    nudgeTimes(r, 3);
    expect(r.session.isWarning()).toBe(true);
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.isWarning()).toBe(false);
    expect(r.session.getTiltLevel()).toBe(0);
  });

  it("a tilt on ball 3 followed by its drain ends the game with the score kept", () => {
    const r = makeRig();
    startAndDrain(r, BALLS_PER_GAME - 1);
    r.session.award(9000);
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getState()).toBe("game-over");
    expect(r.session.activeBallId).toBe(-1);
    expect(r.liveCount()).toBe(0);
    expect(r.session.getScore()).toBe(9000);
  });

  it("onStart() after a tilted game over resets the meter: the first nudge of the new game does not warn", () => {
    const r = makeRig();
    startAndDrain(r, BALLS_PER_GAME - 1);
    nudgeTimes(r, 4);
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getState()).toBe("game-over");
    expect(r.session.onStart()).toBe(true);
    expect(r.session.getTiltLevel()).toBe(0);
    r.tick(NUDGE_COOLDOWN_STEPS);
    r.session.onNudge("left");
    expect(r.session.getState()).toBe("playing");
    expect(r.session.isWarning()).toBe(false);
    expect(r.session.getTiltLevel()).toBe(1);
  });
});

/** The last value the session gave its flipper gate. */
function lastGate(r: Rig): boolean | undefined {
  return r.gate[r.gate.length - 1];
}

/** The relay invariant: on while playing, off when tilted or game over. */
function expectRelayMatchesState(r: Rig): void {
  expect(lastGate(r)).toBe(r.session.getState() === "playing");
}

describe("GameSession flipper relay (GAME-03, R11, Open Question 1)", () => {
  it("the constructor switches the flippers off (attract)", () => {
    const r = makeRig();
    expect(r.gate).toEqual([false]);
    expectRelayMatchesState(r);
  });

  it("onStart switches them on, after serving", () => {
    const r = makeRig();
    r.session.onStart();
    expect(r.gate).toEqual([false, true]);
    expectRelayMatchesState(r);
  });

  it("a refused onStart (already playing) records nothing", () => {
    const r = makeRig();
    r.session.onStart();
    r.session.onStart();
    expect(r.gate).toEqual([false, true]);
  });

  it("the tilting nudge switches them off; the warning and earlier nudges do not", () => {
    const r = makeRig();
    r.session.onStart();
    nudgeTimes(r, 3);
    expect(r.session.getState()).toBe("playing");
    expect(r.gate).toEqual([false, true]);
    r.tick(NUDGE_COOLDOWN_STEPS);
    r.session.onNudge("left");
    expect(r.session.getState()).toBe("tilted");
    expect(r.gate).toEqual([false, true, false]);
    expectRelayMatchesState(r);
  });

  it("the serve after a drain switches them on, after a tilt or not", () => {
    const r = makeRig();
    r.session.onStart();
    r.step(drainOf(r.session.activeBallId)); // plain drain: ball 2
    expect(r.gate).toEqual([false, true, true]);
    nudgeTimes(r, 4); // tilt ball 2
    expect(r.session.getState()).toBe("tilted");
    r.step(drainOf(r.session.activeBallId)); // tilted drain: ball 3
    expect(r.session.getBall()).toBe(3);
    expect(r.gate).toEqual([false, true, true, false, true]);
    expectRelayMatchesState(r);
  });

  it("the final drain switches them off", () => {
    const r = makeRig();
    startAndDrain(r, BALLS_PER_GAME);
    expect(r.session.getState()).toBe("game-over");
    expect(r.gate).toEqual([false, true, true, true, false]);
    expectRelayMatchesState(r);
  });

  it("a step with no drain records nothing", () => {
    const r = makeRig();
    r.session.onStart();
    r.step();
    r.tick(10);
    expect(r.gate).toEqual([false, true]);
  });

  it("across two full games with tilts, the last value is on exactly while playing", () => {
    const r = makeRig();
    const check = (): void => expectRelayMatchesState(r);
    check();
    for (let game = 0; game < 2; game++) {
      r.session.onStart();
      check();
      for (let ball = 1; ball <= BALLS_PER_GAME; ball++) {
        if (ball !== 2) {
          r.tick(NUDGE_COOLDOWN_STEPS); // clear the last ball's nudge cooldown
          nudgeTimes(r, 4);
          expect(r.session.getState()).toBe("tilted");
          check();
          r.session.onNudge("up"); // ignored while tilted
          check();
        }
        r.step(drainOf(r.session.activeBallId));
        check();
      }
      expect(r.session.getState()).toBe("game-over");
      r.session.onNudge("left"); // ignored in game over
      r.step();
      check();
    }
  });
});
