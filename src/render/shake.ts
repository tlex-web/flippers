/**
 * Screen shake on the fixed-step clock (PLSH-01, D-17, D-18, research Pattern 5).
 *
 * Two presentation-only models, summed into one whole-view offset:
 * - a nudge kick: a closed-form damped oscillator (no integrator state) that
 *   shoves the view opposite the ball's nudge impulse (`-NUDGE_DIRS[dir]`),
 *   `A * exp(-zeta * omega * t) * sin(omega_d * t)` at SHAKE_KICK_HZ and
 *   SHAKE_KICK_ZETA, scaled so its first peak is SHAKE_KICK_PEAK_CSS_PX; a new
 *   kick replaces the running one;
 * - a capped trauma shake: big events add trauma (clamped to [0, 1]), which
 *   decays linearly at SHAKE_TRAUMA_DECAY_PER_S; the offset is
 *   `SHAKE_TRAUMA_MAX_CSS_PX * trauma^2 * n(t)`, where each axis of `n(t)` is the
 *   mean of two fixed-phase sines (x 13.1 and 19.7 Hz, y 15.3 and 22.9 Hz). There
 *   is no random source: the offset is a pure function of the calls made and of
 *   `(step, alpha)`.
 *
 * Step clock, as in flash.ts: `tick()` advances once per fixed step (in
 * `onPostStep`, before the flash clock), and `sample()` reads at `step + alpha`,
 * so the shake pauses with the simulation and never reads a wall clock. A kick
 * recorded during step N's `onPostStep` is stamped N + 1, so the first frame
 * after the tick reads age `alpha` (a read before that tick reads 0). Trauma
 * added during a step is copied to the previous slot by that step's `tick()`, so
 * the render reads it at its full value at alpha 0.
 *
 * Output: the kick and trauma terms are summed, multiplied by dpr, clamped to
 * +/- SHAKE_CLAMP_CSS_PX * dpr and rounded to whole device pixels (crisp neon
 * lines). Under reduced motion the offset is exactly 0 for every source (D-18).
 *
 * Scalar fields only; nothing is allocated after construction. DOM-free and
 * engine-free. Amplitudes are cosmetic and tuned by eye at UAT, here only.
 */

import { FIXED_DT } from "../physics/constants";
import { NUDGE_DIRS, type NudgeDir } from "../game/tuning";

/** Nudge kick natural frequency (Hz). */
export const SHAKE_KICK_HZ = 8;
/** Nudge kick damping ratio. */
export const SHAKE_KICK_ZETA = 0.55;
/** Nudge kick first-peak displacement (CSS px, times dpr). */
export const SHAKE_KICK_PEAK_CSS_PX = 6;
/** Trauma shake amplitude at trauma 1 (CSS px, times dpr). */
export const SHAKE_TRAUMA_MAX_CSS_PX = 8;
/** Linear trauma decay (trauma per second, applied per fixed step). */
export const SHAKE_TRAUMA_DECAY_PER_S = 1.5;
/** Each axis of the combined offset is clamped to this (CSS px, times dpr). */
export const SHAKE_CLAMP_CSS_PX = 12;

/** Trauma added per event (D-17); the bank bonus adds none. */
export const TRAUMA_TILT = 0.7;
export const TRAUMA_DRAIN = 0.25;
export const TRAUMA_BUMPER = 0.12;
export const TRAUMA_SLING = 0.08;

/** Trauma noise sine frequencies (Hz) and fixed phases (rad), per axis. */
const NOISE_X1_HZ = 13.1;
const NOISE_X2_HZ = 19.7;
const NOISE_Y1_HZ = 15.3;
const NOISE_Y2_HZ = 22.9;
const NOISE_X1_PHASE = 0;
const NOISE_X2_PHASE = 1.3;
const NOISE_Y1_PHASE = 0.7;
const NOISE_Y2_PHASE = 2.1;

const TAU = Math.PI * 2;

/** Kick natural and damped angular frequencies and the envelope rate. */
const KICK_OMEGA = TAU * SHAKE_KICK_HZ;
const KICK_RATE = SHAKE_KICK_ZETA * KICK_OMEGA;
const KICK_OMEGA_D = KICK_OMEGA * Math.sqrt(1 - SHAKE_KICK_ZETA * SHAKE_KICK_ZETA);

/**
 * The unit-amplitude response's first peak, from the closed-form peak time
 * `omega_d * t = atan(omega_d / (zeta * omega))` (about 0.4355 here).
 */
const KICK_PEAK_T = Math.atan(KICK_OMEGA_D / KICK_RATE) / KICK_OMEGA_D;
const KICK_PEAK_FACTOR = Math.exp(-KICK_RATE * KICK_PEAK_T) * Math.sin(KICK_OMEGA_D * KICK_PEAK_T);

/** Kick amplitude (CSS px) so the first peak is SHAKE_KICK_PEAK_CSS_PX. */
const KICK_AMPLITUDE = SHAKE_KICK_PEAK_CSS_PX / KICK_PEAK_FACTOR;

/** The kick is treated as 0 once its envelope is below this (CSS px). */
const KICK_EPS_CSS_PX = 1e-3;
/** Seconds after which the kick envelope is below KICK_EPS_CSS_PX. */
const KICK_CUTOFF_S = Math.log(KICK_AMPLITUDE / KICK_EPS_CSS_PX) / KICK_RATE;

/** Trauma lost per fixed step. */
const TRAUMA_DECAY_PER_STEP = SHAKE_TRAUMA_DECAY_PER_S * FIXED_DT;

/** Unit kick displacement (CSS px) at `t` seconds after the kick; 0 outside [0, cutoff]. */
export function kickDisplacement(t: number): number {
  if (!(t >= 0) || t > KICK_CUTOFF_S) return 0;
  return KICK_AMPLITUDE * Math.exp(-KICK_RATE * t) * Math.sin(KICK_OMEGA_D * t);
}

/** Trauma noise, x axis, in [-1, 1] at `t` seconds on the step clock. */
export function noiseX(t: number): number {
  return (
    0.5 *
    (Math.sin(TAU * NOISE_X1_HZ * t + NOISE_X1_PHASE) +
      Math.sin(TAU * NOISE_X2_HZ * t + NOISE_X2_PHASE))
  );
}

/** Trauma noise, y axis, in [-1, 1] at `t` seconds on the step clock. */
export function noiseY(t: number): number {
  return (
    0.5 *
    (Math.sin(TAU * NOISE_Y1_HZ * t + NOISE_Y1_PHASE) +
      Math.sin(TAU * NOISE_Y2_HZ * t + NOISE_Y2_PHASE))
  );
}

/** A preallocated offset pair the tracker writes into (device px). */
export interface ShakeOut {
  x: number;
  y: number;
}

/** Clamp `v` to [-lim, lim]. */
function clampAbs(v: number, lim: number): number {
  return v > lim ? lim : v < -lim ? -lim : v;
}

/** Whole-view shake state on the fixed-step clock. */
export class ShakeTracker {
  private stepCount = 0;
  /** Step the running kick starts on (-Infinity before any kick). */
  private kickStart = -Infinity;
  /** Unit direction the view moves on the running kick (opposite the ball impulse). */
  private kickDx = 0;
  private kickDy = 0;
  private trauma = 0;
  /** Trauma at the previous step, for interpolation at alpha. */
  private prevTrauma = 0;

  /**
   * Start a nudge kick toward `-NUDGE_DIRS[dir]`, replacing any running kick.
   * Stamped on the next step, like a flash.
   */
  kick(dir: NudgeDir): void {
    const d = NUDGE_DIRS[dir];
    this.kickStart = this.stepCount + 1;
    this.kickDx = -d.x;
    this.kickDy = -d.y;
  }

  /** Add trauma, clamped to [0, 1]. Non-finite and negative amounts are ignored. */
  addTrauma(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) return;
    const t = this.trauma + amount;
    this.trauma = t >= 1 ? 1 : t;
  }

  /** Advance one fixed step: remember this step's trauma, then decay it linearly. */
  tick(): void {
    this.stepCount++;
    this.prevTrauma = this.trauma;
    const t = this.trauma - TRAUMA_DECAY_PER_STEP;
    this.trauma = t > 0 ? t : 0;
  }

  /** Current trauma in [0, 1]. */
  getTrauma(): number {
    return this.trauma;
  }

  /** Fixed steps ticked so far. */
  get step(): number {
    return this.stepCount;
  }

  /**
   * The combined offset at `step + alpha` in device px, clamped to
   * +/- SHAKE_CLAMP_CSS_PX * dpr but not rounded. Exactly 0 under reduced motion.
   */
  sampleExact(alpha: number, dpr: number, reducedMotion: boolean, out: ShakeOut): void {
    if (reducedMotion) {
      out.x = 0;
      out.y = 0;
      return;
    }
    const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
    const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    const now = this.stepCount + a;

    const k = kickDisplacement((now - this.kickStart) * FIXED_DT);
    const p = this.prevTrauma;
    const tr = p + (this.trauma - p) * a;
    const amp = SHAKE_TRAUMA_MAX_CSS_PX * tr * tr;
    const t = now * FIXED_DT;
    const x = k * this.kickDx + (amp > 0 ? amp * noiseX(t) : 0);
    const y = k * this.kickDy + (amp > 0 ? amp * noiseY(t) : 0);

    const lim = SHAKE_CLAMP_CSS_PX * scale;
    out.x = clampAbs(x * scale, lim);
    out.y = clampAbs(y * scale, lim);
  }

  /**
   * The offset the renderer applies: `sampleExact` rounded to whole device
   * pixels (never -0). Exactly 0 under reduced motion.
   */
  sample(alpha: number, dpr: number, reducedMotion: boolean, out: ShakeOut): void {
    this.sampleExact(alpha, dpr, reducedMotion, out);
    out.x = Math.round(out.x) + 0;
    out.y = Math.round(out.y) + 0;
  }
}
