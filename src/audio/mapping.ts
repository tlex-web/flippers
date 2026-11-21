/**
 * Velocity and pitch mapping (Phase 5, AUD-01, research Pattern 7).
 *
 * Pure functions, no DOM, no Web Audio: they turn a cue's strength in [0, 1]
 * into a gain multiplier and a pitch offset, so every voice answers harder hits
 * louder and slightly higher, and no two hits sound identical.
 *
 * Perceptual intent:
 * - loudness follows a decibel curve, not a linear one: strength 0 sits at
 *   `GAIN_FLOOR_DB` (-18 dB, still clearly audible) and strength 1 at 0 dB, so a
 *   soft graze is quieter without vanishing;
 * - harder hits rise up to `maxSt` semitones above the voice's base pitch;
 * - every hit is detuned by a bounded random jitter of plus or minus
 *   `jitterCents`, drawn from an injected `rng` (`Math.random` in production, a
 *   seeded `mulberry32` in tests). It is never a sim PRNG stream, so audio can
 *   never perturb the deterministic replay (research Finding 4).
 */

import { clamp01 } from "../app/cue-queue";

/** Gain at strength 0, in dB relative to the voice's peak. */
export const GAIN_FLOOR_DB = -18;

/**
 * Linear gain multiplier for a strength: 10^(floorDb * (1 - s) / 20) with s
 * clamped to [0, 1] (NaN and negatives give the floor, anything above 1 gives 1).
 */
export function strengthToGain(s: number, floorDb: number = GAIN_FLOOR_DB): number {
  return Math.pow(10, (floorDb * (1 - clamp01(s))) / 20);
}

/**
 * Pitch offset in semitones: clamp01(s) * maxSt plus a uniform jitter in
 * [-jitterCents, +jitterCents) cents. Consumes exactly one `rng()` draw.
 */
export function playbackSemitones(
  s: number,
  rng: () => number,
  maxSt: number,
  jitterCents: number,
): number {
  return clamp01(s) * maxSt + ((rng() * 2 - 1) * jitterCents) / 100;
}

/** Frequency ratio for a semitone offset: 2^(st / 12). */
export function semitoneRatio(st: number): number {
  return Math.pow(2, st / 12);
}

/** Linear gain for a level in dB: 10^(db / 20). */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
