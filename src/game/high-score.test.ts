import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import type { BallId, CollisionEvent } from "../physics/types";
import { GameSession, type GameSessionWorld } from "./game-session";
import { HISCORE_KEY, HighScore, type StorageLike } from "./high-score";

/**
 * High score contracts (plan 06-11, PLSH-08, D-15, D-16):
 * - tracer (Task 1): a game's final score is submitted once at game over,
 *   stored under `flippers.hiscore.v1`, and read back by a fresh `HighScore`
 *   over the same storage (a new browser session);
 * - the session-level cases build a small spy-world `GameSession` here (the
 *   `makeRig` idiom from game-session.test.ts) with the ball save off.
 */

/** A Map-backed `StorageLike` that records every call. */
class FakeStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getCount = 0;
  readonly sets: [string, string][] = [];
  getItem(key: string): string | null {
    this.getCount++;
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.sets.push([key, value]);
    this.map.set(key, value);
  }
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

interface SessionRig {
  readonly session: GameSession;
  /** Play one whole game that ends with exactly `score` points. */
  playGame(score: number): void;
}

/**
 * A spy-world session (addBall hands out ids, no balls on the table) with the
 * ball save off and the given high score. `playGame` starts a game, awards the
 * points on ball 1, then drains each ball and skips its (all-zero) tally with a
 * flipper press, as main.ts would, until the game is over.
 */
function makeSessionRig(highScore: HighScore): SessionRig {
  let nextId: BallId = 10;
  const world: GameSessionWorld = {
    addBall: () => nextId++,
    removeBall: () => {},
    getBalls: () => [],
    applyImpulse: () => {},
  };
  let batch: CollisionEvent[] = [];
  const router = new CollisionRouter({ drainEvents: () => batch });
  const session = new GameSession(
    world,
    router,
    { x: 3.15, y: 6.2 },
    { setEnabled: () => {} },
    { ballSaveSteps: 0, highScore },
  );
  const step = (...events: CollisionEvent[]): void => {
    batch = events;
    router.dispatch();
    batch = [];
    session.service();
  };
  return {
    session,
    playGame: (score) => {
      expect(session.onStart()).toBe(true);
      session.award(score);
      for (let guard = 0; guard < 2000 && session.getState() !== "game-over"; guard++) {
        if (session.getState() === "playing") {
          session.tick();
          step(drainOf(session.activeBallId));
        } else {
          session.onFlipperPress();
          session.tick();
          step();
        }
      }
      expect(session.getState()).toBe("game-over");
    },
  };
}

describe("HighScore tracer (plan 06-11 Task 1, PLSH-08)", () => {
  it("a final score of 3,000 is a new best, stored under flippers.hiscore.v1", () => {
    const storage = new FakeStorage();
    const rig = makeSessionRig(new HighScore(storage));
    rig.playGame(3000);
    expect(rig.session.getScore()).toBe(3000);
    expect(rig.session.isNewBest()).toBe(true);
    expect(rig.session.getNewBestCount()).toBe(1);
    expect(rig.session.getBest()).toBe(3000);
    expect(storage.map.get(HISCORE_KEY)).toBe("3000");
    expect(HISCORE_KEY).toBe("flippers.hiscore.v1");
  });

  it("a fresh HighScore over the same storage reads the best back (a new session)", () => {
    const storage = new FakeStorage();
    makeSessionRig(new HighScore(storage)).playGame(3000);
    const next = new HighScore(storage);
    expect(next.getBest()).toBe(3000);
  });

  it("a second game ending at 2,000 leaves the stored 3000 and is not a new best", () => {
    const storage = new FakeStorage();
    const rig = makeSessionRig(new HighScore(storage));
    rig.playGame(3000);
    rig.playGame(2000);
    expect(rig.session.getScore()).toBe(2000);
    expect(rig.session.isNewBest()).toBe(false);
    expect(rig.session.getNewBestCount()).toBe(1);
    expect(storage.map.get(HISCORE_KEY)).toBe("3000");
    expect(storage.sets).toHaveLength(1);
  });

  it("the game-over step is recorded and onStart() clears isNewBest()", () => {
    const storage = new FakeStorage();
    const rig = makeSessionRig(new HighScore(storage));
    expect(rig.session.getGameOverStep()).toBe(-1);
    rig.playGame(3000);
    expect(rig.session.getGameOverStep()).toBe(rig.session.getStep());
    expect(rig.session.isNewBest()).toBe(true);
    rig.session.onStart();
    expect(rig.session.isNewBest()).toBe(false);
  });

  it("nothing is submitted during play or the bonus state", () => {
    const storage = new FakeStorage();
    const rig = makeSessionRig(new HighScore(storage));
    rig.session.onStart();
    rig.session.award(9000);
    rig.session.tick();
    expect(storage.sets).toHaveLength(0);
    expect(rig.session.isNewBest()).toBe(false);
  });
});
