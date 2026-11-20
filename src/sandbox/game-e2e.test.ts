import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { PlungerController } from "../control/plunger-controller";
import { GameSession } from "../game/game-session";
import { ReactiveElements } from "../game/reactive-elements";
import { FlipperInput, type KeyEventLike } from "../input/flipper-input";
import { GameInput } from "../input/game-input";
import { PlungerInput } from "../input/plunger-input";
import { NUDGE_COOLDOWN_STEPS, NUDGE_IMPULSE } from "../game/tuning";
import {
  BALL_LINEAR_DAMPING,
  FIXED_DT,
  PLUNGER_CHARGE_RATE,
  PLUNGER_MAX_CHARGE,
  ballMass,
} from "../physics/constants";
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
 *
 * It also carries the real-world cases of the retired sandbox ball feed
 * (03-REVIEW CR-01) into a started game: the parked ball sits BELOW the drain
 * line (PLUNGER_REST.y 6.2 > DRAIN_Y 6.05), so only a bus drain may replace it;
 * a launch at real render cadences keeps the same ball; and the IN-02 plunger
 * fix is proven live through `applyEdges` with `isHeld()`.
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
  /** Every ball id that appeared in any bus event. */
  readonly touchedIds: Set<BallId>;
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
  const touchedIds = new Set<BallId>();
  router.register((e) => {
    if (e.elementKind === "drain") drainedIds.push(e.ballId);
    touchedIds.add(e.ballId);
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
    if (ge.nudgeLeft) session.onNudge("left");
    if (ge.nudgeRight) session.onNudge("right");
    if (ge.nudgeUp) session.onNudge("up");
    session.tick();
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
    touchedIds,
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

/** Press and release Enter, then run one render frame's worth of fixed steps. */
function pressEnter(g: Game, deltaMs = FRAME_120_HZ): void {
  g.gameInput.handleKeyDown(ENTER);
  g.gameInput.handleKeyUp(ENTER);
  runSteps(g, deltaMs, 1);
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

const RATES_HZ = [60, 120, 144] as const;

describe("ported ball-feed cases (CR-01) in a started game", () => {
  it("after Enter, the parked ball is never respawned while idle (120 Hz, 1 step/frame)", () => {
    const g = makeGame();
    pressEnter(g);
    const id = g.session.activeBallId;
    for (let i = 0; i < 600; i++) {
      g.frame(FRAME_120_HZ);
      expect(g.session.activeBallId).toBe(id);
      expect(g.world.getBalls()).toHaveLength(1);
    }
    expect(inZone(g.ball())).toBe(true);
    expect(g.session.getBall()).toBe(1);
  });

  for (const hz of RATES_HZ) {
    it(`a full-charge Space launch clears the chute top at ${hz} Hz`, () => {
      const g = makeGame();
      const dt = 1000 / hz;
      pressEnter(g, dt);
      runSteps(g, dt, SETTLE_STEPS);
      const id = g.session.activeBallId;

      g.plungerInput.handleKeyDown(SPACE);
      runSteps(g, dt, FULL_HOLD_STEPS);
      g.plungerInput.handleKeyUp(SPACE);

      let cleared = false;
      let steps = 0;
      while (!cleared && steps < Math.round(3 / FIXED_DT)) {
        steps += g.frame(dt);
        expect(g.session.activeBallId).toBe(id);
        if (g.ball().y < g.chuteTopY) cleared = true;
      }
      expect(cleared).toBe(true);
    });
  }

  it("a minimum-impulse tap at 60 Hz keeps the same ball: it climbs and falls back onto the plunger", () => {
    const g = makeGame();
    const dt = 1000 / 60;
    pressEnter(g, dt);
    runSteps(g, dt, SETTLE_STEPS);
    const id = g.session.activeBallId;
    const restY = g.ball().y;

    g.plungerInput.handleKeyDown(SPACE);
    g.frame(dt);
    g.plungerInput.handleKeyUp(SPACE);

    let minY = restY;
    for (let i = 0; i < 180; i++) {
      g.frame(dt);
      expect(g.session.activeBallId).toBe(id);
      minY = Math.min(minY, g.ball().y);
    }
    expect(restY - minY).toBeGreaterThan(0.3);
    expect(inZone(g.ball())).toBe(true);
  });
});

describe("IN-02 live: a release and re-press inside one fixed-step window", () => {
  it("launches the ball and starts a new charge", () => {
    const g = makeGame();
    pressEnter(g);
    runSteps(g, FRAME_120_HZ, SETTLE_STEPS);
    g.plungerInput.handleKeyDown(SPACE);
    runSteps(g, FRAME_120_HZ, 40);
    expect(g.plunger.getPhase()).toBe("charging");
    const id = g.session.activeBallId;

    // Both edges land before the next step drains the latch.
    g.plungerInput.handleKeyUp(SPACE);
    g.plungerInput.handleKeyDown(SPACE);
    runSteps(g, FRAME_120_HZ, 1);
    expect(g.plunger.getPhase()).toBe("charging");

    // Launched: the ball climbs on every one of the next 10 steps.
    let prevY = g.ball().y;
    for (let i = 0; i < 10; i++) {
      runSteps(g, FRAME_120_HZ, 1);
      const y = g.ball().y;
      expect(y).toBeLessThan(prevY);
      prevY = y;
    }
    expect(g.session.activeBallId).toBe(id);
    expect(g.plunger.getPhase()).toBe("charging");
    expect(g.plunger.getCharge()).toBeGreaterThan(0);
  });
});

/**
 * Nudge (plan 04-06 Task 1, GAME-03, R9): two identical games, A and B, run in
 * lockstep; only A gets the nudge key. An untracked free ball in open field
 * (below the bumper cluster, clear of every element) shows the nudge as a pure
 * velocity change: A minus B is one NUDGE_IMPULSE / m along +x, and the
 * positions differ only by that change integrated over one step, never a jump.
 */

/**
 * A free ball in open field below the bumper cluster. Every case asserts it
 * touches nothing in either world, so the point is proven clear, not assumed
 * (the plan point 1.45, 2.2 reached the upper-right bumper within the cooldown).
 */
const FREE_BALL = { x: 1.0, y: 3.8 } as const;
const KEY_X = key("KeyX");

/**
 * Per-step decay of a velocity difference between the twins: both feel the same
 * gravity, so their difference changes only by the ball's linear damping, which
 * Box2D applies as v *= 1 / (1 + dt * k) each step.
 */
const DAMP_PER_STEP = 1 / (1 + FIXED_DT * BALL_LINEAR_DAMPING);

/** Exactly one fixed step (a FIXED_DT frame on a drained accumulator). */
function stepOnce(g: Game): void {
  expect(g.frame(FRAME_120_HZ)).toBe(1);
}

function ballById(g: Game, id: BallId): BallState {
  const b = g.world.getBalls().find((x) => x.id === id);
  if (!b) throw new Error(`ball ${id} missing`);
  return b;
}

interface Twins {
  readonly a: Game;
  readonly b: Game;
  readonly freeA: BallId;
  readonly freeB: BallId;
}

/** Two lockstep games, started (or not), each with the same free ball added. */
function makeTwins(started: boolean): Twins {
  const a = makeGame();
  const b = makeGame();
  if (started) {
    pressEnter(a);
    pressEnter(b);
    runSteps(a, FRAME_120_HZ, SETTLE_STEPS);
    runSteps(b, FRAME_120_HZ, SETTLE_STEPS);
  }
  const freeA = a.world.addBall(FREE_BALL);
  const freeB = b.world.addBall(FREE_BALL);
  stepOnce(a);
  stepOnce(b);
  return { a, b, freeA, freeB };
}

/** Step both twins once. */
function stepBoth(t: Twins): void {
  stepOnce(t.a);
  stepOnce(t.b);
}

/** The free ball in A minus the free ball in B: velocity and position differences. */
function diff(t: Twins): { dvx: number; dvy: number; dx: number; dy: number } {
  const pa = ballById(t.a, t.freeA);
  const pb = ballById(t.b, t.freeB);
  return { dvx: pa.vx - pb.vx, dvy: pa.vy - pb.vy, dx: pa.x - pb.x, dy: pa.y - pb.y };
}

/** Press KeyX in A only (a genuine edge: keyup first, so it always latches). */
function nudgeA(t: Twins): void {
  t.a.gameInput.handleKeyUp(KEY_X);
  t.a.gameInput.handleKeyDown(KEY_X);
}

describe("nudge (GAME-03, R9): a velocity impulse, never a teleport", () => {
  it("KeyX changes the free ball velocity by NUDGE_IMPULSE / m along +x, and its position only by the integrated change", () => {
    const t = makeTwins(true);
    const dvExpected = NUDGE_IMPULSE / ballMass(ballById(t.a, t.freeA).radius);

    nudgeA(t);
    stepBoth(t);

    const d = diff(t);
    expect(Math.abs(d.dvx - dvExpected)).toBeLessThanOrEqual(0.03 * dvExpected);
    expect(Math.abs(d.dvy)).toBeLessThanOrEqual(0.03 * dvExpected);
    const dvMag = Math.hypot(d.dvx, d.dvy);
    const dpMag = Math.hypot(d.dx, d.dy);
    expect(dpMag).toBeGreaterThan(0);
    expect(dpMag).toBeLessThanOrEqual(1.05 * dvMag * FIXED_DT);
    // Open field: the free ball touched nothing in either world.
    expect(t.a.touchedIds.has(t.freeA)).toBe(false);
    expect(t.b.touchedIds.has(t.freeB)).toBe(false);
  });

  it("a second nudge inside NUDGE_COOLDOWN_STEPS does nothing; one at the cooldown adds another impulse", () => {
    const t = makeTwins(true);
    const dvExpected = NUDGE_IMPULSE / ballMass(ballById(t.a, t.freeA).radius);

    nudgeA(t);
    stepBoth(t); // the step of the first edge: accepted
    const once = diff(t).dvx;
    expect(Math.abs(once - dvExpected)).toBeLessThanOrEqual(0.03 * dvExpected);

    // Steps 1 .. COOLDOWN-1 after it: a fresh edge is refused (tried at 10 and
    // at the last one), so the difference only decays by the damping.
    let prev = once;
    for (let k = 1; k < NUDGE_COOLDOWN_STEPS; k++) {
      if (k === 10 || k === NUDGE_COOLDOWN_STEPS - 1) nudgeA(t);
      stepBoth(t);
      const now = diff(t).dvx;
      expect(Math.abs(now - prev * DAMP_PER_STEP)).toBeLessThan(1e-9);
      prev = now;
    }

    // Exactly NUDGE_COOLDOWN_STEPS after the first: accepted again, so the
    // difference grows by another impulse on top of the damped carry-over.
    nudgeA(t);
    stepBoth(t);
    const grown = diff(t).dvx - prev * DAMP_PER_STEP;
    expect(Math.abs(grown - dvExpected)).toBeLessThanOrEqual(0.03 * dvExpected);
    expect(t.a.touchedIds.has(t.freeA)).toBe(false);
    expect(t.b.touchedIds.has(t.freeB)).toBe(false);
  });

  it("before Enter (attract), KeyX leaves the free ball bit-identical to its un-nudged twin", () => {
    const t = makeTwins(false);
    expect(t.a.session.getState()).toBe("game-over");
    nudgeA(t);
    stepBoth(t);
    stepBoth(t);
    const pa = ballById(t.a, t.freeA);
    const pb = ballById(t.b, t.freeB);
    expect(pa.x).toBe(pb.x);
    expect(pa.y).toBe(pb.y);
    expect(pa.vx).toBe(pb.vx);
    expect(pa.vy).toBe(pb.vy);
  });
});
