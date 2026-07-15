/**
 * THROWAWAY Canvas 2D debug renderer (D-06/D-07).
 *
 * Diagnosis-only: it draws the live physics world — boundary walls, the max-speed
 * test flipper, the ball at its INTERPOLATED position, the ball's velocity
 * vector, the current contact points, and a text HUD (FPS, physics-step Hz, total
 * kinetic energy). It reads world state ONLY through the engine-agnostic
 * `PhysicsWorld` interface — it NEVER imports Planck — so it is a pure consumer of
 * the contract, exactly like the soak harness (D-05).
 *
 * It is deliberately minimal and is NOT engineered for carry-forward into the
 * Phase-5 real renderer (D-07): no scene graph, no asset pipeline, no Planck
 * `Testbed`. Buffers/gradients/strings are reused; there is no steady-state
 * per-frame heap allocation on the render path (threat T-03-01).
 */

import { PIXELS_PER_METER } from "../physics/constants";
import type {
  BallState,
  FlipperState,
  PhysicsWorld,
  Segment,
  Vec2,
} from "../physics/types";

/** A ball snapshot at its drawn (interpolated) position — a mutable `BallState`. */
export type InterpolatedBall = { -readonly [K in keyof BallState]: BallState[K] };

/** Live HUD readouts (numbers only; the renderer owns their formatting/caching). */
export interface HudData {
  /** Rendered frames per second (smoothed). */
  fps: number;
  /** Fixed physics steps per real second (windowed) — should track ~120. */
  physicsHz: number;
  /** Total kinetic energy across all balls (J) — a settle/energy-trend read. */
  kineticEnergy: number;
}

/** Padding (CSS px) around the world box so strokes/HUD are not clipped. */
const PAD = 24;

/**
 * Velocity vector length: draw where the ball would be `VEL_LOOKAHEAD_S` seconds
 * ahead at its current velocity, so the arrow points along motion and shrinks as
 * the ball slows — a direct visual read of speed.
 */
const VEL_LOOKAHEAD_S = 0.15;

// Throwaway palette.
const COL_BG = "#05060d";
const COL_WALL = "#3d5a80";
const COL_FLIPPER = "#8e7dbe";
const COL_BALL_CORE = "#ffd166";
const COL_BALL_EDGE = "#e07a1f";
const COL_VEL = "#ef476f";
const COL_CONTACT = "#06d6a0";
const COL_HUD = "#e0e6f0";

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(walls: readonly Segment[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

export class DebugRenderer {
  private readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;

  private dpr = 1;

  // Backing-store logical size (CSS px, pre-dpr) and world-origin offset.
  private boxWpx = 0;
  private boxHpx = 0;
  private offX = PAD;
  private offY = PAD;

  // Cached ball gradient — rebuilt only when the drawn radius (px) changes, then
  // reused every frame via a translate, so steady state allocates nothing.
  private ballGradient: CanvasGradient | null = null;
  private ballGradientRadiusPx = -1;

  // Cached HUD strings — reformatted only when a HUD value changes.
  private readonly hudLines: string[] = ["", "", ""];
  private lastFps = NaN;
  private lastHz = NaN;
  private lastKe = NaN;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  /**
   * Size the backing store for the world's bounding box at `PIXELS_PER_METER`,
   * scaled by `devicePixelRatio` for crisp HiDPI, and fit the on-screen display
   * into the viewport (preserving aspect ratio). Call on init and on resize.
   */
  resize(world: PhysicsWorld): void {
    const b = boundsOf(world.getBoundarySegments());
    this.offX = PAD - b.minX * PIXELS_PER_METER;
    this.offY = PAD - b.minY * PIXELS_PER_METER;
    this.boxWpx = (b.maxX - b.minX) * PIXELS_PER_METER + PAD * 2;
    this.boxHpx = (b.maxY - b.minY) * PIXELS_PER_METER + PAD * 2;

    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.boxWpx * this.dpr);
    this.canvas.height = Math.round(this.boxHpx * this.dpr);

    // Fit the crisp bitmap into the viewport (CSS px), preserving aspect ratio.
    const fit = Math.min(
      (window.innerWidth * 0.96) / this.boxWpx,
      (window.innerHeight * 0.96) / this.boxHpx,
      1,
    );
    this.canvas.style.width = `${this.boxWpx * fit}px`;
    this.canvas.style.height = `${this.boxHpx * fit}px`;
  }

  /**
   * Render one frame from interface state. `balls` are the drawn (interpolated)
   * positions computed by the caller from the loop's previous/current pair.
   */
  draw(
    world: PhysicsWorld,
    balls: readonly InterpolatedBall[],
    hud: HudData,
  ): void {
    const ctx = this.ctx;
    const dpr = this.dpr;

    // Clear the whole backing store in device space (no aliasing slivers).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // World space: device-pixel scale (dpr) then translate to the world origin.
    // Everything below is drawn in meters × PIXELS_PER_METER.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.offX, this.offY);

    this.drawWalls(world.getBoundarySegments());
    this.drawFlippers(world.getFlippers());
    this.drawBalls(balls);
    this.drawVelocities(balls);
    this.drawContacts(world.getContactPoints());

    // HUD in screen space (dpr scale only, no world translate).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHud(hud);
  }

  private drawWalls(walls: readonly Segment[]): void {
    const ctx = this.ctx;
    ctx.strokeStyle = COL_WALL;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const w of walls) {
      ctx.beginPath();
      ctx.moveTo(w.a.x * PIXELS_PER_METER, w.a.y * PIXELS_PER_METER);
      ctx.lineTo(w.b.x * PIXELS_PER_METER, w.b.y * PIXELS_PER_METER);
      ctx.stroke();
    }
  }

  private drawFlippers(flippers: readonly FlipperState[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = COL_FLIPPER;
    for (const f of flippers) {
      // Draw the D-07 capsule as a STADIUM: a rectangular core capped by a
      // rounded tip (and hinge) of radius tipRadius. The loop iterates every
      // flipper, so the mirrored second bat draws for free; the body `angle`
      // already carries the mirror (≈π), so this needs no per-flipper casing.
      const tr = f.tipRadius * PIXELS_PER_METER;
      const len = f.length * PIXELS_PER_METER;
      ctx.save();
      ctx.translate(f.pivotX * PIXELS_PER_METER, f.pivotY * PIXELS_PER_METER);
      ctx.rotate(f.angle);
      // Core: from the pivot along local +x by length, half-thickness tipRadius.
      ctx.fillRect(0, -tr, len, tr * 2);
      // Rounded tip + rounded hinge (no per-frame allocation — ctx paths only).
      ctx.beginPath();
      ctx.arc(len, 0, tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawBalls(balls: readonly InterpolatedBall[]): void {
    const ctx = this.ctx;
    for (const b of balls) {
      const rpx = b.radius * PIXELS_PER_METER;
      if (rpx !== this.ballGradientRadiusPx || this.ballGradient === null) {
        const g = ctx.createRadialGradient(
          -rpx * 0.3,
          -rpx * 0.3,
          rpx * 0.1,
          0,
          0,
          rpx,
        );
        g.addColorStop(0, COL_BALL_CORE);
        g.addColorStop(1, COL_BALL_EDGE);
        this.ballGradient = g;
        this.ballGradientRadiusPx = rpx;
      }
      const grad = this.ballGradient;
      if (grad === null) continue;
      ctx.save();
      ctx.translate(b.x * PIXELS_PER_METER, b.y * PIXELS_PER_METER);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rpx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawVelocities(balls: readonly InterpolatedBall[]): void {
    const ctx = this.ctx;
    ctx.strokeStyle = COL_VEL;
    ctx.fillStyle = COL_VEL;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const b of balls) {
      const cx = b.x * PIXELS_PER_METER;
      const cy = b.y * PIXELS_PER_METER;
      const ex = (b.x + b.vx * VEL_LOOKAHEAD_S) * PIXELS_PER_METER;
      const ey = (b.y + b.vy * VEL_LOOKAHEAD_S) * PIXELS_PER_METER;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Arrowhead (skip when the vector is too short to have a direction).
      const dx = ex - cx;
      const dy = ey - cy;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        const ux = dx / len;
        const uy = dy / len;
        const head = 10;
        const wing = 6;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ux * head - uy * wing, ey - uy * head + ux * wing);
        ctx.lineTo(ex - ux * head + uy * wing, ey - uy * head - ux * wing);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawContacts(points: readonly Vec2[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = COL_CONTACT;
    const s = 5;
    for (const p of points) {
      ctx.fillRect(
        p.x * PIXELS_PER_METER - s,
        p.y * PIXELS_PER_METER - s,
        s * 2,
        s * 2,
      );
    }
  }

  private drawHud(hud: HudData): void {
    const ctx = this.ctx;
    if (
      hud.fps !== this.lastFps ||
      hud.physicsHz !== this.lastHz ||
      hud.kineticEnergy !== this.lastKe
    ) {
      this.lastFps = hud.fps;
      this.lastHz = hud.physicsHz;
      this.lastKe = hud.kineticEnergy;
      this.hudLines[0] = `FPS        ${hud.fps.toFixed(0)}`;
      this.hudLines[1] = `Physics    ${hud.physicsHz.toFixed(0)} Hz`;
      this.hudLines[2] = `Kinetic E  ${hud.kineticEnergy.toFixed(3)} J`;
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(8, 8, 196, 68);
    ctx.font = "14px ui-monospace, Menlo, Consolas, monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = COL_HUD;
    let y = 16;
    for (const line of this.hudLines) {
      ctx.fillText(line, 16, y);
      y += 18;
    }
  }
}
