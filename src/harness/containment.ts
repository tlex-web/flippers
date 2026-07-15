/**
 * Swept containment invariant — the correctness core of the tunnel-proof gate
 * (D-04/D-05).
 *
 * The ball moves in a straight line from its previous 120 Hz center to its next
 * one. A naive per-step check ("is the center inside the box at step end?") is
 * PROVABLY INSUFFICIENT: a ball can punch through a thin interior wall and end
 * the step back inside, or its disk can bulge through the outer boundary and
 * return, and the endpoint centers still read as "inside". This invariant
 * instead tests the SWEPT DISK — the radius-inflated segment prev -> next — for
 * a crossing of any wall over the whole interval, so out-and-back tunneling
 * still trips failure.
 *
 * It is engine-agnostic: it consumes only the ball/flipper/event interface
 * types (`BallState`, `Segment`, `Vec2`) and the world's `getBoundarySegments()`
 * — NOTHING from Planck. The identical proof therefore runs unchanged against
 * Planck's `setBullet` CCD or any future custom swept solver.
 *
 * Reference (behavior only): Erin Catto, "Continuous Collision" (GDC 2013) —
 * swept-TOI / containment reasoning.
 */

import type { BallState, PhysicsWorld, Segment, Vec2 } from "../physics/types";

/** Axis-aligned bounds of a set of wall segments. */
interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function boundsOf(walls: readonly Segment[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, maxX, minY, maxY };
}

/** Signed twice-area of triangle (a, b, c); >0 = ccw, <0 = cw, 0 = collinear. */
function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Is collinear point `c` within the bounding box of segment a-b? */
function onSegment(a: Vec2, b: Vec2, c: Vec2): boolean {
  return (
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y)
  );
}

/** Do segments p1-p2 and q1-q2 intersect (proper crossing or collinear touch)? */
export function segmentsIntersect(
  p1: Vec2,
  p2: Vec2,
  q1: Vec2,
  q2: Vec2,
): boolean {
  const d1 = orient(q1, q2, p1);
  const d2 = orient(q1, q2, p2);
  const d3 = orient(p1, p2, q1);
  const d4 = orient(p1, p2, q2);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  if (d1 === 0 && onSegment(q1, q2, p1)) return true;
  if (d2 === 0 && onSegment(q1, q2, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, q1)) return true;
  if (d4 === 0 && onSegment(p1, p2, q2)) return true;
  return false;
}

/** Shortest distance from point `p` to segment a-b. */
function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest distance between segment p1-p2 and segment q1-q2 (0 if crossing). */
function segmentSegmentDistance(
  p1: Vec2,
  p2: Vec2,
  q1: Vec2,
  q2: Vec2,
): number {
  if (segmentsIntersect(p1, p2, q1, q2)) return 0;
  return Math.min(
    pointSegmentDistance(p1, q1, q2),
    pointSegmentDistance(p2, q1, q2),
    pointSegmentDistance(q1, p1, p2),
    pointSegmentDistance(q2, p1, p2),
  );
}

function outsideBounds(p: Vec2, b: Bounds): boolean {
  return p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY;
}

/**
 * Did the ball's swept disk cross a wall over one fixed step?
 *
 * The ball's motion this step is the segment `prevCenter -> nextCenter`; the
 * disk of `radius` sweeps a capsule around it (Minkowski sum). This returns
 * `true` when the ball escapes/tunnels, i.e. when EITHER:
 *   1. an endpoint center leaves the play region (the AABB of `walls`) — the
 *      coarse net for a ball that ends up outside, or
 *   2. the swept path passes STRICTLY within `radius` of any wall segment —
 *      the disk overlaps a barrier, which catches both a straight tunnel
 *      through a thin interior wall between two inside endpoints AND a disk
 *      that bulges through the outer boundary and returns.
 *
 * Boundary rule (documented + tested): the radius comparison is EXCLUSIVE, so a
 * graze at exactly `radius` counts as contact (contained), not escape — a
 * resting ball touching a wall at distance `radius` does not trip the invariant.
 */
export function sweptEscaped(
  prevCenter: Vec2,
  nextCenter: Vec2,
  radius: number,
  walls: readonly Segment[],
): boolean {
  const bounds = boundsOf(walls);
  if (outsideBounds(prevCenter, bounds) || outsideBounds(nextCenter, bounds)) {
    return true;
  }
  for (const w of walls) {
    if (segmentSegmentDistance(prevCenter, nextCenter, w.a, w.b) < radius) {
      return true;
    }
  }
  return false;
}

/**
 * Did the ball's swept path tunnel THROUGH the flipper bat during one fixed step?
 *
 * The bat is a thin segment from `pivot` to its tip; its angle sweeps from
 * `preAngle` (step start) to `postAngle` (step end), so a fast bat covers a whole
 * angular SECTOR in a single 120 Hz step (here up to ~19°, the tip moving ~0.17 m).
 * A naive check that only tests the ball chord against the POST-step centerline
 * MISSES a ball that crosses where the bat WAS mid-sweep but the bat has rotated
 * away by step end — the exact intra-step false-negative on the make-or-break
 * dynamic-flipper tunnel case (D-03/D-04).
 *
 * This sub-samples the bat centerline across the whole swept sector `[preAngle,
 * postAngle]` (so the tip advances well under a ball radius between samples) and
 * reports a tunnel iff, at SOME sampled angle, the ball chord `prev -> next`
 * crosses the bat segment while BOTH endpoints are clear (> `radius + tipRadius`)
 * of it — i.e. the ball entered clear on one side and exited clear on the other,
 * a genuine pass-through. Requiring BOTH ends clear is what gives it teeth
 * without false greens on the CCD-on run: the stress bat WHACKING a ball leaves
 * an endpoint touching/overlapping (never clear on both sides), and a normal
 * bounce reflects to the SAME side (no crossing) — neither trips.
 *
 * `tipRadius` (D-08) is the capsule bat's fat half-thickness at the swept tip: the
 * clearance band `radius + tipRadius` reflects the rounded-tip stadium the ball
 * must clear on BOTH sides to count as a genuine pass-through, rather than a
 * razor-thin segment. (This is a SAME-ARITY rename of the former `halfWidth`
 * positional param — for the symmetric capsule `tipRadius === halfWidth`, so
 * existing thin-segment callers passing their half-width in this slot are
 * unchanged; only the semantics widen to the capsule tip.)
 *
 * Engine-agnostic: consumes only interface scalars (pivot/length/tip-radius and
 * the pre/post angles read off `getFlippers()`), never anything from Planck.
 */
export function flipperSweptTunnel(
  prevCenter: Vec2,
  nextCenter: Vec2,
  radius: number,
  pivot: Vec2,
  length: number,
  tipRadius: number,
  preAngle: number,
  postAngle: number,
): boolean {
  const clearance = radius + tipRadius;
  const tipTravel = Math.abs(postAngle - preAngle) * length;
  // Tip travel (m) allowed between consecutive bat samples — a quarter of the
  // ball radius keeps the sweep finely covered so no crossing angle is skipped.
  const sampleRes = radius * 0.25;
  const subSteps = Math.max(1, Math.ceil(tipTravel / sampleRes));
  for (let s = 0; s <= subSteps; s++) {
    const t = s / subSteps;
    const angle = preAngle + (postAngle - preAngle) * t;
    const tip: Vec2 = {
      x: pivot.x + Math.cos(angle) * length,
      y: pivot.y + Math.sin(angle) * length,
    };
    if (!segmentsIntersect(prevCenter, nextCenter, pivot, tip)) continue;
    if (
      pointSegmentDistance(prevCenter, pivot, tip) > clearance &&
      pointSegmentDistance(nextCenter, pivot, tip) > clearance
    ) {
      return true;
    }
  }
  return false;
}

/**
 * `sweptEscaped` adapter over the interface's `BallState` snapshots: takes the
 * previous- and next-step ball states and uses the ball's own `radius`. This is
 * the shape the soak gate calls each step (D-05: reads the interface, not the
 * engine).
 */
export function sweptEscapedForBall(
  prev: BallState,
  next: BallState,
  walls: readonly Segment[],
): boolean {
  return sweptEscaped(
    { x: prev.x, y: prev.y },
    { x: next.x, y: next.y },
    next.radius,
    walls,
  );
}

/**
 * Enumerate the world's wall segments through the engine-agnostic interface, so
 * the containment check consumes boundary geometry the same way for any engine.
 */
export function wallSegmentsFrom(world: PhysicsWorld): readonly Segment[] {
  return world.getBoundarySegments();
}
