import { describe, it, expect } from "vitest";

import { FIXED_DT, MAX_FRAME_MS } from "./constants";
import { PlanckWorld } from "./planck-world";
import type { PhysicsWorld, Segment } from "./types";
import { FixedStepLoop } from "../sim/loop";

/**
 * Headless smoke proof for the first real physics behind the interface.
 *
 * These assertions are numeric/deterministic (node env, no DOM) and target the
 * engine-agnostic `PhysicsWorld` + fixed-step loop — NOT Planck directly — so
 * the identical proof survives any future engine swap (D-05).
 */

const START = { x: 1.5, y: 0.4 } as const;

function makeWorldWithBall(): { world: PhysicsWorld; id: number } {
  const world = new PlanckWorld();
  const id = world.addBall(START);
  return { world, id };
}

/** Axis-aligned bounds derived from the boundary segments (interface-only). */
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

describe("PlanckWorld + FixedStepLoop smoke", () => {
  it("ball falls down the tilted playfield when the loop advances 0.5s", () => {
    const { world, id } = makeWorldWithBall();
    const loop = new FixedStepLoop(world);

    loop.advance(500);

    const ball = world.getBalls().find((b) => b.id === id);
    if (!ball) throw new Error("ball vanished");

    // In-plane gravity is +y, so a fall increases y.
    expect(ball.y).toBeGreaterThan(START.y);
    const speed = Math.hypot(ball.vx, ball.vy);
    expect(speed).toBeGreaterThan(0);
  });

  it("ball stays inside the bounded box on every step over a 5s run", () => {
    const { world } = makeWorldWithBall();
    const loop = new FixedStepLoop(world);

    const { minX, maxX, minY, maxY } = boundsOf(world.getBoundarySegments());
    // Boundary is not degenerate.
    expect(maxX).toBeGreaterThan(minX);
    expect(maxY).toBeGreaterThan(minY);

    const eps = 0.05; // allow tiny solver penetration at resting contact
    const frameMs = 1000 / 60;
    const frames = Math.ceil(5000 / frameMs);

    for (let i = 0; i < frames; i++) {
      loop.advance(frameMs);
      const ball = world.getBalls()[0];
      if (!ball) throw new Error("ball vanished");
      expect(ball.x - ball.radius).toBeGreaterThanOrEqual(minX - eps);
      expect(ball.x + ball.radius).toBeLessThanOrEqual(maxX + eps);
      expect(ball.y - ball.radius).toBeGreaterThanOrEqual(minY - eps);
      expect(ball.y + ball.radius).toBeLessThanOrEqual(maxY + eps);
    }
  });

  it("loop drains the accumulator into an integer number of 120Hz steps", () => {
    const stepMs = FIXED_DT * 1000;

    const { world } = makeWorldWithBall();
    const loop = new FixedStepLoop(world);

    // 7.5 fixed-steps of real time -> exactly 7 whole steps, ~half a step left.
    const steps = loop.advance(7.5 * stepMs);
    expect(steps).toBe(7);
    expect(loop.totalSteps).toBe(7);
    expect(loop.accumulatorMs).toBeGreaterThan(0);
    expect(loop.accumulatorMs).toBeLessThan(stepMs);
    expect(loop.alpha).toBeCloseTo(0.5, 5);

    // Spiral-of-death clamp (T-01-02): a huge delta cannot explode into
    // thousands of catch-up steps.
    const { world: world2 } = makeWorldWithBall();
    const loop2 = new FixedStepLoop(world2);
    const bigSteps = loop2.advance(100_000);
    const maxCatchup = Math.ceil(MAX_FRAME_MS / stepMs) + 1;
    expect(bigSteps).toBeLessThanOrEqual(maxCatchup);

    // Determinism: identical input sequences -> identical step counts.
    const { world: wa } = makeWorldWithBall();
    const { world: wb } = makeWorldWithBall();
    const la = new FixedStepLoop(wa);
    const lb = new FixedStepLoop(wb);
    const seq = [frameMsSeq()];
    const ca = seq[0].map((d) => la.advance(d));
    const cb = seq[0].map((d) => lb.advance(d));
    expect(ca).toEqual(cb);
    expect(la.totalSteps).toBe(lb.totalSteps);
  });
});

/** A jittery but fixed real-frame-time sequence (ms). */
function frameMsSeq(): number[] {
  return [16.6, 8.0, 33.3, 4.0, 20.0, 16.7, 50.0];
}
