/**
 * Concurrent voice limiter (Phase 5, AUD-01, research Pitfall 7, T-05-10).
 *
 * The bumper cluster can fire about 60 cues a second (6-step rearm, three
 * bumpers); voicing all of them would pile up into distortion and audio-thread
 * load. The pool keeps at most `maxVoices` voices sounding and each cue kind
 * at or under its recipe cap. Admitting a voice over a cap steals the oldest
 * voice of that kind first, then the oldest overall, with a `STEAL_FADE_S`
 * linear fade so the cut does not click. "Oldest" is the earliest
 * `startedAt`, ties broken by admission order, so the same cue sequence always
 * steals the same voices (deterministic automation logs).
 *
 * Bookkeeping only: the engine builds and wires voices; the pool sees handles
 * (their envelope gains and sources). The active list is a plain array that
 * never grows past `maxVoices`; allocation stays event-rate (one handle per
 * voice), never per frame or per step.
 */

import type { CueKind } from "../app/cue-queue";
import type { AudioParamLike, ScheduledSourceLike } from "./audio-context-like";
import { envelopeValueAt, type EnvPoint } from "./envelope";

/** Most voices sounding at once (assumption A3). */
export const MAX_VOICES = 16;

/** Linear fade applied to a stolen voice (s). */
export const STEAL_FADE_S = 0.005;

/** A stolen voice's sources stop this long after the fade ends (s). */
export const STEAL_STOP_PAD_S = 0.0005;

/** What the pool needs to know about one sounding voice. */
export interface VoiceHandle {
  readonly kind: CueKind;
  /** When the voice starts (audio clock, s). */
  readonly startedAt: number;
  /** When its last source stops (audio clock, s). */
  readonly endsAt: number;
  /**
   * Every envelope gain of the voice, with the points scheduled on it, so a
   * steal can anchor the fade at the gain's live level.
   */
  readonly envs: readonly { readonly gain: AudioParamLike; readonly points: readonly EnvPoint[] }[];
  /** Every source of the voice (each already started). */
  readonly sources: readonly ScheduledSourceLike[];
}

/**
 * Freeze a parameter at `value`, its level at `time`, so a following ramp
 * starts there. A linear or exponential ramp always starts at the previous
 * automation event, never at "now", so the hold must leave an event at `time`:
 * - with `cancelAndHoldAtTime` the in-progress ramp is cut at `time`, and the
 *   explicit set covers the cases where nothing is inserted (a hold segment,
 *   or past the last point), where the ramp would otherwise start from a stale
 *   earlier event;
 * - Firefox has no `cancelAndHoldAtTime`: the pending automation is cancelled
 *   from `time` and re-created up to it with an exponential ramp to `value`,
 *   which retraces the cancelled set/exp segment exactly (envelope points are
 *   all set or exp), so the level between now and `time` does not jump.
 */
export function holdAt(param: AudioParamLike, time: number, value: number): void {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(time);
    param.setValueAtTime(value, time);
  } else {
    param.cancelScheduledValues(time);
    if (value > 0) param.exponentialRampToValueAtTime(value, time);
    else param.setValueAtTime(value, time);
  }
}

export class VoicePool {
  private readonly maxVoices: number;
  /** Sounding voices in admission order. */
  private readonly active: VoiceHandle[] = [];

  constructor(maxVoices: number = MAX_VOICES) {
    this.maxVoices = Math.max(1, Math.floor(maxVoices));
  }

  /**
   * Make room for one new voice of `kind` starting at `now`: drop voices that
   * have ended, steal the oldest of this kind while the kind is at or above
   * `cap`, then the oldest overall while the pool is full.
   */
  admit(kind: CueKind, cap: number, now: number): void {
    this.prune(now);
    const limit = Math.max(1, Math.floor(cap));
    while (this.activeCount(kind) >= limit && this.steal(this.oldest(kind), now));
    while (this.active.length >= this.maxVoices && this.steal(this.oldest(undefined), now));
  }

  /** Track a voice built after `admit`. Never grows past the cap. */
  add(v: VoiceHandle): void {
    while (this.active.length >= this.maxVoices && this.steal(this.oldest(undefined), v.startedAt));
    this.active.push(v);
  }

  /** Forget a voice (its `onended`); a no-op if it is no longer tracked. */
  release(v: VoiceHandle): void {
    const i = this.active.indexOf(v);
    if (i >= 0) this.active.splice(i, 1);
  }

  /** Sounding voices, of one kind or in total. */
  activeCount(kind?: CueKind): number {
    if (kind === undefined) return this.active.length;
    let n = 0;
    for (let i = 0; i < this.active.length; i++) if (this.active[i]?.kind === kind) n++;
    return n;
  }

  /** Drop voices whose last source has stopped by `now` (onended may lag). */
  private prune(now: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const v = this.active[i];
      if (v && v.endsAt <= now) this.active.splice(i, 1);
    }
  }

  /** Index of the earliest-starting voice (of `kind` if given); first admitted wins ties. */
  private oldest(kind: CueKind | undefined): number {
    let best = -1;
    let bestStart = Infinity;
    for (let i = 0; i < this.active.length; i++) {
      const v = this.active[i];
      if (!v || (kind !== undefined && v.kind !== kind)) continue;
      if (v.startedAt < bestStart) {
        best = i;
        bestStart = v.startedAt;
      }
    }
    return best;
  }

  /**
   * Fade the voice at `index` out over STEAL_FADE_S from `now`, stop it and
   * forget it. False when `index` resolves to no voice (ends the caller's loop).
   */
  private steal(index: number, now: number): boolean {
    const v = this.active[index];
    if (!v) return false;
    this.active.splice(index, 1);
    const fadeEnd = now + STEAL_FADE_S;
    for (let i = 0; i < v.envs.length; i++) {
      const env = v.envs[i];
      if (!env) continue;
      holdAt(env.gain, now, envelopeValueAt(env.points, now));
      env.gain.linearRampToValueAtTime(0, fadeEnd);
    }
    const stop = fadeEnd + STEAL_STOP_PAD_S;
    for (let i = 0; i < v.sources.length; i++) v.sources[i]?.stop(stop);
    return true;
  }
}
