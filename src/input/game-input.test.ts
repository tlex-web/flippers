import { describe, it, expect, vi } from "vitest";

import { GameInput } from "./game-input";

/**
 * Unit proof for the Enter/NumpadEnter start latch (plan 04-05, R6). Like the
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
