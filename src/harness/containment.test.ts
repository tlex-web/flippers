import { describe, it, expect } from "vitest";

import { sweptEscaped, sweptEscapedForBall } from "./containment";
import type { BallState, Segment, Vec2 } from "../physics/types";

/**
 * The swept containment invariant is the correctness core of the tunnel-proof
 * gate (D-04/D-05). It must trip when a ball's path between two 120 Hz steps
 * crosses a wall — INCLUDING the punch-out-and-re-enter case that a naive
 * per-step "is the center inside the box" check misses. These tests pin that
 * behavior with concrete coordinates against a Planck-independent wall set.
 */

function seg(ax: number, ay: number, bx: number, by: number): Segment {
  return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
}

// A 2 x 3 m box (outer boundary) plus one deliberately THIN interior wall at
// y = 2.0 spanning x in [0.2, 0.8] — the same shape the Planck adapter builds.
const OUTER: Segment[] = [
  seg(0, 0, 2, 0),
  seg(2, 0, 2, 3),
  seg(2, 3, 0, 3),
  seg(0, 3, 0, 0),
];
const THIN = seg(0.2, 2.0, 0.8, 2.0);
const WALLS: readonly Segment[] = [...OUTER, THIN];

const RADIUS = 0.2;

/** Naive "is the center inside the box AABB" check — the INSUFFICIENT one. */
function naiveCenterInside(p: Vec2): boolean {
  return p.x >= 0 && p.x <= 2 && p.y >= 0 && p.y <= 3;
}

describe("sweptEscaped — swept containment invariant", () => {
  it("returns false for a contained path clear of every wall", () => {
    const prev = { x: 1.0, y: 1.0 };
    const next = { x: 1.2, y: 1.2 };
    expect(sweptEscaped(prev, next, RADIUS, WALLS)).toBe(false);
  });

  it("catches a straight path that tunnels through a thin interior wall between two inside endpoints", () => {
    // Both endpoints are comfortably inside the box, so the naive center check
    // says "contained" for both — yet the path crosses the thin wall at y=2.0.
    const prev = { x: 0.5, y: 1.7 };
    const next = { x: 0.5, y: 2.3 };
    expect(naiveCenterInside(prev)).toBe(true);
    expect(naiveCenterInside(next)).toBe(true);
    // The swept invariant must still flag the tunnel-through.
    expect(sweptEscaped(prev, next, RADIUS, WALLS)).toBe(true);
  });

  it("catches a disk that pokes through the outer boundary even though it returns inside (both centers inside)", () => {
    // Centers stay inside the AABB (x = 0.1 >= 0), so naive center-in-box
    // passes on both endpoints — but the radius-inflated path crosses x = 0.
    const prev = { x: 0.1, y: 1.4 };
    const next = { x: 0.1, y: 1.6 };
    expect(naiveCenterInside(prev)).toBe(true);
    expect(naiveCenterInside(next)).toBe(true);
    expect(sweptEscaped(prev, next, RADIUS, WALLS)).toBe(true);
  });

  it("flags a path whose center leaves the play region entirely (far from any wall segment)", () => {
    // Below-left of the box, farther than `radius` from every wall segment, so
    // only the endpoint-outside-region net can catch it.
    const prev = { x: -0.5, y: -0.5 };
    const next = { x: -0.4, y: -0.4 };
    expect(sweptEscaped(prev, next, RADIUS, WALLS)).toBe(true);
  });

  it("treats grazing contact at exactly `radius` as containment (EXCLUSIVE boundary — documented)", () => {
    // The path runs parallel to the left wall at a center distance of exactly
    // RADIUS (= 0.2). By the documented exclusive rule (escape iff distance is
    // STRICTLY less than radius), a tangent graze is contact, not escape.
    const prev = { x: 0.2, y: 1.4 };
    const next = { x: 0.2, y: 1.6 };
    expect(sweptEscaped(prev, next, RADIUS, WALLS)).toBe(false);
  });

  it("sweptEscapedForBall consumes BallState prev/next and reuses each ball's own radius", () => {
    const prev: BallState = {
      id: 0,
      x: 0.5,
      y: 1.7,
      vx: 0,
      vy: 12,
      radius: RADIUS,
      angle: 0,
    };
    const next: BallState = { ...prev, y: 2.3 };
    expect(sweptEscapedForBall(prev, next, WALLS)).toBe(true);
  });
});
