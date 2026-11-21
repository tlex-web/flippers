/** RED stub (05-03 Task 2): signatures only; implemented in the GREEN step. */
import type { AudioParamLike } from "./audio-context-like";

export const ENV_FLOOR = 1e-4;

export interface EnvelopeSpec {
  readonly attack: number;
  readonly hold: number;
  readonly decay: number;
}

export interface EnvPoint {
  readonly kind: "set" | "exp";
  readonly value: number;
  readonly time: number;
}

export function envelopePoints(t0: number, env: EnvelopeSpec, peak: number): readonly EnvPoint[] {
  void t0;
  void env;
  void peak;
  return [];
}

export function envelopeEnd(t0: number, env: EnvelopeSpec): number {
  void env;
  return t0;
}

export function applyEnvelope(
  param: AudioParamLike,
  t0: number,
  env: EnvelopeSpec,
  peak: number,
): number {
  void param;
  void env;
  void peak;
  return t0;
}
