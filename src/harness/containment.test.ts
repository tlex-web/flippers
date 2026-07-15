import { describe, it, expect } from "vitest";

import {
  flipperSweptTunnel,
  sweptEscaped,
  sweptEscapedForBall,
} from "./containment";
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

describe("flipperSweptTunnel — intra-step swept-sector flipper check", () => {
  const PIVOT: Vec2 = { x: 0, y: 0 };
  const LENGTH = 1;
  const HALF_WIDTH = 0.05;
  const R = 0.2; // clearance = R + HALF_WIDTH = 0.25

  it("catches an intra-step tunnel that a POST-step-only centerline check MISSES", () => {
    // The bat rotates from angle 0 -> 0.6 rad during the step. A fast ball
    // passes straight down through x=0.5 where the bat WAS near the START of the
    // sweep (angle ~0) and the bat has rotated away by step end.
    const prev: Vec2 = { x: 0.5, y: -0.4 };
    const next: Vec2 = { x: 0.5, y: 0.4 };

    // POST-step centerline ONLY (preAngle == postAngle == 0.6): the chord grazes
    // the rotated-away bat and its endpoint is NOT clear, so a post-only check
    // does not flag it — the exact false-negative the review calls out.
    expect(
      flipperSweptTunnel(prev, next, R, PIVOT, LENGTH, HALF_WIDTH, 0.6, 0.6),
    ).toBe(false);

    // Sweeping the bat across [0, 0.6] catches the pass-through at the mid-sweep
    // angle where the ball actually crossed the bat, both endpoints clear.
    expect(
      flipperSweptTunnel(prev, next, R, PIVOT, LENGTH, HALF_WIDTH, 0, 0.6),
    ).toBe(true);
  });

  it("flags a clean perpendicular pass-through with both endpoints clear", () => {
    // Bat roughly horizontal; ball crosses vertically through x=0.5, ending well
    // clear on both sides — a genuine fast tunnel.
    const prev: Vec2 = { x: 0.5, y: -0.5 };
    const next: Vec2 = { x: 0.5, y: 0.5 };
    expect(
      flipperSweptTunnel(prev, next, R, PIVOT, LENGTH, HALF_WIDTH, -0.1, 0.1),
    ).toBe(true);
  });

  it("does NOT flag a graze that ends touching the bat (whack, not a tunnel)", () => {
    // The ball crosses the centerline but ENDS within clearance of the bat (as a
    // whacked/resting ball does), so it is not a clean pass-through.
    const prev: Vec2 = { x: 0.5, y: -0.4 };
    const next: Vec2 = { x: 0.5, y: 0.1 }; // ends 0.1 < 0.25 from the y=0 centerline
    expect(
      flipperSweptTunnel(prev, next, R, PIVOT, LENGTH, HALF_WIDTH, 0, 0),
    ).toBe(false);
  });

  it("does NOT flag a chord that never crosses the bat segment", () => {
    // Parallel to and clear of the bat — no crossing at any swept angle.
    const prev: Vec2 = { x: 0.2, y: 0.6 };
    const next: Vec2 = { x: 0.8, y: 0.6 };
    expect(
      flipperSweptTunnel(prev, next, R, PIVOT, LENGTH, HALF_WIDTH, -0.2, 0.2),
    ).toBe(false);
  });
});
