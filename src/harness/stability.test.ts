import { describe, it, expect, vi } from "vitest";

import { BALL_RADIUS_M, FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import { PROOF_BOX_SPEC } from "../table/spec";
import type { BallState, PhysicsWorld } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * Resting-ball stillness + kinetic-energy-monotonic proof — the stability half of
 * PHYS-01 (criterion #3) and the regression-testable half of criterion #1 (D-09).
 *
 * These assertions are numeric/deterministic (node env, no DOM) and target the
 * engine-agnostic `PhysicsWorld` + the production fixed-step loop (`FixedStepLoop`)
 * — NOT Planck directly — so the identical proof survives any future engine swap
 * (D-05). Nothing here reaches for a Planck-specific `setAwake`/sleep hack; the
 * only "sleep" involved is Box2D's mature resting-contact + body-sleeping behavior
 * observed THROUGH the interface, which is exactly what CLAUDE.md says gives
 * "resting ball still, energy trending down" for free.
 *
 * Two properties are proven:
 *   1. A dropped ball settles to rest and then sits perfectly still (no jitter),
 *      and a ball seeded into a wall corner also settles (no corner-sticking).
 *   2. With no energy source, total kinetic energy is monotonically non-increasing
 *      — the ball never spontaneously gains speed. The monotonic detector is shown
 *      to have TEETH (it rejects a synthetic speed-up), so a green run means "no
 *      spontaneous energy gain", not "the check never fires".
 */

// --- Diagnostic mass model (mirrors the adapter + sandbox HUD) -------------- //

/**
 * Solver density (kg/m²) — mirrors the adapter's `BALL_DENSITY` (planck-world.ts)
 * and the sandbox HUD so this energy series matches the simulated ball. Mass is a
 * positive constant, so it scales the energy's units (J) only and changes NONE of
 * the monotonic/settle conclusions.
 */
const BALL_DENSITY = 1;

/** 2D disk mass = density · area (Box2D computes planar mass the same way). */
function ballMass(radius: number): number {
  return BALL_DENSITY * Math.PI * radius * radius;
}

/** Total kinetic energy across all balls: Σ 0.5·m·(vx² + vy²) (the plan's metric). */
function totalKineticEnergy(world: PhysicsWorld): number {
  let ke = 0;
  for (const b of world.getBalls()) {
    ke += 0.5 * ballMass(b.radius) * (b.vx * b.vx + b.vy * b.vy);
  }
  return ke;
}

function speedOf(b: BallState): number {
  return Math.hypot(b.vx, b.vy);
}

// --- Tolerances (documented; calibrated above real solver noise) ------------ //

/** "At rest" speed threshold (m/s). Box2D sleeps a quiet ball to exactly 0 m/s. */
const REST_SPEED_EPS = 0.02;

/** Continuous time (s) below `REST_SPEED_EPS` required to confirm true rest. */
const REST_CONFIRM_S = 0.5;

/** Bounded simulated time (s) a ball is allowed to take to settle. */
const SETTLE_BUDGET_S = 20;

/** Post-settle observation window (s) over which stillness is measured. */
const STILL_WINDOW_S = 3;

/** Max post-settle positional drift (m). A settled/asleep ball must not buzz. */
const JITTER_EPS = 1e-3;

/** Fixed steps discarded before sampling energy (resting-contact warm-start). */
const ENERGY_WARMUP_STEPS = 30;

/** Energy sampling window (s). */
const ENERGY_WINDOW_S = 2.5;

/**
 * Per-step kinetic-energy tolerance (J). A step may not RAISE kinetic energy by
 * more than this. It is machine-epsilon-scale relative to the ~0.1 J the run
 * carries and far below any real per-step decay, so it tolerates float/solver
 * noise while rejecting any genuine spontaneous gain.
 */
const ENERGY_NOISE_EPS = 1e-5;

// --- Interface-only helpers (no engine coupling) ---------------------------- //

/** Axis-aligned bounds of the world's static boundary (read via the interface). */
function bounds(world: PhysicsWorld): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const w of world.getBoundarySegments()) {
    for (const p of [w.a, w.b]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, maxX, minY, maxY };
}

/** The single ball under test (the harness only ever spawns one). */
function onlyBall(world: PhysicsWorld): BallState {
  const b = world.getBalls()[0];
  if (!b) throw new Error("expected exactly one ball");
  return b;
}

/**
 * Drive the world one fixed 120 Hz step through the REAL production loop (so the
 * proof exercises `FixedStepLoop`, not a private stepping shortcut). Passing
 * exactly `FIXED_DT` worth of real time drains to exactly one fixed step.
 */
function makeStepper(world: PhysicsWorld): () => void {
  const loop = new FixedStepLoop(world);
  return () => {
    const n = loop.advance(FIXED_DT * 1000);
    if (n !== 1) throw new Error(`expected exactly 1 fixed step, got ${n}`);
  };
}

/**
 * Pin EVERY flipper at a fixed motor command so these stability assertions isolate
 * the BALL. The two feel flippers now sit CENTRED and mirror-symmetric on the
 * throwaway rig (planck-world.ts, D-11) rather than as the Phase-1 single lower-left
 * bat, so BOTH must be pinned — and each scenario picks the pin that keeps its ball
 * clear of, or stably cradled by, the pair:
 *   `-1` → drive to the DROOP limit and hold: a deep, rigid V that catches and
 *          steadies a ball dropped into the centre (limit-pinned = rock steady).
 *   `+1` → hold RAISED (tips up, out of the floor zone): a floor / corner ball then
 *          has clear floor and never spawns inside a near-floor drooped bat.
 * The command persists on the joint motor, so one call holds for the whole run.
 */
function holdAllFlippers(world: PhysicsWorld, direction: number): void {
  for (const f of world.getFlippers()) world.setFlipperMotor(f.id, direction);
}

/**
 * Step until the ball holds below `REST_SPEED_EPS` continuously for
 * `REST_CONFIRM_S` (true rest, past any last micro-bounce and into sleep), within
 * `SETTLE_BUDGET_S`. Returns the fixed-step index at which rest was confirmed, or
 * -1 if it never settled.
 */
function stepUntilSettled(world: PhysicsWorld, step: () => void): number {
  const budget = Math.round(SETTLE_BUDGET_S / FIXED_DT);
  const confirm = Math.round(REST_CONFIRM_S / FIXED_DT);
  let restRun = 0;
  for (let s = 1; s <= budget; s++) {
    step();
    if (speedOf(onlyBall(world)) < REST_SPEED_EPS) {
      restRun++;
      if (restRun >= confirm) return s;
    } else {
      restRun = 0;
    }
  }
  return -1;
}

/**
 * Index of the first sample that RAISES the value over its predecessor by more
 * than `absEps`, or -1 if the series is monotonically non-increasing within that
 * tolerance. This is the energy-monotonic detector: it tolerates tiny numerical
 * noise but flags any real spontaneous gain (a ball speeding up on its own).
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

// --- The proof -------------------------------------------------------------- //

describe("resting-ball stillness + kinetic-energy-monotonic proof", () => {
  it("a dropped ball settles to rest and then sits perfectly still (no jitter)", () => {
    const world: PhysicsWorld = new PlanckWorld({ table: PROOF_BOX_SPEC });
    // Drop straight down onto the CENTRE of the mirrored pair; held at the droop
    // limit the two bats form a deep, rigid V that catches and steadies the ball.
    world.addBall({ x: 1.0, y: 0.4, vx: 0 });
    holdAllFlippers(world, -1);
    const step = makeStepper(world);

    // Phase A — settle: the ball must reach true rest within the time budget.
    const settleStep = stepUntilSettled(world, step);
    expect(settleStep).toBeGreaterThan(0);
    expect(settleStep * FIXED_DT).toBeLessThan(SETTLE_BUDGET_S);

    // Phase B — stillness: from the settled pose, over a long window the ball
    // neither buzzes (speed stays at rest) nor drifts (position epsilon).
    const rest = onlyBall(world);
    const restX = rest.x;
    const restY = rest.y;
    let maxSpeed = 0;
    let maxDrift = 0;
    const window = Math.round(STILL_WINDOW_S / FIXED_DT);
    for (let s = 0; s < window; s++) {
      step();
      const b = onlyBall(world);
      maxSpeed = Math.max(maxSpeed, speedOf(b));
      maxDrift = Math.max(maxDrift, Math.hypot(b.x - restX, b.y - restY));
    }
    expect(maxSpeed).toBeLessThan(REST_SPEED_EPS);
    expect(maxDrift).toBeLessThan(JITTER_EPS);
  });

  it("a ball seeded into a wall corner settles to rest (no corner-sticking)", () => {
    const world: PhysicsWorld = new PlanckWorld({ table: PROOF_BOX_SPEC });
    const b = bounds(world);
    const r = BALL_RADIUS_M;
    const step = makeStepper(world);

    // Hold both flippers RAISED first — lifting the right bat's near-corner base out
    // of the bottom-right corner — THEN seed the ball there (no spawn overlap). In-
    // plane gravity pulls it into the corner, where it must SETTLE — not creep or
    // vibrate against the two walls indefinitely.
    holdAllFlippers(world, 1);
    for (let s = 0; s < 30; s++) step();
    world.addBall({ x: b.maxX - r - 0.01, y: b.maxY - r - 0.01 });

    const settleStep = stepUntilSettled(world, step);
    expect(settleStep).toBeGreaterThan(0);

    // And it stays at rest (no re-awakening buzz) over a follow-on window.
    let maxSpeed = 0;
    const window = Math.round(STILL_WINDOW_S / FIXED_DT);
    for (let s = 0; s < window; s++) {
      step();
      maxSpeed = Math.max(maxSpeed, speedOf(onlyBall(world)));
    }
    expect(maxSpeed).toBeLessThan(REST_SPEED_EPS);
  });

  it("kinetic energy is monotonically non-increasing once undisturbed (never spontaneously gains speed)", () => {
    const world: PhysicsWorld = new PlanckWorld({ table: PROOF_BOX_SPEC });
    const b = bounds(world);
    const step = makeStepper(world);

    // Hold both flippers RAISED first (bats + pivot bases lifted well above the
    // floor), THEN roll a ball ALONG the floor. The centred rig fills the lower box,
    // so — unlike the Phase-1 single lower-left flipper — a full-radius ball can't
    // roll the floor without striking a raised pivot base and being lobbed upward
    // (which then legitimately GAINS KE from gravity on the way back down — a false
    // trip, not the defect under test). A SMALLER ball (radius 0.1) clears UNDER the
    // raised bats/bases to the bare floor, where it bounces only off the two VERTICAL
    // side walls — reversing it ALONG the floor, never lobbing it up. Ball size is
    // irrelevant to the property; it is shrunk only to reach clear floor under this
    // throwaway D-11 rig. On that horizontal floor in-plane gravity is fully carried
    // by the floor normal and cannot pump KE in (a free-FALLING ball would legitimately
    // gain KE — expected physics); with no energy source, damping + inelastic wall
    // bounces can only BLEED energy, so the KE series MUST be monotonically
    // non-increasing — any sustained rise is a solver/config defect (a ball speeding
    // up on its own).
    const smallR = 0.1;
    holdAllFlippers(world, 1);
    for (let s = 0; s < 30; s++) step();
    world.addBall({
      x: (b.minX + b.maxX) / 2,
      y: b.maxY - smallR,
      vx: 2.5,
      vy: 0,
      radius: smallR,
    });

    // Discard the one-off contact-resolution transient (the resting contact
    // warm-starts over a few steps), then sample kinetic energy every fixed step.
    for (let s = 0; s < ENERGY_WARMUP_STEPS; s++) step();

    const series: number[] = [];
    const samples = Math.round(ENERGY_WINDOW_S / FIXED_DT);
    for (let s = 0; s < samples; s++) {
      step();
      series.push(totalKineticEnergy(world));
    }

    // The series carried real energy and actually decayed (not a vacuous ~0 run).
    const first = series[0];
    const last = series[series.length - 1];
    if (first === undefined || last === undefined) {
      throw new Error("empty energy series");
    }
    expect(first).toBeGreaterThan(0.05);
    expect(last).toBeLessThan(first);

    // Monotonic non-increasing within the documented noise tolerance: no step
    // raises kinetic energy by more than ENERGY_NOISE_EPS.
    expect(firstMonotonicIncrease(series, ENERGY_NOISE_EPS)).toBe(-1);
  });

  it("the energy-monotonic detector rejects a synthetic speed-up (proof of teeth)", () => {
    // A genuinely non-increasing series passes...
    expect(
      firstMonotonicIncrease([0.5, 0.5, 0.4, 0.4, 0.1, 0.0], ENERGY_NOISE_EPS),
    ).toBe(-1);
    // ...but a fabricated spontaneous speed-up (rising energy) is CAUGHT. Without
    // this, the monotonic assertion above could rubber-stamp a solver energy leak.
    expect(
      firstMonotonicIncrease([0.1, 0.2, 0.3], ENERGY_NOISE_EPS),
    ).toBeGreaterThan(0);
    // Tiny machine-epsilon noise is tolerated (not mistaken for a real gain).
    expect(
      firstMonotonicIncrease([0.2, 0.2 + ENERGY_NOISE_EPS / 2, 0.19], ENERGY_NOISE_EPS),
    ).toBe(-1);
  });
});
