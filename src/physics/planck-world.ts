/**
 * Planck.js adapter — the ONLY file in the codebase allowed to import `planck`
 * (D-01: Planck-first, behind the engine-agnostic interface). Everything else
 * talks to physics exclusively through `PhysicsWorld` from `./types`, so the
 * engine stays swappable and the headless proof (D-05) is engine-independent.
 *
 * This first cut is one dynamic bullet ball falling under tilted-playfield
 * gravity inside a bounded box built from chain/edge static walls (including one
 * deliberately thin interior wall as a future tunneling target). Snapshots are
 * read out of pre-allocated pooled arrays that `step()` mutates — no per-frame
 * allocation on the render read path.
 */

import { Chain, Circle, Edge, Vec2, World } from "planck";

import {
  BALL_FRICTION,
  BALL_LINEAR_DAMPING,
  BALL_RADIUS_M,
  BALL_RESTITUTION,
  IN_PLANE_GRAVITY,
} from "./constants";
import type {
  BallId,
  BallSpec,
  BallState,
  CollisionEvent,
  CollisionEventType,
  FlipperState,
  PhysicsWorld,
  Segment,
  Vec2 as Vec2Value,
} from "./types";

// --- Solver tuning (Box2D defaults; crank up only if bounces feel mushy). ---
const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;

// --- Ball material (density is a solver param, not a feel constant). ---
const BALL_DENSITY = 1;

// --- Wall material: low grip so the ball slides along walls like real steel. ---
const WALL_FRICTION = 0.1;

// --- Bounded play box (meters). Test scaffold only — the real Space Cadet
//     table geometry is Phase 3. Sized so a 0.2 m ball is comfortably inside. ---
const WIDTH_M = 2;
const HEIGHT_M = 3;

// --- One deliberately THIN interior wall segment (a zero-width edge = the
//     thinnest possible wall). Placed OFF the ball's fall column so it is a
//     standing tunneling target for later stress plans without trapping the
//     ball here. ---
const THIN_WALL = { ax: 0.2, ay: 2.0, bx: 0.8, by: 2.0 } as const;

// Stable id for the (single) static walls body used in collision events.
const WALL_ID = -1;

/** Internal, mutable view of a ball snapshot (returned read-only as BallState). */
interface MutableBallState {
  id: BallId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
}

/** Internal, mutable 2D point (returned read-only as Vec2). */
interface MutableVec2 {
  x: number;
  y: number;
}

/** Identity stamped onto each Planck body's userData for event classification. */
interface BodyTag {
  kind: "ball" | "wall" | "flipper";
  id: number;
}

type PlanckBody = ReturnType<World["createDynamicBody"]>;

function asTag(userData: unknown): BodyTag | null {
  if (
    typeof userData === "object" &&
    userData !== null &&
    "kind" in userData &&
    "id" in userData
  ) {
    return userData as BodyTag;
  }
  return null;
}

function classifyContact(
  a: BodyTag["kind"],
  b: BodyTag["kind"],
): CollisionEventType | null {
  const kinds = new Set([a, b]);
  if (kinds.has("ball") && kinds.has("wall")) return "ball-wall";
  if (kinds.has("ball") && kinds.has("flipper")) return "ball-flipper";
  if (a === "ball" && b === "ball") return "ball-ball";
  return null;
}

function segment(ax: number, ay: number, bx: number, by: number): Segment {
  return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
}

export class PlanckWorld implements PhysicsWorld {
  private readonly world: World;

  private nextId = 0;

  private readonly balls: { id: BallId; body: PlanckBody }[] = [];

  // Pooled snapshot arrays — mutated in place by `step()`, never reallocated
  // once steady-state ball/contact counts are reached.
  private readonly ballPool: MutableBallState[] = [];
  private readonly contactPoints: MutableVec2[] = [];
  private readonly flippers: FlipperState[] = [];
  private readonly segments: readonly Segment[];

  // Accumulated collision events, handed off (and reset) by `drainEvents()`.
  private events: CollisionEvent[] = [];

  constructor() {
    // Gravity is the IN-PLANE projection along the tilted playfield (D-08),
    // NOT full vertical g — this is what makes the fall read as a heavy roll.
    this.world = new World({ gravity: Vec2(0, IN_PLANE_GRAVITY) });
    this.segments = this.buildBoundary();
    this.world.on("post-solve", (contact, impulse) => {
      const a = asTag(contact.getFixtureA().getBody().getUserData());
      const b = asTag(contact.getFixtureB().getBody().getUserData());
      if (!a || !b) return;
      const type = classifyContact(a.kind, b.kind);
      if (!type) return;
      let normalImpulse = 0;
      for (const value of impulse.normalImpulses) normalImpulse += value;
      const wm = contact.getWorldManifold(null);
      const first = wm && wm.pointCount > 0 ? wm.points[0] : undefined;
      this.events.push({
        type,
        aId: a.id,
        bId: b.id,
        point: { x: first?.x ?? 0, y: first?.y ?? 0 },
        normalImpulse,
      });
    });
  }

  /** Build the bounded box from a chain loop + one thin interior edge (static). */
  private buildBoundary(): readonly Segment[] {
    const w = WIDTH_M;
    const h = HEIGHT_M;
    const walls = this.world.createBody(); // static by default
    const wallTag: BodyTag = { kind: "wall", id: WALL_ID };
    walls.setUserData(wallTag);

    // Perimeter as a closed chain of edges (chain shape, loop = true).
    const corners = [Vec2(0, 0), Vec2(w, 0), Vec2(w, h), Vec2(0, h)];
    walls.createFixture(new Chain(corners, true), { friction: WALL_FRICTION });

    // One deliberately thin interior wall (edge shape) — future tunneling target.
    walls.createFixture(
      new Edge(
        Vec2(THIN_WALL.ax, THIN_WALL.ay),
        Vec2(THIN_WALL.bx, THIN_WALL.by),
      ),
      { friction: WALL_FRICTION },
    );

    return [
      segment(0, 0, w, 0),
      segment(w, 0, w, h),
      segment(w, h, 0, h),
      segment(0, h, 0, 0),
      segment(THIN_WALL.ax, THIN_WALL.ay, THIN_WALL.bx, THIN_WALL.by),
    ];
  }

  addBall(spec: BallSpec): BallId {
    const id = this.nextId++;
    const radius = spec.radius ?? BALL_RADIUS_M;
    const vx = spec.vx ?? 0;
    const vy = spec.vy ?? 0;

    const body = this.world.createDynamicBody({
      position: Vec2(spec.x, spec.y),
      linearVelocity: Vec2(vx, vy),
      // Velocity-proportional drag → the ball settles and reads as HEAVY (D-08).
      linearDamping: BALL_LINEAR_DAMPING,
      // Continuous collision detection: the make-or-break anti-tunneling flag.
      bullet: true,
    });
    body.setBullet(true); // explicit CCD enable (belt-and-braces; D-01/PHYS-02)

    body.createFixture(new Circle(radius), {
      density: BALL_DENSITY,
      friction: BALL_FRICTION,
      restitution: BALL_RESTITUTION,
    });

    const tag: BodyTag = { kind: "ball", id };
    body.setUserData(tag);

    this.balls.push({ id, body });
    this.ballPool.push({ id, x: spec.x, y: spec.y, vx, vy, radius, angle: 0 });
    return id;
  }

  step(dtSeconds: number): void {
    this.world.step(dtSeconds, VELOCITY_ITERATIONS, POSITION_ITERATIONS);

    // Refresh pooled ball snapshots in place (no allocation).
    for (let i = 0; i < this.balls.length; i++) {
      const entry = this.balls[i];
      const snap = this.ballPool[i];
      if (!entry || !snap) continue;
      const pos = entry.body.getPosition();
      const vel = entry.body.getLinearVelocity();
      snap.id = entry.id;
      snap.x = pos.x;
      snap.y = pos.y;
      snap.vx = vel.x;
      snap.vy = vel.y;
      snap.angle = entry.body.getAngle();
    }

    this.syncContactPoints();
  }

  /** Rewrite the pooled contact-point array from the live contact list. */
  private syncContactPoints(): void {
    let n = 0;
    for (let c = this.world.getContactList(); c; c = c.getNext()) {
      if (!c.isTouching()) continue;
      const wm = c.getWorldManifold(null);
      if (!wm) continue;
      for (let k = 0; k < wm.pointCount; k++) {
        const p = wm.points[k];
        if (!p) continue;
        const existing = this.contactPoints[n];
        if (existing) {
          existing.x = p.x;
          existing.y = p.y;
        } else {
          this.contactPoints.push({ x: p.x, y: p.y });
        }
        n++;
      }
    }
    // Truncate to the active count; objects at indices < n are reused next step.
    this.contactPoints.length = n;
  }

  getBalls(): readonly BallState[] {
    return this.ballPool;
  }

  getFlippers(): readonly FlipperState[] {
    return this.flippers;
  }

  getBoundarySegments(): readonly Segment[] {
    return this.segments;
  }

  getContactPoints(): readonly Vec2Value[] {
    return this.contactPoints;
  }

  drainEvents(): CollisionEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }
}
