/**
 * Headless swept-containment soak — the SOLE tunnel-proof pass/fail gate (D-03).
 *
 * "I flung it and it held" is explicitly rejected as proof (D-03). Instead this
 * engine drives the ball/flipper/event INTERFACE (never Planck directly, D-05)
 * at the deterministic `FIXED_DT` step (D-04, plan 01-04), over a SEEDED sweep
 * of launch angle × speed × flipper phase — with launch speeds pushed PAST the
 * ball's real max velocity — flinging the ball at the thinnest wall and the
 * max-speed test flipper. Every step it applies the swept containment invariant
 * `sweptEscaped` (plan 01-05), which catches a ball that punches out and
 * re-enters between two 120 Hz steps (a naive "center inside the box" check does
 * NOT). On any escape it records the case SEED plus the full ball/flipper state
 * so the failure replays deterministically (re-run with `{ seeds: [seed] }`).
 *
 * Because the whole thing rides the interface, the identical proof would judge a
 * custom swept solver unchanged — that is what makes the engine decision (plan
 * 01-07) empirical rather than anecdotal. The `bullet` config toggles CCD off
 * for the negative control ONLY, proving the gate goes RED on real tunneling.
 */

import {
  BALL_RADIUS_M,
  FIXED_DT,
  FLIPPER_LOWER_ANGLE,
  FLIPPER_UPPER_ANGLE,
} from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import { flipperSweptTunnel, sweptEscaped } from "./containment";
import { mulberry32 } from "./prng";
import type {
  FlipperState,
  PhysicsWorld,
  Segment,
  Vec2,
} from "../physics/types";

/** Which stress target a case's launch is aimed at. */
export type LaunchMode = "thin-wall" | "flipper" | "free";

/** Configuration for a soak run. */
export interface SoakConfig {
  /**
   * Master seed for the sweep (mulberry32; NEVER `Math.random`, D-04). Each
   * case draws its own 32-bit seed from this stream, so any single case replays
   * deterministically from its logged seed via `{ seeds: [seed] }`.
   */
  readonly seed: number;
  /** Simulated seconds each case runs at `FIXED_DT` (fixed 120 Hz steps). */
  readonly durationSeconds: number;
  /**
   * Peak launch speed (m/s). Set PAST the ball's real max velocity (~6 m/s of
   * in-plane fall/bounce) — the sweep draws each case's speed in
   * [0.6, 1.0] × maxLaunchSpeed, so every launch exceeds real gameplay speed.
   */
  readonly maxLaunchSpeed: number;
  /** Number of sweep cases (angle × speed × flipper-phase). */
  readonly cases: number;
  /** CCD on/off. Default TRUE; FALSE only for the negative control. */
  readonly bullet?: boolean;
  /**
   * Adaptive angular sub-stepping on/off (D-01, plan 02-04). Default TRUE (the
   * PlanckWorld default). Set FALSE **only** for plan 02-05's FLIP-04 TEETH
   * negative control: at the feel-tuned peak ω the D-01 formula gives N ≥ 2, so
   * forcing N = 1 (sub-stepping OFF) lets one 120 Hz step rotate the bat past ~2×
   * the safe arc — the whipping bat then skips the ball and the swept check goes
   * RED, proving the ROTATIONAL guarantee is held by the sub-stepping MECHANISM,
   * not by luck or by the ball's translational CCD (which is left ON: `bullet`
   * is independent of this switch).
   */
  readonly subStepping?: boolean;
  /**
   * Replay hook: run EXACTLY these case seeds instead of deriving `cases` seeds
   * from `seed`. Feeding a logged failure seed here reproduces it identically.
   */
  readonly seeds?: readonly number[];
  /** Stop the whole run at the first failing case (fast negative control). */
  readonly stopOnFirstFailure?: boolean;
  /** Force every case's aim (negative control targets the thin wall). */
  readonly forceMode?: LaunchMode;
  /**
   * FLIPPER negative control ONLY. When set, every case ignores the launch
   * generator and instead drops the ball straight DOWN through the test bat's
   * horizontal reach at `maxLaunchSpeed`, sweeping the flipper phase per case so
   * some case coincides with a near-horizontal bat. It also SUPPRESSES the
   * boundary-escape check, isolating the flipper-swept invariant: with CCD off
   * the fast ball also tunnels the (thin) walls, and that boundary escape would
   * otherwise trip first and mask the flipper tunnel. This exists solely to prove
   * the enhanced flipper-swept check has TEETH (fires on a real bat pass-through);
   * it is never used by the CCD-on gate.
   */
  readonly flipperNegativeControl?: boolean;
  /**
   * Injectable world factory — defaults to the Planck adapter. Keeps the soak
   * engine-agnostic (D-05): swap in any `PhysicsWorld` and the proof is unchanged.
   */
  readonly makeWorld?: (options: { readonly bullet: boolean }) => PhysicsWorld;
}

/** A copied-out ball snapshot (safe to retain past the next step). */
export interface BallSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly radius: number;
  readonly angle: number;
}

/** A copied-out flipper snapshot. */
export interface FlipperSnapshot {
  readonly id: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly angle: number;
  readonly length: number;
  readonly halfWidth: number;
}

/** The seeded launch parameters of one sweep case (all replay-deterministic). */
export interface CaseParams {
  readonly seed: number;
  readonly originX: number;
  readonly originY: number;
  /** Raw sweep angle in [0, 2π): launch direction (free) or aim jitter (aimed). */
  readonly angle: number;
  readonly speed: number;
  readonly mode: LaunchMode;
  /** Initial flipper motor direction (+1 / −1). */
  readonly flipperDir: number;
  /** Fixed-step delay before the flipper starts sweeping (phase offset). */
  readonly flipperPhaseSteps: number;
}

/** Which barrier the ball tunnelled through. */
export type EscapeKind = "boundary" | "flipper";

/** A recorded escape: everything needed to replay and diagnose the failure. */
export interface SoakFailure {
  /** Case seed — replay with `runSoak({ ...sameConfig, seeds: [seed] })`. */
  readonly seed: number;
  /** Which barrier was breached (a boundary wall, or the moving flipper bat). */
  readonly kind: EscapeKind;
  /** Fixed-step index at which the swept invariant tripped. */
  readonly step: number;
  /** Simulated time of the escape (seconds). */
  readonly simTime: number;
  readonly params: CaseParams;
  readonly ballState: BallSnapshot;
  readonly flipperState: FlipperSnapshot | null;
}

/** The outcome of a soak run. */
export interface SoakResult {
  /** TRUE iff the ball never escaped in any case. */
  readonly passed: boolean;
  readonly failures: readonly SoakFailure[];
  readonly casesRun: number;
  /** Total SIMULATED fixed-step time actually run (seconds). */
  readonly simulatedSeconds: number;
  readonly bullet: boolean;
}

// --- Sweep tuning ---------------------------------------------------------- //

/**
 * Solver-slop tolerance (m) subtracted from the ball radius before the swept
 * check. Box2D/Planck keep contacting bodies separated only to within a small
 * "linear slop" (~5 mm) and can transiently penetrate a hair deeper right after
 * a hard impact before the position solver corrects — so a legitimately
 * resting/bouncing ball sits at a center-to-wall distance of `radius − (a few
 * mm)`. A STRICT `radius` check would mis-read that as an escape. Comparing
 * against `radius − CONTACT_SLOP` contains real solver slop while a genuine
 * tunnel (a full crossing → center-to-wall distance ≈ 0) still trips far clear
 * of the slop band. 0.05 m matches the resting-contact epsilon already used by
 * the smoke test and is a quarter of the 0.2 m radius — no false greens.
 */
const CONTACT_SLOP = 0.05;

/** Clearance (m) beyond the ball radius keeping a launch origin off every wall. */
const LAUNCH_MARGIN = 0.05;

/** Aim jitter half-range (rad) applied to aimed launches (±20°). */
const AIM_JITTER = (Math.PI / 180) * 20;

/** Angle band (rad) near a joint limit at which the flipper reverses its sweep. */
const FLIPPER_LIMIT_EPS = 0.02;

/** Max flipper phase-offset delay (fixed steps) before a case starts sweeping. */
const MAX_FLIPPER_PHASE_STEPS = 60;

// --- Geometry helpers (interface-only; no engine coupling) ----------------- //

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function boundsOf(walls: readonly Segment[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, maxX, minY, maxY };
}

function segLength(s: Segment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

/**
 * Midpoint of the thinnest interior wall, derived from the interface alone: the
 * outer perimeter edges span the full box, so the deliberately thin interior
 * wall (plan 01-02) is simply the SHORTEST boundary segment. A primary aim.
 */
function thinWallTarget(boundary: readonly Segment[]): Vec2 {
  let shortest: Segment | undefined;
  let best = Infinity;
  for (const s of boundary) {
    const len = segLength(s);
    if (len < best) {
      best = len;
      shortest = s;
    }
  }
  if (!shortest) return { x: 0, y: 0 };
  return {
    x: (shortest.a.x + shortest.b.x) / 2,
    y: (shortest.a.y + shortest.b.y) / 2,
  };
}

/**
 * Mid-reach of the max-speed test flipper's sweep zone, read straight off the
 * interface (`getFlippers`). The swinging bat crosses this point every sweep,
 * so aiming a launch here stresses the dynamic thin fast-mover — the textbook
 * "bullet-through-paper" tunneling case (PHYS-02).
 */
function flipperTarget(world: PhysicsWorld): Vec2 {
  const fl = world.getFlippers()[0];
  if (!fl) return { x: 1, y: 1.5 };
  return { x: fl.pivotX + fl.length * 0.6, y: fl.pivotY };
}

/**
 * FLIPPER negative-control launch: drop the ball straight DOWN through the bat's
 * horizontal reach at max speed. The x offset along the bat is derived from the
 * case's sweep angle (deterministic), so cases spread across the bat while the
 * per-case flipper phase spreads the bat angle at arrival — together guaranteeing
 * some case meets a near-horizontal bat and cleanly tunnels it (CCD off). Read
 * off the interface (`getFlippers`), never Planck.
 */
function flipperThroughLaunch(
  world: PhysicsWorld,
  params: CaseParams,
  maxLaunchSpeed: number,
): { originX: number; originY: number; vx: number; vy: number } {
  const fl = world.getFlippers()[0];
  if (!fl) {
    return { originX: 1, originY: 0.5, vx: 0, vy: maxLaunchSpeed };
  }
  // Aim at x in [pivot + 0.4·len, pivot + 1.0·len] — the bat's mid-to-tip span,
  // where a straight-down chord crosses the near-horizontal centerline with both
  // endpoints clear of the (corner-anchored) pivot.
  const frac = params.angle / (Math.PI * 2); // [0,1) — deterministic per case
  const originX = fl.pivotX + fl.length * (0.4 + 0.6 * frac);
  const originY = fl.pivotY - 1.2; // well above the bat so it arrives at full speed
  return { originX, originY, vx: 0, vy: maxLaunchSpeed };
}

// --- Seeded case generation ------------------------------------------------ //

/** Derive `count` independent 32-bit case seeds from a master seed. */
function deriveSeeds(masterSeed: number, count: number): number[] {
  const master = mulberry32(masterSeed);
  const seeds: number[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push(Math.floor(master() * 0x1_0000_0000) >>> 0);
  }
  return seeds;
}

/**
 * Build one case's launch parameters from its seed. Draw order is FIXED so the
 * same seed always yields the same case → deterministic replay (D-04).
 */
function makeCaseParams(
  caseSeed: number,
  config: SoakConfig,
  target: Vec2,
  bounds: Bounds,
): CaseParams {
  const rng = mulberry32(caseSeed);
  const margin = BALL_RADIUS_M + LAUNCH_MARGIN;

  // Origin: an interior point in the upper region (above the thin wall / flipper
  // targets) so aimed launches travel DOWN the field into the stress targets.
  const loX = bounds.minX + margin;
  const hiX = bounds.maxX - margin;
  const loY = bounds.minY + margin;
  const hiY = target.y - margin;
  const originX = loX + rng() * Math.max(0, hiX - loX);
  const originY = loY + rng() * Math.max(0, hiY - loY);

  const angle = rng() * Math.PI * 2;
  // Every case exceeds the ball's real max velocity (see maxLaunchSpeed docs).
  const speed = (0.6 + rng() * 0.4) * config.maxLaunchSpeed;

  const modePick = Math.floor(rng() * 3); // drawn always, to keep the stream stable
  const mode: LaunchMode =
    config.forceMode ??
    (modePick === 0 ? "thin-wall" : modePick === 1 ? "flipper" : "free");

  const flipperDir = rng() < 0.5 ? 1 : -1;
  const flipperPhaseSteps = Math.floor(rng() * MAX_FLIPPER_PHASE_STEPS);

  return {
    seed: caseSeed,
    originX,
    originY,
    angle,
    speed,
    mode,
    flipperDir,
    flipperPhaseSteps,
  };
}

/** Resolve a case's launch velocity: full-circle (free) or aimed-with-jitter. */
function launchVelocity(
  params: CaseParams,
  thin: Vec2,
  flipper: Vec2,
): { vx: number; vy: number } {
  if (params.mode === "free") {
    return {
      vx: Math.cos(params.angle) * params.speed,
      vy: Math.sin(params.angle) * params.speed,
    };
  }
  const aim = params.mode === "thin-wall" ? thin : flipper;
  const base = Math.atan2(aim.y - params.originY, aim.x - params.originX);
  // Map angle ∈ [0, 2π) → jitter ∈ [−AIM_JITTER, +AIM_JITTER).
  const jitter = (params.angle / Math.PI - 1) * AIM_JITTER;
  const dir = base + jitter;
  return { vx: Math.cos(dir) * params.speed, vy: Math.sin(dir) * params.speed };
}

// --- One case -------------------------------------------------------------- //

function runCase(
  caseSeed: number,
  config: SoakConfig,
  bullet: boolean,
  makeWorld: (options: { readonly bullet: boolean }) => PhysicsWorld,
): { failure: SoakFailure | null; steps: number } {
  const world = makeWorld({ bullet });
  const boundary = world.getBoundarySegments();
  const bounds = boundsOf(boundary);
  const thin = thinWallTarget(boundary);
  const flipper = flipperTarget(world);

  const params = makeCaseParams(caseSeed, config, thin, bounds);

  // The flipper negative control isolates the flipper-swept invariant: it drops
  // the ball straight through the bat and SUPPRESSES the boundary check (a CCD-off
  // ball also tunnels the walls, which would otherwise trip first and mask the
  // flipper tunnel). Otherwise, use the seeded sweep launch.
  const ignoreBoundary = config.flipperNegativeControl === true;
  const launch = ignoreBoundary
    ? flipperThroughLaunch(world, params, config.maxLaunchSpeed)
    : {
        originX: params.originX,
        originY: params.originY,
        ...launchVelocity(params, thin, flipper),
      };
  world.addBall({
    x: launch.originX,
    y: launch.originY,
    vx: launch.vx,
    vy: launch.vy,
    radius: BALL_RADIUS_M,
  });

  // Swept check uses a slop-aware effective radius (see CONTACT_SLOP).
  const effRadius = BALL_RADIUS_M - CONTACT_SLOP;
  const totalSteps = Math.max(1, Math.round(config.durationSeconds / FIXED_DT));

  let prevX = launch.originX;
  let prevY = launch.originY;
  let flipperDir = params.flipperDir;

  // Reusable per-flipper pre-step angle buffer (grow-only, index-aligned with
  // getFlippers()). Filled BEFORE each world.step() so the intra-step swept
  // sector of EVERY bat is bounded by its own start angle (see the copy-out note
  // below). Declared once here — no per-step allocation in the loop body.
  const preAngles: number[] = [];

  for (let step = 1; step <= totalSteps; step++) {
    // Drive the flipper phase on the AIMED flipper (index 0 — the bat the launch
    // targets): hold through the phase delay, then sweep back and forth by
    // reversing the motor at the joint limits (a continuous fast target at peak
    // ω on the up-leg). Its world angle equals the joint angle (referenceAngle 0),
    // so the reference-relative limit comparison is valid for it.
    const flippers = world.getFlippers();
    const flPre = flippers[0];
    if (flPre) {
      if (step < params.flipperPhaseSteps) {
        world.setFlipperMotor(flPre.id, 0);
      } else {
        if (flipperDir > 0 && flPre.angle >= FLIPPER_UPPER_ANGLE - FLIPPER_LIMIT_EPS) {
          flipperDir = -1;
        } else if (
          flipperDir < 0 &&
          flPre.angle <= FLIPPER_LOWER_ANGLE + FLIPPER_LIMIT_EPS
        ) {
          flipperDir = 1;
        }
        world.setFlipperMotor(flPre.id, flipperDir);
      }
    }

    // Capture EVERY flipper's angle BEFORE the step. `getFlippers()` returns live
    // pooled references (the same objects it returns post-step), so their `.angle`
    // would read the POST-step value after `world.step()` — copy each out now to
    // bound that bat's intra-step swept sector for the per-flipper tunnel check.
    preAngles.length = 0;
    for (let i = 0; i < flippers.length; i++) {
      const f = flippers[i];
      preAngles.push(f ? f.angle : NaN);
    }

    world.step(FIXED_DT);

    const ball = world.getBalls()[0];
    if (!ball) break;
    const nextX = ball.x;
    const nextY = ball.y;
    const prev: Vec2 = { x: prevX, y: prevY };
    const next: Vec2 = { x: nextX, y: nextY };

    // Two per-step swept checks against the ball/flipper INTERFACE (D-05):
    //   1. Static boundary (incl. the thin interior wall) via the slop-aware
    //      swept containment invariant — catches tunnel-through + poke-and-return.
    //   2. EVERY flipper: each bat is a MOVING thin wall that rotates up to
    //      ~19°/step, so testing only its POST-step centerline would MISS a ball
    //      that passes through where the bat WAS mid-sweep. `flipperSweptTunnel`
    //      sub-samples each bat's INTRA-STEP swept sector (its pre-angle ->
    //      post-angle, read off getFlippers) and trips iff the ball's chord
    //      crosses the bat while BOTH endpoints are clear of the (radius +
    //      tipRadius) capsule band — a genuine pass-through. Iterating ALL
    //      flippers (not just index 0) makes this the FLIP-04 two-flipper gate:
    //      the ball can never be swept through by EITHER bat. Proves the property
    //      independently of Planck's CCD (D-03), rather than leaning on the engine.
    const escapedBoundary = ignoreBoundary
      ? false
      : sweptEscaped(prev, next, effRadius, boundary);
    let escapedFlipper = false;
    let trippedFlipper: FlipperState | null = null;
    const flippersPost = world.getFlippers();
    for (let i = 0; i < flippersPost.length; i++) {
      const fl = flippersPost[i];
      const preAngle = preAngles[i];
      if (!fl || preAngle === undefined || Number.isNaN(preAngle)) continue;
      if (
        flipperSweptTunnel(
          prev,
          next,
          BALL_RADIUS_M,
          { x: fl.pivotX, y: fl.pivotY },
          fl.length,
          fl.tipRadius,
          preAngle,
          fl.angle,
        )
      ) {
        escapedFlipper = true;
        trippedFlipper = fl;
        break;
      }
    }

    if (escapedBoundary || escapedFlipper) {
      // Record the flipper that tripped (or, for a boundary escape, the aimed
      // flipper as context) so the failure replays with full state.
      const recordFl = trippedFlipper ?? flippersPost[0] ?? null;
      const failure: SoakFailure = {
        seed: caseSeed,
        kind: escapedBoundary ? "boundary" : "flipper",
        step,
        simTime: step * FIXED_DT,
        params,
        ballState: {
          id: ball.id,
          x: ball.x,
          y: ball.y,
          vx: ball.vx,
          vy: ball.vy,
          radius: ball.radius,
          angle: ball.angle,
        },
        flipperState: recordFl
          ? {
              id: recordFl.id,
              pivotX: recordFl.pivotX,
              pivotY: recordFl.pivotY,
              angle: recordFl.angle,
              length: recordFl.length,
              halfWidth: recordFl.halfWidth,
            }
          : null,
      };
      return { failure, steps: step };
    }

    prevX = nextX;
    prevY = nextY;
  }

  return { failure: null, steps: totalSteps };
}

// --- Public entry ---------------------------------------------------------- //

/**
 * Run the seeded sweep-matrix soak. Returns `{ passed, failures, ... }`; the
 * gate and negative control assert on `passed`. `passed === false` carries one
 * failure record per failing case, each with a replayable seed + full state.
 */
export function runSoak(config: SoakConfig): SoakResult {
  const bullet = config.bullet ?? true;
  // Thread the sub-stepping switch into the default Planck adapter (the FLIP-04
  // teeth control passes { subStepping: false }); when undefined the adapter's
  // default (true) applies. `bullet` is passed independently so the two switches
  // stay orthogonal (CCD vs the rotational sub-stepping guarantee).
  const makeWorld =
    config.makeWorld ??
    ((options) =>
      new PlanckWorld(
        // Omit `subStepping` entirely when unset so the adapter default (true)
        // applies (exactOptionalPropertyTypes forbids passing an explicit
        // `undefined`); pass the concrete boolean only for the teeth control.
        config.subStepping === undefined
          ? { bullet: options.bullet }
          : { bullet: options.bullet, subStepping: config.subStepping },
      ));
  const caseSeeds = config.seeds
    ? [...config.seeds]
    : deriveSeeds(config.seed, config.cases);

  const failures: SoakFailure[] = [];
  let casesRun = 0;
  let simulatedSteps = 0;

  for (const caseSeed of caseSeeds) {
    const { failure, steps } = runCase(caseSeed, config, bullet, makeWorld);
    casesRun++;
    simulatedSteps += steps;
    if (failure) {
      failures.push(failure);
      if (config.stopOnFirstFailure) break;
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    casesRun,
    simulatedSeconds: simulatedSteps * FIXED_DT,
    bullet,
  };
}

/** One-line, replay-ready description of a failure (for the gate's CI log). */
export function describeFailure(f: SoakFailure): string {
  const b = f.ballState;
  return (
    `ESCAPE[${f.kind}] seed=${f.seed} step=${f.step} t=${f.simTime.toFixed(3)}s ` +
    `mode=${f.params.mode} launchSpeed=${f.params.speed.toFixed(1)}m/s ` +
    `ball=(x:${b.x.toFixed(4)}, y:${b.y.toFixed(4)}, ` +
    `vx:${b.vx.toFixed(3)}, vy:${b.vy.toFixed(3)}) ` +
    `flipperAngle=${f.flipperState ? f.flipperState.angle.toFixed(4) : "n/a"} ` +
    `— replay: runSoak({ ...config, seeds: [${f.seed}] })`
  );
}
