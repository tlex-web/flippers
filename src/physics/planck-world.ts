/**
 * Planck.js adapter — the ONLY file in the codebase allowed to import `planck`
 * (D-01: Planck-first, behind the engine-agnostic interface). Everything else
 * talks to physics exclusively through `PhysicsWorld` from `./types`, so the
 * engine stays swappable and the headless proof (D-05) is engine-independent.
 *
 * The world is built from ONE resolved table spec (`src/table`, D-01/D-02): a
 * single static body carries one fixture per wall/chute/drain/bumper element,
 * each tagged with its spec `{ kind, id }`, and each spec flipper mount becomes
 * a motorized capsule bat. The same resolve output backs `getBoundarySegments()`
 * and `getElements()`, so the colliders and every consumer's geometry are the
 * same vertices by construction. Snapshots are read out of pre-allocated pooled
 * arrays that `step()` mutates — no per-frame allocation on the render read path.
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
  type Contact,
} from "planck";

import {
  BALL_DENSITY,
  BALL_FRICTION,
  BALL_LINEAR_DAMPING,
  BALL_RADIUS_M,
  BALL_RESTITUTION,
  FIXED_DT,
  FLIPPER_HALF_WIDTH_M,
  FLIPPER_LENGTH_M,
  FLIPPER_LOWER_ANGLE,
  FLIPPER_MAX_ANGULAR_SPEED,
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
  CollisionPartnerKind,
  FlipperState,
  PhysicsWorld,
  Segment,
  Vec2 as Vec2Value,
} from "./types";
import { resolve, type ResolvedElement } from "../table/resolve";
import {
  TABLE_SPEC,
  type ElementKind,
  type TableSpec,
} from "../table/spec";

// --- Solver tuning (Box2D defaults; crank up only if bounces feel mushy). ---
const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;

// --- Wall material: low grip so the ball slides along walls like real steel. ---
const WALL_FRICTION = 0.1;

// --- Flipper bat material. Placement (pivot + mirror) comes from the table
//     spec's flipper mounts; feel/torque/angle values live in constants.ts; only
//     the capsule shape lives here. ---
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

// --- D-01 adaptive angular sub-stepping law -------------------------------- //
// N = ceil(ω · FLIPPER_LENGTH_M · FIXED_DT / (0.5 · BALL_RADIUS_M)): the number
// of Planck sub-steps that keep the fastest bat's per-sub-step TIP arc below
// ~half a ball radius, so a whipping thin bat cannot sweep THROUGH the ball
// between narrow-phase samples (Planck/Box2D TOI sweeps translation — handled by
// the ball's setBullet — but "can miss" a large rotation; Erin Catto, GDC 2013).
// Kept as a pure scalar function of the LIVE joint speed → deterministic, never
// wall-clock (threat T-02-09 / replay).
const SUB_STEP_TRAVEL_LIMIT = 0.5 * BALL_RADIUS_M;

/** Sub-step count for a given peak flipper angular speed ω (rad/s). */
function subStepsFor(omega: number): number {
  return Math.max(
    1,
    Math.ceil((omega * FLIPPER_LENGTH_M * FIXED_DT) / SUB_STEP_TRAVEL_LIMIT),
  );
}

// Secondary cap (D-02): the D-01 count clamped to the bound derived from the
// pathological-ω ceiling FLIPPER_MAX_ANGULAR_SPEED (≈ N ≤ 4). A BOUND ONLY — the
// non-penetration guarantee is the sub-stepping, never this clamp (see the
// FLIPPER_MAX_ANGULAR_SPEED doc block). Computed once at module load (no per-step
// work); FLIPPER_MAX_ANGULAR_SPEED = 96 → SUB_STEP_N_MAX = 4.
const SUB_STEP_N_MAX = subStepsFor(FLIPPER_MAX_ANGULAR_SPEED);

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
interface MutableCollisionEvent extends ContactIdentity {
  point: MutableVec2;
  normalImpulse: number;
}

/**
 * The normalized identity of one contact, written by `normalizeContact`: the
 * coarse type, the ball side, and the element side (D-12).
 */
export interface ContactIdentity {
  type: CollisionEventType;
  ballId: BallId;
  elementKind: CollisionPartnerKind;
  elementId: number;
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
  restLimitAngle: number;
}

/**
 * Identity stamped onto Planck userData for event classification: on each
 * static table FIXTURE (spec `{ kind, id }`) and on ball / flipper BODIES.
 */
interface BodyTag {
  kind: "ball" | ElementKind;
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
  // Direct comparisons — no per-contact `new Set`/array literal (this runs
  // inside `world.step()` on the 60fps path; steady-state zero allocation).
  // Coarse on purpose: any non-ball, non-flipper element reads as "ball-wall".
  if (a === "ball" && b === "ball") return "ball-ball";
  if (a === "ball") return b === "flipper" ? "ball-flipper" : "ball-wall";
  if (b === "ball") return a === "flipper" ? "ball-flipper" : "ball-wall";
  return null;
}

/**
 * Normalize one contact pair into `out` (D-12), independent of which fixture the
 * engine reported as A or B. The ball side is the tag whose kind is `"ball"`;
 * for ball-ball the smaller id is `ballId` and the larger is `elementId`, with
 * `elementKind` `"ball"`. Returns false, writing nothing, when neither side is
 * a ball. Pure and allocation-free; exported for the order-independence tests.
 */
export function normalizeContact(
  out: ContactIdentity,
  a: { readonly kind: BodyTag["kind"]; readonly id: number },
  b: { readonly kind: BodyTag["kind"]; readonly id: number },
): boolean {
  const type = classifyContact(a.kind, b.kind);
  if (!type) return false;
  out.type = type;
  if (type === "ball-ball") {
    out.ballId = a.id < b.id ? a.id : b.id;
    out.elementKind = "ball";
    out.elementId = a.id < b.id ? b.id : a.id;
  } else if (a.kind === "ball") {
    out.ballId = a.id;
    out.elementKind = b.kind;
    out.elementId = b.id;
  } else {
    out.ballId = b.id;
    out.elementKind = a.kind;
    out.elementId = a.id;
  }
  return true;
}

/** Fixture tag first (static table elements), body tag as the fallback. */
function tagOf(fixture: {
  getUserData(): unknown;
  getBody(): { getUserData(): unknown };
}): BodyTag | null {
  return asTag(fixture.getUserData()) ?? asTag(fixture.getBody().getUserData());
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

  /**
   * Adaptive angular sub-stepping master switch (FLIP-04/D-01). Defaults to TRUE.
   * When true, `step()` splits the fixed step into `N` Planck sub-steps derived
   * from the live flipper joint speed so the fastest bat can never sweep THROUGH
   * the ball (the primary rotational anti-tunnel guarantee, D-01). Set FALSE
   * **only** for plan 02-05's FLIP-04 negative control, which drives the flipper
   * at peak ω with sub-stepping forced OFF (N always 1) so the seeded gate goes
   * RED — proving the green gate is held by the MECHANISM, not by luck.
   *
   * Independent of `bullet`: this toggles the ROTATIONAL guarantee only; the
   * ball's translational `setBullet` CCD is unaffected either way.
   */
  readonly subStepping?: boolean;

  /**
   * The table to build (D-01/D-05). Every static collider and both flipper
   * mounts come from this one spec via a single `resolve()`. Defaults to
   * `TABLE_SPEC`, our original playfield with its two spec-placed flippers.
   * Harness proofs calibrated against the throwaway rig pass `PROOF_BOX_SPEC`
   * by name, so this default never moves a calibrated proof.
   */
  readonly table?: TableSpec;
}

export class PlanckWorld implements PhysicsWorld {
  private readonly world: World;

  /** Whether balls are created with CCD armed (see PlanckWorldOptions.bullet). */
  private readonly bulletEnabled: boolean;

  /** Whether step() adapts N sub-steps to flipper ω (see options.subStepping). */
  private readonly subSteppingEnabled: boolean;

  /**
   * Diagnostic: the `N` chosen by the LAST `step()`'s adaptive sub-stepping
   * (D-01). A concrete-class field ONLY — deliberately NOT on the `PhysicsWorld`
   * interface, so engine internals never leak into the contract. The 02-04 unit
   * test reads it to assert the sub-step law (1 at rest, 2 at up-speed, bounded
   * under a hard drive, 1 when sub-stepping is disabled).
   */
  lastSubStepCount = 1;

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
    /** Motor-speed sign that RAISES this bat (tip toward -y). See buildFlipper. */
    raiseSign: number;
    /**
     * Last normalized command (-1, 0, +1) given to setFlipperMotor; NaN until
     * the first command, so that first command always counts as a change. See
     * the limit-impulse reset in setFlipperMotor.
     */
    lastDirection: number;
  }[] = [];

  /** The one resolve output (D-01): fixtures, segments and getElements() all read it. */
  private readonly elements: readonly ResolvedElement[];

  /** Solid (non-sensor) segments of `elements`, same object references. */
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

  /**
   * True only inside `primeBallCcd`'s hidden `world.step` (03-REVIEW WR-01).
   * Solid (post-solve) events from that step are discarded: the priming
   * impulse is thrown away with the restored spawn state, and any contact that
   * persists is reported again by the next real step, so keeping them would
   * merge a fake or duplicate report into that step's batch. Sensor
   * begin-contacts are KEPT: a begin fires once per overlap, and the contact
   * outlives the prime step, so dropping it would lose the overlap for good.
   */
  private priming = false;

  constructor(options?: PlanckWorldOptions) {
    // CCD defaults ON; the soak's negative control passes { bullet: false }.
    this.bulletEnabled = options?.bullet ?? true;
    // Adaptive angular sub-stepping (D-01) defaults ON; plan 02-05's FLIP-04
    // negative control passes { subStepping: false } to force N = 1.
    this.subSteppingEnabled = options?.subStepping ?? true;
    // Gravity is the IN-PLANE projection along the tilted playfield (D-08),
    // NOT full vertical g — this is what makes the fall read as a heavy roll.
    // `continuousPhysics` (the TOI solver) is the world-level CCD switch — off
    // only for the negative control, so a fast ball tunnels the static wall.
    this.world = new World({
      gravity: Vec2(0, IN_PLANE_GRAVITY),
      continuousPhysics: this.bulletEnabled,
    });
    // ONE resolve (D-01): validates the spec (throws before any body exists on a
    // malformed descriptor) and is the single origin of every collider below.
    this.elements = resolve(options?.table ?? TABLE_SPEC);
    this.segments = this.buildTable(this.elements);
    // Solid contacts are reported once per solve with their summed normal
    // impulse (a hit-strength proxy).
    this.world.on("post-solve", (contact, impulse) => {
      if (this.priming) return;
      let normalImpulse = 0;
      const impulses = impulse.normalImpulses;
      for (let i = 0; i < impulses.length; i++) normalImpulse += impulses[i] ?? 0;
      this.emitContact(contact, normalImpulse);
    });
    // Sensors (lanes, rollovers, the drain) are never solved, so they never
    // fire post-solve: report them once, when the overlap begins, with impulse
    // 0. Solid contacts are left to post-solve so each is reported exactly once
    // per solve with its real impulse (03-RESEARCH Pitfall 1).
    this.world.on("begin-contact", (contact) => {
      if (contact.getFixtureA().isSensor() || contact.getFixtureB().isSensor()) {
        this.emitContact(contact, 0);
      }
    });
  }

  /**
   * Shared emit path for every reported contact: read both tags (fixture tag
   * first, body tag as the fallback), and only when one side is a ball reserve
   * a pooled slot and fill it through `normalizeContact`, so non-ball pairs
   * consume nothing. The point is the first manifold point; a contact with no
   * manifold points (a sensor overlap) uses the ball body's center instead.
   * Zero allocation per contact: pooled slot, shared `scratchWm`, and the
   * body's own position vector read in place.
   */
  private emitContact(contact: Contact, normalImpulse: number): void {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const a = tagOf(fa);
    const b = tagOf(fb);
    if (!a || !b) return;
    if (!classifyContact(a.kind, b.kind)) return;
    const evt = this.nextEventSlot();
    normalizeContact(evt, a, b);
    evt.normalImpulse = normalImpulse;
    // Check the contact's OWN manifold first (03-REVIEW CR-02): for a 0-point
    // manifold (every sensor overlap) Planck's `getWorldManifold` returns the
    // shared `scratchWm` untouched, still holding the last solid contact's
    // point, so its `pointCount` cannot be trusted here.
    const first =
      contact.getManifold().pointCount > 0
        ? contact.getWorldManifold(this.scratchWm)?.points[0]
        : undefined;
    if (first) {
      evt.point.x = first.x;
      evt.point.y = first.y;
    } else {
      // The ball side's body: for ball-ball, the one whose id is `ballId`.
      const ballFixture = a.kind === "ball" && a.id === evt.ballId ? fa : fb;
      const center = ballFixture.getBody().getPosition();
      evt.point.x = center.x;
      evt.point.y = center.y;
    }
  }

  /**
   * Build the table from the resolved spec. ONE static body receives, in spec
   * order, one fixture per non-mount element: a two-vertex open polyline becomes
   * an Edge, any longer or looped polyline a Chain of its vertices, a circle a
   * Circle offset to its center. Each fixture is tagged with its spec
   * `{ kind, id }` and takes `isSensor` from the element. Flipper mounts are
   * built after every static fixture, in spec order, so the body/fixture
   * creation order for a given spec is fixed (the calibrated proofs depend on
   * it). Returns the solid boundary segments: the concatenated `segments` of
   * every non-sensor, non-mount element, same object references.
   */
  private buildTable(elements: readonly ResolvedElement[]): readonly Segment[] {
    const walls = this.world.createBody(); // static by default
    const solid: Segment[] = [];
    for (const el of elements) {
      if (el.mount) continue;
      const fixtureOpts = {
        friction: WALL_FRICTION,
        isSensor: el.sensor,
        userData: { kind: el.kind, id: el.id } satisfies BodyTag,
      };
      if (el.circle) {
        const c = el.circle;
        walls.createFixture(
          new Circle(Vec2(c.center.x, c.center.y), c.radius),
          fixtureOpts,
        );
      } else {
        const v = el.vertices;
        const first = v[0];
        const second = v[1];
        if (!el.loop && v.length === 2 && first && second) {
          walls.createFixture(
            new Edge(Vec2(first.x, first.y), Vec2(second.x, second.y)),
            fixtureOpts,
          );
        } else {
          walls.createFixture(
            new Chain(
              v.map((p) => Vec2(p.x, p.y)),
              el.loop,
            ),
            fixtureOpts,
          );
        }
      }
      if (!el.sensor) {
        for (const seg of el.segments) solid.push(seg);
      }
    }
    // Flipper mounts (D-05): N flippers is additive — the joint/pool registries
    // are index-iterated in step().
    for (const el of elements) {
      if (el.mount) {
        this.buildFlipper(el.id, el.mount.pivot, el.mount.mirror, el.mount.restPose);
      }
    }
    return solid;
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
   *
   * PER-FLIPPER RAISE SIGN (the bug-fix core, D-05). A body-angle-π rotation
   * PRESERVES rotational handedness — it is NOT a true geometric reflection — so a
   * POSITIVE joint speed (increasing angle) sweeps the tip toward +y (DOWN, droop)
   * on the un-mirrored left bat but toward −y (UP, raise) on the mirrored right
   * bat. The two mirror-image flippers therefore counter-rotate and need OPPOSITE
   * motor signs to both raise their tip. `raiseSign` captures that engine-specific
   * fact here (left −1, right +1); `setFlipperMotor` multiplies the engine-agnostic
   * `+1 = raise` command by it, so BOTH bats sweep their tip UP on +1 and drive to
   * the SAME symmetric limits: +1 → each bat's raised/up limit (held-up cradle),
   * −1 → each bat's rest/down limit. The controller stays engine-agnostic (D-05).
   *
   * REST POSE (`restPose`, playfield mounts only, D-05). The joint geometry is
   * identical either way: the bat is still created level, so referenceAngle and
   * the limits are unchanged. With `restPose` the joint's construction motor
   * speed is 0 (nothing drives into a limit, the Phase-2 startup limit-jam) and,
   * right after the joint exists, the bat is placed at its DROOP limit — the one
   * opposite its raise direction: +FLIPPER_UPPER_ANGLE on the left (raiseSign
   * −1), FLIPPER_LOWER_ANGLE on the mirrored right (raiseSign +1) — so the pair
   * starts as a resting, mirror-symmetric inverted-V. Without `restPose` (the
   * harness proof box) the exact pre-existing path runs, construction motor
   * included, which keeps the FLIP-04 calibration byte-identical.
   */
  private buildFlipper(
    id: number,
    pivot: { readonly x: number; readonly y: number },
    mirror: boolean,
    restPose: boolean,
  ): void {
    const px = pivot.x;
    const py = pivot.y;
    // Right flipper starts pointing −x (body angle π); left points +x (angle 0).
    const restAngle = mirror ? Math.PI : 0;
    // Motor-speed sign that RAISES this bat (tip toward −y). A positive joint speed
    // increases the angle, which drops the left (un-mirrored) tip but lifts the
    // right (mirrored) tip — so raising needs −1 on the left, +1 on the right.
    const raiseSign = mirror ? 1 : -1;

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

    // Motorized revolute joint: motor ON, high max torque, bounded ~45° arc. The
    // limits are reference-relative (referenceAngle = restAngle), so the mirror
    // reuses them. Construction motor speed: 0 for a rest-pose mount (posed at
    // its droop limit below); otherwise the default FLIPPER_UP_SPEED, left
    // unchanged so the FLIP-04 soak/teeth calibration — which reads flipper[0]'s
    // post-prime angle on the proof box — is byte-for-byte preserved. Either way
    // the composition root constructs the FlipperController (motor 0) before the
    // first ball, so the idle pose is the construction pose.
    const joint = new RevoluteJoint(
      {
        enableMotor: true,
        motorSpeed: restPose ? 0 : FLIPPER_UP_SPEED,
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

    // Droop limit = the limit opposite the raise direction (joint angle is body
    // angle minus the level referenceAngle `restAngle`). Its body angle is the
    // static rest-limit angle every spec reports (FlipperState.restLimitAngle).
    const droop = raiseSign < 0 ? FLIPPER_UPPER_ANGLE : FLIPPER_LOWER_ANGLE;
    const restLimitAngle = restAngle + droop;
    if (restPose) {
      bat.setTransform(Vec2(px, py), restLimitAngle);
    }

    // lastDirection NaN: the construction motor speed is not a commanded
    // direction, so the first setFlipperMotor call always resets the limit.
    this.flipperJoints.push({ id, body: bat, joint, raiseSign, lastDirection: NaN });
    this.flipperPool.push({
      id,
      pivotX: px,
      pivotY: py,
      angle: bat.getAngle(),
      length: FLIPPER_LENGTH_M,
      halfWidth: FLIPPER_HALF_WIDTH_M,
      tipRadius: FLIPPER_TIP_RADIUS_M,
      restLimitAngle,
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

  removeBall(id: BallId): void {
    for (let i = 0; i < this.balls.length; i++) {
      const entry = this.balls[i];
      if (!entry || entry.id !== id) continue;
      // Destroy the Planck body (frees its fixtures + contacts). Only the sandbox
      // feed calls this, BETWEEN steps (never mid-`step()`), so tearing the body
      // down cannot disturb an in-flight contact solve.
      this.world.destroyBody(entry.body);
      // Swap-remove from BOTH parallel pools (balls[] and ballPool[]) so they stay
      // index-aligned: move the last entry into this slot, then drop the tail. Order
      // is irrelevant — consumers key by id, and the loop snapshots by index then
      // truncates to length. No per-call allocation.
      const lastIdx = this.balls.length - 1;
      const lastBall = this.balls[lastIdx];
      const lastSnap = this.ballPool[lastIdx];
      if (lastBall) this.balls[i] = lastBall;
      if (lastSnap) this.ballPool[i] = lastSnap;
      this.balls.pop();
      this.ballPool.pop();
      return;
    }
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
    // The step runs the WHOLE world (load-bearing: the FLIP-04 calibration reads
    // flipper[0]'s post-prime angle), so its solid events — the new ball on the
    // floor, any other ball's contacts — are suppressed (see `priming`); the
    // caller runs addBall at a fixed-step boundary (sandbox: `onPostStep`).
    this.priming = true;
    try {
      this.world.step(FIXED_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    } finally {
      this.priming = false;
    }

    this.world.destroyBody(primer);

    // Discard the priming impulse: restore the exact requested spawn state.
    body.setTransform(Vec2(x, y), 0);
    body.setLinearVelocity(Vec2(vx, vy));
    body.setAngularVelocity(0);
    body.setAwake(true);
  }

  step(dtSeconds: number): void {
    // --- D-01 adaptive angular sub-stepping (the FLIP-04 rotational anti-tunnel
    //     guarantee). Size N from the LIVE peak flipper joint speed so the
    //     fastest bat's per-sub-step tip arc stays below ~half a ball radius,
    //     shrinking the rotation below what Planck's discrete narrow phase can
    //     miss. N is derived from joint speed, NEVER wall-clock, so replay stays
    //     deterministic (threat T-02-09). `subStepping: false` forces N = 1 (the
    //     02-05 negative-control hook). Everything here is scalar — no array, no
    //     per-step allocation (threat T-02-07 zero-alloc discipline). ---
    let omega = 0;
    for (let i = 0; i < this.flipperJoints.length; i++) {
      const entry = this.flipperJoints[i];
      if (!entry) continue;
      const speed = Math.abs(entry.joint.getJointSpeed());
      if (speed > omega) omega = speed;
    }

    let subSteps = 1;
    if (this.subSteppingEnabled) {
      subSteps = subStepsFor(omega);
      // Secondary cap (D-02): a BOUND only — never the non-penetration mechanism.
      if (subSteps > SUB_STEP_N_MAX) subSteps = SUB_STEP_N_MAX;
    }
    this.lastSubStepCount = subSteps;

    // Split into N Planck sub-steps whose dts sum EXACTLY to dtSeconds (the last
    // sub-step takes the remainder so float drift can't accumulate; N = 1 is a
    // single full step, bit-identical to before). Collision events ACCUMULATE
    // across sub-steps: the post-solve handler appends into the grow-only event
    // pool and ONLY drainEvents() resets the count — so we must NOT drain (or
    // otherwise reset) between sub-steps (threat T-02-08). Ball/flipper pools and
    // contact points sync ONCE, after the last sub-step (below).
    const subDt = dtSeconds / subSteps;
    for (let i = 0; i < subSteps; i++) {
      const stepDt =
        i === subSteps - 1 ? dtSeconds - subDt * (subSteps - 1) : subDt;
      this.world.step(stepDt, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    }

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
      // A sensor overlap is touching but has no manifold points, and Planck
      // would hand back the stale shared `scratchWm` for it (03-REVIEW CR-02).
      if (c.getFixtureA().isSensor() || c.getFixtureB().isSensor()) continue;
      if (c.getManifold().pointCount === 0) continue;
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

  /**
   * Sign-only flipper drive (D-05), with a limit-impulse reset on every change
   * of commanded direction (G-04-10).
   *
   * WHY THE RESET. Planck 1.5's RevoluteJoint warm-starts its accumulated
   * impulses from one step to the next. A bat driven into a joint limit at
   * FLIPPER_MAX_MOTOR_TORQUE saturates both: the motor impulse sits at its clamp
   * (+dt·maxTorque) and the limit impulse grows to cancel it. The limit impulse
   * is the one that pins the bat: on a reversal the motor's own stale warm start
   * is cancelled inside its first velocity iteration (its clamp range always
   * covers it), but the stale limit impulse stays as a reserve the new motor
   * drive must unwind first, and the bat sits still for ~15 fixed steps
   * (~130 ms) before it moves. That was the "flipper ignores my release / TILT
   * pauses" dead time from UAT.
   *
   * THE FIX, through the public API only. `RevoluteJoint.enableLimit(flag)`
   * clears the accumulated limit impulse whenever the flag changes, so toggling
   * it off and back on before the new motor speed is Planck's public way to
   * drop that reserve. The limit is re-enabled in the same call, before the
   * next step, so the bat never runs without its limits. Measured on TABLE_SPEC
   * through the real FSM: release after a 60-step hold 16 → 1 step, press after
   * a 240-step rest 5 → 1 (adapter-level 11 → 1). Same-sign repeats (the held-up
   * +1 re-asserted every step, the resting 0) never reset, so a held cradle
   * keeps its warm-started limit impulse and stays pinned. The joint's internal
   * impulse fields are deliberately never written: only the public toggle is
   * used, and src/physics/flipper-response.test.ts pins the behavior it relies
   * on for planck@1.5.0. (Toggling the MOTOR in the same call does nothing:
   * Planck zeroes the motor impulse only when the motor is disabled at step
   * time.)
   *
   * MAPPING. The engine-agnostic command (+1 = RAISE toward the up/held-up
   * limit, −1 = RETURN toward the rest/down limit, 0 = hold; NaN = 0) maps to
   * the FEEL speeds — a snappy raise and a softer return — times THIS bat's
   * physical raise sign. The mirrored right bat counter-rotates, so raising it
   * needs the opposite motor sign from the left; folding `raiseSign` in here
   * (not in the controller) keeps the FSM engine-agnostic and makes +1 raise
   * BOTH bats toward their own up limit (see buildFlipper).
   *
   * Indexed lookup (structural twin of applyImpulse): this runs per flipper on
   * every 120 Hz step, so it allocates nothing.
   */
  setFlipperMotor(id: number, direction: number): void {
    for (let i = 0; i < this.flipperJoints.length; i++) {
      const entry = this.flipperJoints[i];
      if (!entry || entry.id !== id) continue;
      const sign = direction > 0 ? 1 : direction < 0 ? -1 : 0;
      if (sign !== entry.lastDirection) {
        // Clear the warm-started limit impulse (see the doc block above).
        entry.joint.enableLimit(false);
        entry.joint.enableLimit(true);
        entry.lastDirection = sign;
      }
      const speed =
        sign > 0 ? FLIPPER_UP_SPEED : sign < 0 ? -FLIPPER_RETURN_SPEED : 0;
      entry.joint.setMotorSpeed(speed * entry.raiseSign);
      entry.body.setAwake(true);
      return;
    }
  }

  applyImpulse(ballId: BallId, ix: number, iy: number): void {
    // Structural twin of setFlipperMotor: find by id, no-op when absent. A
    // non-finite component is rejected too (threat T-03-10/T-03-13), so a bad
    // caller can never inject NaN/Infinity into the solver. Called only between
    // fixed steps, so the velocity change lands cleanly on the next step.
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return;
    for (let i = 0; i < this.balls.length; i++) {
      const entry = this.balls[i];
      if (!entry || entry.id !== ballId) continue;
      // At the world center of mass -> purely linear, no torque; wake = true so
      // a ball asleep on the plunger responds.
      entry.body.applyLinearImpulse(Vec2(ix, iy), entry.body.getWorldCenter(), true);
      return;
    }
  }

  getElements(): readonly ResolvedElement[] {
    return this.elements;
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
        ballId: 0,
        elementKind: "wall",
        elementId: 0,
        point: { x: 0, y: 0 },
        normalImpulse: 0,
      };
      this.eventPool.push(slot);
    }
    this.eventCount++;
    return slot;
  }

  drainEvents(): readonly CollisionEvent[] {
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
