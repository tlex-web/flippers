/**
 * Game HUD (GAME-01, GAME-02, GAME-03): a DOM text overlay with three lines,
 * the running score, the ball number and the game status.
 *
 * DOM text, not canvas text, so it stays crisp at any display fit (the canvas
 * HUD in the debug renderer renders at about 3.4 px once the table is fitted to
 * the viewport; it stays as the diagnosis readout).
 *
 * Lines:
 * - score: the running score with thousands separators (`formatScore`);
 * - ball: "BALL n / 3" while a ball is in play or tilted, empty in game-over
 *   (`ballText`);
 * - status: the attract and game-over prompts, WARNING and TILT, empty in plain
 *   play (`statusText`). It is the only line announced to assistive tech; the
 *   score changes too often to announce.
 *
 * Write-on-change, per line: `HudView.update()` runs every render frame but
 * caches the inputs of each line and rebuilds and writes a line only when its
 * own inputs changed, so a steady frame costs no DOM write and no string
 * building (threats T-04-03, T-04-19). Text-only: it assigns `textContent`,
 * never parses markup (T-04-20).
 *
 * No engine import and no DOM globals at module scope: the sinks are injected
 * as `TextSink`s (an `HTMLElement` satisfies it structurally), so this module is
 * testable in Vitest's node environment.
 */

import { BALLS_PER_GAME, type GameState } from "../game/game-session";

/** Where the HUD writes text. An `HTMLElement` satisfies it. */
export interface TextSink {
  textContent: string | null;
}

/** What the HUD reads. `GameSession` satisfies it. */
export interface HudSource {
  getScore(): number;
  getBall(): number;
  getState(): GameState;
  hasPlayed(): boolean;
  isWarning(): boolean;
}

/** Built once: en-US thousands grouping, integers only. */
const SCORE_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Format a score with thousands separators: 1234567 -> "1,234,567". */
export function formatScore(score: number): string {
  return SCORE_FORMAT.format(score);
}

/** The ball line: "BALL n / 3" while a ball is in play or tilted, "" in game-over. */
export function ballText(state: GameState, ball: number): string {
  switch (state) {
    case "playing":
    case "tilted":
      return `BALL ${ball} / ${BALLS_PER_GAME}`;
    case "game-over":
      return "";
  }
}

/**
 * The status line. Game-over reads "PRESS ENTER TO START" before the first game
 * and "GAME OVER · PRESS ENTER" after one; tilted reads "TILT" (it wins over an
 * open warning window); playing reads "WARNING" while the warning is open and ""
 * otherwise.
 */
export function statusText(state: GameState, hasPlayed: boolean, warning: boolean): string {
  switch (state) {
    case "game-over":
      return hasPlayed ? "GAME OVER · PRESS ENTER" : "PRESS ENTER TO START";
    case "tilted":
      return "TILT";
    case "playing":
      return warning ? "WARNING" : "";
  }
}

export class HudView {
  private readonly score: TextSink;
  private readonly ball: TextSink;
  private readonly status: TextSink;

  /** Whether any line has been written; false so the first update writes all three. */
  private written = false;

  /** The inputs each line was last written from. */
  private lastScore = 0;
  private lastBall = 0;
  private lastState: GameState = "game-over";
  private lastPlayed = false;
  private lastWarning = false;

  constructor(score: TextSink, ball: TextSink, status: TextSink) {
    this.score = score;
    this.ball = ball;
    this.status = status;
  }

  /** Rewrite each line only when its own inputs changed since its last write. */
  update(src: HudSource): void {
    const score = src.getScore();
    const ball = src.getBall();
    const state = src.getState();
    const played = src.hasPlayed();
    const warning = src.isWarning();

    const first = !this.written;
    const stateChanged = state !== this.lastState;
    if (first || score !== this.lastScore) {
      this.score.textContent = formatScore(score);
    }
    if (first || stateChanged || ball !== this.lastBall) {
      this.ball.textContent = ballText(state, ball);
    }
    if (first || stateChanged || played !== this.lastPlayed || warning !== this.lastWarning) {
      this.status.textContent = statusText(state, played, warning);
    }

    this.written = true;
    this.lastScore = score;
    this.lastBall = ball;
    this.lastState = state;
    this.lastPlayed = played;
    this.lastWarning = warning;
  }
}
