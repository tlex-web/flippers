import { afterEach, describe, it, expect, vi } from "vitest";

import { FlipperInput, isWindowsPlatform, SHIFT_REPEAT_GAP_MS } from "./flipper-input";

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
function ev(code: string, repeat = false) {
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

describe("FlipperInput.isHeld (Pitfall 5: the held-key re-press on serve)", () => {
  it("left is held while any of KeyZ, ShiftLeft or ArrowLeft is down, and not once all three are up", () => {
    const input = new FlipperInput();
    expect(input.isHeld("left")).toBe(false);

    input.handleKeyDown(ev("KeyZ"));
    expect(input.isHeld("left")).toBe(true);
    input.handleKeyDown(ev("ShiftLeft"));
    input.handleKeyDown(ev("ArrowLeft"));
    expect(input.isHeld("left")).toBe(true);

    input.handleKeyUp(ev("KeyZ"));
    expect(input.isHeld("left")).toBe(true);
    input.handleKeyUp(ev("ShiftLeft"));
    expect(input.isHeld("left")).toBe(true);
    input.handleKeyUp(ev("ArrowLeft"));
    expect(input.isHeld("left")).toBe(false);
  });

  it("each left code alone makes the left side held", () => {
    for (const code of ["KeyZ", "ShiftLeft", "ArrowLeft"]) {
      const input = new FlipperInput();
      input.handleKeyDown(ev(code));
      expect(input.isHeld("left")).toBe(true);
      input.handleKeyUp(ev(code));
      expect(input.isHeld("left")).toBe(false);
    }
  });

  it("is false after handleBlur()", () => {
    const input = new FlipperInput();
    input.handleKeyDown(ev("KeyZ"));
    input.handleKeyDown(ev("Slash"));
    input.handleBlur();
    expect(input.isHeld("left")).toBe(false);
    expect(input.isHeld("right")).toBe(false);
  });

  it("the right side is independent of the left", () => {
    const input = new FlipperInput();
    input.handleKeyDown(ev("KeyZ"));
    expect(input.isHeld("left")).toBe(true);
    expect(input.isHeld("right")).toBe(false);

    input.handleKeyDown(ev("Slash"));
    input.handleKeyUp(ev("KeyZ"));
    expect(input.isHeld("left")).toBe(false);
    expect(input.isHeld("right")).toBe(true);
  });

  it("does not drain or latch anything", () => {
    const input = new FlipperInput();
    input.handleKeyDown(ev("KeyZ"));
    input.drainEdges();
    expect(input.isHeld("left")).toBe(true);
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(false);
    expect(edges.leftRelease).toBe(false);
  });
});

describe("focus regain (G-04-11)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handleFocus() force-clears like blur: releases every held side and un-dedupes the codes", () => {
    const input = new FlipperInput();
    input.handleKeyDown(ev("KeyZ"));
    input.handleKeyDown(ev("ShiftRight"));
    input.drainEdges();

    input.handleFocus();
    const edges = input.drainEdges();
    expect(edges.leftRelease).toBe(true);
    expect(edges.rightRelease).toBe(true);
    expect(input.isHeld("left")).toBe(false);
    expect(input.isHeld("right")).toBe(false);

    // A late keyup of a cleared code emits no phantom release.
    input.handleKeyUp(ev("KeyZ"));
    input.handleKeyUp(ev("ShiftRight"));
    const after = input.drainEdges();
    expect(after.leftRelease).toBe(false);
    expect(after.rightRelease).toBe(false);

    // A fresh ShiftRight keydown is no longer de-duped.
    input.handleKeyDown(ev("ShiftRight"));
    expect(input.drainEdges().rightPress).toBe(true);
  });

  it("handleFocus() with nothing held emits no edges", () => {
    const input = new FlipperInput();
    input.handleFocus();
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(false);
    expect(edges.leftRelease).toBe(false);
    expect(edges.rightPress).toBe(false);
    expect(edges.rightRelease).toBe(false);
  });

  it("attach() registers a window focus listener that clears the held set; detach() removes the same function", () => {
    const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const doc = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);

    const input = new FlipperInput();
    input.attach();

    const focusCall = win.addEventListener.mock.calls.find((c) => c[0] === "focus");
    expect(focusCall).toBeDefined();
    const onFocus: unknown = focusCall?.[1];
    expect(typeof onFocus).toBe("function");

    // The captured listener routes to the force-clear.
    input.handleKeyDown(ev("KeyZ"));
    input.drainEdges();
    (onFocus as () => void)();
    expect(input.drainEdges().leftRelease).toBe(true);

    // The pre-existing listeners are still wired.
    const added = win.addEventListener.mock.calls.map((c) => c[0]);
    expect(added).toEqual(expect.arrayContaining(["keydown", "keyup", "blur", "focus"]));
    expect(doc.addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    input.detach();
    expect(win.removeEventListener).toHaveBeenCalledWith("focus", onFocus);
    const removed = win.removeEventListener.mock.calls.map((c) => c[0]);
    expect(removed).toEqual(expect.arrayContaining(["keydown", "keyup", "blur", "focus"]));
    expect(doc.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});

describe("stale Shift reconciliation (G-04-11)", () => {
  /** A synthetic key event with an explicit modifier state. */
  function sev(code: string, shiftKey: boolean, repeat = false) {
    return { code, shiftKey, repeat, preventDefault: vi.fn() };
  }

  /** ShiftLeft/ShiftRight keydown with Shift reported down, drained, never released. */
  function staleShift(code: "ShiftLeft" | "ShiftRight"): FlipperInput {
    const input = new FlipperInput();
    input.handleKeyDown(sev(code, true));
    input.drainEdges();
    return input;
  }

  for (const c of [
    { shift: "ShiftLeft", side: "left", other: ["KeyZ", "ArrowLeft"] },
    { shift: "ShiftRight", side: "right", other: ["Slash", "ArrowRight"] },
  ] as const) {
    for (const code of c.other) {
      it(`B1: over a stale ${c.shift}, a ${code} tap latches no edge on keydown and releases the ${c.side} side on keyup`, () => {
        const input = staleShift(c.shift);
        const press = c.side === "left" ? "leftPress" : "rightPress";
        const release = c.side === "left" ? "leftRelease" : "rightRelease";

        input.handleKeyDown(sev(code, false));
        const down = input.drainEdges();
        expect(down[press]).toBe(false);
        expect(down[release]).toBe(false);
        expect(input.isHeld(c.side)).toBe(true);

        input.handleKeyUp(sev(code, false));
        expect(input.drainEdges()[release]).toBe(true);
        expect(input.isHeld(c.side)).toBe(false);
      });
    }
  }

  for (const code of ["Space", "Enter"]) {
    it(`B2: an unbound ${code} keydown with Shift up drops a stale ShiftLeft without preventDefault`, () => {
      const input = staleShift("ShiftLeft");
      const e = sev(code, false);
      input.handleKeyDown(e);
      expect(input.drainEdges().leftRelease).toBe(true);
      expect(input.isHeld("left")).toBe(false);
      expect(e.preventDefault).not.toHaveBeenCalled();
    });
  }

  it("B3: cross-side, an ArrowRight keydown with Shift up releases a stale ShiftLeft and presses right in one drain", () => {
    const input = staleShift("ShiftLeft");
    input.handleKeyDown(sev("ArrowRight", false));
    const edges = input.drainEdges();
    expect(edges.leftRelease).toBe(true);
    expect(edges.rightPress).toBe(true);
  });

  it("B4: an auto-repeat keydown carries valid modifier state: it heals a stale Shift but never presses or preventDefaults", () => {
    const input = staleShift("ShiftLeft");
    const e = sev("ArrowLeft", false, true);
    input.handleKeyDown(e);
    const edges = input.drainEdges();
    expect(edges.leftRelease).toBe(true);
    expect(edges.leftPress).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("B5: a held Shift is kept: KeyX down/up with Shift reported down latches nothing", () => {
    const input = new FlipperInput();
    input.handleKeyDown(sev("ShiftLeft", true));
    input.handleKeyDown(sev("ShiftRight", true));
    input.drainEdges();

    input.handleKeyDown(sev("KeyX", true));
    input.handleKeyUp(sev("KeyX", true));
    const edges = input.drainEdges();
    expect(edges.leftPress || edges.leftRelease || edges.rightPress || edges.rightRelease).toBe(
      false,
    );
    expect(input.isHeld("left")).toBe(true);
    expect(input.isHeld("right")).toBe(true);
  });

  it("B6: Shift-key events never reconcile: a ShiftLeft keyup reporting shiftKey false keeps a held ShiftRight", () => {
    const input = new FlipperInput();
    input.handleKeyDown(sev("ShiftLeft", true));
    input.handleKeyDown(sev("ShiftRight", true));
    input.drainEdges();

    input.handleKeyUp(sev("ShiftLeft", false));
    const edges = input.drainEdges();
    expect(edges.leftRelease).toBe(true);
    expect(edges.rightRelease).toBe(false);
    expect(input.isHeld("right")).toBe(true);
  });

  it("B7: an event without a shiftKey field (unknown modifier state) never reconciles", () => {
    const input = new FlipperInput();
    input.handleKeyDown(ev("ShiftLeft"));
    input.drainEdges();

    input.handleKeyDown(ev("KeyX"));
    const edges = input.drainEdges();
    expect(edges.leftPress || edges.leftRelease || edges.rightPress || edges.rightRelease).toBe(
      false,
    );
    expect(input.isHeld("left")).toBe(true);
  });
});

describe("Windows both-Shift merge (G-04-17)", () => {
  /**
   * A synthetic key event shaped like the live Chrome 157 / Windows 11 capture:
   * explicit Shift modifier state and repeat flag (s = shiftKey, r = repeat).
   */
  function wev(code: string, shiftKey: boolean, repeat: boolean) {
    return { code, shiftKey, repeat, preventDefault: vi.fn() };
  }

  it("A1: captured order A (LD RD LU RU) presses both sides and the final ShiftRight keyup releases both", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });

    input.handleKeyDown(wev("ShiftLeft", true, false));
    expect(input.drainEdges().leftPress).toBe(true);

    // Windows flags the second Shift press as a repeat (one shared VK_SHIFT).
    const second = wev("ShiftRight", true, true);
    input.handleKeyDown(second);
    expect(input.drainEdges().rightPress).toBe(true);
    expect(second.preventDefault).toHaveBeenCalledTimes(1);

    // Physical LU sends nothing; the only keyup is ShiftRight with Shift up.
    input.handleKeyUp(wev("ShiftRight", false, false));
    const end = input.drainEdges();
    expect(end.leftRelease).toBe(true);
    expect(end.rightRelease).toBe(true);
    expect(input.isHeld("left")).toBe(false);
    expect(input.isHeld("right")).toBe(false);
  });

  /**
   * Replay a captured both-Shift order on a heal-on input, draining after every
   * event: the first press, the repeat-flagged second press, then the only
   * keyup Windows delivers (shiftKey false).
   */
  function replayOrder(
    first: "ShiftLeft" | "ShiftRight",
    second: "ShiftLeft" | "ShiftRight",
    final: "ShiftLeft" | "ShiftRight",
  ): void {
    const input = new FlipperInput({ windowsShiftHeal: true });
    const pressOf = (c: string) => (c === "ShiftLeft" ? "leftPress" : "rightPress");

    input.handleKeyDown(wev(first, true, false));
    expect(input.drainEdges()[pressOf(first)]).toBe(true);

    input.handleKeyDown(wev(second, true, true));
    expect(input.drainEdges()[pressOf(second)]).toBe(true);

    input.handleKeyUp(wev(final, false, false));
    const end = input.drainEdges();
    expect(end.leftRelease).toBe(true);
    expect(end.rightRelease).toBe(true);
    expect(input.isHeld("left")).toBe(false);
    expect(input.isHeld("right")).toBe(false);
  }

  it("B: captured order B (LD RD RU LU) presses both sides and the final ShiftLeft keyup releases both", () => {
    replayOrder("ShiftLeft", "ShiftRight", "ShiftLeft");
  });

  it("D: captured order D (RD LD LU RU) presses both sides and the final ShiftRight keyup releases both", () => {
    replayOrder("ShiftRight", "ShiftLeft", "ShiftRight");
  });

  it("D': derived order D' (RD LD RU LU) presses both sides and the final ShiftLeft keyup releases both", () => {
    replayOrder("ShiftRight", "ShiftLeft", "ShiftLeft");
  });

  it("F: a ShiftLeft re-tap while ShiftRight is held is a plain repeat (no edge, no preventDefault)", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(wev("ShiftLeft", true, false));
    expect(input.drainEdges().leftPress).toBe(true);
    input.handleKeyDown(wev("ShiftRight", true, true));
    expect(input.drainEdges().rightPress).toBe(true);

    const retap = wev("ShiftLeft", true, true);
    input.handleKeyDown(retap);
    const mid = input.drainEdges();
    expect(mid.leftPress || mid.leftRelease || mid.rightPress || mid.rightRelease).toBe(false);
    expect(retap.preventDefault).not.toHaveBeenCalled();

    input.handleKeyUp(wev("ShiftRight", false, false));
    const end = input.drainEdges();
    expect(end.leftRelease).toBe(true);
    expect(end.rightRelease).toBe(true);
    expect(input.isHeld("left")).toBe(false);
    expect(input.isHeld("right")).toBe(false);
  });

  it("C: a single ShiftLeft tap presses then releases the left side only", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(wev("ShiftLeft", true, false));
    expect(input.drainEdges().leftPress).toBe(true);

    input.handleKeyUp(wev("ShiftLeft", false, false));
    const up = input.drainEdges();
    expect(up.leftRelease).toBe(true);
    expect(up.rightRelease).toBe(false);
    expect(up.rightPress).toBe(false);
  });

  it("a held Shift's own auto-repeat never re-triggers a flip or preventDefaults", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(wev("ShiftLeft", true, false));
    let presses = input.drainEdges().leftPress ? 1 : 0;
    for (let i = 0; i < 5; i++) {
      const rep = wev("ShiftLeft", true, true);
      input.handleKeyDown(rep);
      if (input.drainEdges().leftPress) presses++;
      expect(rep.preventDefault).not.toHaveBeenCalled();
    }
    expect(presses).toBe(1);

    input.handleKeyUp(wev("ShiftLeft", false, false));
    expect(input.drainEdges().leftRelease).toBe(true);
  });

  it("a lone Shift repeat with nothing held is not a second press: no edge, not held", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(wev("ShiftLeft", true, true));
    const edges = input.drainEdges();
    expect(edges.leftPress || edges.leftRelease || edges.rightPress || edges.rightRelease).toBe(
      false,
    );
    expect(input.isHeld("left")).toBe(false);
  });

  it("non-Shift repeats are untouched by the option: KeyZ then a KeyZ repeat is one press", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(wev("KeyZ", false, false));
    expect(input.drainEdges().leftPress).toBe(true);
    input.handleKeyDown(wev("KeyZ", false, true));
    expect(input.drainEdges().leftPress).toBe(false);
  });

  it("a one-of-two Shift release reporting shiftKey true never heals: left releases, right stays held", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(wev("ShiftLeft", true, false));
    input.handleKeyDown(wev("ShiftRight", true, true));
    input.drainEdges();

    input.handleKeyUp(wev("ShiftLeft", true, false));
    const edges = input.drainEdges();
    expect(edges.leftRelease).toBe(true);
    expect(edges.rightRelease).toBe(false);
    expect(input.isHeld("right")).toBe(true);
  });

  for (const make of [
    { label: "new FlipperInput()", build: () => new FlipperInput() },
    {
      label: "new FlipperInput({ windowsShiftHeal: false })",
      build: () => new FlipperInput({ windowsShiftHeal: false }),
    },
  ]) {
    it(`non-Windows guard (${make.label}): a repeat-flagged second Shift latches no press`, () => {
      const input = make.build();
      input.handleKeyDown(wev("ShiftLeft", true, false));
      input.drainEdges();
      input.handleKeyDown(wev("ShiftRight", true, true));
      expect(input.drainEdges().rightPress).toBe(false);
      expect(input.isHeld("right")).toBe(false);
    });

    it(`non-Windows guard (${make.label}): a ShiftRight keyup reporting shiftKey false keeps a held ShiftLeft`, () => {
      const input = make.build();
      input.handleKeyDown(wev("ShiftLeft", true, false));
      input.handleKeyDown(wev("ShiftRight", true, false));
      input.drainEdges();

      input.handleKeyUp(wev("ShiftRight", false, false));
      const edges = input.drainEdges();
      expect(edges.rightRelease).toBe(true);
      expect(edges.leftRelease).toBe(false);
      expect(input.isHeld("left")).toBe(true);
    });
  }

  describe("isWindowsPlatform", () => {
    it('is true for navigator.platform "Win32"', () => {
      expect(isWindowsPlatform({ platform: "Win32" })).toBe(true);
    });
    it('is true for userAgentData.platform "Windows"', () => {
      expect(isWindowsPlatform({ userAgentData: { platform: "Windows" } })).toBe(true);
    });
    it('is false for platform "MacIntel"', () => {
      expect(isWindowsPlatform({ platform: "MacIntel" })).toBe(false);
    });
    it('is false for platform "Linux x86_64"', () => {
      expect(isWindowsPlatform({ platform: "Linux x86_64" })).toBe(false);
    });
    it("is false for undefined", () => {
      expect(isWindowsPlatform(undefined)).toBe(false);
    });
    it("is false for an empty object", () => {
      expect(isWindowsPlatform({})).toBe(false);
    });
    it('falls back to platform "Win32" when userAgentData.platform is empty', () => {
      expect(isWindowsPlatform({ platform: "Win32", userAgentData: { platform: "" } })).toBe(true);
    });
    it('lets a non-empty userAgentData.platform "macOS" win over platform "Win32"', () => {
      expect(isWindowsPlatform({ platform: "Win32", userAgentData: { platform: "macOS" } })).toBe(
        false,
      );
    });
  });
});

describe("same-window release and press (WR-01)", () => {
  /** A synthetic key event with an explicit modifier state. */
  function kev(code: string, shiftKey: boolean, repeat = false) {
    return { code, shiftKey, repeat, preventDefault: vi.fn() };
  }

  /** A Shift keydown reporting Shift down, drained, whose keyup never arrives. */
  function staleShift(code: "ShiftLeft" | "ShiftRight"): FlipperInput {
    const input = new FlipperInput();
    input.handleKeyDown(kev(code, true));
    input.drainEdges();
    return input;
  }

  it("W1: a stale ShiftLeft healed by KeyX plus a KeyZ press in one window keeps the left bat up", () => {
    const input = staleShift("ShiftLeft");
    input.handleKeyDown(kev("KeyX", false));
    input.handleKeyDown(kev("KeyZ", false));
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(true);
    expect(edges.leftRelease).toBe(false);
    expect(input.isHeld("left")).toBe(true);
  });

  it("W2: mirror, a stale ShiftRight healed by KeyX plus a Slash press in one window keeps the right bat up", () => {
    const input = staleShift("ShiftRight");
    input.handleKeyDown(kev("KeyX", false));
    input.handleKeyDown(kev("Slash", false));
    const edges = input.drainEdges();
    expect(edges.rightPress).toBe(true);
    expect(edges.rightRelease).toBe(false);
    expect(input.isHeld("right")).toBe(true);
  });

  it("W3: a finger roll (ShiftLeft up, KeyZ down) inside one window keeps the left bat up", () => {
    const input = new FlipperInput();
    input.handleKeyDown(kev("ShiftLeft", true));
    input.drainEdges();
    input.handleKeyUp(kev("ShiftLeft", false));
    input.handleKeyDown(kev("KeyZ", false));
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(true);
    expect(edges.leftRelease).toBe(false);
  });

  it("W4: a KeyZ tap inside one window still delivers both edges", () => {
    const input = new FlipperInput();
    input.handleKeyDown(kev("KeyZ", false));
    input.handleKeyUp(kev("KeyZ", false));
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(true);
    expect(edges.leftRelease).toBe(true);
  });

  it("W5: release, press, release inside one window delivers both edges (not held at drain time)", () => {
    const input = new FlipperInput();
    input.handleKeyDown(kev("KeyZ", false));
    input.drainEdges();
    input.handleKeyUp(kev("KeyZ", false));
    input.handleKeyDown(kev("KeyZ", false));
    input.handleKeyUp(kev("KeyZ", false));
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(true);
    expect(edges.leftRelease).toBe(true);
  });

  it("W6: the Windows final-keyup heal plus a KeyZ press in one window keeps the left bat up and drops the right", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(kev("ShiftLeft", true, false));
    input.handleKeyDown(kev("ShiftRight", true, true));
    input.drainEdges();

    input.handleKeyUp(kev("ShiftRight", false));
    input.handleKeyDown(kev("KeyZ", false));
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(true);
    expect(edges.leftRelease).toBe(false);
    expect(edges.rightRelease).toBe(true);
  });
});

describe("Windows Shift heal after a force-clear and on Shift keydowns (G-04-21)", () => {
  /** A synthetic key event with explicit Shift state and repeat flag (s = shiftKey, r = repeat). */
  function gev(code: string, shiftKey: boolean, repeat: boolean) {
    return { code, shiftKey, repeat, preventDefault: vi.fn() };
  }

  /** True when a drained view carries no edge at all. */
  function anyEdge(e: {
    leftPress: boolean;
    leftRelease: boolean;
    rightPress: boolean;
    rightRelease: boolean;
  }): boolean {
    return e.leftPress || e.leftRelease || e.rightPress || e.rightRelease;
  }

  /**
   * WR-01 body: ShiftLeft held across `clear`; once its OS auto-repeat reaches
   * the page, a repeat-flagged ShiftRight keydown is a genuine press.
   */
  function heldLeftAcrossClear(clear: (input: FlipperInput) => void): void {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftLeft", true, false));
    expect(input.drainEdges().leftPress).toBe(true);

    clear(input);
    expect(input.drainEdges().leftRelease).toBe(true);
    expect(input.isHeld("left")).toBe(false);

    // The OS auto-repeat of the Shift held across the clear: no edge, no press.
    const rep = gev("ShiftLeft", true, true);
    input.handleKeyDown(rep);
    expect(anyEdge(input.drainEdges())).toBe(false);
    expect(input.isHeld("left")).toBe(false);
    expect(rep.preventDefault).not.toHaveBeenCalled();

    // The genuine Right Shift press, which Windows flags as a repeat.
    const second = gev("ShiftRight", true, true);
    input.handleKeyDown(second);
    expect(input.drainEdges().rightPress).toBe(true);
    expect(second.preventDefault).toHaveBeenCalledTimes(1);
    expect(input.isHeld("right")).toBe(true);
    expect(input.isHeld("left")).toBe(false);

    for (let i = 0; i < 3; i++) {
      input.handleKeyDown(gev("ShiftRight", true, true));
      expect(anyEdge(input.drainEdges())).toBe(false);
    }

    // The physical Right Shift release sent nothing; this is the only keyup.
    input.handleKeyUp(gev("ShiftLeft", false, false));
    expect(input.drainEdges().rightRelease).toBe(true);
    expect(input.isHeld("left")).toBe(false);
    expect(input.isHeld("right")).toBe(false);
  }

  it("R1 (focus): ShiftLeft held across a focus regain; after its first OS auto-repeat a repeat-flagged ShiftRight is a press", () => {
    heldLeftAcrossClear((input) => input.handleFocus());
  });

  for (const source of [
    { label: "blur", clear: (input: FlipperInput) => input.handleBlur() },
    { label: "hidden", clear: (input: FlipperInput) => input.handleVisibilityChange(true) },
  ]) {
    it(`R1 (${source.label}): ShiftLeft held across the clear; after its first OS auto-repeat a repeat-flagged ShiftRight is a press`, () => {
      heldLeftAcrossClear(source.clear);
    });
  }

  it("R2 (mirror): ShiftRight held across a focus regain; after its auto-repeat a repeat-flagged ShiftLeft is a press", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftRight", true, false));
    expect(input.drainEdges().rightPress).toBe(true);

    input.handleFocus();
    expect(input.drainEdges().rightRelease).toBe(true);

    const rep = gev("ShiftRight", true, true);
    input.handleKeyDown(rep);
    expect(anyEdge(input.drainEdges())).toBe(false);
    expect(input.isHeld("right")).toBe(false);
    expect(rep.preventDefault).not.toHaveBeenCalled();

    const second = gev("ShiftLeft", true, true);
    input.handleKeyDown(second);
    const pressed = input.drainEdges();
    expect(pressed.leftPress).toBe(true);
    expect(pressed.rightPress).toBe(false);
    expect(second.preventDefault).toHaveBeenCalledTimes(1);
    expect(input.isHeld("left")).toBe(true);
    expect(input.isHeld("right")).toBe(false);

    // The newly pressed Shift is released last, so its keyup is the only one.
    input.handleKeyUp(gev("ShiftLeft", false, false));
    expect(input.drainEdges().leftRelease).toBe(true);
    expect(input.isHeld("left")).toBe(false);
    expect(input.isHeld("right")).toBe(false);
  });

  it("R3 (residual): a second Shift pressed before the held Shift's first OS auto-repeat after a clear is still missed", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftLeft", true, false));
    input.drainEdges();
    input.handleFocus();
    input.drainEdges();

    const second = gev("ShiftRight", true, true);
    input.handleKeyDown(second);
    expect(anyEdge(input.drainEdges())).toBe(false);
    expect(input.isHeld("right")).toBe(false);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it("R4: every force-clear resets the repeat marker, so a later repeat-flagged ShiftRight is not a press", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftLeft", true, false));
    input.drainEdges();
    input.handleFocus();
    input.drainEdges();
    input.handleKeyDown(gev("ShiftLeft", true, true));
    input.drainEdges();
    input.handleBlur();
    input.handleFocus();
    input.drainEdges();

    const second = gev("ShiftRight", true, true);
    input.handleKeyDown(second);
    expect(input.drainEdges().rightPress).toBe(false);
    expect(input.isHeld("right")).toBe(false);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it("R5: a Shift keyup reporting Shift up resets the repeat marker; a genuine ShiftRight press still works", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftLeft", true, true));
    expect(anyEdge(input.drainEdges())).toBe(false);
    input.handleKeyUp(gev("ShiftLeft", false, false));
    expect(anyEdge(input.drainEdges())).toBe(false);

    const rep = gev("ShiftRight", true, true);
    input.handleKeyDown(rep);
    expect(anyEdge(input.drainEdges())).toBe(false);
    expect(input.isHeld("right")).toBe(false);
    expect(rep.preventDefault).not.toHaveBeenCalled();

    input.handleKeyDown(gev("ShiftRight", true, false));
    expect(input.drainEdges().rightPress).toBe(true);
  });

  it("R6: lone auto-repeats of the Shift held across a clear stay ignored", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftLeft", true, false));
    input.drainEdges();
    input.handleFocus();
    input.drainEdges();

    for (let i = 0; i < 5; i++) {
      const rep = gev("ShiftLeft", true, true);
      input.handleKeyDown(rep);
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(input.isHeld("left")).toBe(false);
      expect(rep.preventDefault).not.toHaveBeenCalled();
    }
  });

  for (const make of [
    { label: "new FlipperInput()", build: () => new FlipperInput() },
    {
      label: "new FlipperInput({ windowsShiftHeal: false })",
      build: () => new FlipperInput({ windowsShiftHeal: false }),
    },
  ]) {
    it(`R7 (${make.label}): with the heal off, a repeat-flagged ShiftRight after a clear and a ShiftLeft repeat is not a press`, () => {
      const input = make.build();
      input.handleKeyDown(gev("ShiftLeft", true, false));
      input.drainEdges();
      input.handleFocus();
      input.drainEdges();
      input.handleKeyDown(gev("ShiftLeft", true, true));
      input.drainEdges();

      input.handleKeyDown(gev("ShiftRight", true, true));
      expect(input.drainEdges().rightPress).toBe(false);
      expect(input.isHeld("right")).toBe(false);
    });
  }

  it("K1: ShiftRight held, then a ShiftLeft keydown reporting Shift up presses left and keeps right held (WR-02)", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftRight", true, false));
    expect(input.drainEdges().rightPress).toBe(true);

    input.handleKeyDown(gev("ShiftLeft", false, false));
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(true);
    expect(edges.rightRelease).toBe(false);
    expect(input.isHeld("left")).toBe(true);
    expect(input.isHeld("right")).toBe(true);
  });

  it("K2: mirror, ShiftLeft held, then a ShiftRight keydown reporting Shift up presses right and keeps left held (WR-02)", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftLeft", true, false));
    expect(input.drainEdges().leftPress).toBe(true);

    input.handleKeyDown(gev("ShiftRight", false, false));
    const edges = input.drainEdges();
    expect(edges.rightPress).toBe(true);
    expect(edges.leftRelease).toBe(false);
    expect(input.isHeld("left")).toBe(true);
    expect(input.isHeld("right")).toBe(true);
  });

  it("K3: ShiftRight held, then a repeat-flagged ShiftLeft keydown reporting Shift up is the second press and keeps right held", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftRight", true, false));
    expect(input.drainEdges().rightPress).toBe(true);

    input.handleKeyDown(gev("ShiftLeft", false, true));
    const edges = input.drainEdges();
    expect(edges.leftPress).toBe(true);
    expect(edges.rightRelease).toBe(false);
  });

  it("K4: a non-Shift keydown reporting Shift up still drops a stale ShiftLeft with the heal on (G-04-11)", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftLeft", true, false));
    input.drainEdges();

    input.handleKeyDown(gev("KeyX", false, false));
    expect(input.drainEdges().leftRelease).toBe(true);
    expect(input.isHeld("left")).toBe(false);
  });

  it("K5: after K1, the final ShiftLeft keyup reporting Shift up still drops both Shifts (G-04-17)", () => {
    const input = new FlipperInput({ windowsShiftHeal: true });
    input.handleKeyDown(gev("ShiftRight", true, false));
    input.drainEdges();
    input.handleKeyDown(gev("ShiftLeft", false, false));
    input.drainEdges();

    input.handleKeyUp(gev("ShiftLeft", false, false));
    const end = input.drainEdges();
    expect(end.leftRelease).toBe(true);
    expect(end.rightRelease).toBe(true);
    expect(input.isHeld("left")).toBe(false);
    expect(input.isHeld("right")).toBe(false);
  });

  for (const make of [
    { label: "new FlipperInput()", build: () => new FlipperInput() },
    {
      label: "new FlipperInput({ windowsShiftHeal: false })",
      build: () => new FlipperInput({ windowsShiftHeal: false }),
    },
  ]) {
    it(`K6 (${make.label}): with the heal off a ShiftLeft keydown reporting Shift up keeps a held ShiftRight`, () => {
      const input = make.build();
      input.handleKeyDown(gev("ShiftRight", true, false));
      input.drainEdges();

      input.handleKeyDown(gev("ShiftLeft", false, false));
      expect(input.drainEdges().rightRelease).toBe(false);
      expect(input.isHeld("right")).toBe(true);
    });
  }

  describe("cradle held across a force-clear, timed re-press and marker resets (G-04-21 cradle)", () => {
    type ShiftCode = "ShiftLeft" | "ShiftRight";

    /** A timed synthetic key event (s = shiftKey, r = repeat; timeStamp in ms). */
    function tev(code: string, shiftKey: boolean, repeat: boolean, timeStamp: number) {
      return { code, shiftKey, repeat, timeStamp, preventDefault: vi.fn() };
    }

    const sideOf = (c: ShiftCode): "left" | "right" => (c === "ShiftLeft" ? "left" : "right");
    const pressOf = (e: { leftPress: boolean; rightPress: boolean }, side: "left" | "right") =>
      side === "left" ? e.leftPress : e.rightPress;
    const releaseOf = (
      e: { leftRelease: boolean; rightRelease: boolean },
      side: "left" | "right",
    ) => (side === "left" ? e.leftRelease : e.rightRelease);

    /**
     * Both Shifts held (firstCode, then lastCode) across `clear`. Windows
     * repeats only the last-pressed Shift, so its auto-repeat names it in the
     * marker. The player lifts and re-presses lastCode after a pause: Windows
     * flags that re-press as a repeat (the other Shift is still down), and the
     * gap since the last auto-repeat marks it as a fresh press.
     */
    function cradleAcrossClear(
      clear: (input: FlipperInput) => void,
      firstCode: ShiftCode,
      lastCode: ShiftCode,
    ): void {
      const input = new FlipperInput({ windowsShiftHeal: true });
      const first = sideOf(firstCode);
      const last = sideOf(lastCode);

      input.handleKeyDown(tev(firstCode, true, false, 0));
      expect(pressOf(input.drainEdges(), first)).toBe(true);

      // The second Shift, flagged repeat by Windows (G-04-17).
      input.handleKeyDown(tev(lastCode, true, true, 100));
      expect(pressOf(input.drainEdges(), last)).toBe(true);

      // The held last-pressed Shift's typematic: no edge.
      for (const t of [600, 633, 666]) {
        input.handleKeyDown(tev(lastCode, true, true, t));
        expect(anyEdge(input.drainEdges())).toBe(false);
      }

      clear(input);
      const cleared = input.drainEdges();
      expect(cleared.leftRelease).toBe(true);
      expect(cleared.rightRelease).toBe(true);
      expect(input.isHeld("left")).toBe(false);
      expect(input.isHeld("right")).toBe(false);

      // The post-clear typematic of the last-pressed Shift: never a press.
      for (let i = 1; i <= 10; i++) {
        const rep = tev(lastCode, true, true, 1000 + 33 * i);
        input.handleKeyDown(rep);
        expect(anyEdge(input.drainEdges())).toBe(false);
        expect(input.isHeld(last)).toBe(false);
        expect(rep.preventDefault).not.toHaveBeenCalled();
      }

      // lastCode released (Windows sends nothing), then re-pressed 600 ms after
      // its last auto-repeat. Windows flags the re-press as a repeat.
      const again = tev(lastCode, true, true, 1930);
      input.handleKeyDown(again);
      expect(pressOf(input.drainEdges(), last)).toBe(true);
      expect(again.preventDefault).toHaveBeenCalledTimes(1);
      expect(input.isHeld(last)).toBe(true);
      expect(input.isHeld(first)).toBe(false);

      for (const t of [2430, 2463, 2496]) {
        input.handleKeyDown(tev(lastCode, true, true, t));
        expect(anyEdge(input.drainEdges())).toBe(false);
      }

      // lastCode released (nothing), then firstCode: the only keyup.
      input.handleKeyUp(tev(firstCode, false, false, 2600));
      expect(releaseOf(input.drainEdges(), last)).toBe(true);
      expect(input.isHeld("left")).toBe(false);
      expect(input.isHeld("right")).toBe(false);
    }

    it("C1 (focus): both Shifts held across a focus regain; re-pressing the auto-repeating Shift after a pause is a press", () => {
      cradleAcrossClear((input) => input.handleFocus(), "ShiftLeft", "ShiftRight");
    });

    /**
     * The shared C1 prefix on a heal-on input, without its assertions: the
     * cradle (firstCode at 0, lastCode at 100), lastCode's held repeats at 600,
     * 633 and 666, `clear`, then ten post-clear repeats of lastCode at
     * 1000 + 33*i. Returns the input and T, the last ignored repeat's time.
     */
    function primedAfterClear(
      clear: (input: FlipperInput) => void,
      firstCode: ShiftCode,
      lastCode: ShiftCode,
    ): { input: FlipperInput; T: number } {
      const input = new FlipperInput({ windowsShiftHeal: true });
      input.handleKeyDown(tev(firstCode, true, false, 0));
      input.drainEdges();
      input.handleKeyDown(tev(lastCode, true, true, 100));
      input.drainEdges();
      for (const t of [600, 633, 666]) {
        input.handleKeyDown(tev(lastCode, true, true, t));
        input.drainEdges();
      }
      clear(input);
      input.drainEdges();
      let T = 0;
      for (let i = 1; i <= 10; i++) {
        T = 1000 + 33 * i;
        input.handleKeyDown(tev(lastCode, true, true, T));
        input.drainEdges();
      }
      return { input, T };
    }

    const focus = (input: FlipperInput): void => input.handleFocus();

    for (const source of [
      { label: "blur", clear: (input: FlipperInput) => input.handleBlur() },
      { label: "hidden", clear: (input: FlipperInput) => input.handleVisibilityChange(true) },
    ]) {
      it(`C1 (${source.label}): both Shifts held across the clear; re-pressing the auto-repeating Shift after a pause is a press`, () => {
        cradleAcrossClear(source.clear, "ShiftLeft", "ShiftRight");
      });
    }

    it("C2 (mirror): ShiftRight then ShiftLeft held across a focus regain; the re-pressed ShiftLeft raises left and the final ShiftRight keyup releases it", () => {
      cradleAcrossClear(focus, "ShiftRight", "ShiftLeft");
    });

    it("C3 (boundary): a re-press exactly SHIFT_REPEAT_GAP_MS after the last repeat is not a press; one just past the gap is", () => {
      expect(SHIFT_REPEAT_GAP_MS).toBe(450);
      const { input, T } = primedAfterClear(focus, "ShiftLeft", "ShiftRight");

      const atGap = tev("ShiftRight", true, true, T + SHIFT_REPEAT_GAP_MS);
      input.handleKeyDown(atGap);
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(input.isHeld("right")).toBe(false);
      expect(atGap.preventDefault).not.toHaveBeenCalled();

      const past = tev("ShiftRight", true, true, T + 2 * SHIFT_REPEAT_GAP_MS + 1);
      input.handleKeyDown(past);
      expect(input.drainEdges().rightPress).toBe(true);
    });

    it("C4: a steady auto-repeat stream at the slowest nominal Windows rate (400 ms) never counts as a press", () => {
      const input = new FlipperInput({ windowsShiftHeal: true });
      input.handleKeyDown(tev("ShiftLeft", true, false, 0));
      input.handleKeyDown(tev("ShiftRight", true, true, 100));
      input.drainEdges();
      input.handleFocus();
      input.drainEdges();

      for (let i = 1; i <= 8; i++) {
        const rep = tev("ShiftRight", true, true, 1000 + 400 * i);
        input.handleKeyDown(rep);
        expect(anyEdge(input.drainEdges())).toBe(false);
        expect(input.isHeld("right")).toBe(false);
        expect(rep.preventDefault).not.toHaveBeenCalled();
      }
    });

    it("C5 (residual): a re-press within SHIFT_REPEAT_GAP_MS of the previous auto-repeat is missed", () => {
      const { input, T } = primedAfterClear(focus, "ShiftLeft", "ShiftRight");
      input.handleKeyDown(tev("ShiftRight", true, true, T + 200));
      expect(anyEdge(input.drainEdges())).toBe(false);
      input.handleKeyDown(tev("ShiftRight", true, true, T + 233));
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(input.isHeld("right")).toBe(false);
    });

    it("C6: a missed fast re-press held past the typematic delay is taken on its own first auto-repeat", () => {
      const { input, T } = primedAfterClear(focus, "ShiftLeft", "ShiftRight");
      input.handleKeyDown(tev("ShiftRight", true, true, T + 200));
      expect(anyEdge(input.drainEdges())).toBe(false);
      // The re-pressed key's first auto-repeat after the 500 ms default delay.
      input.handleKeyDown(tev("ShiftRight", true, true, T + 700));
      expect(input.drainEdges().rightPress).toBe(true);
      expect(input.isHeld("right")).toBe(true);
    });

    it("C7 (no timeStamp): a re-press without a timeStamp never counts as a timed re-press", () => {
      const { input } = primedAfterClear(focus, "ShiftLeft", "ShiftRight");
      const again = gev("ShiftRight", true, true);
      input.handleKeyDown(again);
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(input.isHeld("right")).toBe(false);
      expect(again.preventDefault).not.toHaveBeenCalled();
    });

    it("C7 (non-finite timeStamp): a re-press with an infinite timeStamp never counts as a timed re-press", () => {
      const { input } = primedAfterClear(focus, "ShiftLeft", "ShiftRight");
      const again = tev("ShiftRight", true, true, Number.POSITIVE_INFINITY);
      input.handleKeyDown(again);
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(input.isHeld("right")).toBe(false);
      expect(again.preventDefault).not.toHaveBeenCalled();
    });

    it("C8: an untimed ignored repeat clears the time reference; the next timed repeat restores it", () => {
      const { input, T } = primedAfterClear(focus, "ShiftLeft", "ShiftRight");
      input.handleKeyDown(gev("ShiftRight", true, true));
      expect(anyEdge(input.drainEdges())).toBe(false);

      const late = tev("ShiftRight", true, true, T + 1000);
      input.handleKeyDown(late);
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(late.preventDefault).not.toHaveBeenCalled();

      input.handleKeyDown(tev("ShiftRight", true, true, T + 2000));
      expect(input.drainEdges().rightPress).toBe(true);
    });

    it("C9: a timed re-press of a Shift that is still held is a de-duped no-op", () => {
      const input = new FlipperInput({ windowsShiftHeal: true });
      input.handleKeyDown(tev("ShiftLeft", true, false, 0));
      input.handleKeyDown(tev("ShiftRight", true, true, 100));
      input.drainEdges();
      for (const t of [600, 633, 666]) {
        input.handleKeyDown(tev("ShiftRight", true, true, t));
        input.drainEdges();
      }

      const again = tev("ShiftRight", true, true, 1300);
      input.handleKeyDown(again);
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(again.preventDefault).not.toHaveBeenCalled();
      expect(input.isHeld("right")).toBe(true);
    });

    for (const make of [
      { label: "new FlipperInput()", build: () => new FlipperInput() },
      {
        label: "new FlipperInput({ windowsShiftHeal: false })",
        build: () => new FlipperInput({ windowsShiftHeal: false }),
      },
    ]) {
      it(`C10 (${make.label}): with the heal off, the C1 timeline never latches the timed re-press`, () => {
        const input = make.build();
        input.handleKeyDown(tev("ShiftLeft", true, false, 0));
        expect(input.drainEdges().leftPress).toBe(true);
        input.handleKeyDown(tev("ShiftRight", true, true, 100));
        expect(input.drainEdges().rightPress).toBe(false);
        for (const t of [600, 633, 666]) {
          input.handleKeyDown(tev("ShiftRight", true, true, t));
          input.drainEdges();
        }
        input.handleFocus();
        input.drainEdges();
        for (let i = 1; i <= 10; i++) {
          input.handleKeyDown(tev("ShiftRight", true, true, 1000 + 33 * i));
          input.drainEdges();
        }

        input.handleKeyDown(tev("ShiftRight", true, true, 1930));
        expect(input.drainEdges().rightPress).toBe(false);
        expect(input.isHeld("right")).toBe(false);
      });
    }

    it("C11 (residual): a second Shift missed before the held Shift's first auto-repeat is taken on its own first auto-repeat", () => {
      const input = new FlipperInput({ windowsShiftHeal: true });
      input.handleKeyDown(tev("ShiftLeft", true, false, 0));
      expect(input.drainEdges().leftPress).toBe(true);
      input.handleFocus();
      expect(input.drainEdges().leftRelease).toBe(true);

      // The 04-14 R3 residual: missed.
      const second = tev("ShiftRight", true, true, 300);
      input.handleKeyDown(second);
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(second.preventDefault).not.toHaveBeenCalled();

      // ShiftRight's own first auto-repeat after the 500 ms default delay.
      const firstRepeat = tev("ShiftRight", true, true, 800);
      input.handleKeyDown(firstRepeat);
      expect(input.drainEdges().rightPress).toBe(true);
      expect(firstRepeat.preventDefault).toHaveBeenCalledTimes(1);
    });

    it("I1 (IN-01): a non-Shift event reporting Shift up clears the repeat marker; a lone repeat-flagged ShiftRight is not a press", () => {
      const input = new FlipperInput({ windowsShiftHeal: true });
      input.handleKeyDown(gev("ShiftLeft", true, false));
      input.handleKeyDown(gev("ShiftLeft", true, true));
      input.drainEdges();

      input.handleKeyDown(gev("KeyX", false, false));
      expect(input.drainEdges().leftRelease).toBe(true);

      const rep = gev("ShiftRight", true, true);
      input.handleKeyDown(rep);
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(input.isHeld("right")).toBe(false);
      expect(rep.preventDefault).not.toHaveBeenCalled();
    });

    it("I2 (IN-01): a non-Shift event reporting Shift up clears the marker's time; a later ShiftLeft repeat is not a timed re-press", () => {
      const input = new FlipperInput({ windowsShiftHeal: true });
      input.handleKeyDown(tev("ShiftLeft", true, false, 0));
      input.handleKeyDown(tev("ShiftLeft", true, true, 500));
      input.drainEdges();

      input.handleKeyDown(tev("KeyX", false, false, 600));
      expect(input.drainEdges().leftRelease).toBe(true);

      input.handleKeyDown(tev("ShiftLeft", true, true, 1500));
      expect(anyEdge(input.drainEdges())).toBe(false);
      expect(input.isHeld("left")).toBe(false);
    });
  });
});
