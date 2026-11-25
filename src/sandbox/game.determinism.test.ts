import { describe, it, expect, vi } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { isRestingInZone, PlungerController } from "../control/plunger-controller";
import { bonusDurationSteps } from "../game/bonus";
import { GameSession, type FlipperGate, type GameState, type SaveKind } from "../game/game-session";
import { ReactiveElements } from "../game/reactive-elements";
import { FlipperInput, type KeyEventLike } from "../input/flipper-input";
import { GameInput } from "../input/game-input";
import { PlungerInput } from "../input/plunger-input";
import { FIXED_DT, PLUNGER_CHARGE_RATE, PLUNGER_MAX_CHARGE } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallState } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST, PLUNGER_ZONE } from "../table/spec";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * Replay determinism of the finished game (plan 04-08 Task 3, GAME-01..03,
 * threat T-04-18; extended to the Phase-6 rules by plan 06-14, D-23): the whole
 * rules stack, not just the physics, is a pure function of the fixed-step input
 * timeline. The render cadence changes nothing.
 *
 * Three fresh games, each the exact `main.ts` composition (GameSession with
 * `{ plunger }`, the production ball-save window and the default in-memory high
 * score; the session as ReactiveElements' rule hooks; the flipper-press bonus
 * skip latch in the step body), are driven for the same real time at 60, 120
 * and 144 Hz render cadences. Keys are injected by a wrapper that runs BEFORE
 * the composition's `onFixedStep`, keyed by the fixed-step index, so each key
 * lands on the same step whatever the frame chunking.
 *
 * The script is two fixed keys plus reactions to session state observed at the
 * top of a fixed step (pure functions of the fixed-step timeline, so they stay
 * cadence-independent; a divergence would itself be the failure this gate
 * catches):
 * - Enter on step 0, then the D-05 anchor on ball 1: Space held for exactly 62
 *   charging steps after the 120-step settle, with lane 401 lit (06-01), so
 *   the first switch is rollover 401 and a skill shot is awarded.
 * - The first non-forfeit bonus tally is ended 10 steps in by a left flipper
 *   press (D-12, the skip latch).
 * - A ball resting on the plunger with the plunger idle (every serve and
 *   backstop re-serve after the anchor) is launched with a full plunge.
 * - Ball 2 is tilted with four nudges 32 steps apart (just past
 *   NUDGE_COOLDOWN_STEPS), 240 steps after its launch, so its tally is a
 *   forfeit (D-13).
 * - The save window (840 steps) lets the center post kick a center drain back
 *   (06-08) or a drain be re-served (06-07).
 * - Ball 3 drains, its tally ends, the game ends and the final score is
 *   submitted to the session's in-memory high score as a new best (PLSH-08).
 *
 * Asserted bit-identical across the three: the step counts, the score, the ball
 * number, the state, `hasPlayed()`, the skill-shot count, the save count and
 * kind, the drain count, the best, `isNewBest()`, a periodic in-play trace of
 * (step, score, active ball x, y), every ball's (id, x, y, vx, vy, angle) and
 * both flipper angles. Non-vacuous in every run: the anchor skill shot landed at
 * the anchor charge, at least one save fired, a tally was skipped, a tilted ball
 * forfeited, and the game reached game-over on a new best.
 *
 * TOTAL_MS is parked in the middle of a fixed step, as in
 * `src/sim/loop.determinism.test.ts`, so float summation across cadences
 * cannot move the executed step count. If the tuning changes, move script
 * steps, never assertions.
 */

const STEP_MS = FIXED_DT * 1000;

const FRAME_60_HZ = 1000 / 60;
const FRAME_120_HZ = 1000 / 120;
const FRAME_144_HZ = 1000 / 144;

/**
 * 40 simulated seconds: three balls, two tallies, a forfeit and game over fit
 * inside. (30 s until the kickback grace, 06-REVIEW CR-01: a kicked ball that
 * fell straight back is now re-served, so ball 3's tally was still running at
 * 30 s.)
 */
const EXPECTED_STEPS = 4800;
const TOTAL_MS = (EXPECTED_STEPS + 0.5) * STEP_MS;

/** D-05: the anchor hold, in charging steps (06-01). */
const ANCHOR_HOLD_STEPS = 62;
/**
 * The anchor press: the start lands on step 0 and the ball settles for 120
 * steps (lane 401 lit), so Space goes down on step 121 and comes up on the
 * step after the 62nd charging update.
 */
const ANCHOR_PRESS_STEP = 121;
const ANCHOR_RELEASE_STEP = ANCHOR_PRESS_STEP + ANCHOR_HOLD_STEPS;
/** The release charge the anchor must produce (exact: an integer step count times constants). */
const ANCHOR_CHARGE = ANCHOR_HOLD_STEPS * PLUNGER_CHARGE_RATE * FIXED_DT;

/** A full-charge hold: past the cap, so the charge is clamped at 1. */
const FULL_HOLD_STEPS = Math.ceil(PLUNGER_MAX_CHARGE / (PLUNGER_CHARGE_RATE * FIXED_DT)) + 10;

/** Steps into the first non-forfeit tally at which the flipper press skips it. */
const SKIP_AFTER_STEPS = 10;
/** Steps after ball 2's launch at which the four tilting nudges start. */
const TILT_AFTER_LAUNCH_STEPS = 240;
/** Nudge spacing: just past NUDGE_COOLDOWN_STEPS (30), so every one is accepted. */
const NUDGE_SPACING_STEPS = 32;
/** Trace sample period, in fixed steps. */
const TRACE_EVERY_STEPS = 120;

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
 * The fixed part of the timeline (fixed-step indices, 0-based). Both bats are
 * tapped while ball 1 settles in the shooter lane, clear of the playfield, so
 * the flipper relay and both coils run without touching the anchor.
 */
const SCRIPT: readonly ScriptedKey[] = [
  ...press("game", "Enter", 0, 2),
  ...press("flipper", "KeyZ", 20, 40),
  ...press("flipper", "Slash", 50, 70),
  ...press("plunger", "Space", ANCHOR_PRESS_STEP, ANCHOR_RELEASE_STEP),
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
  readonly skillShotCount: number;
  readonly saveCount: number;
  readonly lastSaveKind: SaveKind | "none";
  readonly drainCount: number;
  readonly best: number;
  readonly isNewBest: boolean;
  readonly sawTilt: boolean;
  /** A tilted ball's tally was seen as a forfeit (`isBonusForfeit()`). */
  readonly sawForfeit: boolean;
  /** A tally left "bonus" before its `bonusDurationSteps` elapsed. */
  readonly sawSkip: boolean;
  /** `getLastReleaseCharge()` right after the anchor release. */
  readonly anchorCharge: number;
  /** (step, score, active ball x, y) every TRACE_EVERY_STEPS steps (NaN x, y with no ball). */
  readonly trace: readonly number[];
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

  // main.ts parity: the plunger freezes the skill-shot lane; the production
  // ball-save window and the default in-memory high score.
  const session = new GameSession(
    world,
    router,
    { x: PLUNGER_REST.x, y: PLUNGER_REST.y },
    flipperGate,
    { plunger },
  );
  // The session is the rule hooks (skill shot, bonus counters, kickback save).
  const reactive = new ReactiveElements(world, router, session, undefined, session);

  const loop = new FixedStepLoop(world);

  function onFixedStep(): void {
    const edges = input.drainEdges();
    if (edges.leftPress) controller.onPressEdge(leftFlipperId);
    if (edges.leftRelease) controller.onReleaseEdge(leftFlipperId);
    if (edges.rightPress) controller.onPressEdge(rightFlipperId);
    if (edges.rightRelease) controller.onReleaseEdge(rightFlipperId);
    if (edges.leftPress || edges.rightPress) session.onFlipperPress();
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

  // Script state: the fixed keys, the keys the reactions scheduled, and what
  // the reactions observed. Every reaction reads session state at the top of a
  // fixed step, before that step's keys, so it is keyed by the step index only.
  let stepIndex = 0;
  let next = 0;
  const pending: ScriptedKey[] = [];
  let launchBusyUntil = 0;
  let tiltScheduled = false;
  let skipScheduled = false;
  let prevState: GameState = session.getState();
  let bonusElapsed = 0;
  let bonusDuration = 0;
  let sawTilt = false;
  let sawForfeit = false;
  let sawSkip = false;
  let anchorCharge = Number.NaN;
  const trace: number[] = [];

  function schedule(keys: readonly ScriptedKey[]): void {
    for (const k of keys) pending.push(k);
  }

  function activeBall(): BallState | null {
    const id = session.activeBallId;
    for (const b of world.getBalls()) if (b.id === id) return b;
    return null;
  }

  function react(): void {
    const state = session.getState();
    if (state === "tilted") sawTilt = true;
    if (session.isBonusForfeit()) sawForfeit = true;

    // Bonus: remember how far the tally got; skip the first non-forfeit one.
    if (state === "bonus") {
      const tally = session.getBonusTally();
      bonusElapsed = session.getBonusElapsed();
      bonusDuration = bonusDurationSteps(tally.rows, tally.forfeit);
      if (prevState !== "bonus" && !tally.forfeit && !skipScheduled) {
        skipScheduled = true;
        schedule(
          press("flipper", "KeyZ", stepIndex + SKIP_AFTER_STEPS, stepIndex + SKIP_AFTER_STEPS + 2),
        );
      }
    } else if (prevState === "bonus" && bonusElapsed < bonusDuration - 1) {
      // A natural end is last observed at elapsed = duration - 1.
      sawSkip = true;
    }

    if (stepIndex === ANCHOR_RELEASE_STEP + 1) anchorCharge = plunger.getLastReleaseCharge();

    // Launch any ball resting on the plunger after the anchor, at full charge;
    // ball 2's launch also schedules its tilt.
    if (state === "playing" && stepIndex > ANCHOR_RELEASE_STEP && stepIndex >= launchBusyUntil) {
      const b = activeBall();
      if (b && plunger.getPhase() === "idle" && isRestingInZone(b, PLUNGER_ZONE)) {
        const at = stepIndex + 1;
        schedule(press("plunger", "Space", at, at + FULL_HOLD_STEPS));
        launchBusyUntil = at + FULL_HOLD_STEPS + 2;
        if (session.getBall() === 2 && !tiltScheduled) {
          tiltScheduled = true;
          const t = at + FULL_HOLD_STEPS + TILT_AFTER_LAUNCH_STEPS;
          for (let i = 0; i < 4; i++) {
            const s = t + i * NUDGE_SPACING_STEPS;
            schedule(press("game", "KeyX", s, s + 2));
          }
        }
      }
    }

    if (stepIndex % TRACE_EVERY_STEPS === 0) {
      const b = activeBall();
      trace.push(stepIndex, session.getScore(), b ? b.x : Number.NaN, b ? b.y : Number.NaN);
    }
    prevState = state;
  }

  function deliver(k: ScriptedKey): void {
    const target =
      k.device === "flipper" ? input : k.device === "plunger" ? plungerInput : gameInput;
    if (k.down) target.handleKeyDown(key(k.code));
    else target.handleKeyUp(key(k.code));
  }

  // The script wrapper: observe and react, deliver this step's keys, then run
  // the composition's step body.
  function scriptedStep(): void {
    react();
    while (next < SCRIPT.length) {
      const k = SCRIPT[next];
      if (!k || k.step !== stepIndex) break;
      deliver(k);
      next++;
    }
    for (let i = 0; i < pending.length;) {
      const k = pending[i];
      if (k && k.step === stepIndex) {
        deliver(k);
        pending.splice(i, 1);
      } else i++;
    }
    onFixedStep();
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
    skillShotCount: session.getSkillShotCount(),
    saveCount: session.getSaveCount(),
    lastSaveKind: session.getLastSaveKind(),
    drainCount: session.getDrainCount(),
    best: session.getBest(),
    isNewBest: session.isNewBest(),
    sawTilt,
    sawForfeit,
    sawSkip,
    anchorCharge,
    trace,
    balls: world.getBalls().map((b) => ({ ...b })),
    flippers: world.getFlippers().map((f) => ({ id: f.id, angle: f.angle })),
  };
}

describe("game replay determinism across render cadences (GAME-01..03, D-23)", () => {
  it("the same key timeline gives the same Phase-6 game at 60, 120 and 144 Hz", () => {
    const a = play(FRAME_60_HZ);
    const b = play(FRAME_120_HZ);
    const c = play(FRAME_144_HZ);

    for (const run of [a, b, c]) {
      expect(run.steps).toBe(EXPECTED_STEPS);
      expect(run.totalSteps).toBe(EXPECTED_STEPS);
      // Not vacuous: every run started a game and exercised every Phase-6 rule.
      expect(run.hasPlayed).toBe(true);
      expect(run.sawTilt).toBe(true);
      // The D-05 anchor skill shot on ball 1, at the anchor's exact charge.
      expect(run.anchorCharge).toBe(ANCHOR_CHARGE);
      expect(run.skillShotCount).toBeGreaterThanOrEqual(1);
      // At least one ball save (kickback or backstop).
      expect(run.saveCount).toBeGreaterThanOrEqual(1);
      expect(run.lastSaveKind).not.toBe("none");
      // A tally skipped by a flipper press, and a tilted ball's forfeit.
      expect(run.sawSkip).toBe(true);
      expect(run.sawForfeit).toBe(true);
      // Three balls drained and the game ended on a new in-memory best.
      expect(run.drainCount).toBeGreaterThanOrEqual(3);
      expect(run.ball).toBe(3);
      expect(run.state).toBe("game-over");
      expect(run.isNewBest).toBe(true);
      expect(run.best).toBe(run.score);
      expect(run.score).toBeGreaterThan(0);
    }

    // Exact equality: identical step inputs and no hidden time or random source.
    for (const run of [b, c]) {
      expect(run.score).toBe(a.score);
      expect(run.ball).toBe(a.ball);
      expect(run.state).toBe(a.state);
      expect(run.hasPlayed).toBe(a.hasPlayed);
      expect(run.skillShotCount).toBe(a.skillShotCount);
      expect(run.saveCount).toBe(a.saveCount);
      expect(run.lastSaveKind).toBe(a.lastSaveKind);
      expect(run.drainCount).toBe(a.drainCount);
      expect(run.best).toBe(a.best);
      expect(run.isNewBest).toBe(a.isNewBest);
      expect(run.trace).toEqual(a.trace);
      expect(run.balls).toEqual(a.balls);
      expect(run.flippers).toEqual(a.flippers);
    }
  });
});
