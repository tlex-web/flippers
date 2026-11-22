/**
 * SkillShot: the rotating lit-lane skill shot (plan 06-01, PLSH-05, D-01..D-05).
 *
 * A pure module: no world, no clock, no random source. Time is the number of
 * `update()` calls (one per fixed step), so a replay of the same plunger phases
 * on the same steps gives the same lit lane and the same award.
 *
 * Phases:
 * - `"off"`: not armed. Nothing rotates and `getLitLane()` is -1.
 * - `"rotating"`: armed with the ball resting on the plunger. The lit lane
 *   steps through `SKILL_SHOT_LANES` every `SKILL_SHOT_ROTATE_STEPS` updates,
 *   wrapping, starting at the first lane on every `arm()`.
 * - `"frozen"`: the plunger is (or was) charging. The lit lane stays put. If
 *   the ball falls back and rests with the plunger idle (a weak plunge),
 *   `update(..., true)` reopens the rotation from the frozen lane with the
 *   step counter restarted (D-03, research A6).
 *
 * Resolution (D-03, D-04): the first scoring switch while armed decides the
 * shot and disarms it. Only the lit rollover awards; any other switch awards
 * nothing. The value is `SKILL_SHOT_BASE_POINTS` plus `SKILL_SHOT_STEP_POINTS`
 * per skill shot already made, capped at `SKILL_SHOT_MAX_POINTS`. `reset()` (a
 * new game) clears the ladder; `arm()` never does.
 *
 * Allocation-free after construction.
 */

import type { PlungerPhase } from "../control/plunger-controller";
import type { SwitchKind } from "./reactive-elements";
import {
  SKILL_SHOT_BASE_POINTS,
  SKILL_SHOT_LANES,
  SKILL_SHOT_MAX_POINTS,
  SKILL_SHOT_ROTATE_STEPS,
  SKILL_SHOT_STEP_POINTS,
} from "./tuning";

/** The skill-shot phases. */
export type SkillPhase = "off" | "rotating" | "frozen";

export class SkillShot {
  private phase: SkillPhase = "off";
  /** Index into SKILL_SHOT_LANES of the lit lane. */
  private litIndex = 0;
  /** Updates since the last lane change, arm or reopen. */
  private rotateSteps = 0;
  /** Skill shots made this game. */
  private count = 0;
  /** Value of the most recent skill shot, 0 before any. */
  private lastValue = 0;
  /** Lane of the most recent skill shot, -1 before any. */
  private lastLane = -1;

  /** Arm on a serve: rotating from the first lane, counter 0. Keeps the count. */
  arm(): void {
    this.phase = "rotating";
    this.litIndex = 0;
    this.rotateSteps = 0;
  }

  /** Disarm (tilt, game over): no lit lane, no award. */
  disarm(): void {
    this.phase = "off";
  }

  /**
   * One fixed step. While rotating, a charging plunger freezes the lit lane (no
   * rotation that step); otherwise the counter advances and every
   * `SKILL_SHOT_ROTATE_STEPS` updates the next lane lights. While frozen, an
   * idle plunger with the ball resting in the plunger zone reopens the rotation
   * from the frozen lane with the counter restarted.
   */
  update(plungerPhase: PlungerPhase, restingInZone: boolean): void {
    if (this.phase === "rotating") {
      if (plungerPhase === "charging") {
        this.phase = "frozen";
        return;
      }
      this.rotateSteps++;
      if (this.rotateSteps >= SKILL_SHOT_ROTATE_STEPS) {
        this.rotateSteps = 0;
        this.litIndex = (this.litIndex + 1) % SKILL_SHOT_LANES.length;
      }
    }
    // The frozen branch (fall-back reopen) lands with the shared rest test.
    void restingInZone;
  }

  /**
   * A registered scoring switch. Returns the skill-shot value to award (0 for
   * none). While armed, any switch disarms; only the lit rollover awards. While
   * off, returns 0 and changes nothing.
   */
  resolve(kind: SwitchKind, elementId: number): number {
    if (this.phase === "off") return 0;
    const lit = this.getLitLane();
    this.phase = "off";
    if (kind !== "rollover" || elementId !== lit) return 0;
    const value = Math.min(
      SKILL_SHOT_MAX_POINTS,
      SKILL_SHOT_BASE_POINTS + SKILL_SHOT_STEP_POINTS * this.count,
    );
    this.count++;
    this.lastValue = value;
    this.lastLane = elementId;
    return value;
  }

  /** A new game: the ladder and the last award cleared, disarmed. */
  reset(): void {
    this.count = 0;
    this.lastValue = 0;
    this.lastLane = -1;
    this.phase = "off";
  }

  /** The current phase. */
  getPhase(): SkillPhase {
    return this.phase;
  }

  /** The lit lane's element id, or -1 when off. */
  getLitLane(): number {
    if (this.phase === "off") return -1;
    return SKILL_SHOT_LANES[this.litIndex] ?? -1;
  }

  /** Skill shots made this game. */
  getCount(): number {
    return this.count;
  }

  /** Value of the most recent skill shot (0 before any this game). */
  getLastValue(): number {
    return this.lastValue;
  }

  /** Lane of the most recent skill shot (-1 before any this game). */
  getLastLane(): number {
    return this.lastLane;
  }
}
