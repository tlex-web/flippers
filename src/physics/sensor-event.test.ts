import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { BALL_RADIUS_M, FIXED_DT } from "./constants";
import { PlanckWorld } from "./planck-world";
import type { BallId, BallState, CollisionEventType, CollisionPartnerKind, Vec2 } from "./types";
import { FixedStepLoop } from "../sim/loop";
import { DRAIN_Y, PLUNGER_REST } from "../table/spec";

/**
 * Sensors on the bus (plan 03-06 Task 2, 03-RESEARCH Pitfall 1). Planck never
 * solves a sensor, so it never fires post-solve: without a begin-contact path
 * every lane, rollover and drain event would vanish. These run on the real
 * table through the real loop and router.
 */

interface Seen {
  readonly step: number;
  readonly type: CollisionEventType;
  readonly ballId: BallId;
  readonly elementKind: CollisionPartnerKind;
  readonly elementId: number;
  readonly point: Vec2;
  readonly normalImpulse: number;
}

interface Rig {
  readonly world: PlanckWorld;
  readonly ballId: BallId;
  readonly seen: Seen[];
  ball(): BallState;
  /** One fixed step; returns the events dispatched during it. */
  step(): Seen[];
  stepNo(): number;
}

function makeRig(at: Vec2): Rig {
  const world = new PlanckWorld();
  for (const f of world.getFlippers()) world.setFlipperMotor(f.id, 0);
  const ballId = world.addBall(at);
  // Discard anything recorded before the observed run.
  world.drainEvents();
  const loop = new FixedStepLoop(world);
  const router = new CollisionRouter(world);
  const seen: Seen[] = [];
  let stepNo = 0;
  router.register((e) => {
    seen.push({
      step: stepNo,
      type: e.type,
      ballId: e.ballId,
      elementKind: e.elementKind,
      elementId: e.elementId,
      point: { x: e.point.x, y: e.point.y },
      normalImpulse: e.normalImpulse,
    });
  });
  const onPostStep = (): void => {
    router.dispatch();
  };
  const ball = (): BallState => {
    const b = world.getBalls().find((x) => x.id === ballId);
    if (!b) throw new Error(`ball ${ballId} vanished`);
    return b;
  };
  const step = (): Seen[] => {
    const before = seen.length;
    const n = loop.advance(FIXED_DT * 1000, undefined, onPostStep);
    if (n !== 1) throw new Error(`expected exactly 1 fixed step, got ${n}`);
    stepNo++;
    return seen.slice(before);
  };
  return { world, ballId, seen, ball, step, stepNo: () => stepNo };
}

const ROLLOVER_401_Y = 0.95;
const TWO_SECONDS = Math.round(2 / FIXED_DT);

describe("sensor contacts reach the bus via begin-contact", () => {
  it("a ball falling through rollover lane 401 emits exactly one rollover event with impulse 0", () => {
    const rig = makeRig({ x: 1.45, y: 0.55 });
    // Run until the ball has fully left the sensor line (plus a margin).
    let guard = 0;
    while (rig.ball().y < ROLLOVER_401_Y + BALL_RADIUS_M + 0.1) {
      rig.step();
      if (++guard > TWO_SECONDS) throw new Error("ball never cleared the rollover");
    }
    const hits = rig.seen.filter((e) => e.elementKind === "rollover");
    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit?.elementId).toBe(401);
    expect(hit?.normalImpulse).toBe(0);
    expect(hit?.ballId).toBe(rig.ballId);
    expect(hit?.type).toBe("ball-wall");
    // Point = the ball's center at overlap begin, on the lane's x span.
    expect(hit?.point.x).toBeGreaterThan(1.25);
    expect(hit?.point.x).toBeLessThan(1.65);
  });

  it("the rollover is not a barrier: vy never reverses across the crossing", () => {
    const rig = makeRig({ x: 1.45, y: 0.55 });
    let minVy = Infinity;
    let guard = 0;
    while (rig.ball().y < ROLLOVER_401_Y + BALL_RADIUS_M + 0.1) {
      rig.step();
      minVy = Math.min(minVy, rig.ball().vy);
      if (++guard > TWO_SECONDS) throw new Error("ball never cleared the rollover");
    }
    expect(minVy).toBeGreaterThanOrEqual(0);
    // And it did cross the sensor (the event exists).
    expect(rig.seen.some((e) => e.elementKind === "rollover" && e.elementId === 401)).toBe(true);
  });

  it("a ball dropped through the flipper drain gap emits a drain 600 event once past DRAIN_Y", () => {
    const rig = makeRig({ x: 1.45, y: 5.3 });
    let guard = 0;
    while (rig.ball().y <= DRAIN_Y) {
      rig.step();
      if (++guard > TWO_SECONDS) throw new Error("ball never passed DRAIN_Y");
    }
    const hits = rig.seen.filter((e) => e.elementKind === "drain");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.elementId).toBe(600);
    expect(hits[0]?.normalImpulse).toBe(0);
    expect(hits[0]?.ballId).toBe(rig.ballId);
  });

  it("solid contacts stay on post-solve only: a ball landing on the plunger yields no zero-impulse duplicates", () => {
    // Released just above PLUNGER_REST so the first touch of the chute floor
    // (the moment begin-contact fires) is inside the observed window.
    const rig = makeRig({ x: PLUNGER_REST.x, y: PLUNGER_REST.y - 0.05 });
    for (let i = 0; i < 60; i++) {
      const events = rig.step();
      // At most one report per solid contact per step (one floor contact here).
      const floor = events.filter((e) => e.elementKind === "wall");
      expect(floor.length).toBeLessThanOrEqual(1);
    }
    expect(rig.seen.length).toBeGreaterThan(0);
    for (const e of rig.seen) {
      expect(e.type).toBe("ball-wall");
      expect(e.normalImpulse).toBeGreaterThan(0);
    }
  });
});

/**
 * Regression for 03-REVIEW CR-02. A sensor manifold has 0 points, and Planck's
 * `getWorldManifold` returns the caller's reused manifold UNTOUCHED in that
 * case, so the adapter's shared scratch manifold still held the last solid
 * contact's point. A second ball parked on the plunger keeps a solid contact
 * alive every step, which is exactly the state that exposed the stale point.
 */
describe("sensor contacts read the ball center, never a stale solid point (CR-02)", () => {
  function makeTwoBallRig(): {
    world: PlanckWorld;
    falling: BallId;
    seen: Seen[];
    prevCenter: () => Vec2;
    step: () => void;
    fallingBall: () => BallState;
  } {
    const world = new PlanckWorld();
    for (const f of world.getFlippers()) world.setFlipperMotor(f.id, 0);
    const loop = new FixedStepLoop(world);
    world.addBall({ x: PLUNGER_REST.x, y: PLUNGER_REST.y });
    // Settle the parked ball so a solid floor contact is live every step.
    for (let i = 0; i < 60; i++) loop.advance(FIXED_DT * 1000);
    const falling = world.addBall({ x: 1.45, y: 0.55 });
    world.drainEvents();
    const router = new CollisionRouter(world);
    const seen: Seen[] = [];
    let stepNo = 0;
    router.register((e) => {
      seen.push({
        step: stepNo,
        type: e.type,
        ballId: e.ballId,
        elementKind: e.elementKind,
        elementId: e.elementId,
        point: { x: e.point.x, y: e.point.y },
        normalImpulse: e.normalImpulse,
      });
    });
    const fallingBall = (): BallState => {
      const b = world.getBalls().find((x) => x.id === falling);
      if (!b) throw new Error("falling ball vanished");
      return b;
    };
    let prev: Vec2 = { x: 1.45, y: 0.55 };
    const step = (): void => {
      const b = fallingBall();
      prev = { x: b.x, y: b.y };
      const n = loop.advance(FIXED_DT * 1000, undefined, () => router.dispatch());
      if (n !== 1) throw new Error(`expected exactly 1 fixed step, got ${n}`);
      stepNo++;
    };
    return { world, falling, seen, prevCenter: () => prev, step, fallingBall };
  }

  it("a rollover event's point is the falling ball's center, not the parked ball's floor contact", () => {
    const rig = makeTwoBallRig();
    let centerAtBegin: Vec2 | null = null;
    let guard = 0;
    while (rig.fallingBall().y < ROLLOVER_401_Y + BALL_RADIUS_M + 0.1) {
      const before = rig.seen.length;
      rig.step();
      const hit = rig.seen.slice(before).find((e) => e.elementKind === "rollover");
      if (hit && !centerAtBegin) centerAtBegin = rig.prevCenter();
      if (++guard > TWO_SECONDS) throw new Error("ball never cleared the rollover");
    }
    const hits = rig.seen.filter((e) => e.elementKind === "rollover");
    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit?.ballId).toBe(rig.falling);
    if (!hit || !centerAtBegin) throw new Error("no rollover hit");
    // Within one step's travel of the ball's center at the begin step, and
    // nowhere near the parked ball down at the plunger (y ≈ 6.2).
    expect(Math.hypot(hit.point.x - centerAtBegin.x, hit.point.y - centerAtBegin.y)).toBeLessThan(
      0.05,
    );
    expect(hit.point.y).toBeLessThan(ROLLOVER_401_Y + BALL_RADIUS_M);
  });

  it("an overlapping sensor adds no contact points to getContactPoints()", () => {
    const rig = makeTwoBallRig();
    // Count while the falling ball is in free air above the rollover, then
    // while it overlaps the sensor: the solid contacts are the same set.
    let freeAirCount = -1;
    let overlapCount = -1;
    let guard = 0;
    while (overlapCount < 0) {
      rig.step();
      const y = rig.fallingBall().y;
      if (y + BALL_RADIUS_M < ROLLOVER_401_Y - 0.02)
        freeAirCount = rig.world.getContactPoints().length;
      else if (Math.abs(y - ROLLOVER_401_Y) < BALL_RADIUS_M - 0.02) {
        overlapCount = rig.world.getContactPoints().length;
      }
      if (++guard > TWO_SECONDS) throw new Error("ball never reached the rollover");
    }
    expect(freeAirCount).toBeGreaterThan(0);
    expect(overlapCount).toBe(freeAirCount);
  });
});
