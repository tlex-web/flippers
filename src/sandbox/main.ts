/**
 * Physics sandbox entry — the Walking Skeleton's user-visible slice (plan 01-03).
 *
 * Wires the whole stack end-to-end: it constructs the Planck world (the ONLY
 * engine-specific line is `new PlanckWorld()`, the composition root), drives it
 * through the engine-agnostic fixed-step loop, and renders the INTERPOLATED ball
 * + walls + velocity + contacts + HUD via the throwaway Canvas debug renderer.
 * Every read of world state goes through the `PhysicsWorld` interface — this file
 * never imports `planck` (D-05/D-07).
 *
 * This is a DIAGNOSIS tool only (D-03): it asserts nothing about pass/fail. The
 * tunnel-proof pass/fail gate is the headless soak (plan 01-06).
 */

import { PlanckWorld } from "../physics/planck-world";
import { FlipperController } from "../control/flipper-controller";
import { FlipperInput } from "../input/flipper-input";
import { FixedStepLoop } from "../sim/loop";
import type { BallState } from "../physics/types";
import { DebugRenderer, type HudData, type InterpolatedBall } from "./debug-draw";

/**
 * Diagnostic "mass" density (kg/m²), mirroring the adapter's solver density
 * (`BALL_DENSITY = 1` in planck-world.ts) so the HUD kinetic-energy read is
 * consistent with the simulated ball. KE here is a settle/energy TREND readout,
 * not a physics-authoritative quantity (the pass/fail gate is the soak, 01-06).
 */
const BALL_DENSITY = 1;

/**
 * Ball spawn: near the top of the 2 m × 3 m box, centred with a small sideways
 * nudge, so it visibly falls down the tilted playfield, grazes a wall, and
 * settles — an honest first read on weighty motion (PHYS-01) and interpolation.
 */
const BALL_SPAWN = { x: 1.0, y: 0.5, vx: 0.6 } as const;

/** Frame-rate smoothing factor for the FPS readout (0..1; higher = snappier). */
const FPS_SMOOTHING = 0.1;

/** Window (ms) over which physics steps are counted into a live Hz figure. */
const HZ_WINDOW_MS = 500;

/** Throttle (ms) for HUD number updates — keeps the readout legible. */
const HUD_UPDATE_MS = 200;

/**
 * Ball-feed drain line (meters, world y). Below every flipper hinge (the pivots
 * sit at y ≈ 2.35–2.6) but above a floor-resting ball's center (≈ 2.8): once the
 * tracked ball's center passes this it has left the flipper zone for the floor,
 * so the rig drops a fresh one (D-11). Throwaway scaffold — NOT table geometry.
 */
const FEED_DRAIN_Y = 2.72;

function main(): void {
  const canvas = document.getElementById("stage");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("sandbox canvas #stage not found");
  }

  // Composition root: the one engine-specific construction. Everything else
  // below talks to the world through the `PhysicsWorld` interface only.
  const world = new PlanckWorld();
  let activeBallId = world.addBall(BALL_SPAWN);
  const loop = new FixedStepLoop(world);

  // Keyboard input + flipper FSM (D-10). Constructed ONCE here (never inside
  // frame()). `attach()` registers the window keydown/keyup/blur + document
  // visibilitychange listeners. Neither module imports an engine — only this
  // file's `new PlanckWorld()` above is engine-specific; both talk through the
  // `PhysicsWorld` interface / synthetic-friendly handlers.
  const input = new FlipperInput();
  input.attach();
  const controller = new FlipperController(world);

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

    // Ball-feed rig (D-11): once the tracked ball drains below the flipper zone,
    // drop a fresh one so the flippers always have something to catch. Throwaway
    // scaffold — NOT real table geometry. No steady-state allocation: `findBall`
    // reuses the pooled snapshot and `addBall` runs only on the (rare) drain.
    const activeBall = findBall(world.getBalls(), activeBallId);
    if (activeBall && activeBall.y > FEED_DRAIN_Y) {
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
