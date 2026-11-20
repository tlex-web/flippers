/**
 * Reactive table elements (Phase 4): bumpers that pop the ball away and score.
 *
 * Record-then-service, the same split as the sandbox ball feed:
 * - construct it once at the composition root (see `main.ts`), with the router
 *   and the rules gate;
 * - call `service()` from `onPostStep`, right AFTER `router.dispatch()`.
 *
 * The bus listener only records: on a qualifying bumper contact it awards the
 * points through the gate and queues a kick for that ball. It never calls the
 * world (the bus is one-way). `service()` applies the queued kicks through
 * `applyImpulse` after the batch has been delivered, i.e. between fixed steps,
 * which is the only time the impulse contract allows.
 *
 * Kick law (R1): the ball's outward speed along bumper-center -> ball-center is
 * raised to `BUMPER_KICK_SPEED`; its tangential velocity is kept and a ball
 * already leaving faster is not slowed. Burst collapse (R3): a per-bumper
 * cooldown of `KICKER_REARM_STEPS` fixed steps; `service()` is the step clock,
 * never wall-clock.
 *
 * Engine-agnostic: the world is a type-only `PhysicsWorld` slice. Steady state
 * allocates nothing (fixed kicker array, Map lookup, index loops).
 */

import type { CollisionRouter } from "../app/collision-router";
import { ballMass } from "../physics/constants";
import type { BallId, CollisionEvent, PhysicsWorld } from "../physics/types";
import { BUMPER_KICK_SPEED, BUMPER_POINTS, KICKER_REARM_STEPS } from "./tuning";

/**
 * The rules side the reactive elements report to. `isLive()` false means
 * contacts do nothing at all (no points, no kick, no cooldown armed).
 */
export interface RulesGate {
  isLive(): boolean;
  award(points: number): void;
}

/** The world slice the reactive elements need. */
export type ReactiveWorld = Pick<PhysicsWorld, "getElements" | "getBalls" | "applyImpulse">;

/** One bumper's mutable kicker record, built once. */
interface Kicker {
  readonly id: number;
  readonly cx: number;
  readonly cy: number;
  /** First step on which this kicker may trigger again. */
  armedAtStep: number;
  /** Ball queued for a kick on the next `service()`, or -1. */
  pendingBall: BallId;
}

export class ReactiveElements {
  private readonly world: ReactiveWorld;
  private readonly gate: RulesGate;
  private readonly kickers: Kicker[] = [];
  private readonly byId = new Map<number, Kicker>();

  /** Fixed steps serviced so far: the only clock. */
  private step = 0;

  constructor(world: ReactiveWorld, router: CollisionRouter, gate: RulesGate) {
    this.world = world;
    this.gate = gate;
    const elements = world.getElements();
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el || el.kind !== "bumper" || el.circle === null) continue;
      const k: Kicker = {
        id: el.id,
        cx: el.circle.center.x,
        cy: el.circle.center.y,
        armedAtStep: 0,
        pendingBall: -1,
      };
      this.kickers.push(k);
      this.byId.set(el.id, k);
    }
    router.register(this.onEvent);
  }

  /**
   * Apply every queued kick, then advance the step clock. Call once per fixed
   * step, right after `router.dispatch()`.
   */
  service(): void {
    const kickers = this.kickers;
    for (let i = 0; i < kickers.length; i++) {
      const k = kickers[i];
      if (!k || k.pendingBall < 0) continue;
      this.kick(k);
      k.pendingBall = -1;
    }
    this.step++;
  }

  /** Raise the queued ball's outward speed to the target (R1). */
  private kick(k: Kicker): void {
    const balls = this.world.getBalls();
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b || b.id !== k.pendingBall) continue;
      const dx = b.x - k.cx;
      const dy = b.y - k.cy;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      const nx = dx / len;
      const ny = dy / len;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < BUMPER_KICK_SPEED) {
        const j = ballMass(b.radius) * (BUMPER_KICK_SPEED - vn);
        this.world.applyImpulse(b.id, j * nx, j * ny);
      }
      return;
    }
    // The ball is gone (drained or removed): drop the kick.
  }

  /** Bus listener, bound once: record and award, never touch the world here. */
  private readonly onEvent = (e: CollisionEvent): void => {
    if (e.elementKind !== "bumper") return;
    const k = this.byId.get(e.elementId);
    if (!k) return;
    if (!(e.normalImpulse > 0) || this.step < k.armedAtStep) return;
    if (!this.gate.isLive()) return;
    k.armedAtStep = this.step + KICKER_REARM_STEPS;
    k.pendingBall = e.ballId;
    this.gate.award(BUMPER_POINTS);
  };
}
