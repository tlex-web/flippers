import { describe, expect, it, vi } from "vitest";

import { sweptEscaped } from "../harness/containment";
import { mulberry32 } from "../harness/prng";
import {
  BALL_RADIUS_M,
  FIXED_DT,
  FLIPPER_LENGTH_M,
  FLIPPER_TIP_RADIUS_M,
} from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { FlipperState, Segment, Vec2 } from "../physics/types";
import { resolve } from "./resolve";
import {
  BUMPER_RADIUS_M,
  DRAIN_Y,
  HEIGHT_M,
  OPEN_FIELD_REGION,
  PLAYFIELD_CENTER_X,
  PLUNGER_REST,
  PLUNGER_ZONE,
  TABLE_SPEC,
  WIDTH_M,
  mirrorPath,
  mirrorX,
  type ElementKind,
  type MountSpec,
} from "./spec";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * Real-table smoke proof (03-01): the world built from `TABLE_SPEC` has its two
 * spec-mounted flippers, keeps a dropped ball inside the walls, parks a ball on
 * the plunger, and exposes only solid geometry as its containment boundary.
 * Node env, no DOM; reads the world through the engine-agnostic interface.
 */

/** Sandbox drop point (mirrors BALL_SPAWN in src/sandbox/main.ts). */
const DROP_POINT: Vec2 = { x: PLAYFIELD_CENTER_X + 0.05, y: 1.4 };

function mounts(): MountSpec[] {
  const out: MountSpec[] = [];
  for (const el of TABLE_SPEC) if ("pivot" in el) out.push(el);
  return out;
}

function makeTableWorld(): PlanckWorld {
  const world = new PlanckWorld({ table: TABLE_SPEC });
  // Freeze both bats (the controller's resting == motor 0 invariant) before any
  // ball exists, exactly as the sandbox does.
  for (const f of world.getFlippers()) world.setFlipperMotor(f.id, 0);
  return world;
}

describe("TABLE_SPEC world", () => {
  it("mounts exactly two flippers at the spec pivots, right mirrored from left", () => {
    const world = makeTableWorld();
    const flippers = world.getFlippers();
    expect(flippers).toHaveLength(2);
    const specMounts = mounts();
    for (const m of specMounts) {
      const f = flippers.find((x) => x.id === m.id);
      expect(f).toBeDefined();
      expect(f?.pivotX).toBe(m.pivot.x);
      expect(f?.pivotY).toBe(m.pivot.y);
    }
    const left = specMounts.find((m) => !m.mirror);
    const right = specMounts.find((m) => m.mirror);
    expect(left && right).toBeTruthy();
    if (left && right) expect(right.pivot).toEqual(mirrorX(left.pivot));
  });

  it("keeps a ball dropped at the sandbox feed point inside the walls for 6 s", () => {
    const world = makeTableWorld();
    const id = world.addBall(DROP_POINT);
    const walls = world.getBoundarySegments();
    let prev: Vec2 = { x: DROP_POINT.x, y: DROP_POINT.y };
    const steps = Math.round(6 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      world.step(FIXED_DT);
      const b = world.getBalls().find((x) => x.id === id);
      expect(b).toBeDefined();
      if (!b) return;
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      const next: Vec2 = { x: b.x, y: b.y };
      if (sweptEscaped(prev, next, BALL_RADIUS_M - 0.05, walls)) {
        throw new Error(
          `ball escaped at step ${i}: (${prev.x},${prev.y}) -> (${next.x},${next.y})`,
        );
      }
      prev = next;
    }
  });

  it("parks a ball placed at PLUNGER_REST inside PLUNGER_ZONE", () => {
    const world = makeTableWorld();
    const id = world.addBall(PLUNGER_REST);
    const steps = Math.round(2 / FIXED_DT);
    for (let i = 0; i < steps; i++) world.step(FIXED_DT);
    const b = world.getBalls().find((x) => x.id === id);
    expect(b).toBeDefined();
    if (!b) return;
    expect(b.x).toBeGreaterThanOrEqual(PLUNGER_ZONE.minX);
    expect(b.x).toBeLessThanOrEqual(PLUNGER_ZONE.maxX);
    expect(b.y).toBeGreaterThanOrEqual(PLUNGER_ZONE.minY);
    expect(b.y).toBeLessThanOrEqual(PLUNGER_ZONE.maxY);
  });

  it("excludes the drain sensor from the boundary and keeps every endpoint in bounds", () => {
    const world = makeTableWorld();
    const walls = world.getBoundarySegments();
    expect(walls.length).toBeGreaterThan(0);
    // The drain sensor is the only horizontal line on DRAIN_Y; no solid
    // boundary segment may lie along it.
    expect(TABLE_SPEC.some((el) => el.kind === "drain")).toBe(true);
    for (const s of walls) {
      expect(s.a.y === DRAIN_Y && s.b.y === DRAIN_Y).toBe(false);
    }
    for (const s of walls) {
      for (const p of [s.a, s.b]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(WIDTH_M);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(HEIGHT_M);
      }
    }
  });

  it("has unique ids and exactly two flipper mounts", () => {
    const ids = TABLE_SPEC.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(mounts()).toHaveLength(2);
  });
});

/**
 * Default world (03-04, D-05): a `PlanckWorld` built with no options is our
 * original table, not the throwaway proof rig. Proofs that need the rig name
 * `PROOF_BOX_SPEC` explicitly.
 */
describe("default world", () => {
  it("a no-options PlanckWorld is TABLE_SPEC with its two spec-placed flippers", () => {
    const world = new PlanckWorld();
    expect(world.getElements().some((el) => el.kind === "chute")).toBe(true);
    const flippers = world.getFlippers();
    expect(flippers).toHaveLength(2);
    const specMounts = mounts();
    expect(specMounts).toHaveLength(2);
    for (const m of specMounts) {
      const f = flippers.find((x) => x.id === m.id);
      expect(f).toBeDefined();
      expect(f?.pivotX).toBe(m.pivot.x);
      expect(f?.pivotY).toBe(m.pivot.y);
    }
  });
});

/**
 * One-resolve identity proof (SC#4 structural, D-01/D-02): the containment
 * boundary is not a second copy of the table geometry, it is the solid subset
 * of the very element list the colliders were built from and the renderer
 * draws, checked by object reference.
 */
describe("getElements() / getBoundarySegments() identity", () => {
  it("every solid element segment appears by reference in the boundary, and nothing else", () => {
    const world = makeTableWorld();
    const elements = world.getElements();
    const boundary = world.getBoundarySegments();
    let solidCount = 0;
    for (const el of elements) {
      if (el.sensor || el.mount) continue;
      for (const seg of el.segments) {
        expect(boundary.some((b) => b === seg)).toBe(true);
        solidCount++;
      }
    }
    expect(solidCount).toBeGreaterThan(0);
    expect(boundary.length).toBe(solidCount);
  });

  it("returns the identical element array on every call", () => {
    const world = makeTableWorld();
    expect(world.getElements()).toBe(world.getElements());
  });

  it("keeps every sensor segment out of the boundary", () => {
    const world = makeTableWorld();
    const boundary = world.getBoundarySegments();
    const sensors = world.getElements().filter((el) => el.sensor);
    expect(sensors.length).toBeGreaterThan(0);
    for (const el of sensors) {
      for (const seg of el.segments) {
        expect(boundary.some((b) => b === seg)).toBe(false);
      }
    }
  });
});

/**
 * Bumper-cluster tracer (03-02 Task 1, D-06): the three upper bumpers exist as
 * inert solid circles built through the one resolve, and a real solver contact
 * lands on the lower bumper's spec position. Events are read only through
 * `type`, `point` and `normalImpulse`, the fields that survive 03-06.
 */
describe("TABLE_SPEC bumper cluster", () => {
  it("has exactly three bumper circles of radius BUMPER_RADIUS_M", () => {
    const world = makeTableWorld();
    const bumpers = world.getElements().filter((el) => el.kind === "bumper");
    expect(bumpers.map((el) => el.id).sort((a, b) => a - b)).toEqual([200, 201, 202]);
    for (const el of bumpers) {
      expect(el.circle).not.toBeNull();
      expect(el.circle?.radius).toBe(BUMPER_RADIUS_M);
      expect(el.sensor).toBe(false);
    }
  });

  it("deflects a dropped ball off bumper 202's rim without adding energy", () => {
    const world = makeTableWorld();
    const bumper = world.getElements().find((el) => el.id === 202);
    const c = bumper?.circle;
    expect(c).toBeDefined();
    if (!c) return;
    const drop: Vec2 = { x: c.center.x + 0.05, y: c.center.y - 1.0 };
    const id = world.addBall(drop);
    world.drainEvents();

    let prevSpeed = 0;
    let contactStep = -1;
    let speedBefore = 0;
    const steps = Math.round(2 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      world.step(FIXED_DT);
      const b = world.getBalls().find((x) => x.id === id);
      if (!b) throw new Error("ball vanished");
      const speed = Math.hypot(b.vx, b.vy);
      const events = world.drainEvents();
      if (contactStep < 0) {
        for (const e of events) {
          if (e.type !== "ball-wall" || e.normalImpulse <= 0) continue;
          const d = Math.hypot(e.point.x - c.center.x, e.point.y - c.center.y);
          // The first contact of the drop is the bumper rim, nothing else.
          expect(Math.abs(d - BUMPER_RADIUS_M)).toBeLessThanOrEqual(0.02);
          contactStep = i;
          speedBefore = prevSpeed;
          break;
        }
        if (contactStep === i) {
          // Inert (D-06): no kick, so the bounce never adds speed.
          expect(speed).toBeLessThanOrEqual(speedBefore * 1.01);
          // It deflected sideways off the rim.
          expect(Math.abs(b.vx)).toBeGreaterThan(0.1);
          return;
        }
      }
      prevSpeed = speed;
    }
    throw new Error("no bumper contact within 2 s");
  });
});

/** World-space tip of a bat: pivot + length·(cos, sin)(angle). */
function tipOf(f: FlipperState): Vec2 {
  return {
    x: f.pivotX + f.length * Math.cos(f.angle),
    y: f.pivotY + f.length * Math.sin(f.angle),
  };
}

/** Distance from point p to segment s. */
function distToSegment(p: Vec2, s: Segment): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy));
}

/**
 * Distance between segments a and b: the min of the four endpoint-to-segment
 * distances. Valid only for segments that do not cross (crossing segments are
 * at distance 0, which this does not report).
 */
function segToSegDist(a: Segment, b: Segment): number {
  return Math.min(
    distToSegment(a.a, b),
    distToSegment(a.b, b),
    distToSegment(b.a, a),
    distToSegment(b.b, a),
  );
}

/**
 * The completed original layout (03-02 Task 2, D-03/D-05/D-06): inventory of
 * standard elements, the resting inverted-V, an unobstructed flipper sweep, and
 * seeded drain flow with swept containment. All on `TABLE_SPEC`.
 */
describe("TABLE_SPEC layout", () => {
  it("(a) has the standard element inventory with unique ids; sensors are not boundary", () => {
    const world = makeTableWorld();
    const elements = world.getElements();
    const ofKind = (k: ElementKind) => elements.filter((el) => el.kind === k);
    expect(ofKind("bumper").length).toBeGreaterThanOrEqual(3);
    expect(ofKind("slingshot").length).toBeGreaterThanOrEqual(2);
    for (const el of ofKind("slingshot")) {
      expect(el.sensor).toBe(false);
      expect(el.loop).toBe(true);
    }
    expect(ofKind("rollover").length).toBeGreaterThanOrEqual(3);
    for (const el of ofKind("rollover")) expect(el.sensor).toBe(true);
    expect(ofKind("lane").length).toBeGreaterThanOrEqual(2);
    for (const el of ofKind("lane")) expect(el.sensor).toBe(true);
    expect(ofKind("drain")).toHaveLength(1);
    expect(ofKind("drain")[0]?.sensor).toBe(true);
    expect(ofKind("chute").length).toBeGreaterThanOrEqual(1);
    expect(ofKind("flipper")).toHaveLength(2);

    const ids = elements.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);

    const boundary = world.getBoundarySegments();
    for (const el of elements) {
      if (!el.sensor) continue;
      for (const seg of el.segments) expect(boundary.includes(seg)).toBe(false);
    }
  });

  it("derives right-hand twins with mirrorPath, arcs included", () => {
    const arcPath = [
      { x: 0.2, y: 1.0 },
      { center: { x: 0.6, y: 1.0 }, radius: 0.4, a0: Math.PI, a1: 1.5 * Math.PI },
      { x: 1.2, y: 0.6 },
    ];
    const [left, right] = resolve([
      { id: 1, kind: "wall", path: arcPath },
      { id: 2, kind: "wall", path: mirrorPath(arcPath) },
    ]);
    expect(left && right).toBeTruthy();
    if (!left || !right) return;
    expect(right.vertices).toHaveLength(left.vertices.length);
    left.vertices.forEach((v, i) => {
      const m = mirrorX(v);
      expect(right.vertices[i]?.x).toBeCloseTo(m.x, 12);
      expect(right.vertices[i]?.y).toBeCloseTo(m.y, 12);
    });
  });

  it("(b) rests the flippers at construction as a symmetric inverted-V wider than the ball", () => {
    const world = makeTableWorld();
    const flippers = world.getFlippers();
    expect(flippers).toHaveLength(2);
    const tips = flippers.map(tipOf);
    flippers.forEach((f, i) => {
      // y-down: the tip lies BELOW its pivot.
      expect(tips[i]?.y).toBeGreaterThan(f.pivotY);
    });
    const [t0, t1] = tips;
    if (!t0 || !t1) throw new Error("missing tip");
    expect(Math.abs(t0.y - t1.y)).toBeLessThan(1e-6);
    const gap = Math.hypot(t0.x - t1.x, t0.y - t1.y) - 2 * FLIPPER_TIP_RADIUS_M;
    expect(gap).toBeGreaterThan(2 * BALL_RADIUS_M);

    // The pose holds: one simulated second at motor 0 leaves both bats at rest.
    const before = flippers.map((f) => f.angle);
    for (let i = 0; i < 120; i++) world.step(FIXED_DT);
    world.getFlippers().forEach((f, i) => {
      expect(Math.abs(f.angle - (before[i] ?? NaN))).toBeLessThan(1e-3);
    });
  });

  it("(c) sweeps each bat through its full raise and return with nothing in the way", () => {
    const minRange = 0.9 * 2 * FLIPPER_LENGTH_M * Math.sin(Math.PI / 8);
    for (const target of [0, 1]) {
      const world = makeTableWorld();
      let minY = Infinity;
      let maxY = -Infinity;
      const sample = (): void => {
        const f = world.getFlippers().find((x) => x.id === target);
        if (!f) throw new Error(`no flipper ${target}`);
        const y = tipOf(f).y;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      };
      sample();
      world.setFlipperMotor(target, 1);
      for (let i = 0; i < 30; i++) {
        world.step(FIXED_DT);
        sample();
      }
      world.setFlipperMotor(target, -1);
      for (let i = 0; i < 40; i++) {
        world.step(FIXED_DT);
        sample();
      }
      expect(maxY - minY, `bat ${target} tip-y range`).toBeGreaterThanOrEqual(minRange);
    }
  });

  it("(e) sling clearance: every slingshot stays >= 2*BALL_RADIUS_M + 0.05 from each bat over its simulated raise and return (rule (1), WR-03)", () => {
    const minGap = 2 * BALL_RADIUS_M + 0.05;
    // Pre-06.1 slings (HEAD 5a412cf), kept so this case keeps its teeth.
    const oldLeftSling: readonly Vec2[] = [
      { x: 0.86, y: 4.2 },
      { x: 0.86, y: 4.95 },
      { x: 1.16, y: 5.1 },
    ];
    const oldSlingSegments = resolve([
      { id: 300, kind: "slingshot", path: oldLeftSling, loop: true },
      { id: 301, kind: "slingshot", path: mirrorPath(oldLeftSling), loop: true },
    ]).flatMap((el) => el.segments);

    for (const target of [0, 1]) {
      const world = makeTableWorld();
      const slingSegments = world
        .getElements()
        .filter((el) => el.kind === "slingshot")
        .flatMap((el) => el.segments);
      expect(slingSegments.length).toBeGreaterThan(0);
      let minNew = Infinity;
      let minOld = Infinity;
      const sample = (): void => {
        const f = world.getFlippers().find((x) => x.id === target);
        if (!f) throw new Error(`no flipper ${target}`);
        // Capsule axis: hinge-circle center to tip-circle center, radius halfWidth.
        const c = Math.cos(f.angle);
        const s = Math.sin(f.angle);
        const axis: Segment = {
          a: { x: f.pivotX + f.tipRadius * c, y: f.pivotY + f.tipRadius * s },
          b: {
            x: f.pivotX + (f.length - f.tipRadius) * c,
            y: f.pivotY + (f.length - f.tipRadius) * s,
          },
        };
        for (const seg of slingSegments) {
          minNew = Math.min(minNew, segToSegDist(axis, seg) - f.halfWidth);
        }
        for (const seg of oldSlingSegments) {
          minOld = Math.min(minOld, segToSegDist(axis, seg) - f.halfWidth);
        }
      };
      sample();
      // 40 raise steps include the ~2.76 deg overshoot past the raise limit.
      world.setFlipperMotor(target, 1);
      for (let i = 0; i < 40; i++) {
        world.step(FIXED_DT);
        sample();
      }
      world.setFlipperMotor(target, -1);
      for (let i = 0; i < 40; i++) {
        world.step(FIXED_DT);
        sample();
      }
      expect(minNew, `bat ${target}`).toBeGreaterThanOrEqual(minGap);
      // Teeth: the pre-fix slings break rule (1) over the same sweep.
      expect(minOld, `bat ${target} old slings`).toBeLessThan(minGap);
    }
  });

  it("(f) inlane sensors reach the funnel wall: each lane sensor's wall-side end lies within 0.02 m of its funnel wall (06.1-REVIEW WR-01)", () => {
    const elements = resolve(TABLE_SPEC);
    const byId = (id: number) => {
      const el = elements.find((e) => e.id === id);
      if (!el) throw new Error(`no element ${id}`);
      return el;
    };
    for (const [id, wallId] of [
      [500, 120],
      [501, 121],
    ] as const) {
      const sensorSegs = byId(id).segments;
      const wallSegs = byId(wallId).segments;
      expect(sensorSegs).toHaveLength(1);
      expect(wallSegs).toHaveLength(1);
      const sensor = sensorSegs[0] as Segment;
      const wall = wallSegs[0] as Segment;
      const d = Math.min(distToSegment(sensor.a, wall), distToSegment(sensor.b, wall));
      const msg = `lane ${id} wall-side end ${d.toFixed(4)} m from wall ${wallId}`;
      expect(d, msg).toBeLessThanOrEqual(0.02);
      expect(d, msg).toBeGreaterThan(0);
    }
  });

  it("(d) drains seeded open-field drops within 30 s with no trap and no escape", () => {
    const probe = makeTableWorld();
    const walls = probe.getBoundarySegments();
    const circles = probe
      .getElements()
      .flatMap((el) => (el.circle && !el.sensor ? [el.circle] : []));
    const clearance = BALL_RADIUS_M + 0.05;
    const tooClose = (p: Vec2): boolean =>
      walls.some((s) => distToSegment(p, s) < clearance) ||
      circles.some(
        (c) => Math.abs(Math.hypot(p.x - c.center.x, p.y - c.center.y) - c.radius) < clearance,
      );

    // One seeded stream for all eight drops (replay: same seed, same index).
    const SEED = 0x0302;
    const rng = mulberry32(SEED);
    const R = OPEN_FIELD_REGION;
    const maxSteps = Math.round(30 / FIXED_DT);
    for (let k = 0; k < 8; k++) {
      let drop: Vec2 | null = null;
      for (let tries = 0; tries < 1000 && !drop; tries++) {
        const p = {
          x: R.minX + rng() * (R.maxX - R.minX),
          y: R.minY + rng() * (R.maxY - R.minY),
        };
        if (!tooClose(p)) drop = p;
      }
      if (!drop) throw new Error(`seed ${SEED} ball ${k}: no admissible drop point`);
      const where = `seed ${SEED} ball ${k}, drop (${drop.x.toFixed(4)}, ${drop.y.toFixed(4)})`;

      const world = makeTableWorld();
      const id = world.addBall(drop);
      const boundary = world.getBoundarySegments();
      let prev: Vec2 = { x: drop.x, y: drop.y };
      let drained = false;
      for (let i = 0; i < maxSteps; i++) {
        world.step(FIXED_DT);
        const b = world.getBalls().find((x) => x.id === id);
        if (!b) throw new Error(`${where}: ball vanished`);
        const next: Vec2 = { x: b.x, y: b.y };
        if (sweptEscaped(prev, next, BALL_RADIUS_M - 0.05, boundary)) {
          throw new Error(`${where}: escaped at step ${i}`);
        }
        prev = next;
        if (b.y > DRAIN_Y) {
          drained = true;
          break;
        }
      }
      if (!drained) {
        throw new Error(
          `${where}: still in play after 30 s at (${prev.x.toFixed(3)}, ${prev.y.toFixed(3)})`,
        );
      }
    }
  });
});
