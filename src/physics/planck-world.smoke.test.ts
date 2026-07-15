import { describe, it, expect } from "vitest";

import {
  FIXED_DT,
  FLIPPER_RETURN_SPEED,
  FLIPPER_TIP_RADIUS_M,
  FLIPPER_UP_SPEED,
  MAX_FRAME_MS,
} from "./constants";
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
    const seq = frameMsSeq();
    const ca = seq.map((d) => la.advance(d));
    const cb = seq.map((d) => lb.advance(d));
    expect(ca).toEqual(cb);
    expect(la.totalSteps).toBe(lb.totalSteps);
  });
});

/** A jittery but fixed real-frame-time sequence (ms). */
function frameMsSeq(): number[] {
  return [16.6, 8.0, 33.3, 4.0, 20.0, 16.7, 50.0];
}

/**
 * Two mirrored capsule flippers + feel-speed motor remap (plan 02-01, D-07/D-05).
 *
 * Numeric/deterministic proofs against the engine-agnostic interface only. The
 * capsule shape (Box core + rounded tip Circle) and the mirrored placement are
 * adapter internals; here we assert the OBSERVABLE contract: two flippers with
 * distinct ids each carrying a finite tipRadius, and `setFlipperMotor` driving the
 * feel speeds (+1 → +FLIPPER_UP_SPEED, −1 → −FLIPPER_RETURN_SPEED, 0 → hold),
 * measured via the live joint angle advanced through the interface.
 */
describe("two mirrored capsule flippers + feel-speed motor (02-01)", () => {
  it("getFlippers returns two mirrored flippers with distinct ids and a finite tipRadius", () => {
    const world: PhysicsWorld = new PlanckWorld();
    const flippers = world.getFlippers();

    expect(flippers.length).toBe(2);

    const ids = flippers.map((f) => f.id);
    expect(new Set(ids).size).toBe(2); // distinct ids

    for (const f of flippers) {
      expect(f.tipRadius).toBe(FLIPPER_TIP_RADIUS_M);
      expect(Number.isFinite(f.tipRadius)).toBe(true);
      expect(f.tipRadius).toBeGreaterThan(0);
    }

    // Mirrored about the rig: the two pivots sit at different x.
    const [a, b] = flippers;
    if (!a || !b) throw new Error("expected two flippers");
    expect(a.pivotX).not.toBe(b.pivotX);
  });

  it("setFlipperMotor maps +1 -> fast raise, -1 -> softer return, 0 -> hold (per id)", () => {
    const world: PhysicsWorld = new PlanckWorld();
    const first = world.getFlippers()[0];
    if (!first) throw new Error("expected a flipper");
    const id = first.id;

    const angleOf = (): number => {
      const f = world.getFlippers().find((x) => x.id === id);
      if (!f) throw new Error("flipper vanished");
      return f.angle;
    };

    // The joint's high maxMotorTorque saturates the bat to the motor speed within
    // one fixed step, so per-step |dθ/dt| ≈ the commanded speed. We measure the
    // PEAK per-step speed each way, mid-arc only — a bat driven PAST a Box2D joint
    // limit briefly jams (an engine quirk the soak/stability proofs sidestep by
    // reversing before the limit / holding the bat), so we never park on a limit.

    // Nudge off the rest limit into the middle of the arc (2 return steps).
    world.setFlipperMotor(id, -1);
    world.step(FIXED_DT);
    world.step(FIXED_DT);

    // +1 -> raise: peak per-step angular speed (positive, ≈ FLIPPER_UP_SPEED).
    world.setFlipperMotor(id, +1);
    let raise = 0;
    let prev = angleOf();
    for (let i = 0; i < 2; i++) {
      world.step(FIXED_DT);
      const cur = angleOf();
      raise = Math.max(raise, (cur - prev) / FIXED_DT);
      prev = cur;
    }

    // -1 -> return: peak (most negative) per-step speed (≈ −FLIPPER_RETURN_SPEED).
    world.setFlipperMotor(id, -1);
    let ret = 0;
    prev = angleOf();
    for (let i = 0; i < 3; i++) {
      world.step(FIXED_DT);
      const cur = angleOf();
      ret = Math.min(ret, (cur - prev) / FIXED_DT);
      prev = cur;
    }

    // Raise ≈ FLIPPER_UP_SPEED (30), return ≈ −FLIPPER_RETURN_SPEED (−20), and the
    // return is genuinely SOFTER than the raise — the whole point of the remap.
    expect(raise).toBeGreaterThan(FLIPPER_UP_SPEED * 0.85);
    expect(raise).toBeLessThan(FLIPPER_UP_SPEED * 1.25);
    expect(ret).toBeLessThan(-FLIPPER_RETURN_SPEED * 0.85);
    expect(ret).toBeGreaterThan(-FLIPPER_RETURN_SPEED * 1.25);
    expect(Math.abs(ret)).toBeLessThan(raise);

    // 0 -> hold: the bat barely moves over many steps (motor pins it, D-06(1)).
    world.setFlipperMotor(id, 0);
    const held = angleOf();
    for (let i = 0; i < 15; i++) world.step(FIXED_DT);
    expect(Math.abs(angleOf() - held)).toBeLessThan(0.03);

    // Unknown id is a no-op (does not throw).
    expect(() => world.setFlipperMotor(9999, 1)).not.toThrow();
  });
});
