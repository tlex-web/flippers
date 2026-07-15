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
  FLIPPER_RETURN_SPEED,
  FLIPPER_TIP_RADIUS_M,
  FLIPPER_UP_SPEED,
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

// --- Two mirrored FEEL flippers on the throwaway 2×3 m test rig (D-11). Their
//     placement is test-scaffold geometry (a replaceable local const like the
//     Phase-1 single flipper), NOT real Space Cadet table layout — that is
//     Phase 3. Feel/torque/angle values live in constants.ts; only the pivots +
//     capsule shape live here.
//
//     Placement is chosen so neither flipper's swept fixture sector touches the
//     rig's test balls at ANY angle in its limits: the ball fall column (x≈1.5),
//     the thin interior wall (y=2.0), and the stability harness's resting balls
//     (the bottom-right corner rest ≈ (1.79, 2.79) and the floor balls the drop/
//     energy proofs roll along y≈2.8, x∈[1.0,1.8]). The left flipper keeps the
//     Phase-1 lower-left pivot; the mirrored right flipper points toward the left
//     wall from the lower-center, its whole arc held above y≈2.6 and left of the
//     fall column, so all Phase-1 proofs stay green. ---
const FLIPPER_PIVOT_L = { x: 0.35, y: 2.6 } as const;
const FLIPPER_PIVOT_R = { x: 1.15, y: 2.35 } as const;
const FLIPPER_ID_L = 0;
const FLIPPER_ID_R = 1;
const FLIPPER_DENSITY = 1;

// --- Capsule bat geometry (local body frame, meters; D-07). The pivot is at
//     local x=0 and the bat extends +x; the mirrored flipper is rotated to point
//     the other way via its body angle, NOT by changing these fixtures. A Box
//     core plus a rounded tip Circle (Planck 1.5 = Box2D 2.4 has no native
//     capsule); a base Circle rounds the hinge so the ball cannot snag the pivot
//     corner while cradling. Core spans local x∈[0.07, 0.43]; tip circle reaches
//     x≈0.50 = FLIPPER_LENGTH_M. ---
const CAP_CORE_HALF_LEN = 0.18;
const CAP_CORE_CENTER_X = 0.25;
const CAP_TIP_X = 0.43;
const CAP_BASE_X = 0.07;

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
  tipRadius: number;
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

  // Reused output view handed back by `drainEvents()` — refilled with the live
  // pooled records and truncated in place, so a per-frame draining consumer (the
  // sandbox rAF loop) allocates NO new array per drain.
  private readonly drainedEvents: MutableCollisionEvent[] = [];

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
    // Two mirrored capsule flippers (D-07/D-11). N flippers is additive: the
    // joint/pool registries are index-iterated in step().
    this.buildFlipper(FLIPPER_ID_L, FLIPPER_PIVOT_L, false);
    this.buildFlipper(FLIPPER_ID_R, FLIPPER_PIVOT_R, true);
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
   * Build one FEEL flipper: a DYNAMIC multi-fixture CAPSULE bat on a MOTORIZED
   * REVOLUTE JOINT — the canonical Box2D pinball flipper (CLAUDE.md § "What NOT
   * to Use": kinematic flippers transfer momentum wrong and interact badly with
   * CCD). The bat is a Box core + rounded tip Circle (+ hinge Circle), D-07: the
   * fat rounded tip removes the sharp-corner snag so the ball catches/rolls
   * cleanly (FLIP-03) and the `v = ω × r` tip-vs-base difference reads (FLIP-02).
   *
   * `mirror` produces the right flipper by constructing the bat at body angle π
   * (pointing −x). Planck derives the joint's referenceAngle from that body
   * angle, so the SAME reference-relative limits [FLIPPER_LOWER_ANGLE,
   * FLIPPER_UPPER_ANGLE] describe a mirror-reflected sweep — no per-flipper limit
   * math, and `bat.getAngle()` (≈π) reports the true orientation for the renderer
   * and swept-tunnel harness. The bat is NOT a bullet: its anti-tunnel guarantee
   * is D-01 sub-stepping (plan 02-04), never setBullet.
   */
  private buildFlipper(
    id: number,
    pivot: { readonly x: number; readonly y: number },
    mirror: boolean,
  ): void {
    const px = pivot.x;
    const py = pivot.y;
    // Right flipper starts pointing −x (body angle π); left points +x (angle 0).
    const restAngle = mirror ? Math.PI : 0;

    // Static hinge the bat pivots around.
    const hinge = this.world.createBody({ position: Vec2(px, py) });

    // Dynamic capsule bat. All fixtures share the flipper density/friction and
    // restitution 0 — a caught ball must not micro-bounce off the bat (D-06(3);
    // Box2D takes the MAX restitution of the contacting pair, so 0 here means the
    // bat never ADDS bounce beyond the ball's own).
    const bat = this.world.createDynamicBody({
      position: Vec2(px, py),
      angle: restAngle,
    });
    const fixtureOpts = {
      density: FLIPPER_DENSITY,
      friction: WALL_FRICTION,
      restitution: 0,
    };
    // Box core.
    bat.createFixture(
      new Box(CAP_CORE_HALF_LEN, FLIPPER_HALF_WIDTH_M, Vec2(CAP_CORE_CENTER_X, 0)),
      fixtureOpts,
    );
    // Rounded tip (the fast, tunnel-prone end) at local x = CAP_TIP_X.
    bat.createFixture(
      new Circle(Vec2(CAP_TIP_X, 0), FLIPPER_TIP_RADIUS_M),
      fixtureOpts,
    );
    // Rounded hinge end so a cradling ball cannot catch the pivot corner (D-07).
    bat.createFixture(
      new Circle(Vec2(CAP_BASE_X, 0), FLIPPER_TIP_RADIUS_M),
      fixtureOpts,
    );
    const tag: BodyTag = { kind: "flipper", id };
    bat.setUserData(tag);

    // Motorized revolute joint: motor ON (default drives toward the rest/upper
    // limit), high max torque, bounded ~45° arc. The limits are reference-
    // relative (referenceAngle = restAngle), so the mirror reuses them.
    const joint = new RevoluteJoint(
      {
        enableMotor: true,
        motorSpeed: FLIPPER_UP_SPEED,
        maxMotorTorque: FLIPPER_MAX_MOTOR_TORQUE,
        enableLimit: true,
        lowerAngle: FLIPPER_LOWER_ANGLE,
        upperAngle: FLIPPER_UPPER_ANGLE,
      },
      hinge,
      bat,
      Vec2(px, py),
    );
    this.world.createJoint(joint);

    this.flipperJoints.push({ id, body: bat, joint });
    this.flipperPool.push({
      id,
      pivotX: px,
      pivotY: py,
      angle: bat.getAngle(),
      length: FLIPPER_LENGTH_M,
      halfWidth: FLIPPER_HALF_WIDTH_M,
      tipRadius: FLIPPER_TIP_RADIUS_M,
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
    // Sign-only hook (D-05): the adapter maps it to the FEEL speeds — a snappy
    // raise and a softer return — replacing the single Phase-1 stress speed.
    // Mirroring lives in the joint geometry, so the sign→speed map is uniform.
    const speed =
      direction > 0
        ? FLIPPER_UP_SPEED
        : direction < 0
          ? -FLIPPER_RETURN_SPEED
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
    // Refill the reused view with the live pooled records and truncate it, then
    // reset the count so the pool is recycled (and stays BOUNDED) next cycle —
    // no new-array allocation per drain (mirrors the contact-point pool). The
    // returned records are pooled and mutated on the next step; per the
    // interface contract, copy out anything retained past the next drain/step.
    const view = this.drainedEvents;
    for (let i = 0; i < this.eventCount; i++) {
      const slot = this.eventPool[i];
      if (slot) view[i] = slot;
    }
    view.length = this.eventCount;
    this.eventCount = 0;
    return view;
  }
}
