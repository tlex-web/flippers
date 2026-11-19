/**
 * Engine-agnostic Space edge latch for the plunger (plan 03-05, D-08). It is
 * `FlipperInput` reduced to one control on `event.code === "Space"`. It imports
 * NO physics engine and does ZERO per-event / per-drain allocation: the held
 * flag, the pending latch and the drained view are built once and mutated in
 * place.
 *
 * Edges (drained by the consumer at the top of each fixed step):
 *  - press: Space went up -> down (a genuine, non-repeat keydown).
 *  - release: Space went down -> up. This is the only edge that launches.
 *  - cancel: focus was lost while Space was held (window blur, or the document
 *    became hidden). Cancel NEVER also latches a release, and the held flag is
 *    cleared, so the keyup that arrives after refocus latches nothing. Losing
 *    focus can therefore never fire the ball (threat T-03-12).
 *
 * `event.repeat` keydowns are ignored, so OS auto-repeat never re-charges, and a
 * duplicate non-repeat keydown while held is de-duped. `preventDefault()` fires
 * for Space only (page scroll); every other code passes through untouched.
 *
 * All edge logic lives in the directly-callable `handle*` methods so unit tests
 * drive synthetic events with no DOM; `attach()` / `detach()` only wire those
 * handlers to the real `window` / `document` in the browser.
 */

import type { KeyEventLike } from "./flipper-input";

/** The one bound code. */
const PLUNGER_CODE = "Space";

/** Latched plunger edges for one drain window (read-only view). */
export interface PlungerEdges {
  readonly press: boolean;
  readonly release: boolean;
  readonly cancel: boolean;
}

/** Internal mutable twin of {@link PlungerEdges}. */
interface MutableEdges {
  press: boolean;
  release: boolean;
  cancel: boolean;
}

export class PlungerInput {
  /** Whether Space is currently down (as far as this latch has seen). */
  private held = false;

  /** The latch the handlers write into; copied out and reset on every drain. */
  private readonly pending: MutableEdges = { press: false, release: false, cancel: false };

  /** The reused output view returned by `drainEdges()` (never re-allocated). */
  private readonly view: MutableEdges = { press: false, release: false, cancel: false };

  // Bound handler refs so attach()/detach() add and remove the SAME functions.
  private readonly onWindowKeyDown = (e: KeyboardEvent): void => this.handleKeyDown(e);
  private readonly onWindowKeyUp = (e: KeyboardEvent): void => this.handleKeyUp(e);
  private readonly onWindowBlur = (): void => this.handleBlur();
  private readonly onVisibilityChange = (): void => this.handleVisibilityChange(document.hidden);

  /** Genuine Space keydown: latch a press edge when Space goes up -> down. */
  handleKeyDown(e: KeyEventLike): void {
    if (e.code !== PLUNGER_CODE) return; // other codes: untouched
    e.preventDefault(); // Space scrolls the page
    if (e.repeat) return; // OS auto-repeat never re-charges
    if (this.held) return; // duplicate keydown while held
    this.held = true;
    this.pending.press = true;
  }

  /** Space keyup: latch a release edge only if this latch saw it go down. */
  handleKeyUp(e: KeyEventLike): void {
    if (e.code !== PLUNGER_CODE) return;
    e.preventDefault();
    if (!this.held) return; // never tracked (repeat-only, or cancelled by blur)
    this.held = false;
    this.pending.release = true;
  }

  /** Window blur: cancel a held charge (never a release). */
  handleBlur(): void {
    this.cancelHeld();
  }

  /** `document` visibilitychange: cancel only when the tab became hidden. */
  handleVisibilityChange(hidden: boolean): void {
    if (hidden) this.cancelHeld();
  }

  /**
   * Copy the latched edges into the reused view, reset the latch, and return the
   * view. The SAME object is returned on every call.
   */
  drainEdges(): PlungerEdges {
    this.view.press = this.pending.press;
    this.view.release = this.pending.release;
    this.view.cancel = this.pending.cancel;
    this.pending.press = false;
    this.pending.release = false;
    this.pending.cancel = false;
    return this.view;
  }

  /** Wire the handlers to the real browser globals (browser only; not in tests). */
  attach(): void {
    window.addEventListener("keydown", this.onWindowKeyDown);
    window.addEventListener("keyup", this.onWindowKeyUp);
    window.addEventListener("blur", this.onWindowBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** Remove the listeners registered by {@link attach}. */
  detach(): void {
    window.removeEventListener("keydown", this.onWindowKeyDown);
    window.removeEventListener("keyup", this.onWindowKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** Idempotent: latch a cancel and clear the held flag, only if Space is held. */
  private cancelHeld(): void {
    if (!this.held) return;
    this.held = false;
    this.pending.cancel = true;
  }
}
