import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import type { PlungerPhase } from "../control/plunger-controller";
import type { BallId, BallSpec, BallState, CollisionEvent } from "../physics/types";
import {
  BALLS_PER_GAME,
  GameSession,
  type FlipperGate,
  type GameSessionOptions,
  type GameSessionWorld,
} from "./game-session";
import { bonusDurationSteps } from "./bonus";
import {
  BALL_SAVE_BLINK_STEPS,
  BALL_SAVE_STEPS,
  KICKBACK_GRACE_STEPS,
  NUDGE_COOLDOWN_STEPS,
  NUDGE_IMPULSE,
  TILT_FORFEIT_HOLD_STEPS,
  WARNING_FLASH_STEPS,
} from "./tuning";

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
 * - end-of-ball bonus (plan 06-05, PLSH-06, D-11..D-13): every drain now enters
 *   the counted "bonus" state before the serve or game over, so the legacy
 *   drain cases pass through it with `finishBonus` (a flipper-press skip, or a
 *   forfeit's full hold), and the gate logs record the bonus entry (false).
 * - ball save (plan 06-07, PLSH-07, D-08..D-10): `makeRig` takes
 *   `GameSessionOptions`. The spy balls report x = 0, left of the chute, so any
 *   tick would start the save timer at once: every legacy drain/serve/
 *   game-over/relay case passes `NO_SAVE` (`ballSaveSteps: 0`) explicitly, and
 *   the save cases use the production default with `setBallX` to place the
 *   ball in or out of the chute.
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
  /** Move every spy ball to `x` (default 0, left of the chute). */
  setBallX(x: number): void;
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

/** A spy ball snapshot: the id, and x for the ball-save chute-exit test. */
function spyBall(id: BallId, x: number): BallState {
  return { id, x, y: 0, vx: 0, vy: 0, radius: 0.2, angle: 0 };
}

/** The ball save disabled: the legacy FSM cases, whose spy balls sit at x = 0. */
const NO_SAVE: GameSessionOptions = { ballSaveSteps: 0 };

/**
 * The spy world: addBall hands out increasing ids from FIRST_ID, getBalls
 * reports every live ball plus `extraBallIds` (untracked balls on the table)
 * at x = `ballX`, and applyImpulse is recorded. `options` go to the session
 * (production defaults when omitted).
 */
function makeRig(options: GameSessionOptions = {}, extraBallIds: readonly BallId[] = []): Rig {
  const calls: Call[] = [];
  const impulses: Impulse[] = [];
  const gate: boolean[] = [];
  const live = new Set<BallId>();
  let nextId: BallId = FIRST_ID;
  let ballX = 0;
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
    getBalls: () => [...live, ...extraBallIds].map((id) => spyBall(id, ballX)),
    applyImpulse: (id, ix, iy) => {
      impulses.push({ id, ix, iy });
    },
  };
  let batch: CollisionEvent[] = [];
  const router = new CollisionRouter({ drainEvents: () => batch });
  const session = new GameSession(
    world,
    router,
    SPAWN,
    {
      setEnabled: (enabled) => {
        gate.push(enabled);
      },
    },
    options,
  );
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
    setBallX: (x) => {
      ballX = x;
    },
  };
}

/** Upper bound on the steps `finishBonus` runs (the longest tally is 264). */
const FINISH_BONUS_CAP = 400;

/**
 * Run the bonus tally out the way main.ts would: each fixed step latches a
 * flipper press (the skip), ticks the clock and services, until the state
 * leaves "bonus". A normal tally ends on the first such step; a tilt forfeit
 * ignores the press and runs its full hold. Bounded; throws if it never ends.
 */
function finishBonus(r: Rig): void {
  for (let i = 0; i < FINISH_BONUS_CAP && r.session.getState() === "bonus"; i++) {
    r.session.onFlipperPress();
    r.tick(1);
    r.step();
  }
  if (r.session.getState() === "bonus") throw new Error("bonus tally never ended");
}

/** One step whose batch drains the active ball, then the bonus tally run out. */
function drainAndFinish(r: Rig): void {
  r.step(drainOf(r.session.activeBallId));
  expect(r.session.getState()).toBe("bonus");
  finishBonus(r);
}

/** Start a game and drain the active ball `n` times, each through its tally. */
function startAndDrain(r: Rig, n: number): void {
  r.session.onStart();
  for (let i = 0; i < n; i++) drainAndFinish(r);
}

describe("GameSession 3-ball FSM (GAME-02)", () => {
  it("boots into game-over: ball 0, never played, no ball, not live, awards ignored", () => {
    const r = makeRig(NO_SAVE);
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
    const r = makeRig(NO_SAVE);
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
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.session.award(500);
    expect(r.session.onStart()).toBe(false);
    expect(r.calls).toHaveLength(1);
    expect(r.session.getBall()).toBe(1);
    expect(r.session.getScore()).toBe(500);
    expect(r.session.activeBallId).toBe(FIRST_ID);
  });

  it("a drain of the active ball removes it BEFORE serving the next, then ball 2", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.step(drainOf(FIRST_ID));
    expect(r.calls).toEqual([
      { op: "add", spec: SPAWN },
      { op: "remove", id: FIRST_ID },
    ]);
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.activeBallId).toBe(-1);
    finishBonus(r);
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
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.dispatchOnly(drainOf(FIRST_ID));
    expect(r.calls).toHaveLength(1);
    expect(r.session.activeBallId).toBe(FIRST_ID);
    r.session.service();
    expect(r.calls).toHaveLength(2);
    expect(r.session.activeBallId).toBe(-1);
    expect(r.liveCount()).toBe(0);
    finishBonus(r);
    expect(r.calls).toHaveLength(3);
    expect(r.session.activeBallId).toBe(FIRST_ID + 1);
    expect(r.liveCount()).toBe(1);
  });

  it("a drain event for a non-active id is ignored: no remove, no add", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.step(drainOf(FIRST_ID + 99));
    expect(r.calls).toHaveLength(1);
    expect(r.session.getBall()).toBe(1);
    expect(r.session.activeBallId).toBe(FIRST_ID);
  });

  it("600 steps with no drain event never remove or respawn the parked ball (CR-01)", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    for (let i = 0; i < 600; i++) r.step();
    expect(r.calls).toHaveLength(1);
    expect(r.session.activeBallId).toBe(FIRST_ID);
    expect(r.session.getBall()).toBe(1);
  });

  it("the third drain removes the ball, serves nothing, and ends the game with the score kept", () => {
    const r = makeRig(NO_SAVE);
    startAndDrain(r, BALLS_PER_GAME - 1);
    r.session.award(4200);
    const last = r.session.activeBallId;
    const callsBefore = r.calls.length;
    r.step(drainOf(last));
    expect(r.session.getState()).toBe("bonus");
    finishBonus(r);
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
    const r = makeRig(NO_SAVE);
    startAndDrain(r, BALLS_PER_GAME);
    const callsBefore = r.calls.length;
    for (let i = 0; i < 120; i++) r.step(drainOf(-1));
    expect(r.calls).toHaveLength(callsBefore);
    expect(r.session.getState()).toBe("game-over");
  });

  it("onStart() after game over resets the score to 0 and the ball to 1", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.session.award(7000);
    for (let i = 0; i < BALLS_PER_GAME; i++) drainAndFinish(r);
    expect(r.session.getScore()).toBe(7000);
    expect(r.session.onStart()).toBe(true);
    expect(r.session.getScore()).toBe(0);
    expect(r.session.getBall()).toBe(1);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.hasPlayed()).toBe(true);
    expect(r.liveCount()).toBe(1);
  });

  it("two drain events for the active id in one batch remove it once and serve once", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.step(drainOf(FIRST_ID), drainOf(FIRST_ID));
    finishBonus(r);
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
    const r = makeRig(NO_SAVE, [77]);
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
    const r = makeRig(NO_SAVE, [77]);
    r.session.onNudge("left");
    r.session.onNudge("up");
    expect(r.impulses).toEqual([]);
  });

  it("the third rapid nudge warns: isWarning() is true for exactly WARNING_FLASH_STEPS ticks", () => {
    const r = makeRig(NO_SAVE);
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
    const r = makeRig(NO_SAVE);
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
    const r = makeRig(NO_SAVE);
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
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.session.award(2500);
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    const tilted = r.session.activeBallId;
    r.step(drainOf(tilted));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.isBonusForfeit()).toBe(true);
    finishBonus(r);
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
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    nudgeTimes(r, 3);
    expect(r.session.isWarning()).toBe(true);
    drainAndFinish(r);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.isWarning()).toBe(false);
    expect(r.session.getTiltLevel()).toBe(0);
  });

  it("a tilt on ball 3 followed by its drain ends the game with the score kept", () => {
    const r = makeRig(NO_SAVE);
    startAndDrain(r, BALLS_PER_GAME - 1);
    r.session.award(9000);
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    drainAndFinish(r);
    expect(r.session.getState()).toBe("game-over");
    expect(r.session.activeBallId).toBe(-1);
    expect(r.liveCount()).toBe(0);
    expect(r.session.getScore()).toBe(9000);
  });

  it("onStart() after a tilted game over resets the meter: the first nudge of the new game does not warn", () => {
    const r = makeRig(NO_SAVE);
    startAndDrain(r, BALLS_PER_GAME - 1);
    nudgeTimes(r, 4);
    drainAndFinish(r);
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

/** The relay invariant: on while playing, off when tilted, in the bonus tally or game over. */
function expectRelayMatchesState(r: Rig): void {
  expect(lastGate(r)).toBe(r.session.getState() === "playing");
}

describe("GameSession flipper relay (GAME-03, R11, Open Question 1)", () => {
  it("the constructor switches the flippers off (attract)", () => {
    const r = makeRig(NO_SAVE);
    expect(r.gate).toEqual([false]);
    expectRelayMatchesState(r);
  });

  it("onStart switches them on, after serving", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    expect(r.gate).toEqual([false, true]);
    expectRelayMatchesState(r);
  });

  it("a refused onStart (already playing) records nothing", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.session.onStart();
    expect(r.gate).toEqual([false, true]);
  });

  it("the tilting nudge switches them off; the warning and earlier nudges do not", () => {
    const r = makeRig(NO_SAVE);
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

  it("the drain switches them off for the bonus tally and the serve after it switches them on, after a tilt or not", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.step(drainOf(r.session.activeBallId)); // plain drain: the tally
    expect(r.gate).toEqual([false, true, false]);
    expectRelayMatchesState(r);
    finishBonus(r); // ball 2
    expect(r.gate).toEqual([false, true, false, true]);
    nudgeTimes(r, 4); // tilt ball 2
    expect(r.session.getState()).toBe("tilted");
    drainAndFinish(r); // tilted drain: the forfeit hold, then ball 3
    expect(r.session.getBall()).toBe(3);
    expect(r.gate).toEqual([false, true, false, true, false, false, true]);
    expectRelayMatchesState(r);
  });

  it("the final drain switches them off", () => {
    const r = makeRig(NO_SAVE);
    startAndDrain(r, BALLS_PER_GAME);
    expect(r.session.getState()).toBe("game-over");
    // Start on; each drain off (the tally) then on (the serve); the last drain
    // off (the tally) then off again at game over.
    expect(r.gate).toEqual([false, true, false, true, false, true, false, false]);
    expectRelayMatchesState(r);
  });

  it("a step with no drain records nothing", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.step();
    r.tick(10);
    expect(r.gate).toEqual([false, true]);
  });

  it("across two full games with tilts, the last value is on exactly while playing", () => {
    const r = makeRig(NO_SAVE);
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
        expect(r.session.getState()).toBe("bonus");
        check();
        finishBonus(r);
        check();
      }
      expect(r.session.getState()).toBe("game-over");
      r.session.onNudge("left"); // ignored in game over
      r.step();
      check();
    }
  });
});

describe("GameSession inlane flags (plan 06-03 Task 2, D-21)", () => {
  it("while playing, a lane switch on 500 scores 500 only; a second call changes nothing", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    expect(r.session.isInlaneScored(500)).toBe(false);
    expect(r.session.isInlaneScored(501)).toBe(false);
    r.session.onSwitch("lane", 500);
    expect(r.session.isInlaneScored(500)).toBe(true);
    expect(r.session.isInlaneScored(501)).toBe(false);
    r.session.onSwitch("lane", 500);
    expect(r.session.isInlaneScored(500)).toBe(true);
    expect(r.session.isInlaneScored(501)).toBe(false);
    r.session.onSwitch("lane", 501);
    expect(r.session.isInlaneScored(501)).toBe(true);
  });

  it("a drain followed by the next serve clears both", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.session.onSwitch("lane", 500);
    r.session.onSwitch("lane", 501);
    drainAndFinish(r);
    expect(r.session.getBall()).toBe(2);
    expect(r.session.isInlaneScored(500)).toBe(false);
    expect(r.session.isInlaneScored(501)).toBe(false);
  });

  it("onStart clears both (a new game after game over)", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    drainAndFinish(r);
    drainAndFinish(r);
    r.session.onSwitch("lane", 500);
    r.session.onSwitch("lane", 501);
    drainAndFinish(r);
    expect(r.session.getState()).toBe("game-over");
    r.session.onStart();
    expect(r.session.isInlaneScored(500)).toBe(false);
    expect(r.session.isInlaneScored(501)).toBe(false);
  });

  it("a non-lane switch sets nothing, and outside play a lane switch sets nothing", () => {
    const r = makeRig(NO_SAVE);
    r.session.onSwitch("lane", 500); // game over (attract)
    expect(r.session.isInlaneScored(500)).toBe(false);
    r.session.onStart();
    r.session.onSwitch("rollover", 500);
    r.session.onSwitch("bumper", 500);
    r.session.onSwitch("slingshot", 501);
    expect(r.session.isInlaneScored(500)).toBe(false);
    expect(r.session.isInlaneScored(501)).toBe(false);
  });

  it("an unknown id reads false", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.session.onSwitch("lane", 500);
    for (const id of [-1, 0, 400, 502, 600, Number.NaN]) {
      expect(r.session.isInlaneScored(id)).toBe(false);
    }
  });
});

describe("GameSession end-of-ball bonus (plan 06-05 Task 1, PLSH-06, D-11, D-12)", () => {
  it("tracer: 2 rollovers and 1 inlane are tallied over 216 counted steps, credited, then ball 2 is served", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.session.onSwitch("rollover", 400, false);
    r.session.onSwitch("rollover", 401, false);
    r.session.onSwitch("lane", 500, false);
    const before = r.session.getScore();

    r.step(drainOf(FIRST_ID));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.activeBallId).toBe(-1);
    expect(r.liveCount()).toBe(0);
    expect(r.session.getBonusTally().rows).toBe(2);
    expect(r.session.getBonusTotal()).toBe(4000);
    expect(r.session.isBonusForfeit()).toBe(false);

    r.session.award(1000); // not live during the tally: ignored
    expect(r.session.getScore()).toBe(before);

    for (let i = 0; i < 215; i++) {
      r.tick(1);
      r.step();
    }
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getScore()).toBe(before);
    r.tick(1);
    r.step(); // step 216: the credit lands and ball 2 is served
    expect(r.session.getScore()).toBe(before + 4000);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getBall()).toBe(2);
    expect(r.session.activeBallId).toBe(FIRST_ID + 1);
    expect(r.liveCount()).toBe(1);
  });
});

/** Tick and service one fixed step with no events (no flipper press). */
function idleStep(r: Rig): void {
  r.tick(1);
  r.step();
}

/** Three rollovers (the third completing the bank) and one inlane: 3 rows, 10,000. */
function fillThreeRows(r: Rig): void {
  r.session.onSwitch("rollover", 400, false);
  r.session.onSwitch("rollover", 401, false);
  r.session.onSwitch("rollover", 402, true);
  r.session.onSwitch("lane", 500, false);
}

describe("GameSession bonus edges (plan 06-05 Task 2, PLSH-06, D-11..D-13)", () => {
  it("at elapsed duration - 1 the state is still bonus and the score unchanged; at duration the credit lands and ball 2 is served in the same service()", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    fillThreeRows(r);
    const before = r.session.getScore();
    r.step(drainOf(FIRST_ID));
    expect(r.session.getBonusTally().rows).toBe(3);
    expect(r.session.getBonusTotal()).toBe(10000);
    const duration = bonusDurationSteps(3, false);
    expect(duration).toBe(264);
    expect(r.session.getBonusElapsed()).toBe(0);
    for (let i = 1; i < duration; i++) {
      idleStep(r);
      expect(r.session.getBonusElapsed()).toBe(i);
    }
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getScore()).toBe(before);
    expect(r.liveCount()).toBe(0);
    idleStep(r);
    expect(r.session.getScore()).toBe(before + 10000);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getBall()).toBe(2);
    expect(r.liveCount()).toBe(1);
    expect(r.session.getBonusElapsed()).toBe(0);
  });

  it("skip: onFlipperPress during a 3-row tally ends it on the next service with the full credit", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    fillThreeRows(r);
    const before = r.session.getScore(); // includes the skill shot on 400
    r.step(drainOf(FIRST_ID));
    idleStep(r);
    idleStep(r);
    expect(r.session.getState()).toBe("bonus");
    r.session.onFlipperPress();
    expect(r.session.getState()).toBe("bonus"); // latched, not acted on yet
    idleStep(r);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getScore()).toBe(before + 10000);
    expect(r.session.getBall()).toBe(2);
  });

  it("onFlipperPress while playing, tilted or game-over changes nothing and does not shorten a later tally", () => {
    const r = makeRig(NO_SAVE);
    r.session.onFlipperPress(); // game over (attract)
    expect(r.session.getState()).toBe("game-over");
    r.session.onStart();
    r.session.onSwitch("rollover", 400, false);
    const before = r.session.getScore(); // includes the skill shot on 400
    r.session.onFlipperPress(); // playing
    expect(r.session.getState()).toBe("playing");
    expect(r.calls).toHaveLength(1);
    r.step(drainOf(FIRST_ID));
    let steps = 0;
    while (r.session.getState() === "bonus") {
      idleStep(r);
      steps++;
    }
    expect(steps).toBe(bonusDurationSteps(1, false));
    expect(r.session.getScore()).toBe(before + 1000);

    // Tilted: a press before the drain does not shorten the forfeit or a skip.
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    r.session.onFlipperPress();
    r.step(drainOf(r.session.activeBallId));
    steps = 0;
    while (r.session.getState() === "bonus") {
      idleStep(r);
      steps++;
    }
    expect(steps).toBe(TILT_FORFEIT_HOLD_STEPS);
  });

  it("forfeit: a drain while tilted holds exactly 120 steps that onFlipperPress does not shorten, credits nothing, then ball 2 plays", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    fillThreeRows(r); // counted before the tilt, forfeit all the same
    r.session.award(2500);
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    const scoreAtTilt = r.session.getScore();
    r.step(drainOf(FIRST_ID));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.isBonusForfeit()).toBe(true);
    expect(r.session.getBonusTotal()).toBe(0);
    expect(r.session.getBonusTally().rows).toBe(0);
    for (let i = 1; i < TILT_FORFEIT_HOLD_STEPS; i++) {
      r.session.onFlipperPress();
      idleStep(r);
      expect(r.session.getState()).toBe("bonus");
    }
    r.session.onFlipperPress();
    idleStep(r);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.isBonusForfeit()).toBe(false);
    expect(r.session.getBall()).toBe(2);
    expect(r.session.getScore()).toBe(scoreAtTilt);
  });

  it("all zero: a drain with no switches holds 60 steps and credits 0", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.session.onSwitch("bumper", 200, false);
    r.session.onSwitch("slingshot", 300, false);
    r.step(drainOf(FIRST_ID));
    expect(r.session.getBonusTally().rows).toBe(0);
    expect(r.session.getBonusTotal()).toBe(0);
    let steps = 0;
    while (r.session.getState() === "bonus") {
      idleStep(r);
      steps++;
    }
    expect(steps).toBe(60);
    expect(r.session.getScore()).toBe(0);
    expect(r.session.getBall()).toBe(2);
  });

  it("last ball: the third drain's tally ends in game over with the credit in the final score and the flippers off", () => {
    const r = makeRig(NO_SAVE);
    startAndDrain(r, BALLS_PER_GAME - 1);
    fillThreeRows(r);
    const before = r.session.getScore();
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getState()).toBe("bonus");
    finishBonus(r);
    expect(r.session.getState()).toBe("game-over");
    expect(r.session.getScore()).toBe(before + 10000);
    expect(r.session.activeBallId).toBe(-1);
    expect(r.liveCount()).toBe(0);
    expect(lastGate(r)).toBe(false);
    expect(r.calls.filter((c) => c.op === "add")).toHaveLength(BALLS_PER_GAME);
  });

  it("the credit keeps the saturating integer guard: a tally past MAX_SAFE_INTEGER saturates", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.session.onSwitch("rollover", 400, false);
    r.session.award(Number.MAX_SAFE_INTEGER - 500 - r.session.getScore());
    expect(r.session.getScore()).toBe(Number.MAX_SAFE_INTEGER - 500);
    r.step(drainOf(FIRST_ID));
    finishBonus(r);
    expect(r.session.getScore()).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(r.session.getScore())).toBe(true);
  });

  it("reset: counters are zero on every new serve and on onStart, so nothing carries between balls or games", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    fillThreeRows(r);
    drainAndFinish(r); // ball 1: 3 rows
    r.step(drainOf(r.session.activeBallId)); // ball 2: nothing scored
    expect(r.session.getBonusTally().rows).toBe(0);
    expect(r.session.getBonusTotal()).toBe(0);
    finishBonus(r);
    fillThreeRows(r);
    drainAndFinish(r); // ball 3 ends the game with its counters
    expect(r.session.getState()).toBe("game-over");
    r.session.onStart();
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getBonusTally().rows).toBe(0);
    expect(r.session.getBonusTotal()).toBe(0);
  });

  it("switches outside play (game over, tilted, the tally itself) never count", () => {
    const r = makeRig(NO_SAVE);
    r.session.onSwitch("rollover", 400, true); // attract
    r.session.onStart();
    r.step(drainOf(FIRST_ID));
    r.session.onSwitch("rollover", 400, true); // during the tally
    expect(r.session.getBonusTotal()).toBe(0);
    finishBonus(r);
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getBonusTally().rows).toBe(0);
  });

  it("getDrainCount() rises once per drain of the active ball, never for a stray id or a repeated event", () => {
    const r = makeRig(NO_SAVE);
    expect(r.session.getDrainCount()).toBe(0);
    r.session.onStart();
    r.step(drainOf(FIRST_ID + 99)); // stray id
    expect(r.session.getDrainCount()).toBe(0);
    r.step(drainOf(FIRST_ID), drainOf(FIRST_ID));
    expect(r.session.getDrainCount()).toBe(1);
    r.step(drainOf(-1)); // during the tally: no active ball
    expect(r.session.getDrainCount()).toBe(1);
    finishBonus(r);
    expect(r.session.getDrainCount()).toBe(1);
    drainAndFinish(r);
    expect(r.session.getDrainCount()).toBe(2);
  });

  it("getNudgeCount() rises only for accepted nudges and getLastNudgeDir() names the last accepted direction", () => {
    const r = makeRig(NO_SAVE);
    r.session.onNudge("up"); // game over: refused
    expect(r.session.getNudgeCount()).toBe(0);
    r.session.onStart();
    r.session.onNudge("right");
    expect(r.session.getNudgeCount()).toBe(1);
    expect(r.session.getLastNudgeDir()).toBe("right");
    r.session.onNudge("up"); // inside the cooldown: refused
    expect(r.session.getNudgeCount()).toBe(1);
    expect(r.session.getLastNudgeDir()).toBe("right");
    r.tick(NUDGE_COOLDOWN_STEPS);
    r.session.onNudge("up");
    expect(r.session.getNudgeCount()).toBe(2);
    expect(r.session.getLastNudgeDir()).toBe("up");
  });

  it("getBonusElapsed() is 0 outside the bonus state", () => {
    const r = makeRig(NO_SAVE);
    expect(r.session.getBonusElapsed()).toBe(0);
    r.session.onStart();
    r.tick(50);
    expect(r.session.getBonusElapsed()).toBe(0);
    expect(r.session.isBonusForfeit()).toBe(false);
  });
});

describe("GameSession ball save (plan 06-07 Task 1, PLSH-07, D-08, D-09)", () => {
  it("tracer: a drain inside the save window costs no ball: remove then add, still ball 1 and playing, one backstop save; the re-served ball's drain enters the bonus state", () => {
    const r = makeRig(); // production options: the save on
    r.session.onStart();
    expect(r.session.getSaveLampPhase()).toBe("steady");
    r.tick(10); // the spy ball is left of the chute: the timer starts and runs
    const gateBefore = r.gate.slice();

    r.step(drainOf(FIRST_ID));
    expect(r.session.getBall()).toBe(1);
    expect(r.session.getState()).toBe("playing");
    expect(r.calls).toEqual([
      { op: "add", spec: SPAWN },
      { op: "remove", id: FIRST_ID },
      { op: "add", spec: SPAWN },
    ]);
    expect(r.session.activeBallId).toBe(FIRST_ID + 1);
    expect(r.liveCount()).toBe(1);
    expect(r.session.getSaveCount()).toBe(1);
    expect(r.session.getLastSaveKind()).toBe("backstop");
    expect(r.session.getLastSaveStep()).toBe(10);
    expect(r.session.getDrainCount()).toBe(1);
    expect(r.gate).toEqual(gateBefore); // the flippers stayed on
    expect(r.session.getSaveLampPhase()).toBe("off");

    r.tick(10);
    r.step(drainOf(FIRST_ID + 1));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getSaveCount()).toBe(1);
    finishBonus(r);
    expect(r.session.getBall()).toBe(2);
  });
});

/** A spy-ball x inside the launch chute (the plunger lane centre). */
const IN_CHUTE_X = 3.15;

/** Start a game with the save on and tick once with the ball clear of the chute. */
function startSaved(r: Rig): void {
  r.session.onStart();
  r.tick(1); // spy balls at x = 0: the save timer starts
}

describe("GameSession ball save rules (plan 06-07 Task 2, PLSH-07, D-08, D-09, research A3, A4)", () => {
  it("one save per ball: a drain inside the window is saved, the re-served ball's drain enters the bonus state, and the next serve re-arms the save", () => {
    const r = makeRig();
    startSaved(r);
    r.step(drainOf(FIRST_ID));
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getSaveCount()).toBe(1);
    r.tick(1);
    r.step(drainOf(FIRST_ID + 1));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getSaveLampPhase()).toBe("off");
    finishBonus(r);
    expect(r.session.getBall()).toBe(2);
    expect(r.session.getSaveLampPhase()).toBe("steady"); // armed again, in the chute
    r.tick(1);
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getBall()).toBe(2);
    expect(r.session.getSaveCount()).toBe(2);
  });

  it("a backstop is the same ball: bonus counts, inlane flags, the skill phase and the ball number carry over", () => {
    const r = makeRig();
    startSaved(r);
    r.session.onSwitch("lane", 500, false); // first switch: disarms the skill shot
    expect(r.session.getSkillPhase()).toBe("off");
    r.session.onSwitch("rollover", 400, false);
    r.session.onSwitch("rollover", 401, false);
    r.step(drainOf(FIRST_ID));
    expect(r.session.getSaveCount()).toBe(1);
    expect(r.session.getBall()).toBe(1);
    expect(r.session.isInlaneScored(500)).toBe(true);
    expect(r.session.getSkillPhase()).toBe("off");

    r.tick(1);
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getState()).toBe("bonus");
    const tally = r.session.getBonusTally();
    expect(tally.rows).toBe(2); // rollovers and inlanes from before the backstop
    expect(r.session.getBonusTotal()).toBe(2 * 1000 + 2000);
  });

  it("a backstop re-serve disarms an unresolved (frozen) skill shot: one attempt per ball (06-REVIEW IN-04)", () => {
    let phase: PlungerPhase = "idle";
    const r = makeRig({ plunger: { getPhase: () => phase } });
    r.session.onStart();
    expect(r.session.getSkillPhase()).toBe("rotating");
    phase = "charging";
    r.tick(1); // freezes the lane; spy balls at x = 0 start the save
    expect(r.session.getSkillPhase()).toBe("frozen");
    phase = "idle";
    r.tick(1);
    r.step(drainOf(FIRST_ID)); // drained without touching a scoring switch
    expect(r.session.getSaveCount()).toBe(1);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getSkillPhase()).toBe("off");
    expect(r.session.getSkillLitLane()).toBe(-1);
    r.tick(2);
    expect(r.session.getSkillPhase()).toBe("off");
    // A rollover on the re-served ball awards nothing.
    r.session.onSwitch("rollover", 400, false);
    expect(r.session.getSkillShotCount()).toBe(0);
    expect(r.session.getScore()).toBe(0);
  });

  it("a tilt disarms the save: a drain while tilted inside the window is a forfeit tally, not a save", () => {
    const r = makeRig();
    startSaved(r);
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    expect(r.session.getSaveLampPhase()).toBe("off");
    r.step(drainOf(FIRST_ID));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.isBonusForfeit()).toBe(true);
    expect(r.session.getSaveCount()).toBe(0);
  });

  it("a drain before the timer starts (ball still in the chute) is a real drain", () => {
    const r = makeRig();
    r.setBallX(IN_CHUTE_X);
    r.session.onStart();
    r.tick(100);
    expect(r.session.getSaveLampPhase()).toBe("steady");
    r.step(drainOf(FIRST_ID));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getSaveCount()).toBe(0);
  });

  it("a drain after the window timed out enters the bonus state", () => {
    const r = makeRig();
    startSaved(r);
    r.tick(BALL_SAVE_STEPS);
    expect(r.session.getSaveLampPhase()).toBe("off");
    r.step(drainOf(FIRST_ID));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getSaveCount()).toBe(0);
  });

  it("trySave(active) returns true once inside the window and records a kickback; a second call returns false", () => {
    const r = makeRig();
    startSaved(r);
    expect(r.session.trySave(FIRST_ID)).toBe(true);
    expect(r.session.getSaveCount()).toBe(1);
    expect(r.session.getLastSaveKind()).toBe("kickback");
    expect(r.session.getLastSaveStep()).toBe(1);
    expect(r.session.getSaveLampPhase()).toBe("off");
    expect(r.session.trySave(FIRST_ID)).toBe(false);
    expect(r.session.getSaveCount()).toBe(1);
    expect(r.calls).toHaveLength(1); // a kickback touches no ball
  });

  it("trySave returns false and changes nothing for another id, while tilted, in game over, before the timer starts, or after a backstop", () => {
    // Another id.
    let r = makeRig();
    startSaved(r);
    expect(r.session.trySave(FIRST_ID + 99)).toBe(false);
    expect(r.session.trySave(-1)).toBe(false);
    expect(r.session.getSaveCount()).toBe(0);
    expect(r.session.trySave(FIRST_ID)).toBe(true); // still armed

    // Tilted.
    r = makeRig();
    startSaved(r);
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    expect(r.session.trySave(FIRST_ID)).toBe(false);

    // Game over (attract, and after the last ball).
    r = makeRig();
    expect(r.session.trySave(-1)).toBe(false);
    expect(r.session.trySave(FIRST_ID)).toBe(false);

    // Before the timer starts.
    r = makeRig();
    r.setBallX(IN_CHUTE_X);
    r.session.onStart();
    r.tick(10);
    expect(r.session.trySave(FIRST_ID)).toBe(false);
    expect(r.session.getSaveLampPhase()).toBe("steady");

    // After a backstop save of this ball.
    r = makeRig();
    startSaved(r);
    r.step(drainOf(FIRST_ID));
    r.tick(1);
    expect(r.session.trySave(r.session.activeBallId)).toBe(false);
    expect(r.session.getSaveCount()).toBe(1);
    expect(r.session.getLastSaveKind()).toBe("backstop");
  });

  it("trySave in the bonus state and in game over after the last ball returns false", () => {
    const r = makeRig(NO_SAVE);
    startAndDrain(r, BALLS_PER_GAME);
    expect(r.session.getState()).toBe("game-over");
    expect(r.session.trySave(-1)).toBe(false);
    const s = makeRig();
    s.session.onStart();
    s.setBallX(IN_CHUTE_X);
    s.step(drainOf(FIRST_ID)); // not started: a real drain
    expect(s.session.getState()).toBe("bonus");
    expect(s.session.trySave(-1)).toBe(false);
    expect(s.session.trySave(FIRST_ID)).toBe(false);
  });

  it("two drain events for the active id in one batch give one remove, one add and one save; a later drain for the replaced id changes nothing", () => {
    const r = makeRig();
    startSaved(r);
    r.step(drainOf(FIRST_ID), drainOf(FIRST_ID));
    expect(r.calls).toEqual([
      { op: "add", spec: SPAWN },
      { op: "remove", id: FIRST_ID },
      { op: "add", spec: SPAWN },
    ]);
    expect(r.session.getSaveCount()).toBe(1);
    expect(r.session.getDrainCount()).toBe(1);
    r.tick(1);
    r.step(drainOf(FIRST_ID)); // the replaced ball
    expect(r.calls).toHaveLength(3);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.activeBallId).toBe(FIRST_ID + 1);
    expect(r.session.getDrainCount()).toBe(1);
  });

  it("a kickback and a drain of the same ball on the same step keep the ball: remove then add, the ball unchanged, one save, reported as a backstop (the kick never reached a live ball, 06-REVIEW WR-02)", () => {
    const r = makeRig();
    startSaved(r);
    // The post kicker calls trySave during the step's dispatch; the drain is
    // delivered in the same batch, and service() follows.
    expect(r.session.trySave(FIRST_ID)).toBe(true);
    r.step(drainOf(FIRST_ID));
    expect(r.calls).toEqual([
      { op: "add", spec: SPAWN },
      { op: "remove", id: FIRST_ID },
      { op: "add", spec: SPAWN },
    ]);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getBall()).toBe(1);
    expect(r.session.getSaveCount()).toBe(1);
    // Read on the same step the presentation diffs it: no post flourish or
    // kick sparks for a ball that is now sitting on the plunger.
    expect(r.session.getLastSaveKind()).toBe("backstop");

    // The save is spent: the next drain of the re-served ball is real.
    r.tick(1);
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getSaveCount()).toBe(1);
  });

  it("a kickback followed by a drain of the kicked ball within KICKBACK_GRACE_STEPS is a backstop re-serve that counts once (06-REVIEW CR-01)", () => {
    const r = makeRig();
    startSaved(r);
    expect(r.session.trySave(FIRST_ID)).toBe(true); // kickback on step 1
    r.step();
    r.tick(KICKBACK_GRACE_STEPS); // step 1 + grace: the last step of the grace
    r.step(drainOf(FIRST_ID));
    expect(r.calls).toEqual([
      { op: "add", spec: SPAWN },
      { op: "remove", id: FIRST_ID },
      { op: "add", spec: SPAWN },
    ]);
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getBall()).toBe(1);
    expect(r.session.getSaveCount()).toBe(1);
    expect(r.session.getLastSaveKind()).toBe("kickback");
    expect(r.session.getLastSaveStep()).toBe(1 + KICKBACK_GRACE_STEPS);

    // The grace is used up: the re-served ball's drain is real.
    r.tick(1);
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getSaveCount()).toBe(1);
  });

  it("a lost ball clears getLastSkillStep() so SKILL SHOT never outlives the ball that made it (06-REVIEW IN-01)", () => {
    const r = makeRig(NO_SAVE);
    r.session.onStart();
    r.tick(5);
    const lit = r.session.getSkillLitLane();
    r.session.onSwitch("rollover", lit, false);
    expect(r.session.getSkillShotCount()).toBe(1);
    expect(r.session.getLastSkillStep()).toBe(5);
    r.step(drainOf(FIRST_ID));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getLastSkillStep()).toBe(-1);
    expect(r.session.getSkillShotCount()).toBe(1); // the ladder is per game
    expect(r.session.getLastSkillValue()).toBeGreaterThan(0);
  });

  it("a lost ball and a new game clear getLastSaveStep() so BALL SAVED never outlives the saved ball (06-REVIEW WR-01)", () => {
    const r = makeRig();
    startSaved(r);
    r.step(drainOf(FIRST_ID)); // backstop save on step 1
    expect(r.session.getLastSaveStep()).toBe(1);
    r.tick(1);
    r.step(drainOf(r.session.activeBallId)); // the re-served ball is lost
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getLastSaveStep()).toBe(-1);
    expect(r.session.getSaveCount()).toBe(1);

    const g = makeRig();
    startSaved(g);
    expect(g.session.trySave(FIRST_ID)).toBe(true);
    nudgeTimes(g, 4); // tilt: the drain is a forfeit, the grace is over
    g.step(drainOf(FIRST_ID));
    expect(g.session.getLastSaveStep()).toBe(-1);
  });

  it("a kickback late in the window keeps the KICKBACK_GRACE_STEPS floor: a drain on its last step is re-served, one step later it is real", () => {
    // The timer starts on step 1 (remaining 840) and would time out on step
    // 841; a kick on step 800 has 41 window steps left, under the 240 floor.
    for (const [drainStep, saved] of [
      [800 + KICKBACK_GRACE_STEPS, true],
      [800 + KICKBACK_GRACE_STEPS + 1, false],
    ] as const) {
      const r = makeRig();
      startSaved(r);
      r.tick(799);
      expect(r.session.getStep()).toBe(800);
      expect(r.session.trySave(FIRST_ID)).toBe(true);
      r.step();
      r.tick(drainStep - 800);
      r.step(drainOf(FIRST_ID));
      expect(r.session.getState()).toBe(saved ? "playing" : "bonus");
      expect(r.session.getBall()).toBe(1);
      expect(r.session.getSaveCount()).toBe(1);
    }
  });

  it("a kickback never makes a drain inside the original save window cost the ball: the grace runs to the window's end, past KICKBACK_GRACE_STEPS (06-REVIEW CR-01)", () => {
    // Without a kick, the save started on step 1 backstops a drain through
    // step BALL_SAVE_STEPS and times out on the step after (the parity case).
    const lastWindowStep = BALL_SAVE_STEPS;
    const plain = makeRig();
    startSaved(plain);
    plain.tick(lastWindowStep - 1);
    plain.step(drainOf(FIRST_ID));
    expect(plain.session.getState()).toBe("playing");
    expect(plain.session.getSaveCount()).toBe(1);

    // Kick at window step 100 (session step 101), then drain the kicked ball
    // after the 240-step grace floor but inside the window, on the window's
    // last step, and one step past it.
    const kickStep = 101;
    for (const [drainStep, saved] of [
      [kickStep + 600, true],
      [lastWindowStep, true],
      [lastWindowStep + 1, false],
    ] as const) {
      expect(drainStep - kickStep).toBeGreaterThan(KICKBACK_GRACE_STEPS);
      const r = makeRig();
      startSaved(r);
      r.tick(kickStep - 1);
      expect(r.session.getStep()).toBe(kickStep);
      expect(r.session.trySave(FIRST_ID)).toBe(true);
      r.step();
      r.tick(drainStep - kickStep);
      r.step(drainOf(FIRST_ID));
      expect(r.session.getBall()).toBe(1);
      expect(r.session.getSaveCount()).toBe(1);
      if (saved) {
        // No ball lost: remove then add, same ball, still playing, counted
        // once as the kickback.
        expect(r.session.getState()).toBe("playing");
        expect(r.calls).toEqual([
          { op: "add", spec: SPAWN },
          { op: "remove", id: FIRST_ID },
          { op: "add", spec: SPAWN },
        ]);
        expect(r.session.getLastSaveKind()).toBe("kickback");
        expect(r.session.getLastSaveStep()).toBe(drainStep);
        // The grace is used up: the re-served ball's drain is real.
        r.tick(1);
        r.step(drainOf(r.session.activeBallId));
        expect(r.session.getState()).toBe("bonus");
      } else {
        expect(r.session.getState()).toBe("bonus");
      }
    }
  });

  it("a tilt ends the kickback grace: the tilted drain is a forfeit, and the next ball's unstarted-save drain inside the old grace is real", () => {
    const r = makeRig();
    startSaved(r);
    expect(r.session.trySave(FIRST_ID)).toBe(true); // kickback on step 1
    nudgeTimes(r, 4);
    expect(r.session.getState()).toBe("tilted");
    r.step(drainOf(FIRST_ID));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.isBonusForfeit()).toBe(true);
    finishBonus(r);
    expect(r.session.getBall()).toBe(2);
    expect(r.session.getStep()).toBeLessThanOrEqual(1 + KICKBACK_GRACE_STEPS);
    r.setBallX(IN_CHUTE_X); // ball 2's save never starts
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getState()).toBe("bonus");
    expect(r.session.getBall()).toBe(2);
    expect(r.session.getSaveCount()).toBe(1);
  });

  it("getSaveLampPhase() mirrors the save while playing and is off in game over, tilted and bonus", () => {
    const r = makeRig();
    expect(r.session.getSaveLampPhase()).toBe("off"); // attract
    startSaved(r);
    expect(r.session.getSaveLampPhase()).toBe("steady");
    r.tick(BALL_SAVE_STEPS - BALL_SAVE_BLINK_STEPS - 1);
    expect(r.session.getSaveLampPhase()).toBe("steady");
    r.tick(1);
    expect(r.session.getSaveLampPhase()).toBe("blink");
    r.tick(BALL_SAVE_BLINK_STEPS);
    expect(r.session.getSaveLampPhase()).toBe("off"); // timed out

    const t = makeRig();
    startSaved(t);
    nudgeTimes(t, 4);
    expect(t.session.getState()).toBe("tilted");
    expect(t.session.getSaveLampPhase()).toBe("off");
    t.step(drainOf(FIRST_ID));
    expect(t.session.getState()).toBe("bonus");
    expect(t.session.getSaveLampPhase()).toBe("off");

    const g = makeRig(NO_SAVE);
    startAndDrain(g, BALLS_PER_GAME);
    expect(g.session.getState()).toBe("game-over");
    expect(g.session.getSaveLampPhase()).toBe("off");
  });

  it("the save is disarmed in game over after the last ball: onStart re-arms it", () => {
    const r = makeRig();
    r.setBallX(IN_CHUTE_X); // never start the timer: every drain is real
    startAndDrain(r, BALLS_PER_GAME);
    expect(r.session.getState()).toBe("game-over");
    expect(r.session.getSaveCount()).toBe(0);
    r.setBallX(0);
    r.session.onStart();
    expect(r.session.getSaveLampPhase()).toBe("steady");
    r.tick(1);
    r.step(drainOf(r.session.activeBallId));
    expect(r.session.getState()).toBe("playing");
    expect(r.session.getSaveCount()).toBe(1);
  });
});
