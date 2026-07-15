/**
 * Engine-agnostic physics contract for Space Cadet Pinball.
 *
 * This is THE interface the whole phase and every downstream phase (2-6) build
 * on. The physics engine (Planck.js today — D-01) is reachable ONLY through this
 * surface; nothing outside `src/physics/planck-world.ts` may import `planck`.
 * Keeping the contract engine-agnostic is what makes the engine decision
 * empirical and reversible (D-05): the same harness/proof runs unchanged against
 * Planck's `setBullet` CCD or a future custom swept solver.
 *
 * Everything is N-ball-ready (id-keyed collections, never a single hard-coded
 * ball) so deferred multiball is additive, not a rewrite (carry-forward).
 * All quantities are SI: meters, meters/second, radians.
 */

/** A plain 2D value (meters). Not a Planck `Vec2`; deliberately engine-free. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A boundary/wall line segment (meters), for debug-draw and containment. */
export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
}

/** Stable identity for a ball across frames (N-ball-ready). */
export type BallId = number;

/** Parameters to introduce a new ball through the interface. */
export interface BallSpec {
  /** Initial center position (meters). */
  readonly x: number;
  readonly y: number;
  /** Initial linear velocity (m/s). Defaults to 0. */
  readonly vx?: number;
  readonly vy?: number;
  /** Radius (meters). Defaults to the reference-anchored `BALL_RADIUS_M`. */
  readonly radius?: number;
}

/**
 * A read-only snapshot of one ball. Instances are read out of a pooled array
 * that `step()` mutates in place — treat every field as read-only and copy out
 * anything you need to retain past the next `step()`.
 */
export interface BallState {
  readonly id: BallId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly radius: number;
  readonly angle: number;
}

/**
 * A read-only snapshot of one flipper. No real flippers exist yet (Phase 2); the
 * accessor returns an empty pooled array today, but the shape is fixed now so
 * downstream wiring is additive.
 */
export interface FlipperState {
  readonly id: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly angle: number;
  readonly length: number;
  readonly halfWidth: number;
  /**
   * Rounded-tip radius (meters) — the D-08 addition for the Phase-2 capsule bat.
   * The bat is a "stadium": a rectangular core of half-thickness `halfWidth`
   * capped by a circle of this radius at the tip (and hinge). For the symmetric
   * capsule `tipRadius === halfWidth`; the renderer reads it to draw the rounded
   * end instead of a bare rectangle. Kept engine-agnostic so a future tapered
   * variant only has to split `halfWidth` — this field stays meaningful.
   */
  readonly tipRadius: number;
}

/** Kind of contact that produced a collision event. */
export type CollisionEventType = "ball-wall" | "ball-ball" | "ball-flipper";

/**
 * A one-way collision notification. Events are produced by `step()` and read out
 * via `drainEvents()` — they are drained, never pushed back into the engine.
 */
export interface CollisionEvent {
  readonly type: CollisionEventType;
  readonly aId: number;
  readonly bId: number;
  /** World contact point (meters). */
  readonly point: Vec2;
  /** Solver normal impulse magnitude (kg·m/s) — proxy for hit strength. */
  readonly normalImpulse: number;
}

/**
 * The engine-agnostic physics world. The renderer/game read state through the
 * accessors below; the fixed-step loop (`src/sim/loop.ts`) is the only thing
 * that calls `step()`.
 *
 * The accessors return references into pre-allocated pooled arrays/objects that
 * `step()` mutates — there is NO per-frame allocation on the read path. Do not
 * hold these references across a `step()`; copy out what you need.
 */
export interface PhysicsWorld {
  /** Advance the simulation by exactly `dtSeconds` (a fixed step). */
  step(dtSeconds: number): void;
  /** Introduce a ball; returns its stable id (N-ball-ready). */
  addBall(spec: BallSpec): BallId;
  /**
   * Remove a ball by its id (no-op for an unknown id). Frees the engine body and
   * its pooled snapshot so a throwaway feed can recycle a single ball on drain
   * without leaking bodies (N-ball-ready: removing one leaves the rest intact).
   */
  removeBall(id: BallId): void;
  /** Pooled, id-keyed snapshot of every live ball. */
  getBalls(): readonly BallState[];
  /** Pooled snapshot of every flipper (a max-speed test flipper this phase). */
  getFlippers(): readonly FlipperState[];
  /**
   * Drive a flipper's motor (engine-agnostic hook, D-04/D-05). `direction > 0`
   * RAISES the flipper toward its up/held-up cradle limit; `direction < 0`
   * RETURNS it toward its rest/down limit; `0` holds. Only the SIGN is read: the
   * adapter maps it to the feel-tuned raise/return speeds AND applies each
   * flipper's engine-specific physical raise sign, so +1 raises BOTH the left bat
   * and the reference-angle-mirrored right bat (which counter-rotate and so need
   * opposite motor signs). No-op for an unknown id.
   */
  setFlipperMotor(id: number, direction: number): void;
  /** Static boundary/wall segments (built once; for debug-draw + containment). */
  getBoundarySegments(): readonly Segment[];
  /** Drain collision events accumulated since the last drain. */
  drainEvents(): CollisionEvent[];
  /** Pooled snapshot of active contact points this step (for debug-draw). */
  getContactPoints(): readonly Vec2[];
}
