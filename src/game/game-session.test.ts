import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import type { BallId } from "../physics/types";
import { GameSession, type GameSessionWorld } from "./game-session";

/**
 * GameSession score contract (plan 04-01 Task 2, GAME-01 precision edge): the
 * score is an exact, non-negative, saturating integer.
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
  it("a fresh session has score 0 and is live", () => {
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
