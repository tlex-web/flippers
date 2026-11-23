import { describe, it, expect, vi } from "vitest";

import { BALL_RADIUS_M, FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { Segment, Vec2 } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PLAYFIELD_CENTER_X, TABLE_SPEC, mirrorPath } from "../table/spec";
import type { TableSpec } from "../table/spec";

// Heavy simulation suite: about 450 short seeded runs, so this file alone gets
// 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * BAT/SLING PINCH proof (04-REVIEW WR-03; protects FLIP-02 and ELEM-02 on the
 * real table). A ball fed down an inlane onto the resting bat, then flipped,
 * must leave no faster than the identical flip on the same table with the two
 * slingshots removed. Before 06.1 the raised bat came within 0.129 m of the
 * sling's lower corner, and a base or mid-bat flip could squeeze the ball
 * between them and fire it sideways at up to 2.6x the no-sling speed.
 *
 * Everything drives the REAL `PlanckWorld` through the production
 * `FixedStepLoop` (motor commands latched at the top of each fixed step via the
 * loop's pre-step hook, exactly like `main.ts`). No `Math.random`: every
 * scenario is a fixed inlane drop and a fixed flip step.
 *
 * The flip is fired on EVERY fixed step k in K_MIN..K_MAX. The pinch lives in
 * windows a few steps wide: sampling every 3rd step under-reports it (13.1 /
 * 17.9 m/s measured against 22.6 / 27.9 m/s on the every-step sweep).
 *
 * Teeth: the RED controls rebuild the pre-fix sling locally and must still
 * pinch, so the GREEN cases cannot pass merely because the probe went blind.
 */

/**
 * HEAD 5a412cf's left sling (pre-06.1), kept here so the RED control never
 * loses its teeth. The fixed sling sits 0.35 m further up-table.
 */
const OLD_LEFT_SLING: readonly Vec2[] = [
  { x: 0.86, y: 4.2 },
  { x: 0.86, y: 4.95 },
  { x: 1.16, y: 5.1 },
];

/** TABLE_SPEC with slings 300/301 put back on the pre-fix geometry. */
const OLD_SLING_SPEC: TableSpec = TABLE_SPEC.map((e) => {
  if (!("path" in e)) return e;
  if (e.id === 300) return { ...e, path: OLD_LEFT_SLING };
  if (e.id === 301) return { ...e, path: mirrorPath(OLD_LEFT_SLING) };
  return e;
});

/** The no-sling control: TABLE_SPEC without slingshots 300/301. */
const NO_SLING_SPEC: TableSpec = TABLE_SPEC.filter((e) => e.id !== 300 && e.id !== 301);

/** Consecutive steps a speed must hold to count (flipper-feel idiom). */
const SUSTAIN_STEPS = 3;
/** Steps recorded after the raise starts. */
const WINDOW_STEPS = 25;
/** First and last flip step after the drop (every step in between is tried). */
const K_MIN = 36;
const K_MAX = 110;
/** A flip may leave at most this multiple of the no-sling control's speed. */
const PINCH_RATIO = 1.1;

/** Steps both bats droop before the ball is added. */
const SETTLE_STEPS = 30;
/** Inlane drop point (left side; mirrored for the right bat). */
const DROP_X = 0.6;
const DROP_Y = 4.5;
const DROP_VY = 1.0;

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
 * Inlane drop onto bat `id`, then a flip: both bats droop (motor -1) for
 * SETTLE_STEPS, the ball is added on the inlane, both droop k more steps, then
 * bat `id` raises (+1, the other bat -1) for WINDOW_STEPS. Returns the highest
 * speed the ball held for SUSTAIN_STEPS consecutive steps in that window.
 */
function inlaneFlip(table: TableSpec, id: 0 | 1, k: number): number {
  const world = new PlanckWorld({ table });
  const loop = new FixedStepLoop(world);
  const step = (drive: () => void): void => {
    loop.advance(FIXED_DT * 1000, drive);
  };
  const droop = (): void => {
    world.setFlipperMotor(0, -1);
    world.setFlipperMotor(1, -1);
  };
  for (let i = 0; i < SETTLE_STEPS; i++) step(droop);

  const spawn: Vec2 = { x: id === 0 ? DROP_X : 2 * PLAYFIELD_CENTER_X - DROP_X, y: DROP_Y };
  // A spawn overlapping a collider would be pushed out by the solver and fake a
  // launch (research Pitfall 2), so the drop must start in open space.
  for (const s of world.getBoundarySegments()) {
    const d = distToSegment(spawn, s);
    if (d < BALL_RADIUS_M) {
      throw new Error(`spawn (${spawn.x}, ${spawn.y}) is ${d.toFixed(4)} m from a wall`);
    }
  }
  world.addBall({ x: spawn.x, y: spawn.y, vx: 0, vy: DROP_VY, radius: BALL_RADIUS_M });
  for (let i = 0; i < k; i++) step(droop);

  const raise = (): void => {
    world.setFlipperMotor(id, 1);
    world.setFlipperMotor(1 - id, -1);
  };
  const speeds: number[] = [];
  for (let i = 0; i < WINDOW_STEPS; i++) {
    step(raise);
    const b = world.getBalls()[0];
    speeds.push(b ? Math.hypot(b.vx, b.vy) : 0);
  }
  let sustained = 0;
  for (let i = 0; i + SUSTAIN_STEPS <= speeds.length; i++) {
    sustained = Math.max(sustained, Math.min(...speeds.slice(i, i + SUSTAIN_STEPS)));
  }
  return sustained;
}

/** No-sling control speeds, cached per (bat, k) so the RED control reuses them. */
const controlCache = new Map<string, number>();

function controlSpeed(id: 0 | 1, k: number): number {
  const key = `${id}:${k}`;
  let v = controlCache.get(key);
  if (v === undefined) {
    v = inlaneFlip(NO_SLING_SPEC, id, k);
    controlCache.set(key, v);
  }
  return v;
}

/** Worst flip-speed ratio over every k in K_MIN..K_MAX against the no-sling control. */
function worstRatio(table: TableSpec, id: 0 | 1): number {
  let worst = 0;
  for (let k = K_MIN; k <= K_MAX; k++) {
    const ctrl = Math.max(controlSpeed(id, k), 1);
    worst = Math.max(worst, inlaneFlip(table, id, k) / ctrl);
  }
  return worst;
}

describe("bat/sling pinch on TABLE_SPEC (WR-03, FLIP-02, ELEM-02)", () => {
  for (const id of [0, 1] as const) {
    const side = id === 0 ? "left" : "right";

    it(`an inlane flip off the ${side} bat leaves no faster than ${PINCH_RATIO}x the no-sling control at every step`, () => {
      const ratio = worstRatio(TABLE_SPEC, id);
      expect(ratio, `${side} bat worst ratio ${ratio.toFixed(3)}`).toBeLessThanOrEqual(PINCH_RATIO);
    });

    it(`RED control: the pre-fix sling pinches the ${side} bat past ${PINCH_RATIO}x`, () => {
      const ratio = worstRatio(OLD_SLING_SPEC, id);
      expect(ratio, `${side} bat worst ratio ${ratio.toFixed(3)}`).toBeGreaterThan(PINCH_RATIO);
    });
  }
});
