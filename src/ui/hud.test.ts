import { describe, it, expect } from "vitest";

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

/** A settable score source. */
class FakeSource implements HudSource {
  score = 0;
  getScore(): number {
    return this.score;
  }
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
    const sink = new CountingSink();
    const view = new HudView(sink);
    view.update(new FakeSource());
    expect(sink.writes).toBe(1);
    expect(sink.textContent).toBe("0");
  });

  it("100 further updates at an unchanged score write nothing", () => {
    const sink = new CountingSink();
    const view = new HudView(sink);
    const src = new FakeSource();
    view.update(src);
    for (let i = 0; i < 100; i++) view.update(src);
    expect(sink.writes).toBe(1);
  });

  it("a changed score writes exactly once", () => {
    const sink = new CountingSink();
    const view = new HudView(sink);
    const src = new FakeSource();
    view.update(src);
    src.score = 1000;
    view.update(src);
    view.update(src);
    expect(sink.writes).toBe(2);
    expect(sink.textContent).toBe("1,000");
  });
});
