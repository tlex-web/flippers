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
 * - score: the running score with thousands separators (`formatScore`);
 * - ball: "BALL n / 3" while a ball is in play or tilted, empty in game-over
 *   (`ballText`);
 * - status: one message at a time, resolved by the 06-UI-SPEC priority table
 *   (TILT, then SKILL SHOT <value> for `STATUS_TRANSIENT_STEPS` fixed steps after
 *   an award, then the attract and game-over prompts, then WARNING, else empty;
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
  /** Fixed steps since construction: the clock transient statuses expire on. */
  getStep(): number;
  getSkillShotCount(): number;
  getLastSkillValue(): number;
  /** `getStep()` at the most recent skill shot (-1 before any). */
  getLastSkillStep(): number;
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
 * What the status line shows, resolved from the 06-UI-SPEC priority table
 * (highest wins): 1 `tilt`, 5 `skillShot`, 6 `attract` / `gameOver` (the
 * prompts), 7 `warning`, 8 `none`. Later plans add their rows (TILT · NO BONUS,
 * BONUS, NEW HIGH SCORE, BALL SAVED) as new codes.
 */
export type StatusCode = "none" | "tilt" | "skillShot" | "attract" | "gameOver" | "warning";

/**
 * How long a transient status (SKILL SHOT) holds, in fixed physics steps:
 * 180 steps = 1.5 s at 120 Hz. Counted on the session's step clock, never the
 * wall clock, so it freezes on tab blur.
 */
export const STATUS_TRANSIENT_STEPS = 180;

/**
 * The status line text for a resolved code. `value` is used only by codes that
 * carry a number (`skillShot`: the points just paid, 5,000 to 25,000); built from
 * fixed strings and `formatScore` only (T-6-06). The longest text is the
 * 23-character game-over prompt; SKILL SHOT 25,000 is 17.
 */
export function statusText(code: StatusCode, value: number): string {
  switch (code) {
    case "tilt":
      return "TILT";
    case "skillShot":
      return `SKILL SHOT ${formatScore(value)}`;
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
  /** The resolved status the status line was last written from. */
  private lastCode: StatusCode = "none";
  private lastValue = 0;

  constructor(score: TextSink, ball: TextSink, status: TextSink) {
    this.score = score;
    this.ball = ball;
    this.status = status;
  }

  /**
   * Rewrite each line only when its own inputs changed since its last write.
   * The status line is resolved to a (code, value) pair first, without
   * allocating; its text is rebuilt and written only when that pair changes.
   */
  update(src: HudSource): void {
    const score = src.getScore();
    const ball = src.getBall();
    const state = src.getState();

    const first = !this.written;
    if (first || score !== this.lastScore) {
      this.score.textContent = formatScore(score);
    }
    if (first || state !== this.lastState || ball !== this.lastBall) {
      this.ball.textContent = ballText(state, ball);
    }

    // Status priority (06-UI-SPEC): 1 TILT, 5 SKILL SHOT, 6 prompts, 7 WARNING, 8 empty.
    let code: StatusCode;
    let value = 0;
    if (state === "tilted") {
      code = "tilt";
    } else if (
      src.getSkillShotCount() > 0 &&
      src.getStep() < src.getLastSkillStep() + STATUS_TRANSIENT_STEPS
    ) {
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
