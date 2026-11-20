import { describe, it, expect } from "vitest";

import { TiltMeter } from "./tilt-meter";
import { NUDGE_COOLDOWN_STEPS, TILT_LEVEL, TILT_WARNING_LEVEL } from "./tuning";

/**
 * TiltMeter contract (plan 04-06 Task 2, GAME-03, R10): a pure accumulate-and-
 * decay meter with no world and no clock. Each `update()` is one fixed step.
 * Worked numbers (RESEARCH Pattern 5): nudges 30 steps apart give 1.0, 1.875,
 * 2.75 (warning), then 3.625 (tilt).
 */

/** Run `n` fixed-step updates. */
function decay(m: TiltMeter, n: number): void {
  for (let i = 0; i < n; i++) m.update();
}

describe("TiltMeter (GAME-03, R10)", () => {
  it("worked numbers: nudges 30 steps apart go ok, ok, warning (2.75), then tilt (3.625)", () => {
    expect(NUDGE_COOLDOWN_STEPS).toBe(30);
    const m = new TiltMeter();
    expect(m.addNudge()).toBe("ok");
    decay(m, 30);
    expect(m.addNudge()).toBe("ok");
    expect(m.getLevel()).toBeCloseTo(1.875, 9);
    decay(m, 30);
    expect(m.addNudge()).toBe("warning");
    expect(m.getLevel()).toBeCloseTo(2.75, 9);
    decay(m, 30);
    expect(m.addNudge()).toBe("tilt");
    expect(m.getLevel()).toBeCloseTo(3.625, 9);
  });

  it("boundaries are inclusive: with no decay, nudge 2 reaches exactly 2.0 and warns, nudge 3 reaches exactly 3.0 and tilts", () => {
    const m = new TiltMeter();
    expect(m.addNudge()).toBe("ok");
    expect(m.addNudge()).toBe("warning");
    expect(m.getLevel()).toBe(TILT_WARNING_LEVEL);
    expect(m.addNudge()).toBe("tilt");
    expect(m.getLevel()).toBe(TILT_LEVEL);
  });

  it("one nudge every 240 steps, 10 times, is always ok and never exceeds 1.0", () => {
    const m = new TiltMeter();
    for (let i = 0; i < 10; i++) {
      expect(m.addNudge()).toBe("ok");
      // 240 steps is exactly a full decay of one nudge, so float residue of the
      // 240 subtractions (about 2e-15) may remain; that is not accumulation.
      expect(m.getLevel()).toBeLessThanOrEqual(1.0 + 1e-12);
      decay(m, 240);
    }
  });

  it("the level never goes below 0", () => {
    const m = new TiltMeter();
    decay(m, 1000);
    expect(m.getLevel()).toBe(0);
    m.addNudge();
    decay(m, 1000);
    expect(m.getLevel()).toBe(0);
  });

  it("reset() gives level 0 and re-arms the warning", () => {
    const m = new TiltMeter();
    m.addNudge();
    expect(m.addNudge()).toBe("warning");
    m.reset();
    expect(m.getLevel()).toBe(0);
    expect(m.addNudge()).toBe("ok");
    expect(m.addNudge()).toBe("warning");
  });

  it("warning edge: while the level stays >= the warning level it never warns again", () => {
    // A half-cost meter can be nudged while already at or above 2.0 without
    // tilting, which is what exposes a level-triggered (not edge) warning.
    const m = new TiltMeter({ cost: 0.5 });
    expect(m.addNudge()).toBe("ok"); // 0.5
    expect(m.addNudge()).toBe("ok"); // 1.0
    expect(m.addNudge()).toBe("ok"); // 1.5
    expect(m.addNudge()).toBe("warning"); // 2.0
    expect(m.addNudge()).toBe("ok"); // 2.5: still above, no second warning
    decay(m, 10); // 2.5 - 10 * 0.5 / 120 ≈ 2.458, still >= 2.0
    expect(m.getLevel()).toBeGreaterThanOrEqual(TILT_WARNING_LEVEL);
    expect(m.addNudge()).toBe("ok"); // ≈ 2.958
    expect(m.addNudge()).toBe("tilt"); // ≈ 3.458
  });

  it("warning edge: after decaying below the warning level, the next crossing warns again", () => {
    const m = new TiltMeter();
    m.addNudge();
    expect(m.addNudge()).toBe("warning"); // exactly 2.0
    decay(m, 1); // just below 2.0: re-armed
    expect(m.getLevel()).toBeLessThan(TILT_WARNING_LEVEL);
    expect(m.addNudge()).toBe("warning"); // ≈ 2.996, below the tilt level
    expect(m.getLevel()).toBeLessThan(TILT_LEVEL);
  });
});
