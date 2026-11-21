import { beforeAll, describe, it, expect, vi } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { CueFeedback, CueQueue, CUE_KINDS, type CueKind } from "../app/cue-queue";
import { AudioEngine } from "../audio/audio-engine";
import { FakeAudioContext } from "../audio/test/fake-audio-context";
import { FlipperController } from "../control/flipper-controller";
import { PlungerController } from "../control/plunger-controller";
import { GameSession, type FlipperGate, type GameState } from "../game/game-session";
import { ReactiveElements } from "../game/reactive-elements";
import { mulberry32 } from "../harness/prng";
import { FlipperInput, type KeyEventLike } from "../input/flipper-input";
import { GameInput } from "../input/game-input";
import { PlungerInput } from "../input/plunger-input";
import { FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallState } from "../physics/types";
import { ContactFlash } from "../render/contact-flash";
import { FlashTracker, maxElementId } from "../render/flash";
import { interpolateAngles, interpolateBalls, type MutableBall } from "../render/interpolate";
import {
  TableRenderer,
  type CanvasTarget,
  type FlashReader,
  type LightState,
} from "../render/table-renderer";
import { createRecordingContext, RecordingLayerFactory } from "../render/test/recording-context";
import { computeView, tableBounds } from "../render/view-transform";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST } from "../table/spec";
import { PresentationObserver } from "./presentation-observer";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * The presentation layer is read-only (plan 05-06 Task 2, RND-02 integrity,
 * threat T-05-18, research Finding 4): attaching the whole Phase-5 stack to the
 * scripted Phase-4 game changes nothing in the simulation.
 *
 * The composition and the key timeline are copied from
 * `game.determinism.test.ts`, plus one KeyM press at step 2000 (both runs get
 * it; the bare run drains and ignores the mute edge). `play(frameMs, presented)`
 * builds the `main.ts` composition; with `presented` it also builds, in
 * `main.ts` order, the CueQueue, the FlashTracker, CueFeedback as the 4th
 * ReactiveElements argument, ContactFlash, the PresentationObserver, an
 * AudioEngine over a FakeAudioContext (unlocked before the first frame) and a
 * TableRenderer over a recording context. Every frame then tallies the queued
 * cue kinds, flushes them to audio, interpolates balls and bats and draws.
 *
 * Asserted bit-identical: bare at 144 Hz, presented at 144 Hz and presented at
 * 60 Hz agree on the step counts, score, ball, state, hasPlayed, every ball's
 * (id, x, y, vx, vy, angle) and both flipper angles. Non-vacuous: the presented
 * runs heard start, launch, warning, tilt, drain and both flipper coils going
 * up and down, started voices, drew the static layer once per frame, dropped no
 * cue, and ended muted after the scripted M press.
 */

const STEP_MS = FIXED_DT * 1000;

const FRAME_60_HZ = 1000 / 60;
const FRAME_144_HZ = 1000 / 144;

/** 30 simulated seconds, parked mid-step (see game.determinism.test.ts). */
const EXPECTED_STEPS = 3600;
const TOTAL_MS = (EXPECTED_STEPS + 0.5) * STEP_MS;

type Device = "flipper" | "plunger" | "game";

interface ScriptedKey {
  readonly step: number;
  readonly device: Device;
  readonly code: string;
  readonly down: boolean;
}

function press(device: Device, code: string, downAt: number, upAt: number): ScriptedKey[] {
  return [
    { step: downAt, device, code, down: true },
    { step: upAt, device, code, down: false },
  ];
}

/** game.determinism.test.ts's timeline plus M at step 2000. */
const SCRIPT: readonly ScriptedKey[] = [
  ...press("game", "Enter", 10, 12),
  ...press("plunger", "Space", 80, 180),
  ...press("game", "KeyX", 400, 402),
  ...press("game", "KeyX", 432, 434),
  ...press("game", "KeyX", 464, 466),
  ...press("game", "KeyX", 496, 498),
  ...press("flipper", "KeyZ", 1600, 1700),
  ...press("flipper", "Slash", 1800, 1900),
  ...press("game", "KeyM", 2000, 2002),
  ...press("plunger", "Space", 2400, 2500),
].sort((a, b) => a.step - b.step);

function key(code: string): KeyEventLike {
  return { code, repeat: false, preventDefault: () => {} };
}

interface FlipperSample {
  readonly id: number;
  readonly angle: number;
}

/** What the presented run saw (null for the bare run). */
interface PresentationTally {
  readonly cues: Readonly<Record<CueKind, number>>;
  readonly sourcesStarted: number;
  readonly frames: number;
  readonly staticBlits: number;
  readonly dropped: number;
  readonly mutedAtEnd: boolean;
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
  readonly presentation: PresentationTally | null;
}

function emptyTally(): Record<CueKind, number> {
  const t = {} as Record<CueKind, number>;
  for (const k of CUE_KINDS) t[k] = 0;
  return t;
}

/** Build the `main.ts` composition, play the script at `frameMs`, sample the end. */
function play(frameMs: number, presented: boolean): Outcome {
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

  // Presentation (main.ts order): cues, flash, CueFeedback into the rules,
  // ContactFlash on the bus, the observer, audio, the renderer.
  const cues = presented ? new CueQueue() : null;
  const flash = presented ? new FlashTracker(maxElementId(world.getElements())) : null;
  const cueFeedback = cues && flash ? new CueFeedback(cues, flash) : undefined;
  const reactive = new ReactiveElements(world, router, session, cueFeedback);
  if (flash) new ContactFlash(router, flash);
  const drainId = world.getElements().find((e) => e.kind === "drain")?.id ?? -1;
  const observer =
    cues && flash
      ? new PresentationObserver(cues, flash, session, plunger, drainId, controller, [
          leftFlipperId,
          rightFlipperId,
        ])
      : null;
  const fake = presented ? new FakeAudioContext() : null;
  const audio = fake ? new AudioEngine(() => fake, mulberry32(0x0506)) : null;
  // The first trusted gesture, before the first frame.
  audio?.unlock();

  const rec = presented ? createRecordingContext() : null;
  const layers = presented ? new RecordingLayerFactory() : null;
  let renderer: TableRenderer | null = null;
  if (rec && layers) {
    const canvas: CanvasTarget = { width: 0, height: 0, style: { width: "", height: "" } };
    renderer = new TableRenderer(canvas, rec.ctx, layers, world);
    renderer.resize(computeView(tableBounds(world.getElements()), 1280, 684, 1.5));
    rec.clear();
  }

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
    // The bare run drains the mute edge and ignores it.
    if (ge.mute && audio) audio.toggleMute();
    session.tick();
  }
  function onPostStep(): void {
    router.dispatch();
    reactive.service();
    session.service();
    if (observer) observer.observe();
    if (flash) flash.tick();
  }

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

  // The render frame (main.ts frame() minus the DOM HUD and diagnosis).
  const tally = emptyTally();
  const interpolated: MutableBall[] = [];
  const flipperAngles: number[] = [];
  const renderFrame: {
    balls: readonly BallState[];
    flipperAngles: readonly number[];
    plungerCharge: number;
    lights: LightState | null;
    flash: FlashReader | null;
    alpha: number;
  } = { balls: interpolated, flipperAngles, plungerCharge: 0, lights: reactive, flash, alpha: 0 };
  let frames = 0;
  let staticBlits = 0;

  function advance(ms: number): number {
    const n = loop.advance(ms, scriptedStep, onPostStep);
    if (!presented || !cues || !audio || !renderer || !rec || !layers) return n;
    for (let i = 0; i < cues.size; i++) {
      const c = cues.at(i);
      if (c) tally[c.kind]++;
    }
    audio.flush(cues);
    interpolateBalls(loop.previous, loop.current, loop.alpha, interpolated);
    interpolateAngles(loop.previousFlipperAngles, loop.currentFlipperAngles, loop.alpha, flipperAngles);
    renderFrame.plungerCharge = plunger.getCharge();
    renderFrame.alpha = loop.alpha;
    renderer.draw(renderFrame);
    frames++;
    const staticCanvas = layers.layers[0]?.canvas;
    for (const call of rec.calls("drawImage")) {
      if (call.args[0] === staticCanvas) staticBlits++;
    }
    rec.clear();
    return n;
  }

  const fullFrames = Math.floor(TOTAL_MS / frameMs);
  let steps = 0;
  for (let i = 0; i < fullFrames; i++) steps += advance(frameMs);
  const remainder = TOTAL_MS - fullFrames * frameMs;
  if (remainder > 0) steps += advance(remainder);

  let sourcesStarted = 0;
  if (fake) {
    for (const s of fake.sources()) if (s.startTime !== null) sourcesStarted++;
  }

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
    presentation:
      cues && audio
        ? {
            cues: tally,
            sourcesStarted,
            frames,
            staticBlits,
            dropped: cues.dropped,
            mutedAtEnd: audio.isMuted(),
          }
        : null,
  };
}

describe("the presentation layer is read-only (RND-02, T-05-18)", () => {
  let bare: Outcome;
  let presented144: Outcome;
  let presented60: Outcome;
  beforeAll(() => {
    bare = play(FRAME_144_HZ, false);
    presented144 = play(FRAME_144_HZ, true);
    presented60 = play(FRAME_60_HZ, true);
  });

  it("the scripted game is bit-identical with the full presentation attached, at 144 and 60 Hz", () => {
    for (const run of [bare, presented144, presented60]) {
      expect(run.steps).toBe(EXPECTED_STEPS);
      expect(run.totalSteps).toBe(EXPECTED_STEPS);
      expect(run.hasPlayed).toBe(true);
      expect(run.sawTilt).toBe(true);
      expect(run.ball).toBeGreaterThanOrEqual(2);
    }
    expect(bare.presentation).toBeNull();

    for (const run of [presented144, presented60]) {
      expect(run.score).toBe(bare.score);
      expect(run.ball).toBe(bare.ball);
      expect(run.state).toBe(bare.state);
      expect(run.hasPlayed).toBe(bare.hasPlayed);
      expect(run.balls).toEqual(bare.balls);
      expect(run.flippers).toEqual(bare.flippers);
    }
  });

  it("the presented runs are not vacuous: every game event was heard, drawn and flushed", () => {
    for (const run of [presented144, presented60]) {
      const p = run.presentation;
      expect(p).not.toBeNull();
      if (!p) return;
      expect(p.cues.start).toBeGreaterThanOrEqual(1);
      expect(p.cues.launch).toBeGreaterThanOrEqual(1);
      expect(p.cues.warning).toBeGreaterThanOrEqual(1);
      expect(p.cues.tilt).toBeGreaterThanOrEqual(1);
      expect(p.cues.drain).toBeGreaterThanOrEqual(1);
      expect(p.cues.flipperUp).toBeGreaterThanOrEqual(2);
      expect(p.cues.flipperDown).toBeGreaterThanOrEqual(2);
      expect(p.sourcesStarted).toBeGreaterThanOrEqual(1);
      expect(p.frames).toBeGreaterThan(0);
      expect(p.staticBlits).toBe(p.frames);
      expect(p.dropped).toBe(0);
      expect(p.mutedAtEnd).toBe(true);
    }
  });
});
