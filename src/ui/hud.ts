/**
 * Game HUD (GAME-01, GAME-02, GAME-03): a DOM text overlay with three lines,
 * the running score, the ball number and the game status.
 *
 * DOM text, not canvas text, so it stays crisp at any display fit (canvas text
 * rendered at about 3.4 px once the table was fitted to the viewport, G-04-6).
 * The diagnosis readout (FPS, physics Hz, kinetic energy) is DOM text too, in
 * its own panel (`DiagView`); the canvas paints no text.
 *
 * Lines:
 * - score: the running score with thousands separators (`formatScore`),
 *   counted up as a display-only exponential chase on the step clock (D-14):
 *   `shown += (target - shown) * (1 - exp(-dt / COUNT_UP_TAU_S))`, snapping
 *   when within `COUNT_UP_SNAP`, when the target drops (a new game never counts
 *   down), under reduced motion and when no dt is given. `getScore()` stays
 *   the true value; only the line lags;
 * - ball: "BALL n / 3" while a ball is in play, tilted or in its bonus tally,
 *   empty in game-over (`ballText`);
 * - best (optional, plan 06-11, PLSH-08): `HIGH SCORE <best>` in game-over when
 *   the best is above 0, else empty (`bestText`); a game over that set a new
 *   best sets `data-new="true"` on it through an `AttrSink` (the CSS pulse),
 *   removed again on the next game start;
 * - status: one message at a time, resolved by the 06-UI-SPEC priority table
 *   (TILT, then TILT · NO BONUS for a forfeit hold, then BONUS <total> for the
 *   whole tally, then NEW HIGH SCORE for `NEW_BEST_STATUS_STEPS` after a game
 *   over that set a new best, then SKILL SHOT <value> or BALL SAVED for `STATUS_TRANSIENT_STEPS`
 *   fixed steps after an award or a save (the newer of the two wins), then the
 *   attract and game-over prompts, then WARNING, else empty;
 *   `StatusCode`, `statusText`). It is the only HUD line announced to assistive tech;
 *   the score changes too often to announce. The mute announcer (`MuteView`'s
 *   second sink, a visually hidden live region) is the page's other one.
 *
 * Write-on-change, per line: `HudView.update()` runs every render frame but
 * caches the inputs of each line and rebuilds and writes a line only when its
 * own inputs changed, so a steady frame costs no DOM write and no string
 * building (threats T-04-03, T-04-19). Text-only: it assigns `textContent`,
 * never parses markup (T-04-20).
 *
 * The end-of-ball bonus overlay (`BonusView`, plan 06-06) is a separate,
 * centered panel that reveals the drained ball's tally row by row from the
 * session's tally getters and the closed-form schedule in `game/bonus.ts`.
 *
 * No engine import and no DOM globals at module scope: the sinks are injected
 * as `TextSink`s (an `HTMLElement` satisfies it structurally), so this module is
 * testable in Vitest's node environment.
 */

import { rowRevealed, rowShownValue, type BonusRowKind } from "../game/bonus";
import { BALLS_PER_GAME, type GameSession, type GameState } from "../game/game-session";

/** Where the HUD writes text. An `HTMLElement` satisfies it. */
export interface TextSink {
  textContent: string | null;
}

/** Where a view toggles attributes (`hidden`, `data-revealed`). An `HTMLElement` satisfies it. */
export interface AttrSink {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** What the HUD reads. `GameSession` satisfies it. */
export interface HudSource {
  getScore(): number;
  getBall(): number;
  getState(): GameState;
  hasPlayed(): boolean;
  isWarning(): boolean;
  /** Fixed steps since construction: the clock transient statuses expire on. */
  getStep(): number;
  getSkillShotCount(): number;
  getLastSkillValue(): number;
  /** `getStep()` at the most recent skill shot (-1 before any). */
  getLastSkillStep(): number;
  /** The bonus total of the tally in progress (read in the `"bonus"` state). */
  getBonusTotal(): number;
  /** Whether the tally in progress is a tilt forfeit (read in the `"bonus"` state). */
  isBonusForfeit(): boolean;
  /** Saves since construction, kickback or backstop. */
  getSaveCount(): number;
  /** `getStep()` at the most recent save (-1 before any). */
  getLastSaveStep(): number;
  /** The best score (0 when none is stored or storage is unreadable). */
  getBest(): number;
  /** Whether the game that just ended set a new best (cleared on the next start). */
  isNewBest(): boolean;
  /** `getStep()` at the most recent game over (-1 before any). */
  getGameOverStep(): number;
}

/** Built once: en-US thousands grouping, integers only. */
const SCORE_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * The score count-up time constant (D-14, UI-SPEC): 0.20 s, so a jump closes
 * 63 % of the gap in 0.2 s and is within the snap band in well under a second.
 */
export const COUNT_UP_TAU_S = 0.2;

/**
 * The count-up snap band (points): when the shown score is within this of the
 * target it lands on the target exactly, so the chase never runs forever on a
 * sub-point remainder and the shown value never overshoots.
 */
export const COUNT_UP_SNAP = 10;

/** Format a score with thousands separators: 1234567 -> "1,234,567". */
export function formatScore(score: number): string {
  return SCORE_FORMAT.format(score);
}

/** The ball line: "BALL n / 3" while playing, tilted or in the bonus tally, "" in game-over. */
export function ballText(state: GameState, ball: number): string {
  switch (state) {
    case "playing":
    case "tilted":
    case "bonus":
      return `BALL ${ball} / ${BALLS_PER_GAME}`;
    case "game-over":
      return "";
  }
}

/**
 * What the status line shows, resolved from the 06-UI-SPEC priority table
 * (highest wins): 1 `tilt`, 2 `tiltNoBonus` (a forfeit hold), 3 `bonus` (the
 * whole tally), 4 `newHighScore` (`NEW_BEST_STATUS_STEPS` after a game over
 * that set a new best), 5 `skillShot` / `ballSaved` (the newer of the two),
 * 6 `attract` / `gameOver` (the prompts), 7 `warning`, 8 `none`.
 */
export type StatusCode =
  | "none"
  | "tilt"
  | "tiltNoBonus"
  | "bonus"
  | "newHighScore"
  | "skillShot"
  | "ballSaved"
  | "attract"
  | "gameOver"
  | "warning";

/**
 * How long a transient status (SKILL SHOT, BALL SAVED) holds, in fixed physics steps:
 * 180 steps = 1.5 s at 120 Hz. Counted on the session's step clock, never the
 * wall clock, so it freezes on tab blur.
 */
export const STATUS_TRANSIENT_STEPS = 180;

/**
 * How long NEW HIGH SCORE holds after the game over that set it (UI-SPEC row
 * 4): 360 fixed steps = 3 s at 120 Hz, then the game-over prompt. Step clock.
 */
export const NEW_BEST_STATUS_STEPS = 360;

/**
 * The status line text for a resolved code. `value` is used only by codes that
 * carry a number (`skillShot`: the points just paid, 5,000 to 25,000; `bonus`:
 * the tally total, known at the drain); built from
 * fixed strings and `formatScore` only (T-6-06). The longest text is the
 * 23-character game-over prompt; SKILL SHOT 25,000 is 17.
 */
export function statusText(code: StatusCode, value: number): string {
  switch (code) {
    case "tilt":
      return "TILT";
    case "tiltNoBonus":
      return "TILT · NO BONUS";
    case "bonus":
      return `BONUS ${formatScore(value)}`;
    case "newHighScore":
      return "NEW HIGH SCORE";
    case "skillShot":
      return `SKILL SHOT ${formatScore(value)}`;
    case "ballSaved":
      return "BALL SAVED";
    case "attract":
      return "PRESS ENTER TO START";
    case "gameOver":
      return "GAME OVER · PRESS ENTER";
    case "warning":
      return "WARNING";
    case "none":
      return "";
  }
}

/**
 * The best line (`#hud-best`, UI-SPEC): `HIGH SCORE 48,250` in game-over
 * (attract and after a game) when the best is above 0, empty during play and
 * empty for a best of 0 (the empty state never shows `HIGH SCORE 0`). Fixed
 * text plus a formatted integer, nothing user-authored.
 */
export function bestText(state: GameState, best: number): string {
  return state === "game-over" && best > 0 ? `HIGH SCORE ${formatScore(best)}` : "";
}

export class HudView {
  private readonly score: TextSink;
  private readonly ball: TextSink;
  private readonly status: TextSink;
  /** The best line and its `data-new` attribute (optional: older compositions omit them). */
  private readonly best: TextSink | null;
  private readonly bestAttr: AttrSink | null;

  /** Whether any line has been written; false so the first update writes all three. */
  private written = false;

  /** The count-up chase value (a float; the line shows it rounded). */
  private shown = 0;

  /** The inputs each line was last written from (the score line: the shown integer). */
  private lastScore = 0;
  private lastBall = 0;
  private lastState: GameState = "game-over";
  /** The resolved status the status line was last written from. */
  private lastCode: StatusCode = "none";
  private lastValue = 0;
  /** The best-line inputs last written (with `lastState`). */
  private lastBest = 0;
  private lastNewBest = false;

  constructor(
    score: TextSink,
    ball: TextSink,
    status: TextSink,
    best: TextSink | null = null,
    bestAttr: AttrSink | null = null,
  ) {
    this.score = score;
    this.ball = ball;
    this.status = status;
    this.best = best;
    this.bestAttr = bestAttr;
  }

  /**
   * Rewrite each line only when its own inputs changed since its last write.
   * The status line is resolved to a (code, value) pair first, without
   * allocating; its text is rebuilt and written only when that pair changes.
   *
   * `dtSeconds` is the simulated time this frame advanced (fixed steps times
   * `FIXED_DT`), so the count-up runs on the step clock: it freezes on a hidden
   * tab and replays identically. The default (+Infinity) snaps, as does
   * `reducedMotion` (D-18). The score line is written only when the rounded
   * shown value changes (T-6-11).
   */
  update(src: HudSource, dtSeconds = Number.POSITIVE_INFINITY, reducedMotion = false): void {
    const target = src.getScore();
    const ball = src.getBall();
    const state = src.getState();

    // Snap: reduced motion, no (or a non-finite) dt, a drop in the target (a new
    // game never counts down, gap < 0) or a gap within the snap band.
    const gap = target - this.shown;
    if (reducedMotion || !(dtSeconds < Number.POSITIVE_INFINITY) || gap <= COUNT_UP_SNAP) {
      this.shown = target;
    } else if (dtSeconds > 0) {
      this.shown += gap * (1 - Math.exp(-dtSeconds / COUNT_UP_TAU_S));
    }
    const score = Math.round(this.shown);

    const first = !this.written;
    if (first || score !== this.lastScore) {
      this.score.textContent = formatScore(score);
    }
    if (first || state !== this.lastState || ball !== this.lastBall) {
      this.ball.textContent = ballText(state, ball);
    }

    // The best line and the new-best pulse: rewritten only when the state, the
    // best or the new-best flag changed. data-new="true" marks a game over that
    // set a new best (CSS pulses it); the next game start clears it.
    const best = src.getBest();
    const newBest = src.isNewBest();
    if (
      first ||
      state !== this.lastState ||
      best !== this.lastBest ||
      newBest !== this.lastNewBest
    ) {
      if (this.best !== null) this.best.textContent = bestText(state, best);
      if (this.bestAttr !== null) {
        if (state === "game-over" && newBest) this.bestAttr.setAttribute("data-new", "true");
        else this.bestAttr.removeAttribute("data-new");
      }
    }

    // Status priority (06-UI-SPEC): 1 TILT, 2 TILT · NO BONUS, 3 BONUS,
    // 4 NEW HIGH SCORE (for NEW_BEST_STATUS_STEPS after the game over that set
    // it), 5 SKILL SHOT / BALL SAVED (the newer of the two inside its window
    // wins), 6 prompts, 7 WARNING, 8 empty. The bonus total is fixed for the
    // whole tally, so BONUS is written (and announced) once.
    const now = src.getStep();
    const skillStep = src.getLastSkillStep();
    const saveStep = src.getLastSaveStep();
    const skillOn = src.getSkillShotCount() > 0 && now < skillStep + STATUS_TRANSIENT_STEPS;
    const saveOn = src.getSaveCount() > 0 && now < saveStep + STATUS_TRANSIENT_STEPS;
    let code: StatusCode;
    let value = 0;
    if (state === "tilted") {
      code = "tilt";
    } else if (state === "bonus" && src.isBonusForfeit()) {
      code = "tiltNoBonus";
    } else if (state === "bonus") {
      code = "bonus";
      value = src.getBonusTotal();
    } else if (
      state === "game-over" &&
      newBest &&
      now < src.getGameOverStep() + NEW_BEST_STATUS_STEPS
    ) {
      code = "newHighScore";
    } else if (saveOn && (!skillOn || saveStep > skillStep)) {
      code = "ballSaved";
    } else if (skillOn) {
      code = "skillShot";
      value = src.getLastSkillValue();
    } else if (state === "game-over") {
      code = src.hasPlayed() ? "gameOver" : "attract";
    } else if (src.isWarning()) {
      code = "warning";
    } else {
      code = "none";
    }
    if (first || code !== this.lastCode || value !== this.lastValue) {
      this.status.textContent = statusText(code, value);
    }

    this.written = true;
    this.lastScore = score;
    this.lastBall = ball;
    this.lastState = state;
    this.lastCode = code;
    this.lastValue = value;
    this.lastBest = best;
    this.lastNewBest = newBest;
  }
}

/** What the bonus overlay reads. `GameSession` satisfies it. */
export type BonusSource = Pick<GameSession, "getState" | "getBonusTally" | "getBonusElapsed">;

/** The overlay label word for each row kind (06-UI-SPEC copywriting). */
const BONUS_ROW_WORD: Readonly<Record<BonusRowKind, string>> = {
  rollovers: "ROLLOVERS",
  inlanes: "INLANES",
  banks: "BANKS",
};

/**
 * A bonus row label: `ROLLOVERS × 3` (U+00D7 with a space each side). The form
 * is the same for every n, so n = 1 reads `BANKS × 1` (no plural change).
 */
export function bonusRowLabel(kind: BonusRowKind, count: number): string {
  return `${BONUS_ROW_WORD[kind]} × ${count}`;
}

/** A cached attribute state: not yet written, off, on. */
const UNKNOWN = -1;
const OFF = 0;
const ON = 1;

/**
 * The end-of-ball bonus overlay (`#hud-bonus`, 06-UI-SPEC, D-11, D-12): a
 * centered panel that shows the tally of the drained ball row by row.
 *
 * - Hidden (`hidden` attribute) outside the `"bonus"` state and during a tilt
 *   forfeit hold, which has nothing to tally (the status line reads
 *   TILT · NO BONUS).
 * - Every included row (n >= 1) is laid out from the first step with
 *   `data-revealed="false"` (CSS `visibility: hidden`), so a partial reveal never
 *   reflows the panel; unused rows carry `hidden`. Row i is revealed at elapsed
 *   48 i and counts linearly from 0 to its value over its 48 steps
 *   (`rowRevealed`, `rowShownValue` from `game/bonus.ts`). TOTAL is revealed
 *   after the last row at full value; its text is written at the full total
 *   from the first step, so the value column is sized before anything shows.
 * - `reducedMotion`: a revealed row shows its final value at once; the reveal
 *   timing is the rule's and does not change.
 *
 * Write-on-change per row (T-6-11): it caches each row's included flag, label
 * inputs, shown integer and revealed flag, plus the overlay visibility and the
 * TOTAL, and touches the DOM (and formats a string) only when one changes.
 * Text-only: it assigns `textContent`, never markup.
 */
export class BonusView {
  private readonly overlay: AttrSink;
  private readonly rows: readonly AttrSink[];
  private readonly labels: readonly TextSink[];
  private readonly values: readonly TextSink[];
  private readonly totalRow: AttrSink;
  private readonly total: TextSink;

  /** Overlay visibility last written (UNKNOWN until the first update). */
  private visible = UNKNOWN;
  /** Per row: included (not `hidden`) as last written. */
  private readonly included: number[];
  /** Per row: the label inputs last written (kind, count). */
  private readonly labelKind: (BonusRowKind | null)[];
  private readonly labelCount: number[];
  /** Per row: the shown integer last written (-1 before any). */
  private readonly shownValue: number[];
  /** Per row: `data-revealed` as last written. */
  private readonly revealed: number[];
  private totalRevealed = UNKNOWN;
  /** The TOTAL integer last written (-1 before any). */
  private totalValue = -1;

  constructor(
    overlay: AttrSink,
    rows: readonly AttrSink[],
    labels: readonly TextSink[],
    values: readonly TextSink[],
    totalRow: AttrSink,
    total: TextSink,
  ) {
    this.overlay = overlay;
    this.rows = rows;
    this.labels = labels;
    this.values = values;
    this.totalRow = totalRow;
    this.total = total;
    const n = rows.length;
    this.included = new Array<number>(n).fill(UNKNOWN);
    this.labelKind = new Array<BonusRowKind | null>(n).fill(null);
    this.labelCount = new Array<number>(n).fill(-1);
    this.shownValue = new Array<number>(n).fill(-1);
    this.revealed = new Array<number>(n).fill(UNKNOWN);
  }

  /** Bring the overlay up to date with the tally; writes only what changed. */
  update(src: BonusSource, reducedMotion = false): void {
    const tally = src.getBonusTally();
    const show = src.getState() === "bonus" && !tally.forfeit;
    if (!show) {
      if (this.visible !== OFF) {
        this.overlay.setAttribute("hidden", "");
        this.visible = OFF;
      }
      return;
    }
    if (this.visible !== ON) {
      this.overlay.removeAttribute("hidden");
      this.visible = ON;
    }

    const elapsed = src.getBonusElapsed();
    const rowCount = tally.rows;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (row === undefined) continue;
      if (i >= rowCount) {
        if (this.included[i] !== OFF) {
          row.setAttribute("hidden", "");
          this.included[i] = OFF;
        }
        continue;
      }
      if (this.included[i] !== ON) {
        row.removeAttribute("hidden");
        this.included[i] = ON;
      }

      const kind = tally.kinds[i] ?? "rollovers";
      const count = tally.counts[i] ?? 0;
      const label = this.labels[i];
      if (label !== undefined && (kind !== this.labelKind[i] || count !== this.labelCount[i])) {
        label.textContent = bonusRowLabel(kind, count);
        this.labelKind[i] = kind;
        this.labelCount[i] = count;
      }

      const isRevealed = rowRevealed(i, elapsed);
      this.writeRevealed(row, isRevealed, i);

      const full = tally.values[i] ?? 0;
      const shown = !isRevealed ? 0 : reducedMotion ? full : rowShownValue(full, i, elapsed);
      const value = this.values[i];
      if (value !== undefined && shown !== this.shownValue[i]) {
        value.textContent = formatScore(shown);
        this.shownValue[i] = shown;
      }
    }

    // TOTAL: revealed after the last item row (at elapsed 48 * rows; at once
    // for an all-zero tally), always at its full value.
    const totalOn = rowRevealed(rowCount, elapsed) ? ON : OFF;
    if (totalOn !== this.totalRevealed) {
      this.totalRow.setAttribute("data-revealed", totalOn === ON ? "true" : "false");
      this.totalRevealed = totalOn;
    }
    if (tally.total !== this.totalValue) {
      this.total.textContent = formatScore(tally.total);
      this.totalValue = tally.total;
    }
  }

  /** Write row i's `data-revealed` only when it changed. */
  private writeRevealed(row: AttrSink, isRevealed: boolean, i: number): void {
    const on = isRevealed ? ON : OFF;
    if (on === this.revealed[i]) return;
    row.setAttribute("data-revealed", isRevealed ? "true" : "false");
    this.revealed[i] = on;
  }
}

/** The diagnosis readout's numbers. The sandbox mutates one instance in place. */
export interface DiagData {
  /** Rendered frames per second (smoothed). */
  fps: number;
  /** Fixed physics steps per real second (windowed); should track ~120. */
  physicsHz: number;
  /** Total kinetic energy across all balls (J); a settle/energy-trend read. */
  kineticEnergy: number;
}

/** The readout line: "FPS 60 | PHYS 120 Hz | KE 0.012 J". */
export function diagText(d: Readonly<DiagData>): string {
  return `FPS ${d.fps.toFixed(0)} | PHYS ${d.physicsHz.toFixed(0)} Hz | KE ${d.kineticEnergy.toFixed(3)} J`;
}

/**
 * The diagnosis readout (G-04-6): one line of DOM text. Write-on-change like
 * `HudView`: it caches the three numbers it last wrote, so a steady frame builds
 * no string and costs no DOM write (T-04-25). Text-only (T-04-24).
 */
export class DiagView {
  private readonly sink: TextSink;

  /** False so the first update writes. */
  private written = false;

  /** The numbers the line was last written from. */
  private lastFps = 0;
  private lastHz = 0;
  private lastKe = 0;

  constructor(sink: TextSink) {
    this.sink = sink;
  }

  /** Rewrite the line only when one of the three numbers changed since the last write. */
  update(d: Readonly<DiagData>): void {
    if (
      this.written &&
      d.fps === this.lastFps &&
      d.physicsHz === this.lastHz &&
      d.kineticEnergy === this.lastKe
    ) {
      return;
    }
    this.sink.textContent = diagText(d);
    this.written = true;
    this.lastFps = d.fps;
    this.lastHz = d.physicsHz;
    this.lastKe = d.kineticEnergy;
  }
}

/** The mute marker's text: "MUTED" while the sound is off, empty otherwise. */
export function muteText(muted: boolean): string {
  return muted ? "MUTED" : "";
}

/** What the mute announcer reads out on a toggle: both states have words. */
export function muteAnnouncement(muted: boolean): string {
  return muted ? "Muted" : "Sound on";
}

/**
 * The mute marker (05-REVIEW IN-03): shows that M silenced the game, including
 * a mute armed before the first gesture unlocked audio. Write-on-change like
 * the other lines: a steady frame costs no DOM write. Text-only.
 *
 * The visible marker is empty while the sound is on, and clearing a live
 * region announces nothing, so announcements go to a separate `announce` sink
 * (a visually hidden live region, 05-REVIEW IN-02): "Muted" or "Sound on" on
 * each change. The initial state is not announced.
 */
export class MuteView {
  private readonly sink: TextSink;
  private readonly announce: TextSink | null;
  /** False so the first update writes. */
  private written = false;
  private lastMuted = false;

  constructor(sink: TextSink, announce: TextSink | null = null) {
    this.sink = sink;
    this.announce = announce;
  }

  /** Rewrite the marker only when the mute state changed since the last write. */
  update(muted: boolean): void {
    if (this.written && muted === this.lastMuted) return;
    this.sink.textContent = muteText(muted);
    if (this.written && this.announce !== null) {
      this.announce.textContent = muteAnnouncement(muted);
    }
    this.written = true;
    this.lastMuted = muted;
  }
}
