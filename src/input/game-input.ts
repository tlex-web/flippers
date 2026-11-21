/**
 * Engine-agnostic game-control latch (plans 04-05 R6, 04-06 R9, 05-06 D-02):
 * Enter or NumpadEnter starts a game; KeyX, Period and ArrowUp nudge the table;
 * KeyM toggles the sound on and off. It is
 * `PlungerInput` reshaped for press-only edges. It imports NO physics engine and
 * does ZERO per-event / per-drain allocation: the held set, the pending latch
 * and the drained view are built once and mutated in place.
 *
 * Edges (drained by the consumer at the top of each fixed step):
 *  - start: a bound start code went up -> down (a genuine, non-repeat keydown).
 *    Whether it actually starts a game is the session's call (only from
 *    game-over), so a start pressed mid-game is simply ignored there.
 *  - nudgeLeft / nudgeRight / nudgeUp: KeyX / Period / ArrowUp went up -> down.
 *    Whether a nudge is accepted (playing, outside the cooldown) is the
 *    session's call.
 *  - mute: KeyM went up -> down. Press-only like the nudges; the consumer
 *    toggles the audio master (presentation only, the sim never reads it).
 *
 * `event.repeat` keydowns are ignored, so OS auto-repeat never re-fires, and a
 * duplicate non-repeat keydown while held is de-duped. `preventDefault()` fires
 * for bound codes only (it also stops ArrowUp scrolling the page); every other
 * code (the flipper keys KeyZ / ShiftLeft / ArrowLeft / Slash / ShiftRight /
 * ArrowRight, the plunger's Space, browser shortcuts) passes through untouched
 * and latches nothing here, so the nudge and mute keys can never swallow a
 * flipper or plunger control. Blur and a hidden tab clear every held flag and latch
 * nothing, since every edge is press-only.
 *
 * Space is the plunger and is deliberately not a start key.
 *
 * All edge logic lives in the directly-callable `handle*` methods so unit tests
 * drive synthetic events with no DOM; `attach()` / `detach()` only wire those
 * handlers to the real `window` / `document` in the browser.
 */

import type { KeyEventLike } from "./flipper-input";

/** Latched game edges for one drain window (read-only view). */
export interface GameEdges {
  readonly start: boolean;
  readonly nudgeLeft: boolean;
  readonly nudgeRight: boolean;
  readonly nudgeUp: boolean;
  readonly mute: boolean;
}

/** Internal mutable twin of {@link GameEdges}. */
interface MutableEdges {
  start: boolean;
  nudgeLeft: boolean;
  nudgeRight: boolean;
  nudgeUp: boolean;
  mute: boolean;
}

/** The edge a bound code latches. */
type EdgeKey = keyof MutableEdges;

/** Bound code -> the edge it latches. Built once at module load. */
const BINDINGS: ReadonlyMap<string, EdgeKey> = new Map<string, EdgeKey>([
  ["Enter", "start"],
  ["NumpadEnter", "start"],
  ["KeyX", "nudgeLeft"],
  ["Period", "nudgeRight"],
  ["ArrowUp", "nudgeUp"],
  ["KeyM", "mute"],
]);

export class GameInput {
  /** Bound codes currently down, as far as this latch has seen (never re-created). */
  private readonly held = new Set<string>();

  /** The latch the handlers write into; copied out and reset on every drain. */
  private readonly pending: MutableEdges = {
    start: false,
    nudgeLeft: false,
    nudgeRight: false,
    nudgeUp: false,
    mute: false,
  };

  /** The reused output view returned by `drainEdges()` (never re-allocated). */
  private readonly view: MutableEdges = {
    start: false,
    nudgeLeft: false,
    nudgeRight: false,
    nudgeUp: false,
    mute: false,
  };

  // Bound handler refs so attach()/detach() add and remove the SAME functions.
  private readonly onWindowKeyDown = (e: KeyboardEvent): void => this.handleKeyDown(e);
  private readonly onWindowKeyUp = (e: KeyboardEvent): void => this.handleKeyUp(e);
  private readonly onWindowBlur = (): void => this.handleBlur();
  private readonly onVisibilityChange = (): void => this.handleVisibilityChange(document.hidden);

  /** Genuine keydown of an unheld bound code: latch its edge. */
  handleKeyDown(e: KeyEventLike): void {
    const edge = BINDINGS.get(e.code);
    if (edge === undefined) return; // other codes: untouched
    e.preventDefault();
    if (e.repeat) return; // OS auto-repeat never re-fires
    if (this.held.has(e.code)) return; // duplicate keydown while held
    this.held.add(e.code);
    this.pending[edge] = true;
  }

  /** Keyup of a bound code: clear its held flag (every edge is press-only). */
  handleKeyUp(e: KeyEventLike): void {
    if (!BINDINGS.has(e.code)) return;
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
    const p = this.pending;
    const v = this.view;
    v.start = p.start;
    v.nudgeLeft = p.nudgeLeft;
    v.nudgeRight = p.nudgeRight;
    v.nudgeUp = p.nudgeUp;
    v.mute = p.mute;
    p.start = false;
    p.nudgeLeft = false;
    p.nudgeRight = false;
    p.nudgeUp = false;
    p.mute = false;
    return v;
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
