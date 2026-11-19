import { describe, it, expect } from "vitest";

import {
  BALL_RADIUS_M,
  FIXED_DT,
  FLIPPER_HALF_WIDTH_M,
  FLIPPER_LENGTH_M,
  FLIPPER_UP_SPEED,
} from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import { PROOF_BOX_SPEC } from "../table/spec";
import type { PhysicsWorld } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";

/**
 * FLIPPER FEEL proofs — the Core-Value "fling realistically" (FLIP-02) and "heavy,
 * not floaty cradle" (FLIP-03 / D-09) properties, settled as DETERMINISTIC NUMBERS
 * rather than a vibe. Phase 1 explicitly deferred the final "heavy" verdict to
 * this phase, judged through flipper catch/cradle/return (01-CONTEXT D-08/D-09);
 * this file regression-guards it.
 *
 * Everything drives the REAL `PlanckWorld` through the engine-agnostic interface
 * and the production `FixedStepLoop` (motor commands latched at the top of each
 * fixed step via the loop's pre-step hook, exactly like `main.ts`) — NOT Planck
 * directly (D-05), so the identical proof survives an engine swap. No `Math.random`
 * anywhere: the scenarios are fixed and reproducible.
 *
 * ── Flick direction (gap 01) ──
 * The v = ω·r launch proof raises the bat with the `+1` motor sign — the SAME sign
 * the FSM issues on a real key press (`onPressEdge`), now that the adapter applies
 * each mirrored bat's physical raise sign (02 gap 01). `+1` sweeps the resting
 * ball's side UP (tip toward −y) and gives the clean, correct v = ω·r momentum
 * transfer; `-1` returns the bat down to its rest/droop limit. Before the fix the
 * left bat's `+1` DROOPED it (tip toward +y) and this proof had to work around it
 * with `-1`; that inversion is now fixed in `PlanckWorld.setFlipperMotor`. Because
 * the tip/base RATIO is independent of the absolute ω, the FLIP-02 geometry claim
 * holds regardless of the raise speed; we use the measured raise speed (the snappy
 * FLIPPER_UP_SPEED) for the per-hit ω·r fraction. (Choosing the strike geometry is
 * Claude's discretion, 02-CONTEXT § "Claude's Discretion".)
 */

// --- Mass / energy model (mirrors the adapter + stability.test.ts) ---------- //

const BALL_DENSITY = 1;

/** 2D disk mass = density · area (Box2D computes planar mass the same way). */
function ballMass(radius: number): number {
  return BALL_DENSITY * Math.PI * radius * radius;
}

/** Total kinetic energy across all balls: Σ 0.5·m·(vx² + vy²). */
function totalKineticEnergy(world: PhysicsWorld): number {
  let ke = 0;
  for (const b of world.getBalls()) {
    ke += 0.5 * ballMass(b.radius) * (b.vx * b.vx + b.vy * b.vy);
  }
  return ke;
}

function ballSpeed(world: PhysicsWorld): number {
  const b = world.getBalls()[0];
  return b ? Math.hypot(b.vx, b.vy) : 0;
}

// --- Tolerances (documented) ------------------------------------------------ //

/** "At rest" speed threshold (m/s) — matches stability.test.ts. */
const REST_SPEED_EPS = 0.02;
/** Max post-settle positional drift (m) — a cradled ball must not buzz. */
const JITTER_EPS = 1e-3;
/** Per-step kinetic-energy noise tolerance (J) — matches stability.test.ts. */
const ENERGY_NOISE_EPS = 1e-5;
/**
 * v = ω·r ratio tolerance: the tip/base launch ratio must match the tip/base
 * contact-radius ratio to within this fraction. A physical scoop transfers a
 * hair less than the ideal at the tip (contact slip + gravity), so a generous but
 * meaningful 35% band is used; the measured mismatch is ~13%.
 */
const VR_RATIO_TOL = 0.35;

// --- Shared step driver (production FixedStepLoop, pre-step motor latch) ----- //

/**
 * One fixed 120 Hz step through the REAL loop. `drive` runs at the TOP of the step
 * (before `world.step()`), exactly where `main.ts` drains input and ticks the FSM.
 */
function makeStepper(world: PhysicsWorld): (drive: () => void) => void {
  const loop = new FixedStepLoop(world);
  return (drive: () => void) => {
    const n = loop.advance(FIXED_DT * 1000, drive);
    if (n !== 1) throw new Error(`expected exactly 1 fixed step, got ${n}`);
  };
}

/**
 * Index of the first sample that RAISES the value over its predecessor by more
 * than `absEps`, or -1 if the series is monotonically non-increasing within that
 * tolerance (the energy-monotonic detector; mirrors stability.test.ts).
 */
function firstMonotonicIncrease(
  series: readonly number[],
  absEps: number,
): number {
  for (let i = 1; i < series.length; i++) {
    const cur = series[i];
    const prev = series[i - 1];
    if (cur === undefined || prev === undefined) continue;
    if (cur > prev + absEps) return i;
  }
  return -1;
}

// --- FLIP-02: tip-vs-base launch (v = ω·r) ---------------------------------- //

interface LaunchResult {
  readonly launch: number;
  readonly peakOmega: number;
  /** TRUE contact radius: |ball − pivot| at placement (includes the face gap). */
  readonly radius: number;
}

/**
 * Number of consecutive fixed steps a launch speed must PERSIST to count. At the
 * feel raise speed (FLIPPER_UP_SPEED = 30) a bat lifting off its droop limit gives
 * a brief 1–2 step Box2D motor+limit "release" burst (the same jam-lag flagged for
 * the 02-06 checkpoint) that momentarily over-speeds the ball before it settles to
 * its true v = ω·r launch. Requiring the speed to hold for a short window rejects
 * that transient so the tip/base ratio reflects real momentum transfer, not the
 * burst.
 */
const SUSTAIN_STEPS = 3;

/**
 * Rest the bat at its droop limit (motor `-1` = return/down), place a ball just
 * above the bat face at fractional reach `rFrac`, then RAISE the bat (motor `+1` =
 * raise, the real press command): the bat sweeps the ball's side up and flings it.
 * Returns the SUSTAINED launch speed (max speed held for `SUSTAIN_STEPS` steps, so
 * the jam-release transient is filtered), the peak bat |ω| during the raise, and
 * the TRUE contact radius (|ball − pivot|, which includes the unavoidable face gap
 * — so the honest v = ω·r comparison uses it, not the nominal horizontal reach).
 */
function launchAtRadius(rFrac: number): LaunchResult {
  const world: PhysicsWorld = new PlanckWorld({ table: PROOF_BOX_SPEC });
  const step = makeStepper(world);
  const fl = world.getFlippers()[0];
  if (!fl) throw new Error("expected the left flipper");
  const px = fl.pivotX;
  const py = fl.pivotY;
  const r = FLIPPER_LENGTH_M * rFrac;

  // Settle the bat at its rest/droop limit (return, hold −1). Hold the OTHER
  // flipper DROOPED (−1), down and out of the way, so the flung ball can never
  // strike it — the measurement is then independent of the mirrored flipper's
  // pivot (rig geometry, D-11). The pre-symmetric rig placed the right bat where
  // a tip fling clipped it, silently damping the measured tip launch; drooping it
  // makes this a clean, rig-independent v = ω·r read.
  const holdDroop = (): void => {
    world.setFlipperMotor(0, -1);
    world.setFlipperMotor(1, -1);
  };
  for (let i = 0; i < 30; i++) step(holdDroop);

  // Place the ball just above the bat face at horizontal reach r. The TRUE contact
  // radius is the pivot→ball distance (the face gap makes it > r, and dominates for
  // a base hit) — this is the radius the v = ω·r launch actually scales with.
  const gap = BALL_RADIUS_M + FLIPPER_HALF_WIDTH_M + 0.01;
  const contactRadius = Math.hypot(r, gap);
  world.addBall({ x: px + r, y: py - gap, vx: 0, vy: 0, radius: BALL_RADIUS_M });

  // Raise (flick, motor +1 = the FSM's press command) and record the ball speed
  // each step; keep the far flipper DROOPED and out of the flung ball's path.
  const raise = (): void => {
    world.setFlipperMotor(0, 1);
    world.setFlipperMotor(1, -1);
  };
  const speeds: number[] = [];
  let peakOmega = 0;
  let prevAngle = world.getFlippers()[0]?.angle ?? 0;
  // 25 steps: enough for the raise + launch, short enough that the flung ball has
  // not yet reached a wall to bounce back (which would pollute the launch read).
  for (let i = 0; i < 25; i++) {
    step(raise);
    const angle = world.getFlippers()[0]?.angle ?? 0;
    peakOmega = Math.max(peakOmega, Math.abs(angle - prevAngle) / FIXED_DT);
    prevAngle = angle;
    const ball = world.getBalls()[0];
    speeds.push(ball ? Math.hypot(ball.vx, ball.vy) : 0);
  }

  // SUSTAINED launch: the fastest speed the ball HOLDS for SUSTAIN_STEPS steps — a
  // 1–2 step jam-release spike (which the raw max would capture equally for base
  // and tip, collapsing the ratio) cannot satisfy it.
  let launch = 0;
  for (let i = 0; i + SUSTAIN_STEPS <= speeds.length; i++) {
    let windowMin = Infinity;
    for (let k = 0; k < SUSTAIN_STEPS; k++) {
      const s = speeds[i + k];
      if (s !== undefined && s < windowMin) windowMin = s;
    }
    launch = Math.max(launch, windowMin);
  }
  return { launch, peakOmega, radius: contactRadius };
}

describe("FLIP-02 tip-vs-base — a tip hit out-launches a base hit per v = ω·r", () => {
  it("tip launch exceeds base launch, and their ratio matches the contact-radius ratio", () => {
    // Strike the flat capsule CORE, not the very tip: rFrac 0.8 rides the box core
    // (contact radius ≈ 0.49 m), a true v = ω·r point. rFrac 0.9+ sits on the fat
    // ROUNDED TIP CIRCLE, whose fast convex surface "whips" the ball ~30% above the
    // rigid-bar ω·r (measured cleanly: 7.35 vs the core's 5.48) — a real effect that
    // inflates the tip/base ratio past the v = ω·r band. Striking the core keeps the
    // ratio an honest, rig-independent match. (The rounded tip's extra punch is a
    // FEATURE for real play — it just is not the clean bar we compare here.)
    const tip = launchAtRadius(0.8); // near the tip, on the flat core (radius ≈ 0.49 m)
    const base = launchAtRadius(0.3); // near the base (contact radius ≈ 0.32 m)

    // Both hits actually struck and launched the ball (past rest noise).
    expect(tip.launch).toBeGreaterThan(1.0);
    expect(base.launch).toBeGreaterThan(1.0);

    // Core FLIP-02 claim: the tip hit is measurably faster than the base hit.
    expect(tip.launch).toBeGreaterThan(base.launch * 1.5);

    // v = ω·r geometry: the launch ratio matches the TRUE contact-radius ratio
    // (which the face gap compresses toward ~1.7, not the nominal 3 — the honest
    // number is the pivot→ball distance the launch actually scales with).
    const launchRatio = tip.launch / base.launch;
    const radiusRatio = tip.radius / base.radius;
    expect(Math.abs(launchRatio - radiusRatio) / radiusRatio).toBeLessThan(
      VR_RATIO_TOL,
    );

    // Each launch is a substantial fraction of the ideal contact-point speed ω·r
    // (real momentum transfer, not incidental motion). The raise runs at the up
    // (raise) motor speed (see the header note on flick direction).
    const omega = FLIPPER_UP_SPEED;
    expect(tip.launch).toBeGreaterThan(0.25 * omega * tip.radius);
    expect(base.launch).toBeGreaterThan(0.25 * omega * base.radius);
    // And the bat really was sweeping at ~the raise speed (a sane, un-jammed ω).
    expect(tip.peakOmega).toBeGreaterThan(0.5 * omega);
    expect(tip.peakOmega).toBeLessThan(2.0 * omega);
  });
});

// --- FLIP-03 / D-09: jitter-free, heavy cradle ------------------------------ //

interface CradleTrace {
  readonly settleStep: number;
  readonly maxSpeed: number;
  readonly maxDrift: number;
  readonly energySeries: readonly number[];
  readonly dropEnergy: number;
}

/**
 * Hold flipper 0 UP (motor `+1` re-asserted EVERY step, D-06(1)), drop a ball onto
 * it (below the thin interior wall so it lands on the bat), step until the ball
 * holds below `REST_SPEED_EPS` for 0.5 s, then observe a 3 s window: peak speed,
 * positional drift, and the kinetic-energy series. `hold` lets the teeth test
 * release the hold to show the ball then does NOT stay put.
 */
function cradleTrace(hold: boolean): CradleTrace {
  const world: PhysicsWorld = new PlanckWorld({ table: PROOF_BOX_SPEC });
  const step = makeStepper(world);
  const fl = world.getFlippers()[0];
  if (!fl) throw new Error("expected the left flipper");
  const px = fl.pivotX;
  const py = fl.pivotY;

  const holdUp = (): void => {
    world.setFlipperMotor(0, 1); // D-06(1): drive continuously into the limit
    world.setFlipperMotor(1, 0);
  };
  for (let i = 0; i < 40; i++) step(holdUp);

  // Drop the ball onto the bat's base reach, BELOW the thin wall (y=2.0).
  const dropEnergyBefore = 0;
  world.addBall({ x: px + 0.1, y: py - 0.3, vx: 0, vy: 0, radius: BALL_RADIUS_M });

  // Settle.
  const confirm = Math.round(0.5 / FIXED_DT);
  const budget = Math.round(15 / FIXED_DT);
  let settleStep = -1;
  let restRun = 0;
  let dropEnergy = dropEnergyBefore;
  for (let s = 1; s <= budget; s++) {
    step(holdUp);
    dropEnergy = Math.max(dropEnergy, totalKineticEnergy(world));
    if (ballSpeed(world) < REST_SPEED_EPS) {
      restRun++;
      if (restRun >= confirm && settleStep < 0) settleStep = s;
    } else {
      restRun = 0;
    }
    if (settleStep > 0 && s > settleStep + 5) break;
  }

  // Post-settle observation window: either keep holding, or (teeth) release.
  const drive = hold
    ? holdUp
    : (): void => {
        world.setFlipperMotor(0, -1); // release the hold — the cradle should fail
        world.setFlipperMotor(1, 0);
      };
  const b0 = world.getBalls()[0];
  const restX = b0?.x ?? 0;
  const restY = b0?.y ?? 0;
  let maxSpeed = 0;
  let maxDrift = 0;
  const energySeries: number[] = [];
  const window = Math.round(3 / FIXED_DT);
  for (let s = 0; s < window; s++) {
    step(drive);
    maxSpeed = Math.max(maxSpeed, ballSpeed(world));
    const b = world.getBalls()[0];
    if (b) maxDrift = Math.max(maxDrift, Math.hypot(b.x - restX, b.y - restY));
    energySeries.push(totalKineticEnergy(world));
  }
  return { settleStep, maxSpeed, maxDrift, energySeries, dropEnergy };
}

describe("FLIP-03 / D-09 cradle — a caught ball settles jitter-free, energy trending down", () => {
  it("a ball dropped onto a held-up flipper settles to a steady, non-increasing-energy cradle", () => {
    const trace = cradleTrace(true);

    // It settled from a REAL drop (carried real energy, reached rest in budget).
    expect(trace.dropEnergy).toBeGreaterThan(0.01);
    expect(trace.settleStep).toBeGreaterThan(0);
    expect(trace.settleStep * FIXED_DT).toBeLessThan(15);

    // Jitter-free: over the post-settle window the ball neither buzzes nor drifts.
    expect(trace.maxSpeed).toBeLessThan(REST_SPEED_EPS);
    expect(trace.maxDrift).toBeLessThan(JITTER_EPS);

    // Heavy, not floaty: kinetic energy is monotonically non-increasing once
    // settled — the cradle never spontaneously pumps the ball back up.
    expect(firstMonotonicIncrease(trace.energySeries, ENERGY_NOISE_EPS)).toBe(-1);
  });

  it("the detectors have TEETH — a synthetic speed-up and an un-held flipper both trip them", () => {
    // Energy-monotonic detector: rejects a fabricated spontaneous speed-up...
    expect(firstMonotonicIncrease([0.1, 0.2, 0.3], ENERGY_NOISE_EPS)).toBeGreaterThan(0);
    // ...while tolerating a genuinely non-increasing series (with tiny noise).
    expect(firstMonotonicIncrease([0.5, 0.5, 0.4, 0.1, 0.0], ENERGY_NOISE_EPS)).toBe(-1);
    expect(
      firstMonotonicIncrease([0.2, 0.2 + ENERGY_NOISE_EPS / 2, 0.19], ENERGY_NOISE_EPS),
    ).toBe(-1);

    // Rest/jitter detector: if the flipper does NOT hold (released), the settled
    // ball does NOT stay put — it moves well past the rest threshold. So the green
    // cradle above means "the hold keeps it steady", not "the check never fires".
    const released = cradleTrace(false);
    expect(released.maxSpeed).toBeGreaterThan(REST_SPEED_EPS);
  });
});
