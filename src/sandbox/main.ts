/**
 * Sandbox entry — our original table (D-03) on screen through the one spec.
 *
 * Wires the whole stack end-to-end: it constructs the Planck world from
 * `TABLE_SPEC` (the ONLY engine-specific line is `new PlanckWorld(...)`, the
 * composition root), drives it through the engine-agnostic fixed-step loop, and
 * renders the INTERPOLATED ball + table outline + flippers + velocity + contacts
 * + HUD via the Canvas debug renderer. The outline (outer walls, right-side
 * launch chute, drain funnel, trough walls) and both flipper mounts all come
 * from the single resolve of the spec, so what is drawn is what is hit. Every
 * read of world state goes through the `PhysicsWorld` interface — this file
 * never imports the engine (D-05/D-07).
 *
 * This is a DIAGNOSIS tool only: it asserts nothing about pass/fail. The
 * tunnel-proof gates stay headless (`npm run soak`).
 */

import { PlanckWorld } from "../physics/planck-world";
import { FlipperController } from "../control/flipper-controller";
import { FlipperInput } from "../input/flipper-input";
import { FixedStepLoop } from "../sim/loop";
import type { BallState } from "../physics/types";
import { DRAIN_Y, PLAYFIELD_CENTER_X, TABLE_SPEC } from "../table/spec";
import { DebugRenderer, type HudData, type InterpolatedBall } from "./debug-draw";

/**
 * Diagnostic "mass" density (kg/m²), mirroring the adapter's solver density
 * (`BALL_DENSITY = 1` in planck-world.ts) so the HUD kinetic-energy read is
 * consistent with the simulated ball. KE here is a settle/energy TREND readout,
 * not a physics-authoritative quantity (the pass/fail gate is the soak, 01-06).
 */
const BALL_DENSITY = 1;

/**
 * Ball feed: drop ONE ball into the upper playfield, just right of the
 * playfield axis, so it falls through the open field toward the funnel and the
 * flipper pair, where either bat can catch, hold and flip it. A fresh ball is
 * re-fed only when the tracked one crosses the drain line (`DRAIN_Y`, from the
 * spec), and the drained ball is REMOVED first, so exactly one ball ever exists.
 * A stand-in feed until the plunger launches balls up the chute.
 */
const BALL_SPAWN = { x: PLAYFIELD_CENTER_X + 0.05, y: 1.4, vx: 0 } as const;

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
  // motor 0 on every flipper, freezing both bats at their symmetric construction
  // angle (level) — BEFORE the first ball. If the ball were added first, its CCD-
  // priming step would run the flippers' default motor for one step and drift the
  // mirror pair a quarter-radian apart (the human-checkpoint "not on the same
  // height" idle). Both bats then rest LEVEL and mirror-symmetric until a key press.
  const input = new FlipperInput();
  input.attach();
  const controller = new FlipperController(world);

  let activeBallId = world.addBall(BALL_SPAWN);
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
  }

  const renderer = new DebugRenderer(canvas);
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
    const deltaMs = nowMs - lastTimeMs;
    lastTimeMs = nowMs;

    // Advance physics by whole fixed steps; drain the accumulator. The stable
    // `onFixedStep` reference drains input + ticks the FSM at the top of each
    // fixed step (D-10) — passed by reference, so no per-frame allocation.
    const steps = loop.advance(deltaMs, onFixedStep);

    // Drain and discard collision events every frame. This sandbox has no event
    // consumer yet (D-03: it asserts nothing), but `step()` pushes an event per
    // contacting step — leaving them undrained would grow the adapter's event
    // buffer without bound for the life of the tab. Draining resets the pool so
    // it stays bounded; the reused-view drain allocates nothing per frame.
    world.drainEvents();

    // Ball feed: once the tracked ball crosses the spec's drain line, REMOVE it
    // and drop a fresh one into the upper field, so exactly one ball ever exists.
    // No steady-state allocation: `findBall` reuses the pooled snapshot and
    // remove/add run only on the (rare) drain.
    const activeBall = findBall(world.getBalls(), activeBallId);
    if (activeBall && activeBall.y > DRAIN_Y) {
      world.removeBall(activeBallId);
      activeBallId = world.addBall(BALL_SPAWN);
    }

    // Interpolate each ball between the loop's previous and current fixed states
    // (smooth motion independent of the render rate).
    const previous = loop.previous;
    const current = loop.current;
    const alpha = loop.alpha;
    growTo(interpolated, current.length);
    interpolated.length = current.length;
    for (let i = 0; i < current.length; i++) {
      const c = current[i];
      if (!c) continue;
      const p = previous[i] ?? c;
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
      const mass = BALL_DENSITY * Math.PI * b.radius * b.radius;
      kineticEnergy += 0.5 * mass * (b.vx * b.vx + b.vy * b.vy);
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

    renderer.draw(world, interpolated, hud);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

/** Grow `pool` to at least `n` reusable ball buffers (only allocates on growth). */
function growTo(pool: InterpolatedBall[], n: number): void {
  while (pool.length < n) {
    pool.push({ id: 0, x: 0, y: 0, vx: 0, vy: 0, radius: 0, angle: 0 });
  }
}

/** Find a ball by id in the pooled snapshot (no allocation). */
function findBall(balls: readonly BallState[], id: number): BallState | undefined {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b && b.id === id) return b;
  }
  return undefined;
}

main();
