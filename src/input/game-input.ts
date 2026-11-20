/**
 * Engine-agnostic game-control latch (plan 04-05, R6): Enter or NumpadEnter
 * starts a game. It is `PlungerInput` reshaped for press-only edges. It imports
 * NO physics engine and does ZERO per-event / per-drain allocation: the held
 * set, the pending latch and the drained view are built once and mutated in
 * place.
 *
 * Edges (drained by the consumer at the top of each fixed step):
 *  - start: a bound start code went up -> down (a genuine, non-repeat keydown).
 *    Whether it actually starts a game is the session's call (only from
 *    game-over), so a start pressed mid-game is simply ignored there.
 *
 * `event.repeat` keydowns are ignored, so OS auto-repeat never re-fires, and a
 * duplicate non-repeat keydown while held is de-duped. `preventDefault()` fires
 * for bound codes only; every other code (flipper keys, Space, browser
 * shortcuts) passes through untouched. Blur and a hidden tab clear every held
 * flag and latch nothing, since start is press-only.
 *
 * Space is the plunger and is deliberately not a start key.
 *
 * All edge logic lives in the directly-callable `handle*` methods so unit tests
 * drive synthetic events with no DOM; `attach()` / `detach()` only wire those
 * handlers to the real `window` / `document` in the browser.
 */

import type { KeyEventLike } from "./flipper-input";

/** Codes that latch a start edge. Built once at module load. */
const START_CODES: ReadonlySet<string> = new Set(["Enter", "NumpadEnter"]);

/** Latched game edges for one drain window (read-only view). 04-06 adds nudges. */
export interface GameEdges {
  readonly start: boolean;
}

/** Internal mutable twin of {@link GameEdges}. */
interface MutableEdges {
  start: boolean;
}

export class GameInput {
  /** Bound codes currently down, as far as this latch has seen (never re-created). */
  private readonly held = new Set<string>();

  /** The latch the handlers write into; copied out and reset on every drain. */
  private readonly pending: MutableEdges = { start: false };

  /** The reused output view returned by `drainEdges()` (never re-allocated). */
  private readonly view: MutableEdges = { start: false };

  // Bound handler refs so attach()/detach() add and remove the SAME functions.
  private readonly onWindowKeyDown = (e: KeyboardEvent): void => this.handleKeyDown(e);
  private readonly onWindowKeyUp = (e: KeyboardEvent): void => this.handleKeyUp(e);
  private readonly onWindowBlur = (): void => this.handleBlur();
  private readonly onVisibilityChange = (): void => this.handleVisibilityChange(document.hidden);

  /** Genuine keydown of an unheld start code: latch a start edge. */
  handleKeyDown(e: KeyEventLike): void {
    if (!START_CODES.has(e.code)) return; // other codes: untouched
    e.preventDefault();
    if (e.repeat) return; // OS auto-repeat never re-fires
    if (this.held.has(e.code)) return; // duplicate keydown while held
    this.held.add(e.code);
    this.pending.start = true;
  }

  /** Keyup of a start code: clear its held flag (start is press-only). */
  handleKeyUp(e: KeyEventLike): void {
    if (!START_CODES.has(e.code)) return;
    e.preventDefault();
    this.held.delete(e.code);
  }

  /** Window blur: forget every held code, latch nothing. */
  handleBlur(): void {
    this.held.clear();
  }

  /** `document` visibilitychange: forget held codes only when the tab hid. */
  handleVisibilityChange(hidden: boolean): void {
    if (hidden) this.held.clear();
  }

  /**
   * Copy the latched edges into the reused view, reset the latch, and return the
   * view. The SAME object is returned on every call.
   */
  drainEdges(): GameEdges {
    this.view.start = this.pending.start;
    this.pending.start = false;
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
}
