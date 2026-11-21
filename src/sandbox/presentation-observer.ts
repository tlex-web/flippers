/**
 * PresentationObserver (Phase 5, AUD-01/RND-03): derives the game-event cues
 * that no collision reports by diffing read-only getters once per fixed step.
 *
 * Call `observe()` once per fixed step at the end of `onPostStep`, after
 * `session.service()` (so a drain and its serve have landed) and before
 * `flash.tick()` (so a drain flash starts on this step's clock). It compares the
 * current state against the snapshot taken on the previous call (or at
 * construction, so the first call pushes nothing) and pushes, in this fixed
 * order:
 * - `"start"`: the state went from game-over to playing;
 * - `"launch"`: once per plunger release-count increment, at the charge that
 *   release ended at (a sub-window tap launches at 0, a cancel counts nothing);
 * - `"tilt"`: the state became tilted;
 * - `"warning"`: a false -> true edge of `isWarning()`;
 * - `"drain"` (on the drain element, plus a drain-apron flash): the previous
 *   state was not game-over and either the ball number rose or the state became
 *   game-over;
 * - `"gameOver"`: the state became game-over from another state.
 * A step with no change pushes nothing, so a held state never spams (T-05-17).
 *
 * Read-only by construction (T-05-16): it holds only `Pick<>` getter slices of
 * the session and the plunger, never a world handle, and writes only scalars
 * into the cue ring and the flash sink. No allocation, no closures, no DOM, no
 * engine import (type-only imports).
 */

import type { CueQueue, FlashSink } from "../app/cue-queue";
import type { FlipperController } from "../control/flipper-controller";
import type { PlungerController } from "../control/plunger-controller";
import type { GameSession, GameState } from "../game/game-session";

/** The session getters the observer diffs. */
export type ObserverSession = Pick<GameSession, "getState" | "getBall" | "isWarning">;

/** The plunger's read-only release counter. */
export type ObserverPlunger = Pick<PlungerController, "getReleaseCount" | "getLastReleaseCharge">;

/** The flipper controller's read-only coil counters. */
export type ObserverFlippers = Pick<FlipperController, "getCoilOnCount" | "getCoilOffCount">;

/** Element id for a cue that belongs to no table element. */
const NO_ELEMENT = -1;

export class PresentationObserver {
  private readonly cues: CueQueue;
  private readonly flash: FlashSink;
  private readonly session: ObserverSession;
  private readonly plunger: ObserverPlunger;
  private readonly drainElementId: number;

  private prevState: GameState;
  private prevBall: number;
  private prevWarning: boolean;
  private prevReleases: number;

  constructor(
    cues: CueQueue,
    flash: FlashSink,
    session: ObserverSession,
    plunger: ObserverPlunger,
    drainElementId: number,
    flippers: ObserverFlippers,
    flipperIds: readonly number[],
  ) {
    void flippers; // RED contract stub (05-05 Task 2)
    void flipperIds;
    this.cues = cues;
    this.flash = flash;
    this.session = session;
    this.plunger = plunger;
    this.drainElementId = drainElementId;
    this.prevState = session.getState();
    this.prevBall = session.getBall();
    this.prevWarning = session.isWarning();
    this.prevReleases = plunger.getReleaseCount();
  }

  /** Diff once per fixed step and push this step's cues in the fixed order. */
  observe(): void {
    const state = this.session.getState();
    const ball = this.session.getBall();
    const warning = this.session.isWarning();
    const releases = this.plunger.getReleaseCount();
    const prev = this.prevState;

    if (prev === "game-over" && state === "playing") this.cues.push("start", NO_ELEMENT, 1);

    if (releases > this.prevReleases) {
      const charge = this.plunger.getLastReleaseCharge();
      for (let n = this.prevReleases; n < releases; n++)
        this.cues.push("launch", NO_ELEMENT, charge);
    }

    if (state === "tilted" && prev !== "tilted") this.cues.push("tilt", NO_ELEMENT, 1);

    if (warning && !this.prevWarning) this.cues.push("warning", NO_ELEMENT, 1);

    const becameGameOver = state === "game-over" && prev !== "game-over";
    if (prev !== "game-over" && (ball > this.prevBall || becameGameOver)) {
      this.cues.push("drain", this.drainElementId, 1);
      this.flash.record(this.drainElementId, 1);
    }

    if (becameGameOver) this.cues.push("gameOver", NO_ELEMENT, 1);

    this.prevState = state;
    this.prevBall = ball;
    this.prevWarning = warning;
    this.prevReleases = releases;
  }
}
