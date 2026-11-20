import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { PlungerController } from "../control/plunger-controller";
import { GameSession } from "../game/game-session";
import { ReactiveElements } from "../game/reactive-elements";
import { FlipperInput, type KeyEventLike } from "../input/flipper-input";
import { GameInput } from "../input/game-input";
import { PlungerInput } from "../input/plunger-input";
import { FIXED_DT, PLUNGER_CHARGE_RATE, PLUNGER_MAX_CHARGE } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallId, BallState } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST, PLUNGER_ZONE } from "../table/spec";

/**
 * Headless no-mock proof of the whole game (plan 04-05, GAME-02): the same
 * composition `main.ts` builds, in the same order, with the same `onFixedStep`
 * and `onPostStep` bodies, driven by synthetic keys on the real table.
 *
 * Composition: a no-options `PlanckWorld` (TABLE_SPEC), `FlipperInput` and
 * `FlipperController` (before any ball, so both bats rest at motor 0),
 * `PlungerInput`, `PlungerController`, `GameInput`, `CollisionRouter`,
 * `GameSession` (serving at PLUNGER_REST), `ReactiveElements` and the real
 * `FixedStepLoop`. The flippers are never pressed, so every launched ball
 * eventually drains (the 04-03 dead-flipper energy bound).
 */

/** Steps until a held charge reaches the cap (the clamp lands on this step). */
const STEPS_TO_CAP = Math.ceil(PLUNGER_MAX_CHARGE / (PLUNGER_CHARGE_RATE * FIXED_DT));

/** Settle steps for a freshly served ball on the plunger. */
const SETTLE_STEPS = 60;

/** Per-ball cap on the wait for the drain: 60 simulated seconds. */
const DRAIN_CAP_STEPS = Math.round(60 / FIXED_DT);

/** One fixed step per render frame. */
const FRAME_120_HZ = 1000 / 120;

/**
 * Ball 1's plunger hold: a part charge that sends the ball through top rollover
 * 401 (lighting it) and then on to the drain on this table, so the restart's
 * light reset has a lit rollover to clear. Balls 2 and 3 use a full charge.
 */
const LIGHTING_HOLD_STEPS = 62;

/** A full-charge hold: past the cap, so the charge is clamped at 1. */
const FULL_HOLD_STEPS = STEPS_TO_CAP + 10;

/** The top rollovers (spec ids 400..402). */
const ROLLOVER_IDS = [400, 401, 402] as const;

function key(code: string): KeyEventLike {
  return { code, repeat: false, preventDefault: () => {} };
}
const SPACE = key("Space");
const ENTER = key("Enter");

interface Game {
  readonly world: PlanckWorld;
  readonly session: GameSession;
  readonly reactive: ReactiveElements;
  readonly plunger: PlungerController;
  readonly plungerInput: PlungerInput;
  readonly gameInput: GameInput;
  readonly chuteTopY: number;
  /** Every drain event seen on the bus, in order. */
  readonly drainedIds: BallId[];
  /** One render frame of `deltaMs`; returns the fixed steps it ran. */
  frame(deltaMs: number): number;
  /** The ball in play; throws if it is not on the table. */
  ball(): BallState;
}

/** Mirror of `main.ts`'s composition and step bodies. */
function makeGame(): Game {
  const world = new PlanckWorld();

  const input = new FlipperInput();
  const controller = new FlipperController(world);

  const plungerInput = new PlungerInput();
  const plunger = new PlungerController(world);

  const gameInput = new GameInput();

  const router = new CollisionRouter(world);
  const session = new GameSession(world, router, { x: PLUNGER_REST.x, y: PLUNGER_REST.y });
  const reactive = new ReactiveElements(world, router, session);

  const loop = new FixedStepLoop(world);

  const flippersByX = world
    .getFlippers()
    .slice()
    .sort((a, b) => a.pivotX - b.pivotX);
  const leftFlipperId = flippersByX[0]?.id ?? 0;
  const rightFlipperId = flippersByX[1]?.id ?? leftFlipperId;

  const drainedIds: BallId[] = [];
  router.register((e) => {
    if (e.elementKind === "drain") drainedIds.push(e.ballId);
  });

  function onFixedStep(): void {
    const edges = input.drainEdges();
    if (edges.leftPress) controller.onPressEdge(leftFlipperId);
    if (edges.leftRelease) controller.onReleaseEdge(leftFlipperId);
    if (edges.rightPress) controller.onPressEdge(rightFlipperId);
    if (edges.rightRelease) controller.onReleaseEdge(rightFlipperId);
    controller.update();

    const pe = plungerInput.drainEdges();
    plunger.applyEdges(pe.press, pe.release, pe.cancel, plungerInput.isHeld(), session.activeBallId);
    plunger.update();

    const ge = gameInput.drainEdges();
    if (ge.start && session.onStart()) reactive.resetLights();
  }
  function onPostStep(): void {
    router.dispatch();
    reactive.service();
    session.service();
  }

  const chute = world.getElements().find((el) => el.kind === "chute");
  if (!chute) throw new Error("table has no chute");
  const chuteTopY = Math.min(...chute.vertices.map((v) => v.y));

  return {
    world,
    session,
    reactive,
    plunger,
    plungerInput,
    gameInput,
    chuteTopY,
    drainedIds,
    frame: (deltaMs) => loop.advance(deltaMs, onFixedStep, onPostStep),
    ball: () => {
      const id = session.activeBallId;
      const b = world.getBalls().find((x) => x.id === id);
      if (!b) throw new Error(`active ball ${id} missing`);
      return b;
    },
  };
}

/** Run render frames of `deltaMs` until `steps` fixed steps have elapsed. */
function runSteps(g: Game, deltaMs: number, steps: number): void {
  let done = 0;
  while (done < steps) done += g.frame(deltaMs);
}

/** Press and release Enter, then run one fixed step. */
function pressEnter(g: Game): void {
  g.gameInput.handleKeyDown(ENTER);
  g.gameInput.handleKeyUp(ENTER);
  runSteps(g, FRAME_120_HZ, 1);
}

function inZone(b: { x: number; y: number }): boolean {
  const z = PLUNGER_ZONE;
  return b.x >= z.minX && b.x <= z.maxX && b.y >= z.minY && b.y <= z.maxY;
}

/** Settle, hold Space for `holdSteps`, release, then run until the ball in play drains. */
function launchAndDrain(g: Game, holdSteps: number): { scoreBefore: number; scoreAfter: number } {
  runSteps(g, FRAME_120_HZ, SETTLE_STEPS);
  g.plungerInput.handleKeyDown(SPACE);
  runSteps(g, FRAME_120_HZ, holdSteps);
  g.plungerInput.handleKeyUp(SPACE);

  const id = g.session.activeBallId;
  for (let steps = 0; steps < DRAIN_CAP_STEPS; ) {
    const scoreBefore = g.session.getScore();
    steps += g.frame(FRAME_120_HZ);
    if (g.drainedIds.includes(id)) return { scoreBefore, scoreAfter: g.session.getScore() };
  }
  throw new Error(`ball ${id} did not drain within ${DRAIN_CAP_STEPS} steps`);
}

describe("game e2e (GAME-02): Enter, three balls on the real table, game over, restart", () => {
  it("plays a full 3-ball game through the main.ts composition", () => {
    const g = makeGame();

    // Boot: attract, no ball, and the plunger has nothing to launch.
    expect(g.world.getBalls()).toHaveLength(0);
    expect(g.session.getState()).toBe("game-over");
    expect(g.session.hasPlayed()).toBe(false);
    expect(g.session.activeBallId).toBe(-1);
    g.plungerInput.handleKeyDown(SPACE);
    runSteps(g, FRAME_120_HZ, FULL_HOLD_STEPS);
    g.plungerInput.handleKeyUp(SPACE);
    runSteps(g, FRAME_120_HZ, 60);
    expect(g.world.getBalls()).toHaveLength(0);
    expect(g.session.getState()).toBe("game-over");

    // Enter starts a game: one ball parked in the plunger zone.
    pressEnter(g);
    expect(g.session.getState()).toBe("playing");
    expect(g.session.getBall()).toBe(1);
    expect(g.session.getScore()).toBe(0);
    expect(g.world.getBalls()).toHaveLength(1);
    expect(inZone(g.ball())).toBe(true);
    expect(g.ball().x).toBeCloseTo(PLUNGER_REST.x, 9);

    for (let n = 1; n <= 3; n++) {
      expect(g.session.getBall()).toBe(n);
      if (n === 2) {
        // Enter mid-game is ignored.
        const id = g.session.activeBallId;
        pressEnter(g);
        expect(g.session.getBall()).toBe(2);
        expect(g.session.activeBallId).toBe(id);
        expect(g.world.getBalls()).toHaveLength(1);
      }
      const drained = g.session.activeBallId;
      const { scoreBefore, scoreAfter } = launchAndDrain(
        g,
        n === 1 ? LIGHTING_HOLD_STEPS : FULL_HOLD_STEPS,
      );
      // Lights persist across balls: rollover 401 stays lit from ball 1 on.
      expect(g.reactive.isLit(401)).toBe(true);

      if (n < 3) {
        expect(g.session.getState()).toBe("playing");
        expect(g.session.getBall()).toBe(n + 1);
        expect(g.session.activeBallId).not.toBe(drained);
        const balls = g.world.getBalls();
        expect(balls).toHaveLength(1);
        expect(balls[0]?.id).toBe(g.session.activeBallId);
        expect(balls[0]?.x).toBe(PLUNGER_REST.x);
        expect(balls[0]?.y).toBe(PLUNGER_REST.y);
      } else {
        expect(g.session.getState()).toBe("game-over");
        expect(g.world.getBalls()).toHaveLength(0);
        expect(g.session.activeBallId).toBe(-1);
        expect(g.session.isLive()).toBe(false);
        expect(scoreAfter).toBe(scoreBefore);
        runSteps(g, FRAME_120_HZ, 120);
        expect(g.session.getScore()).toBe(scoreBefore);
        expect(g.world.getBalls()).toHaveLength(0);
      }
    }
    expect(g.session.getScore()).toBeGreaterThan(0);

    // Enter after game over: a fresh game at 0 with every light off (R12).
    pressEnter(g);
    expect(g.session.getState()).toBe("playing");
    expect(g.session.getBall()).toBe(1);
    expect(g.session.getScore()).toBe(0);
    expect(g.world.getBalls()).toHaveLength(1);
    for (const r of ROLLOVER_IDS) expect(g.reactive.isLit(r)).toBe(false);
  });
});
