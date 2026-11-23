import { beforeAll, describe, it, expect, vi } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { CueFeedback, CueQueue, CUE_KINDS, type CueKind } from "../app/cue-queue";
import { AudioEngine } from "../audio/audio-engine";
import { FakeAudioContext } from "../audio/test/fake-audio-context";
import { FlipperController } from "../control/flipper-controller";
import { isRestingInZone, PlungerController } from "../control/plunger-controller";
import type { SaveKind } from "../game/ball-save";
import { bonusDurationSteps } from "../game/bonus";
import { GameSession, type FlipperGate, type GameState } from "../game/game-session";
import { ReactiveElements } from "../game/reactive-elements";
import { mulberry32 } from "../harness/prng";
import { FlipperInput, type KeyEventLike } from "../input/flipper-input";
import { GameInput } from "../input/game-input";
import { PlungerInput } from "../input/plunger-input";
import { FIXED_DT, PLUNGER_CHARGE_RATE, PLUNGER_MAX_CHARGE } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallState } from "../physics/types";
import { ContactFlash } from "../render/contact-flash";
import { EffectsTracker, type EffectsReader } from "../render/effects";
import { FlashTracker, maxElementId } from "../render/flash";
import { interpolateAngles, interpolateBalls, type MutableBall } from "../render/interpolate";
import { LAMP_COUNT, LampTracker, type LampReader } from "../render/lamps";
import { TableRenderer, type CanvasTarget, type FlashReader } from "../render/table-renderer";
import { createRecordingContext, RecordingLayerFactory } from "../render/test/recording-context";
import { computeView, tableBounds } from "../render/view-transform";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST, PLUNGER_ZONE } from "../table/spec";
import { BonusView, HudView, type AttrSink, type TextSink } from "../ui/hud";
import { PresentationObserver } from "./presentation-observer";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * The presentation layer is read-only (plan 05-06 Task 2, RND-02 integrity,
 * threat T-05-18, research Finding 4; extended to every Phase-6 module by plan
 * 06-14, D-23): attaching the whole presentation stack to the scripted Phase-6
 * game changes nothing in the simulation, with reduced motion on or off.
 *
 * The composition and the script (fixed keys plus reactions to session state
 * observed at the top of a fixed step) are copied from
 * `game.determinism.test.ts`, plus one KeyM press at step 2000 (every run gets
 * it; the bare run drains and ignores the mute edge). `play(frameMs, presented,
 * reducedMotion)` builds the `main.ts` composition; with `presented` it also
 * builds, in `main.ts` order, the CueQueue, the FlashTracker, the
 * EffectsTracker, CueFeedback (with the effects) as the 4th ReactiveElements
 * argument, ContactFlash, the PresentationObserver (with the effects as its
 * fx), the LampTracker over the reactive elements and the session, an
 * AudioEngine over a FakeAudioContext (unlocked before the first frame), a
 * TableRenderer over a recording context, and HudView (score, ball, status,
 * best, best attribute) and BonusView over counting text and attribute sinks.
 * `onPostStep` runs main.ts's order (dispatch, reactive.service,
 * session.service, observer.observe, lamps.update, effects.tick, flash.tick).
 * Every frame then tallies the queued cue kinds, flushes them to audio,
 * interpolates balls and bats, draws a frame carrying the lamps, effects and
 * reducedMotion, and updates the HUD (dt = steps * FIXED_DT) and the bonus
 * overlay.
 *
 * Asserted bit-identical: bare at 144 Hz, presented at 144 Hz, presented at
 * 60 Hz and presented at 144 Hz with reducedMotion true agree on every field
 * of game.determinism's Outcome. Non-vacuous: the presented runs heard start,
 * launch, warning, tilt, drain, both flipper coils, and the Phase-6 skillShot,
 * ballSave, bonusTick, nudge and highScore cues, started voices, emitted
 * particles, lit a lamp above level 0.5, sampled a nonzero shake offset in some
 * frame, drew the static layer once per frame, wrote the HUD and the bonus
 * overlay, dropped no cue and ended muted; the reduced-motion run blitted the
 * static layer only at offset (0, 0).
 */

const STEP_MS = FIXED_DT * 1000;

const FRAME_60_HZ = 1000 / 60;
const FRAME_144_HZ = 1000 / 144;

/** 40 simulated seconds, parked mid-step (see game.determinism.test.ts). */
const EXPECTED_STEPS = 4800;
const TOTAL_MS = (EXPECTED_STEPS + 0.5) * STEP_MS;

/** game.determinism.test.ts's script constants (D-05 anchor, skip, tilt). */
const ANCHOR_HOLD_STEPS = 62;
const ANCHOR_PRESS_STEP = 121;
const ANCHOR_RELEASE_STEP = ANCHOR_PRESS_STEP + ANCHOR_HOLD_STEPS;
const ANCHOR_CHARGE = ANCHOR_HOLD_STEPS * PLUNGER_CHARGE_RATE * FIXED_DT;
const FULL_HOLD_STEPS = Math.ceil(PLUNGER_MAX_CHARGE / (PLUNGER_CHARGE_RATE * FIXED_DT)) + 10;
const SKIP_AFTER_STEPS = 10;
const TILT_AFTER_LAUNCH_STEPS = 240;
const NUDGE_SPACING_STEPS = 32;
const TRACE_EVERY_STEPS = 120;

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

/** game.determinism.test.ts's fixed timeline plus M at step 2000. */
const SCRIPT: readonly ScriptedKey[] = [
  ...press("game", "Enter", 0, 2),
  ...press("flipper", "KeyZ", 20, 40),
  ...press("flipper", "Slash", 50, 70),
  ...press("plunger", "Space", ANCHOR_PRESS_STEP, ANCHOR_RELEASE_STEP),
  ...press("game", "KeyM", 2000, 2002),
].sort((a, b) => a.step - b.step);

function key(code: string): KeyEventLike {
  return { code, repeat: false, preventDefault: () => {} };
}

/** Fake text node whose setter counts every write. */
class CountingSink implements TextSink {
  writes = 0;
  private text: string | null = null;
  get textContent(): string | null {
    return this.text;
  }
  set textContent(value: string | null) {
    this.writes++;
    this.text = value;
  }
}

/** A fake element that is both a text and an attribute sink, counting writes. */
class CountingElement extends CountingSink implements AttrSink {
  attrWrites = 0;
  setAttribute(): void {
    this.attrWrites++;
  }
  removeAttribute(): void {
    this.attrWrites++;
  }
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
  /** Frames whose static blit sat at a nonzero offset (the shake). */
  readonly shakenFrames: number;
  /** Frames with at least one live particle. */
  readonly particleFrames: number;
  /** The highest lamp level sampled at a frame. */
  readonly maxLamp: number;
  /** HUD text writes, and best-line attribute writes. */
  readonly hudWrites: number;
  readonly bestAttrWrites: number;
  /** Bonus overlay attribute and text writes. */
  readonly bonusWrites: number;
  readonly dropped: number;
  readonly mutedAtEnd: boolean;
}

/** game.determinism.test.ts's Outcome, plus the presentation tally. */
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
  readonly sawForfeit: boolean;
  readonly sawSkip: boolean;
  readonly anchorCharge: number;
  readonly trace: readonly number[];
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
function play(frameMs: number, presented: boolean, reducedMotion = false): Outcome {
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

  // Presentation (main.ts order): cues, flash, effects, CueFeedback into the
  // rules, ContactFlash on the bus, the observer, the lamps, audio, the
  // renderer, the HUD and the bonus overlay.
  const cues = presented ? new CueQueue() : null;
  const flash = presented ? new FlashTracker(maxElementId(world.getElements())) : null;
  const effects = presented ? new EffectsTracker(world.getElements()) : null;
  const cueFeedback = cues && flash && effects ? new CueFeedback(cues, flash, effects) : undefined;
  const reactive = new ReactiveElements(world, router, session, cueFeedback, session);
  if (flash) new ContactFlash(router, flash);
  const drainId = world.getElements().find((e) => e.kind === "drain")?.id ?? -1;
  const observer =
    cues && flash && effects
      ? new PresentationObserver(
          cues,
          flash,
          session,
          plunger,
          drainId,
          controller,
          [leftFlipperId, rightFlipperId],
          effects,
        )
      : null;
  const lamps = presented ? new LampTracker(reactive, session) : null;
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

  const hudScore = new CountingSink();
  const hudBall = new CountingSink();
  const hudStatus = new CountingSink();
  const hudBest = new CountingElement();
  const hudView = presented ? new HudView(hudScore, hudBall, hudStatus, hudBest, hudBest) : null;
  const bonusOverlay = new CountingElement();
  const bonusRows = [new CountingElement(), new CountingElement(), new CountingElement()];
  const bonusLabels = [new CountingElement(), new CountingElement(), new CountingElement()];
  const bonusValues = [new CountingElement(), new CountingElement(), new CountingElement()];
  const bonusTotalRow = new CountingElement();
  const bonusTotal = new CountingElement();
  const bonusView = presented
    ? new BonusView(bonusOverlay, bonusRows, bonusLabels, bonusValues, bonusTotalRow, bonusTotal)
    : null;

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
    // The bare run drains the mute edge and ignores it.
    if (ge.mute && audio) audio.toggleMute();
    session.tick();
  }
  function onPostStep(): void {
    router.dispatch();
    reactive.service();
    session.service();
    if (observer) observer.observe();
    if (lamps) lamps.update();
    if (effects) effects.tick();
    if (flash) flash.tick();
  }

  // The script (copied from game.determinism.test.ts): fixed keys plus
  // reactions to session state observed at the top of a fixed step.
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
      sawSkip = true;
    }

    if (stepIndex === ANCHOR_RELEASE_STEP + 1) anchorCharge = plunger.getLastReleaseCharge();

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

  // The render frame (main.ts frame() minus the diagnosis and the mute view).
  const tally = emptyTally();
  const interpolated: MutableBall[] = [];
  const flipperAngles: number[] = [];
  const renderFrame: {
    balls: readonly BallState[];
    flipperAngles: readonly number[];
    plungerCharge: number;
    lamps: LampReader | null;
    flash: FlashReader | null;
    alpha: number;
    effects: EffectsReader | null;
    reducedMotion: boolean;
  } = {
    balls: interpolated,
    flipperAngles,
    plungerCharge: 0,
    lamps,
    flash,
    alpha: 0,
    effects,
    reducedMotion,
  };
  let frames = 0;
  let staticBlits = 0;
  let shakenFrames = 0;
  let particleFrames = 0;
  let maxLamp = 0;

  function advance(ms: number): number {
    const n = loop.advance(ms, scriptedStep, onPostStep);
    if (!cues || !audio || !renderer || !rec || !layers || !lamps || !effects) return n;
    if (!hudView || !bonusView) return n;
    for (let i = 0; i < cues.size; i++) {
      const c = cues.at(i);
      if (c) tally[c.kind]++;
    }
    audio.flush(cues);
    interpolateBalls(loop.previous, loop.current, loop.alpha, interpolated);
    interpolateAngles(
      loop.previousFlipperAngles,
      loop.currentFlipperAngles,
      loop.alpha,
      flipperAngles,
    );
    renderFrame.plungerCharge = plunger.getCharge();
    renderFrame.alpha = loop.alpha;
    renderer.draw(renderFrame);
    frames++;
    const staticCanvas = layers.layers[0]?.canvas;
    for (const call of rec.calls("drawImage")) {
      if (call.args[0] !== staticCanvas) continue;
      staticBlits++;
      if (call.args[1] !== 0 || call.args[2] !== 0) shakenFrames++;
    }
    rec.clear();
    if (effects.particles.aliveCount() > 0) particleFrames++;
    for (let i = 0; i < LAMP_COUNT; i++) {
      const level = lamps.level(i, loop.alpha);
      if (level > maxLamp) maxLamp = level;
    }
    hudView.update(session, n * FIXED_DT, reducedMotion);
    bonusView.update(session, reducedMotion);
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

  let bonusWrites = bonusOverlay.attrWrites + bonusTotalRow.attrWrites + bonusTotal.writes;
  for (const sinks of [bonusRows, bonusLabels, bonusValues]) {
    for (const s of sinks) bonusWrites += s.attrWrites + s.writes;
  }

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
    presentation:
      cues && audio
        ? {
            cues: tally,
            sourcesStarted,
            frames,
            staticBlits,
            shakenFrames,
            particleFrames,
            maxLamp,
            hudWrites: hudScore.writes + hudBall.writes + hudStatus.writes + hudBest.writes,
            bestAttrWrites: hudBest.attrWrites,
            bonusWrites,
            dropped: cues.dropped,
            mutedAtEnd: audio.isMuted(),
          }
        : null,
  };
}

describe("the presentation layer is read-only (RND-02, T-05-18, D-23)", () => {
  let bare: Outcome;
  let presented144: Outcome;
  let presented60: Outcome;
  let reduced144: Outcome;
  beforeAll(() => {
    bare = play(FRAME_144_HZ, false);
    presented144 = play(FRAME_144_HZ, true);
    presented60 = play(FRAME_60_HZ, true);
    reduced144 = play(FRAME_144_HZ, true, true);
  });

  it("the scripted game is bit-identical with every Phase-6 module attached, at 144 and 60 Hz and under reduced motion", () => {
    for (const run of [bare, presented144, presented60, reduced144]) {
      expect(run.steps).toBe(EXPECTED_STEPS);
      expect(run.totalSteps).toBe(EXPECTED_STEPS);
      expect(run.hasPlayed).toBe(true);
      expect(run.sawTilt).toBe(true);
      expect(run.anchorCharge).toBe(ANCHOR_CHARGE);
      expect(run.skillShotCount).toBeGreaterThanOrEqual(1);
      expect(run.saveCount).toBeGreaterThanOrEqual(1);
      expect(run.sawSkip).toBe(true);
      expect(run.sawForfeit).toBe(true);
      expect(run.state).toBe("game-over");
      expect(run.isNewBest).toBe(true);
    }
    expect(bare.presentation).toBeNull();

    for (const run of [presented144, presented60, reduced144]) {
      expect(run.score).toBe(bare.score);
      expect(run.ball).toBe(bare.ball);
      expect(run.state).toBe(bare.state);
      expect(run.hasPlayed).toBe(bare.hasPlayed);
      expect(run.skillShotCount).toBe(bare.skillShotCount);
      expect(run.saveCount).toBe(bare.saveCount);
      expect(run.lastSaveKind).toBe(bare.lastSaveKind);
      expect(run.drainCount).toBe(bare.drainCount);
      expect(run.best).toBe(bare.best);
      expect(run.isNewBest).toBe(bare.isNewBest);
      expect(run.sawTilt).toBe(bare.sawTilt);
      expect(run.sawForfeit).toBe(bare.sawForfeit);
      expect(run.sawSkip).toBe(bare.sawSkip);
      expect(run.anchorCharge).toBe(bare.anchorCharge);
      expect(run.trace).toEqual(bare.trace);
      expect(run.balls).toEqual(bare.balls);
      expect(run.flippers).toEqual(bare.flippers);
    }
  });

  it("the presented runs are not vacuous: every game event was heard, drawn and flushed", () => {
    for (const run of [presented144, presented60, reduced144]) {
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

  it("every Phase-6 presentation module ran in the presented 144 Hz run", () => {
    const p = presented144.presentation;
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.cues.skillShot).toBeGreaterThan(0);
    expect(p.cues.ballSave).toBeGreaterThan(0);
    expect(p.cues.bonusTick).toBeGreaterThan(0);
    expect(p.cues.nudge).toBeGreaterThan(0);
    expect(p.cues.highScore).toBeGreaterThan(0);
    expect(p.particleFrames).toBeGreaterThan(0);
    expect(p.maxLamp).toBeGreaterThan(0.5);
    expect(p.shakenFrames).toBeGreaterThan(0);
    expect(p.hudWrites).toBeGreaterThan(0);
    expect(p.bestAttrWrites).toBeGreaterThan(0);
    expect(p.bonusWrites).toBeGreaterThan(0);
  });

  it("reduced motion blits the static layer only at offset 0 and changes nothing else", () => {
    const p = reduced144.presentation;
    const q = presented144.presentation;
    expect(p).not.toBeNull();
    expect(q).not.toBeNull();
    if (!p || !q) return;
    expect(p.frames).toBe(q.frames);
    expect(p.staticBlits).toBe(p.frames);
    expect(p.shakenFrames).toBe(0);
    expect(p.cues).toEqual(q.cues);
  });
});
