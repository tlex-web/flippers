import { describe, it, expect, vi } from "vitest";

import { GameInput } from "./game-input";

/**
 * Unit proof for the Enter/NumpadEnter start latch (plan 04-05, R6) and the
 * KeyX/Period/ArrowUp nudge latch (plan 04-06, R9). Like the
 * other input tests, every case drives the directly-callable handlers with
 * SYNTHETIC `{ code, repeat, preventDefault }` objects: no DOM, no engine.
 */

/** A synthetic keydown/keyup with a spied `preventDefault`. */
function ev(code: string, repeat = false) {
  return { code, repeat, preventDefault: vi.fn() };
}

describe("GameInput: start latch (R6)", () => {
  it("an Enter keydown latches exactly one start edge, and the drain resets it", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("Enter"));
    expect(input.drainEdges().start).toBe(true);
    expect(input.drainEdges().start).toBe(false);
  });

  it("a NumpadEnter keydown latches a start edge", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("NumpadEnter"));
    expect(input.drainEdges().start).toBe(true);
  });

  it("an auto-repeat keydown latches nothing", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("Enter", true));
    expect(input.drainEdges().start).toBe(false);
  });

  it("a second keydown without a keyup latches nothing; keyup then keydown latches again", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("Enter"));
    input.drainEdges();
    input.handleKeyDown(ev("Enter"));
    expect(input.drainEdges().start).toBe(false);
    input.handleKeyUp(ev("Enter"));
    expect(input.drainEdges().start).toBe(false); // keyup alone latches nothing
    input.handleKeyDown(ev("Enter"));
    expect(input.drainEdges().start).toBe(true);
  });

  it("preventDefault fires for Enter and NumpadEnter, never for KeyA or Space", () => {
    const input = new GameInput();
    const enter = ev("Enter");
    const numpad = ev("NumpadEnter");
    const keyA = ev("KeyA");
    const space = ev("Space");
    input.handleKeyDown(enter);
    input.handleKeyDown(numpad);
    input.handleKeyDown(keyA);
    input.handleKeyDown(space);
    input.handleKeyUp(keyA);
    input.handleKeyUp(space);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(numpad.preventDefault).toHaveBeenCalled();
    expect(keyA.preventDefault).not.toHaveBeenCalled();
    expect(space.preventDefault).not.toHaveBeenCalled();
  });

  it("KeyA and Space never latch a start", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("KeyA"));
    input.handleKeyDown(ev("Space"));
    expect(input.drainEdges().start).toBe(false);
  });

  it("drainEdges() returns the same object on every call", () => {
    const input = new GameInput();
    const a = input.drainEdges();
    input.handleKeyDown(ev("Enter"));
    const b = input.drainEdges();
    expect(b).toBe(a);
    expect(b.start).toBe(true);
    expect(input.drainEdges().start).toBe(false);
  });

  it("after handleBlur() the next Enter keydown latches, and blur itself latches nothing", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("Enter"));
    input.drainEdges();
    input.handleBlur();
    expect(input.drainEdges().start).toBe(false);
    input.handleKeyDown(ev("Enter"));
    expect(input.drainEdges().start).toBe(true);
  });

  it("after handleVisibilityChange(true) the next Enter keydown latches", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("Enter"));
    input.drainEdges();
    input.handleVisibilityChange(true);
    expect(input.drainEdges().start).toBe(false);
    input.handleKeyDown(ev("Enter"));
    expect(input.drainEdges().start).toBe(true);
  });

  it("handleVisibilityChange(false) keeps the held flag: a duplicate keydown still latches nothing", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("Enter"));
    input.drainEdges();
    input.handleVisibilityChange(false);
    input.handleKeyDown(ev("Enter"));
    expect(input.drainEdges().start).toBe(false);
  });
});

/** The nudge codes and the edge each one latches (plan 04-06, R9). */
const NUDGE_KEYS = [
  { code: "KeyX", edge: "nudgeLeft" },
  { code: "Period", edge: "nudgeRight" },
  { code: "ArrowUp", edge: "nudgeUp" },
] as const;

/** Codes owned by the flipper and plunger latches; GameInput must never touch them. */
const FOREIGN_CODES = [
  "KeyZ",
  "Slash",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
] as const;

/** Every edge in the drained view, as a plain object for whole-view comparisons. */
function snapshot(input: GameInput) {
  const e = input.drainEdges();
  return {
    start: e.start,
    nudgeLeft: e.nudgeLeft,
    nudgeRight: e.nudgeRight,
    nudgeUp: e.nudgeUp,
    mute: e.mute,
  };
}

const NONE = {
  start: false,
  nudgeLeft: false,
  nudgeRight: false,
  nudgeUp: false,
  mute: false,
} as const;

describe("GameInput: nudge latch (R9)", () => {
  for (const { code, edge } of NUDGE_KEYS) {
    it(`${code} latches only ${edge}; start stays false`, () => {
      const input = new GameInput();
      input.handleKeyDown(ev(code));
      expect(snapshot(input)).toEqual({ ...NONE, [edge]: true });
      expect(snapshot(input)).toEqual(NONE);
    });

    it(`an auto-repeat ${code} keydown latches nothing`, () => {
      const input = new GameInput();
      input.handleKeyDown(ev(code, true));
      expect(snapshot(input)).toEqual(NONE);
    });

    it(`a second ${code} keydown without a keyup latches nothing; keyup then keydown latches again`, () => {
      const input = new GameInput();
      input.handleKeyDown(ev(code));
      input.drainEdges();
      input.handleKeyDown(ev(code));
      expect(snapshot(input)).toEqual(NONE);
      input.handleKeyUp(ev(code));
      expect(snapshot(input)).toEqual(NONE); // keyup alone latches nothing
      input.handleKeyDown(ev(code));
      expect(snapshot(input)).toEqual({ ...NONE, [edge]: true });
    });

    it(`preventDefault fires for ${code} on keydown, repeat and keyup`, () => {
      const input = new GameInput();
      const down = ev(code);
      const repeat = ev(code, true);
      const up = ev(code);
      input.handleKeyDown(down);
      input.handleKeyDown(repeat);
      input.handleKeyUp(up);
      expect(down.preventDefault).toHaveBeenCalled();
      expect(repeat.preventDefault).toHaveBeenCalled();
      expect(up.preventDefault).toHaveBeenCalled();
    });

    it(`after handleBlur() while ${code} is held, the next ${code} keydown latches`, () => {
      const input = new GameInput();
      input.handleKeyDown(ev(code));
      input.drainEdges();
      input.handleBlur();
      expect(snapshot(input)).toEqual(NONE);
      input.handleKeyDown(ev(code));
      expect(snapshot(input)).toEqual({ ...NONE, [edge]: true });
    });

    it(`after handleVisibilityChange(true) while ${code} is held, the next ${code} keydown latches`, () => {
      const input = new GameInput();
      input.handleKeyDown(ev(code));
      input.drainEdges();
      input.handleVisibilityChange(true);
      expect(snapshot(input)).toEqual(NONE);
      input.handleKeyDown(ev(code));
      expect(snapshot(input)).toEqual({ ...NONE, [edge]: true });
    });
  }

  it("the three nudge keys and Enter latch independently in one window", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("KeyX"));
    input.handleKeyDown(ev("Period"));
    input.handleKeyDown(ev("ArrowUp"));
    input.handleKeyDown(ev("Enter"));
    expect(snapshot(input)).toEqual({
      ...NONE,
      start: true,
      nudgeLeft: true,
      nudgeRight: true,
      nudgeUp: true,
    });
  });

  it("never calls preventDefault on, or latches, a flipper key or Space", () => {
    const input = new GameInput();
    for (const code of FOREIGN_CODES) {
      const down = ev(code);
      const repeat = ev(code, true);
      const up = ev(code);
      input.handleKeyDown(down);
      input.handleKeyDown(repeat);
      input.handleKeyUp(up);
      expect(down.preventDefault, code).not.toHaveBeenCalled();
      expect(repeat.preventDefault, code).not.toHaveBeenCalled();
      expect(up.preventDefault, code).not.toHaveBeenCalled();
      expect(snapshot(input), code).toEqual(NONE);
    }
  });

  it("drainEdges() resets all three nudge edges on the same reused view", () => {
    const input = new GameInput();
    const first = input.drainEdges();
    input.handleKeyDown(ev("KeyX"));
    input.handleKeyDown(ev("Period"));
    input.handleKeyDown(ev("ArrowUp"));
    const latched = input.drainEdges();
    expect(latched).toBe(first);
    expect(latched.nudgeLeft && latched.nudgeRight && latched.nudgeUp).toBe(true);
    const drained = input.drainEdges();
    expect(drained).toBe(first);
    expect(drained.nudgeLeft).toBe(false);
    expect(drained.nudgeRight).toBe(false);
    expect(drained.nudgeUp).toBe(false);
  });
});

describe("GameInput: mute latch (05-06, D-02)", () => {
  it("a KeyM keydown latches only mute, and the next drain resets it", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("KeyM"));
    expect(snapshot(input)).toEqual({ ...NONE, mute: true });
    expect(snapshot(input)).toEqual(NONE);
  });

  it("an auto-repeat KeyM keydown latches nothing", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("KeyM", true));
    expect(snapshot(input)).toEqual(NONE);
  });

  it("a second KeyM keydown without a keyup latches nothing; keyup then keydown latches again", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("KeyM"));
    input.drainEdges();
    input.handleKeyDown(ev("KeyM"));
    expect(snapshot(input)).toEqual(NONE);
    input.handleKeyUp(ev("KeyM"));
    expect(snapshot(input)).toEqual(NONE); // keyup alone latches nothing
    input.handleKeyDown(ev("KeyM"));
    expect(snapshot(input)).toEqual({ ...NONE, mute: true });
  });

  it("preventDefault fires for KeyM on keydown, repeat and keyup", () => {
    const input = new GameInput();
    const down = ev("KeyM");
    const repeat = ev("KeyM", true);
    const up = ev("KeyM");
    input.handleKeyDown(down);
    input.handleKeyDown(repeat);
    input.handleKeyUp(up);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(repeat.preventDefault).toHaveBeenCalled();
    expect(up.preventDefault).toHaveBeenCalled();
  });

  it("after handleBlur() while KeyM is held, the next KeyM keydown latches", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("KeyM"));
    input.drainEdges();
    input.handleBlur();
    expect(snapshot(input)).toEqual(NONE);
    input.handleKeyDown(ev("KeyM"));
    expect(snapshot(input)).toEqual({ ...NONE, mute: true });
  });

  it("KeyM, Enter and the three nudge keys latch independently in one window", () => {
    const input = new GameInput();
    input.handleKeyDown(ev("KeyM"));
    input.handleKeyDown(ev("Enter"));
    input.handleKeyDown(ev("KeyX"));
    input.handleKeyDown(ev("Period"));
    input.handleKeyDown(ev("ArrowUp"));
    expect(snapshot(input)).toEqual({
      start: true,
      nudgeLeft: true,
      nudgeRight: true,
      nudgeUp: true,
      mute: true,
    });
  });

  it("no flipper key or Space ever latches mute", () => {
    const input = new GameInput();
    for (const code of FOREIGN_CODES) {
      input.handleKeyDown(ev(code));
      input.handleKeyDown(ev(code, true));
      input.handleKeyUp(ev(code));
      expect(input.drainEdges().mute, code).toBe(false);
    }
  });
});

describe("GameInput: modifier shortcuts pass through (05-REVIEW IN-03)", () => {
  const MODS = [{ ctrlKey: true }, { metaKey: true }, { altKey: true }] as const;

  it("KeyM with Ctrl, Meta or Alt latches nothing, is not prevented and is not held", () => {
    for (const mod of MODS) {
      const input = new GameInput();
      const down = { ...ev("KeyM"), ...mod };
      input.handleKeyDown(down);
      expect(down.preventDefault).not.toHaveBeenCalled();
      expect(snapshot(input)).toEqual(NONE);
      // Its keyup was lost (Cmd+M minimized the window): a plain M still latches.
      input.handleKeyDown(ev("KeyM"));
      expect(snapshot(input)).toEqual({ ...NONE, mute: true });
    }
  });

  it("Shift never blocks an edge (it is a flipper key)", () => {
    const input = new GameInput();
    input.handleKeyDown({ ...ev("KeyM"), shiftKey: true });
    input.handleKeyDown({ ...ev("KeyX"), shiftKey: true });
    expect(snapshot(input)).toEqual({ ...NONE, nudgeLeft: true, mute: true });
  });

  it("explicit false modifiers latch as usual", () => {
    const input = new GameInput();
    input.handleKeyDown({ ...ev("Enter"), ctrlKey: false, metaKey: false, altKey: false });
    expect(snapshot(input)).toEqual({ ...NONE, start: true });
  });
});
