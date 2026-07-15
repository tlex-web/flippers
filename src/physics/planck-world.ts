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

import {
  Box,
  Chain,
  Circle,
  Edge,
  RevoluteJoint,
  Vec2,
  World,
  WorldManifold,
} from "planck";

import {
  BALL_FRICTION,
  BALL_LINEAR_DAMPING,
  BALL_RADIUS_M,
  BALL_RESTITUTION,
  FIXED_DT,
  FLIPPER_HALF_WIDTH_M,
  FLIPPER_LENGTH_M,
  FLIPPER_LOWER_ANGLE,
  FLIPPER_MAX_MOTOR_TORQUE,
  FLIPPER_MOTOR_SPEED,
  FLIPPER_UPPER_ANGLE,
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

// --- Max-speed TEST flipper placement in the 2×3 m box. Lower-LEFT, with its
//     bounded sweep arc kept clear of the ball's fall column (x≈1.5) and the
//     thin interior wall (y=2.0), so the stress flipper sweeps real play area
//     without disturbing the baseline single-ball smoke run. Feel/torque values
//     live in constants.ts; only the placement is here (test scaffold geometry,
//     not a tunable feel constant). ---
const FLIPPER_PIVOT = { x: 0.35, y: 2.6 } as const;
const FLIPPER_ID = 0;
const FLIPPER_DENSITY = 1;

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

/** Internal, mutable collision event — pooled and mutated in place (never re-allocated per step). */
interface MutableCollisionEvent {
  type: CollisionEventType;
  aId: number;
  bId: number;
  point: MutableVec2;
  normalImpulse: number;
}

/** Internal, mutable view of a flipper snapshot (returned read-only as FlipperState). */
interface MutableFlipperState {
  id: number;
  pivotX: number;
  pivotY: number;
  angle: number;
  length: number;
  halfWidth: number;
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
  // Direct pair comparison — no per-contact `new Set`/array literal (this runs
  // inside `world.step()` on the 60fps path; steady-state zero allocation).
  if ((a === "ball" && b === "wall") || (a === "wall" && b === "ball")) {
    return "ball-wall";
  }
  if ((a === "ball" && b === "flipper") || (a === "flipper" && b === "ball")) {
    return "ball-flipper";
  }
  if (a === "ball" && b === "ball") return "ball-ball";
  return null;
}

function segment(ax: number, ay: number, bx: number, by: number): Segment {
  return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
}

/** Construction options for the Planck adapter. */
export interface PlanckWorldOptions {
  /**
   * Continuous collision detection master switch (PHYS-02/D-01). Defaults to
   * TRUE. Set FALSE **only** for the soak's negative control, which flings the
   * ball past its real max velocity at the thin wall with CCD OFF to prove the
   * gate goes RED on real tunneling (i.e. that the green gate has teeth, not a
   * false pass).
   *
   * NOTE: Box2D/Planck run CCD against STATIC bodies for every dynamic body
   * regardless of the per-body `setBullet` flag — that flag only ADDS dynamic-
   * vs-dynamic CCD. So merely clearing `setBullet` would still stop the ball at
   * the static thin wall. To make a genuine CCD-off control this therefore also
   * disables the world-level `continuousPhysics` (the TOI solver) so a fast ball
   * actually tunnels through the static wall.
   */
  readonly bullet?: boolean;
}

export class PlanckWorld implements PhysicsWorld {
  private readonly world: World;

  /** Whether balls are created with CCD armed (see PlanckWorldOptions.bullet). */
  private readonly bulletEnabled: boolean;

  private nextId = 0;

  private readonly balls: { id: BallId; body: PlanckBody }[] = [];

  // Pooled snapshot arrays — mutated in place by `step()`, never reallocated
  // once steady-state ball/contact counts are reached.
  private readonly ballPool: MutableBallState[] = [];
  private readonly contactPoints: MutableVec2[] = [];

  // Flipper snapshot pool (mutated in place by `step()`) + the live joint/body
  // registry that backs it (drive hook + angle read-out).
  private readonly flipperPool: MutableFlipperState[] = [];
  private readonly flipperJoints: {
    id: number;
    body: PlanckBody;
    joint: RevoluteJoint;
  }[] = [];

  private readonly segments: readonly Segment[];

  // Collision-event pool: grow-only, mutated in place. `eventCount` is the live
  // count accumulated since the last drain; `drainEvents()` resets it to 0 so a
  // draining consumer keeps the buffer BOUNDED (no per-step object churn, no
  // unbounded growth). Matches the ball/contact snapshot-pool pattern.
  private readonly eventPool: MutableCollisionEvent[] = [];
  private eventCount = 0;

  // One reusable WorldManifold shared by both contact read paths (post-solve +
  // syncContactPoints). Passing it into `getWorldManifold` avoids the fresh
  // `new WorldManifold()` Planck allocates when handed `null` (verified against
  // planck.js internals). Safe to share: both call sites read it out immediately
  // and never retain it, and they never run concurrently (post-solve fires
  // during `world.step()`, sync runs after it returns).
  private readonly scratchWm = new WorldManifold();

  constructor(options?: PlanckWorldOptions) {
    // CCD defaults ON; the soak's negative control passes { bullet: false }.
    this.bulletEnabled = options?.bullet ?? true;
    // Gravity is the IN-PLANE projection along the tilted playfield (D-08),
    // NOT full vertical g — this is what makes the fall read as a heavy roll.
    // `continuousPhysics` (the TOI solver) is the world-level CCD switch — off
    // only for the negative control, so a fast ball tunnels the static wall.
    this.world = new World({
      gravity: Vec2(0, IN_PLANE_GRAVITY),
      continuousPhysics: this.bulletEnabled,
    });
    this.segments = this.buildBoundary();
    this.buildTestFlipper();
    this.world.on("post-solve", (contact, impulse) => {
      const a = asTag(contact.getFixtureA().getBody().getUserData());
      const b = asTag(contact.getFixtureB().getBody().getUserData());
      if (!a || !b) return;
      const type = classifyContact(a.kind, b.kind);
      if (!type) return;
      let normalImpulse = 0;
      for (const value of impulse.normalImpulses) normalImpulse += value;
      const wm = contact.getWorldManifold(this.scratchWm);
      const first = wm && wm.pointCount > 0 ? wm.points[0] : undefined;
      // Reuse a pooled event record + its nested point vector (no per-contact
      // object/point allocation on the step hot path).
      const evt = this.nextEventSlot();
      evt.type = type;
      evt.aId = a.id;
      evt.bId = b.id;
      evt.point.x = first?.x ?? 0;
      evt.point.y = first?.y ?? 0;
      evt.normalImpulse = normalImpulse;
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

  /**
   * Build the max-speed TEST flipper: a DYNAMIC thin bat on a MOTORIZED
   * REVOLUTE JOINT — the canonical Box2D pinball flipper, run at max speed for
   * stress. It is dynamic (NOT kinematic) so momentum transfers through the
   * solver correctly on a ball hit (CLAUDE.md § "What NOT to Use"). This is the
   * dynamic fast-thin-mover the ball must never tunnel through (PHYS-02/D-04).
   */
  private buildTestFlipper(): void {
    const px = FLIPPER_PIVOT.x;
    const py = FLIPPER_PIVOT.y;

    // Static hinge the bat pivots around.
    const pivot = this.world.createBody({ position: Vec2(px, py) });

    // Dynamic bat: a thin box extending from the pivot (body origin) along
    // local +x by FLIPPER_LENGTH_M.
    const bat = this.world.createDynamicBody({ position: Vec2(px, py) });
    bat.createFixture(
      new Box(
        FLIPPER_LENGTH_M / 2,
        FLIPPER_HALF_WIDTH_M,
        Vec2(FLIPPER_LENGTH_M / 2, 0),
      ),
      { density: FLIPPER_DENSITY, friction: WALL_FRICTION },
    );
    const tag: BodyTag = { kind: "flipper", id: FLIPPER_ID };
    bat.setUserData(tag);

    // Motorized revolute joint: motor ON, HIGH max torque, bounded angle arc.
    // The motor is driven at max speed so the bat sweeps the play area for
    // stress; the sign (sweep direction/phase) is steered via setFlipperMotor.
    const joint = new RevoluteJoint(
      {
        enableMotor: true,
        motorSpeed: FLIPPER_MOTOR_SPEED,
        maxMotorTorque: FLIPPER_MAX_MOTOR_TORQUE,
        enableLimit: true,
        lowerAngle: FLIPPER_LOWER_ANGLE,
        upperAngle: FLIPPER_UPPER_ANGLE,
      },
      pivot,
      bat,
      Vec2(px, py),
    );
    this.world.createJoint(joint);

    this.flipperJoints.push({ id: FLIPPER_ID, body: bat, joint });
    this.flipperPool.push({
      id: FLIPPER_ID,
      pivotX: px,
      pivotY: py,
      angle: bat.getAngle(),
      length: FLIPPER_LENGTH_M,
      halfWidth: FLIPPER_HALF_WIDTH_M,
    });
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
      // Disabled only for the soak negative control (bulletEnabled === false).
      bullet: this.bulletEnabled,
    });
    body.setBullet(this.bulletEnabled); // explicit CCD toggle (D-01/PHYS-02)

    body.createFixture(new Circle(radius), {
      density: BALL_DENSITY,
      friction: BALL_FRICTION,
      restitution: BALL_RESTITUTION,
    });

    const tag: BodyTag = { kind: "ball", id };
    body.setUserData(tag);

    // Planck issue #167 guard: `setBullet` CCD can no-op for a body that has
    // never had a contact, so a freshly-added ball could tunnel on its very
    // first high-speed step. Arm CCD now by forcing one real contact on init.
    // (No-op work when CCD is off — the negative control WANTS to tunnel.)
    // https://github.com/piqnt/planck.js/issues/167
    if (this.bulletEnabled) {
      this.primeBallCcd(body, spec.x, spec.y, vx, vy, radius);
    }

    this.balls.push({ id, body });
    this.ballPool.push({ id, x: spec.x, y: spec.y, vx, vy, radius, angle: 0 });
    return id;
  }

  /**
   * Give a newly-added ball its first contact so Planck's CCD is armed before
   * any high-speed launch (issue #167). A tiny temporary static "primer" fixture
   * is overlapped with the ball for a single fixed sub-step so the narrow phase
   * registers a real contact, then the primer is removed and the ball is
   * restored to its exact requested transform + velocity — so priming is
   * invisible to callers (the ball starts precisely where it was specified).
   */
  private primeBallCcd(
    body: PlanckBody,
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
  ): void {
    const primer = this.world.createBody({ position: Vec2(x, y) });
    // Small circle fully inside the ball → guaranteed overlap → touching contact.
    primer.createFixture(new Circle(radius * 0.5), { friction: 0 });

    // One direct sub-step: the broad+narrow phase creates the ball↔primer
    // contact and puts the ball in a solver island, arming its CCD. The primer
    // has no BodyTag, so `post-solve` ignores it → no spurious collision event.
    this.world.step(FIXED_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);

    this.world.destroyBody(primer);

    // Discard the priming impulse: restore the exact requested spawn state.
    body.setTransform(Vec2(x, y), 0);
    body.setLinearVelocity(Vec2(vx, vy));
    body.setAngularVelocity(0);
    body.setAwake(true);
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

    // Refresh pooled flipper snapshots in place (pivot/length/half-width are
    // fixed; only the live joint angle changes as the bat sweeps).
    for (let i = 0; i < this.flipperJoints.length; i++) {
      const entry = this.flipperJoints[i];
      const snap = this.flipperPool[i];
      if (!entry || !snap) continue;
      snap.angle = entry.body.getAngle();
    }

    this.syncContactPoints();
  }

  /** Rewrite the pooled contact-point array from the live contact list. */
  private syncContactPoints(): void {
    let n = 0;
    for (let c = this.world.getContactList(); c; c = c.getNext()) {
      if (!c.isTouching()) continue;
      const wm = c.getWorldManifold(this.scratchWm);
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
    return this.flipperPool;
  }

  setFlipperMotor(id: number, direction: number): void {
    const entry = this.flipperJoints.find((f) => f.id === id);
    if (!entry) return;
    // Only the sign matters — the engine uses its stress-tuned motor speed.
    const speed =
      direction > 0
        ? FLIPPER_MOTOR_SPEED
        : direction < 0
          ? -FLIPPER_MOTOR_SPEED
          : 0;
    entry.joint.setMotorSpeed(speed);
    entry.body.setAwake(true);
  }

  getBoundarySegments(): readonly Segment[] {
    return this.segments;
  }

  getContactPoints(): readonly Vec2Value[] {
    return this.contactPoints;
  }

  /**
   * Reserve the next pooled event slot, growing the pool by one only when the
   * live count outruns it (grow-only). Returns a record to mutate in place.
   */
  private nextEventSlot(): MutableCollisionEvent {
    let slot = this.eventPool[this.eventCount];
    if (!slot) {
      slot = {
        type: "ball-wall",
        aId: 0,
        bId: 0,
        point: { x: 0, y: 0 },
        normalImpulse: 0,
      };
      this.eventPool.push(slot);
    }
    this.eventCount++;
    return slot;
  }

  drainEvents(): CollisionEvent[] {
    // Hand back the live slice and reset the count so the pool is reused (and
    // stays bounded) next cycle. The returned records are pooled and mutated on
    // the next step — per the interface contract, copy out anything retained.
    const drained = this.eventPool.slice(0, this.eventCount);
    this.eventCount = 0;
    return drained;
  }
}
