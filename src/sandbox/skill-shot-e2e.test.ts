import { describe, it, expect, vi } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { isRestingInZone, PlungerController } from "../control/plunger-controller";
import { GameSession, type FlipperGate } from "../game/game-session";
import { ReactiveElements } from "../game/reactive-elements";
import {
  PLUNGER_HINT_SETTLE_STEPS,
  ROLLOVER_POINTS,
  SKILL_SHOT_BASE_POINTS,
  SKILL_SHOT_ROTATE_STEPS,
} from "../game/tuning";
import { FlipperInput, type KeyEventLike } from "../input/flipper-input";
import { GameInput } from "../input/game-input";
import { PlungerInput } from "../input/plunger-input";
import { FIXED_DT, PLUNGER_CHARGE_RATE, PLUNGER_MAX_CHARGE } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallState, CollisionEvent } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST, PLUNGER_ZONE } from "../table/spec";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * The skill shot on the real table (plan 06-01, PLSH-05, D-01..D-05): the same
 * composition `main.ts` builds (game-e2e's makeGame) plus the two 06-01 seams,
 * the plunger passed to `GameSession` through `GameSessionOptions` and the
 * session passed to `ReactiveElements` as its rule hooks. Driven by synthetic
 * keys, no mocks.
 *
 * D-05 anchor: a release after exactly 62 charging steps (charge 0.775) from a
 * settled ball on PLUNGER_REST sends the ball first to rollover 401 (the 81-step
 * probe in 06-RESEARCH Pattern 2). With 401 lit that is a skill shot.
 */

/** Steps until a held charge reaches the cap (the clamp lands on this step). */
const STEPS_TO_CAP = Math.ceil(PLUNGER_MAX_CHARGE / (PLUNGER_CHARGE_RATE * FIXED_DT));

/** D-05: the anchor hold, in charging steps. */
const ANCHOR_HOLD_STEPS = 62;

/** A full-charge hold: past the cap, so the charge is clamped at 1. */
const FULL_HOLD_STEPS = STEPS_TO_CAP + 10;

/**
 * Settle after the serve, in fixed steps (the probe's settle). The serve step
 * plus 120 settle steps lands inside the 401 window (updates 72..143).
 */
const ANCHOR_SETTLE_STEPS = 120;

/**
 * Settle that lands back in a 400 window after one full rotation (updates
 * 216..287): the ball is as settled as in the probe, with 400 lit.
 */
const WRAP_400_SETTLE_STEPS = 230;

/** Cap on the wait for the first scoring switch after a release: 10 s. */
const SWITCH_CAP_STEPS = Math.round(10 / FIXED_DT);

const FRAME_60_HZ = 1000 / 60;
const FRAME_120_HZ = 1000 / 120;
const FRAME_144_HZ = 1000 / 144;

/** The scoring-switch kinds the skill shot resolves on. */
const SWITCH_KINDS = new Set(["rollover", "lane", "bumper", "slingshot"]);

function key(code: string): KeyEventLike {
  return { code, repeat: false, preventDefault: () => {} };
}
const SPACE = key("Space");
const ENTER = key("Enter");
const KEY_X = key("KeyX");

interface SwitchHit {
  readonly kind: string;
  readonly elementId: number;
}

interface Game {
  readonly world: PlanckWorld;
  readonly session: GameSession;
  readonly reactive: ReactiveElements;
  readonly plunger: PlungerController;
  readonly plungerInput: PlungerInput;
  readonly gameInput: GameInput;
  /** Called at the top of every fixed step with its 0-based index, before the step body. */
  preStep: ((stepIndex: number) => void) | null;
  /** First scoring switch seen on the bus since `watchSwitches()`, or null. */
  firstSwitch(): SwitchHit | null;
  /** Start recording the first scoring switch from now on. */
  watchSwitches(): void;
  /** One render frame of `deltaMs`; returns the fixed steps it ran. */
  frame(deltaMs: number): number;
  /** The ball in play; throws if it is not on the table. */
  ball(): BallState;
}

/** Mirror of `main.ts`'s composition and step bodies, with the 06-01 seams. */
function makeGame(): Game {
  const world = new PlanckWorld();

  const input = new FlipperInput();
  const controller = new FlipperController(world);

  const plungerInput = new PlungerInput();
  const plunger = new PlungerController(world);

  const gameInput = new GameInput();

  const router = new CollisionRouter(world);

  const flippersByX = world
    .getFlippers()
    .slice()
    .sort((a, b) => a.pivotX - b.pivotX);
  const leftFlipperId = flippersByX[0]?.id ?? 0;
  const rightFlipperId = flippersByX[1]?.id ?? leftFlipperId;

  const flipperGate: FlipperGate = {
    setEnabled(on: boolean): void {
      controller.setEnabled(on);
      if (!on) return;
      if (input.isHeld("left")) controller.onPressEdge(leftFlipperId);
      if (input.isHeld("right")) controller.onPressEdge(rightFlipperId);
    },
  };

  const session = new GameSession(
    world,
    router,
    { x: PLUNGER_REST.x, y: PLUNGER_REST.y },
    flipperGate,
    { plunger },
  );
  const reactive = new ReactiveElements(world, router, session, undefined, session);

  const loop = new FixedStepLoop(world);

  let watching = false;
  let first: SwitchHit | null = null;
  router.register((e: CollisionEvent) => {
    if (!watching || first !== null) return;
    if (SWITCH_KINDS.has(e.elementKind)) first = { kind: e.elementKind, elementId: e.elementId };
  });

  let stepIndex = 0;
  function onFixedStep(): void {
    game.preStep?.(stepIndex);
    stepIndex++;

    const edges = input.drainEdges();
    if (edges.leftPress) controller.onPressEdge(leftFlipperId);
    if (edges.leftRelease) controller.onReleaseEdge(leftFlipperId);
    if (edges.rightPress) controller.onPressEdge(rightFlipperId);
    if (edges.rightRelease) controller.onReleaseEdge(rightFlipperId);
    controller.update();

    const pe = plungerInput.drainEdges();
    plunger.applyEdges(
      pe.press,
      pe.release,
      pe.cancel,
      plungerInput.isHeld(),
      session.activeBallId,
    );
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

  const game: Game = {
    world,
    session,
    reactive,
    plunger,
    plungerInput,
    gameInput,
    preStep: null,
    firstSwitch: () => first,
    watchSwitches: () => {
      watching = true;
      first = null;
    },
    frame: (deltaMs) => loop.advance(deltaMs, onFixedStep, onPostStep),
    ball: () => {
      const id = session.activeBallId;
      const b = world.getBalls().find((x) => x.id === id);
      if (!b) throw new Error(`active ball ${id} missing`);
      return b;
    },
  };
  return game;
}

/** Run 120 Hz frames (one fixed step each) for `steps` steps. */
function runSteps(g: Game, steps: number): void {
  let done = 0;
  while (done < steps) done += g.frame(FRAME_120_HZ);
}

/** Press and release Enter, then run the one fixed step that starts the game. */
function pressEnter(g: Game): void {
  g.gameInput.handleKeyDown(ENTER);
  g.gameInput.handleKeyUp(ENTER);
  runSteps(g, 1);
}

/**
 * Hold Space for exactly `holdSteps` charging updates and release: the press
 * lands on the first step (which charges once), the release on the step after
 * the last charging one. Starts watching for the first switch at the release.
 */
function launch(g: Game, holdSteps: number): void {
  g.plungerInput.handleKeyDown(SPACE);
  runSteps(g, holdSteps);
  g.plungerInput.handleKeyUp(SPACE);
  g.watchSwitches();
}

interface FirstSwitchResult {
  readonly hit: SwitchHit;
  /** Score just before the step that delivered the first switch. */
  readonly scoreBefore: number;
  /** Score right after that step. */
  readonly scoreAfter: number;
}

/** Run 120 Hz steps until the first scoring switch after the release. */
function runToFirstSwitch(g: Game): FirstSwitchResult {
  for (let steps = 0; steps < SWITCH_CAP_STEPS;) {
    const scoreBefore = g.session.getScore();
    steps += g.frame(FRAME_120_HZ);
    const hit = g.firstSwitch();
    if (hit) return { hit, scoreBefore, scoreAfter: g.session.getScore() };
  }
  throw new Error(`no scoring switch within ${SWITCH_CAP_STEPS} steps of the release`);
}

describe("skill shot on the real table (PLSH-05, D-01..D-05)", () => {
  it("D-05 anchor: N=62 with 401 lit hits rollover 401 first and awards the skill shot", () => {
    const g = makeGame();
    pressEnter(g);
    expect(g.session.getSkillPhase()).toBe("rotating");
    expect(g.session.getSkillLitLane()).toBe(400);
    runSteps(g, ANCHOR_SETTLE_STEPS);
    expect(g.session.getSkillLitLane()).toBe(401);
    expect(Math.hypot(g.ball().vx, g.ball().vy)).toBeLessThan(0.05);

    launch(g, ANCHOR_HOLD_STEPS);
    expect(g.session.getSkillPhase()).toBe("frozen");
    expect(g.session.getSkillLitLane()).toBe(401);

    const r = runToFirstSwitch(g);
    expect(g.plunger.getLastReleaseCharge()).toBe(
      ANCHOR_HOLD_STEPS * PLUNGER_CHARGE_RATE * FIXED_DT,
    );
    expect(r.hit).toEqual({ kind: "rollover", elementId: 401 });
    expect(g.session.getSkillShotCount()).toBe(1);
    expect(g.session.getLastSkillValue()).toBe(SKILL_SHOT_BASE_POINTS);
    expect(g.session.getLastSkillLane()).toBe(401);
    expect(g.session.getLastSkillStep()).toBe(g.session.getStep());
    expect(r.scoreAfter - r.scoreBefore).toBe(ROLLOVER_POINTS + 5000);
    expect(g.session.getSkillPhase()).toBe("off");
    // The lit rollover still lights through the normal rule (D-04).
    expect(g.reactive.isLit(401)).toBe(true);
  });

  it("the same N=62 shot with 400 lit hits 401 and awards nothing", () => {
    const g = makeGame();
    pressEnter(g);
    runSteps(g, WRAP_400_SETTLE_STEPS);
    expect(g.session.getSkillLitLane()).toBe(400);

    launch(g, ANCHOR_HOLD_STEPS);
    expect(g.session.getSkillLitLane()).toBe(400);

    const r = runToFirstSwitch(g);
    expect(r.hit).toEqual({ kind: "rollover", elementId: 401 });
    expect(g.session.getSkillShotCount()).toBe(0);
    expect(g.session.getLastSkillValue()).toBe(0);
    expect(r.scoreAfter - r.scoreBefore).toBe(ROLLOVER_POINTS);
    expect(g.session.getSkillPhase()).toBe("off");
  });

  it("a full plunge is never a skill shot", () => {
    const g = makeGame();
    pressEnter(g);
    runSteps(g, ANCHOR_SETTLE_STEPS);
    launch(g, FULL_HOLD_STEPS);
    expect(g.session.getSkillPhase()).toBe("frozen");

    const r = runToFirstSwitch(g);
    expect(g.plunger.getLastReleaseCharge()).toBe(1);
    expect(r.hit.kind).not.toBe("rollover");
    expect(g.session.getSkillShotCount()).toBe(0);
    expect(g.session.getSkillPhase()).toBe("off");
  });
});

/** A weak plunge: below the 0.637 fall-back edge (D-01), so the ball returns. */
const WEAK_HOLD_STEPS = 40;

/** Run single steps until `done()` holds; throws after `cap` steps. */
function runUntil(g: Game, done: () => boolean, cap = SWITCH_CAP_STEPS): void {
  for (let steps = 0; !done(); steps++) {
    if (steps >= cap) throw new Error(`condition not reached within ${cap} steps`);
    runSteps(g, 1);
  }
}

describe("skill shot arming on the real table (D-03)", () => {
  it("a launched ball keeps the lane frozen from the release step to its first switch", () => {
    const g = makeGame();
    pressEnter(g);
    runSteps(g, ANCHOR_SETTLE_STEPS);
    launch(g, ANCHOR_HOLD_STEPS);
    // The release step reads the pre-impulse snapshot (ball still at rest);
    // that must not reopen the rotation under a ball that is leaving.
    while (g.firstSwitch() === null) {
      runSteps(g, 1);
      if (g.firstSwitch() !== null) break;
      expect(g.session.getSkillPhase()).toBe("frozen");
      expect(g.session.getSkillLitLane()).toBe(401);
    }
    expect(g.session.getSkillShotCount()).toBe(1);
  });

  it("a N=40 weak plunge falls back and reopens the rotation; a N=62 relaunch with 401 lit awards 5000", () => {
    const g = makeGame();
    pressEnter(g);
    runSteps(g, ANCHOR_SETTLE_STEPS); // 401 lit
    launch(g, WEAK_HOLD_STEPS);
    expect(g.session.getSkillPhase()).toBe("frozen");

    runUntil(g, () => g.session.getSkillPhase() === "rotating");
    expect(g.plunger.getPhase()).toBe("idle");
    expect(isRestingInZone(g.ball(), PLUNGER_ZONE)).toBe(true);
    expect(g.firstSwitch()).toBeNull(); // it never left the lane
    expect(g.session.getSkillLitLane()).toBe(401); // resumes from the frozen lane
    expect(g.session.getScore()).toBe(0);

    // One full rotation later 401 is lit again, with the ball long settled.
    runSteps(g, 3 * SKILL_SHOT_ROTATE_STEPS);
    expect(g.session.getSkillLitLane()).toBe(401);
    launch(g, ANCHOR_HOLD_STEPS);
    const r = runToFirstSwitch(g);
    expect(r.hit).toEqual({ kind: "rollover", elementId: 401 });
    expect(g.session.getSkillShotCount()).toBe(1);
    expect(g.session.getLastSkillValue()).toBe(5000);
    expect(r.scoreAfter - r.scoreBefore).toBe(ROLLOVER_POINTS + 5000);
  });

  it("four nudges 32 steps apart after a N=62 launch tilt the ball before its first switch: no skill shot", () => {
    const g = makeGame();
    pressEnter(g);
    runSteps(g, ANCHOR_SETTLE_STEPS); // 401 lit
    launch(g, ANCHOR_HOLD_STEPS);
    runSteps(g, 1); // the release step
    for (let n = 0; n < 4; n++) {
      g.gameInput.handleKeyDown(KEY_X);
      g.gameInput.handleKeyUp(KEY_X);
      runSteps(g, n < 3 ? 32 : 1);
    }
    expect(g.session.getState()).toBe("tilted");
    expect(g.firstSwitch()).toBeNull();
    expect(g.session.getSkillPhase()).toBe("off");
    expect(g.session.getSkillLitLane()).toBe(-1);

    // Whatever the dead ball touches next scores nothing and awards no skill shot.
    runUntil(g, () => g.firstSwitch() !== null || g.session.getBall() === 2);
    expect(g.session.getSkillShotCount()).toBe(0);
    expect(g.session.getLastSkillValue()).toBe(0);
    expect(g.session.getScore()).toBe(0);
  });
});

/**
 * Cadence independence (D-23, threat T-6-01): the anchor scenario, its keys
 * keyed by fixed-step index (the game.determinism.test.ts pattern), driven at
 * 60, 120 and 144 Hz frame cadences for the same real time. TOTAL_MS is parked
 * in the middle of a fixed step so float summation cannot move the step count.
 */
describe("skill shot determinism across render cadences (D-23)", () => {
  const STEP_MS = FIXED_DT * 1000;
  const EXPECTED_STEPS = 1200;
  const TOTAL_MS = (EXPECTED_STEPS + 0.5) * STEP_MS;
  const ENTER_STEP = 10;
  const PRESS_STEP = ENTER_STEP + 1 + ANCHOR_SETTLE_STEPS;
  const RELEASE_STEP = PRESS_STEP + ANCHOR_HOLD_STEPS;

  interface Outcome {
    readonly steps: number;
    readonly score: number;
    readonly count: number;
    readonly ball: number;
    readonly balls: readonly { x: number; y: number; vx: number; vy: number }[];
  }

  function play(frameMs: number): Outcome {
    const g = makeGame();
    g.preStep = (i) => {
      if (i === ENTER_STEP) {
        g.gameInput.handleKeyDown(ENTER);
        g.gameInput.handleKeyUp(ENTER);
      } else if (i === PRESS_STEP) {
        g.plungerInput.handleKeyDown(SPACE);
      } else if (i === RELEASE_STEP) {
        g.plungerInput.handleKeyUp(SPACE);
      }
    };
    const fullFrames = Math.floor(TOTAL_MS / frameMs);
    let steps = 0;
    for (let i = 0; i < fullFrames; i++) steps += g.frame(frameMs);
    const remainder = TOTAL_MS - fullFrames * frameMs;
    if (remainder > 0) steps += g.frame(remainder);
    return {
      steps,
      score: g.session.getScore(),
      count: g.session.getSkillShotCount(),
      ball: g.session.getBall(),
      balls: g.world.getBalls().map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
    };
  }

  it("the anchor gives the same score, count, ball and ball state at 60, 120 and 144 Hz", () => {
    const a = play(FRAME_60_HZ);
    const b = play(FRAME_120_HZ);
    const c = play(FRAME_144_HZ);
    for (const run of [a, b, c]) {
      expect(run.steps).toBe(EXPECTED_STEPS);
      expect(run.count).toBe(1); // not vacuous: every run made the skill shot
    }
    expect(b.score).toBe(a.score);
    expect(c.score).toBe(a.score);
    expect(b.count).toBe(a.count);
    expect(c.count).toBe(a.count);
    expect(b.ball).toBe(a.ball);
    expect(c.ball).toBe(a.ball);
    expect(b.balls).toEqual(a.balls);
    expect(c.balls).toEqual(a.balls);
  });
});

/**
 * The bar hint's ready signal on the real table (06.4.1.1 D-01, D-02, D-10):
 * the signal waits PLUNGER_HINT_SETTLE_STEPS consecutive resting steps, then
 * holds through a held charge (the plunger has no body, so charging never
 * moves the ball), drops right after a release and returns once when a weak
 * plunge falls back to rest. The fall-back check (06.4.1.1-REVIEW WR-01)
 * asserts the rest, not the first bounce apex: once ready the signal stays
 * true and the ball is still.
 */
describe("plunger hint signal on the real table (06.4.1.1 D-01, D-02)", () => {
  it("is true on every step of a held charge", () => {
    const g = makeGame();
    expect(g.session.isBallOnPlunger()).toBe(false); // attract: no ball in play
    pressEnter(g);
    runSteps(g, ANCHOR_SETTLE_STEPS);
    expect(g.session.isBallOnPlunger()).toBe(true);

    g.plungerInput.handleKeyDown(SPACE);
    for (let i = 0; i < WEAK_HOLD_STEPS; i++) {
      runSteps(g, 1);
      expect(g.plunger.getPhase(), `step ${i}`).toBe("charging");
      expect(g.session.isBallOnPlunger(), `step ${i}`).toBe(true);
    }
    g.plungerInput.handleKeyUp(SPACE);
  });

  it("a served ball shows the signal on the PLUNGER_HINT_SETTLE_STEPS-th step counting the Enter step (06.4.1.1 D-04, D-10)", () => {
    const g = makeGame();
    pressEnter(g); // the Enter step serves the ball and already counts it at rest
    expect(g.session.isBallOnPlunger()).toBe(false);
    for (let i = 0; i < PLUNGER_HINT_SETTLE_STEPS - 2; i++) {
      runSteps(g, 1);
      expect(g.session.isBallOnPlunger(), `step ${i + 2} counting the Enter step`).toBe(false);
    }
    runSteps(g, 1);
    expect(g.session.isBallOnPlunger()).toBe(true);
  });

  it.each([10, WEAK_HOLD_STEPS])(
    "drops after a weak release (hold %i) and returns once, at rest, with no apex blink (06.4.1.1 D-10, WR-01)",
    (hold) => {
      const g = makeGame();
      pressEnter(g);
      runSteps(g, ANCHOR_SETTLE_STEPS);
      expect(g.session.isBallOnPlunger()).toBe(true);

      launch(g, hold);
      runUntil(g, () => !g.session.isBallOnPlunger(), 3);

      runUntil(g, () => g.session.isBallOnPlunger());
      for (let i = 0; i < 60; i++) {
        runSteps(g, 1);
        expect(g.session.isBallOnPlunger(), `step ${i} after first ready`).toBe(true);
      }
      const b = g.ball();
      expect(Math.hypot(b.vx, b.vy)).toBe(0);
      expect(g.plunger.getPhase()).toBe("idle");
      expect(isRestingInZone(b, PLUNGER_ZONE)).toBe(true);
      expect(g.firstSwitch()).toBeNull(); // it never left the lane
    },
  );
});
