import { describe, expect, it } from "vitest";

import { sweptEscaped } from "../harness/containment";
import { BALL_RADIUS_M, FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { Vec2 } from "../physics/types";
import {
  BUMPER_RADIUS_M,
  DRAIN_Y,
  HEIGHT_M,
  PLAYFIELD_CENTER_X,
  PLUNGER_REST,
  PLUNGER_ZONE,
  TABLE_SPEC,
  WIDTH_M,
  mirrorX,
  type MountSpec,
} from "./spec";

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
