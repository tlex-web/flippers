import { describe, it, expect } from "vitest";

import { FIXED_DT, MAX_FRAME_MS } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import { PROOF_BOX_SPEC } from "../table/spec";
import type { BallState, PhysicsWorld, Segment } from "../physics/types";
import { FixedStepLoop } from "./loop";

/**
 * PHYS-03 proof #2 (threat T-01-02, "tab-blur / backgrounded-tab spiral"):
 *
 * When a tab is backgrounded, `requestAnimationFrame` stalls and the browser can
 * hand the loop an arbitrarily huge real delta on the next frame. Fed naively
 * into the accumulator, a single `advance(5000)` (5 s) would try to run
 * floor(5000 / (FIXED_DT·1000)) = 600 catch-up steps in ONE call — a spiral of
 * death (each frame falls further behind) and a physics explosion risk.
 *
 * The `MAX_FRAME_MS` clamp in `FixedStepLoop.advance()` caps the per-call
 * catch-up work. This proof asserts, headlessly, that:
 *   (a) a huge delta executes a BOUNDED number of fixed steps (≈ MAX_FRAME_MS /
 *       step, NOT ~600),
 *   (b) the resulting ball state is finite (no NaN/Inf) and still inside the box
 *       (no teleport / tunnel-out), and
 *   (c) the loop RECOVERS — normal frames after the spike resume clean stepping.
 *
 * All assertions go through the engine-agnostic `PhysicsWorld` + `FixedStepLoop`
 * (never Planck directly), so the guard is proven at the interface (D-05).
 */

const STEP_MS = FIXED_DT * 1000;

// Upper bound on fixed steps a single clamped call may execute. The clamp caps
// the accumulated delta at MAX_FRAME_MS; +1 tolerates leftover accumulator from
// a prior call crossing one extra boundary.
const MAX_CATCHUP_STEPS = Math.ceil(MAX_FRAME_MS / STEP_MS) + 1;

// What the SAME huge delta would cost WITHOUT the clamp — the spiral we prevent.
const UNCLAMPED_SPIKE_STEPS = Math.floor(5000 / STEP_MS); // = 600

const FRAME_60_HZ = 1000 / 60;
const START = { x: 1.0, y: 0.4 } as const;

function makeRig(): { loop: FixedStepLoop; world: PhysicsWorld } {
  const world: PhysicsWorld = new PlanckWorld({ table: PROOF_BOX_SPEC });
  world.addBall(START);
  return { loop: new FixedStepLoop(world), world };
}

/** Axis-aligned bounds from the boundary segments (interface-only, no literals). */
function boundsOf(segments: readonly Segment[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const seg of segments) {
    for (const p of [seg.a, seg.b]) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, maxX, minY, maxY };
}

function currentBall(world: PhysicsWorld): BallState {
  const ball = world.getBalls()[0];
  if (!ball) throw new Error("ball vanished");
  return ball;
}

function expectFinite(ball: BallState): void {
  expect(Number.isFinite(ball.x)).toBe(true);
  expect(Number.isFinite(ball.y)).toBe(true);
  expect(Number.isFinite(ball.vx)).toBe(true);
  expect(Number.isFinite(ball.vy)).toBe(true);
  expect(Number.isFinite(ball.angle)).toBe(true);
}

describe("FixedStepLoop tab-blur / large-dt clamp (threat T-01-02)", () => {
  it("clamps a huge advance() to a bounded catch-up burst, not a 600-step spiral", () => {
    const { loop } = makeRig();

    // Warm up with ~0.5 s of normal 60 Hz frames so the accumulator is live.
    for (let i = 0; i < 30; i++) loop.advance(FRAME_60_HZ);

    // Simulate a 5 s backgrounded-tab stall arriving as one delta.
    const spikeSteps = loop.advance(5000);

    // The clamp caps catch-up work far below the un-clamped 600-step spiral.
    expect(spikeSteps).toBeLessThanOrEqual(MAX_CATCHUP_STEPS);
    expect(spikeSteps).toBeLessThan(UNCLAMPED_SPIKE_STEPS);
    expect(spikeSteps).toBeGreaterThan(0);

    // The accumulator drained to below one fixed step — it did not blow up past
    // the clamp ceiling (no unbounded backlog carried forward).
    expect(loop.accumulatorMs).toBeLessThan(STEP_MS);
  });

  it("keeps the ball finite and inside the box through the spike", () => {
    const { loop, world } = makeRig();
    const { minX, maxX, minY, maxY } = boundsOf(world.getBoundarySegments());

    for (let i = 0; i < 30; i++) loop.advance(FRAME_60_HZ);
    loop.advance(5000);

    const ball = currentBall(world);
    expectFinite(ball);

    // No teleport / tunnel-out: the ball is still within the box (small eps for
    // resting-contact solver penetration, matching the smoke gate).
    const eps = 0.05;
    expect(ball.x - ball.radius).toBeGreaterThanOrEqual(minX - eps);
    expect(ball.x + ball.radius).toBeLessThanOrEqual(maxX + eps);
    expect(ball.y - ball.radius).toBeGreaterThanOrEqual(minY - eps);
    expect(ball.y + ball.radius).toBeLessThanOrEqual(maxY + eps);
  });

  it("recovers: normal frames after the spike resume clean, bounded stepping", () => {
    const { loop, world } = makeRig();
    const { minX, maxX, minY, maxY } = boundsOf(world.getBoundarySegments());
    const eps = 0.05;

    for (let i = 0; i < 30; i++) loop.advance(FRAME_60_HZ);
    loop.advance(5000); // the stall

    // ~2 s of ordinary 60 Hz frames after the stall.
    const frames = Math.ceil(2000 / FRAME_60_HZ);
    for (let i = 0; i < frames; i++) {
      const steps = loop.advance(FRAME_60_HZ);
      // A 16.67 ms frame is ~2 fixed steps; never a catch-up burst once recovered.
      expect(steps).toBeLessThanOrEqual(3);

      const ball = currentBall(world);
      expectFinite(ball);
      expect(ball.x - ball.radius).toBeGreaterThanOrEqual(minX - eps);
      expect(ball.x + ball.radius).toBeLessThanOrEqual(maxX + eps);
      expect(ball.y - ball.radius).toBeGreaterThanOrEqual(minY - eps);
      expect(ball.y + ball.radius).toBeLessThanOrEqual(maxY + eps);
    }
  });
});

describe("a throwing post-step hook leaves the accumulator consistent (03-REVIEW WR-04)", () => {
  it("the step that ran is subtracted and counted before onPostStep throws", () => {
    const world = new PlanckWorld({ table: PROOF_BOX_SPEC });
    world.addBall({ x: 1, y: 1 });
    const loop = new FixedStepLoop(world);
    const throwing = (): void => {
      throw new Error("consumer failed");
    };
    expect(() => loop.advance(STEP_MS * 1.5, undefined, throwing)).toThrow("consumer failed");
    expect(loop.totalSteps).toBe(1);
    expect(loop.accumulatorMs).toBeCloseTo(STEP_MS * 0.5, 9);
    // The next frame does not re-run the step: with half a step pending, one
    // more frame's step runs exactly one (it would be two had the thrown step
    // been left on the accumulator).
    expect(loop.advance(STEP_MS)).toBe(1);
    expect(loop.totalSteps).toBe(2);
  });
});
