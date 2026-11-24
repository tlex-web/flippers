import { describe, it, expect, vi } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { ReactiveElements, type RulesGate } from "../game/reactive-elements";
import { BALL_RADIUS_M, FIXED_DT, FLIPPER_HALF_WIDTH_M } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { Segment, Vec2 } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PLAYFIELD_CENTER_X, TABLE_SPEC, mirrorPath, mirrorX } from "../table/spec";
import type { TableSpec } from "../table/spec";

// Heavy simulation suite: a few hundred short seeded runs per case, so this
// file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * SHOT-CLEARANCE proof (06.3; CONTEXT D-04 as amended by D-13; protects
 * FLIP-02, ELEM-02 and TBL-01 on the real table). A flip from mid-bat to the
 * tip must rise past its own slingshot into the upper field instead of
 * bouncing off the triangle above the bat.
 *
 * Everything drives the REAL `PlanckWorld` through the production
 * `FixedStepLoop` with the slings live: a `CollisionRouter` plus
 * `ReactiveElements`, the rules registered first exactly as in `main.ts`, so a
 * sling contact kicks the ball as it would in play. A second router listener,
 * registered after the rules, records the contacts. The test never drains the
 * world's events itself (that would steal them from the rules) and never uses
 * the reactive-world.ts soak decorator, whose event drain is always empty. No
 * `Math.random` and no environment switch: every scenario is a fixed placement
 * or a fixed inlane drop and a fixed flip step (research Pitfall 3).
 *
 * Gate: every kept flip, with its contact point d in [D_MIN, D_MAX] along the
 * bat from the pivot, must never touch its own sling (bat 0: 300, bat 1: 301)
 * before its centre reaches y <= CLEAR_Y going up, and must reach that line
 * within WINDOW_STEPS steps. All flips, not a ratio. A flip whose first sling
 * contact is the OPPOSITE sling is a cross shot: those are counted, printed and
 * capped at the measured ceiling (MAX_OPP_CONTACTS contacts, MAX_OPP_DOWN
 * knocked back down); exceeding the cap fails the gate. The band is never
 * narrowed to dodge them (D-07, D-13).
 *
 * Teeth: the pre-trim sling, rebuilt locally, must fail the own-sling gate, so
 * the gate can see a deflection at all. A liveness floor (MIN_KEPT_INLANE kept
 * inlane flips per bat) stops the gate passing blind: the no-sling control must
 * clear every kept flip and meet the floor, and a walled-off inlane must fall
 * below it, so a probe whose drop never reaches the bat is seen. The root strip
 * (d < D_MIN) is measured and printed as the share that clears with no sling
 * contact, and never gated (D-06, D-03).
 */

/**
 * HEAD 96ef60c's left sling, before the 06.3 trim, kept so the RED control
 * never loses its teeth.
 */
const PRE_TRIM_LEFT_SLING: readonly Vec2[] = [
  { x: 0.86, y: 3.85 },
  { x: 0.86, y: 4.6 },
  { x: 1.16, y: 4.75 },
];

/** TABLE_SPEC with slings 300/301 put back on the pre-trim geometry (kickFace 2 inherited). */
const PRE_TRIM_SPEC: TableSpec = TABLE_SPEC.map((e) => {
  if (!("path" in e)) return e;
  if (e.id === 300) return { ...e, path: PRE_TRIM_LEFT_SLING };
  if (e.id === 301) return { ...e, path: mirrorPath(PRE_TRIM_LEFT_SLING) };
  return e;
});

/** The no-sling control: TABLE_SPEC without slingshots 300/301. */
const NO_SLING_SPEC: TableSpec = TABLE_SPEC.filter((e) => e.id !== 300 && e.id !== 301);

/**
 * A wall across the left inlane above the bat: it closes the inlane, so the
 * drop never reaches the bat and no inlane flip lands in the band. This is the
 * blind probe of sling-pinch.test.ts (06.1-REVIEW WR-02), kept here as a
 * permanent RED control for the liveness floor.
 */
const BLIND_LEFT_WALL: readonly Vec2[] = [
  { x: 0.0, y: 4.85 },
  { x: 0.86, y: 4.85 },
];

/** TABLE_SPEC with both inlanes walled off above the bats (walls 190/191). */
const BLIND_SPEC: TableSpec = [
  ...TABLE_SPEC,
  { id: 190, kind: "wall", path: BLIND_LEFT_WALL },
  { id: 191, kind: "wall", path: BLIND_LEFT_WALL.map(mirrorX) },
];

/** Steps both bats droop before the ball is added. */
const SETTLE_STEPS = 30;
/** Inlane drop point (left side; mirrored for the right bat). */
const DROP_X = 0.6;
const DROP_Y = 4.5;
const DROP_VY = 1.0;
/** First and last inlane flip step after the drop (every step in between is tried). */
const K_MIN = 36;
const K_MAX = 110;
/**
 * The gated band along the bat from the pivot (m). Beyond D_MAX the ball has
 * rolled off the tip and even the no-sling control times out. The band is
 * never narrowed (D-07, D-13).
 */
const D_MIN = 0.25;
const D_MAX = 0.45;
/** A flip has cleared once its centre is at or above this line, moving up. */
const CLEAR_Y = 3.85;
/** Steps a raised flip has to reach CLEAR_Y. */
const WINDOW_STEPS = 60;
/** Rest-grid contact points along the bat (D-04). */
const REST_D = [0.25, 0.3, 0.35, 0.4, 0.45];
/** Rest-grid root strip below D_MIN, measured but never gated (D-06). */
const ROOT_REST_D = [0.05, 0.1, 0.15, 0.2];
/** Rest-grid flip steps after the ball is placed (D-04). */
const REST_K = [0, 2, 4, 6, 8, 10];
/** The measured cross-shot ceiling at t = 0.28 (06.3-RESEARCH); exceeding it is a regression (D-13). */
const MAX_OPP_CONTACTS = 30;
const MAX_OPP_DOWN = 2;
/**
 * The measured kept inlane flips per bat (17 L / 17 R at every corner in
 * 06.3-RESEARCH). The drop path never touches the sling, so the floor does not
 * move with the trim (D-05).
 */
const MIN_KEPT_INLANE = 17;
/** Rules always live, awards ignored: the kicks fire, the score is not under test. */
const LIVE: RulesGate = { isLive: () => true, award: () => undefined };

/** Distance from point p to segment s. */
function distToSegment(p: Vec2, s: Segment): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy));
}

/** First sling contact after the raise starts. */
interface Contact {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** One flip's outcome. */
interface FlipResult {
  /** Ball position along the bat from the pivot at the flip step (m). */
  readonly along: number;
  /** The ball reached y <= CLEAR_Y going up within WINDOW_STEPS. */
  readonly cleared: boolean;
  /**
   * The ball's first sling contact of the window, before clearing, was its own
   * sling. Classified by the FIRST sling contact, as the research probe did
   * (D-13): a cross shot that meets the opposite sling first is governed by
   * the cross-shot cap, even if it later ricochets into its own sling.
   */
  readonly ownTouched: boolean;
  /** The first sling contact of the window, or null. */
  readonly first: Contact | null;
}

/**
 * Flip bat `id` on `table`: both bats droop (motor -1) for SETTLE_STEPS, the
 * ball is placed at rest on the bat's top surface d along it (`place` a
 * number) or dropped down the inlane (`place` "inlane"), both droop k more
 * steps, then bat `id` raises (+1, the other bat -1) for up to WINDOW_STEPS.
 */
function flip(table: TableSpec, id: 0 | 1, place: number | "inlane", k: number): FlipResult {
  const world = new PlanckWorld({ table });
  const router = new CollisionRouter(world);
  // Rules first, recorder second (main.ts order): the rules see each event first.
  const reactive = new ReactiveElements(world, router, LIVE);
  const own = id === 0 ? 300 : 301;
  let armed = false;
  let first: Contact | null = null;
  let ownTouched = false;
  router.register((e) => {
    if (!armed || e.elementKind !== "slingshot") return;
    // Records are pooled: copy the numbers, never keep the event.
    if (first !== null) return;
    first = { id: e.elementId, x: e.point.x, y: e.point.y };
    if (e.elementId === own) ownTouched = true;
  });
  const loop = new FixedStepLoop(world);
  const post = (): void => {
    router.dispatch();
    reactive.service();
  };
  const step = (drive: () => void): void => {
    loop.advance(FIXED_DT * 1000, drive, post);
  };
  const droop = (): void => {
    world.setFlipperMotor(0, -1);
    world.setFlipperMotor(1, -1);
  };
  for (let i = 0; i < SETTLE_STEPS; i++) step(droop);

  const bat = world.getFlippers().find((f) => f.id === id);
  if (!bat) throw new Error(`flipper ${id} missing`);
  // (cos a, sin a) points from the pivot to the tip on both bats.
  const ux = Math.cos(bat.angle);
  const uy = Math.sin(bat.angle);
  // Up-normal of the bat's top surface.
  let nx = uy;
  let ny = -ux;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }

  if (typeof place === "number") {
    const off = FLIPPER_HALF_WIDTH_M + BALL_RADIUS_M + 0.002;
    world.addBall({
      x: bat.pivotX + place * ux + off * nx,
      y: bat.pivotY + place * uy + off * ny,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS_M,
    });
  } else {
    const spawn: Vec2 = { x: id === 0 ? DROP_X : 2 * PLAYFIELD_CENTER_X - DROP_X, y: DROP_Y };
    // A spawn overlapping a collider would be pushed out by the solver and fake
    // a launch (research Pitfall 2), so the drop must start in open space.
    for (const s of world.getBoundarySegments()) {
      const d = distToSegment(spawn, s);
      if (d < BALL_RADIUS_M) {
        throw new Error(`spawn (${spawn.x}, ${spawn.y}) is ${d.toFixed(4)} m from a wall`);
      }
    }
    world.addBall({ x: spawn.x, y: spawn.y, vx: 0, vy: DROP_VY, radius: BALL_RADIUS_M });
  }
  for (let i = 0; i < k; i++) step(droop);

  const b0 = world.getBalls()[0];
  const f0 = world.getFlippers().find((f) => f.id === id);
  if (!b0 || !f0) throw new Error(`ball or flipper ${id} missing at the flip step`);
  const along = (b0.x - f0.pivotX) * Math.cos(f0.angle) + (b0.y - f0.pivotY) * Math.sin(f0.angle);

  armed = true;
  const raise = (): void => {
    world.setFlipperMotor(id, 1);
    world.setFlipperMotor(1 - id, -1);
  };
  let cleared = false;
  for (let i = 0; i < WINDOW_STEPS; i++) {
    step(raise);
    const b = world.getBalls()[0];
    if (!b) break;
    if (b.y <= CLEAR_Y && b.vy < 0) {
      cleared = true;
      break;
    }
  }
  return { along, cleared, ownTouched, first };
}

/** One evaluation of the gate on one table. */
interface GateReport {
  readonly gated: number;
  readonly kept: [number, number];
  readonly offTip: [number, number];
  readonly own: number;
  readonly ownDown: number;
  readonly opp: number;
  readonly oppDown: number;
  readonly rootClear: number;
  readonly rootTotal: number;
  readonly failures: string[];
  readonly summary: string;
}

/**
 * Run the gate on `table`: per bat, the rest grid (when `opts.rest`) and the
 * inlane sweep k in K_MIN..K_MAX, keeping inlane flips whose `along` is in
 * [D_MIN, D_MAX]. Flips below D_MIN (the rest-grid root strip and inlane flips
 * short of the band) are root flips: counted as clear only when they cleared
 * with no sling contact, and never gated.
 */
function evaluate(table: TableSpec, opts: { rest: boolean }): GateReport {
  let gated = 0;
  const kept: [number, number] = [0, 0];
  const offTip: [number, number] = [0, 0];
  let own = 0;
  let ownDown = 0;
  let opp = 0;
  let oppDown = 0;
  let timeouts = 0;
  let rootClear = 0;
  let rootTotal = 0;
  const failures: string[] = [];

  const classify = (id: 0 | 1, label: string, r: FlipResult): void => {
    gated++;
    const at = r.first ? `(${r.first.x.toFixed(2)}, ${r.first.y.toFixed(2)})` : "none";
    const line = (tag: string): string =>
      `bat ${id} ${label} along=${r.along.toFixed(2)} ${tag} first contact ${at}`;
    if (r.ownTouched) {
      own++;
      if (!r.cleared) ownDown++;
      failures.push(line("own"));
    } else if (r.first !== null) {
      opp++;
      if (!r.cleared) oppDown++;
    } else if (!r.cleared) {
      timeouts++;
      failures.push(line("timeout"));
    }
  };

  const root = (r: FlipResult): void => {
    rootTotal++;
    if (r.first === null && r.cleared) rootClear++;
  };

  for (const id of [0, 1] as const) {
    if (opts.rest) {
      for (const d of REST_D) {
        for (const k of REST_K) classify(id, `rest d=${d} k=${k}`, flip(table, id, d, k));
      }
      for (const d of ROOT_REST_D) {
        for (const k of REST_K) root(flip(table, id, d, k));
      }
    }
    for (let k = K_MIN; k <= K_MAX; k++) {
      const r = flip(table, id, "inlane", k);
      if (r.along > D_MAX) {
        offTip[id]++;
      } else if (r.along >= D_MIN) {
        kept[id]++;
        classify(id, `inlane k=${k}`, r);
      } else {
        root(r);
      }
    }
  }

  const summary =
    `gated ${gated}, own-sling failures ${own} (knocked down ${ownDown}), ` +
    `opposite-sling contacts ${opp} (knocked down ${oppDown}), timeouts ${timeouts}, ` +
    `kept inlane ${kept[0]}/${kept[1]}, off-tip ${offTip[0]}/${offTip[1]}, ` +
    `root strip (d < ${D_MIN}) clear ${rootClear}/${rootTotal}`;
  return {
    gated,
    kept,
    offTip,
    own,
    ownDown,
    opp,
    oppDown,
    rootClear,
    rootTotal,
    failures,
    summary,
  };
}

describe("root and mid-bat shots clear their own sling (06.3 D-04/D-13; FLIP-02, ELEM-02, TBL-01)", () => {
  it(`every kept flip off either bat (d in [${D_MIN}, ${D_MAX}]) clears its own sling and reaches y <= ${CLEAR_Y} going up within ${WINDOW_STEPS} steps; opposite-sling grazes stay within ${MAX_OPP_CONTACTS} (${MAX_OPP_DOWN} knocked down)`, () => {
    const r = evaluate(TABLE_SPEC, { rest: true });
    console.info(`[root-shot] TABLE_SPEC ${r.summary}`);
    expect(r.failures, `${r.summary}\n${r.failures.join("\n")}`).toEqual([]);
    expect(r.opp, r.summary).toBeLessThanOrEqual(MAX_OPP_CONTACTS);
    expect(r.oppDown, r.summary).toBeLessThanOrEqual(MAX_OPP_DOWN);
    expect(r.gated).toBeGreaterThan(0);
    expect(r.kept[0], r.summary).toBeGreaterThanOrEqual(MIN_KEPT_INLANE);
    expect(r.kept[1], r.summary).toBeGreaterThanOrEqual(MIN_KEPT_INLANE);
  });

  it("RED control: the pre-trim sling (corner (1.16, 4.75)) fails the own-sling gate", () => {
    const r = evaluate(PRE_TRIM_SPEC, { rest: true });
    console.info(`[root-shot] PRE_TRIM_SPEC ${r.summary}`);
    expect(r.own, r.summary).toBeGreaterThan(0);
  });

  it(`control: with no slings every kept flip clears and the inlane sweep keeps at least ${MIN_KEPT_INLANE} flips per bat`, () => {
    const r = evaluate(NO_SLING_SPEC, { rest: true });
    console.info(`[root-shot] NO_SLING_SPEC ${r.summary}`);
    expect(r.failures, `${r.summary}\n${r.failures.join("\n")}`).toEqual([]);
    expect(r.own, r.summary).toBe(0);
    expect(r.opp, r.summary).toBe(0);
    expect(r.kept[0], r.summary).toBeGreaterThanOrEqual(MIN_KEPT_INLANE);
    expect(r.kept[1], r.summary).toBeGreaterThanOrEqual(MIN_KEPT_INLANE);
  });

  it(`RED control: a walled-off inlane keeps fewer than ${MIN_KEPT_INLANE} inlane flips per bat, so liveness fails`, () => {
    const r = evaluate(BLIND_SPEC, { rest: false });
    console.info(`[root-shot] BLIND_SPEC ${r.summary}`);
    expect(r.kept[0], r.summary).toBeLessThan(MIN_KEPT_INLANE);
    expect(r.kept[1], r.summary).toBeLessThan(MIN_KEPT_INLANE);
  });
});
