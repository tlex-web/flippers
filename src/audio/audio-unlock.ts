/**
 * Audio gesture unlock (Phase 5, AUD-01, research Pattern 5).
 *
 * Browsers only let a page start audio from a trusted user gesture, and an
 * `AudioContext` created outside one starts suspended. So the engine creates
 * its context lazily, inside the player's first trusted `keydown` or
 * `pointerdown`, and a later gesture resumes a context that is not running.
 *
 * Rules:
 * - only trusted events count: a synthetic (`isTrusted` false) event never
 *   creates or resumes audio (T-05-05);
 * - Escape does not count (the HTML activation rules exclude it);
 * - it never calls `preventDefault()` and never stops propagation, so the
 *   flipper, plunger and game latches still see every key.
 *
 * Shape of `src/input/game-input.ts`: all logic lives in `handleGesture`, which
 * tests drive with plain objects and no DOM; `attach()` / `detach()` only add
 * and remove the bound handlers on `window` (capture phase).
 */

import type { AudioEngine } from "./audio-engine";

/** The slice of a DOM event the unlock reads. `KeyboardEvent`/`PointerEvent` satisfy it. */
export interface GestureEventLike {
  readonly isTrusted: boolean;
  readonly type: string;
  readonly key?: string;
}

/** Capture so the unlock runs even if a later listener stops propagation. */
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true };

export class AudioUnlock {
  private readonly engine: Pick<AudioEngine, "unlock">;

  constructor(engine: Pick<AudioEngine, "unlock">) {
    this.engine = engine;
  }

  /** Create or resume audio for a trusted, activating gesture. */
  handleGesture(e: GestureEventLike): void {
    if (e.isTrusted !== true) return;
    if (e.type === "keydown" && e.key === "Escape") return;
    this.engine.unlock();
  }

  /** Bound once so attach()/detach() add and remove the SAME function. */
  private readonly onGesture = (e: Event): void => {
    this.handleGesture(e);
  };

  /** Listen for keydown and pointerdown on `window` (capture phase). */
  attach(): void {
    window.addEventListener("keydown", this.onGesture, LISTENER_OPTIONS);
    window.addEventListener("pointerdown", this.onGesture, LISTENER_OPTIONS);
  }

  /** Remove the listeners registered by {@link attach}. */
  detach(): void {
    window.removeEventListener("keydown", this.onGesture, LISTENER_OPTIONS);
    window.removeEventListener("pointerdown", this.onGesture, LISTENER_OPTIONS);
  }
}
