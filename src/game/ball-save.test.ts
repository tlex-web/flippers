import { describe, it, expect } from "vitest";

import { BALL_RADIUS_M } from "../physics/constants";
import { CHUTE_X } from "../table/spec";
import { BallSave } from "./ball-save";
import { BALL_SAVE_BLINK_STEPS, BALL_SAVE_STEPS } from "./tuning";

/**
 * BallSave contracts (plan 06-07 Task 2, PLSH-07, D-09, D-10): the chute-exit
 * start (strict `x + BALL_RADIUS_M < CHUTE_X`), the counted window, the lamp
 * phases and one save per arm. Pure: driven only by `update(x)` calls.
 */

/** Inside the chute: the plunger lane centre. */
const IN_CHUTE_X = 3.15;

/** Just clear of the chute: 2.69 + 0.2 = 2.89 < 2.9. */
const CLEAR_X = 2.69;

/** On the line: 2.70 + 0.2 = 2.9, not strictly less, so not clear. */
const ON_LINE_X = 2.7;

/** A save armed and started on its first update. */
function started(): BallSave {
  const s = new BallSave();
  s.arm();
  s.update(CLEAR_X);
  return s;
}

describe("BallSave chute-exit start (D-09, research Pitfall 3)", () => {
  it("armed with the ball in the chute, 1000 updates never start it and the lamp stays steady", () => {
    const s = new BallSave();
    s.arm();
    for (let i = 0; i < 1000; i++) {
      s.update(IN_CHUTE_X);
      expect(s.isStarted()).toBe(false);
      expect(s.lampPhase()).toBe("steady");
    }
    expect(s.getRemaining()).toBe(BALL_SAVE_STEPS);
    expect(s.canSave()).toBe(false);
  });

  it("update(2.69) starts it (2.89 < 2.9)", () => {
    const s = new BallSave();
    s.arm();
    s.update(CLEAR_X);
    expect(s.isStarted()).toBe(true);
    expect(s.canSave()).toBe(true);
  });

  it("update(2.70) does not start it (2.9 is not strictly left of the chute line)", () => {
    const s = new BallSave();
    s.arm();
    s.update(ON_LINE_X);
    expect(s.isStarted()).toBe(false);
    expect(s.canSave()).toBe(false);
  });

  it("a ball exactly on the line (x + BALL_RADIUS_M === CHUTE_X in floating point) does not start it: the test is strict", () => {
    // 2.70 + 0.2 is 2.9000000000000004 in binary floating point, so it cannot
    // tell < from <=; CHUTE_X - BALL_RADIUS_M sums back to CHUTE_X exactly.
    const x = CHUTE_X - BALL_RADIUS_M;
    expect(x + BALL_RADIUS_M).toBe(CHUTE_X);
    const s = new BallSave();
    s.arm();
    s.update(x);
    expect(s.isStarted()).toBe(false);
  });

  it("NaN (no ball) never starts it", () => {
    const s = new BallSave();
    s.arm();
    s.update(Number.NaN);
    expect(s.isStarted()).toBe(false);
  });

  it("an unarmed save ignores updates", () => {
    const s = new BallSave();
    s.update(CLEAR_X);
    expect(s.isStarted()).toBe(false);
    expect(s.canSave()).toBe(false);
    expect(s.lampPhase()).toBe("off");
  });
});

describe("BallSave window and lamp (D-09, D-10)", () => {
  it("after starting, remaining counts down one per update, even back in the chute", () => {
    const s = started();
    expect(s.getRemaining()).toBe(BALL_SAVE_STEPS);
    s.update(CLEAR_X);
    expect(s.getRemaining()).toBe(BALL_SAVE_STEPS - 1);
    s.update(IN_CHUTE_X);
    expect(s.getRemaining()).toBe(BALL_SAVE_STEPS - 2);
  });

  it("the lamp is steady at 241 left, blinks at 240, and is off at 0 with canSave() false", () => {
    const s = started();
    while (s.getRemaining() > BALL_SAVE_BLINK_STEPS + 1) s.update(CLEAR_X);
    expect(s.getRemaining()).toBe(241);
    expect(s.lampPhase()).toBe("steady");
    s.update(CLEAR_X);
    expect(s.getRemaining()).toBe(240);
    expect(s.lampPhase()).toBe("blink");
    expect(s.canSave()).toBe(true);
    while (s.getRemaining() > 1) s.update(CLEAR_X);
    expect(s.lampPhase()).toBe("blink");
    expect(s.canSave()).toBe(true);
    s.update(CLEAR_X);
    expect(s.getRemaining()).toBe(0);
    expect(s.lampPhase()).toBe("off");
    expect(s.canSave()).toBe(false);
  });

  it("the window is exactly BALL_SAVE_STEPS updates once started", () => {
    const s = new BallSave();
    s.arm();
    let usable = 0;
    s.update(CLEAR_X); // the start
    while (s.canSave()) {
      usable++;
      s.update(CLEAR_X);
    }
    expect(usable).toBe(BALL_SAVE_STEPS);
  });
});

describe("BallSave one save per arm (D-09, T-6-13)", () => {
  it("consume('backstop') succeeds once and records the kind; a second consume fails", () => {
    const s = started();
    expect(s.consume("backstop")).toBe(true);
    expect(s.getLastKind()).toBe("backstop");
    expect(s.canSave()).toBe(false);
    expect(s.lampPhase()).toBe("off");
    expect(s.consume("backstop")).toBe(false);
    expect(s.consume("kickback")).toBe(false);
    expect(s.getLastKind()).toBe("backstop");
  });

  it("consume before the timer starts fails and changes nothing", () => {
    const s = new BallSave();
    s.arm();
    expect(s.consume("kickback")).toBe(false);
    expect(s.getLastKind()).toBe("none");
    expect(s.lampPhase()).toBe("steady");
    s.update(CLEAR_X);
    expect(s.consume("kickback")).toBe(true);
  });

  it("arm() after a consume re-arms with a full, unstarted window", () => {
    const s = started();
    s.update(CLEAR_X);
    s.consume("kickback");
    s.arm();
    expect(s.isStarted()).toBe(false);
    expect(s.getRemaining()).toBe(BALL_SAVE_STEPS);
    expect(s.lampPhase()).toBe("steady");
    s.update(CLEAR_X);
    expect(s.canSave()).toBe(true);
  });

  it("disarm() ends the save: no consume, lamp off", () => {
    const s = started();
    s.disarm();
    expect(s.canSave()).toBe(false);
    expect(s.consume("backstop")).toBe(false);
    expect(s.lampPhase()).toBe("off");
  });

  it("BallSave(0).arm() never arms (the save disabled)", () => {
    const s = new BallSave(0);
    s.arm();
    s.update(CLEAR_X);
    expect(s.canSave()).toBe(false);
    expect(s.lampPhase()).toBe("off");
    expect(s.consume("backstop")).toBe(false);
  });
});
