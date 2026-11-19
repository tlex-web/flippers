import { describe, it, expect, vi } from "vitest";

import { PlungerInput } from "./plunger-input";

/**
 * Unit proof for the Space edge latch (plan 03-05, D-08). Like the flipper input
 * tests, every case drives the directly-callable handlers with SYNTHETIC
 * `{ code, repeat, preventDefault }` objects: no DOM, no `window`, no engine.
 */

/** A synthetic keydown/keyup with a spied `preventDefault`. */
function ev(code: string, repeat = false) {
  return { code, repeat, preventDefault: vi.fn() };
}

describe("PlungerInput: Space press/release/cancel latch (D-08)", () => {
  it("a Space keydown latches exactly one press edge, and the drain resets it", () => {
    const input = new PlungerInput();
    input.handleKeyDown(ev("Space"));

    const first = input.drainEdges();
    expect(first.press).toBe(true);
    expect(first.release).toBe(false);
    expect(first.cancel).toBe(false);

    const second = input.drainEdges();
    expect(second.press).toBe(false);
  });

  it("an auto-repeat keydown latches nothing", () => {
    const input = new PlungerInput();
    input.handleKeyDown(ev("Space", true));
    const edges = input.drainEdges();
    expect(edges.press).toBe(false);
    expect(edges.release).toBe(false);
    expect(edges.cancel).toBe(false);
  });

  it("auto-repeat while held never re-charges: no second press edge", () => {
    const input = new PlungerInput();
    input.handleKeyDown(ev("Space"));
    input.drainEdges();
    for (let i = 0; i < 5; i++) input.handleKeyDown(ev("Space", true));
    expect(input.drainEdges().press).toBe(false);
  });

  it("a duplicate non-repeat keydown while held latches nothing", () => {
    const input = new PlungerInput();
    input.handleKeyDown(ev("Space"));
    input.drainEdges();
    input.handleKeyDown(ev("Space"));
    expect(input.drainEdges().press).toBe(false);
  });

  it("a keyup latches exactly one release edge", () => {
    const input = new PlungerInput();
    input.handleKeyDown(ev("Space"));
    input.drainEdges();
    input.handleKeyUp(ev("Space"));
    const edges = input.drainEdges();
    expect(edges.release).toBe(true);
    expect(edges.press).toBe(false);
    expect(edges.cancel).toBe(false);
    // A second keyup without a new keydown is not a second release.
    input.handleKeyUp(ev("Space"));
    expect(input.drainEdges().release).toBe(false);
  });

  it("a keyup with no tracked keydown (e.g. its keydown was a repeat) latches nothing", () => {
    const input = new PlungerInput();
    input.handleKeyDown(ev("Space", true));
    input.handleKeyUp(ev("Space"));
    expect(input.drainEdges().release).toBe(false);
  });

  it("blur while held latches exactly one cancel edge and NO release edge", () => {
    const input = new PlungerInput();
    input.handleKeyDown(ev("Space"));
    input.drainEdges();
    input.handleBlur();
    const edges = input.drainEdges();
    expect(edges.cancel).toBe(true);
    expect(edges.release).toBe(false);
    expect(edges.press).toBe(false);
    // The keyup that arrives after refocus is not a launch either.
    input.handleKeyUp(ev("Space"));
    expect(input.drainEdges().release).toBe(false);
  });

  it("visibility hidden while held latches exactly one cancel edge and NO release edge", () => {
    const input = new PlungerInput();
    input.handleKeyDown(ev("Space"));
    input.drainEdges();
    input.handleVisibilityChange(true);
    const edges = input.drainEdges();
    expect(edges.cancel).toBe(true);
    expect(edges.release).toBe(false);
  });

  it("visibility visible is a no-op while held", () => {
    const input = new PlungerInput();
    input.handleKeyDown(ev("Space"));
    input.drainEdges();
    input.handleVisibilityChange(false);
    const edges = input.drainEdges();
    expect(edges.cancel).toBe(false);
    expect(edges.release).toBe(false);
  });

  it("blur while not held latches nothing", () => {
    const input = new PlungerInput();
    input.handleBlur();
    input.handleVisibilityChange(true);
    const edges = input.drainEdges();
    expect(edges.cancel).toBe(false);
    expect(edges.release).toBe(false);
    expect(edges.press).toBe(false);
  });

  it("drainEdges() returns the identical object on every call", () => {
    const input = new PlungerInput();
    const a = input.drainEdges();
    input.handleKeyDown(ev("Space"));
    const b = input.drainEdges();
    expect(b).toBe(a);
  });

  it("preventDefaults Space only, never KeyZ or any other code", () => {
    const input = new PlungerInput();
    const space = ev("Space");
    const spaceUp = ev("Space");
    input.handleKeyDown(space);
    input.handleKeyUp(spaceUp);
    expect(space.preventDefault).toHaveBeenCalledTimes(1);
    expect(spaceUp.preventDefault).toHaveBeenCalledTimes(1);

    for (const code of ["KeyZ", "Slash", "Enter", "ArrowUp"]) {
      const down = ev(code);
      const up = ev(code);
      input.handleKeyDown(down);
      input.handleKeyUp(up);
      expect(down.preventDefault).not.toHaveBeenCalled();
      expect(up.preventDefault).not.toHaveBeenCalled();
    }
    // ...and other codes latch nothing.
    input.drainEdges();
    input.handleKeyDown(ev("KeyZ"));
    expect(input.drainEdges().press).toBe(false);
  });
});
