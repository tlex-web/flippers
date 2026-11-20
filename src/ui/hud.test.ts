import { describe, it, expect } from "vitest";

import type { GameState } from "../game/game-session";
import { ballText, formatScore, HudView, statusText, type HudSource, type TextSink } from "./hud";

/**
 * HUD contract. Score (plan 04-01 Task 3, GAME-01): boundary formatting and
 * write-on-change. Ball and status (plan 04-07 Task 2, GAME-02/03): every
 * mapping, and the per-line write-on-change rule against fake sinks that count
 * writes.
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

describe("statusText (GAME-02/03)", () => {
  it("game-over before any game prompts to start", () => {
    expect(statusText("game-over", false, false)).toBe("PRESS ENTER TO START");
  });
  it("game-over after a game prompts to play again", () => {
    expect(statusText("game-over", true, false)).toBe("GAME OVER · PRESS ENTER");
  });
  it("tilted reads TILT with the warning flag false and true (tilt wins)", () => {
    expect(statusText("tilted", true, false)).toBe("TILT");
    expect(statusText("tilted", true, true)).toBe("TILT");
  });
  it("playing with a warning reads WARNING", () => {
    expect(statusText("playing", true, true)).toBe("WARNING");
  });
  it("plain playing is empty", () => {
    expect(statusText("playing", true, false)).toBe("");
  });
});

describe("ballText (GAME-02)", () => {
  it.each([
    [1, "BALL 1 / 3"],
    [2, "BALL 2 / 3"],
    [3, "BALL 3 / 3"],
  ])("playing on ball %d reads %s", (ball, text) => {
    expect(ballText("playing", ball)).toBe(text);
  });
  it("tilted on ball 2 reads BALL 2 / 3", () => {
    expect(ballText("tilted", 2)).toBe("BALL 2 / 3");
  });
  it.each([0, 1, 2, 3])("game-over at ball %d is empty", (ball) => {
    expect(ballText("game-over", ball)).toBe("");
  });
});

describe("HudView per-line write-on-change (R5, T-04-19)", () => {
  /** A view whose source is mid-game on ball 1, after its first update. */
  function playing() {
    const v = makeView();
    const src = new FakeSource();
    src.state = "playing";
    src.ball = 1;
    src.played = true;
    src.score = 500;
    v.view.update(src);
    return { ...v, src };
  }

  it("the first update writes each of the three sinks exactly once", () => {
    const { score, ball, status } = playing();
    expect(score.writes).toBe(1);
    expect(ball.writes).toBe(1);
    expect(status.writes).toBe(1);
    expect(score.textContent).toBe("500");
    expect(ball.textContent).toBe("BALL 1 / 3");
    expect(status.textContent).toBe("");
  });

  it("the first update writes all three even at the default inputs (attract)", () => {
    const { view, score, ball, status } = makeView();
    view.update(new FakeSource());
    expect([score.writes, ball.writes, status.writes]).toEqual([1, 1, 1]);
    expect(status.textContent).toBe("PRESS ENTER TO START");
  });

  it("100 further unchanged updates write nothing to any sink", () => {
    const { view, src, score, ball, status } = playing();
    for (let i = 0; i < 100; i++) view.update(src);
    expect([score.writes, ball.writes, status.writes]).toEqual([1, 1, 1]);
  });

  it("changing only the ball rewrites only the ball sink", () => {
    const { view, src, score, ball, status } = playing();
    src.ball = 2;
    view.update(src);
    view.update(src);
    expect([score.writes, ball.writes, status.writes]).toEqual([1, 2, 1]);
    expect(ball.textContent).toBe("BALL 2 / 3");
  });

  it("changing only the warning flag rewrites only the status sink", () => {
    const { view, src, score, ball, status } = playing();
    src.warning = true;
    view.update(src);
    view.update(src);
    expect([score.writes, ball.writes, status.writes]).toEqual([1, 1, 2]);
    expect(status.textContent).toBe("WARNING");
  });

  it("changing only the score rewrites only the score sink", () => {
    const { view, src, score, ball, status } = playing();
    src.score = 1500;
    view.update(src);
    view.update(src);
    expect([score.writes, ball.writes, status.writes]).toEqual([2, 1, 1]);
    expect(score.textContent).toBe("1,500");
  });
});
