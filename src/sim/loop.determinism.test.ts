import { describe, it, expect } from "vitest";

import { FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import { PROOF_BOX_SPEC } from "../table/spec";
import type { BallState, PhysicsWorld } from "../physics/types";
import { FixedStepLoop } from "./loop";

/**
 * PHYS-03 proof #1: the simulation is a pure function of accumulated real time
 * and `FIXED_DT` — the RENDER cadence changes nothing about the physics.
 *
 * Three fresh, identical worlds are driven for the SAME total wall-clock
 * duration, but the real-frame deltas fed to `advance()` emulate three render
 * rates: 60 Hz (16.67 ms/frame), 120 Hz (8.33 ms/frame) and 144 Hz
 * (6.94 ms/frame). The proof asserts:
 *   (a) all three execute the IDENTICAL number of fixed 120 Hz steps, and
 *   (b) the final ball state (x, y, vx, vy, angle) is bit-identical across them.
 *
 * The assertions target the engine-agnostic `PhysicsWorld` + `FixedStepLoop`
 * (never Planck directly), so the identical proof survives any future engine
 * swap (D-05). `PlanckWorld` is only CONSTRUCTED here; no `planck` symbol is
 * imported into the test (the single-import invariant holds).
 */

// One fixed physics step, in ms (the accumulator's unit).
const STEP_MS = FIXED_DT * 1000;

// Emulated render-frame sizes (ms). 60 Hz ≈ 2 fixed steps/frame, 120 Hz ≈ 1,
// 144 Hz < 1 — three genuinely different chunkings of the same real time.
const FRAME_60_HZ = 1000 / 60;
const FRAME_120_HZ = 1000 / 120;
const FRAME_144_HZ = 1000 / 144;

// Target ~10 s of simulated time. The total is deliberately parked at the
// MIDDLE of a fixed step ((K + 0.5)·STEP): floor(total/step) is then robustly
// unambiguous, so the tiny (< 1e-9 ms) float-summation differences between the
// three cadences cannot flip the executed step count across a boundary. The
// margin to the nearest boundary (~4.17 ms) dwarfs the accumulated float error
// (a few ULP, ~1e-12 ms), so step counts are EQUAL by construction, not luck.
const EXPECTED_STEPS = 1200;
const TOTAL_MS = (EXPECTED_STEPS + 0.5) * STEP_MS;

// A moving, wall-bouncing start so the proof exercises collision determinism,
// not just a trivial free-fall. Kept comfortably inside the 2 m × 3 m box.
const START = { x: 1.0, y: 0.4, vx: 1.6, vy: 0.5 } as const;

interface Rig {
  loop: FixedStepLoop;
  world: PhysicsWorld;
}

function makeRig(): Rig {
  const world: PhysicsWorld = new PlanckWorld({ table: PROOF_BOX_SPEC });
  world.addBall(START);
  return { loop: new FixedStepLoop(world), world };
}

/**
 * Deliver exactly `totalMs` of real time to `loop`, chunked into whole frames
 * of `frameMs` plus a final partial frame so the delivered sum is `totalMs`
 * regardless of cadence. Returns the total fixed steps executed.
 */
function driveFor(loop: FixedStepLoop, frameMs: number, totalMs: number): number {
  const fullFrames = Math.floor(totalMs / frameMs);
  let steps = 0;
  for (let i = 0; i < fullFrames; i++) {
    steps += loop.advance(frameMs);
  }
  const remainder = totalMs - fullFrames * frameMs;
  if (remainder > 0) {
    steps += loop.advance(remainder);
  }
  return steps;
}

/** Copy out the single ball's state (defensive against pooled-array reuse). */
function sampleBall(world: PhysicsWorld): BallState {
  const ball = world.getBalls()[0];
  if (!ball) throw new Error("ball vanished");
  return { ...ball };
}

describe("FixedStepLoop determinism across render cadences (PHYS-03)", () => {
  it("runs an identical fixed-step count at 60 / 120 / 144 Hz render rates", () => {
    const { loop: loop60 } = makeRig();
    const { loop: loop120 } = makeRig();
    const { loop: loop144 } = makeRig();

    const steps60 = driveFor(loop60, FRAME_60_HZ, TOTAL_MS);
    const steps120 = driveFor(loop120, FRAME_120_HZ, TOTAL_MS);
    const steps144 = driveFor(loop144, FRAME_144_HZ, TOTAL_MS);

    // Identical executed step count regardless of how the real time was chunked.
    expect(steps60).toBe(EXPECTED_STEPS);
    expect(steps120).toBe(EXPECTED_STEPS);
    expect(steps144).toBe(EXPECTED_STEPS);

    // Same figure via the loop's own lifetime counter.
    expect(loop60.totalSteps).toBe(EXPECTED_STEPS);
    expect(loop120.totalSteps).toBe(EXPECTED_STEPS);
    expect(loop144.totalSteps).toBe(EXPECTED_STEPS);

    // Leftover accumulator is always < one fixed step (parked mid-step here).
    expect(loop60.accumulatorMs).toBeLessThan(STEP_MS);
    expect(loop120.accumulatorMs).toBeLessThan(STEP_MS);
    expect(loop144.accumulatorMs).toBeLessThan(STEP_MS);
  });

  it("reaches a bit-identical final ball state at 60 / 120 / 144 Hz", () => {
    const rig60 = makeRig();
    const rig120 = makeRig();
    const rig144 = makeRig();

    driveFor(rig60.loop, FRAME_60_HZ, TOTAL_MS);
    driveFor(rig120.loop, FRAME_120_HZ, TOTAL_MS);
    driveFor(rig144.loop, FRAME_144_HZ, TOTAL_MS);

    const a = sampleBall(rig60.world);
    const b = sampleBall(rig120.world);
    const c = sampleBall(rig144.world);

    // EPSILON 0: with identical fixed-step counts, each world called
    // world.step(FIXED_DT) the same number of times with the identical constant
    // dt, and Planck uses no RNG — so the states are bit-for-bit equal, not
    // merely "close". `toEqual` (exact) is therefore the honest assertion; any
    // drift would signal real nondeterminism, not float slop.
    expect(a).toEqual(b);
    expect(b).toEqual(c);

    // Sanity: the ball actually moved (this is a real trajectory, not a no-op).
    expect(a.y).toBeGreaterThan(START.y);
  });
});
