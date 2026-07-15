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

  it("setFlipperMotor: +1 RAISES the tip (world up), -1 returns it down, at feel speeds — BOTH mirrored flippers", () => {
    // The direction bug (02-VERIFICATION / gap 01): a body-angle-π mirror preserves
    // rotational handedness, so a uniform sign→speed map RAISED the right bat but
    // DROOPED the left on the same +1. This proves the adapter's per-flipper raise
    // sign is correct: +1 lifts the TIP (true world −y) and −1 drops it for BOTH the
    // left AND the reference-mirrored right bat, at the feel-tuned raise/return
    // speeds. Direction is asserted against real tip world-Y, never "toward the
    // constant named FLIPPER_UPPER_ANGLE".
    const ids = new PlanckWorld().getFlippers().map((f) => f.id);
    expect(ids.length).toBe(2);

    for (const id of ids) {
      // A FRESH world per flipper so the OTHER (undriven) bat — which sits at its
      // construction default — can never collide with the bat under test.
      const world: PhysicsWorld = new PlanckWorld();
      const other = ids.find((x) => x !== id);
      const stateOf = (): { pivotY: number; length: number; angle: number } => {
        const f = world.getFlippers().find((x) => x.id === id);
        if (!f) throw new Error("flipper vanished");
        return f;
      };
      const angleOf = (): number => stateOf().angle;
      // True WORLD tip height: pivotY + length·sin(angle). Smaller y = higher up.
      const tipY = (): number => {
        const f = stateOf();
        return f.pivotY + f.length * Math.sin(f.angle);
      };
      // Keep the other bat DOWN (out of the way) for the whole measurement.
      const holdOtherDown = (): void => {
        if (other !== undefined) world.setFlipperMotor(other, -1);
      };

      // Park the bat NEAR its rest/down end (drive the RETURN direction, softer
      // speed) so the measured RAISE then sweeps the FULL ~45° arc; we measure the
      // PEAK per-step speed mid-arc and never park hard on the limit we leave (a bat
      // driven PAST a Box2D joint limit briefly jams — an engine quirk).
      for (let i = 0; i < 6; i++) {
        world.setFlipperMotor(id, -1);
        holdOtherDown();
        world.step(FIXED_DT);
      }
      const downTipY = tipY();

      // +1 -> RAISE: peak |per-step angular speed| ≈ FLIPPER_UP_SPEED; tip rises.
      let raise = 0;
      let prev = angleOf();
      for (let i = 0; i < 6; i++) {
        world.setFlipperMotor(id, +1);
        holdOtherDown();
        world.step(FIXED_DT);
        const cur = angleOf();
        raise = Math.max(raise, Math.abs(cur - prev) / FIXED_DT);
        prev = cur;
      }
      const upTipY = tipY();

      // -1 -> RETURN: peak |per-step angular speed| ≈ FLIPPER_RETURN_SPEED; tip drops.
      let ret = 0;
      prev = angleOf();
      for (let i = 0; i < 6; i++) {
        world.setFlipperMotor(id, -1);
        holdOtherDown();
        world.step(FIXED_DT);
        const cur = angleOf();
        ret = Math.max(ret, Math.abs(cur - prev) / FIXED_DT);
        prev = cur;
      }
      const backDownTipY = tipY();

      // TRUE raise direction (the crux): +1 lifts the tip (world −y), −1 drops it.
      expect(upTipY).toBeLessThan(downTipY - 0.1); // +1 raised the tip well up
      expect(backDownTipY).toBeGreaterThan(upTipY + 0.1); // −1 returned it down

      // Feel speeds: raise ≈ FLIPPER_UP_SPEED (30), return ≈ FLIPPER_RETURN_SPEED
      // (20), and the return is genuinely SOFTER than the raise — the D-05 remap.
      expect(raise).toBeGreaterThan(FLIPPER_UP_SPEED * 0.85);
      expect(raise).toBeLessThan(FLIPPER_UP_SPEED * 1.25);
      expect(ret).toBeGreaterThan(FLIPPER_RETURN_SPEED * 0.85);
      expect(ret).toBeLessThan(FLIPPER_RETURN_SPEED * 1.25);
      expect(ret).toBeLessThan(raise);

      // 0 -> hold: the bat barely moves over many steps (motor pins it, D-06(1)).
      world.setFlipperMotor(id, 0);
      const held = angleOf();
      for (let i = 0; i < 15; i++) {
        holdOtherDown();
        world.step(FIXED_DT);
      }
      expect(Math.abs(angleOf() - held)).toBeLessThan(0.03);
    }

    // Unknown id is a no-op (does not throw).
    expect(() => new PlanckWorld().setFlipperMotor(9999, 1)).not.toThrow();
  });
});
