/**
 * TiltMeter: the accumulate-and-decay tilt bob (plan 04-06, GAME-03, R10).
 *
 * A pure module: no world, no clock, no random source. Each accepted nudge adds
 * a cost through `addNudge()`; `update()` is called once per FIXED step and
 * decays the level by `decayPerS * FIXED_DT`, clamped at 0. Time is the number
 * of `update()` calls, so a replay of the same nudges on the same steps gives
 * the same outcomes.
 *
 * Outcomes of `addNudge()`:
 * - `"tilt"` when the level reaches `tiltLevel` (inclusive);
 * - otherwise `"warning"` on the RISING edge of level >= `warningLevel`
 *   (inclusive): once warned, the meter does not warn again until the level
 *   has decayed below the warning level (or `reset()`);
 * - otherwise `"ok"`.
 *
 * Worked numbers with the `tuning.ts` defaults (cost 1, decay 0.5/s, warn 2,
 * tilt 3) and nudges 30 steps apart: 1.0, 1.875, 2.75 (warning), then 3.625
 * (tilt). One nudge every 240 steps peaks at 1.0 and never warns.
 */

import { FIXED_DT } from "../physics/constants";
import { TILT_DECAY_PER_S, TILT_LEVEL, TILT_NUDGE_COST, TILT_WARNING_LEVEL } from "./tuning";

/** What one accepted nudge did to the meter. */
export type NudgeOutcome = "ok" | "warning" | "tilt";

/**
 * Meter parameters; every field defaults to its `tuning.ts` value. The game
 * uses the defaults; overrides exist so a test can reach meter states the
 * defaults make unreachable (for example a nudge at or above the warning level
 * that does not tilt).
 */
export interface TiltMeterConfig {
  /** Level each nudge adds (default `TILT_NUDGE_COST`). */
  readonly cost?: number;
  /** Decay per second, applied per fixed step (default `TILT_DECAY_PER_S`). */
  readonly decayPerS?: number;
  /** Inclusive warning threshold (default `TILT_WARNING_LEVEL`). */
  readonly warningLevel?: number;
  /** Inclusive tilt threshold (default `TILT_LEVEL`). */
  readonly tiltLevel?: number;
}

export class TiltMeter {
  private readonly cost: number;
  private readonly decayPerStep: number;
  private readonly warningLevel: number;
  private readonly tiltLevel: number;

  private level = 0;
  private warned = false;

  constructor(config: TiltMeterConfig = {}) {
    this.cost = config.cost ?? TILT_NUDGE_COST;
    this.decayPerStep = (config.decayPerS ?? TILT_DECAY_PER_S) * FIXED_DT;
    this.warningLevel = config.warningLevel ?? TILT_WARNING_LEVEL;
    this.tiltLevel = config.tiltLevel ?? TILT_LEVEL;
  }

  /** Add one nudge's cost and report what it did. */
  addNudge(): NudgeOutcome {
    this.level += this.cost;
    if (this.level >= this.tiltLevel) return "tilt";
    if (!this.warned && this.level >= this.warningLevel) {
      this.warned = true;
      return "warning";
    }
    return "ok";
  }

  /** One fixed step of decay, clamped at 0; re-arms the warning below its level. */
  update(): void {
    this.level = Math.max(0, this.level - this.decayPerStep);
    if (this.level < this.warningLevel) this.warned = false;
  }

  /** Back to level 0 with the warning re-armed (a new ball or a new game). */
  reset(): void {
    this.level = 0;
    this.warned = false;
  }

  /** The current level. */
  getLevel(): number {
    return this.level;
  }
}
