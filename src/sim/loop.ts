/**
 * Fixed-timestep accumulator loop ("Fix Your Timestep") — decouples the physics
 * rate (120 Hz) from the render rate (60 fps). It advances a `PhysicsWorld` by
 * whole `FIXED_DT` steps and keeps a previous/current snapshot pair plus an
 * `alpha` in [0,1) so the renderer can interpolate between the last two physics
 * states for smooth motion. It imports NO engine — only the interface — so it is
 * engine-agnostic (D-05).
 *
 * Availability guard (threat T-01-02): on tab-blur the browser can hand us an
 * arbitrarily huge real delta; `advance()` clamps it to `MAX_FRAME_MS` so a
 * stalled frame produces a bounded catch-up burst instead of a spiral of death.
 */

import { FIXED_DT, MAX_FRAME_MS } from "../physics/constants";
import type { BallState, PhysicsWorld } from "../physics/types";

const FIXED_DT_MS = FIXED_DT * 1000;

/** Internal, mutable snapshot (exposed read-only as BallState). */
interface BallSnapshot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
}

export class FixedStepLoop {
  private readonly world: PhysicsWorld;

  private accumulator = 0;
  private totalStepsRun = 0;
  private alphaValue = 0;

  // Interpolation snapshot pair — pooled, mutated in place (no per-frame alloc).
  private readonly previousStates: BallSnapshot[] = [];
  private readonly currentStates: BallSnapshot[] = [];

  constructor(world: PhysicsWorld) {
    this.world = world;
    // Seed both snapshots with the pre-step state so interpolation is valid
    // before the first `advance()`.
    this.snapshotInto(this.currentStates);
    this.copyStates(this.currentStates, this.previousStates);
  }

  /**
   * Feed real elapsed time (ms). Runs a whole number of fixed 120 Hz steps,
   * drains the accumulator (leftover < FIXED_DT), and updates the interpolation
   * `alpha`. Returns the number of fixed steps taken this call.
   */
  advance(realDeltaMs: number): number {
    // Spiral-of-death clamp (T-01-02): bound the per-call catch-up work.
    const clamped = Math.min(realDeltaMs, MAX_FRAME_MS);
    this.accumulator += clamped;

    let steps = 0;
    while (this.accumulator >= FIXED_DT_MS) {
      // previous <- current (state before this step), then integrate.
      this.copyStates(this.currentStates, this.previousStates);
      this.world.step(FIXED_DT);
      this.snapshotInto(this.currentStates);
      this.accumulator -= FIXED_DT_MS;
      steps++;
    }

    this.totalStepsRun += steps;
    this.alphaValue = this.accumulator / FIXED_DT_MS;
    return steps;
  }

  /** State from BEFORE the last fixed step (for render interpolation). */
  get previous(): readonly BallState[] {
    return this.previousStates;
  }

  /** State from AFTER the last fixed step (for render interpolation). */
  get current(): readonly BallState[] {
    return this.currentStates;
  }

  /** Interpolation factor in [0,1): leftover accumulator / fixed step. */
  get alpha(): number {
    return this.alphaValue;
  }

  /** Total fixed steps taken over the loop's lifetime. */
  get totalSteps(): number {
    return this.totalStepsRun;
  }

  /** Undrained real time (ms) waiting for the next fixed step. */
  get accumulatorMs(): number {
    return this.accumulator;
  }

  private snapshotInto(target: BallSnapshot[]): void {
    const balls = this.world.getBalls();
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b) continue;
      const t = target[i];
      if (t) {
        t.id = b.id;
        t.x = b.x;
        t.y = b.y;
        t.vx = b.vx;
        t.vy = b.vy;
        t.radius = b.radius;
        t.angle = b.angle;
      } else {
        target.push({
          id: b.id,
          x: b.x,
          y: b.y,
          vx: b.vx,
          vy: b.vy,
          radius: b.radius,
          angle: b.angle,
        });
      }
    }
    target.length = balls.length;
  }

  private copyStates(src: BallSnapshot[], dst: BallSnapshot[]): void {
    for (let i = 0; i < src.length; i++) {
      const s = src[i];
      if (!s) continue;
      const d = dst[i];
      if (d) {
        d.id = s.id;
        d.x = s.x;
        d.y = s.y;
        d.vx = s.vx;
        d.vy = s.vy;
        d.radius = s.radius;
        d.angle = s.angle;
      } else {
        dst.push({ ...s });
      }
    }
    dst.length = src.length;
  }
}
