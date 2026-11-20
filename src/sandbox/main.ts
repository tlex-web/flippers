/**
 * Sandbox entry — our original table (D-03) on screen through the one spec.
 *
 * Wires the whole stack end-to-end: it constructs the Planck world from
 * `TABLE_SPEC` (the ONLY engine-specific line is `new PlanckWorld(...)`, the
 * composition root), drives it through the engine-agnostic fixed-step loop, and
 * renders the INTERPOLATED ball + table outline + flippers + velocity + contacts
 * + HUD + plunger charge meter via the Canvas debug renderer. The outline
 * (outer walls, right-side launch chute, drain funnel, trough walls) and both
 * flipper mounts all come from the single resolve of the spec, so what is drawn
 * is what is hit. Every read of world state goes through the `PhysicsWorld`
 * interface — this file never imports the engine (D-05/D-07).
 *
 * The game (GAME-02): the sandbox boots into game-over (attract) with no ball on
 * the table. Enter or NumpadEnter starts a 3-ball game through `GameSession`,
 * which serves every ball to the plunger (launched with Space), serves the next
 * one when the ball in play drains, and ends the game after the third drain.
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
 * changes).
 *
 * Fixed-step order:
 * - `onFixedStep` (top of each step): flipper edges then the flipper FSM; the
 *   plunger edges through `applyEdges` (same-window order from the held state)
 *   then the charge; then the start edge (a started game resets the lights);
 *   then the nudge edges (`session.onNudge`); then `session.tick()`.
 * - `onPostStep` (after `world.step()`): `router.dispatch()`, then
 *   `reactive.service()` (kicks), then `session.service()` (drain and serve).
 *
 * The canvas readout (FPS, physics Hz, KE, contacts) is a DIAGNOSIS tool only:
 * it asserts nothing about pass/fail. The tunnel-proof gates stay headless
 * (`npm run soak`).
 */

import { PlanckWorld } from "../physics/planck-world";
import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { PlungerController } from "../control/plunger-controller";
import { GameSession } from "../game/game-session";
import { ReactiveElements } from "../game/reactive-elements";
import { FlipperInput } from "../input/flipper-input";
import { GameInput } from "../input/game-input";
import { PlungerInput } from "../input/plunger-input";
import { ballMass } from "../physics/constants";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST, TABLE_SPEC } from "../table/spec";
import { HudView, type TextSink } from "../ui/hud";
import { DebugRenderer, type HudData, type InterpolatedBall } from "./debug-draw";

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
  // frame()). `attach()` registers the window keydown/keyup/blur + document
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
  const input = new FlipperInput();
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

  // Phase-4 rules (GAME-01/GAME-02/ELEM-01..03): the session is the 3-ball FSM,
  // the rules gate and the score; it boots into game-over with no ball. The
  // reactive elements score through it. Listener registration order is not
  // load-bearing: both listeners only record or award, and the world is mutated
  // only in the two service() calls, in the fixed order of onPostStep.
  const session = new GameSession(world, router, BALL_SPAWN);
  const reactive = new ReactiveElements(world, router, session);

  const loop = new FixedStepLoop(world);

  // Side -> flipper-id mapping (D-09/D-10): the physically-LEFT flipper (smaller
  // pivot x) answers the left keys; the right flipper answers the right keys.
  // Computed ONCE from the world.
  const flippersByX = world
    .getFlippers()
    .slice()
    .sort((a, b) => a.pivotX - b.pivotX);
  const leftFlipperId = flippersByX[0]?.id ?? 0;
  const rightFlipperId = flippersByX[1]?.id ?? leftFlipperId;

  // The drain-and-tick step callback (D-10). Built ONCE as a stable, long-lived
  // reference and passed BY REFERENCE to `loop.advance()` every frame, so it adds
  // NO per-frame allocation (threat T-02-05). It runs at the TOP OF EACH FIXED
  // 120 Hz STEP (before that step's `world.step()`): drain the input latch, feed
  // each per-side edge to the FSM, then tick it — so a key press applies on the
  // very next 120 Hz step (<= ~8.3 ms, sub-frame vs a 60 fps render), NOT once
  // per render frame.
  function onFixedStep(): void {
    const edges = input.drainEdges();
    if (edges.leftPress) controller.onPressEdge(leftFlipperId);
    if (edges.leftRelease) controller.onReleaseEdge(leftFlipperId);
    if (edges.rightPress) controller.onPressEdge(rightFlipperId);
    if (edges.rightRelease) controller.onReleaseEdge(rightFlipperId);
    controller.update();

    // Plunger: same top-of-step drain. All of this window's edges go through
    // applyEdges, which orders them by the held state at drain time (IN-02): a
    // release and re-press inside one step launches, then starts a new charge.
    // Release launches the ball in play only if it rests on the plunger; cancel
    // (focus loss) drops the charge with no launch. Then advance the charge.
    const pe = plungerInput.drainEdges();
    plunger.applyEdges(pe.press, pe.release, pe.cancel, plungerInput.isHeld(), session.activeBallId);
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
  }

  const renderer = new DebugRenderer(canvas);
  // Game HUD: the DOM overlay (score, ball, status), each line written only
  // when its own inputs change.
  const hudView = new HudView(
    requireTextSink("hud-score"),
    requireTextSink("hud-ball"),
    requireTextSink("hud-status"),
  );
  renderer.resize(world);
  window.addEventListener("resize", () => renderer.resize(world));

  // Pre-allocated render buffers — grown only when the ball count grows, so the
  // steady-state rAF loop performs NO per-frame heap allocation (threat T-03-01).
  const interpolated: InterpolatedBall[] = [];
  const hud: HudData = { fps: 0, physicsHz: 120, kineticEnergy: 0 };

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

    // Interpolate each ball between the loop's previous and current fixed states
    // (smooth motion independent of the render rate). The two buffers are
    // paired by index, which a respawn (or removeBall's swap-remove) breaks, so
    // only lerp when both slots hold the SAME ball; otherwise draw the current
    // state as-is rather than a ghost streak between two balls (03-REVIEW WR-02).
    const previous = loop.previous;
    const current = loop.current;
    const alpha = loop.alpha;
    growTo(interpolated, current.length);
    interpolated.length = current.length;
    for (let i = 0; i < current.length; i++) {
      const c = current[i];
      if (!c) continue;
      const prev = previous[i];
      const p = prev && prev.id === c.id ? prev : c;
      const out = interpolated[i];
      if (!out) continue;
      out.id = c.id;
      out.x = p.x + (c.x - p.x) * alpha;
      out.y = p.y + (c.y - p.y) * alpha;
      out.vx = p.vx + (c.vx - p.vx) * alpha;
      out.vy = p.vy + (c.vy - p.vy) * alpha;
      out.radius = c.radius;
      out.angle = c.angle;
    }

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

    // Push HUD numbers on a throttle so the readout is legible and the renderer
    // only reformats its cached strings on change (no per-frame string churn).
    hudElapsedMs += deltaMs;
    if (hudElapsedMs >= HUD_UPDATE_MS) {
      hud.fps = smoothedFps;
      hud.physicsHz = hzDisplay;
      hud.kineticEnergy = kineticEnergy;
      hudElapsedMs = 0;
    }

    // The charge meter reads the live controller value every frame (not the
    // HUD throttle), so the meter tracks the hold step by step.
    renderer.draw(world, interpolated, hud, plunger.getCharge(), reactive);
    // The score, ball and status land in the frame the session changes them
    // (each line written only on change).
    hudView.update(session);
  }

  requestAnimationFrame(frame);
}

/** The element with this id as a text sink; throws a clear error if missing. */
function requireTextSink(id: string): TextSink {
  const el = document.getElementById(id);
  if (!el) throw new Error(`sandbox HUD element #${id} not found`);
  return el;
}

/** Grow `pool` to at least `n` reusable ball buffers (only allocates on growth). */
function growTo(pool: InterpolatedBall[], n: number): void {
  while (pool.length < n) {
    pool.push({ id: 0, x: 0, y: 0, vx: 0, vy: 0, radius: 0, angle: 0 });
  }
}

main();
