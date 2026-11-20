/**
 * A harness decorator that brings the Phase-4 rules into the UNCHANGED soak
 * engine through `SoakConfig.makeWorld` (soak.ts and containment.ts stay
 * byte-identical; the rules join only through that existing hook).
 *
 * It wraps a real `PlanckWorld` built on TABLE_SPEC with the same wiring the
 * game uses: a `CollisionRouter` over the inner world and a `ReactiveElements`
 * that records on the bus and kicks in `service()`. `step()` runs the inner
 * step, then `router.dispatch()`, then `rules.service()`, so every kick lands
 * BETWEEN fixed steps, exactly as `onPostStep` does in the game.
 *
 * The rules gate is always live (no session, no FSM): every bumper and
 * slingshot contact kicks. Each `applyImpulse` the rules issue is counted, so
 * a soak can assert its green run is non-vacuous (kicks > 0).
 *
 * The `bullet` option passes straight through, so the CCD-off RED control
 * still works on this wrapper. No engine import: constructing `PlanckWorld` is
 * allowed here, as in soak.ts.
 */

import { CollisionRouter } from "../app/collision-router";
import { ReactiveElements } from "../game/reactive-elements";
import type { ReactiveWorld, RulesGate } from "../game/reactive-elements";
import { PlanckWorld } from "../physics/planck-world";
import type {
  BallId,
  BallSpec,
  BallState,
  CollisionEvent,
  FlipperState,
  PhysicsWorld,
  Segment,
  Vec2,
} from "../physics/types";
import type { ResolvedElement } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";

/** A rules gate that is always live and discards points (the soak scores nothing). */
const ALWAYS_LIVE: RulesGate = {
  isLive: () => true,
  award: () => undefined,
};

/**
 * What `drainEvents()` hands an outside caller: always empty, because the rules
 * consume the inner world's events internally through the router.
 */
const NO_EVENTS: readonly CollisionEvent[] = [];

export class ReactiveSoakWorld implements PhysicsWorld {
  private readonly inner: PlanckWorld;
  private readonly router: CollisionRouter;
  private readonly rules: ReactiveElements;
  private kickCount = 0;

  constructor(options: { readonly bullet: boolean }) {
    const inner = new PlanckWorld({ bullet: options.bullet, table: TABLE_SPEC });
    this.inner = inner;
    this.router = new CollisionRouter(inner);
    // The rules' world slice, built once: reads delegate, kicks are counted.
    const slice: ReactiveWorld = {
      getElements: () => inner.getElements(),
      getBalls: () => inner.getBalls(),
      applyImpulse: (ballId, ix, iy) => {
        this.kickCount++;
        inner.applyImpulse(ballId, ix, iy);
      },
    };
    this.rules = new ReactiveElements(slice, this.router, ALWAYS_LIVE);
  }

  /** Kicks the rules have applied through this world since construction. */
  get kicks(): number {
    return this.kickCount;
  }

  step(dtSeconds: number): void {
    this.inner.step(dtSeconds);
    this.router.dispatch();
    this.rules.service();
  }

  addBall(spec: BallSpec): BallId {
    return this.inner.addBall(spec);
  }

  removeBall(id: BallId): void {
    this.inner.removeBall(id);
  }

  getBalls(): readonly BallState[] {
    return this.inner.getBalls();
  }

  getFlippers(): readonly FlipperState[] {
    return this.inner.getFlippers();
  }

  setFlipperMotor(id: number, direction: number): void {
    this.inner.setFlipperMotor(id, direction);
  }

  applyImpulse(ballId: BallId, ix: number, iy: number): void {
    this.inner.applyImpulse(ballId, ix, iy);
  }

  getElements(): readonly ResolvedElement[] {
    return this.inner.getElements();
  }

  getBoundarySegments(): readonly Segment[] {
    return this.inner.getBoundarySegments();
  }

  drainEvents(): CollisionEvent[] {
    return NO_EVENTS as CollisionEvent[];
  }

  getContactPoints(): readonly Vec2[] {
    return this.inner.getContactPoints();
  }
}
