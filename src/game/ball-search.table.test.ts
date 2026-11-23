import { describe, it, expect, vi } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallId, BallState, Vec2 } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PLAYFIELD_CENTER_X } from "../table/spec";
import { GameSession, type GameSessionOptions } from "./game-session";
import { ReactiveElements } from "./reactive-elements";
import { NUDGE_COOLDOWN_STEPS, TILT_FORFEIT_HOLD_STEPS, type NudgeDir } from "./tuning";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * Tilted hinge-pocket soft-lock on the REAL table (6590dce IN-04, plan 06.2-02;
 * protects GAME-02 and GAME-03). With the flippers dead, a ball can come to rest
 * on a bat's hinge cap against the funnel-wall end (the left pocket near
 * (0.745, 5.211), and its mirror). Nothing on a tilted table frees it: the
 * flippers are off, nudges are ignored and the kickers are dead. No drain ever
 * fires, and `onStart()` is refused while tilted, so before 06.2 the only
 * recovery was a page reload. The 3-ball loop stalled (GAME-02) and "a tilt
 * costs only the current ball" was not delivered (GAME-03).
 *
 * Everything drives the REAL `PlanckWorld` through the production
 * `FixedStepLoop`, in main.ts's order: `controller.update()`, then any latched
 * `session.onNudge(dir)`, then `session.tick()` at the top of each fixed step;
 * `router.dispatch()`, `reactive.service()`, `session.service()` after it. No
 * `Math.random`: every case is a fixed spawn and a fixed nudge schedule.
 *
 * Teeth: the RED control runs the identical case with the ball search off and
 * must stay soft-locked, so the GREEN case cannot pass because the ball merely
 * rolled out of the pocket on its own.
 */

/** Spawn that settles into the left hinge pocket (the todo's reproduction). */
const POCKET_SPAWN: Vec2 = { x: 0.741, y: 5.206 };
/** Where the left pocket ball comes to rest (Probe 1: (0.7454, 5.2110)). */
const POCKET_REST: Vec2 = { x: 0.745, y: 5.211 };
/**
 * Tolerance around POCKET_REST. Measured 0.011 m (left) / 0.009 m (right) from
 * POCKET_REST at the probe's kick step.
 */
const POCKET_TOL_M = 0.03;
/** Steps the served ball settles into the pocket before the tilt nudges. */
const SETTLE_STEPS = 300;
/** Nudges NUDGE_COOLDOWN_STEPS apart: the 4th tilts (tuning.ts worked numbers). */
const TILT_NUDGES = 4;
/** Steps the RED control runs after the tilt. */
const RED_RUN_STEPS = 3000;
/** Cap on reaching the bus drain after the tilt (measured 386 / 423 steps). */
const SEARCH_CAP_STEPS = 1500;
/** Cap on the forfeit's fixed hold ending in the next serve. */
const SERVE_CAP_STEPS = TILT_FORFEIT_HOLD_STEPS + 120;
/** "Still" speed for the RED control's pocket assertion (m/s). */
const STILL_SPEED = 0.05;

/** A side's point: as given on the left, mirrored about the centre on the right. */
function sidePoint(p: Vec2, side: 0 | 1): Vec2 {
  return side === 0 ? p : { x: 2 * PLAYFIELD_CENTER_X - p.x, y: p.y };
}

interface PocketGame {
  readonly world: PlanckWorld;
  readonly session: GameSession;
  /** Ball id of every drain event on the bus, in order. */
  readonly drainedIds: BallId[];
  /** Run one fixed step, latching `nudge` (if given) before `session.tick()`. */
  step(nudge?: NudgeDir): void;
}

/** The main.ts composition with the serve at the side's hinge-pocket spawn. */
function makePocketGame(side: 0 | 1, options: GameSessionOptions): PocketGame {
  const world = new PlanckWorld();
  const controller = new FlipperController(world);
  const router = new CollisionRouter(world);
  const session = new GameSession(
    world,
    router,
    sidePoint(POCKET_SPAWN, side),
    { setEnabled: (on) => controller.setEnabled(on) },
    options,
  );
  const reactive = new ReactiveElements(world, router, session, undefined, session);
  const loop = new FixedStepLoop(world);

  const drainedIds: BallId[] = [];
  router.register((e) => {
    if (e.elementKind === "drain") drainedIds.push(e.ballId);
  });

  let latched: NudgeDir | undefined;
  const pre = (): void => {
    controller.update();
    if (latched !== undefined) session.onNudge(latched);
    session.tick();
  };
  const post = (): void => {
    router.dispatch();
    reactive.service();
    session.service();
  };

  return {
    world,
    session,
    drainedIds,
    step(nudge?: NudgeDir): void {
      latched = nudge;
      const steps = loop.advance(FIXED_DT * 1000, pre, post);
      latched = undefined;
      if (steps !== 1) throw new Error(`expected one fixed step, ran ${steps}`);
    },
  };
}

/** The active ball's state, or undefined. */
function activeBall(g: PocketGame): BallState | undefined {
  const id = g.session.activeBallId;
  return g.world.getBalls().find((b) => b.id === id);
}

/** Distance from the active ball to the side's pocket rest point (Infinity with no ball). */
function pocketDistance(g: PocketGame, side: 0 | 1): number {
  const b = activeBall(g);
  if (!b) return Number.POSITIVE_INFINITY;
  const rest = sidePoint(POCKET_REST, side);
  return Math.hypot(b.x - rest.x, b.y - rest.y);
}

/**
 * Start, let the ball settle into the side's hinge pocket, then tilt with
 * nudges AWAY from the centre ("right" is -x for the left pocket, "left" is +x
 * for the right one), which pin it back into the pocket. An "up" nudge knocks
 * it free instead (research Pattern 2).
 */
function tiltInPocket(g: PocketGame, side: 0 | 1): void {
  expect(g.session.onStart(), "game starts").toBe(true);
  for (let i = 0; i < SETTLE_STEPS; i++) g.step();
  const d = pocketDistance(g, side);
  expect(
    d,
    `ball settled in the ${side === 0 ? "left" : "right"} hinge pocket (d=${d.toFixed(4)} m)`,
  ).toBeLessThan(POCKET_TOL_M);
  const away: NudgeDir = side === 0 ? "right" : "left";
  for (let n = 0; n < TILT_NUDGES; n++) {
    g.step(away);
    for (let i = 1; i < NUDGE_COOLDOWN_STEPS; i++) g.step();
  }
  expect(
    g.session.getState(),
    `tilted after ${TILT_NUDGES} nudges (measured tilt at session step 391; now ${g.session.getStep()})`,
  ).toBe("tilted");
}

describe("tilted hinge-pocket ball search on TABLE_SPEC (6590dce IN-04, GAME-02, GAME-03)", () => {
  for (const sideIdx of [0, 1] as const) {
    const side = sideIdx === 0 ? "left" : "right";

    it(`RED control: with the ball search off, the tilted ${side} hinge-pocket ball never drains and the game stays tilted (the soft-lock)`, () => {
      const g = makePocketGame(sideIdx, { ballSaveSteps: 0 });
      tiltInPocket(g, sideIdx);
      for (let i = 0; i < RED_RUN_STEPS; i++) g.step();

      expect(g.session.getState(), `${side}: still tilted after ${RED_RUN_STEPS} steps`).toBe(
        "tilted",
      );
      expect(g.drainedIds, `${side}: no drain event`).toEqual([]);
      const d = pocketDistance(g, sideIdx);
      expect(d, `${side}: ball still in the pocket (d=${d.toFixed(4)} m)`).toBeLessThan(
        POCKET_TOL_M,
      );
      const b = activeBall(g);
      const speed = b ? Math.hypot(b.vx, b.vy) : Number.POSITIVE_INFINITY;
      expect(speed, `${side}: ball at rest`).toBeLessThan(STILL_SPEED);
      expect(g.session.onStart(), `${side}: onStart() refused while tilted`).toBe(false);
      expect(g.session.getBall()).toBe(1);
    });

    it(`a tilted ${side} hinge-pocket ball is searched free, drains as a forfeit, and the next ball is served`, () => {
      const g = makePocketGame(sideIdx, { ballSaveSteps: 0 });
      tiltInPocket(g, sideIdx);
      const id = g.session.activeBallId;
      const tiltStep = g.session.getStep();

      let n = 0;
      while (!g.drainedIds.includes(id)) {
        if (n++ >= SEARCH_CAP_STEPS) {
          throw new Error(
            `${side}: no bus drain of ball ${id} within ${SEARCH_CAP_STEPS} steps of the tilt (session step ${g.session.getStep()}, state ${g.session.getState()})`,
          );
        }
        g.step();
      }
      const drainStep = g.session.getStep();

      expect(
        g.session.getState(),
        `${side}: drained at session step ${drainStep} (tilt ${tiltStep})`,
      ).toBe("bonus");
      expect(g.session.isBonusForfeit(), `${side}: the tilted ball is a forfeit`).toBe(true);
      expect(g.session.getNudgeCount(), `${side}: the search is not a nudge`).toBe(TILT_NUDGES);

      let s = 0;
      while (g.session.getState() !== "playing") {
        if (s++ >= SERVE_CAP_STEPS) {
          throw new Error(
            `${side}: next ball not served within ${SERVE_CAP_STEPS} steps of the drain`,
          );
        }
        g.step();
      }
      expect(g.session.getBall(), `${side}: ball 2 served`).toBe(2);
    });
  }
});
