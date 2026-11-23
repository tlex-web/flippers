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
 * - `"flipperUp"` (on the flipper id): once per coil-on count increment, for
 *   each watched flipper in `flipperIds` order;
 * - `"flipperDown"` (on the flipper id): once per coil-off count increment,
 *   for each watched flipper (a same-step tap is up then down; the tilt drop
 *   counts here, ahead of `"tilt"`);
 * - `"launch"`: once per plunger release-count increment, at the charge that
 *   release ended at (a sub-window tap launches at 0, a cancel counts nothing);
 * - `"nudge"` (element id = direction: left 0, right 1, up 2): once per
 *   accepted nudge (`getNudgeCount()` increment) at strength 1, so the cabinet
 *   thump is heard (06-09, D-17, D-25); a cooldown-rejected nudge counts nothing;
 * - `"tilt"`: the state became tilted;
 * - `"warning"`: a false -> true edge of `isWarning()`;
 * - `"skillShot"` (on the lane the shot went through): once per skill-shot
 *   count increment, at strength value / `SKILL_SHOT_MAX_POINTS` (06-04, D-25;
 *   a new game resets the count, which pushes nothing);
 * - `"drain"` (on the drain element, plus a drain-apron flash): once per
 *   `getDrainCount()` increment, i.e. on the drain step itself, not when the
 *   next ball is served after the bonus tally (06-06, research Pitfall 2);
 * - `"ballSave"`: once per `getSaveCount()` increment, kickback or backstop, at
 *   strength 1 on no element (06-10, D-10, D-25); a backstop save also raises
 *   the drain count on the same step, so it is heard as the drain growl, then
 *   the save sting;
 * - `"bonusTick"`: once per increase of `revealedRowCount(rows, elapsed)`
 *   while in a non-forfeit `"bonus"` tally with rows > 0, so one tick per item
 *   row reveal (the first on the drain step, after the drain cue), none per
 *   counted step and none for TOTAL (D-25); the count resets outside the bonus
 *   state, so the next ball's tally ticks from row 0 again;
 * - `"gameOver"`: the state became game-over from another state (its drain
 *   was already pushed on the drain step);
 * - `"highScore"`: once per `getNewBestCount()` increment, at strength 1 on no
 *   element (06-11, D-15, D-25); the session submits the final score as it
 *   enters game-over, so the fanfare follows the game-over cue on that step.
 * A step with no change pushes nothing, so a held state never spams (T-05-17).
 *
 * Effects (06-09, D-17): with an `ObserverFx` attached, every nudge-count
 * increment calls `fx.onNudge(dir)` after its cue (the view kicks), the tilt
 * edge calls `fx.onTilt()` after its cue and every drain-count increment calls
 * `fx.onDrain()` after its cue and flash, so tilts and drains shake the view.
 * A backstop-saved drain (06-07) also raises the drain count, so it shakes too.
 * Every skill-shot count increment calls `fx.onSkillShot(getLastSkillLane())`
 * and every save-count increment `fx.onSave(getLastSaveKind())`, each after its
 * cue (06-13, D-19: the reward glint and the kickback sparks).
 *
 * Read-only by construction (T-05-16): it holds only `Pick<>` getter slices of
 * the session, the plunger and the flipper controller, never a world handle, and writes only scalars
 * into the cue ring, the flash sink and the effects sink. No allocation, no closures, no DOM, no
 * engine import (type-only imports, plus the plain `SKILL_SHOT_MAX_POINTS`
 * tuning constant and the pure `revealedRowCount` schedule).
 */

import type { CueQueue, FlashSink } from "../app/cue-queue";
import type { SaveKind } from "../game/ball-save";
import type { FlipperController } from "../control/flipper-controller";
import type { PlungerController } from "../control/plunger-controller";
import { revealedRowCount } from "../game/bonus";
import type { GameSession, GameState } from "../game/game-session";
import { SKILL_SHOT_MAX_POINTS, type NudgeDir } from "../game/tuning";

/** The session getters the observer diffs. */
export type ObserverSession = Pick<
  GameSession,
  | "getState"
  | "isWarning"
  | "getSkillShotCount"
  | "getLastSkillValue"
  | "getLastSkillLane"
  | "getDrainCount"
  | "getNudgeCount"
  | "getLastNudgeDir"
  | "getSaveCount"
  | "getLastSaveKind"
  | "getNewBestCount"
  | "getBonusTally"
  | "getBonusElapsed"
>;

/** The plunger's read-only release counter. */
export type ObserverPlunger = Pick<PlungerController, "getReleaseCount" | "getLastReleaseCharge">;

/** The flipper controller's read-only coil counters. */
export type ObserverFlippers = Pick<FlipperController, "getCoilOnCount" | "getCoilOffCount">;

/**
 * Where the observer's game events reach the presentation effects (06-09). The
 * render side implements it; scalar step-path writes only.
 */
export interface ObserverFx {
  onNudge(dir: NudgeDir): void;
  onTilt(): void;
  onDrain(): void;
  /** A skill-shot award through rollover `laneId` (06-13). */
  onSkillShot(laneId: number): void;
  /** A ball save of `kind` (06-13). */
  onSave(kind: SaveKind | "none"): void;
}

/** Element id for a cue that belongs to no table element. */
const NO_ELEMENT = -1;

/** The nudge cue's element id: its direction (left 0, right 1, up 2). */
function nudgeElementId(dir: NudgeDir): number {
  return dir === "left" ? 0 : dir === "right" ? 1 : 2;
}

export class PresentationObserver {
  private readonly cues: CueQueue;
  private readonly flash: FlashSink;
  private readonly session: ObserverSession;
  private readonly plunger: ObserverPlunger;
  private readonly drainElementId: number;
  private readonly flippers: ObserverFlippers;
  private readonly flipperIds: readonly number[];
  private readonly fx: ObserverFx | null;

  private prevState: GameState;
  private prevWarning: boolean;
  private prevReleases: number;
  private prevSkillShots: number;
  private prevDrains: number;
  private prevNudges: number;
  private prevSaves: number;
  private prevNewBests: number;
  /** Bonus tally rows revealed at the previous observe (0 outside a tickable tally). */
  private prevRevealed: number;
  /** Per watched flipper (same index as flipperIds), preallocated once. */
  private readonly prevCoilOn: number[];
  private readonly prevCoilOff: number[];

  constructor(
    cues: CueQueue,
    flash: FlashSink,
    session: ObserverSession,
    plunger: ObserverPlunger,
    drainElementId: number,
    flippers: ObserverFlippers,
    flipperIds: readonly number[],
    fx: ObserverFx | null = null,
  ) {
    this.cues = cues;
    this.fx = fx;
    this.flash = flash;
    this.session = session;
    this.plunger = plunger;
    this.drainElementId = drainElementId;
    this.prevState = session.getState();
    this.prevWarning = session.isWarning();
    this.prevReleases = plunger.getReleaseCount();
    this.prevSkillShots = session.getSkillShotCount();
    this.prevDrains = session.getDrainCount();
    this.prevNudges = session.getNudgeCount();
    this.prevSaves = session.getSaveCount();
    this.prevNewBests = session.getNewBestCount();
    this.prevRevealed = this.revealedRows(this.prevState);
    this.flippers = flippers;
    this.flipperIds = flipperIds;
    this.prevCoilOn = new Array<number>(flipperIds.length);
    this.prevCoilOff = new Array<number>(flipperIds.length);
    for (let i = 0; i < flipperIds.length; i++) {
      const id = flipperIds[i] ?? -1;
      this.prevCoilOn[i] = flippers.getCoilOnCount(id);
      this.prevCoilOff[i] = flippers.getCoilOffCount(id);
    }
  }

  /** Diff once per fixed step and push this step's cues in the fixed order. */
  observe(): void {
    const state = this.session.getState();
    const warning = this.session.isWarning();
    const releases = this.plunger.getReleaseCount();
    const skillShots = this.session.getSkillShotCount();
    const drains = this.session.getDrainCount();
    const nudges = this.session.getNudgeCount();
    const saves = this.session.getSaveCount();
    const newBests = this.session.getNewBestCount();
    const revealed = this.revealedRows(state);
    const prev = this.prevState;

    if (prev === "game-over" && state === "playing") this.cues.push("start", NO_ELEMENT, 1);

    const ids = this.flipperIds;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] ?? -1;
      const on = this.flippers.getCoilOnCount(id);
      for (let n = this.prevCoilOn[i] ?? on; n < on; n++) this.cues.push("flipperUp", id, 1);
      this.prevCoilOn[i] = on;
    }
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] ?? -1;
      const off = this.flippers.getCoilOffCount(id);
      for (let n = this.prevCoilOff[i] ?? off; n < off; n++) this.cues.push("flipperDown", id, 1);
      this.prevCoilOff[i] = off;
    }

    if (releases > this.prevReleases) {
      const charge = this.plunger.getLastReleaseCharge();
      for (let n = this.prevReleases; n < releases; n++)
        this.cues.push("launch", NO_ELEMENT, charge);
    }

    if (nudges > this.prevNudges) {
      const dir = this.session.getLastNudgeDir();
      const id = nudgeElementId(dir);
      for (let n = this.prevNudges; n < nudges; n++) {
        this.cues.push("nudge", id, 1);
        if (this.fx) this.fx.onNudge(dir);
      }
    }

    if (state === "tilted" && prev !== "tilted") {
      this.cues.push("tilt", NO_ELEMENT, 1);
      if (this.fx) this.fx.onTilt();
    }

    if (warning && !this.prevWarning) this.cues.push("warning", NO_ELEMENT, 1);

    if (skillShots > this.prevSkillShots) {
      const lane = this.session.getLastSkillLane();
      const strength = this.session.getLastSkillValue() / SKILL_SHOT_MAX_POINTS;
      for (let n = this.prevSkillShots; n < skillShots; n++) {
        this.cues.push("skillShot", lane, strength);
        if (this.fx) this.fx.onSkillShot(lane);
      }
    }

    for (let n = this.prevDrains; n < drains; n++) {
      this.cues.push("drain", this.drainElementId, 1);
      this.flash.record(this.drainElementId, 1);
      if (this.fx) this.fx.onDrain();
    }

    if (saves > this.prevSaves) {
      const kind = this.session.getLastSaveKind();
      for (let n = this.prevSaves; n < saves; n++) {
        this.cues.push("ballSave", NO_ELEMENT, 1);
        if (this.fx) this.fx.onSave(kind);
      }
    }

    for (let n = this.prevRevealed; n < revealed; n++) this.cues.push("bonusTick", NO_ELEMENT, 1);

    if (state === "game-over" && prev !== "game-over") this.cues.push("gameOver", NO_ELEMENT, 1);

    for (let n = this.prevNewBests; n < newBests; n++) this.cues.push("highScore", NO_ELEMENT, 1);

    this.prevState = state;
    this.prevWarning = warning;
    this.prevReleases = releases;
    this.prevSkillShots = skillShots;
    this.prevDrains = drains;
    this.prevNudges = nudges;
    this.prevSaves = saves;
    this.prevNewBests = newBests;
    this.prevRevealed = revealed;
  }

  /**
   * Item rows of the tally in progress revealed so far: 0 outside `"bonus"`,
   * for a forfeit and for an all-zero tally (nothing to tick).
   */
  private revealedRows(state: GameState): number {
    if (state !== "bonus") return 0;
    const tally = this.session.getBonusTally();
    if (tally.forfeit || tally.rows <= 0) return 0;
    return revealedRowCount(tally.rows, this.session.getBonusElapsed());
  }
}
