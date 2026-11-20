import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import type { BallId, BallSpec, CollisionEvent } from "../physics/types";
import { BALLS_PER_GAME, GameSession, type GameSessionWorld } from "./game-session";

/**
 * GameSession contracts:
 * - score (plan 04-01 Task 2, GAME-01 precision edge): the score is an exact,
 *   non-negative, saturating integer;
 * - 3-ball FSM (plan 04-05 Task 2, GAME-02): start, serve, drain, game over and
 *   restart, against a spy world and a real `CollisionRouter` over a scripted
 *   source. Each simulated step is `dispatch()` then `service()`, as in main.ts.
 */

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
  };
  const router = new CollisionRouter({ drainEvents: () => [] });
  const session = new GameSession(world, router, { x: 0, y: 0 });
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

interface Rig {
  readonly session: GameSession;
  /** Every world call, in order. */
  readonly calls: Call[];
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

function makeRig(): Rig {
  const calls: Call[] = [];
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
  };
  let batch: CollisionEvent[] = [];
  const router = new CollisionRouter({ drainEvents: () => batch });
  const session = new GameSession(world, router, SPAWN);
  const dispatchOnly = (...events: CollisionEvent[]): void => {
    batch = events;
    router.dispatch();
    batch = [];
  };
  return {
    session,
    calls,
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
