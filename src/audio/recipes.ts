/** RED stub (05-03 Task 2): types only; the recipe data lands in the GREEN step. */
import type { CueKind } from "../app/cue-queue";
import type { EnvelopeSpec } from "./envelope";

export interface FilterSpec {
  readonly type: BiquadFilterType;
  readonly f0: number;
  readonly f1?: number;
  readonly q: number;
  readonly f1PerStrength?: number;
}

export interface LayerSpec {
  readonly source: "osc" | "noise";
  readonly wave?: OscillatorType;
  readonly f0: number;
  readonly f1: number;
  readonly sweep: number;
  readonly filter?: FilterSpec;
  readonly gainDb: number;
  readonly offset: number;
  readonly envelope: EnvelopeSpec;
  readonly decayPerStrength?: number;
}

export interface CueRecipe {
  readonly peak: number;
  readonly layers: readonly LayerSpec[];
  readonly maxSemitones: number;
  readonly jitterCents: number;
  readonly cap: number;
  readonly levelFromStrength: boolean;
  readonly idSemitones?: Readonly<Record<number, number>>;
}

export const RECIPES = {} as Readonly<Record<CueKind, CueRecipe>>;
