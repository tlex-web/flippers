/**
 * Pure render-interpolation helpers (RND-02, 05-08). No DOM, no engine.
 *
 * The fixed-step loop keeps a previous/current snapshot pair and an `alpha` in
 * [0, 1) (Gaffer "Fix Your Timestep"); these helpers turn that pair into the
 * state drawn this frame, so balls AND bats move on every render frame at any
 * refresh rate instead of stepping at the 120 Hz physics rate.
 *
 * Allocation rule: nothing is allocated per call except pooled growth of an
 * `out` array when the entity count grows; `out` keeps its identity.
 */

import type { BallState } from "../physics/types";

/** A writable ball state, the pooled element type of `interpolateBalls`' output. */
export type MutableBall = { -readonly [K in keyof BallState]: BallState[K] };

/** Linear interpolation: `a` at t = 0, `b` at t = 1. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Shortest-arc angle interpolation (rad). The delta is wrapped into [-PI, PI]
 * so a pair that straddles the +/-PI seam lerps through PI, not the long way
 * round through 0.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

/**
 * Interpolate balls between two index-paired snapshots into the pooled `out`.
 *
 * A ball whose id matches the previous ball at the same index is lerped in x, y,
 * vx and vy at `alpha`; otherwise (a respawn or swap-remove broke the pairing)
 * the current state is copied as-is, so no ghost streak is drawn between two
 * different balls. `radius` and `angle` always come from the current state.
 * `out` grows only when the count grows and its length ends equal to `cur`'s.
 */
export function interpolateBalls(
  prev: readonly BallState[],
  cur: readonly BallState[],
  alpha: number,
  out: MutableBall[],
): void {
  while (out.length < cur.length) {
    out.push({ id: 0, x: 0, y: 0, vx: 0, vy: 0, radius: 0, angle: 0 });
  }
  out.length = cur.length;
  for (let i = 0; i < cur.length; i++) {
    const c = cur[i];
    const o = out[i];
    if (!c || !o) continue;
    const pv = prev[i];
    const p = pv && pv.id === c.id ? pv : c;
    o.id = c.id;
    o.x = lerp(p.x, c.x, alpha);
    o.y = lerp(p.y, c.y, alpha);
    o.vx = lerp(p.vx, c.vx, alpha);
    o.vy = lerp(p.vy, c.vy, alpha);
    o.radius = c.radius;
    o.angle = c.angle;
  }
}

/**
 * Index-paired shortest-arc interpolation of angles into the pooled `out`.
 * Entries `prev` lacks take the current angle. `out`'s length ends equal to
 * `cur`'s and it keeps its identity.
 */
export function interpolateAngles(
  prev: readonly number[],
  cur: readonly number[],
  alpha: number,
  out: number[],
): void {
  for (let i = 0; i < cur.length; i++) {
    const c = cur[i] ?? 0;
    const p = prev[i];
    out[i] = p === undefined ? c : lerpAngle(p, c, alpha);
  }
  out.length = cur.length;
}
