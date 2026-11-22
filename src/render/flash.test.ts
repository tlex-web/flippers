import { describe, it, expect } from "vitest";

import { resolve } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";
import {
  CONTACT_FLASH_PEAK,
  FLASH_BUMPER,
  FLASH_CONTACT,
  FLASH_CUTOFF_TAUS,
  FLASH_SENSOR,
  FLASH_SLING,
  FLASH_TIMING,
  FlashTracker,
  flashLevel,
  maxElementId,
} from "./flash";

/**
 * RND-03 flash clock (plan 05-04 Task 1, research Pattern 4, T-05-14): the
 * decay law is pure and NaN-safe, and FlashTracker reads levels at step + alpha
 * on the fixed-step clock, ignoring ids it was not sized for.
 */

describe("flashLevel", () => {
  const hold = 2;
  const decay = 10;

  it("is 1 for every age from 0 through the hold", () => {
    for (let age = 0; age <= hold; age += 0.5) {
      expect(flashLevel(age, decay, hold)).toBe(1);
    }
  });

  it("decreases strictly after the hold", () => {
    let prev = flashLevel(hold, decay, hold);
    for (let age = hold + 0.25; age < hold + FLASH_CUTOFF_TAUS * decay; age += 0.25) {
      const v = flashLevel(age, decay, hold);
      expect(v).toBeLessThan(prev);
      expect(v).toBeGreaterThan(0);
      prev = v;
    }
  });

  it("is exactly 0 at and after hold + 4 decays", () => {
    const cutoff = hold + FLASH_CUTOFF_TAUS * decay;
    expect(flashLevel(cutoff, decay, hold)).toBe(0);
    expect(flashLevel(cutoff + 0.01, decay, hold)).toBe(0);
    expect(flashLevel(cutoff + 1000, decay, hold)).toBe(0);
  });

  it("is 0 for NaN, negative and infinite ages", () => {
    for (const age of [Number.NaN, -1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      expect(flashLevel(age, decay, hold)).toBe(0);
    }
  });
});

describe("FlashTracker", () => {
  const maxId = 600;

  it("reads 0 for an id never recorded, at any alpha", () => {
    const f = new FlashTracker(maxId);
    for (const alpha of [0, 0.25, 0.5, 0.99, 1]) {
      expect(f.level(202, alpha, FLASH_BUMPER)).toBe(0);
    }
    f.tick();
    expect(f.level(202, 0.5, FLASH_BUMPER)).toBe(0);
  });

  it("reads the recorded strength at age 0", () => {
    const f = new FlashTracker(maxId);
    f.record(202, 0.8);
    expect(f.level(202, 0, FLASH_BUMPER)).toBe(0.8);
  });

  it("reads strength * e^-1 after hold + decay ticks past the recording step, at alpha 0", () => {
    const f = new FlashTracker(maxId);
    f.record(202, 0.8);
    f.tick(); // the recording step's own tick (the last call of onPostStep)
    const ticks = FLASH_BUMPER.holdSteps + FLASH_BUMPER.decaySteps;
    for (let i = 0; i < ticks; i++) f.tick();
    expect(f.step).toBe(ticks + 1);
    expect(f.level(202, 0, FLASH_BUMPER)).toBeCloseTo(0.8 * Math.exp(-1), 12);
  });

  it("the first render after the recording step's tick is at the peak (IN-01)", () => {
    const f = new FlashTracker(maxId);
    f.record(100, CONTACT_FLASH_PEAK);
    f.tick();
    // Age is alpha, not 1 + alpha: a hold-0 contact flash is drawn at its peak.
    expect(f.level(100, 0, FLASH_CONTACT)).toBe(CONTACT_FLASH_PEAK);
    // A one-step sling hold is still intact for the whole first frame.
    f.record(300, 1);
    f.tick();
    expect(f.level(300, 0.99, FLASH_SLING)).toBe(1);
  });

  it("interpolates between whole steps during the decay at alpha 0.5", () => {
    const f = new FlashTracker(maxId);
    f.record(400, 1);
    for (let i = 0; i < 5; i++) f.tick();
    const here = f.level(400, 0, FLASH_SENSOR);
    const mid = f.level(400, 0.5, FLASH_SENSOR);
    f.tick();
    const next = f.level(400, 0, FLASH_SENSOR);
    expect(here).toBeGreaterThan(next);
    expect(mid).toBeLessThan(here);
    expect(mid).toBeGreaterThan(next);
  });

  it("ignores ids -1, maxId + 1, 2.5 and NaN without throwing", () => {
    const f = new FlashTracker(maxId);
    for (const id of [-1, maxId + 1, 2.5, Number.NaN]) {
      expect(() => f.record(id, 1)).not.toThrow();
      expect(f.level(id, 0, FLASH_BUMPER)).toBe(0);
    }
    // Neighbouring valid ids were not touched by the ignored records.
    expect(f.level(0, 0, FLASH_BUMPER)).toBe(0);
    expect(f.level(2, 0, FLASH_BUMPER)).toBe(0);
    expect(f.level(maxId, 0, FLASH_BUMPER)).toBe(0);
  });

  it("clamps a strength of 2 to 1", () => {
    const f = new FlashTracker(maxId);
    f.record(300, 2);
    expect(f.level(300, 0, FLASH_TIMING.slingshot)).toBe(1);
  });

  it("restarts a re-hit at its own strength", () => {
    const f = new FlashTracker(maxId);
    f.record(100, 1);
    f.tick();
    f.record(100, 0.35);
    expect(f.level(100, 0, FLASH_TIMING.wall)).toBe(0.35);
  });
});

describe("maxElementId", () => {
  it("is 610 (the virtual center post) for TABLE_SPEC", () => {
    expect(maxElementId(resolve(TABLE_SPEC))).toBe(610);
  });
});
