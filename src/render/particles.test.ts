import { describe, it, expect } from "vitest";

import { deriveKickFace } from "../game/reactive-elements";
import { FIXED_DT } from "../physics/constants";
import { resolve, type ResolvedElement } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";
import {
  BUMPER_SPARK_LIFE_MAX,
  BUMPER_SPARK_LIFE_MIN,
  BUMPER_SPARK_SPEED_MAX,
  BUMPER_SPARK_SPEED_MIN,
  EffectsTracker,
  SLING_SPARK_LIFE_MAX,
  SLING_SPARK_LIFE_MIN,
  SLING_SPARK_SPEED_MAX,
  SLING_SPARK_SPEED_MIN,
} from "./effects";
import {
  GLINT_INLANE,
  GLINT_LIFE_STEPS,
  GLINT_ROLLOVER,
  GLINT_SKILL,
  MOTE_INLANE,
  MOTE_ROLLOVER,
  MOTE_SKILL,
  MOTE_SPEED_MAX,
  MOTE_SPEED_MIN,
  PARTICLE_CAPACITY,
  PARTICLE_DRAG_PER_S,
  PARTICLE_GRAVITY,
  ParticlePool,
  RING,
  SPARK_BUMPER,
  SPARK_SAVE,
  SPARK_SLING,
} from "./particles";

/**
 * PLSH-02 / D-19 (plan 06-12 Task 2): the impact particle pool, the bumper and
 * slingshot emitters and the photosensitivity footprint (T-6-25..27).
 *
 * Plan 06-13 Task 2 adds the reward half: sensor and skill-shot glints with
 * their motes, and the kickback save sparks off the post.
 *
 * The pool is a fixed 160-slot struct of typed arrays on the fixed-step clock
 * with its own seeded stream; the emitters live in the EffectsTracker and are
 * driven here over the resolved TABLE_SPEC so the geometry is the real table's.
 */

/** Float32 storage tolerance for values written from doubles. */
const F32 = 1e-5;
const DEG = Math.PI / 180;

const ELEMENTS: readonly ResolvedElement[] = resolve(TABLE_SPEC);

function bumper(id: number): { cx: number; cy: number; r: number } {
  const c = ELEMENTS.find((el) => el.id === id)?.circle;
  if (!c) throw new Error(`bumper ${id} missing`);
  return { cx: c.center.x, cy: c.center.y, r: c.radius };
}

function slingFace(id: number): { nx: number; ny: number } {
  const el = ELEMENTS.find((e) => e.id === id);
  const face = el ? deriveKickFace(el) : null;
  if (!face) throw new Error(`sling ${id} has no kick face`);
  return { nx: face.nx, ny: face.ny };
}

/** Point at half the arc length of element `id`'s path (computed here, independently). */
function sensorMid(id: number): { x: number; y: number } {
  const v = ELEMENTS.find((e) => e.id === id)?.vertices ?? [];
  const pts = v.map((p) => ({ x: p.x, y: p.y }));
  if (pts.length < 2) throw new Error(`sensor ${id} has no path`);
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as { x: number; y: number };
    const b = pts[i] as { x: number; y: number };
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(l);
    total += l;
  }
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as { x: number; y: number };
    const b = pts[i] as { x: number; y: number };
    const l = lens[i - 1] ?? 0;
    if (l > 0 && left <= l) {
      const t = left / l;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= l;
  }
  throw new Error(`sensor ${id}: midpoint not found`);
}

/** The ball-save post's circle (element 610, kind "post"). */
function postCircle(): { cx: number; cy: number; r: number } {
  const c = ELEMENTS.find((el) => el.kind === "post")?.circle;
  if (!c) throw new Error("post missing");
  return { cx: c.center.x, cy: c.center.y, r: c.radius };
}

/** Live slots of `kind`, by index. */
function liveOf(p: ParticlePool, kind: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.capacity; i++) {
    if (p.kind[i] === kind && (p.age[i] ?? 0) < (p.life[i] ?? 0)) out.push(i);
  }
  return out;
}

/** Angle in radians between (ax, ay) and (bx, by). */
function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** A fixed-direction spark: spread 0, speed and life pinned. */
function emitFixed(p: ParticlePool, x: number, y: number, vx: number, vy: number, life: number) {
  const speed = Math.hypot(vx, vy);
  p.emitSpark(SPARK_BUMPER, x, y, vx / speed, vy / speed, 0, speed, speed, life, life);
}

describe("ParticlePool storage (T-6-27)", () => {
  it("after 10,000 emits every field array still has length 160 and aliveCount() <= 160", () => {
    const p = new ParticlePool();
    for (let i = 0; i < 10_000; i++) {
      if (i % 7 === 0) p.emitRing(i * 0.001, 1, 0.1, 0.2);
      else p.emitSpark(SPARK_BUMPER, 0, 0, 0, -1, 1, 1.5, 3, 0.3, 0.45);
      if (i % 3 === 0) p.tick();
    }
    expect(p.capacity).toBe(PARTICLE_CAPACITY);
    for (const a of [p.x, p.y, p.px, p.py, p.vx, p.vy, p.age, p.life, p.size, p.kind]) {
      expect(a.length).toBe(160);
    }
    expect(p.aliveCount()).toBeLessThanOrEqual(160);
  });

  it("the 161st emit overwrites the oldest slot (slot 0)", () => {
    const p = new ParticlePool();
    for (let i = 0; i < 160; i++) p.emitSpark(SPARK_SLING, 0, 0, 1, 0, 0, 1, 1, 1, 1);
    expect(p.kind[0]).toBe(SPARK_SLING);
    p.emitRing(4.25, -3.5, 0.2, 0.3);
    expect(p.kind[0]).toBe(RING);
    expect(p.x[0]).toBeCloseTo(4.25, 5);
    expect(p.y[0]).toBeCloseTo(-3.5, 5);
    expect(p.kind[1]).toBe(SPARK_SLING);
    expect(p.aliveCount()).toBe(160);
  });

  it("two pools with the same seed fed the same emit/tick sequence hold identical arrays", () => {
    const run = (): ParticlePool => {
      const p = new ParticlePool(PARTICLE_CAPACITY, 0x1234);
      for (let i = 0; i < 400; i++) {
        p.emitSpark(
          i % 2 ? SPARK_BUMPER : SPARK_SLING,
          i * 0.01,
          2,
          0.6,
          -0.8,
          1.2,
          1.5,
          3,
          0.3,
          0.45,
        );
        if (i % 5 === 0) p.emitRing(1, 1, 0.15, 0.2);
        p.tick();
      }
      return p;
    };
    const a = run();
    const b = run();
    for (const k of ["x", "y", "px", "py", "vx", "vy", "age", "life", "size", "kind"] as const) {
      expect(Array.from(a[k])).toEqual(Array.from(b[k]));
    }
  });
});

describe("ParticlePool tick (step clock)", () => {
  it("a spark with v = (2, 0) has v = (2 * (1 - 4/120), 2/120) after one tick and px/py equal its previous x/y", () => {
    expect(FIXED_DT).toBe(1 / 120);
    expect(PARTICLE_DRAG_PER_S).toBe(4);
    expect(PARTICLE_GRAVITY).toBe(2);
    const p = new ParticlePool();
    emitFixed(p, 0.5, 1.5, 2, 0, 0.4);
    expect(p.px[0]).toBe(p.x[0]);
    expect(p.py[0]).toBe(p.y[0]);
    const x0 = p.x[0];
    const y0 = p.y[0];
    p.tick();
    expect(p.vx[0]).toBeCloseTo(2 * (1 - 4 / 120), 5);
    expect(p.vy[0]).toBeCloseTo(2 / 120, 6);
    expect(p.px[0]).toBe(x0);
    expect(p.py[0]).toBe(y0);
    expect(p.x[0]).toBeCloseTo(0.5 + 2 * (1 - 4 / 120) * FIXED_DT, 5);
    expect(p.y[0]).toBeCloseTo(1.5 + (2 / 120) * FIXED_DT, 6);
  });

  it("a slot is dead once age >= life, and a dead slot no longer moves", () => {
    const p = new ParticlePool();
    emitFixed(p, 0, 0, 1, 0, 5 * FIXED_DT);
    let ticks = 0;
    while (p.aliveCount() > 0 && ticks < 100) {
      p.tick();
      ticks++;
    }
    expect(ticks).toBeGreaterThanOrEqual(5);
    expect(ticks).toBeLessThanOrEqual(6);
    expect(p.age[0]).toBeGreaterThanOrEqual(p.life[0] ?? Infinity);
    const x = p.x[0];
    const age = p.age[0];
    p.tick();
    expect(p.x[0]).toBe(x);
    expect(p.age[0]).toBe(age);
  });

  it("a ring never moves; it only ages", () => {
    const p = new ParticlePool();
    p.emitRing(1.25, 2.5, 0.2, 24 * FIXED_DT);
    for (let i = 0; i < 10; i++) p.tick();
    expect(p.x[0]).toBeCloseTo(1.25, 6);
    expect(p.y[0]).toBeCloseTo(2.5, 6);
    expect(p.px[0]).toBe(p.x[0]);
    expect(p.py[0]).toBe(p.y[0]);
    expect(p.vx[0]).toBe(0);
    expect(p.vy[0]).toBe(0);
    expect(p.size[0]).toBeCloseTo(0.2, 6);
    expect(p.age[0]).toBeCloseTo(10 * FIXED_DT, 5);
  });
});

describe("EffectsTracker emitters (PLSH-02, D-19)", () => {
  it("a bumper hit emits round(12 + 4s) sparks (12 at s = 0, 16 at s = 1) and exactly one ring at the center with radius R", () => {
    const b = bumper(202);
    for (const [s, n] of [
      [0, 12],
      [1, 16],
    ] as const) {
      const fx = new EffectsTracker(ELEMENTS);
      fx.onKick("bumper", 202, s, b.cx + b.r, b.cy);
      expect(liveOf(fx.particles, SPARK_BUMPER)).toHaveLength(n);
      const rings = liveOf(fx.particles, RING);
      expect(rings).toHaveLength(1);
      const i = rings[0] ?? -1;
      expect(fx.particles.x[i]).toBeCloseTo(b.cx, 5);
      expect(fx.particles.y[i]).toBeCloseTo(b.cy, 5);
      expect(fx.particles.size[i]).toBeCloseTo(b.r, 5);
      expect(fx.particles.life[i]).toBeCloseTo(24 * FIXED_DT, 5);
    }
  });

  it("a slingshot kick emits round(6 + 4s) sparks (6 at s = 0, 10 at s = 1) and no ring", () => {
    for (const [s, n] of [
      [0, 6],
      [1, 10],
    ] as const) {
      const fx = new EffectsTracker(ELEMENTS);
      fx.onKick("slingshot", 300, s, 1, 6);
      expect(liveOf(fx.particles, SPARK_SLING)).toHaveLength(n);
      expect(liveOf(fx.particles, RING)).toHaveLength(0);
    }
  });

  it("every bumper spark spawns on the rim facing the contact, flies within 80 degrees of the outward normal, with speed and life in range", () => {
    const b = bumper(202);
    const fx = new EffectsTracker(ELEMENTS);
    const p = fx.particles;
    for (let k = 0; k < 9; k++) {
      const th = (k / 9) * 2 * Math.PI;
      const nx = Math.cos(th);
      const ny = Math.sin(th);
      fx.onKick("bumper", 202, 1, b.cx + b.r * nx, b.cy + b.r * ny);
      const sparks = liveOf(p, SPARK_BUMPER).filter((i) => p.age[i] === 0);
      expect(sparks).toHaveLength(16);
      for (const i of sparks) {
        expect(p.x[i]).toBeCloseTo(b.cx + b.r * nx, 5);
        expect(p.y[i]).toBeCloseTo(b.cy + b.r * ny, 5);
        const vx = p.vx[i] ?? 0;
        const vy = p.vy[i] ?? 0;
        expect(angleBetween(vx, vy, nx, ny)).toBeLessThanOrEqual(80 * DEG + F32);
        const speed = Math.hypot(vx, vy);
        expect(speed).toBeGreaterThanOrEqual(BUMPER_SPARK_SPEED_MIN - F32);
        expect(speed).toBeLessThanOrEqual(BUMPER_SPARK_SPEED_MAX + F32);
        expect(p.life[i]).toBeGreaterThanOrEqual(BUMPER_SPARK_LIFE_MIN - F32);
        expect(p.life[i]).toBeLessThanOrEqual(BUMPER_SPARK_LIFE_MAX + F32);
      }
      for (let t = 0; t < 60; t++) fx.tick();
    }
  });

  it("every sling spark spawns at the contact point and flies within 35 degrees of the face normal, with speed and life in range", () => {
    for (const id of [300, 301]) {
      const n = slingFace(id);
      const fx = new EffectsTracker(ELEMENTS);
      const p = fx.particles;
      for (let k = 0; k < 20; k++) fx.onKick("slingshot", id, k / 19, 1.5, 6.25);
      const sparks = liveOf(p, SPARK_SLING);
      expect(sparks.length).toBeGreaterThan(100);
      for (const i of sparks) {
        expect(p.x[i]).toBeCloseTo(1.5, 5);
        expect(p.y[i]).toBeCloseTo(6.25, 5);
        const vx = p.vx[i] ?? 0;
        const vy = p.vy[i] ?? 0;
        expect(angleBetween(vx, vy, n.nx, n.ny)).toBeLessThanOrEqual(35 * DEG + F32);
        const speed = Math.hypot(vx, vy);
        expect(speed).toBeGreaterThanOrEqual(SLING_SPARK_SPEED_MIN - F32);
        expect(speed).toBeLessThanOrEqual(SLING_SPARK_SPEED_MAX + F32);
        expect(p.life[i]).toBeGreaterThanOrEqual(SLING_SPARK_LIFE_MIN - F32);
        expect(p.life[i]).toBeLessThanOrEqual(SLING_SPARK_LIFE_MAX + F32);
      }
    }
  });

  it("an unknown id or a non-bumper id emits nothing (the shake still takes the trauma)", () => {
    const fx = new EffectsTracker(ELEMENTS);
    fx.onKick("bumper", 99_999, 1, 0, 0);
    fx.onKick("bumper", -1, 1, 0, 0);
    fx.onKick("bumper", 300, 1, 0, 0);
    fx.onKick("slingshot", 202, 1, 0, 0);
    expect(fx.particles.aliveCount()).toBe(0);
  });
});

describe("particle footprint (T-6-25, photosensitive safety)", () => {
  it("across 1,000 seeded bumper bursts no spark travels farther than 0.63 m from its spawn and no ring radius exceeds 2.0R", () => {
    const b = bumper(202);
    const fx = new EffectsTracker(ELEMENTS);
    const p = fx.particles;
    const sx = new Float64Array(p.capacity);
    const sy = new Float64Array(p.capacity);
    let maxTravel = 0;
    let maxRing = 0;
    let sparks = 0;
    for (let k = 0; k < 1000; k++) {
      const th = (k / 1000) * 2 * Math.PI;
      fx.onKick("bumper", 202, 1, b.cx + b.r * Math.cos(th), b.cy + b.r * Math.sin(th));
      for (let i = 0; i < p.capacity; i++) {
        if (p.kind[i] === SPARK_BUMPER && p.age[i] === 0 && (p.life[i] ?? 0) > 0) {
          sx[i] = p.x[i] ?? 0;
          sy[i] = p.y[i] ?? 0;
          sparks++;
        }
      }
      for (let t = 0; t < 200 && p.aliveCount() > 0; t++) {
        for (let i = 0; i < p.capacity; i++) {
          const age = p.age[i] ?? 0;
          const life = p.life[i] ?? 0;
          if (!(age < life)) continue;
          if (p.kind[i] === RING) {
            maxRing = Math.max(maxRing, (p.size[i] ?? 0) * (1 + age / life));
          } else {
            maxTravel = Math.max(
              maxTravel,
              Math.hypot((p.x[i] ?? 0) - (sx[i] ?? 0), (p.y[i] ?? 0) - (sy[i] ?? 0)),
            );
          }
        }
        fx.tick();
        // The position a slot reaches on its last live tick counts too.
        for (let i = 0; i < p.capacity; i++) {
          if (p.kind[i] !== SPARK_BUMPER || (p.life[i] ?? 0) <= 0) continue;
          maxTravel = Math.max(
            maxTravel,
            Math.hypot((p.x[i] ?? 0) - (sx[i] ?? 0), (p.y[i] ?? 0) - (sy[i] ?? 0)),
          );
        }
      }
      expect(p.aliveCount()).toBe(0);
    }
    expect(sparks).toBe(16_000);
    expect(maxTravel).toBeLessThanOrEqual(0.63);
    expect(maxRing).toBeLessThanOrEqual(2 * b.r);
  });
});

describe("EffectsTracker reward and save emitters (06-13, D-19)", () => {
  /** Assert one glint of `glint` and 3 or 4 motes of `mote` at (x, y), and nothing else live. */
  function expectReward(p: ParticlePool, glint: number, mote: number, x: number, y: number): void {
    const glints = liveOf(p, glint);
    expect(glints).toHaveLength(1);
    const motes = liveOf(p, mote);
    expect(motes.length).toBeGreaterThanOrEqual(3);
    expect(motes.length).toBeLessThanOrEqual(4);
    expect(p.aliveCount()).toBe(1 + motes.length);
    for (const i of [...glints, ...motes]) {
      expect(p.x[i]).toBeCloseTo(x, 5);
      expect(p.y[i]).toBeCloseTo(y, 5);
    }
  }

  it("onSensor(rollover, 401) emits exactly one GLINT_ROLLOVER at rollover 401's midpoint and 3 or 4 MOTE_ROLLOVER there", () => {
    const fx = new EffectsTracker(ELEMENTS);
    fx.onSensor("rollover", 401);
    const m = sensorMid(401);
    expectReward(fx.particles, GLINT_ROLLOVER, MOTE_ROLLOVER, m.x, m.y);
  });

  it("onSensor(lane, 500) emits one GLINT_INLANE and 3 or 4 MOTE_INLANE at inlane 500's midpoint", () => {
    const fx = new EffectsTracker(ELEMENTS);
    fx.onSensor("lane", 500);
    const m = sensorMid(500);
    expectReward(fx.particles, GLINT_INLANE, MOTE_INLANE, m.x, m.y);
  });

  it("motes move up-table (vy < 0) at 0.15 to 0.30 m/s and keep that speed tick to tick", () => {
    const fx = new EffectsTracker(ELEMENTS);
    const p = fx.particles;
    for (let k = 0; k < 10; k++) {
      fx.onSensor("rollover", 400 + (k % 3));
      fx.onSensor("lane", 500 + (k % 2));
    }
    const motes = [...liveOf(p, MOTE_ROLLOVER), ...liveOf(p, MOTE_INLANE)];
    expect(motes.length).toBeGreaterThanOrEqual(60);
    const speed0 = motes.map((i) => Math.hypot(p.vx[i] ?? 0, p.vy[i] ?? 0));
    for (const s of speed0) {
      expect(s).toBeGreaterThanOrEqual(MOTE_SPEED_MIN - F32);
      expect(s).toBeLessThanOrEqual(MOTE_SPEED_MAX + F32);
    }
    for (let t = 0; t < 30; t++) {
      const y0 = motes.map((i) => p.y[i] ?? 0);
      fx.tick();
      motes.forEach((i, k) => {
        expect(p.vy[i] ?? 0).toBeLessThan(0);
        expect(Math.hypot(p.vx[i] ?? 0, p.vy[i] ?? 0)).toBeCloseTo(speed0[k] ?? 0, 6);
        expect(p.y[i] ?? 0).toBeLessThan(y0[k] ?? 0);
      });
    }
  });

  it("a glint never moves and dies after 42 steps", () => {
    expect(GLINT_LIFE_STEPS).toBe(42);
    const fx = new EffectsTracker(ELEMENTS);
    const p = fx.particles;
    fx.onSensor("rollover", 400);
    const i = liveOf(p, GLINT_ROLLOVER)[0] ?? -1;
    const x = p.x[i];
    const y = p.y[i];
    for (let t = 0; t < 41; t++) {
      fx.tick();
      expect(p.x[i]).toBe(x);
      expect(p.y[i]).toBe(y);
      expect(p.vx[i]).toBe(0);
      expect(p.vy[i]).toBe(0);
    }
    expect(liveOf(p, GLINT_ROLLOVER)).toHaveLength(1);
    fx.tick();
    expect(liveOf(p, GLINT_ROLLOVER)).toHaveLength(0);
  });

  it("onSkillShot(402) emits one GLINT_SKILL and 3 or 4 MOTE_SKILL at rollover 402's midpoint; an unknown or non-sensor lane emits nothing", () => {
    const fx = new EffectsTracker(ELEMENTS);
    fx.onSkillShot(402);
    const m = sensorMid(402);
    expectReward(fx.particles, GLINT_SKILL, MOTE_SKILL, m.x, m.y);

    const none = new EffectsTracker(ELEMENTS);
    none.onSkillShot(-1);
    none.onSkillShot(99_999);
    none.onSkillShot(202);
    expect(none.particles.aliveCount()).toBe(0);
  });

  it("onSave(kickback) emits exactly 10 SPARK_SAVE sparks from the post's top rim point, each within 80 degrees of straight up, with the impact speed and life", () => {
    const post = postCircle();
    const fx = new EffectsTracker(ELEMENTS);
    const p = fx.particles;
    for (let k = 0; k < 12; k++) {
      fx.onSave("kickback");
      const sparks = liveOf(p, SPARK_SAVE).filter((i) => p.age[i] === 0);
      expect(sparks).toHaveLength(10);
      expect(p.aliveCount()).toBe(10);
      for (const i of sparks) {
        expect(p.x[i]).toBeCloseTo(post.cx, 5);
        expect(p.y[i]).toBeCloseTo(post.cy - post.r, 5);
        const vx = p.vx[i] ?? 0;
        const vy = p.vy[i] ?? 0;
        expect(angleBetween(vx, vy, 0, -1)).toBeLessThanOrEqual(80 * DEG + F32);
        const speed = Math.hypot(vx, vy);
        expect(speed).toBeGreaterThanOrEqual(BUMPER_SPARK_SPEED_MIN - F32);
        expect(speed).toBeLessThanOrEqual(BUMPER_SPARK_SPEED_MAX + F32);
        expect(p.life[i]).toBeGreaterThanOrEqual(BUMPER_SPARK_LIFE_MIN - F32);
        expect(p.life[i]).toBeLessThanOrEqual(BUMPER_SPARK_LIFE_MAX + F32);
      }
      for (let t = 0; t < 120; t++) fx.tick();
      expect(p.aliveCount()).toBe(0);
    }
  });

  it("onSave(backstop) and onSave(none) emit nothing", () => {
    const fx = new EffectsTracker(ELEMENTS);
    fx.onSave("backstop");
    fx.onSave("none");
    expect(fx.particles.aliveCount()).toBe(0);
  });
});
