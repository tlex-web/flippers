import { describe, it, expect, vi } from "vitest";

import { FlipperInput } from "./flipper-input";
import type { KeyEventLike } from "./flipper-input";

/**
 * Unit proof for the first keyboard-input module in the codebase (D-10). Every
 * assertion drives the directly-callable handler methods with SYNTHETIC event
 * objects (the minimal `{ code, repeat, preventDefault }` shape) — the test never
 * touches a real DOM, `window`, or `document`, mirroring the engine-agnostic
 * unit-test discipline (no `planck`, no browser globals). It covers each behavior
 * bullet: `event.code` keying, `event.repeat` suppression, per-side OR edges,
 * bound-only `preventDefault`, and blur / visibility force-clear.
 */

/** Build a synthetic keydown/keyup with a spied `preventDefault`. */
function ev(code: string, repeat = false): KeyEventLike & { preventDefault: ReturnType<typeof vi.fn> } {
  return { code, repeat, preventDefault: vi.fn() };
}

describe("FlipperInput — held set + per-side latched edges (D-09/D-10)", () => {
  it("emits a left PRESS edge on a genuine keydown and clears it on drain", () => {
    const input = new FlipperInput();
    input.handleKeyDown(ev("KeyZ"));

    const first = input.drainEdges();
    expect(first.leftPress).toBe(true);
    expect(first.leftRelease).toBe(false);
    expect(first.rightPress).toBe(false);

    // Drain resets the latch — a second drain with no new input is empty.
    const second = input.drainEdges();
    expect(second.leftPress).toBe(false);
    expect(second.leftRelease).toBe(false);
  });

  it("ignores auto-repeat keydowns (event.repeat === true): no edge, no state change", () => {
    const input = new FlipperInput();
    const repeatDown = ev("KeyZ", true);

    input.handleKeyDown(repeatDown);

    expect(repeatDown.preventDefault).not.toHaveBeenCalled();
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(false);
    expect(edges.leftRelease).toBe(false);

    // Releasing a code that was never latched must NOT emit a phantom release.
    input.handleKeyUp(ev("KeyZ"));
    expect(input.drainEdges().leftRelease).toBe(false);
  });

  it("de-dupes an already-held code: two genuine KeyZ keydowns = ONE press edge", () => {
    const input = new FlipperInput();
    input.handleKeyDown(ev("KeyZ"));
    input.drainEdges(); // consume the first press

    input.handleKeyDown(ev("KeyZ")); // same physical key, repeat === false
    expect(input.drainEdges().leftPress).toBe(false);
  });

  it("per-side OR: KeyZ then ShiftLeft = one press; release fires only when ALL codes are up", () => {
    const input = new FlipperInput();

    input.handleKeyDown(ev("KeyZ"));
    input.handleKeyDown(ev("ShiftLeft"));
    const afterBoth = input.drainEdges();
    expect(afterBoth.leftPress).toBe(true); // exactly one press for the side
    expect(afterBoth.leftRelease).toBe(false);

    // Release only KeyZ — ShiftLeft still down → side still held → NO release.
    input.handleKeyUp(ev("KeyZ"));
    expect(input.drainEdges().leftRelease).toBe(false);

    // Release ShiftLeft — now ALL left codes are up → release edge.
    input.handleKeyUp(ev("ShiftLeft"));
    expect(input.drainEdges().leftRelease).toBe(true);
  });

  it("routes the right-side bindings (Slash / ShiftRight / ArrowRight) independently", () => {
    const input = new FlipperInput();

    input.handleKeyDown(ev("ArrowRight"));
    const edges = input.drainEdges();
    expect(edges.rightPress).toBe(true);
    expect(edges.leftPress).toBe(false);

    input.handleKeyUp(ev("ArrowRight"));
    expect(input.drainEdges().rightRelease).toBe(true);
  });

  it("preventDefaults bound codes (ArrowLeft, Slash) but NEVER reserved codes (Space, KeyX, ArrowUp)", () => {
    const input = new FlipperInput();

    const arrowLeft = ev("ArrowLeft");
    const slash = ev("Slash");
    input.handleKeyDown(arrowLeft);
    input.handleKeyDown(slash);
    expect(arrowLeft.preventDefault).toHaveBeenCalledTimes(1);
    expect(slash.preventDefault).toHaveBeenCalledTimes(1);

    for (const reserved of ["Space", "KeyX", "Period", "ArrowUp"]) {
      const e = ev(reserved);
      input.handleKeyDown(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }

    // Reserved / unbound codes must not have moved any side into a held state.
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(true); // from ArrowLeft
    expect(edges.rightPress).toBe(true); // from Slash
    // ...but no phantom edges from the reserved keys beyond those two.
    input.handleKeyUp(ev("Space"));
    input.handleKeyUp(ev("ArrowUp"));
    expect(input.drainEdges().leftRelease).toBe(false);
  });

  it("handleBlur() force-clears the held set and emits a RELEASE for every held side", () => {
    const input = new FlipperInput();
    input.handleKeyDown(ev("KeyZ")); // left held
    input.handleKeyDown(ev("Slash")); // right held
    input.drainEdges(); // consume the two presses

    input.handleBlur();
    const edges = input.drainEdges();
    expect(edges.leftRelease).toBe(true);
    expect(edges.rightRelease).toBe(true);

    // The set is genuinely cleared: a subsequent drain is empty, and a later
    // keyup for a formerly-held code emits no phantom release.
    expect(input.drainEdges().leftRelease).toBe(false);
    input.handleKeyUp(ev("KeyZ"));
    expect(input.drainEdges().leftRelease).toBe(false);
  });

  it("handleVisibilityChange(true) force-clears like blur; (false) is a no-op", () => {
    const input = new FlipperInput();
    input.handleKeyDown(ev("ArrowLeft"));
    input.drainEdges();

    input.handleVisibilityChange(false); // still visible → nothing happens
    expect(input.drainEdges().leftRelease).toBe(false);

    input.handleVisibilityChange(true); // hidden → force-clear + release
    expect(input.drainEdges().leftRelease).toBe(true);
  });

  it("force-clear is idempotent and allocation-safe when nothing is held", () => {
    const input = new FlipperInput();
    input.handleBlur();
    input.handleVisibilityChange(true);
    const edges = input.drainEdges();
    expect(edges.leftRelease).toBe(false);
    expect(edges.rightRelease).toBe(false);
  });

  it("reuses the SAME held Set and edge view across drains (zero per-drain allocation)", () => {
    const input = new FlipperInput();
    const a = input.drainEdges();
    const b = input.drainEdges();
    expect(a).toBe(b); // the drain view is a reused object, not freshly allocated
  });
});
