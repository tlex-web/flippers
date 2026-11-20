import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { PlungerController } from "../control/plunger-controller";
import { GameSession, type FlipperGate, type GameState } from "../game/game-session";
import { ReactiveElements } from "../game/reactive-elements";
import { FlipperInput, type KeyEventLike } from "../input/flipper-input";
import { GameInput } from "../input/game-input";
import { PlungerInput } from "../input/plunger-input";
import { FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallState } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST } from "../table/spec";

/**
 * Replay determinism of the finished game (plan 04-08 Task 3, GAME-01..03,
 * threat T-04-18): the whole rules stack, not just the physics, is a pure
 * function of the fixed-step input timeline. The render cadence changes nothing.
 *
 * Three fresh games, each the exact `main.ts` composition (the same as
 * `game-e2e.test.ts`'s makeGame), are driven for the same real time at 60, 120
 * and 144 Hz render cadences. A scripted key timeline is injected by a wrapper
 * that runs BEFORE the composition's `onFixedStep`, keyed by the fixed-step
 * index, so each key lands on the same step whatever the frame chunking. The
 * script starts a game, launches ball 1, tilts it with four rapid nudges,
 * presses both flippers, and launches again.
 *
 * Asserted bit-identical across the three: the step count, the score, the ball
 * number, the state, `hasPlayed()`, every ball's (id, x, y, vx, vy, angle) and
 * both flipper angles. Each run must also have seen the tilt, so the proof
 * covers the cooldowns, the tilt meter decay, the serves through addBall's
 * priming step, the kicks and the flipper relay (the script is not vacuous).
 *
 * TOTAL_MS is parked in the middle of a fixed step, as in
 * `src/sim/loop.determinism.test.ts`, so float summation across cadences
 * cannot move the executed step count.
 */

const STEP_MS = FIXED_DT * 1000;

const FRAME_60_HZ = 1000 / 60;
const FRAME_120_HZ = 1000 / 120;
const FRAME_144_HZ = 1000 / 144;

/** 30 simulated seconds. */
const EXPECTED_STEPS = 3600;
const TOTAL_MS = (EXPECTED_STEPS + 0.5) * STEP_MS;

/** Which input a scripted key goes to. */
type Device = "flipper" | "plunger" | "game";

interface ScriptedKey {
  readonly step: number;
  readonly device: Device;
  readonly code: string;
  readonly down: boolean;
}

/** A down at `downAt` and an up at `upAt` on one device. */
function press(device: Device, code: string, downAt: number, upAt: number): ScriptedKey[] {
  return [
    { step: downAt, device, code, down: true },
    { step: upAt, device, code, down: false },
  ];
}

/**
 * The timeline (fixed-step indices, 0-based). The four nudges are 32 steps
 * apart, just past NUDGE_COOLDOWN_STEPS (30), so every one is accepted and the
 * fourth tilts with the R10 defaults. If the tilt tuning changes, move these
 * steps, not the assertions.
 */
const SCRIPT: readonly ScriptedKey[] = [
  ...press("game", "Enter", 10, 12),
  ...press("plunger", "Space", 80, 180),
  ...press("game", "KeyX", 400, 402),
  ...press("game", "KeyX", 432, 434),
  ...press("game", "KeyX", 464, 466),
  ...press("game", "KeyX", 496, 498),
  ...press("flipper", "KeyZ", 1600, 1700),
  ...press("flipper", "Slash", 1800, 1900),
  ...press("plunger", "Space", 2400, 2500),
].sort((a, b) => a.step - b.step);

function key(code: string): KeyEventLike {
  return { code, repeat: false, preventDefault: () => {} };
}

interface FlipperSample {
  readonly id: number;
  readonly angle: number;
}

interface Outcome {
  readonly steps: number;
  readonly totalSteps: number;
  readonly score: number;
  readonly ball: number;
  readonly state: GameState;
  readonly hasPlayed: boolean;
  readonly sawTilt: boolean;
  readonly balls: readonly BallState[];
  readonly flippers: readonly FlipperSample[];
}

/** Build the `main.ts` composition, play the script at `frameMs`, sample the end. */
function play(frameMs: number): Outcome {
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
  );
  const reactive = new ReactiveElements(world, router, session);

  const loop = new FixedStepLoop(world);

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

  // The script wrapper: deliver this step's keys, then run the composition's
  // step body, then note a tilt. Keyed by the fixed-step index only.
  let stepIndex = 0;
  let next = 0;
  let sawTilt = false;
  function scriptedStep(): void {
    while (next < SCRIPT.length) {
      const k = SCRIPT[next];
      if (!k || k.step !== stepIndex) break;
      const target = k.device === "flipper" ? input : k.device === "plunger" ? plungerInput : gameInput;
      if (k.down) target.handleKeyDown(key(k.code));
      else target.handleKeyUp(key(k.code));
      next++;
    }
    onFixedStep();
    if (session.getState() === "tilted") sawTilt = true;
    stepIndex++;
  }

  const fullFrames = Math.floor(TOTAL_MS / frameMs);
  let steps = 0;
  for (let i = 0; i < fullFrames; i++) steps += loop.advance(frameMs, scriptedStep, onPostStep);
  const remainder = TOTAL_MS - fullFrames * frameMs;
  if (remainder > 0) steps += loop.advance(remainder, scriptedStep, onPostStep);

  return {
    steps,
    totalSteps: loop.totalSteps,
    score: session.getScore(),
    ball: session.getBall(),
    state: session.getState(),
    hasPlayed: session.hasPlayed(),
    sawTilt,
    balls: world.getBalls().map((b) => ({ ...b })),
    flippers: world.getFlippers().map((f) => ({ id: f.id, angle: f.angle })),
  };
}

describe("game replay determinism across render cadences (GAME-01..03)", () => {
  it("the same key timeline gives the same game at 60, 120 and 144 Hz", () => {
    const a = play(FRAME_60_HZ);
    const b = play(FRAME_120_HZ);
    const c = play(FRAME_144_HZ);

    for (const run of [a, b, c]) {
      expect(run.steps).toBe(EXPECTED_STEPS);
      expect(run.totalSteps).toBe(EXPECTED_STEPS);
      // Not vacuous: every run started a game and tilted ball 1.
      expect(run.hasPlayed).toBe(true);
      expect(run.sawTilt).toBe(true);
      expect(run.ball).toBeGreaterThanOrEqual(2);
    }

    // Exact equality: identical step inputs and no hidden time or random source.
    expect(b.score).toBe(a.score);
    expect(c.score).toBe(a.score);
    expect(b.ball).toBe(a.ball);
    expect(c.ball).toBe(a.ball);
    expect(b.state).toBe(a.state);
    expect(c.state).toBe(a.state);
    expect(b.hasPlayed).toBe(a.hasPlayed);
    expect(c.hasPlayed).toBe(a.hasPlayed);
    expect(b.balls).toEqual(a.balls);
    expect(c.balls).toEqual(a.balls);
    expect(b.flippers).toEqual(a.flippers);
    expect(c.flippers).toEqual(a.flippers);
  });
});
