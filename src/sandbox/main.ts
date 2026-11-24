/**
 * Sandbox entry — our original table (D-03) on screen through the one spec.
 *
 * Wires the whole stack end-to-end: it constructs the Planck world from
 * `TABLE_SPEC` (the ONLY engine-specific line is `new PlanckWorld(...)`, the
 * composition root), drives it through the engine-agnostic fixed-step loop, and
 * renders the table procedurally on Canvas 2D through `TableRenderer` (RND-01):
 * a space background, a seeded starfield, neon walls and chute, the drain apron,
 * lane and rollover inserts, bumpers and slingshots baked once per resize into an
 * offscreen layer, then both bats, the plunger and its charge meter and the ball
 * drawn live. Balls AND bats are drawn at interpolated state between the loop's
 * previous and current fixed steps (`interpolateBalls` / `interpolateAngles`), so
 * motion stays smooth at 60, 120 and 144 Hz (RND-02). The backing store is sized
 * from the display (`computeView`), on boot, on resize and on a dpr change. Every
 * read of world state goes through the `PhysicsWorld` interface; this file never
 * imports the engine (D-05/D-07). The canvas paints no text (D-01): the HUD is DOM.
 *
 * Narrow viewports (06.4, GAME-01): `applyView` measures the HUD panel in its
 * side form. When the fitted canvas would not clear it by `HUD_SIDE_GAP_CSS`,
 * `applyView` sets `data-hud="bar"` on `#sandbox` (index.html turns the panel
 * into a 3-row bar above the table) and fits the table to the height under the
 * measured bar (`heightUnderBar`). The layout reads run only on boot, resize and
 * dpr change, never in the frame. `?debug=1` never calls `applyView` and keeps
 * the side layout.
 *
 * `?debug=1` (exact match) selects the old diagnosis renderer (`DebugRenderer`:
 * outlines, velocity arrow, contact markers) instead; any other URL draws the
 * procedural table.
 *
 * The game (GAME-02): the sandbox boots into game-over (attract) with no ball on
 * the table. Enter or NumpadEnter starts a 3-ball game through `GameSession`,
 * which serves every ball to the plunger (launched with Space), serves the next
 * one when the ball in play drains, and ends the game after the third drain.
 * The flippers are dead outside a game and on a tilt (GAME-03): the session
 * switches them through a flipper gate that wraps
 * `FlipperController.setEnabled`, and on every serve the gate re-presses a bat
 * whose key is still held (Pitfall 5).
 *
 * Every contact flows through the one-way collision bus (D-11): a
 * `CollisionRouter` drains the world once per fixed step and fans the batch out
 * in registration order. The session records the drain of the ball in play;
 * `ReactiveElements` records kicks and awards points through the session's
 * rules gate, which is live only while a ball is in play. Both only record or
 * award in their listeners; the world is mutated only in their `service()`
 * calls, in a fixed order, after dispatch. The score, the ball number and the
 * game status (start and game-over prompts, WARNING, TILT) show in a DOM HUD
 * overlay (`#hud-score`, `#hud-ball`, `#hud-status`, each written only when it
 * changes), plus the high score (`#hud-best`, PLSH-08) read once at boot from
 * the guarded localStorage (`safeLocalStorage()`). The score counts up on the step clock (dt = steps * FIXED_DT, D-14);
 * `prefers-reduced-motion` is read once at boot into a boolean, kept current by
 * one change listener registered outside the frame (D-18), and passed to the HUD
 * and the bonus overlay, which then snap.
 *
 * Fixed-step order:
 * - `onFixedStep` (top of each step): flipper edges (a press edge also latches
 *   the bonus skip, `session.onFlipperPress()`) then the flipper FSM; the
 *   plunger edges through `applyEdges` (same-window order from the held state)
 *   then the charge; then the start edge (a started game resets the lights);
 *   then the nudge edges (`session.onNudge`); then `session.tick()`.
 * - `onPostStep` (after `world.step()`): `router.dispatch()`, then
 *   `reactive.service()` (kicks), then `session.service()` (drain and serve),
 *   then `observer.observe()` (game-event cues), then `lamps.update()` (the
 *   insert lamp levels, PLSH-04), then `effects.tick()` (the screen shake,
 *   PLSH-01), then `flash.tick()` (the flash clock, RND-03).
 *
 * Screen shake (PLSH-01, D-17): one `EffectsTracker` receives bumper and sling
 * kicks through `CueFeedback` and nudges, tilts and drains through the observer;
 * the renderer samples it once per frame and shakes the canvas only (the DOM HUD
 * never moves). Under `prefers-reduced-motion` the offset is exactly 0 (D-18).
 *
 * Presentation (Phase 5, AUD-01): the rules report every registered kick and
 * sensor pass through `ReactiveFeedback`; `CueFeedback` records each one as a
 * scalar cue into a fixed `CueQueue` on the step path, and the render frame
 * calls `audio.flush(cues)` right after `loop.advance`, the only place audio
 * nodes are created. The `AudioContext` does not exist until the player's first
 * trusted keydown or pointerdown (`AudioUnlock`); a cue recorded before that,
 * or while the context is neither running nor starting (the starting-episode
 * model in the header of `audio/audio-engine.ts`), is dropped, never
 * replayed; cues on a starting context are scheduled and sound when it runs.
 *
 * The diagnosis readout (FPS, physics Hz, KE) is DOM text in `#hud-diag`
 * (`DiagView`, written only when a throttled number changes); with the canvas
 * contact markers it is a DIAGNOSIS tool only:
 * it asserts nothing about pass/fail. The tunnel-proof gates stay headless
 * (`npm run soak`).
 */

import { PlanckWorld } from "../physics/planck-world";
import { CollisionRouter } from "../app/collision-router";
import { CueFeedback, CueQueue } from "../app/cue-queue";
import { AudioEngine } from "../audio/audio-engine";
import { AudioUnlock } from "../audio/audio-unlock";
import { FlipperController } from "../control/flipper-controller";
import { PlungerController } from "../control/plunger-controller";
import { GameSession, type FlipperGate } from "../game/game-session";
import { HighScore, type StorageLike } from "../game/high-score";
import { ReactiveElements } from "../game/reactive-elements";
import { FlipperInput, isWindowsPlatform } from "../input/flipper-input";
import { GameInput } from "../input/game-input";
import { PlungerInput } from "../input/plunger-input";
import { ballMass, FIXED_DT } from "../physics/constants";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST, TABLE_SPEC } from "../table/spec";
import { BonusView, DiagView, HudView, MuteView, type DiagData, type TextSink } from "../ui/hud";
import { initKeyLabels } from "../ui/key-labels";
import { interpolateAngles, interpolateBalls, type MutableBall } from "../render/interpolate";
import { ContactFlash } from "../render/contact-flash";
import { EffectsTracker, type EffectsReader } from "../render/effects";
import { FlashTracker, maxElementId } from "../render/flash";
import { LampTracker, type LampReader } from "../render/lamps";
import type { LayerFactory } from "../render/static-layer";
import { TableRenderer, type FlashReader } from "../render/table-renderer";
import { computeView, heightUnderBar, sideHudClears, tableBounds } from "../render/view-transform";
import type { BallState } from "../physics/types";
import { DebugRenderer } from "./debug-draw";
import { PresentationObserver } from "./presentation-observer";

/**
 * Serve point: the session parks every ball on the plunger at `PLUNGER_REST`
 * (from the spec), so the player launches each one up the chute with Space. The
 * next ball is served there only when the ball in play hits the drain sensor (on
 * the bus, see `GameSession`), and the drained ball is REMOVED first, so at most
 * one ball ever exists. (The rest position lies below `DRAIN_Y`, so a positional
 * check would respawn the parked ball every frame — 03-REVIEW CR-01.)
 */
const BALL_SPAWN = { x: PLUNGER_REST.x, y: PLUNGER_REST.y } as const;

/** Frame-rate smoothing factor for the FPS readout (0..1; higher = snappier). */
const FPS_SMOOTHING = 0.1;

/** Window (ms) over which physics steps are counted into a live Hz figure. */
const HZ_WINDOW_MS = 500;

/** Throttle (ms) for HUD number updates — keeps the readout legible. */
const HUD_UPDATE_MS = 200;

function main(): void {
  const canvas = document.getElementById("stage");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("sandbox canvas #stage not found");
  }

  // Composition root: the one engine-specific construction. Everything else
  // below talks to the world through the `PhysicsWorld` interface only.
  const world = new PlanckWorld({ table: TABLE_SPEC });

  // Keyboard input + flipper FSM (D-10). Constructed ONCE here (never inside
  // frame()). `attach()` registers the window keydown/keyup/blur/focus + document
  // visibilitychange listeners. Neither module imports an engine — only this
  // file's `new PlanckWorld()` above is engine-specific; both talk through the
  // `PhysicsWorld` interface / synthetic-friendly handlers.
  //
  // ORDER (idle-symmetry fix): build the controller — whose constructor commands
  // motor 0 on every flipper — BEFORE the first ball, so the controller's
  // resting == motor-0 invariant already holds when the first ball's CCD-priming
  // step runs the world. TABLE_SPEC mounts use `restPose`, so both bats are built
  // at their droop limit with motor 0: they rest DROOPED in the inverted-V,
  // mirror-symmetric, until a key press (not level; 03-REVIEW IN-03).
  // On Windows the input heals the both-Shift merge (G-04-17).
  const input = new FlipperInput({ windowsShiftHeal: isWindowsPlatform(navigator) });
  input.attach();
  const controller = new FlipperController(world);

  // Plunger (D-07/D-08): Space edge latch + engine-agnostic charge controller,
  // built ONCE beside the flipper stack. The controller launches only through
  // `applyImpulse`, and only a ball resting in PLUNGER_ZONE.
  const plungerInput = new PlungerInput();
  plungerInput.attach();
  const plunger = new PlungerController(world);

  // Game controls: Enter / NumpadEnter latch a start edge (R6); KeyX, Period
  // and ArrowUp latch nudge edges (R9).
  const gameInput = new GameInput();
  gameInput.attach();

  // The collision bus (D-11): one router over the world's pooled event drain,
  // dispatched once per fixed step at the loop's post-step seam. Built before
  // the session so it can listen for the drain from the start.
  const router = new CollisionRouter(world);

  // Side -> flipper-id mapping (D-09/D-10): the physically-LEFT flipper (smaller
  // pivot x) answers the left keys; the right flipper answers the right keys.
  // Computed ONCE from the world, before the session needs it for the gate.
  const flippersByX = world
    .getFlippers()
    .slice()
    .sort((a, b) => a.pivotX - b.pivotX);
  const leftFlipperId = flippersByX[0]?.id ?? 0;
  const rightFlipperId = flippersByX[1]?.id ?? leftFlipperId;

  // The flipper relay (R11, Open Question 1, Pitfall 5): the session turns it
  // off at boot, on a tilt and at game over, and on with every serve. Turning
  // it on re-presses any side whose key is held right now, so a key held
  // through a drain raises its bat on the next ball with no new press. Built
  // once; called only on a start, a tilt, a drain or game over. isHeld reads a
  // held set that heals on a window focus regain, on any non-Shift key event
  // that reports Shift up (G-04-11) and, on Windows, on a Shift keyup reporting
  // Shift up (G-04-17), so a lost keyup no longer survives a serve.
  const flipperGate: FlipperGate = {
    setEnabled(on: boolean): void {
      controller.setEnabled(on);
      if (!on) return;
      if (input.isHeld("left")) controller.onPressEdge(leftFlipperId);
      if (input.isHeld("right")) controller.onPressEdge(rightFlipperId);
    },
  };

  // Phase-4 rules (GAME-01/GAME-02/ELEM-01..03): the session is the 3-ball FSM,
  // the rules gate and the score; it boots into game-over with no ball. The
  // reactive elements score through it. The session is also the rule hooks
  // (06-01, PLSH-05): every registered scoring switch reaches session.onSwitch,
  // which resolves the skill shot, and the session reads the plunger phase to
  // freeze the lit lane. Listener registration order is not load-bearing: both
  // listeners and the hooks only record or award (record-then-service), and the
  // world is mutated only in the two service() calls, in the fixed order of
  // onPostStep.
  // High score (PLSH-08, D-15, D-16): read once here at boot over the guarded
  // localStorage (null when the getter throws), written by the session only at
  // game over on a new best. Every storage failure is silent.
  const highScore = new HighScore(safeLocalStorage());
  const session = new GameSession(world, router, BALL_SPAWN, flipperGate, {
    plunger,
    highScore,
  });
  // Phase-5 cues (AUD-01): registered hits are recorded as scalar cues on the
  // step path (no allocation) and flushed to audio once per render frame.
  const cues = new CueQueue();
  // Element flashes (RND-03) on the fixed-step clock: registered kicks and
  // sensor passes record through CueFeedback; the clock ticks once per step at
  // the end of onPostStep and the renderer reads it at loop.alpha.
  const flash = new FlashTracker(maxElementId(world.getElements()));
  // Presentation effects (PLSH-01): the screen shake on the step clock, fed by
  // registered kicks (through CueFeedback) and by the observer's nudges, tilts
  // and drains; ticked once per step and read by the renderer. Built once.
  const effects = new EffectsTracker(world.getElements());
  const cueFeedback = new CueFeedback(cues, flash, effects);
  const reactive = new ReactiveElements(world, router, session, cueFeedback, session);
  // Walls, the chute and the bats flash on a real hit straight off the bus,
  // silently (D-03): ContactFlash holds only the flash sink, never the cues.
  new ContactFlash(router, flash);
  // Game-event cues (launch, drain, tilt, warning, start, game over) are derived
  // once per step by diffing read-only getters at the end of onPostStep; a drain
  // also flashes the drain apron. Resolved once: -1 when the table has no drain.
  const drainId = world.getElements().find((e) => e.kind === "drain")?.id ?? -1;
  // Each flipper coil is heard going up and coming down (taps and the tilt drop
  // included) from the controller's read-only coil counters. Built once.
  const flipperIds: readonly number[] = [leftFlipperId, rightFlipperId];
  const observer = new PresentationObserver(
    cues,
    flash,
    session,
    plunger,
    drainId,
    controller,
    flipperIds,
    effects,
  );
  // Insert lamps (PLSH-04, D-21): the tracker reads the rollover lights and the
  // session's skill-shot getters once per fixed step and fades each lamp level
  // on the step clock; the renderer reads only those levels. Built once.
  const lamps = new LampTracker(reactive, session);

  // Audio: the factory runs only inside the first trusted gesture (a context
  // built here at boot would start suspended). The DOM factory is handed to a
  // `() => AudioContextLike` parameter with no cast: tsc is the A5 proof.
  const audio = new AudioEngine(
    () => new AudioContext({ latencyHint: "interactive" }),
    Math.random,
  );
  new AudioUnlock(audio).attach();

  const loop = new FixedStepLoop(world);

  // The drain-and-tick step callback (D-10). Built ONCE as a stable, long-lived
  // reference and passed BY REFERENCE to `loop.advance()` every frame, so it adds
  // NO per-frame allocation (threat T-02-05). It runs at the TOP OF EACH FIXED
  // 120 Hz STEP (before that step's `world.step()`): drain the input latch, feed
  // each per-side edge to the FSM, then tick it — so a key press applies on the
  // very next 120 Hz step (<= ~8.3 ms, sub-frame vs a 60 fps render), NOT once
  // per render frame. drainEdges resolves a same-window press and release from
  // the held state at drain time, so applying press before release is always
  // correct (WR-01).
  function onFixedStep(): void {
    const edges = input.drainEdges();
    if (edges.leftPress) controller.onPressEdge(leftFlipperId);
    if (edges.leftRelease) controller.onReleaseEdge(leftFlipperId);
    if (edges.rightPress) controller.onPressEdge(rightFlipperId);
    if (edges.rightRelease) controller.onReleaseEdge(rightFlipperId);
    // Bonus skip (D-12): a press on either side latched at the top of this step
    // ends a running tally at once (the session ignores it outside "bonus" and
    // for a tilt forfeit); the credit and the next serve land in this step's
    // session.service().
    if (edges.leftPress || edges.rightPress) session.onFlipperPress();
    controller.update();

    // Plunger: same top-of-step drain. All of this window's edges go through
    // applyEdges, which orders them by the held state at drain time (IN-02): a
    // release and re-press inside one step launches, then starts a new charge.
    // Release launches the ball in play only if it rests on the plunger; cancel
    // (focus loss) drops the charge with no launch. Then advance the charge.
    const pe = plungerInput.drainEdges();
    plunger.applyEdges(
      pe.press,
      pe.release,
      pe.cancel,
      plungerInput.isHeld(),
      session.activeBallId,
    );
    plunger.update();

    // Game: a start edge starts a game only from game-over (Enter mid-game is
    // ignored by the session); a new game turns every rollover light off (R12).
    // Then each latched nudge (R9): the session applies it only while playing
    // and outside the cooldown, as a velocity impulse at the top of this step.
    // Then the session clock advances one fixed step.
    const ge = gameInput.drainEdges();
    if (ge.start && session.onStart()) reactive.resetLights();
    if (ge.nudgeLeft) session.onNudge("left");
    if (ge.nudgeRight) session.onNudge("right");
    if (ge.nudgeUp) session.onNudge("up");
    // M (D-02): presentation only; the master gain ramps, the sim never reads it.
    if (ge.mute) audio.toggleMute();
    session.tick();
  }

  // Built ONCE and passed by reference, like onFixedStep: runs right after each
  // fixed step's world.step(), so every simulated step's events reach the
  // listeners as exactly one batch and the event pool stays bounded. After the
  // batch is delivered, at this fixed-step boundary (never in the render frame),
  // the rules apply their queued kicks, then the session removes a ball the batch
  // reported drained and serves the next one (or ends the game).
  function onPostStep(): void {
    router.dispatch();
    reactive.service();
    session.service();
    // Diff the session and plunger getters for this step's game-event cues
    // (after the drain and serve landed, before the flash clock advances).
    observer.observe();
    // The lamp levels follow this step's rule state (after the serve landed).
    lamps.update();
    // The effect clocks (shake trauma decay) advance after this step's inputs.
    effects.tick();
    // Last: advance the flash clock one fixed step (it pauses with the sim).
    flash.tick();
  }

  // Renderer selection (T-05-07): an exact string compare on one query
  // parameter; `?debug=1` keeps the diagnosis renderer, anything else draws the
  // procedural table.
  const debug = new URLSearchParams(location.search).get("debug") === "1";
  let debugRenderer: DebugRenderer | null = null;
  let tableRenderer: TableRenderer | null = null;
  if (debug) {
    const dr = new DebugRenderer(canvas);
    debugRenderer = dr;
    dr.resize(world);
    window.addEventListener("resize", () => dr.resize(world));
  } else {
    // The background is opaque, so the visible context needs no alpha channel.
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable for #stage");
    // Offscreen layers for the static bake: plain DOM canvases.
    const layers: LayerFactory = {
      create(width: number, height: number) {
        const layerCanvas = document.createElement("canvas");
        layerCanvas.width = width;
        layerCanvas.height = height;
        const layerCtx = layerCanvas.getContext("2d");
        if (!layerCtx) throw new Error("2D canvas context unavailable for the static layer");
        return { canvas: layerCanvas, ctx: layerCtx };
      },
    };
    const tr = new TableRenderer(canvas, ctx, layers, world);
    tableRenderer = tr;
    // The world box never changes; the view is recomputed from the display.
    const bounds = tableBounds(world.getElements());
    // Narrow viewports (06.4): keep the side panel only when the fitted canvas
    // clears it; otherwise index.html turns the HUD into a bar above the table
    // and the table is fitted under the measured bar. The only layout reads.
    const sandbox = requireElement("sandbox");
    const hud = requireElement("hud");
    const applyView = (): void => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      sandbox.setAttribute("data-hud", "side"); // measure the panel in its side form
      const full = computeView(bounds, vw, vh, dpr);
      if (sideHudClears(full, vw, hud.getBoundingClientRect().right)) {
        tr.resize(full);
        return;
      }
      sandbox.setAttribute("data-hud", "bar");
      // The bar's height, not its bottom: the bottom depends on the stale canvas.
      tr.resize(
        computeView(bounds, vw, heightUnderBar(vh, hud.getBoundingClientRect().height), dpr),
      );
    };
    applyView();
    window.addEventListener("resize", applyView);
    // A dpr change (moving the window to another monitor) may not fire resize
    // (A6): watch the current resolution and re-arm for the new dpr each time.
    let dprQuery: MediaQueryList | null = null;
    const onDprChange = (): void => {
      applyView();
      armDprWatch();
    };
    const armDprWatch = (): void => {
      if (dprQuery) dprQuery.removeEventListener("change", onDprChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener("change", onDprChange);
    };
    armDprWatch();
  }
  // Game HUD: the DOM overlay (score, ball, high score, status), each line
  // written only when its own inputs change. #hud-best is both the best line's
  // text sink and the attribute sink for its new-best pulse (data-new).
  const hudBest = requireElement("hud-best");
  const hudView = new HudView(
    requireTextSink("hud-score"),
    requireTextSink("hud-ball"),
    requireTextSink("hud-status"),
    hudBest,
    hudBest,
  );
  // End-of-ball bonus overlay (06-UI-SPEC, D-12): the tally row by row, shown
  // only in the bonus state; each row, label, value and TOTAL written only when
  // it changes. The elements satisfy both the attribute and the text sinks.
  const bonusView = new BonusView(
    requireElement("hud-bonus"),
    [
      requireElement("hud-bonus-row-0"),
      requireElement("hud-bonus-row-1"),
      requireElement("hud-bonus-row-2"),
    ],
    [
      requireElement("hud-bonus-label-0"),
      requireElement("hud-bonus-label-1"),
      requireElement("hud-bonus-label-2"),
    ],
    [
      requireElement("hud-bonus-value-0"),
      requireElement("hud-bonus-value-1"),
      requireElement("hud-bonus-value-2"),
    ],
    requireElement("hud-bonus-total-row"),
    requireElement("hud-bonus-total"),
  );
  // Reduced motion (D-18): read once here, updated by one change listener; the
  // frame reads only the boolean (T-6-12). The count-up and the bonus row
  // counting snap under it; rule timing is unchanged.
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = reducedMotionQuery.matches;
  reducedMotionQuery.addEventListener("change", (e: MediaQueryListEvent) => {
    reducedMotion = e.matches;
  });
  // Diagnosis readout: DOM text in its own panel (G-04-6), written only when a
  // throttled number changes.
  const diagView = new DiagView(requireTextSink("hud-diag"));
  // Mute marker (05-REVIEW IN-03): "MUTED" beside the M key cap while the
  // sound is off, written only on change; each toggle is announced through the
  // hidden live region (05-REVIEW IN-02).
  const muteView = new MuteView(requireTextSink("hud-mute"), requireTextSink("hud-mute-live"));
  // The key caps show the player's layout (G-04-17, UAT 18 decision A); the
  // markup labels stay where the Keyboard Map API is missing.
  void initKeyLabels(
    document.querySelectorAll<HTMLElement>("kbd[data-code]"),
    document.querySelectorAll<HTMLElement>("[data-layout-only]"),
    navigator,
  );

  // Pre-allocated render buffers — grown only when the ball or bat count grows,
  // so the steady-state rAF loop performs NO per-frame heap allocation (threat
  // T-03-01). One mutable render frame is built once and refilled every frame.
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
    reducedMotion: false,
  };
  const diag: DiagData = { fps: 0, physicsHz: 120, kineticEnergy: 0 };

  // Loop-local scalars (mutated in place; no per-frame allocation).
  let lastTimeMs = performance.now();
  let smoothedFps = 60;
  let hzSteps = 0;
  let hzElapsedMs = 0;
  let hzDisplay = 120;
  let hudElapsedMs = 0;

  function frame(nowMs: number): void {
    // Re-arm first (03-REVIEW WR-04): a throw anywhere below must cost one
    // frame, never stop the sandbox for good.
    requestAnimationFrame(frame);
    const deltaMs = nowMs - lastTimeMs;
    lastTimeMs = nowMs;

    // Advance physics by whole fixed steps; drain the accumulator. The stable
    // `onFixedStep` reference drains input + ticks the FSM at the top of each
    // fixed step (D-10), and `onPostStep` dispatches that step's events on the
    // bus (D-11) — both passed by reference, so no per-frame allocation.
    const steps = loop.advance(deltaMs, onFixedStep, onPostStep);
    // Play the cues those fixed steps recorded, in this same frame.
    audio.flush(cues);

    // Interpolate balls and bats between the loop's previous and current fixed
    // states (smooth motion independent of the render rate, RND-02). A ball
    // whose slot changed identity is drawn at its current state (03-REVIEW WR-02).
    const alpha = loop.alpha;
    interpolateBalls(loop.previous, loop.current, alpha, interpolated);
    interpolateAngles(loop.previousFlipperAngles, loop.currentFlipperAngles, alpha, flipperAngles);

    // FPS: exponential moving average of the instantaneous frame rate.
    if (deltaMs > 0) {
      smoothedFps += (1000 / deltaMs - smoothedFps) * FPS_SMOOTHING;
    }

    // Physics Hz: fixed steps taken per real second over a sliding window. This
    // is what makes the fixed-timestep decoupling visible — it tracks ~120
    // regardless of the FPS above (PHYS-03).
    hzSteps += steps;
    hzElapsedMs += deltaMs;
    if (hzElapsedMs >= HZ_WINDOW_MS) {
      hzDisplay = (hzSteps * 1000) / hzElapsedMs;
      hzSteps = 0;
      hzElapsedMs = 0;
    }

    // Total kinetic energy from the interface's current ball velocities.
    const balls = world.getBalls();
    let kineticEnergy = 0;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b) continue;
      // Settle/energy TREND readout, not a physics-authoritative quantity.
      kineticEnergy += 0.5 * ballMass(b.radius) * (b.vx * b.vx + b.vy * b.vy);
    }

    // Push the readout numbers on a throttle so the readout is legible and
    // DiagView rebuilds its line only on change (no per-frame string churn).
    hudElapsedMs += deltaMs;
    if (hudElapsedMs >= HUD_UPDATE_MS) {
      diag.fps = smoothedFps;
      diag.physicsHz = hzDisplay;
      diag.kineticEnergy = kineticEnergy;
      hudElapsedMs = 0;
    }

    // The charge meter reads the live controller value every frame (not the
    // HUD throttle), so the meter tracks the hold step by step.
    if (tableRenderer) {
      renderFrame.balls = interpolated;
      renderFrame.flipperAngles = flipperAngles;
      renderFrame.plungerCharge = plunger.getCharge();
      renderFrame.lamps = lamps;
      renderFrame.flash = flash;
      renderFrame.alpha = loop.alpha;
      renderFrame.effects = effects;
      renderFrame.reducedMotion = reducedMotion;
      tableRenderer.draw(renderFrame);
    } else if (debugRenderer) {
      debugRenderer.draw(world, interpolated, plunger.getCharge(), reactive);
    }
    // The score, ball and status land in the frame the session changes them
    // (each line written only on change); the score line counts up over the
    // simulated time this frame advanced, so it freezes with the physics.
    hudView.update(session, steps * FIXED_DT, reducedMotion);
    bonusView.update(session, reducedMotion);
    muteView.update(audio.isMuted());
    diagView.update(diag);
  }

  requestAnimationFrame(frame);
}

/**
 * `window.localStorage`, or null when it is unavailable (D-16): the getter
 * itself throws a `SecurityError` when storage is blocked, so it is read inside
 * a try/catch and any throw degrades silently to the in-memory best.
 */
function safeLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: silent per D-16
  }
}

/** The element with this id as a text sink; throws a clear error if missing. */
function requireTextSink(id: string): TextSink {
  return requireElement(id);
}

/** The element with this id (a text and an attribute sink); throws a clear error if missing. */
function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`sandbox HUD element #${id} not found`);
  return el;
}

main();
