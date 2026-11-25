import { describe, it, expect, vi } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import type { BallId, CollisionEvent } from "../physics/types";
import { GameSession, type GameSessionWorld } from "./game-session";
import { HISCORE_KEY, HighScore, parseBest, type StorageLike } from "./high-score";

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

/** A storage whose getItem throws (a SecurityError on read). */
class ThrowingReadStorage implements StorageLike {
  sets = 0;
  getItem(): string | null {
    const err = new Error("The operation is insecure.");
    err.name = "SecurityError";
    throw err;
  }
  setItem(): void {
    this.sets++;
  }
}

/** A storage that reads fine but whose setItem throws a QuotaExceededError. */
class QuotaStorage implements StorageLike {
  setCalls = 0;
  getItem(): string | null {
    return null;
  }
  setItem(): void {
    this.setCalls++;
    const err = new Error("The quota has been exceeded.");
    err.name = "QuotaExceededError";
    throw err;
  }
}

describe("parseBest hostile values (plan 06-11 Task 2, D-16, T-6-22)", () => {
  it.each<[string | null, number]>([
    [null, 0],
    ["", 0],
    ["abc", 0],
    ["-5", 0],
    ["-1", 0],
    ["1.5", 0],
    ["NaN", 0],
    ["Infinity", 0],
    ["9007199254740993", 0],
    ["<img src=x onerror=alert(1)>", 0],
    // Non-decimal or padded forms Number() accepts (06-REVIEW IN-01).
    ["0x10", 0],
    ["1e3", 0],
    ["0b11", 0],
    ["0o7", 0],
    [" 42 ", 0],
    ["+42", 0],
    ["007", 0],
    ["42\n", 0],
    ["0", 0],
    ["48250", 48250],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("parseBest(%j) is %d", (raw, expected) => {
    expect(parseBest(raw)).toBe(expected);
  });

  it("a stored best of exactly MAX_SAFE_INTEGER is accepted and MAX_SAFE_INTEGER + 2 parses to 0", () => {
    expect(parseBest(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseBest("9007199254740993")).toBe(0);
  });

  it("a corrupt stored value gives a best of 0 through the constructor", () => {
    const storage = new FakeStorage();
    storage.map.set(HISCORE_KEY, "1.5");
    expect(new HighScore(storage).getBest()).toBe(0);
  });
});

describe("HighScore throwing and absent storage (plan 06-11 Task 2, D-16, T-6-23)", () => {
  it("a getItem that throws gives getBest() 0 and the constructor does not throw", () => {
    expect(() => new HighScore(new ThrowingReadStorage())).not.toThrow();
    expect(new HighScore(new ThrowingReadStorage()).getBest()).toBe(0);
  });

  it("HighScore(null) keeps an in-memory best", () => {
    const hs = new HighScore(null);
    expect(hs.getBest()).toBe(0);
    expect(hs.submit(1200)).toBe(true);
    expect(hs.getBest()).toBe(1200);
    expect(hs.submit(1100)).toBe(false);
    expect(hs.getBest()).toBe(1200);
  });

  it("a QuotaExceededError on setItem: submit(5000) is true, the best is 5000, nothing throws or logs", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const storage = new QuotaStorage();
      const hs = new HighScore(storage);
      let result = false;
      expect(() => {
        result = hs.submit(5000);
      }).not.toThrow();
      expect(result).toBe(true);
      expect(hs.getBest()).toBe(5000);
      expect(storage.setCalls).toBe(1);
      expect(error).toHaveBeenCalledTimes(0);
      expect(warn).toHaveBeenCalledTimes(0);
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  it("a throwing read still lets a later new best write through", () => {
    const storage = new ThrowingReadStorage();
    const hs = new HighScore(storage);
    expect(hs.submit(10)).toBe(true);
    expect(storage.sets).toBe(1);
  });
});

describe("HighScore submit writes (plan 06-11 Task 2, D-16, T-6-24)", () => {
  it("submit(best) returns false and writes nothing; submit(best + 1) writes once", () => {
    const storage = new FakeStorage();
    storage.map.set(HISCORE_KEY, "48250");
    const hs = new HighScore(storage);
    expect(hs.submit(48250)).toBe(false);
    expect(storage.sets).toHaveLength(0);
    expect(hs.submit(48251)).toBe(true);
    expect(storage.sets).toEqual([[HISCORE_KEY, "48251"]]);
  });

  it.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2])(
    "submit(%d) returns false with no write",
    (score) => {
      const storage = new FakeStorage();
      const hs = new HighScore(storage);
      expect(hs.submit(score)).toBe(false);
      expect(storage.sets).toHaveLength(0);
      expect(hs.getBest()).toBe(0);
    },
  );

  it("over a whole session getItem runs once and every write is HISCORE_KEY with a decimal integer", () => {
    const storage = new FakeStorage();
    const rig = makeSessionRig(new HighScore(storage));
    rig.playGame(1000);
    rig.playGame(500);
    rig.playGame(2500);
    rig.playGame(2500);
    expect(storage.getCount).toBe(1);
    expect(storage.sets).toHaveLength(2);
    for (const [key, value] of storage.sets) {
      expect(key).toBe(HISCORE_KEY);
      expect(value).toMatch(/^\d+$/);
    }
    expect([...storage.map.keys()]).toEqual([HISCORE_KEY]);
    expect(storage.map.get(HISCORE_KEY)).toBe("2500");
  });

  it("a final score equal to the best is not a new best and best + 1 is", () => {
    const storage = new FakeStorage();
    const rig = makeSessionRig(new HighScore(storage));
    rig.playGame(3000);
    rig.playGame(3000);
    expect(rig.session.isNewBest()).toBe(false);
    expect(rig.session.getNewBestCount()).toBe(1);
    rig.playGame(3001);
    expect(rig.session.isNewBest()).toBe(true);
    expect(rig.session.getNewBestCount()).toBe(2);
  });
});
