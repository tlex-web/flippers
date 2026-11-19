import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FIXED_DT } from "./constants";
import { normalizeContact, PlanckWorld, type ContactIdentity } from "./planck-world";
import type { BallId, CollisionEventType, CollisionPartnerKind } from "./types";
import { FixedStepLoop } from "../sim/loop";

/**
 * The typed bus tracer (plan 03-06 Task 1, D-11/D-12): a real solver contact on
 * the real table travels post-solve -> pooled source -> CollisionRouter ->
 * listener, carrying normalized spec identity, one dispatch per fixed step.
 */

/** A copied-out event record (the pooled one is mutated next step). */
interface Seen {
  readonly type: CollisionEventType;
  readonly ballId: BallId;
  readonly elementKind: CollisionPartnerKind;
  readonly elementId: number;
  readonly normalImpulse: number;
}

interface Rig {
  readonly world: PlanckWorld;
  readonly seen: Seen[];
  /** Advance `n` fixed steps; returns the total steps advance() reported. */
  run(n: number): number;
  /** onPostStep invocations so far. */
  postSteps(): number;
}

function makeRig(): Rig {
  const world = new PlanckWorld();
  // Both bats held at motor 0 (they rest at their droop limits).
  for (const f of world.getFlippers()) world.setFlipperMotor(f.id, 0);
  const loop = new FixedStepLoop(world);
  const router = new CollisionRouter(world);
  const seen: Seen[] = [];
  router.register((e) => {
    seen.push({
      type: e.type,
      ballId: e.ballId,
      elementKind: e.elementKind,
      elementId: e.elementId,
      normalImpulse: e.normalImpulse,
    });
  });
  let postSteps = 0;
  const onPostStep = (): void => {
    postSteps++;
    router.dispatch();
  };
  const run = (n: number): number => {
    let total = 0;
    for (let i = 0; i < n; i++) total += loop.advance(FIXED_DT * 1000, undefined, onPostStep);
    return total;
  };
  return { world, seen, run, postSteps: () => postSteps };
}

const TWO_SECONDS = Math.round(2 / FIXED_DT);

describe("typed collision bus on the real table (D-11/D-12)", () => {
  it("a ball dropped onto bumper 202 reaches the listener as a ball-wall bumper event", () => {
    const rig = makeRig();
    const bumper = rig.world.getElements().find((el) => el.id === 202);
    const c = bumper?.circle;
    if (!c) throw new Error("bumper 202 missing");
    const ballId = rig.world.addBall({ x: c.center.x + 0.05, y: c.center.y - 1.0 });

    const total = rig.run(TWO_SECONDS);

    const hit = rig.seen.find((e) => e.elementKind === "bumper" && e.elementId === 202);
    expect(hit).toBeDefined();
    expect(hit?.ballId).toBe(ballId);
    expect(hit?.type).toBe("ball-wall");
    expect(hit?.normalImpulse).toBeGreaterThan(0);
    // One dispatch per fixed step.
    expect(rig.postSteps()).toBe(total);
    expect(total).toBe(TWO_SECONDS);
  });

  it("a ball released in the left inlane rolls onto the drooped left flipper", () => {
    const rig = makeRig();
    const left = rig.world
      .getFlippers()
      .slice()
      .sort((a, b) => a.pivotX - b.pivotX)[0];
    if (!left) throw new Error("no flipper");
    const ballId = rig.world.addBall({ x: 0.55, y: 4.6 });

    const total = rig.run(TWO_SECONDS);

    const hit = rig.seen.find((e) => e.elementKind === "flipper");
    expect(hit).toBeDefined();
    expect(hit?.elementId).toBe(left.id);
    expect(hit?.type).toBe("ball-flipper");
    expect(hit?.ballId).toBe(ballId);
    expect(rig.postSteps()).toBe(total);
  });

  it("onPostStep never runs when a call drains no whole step", () => {
    const rig = makeRig();
    const world = rig.world;
    const loop = new FixedStepLoop(world);
    let post = 0;
    const steps = loop.advance(FIXED_DT * 1000 * 0.4, undefined, () => post++);
    expect(steps).toBe(0);
    expect(post).toBe(0);
    const more = loop.advance(FIXED_DT * 1000 * 2.7, undefined, () => post++);
    expect(post).toBe(more);
  });
});

describe("normalizeContact (D-12): order-independent identity", () => {
  const blank = (): ContactIdentity => ({
    type: "ball-wall",
    ballId: -1,
    elementKind: "wall",
    elementId: -1,
  });

  it("(ball, bumper) and (bumper, ball) produce the same identity", () => {
    const ab = blank();
    const ba = blank();
    expect(normalizeContact(ab, { kind: "ball", id: 7 }, { kind: "bumper", id: 202 })).toBe(true);
    expect(normalizeContact(ba, { kind: "bumper", id: 202 }, { kind: "ball", id: 7 })).toBe(true);
    expect(ab).toEqual({ type: "ball-wall", ballId: 7, elementKind: "bumper", elementId: 202 });
    expect(ba).toEqual(ab);
  });

  it("(ball, flipper) in either order is ball-flipper naming the bat", () => {
    const ab = blank();
    const ba = blank();
    normalizeContact(ab, { kind: "ball", id: 2 }, { kind: "flipper", id: 1 });
    normalizeContact(ba, { kind: "flipper", id: 1 }, { kind: "ball", id: 2 });
    expect(ab).toEqual({ type: "ball-flipper", ballId: 2, elementKind: "flipper", elementId: 1 });
    expect(ba).toEqual(ab);
  });

  it("(wall, flipper) has no ball side: returns false and writes nothing", () => {
    const out = blank();
    expect(normalizeContact(out, { kind: "wall", id: 100 }, { kind: "flipper", id: 0 })).toBe(
      false,
    );
    expect(out).toEqual(blank());
  });

  it("(ball 3, ball 1) names the smaller id as the ball and the larger as the element", () => {
    const a = blank();
    const b = blank();
    normalizeContact(a, { kind: "ball", id: 3 }, { kind: "ball", id: 1 });
    normalizeContact(b, { kind: "ball", id: 1 }, { kind: "ball", id: 3 });
    expect(a).toEqual({ type: "ball-ball", ballId: 1, elementKind: "ball", elementId: 3 });
    expect(b).toEqual(a);
  });
});
