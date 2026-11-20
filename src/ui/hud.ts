/**
 * Score HUD (GAME-01): a DOM text overlay that shows the running score.
 *
 * DOM text, not canvas text, so it stays crisp at any display fit (the canvas
 * HUD in the debug renderer renders at about 3.4 px once the table is fitted to
 * the viewport; it stays as the diagnosis readout).
 *
 * Write-on-change: `HudView.update()` runs every render frame but writes the
 * text node only when the score differs from the last value it wrote, so a
 * steady frame costs no DOM write and no string formatting (threat T-04-03).
 * Text-only: it assigns `textContent`, never parses markup.
 *
 * No engine import and no DOM globals at module scope: the sink is injected as
 * a `TextSink` (an `HTMLElement` satisfies it structurally), so this module is
 * testable in Vitest's node environment.
 */

/** Where the HUD writes text. An `HTMLElement` satisfies it. */
export interface TextSink {
  textContent: string | null;
}

/** What the HUD reads. `GameSession` satisfies it. */
export interface HudSource {
  getScore(): number;
}

/** Built once: en-US thousands grouping, integers only. */
const SCORE_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Format a score with thousands separators: 1234567 -> "1,234,567". */
export function formatScore(score: number): string {
  return SCORE_FORMAT.format(score);
}

export class HudView {
  private readonly score: TextSink;

  /** The last score written; -1 so the first update always writes. */
  private lastScore = -1;

  constructor(score: TextSink) {
    this.score = score;
  }

  /** Write the score text only when it changed since the last write. */
  update(src: HudSource): void {
    const s = src.getScore();
    if (s === this.lastScore) return;
    this.lastScore = s;
    this.score.textContent = formatScore(s);
  }
}
