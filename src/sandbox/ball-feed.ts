/**
 * Sandbox ball feed (03-REVIEW CR-01): keep exactly one ball in play, parked on
 * the plunger, and replace it only when it really drains.
 *
 * The drain is read from the collision bus — the drain sensor (spec id 600)
 * exists for exactly this — never from a positional `y > DRAIN_Y` check. The
 * plunger rest position sits BELOW the drain line, so a positional check
 * mistook the parked ball for a drained one and respawned it every frame.
 *
 * Wiring (fixed-step seam, never the render frame):
 * - construct it once, after the controllers (see `main.ts`), with the router;
 * - call `service()` from `onPostStep`, right AFTER `router.dispatch()`.
 *
 * The bus listener only records the drained id (the bus is one-way: listeners
 * never call back into the world); `service()` does the remove/add after the
 * batch has been delivered. Engine-agnostic: talks only to the `PhysicsWorld`
 * interface. Steady state allocates nothing; remove/add run only on a drain.
 */

import type { CollisionRouter } from "../app/collision-router";
import type { BallId, BallSpec, CollisionEvent, PhysicsWorld } from "../physics/types";

/** The world slice the feed needs. */
export type BallFeedWorld = Pick<PhysicsWorld, "addBall" | "removeBall">;

export class BallFeed {
  private readonly world: BallFeedWorld;
  private readonly spawn: BallSpec;
  private active: BallId;

  /** Id of the active ball seen on the drain sensor this step, or null. */
  private drained: BallId | null = null;

  constructor(world: BallFeedWorld, router: CollisionRouter, spawn: BallSpec) {
    this.world = world;
    this.spawn = spawn;
    this.active = world.addBall(spawn);
    router.register(this.onEvent);
  }

  /** The ball currently in play (the one the plunger launches). */
  get activeBallId(): BallId {
    return this.active;
  }

  /**
   * Replace a drained ball: remove it, then park a fresh one at the spawn. Call
   * once per fixed step, right after `router.dispatch()`. No-op otherwise.
   */
  service(): void {
    if (this.drained === null) return;
    this.world.removeBall(this.drained);
    this.drained = null;
    this.active = this.world.addBall(this.spawn);
  }

  /** Bus listener, bound once: record the drain, never touch the world here. */
  private readonly onEvent = (e: CollisionEvent): void => {
    if (e.elementKind === "drain" && e.ballId === this.active) this.drained = e.ballId;
  };
}
