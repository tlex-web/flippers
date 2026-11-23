/**
 * BallSave: the timed ball save (plan 06-07, PLSH-07, D-08..D-10).
 *
 * A pure module: no world, no clock, no random source. Time is the number of
 * `update()` calls (one per fixed step), so a replay of the same ball positions
 * on the same steps gives the same save window.
 *
 * Lifecycle:
 * - `arm()` (every serve): armed, not started, `remaining = steps`. A save
 *   built with `steps = 0` never arms (the save disabled).
 * - `update(ballX)`: while armed and not started, the timer starts on the first
 *   call where `ballX + BALL_RADIUS_M < CHUTE_X` (strict): the ball has cleared
 *   the launch chute. A held plunger or a weak plunge that falls straight back
 *   keeps the ball in the chute, so neither burns nor starts the window
 *   (research Pitfall 3). The starting call does not count down; every later
 *   call counts `remaining` down by one, and at 0 the save disarms (timed out).
 *   So the save can be used on exactly `steps` updates once started.
 * - `consume()`: one save per arm. Succeeds only while `canSave()` (armed
 *   and started), then disarms. How the save was spent (kickback or backstop)
 *   is the session's to record, so there is one source for it (06-REVIEW
 *   IN-03).
 * - `disarm()`: a tilt, the bonus state and game over.
 *
 * Lamp phase (D-10): steady while armed and waiting in the chute or with more
 * than `BALL_SAVE_BLINK_STEPS` left, blink with that many or fewer left, off
 * once spent, timed out or disarmed.
 *
 * Allocation-free after construction.
 */

import { BALL_RADIUS_M } from "../physics/constants";
import { CHUTE_X } from "../table/spec";
import { BALL_SAVE_BLINK_STEPS, BALL_SAVE_STEPS } from "./tuning";

/**
 * How a save was spent: the center-post kickback or the drain backstop
 * (recorded by `GameSession`, read through `getLastSaveKind()`).
 */
export type SaveKind = "kickback" | "backstop";

/** What the save lamp shows. */
export type SaveLampPhase = "off" | "steady" | "blink";

export class BallSave {
  private readonly steps: number;
  private armed = false;
  private started = false;
  private remaining = 0;

  /** `steps`: the window length once started (0 disables the save). */
  constructor(steps: number = BALL_SAVE_STEPS) {
    this.steps = steps;
  }

  /** Arm on a serve: armed (when the window is non-zero), not started, full window. */
  arm(): void {
    this.armed = this.steps > 0;
    this.started = false;
    this.remaining = this.steps;
  }

  /** Disarm (tilt, bonus, game over): no save until the next `arm()`. */
  disarm(): void {
    this.armed = false;
  }

  /**
   * One fixed step with the active ball's x (NaN when there is none, which
   * never starts the timer). Starts the timer on the chute exit, then counts
   * it down, disarming at 0.
   */
  update(ballX: number): void {
    if (!this.armed) return;
    if (!this.started) {
      if (ballX + BALL_RADIUS_M < CHUTE_X) this.started = true;
      return;
    }
    this.remaining--;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.armed = false;
    }
  }

  /** Whether a drain or a kickback can be saved right now (armed and started). */
  canSave(): boolean {
    return this.armed && this.started;
  }

  /**
   * Spend the save. Returns false and changes nothing unless `canSave()`;
   * otherwise disarms and returns true.
   */
  consume(): boolean {
    if (!this.canSave()) return false;
    this.armed = false;
    return true;
  }

  /** The lamp: steady, blink in the last `BALL_SAVE_BLINK_STEPS`, or off. */
  lampPhase(): SaveLampPhase {
    if (!this.armed) return "off";
    if (!this.started || this.remaining > BALL_SAVE_BLINK_STEPS) return "steady";
    return "blink";
  }

  /** Whether the timer has started since the last `arm()`. */
  isStarted(): boolean {
    return this.started;
  }

  /** Steps left in the window (the full window before it starts). */
  getRemaining(): number {
    return this.remaining;
  }
}
