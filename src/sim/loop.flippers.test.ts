import { describe, it, expect, vi } from "vitest";

import { FIXED_DT, FLIPPER_LOWER_ANGLE, FLIPPER_UPPER_ANGLE } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type {
  BallState,
  CollisionEvent,
  FlipperState,
  PhysicsWorld,
  Segment,
  Vec2,
} from "../physics/types";
import type { ResolvedElement } from "../table/resolve";
import { FlipperController } from "../control/flipper-controller";
import { interpolateAngles } from "../render/interpolate";
import { FixedStepLoop } from "./loop";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * RND-02 (05-08): flipper angles are snapshotted by the loop and interpolated
 * like the ball, so a bat moves on EVERY render frame at a high refresh rate.
 *
 * The real-table case drives the production composition (PlanckWorld over
 * TABLE_SPEC, the FlipperController built before the loop and ticked at the top
 * of each fixed step, as flipper-e2e and main.ts do) at a 144 Hz render cadence,
 * which is faster than the 120 Hz physics: some frames run no fixed step, so the
 * raw current angle repeats on them (the judder), while the drawn angle lerped at
 * `alpha` still advances.
 */

const FRAME_144_HZ_MS = 1000 / 144;
const STEP_MS = FIXED_DT * 1000;
/** The full raise sweep between the two joint limits (rad). */
const SWEEP = FLIPPER_UPPER_ANGLE - FLIPPER_LOWER_ANGLE;

/**
 * True when, from accumulator `acc`, the next 144 Hz frame runs a fixed step and
 * the frame after it runs none (the loop's own accumulator arithmetic). The
 * swing lasts only a handful of steps, so the press is phased to put an idle
 * frame inside it.
 */
function idleFrameFollowsNext(acc: number): boolean {
  const a = acc + FRAME_144_HZ_MS;
  if (a < STEP_MS) return false;
  const leftover = a - STEP_MS * Math.floor(a / STEP_MS);
  return leftover + FRAME_144_HZ_MS < STEP_MS;
}

interface FrameSample {
  steps: number;
  raw: number;
  prev: number;
  cur: number;
  drawn: number;
}

describe("flipper-angle interpolation on the real table (RND-02 tracer)", () => {
  it("at 144 Hz the drawn left-bat angle advances on every frame of a swing, where the raw angle repeats", () => {
    const world = new PlanckWorld();
    const controller = new FlipperController(world);
    const loop = new FixedStepLoop(world);

    const byX = world
      .getFlippers()
      .slice()
      .sort((a, b) => a.pivotX - b.pivotX);
    const left = byX[0];
    if (!left) throw new Error("expected a left flipper");
    const leftId = left.id;
    const leftIndex = world.getFlippers().findIndex((f) => f.id === leftId);
    const flipperCount = world.getFlippers().length;
    const rest = left.restLimitAngle;

    const prevRef = loop.previousFlipperAngles;
    const curRef = loop.currentFlipperAngles;
    const out: number[] = [];
    const onStep = (): void => controller.update();

    // Rest at 144 Hz until the press lands so an idle frame falls mid-swing.
    for (let i = 0; i < 12 && !idleFrameFollowsNext(loop.accumulatorMs); i++) {
      loop.advance(FRAME_144_HZ_MS, onStep);
    }
    expect(idleFrameFollowsNext(loop.accumulatorMs)).toBe(true);

    controller.onPressEdge(leftId);
    const frames: FrameSample[] = [];
    for (let i = 0; i < 60; i++) {
      const steps = loop.advance(FRAME_144_HZ_MS, onStep);
      interpolateAngles(loop.previousFlipperAngles, loop.currentFlipperAngles, loop.alpha, out);
      frames.push({
        steps,
        raw: world.getFlippers()[leftIndex]?.angle ?? NaN,
        prev: loop.previousFlipperAngles[leftIndex] ?? NaN,
        cur: loop.currentFlipperAngles[leftIndex] ?? NaN,
        drawn: out[leftIndex] ?? NaN,
      });
      // Pooled: same arrays, flipper-count long, on every frame.
      expect(loop.previousFlipperAngles).toBe(prevRef);
      expect(loop.currentFlipperAngles).toBe(curRef);
      expect(loop.previousFlipperAngles.length).toBe(flipperCount);
      expect(loop.currentFlipperAngles.length).toBe(flipperCount);
    }

    // Direction of the raise and the up stop, from the observed held-up pose.
    const last = frames[frames.length - 1];
    if (!last) throw new Error("no frames");
    const dir = Math.sign(last.raw - rest);
    expect(dir).not.toBe(0);
    const upStop = rest + dir * SWEEP;
    const between = (a: number): boolean => dir * (a - rest) > 0 && dir * (upStop - a) > 0;

    // The swing window: from the first frame strictly between the stops up to
    // (not including) the first frame that reaches the up stop.
    const start = frames.findIndex((f) => between(f.raw));
    expect(start).toBeGreaterThanOrEqual(0);
    let end = start;
    while (end < frames.length && between(frames[end]?.raw ?? NaN)) end++;
    const swing = frames.slice(start, end);
    expect(swing.length).toBeGreaterThanOrEqual(3);

    for (let k = 0; k < swing.length; k++) {
      const f = swing[k];
      if (!f) continue;
      // Drawn lies between this frame's previous and current snapshot.
      expect(dir * (f.drawn - f.prev)).toBeGreaterThanOrEqual(0);
      expect(dir * (f.cur - f.drawn)).toBeGreaterThanOrEqual(0);
      if (k > 0) {
        const g = swing[k - 1];
        if (!g) continue;
        // Strictly monotonic toward the up stop: no repeated drawn frame.
        expect(dir * (f.drawn - g.drawn)).toBeGreaterThan(0);
      }
    }

    // The raw current angle repeats on a frame that ran no fixed step: the
    // stepping the interpolation removes.
    let rawRepeatsOnIdleFrame = false;
    for (let k = start + 1; k < frames.length; k++) {
      const f = frames[k];
      const g = frames[k - 1];
      if (f && g && f.steps === 0 && f.raw === g.raw && between(g.raw))
        rawRepeatsOnIdleFrame = true;
    }
    expect(rawRepeatsOnIdleFrame).toBe(true);
  });
});

/* ------------------------------------------------------------------------- *
 * Spy-world cases: snapshot timing, pooling and the read-only rule.
 * ------------------------------------------------------------------------- */

/** Per-step flipper angle increments of the spy world (rad). */
const ANGLE_DELTAS = [0.01, -0.02] as const;

/**
 * A minimal PhysicsWorld whose two flipper angles advance by a known amount on
 * every step() and whose one ball drifts, so snapshot timing is exact.
 * `angleHistory[k]` holds the angles after k steps.
 */
class SpyWorld implements PhysicsWorld {
  steps = 0;
  readonly angleHistory: number[][];
  private readonly flippers: { -readonly [K in keyof FlipperState]: FlipperState[K] }[];
  private readonly balls: { -readonly [K in keyof BallState]: BallState[K] }[];

  constructor() {
    this.flippers = [0.1, 2.0].map((angle, id) => ({
      id,
      pivotX: id,
      pivotY: 0,
      angle,
      length: 0.07,
      halfWidth: 0.008,
      tipRadius: 0.008,
      restLimitAngle: angle,
    }));
    this.balls = [{ id: 7, x: 0, y: 0, vx: 1, vy: 0.5, radius: 0.0135, angle: 0 }];
    this.angleHistory = [this.flippers.map((f) => f.angle)];
  }

  step(dt: number): void {
    this.steps++;
    this.flippers.forEach((f, i) => {
      f.angle += ANGLE_DELTAS[i] ?? 0;
    });
    for (const b of this.balls) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 0.3 * dt;
    }
    this.angleHistory.push(this.flippers.map((f) => f.angle));
  }
  addBall(): number {
    return 0;
  }
  removeBall(): void {}
  getBalls(): readonly BallState[] {
    return this.balls;
  }
  getFlippers(): readonly FlipperState[] {
    return this.flippers;
  }
  setFlipperMotor(): void {}
  applyImpulse(): void {}
  getElements(): readonly ResolvedElement[] {
    return [];
  }
  getBoundarySegments(): readonly Segment[] {
    return [];
  }
  drainEvents(): readonly CollisionEvent[] {
    return [];
  }
  getContactPoints(): readonly Vec2[] {
    return [];
  }
}

describe("FixedStepLoop flipper-angle snapshots (spy world)", () => {
  it("seeds previous and current with the world's flipper angles, in getFlippers() order", () => {
    const world = new SpyWorld();
    const loop = new FixedStepLoop(world);
    const angles = world.getFlippers().map((f) => f.angle);
    expect([...loop.previousFlipperAngles]).toEqual(angles);
    expect([...loop.currentFlipperAngles]).toEqual(angles);
  });

  it("after a one-step advance, previous holds the angles before that step and current those after it", () => {
    const world = new SpyWorld();
    const loop = new FixedStepLoop(world);
    expect(loop.advance(STEP_MS)).toBe(1);
    expect([...loop.previousFlipperAngles]).toEqual(world.angleHistory[0]);
    expect([...loop.currentFlipperAngles]).toEqual(world.angleHistory[1]);
  });

  it("after a three-step advance, previous holds the angles before the third step", () => {
    const world = new SpyWorld();
    const loop = new FixedStepLoop(world);
    expect(loop.advance(3.5 * STEP_MS)).toBe(3);
    expect([...loop.previousFlipperAngles]).toEqual(world.angleHistory[2]);
    expect([...loop.currentFlipperAngles]).toEqual(world.angleHistory[3]);
  });

  it("an advance that runs zero steps leaves both arrays unchanged", () => {
    const world = new SpyWorld();
    const loop = new FixedStepLoop(world);
    expect(loop.advance(1.5 * STEP_MS)).toBe(1);
    const prevBefore = [...loop.previousFlipperAngles];
    const curBefore = [...loop.currentFlipperAngles];
    expect(loop.advance(0.25 * STEP_MS)).toBe(0);
    expect([...loop.previousFlipperAngles]).toEqual(prevBefore);
    expect([...loop.currentFlipperAngles]).toEqual(curBefore);
  });

  it("keeps both arrays' identity across advances, each flipper-count long", () => {
    const world = new SpyWorld();
    const loop = new FixedStepLoop(world);
    const prevRef = loop.previousFlipperAngles;
    const curRef = loop.currentFlipperAngles;
    for (const ms of [STEP_MS, 0.3 * STEP_MS, 2.2 * STEP_MS, 1000 / 144, 1000 / 60]) {
      loop.advance(ms);
      expect(loop.previousFlipperAngles).toBe(prevRef);
      expect(loop.currentFlipperAngles).toBe(curRef);
      expect(loop.previousFlipperAngles).toHaveLength(world.getFlippers().length);
      expect(loop.currentFlipperAngles).toHaveLength(world.getFlippers().length);
    }
  });

  it("ball snapshots and step counts are identical with and without reading the flipper getters", () => {
    const plain = new SpyWorld();
    const reading = new SpyWorld();
    const loopPlain = new FixedStepLoop(plain);
    const loopReading = new FixedStepLoop(reading);
    const out: number[] = [];
    const cadence = [1000 / 144, 1000 / 60, 1000 / 120, 3.7, 21];
    for (let i = 0; i < 200; i++) {
      const ms = cadence[i % cadence.length] ?? 1;
      const a = loopPlain.advance(ms);
      const b = loopReading.advance(ms);
      interpolateAngles(
        loopReading.previousFlipperAngles,
        loopReading.currentFlipperAngles,
        loopReading.alpha,
        out,
      );
      expect(b).toBe(a);
      expect(loopReading.current).toEqual(loopPlain.current);
      expect(loopReading.previous).toEqual(loopPlain.previous);
    }
    expect(reading.steps).toBe(plain.steps);
    expect(loopReading.totalSteps).toBe(loopPlain.totalSteps);
  });
});
