import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallId, CollisionPartnerKind } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { ReactiveElements, type RulesGate } from "./reactive-elements";
import { BUMPER_KICK_SPEED, BUMPER_POINTS, KICKER_REARM_STEPS } from "./tuning";

/**
 * Phase-4 tracer (plan 04-01 Task 1) on the REAL table: a bumper contact travels
 * solver -> pooled events -> CollisionRouter -> ReactiveElements (record) ->
 * service() -> applyImpulse, and the rules gate scores exactly once per touch.
 * Composition mirrors main.ts: controllers before the first ball, the rules
 * listener before any other, service() right after dispatch() in onPostStep.
 */

/** A copied-out bus record (the pooled one is mutated next step). */
interface Seen {
  readonly step: number;
  readonly elementKind: CollisionPartnerKind;
  readonly elementId: number;
  readonly normalImpulse: number;
}

/** Always-live test gate that sums what it is awarded. */
class SumGate implements RulesGate {
  score = 0;
  isLive(): boolean {
    return true;
  }
  award(points: number): void {
    this.score += points;
  }
}

interface Rig {
  readonly world: PlanckWorld;
  readonly gate: SumGate;
  readonly seen: Seen[];
  run(n: number): void;
  steps(): number;
}

function makeRig(withRules: boolean): Rig {
  const world = new PlanckWorld();
  // Both bats brake-held at motor 0 before the first ball (main.ts order).
  new FlipperController(world);
  const router = new CollisionRouter(world);
  const gate = new SumGate();
  const reactive = withRules ? new ReactiveElements(world, router, gate) : null;
  const seen: Seen[] = [];
  let step = 0;
  router.register((e) => {
    seen.push({
      step,
      elementKind: e.elementKind,
      elementId: e.elementId,
      normalImpulse: e.normalImpulse,
    });
  });
  const loop = new FixedStepLoop(world);
  const onPostStep = (): void => {
    router.dispatch();
    if (reactive) reactive.service();
    step++;
  };
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) loop.advance(FIXED_DT * 1000, undefined, onPostStep);
  };
  return { world, gate, seen, run, steps: () => step };
}

const TWO_SECONDS = Math.round(2 / FIXED_DT);
const FOUR_SECONDS = Math.round(4 / FIXED_DT);

function bumperCenter(world: PlanckWorld, id: number): { x: number; y: number } {
  const c = world.getElements().find((el) => el.id === id)?.circle;
  if (!c) throw new Error(`bumper ${id} missing`);
  return c.center;
}

/** Drop a ball onto bumper 202 from 1 m above, slightly right of center. */
function dropOnLowerBumper(rig: Rig): BallId {
  const c = bumperCenter(rig.world, 202);
  return rig.world.addBall({ x: c.x + 0.05, y: c.y - 1.0 });
}

/** Ball velocity along normalize(ball - bumper center). */
function outwardSpeed(rig: Rig, ballId: BallId, bumperId: number): number {
  const b = rig.world.getBalls().find((x) => x.id === ballId);
  if (!b) throw new Error("ball missing");
  const c = bumperCenter(rig.world, bumperId);
  const dx = b.x - c.x;
  const dy = b.y - c.y;
  const len = Math.hypot(dx, dy);
  return (b.vx * dx + b.vy * dy) / len;
}

const isTouch202 = (e: Seen): boolean =>
  e.elementKind === "bumper" && e.elementId === 202 && e.normalImpulse > 0;

/** Step until the first bumper-202 touch is delivered; returns false on timeout. */
function runToFirstTouch(rig: Rig): boolean {
  for (let i = 0; i < TWO_SECONDS; i++) {
    rig.run(1);
    if (rig.seen.some(isTouch202)) return true;
  }
  return false;
}

describe("bumper rule on the real table (ELEM-01 tracer)", () => {
  it("the first touch on bumper 202 scores BUMPER_POINTS exactly once, despite the duplicate event", () => {
    const rig = makeRig(true);
    dropOnLowerBumper(rig);
    expect(runToFirstTouch(rig)).toBe(true);
    // At the end of the trigger step: exactly one award.
    expect(rig.gate.score).toBe(BUMPER_POINTS);
    // On this table the zero-impulse TOI duplicate lands one step later; it is
    // delivered, and it still scores nothing.
    const triggerStep = rig.seen.find(isTouch202)?.step ?? -1;
    rig.run(1);
    const duplicate = rig.seen.find(
      (e) => e.elementId === 202 && e.step === triggerStep + 1 && e.normalImpulse === 0,
    );
    expect(duplicate).toBeDefined();
    expect(rig.gate.score).toBe(BUMPER_POINTS);
  });

  it("one step after the trigger the ball leaves along the outward normal at the kick speed", () => {
    const rig = makeRig(true);
    const ballId = dropOnLowerBumper(rig);
    expect(runToFirstTouch(rig)).toBe(true);
    rig.run(1);
    expect(outwardSpeed(rig, ballId, 202)).toBeGreaterThanOrEqual(BUMPER_KICK_SPEED - 0.25);
  });

  it("control: without the rules, restitution alone is a weak bounce", () => {
    const rig = makeRig(false);
    const ballId = dropOnLowerBumper(rig);
    expect(runToFirstTouch(rig)).toBe(true);
    rig.run(1);
    expect(outwardSpeed(rig, ballId, 202)).toBeLessThan(BUMPER_KICK_SPEED / 2);
    expect(rig.gate.score).toBe(0);
  });

  it("over 4 s the score equals BUMPER_POINTS times the cooldown-predicted trigger count", () => {
    const rig = makeRig(true);
    dropOnLowerBumper(rig);
    rig.run(FOUR_SECONDS);
    expect(rig.steps()).toBe(FOUR_SECONDS);

    // Replay the recorded bumper events through the KICKER_REARM_STEPS rule.
    const armedAt = new Map<number, number>();
    let triggers = 0;
    for (const e of rig.seen) {
      if (e.elementKind !== "bumper" || !(e.normalImpulse > 0)) continue;
      const armed = armedAt.get(e.elementId) ?? 0;
      if (e.step < armed) continue;
      armedAt.set(e.elementId, e.step + KICKER_REARM_STEPS);
      triggers++;
    }
    expect(rig.gate.score).toBeGreaterThan(0);
    expect(rig.gate.score).toBe(BUMPER_POINTS * triggers);
  });
});
