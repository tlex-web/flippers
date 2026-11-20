/**
 * Engine-agnostic keyboard input for the two flippers — the FIRST keyboard/DOM
 * handling in the codebase (D-10). It imports NO physics engine (`planck`) and
 * does ZERO per-frame / per-event / per-drain allocation: the held `Set`, the
 * edge latch, and the drained view are all constructed ONCE in the constructor
 * and mutated in place thereafter (mirrors the `drainEvents` reused-view + reset
 * shape in `src/physics/planck-world.ts`).
 *
 * Design (D-09/D-10):
 *  - Keys on `event.code` (physical, layout-independent — the ONLY way to tell
 *    `ShiftLeft` from `ShiftRight`, which `event.key` collapses to `"Shift"`).
 *  - Each side is HELD iff ANY of its bound codes is down (per-side OR); it
 *    RELEASES only when ALL of its codes are up.
 *  - `event.repeat === true` keydowns are ignored (OS auto-repeat never
 *    re-triggers a flip); an already-held code is de-duped (no duplicate press).
 *  - `preventDefault()` fires on BOUND codes only (`/` = Firefox quick-find,
 *    arrows = page scroll) — reserved keys (Space plunger; X/./ArrowUp nudge) are
 *    never swallowed (threat T-02-03).
 *  - Press/release edges latch immediately and are drained by the consumer at the
 *    top of each fixed step; on window `blur`, `document` `visibilitychange`
 *    (hidden) and window `focus` regain the held set is force-cleared and release
 *    edges are emitted so a tab-blur, or a keyup an OS dialog took while the page
 *    was blurred, can never strand a key "down" (threats T-02-03, T-04-27).
 *
 * All edge logic lives in the directly-callable `handle*` methods so unit tests
 * drive synthetic events with no real DOM; `attach()`/`detach()` only wire those
 * handlers to the real `window`/`document` in the browser (`main.ts`, plan 02-03).
 */

/** The two controllable flipper sides. */
export type FlipperSide = "left" | "right";

/**
 * The minimal shape the handlers need from a `KeyboardEvent`. Accepting this
 * (rather than the DOM `KeyboardEvent`) lets tests feed plain synthetic objects
 * with no browser globals; a real `KeyboardEvent` is structurally assignable.
 */
export interface KeyEventLike {
  readonly code: string;
  readonly repeat: boolean;
  preventDefault(): void;
}

/** Latched per-side press/release edges for one drain window (read-only view). */
export interface InputEdges {
  readonly leftPress: boolean;
  readonly leftRelease: boolean;
  readonly rightPress: boolean;
  readonly rightRelease: boolean;
}

/** Internal mutable twin of {@link InputEdges}. */
interface MutableEdges {
  leftPress: boolean;
  leftRelease: boolean;
  rightPress: boolean;
  rightRelease: boolean;
}

/**
 * Static `event.code -> side` map from the D-09 multi-binding set. Built ONCE at
 * module load (never per instance/event). The classic `Z` + `/` bindings are kept;
 * the far-edge Shift keys support the constant both-flipper cradle.
 */
const CODE_TO_SIDE: ReadonlyMap<string, FlipperSide> = new Map<string, FlipperSide>([
  ["KeyZ", "left"],
  ["ShiftLeft", "left"],
  ["ArrowLeft", "left"],
  ["Slash", "right"],
  ["ShiftRight", "right"],
  ["ArrowRight", "right"],
]);

/** The bound codes for each side (for the per-side OR held test), built once. */
const SIDE_CODES: Readonly<Record<FlipperSide, readonly string[]>> = {
  left: ["KeyZ", "ShiftLeft", "ArrowLeft"],
  right: ["Slash", "ShiftRight", "ArrowRight"],
};

function resetEdges(edges: MutableEdges): void {
  edges.leftPress = false;
  edges.leftRelease = false;
  edges.rightPress = false;
  edges.rightRelease = false;
}

export class FlipperInput {
  /** Long-lived set of currently-down bound `event.code`s (never re-created). */
  private readonly held = new Set<string>();

  /** The latch handlers write into; copied out and reset on every drain. */
  private readonly pending: MutableEdges = {
    leftPress: false,
    leftRelease: false,
    rightPress: false,
    rightRelease: false,
  };

  /** The reused output view returned by `drainEdges()` (never re-allocated). */
  private readonly view: MutableEdges = {
    leftPress: false,
    leftRelease: false,
    rightPress: false,
    rightRelease: false,
  };

  // Bound handler refs so attach()/detach() add and remove the SAME functions
  // (created once — no per-attach allocation).
  private readonly onWindowKeyDown = (e: KeyboardEvent): void => this.handleKeyDown(e);
  private readonly onWindowKeyUp = (e: KeyboardEvent): void => this.handleKeyUp(e);
  private readonly onWindowBlur = (): void => this.handleBlur();
  private readonly onWindowFocus = (): void => this.handleFocus();
  private readonly onVisibilityChange = (): void =>
    this.handleVisibilityChange(document.hidden);

  /**
   * Genuine keydown. Ignores OS auto-repeat, de-dupes already-held codes,
   * `preventDefault`s bound codes only, and latches a PRESS edge when the code's
   * side goes not-held -> held (per-side OR).
   */
  handleKeyDown(e: KeyEventLike): void {
    if (e.repeat) return; // auto-repeat suppression — never re-triggers a flip
    const side = CODE_TO_SIDE.get(e.code);
    if (!side) return; // unbound/reserved code: no preventDefault, no state change
    e.preventDefault(); // bound codes only (Firefox quick-find, arrow scroll)
    if (this.held.has(e.code)) return; // de-dupe: this physical key is already down
    const wasHeld = this.isSideHeld(side);
    this.held.add(e.code);
    if (!wasHeld) this.latchPress(side); // side newly held -> exactly one press edge
  }

  /**
   * Keyup. Latches a RELEASE edge only when the side becomes fully up (ALL of its
   * codes released). A keyup for a code that was never tracked (e.g. its keydown
   * was an ignored auto-repeat) emits no phantom edge.
   */
  handleKeyUp(e: KeyEventLike): void {
    const side = CODE_TO_SIDE.get(e.code);
    if (!side) return;
    if (!this.held.has(e.code)) return; // was not down here — nothing to release
    this.held.delete(e.code);
    if (!this.isSideHeld(side)) this.latchRelease(side); // ALL codes up -> release
  }

  /** Window blur: force-clear and emit release for every still-held side. */
  handleBlur(): void {
    this.forceClear();
  }

  /**
   * Window focus regain (G-04-11): force-clear and emit release for every
   * still-held side. Any key whose keydown the page handled while blurred is
   * cleared: that keydown came after an OS dialog (e.g. the Windows Sticky Keys
   * prompt) took focus, and its keyup went to the dialog, never to the page.
   * The clear is strictly safe: window focus only follows a blur, and the blur
   * already cleared every key held before it. A key physically held across the
   * focus regain needs a fresh press, the same as after a blur.
   */
  handleFocus(): void {
    this.forceClear();
  }

  /** `document` visibilitychange: force-clear only when the tab became hidden. */
  handleVisibilityChange(hidden: boolean): void {
    if (hidden) this.forceClear();
  }

  /**
   * Copy the latched edges into the reused view, reset the latch, and return the
   * view. The consumer drains this at the top of each fixed step. No allocation:
   * both `pending` and `view` are long-lived, and the SAME `view` object is
   * returned every call.
   */
  drainEdges(): InputEdges {
    this.view.leftPress = this.pending.leftPress;
    this.view.leftRelease = this.pending.leftRelease;
    this.view.rightPress = this.pending.rightPress;
    this.view.rightRelease = this.pending.rightRelease;
    resetEdges(this.pending);
    return this.view;
  }

  /**
   * Whether a side is held right now (any of its bound codes is down). Read on
   * a serve to re-press a bat whose key was held through the flipper drop
   * (Pitfall 5); false after a blur, a hidden tab or a focus regain, which
   * clear the held set.
   */
  isHeld(side: FlipperSide): boolean {
    return this.isSideHeld(side);
  }

  /**
   * Wire the handlers to the real browser globals (browser only; not in tests).
   * No `pageshow` listener: a page entering the back/forward cache goes hidden
   * first (visibilitychange clears there) and a frozen page gets no key events.
   */
  attach(): void {
    window.addEventListener("keydown", this.onWindowKeyDown);
    window.addEventListener("keyup", this.onWindowKeyUp);
    window.addEventListener("blur", this.onWindowBlur);
    window.addEventListener("focus", this.onWindowFocus);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** Remove the listeners registered by {@link attach}. */
  detach(): void {
    window.removeEventListener("keydown", this.onWindowKeyDown);
    window.removeEventListener("keyup", this.onWindowKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("focus", this.onWindowFocus);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** True iff ANY of the side's bound codes is currently down (per-side OR). */
  private isSideHeld(side: FlipperSide): boolean {
    const codes = SIDE_CODES[side];
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code !== undefined && this.held.has(code)) return true;
    }
    return false;
  }

  private latchPress(side: FlipperSide): void {
    if (side === "left") this.pending.leftPress = true;
    else this.pending.rightPress = true;
  }

  private latchRelease(side: FlipperSide): void {
    if (side === "left") this.pending.leftRelease = true;
    else this.pending.rightRelease = true;
  }

  /**
   * Idempotent, allocation-free force-clear: emit a release for each held side,
   * then empty the set. Safe to call when nothing is held (no edges emitted).
   */
  private forceClear(): void {
    if (this.isSideHeld("left")) this.latchRelease("left");
    if (this.isSideHeld("right")) this.latchRelease("right");
    this.held.clear();
  }
}
