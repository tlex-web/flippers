/**
 * TiltMeter: RED-phase interface stub (plan 04-06 Task 2). Replaced by the real
 * accumulate-and-decay meter in the GREEN commit.
 */

/** What one accepted nudge did to the meter. */
export type NudgeOutcome = "ok" | "warning" | "tilt";

/** Meter parameters; every field defaults to its `tuning.ts` value. */
export interface TiltMeterConfig {
  readonly cost?: number;
  readonly decayPerS?: number;
  readonly warningLevel?: number;
  readonly tiltLevel?: number;
}

export class TiltMeter {
  readonly config: TiltMeterConfig;

  constructor(config: TiltMeterConfig = {}) {
    this.config = config;
  }

  addNudge(): NudgeOutcome {
    return "ok";
  }

  update(): void {}

  reset(): void {}

  getLevel(): number {
    return 0;
  }
}
