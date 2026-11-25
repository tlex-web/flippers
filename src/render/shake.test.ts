import { afterEach, describe, it, expect, vi } from "vitest";

import { resolve } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";
import { EffectsTracker } from "./effects";
import {
  noiseX,
  noiseY,
  SHAKE_CLAMP_CSS_PX,
  SHAKE_KICK_PEAK_CSS_PX,
  SHAKE_TRAUMA_MAX_CSS_PX,
  ShakeTracker,
  TRAUMA_BUMPER,
  type ShakeOut,
} from "./shake";

/**
 * PLSH-01 screen shake (plan 06-09 Task 2, D-17, D-18, T-6-18): the nudge kick
 * peaks at SHAKE_KICK_PEAK_CSS_PX opposite the ball's nudge impulse and settles
 * within 30 fixed steps; trauma is clamped and decays linearly on the step
 * clock; the combined offset is capped; the whole thing is a pure function of
 * the calls made and of (step, alpha); and under reducedMotion every source
 * reads exactly 0. Same step-clock idiom as flash.test.ts.
 */

/** Sub-step read points per fixed step. */
const ALPHAS: readonly number[] = [0, 0.5];

interface Trace {
  /** Per fixed step since the kick landed, per alpha, the unrounded offset. */
  readonly xs: number[];
  readonly ys: number[];
}

/** Sample `steps` fixed steps (ticking after each) at every alpha, unrounded. */
function trace(s: ShakeTracker, steps: number, dpr = 1): Trace {
  const out: ShakeOut = { x: 0, y: 0 };
  const xs: number[] = [];
  const ys: number[] = [];
  s.tick();
  for (let i = 0; i < steps; i++) {
    for (const a of ALPHAS) {
      s.sampleExact(a, dpr, false, out);
      xs.push(out.x);
      ys.push(out.y);
    }
    s.tick();
  }
  return { xs, ys };
}

function maxAbs(v: readonly number[]): number {
  let m = 0;
  for (const x of v) m = Math.max(m, Math.abs(x));
  return m;
}

/** The first sample whose magnitude passes `eps`. */
function firstExcursion(v: readonly number[], eps = 1e-6): number {
  return v.find((x) => Math.abs(x) > eps) ?? 0;
}

describe("ShakeTracker nudge kick (D-17)", () => {
  it("a left nudge peaks at 6 +/- 0.1 CSS px toward -x, keeps y at 0 and settles below 0.06 px from step 30", () => {
    const s = new ShakeTracker();
    s.kick("left");
    const { xs, ys } = trace(s, 60);
    expect(maxAbs(xs)).toBeGreaterThanOrEqual(SHAKE_KICK_PEAK_CSS_PX - 0.1);
    expect(maxAbs(xs)).toBeLessThanOrEqual(SHAKE_KICK_PEAK_CSS_PX + 0.1);
    // NUDGE_DIRS.left pushes the ball +x, so the cabinet shoves the view -x.
    expect(firstExcursion(xs)).toBeLessThan(0);
    expect(maxAbs(ys)).toBe(0);
    const settled = xs.slice(30 * ALPHAS.length);
    expect(maxAbs(settled)).toBeLessThanOrEqual(0.06);
  });

  it("a right nudge moves +x first and an up nudge moves +y first", () => {
    const r = new ShakeTracker();
    r.kick("right");
    expect(firstExcursion(trace(r, 10).xs)).toBeGreaterThan(0);

    const u = new ShakeTracker();
    u.kick("up");
    const { xs, ys } = trace(u, 60);
    expect(firstExcursion(ys)).toBeGreaterThan(0);
    expect(maxAbs(xs)).toBe(0);
    expect(maxAbs(ys)).toBeGreaterThanOrEqual(SHAKE_KICK_PEAK_CSS_PX - 0.1);
    expect(maxAbs(ys)).toBeLessThanOrEqual(SHAKE_KICK_PEAK_CSS_PX + 0.1);
  });

  it("dpr 2 doubles the pre-rounding offset", () => {
    const a = new ShakeTracker();
    const b = new ShakeTracker();
    a.kick("left");
    b.kick("left");
    const one = trace(a, 40, 1).xs;
    const two = trace(b, 40, 2).xs;
    for (let i = 0; i < one.length; i++) expect(two[i]).toBeCloseTo(2 * (one[i] ?? 0), 12);
  });

  it("a second kick at step 5 restarts the response: the peak after it is again 6 +/- 0.1 px", () => {
    const s = new ShakeTracker();
    s.kick("left");
    for (let i = 0; i < 5; i++) s.tick();
    s.kick("left");
    const { xs } = trace(s, 60);
    expect(maxAbs(xs)).toBeGreaterThanOrEqual(SHAKE_KICK_PEAK_CSS_PX - 0.1);
    expect(maxAbs(xs)).toBeLessThanOrEqual(SHAKE_KICK_PEAK_CSS_PX + 0.1);
    expect(firstExcursion(xs)).toBeLessThan(0);
    expect(maxAbs(xs.slice(30 * ALPHAS.length))).toBeLessThanOrEqual(0.06);
  });
});

describe("ShakeTracker trauma (D-17)", () => {
  it("addTrauma 0.7, 0.25 then 0.5 clamps at 1; 60 ticks leave 0.25; it reaches exactly 0 and stays", () => {
    const s = new ShakeTracker();
    s.addTrauma(0.7);
    expect(s.getTrauma()).toBeCloseTo(0.7, 12);
    s.addTrauma(0.25);
    expect(s.getTrauma()).toBeCloseTo(0.95, 12);
    s.addTrauma(0.5);
    expect(s.getTrauma()).toBe(1);
    for (let i = 0; i < 60; i++) s.tick();
    expect(s.getTrauma()).toBeCloseTo(1 - (60 * 1.5) / 120, 9);
    for (let i = 0; i < 40; i++) s.tick();
    expect(s.getTrauma()).toBe(0);
    for (let i = 0; i < 200; i++) s.tick();
    expect(s.getTrauma()).toBe(0);
  });

  it("addTrauma(NaN), addTrauma(-1) and addTrauma(Infinity) change nothing", () => {
    const s = new ShakeTracker();
    s.addTrauma(0.3);
    s.addTrauma(Number.NaN);
    s.addTrauma(-1);
    s.addTrauma(Number.POSITIVE_INFINITY);
    expect(s.getTrauma()).toBeCloseTo(0.3, 12);
  });

  it("at trauma 1 the trauma term never exceeds 8 px * dpr", () => {
    for (const dpr of [1, 2]) {
      const s = new ShakeTracker();
      const out: ShakeOut = { x: 0, y: 0 };
      let peak = 0;
      for (let i = 0; i < 600; i++) {
        s.addTrauma(1);
        s.tick();
        for (const a of ALPHAS) {
          s.sampleExact(a, dpr, false, out);
          peak = Math.max(peak, Math.abs(out.x), Math.abs(out.y));
        }
      }
      expect(peak).toBeLessThanOrEqual(SHAKE_TRAUMA_MAX_CSS_PX * dpr + 1e-9);
      expect(peak).toBeGreaterThan(0);
    }
  });

  it("with a kick on top of trauma 1 the combined offset never exceeds 12 * dpr", () => {
    for (const dpr of [1, 2]) {
      const s = new ShakeTracker();
      const out: ShakeOut = { x: 0, y: 0 };
      let peak = 0;
      for (let i = 0; i < 1200; i++) {
        if (i % 20 === 0) s.kick(i % 40 === 0 ? "left" : "up");
        s.addTrauma(1);
        s.tick();
        for (const a of ALPHAS) {
          s.sample(a, dpr, false, out);
          peak = Math.max(peak, Math.abs(out.x), Math.abs(out.y));
          expect(Number.isInteger(out.x) && Number.isInteger(out.y)).toBe(true);
        }
      }
      expect(peak).toBeLessThanOrEqual(SHAKE_CLAMP_CSS_PX * dpr);
      // 6 px of kick plus 8 px of trauma can pass 12: the clamp is engaged.
      expect(peak).toBe(SHAKE_CLAMP_CSS_PX * dpr);
    }
  });

  it("one full-strength bumper (trauma 0.12) moves at most 8 * 0.0144 px before rounding, 0 or 1 px after", () => {
    const s = new ShakeTracker();
    s.addTrauma(TRAUMA_BUMPER);
    const exact: ShakeOut = { x: 0, y: 0 };
    const rounded: ShakeOut = { x: 0, y: 0 };
    for (let i = 0; i < 120; i++) {
      s.tick();
      for (const a of ALPHAS) {
        s.sampleExact(a, 1, false, exact);
        expect(Math.abs(exact.x)).toBeLessThanOrEqual(8 * 0.0144 + 1e-12);
        expect(Math.abs(exact.y)).toBeLessThanOrEqual(8 * 0.0144 + 1e-12);
        s.sample(a, 1, false, rounded);
        expect(Math.abs(rounded.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(rounded.y)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("ShakeTracker determinism (D-17, D-23)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("two trackers fed the same calls produce identical samples at the same (step, alpha), with no random source", () => {
    const random = vi.spyOn(Math, "random");
    const feed = (s: ShakeTracker, i: number): void => {
      if (i === 3) s.kick("right");
      if (i === 10) s.addTrauma(0.7);
      if (i === 25) s.kick("up");
      if (i === 40) s.addTrauma(0.25);
      s.tick();
    };
    const a = new ShakeTracker();
    const b = new ShakeTracker();
    const oa: ShakeOut = { x: 0, y: 0 };
    const ob: ShakeOut = { x: 0, y: 0 };
    let moved = false;
    for (let i = 0; i < 120; i++) {
      feed(a, i);
      feed(b, i);
      for (const al of [0, 0.25, 0.5, 0.75]) {
        a.sampleExact(al, 1.5, false, oa);
        b.sampleExact(al, 1.5, false, ob);
        expect(ob.x).toBe(oa.x);
        expect(ob.y).toBe(oa.y);
        if (oa.x !== 0 || oa.y !== 0) moved = true;
      }
    }
    expect(moved).toBe(true);
    expect(random).not.toHaveBeenCalled();
  });

  it("the noise is a pure function of t, bounded to [-1, 1]", () => {
    for (let i = 0; i < 500; i++) {
      const t = i * 0.0037;
      expect(noiseX(t)).toBe(noiseX(t));
      expect(noiseY(t)).toBe(noiseY(t));
      expect(Math.abs(noiseX(t))).toBeLessThanOrEqual(1);
      expect(Math.abs(noiseY(t))).toBeLessThanOrEqual(1);
    }
  });
});

describe("ShakeTracker under reducedMotion (D-18, T-6-18)", () => {
  it("with any kick and trauma 1, sample(..., true, out) writes exactly 0 and 0 at every step, alpha and dpr", () => {
    const reducedMotion = true;
    for (const dir of ["left", "right", "up"] as const) {
      const s = new ShakeTracker();
      s.kick(dir);
      s.addTrauma(1);
      const out: ShakeOut = { x: 99, y: -99 };
      for (let i = 0; i < 60; i++) {
        s.addTrauma(1);
        s.tick();
        for (const dpr of [1, 1.5, 2]) {
          for (const a of [0, 0.3, 0.5, 1]) {
            out.x = 99;
            out.y = -99;
            s.sample(a, dpr, reducedMotion, out);
            expect(Object.is(out.x, 0)).toBe(true);
            expect(Object.is(out.y, 0)).toBe(true);
            out.x = 99;
            out.y = -99;
            s.sampleExact(a, dpr, reducedMotion, out);
            expect(Object.is(out.x, 0)).toBe(true);
            expect(Object.is(out.y, 0)).toBe(true);
          }
        }
      }
    }
  });

  it("through the EffectsTracker, a nudge, a bumper, a drain and a tilt all read exactly 0 under reducedMotion (and move the view without it)", () => {
    const fx = new EffectsTracker(resolve(TABLE_SPEC));
    fx.onNudge("left");
    fx.onKick("bumper", 202, 1, 0, 0);
    fx.onDrain();
    fx.onTilt();
    const out: ShakeOut = { x: 0, y: 0 };
    let movedWithout = false;
    for (let i = 0; i < 30; i++) {
      fx.tick();
      for (const a of ALPHAS) {
        fx.shake.sample(a, 2, true, out);
        expect(Object.is(out.x, 0) && Object.is(out.y, 0)).toBe(true);
        fx.shake.sample(a, 2, false, out);
        if (out.x !== 0 || out.y !== 0) movedWithout = true;
      }
    }
    expect(movedWithout).toBe(true);
  });
});
