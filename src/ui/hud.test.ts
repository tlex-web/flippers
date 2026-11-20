import { describe, it, expect } from "vitest";

import type { GameState } from "../game/game-session";
import { formatScore, HudView, type HudSource, type TextSink } from "./hud";

/**
 * Score HUD contract (plan 04-01 Task 3, GAME-01): boundary formatting and
 * write-on-change, against a fake sink that counts writes.
 */

/** Fake text node whose setter counts every write. */
class CountingSink implements TextSink {
  writes = 0;
  private text: string | null = null;
  get textContent(): string | null {
    return this.text;
  }
  set textContent(value: string | null) {
    this.writes++;
    this.text = value;
  }
}

/** A settable session source. */
class FakeSource implements HudSource {
  score = 0;
  ball = 0;
  state: GameState = "game-over";
  played = false;
  warning = false;
  getScore(): number {
    return this.score;
  }
  getBall(): number {
    return this.ball;
  }
  getState(): GameState {
    return this.state;
  }
  hasPlayed(): boolean {
    return this.played;
  }
  isWarning(): boolean {
    return this.warning;
  }
}

/** A view over three counting sinks. */
function makeView(): {
  view: HudView;
  score: CountingSink;
  ball: CountingSink;
  status: CountingSink;
} {
  const score = new CountingSink();
  const ball = new CountingSink();
  const status = new CountingSink();
  return { view: new HudView(score, ball, status), score, ball, status };
}

describe("formatScore (GAME-01 boundary)", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1,000"],
    [1234567, "1,234,567"],
    [Number.MAX_SAFE_INTEGER, "9,007,199,254,740,991"],
  ])("formats %d as %s", (score, text) => {
    expect(formatScore(score)).toBe(text);
  });
});

describe("HudView write-on-change", () => {
  it("the first update writes once, even for score 0", () => {
    const { view, score: sink } = makeView();
    view.update(new FakeSource());
    expect(sink.writes).toBe(1);
    expect(sink.textContent).toBe("0");
  });

  it("100 further updates at an unchanged score write nothing", () => {
    const { view, score: sink } = makeView();
    const src = new FakeSource();
    view.update(src);
    for (let i = 0; i < 100; i++) view.update(src);
    expect(sink.writes).toBe(1);
  });

  it("a changed score writes exactly once", () => {
    const { view, score: sink } = makeView();
    const src = new FakeSource();
    view.update(src);
    src.score = 1000;
    view.update(src);
    view.update(src);
    expect(sink.writes).toBe(2);
    expect(sink.textContent).toBe("1,000");
  });
});
