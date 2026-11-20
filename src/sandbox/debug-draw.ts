/**
 * THROWAWAY Canvas 2D debug renderer (D-06/D-07).
 *
 * Diagnosis-only: it draws the live physics world — the table elements of the
 * one resolved spec (`getElements()`: wall/chute polylines, dashed sensors,
 * circles), the flipper bats, the ball at its INTERPOLATED position, the ball's velocity
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

import { BALL_RADIUS_M, PIXELS_PER_METER } from "../physics/constants";
import type {
  BallState,
  FlipperState,
  PhysicsWorld,
  Vec2,
} from "../physics/types";
import type { ResolvedElement } from "../table/resolve";
import { PLUNGER_REST, PLUNGER_ZONE, type ElementKind } from "../table/spec";

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

/**
 * Read-only light state the renderer draws from (the rules side, e.g.
 * `ReactiveElements`). The renderer never writes it.
 */
export interface LightState {
  isLit(elementId: number): boolean;
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
const COL_METER_FRAME = "#9fb3c8";
const COL_METER_TICK = "rgba(159, 179, 200, 0.45)";
const COL_METER_FILL = "#f4a261";
const COL_METER_FULL = "#ef476f";
const COL_PLUNGER = "#c9d6e3";
/** A lit top rollover: solid, bright and wide. Real glow is Phase 6 (PLSH-04). */
const COL_ROLLOVER_LIT = "#d9ff66";
/** Line width (px) of a lit rollover; every other element strokes at 3. */
const LIT_ROLLOVER_WIDTH = 6;

/*
 * Plunger charge meter + pullback (D-10). The meter is an outlined vertical bar
 * just right of the cabinet's chute wall, spanning PLUNGER_ZONE's height, that
 * fills bottom to top with the controller's normalized charge. The pullback is
 * the plunger tip under the resting ball, displaced down by charge * 0.15 m.
 * Both sit OUTSIDE the playfield, so they never cover the ball or a wall; the
 * renderer widens its bounds by the margins below to make room for them.
 */
/** Gap (m) between the cabinet's right wall and the meter. */
const METER_GAP_M = 0.08;
/** Meter bar width (m). */
const METER_WIDTH_M = 0.14;
/** Extra world margin (m) right of the cabinet for the meter. */
const METER_MARGIN_X_M = METER_GAP_M + METER_WIDTH_M + 0.04;
/** Pullback travel (m) at full charge. */
const PULLBACK_M = 0.15;
/** Plunger-tip bar thickness (m) and its inset (m) from each chute wall. */
const PLUNGER_TIP_THICK_M = 0.04;
const PLUNGER_TIP_INSET_M = 0.06;
/** Extra world margin (m) below the cabinet for the pullback travel. */
const PULLBACK_MARGIN_Y_M = PULLBACK_M + PLUNGER_TIP_THICK_M + 0.06;

/**
 * Per-kind element styling, built ONCE at module load (no per-frame object or
 * string creation). Flipper mounts are never drawn from here (the live bats
 * come from `getFlippers()`), but the record covers every kind so a new
 * `ElementKind` is a compile error until it is styled.
 */
const KIND_STYLE: Readonly<
  Record<ElementKind, { readonly stroke: string; readonly fill: string }>
> = {
  wall: { stroke: COL_WALL, fill: COL_WALL },
  chute: { stroke: "#5c7fa8", fill: "#5c7fa8" },
  drain: { stroke: "#ef476f", fill: "#ef476f" },
  bumper: { stroke: "#f4a261", fill: "#7a4a24" },
  slingshot: { stroke: "#e9c46a", fill: "#6b5a2a" },
  lane: { stroke: "#2a9d8f", fill: "#2a9d8f" },
  rollover: { stroke: "#8ac926", fill: "#3d5a12" },
  flipper: { stroke: COL_FLIPPER, fill: COL_FLIPPER },
};

/** Dash pattern for sensors (CSS px), and the empty pattern restoring solid. */
const SENSOR_DASH: number[] = [10, 8];
const SOLID_DASH: number[] = [];

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Extend `b` to include point (x, y). */
function include(b: Bounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
}

/** Bounds of every element's vertices, circle extents and mount pivots. */
function boundsOf(elements: readonly ResolvedElement[]): Bounds {
  const b: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const el of elements) {
    for (const v of el.vertices) include(b, v.x, v.y);
    if (el.circle) {
      const c = el.circle.center;
      const r = el.circle.radius;
      include(b, c.x - r, c.y - r);
      include(b, c.x + r, c.y + r);
    }
    if (el.mount) include(b, el.mount.pivot.x, el.mount.pivot.y);
  }
  return b;
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
    const b = boundsOf(world.getElements());
    // Room for the plunger meter (right) and the pullback travel (below).
    b.maxX += METER_MARGIN_X_M;
    b.maxY += PULLBACK_MARGIN_Y_M;
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
   * Render one frame from interface state.
   * `lights` is read-only light state (the rules' `ReactiveElements`); a lit
   * rollover is drawn solid and bright. Omitted, every sensor draws dashed. `balls` are the drawn (interpolated)
   * positions computed by the caller from the loop's previous/current pair.
   * `plungerCharge` is the controller's normalized charge in [0, 1], the same
   * value the launch impulse is computed from (D-10).
   */
  draw(
    world: PhysicsWorld,
    balls: readonly InterpolatedBall[],
    hud: HudData,
    plungerCharge: number,
    lights?: LightState,
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

    this.drawElements(world.getElements(), lights);
    this.drawFlippers(world.getFlippers());
    this.drawChargeMeter(plungerCharge);
    this.drawBalls(balls);
    this.drawVelocities(balls);
    this.drawContacts(world.getContactPoints());

    // HUD in screen space (dpr scale only, no world translate).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHud(hud);
  }

  /**
   * Draw the resolved table: one path per polyline (closed for loops), stroked
   * in the color of its kind; sensors dashed; circles filled and stroked.
   * Mounts are skipped (drawFlippers draws the live bats). No allocation: the
   * styles and dash arrays are module-level and the geometry is read straight
   * off the resolve.
   */
  private drawElements(elements: readonly ResolvedElement[], lights?: LightState): void {
    const ctx = this.ctx;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const el of elements) {
      if (el.mount) continue;
      const style = KIND_STYLE[el.kind];
      if (el.kind === "rollover" && lights?.isLit(el.id) === true) {
        ctx.strokeStyle = COL_ROLLOVER_LIT;
        ctx.setLineDash(SOLID_DASH);
        ctx.lineWidth = LIT_ROLLOVER_WIDTH;
      } else {
        ctx.strokeStyle = style.stroke;
        ctx.setLineDash(el.sensor ? SENSOR_DASH : SOLID_DASH);
        ctx.lineWidth = 3;
      }
      if (el.circle) {
        const c = el.circle;
        ctx.beginPath();
        ctx.arc(
          c.center.x * PIXELS_PER_METER,
          c.center.y * PIXELS_PER_METER,
          c.radius * PIXELS_PER_METER,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = style.fill;
        ctx.fill();
        ctx.stroke();
        continue;
      }
      const v = el.vertices;
      const first = v[0];
      if (!first) continue;
      ctx.beginPath();
      ctx.moveTo(first.x * PIXELS_PER_METER, first.y * PIXELS_PER_METER);
      for (let i = 1; i < v.length; i++) {
        const p = v[i];
        if (p) ctx.lineTo(p.x * PIXELS_PER_METER, p.y * PIXELS_PER_METER);
      }
      if (el.loop) ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash(SOLID_DASH);
    ctx.lineWidth = 3;
  }

  private drawFlippers(flippers: readonly FlipperState[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = COL_FLIPPER;
    for (const f of flippers) {
      // Draw the D-07 capsule as a STADIUM: a rectangular core capped by a
      // rounded tip (and hinge) of radius tipRadius. The loop iterates every
      // flipper, so the mirrored second bat draws for free; the body `angle`
      // already carries the mirror (≈π), so this needs no per-flipper casing.
      //
      // Drawn from the FlipperState contract so what is drawn is what is hit
      // (03-REVIEW WR-03): `length` is pivot-to-tip EXTREME, so the tip circle
      // is centred at length - tipRadius and the hinge circle at tipRadius; the
      // stadium spans local x ∈ [0, length], exactly the collider's extent.
      const tr = f.tipRadius * PIXELS_PER_METER;
      const len = f.length * PIXELS_PER_METER;
      const tipC = len - tr;
      ctx.save();
      ctx.translate(f.pivotX * PIXELS_PER_METER, f.pivotY * PIXELS_PER_METER);
      ctx.rotate(f.angle);
      // Core: between the hinge and tip circle centres, half-thickness tipRadius.
      ctx.fillRect(tr, -tr, tipC - tr, tr * 2);
      // Rounded tip + rounded hinge (no per-frame allocation — ctx paths only).
      ctx.beginPath();
      ctx.arc(tipC, 0, tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tr, 0, tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Draw the charge meter beside the chute and the plunger pullback under the
   * resting ball. Reads only the scalar charge; module-level colors, no
   * allocation.
   */
  private drawChargeMeter(charge: number): void {
    const ctx = this.ctx;
    const c = Math.min(Math.max(charge, 0), 1);
    const z = PLUNGER_ZONE;
    const ppm = PIXELS_PER_METER;

    // Meter: outlined bar spanning the zone's height, filled bottom to top.
    const x = (z.maxX + METER_GAP_M) * ppm;
    const w = METER_WIDTH_M * ppm;
    const top = z.minY * ppm;
    const h = (z.maxY - z.minY) * ppm;
    if (c > 0) {
      ctx.fillStyle = c >= 1 ? COL_METER_FULL : COL_METER_FILL;
      ctx.fillRect(x, top + h * (1 - c), w, h * c);
    }
    // Quarter ticks, so a level is easy to read before release.
    ctx.strokeStyle = COL_METER_TICK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let q = 1; q < 4; q++) {
      const ty = top + (h * q) / 4;
      ctx.moveTo(x, ty);
      ctx.lineTo(x + w, ty);
    }
    ctx.stroke();
    ctx.strokeStyle = COL_METER_FRAME;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, top, w, h);

    // Pullback: the plunger tip starts at the resting ball's underside and
    // moves down with the charge; a rod runs from it to the bottom margin.
    const tipY = (PLUNGER_REST.y + BALL_RADIUS_M + c * PULLBACK_M) * ppm;
    const tipX0 = (z.minX + PLUNGER_TIP_INSET_M) * ppm;
    const tipX1 = (z.maxX - PLUNGER_TIP_INSET_M) * ppm;
    const thick = PLUNGER_TIP_THICK_M * ppm;
    ctx.fillStyle = COL_PLUNGER;
    ctx.fillRect(tipX0, tipY, tipX1 - tipX0, thick);
    const rodBottom = (z.maxY + PULLBACK_MARGIN_Y_M) * ppm;
    const rodX = PLUNGER_REST.x * ppm;
    ctx.strokeStyle = COL_PLUNGER;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(rodX, tipY + thick);
    ctx.lineTo(rodX, rodBottom);
    ctx.stroke();
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
