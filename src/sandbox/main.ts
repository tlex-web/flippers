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
 * interface — this file never imports the engine (D-05/D-07). Every ball is
 * parked on the plunger and launched with Space.
 *
 * Every contact flows through the one-way collision bus (D-11): a
 * `CollisionRouter` drains the world once per fixed step and fans the batch out
 * in registration order. The Phase-4 rules consume it first: `ReactiveElements`
 * records bumper hits (points through the `GameSession` gate, kicks applied in
 * its `service()` right after dispatch), then the ball feed watches the drain,
 * and a demo listener logs what the ball touched. The running score shows in a
 * DOM HUD overlay (`#hud-score`, written only when it changes).
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
import { PlungerInput } from "../input/plunger-input";
import { ballMass } from "../physics/constants";
import { FixedStepLoop } from "../sim/loop";
import type { CollisionEvent } from "../physics/types";
import { PLUNGER_REST, TABLE_SPEC } from "../table/spec";
import { HudView, type TextSink } from "../ui/hud";
import { BallFeed } from "./ball-feed";
import { DebugRenderer, type HudData, type InterpolatedBall } from "./debug-draw";

/**
 * Ball feed: park ONE ball on the plunger at `PLUNGER_REST` (from the spec), so
 * the player launches every ball up the chute with Space. A fresh ball is re-fed
 * there only when the tracked one hits the drain sensor (on the bus, see
 * `BallFeed`), and the drained ball is REMOVED first, so exactly one ball ever
 * exists. (The rest position lies below `DRAIN_Y`, so a positional check would
 * respawn the parked ball every frame — 03-REVIEW CR-01.)
 */
const BALL_SPAWN = { x: PLUNGER_REST.x, y: PLUNGER_REST.y } as const;

/** Frame-rate smoothing factor for the FPS readout (0..1; higher = snappier). */
const FPS_SMOOTHING = 0.1;

/** Window (ms) over which physics steps are counted into a live Hz figure. */
const HZ_WINDOW_MS = 500;

/** Throttle (ms) for HUD number updates — keeps the readout legible. */
const HUD_UPDATE_MS = 200;

/**
 * Demo bus consumer throttle: solid contacts (walls, chute, bumpers, slings,
 * flippers, other balls) log at most once per this many events, because a
 * resting or rolling ball reports one every step. Sensor crossings are rare by
 * construction and always log (threat T-03-17: keep the console legible).
 */
const SOLID_LOG_EVERY = 30;

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

  // The collision bus (D-11): one router over the world's pooled event drain,
  // dispatched once per fixed step at the loop's post-step seam. Built before
  // the first ball so the feed can listen for the drain from the start.
  const router = new CollisionRouter(world);

  // Phase-4 rules (ELEM-01/GAME-01): the session is the rules gate and holds the
  // score; the reactive elements register on the bus BEFORE the feed, so a kick
  // is queued and applied before a drained ball is removed.
  const session = new GameSession();
  const reactive = new ReactiveElements(world, router, session);

  const feed = new BallFeed(world, router, BALL_SPAWN);
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

    // Plunger: same top-of-step drain. Press starts the charge, release launches
    // the tracked ball (if it rests on the plunger), cancel (focus loss) drops
    // the charge with no launch; then advance the charge one fixed step.
    const plungerEdges = plungerInput.drainEdges();
    if (plungerEdges.press) plunger.onPressEdge();
    if (plungerEdges.release) plunger.onReleaseEdge(feed.activeBallId);
    if (plungerEdges.cancel) plunger.onCancelEdge();
    plunger.update();
  }

  // Beside the feed's drain listener, exactly ONE demo listener. It copies out
  // only scalars into the string of a line it actually logs; it never keeps the
  // pooled record, never calls back into the world, and carries no scoring,
  // kick or rule logic (D-06/D-11).
  let solidSinceLog = 0;
  router.register((e: CollisionEvent): void => {
    const kind = e.elementKind;
    if (kind === "lane" || kind === "rollover" || kind === "drain") {
      console.log(
        `[bus] ball ${e.ballId} ${kind} #${e.elementId} at (${e.point.x.toFixed(2)}, ${e.point.y.toFixed(2)})`,
      );
      return;
    }
    // Strings are built only for a line that is actually logged.
    solidSinceLog++;
    if (solidSinceLog < SOLID_LOG_EVERY) return;
    solidSinceLog = 0;
    console.log(
      `[bus] ball ${e.ballId} ${kind} #${e.elementId} at (${e.point.x.toFixed(2)}, ${e.point.y.toFixed(2)}) impulse ${e.normalImpulse.toFixed(3)}`,
    );
  });

  // Built ONCE and passed by reference, like onFixedStep: runs right after each
  // fixed step's world.step(), so every simulated step's events reach the
  // listeners as exactly one batch and the event pool stays bounded. After the
  // batch is delivered, at this fixed-step boundary (never in the render frame),
  // the rules apply their queued kicks, then the feed replaces a ball the batch
  // reported drained.
  function onPostStep(): void {
    router.dispatch();
    reactive.service();
    feed.service();
  }

  const renderer = new DebugRenderer(canvas);
  // Score HUD: the DOM overlay, written only when the score changes.
  const hudView = new HudView(requireTextSink("hud-score"));
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
    // The score lands in the frame the hit lands (write only on change).
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
