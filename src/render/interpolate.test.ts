import { describe, it, expect } from "vitest";

import type { BallState } from "../physics/types";
import {
  interpolateAngles,
  interpolateBalls,
  lerp,
  lerpAngle,
  type MutableBall,
} from "./interpolate";

/**
 * Pure interpolation helpers (RND-02, 05-08): linear and shortest-arc lerps,
 * the id-mismatch rule for balls, and pooled output arrays.
 */

function ball(id: number, x: number, y: number, vx = 0, vy = 0): BallState {
  return { id, x, y, vx, vy, radius: 0.0135, angle: id * 0.5 };
}

describe("lerp", () => {
  it("returns a at t = 0 and b at t = 1", () => {
    expect(lerp(2, 7, 0)).toBe(2);
    expect(lerp(2, 7, 1)).toBe(7);
  });

  it("is linear in between", () => {
    expect(lerp(2, 7, 0.4)).toBeCloseTo(4, 12);
  });
});

describe("lerpAngle", () => {
  it("takes the shortest arc through PI, not the long way through 0", () => {
    const r = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.abs(r) - Math.PI)).toBeLessThan(1e-12);
  });

  it("takes the shortest arc the other way round as well", () => {
    const r = lerpAngle(-Math.PI + 0.1, Math.PI - 0.1, 0.5);
    expect(Math.abs(Math.abs(r) - Math.PI)).toBeLessThan(1e-12);
  });

  it("returns the angle itself for equal angles", () => {
    expect(lerpAngle(1.25, 1.25, 0)).toBe(1.25);
    expect(lerpAngle(1.25, 1.25, 0.7)).toBe(1.25);
  });

  it("matches a plain lerp for a small delta", () => {
    expect(lerpAngle(0.39, -0.39, 0.25)).toBeCloseTo(lerp(0.39, -0.39, 0.25), 12);
  });
});

describe("interpolateBalls", () => {
  it("lerps x, y, vx and vy at alpha for a ball with the same id in both snapshots", () => {
    const prev = [ball(1, 0, 0, 1, 2)];
    const cur = [ball(1, 1, 2, 3, 6)];
    const out: MutableBall[] = [];
    interpolateBalls(prev, cur, 0.25, out);
    expect(out).toHaveLength(1);
    const o = out[0];
    expect(o?.id).toBe(1);
    expect(o?.x).toBeCloseTo(0.25, 12);
    expect(o?.y).toBeCloseTo(0.5, 12);
    expect(o?.vx).toBeCloseTo(1.5, 12);
    expect(o?.vy).toBeCloseTo(3, 12);
    expect(o?.radius).toBe(cur[0]?.radius);
    expect(o?.angle).toBe(cur[0]?.angle);
  });

  it("copies the current state as-is when the ids at an index differ (no ghost streak)", () => {
    const prev = [ball(1, 0, 0)];
    const cur = [ball(2, 5, 5, 1, 1)];
    const out: MutableBall[] = [];
    interpolateBalls(prev, cur, 0.5, out);
    expect(out[0]).toEqual(cur[0]);
  });

  it("copies the current state for a ball the previous snapshot lacks", () => {
    const prev = [ball(1, 0, 0)];
    const cur = [ball(1, 1, 1), ball(2, 3, 3)];
    const out: MutableBall[] = [];
    interpolateBalls(prev, cur, 0.5, out);
    expect(out[1]).toEqual(cur[1]);
  });

  it("grows out only when the count grows, keeps its identity, and ends at the current count", () => {
    const out: MutableBall[] = [];
    interpolateBalls([], [ball(1, 0, 0), ball(2, 0, 0)], 0, out);
    expect(out).toHaveLength(2);
    const first = out[0];
    const second = out[1];

    // Same count: the pooled elements are reused, not reallocated.
    interpolateBalls([ball(1, 0, 0), ball(2, 0, 0)], [ball(1, 1, 1), ball(2, 2, 2)], 0.5, out);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(first);
    expect(out[1]).toBe(second);

    // Shrink: length follows the current count.
    interpolateBalls([ball(1, 0, 0)], [ball(1, 1, 1)], 0.5, out);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(first);

    // Grow again: the surviving element keeps its identity.
    interpolateBalls([], [ball(1, 0, 0), ball(2, 0, 0), ball(3, 0, 0)], 0, out);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(first);
  });
});

describe("interpolateAngles", () => {
  it("lerps index-paired angles at alpha", () => {
    const out: number[] = [];
    interpolateAngles([0, 2], [1, 1], 0.25, out);
    expect(out[0]).toBeCloseTo(0.25, 12);
    expect(out[1]).toBeCloseTo(1.75, 12);
  });

  it("takes the shortest arc per entry", () => {
    const out: number[] = [];
    interpolateAngles([Math.PI - 0.1], [-Math.PI + 0.1], 0.5, out);
    expect(Math.abs(Math.abs(out[0] ?? 0) - Math.PI)).toBeLessThan(1e-12);
  });

  it("uses the current angle for entries the previous snapshot lacks", () => {
    const out: number[] = [];
    interpolateAngles([0], [1, 2.5], 0.5, out);
    expect(out).toHaveLength(2);
    expect(out[1]).toBe(2.5);
  });

  it("keeps the out array's identity and ends at the current length", () => {
    const out: number[] = [9, 9, 9];
    const ref = out;
    interpolateAngles([0, 0], [1, 1], 0.5, out);
    expect(out).toBe(ref);
    expect(out).toHaveLength(2);
  });
});
