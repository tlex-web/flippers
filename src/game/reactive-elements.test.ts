import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { ballMass } from "../physics/constants";
import type { BallId, BallState, CollisionEvent, CollisionPartnerKind } from "../physics/types";
import { resolve, type ResolvedElement } from "../table/resolve";
import type { TableSpec } from "../table/spec";
import { ReactiveElements, type ReactiveWorld, type RulesGate } from "./reactive-elements";
import { BUMPER_KICK_SPEED, BUMPER_POINTS, KICKER_REARM_STEPS } from "./tuning";

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
  readonly elements: readonly ResolvedElement[] = resolve(SPEC);
  readonly balls: Ball[] = [];
  readonly impulses: ImpulseCall[] = [];
  /** Set by the test around router.dispatch(). */
  dispatching = false;
  /** Any world call made while the router was dispatching. */
  readonly callsWhileDispatching: string[] = [];

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
): CollisionEvent {
  return {
    type: elementKind === "ball" ? "ball-ball" : "ball-wall",
    ballId,
    elementKind,
    elementId,
    point: { x: 0, y: 0 },
    normalImpulse,
  };
}

interface Rig {
  readonly world: SpyWorld;
  readonly gate: SpyGate;
  /** One simulated step: dispatch this batch, then service(). */
  step(batch: CollisionEvent[]): void;
}

function makeRig(): Rig {
  const world = new SpyWorld();
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
  return { world, gate, step };
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
