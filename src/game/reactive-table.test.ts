import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallId, CollisionPartnerKind } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { deriveKickFace, ReactiveElements, type KickFace, type RulesGate } from "./reactive-elements";
import {
  BUMPER_KICK_SPEED,
  BUMPER_POINTS,
  KICKER_REARM_STEPS,
  ROLLOVER_POINTS,
  SLING_KICK_SPEED,
  SLING_MIN_IMPULSE,
  SLING_POINTS,
} from "./tuning";

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

/** One award, tagged with the index of the bus event being dispatched. */
interface Award {
  readonly eventIndex: number;
  readonly points: number;
}

/**
 * Always-live test gate that sums what it is awarded. The rules listener is
 * registered before the recording listener, so at award time `cursor()` (the
 * recorded-event count) is the index the triggering event is about to take:
 * every award is attributable to the element that caused it.
 */
class SumGate implements RulesGate {
  score = 0;
  readonly awards: Award[] = [];
  constructor(private readonly cursor: () => number) {}
  isLive(): boolean {
    return true;
  }
  award(points: number): void {
    this.score += points;
    this.awards.push({ eventIndex: this.cursor(), points });
  }
}

interface Rig {
  readonly world: PlanckWorld;
  readonly gate: SumGate;
  readonly reactive: ReactiveElements | null;
  readonly seen: Seen[];
  run(n: number): void;
  steps(): number;
}

function makeRig(withRules: boolean): Rig {
  const world = new PlanckWorld();
  // Both bats brake-held at motor 0 before the first ball (main.ts order).
  new FlipperController(world);
  const router = new CollisionRouter(world);
  const seen: Seen[] = [];
  const gate = new SumGate(() => seen.length);
  const reactive = withRules ? new ReactiveElements(world, router, gate) : null;
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
  return { world, gate, reactive, seen, run, steps: () => step };
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

  it("over 4 s the bumper score equals BUMPER_POINTS times the cooldown-predicted trigger count", () => {
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
    // The ball also reaches slings and lanes (04-03), so attribute each award
    // to the element whose event triggered it and count the bumper ones.
    let bumperScore = 0;
    for (const a of rig.gate.awards) {
      if (rig.seen[a.eventIndex]?.elementKind === "bumper") bumperScore += a.points;
    }
    expect(triggers).toBeGreaterThan(0);
    expect(bumperScore).toBe(BUMPER_POINTS * triggers);
  });
});

/** A slingshot's kick face, read through the one resolve. */
function slingFace(world: PlanckWorld, id: number): KickFace {
  const el = world.getElements().find((x) => x.id === id);
  const face = el ? deriveKickFace(el) : null;
  if (!face) throw new Error(`slingshot ${id} has no kick face`);
  return face;
}

const ONE_SECOND = Math.round(1 / FIXED_DT);

/** Distance out from the face midpoint the strike starts at (m). */
const SLING_STRIKE_OFFSET = 0.35;
/** Strike speed straight at the face (m/s). */
const SLING_STRIKE_SPEED = 2;

interface SlingStrike {
  readonly rig: Rig;
  readonly ballId: BallId;
  readonly face: KickFace;
}

/**
 * Throw a ball straight at sling `id`'s rubber face from SLING_STRIKE_OFFSET out
 * along its normal, and step until the first qualifying sling event arrives.
 */
function strikeSling(id: number): SlingStrike {
  const rig = makeRig(true);
  const face = slingFace(rig.world, id);
  const mx = (face.ax + face.bx) / 2;
  const my = (face.ay + face.by) / 2;
  const ballId = rig.world.addBall({
    x: mx + SLING_STRIKE_OFFSET * face.nx,
    y: my + SLING_STRIKE_OFFSET * face.ny,
    vx: -SLING_STRIKE_SPEED * face.nx,
    vy: -SLING_STRIKE_SPEED * face.ny,
  });
  const isHit = (e: Seen): boolean =>
    e.elementKind === "slingshot" && e.elementId === id && e.normalImpulse >= SLING_MIN_IMPULSE;
  for (let i = 0; i < ONE_SECOND; i++) {
    rig.run(1);
    if (rig.seen.some(isHit)) return { rig, ballId, face };
  }
  throw new Error(`no qualifying slingshot-${id} event within 1 s`);
}

/** Ball velocity along the face normal, plus its raw components. */
function slingExit(s: SlingStrike): { vn: number; vx: number; vy: number } {
  const b = s.rig.world.getBalls().find((x) => x.id === s.ballId);
  if (!b) throw new Error("ball missing");
  return { vn: b.vx * s.face.nx + b.vy * s.face.ny, vx: b.vx, vy: b.vy };
}

describe("slingshot rule on the real table (ELEM-02 tracer)", () => {
  it("the left sling (300) face normal points out to the field and up-table", () => {
    const rig = makeRig(true);
    const f = slingFace(rig.world, 300);
    expect(f.nx).toBeCloseTo(0.9487, 3);
    expect(f.ny).toBeCloseTo(-0.3162, 3);
  });

  it("a strike on sling 300 scores SLING_POINTS and kicks out along the face normal", () => {
    const s = strikeSling(300);
    expect(s.rig.gate.score).toBe(SLING_POINTS);
    s.rig.run(1);
    const out = slingExit(s);
    expect(out.vn).toBeGreaterThanOrEqual(SLING_KICK_SPEED - 0.25);
    expect(out.vx).toBeGreaterThan(0);
    expect(out.vy).toBeLessThan(0);
  });

  it("a strike on sling 301 (the mirror) scores SLING_POINTS and kicks out to the left", () => {
    const s = strikeSling(301);
    expect(s.rig.gate.score).toBe(SLING_POINTS);
    s.rig.run(1);
    const out = slingExit(s);
    expect(out.vn).toBeGreaterThanOrEqual(SLING_KICK_SPEED - 0.25);
    expect(out.vx).toBeLessThan(0);
    expect(out.vy).toBeLessThan(0);
  });
});

describe("rollover rule on the real table (ELEM-03)", () => {
  it("a ball falling through rollover 401 scores ROLLOVER_POINTS on the delivering step and lights it", () => {
    const rig = makeRig(true);
    rig.world.addBall({ x: 1.45, y: 0.55 });
    const isPass = (e: Seen): boolean => e.elementKind === "rollover" && e.elementId === 401;
    let before = 0;
    let found = false;
    for (let i = 0; i < TWO_SECONDS && !found; i++) {
      before = rig.gate.score;
      rig.run(1);
      found = rig.seen.some(isPass);
    }
    expect(found).toBe(true);
    expect(rig.gate.score - before).toBe(ROLLOVER_POINTS);
    expect(rig.reactive?.isLit(401)).toBe(true);
  });
});
