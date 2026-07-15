import { describe, it, expect } from "vitest";

import {
  BALL_RADIUS_M,
  FIXED_DT,
  FLIPPER_LENGTH_M,
  FLIPPER_MAX_ANGULAR_SPEED,
  FLIPPER_UP_SPEED,
} from "./constants";
import { PlanckWorld } from "./planck-world";

/**
 * Unit proof of the D-01 adaptive angular sub-stepping law in `PlanckWorld.step()`
 * — the FLIP-04 rotational anti-tunnel MECHANISM (plan 02-04). This is the
 * unit-level guard; the full seeded non-penetration PROOF (green with sub-stepping
 * ON, RED at peak ω with it OFF) is plan 02-05's gate.
 *
 * Four properties are pinned:
 *   1. The sub-step count follows N = ceil(ω · L · dt / (0.5 · r)): N = 1 at rest,
 *      N = 2 at the feel-tuned FLIPPER_UP_SPEED (30 rad/s).
 *   2. N is bounded by the secondary cap (D-02): it never exceeds N_MAX (≈ 4)
 *      even under a hard motor drive (threat T-02-07 — frame-budget DoS).
 *   3. `{ subStepping: false }` forces N = 1 even at full flipper speed — the
 *      02-05 negative-control hook.
 *   4. Collision events ACCUMULATE across sub-steps: a ball in contact during a
 *      sub-stepped (N ≥ 2) step still drains ≥ 1 event — the sub-step loop does
 *      not swallow post-solve events (threat T-02-08).
 *
 * `PlanckWorld` is only CONSTRUCTED here (no `planck` symbol is imported — the
 * single-import invariant, D-05). `lastSubStepCount` is a concrete-class diagnostic
 * (deliberately NOT on the `PhysicsWorld` interface), so the variable is typed as
 * the concrete adapter, not the interface.
 */

// The D-01/D-02 law recomputed independently in the test so a regression in EITHER
// the FLIPPER_MAX_ANGULAR_SPEED constant or the adapter's formula is caught here.
function subStepsFor(omega: number): number {
  return Math.max(
    1,
    Math.ceil((omega * FLIPPER_LENGTH_M * FIXED_DT) / (0.5 * BALL_RADIUS_M)),
  );
}

/** Cap-derived bound on N (D-02). With the tuned constants this is 4. */
const N_MAX = subStepsFor(FLIPPER_MAX_ANGULAR_SPEED);

/** Expected N at the feel-tuned raise speed (the D-01 formula → 2). */
const N_AT_UP_SPEED = subStepsFor(FLIPPER_UP_SPEED);

const LEFT_ID = 0;

/** Settle both flippers to a motor-0 rest so the pre-drive state is quiescent. */
function settleAtRest(world: PlanckWorld): void {
  world.setFlipperMotor(0, 0);
  world.setFlipperMotor(1, 0);
  for (let i = 0; i < 40; i++) world.step(FIXED_DT);
}

describe("adaptive angular sub-stepping law (D-01) + cap (D-02) + off-switch", () => {
  it("the D-01/D-02 formula gives N=2 at up-speed and N_MAX=4 (numeric sanity)", () => {
    // Pin the numbers the phase reasons about, independent of the running engine:
    // ceil(30 · 0.5 · (1/120) / (0.5 · 0.2)) = 2; the cap (96 rad/s) bounds N ≤ 4.
    expect(N_AT_UP_SPEED).toBe(2);
    expect(N_MAX).toBe(4);
  });

  it("runs N = 1 sub-step when every flipper is at rest", () => {
    const world = new PlanckWorld();
    settleAtRest(world);
    // One more step from the quiescent state: ω ≈ 0 → N = 1.
    world.step(FIXED_DT);
    expect(world.lastSubStepCount).toBe(1);
  });

  it("runs N = 2 sub-steps when a flipper is driven to FLIPPER_UP_SPEED", () => {
    const world = new PlanckWorld();
    settleAtRest(world);

    // Nudge off the rest limit into mid-arc (a bat jammed on a joint limit reads
    // ω ≈ 0), then raise at FLIPPER_UP_SPEED and capture the PEAK sub-step count.
    world.setFlipperMotor(LEFT_ID, -1);
    world.step(FIXED_DT);
    world.step(FIXED_DT);

    world.setFlipperMotor(LEFT_ID, +1);
    let peak = 0;
    for (let i = 0; i < 5; i++) {
      world.step(FIXED_DT);
      peak = Math.max(peak, world.lastSubStepCount);
    }

    // At the feel-tuned raise speed the live joint speed drives N to exactly 2 —
    // the D-01 count that keeps the fast bat's per-sub-step tip arc < half a ball
    // radius (matches the recomputed formula above).
    expect(peak).toBe(2);
    expect(peak).toBe(N_AT_UP_SPEED);
  });

  it("bounds N to the D-02 cap (≤ N_MAX) under a hard, sustained motor drive", () => {
    const world = new PlanckWorld();

    // Drive BOTH flippers hard, alternating so they never jam on a limit (a bat
    // pinned against a limit reads ω ≈ 0 and would understate N). Assert the
    // secondary cap holds on EVERY step.
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      const dir = i % 4 < 2 ? +1 : -1;
      world.setFlipperMotor(0, dir);
      world.setFlipperMotor(1, dir);
      world.step(FIXED_DT);
      peak = Math.max(peak, world.lastSubStepCount);
      expect(world.lastSubStepCount).toBeLessThanOrEqual(N_MAX);
    }
    // The mechanism actually engaged (sub-stepped at least once) — not a vacuous
    // "always 1" pass — while staying bounded.
    expect(peak).toBeGreaterThanOrEqual(2);
    expect(peak).toBeLessThanOrEqual(N_MAX);
  });

  it("forces N = 1 with { subStepping: false } even at full flipper speed", () => {
    const world = new PlanckWorld({ subStepping: false });

    let peak = 0;
    for (let i = 0; i < 30; i++) {
      const dir = i % 4 < 2 ? +1 : -1;
      world.setFlipperMotor(0, dir);
      world.setFlipperMotor(1, dir);
      world.step(FIXED_DT);
      peak = Math.max(peak, world.lastSubStepCount);
    }
    // Sub-stepping disabled: N is pinned to 1 regardless of ω — the 02-05 teeth
    // control that must make the seeded gate go RED at peak ω.
    expect(peak).toBe(1);
  });

  it("accumulates collision events across a sub-stepped (N ≥ 2) contacting step", () => {
    const world = new PlanckWorld();
    world.setFlipperMotor(0, 0);
    world.setFlipperMotor(1, 0);

    // Ball resting on the floor (bottom at y = HEIGHT_M = 3) → a ball-wall contact
    // that fires a post-solve event every step while the ball is awake. It sits at
    // x = 1.5, clear of both flippers, so the ONLY contact is ball↔floor.
    world.addBall({ x: 1.5, y: 3 - BALL_RADIUS_M });

    let totalEvents = 0;
    let contactingSubSteppedSteps = 0;
    for (let i = 0; i < 40; i++) {
      // Keep the LEFT bat sweeping (N = 2 on moving steps) while the ball contacts
      // the floor, so a contact and a sub-stepped step genuinely coincide.
      world.setFlipperMotor(LEFT_ID, i % 6 < 3 ? +1 : -1);
      world.step(FIXED_DT);
      const events = world.drainEvents();
      totalEvents += events.length;
      if (events.length > 0 && world.lastSubStepCount >= 2) {
        contactingSubSteppedSteps++;
      }
    }

    // Events survived the sub-step loop (not swallowed between sub-steps)...
    expect(totalEvents).toBeGreaterThanOrEqual(1);
    // ...and at least one of those events was drained on a genuinely sub-stepped
    // (N ≥ 2) step — proving cross-sub-step accumulation, not a lucky single-step.
    expect(contactingSubSteppedSteps).toBeGreaterThanOrEqual(1);
  });
});
