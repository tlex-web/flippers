/**
 * Reactive table elements (Phase 4): bumpers that pop the ball away,
 * slingshots that kick it off their rubber face, and the top rollovers and
 * inlanes that score as the ball passes (the rollovers also light and pay a
 * bank bonus when all three are lit).
 *
 * Record-then-service, the same split as the sandbox ball feed:
 * - construct it once at the composition root (see `main.ts`), with the router
 *   and the rules gate;
 * - call `service()` from `onPostStep`, right AFTER `router.dispatch()`.
 *
 * The bus listener only records: on a qualifying contact it awards the points
 * through the gate and queues a kick for that ball. It never calls the world
 * (the bus is one-way). `service()` applies the queued kicks through
 * `applyImpulse` after the batch has been delivered, i.e. between fixed steps,
 * which is the only time the impulse contract allows.
 *
 * Kick law (R1/R2): the ball's speed along the kick normal is raised to the
 * kicker's target; its tangential velocity is kept and a ball already leaving
 * faster is not slowed. A bumper's normal is bumper-center -> ball-center; a
 * slingshot's is the fixed outward normal of its rubber face, derived once
 * from the resolved geometry (`deriveKickFace`). Burst collapse (R3): a
 * per-element cooldown of `KICKER_REARM_STEPS` fixed steps; `service()` is the
 * step clock, never wall-clock.
 *
 * Sensors (R3/R4/R12): a rollover or inlane event that is armed and live arms
 * `SENSOR_REARM_STEPS` and awards its points. A rollover also lights; when
 * every rollover is lit the bank bonus is paid and all of them go dark.
 * Lights persist across balls and are cleared by `resetLights()` (new game).
 *
 * Presentation feedback (Phase 5, AUD-01/RND-03): an optional `ReactiveFeedback`
 * hook reports every REGISTERED hit (a kick or sensor pass that cleared the
 * cooldown, impulse, face and `isLive()` gates) to the presentation layer. It
 * is called as the last statement of each registered branch, after the award
 * and after the cooldown and pending kick are set, so a throwing sink can never
 * leave a rule half-applied (Pitfall 8). It receives scalars only and never
 * mutates rules or the world. The default is a frozen no-op.
 *
 * Rule hooks (Phase 6, PLSH-05): an optional `RuleHooks` receives the same
 * registered switches through `onSwitch(kind, elementId, bank)`, called right
 * after the award (and, for a rollover, after the light and bank handling) and
 * BEFORE the presentation feedback, because it is a rule. `GameSession`
 * implements it to resolve the skill shot. It must not touch the world (the
 * world is still written only in the `service()` calls). The default is a
 * frozen no-op, so a `ReactiveElements` built without it scores as before.
 *
 * Center-post kickback (Phase 6, PLSH-07, D-06/D-07): the `"post"` circle
 * sensor (element 610) is a kicker with no points. A post overlap queues a kick
 * only when the rules are live, the ball's center is above the post center (so
 * the bumper-law normal points up-table, never down into the drain) and
 * `RuleHooks.trySave(ballId)` grants it, which spends the ball save. The kick
 * is applied in `service()` like every other kick (the single ordered world
 * write) with the bumper law at `ReactiveConfig.kickbackSpeed`
 * (default `KICKBACK_SPEED`). It awards nothing and reports no switch and no
 * feedback: the save flourish reads the session's save counter instead.
 *
 * Engine-agnostic: the world is a type-only `PhysicsWorld` slice. Steady state
 * allocates nothing (fixed kicker array, Map lookup, index loops).
 */

import type { CollisionRouter } from "../app/collision-router";
import { ballMass } from "../physics/constants";
import type { BallId, CollisionEvent, PhysicsWorld } from "../physics/types";
import type { ResolvedElement } from "../table/resolve";
import {
  BUMPER_KICK_SPEED,
  BUMPER_POINTS,
  INLANE_POINTS,
  KICKBACK_SPEED,
  KICKER_REARM_STEPS,
  ROLLOVER_BANK_BONUS,
  ROLLOVER_POINTS,
  SENSOR_REARM_STEPS,
  SLING_FACE_TOL,
  SLING_KICK_SPEED,
  SLING_MIN_IMPULSE,
  SLING_POINTS,
} from "./tuning";

/**
 * The rules side the reactive elements report to. `isLive()` false means
 * contacts do nothing at all (no points, no kick, no cooldown armed).
 */
export interface RulesGate {
  isLive(): boolean;
  award(points: number): void;
}

/**
 * Where registered hits are reported for presentation (sound and flash). Called
 * only for hits that scored; never for a contact rejected by the cooldown, the
 * impulse threshold, the face distance or a not-live gate. Implementations must
 * not allocate per call and must not touch the world or the rules.
 */
export interface ReactiveFeedback {
  onKick(kind: "bumper" | "slingshot", elementId: number, normalImpulse: number): void;
  onSensor(kind: "rollover" | "lane", elementId: number, bank: boolean): void;
}

/** Default feedback: does nothing. Module-level and frozen, shared by all. */
const NO_FEEDBACK: ReactiveFeedback = Object.freeze({
  onKick(): void {},
  onSensor(): void {},
});

/** Every kind of scoring switch reported to the rule hooks. */
export type SwitchKind = "bumper" | "slingshot" | "rollover" | "lane";

/**
 * Where registered scoring switches are reported for rules (the skill shot).
 * A registered scoring switch has passed the same gates as `ReactiveFeedback`
 * (cooldown, impulse threshold, face distance, `isLive()`); the call comes after
 * the award and before the feedback call. `bank` is true only for the rollover
 * that completed the 3-lit bank. Implementations may award through the gate
 * but must not touch the world and must not allocate per call.
 */
export interface RuleHooks {
  onSwitch(kind: SwitchKind, elementId: number, bank: boolean): void;
  /**
   * Ask to spend the ball save as a center-post kickback (PLSH-07). Consulted
   * only for a live post overlap with the ball's center above the post center.
   * Returning true consumes the save and queues the kick for `ballId`; false
   * leaves the ball to drain (and to the session's backstop). Must not touch
   * the world and must not allocate per call.
   */
  trySave(ballId: BallId): boolean;
}

/** Default rule hooks: no switch handling, never a save. Frozen, shared by all. */
const NO_HOOKS: RuleHooks = Object.freeze({
  onSwitch(): void {},
  trySave(): boolean {
    return false;
  },
});

/** Optional tuning overrides (tests and the energy RED control). */
export interface ReactiveConfig {
  /** Center-post kickback target speed (m/s); defaults to `KICKBACK_SPEED`. */
  readonly kickbackSpeed?: number;
}

/** The world slice the reactive elements need. */
export type ReactiveWorld = Pick<PhysicsWorld, "getElements" | "getBalls" | "applyImpulse">;

/**
 * A slingshot's rubber face: segment endpoints (a, b) and its unit normal
 * (nx, ny) pointing out of the slingshot, toward the field.
 */
export interface KickFace {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly nx: number;
  readonly ny: number;
}

/**
 * Derive a slingshot's kick face from its resolved polyline (Pattern 3): the
 * longest segment, with the unit normal oriented away from the vertex centroid
 * (dot with midpoint minus centroid is positive). Null when there is no
 * segment. Pure; called once per element at construction.
 */
export function deriveKickFace(el: ResolvedElement): KickFace | null {
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i < el.segments.length; i++) {
    const s = el.segments[i];
    if (!s) continue;
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  const face = best >= 0 ? el.segments[best] : undefined;
  if (!face || bestLen === 0) return null;

  let cx = 0;
  let cy = 0;
  const n = el.vertices.length;
  for (let i = 0; i < n; i++) {
    const v = el.vertices[i];
    if (!v) continue;
    cx += v.x;
    cy += v.y;
  }
  if (n > 0) {
    cx /= n;
    cy /= n;
  }

  let nx = -(face.b.y - face.a.y) / bestLen;
  let ny = (face.b.x - face.a.x) / bestLen;
  const mx = (face.a.x + face.b.x) / 2;
  const my = (face.a.y + face.b.y) / 2;
  if (nx * (mx - cx) + ny * (my - cy) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { ax: face.a.x, ay: face.a.y, bx: face.b.x, by: face.b.y, nx, ny };
}

/** Distance from (px, py) to the segment (ax, ay)-(bx, by), clamped projection. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

type KickerKind = "bumper" | "slingshot" | "post";

/** One kicking element's mutable record (bumper, slingshot or post), built once. */
interface Kicker {
  readonly id: number;
  readonly kind: KickerKind;
  /** Bumper or post center (unused for a slingshot). */
  readonly cx: number;
  readonly cy: number;
  /** Slingshot face endpoints and fixed outward normal (unused for a bumper). */
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly nx: number;
  readonly ny: number;
  /** Outward speed the kick raises the ball to (m/s). */
  readonly targetSpeed: number;
  /** Points awarded per trigger. */
  readonly points: number;
  /** First step on which this kicker may trigger again. */
  armedAtStep: number;
  /** Ball queued for a kick on the next `service()`, or -1. */
  pendingBall: BallId;
}

type SensorKind = "rollover" | "lane";

/** One scoring sensor's mutable rule (rollover or inlane), built once. */
interface SensorRule {
  readonly id: number;
  readonly kind: SensorKind;
  /** First step on which this sensor may score again. */
  armedAtStep: number;
  /** Rollover light (always false for a lane). */
  lit: boolean;
}

export class ReactiveElements {
  private readonly world: ReactiveWorld;
  private readonly gate: RulesGate;
  private readonly feedback: ReactiveFeedback;
  private readonly hooks: RuleHooks;
  private readonly kickers: Kicker[] = [];
  private readonly kickerById = new Map<number, Kicker>();
  private readonly sensors: SensorRule[] = [];
  private readonly sensorById = new Map<number, SensorRule>();
  /** The rollover rules only, for the bank check and resetLights(). */
  private readonly rollovers: SensorRule[] = [];

  /** Fixed steps serviced so far: the only clock. */
  private step = 0;

  constructor(
    world: ReactiveWorld,
    router: CollisionRouter,
    gate: RulesGate,
    feedback: ReactiveFeedback = NO_FEEDBACK,
    hooks: RuleHooks = NO_HOOKS,
    config: ReactiveConfig = {},
  ) {
    this.world = world;
    this.gate = gate;
    this.feedback = feedback;
    this.hooks = hooks;
    const elements = world.getElements();
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el) continue;
      if (el.kind === "bumper" && el.circle !== null) {
        this.addKicker({
          id: el.id,
          kind: "bumper",
          cx: el.circle.center.x,
          cy: el.circle.center.y,
          ax: 0,
          ay: 0,
          bx: 0,
          by: 0,
          nx: 0,
          ny: 0,
          targetSpeed: BUMPER_KICK_SPEED,
          points: BUMPER_POINTS,
          armedAtStep: 0,
          pendingBall: -1,
        });
      } else if (el.kind === "post" && el.circle !== null) {
        this.addKicker({
          id: el.id,
          kind: "post",
          cx: el.circle.center.x,
          cy: el.circle.center.y,
          ax: 0,
          ay: 0,
          bx: 0,
          by: 0,
          nx: 0,
          ny: 0,
          targetSpeed: config.kickbackSpeed ?? KICKBACK_SPEED,
          points: 0,
          armedAtStep: 0,
          pendingBall: -1,
        });
      } else if (el.kind === "slingshot") {
        const face = deriveKickFace(el);
        if (!face) continue;
        this.addKicker({
          id: el.id,
          kind: "slingshot",
          cx: 0,
          cy: 0,
          ax: face.ax,
          ay: face.ay,
          bx: face.bx,
          by: face.by,
          nx: face.nx,
          ny: face.ny,
          targetSpeed: SLING_KICK_SPEED,
          points: SLING_POINTS,
          armedAtStep: 0,
          pendingBall: -1,
        });
      } else if (el.kind === "rollover" || el.kind === "lane") {
        const rule: SensorRule = { id: el.id, kind: el.kind, armedAtStep: 0, lit: false };
        this.sensors.push(rule);
        this.sensorById.set(el.id, rule);
        if (el.kind === "rollover") this.rollovers.push(rule);
      }
    }
    router.register(this.onEvent);
  }

  /** Whether rollover `elementId` is lit. False for lanes and unknown ids. */
  isLit(elementId: number): boolean {
    const rule = this.sensorById.get(elementId);
    return rule !== undefined && rule.lit;
  }

  /** Turn every rollover light off (a new game; not a new ball). */
  resetLights(): void {
    const rollovers = this.rollovers;
    for (let i = 0; i < rollovers.length; i++) {
      const r = rollovers[i];
      if (r) r.lit = false;
    }
  }

  private addKicker(k: Kicker): void {
    this.kickers.push(k);
    this.kickerById.set(k.id, k);
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

  /** Raise the queued ball's outward speed to the kicker's target (R1/R2). */
  private kick(k: Kicker): void {
    const balls = this.world.getBalls();
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b || b.id !== k.pendingBall) continue;
      let nx = k.nx;
      let ny = k.ny;
      if (k.kind !== "slingshot") {
        // Bumper and post: the radial normal, center -> ball center.
        const dx = b.x - k.cx;
        const dy = b.y - k.cy;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        nx = dx / len;
        ny = dy / len;
      }
      const vn = b.vx * nx + b.vy * ny;
      if (vn < k.targetSpeed) {
        const j = ballMass(b.radius) * (k.targetSpeed - vn);
        this.world.applyImpulse(b.id, j * nx, j * ny);
      }
      return;
    }
    // The ball is gone (drained or removed): drop the kick.
  }

  /** Score a rollover or inlane pass; light and bank a rollover (R4/R12). */
  private onSensor(e: CollisionEvent): void {
    const rule = this.sensorById.get(e.elementId);
    if (!rule || rule.kind !== e.elementKind) return;
    if (this.step < rule.armedAtStep) return;
    if (!this.gate.isLive()) return;
    rule.armedAtStep = this.step + SENSOR_REARM_STEPS;
    if (rule.kind === "lane") {
      this.gate.award(INLANE_POINTS);
      this.hooks.onSwitch("lane", rule.id, false);
      this.feedback.onSensor("lane", rule.id, false);
      return;
    }
    this.gate.award(ROLLOVER_POINTS);
    rule.lit = true;
    const rollovers = this.rollovers;
    let bank = true;
    for (let i = 0; i < rollovers.length; i++) {
      if (!rollovers[i]?.lit) {
        bank = false;
        break;
      }
    }
    if (bank) {
      this.gate.award(ROLLOVER_BANK_BONUS);
      this.resetLights();
    }
    this.hooks.onSwitch("rollover", rule.id, bank);
    this.feedback.onSensor("rollover", rule.id, bank);
  }

  /**
   * Center-post overlap (PLSH-07): queue a kickback only if live, the ball's
   * center (a sensor event's point) is above the post center (Pitfall 6: never
   * a downward kick into the drain) and the hooks spend the save. No award, no
   * switch, no feedback; `service()` applies the kick.
   */
  private onPost(e: CollisionEvent): void {
    const k = this.kickerById.get(e.elementId);
    if (!k || k.kind !== "post") return;
    if (!this.gate.isLive()) return;
    if (!(e.point.y < k.cy)) return;
    if (!this.hooks.trySave(e.ballId)) return;
    k.pendingBall = e.ballId;
  }

  /** Bus listener, bound once: record and award, never touch the world here. */
  private readonly onEvent = (e: CollisionEvent): void => {
    const kind = e.elementKind;
    if (kind === "rollover" || kind === "lane") {
      this.onSensor(e);
      return;
    }
    if (kind === "post") {
      this.onPost(e);
      return;
    }
    if (kind !== "bumper" && kind !== "slingshot") return;
    const k = this.kickerById.get(e.elementId);
    if (!k || k.kind !== kind) return;
    if (this.step < k.armedAtStep) return;
    if (kind === "bumper") {
      if (!(e.normalImpulse > 0)) return;
    } else {
      // Rubber face only, and only a real strike (R2, Pitfall 2). Scalars are
      // copied out; the pooled record is never retained.
      if (!(e.normalImpulse >= SLING_MIN_IMPULSE)) return;
      const d = distanceToSegment(e.point.x, e.point.y, k.ax, k.ay, k.bx, k.by);
      if (!(d <= SLING_FACE_TOL)) return;
    }
    if (!this.gate.isLive()) return;
    k.armedAtStep = this.step + KICKER_REARM_STEPS;
    k.pendingBall = e.ballId;
    this.gate.award(k.points);
    this.hooks.onSwitch(kind, e.elementId, false);
    this.feedback.onKick(kind, e.elementId, e.normalImpulse);
  };
}
