import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { ballMass } from "../physics/constants";
import type { BallId, BallState, CollisionEvent, CollisionPartnerKind } from "../physics/types";
import { resolve, type ResolvedElement } from "../table/resolve";
import { TABLE_SPEC, type TableSpec } from "../table/spec";
import {
  deriveKickFace,
  ReactiveElements,
  type ReactiveWorld,
  type RulesGate,
} from "./reactive-elements";
import {
  BUMPER_KICK_SPEED,
  BUMPER_POINTS,
  INLANE_POINTS,
  KICKER_REARM_STEPS,
  ROLLOVER_BANK_BONUS,
  ROLLOVER_POINTS,
  SENSOR_REARM_STEPS,
  SLING_KICK_SPEED,
  SLING_POINTS,
} from "./tuning";

/**
 * Contract proof for the bumper rule (plan 04-01 Task 2) against a spy world:
 * scripted CollisionEvent batches go through a REAL CollisionRouter, and each
 * simulated step is router.dispatch() then reactive.service(), as in main.ts.
 */

const BALL_R = 0.2;
const BUMPER_R = 0.22;

/** Tiny inline table: three bumpers and one wall. */
const SPEC: TableSpec = [
  { id: 200, kind: "bumper", center: { x: 1, y: 1 }, radius: BUMPER_R },
  { id: 201, kind: "bumper", center: { x: 3, y: 1 }, radius: BUMPER_R },
  { id: 202, kind: "bumper", center: { x: 1, y: 3 }, radius: BUMPER_R },
  {
    id: 100,
    kind: "wall",
    path: [
      { x: 0, y: 5 },
      { x: 4, y: 5 },
    ],
  },
];

interface Ball {
  id: BallId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
}

interface ImpulseCall {
  readonly ballId: BallId;
  readonly ix: number;
  readonly iy: number;
}

/** Spy world: scripted balls, recorded impulses, and a dispatching flag. */
class SpyWorld implements ReactiveWorld {
  readonly elements: readonly ResolvedElement[];
  readonly balls: Ball[] = [];
  readonly impulses: ImpulseCall[] = [];
  /** Set by the test around router.dispatch(). */
  dispatching = false;
  /** Any world call made while the router was dispatching. */
  readonly callsWhileDispatching: string[] = [];

  constructor(spec: TableSpec = SPEC) {
    this.elements = resolve(spec);
  }

  addBall(id: BallId, x: number, y: number, vx = 0, vy = 0): void {
    this.balls.push({ id, x, y, vx, vy, radius: BALL_R, angle: 0 });
  }

  getElements(): readonly ResolvedElement[] {
    if (this.dispatching) this.callsWhileDispatching.push("getElements");
    return this.elements;
  }
  getBalls(): readonly BallState[] {
    if (this.dispatching) this.callsWhileDispatching.push("getBalls");
    return this.balls;
  }
  applyImpulse(ballId: BallId, ix: number, iy: number): void {
    if (this.dispatching) this.callsWhileDispatching.push("applyImpulse");
    this.impulses.push({ ballId, ix, iy });
  }
}

/** Test gate: switchable liveness, records every award. */
class SpyGate implements RulesGate {
  live = true;
  readonly awards: number[] = [];
  isLive(): boolean {
    return this.live;
  }
  award(points: number): void {
    this.awards.push(points);
  }
}

function ev(
  elementKind: CollisionPartnerKind,
  elementId: number,
  normalImpulse: number,
  ballId: BallId = 0,
  x = 0,
  y = 0,
): CollisionEvent {
  return {
    type: elementKind === "ball" ? "ball-ball" : "ball-wall",
    ballId,
    elementKind,
    elementId,
    point: { x, y },
    normalImpulse,
  };
}

interface Rig {
  readonly world: SpyWorld;
  readonly gate: SpyGate;
  readonly reactive: ReactiveElements;
  /** One simulated step: dispatch this batch, then service(). */
  step(batch: CollisionEvent[]): void;
}

function makeRig(spec: TableSpec = SPEC): Rig {
  const world = new SpyWorld(spec);
  const gate = new SpyGate();
  let pending: CollisionEvent[] = [];
  const router = new CollisionRouter({
    drainEvents(): CollisionEvent[] {
      const out = pending;
      pending = [];
      return out;
    },
  });
  const reactive = new ReactiveElements(world, router, gate);
  const step = (batch: CollisionEvent[]): void => {
    pending = batch;
    world.dispatching = true;
    router.dispatch();
    world.dispatching = false;
    reactive.service();
  };
  return { world, gate, reactive, step };
}

describe("ReactiveElements bumper rule (ELEM-01)", () => {
  it("a positive event plus its zero-impulse duplicate in one batch triggers once", () => {
    const rig = makeRig();
    rig.world.addBall(0, 1, 0.5);
    rig.step([ev("bumper", 200, 0.0048), ev("bumper", 200, 0)]);
    expect(rig.gate.awards).toEqual([BUMPER_POINTS]);
    expect(rig.world.impulses).toHaveLength(1);
  });

  it("a lone zero-impulse bumper event awards nothing and kicks nothing", () => {
    const rig = makeRig();
    rig.world.addBall(0, 1, 0.5);
    rig.step([ev("bumper", 200, 0)]);
    expect(rig.gate.awards).toHaveLength(0);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("30 consecutive touching steps trigger ceil(30 / KICKER_REARM_STEPS) times", () => {
    const rig = makeRig();
    rig.world.addBall(0, 1, 0.5);
    for (let i = 0; i < 30; i++) rig.step([ev("bumper", 200, 0.0048)]);
    const expected = Math.ceil(30 / KICKER_REARM_STEPS);
    expect(rig.gate.awards).toHaveLength(expected);
    expect(rig.world.impulses).toHaveLength(expected);
  });

  it("kick law: raises the outward speed to BUMPER_KICK_SPEED and keeps the tangential velocity", () => {
    const rig = makeRig();
    // Bumper 200 at (1, 1); ball straight above it: outward normal (0, -1).
    rig.world.addBall(0, 1, 0.5, 0.3, 1.0);
    rig.step([ev("bumper", 200, 0.0048)]);
    expect(rig.world.impulses).toHaveLength(1);
    const call = rig.world.impulses[0];
    if (!call) throw new Error("no impulse");
    expect(call.ballId).toBe(0);
    // vn = v . n = -1.0, so the impulse is m * (target - vn) along n.
    expect(call.ix).toBeCloseTo(0, 12);
    expect(call.iy).toBeCloseTo(-ballMass(BALL_R) * (BUMPER_KICK_SPEED + 1.0), 12);
  });

  it("a ball already leaving faster than the target scores but is not slowed", () => {
    const rig = makeRig();
    rig.world.addBall(0, 1, 0.5, 0, -7);
    rig.step([ev("bumper", 200, 0.0048)]);
    expect(rig.gate.awards).toEqual([BUMPER_POINTS]);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("while not live: no award, no kick, and no cooldown armed", () => {
    const rig = makeRig();
    rig.world.addBall(0, 1, 0.5);
    rig.gate.live = false;
    rig.step([ev("bumper", 200, 0.0048)]);
    expect(rig.gate.awards).toHaveLength(0);
    expect(rig.world.impulses).toHaveLength(0);
    // Turned live: a contact on the very next step triggers.
    rig.gate.live = true;
    rig.step([ev("bumper", 200, 0.0048)]);
    expect(rig.gate.awards).toEqual([BUMPER_POINTS]);
    expect(rig.world.impulses).toHaveLength(1);
  });

  it("never touches the world while the router is dispatching; kicks land in service()", () => {
    const rig = makeRig();
    rig.world.addBall(0, 1, 0.5);
    rig.world.addBall(1, 1, 3.5);
    for (let i = 0; i < 20; i++) {
      rig.step([ev("bumper", 200, 0.0048, 0), ev("bumper", 202, 0.0048, 1)]);
    }
    expect(rig.world.impulses.length).toBeGreaterThan(0);
    expect(rig.world.callsWhileDispatching).toEqual([]);
  });

  it("a pending kick whose ball is gone applies nothing and does not throw", () => {
    const rig = makeRig();
    rig.world.addBall(0, 1, 0.5);
    expect(() => rig.step([ev("bumper", 200, 0.0048, 99)])).not.toThrow();
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("wall, drain, flipper and ball events never award", () => {
    const rig = makeRig();
    rig.world.addBall(0, 1, 0.5);
    rig.step([
      ev("wall", 100, 0.5),
      ev("wall", 200, 0.5),
      ev("drain", 600, 0),
      ev("flipper", 0, 0.5),
      ev("ball", 1, 0.5),
    ]);
    expect(rig.gate.awards).toHaveLength(0);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("bumpers 200 and 202 hit in the same step both trigger (per-element cooldowns)", () => {
    const rig = makeRig();
    rig.world.addBall(0, 1, 0.5);
    rig.world.addBall(1, 1, 3.5);
    rig.step([ev("bumper", 200, 0.0048, 0), ev("bumper", 202, 0.0048, 1)]);
    expect(rig.gate.awards).toEqual([BUMPER_POINTS, BUMPER_POINTS]);
    expect(rig.world.impulses.map((c) => c.ballId).sort()).toEqual([0, 1]);
  });
});

/** The real table's resolved elements, for the geometry-derived rules. */
const TABLE = resolve(TABLE_SPEC);

function tableElement(id: number): ResolvedElement {
  const el = TABLE.find((x) => x.id === id);
  if (!el) throw new Error(`element ${id} missing`);
  return el;
}

describe("slingshot kick face (ELEM-02 geometry)", () => {
  it("the face of sling 300 is its hypotenuse, normal out to the field and up-table", () => {
    const f = deriveKickFace(tableElement(300));
    if (!f) throw new Error("no face");
    // The hypotenuse, in whichever direction the loop closes it.
    const ends = [`${f.ax},${f.ay}`, `${f.bx},${f.by}`].sort();
    expect(ends).toEqual(["0.86,4.2", "1.16,5.1"]);
    expect(f.nx).toBeCloseTo(0.9487, 3);
    expect(f.ny).toBeCloseTo(-0.3162, 3);
  });

  it("sling 301 is the mirror: normal (-0.9487, -0.3162)", () => {
    const f = deriveKickFace(tableElement(301));
    if (!f) throw new Error("no face");
    expect(f.nx).toBeCloseTo(-0.9487, 3);
    expect(f.ny).toBeCloseTo(-0.3162, 3);
    expect(Math.hypot(f.ax - f.bx, f.ay - f.by)).toBeCloseTo(Math.hypot(0.3, 0.9), 9);
  });

  it("an element with no segment has no face", () => {
    expect(deriveKickFace(tableElement(200))).toBeNull();
  });
});

describe("ReactiveElements slingshot filter (ELEM-02)", () => {
  it("a contact on the passive vertical face never kicks or scores", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.world.addBall(0, 0.66, 4.6);
    rig.step([ev("slingshot", 300, 0.05, 0, 0.86, 4.6)]);
    expect(rig.gate.awards).toHaveLength(0);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("a rolling contact on the face (0.0015) never kicks or scores", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.42);
    rig.step([ev("slingshot", 300, 0.0015, 0, 0.963, 4.479)]);
    expect(rig.gate.awards).toHaveLength(0);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("a face strike (0.0393) scores SLING_POINTS and kicks once along the face normal", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.42);
    rig.step([ev("slingshot", 300, 0.0393, 0, 0.963, 4.479)]);
    expect(rig.gate.awards).toEqual([SLING_POINTS]);
    expect(rig.world.impulses).toHaveLength(1);
    const call = rig.world.impulses[0];
    const f = deriveKickFace(tableElement(300));
    if (!call || !f) throw new Error("no impulse");
    // Ball at rest: vn = 0, so the impulse is m * SLING_KICK_SPEED along n.
    const j = ballMass(BALL_R) * SLING_KICK_SPEED;
    expect(call.ix).toBeCloseTo(j * f.nx, 12);
    expect(call.iy).toBeCloseTo(j * f.ny, 12);
  });
});

describe("ReactiveElements rollovers and inlanes (ELEM-03)", () => {
  it("a rollover pass scores ROLLOVER_POINTS and lights it; re-arms after SENSOR_REARM_STEPS", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.step([ev("rollover", 400, 0)]); // step 0
    expect(rig.gate.awards).toEqual([ROLLOVER_POINTS]);
    expect(rig.reactive.isLit(400)).toBe(true);
    for (let i = 1; i < SENSOR_REARM_STEPS - 1; i++) rig.step([]);
    rig.step([ev("rollover", 400, 0)]); // step SENSOR_REARM_STEPS - 1: still cooling
    expect(rig.gate.awards).toEqual([ROLLOVER_POINTS]);
    rig.step([ev("rollover", 400, 0)]); // step SENSOR_REARM_STEPS: re-armed
    expect(rig.gate.awards).toEqual([ROLLOVER_POINTS, ROLLOVER_POINTS]);
    expect(rig.reactive.isLit(400)).toBe(true);
  });

  it("lighting all three rollovers (any order) pays the bank bonus and resets them", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.step([ev("rollover", 402, 0)]);
    rig.step([ev("rollover", 400, 0)]);
    expect(rig.reactive.isLit(402)).toBe(true);
    expect(rig.reactive.isLit(400)).toBe(true);
    expect(rig.reactive.isLit(401)).toBe(false);
    rig.step([ev("rollover", 401, 0)]);
    const total = rig.gate.awards.reduce((a, b) => a + b, 0);
    expect(total).toBe(3 * ROLLOVER_POINTS + ROLLOVER_BANK_BONUS);
    expect(rig.reactive.isLit(400)).toBe(false);
    expect(rig.reactive.isLit(401)).toBe(false);
    expect(rig.reactive.isLit(402)).toBe(false);
  });

  it("an inlane pass scores INLANE_POINTS and lights nothing", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.step([ev("lane", 500, 0)]);
    expect(rig.gate.awards).toEqual([INLANE_POINTS]);
    expect(rig.reactive.isLit(500)).toBe(false);
  });

  it("while not live, rollovers and inlanes award nothing, light nothing and arm nothing", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.gate.live = false;
    rig.step([ev("rollover", 400, 0), ev("lane", 501, 0)]);
    expect(rig.gate.awards).toHaveLength(0);
    expect(rig.reactive.isLit(400)).toBe(false);
    rig.gate.live = true;
    rig.step([ev("rollover", 400, 0), ev("lane", 501, 0)]);
    expect(rig.gate.awards).toEqual([ROLLOVER_POINTS, INLANE_POINTS]);
  });

  it("resetLights() turns every lit rollover off; an unknown id is never lit", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.step([ev("rollover", 400, 0), ev("rollover", 401, 0)]);
    expect(rig.reactive.isLit(400)).toBe(true);
    expect(rig.reactive.isLit(401)).toBe(true);
    rig.reactive.resetLights();
    expect(rig.reactive.isLit(400)).toBe(false);
    expect(rig.reactive.isLit(401)).toBe(false);
    expect(rig.reactive.isLit(9999)).toBe(false);
  });

  it("a drain event awards nothing", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.step([ev("drain", 600, 0)]);
    expect(rig.gate.awards).toHaveLength(0);
    expect(rig.world.impulses).toHaveLength(0);
  });
});
