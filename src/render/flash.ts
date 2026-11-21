/**
 * Element flashes on the fixed-step clock (RND-03, research Pattern 4).
 *
 * A registered hit records a flash: `record(id, strength)` stamps the step the
 * flash is first seen on and the peak strength into two typed arrays indexed by
 * element id. The clock advances once per fixed step (`tick()`, the last call
 * of `onPostStep`), and the renderer reads `level(id, alpha, timing)` at
 * `step + alpha`, so a flash pauses with the simulation on tab blur and never
 * reads a wall clock.
 *
 * A hit recorded during step N's `onPostStep` is stamped N + 1: the clock has
 * ticked to N + 1 before any render, so the first frame reads age `alpha`, not
 * `1 + alpha`, and a flash is drawn at its peak and keeps its whole hold (a read
 * before that tick clamps to age 0).
 *
 * Decay law (`flashLevel`): full brightness through the hold, then
 * `exp(-(age - hold) / decay)`, cut to exactly 0 at `hold + FLASH_CUTOFF_TAUS *
 * decay` so nothing lingers at an invisible level. A re-hit restarts the flash
 * at its own strength.
 *
 * Allocation-free after construction; DOM-free and engine-free. Timings are
 * cosmetic (A1) and tuned by eye at UAT, here only.
 */

import { clamp01, type FlashSink } from "../app/cue-queue";
import type { ResolvedElement } from "../table/resolve";
import type { ElementKind } from "../table/spec";

/** How long a flash holds at full level, then how fast it decays (fixed steps). */
export interface FlashTiming {
  readonly holdSteps: number;
  readonly decaySteps: number;
}

/** Pop bumper kick: holds 2 steps, decays with tau 10 (visible about 0.35 s). */
export const FLASH_BUMPER: FlashTiming = Object.freeze({ holdSteps: 2, decaySteps: 10 });
/** Slingshot kick: a shorter, snappier flash. */
export const FLASH_SLING: FlashTiming = Object.freeze({ holdSteps: 1, decaySteps: 7 });
/** Rollover or inlane pass. */
export const FLASH_SENSOR: FlashTiming = Object.freeze({ holdSteps: 0, decaySteps: 14 });
/** Passive contact (wall, chute, flipper): a brief tick. */
export const FLASH_CONTACT: FlashTiming = Object.freeze({ holdSteps: 0, decaySteps: 5 });
/** Drain apron (recorded by the 05-05 observer). */
export const FLASH_DRAIN: FlashTiming = Object.freeze({ holdSteps: 0, decaySteps: 20 });

/** Flash timing per element kind. */
export const FLASH_TIMING: Readonly<Record<ElementKind, FlashTiming>> = Object.freeze({
  bumper: FLASH_BUMPER,
  slingshot: FLASH_SLING,
  rollover: FLASH_SENSOR,
  lane: FLASH_SENSOR,
  drain: FLASH_DRAIN,
  wall: FLASH_CONTACT,
  chute: FLASH_CONTACT,
  flipper: FLASH_CONTACT,
});

/** A flash is cut to 0 this many decay constants after its hold (about e^-4). */
export const FLASH_CUTOFF_TAUS = 4;

/** Levels at or below this are not drawn. */
export const FLASH_EPS = 0.01;

/** Peak strength of a passive-contact flash (walls, chute, flippers). */
export const CONTACT_FLASH_PEAK = 0.35;

/**
 * Flash level in [0, 1] at `ageSteps` after the hit. 0 for a non-finite or
 * negative age (never hit, NaN), 1 through the hold, exponential decay after
 * it, and exactly 0 from the hard cutoff on.
 */
export function flashLevel(ageSteps: number, decaySteps: number, holdSteps: number): number {
  if (!Number.isFinite(ageSteps) || ageSteps < 0) return 0;
  if (ageSteps <= holdSteps) return 1;
  if (!(decaySteps > 0)) return 0;
  const t = ageSteps - holdSteps;
  if (t >= FLASH_CUTOFF_TAUS * decaySteps) return 0;
  return Math.exp(-t / decaySteps);
}

/** The largest element id in `elements` (0 when empty). */
export function maxElementId(elements: readonly ResolvedElement[]): number {
  let max = 0;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el && el.id > max) max = el.id;
  }
  return max;
}

/** Per-element flash state on the fixed-step clock. */
export class FlashTracker implements FlashSink {
  private readonly hitAt: Float64Array;
  private readonly peak: Float64Array;
  private readonly maxId: number;
  private stepCount = 0;

  /** Sized once for ids 0..maxId; nothing is allocated afterwards. */
  constructor(maxId: number) {
    const m = Number.isFinite(maxId) && maxId > 0 ? Math.floor(maxId) : 0;
    this.maxId = m;
    this.hitAt = new Float64Array(m + 1).fill(-Infinity);
    this.peak = new Float64Array(m + 1);
  }

  /**
   * Start (or restart) the flash of element `id` at `strength`, clamped to
   * [0, 1]. Negative, out-of-range, non-integer and NaN ids are ignored.
   */
  record(id: number, strength: number): void {
    if (!Number.isInteger(id) || id < 0 || id > this.maxId) return;
    this.hitAt[id] = this.stepCount + 1;
    this.peak[id] = clamp01(strength);
  }

  /** Advance the clock one fixed step (the last call of `onPostStep`). */
  tick(): void {
    this.stepCount++;
  }

  /**
   * Level of element `id` at the render point `step + alpha`, scaled by the
   * strength it was hit with. 0 for an id never hit or out of range.
   */
  level(id: number, alpha: number, timing: FlashTiming): number {
    if (!Number.isInteger(id) || id < 0 || id > this.maxId) return 0;
    const hit = this.hitAt[id] ?? -Infinity;
    if (hit === -Infinity) return 0;
    const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
    const p = this.peak[id] ?? 0;
    const age = this.stepCount + a - hit;
    return p * flashLevel(age > 0 ? age : 0, timing.decaySteps, timing.holdSteps);
  }

  /** Fixed steps ticked so far. */
  get step(): number {
    return this.stepCount;
  }
}
