/**
 * Engine-agnostic plunger controller (D-07/D-08/D-10). It imports NO physics
 * engine — only the `PhysicsWorld` interface, and only as a TYPE — and launches
 * the ball SOLELY through the generic `applyImpulse(ballId, ix, iy)` hook (D-09).
 *
 * Model (our design, D-07): impulse-on-release. While the launch key is held the
 * controller accumulates a scalar charge once per fixed 120 Hz step
 * (`PLUNGER_CHARGE_RATE · FIXED_DT`, clamped at `PLUNGER_MAX_CHARGE`). On release
 * it applies ONE impulse along `PLUNGER_AXIS` whose magnitude maps the charge
 * linearly onto [PLUNGER_MIN_IMPULSE, PLUNGER_MAX_IMPULSE], but only when the
 * named ball is resting inside the plunger zone. There is no spring body and no
 * moving plunger body.
 *
 * Observable FSM: `idle -> charging -> idle`, driven by edges drained from the
 * keyboard latch at the top of each fixed step (`onPressEdge` /
 * `onReleaseEdge` / `onCancelEdge`) and advanced by `update()` once per step.
 * Release and cancel always return to idle with charge 0; cancel (focus loss)
 * never launches.
 *
 * Determinism (threat T-03-11): the charge depends only on the number of
 * `update()` calls while charging. No wall-clock, no global RNG, no jitter, so
 * the same edge script always yields the identical impulse.
 *
 * Meter honesty (D-10): `getCharge()` is the SAME normalized value the release
 * impulse is computed from, so the meter can never show a different power from
 * the one the launch uses.
 *
 * Zero per-frame allocation: the ball lookup loops the pooled `getBalls()`
 * snapshot in place.
 */

import {
  FIXED_DT,
  PLUNGER_AXIS,
  PLUNGER_CHARGE_RATE,
  PLUNGER_MAX_CHARGE,
  PLUNGER_MAX_IMPULSE,
  PLUNGER_MIN_IMPULSE,
} from "../physics/constants";
import type { BallId, PhysicsWorld } from "../physics/types";
import { PLUNGER_ZONE } from "../table/spec";

/** The slice of `PhysicsWorld` the plunger reads and drives. */
export type PlungerWorld = Pick<PhysicsWorld, "applyImpulse" | "getBalls">;

/** The two observable plunger states. */
export type PlungerPhase = "idle" | "charging";

/** Axis-aligned region a ball must be inside for a release to launch it. */
export interface PlungerZone {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export class PlungerController {
  private readonly world: PlungerWorld;
  private readonly zone: PlungerZone;
  private phase: PlungerPhase = "idle";
  /** Fixed steps spent charging since the press (an integer, never drifts). */
  private heldSteps = 0;
  /** Raw charge in [0, PLUNGER_MAX_CHARGE]. */
  private charge = 0;

  constructor(world: PlungerWorld, zone: PlungerZone = PLUNGER_ZONE) {
    this.world = world;
    this.zone = zone;
  }

  /** Launch key went down: start charging from 0. Ignored while already charging. */
  onPressEdge(): void {
    if (this.phase !== "idle") return;
    this.phase = "charging";
    this.heldSteps = 0;
    this.charge = 0;
  }

  /**
   * Launch key went up. Only while charging: if `ballId` is a live ball whose
   * center lies inside the zone, apply one impulse along `PLUNGER_AXIS` scaled by
   * the current charge. Always returns to idle with charge 0.
   */
  onReleaseEdge(ballId: BallId): void {
    if (this.phase !== "charging") return;
    if (this.ballInZone(ballId)) {
      const mag =
        PLUNGER_MIN_IMPULSE + (PLUNGER_MAX_IMPULSE - PLUNGER_MIN_IMPULSE) * this.getCharge();
      this.world.applyImpulse(ballId, PLUNGER_AXIS.x * mag, PLUNGER_AXIS.y * mag);
    }
    this.reset();
  }

  /** Focus lost mid-hold: drop the charge and launch nothing. */
  onCancelEdge(): void {
    this.reset();
  }

  /**
   * Advance one fixed step: while charging, raise the charge up to the cap. The
   * charge is the integer step count times `PLUNGER_CHARGE_RATE * FIXED_DT`, not
   * a running float sum: 80 additions of 0.0125 land at 0.9999999999999984, so a
   * running sum would miss the cap at its nominal step and the meter would read
   * just under full for one extra step.
   */
  update(): void {
    if (this.phase !== "charging") return;
    if (this.charge >= PLUNGER_MAX_CHARGE) return;
    this.heldSteps++;
    this.charge = Math.min(this.heldSteps * PLUNGER_CHARGE_RATE * FIXED_DT, PLUNGER_MAX_CHARGE);
  }

  /** Normalized charge in [0, 1]: the meter value AND the launch power. */
  getCharge(): number {
    return this.charge / PLUNGER_MAX_CHARGE;
  }

  /** Observable phase (read-only, for the renderer and tests). */
  getPhase(): PlungerPhase {
    return this.phase;
  }

  private reset(): void {
    this.phase = "idle";
    this.heldSteps = 0;
    this.charge = 0;
  }

  private ballInZone(ballId: BallId): boolean {
    const balls = this.world.getBalls();
    const z = this.zone;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b || b.id !== ballId) continue;
      return b.x >= z.minX && b.x <= z.maxX && b.y >= z.minY && b.y <= z.maxY;
    }
    return false;
  }
}
