/**
 * Collision router: the one-way event bus Phases 4 and 5 plug into (D-11).
 *
 * Pull-then-dispatch. The physics world's pooled `drainEvents()` stays the sole
 * source; the router drains it exactly once per `dispatch()` and fans every
 * record out to the registered listeners in fixed registration order. Wire
 * `dispatch()` at the fixed-step seam (`FixedStepLoop.advance`'s `onPostStep`),
 * never the render frame, so consumers see exactly one deterministic batch per
 * simulated step.
 *
 * Engine-agnostic: it depends only on a type-only slice of the `PhysicsWorld`
 * interface and never imports the engine.
 *
 * Listener contract:
 * - do not allocate per event (this runs on the 120 Hz step path);
 * - records are pooled and mutated on the next step, so copy out anything kept
 *   past it, and never retain the record itself;
 * - never call back into the world: the bus is strictly one-way.
 *
 * Fault isolation (03-REVIEW WR-04): a listener that throws is reported through
 * the router's error handler and skipped for that one event; every other
 * listener still receives the whole batch, and the throw never escapes
 * `dispatch()` into the fixed-step loop (which would freeze the game).
 */

import type { CollisionEvent, PhysicsWorld } from "../physics/types";

/** One consumer of the collision stream. */
export type CollisionListener = (e: CollisionEvent) => void;

/** Receives anything a listener throws during `dispatch()`. */
export type ListenerErrorHandler = (error: unknown, event: CollisionEvent) => void;

/** Default: report and keep the loop running. */
const reportListenerError: ListenerErrorHandler = (error) => {
  console.error("[bus] collision listener threw", error);
};

export class CollisionRouter {
  private readonly source: Pick<PhysicsWorld, "drainEvents">;

  /** Registered once at startup; insertion order is dispatch order. */
  private readonly listeners: CollisionListener[] = [];

  private readonly onListenerError: ListenerErrorHandler;

  constructor(
    source: Pick<PhysicsWorld, "drainEvents">,
    onListenerError: ListenerErrorHandler = reportListenerError,
  ) {
    this.source = source;
    this.onListenerError = onListenerError;
  }

  /** Append a listener. Dispatch order is registration order, fixed. */
  register(listener: CollisionListener): void {
    this.listeners.push(listener);
  }

  /**
   * Drain the source once and deliver each event to every listener, event-major:
   * for each event, every listener in registration order. The pooled records are
   * passed through by reference (no copy, no allocation). Returns the batch size.
   */
  dispatch(): number {
    const batch = this.source.drainEvents();
    const listeners = this.listeners;
    for (let i = 0; i < batch.length; i++) {
      const e = batch[i];
      if (!e) continue;
      for (let j = 0; j < listeners.length; j++) {
        const listener = listeners[j];
        if (!listener) continue;
        try {
          listener(e);
        } catch (error) {
          this.onListenerError(error, e);
        }
      }
    }
    return batch.length;
  }
}
