import { describe, it, expect, vi } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { ballMass } from "../physics/constants";
import type {
  BallId,
  BallState,
  CollisionEvent,
  CollisionPartnerKind,
  Vec2,
} from "../physics/types";
import { resolve, type ResolvedElement } from "../table/resolve";
import { mirrorPath, TABLE_SPEC, type PathNode, type TableSpec } from "../table/spec";
import {
  deriveKickFace,
  ReactiveElements,
  type ReactiveConfig,
  type ReactiveFeedback,
  type ReactiveWorld,
  type RuleHooks,
  type RulesGate,
  type SwitchKind,
} from "./reactive-elements";
import {
  BUMPER_KICK_SPEED,
  BUMPER_POINTS,
  INLANE_POINTS,
  KICKBACK_SPEED,
  KICKER_REARM_STEPS,
  ROLLOVER_BANK_BONUS,
  ROLLOVER_POINTS,
  SENSOR_REARM_STEPS,
  SLING_FACE_TOL,
  SLING_KICK_SPEED,
  SLING_MIN_IMPULSE,
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

/** One entry in the shared gate + feedback log. */
type LogEntry = readonly unknown[];

/** Test gate: switchable liveness, records every award (and logs it when given a log). */
class SpyGate implements RulesGate {
  live = true;
  readonly awards: number[] = [];
  constructor(private readonly log: LogEntry[] | null = null) {}
  isLive(): boolean {
    return this.live;
  }
  award(points: number): void {
    this.awards.push(points);
    this.log?.push(["award", points]);
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
  /** Half a step: dispatch this batch only (no service()). */
  dispatch(batch: CollisionEvent[]): void;
}

function makeRig(
  spec: TableSpec = SPEC,
  feedback?: ReactiveFeedback,
  log: LogEntry[] | null = null,
  ruleHooks?: RuleHooks,
  config?: ReactiveConfig,
): Rig {
  const world = new SpyWorld(spec);
  const gate = new SpyGate(log);
  let pending: CollisionEvent[] = [];
  const router = new CollisionRouter({
    drainEvents(): CollisionEvent[] {
      const out = pending;
      pending = [];
      return out;
    },
  });
  // Without a feedback the THREE-argument constructor is used, so every
  // Phase-4 case exercises the default (no-op) feedback path.
  // With rule hooks the FIVE-argument constructor is used (06-01), with a
  // config the SIX-argument one (06-08).
  const reactive = config
    ? new ReactiveElements(world, router, gate, feedback, ruleHooks, config)
    : ruleHooks
      ? new ReactiveElements(world, router, gate, feedback, ruleHooks)
      : feedback
        ? new ReactiveElements(world, router, gate, feedback)
        : new ReactiveElements(world, router, gate);
  const dispatch = (batch: CollisionEvent[]): void => {
    pending = batch;
    world.dispatching = true;
    router.dispatch();
    world.dispatching = false;
  };
  const step = (batch: CollisionEvent[]): void => {
    dispatch(batch);
    reactive.service();
  };
  return { world, gate, reactive, step, dispatch };
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

/** Sling 300 trimmed to t = 0.28 (06.3 D-14): its 0.266 m hypotenuse is shorter than the 0.75 m inlane edge and the 0.505 m lower face. */
const TRIMMED_LEFT_SLING: readonly Vec2[] = [
  { x: 0.86, y: 3.85 },
  { x: 0.86, y: 4.6 },
  { x: 0.944, y: 4.102 },
];

/** Resolve a TABLE_SPEC slingshot with its path swapped for `path`. */
function slingWithPath(id: number, path: readonly PathNode[]): ResolvedElement {
  const el = TABLE_SPEC.find((x) => x.id === id);
  if (!el || !("path" in el)) throw new Error(`polyline element ${id} missing`);
  const resolved = resolve([{ ...el, path }])[0];
  if (!resolved) throw new Error(`element ${id} did not resolve`);
  return resolved;
}

describe("slingshot kick face (ELEM-02 geometry)", () => {
  it("the face of sling 300 is its hypotenuse, normal out to the field and up-table", () => {
    const f = deriveKickFace(tableElement(300));
    if (!f) throw new Error("no face");
    // The hypotenuse, in whichever direction the loop closes it.
    const ends = [`${f.ax},${f.ay}`, `${f.bx},${f.by}`].sort();
    expect(ends).toEqual(["0.86,3.85", "1.16,4.75"]);
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

  it("the kick face is the named hypotenuse even where it is not the longest segment: sling 300 nx > 0, ny < 0, never the inlane edge; sling 301 mirrors it (06.3 D-09)", () => {
    expect(tableElement(300).kickFace).toBe(2);
    expect(tableElement(301).kickFace).toBe(2);

    const left = deriveKickFace(slingWithPath(300, TRIMMED_LEFT_SLING));
    if (!left) throw new Error("no face on trimmed sling 300");
    const ends = [`${left.ax},${left.ay}`, `${left.bx},${left.by}`].sort();
    expect(ends).toEqual(["0.86,3.85", "0.944,4.102"]);
    expect(left.nx).toBeGreaterThan(0);
    expect(left.ny).toBeLessThan(0);

    const right = deriveKickFace(slingWithPath(301, mirrorPath(TRIMMED_LEFT_SLING)));
    if (!right) throw new Error("no face on trimmed sling 301");
    expect(right.nx).toBeLessThan(0);
    expect(right.ny).toBeLessThan(0);
    expect(Math.hypot(right.ax - right.bx, right.ay - right.by)).toBeCloseTo(
      0.28 * Math.hypot(0.3, 0.9),
      9,
    );
  });

  it("an element with no segment has no face", () => {
    expect(deriveKickFace(tableElement(200))).toBeNull();
  });
});

describe("ReactiveElements slingshot filter (ELEM-02)", () => {
  it("a contact on the passive vertical face never kicks or scores", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.world.addBall(0, 0.66, 4.25);
    rig.step([ev("slingshot", 300, 0.05, 0, 0.86, 4.25)]);
    expect(rig.gate.awards).toHaveLength(0);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("a rolling contact on the face (0.0015) never kicks or scores", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.07);
    rig.step([ev("slingshot", 300, 0.0015, 0, 0.963, 4.129)]);
    expect(rig.gate.awards).toHaveLength(0);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("a face strike (0.0393) scores SLING_POINTS and kicks once along the face normal", () => {
    const rig = makeRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.07);
    rig.step([ev("slingshot", 300, 0.0393, 0, 0.963, 4.129)]);
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

/**
 * Spy feedback that appends to the same log as the gate, so "award, then
 * report" is one array comparison. `probe`, when set, is sampled inside every
 * call and appended to the entry (the rule state the hook observes).
 */
class SpyFeedback implements ReactiveFeedback {
  probe: (() => unknown) | null = null;
  constructor(private readonly log: LogEntry[]) {}
  onKick(kind: "bumper" | "slingshot", elementId: number, normalImpulse: number): void {
    const entry: unknown[] = ["kick", kind, elementId, normalImpulse];
    if (this.probe) entry.push(this.probe());
    this.log.push(entry);
  }
  onSensor(kind: "rollover" | "lane", elementId: number, bank: boolean): void {
    const entry: unknown[] = ["sensor", kind, elementId, bank];
    if (this.probe) entry.push(this.probe());
    this.log.push(entry);
  }
}

/** A rig whose gate and feedback share one log. */
function loggedRig(spec: TableSpec = SPEC): Rig & { log: LogEntry[]; feedback: SpyFeedback } {
  const log: LogEntry[] = [];
  const feedback = new SpyFeedback(log);
  return { ...makeRig(spec, feedback, log), log, feedback };
}

/** Feedback entries only (the gate's awards filtered out). */
function hooks(log: readonly LogEntry[]): LogEntry[] {
  return log.filter((e) => e[0] !== "award");
}

/** The real-table sling-300 face strike (see the ELEM-02 cases). */
const FACE_STRIKE = { impulse: 0.0393, x: 0.963, y: 4.129 };

describe("ReactiveElements presentation feedback (Phase 5, AUD-01/RND-03)", () => {
  it("a registered bumper hit logs the award, then onKick with the raw normalImpulse", () => {
    const rig = loggedRig();
    rig.world.addBall(0, 1, 0.5);
    rig.step([ev("bumper", 200, 0.0048)]);
    expect(rig.log).toEqual([
      ["award", BUMPER_POINTS],
      ["kick", "bumper", 200, 0.0048],
    ]);
  });

  it("a zero-impulse bumper event produces no feedback call", () => {
    const rig = loggedRig();
    rig.world.addBall(0, 1, 0.5);
    rig.step([ev("bumper", 200, 0)]);
    expect(rig.log).toEqual([]);
  });

  it("a bumper event inside the KICKER_REARM_STEPS cooldown produces no feedback call", () => {
    const rig = loggedRig();
    rig.world.addBall(0, 1, 0.5);
    rig.step([ev("bumper", 200, 0.0048)]);
    for (let i = 1; i < KICKER_REARM_STEPS; i++) rig.step([ev("bumper", 200, 0.0048)]);
    expect(hooks(rig.log)).toEqual([["kick", "bumper", 200, 0.0048]]);
    // First step past the cooldown: registered again.
    rig.step([ev("bumper", 200, 0.0031)]);
    expect(hooks(rig.log)).toEqual([
      ["kick", "bumper", 200, 0.0048],
      ["kick", "bumper", 200, 0.0031],
    ]);
  });

  it("while not live, no bumper, slingshot or sensor event produces a feedback call", () => {
    const rig = loggedRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.07);
    rig.gate.live = false;
    rig.step([
      ev("bumper", 200, 0.0048),
      ev("slingshot", 300, FACE_STRIKE.impulse, 0, FACE_STRIKE.x, FACE_STRIKE.y),
      ev("rollover", 400, 0),
      ev("lane", 500, 0),
    ]);
    expect(rig.log).toEqual([]);
  });

  it("a slingshot event below SLING_MIN_IMPULSE produces no feedback call", () => {
    const rig = loggedRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.07);
    const below = SLING_MIN_IMPULSE * 0.99;
    rig.step([ev("slingshot", 300, below, 0, FACE_STRIKE.x, FACE_STRIKE.y)]);
    expect(rig.log).toEqual([]);
  });

  it("a slingshot event farther than SLING_FACE_TOL from the kick face produces no feedback call", () => {
    const rig = loggedRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.07);
    const f = deriveKickFace(tableElement(300));
    if (!f) throw new Error("no face");
    // Midpoint of the face, pushed out along the normal just past the tolerance.
    const off = SLING_FACE_TOL * 1.2;
    const px = (f.ax + f.bx) / 2 + f.nx * off;
    const py = (f.ay + f.by) / 2 + f.ny * off;
    rig.step([ev("slingshot", 300, FACE_STRIKE.impulse, 0, px, py)]);
    expect(rig.log).toEqual([]);
  });

  it("a registered slingshot strike gives exactly one onKick(slingshot, id, impulse), after its award", () => {
    const rig = loggedRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.07);
    rig.step([ev("slingshot", 300, FACE_STRIKE.impulse, 0, FACE_STRIKE.x, FACE_STRIKE.y)]);
    expect(rig.log).toEqual([
      ["award", SLING_POINTS],
      ["kick", "slingshot", 300, FACE_STRIKE.impulse],
    ]);
  });

  it("an inlane pass gives onSensor(lane, id, false) after its award", () => {
    const rig = loggedRig(TABLE_SPEC);
    rig.step([ev("lane", 500, 0)]);
    expect(rig.log).toEqual([
      ["award", INLANE_POINTS],
      ["sensor", "lane", 500, false],
    ]);
  });

  it("rollovers: two plain passes, then the bank pass reported after the bonus with every light cleared", () => {
    const rig = loggedRig(TABLE_SPEC);
    rig.feedback.probe = () => [400, 401, 402].map((id) => rig.reactive.isLit(id));
    rig.step([ev("rollover", 400, 0)]);
    rig.step([ev("rollover", 402, 0)]);
    rig.step([ev("rollover", 401, 0)]);
    expect(rig.log).toEqual([
      ["award", ROLLOVER_POINTS],
      ["sensor", "rollover", 400, false, [true, false, false]],
      ["award", ROLLOVER_POINTS],
      ["sensor", "rollover", 402, false, [true, false, true]],
      ["award", ROLLOVER_POINTS],
      ["award", ROLLOVER_BANK_BONUS],
      ["sensor", "rollover", 401, true, [false, false, false]],
    ]);
  });

  it("a throwing onKick, caught by the real router, still leaves the kicker armed and the kick pending", () => {
    const throwing: ReactiveFeedback = {
      onKick(): void {
        throw new Error("sink failed");
      },
      onSensor(): void {
        throw new Error("sink failed");
      },
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const rig = makeRig(SPEC, throwing);
      rig.world.addBall(0, 1, 0.5);
      // dispatch() catches the throw; the same step's service() applies the kick.
      rig.step([ev("bumper", 200, 0.0048)]);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls[0]?.[0]).toBe("[bus] collision listener threw");
      expect(rig.gate.awards).toEqual([BUMPER_POINTS]);
      expect(rig.world.impulses).toHaveLength(1);
      // A second contact inside the cooldown awards and kicks nothing.
      rig.step([ev("bumper", 200, 0.0048)]);
      expect(rig.gate.awards).toEqual([BUMPER_POINTS]);
      expect(rig.world.impulses).toHaveLength(1);
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
    }
  });

  it("a ReactiveElements built with three arguments behaves as before: one award, one impulse per burst", () => {
    const rig = makeRig(SPEC);
    rig.world.addBall(0, 1, 0.5);
    rig.step([ev("bumper", 200, 0.0048), ev("bumper", 200, 0.0021), ev("bumper", 200, 0)]);
    expect(rig.gate.awards).toEqual([BUMPER_POINTS]);
    expect(rig.world.impulses).toHaveLength(1);
  });
});

/**
 * Spy rule hooks (plan 06-01, PLSH-05) appending to the same log as the gate
 * and the feedback, so "award, then switch, then feedback" is one comparison.
 * `trySave` (06-08, PLSH-07) logs each ask and answers `grant`.
 */
class SpyHooks implements RuleHooks {
  /** What trySave answers. */
  grant = false;
  /** Every ball trySave was asked about, in order. */
  readonly asked: BallId[] = [];
  constructor(private readonly log: LogEntry[]) {}
  onSwitch(kind: SwitchKind, elementId: number, bank: boolean): void {
    this.log.push(["switch", kind, elementId, bank]);
  }
  trySave(ballId: BallId): boolean {
    this.asked.push(ballId);
    this.log.push(["trySave", ballId]);
    return this.grant;
  }
}

/** A rig whose gate, feedback and rule hooks share one log. */
function hookedRig(spec: TableSpec = SPEC): Rig & { log: LogEntry[] } {
  const log: LogEntry[] = [];
  return { ...makeRig(spec, new SpyFeedback(log), log, new SpyHooks(log)), log };
}

/** Rule-hook entries only. */
function switches(log: readonly LogEntry[]): LogEntry[] {
  return log.filter((e) => e[0] === "switch");
}

describe("ReactiveElements rule hooks: the onSwitch contract (06-01, PLSH-05)", () => {
  it("a registered bumper hit calls onSwitch(bumper, id, false) once, after the award and before the feedback", () => {
    const rig = hookedRig();
    rig.world.addBall(0, 1, 0.5);
    rig.step([ev("bumper", 200, 0.0048), ev("bumper", 200, 0)]);
    expect(rig.log).toEqual([
      ["award", BUMPER_POINTS],
      ["switch", "bumper", 200, false],
      ["kick", "bumper", 200, 0.0048],
    ]);
  });

  it("a registered sling strike calls onSwitch(slingshot, id, false) after its award", () => {
    const rig = hookedRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.07);
    rig.step([ev("slingshot", 300, FACE_STRIKE.impulse, 0, FACE_STRIKE.x, FACE_STRIKE.y)]);
    expect(rig.log).toEqual([
      ["award", SLING_POINTS],
      ["switch", "slingshot", 300, false],
      ["kick", "slingshot", 300, FACE_STRIKE.impulse],
    ]);
  });

  it("a sub-threshold sling impulse and an off-face strike call nothing", () => {
    const rig = hookedRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.07);
    rig.step([ev("slingshot", 300, SLING_MIN_IMPULSE * 0.99, 0, FACE_STRIKE.x, FACE_STRIKE.y)]);
    const f = deriveKickFace(tableElement(300));
    if (!f) throw new Error("no face");
    const off = SLING_FACE_TOL * 1.2;
    const px = (f.ax + f.bx) / 2 + f.nx * off;
    const py = (f.ay + f.by) / 2 + f.ny * off;
    rig.step([ev("slingshot", 300, FACE_STRIKE.impulse, 0, px, py)]);
    expect(rig.log).toEqual([]);
  });

  it("a bumper contact inside its rearm window calls nothing", () => {
    const rig = hookedRig();
    rig.world.addBall(0, 1, 0.5);
    rig.step([ev("bumper", 200, 0.0048)]);
    for (let i = 1; i < KICKER_REARM_STEPS; i++) rig.step([ev("bumper", 200, 0.0048)]);
    expect(switches(rig.log)).toEqual([["switch", "bumper", 200, false]]);
  });

  it("a sensor pass inside SENSOR_REARM_STEPS calls nothing", () => {
    const rig = hookedRig(TABLE_SPEC);
    rig.step([ev("lane", 500, 0)]);
    for (let i = 1; i < SENSOR_REARM_STEPS; i++) rig.step([ev("lane", 500, 0)]);
    expect(switches(rig.log)).toEqual([["switch", "lane", 500, false]]);
  });

  it("any contact while the gate is not live calls nothing", () => {
    const rig = hookedRig(TABLE_SPEC);
    rig.world.addBall(0, 1.15, 4.07);
    rig.gate.live = false;
    rig.step([
      ev("bumper", 200, 0.0048),
      ev("slingshot", 300, FACE_STRIKE.impulse, 0, FACE_STRIKE.x, FACE_STRIKE.y),
      ev("rollover", 400, 0),
      ev("lane", 500, 0),
    ]);
    expect(rig.log).toEqual([]);
  });

  it("inlane 500 calls onSwitch(lane, 500, false) after its award", () => {
    const rig = hookedRig(TABLE_SPEC);
    rig.step([ev("lane", 500, 0)]);
    expect(rig.log).toEqual([
      ["award", INLANE_POINTS],
      ["switch", "lane", 500, false],
      ["sensor", "lane", 500, false],
    ]);
  });

  it("the first two rollovers pass bank false; the third lit one passes bank true after the bonus", () => {
    const rig = hookedRig(TABLE_SPEC);
    rig.step([ev("rollover", 400, 0)]);
    rig.step([ev("rollover", 402, 0)]);
    rig.step([ev("rollover", 401, 0)]);
    expect(rig.log).toEqual([
      ["award", ROLLOVER_POINTS],
      ["switch", "rollover", 400, false],
      ["sensor", "rollover", 400, false],
      ["award", ROLLOVER_POINTS],
      ["switch", "rollover", 402, false],
      ["sensor", "rollover", 402, false],
      ["award", ROLLOVER_POINTS],
      ["award", ROLLOVER_BANK_BONUS],
      ["switch", "rollover", 401, true],
      ["sensor", "rollover", 401, true],
    ]);
  });

  it("a ReactiveElements built without hooks scores exactly as one built with them", () => {
    const batches = (): CollisionEvent[][] => [
      [ev("bumper", 200, 0.0048)],
      [ev("rollover", 400, 0), ev("lane", 500, 0)],
      [ev("slingshot", 300, FACE_STRIKE.impulse, 0, FACE_STRIKE.x, FACE_STRIKE.y)],
      [ev("rollover", 401, 0)],
      [ev("rollover", 402, 0)],
    ];
    const plain = makeRig(TABLE_SPEC);
    const hooked = hookedRig(TABLE_SPEC);
    for (const rig of [plain, hooked]) {
      rig.world.addBall(0, 1.15, 4.07);
      for (const b of batches()) rig.step(b);
    }
    expect(hooked.gate.awards).toEqual(plain.gate.awards);
    expect(hooked.world.impulses).toEqual(plain.world.impulses);
    expect(plain.gate.awards.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------------- *
 * Center-post kickback gating (PLSH-07, plan 06-08 Task 2) against the spy
 * world: the post is a points-free kicker that asks the rule hooks to spend
 * the save and applies the bumper law in service() only.
 * ------------------------------------------------------------------------- */

const POST_ID = 610;
const POST_C = { x: 1, y: 5 };

/** Tiny table with one virtual post (a sensor circle) and a floor. */
const POST_SPEC: TableSpec = [
  { id: POST_ID, kind: "post", center: POST_C, radius: 0.09, sensor: true },
  {
    id: 100,
    kind: "wall",
    path: [
      { x: 0, y: 6 },
      { x: 2, y: 6 },
    ],
  },
];

/** A post overlap whose point is the ball center (as the engine emits it). */
function postEv(ballId: BallId, x: number, y: number): CollisionEvent {
  return ev("post", POST_ID, 0, ballId, x, y);
}

/** A post rig whose gate, feedback and spy hooks share one log. */
function postRig(
  grant: boolean,
  config?: ReactiveConfig,
): Rig & { log: LogEntry[]; hooks: SpyHooks } {
  const log: LogEntry[] = [];
  const spy = new SpyHooks(log);
  spy.grant = grant;
  return { ...makeRig(POST_SPEC, new SpyFeedback(log), log, spy, config), log, hooks: spy };
}

/** The bumper law expected for a ball at (x, y) moving (vx, vy) off the post. */
function expectedKick(
  x: number,
  y: number,
  vx: number,
  vy: number,
  target: number,
): { ix: number; iy: number } {
  const dx = x - POST_C.x;
  const dy = y - POST_C.y;
  const len = Math.hypot(dx, dy);
  const nx = dx / len;
  const ny = dy / len;
  const j = ballMass(BALL_R) * (target - (vx * nx + vy * ny));
  return { ix: j * nx, iy: j * ny };
}

describe("ReactiveElements center-post kickback gating (06-08, PLSH-07)", () => {
  it("live, above the center and granted: trySave is asked once and service() applies one bumper-law kick", () => {
    const rig = postRig(true);
    // Up and to the right of the post, falling onto it.
    const bx = 1.12;
    const by = 4.82;
    rig.world.addBall(3, bx, by, -0.4, 1.6);
    rig.dispatch([postEv(3, bx, by)]);
    // Recorded only: nothing reaches the world before service().
    expect(rig.world.impulses).toHaveLength(0);
    rig.reactive.service();
    expect(rig.hooks.asked).toEqual([3]);
    expect(rig.world.impulses).toHaveLength(1);
    const call = rig.world.impulses[0];
    if (!call) throw new Error("no impulse");
    const want = expectedKick(bx, by, -0.4, 1.6, KICKBACK_SPEED);
    expect(call.ballId).toBe(3);
    expect(call.ix).toBeCloseTo(want.ix, 12);
    expect(call.iy).toBeCloseTo(want.iy, 12);
    // Applying it raises the normal speed to exactly KICKBACK_SPEED.
    const len = Math.hypot(bx - POST_C.x, by - POST_C.y);
    const nx = (bx - POST_C.x) / len;
    const ny = (by - POST_C.y) / len;
    const m = ballMass(BALL_R);
    const vn = (-0.4 + call.ix / m) * nx + (1.6 + call.iy / m) * ny;
    expect(vn).toBeCloseTo(KICKBACK_SPEED, 10);
    expect(rig.world.callsWhileDispatching).toEqual([]);
  });

  it("not live: trySave is never asked and nothing is applied", () => {
    const rig = postRig(true);
    rig.world.addBall(0, 1, 4.8);
    rig.gate.live = false;
    rig.step([postEv(0, 1, 4.8)]);
    expect(rig.hooks.asked).toEqual([]);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("ball center level with the post center: trySave is never asked and nothing is applied", () => {
    const rig = postRig(true);
    rig.world.addBall(0, 1.25, POST_C.y);
    rig.step([postEv(0, 1.25, POST_C.y)]);
    expect(rig.hooks.asked).toEqual([]);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("ball center below the post center (a downward kick into the drain): never asked, nothing applied", () => {
    const rig = postRig(true);
    rig.world.addBall(0, 1.05, 5.2);
    rig.step([postEv(0, 1.05, 5.2)]);
    expect(rig.hooks.asked).toEqual([]);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("trySave false: asked once, nothing applied", () => {
    const rig = postRig(false);
    rig.world.addBall(0, 1, 4.8);
    rig.step([postEv(0, 1, 4.8)]);
    expect(rig.hooks.asked).toEqual([0]);
    expect(rig.world.impulses).toHaveLength(0);
  });

  it("the default hooks never save: a live, above-center post overlap applies nothing", () => {
    const rig = makeRig(POST_SPEC);
    rig.world.addBall(0, 1, 4.8);
    rig.step([postEv(0, 1, 4.8)]);
    expect(rig.world.impulses).toHaveLength(0);
    expect(rig.gate.awards).toEqual([]);
  });

  it("a granted post kick awards nothing and calls neither onSwitch nor the feedback", () => {
    const rig = postRig(true);
    rig.world.addBall(0, 1, 4.8);
    rig.step([postEv(0, 1, 4.8)]);
    expect(rig.world.impulses).toHaveLength(1);
    expect(rig.gate.awards).toEqual([]);
    expect(rig.log).toEqual([["trySave", 0]]);
  });

  it("config { kickbackSpeed: 4 } raises the normal speed to 4 m/s", () => {
    const rig = postRig(true, { kickbackSpeed: 4 });
    // Straight above the post, at rest: the impulse is m * 4 straight up.
    rig.world.addBall(0, 1, 4.8);
    rig.step([postEv(0, 1, 4.8)]);
    expect(rig.world.impulses).toHaveLength(1);
    const call = rig.world.impulses[0];
    if (!call) throw new Error("no impulse");
    expect(call.ix).toBeCloseTo(0, 12);
    expect(call.iy).toBeCloseTo(-ballMass(BALL_R) * 4, 12);
  });

  it("a ball already leaving faster than the target gets no impulse", () => {
    const rig = postRig(true);
    rig.world.addBall(0, 1, 4.8, 0, -(KICKBACK_SPEED + 1));
    rig.step([postEv(0, 1, 4.8)]);
    expect(rig.hooks.asked).toEqual([0]);
    expect(rig.world.impulses).toHaveLength(0);
  });
});
