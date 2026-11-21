/**
 * One-shot gain envelopes (Phase 5, AUD-01, research Pattern 6 / Pitfall 5).
 *
 * Pure point math plus one thin applier, so the click-free rules are unit
 * tested without Web Audio:
 * - every envelope is anchored with a "set" at `ENV_FLOOR` at its start time
 *   (an exponential ramp starts at the previous event, so it needs an anchor;
 *   the parameter's `.value` is never written directly);
 * - exponential ramps run between strictly positive values only: the peak is
 *   clamped into [ENV_FLOOR, 1] and the tail ends at `ENV_FLOOR`, never 0 (the
 *   browser throws on an exponential target <= 0);
 * - an attack below `MIN_ATTACK_S` is raised to it (a 0 ms attack clicks), and
 *   the decay is held to the same minimum so point times stay strictly
 *   increasing.
 *
 * Point shape: set(FLOOR, t0) -> exp(peak, t0 + attack) [-> set(peak, t0 +
 * attack + hold) when hold > 0] -> exp(FLOOR, t0 + attack + hold + decay).
 */

import type { AudioParamLike } from "./audio-context-like";

/** Envelope floor: exponential ramps start and end here, never at 0. */
export const ENV_FLOOR = 1e-4;

/** Shortest attack (and decay) an envelope may have (s): shorter clicks. */
export const MIN_ATTACK_S = 0.001;

/** Envelope timing in seconds. */
export interface EnvelopeSpec {
  readonly attack: number;
  readonly hold: number;
  readonly decay: number;
}

/** One automation event: an anchor ("set") or an exponential ramp ("exp"). */
export interface EnvPoint {
  readonly kind: "set" | "exp";
  readonly value: number;
  readonly time: number;
}

/** Attack, hold and decay after the minimums (NaN-safe). */
function segments(env: EnvelopeSpec): { attack: number; hold: number; decay: number } {
  return {
    attack: env.attack > MIN_ATTACK_S ? env.attack : MIN_ATTACK_S,
    hold: env.hold > 0 ? env.hold : 0,
    decay: env.decay > MIN_ATTACK_S ? env.decay : MIN_ATTACK_S,
  };
}

/** The peak clamped into [ENV_FLOOR, 1]; NaN and anything <= floor give the floor. */
function clampPeak(peak: number): number {
  if (!(peak > ENV_FLOOR)) return ENV_FLOOR;
  return peak >= 1 ? 1 : peak;
}

/** When the envelope reaches the floor: t0 + attack + hold + decay. */
export function envelopeEnd(t0: number, env: EnvelopeSpec): number {
  const s = segments(env);
  return t0 + s.attack + s.hold + s.decay;
}

/** The envelope's automation points, in time order. */
export function envelopePoints(t0: number, env: EnvelopeSpec, peak: number): readonly EnvPoint[] {
  const s = segments(env);
  const p = clampPeak(peak);
  const points: EnvPoint[] = [
    { kind: "set", value: ENV_FLOOR, time: t0 },
    { kind: "exp", value: p, time: t0 + s.attack },
  ];
  if (s.hold > 0) points.push({ kind: "set", value: p, time: t0 + s.attack + s.hold });
  points.push({ kind: "exp", value: ENV_FLOOR, time: envelopeEnd(t0, env) });
  return points;
}

/**
 * The envelope's level at time `t`, evaluated the way Web Audio renders the
 * points: a "set" holds until the next point, an "exp" ramp interpolates
 * geometrically from the previous point. Before the first point it is the
 * first point's value (the source has not started yet); after the last, the
 * last value. Used to anchor a stolen voice's fade at its live level.
 */
export function envelopeValueAt(points: readonly EnvPoint[], t: number): number {
  const first = points[0];
  if (!first) return ENV_FLOOR;
  let value = first.value;
  let time = first.time;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) continue;
    if (p.time <= t) {
      value = p.value;
      time = p.time;
      continue;
    }
    if (p.kind === "exp" && i > 0 && value > 0 && p.value > 0 && p.time > time) {
      return value * Math.pow(p.value / value, (t - time) / (p.time - time));
    }
    return value;
  }
  return value;
}

/**
 * Schedule the envelope on `param`: cancel anything pending from t0, then the
 * points. Returns the time the envelope reaches the floor.
 */
export function applyEnvelope(
  param: AudioParamLike,
  t0: number,
  env: EnvelopeSpec,
  peak: number,
): number {
  param.cancelScheduledValues(t0);
  const points = envelopePoints(t0, env, peak);
  for (let i = 0; i < points.length; i++) {
    const e = points[i];
    if (!e) continue;
    if (e.kind === "set") param.setValueAtTime(e.value, e.time);
    else param.exponentialRampToValueAtTime(e.value, e.time);
  }
  return envelopeEnd(t0, env);
}
