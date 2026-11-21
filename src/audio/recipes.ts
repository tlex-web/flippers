/**
 * Per-cue synthesis recipes (Phase 5, AUD-01, research recipe sketch).
 *
 * The audio twin of `src/game/tuning.ts`: every voice is plain data here, so a
 * by-ear pass is "change a number, hear it" under Vite HMR. Each cue kind gets
 * one original oscillator/noise/filter recipe, synthesized at runtime; nothing
 * imitates a commercial machine's sounds or callouts, and no audio file exists.
 * All values are research starting points (assumption A2), tuned by ear at UAT.
 *
 * `RECIPES` is a Record over `CueKind`, which has no wall or chute kind, so a
 * wall recipe cannot exist (D-03: walls flash but stay silent).
 *
 * How the engine reads a recipe (`AudioEngine.flush`):
 * - each layer is one source (an oscillator, or a buffer source over the shared
 *   noise buffer at a random offset), an optional biquad filter and its own
 *   envelope gain into the master bus, starting at t0 + `offset`;
 * - layer peak = `peak` * dB(`gainDb`) * (`levelFromStrength` ?
 *   strengthToGain(strength) : 1); the decay grows by `decayPerStrength` *
 *   strength when given;
 * - oscillator pitch = `f0` -> `f1` (exponential over `sweep` s; no ramp when
 *   `sweep` is 0) times semitoneRatio(idSemitones[elementId] +
 *   playbackSemitones(strength, rng, `maxSemitones`, `jitterCents`)). Noise
 *   layers ignore `f0`/`f1` (they are 0); their colour is the filter;
 * - a filter with `f1` ramps exponentially from `f0` to `f1` + `f1PerStrength`
 *   * strength over the layer's whole envelope;
 * - `cap` is the most voices of this kind that may sound at once (voice pool).
 */

import type { CueKind } from "../app/cue-queue";
import type { EnvelopeSpec } from "./envelope";

/** A biquad stage between a layer's source and its envelope gain. */
export interface FilterSpec {
  readonly type: BiquadFilterType;
  /** Start cutoff/centre frequency (Hz). */
  readonly f0: number;
  /** Optional end frequency (Hz), reached at the layer's envelope end. */
  readonly f1?: number;
  readonly q: number;
  /** Extra end frequency per unit strength (Hz). */
  readonly f1PerStrength?: number;
}

/** One sounding layer of a voice. */
export interface LayerSpec {
  readonly source: "osc" | "noise";
  /** Oscillator wave; absent for noise. */
  readonly wave?: OscillatorType;
  /** Start and end frequency (Hz); 0 for noise. */
  readonly f0: number;
  readonly f1: number;
  /** Pitch sweep duration (s); 0 holds f0. */
  readonly sweep: number;
  readonly filter?: FilterSpec;
  /** Layer level relative to the recipe peak (dB). */
  readonly gainDb: number;
  /** Start delay after the voice's t0 (s). */
  readonly offset: number;
  readonly envelope: EnvelopeSpec;
  /** Extra decay per unit strength (s). */
  readonly decayPerStrength?: number;
}

/** A whole cue voice. */
export interface CueRecipe {
  /** Linear peak gain at full level, before the master bus. */
  readonly peak: number;
  readonly layers: readonly LayerSpec[];
  /** Pitch rise at strength 1 (semitones). */
  readonly maxSemitones: number;
  /** Random detune bound, plus or minus (cents). */
  readonly jitterCents: number;
  /** Most voices of this kind sounding at once. */
  readonly cap: number;
  /** Whether strength scales the level (strengthToGain). */
  readonly levelFromStrength: boolean;
  /** Base pitch offset per element id (semitones). */
  readonly idSemitones?: Readonly<Record<number, number>>;
}

/** Inharmonic bell partial ratio for the rollover and lane chimes. */
const BELL_PARTIAL = 2.76;

/**
 * Left (id 0) and right (id 1) flippers sit one semitone apart. Keyed by
 * TABLE_SPEC id, like the bumper map: recipes.test.ts fails if a bumper or
 * flipper id lacks a distinct entry.
 */
const FLIPPER_ID_SEMITONES: Readonly<Record<number, number>> = Object.freeze({ 0: 0, 1: 1 });

/** A plain sine/triangle note with no sweep (chimes and figures). */
function note(
  wave: OscillatorType,
  freq: number,
  offset: number,
  envelope: EnvelopeSpec,
  gainDb = 0,
): LayerSpec {
  return { source: "osc", wave, f0: freq, f1: freq, sweep: 0, gainDb, offset, envelope };
}

const CHIME_ENV: EnvelopeSpec = { attack: 0.002, hold: 0, decay: 0.32 };
const FIGURE_ENV: EnvelopeSpec = { attack: 0.004, hold: 0, decay: 0.18 };
const GAME_OVER_ENV: EnvelopeSpec = { attack: 0.004, hold: 0, decay: 0.35 };
const TILT_ENV: EnvelopeSpec = { attack: 0.005, hold: 0.5, decay: 0.15 };
/** 80 ms beep: 2 ms attack, 60 ms hold, 18 ms decay. */
const BEEP_ENV: EnvelopeSpec = { attack: 0.002, hold: 0.06, decay: 0.018 };

export const RECIPES: Readonly<Record<CueKind, CueRecipe>> = Object.freeze({
  /** Pop: triangle 620 -> 300 Hz over 60 ms plus a 2.2 kHz band-passed noise click. */
  bumper: {
    peak: 0.8,
    layers: [
      {
        source: "osc",
        wave: "triangle",
        f0: 620,
        f1: 300,
        sweep: 0.06,
        gainDb: 0,
        offset: 0,
        envelope: { attack: 0.002, hold: 0, decay: 0.14 },
      },
      {
        source: "noise",
        f0: 0,
        f1: 0,
        sweep: 0,
        filter: { type: "bandpass", f0: 2200, q: 1.2 },
        gainDb: -6,
        offset: 0,
        envelope: { attack: 0.001, hold: 0, decay: 0.024 },
      },
    ],
    maxSemitones: 3,
    jitterCents: 25,
    cap: 4,
    levelFromStrength: true,
    idSemitones: Object.freeze({ 200: 0, 201: 2, 202: -3 }),
  },

  /** Snap: lowpassed square 190 -> 140 Hz plus a high-passed 15 ms noise click. */
  slingshot: {
    peak: 0.7,
    layers: [
      {
        source: "osc",
        wave: "square",
        f0: 190,
        f1: 140,
        sweep: 0.045,
        filter: { type: "lowpass", f0: 1800, q: 0.7 },
        gainDb: 0,
        offset: 0,
        envelope: { attack: 0.001, hold: 0, decay: 0.07 },
      },
      {
        source: "noise",
        f0: 0,
        f1: 0,
        sweep: 0,
        filter: { type: "highpass", f0: 3000, q: 0.7 },
        gainDb: -8,
        offset: 0,
        envelope: { attack: 0.001, hold: 0, decay: 0.014 },
      },
    ],
    maxSemitones: 0,
    jitterCents: 30,
    cap: 2,
    levelFromStrength: true,
  },

  /** Rollover chime: sine bell at 1320 Hz plus a 2.76x partial at -9 dB. */
  rollover: {
    peak: 0.55,
    layers: [
      note("sine", 1320, 0, CHIME_ENV),
      note("sine", 1320 * BELL_PARTIAL, 0, CHIME_ENV, -9),
    ],
    maxSemitones: 0,
    jitterCents: 15,
    cap: 2,
    levelFromStrength: true,
  },

  /** Lane chime: the rollover bell a fourth lower, at 990 Hz. */
  lane: {
    peak: 0.55,
    layers: [note("sine", 990, 0, CHIME_ENV), note("sine", 990 * BELL_PARTIAL, 0, CHIME_ENV, -9)],
    maxSemitones: 0,
    jitterCents: 15,
    cap: 2,
    levelFromStrength: true,
  },

  /** Bank complete: rising three-note triangle figure 1047, 1319, 1568 Hz. */
  bank: {
    peak: 0.5,
    layers: [
      note("triangle", 1047, 0, FIGURE_ENV),
      note("triangle", 1319, 0.1, FIGURE_ENV),
      note("triangle", 1568, 0.2, FIGURE_ENV),
    ],
    maxSemitones: 0,
    jitterCents: 0,
    cap: 1,
    levelFromStrength: false,
  },

  /** Coil thunk: sine 95 -> 55 Hz plus 350 Hz lowpassed noise. */
  flipperUp: {
    peak: 0.7,
    layers: [
      {
        source: "osc",
        wave: "sine",
        f0: 95,
        f1: 55,
        sweep: 0.07,
        gainDb: 0,
        offset: 0,
        envelope: { attack: 0.001, hold: 0, decay: 0.09 },
      },
      {
        source: "noise",
        f0: 0,
        f1: 0,
        sweep: 0,
        filter: { type: "lowpass", f0: 350, q: 0.7 },
        gainDb: -4,
        offset: 0,
        envelope: { attack: 0.001, hold: 0, decay: 0.034 },
      },
    ],
    maxSemitones: 0,
    jitterCents: 40,
    cap: 4,
    levelFromStrength: true,
    idSemitones: FLIPPER_ID_SEMITONES,
  },

  /** Release: a quieter sine 70 -> 50 Hz. */
  flipperDown: {
    peak: 0.7,
    layers: [
      {
        source: "osc",
        wave: "sine",
        f0: 70,
        f1: 50,
        sweep: 0.06,
        gainDb: -8,
        offset: 0,
        envelope: { attack: 0.002, hold: 0, decay: 0.06 },
      },
    ],
    maxSemitones: 0,
    jitterCents: 40,
    cap: 4,
    levelFromStrength: true,
    idSemitones: FLIPPER_ID_SEMITONES,
  },

  /**
   * Plunger: band-passed noise swept 400 -> 1200 Hz (+1800 Hz per unit charge)
   * plus a triangle twang 320 -> 150 Hz; a harder pull rings longer.
   */
  launch: {
    peak: 0.75,
    layers: [
      {
        source: "noise",
        f0: 0,
        f1: 0,
        sweep: 0,
        filter: { type: "bandpass", f0: 400, f1: 1200, q: 2, f1PerStrength: 1800 },
        gainDb: 0,
        offset: 0,
        envelope: { attack: 0.003, hold: 0, decay: 0.15 },
        decayPerStrength: 0.25,
      },
      {
        source: "osc",
        wave: "triangle",
        f0: 320,
        f1: 150,
        sweep: 0.12,
        gainDb: -6,
        offset: 0,
        envelope: { attack: 0.003, hold: 0, decay: 0.15 },
      },
    ],
    maxSemitones: 0,
    jitterCents: 0,
    cap: 1,
    levelFromStrength: true,
  },

  /** Drain: sawtooth 220 -> 70 Hz through a closing lowpass, plus a low thud. */
  drain: {
    peak: 0.7,
    layers: [
      {
        source: "osc",
        wave: "sawtooth",
        f0: 220,
        f1: 70,
        sweep: 0.65,
        filter: { type: "lowpass", f0: 900, f1: 150, q: 0.8 },
        gainDb: 0,
        offset: 0,
        envelope: { attack: 0.005, hold: 0, decay: 0.7 },
      },
      {
        source: "osc",
        wave: "sine",
        f0: 60,
        f1: 40,
        sweep: 0.15,
        gainDb: -3,
        offset: 0,
        envelope: { attack: 0.005, hold: 0, decay: 0.25 },
      },
    ],
    maxSemitones: 0,
    jitterCents: 20,
    cap: 1,
    levelFromStrength: false,
  },

  /** Tilt buzzer: two beating squares at 110 and 116.5 Hz, held 500 ms. */
  tilt: {
    peak: 0.5,
    layers: [
      {
        source: "osc",
        wave: "square",
        f0: 110,
        f1: 110,
        sweep: 0,
        filter: { type: "lowpass", f0: 1200, q: 0.7 },
        gainDb: -3,
        offset: 0,
        envelope: TILT_ENV,
      },
      {
        source: "osc",
        wave: "square",
        f0: 116.5,
        f1: 116.5,
        sweep: 0,
        filter: { type: "lowpass", f0: 1200, q: 0.7 },
        gainDb: -3,
        offset: 0,
        envelope: TILT_ENV,
      },
    ],
    maxSemitones: 0,
    jitterCents: 0,
    cap: 1,
    levelFromStrength: false,
  },

  /** Tilt warning: two 80 ms square beeps at 880 Hz, 70 ms apart. */
  warning: {
    peak: 0.45,
    layers: [note("square", 880, 0, BEEP_ENV), note("square", 880, 0.15, BEEP_ENV)],
    maxSemitones: 0,
    jitterCents: 0,
    cap: 1,
    levelFromStrength: false,
  },

  /** Game start: rising three-note triangle figure 523, 659, 784 Hz. */
  start: {
    peak: 0.5,
    layers: [
      note("triangle", 523, 0, FIGURE_ENV),
      note("triangle", 659, 0.1, FIGURE_ENV),
      note("triangle", 784, 0.2, FIGURE_ENV),
    ],
    maxSemitones: 0,
    jitterCents: 0,
    cap: 1,
    levelFromStrength: false,
  },

  /** Game over: falling three-note triangle figure 659, 523, 392 Hz, slower. */
  gameOver: {
    peak: 0.5,
    layers: [
      note("triangle", 659, 0, GAME_OVER_ENV),
      note("triangle", 523, 0.14, GAME_OVER_ENV),
      note("triangle", 392, 0.28, GAME_OVER_ENV),
    ],
    maxSemitones: 0,
    jitterCents: 0,
    cap: 1,
    levelFromStrength: false,
  },
});
