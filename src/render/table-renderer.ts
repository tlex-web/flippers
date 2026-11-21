/**
 * Procedural table renderer (RND-01/RND-02, research Patterns 1-3).
 *
 * `resize(view)` sizes the visible canvas from the display (the backing follows
 * the CSS fit, Finding 1), bakes the static playfield once into an offscreen
 * layer and rebuilds the cached gradients. `draw(frame)` blits that layer with
 * one `drawImage` at identity, sets the world transform once and draws only what
 * moves: lit rollovers, both bats at their interpolated angles, the plunger and
 * its charge meter, and every ball at its interpolated position.
 *
 * Frame rules (Pitfalls 3-4): no string building, no gradient creation, no
 * closures and no shadowBlur in `draw()`; index loops only; every frame ends with
 * `globalAlpha` 1 and `globalCompositeOperation` "source-over". The canvas paints
 * no text (D-01: the HUD is DOM). No DOM globals: the canvas, its context and the
 * layer factory are injected, and the world is read only through `PhysicsWorld`.
 */

import { BALL_RADIUS_M } from "../physics/constants";
import type { BallState, FlipperState, PhysicsWorld } from "../physics/types";
import type { ResolvedElement } from "../table/resolve";
import { PLUNGER_REST, PLUNGER_ZONE } from "../table/spec";
import {
  BALL_CORE,
  BALL_EDGE,
  BALL_GLINT,
  FLIPPER_BODY,
  FLIPPER_EDGE,
  METER_FILL,
  METER_FRAME,
  METER_FULL,
  PLUNGER,
  ROLLOVER_LIT,
  RUBBER_LINE_M,
  SENSOR_LINE_M,
} from "./palette";
import { bakeStatic, traceElement, type Layer, type LayerFactory } from "./static-layer";
import {
  METER_GAP_M,
  METER_WIDTH_M,
  PLUNGER_TIP_INSET_M,
  PLUNGER_TIP_THICK_M,
  PULLBACK_M,
  PULLBACK_MARGIN_Y_M,
  type ViewTransform,
} from "./view-transform";

/** The read-only world surface the renderer needs. */
export type RenderWorld = Pick<PhysicsWorld, "getElements" | "getFlippers">;

/** Read-only light state (the rules' `ReactiveElements`). */
export interface LightState {
  isLit(elementId: number): boolean;
}

/** The visible canvas surface the renderer sizes. */
export interface CanvasTarget {
  width: number;
  height: number;
  readonly style: { width: string; height: string };
}

/** Everything one frame draws beyond the static layer. */
export interface RenderFrame {
  /** Balls at their drawn (interpolated) positions. */
  readonly balls: readonly BallState[];
  /** Interpolated bat angles (rad), in `getFlippers()` order. */
  readonly flipperAngles: readonly number[];
  /** Plunger charge in [0, 1]. */
  readonly plungerCharge: number;
  /** Rollover light state, or null to draw every rollover unlit. */
  readonly lights: LightState | null;
}

const TAU = Math.PI * 2;

/** Meter quarter-tick alpha (fixed color, intensity through globalAlpha). */
const METER_TICK_ALPHA = 0.45;

/** Plunger rod width (m). */
const PLUNGER_ROD_M = 0.015;

/** Ball glint: offset and radius as fractions of the ball radius. */
const GLINT_OFFSET = 0.35;
const GLINT_RADIUS = 0.22;

export class TableRenderer {
  private readonly canvas: CanvasTarget;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layers: LayerFactory;
  private readonly elements: readonly ResolvedElement[];
  private readonly rollovers: readonly ResolvedElement[];
  private readonly flippers: readonly FlipperState[];

  private view: ViewTransform | null = null;
  private layer: Layer | null = null;
  private ballGradient: CanvasGradient | null = null;
  private flipperGradients: CanvasGradient[] = [];
  private bakes = 0;

  constructor(
    canvas: CanvasTarget,
    ctx: CanvasRenderingContext2D,
    layers: LayerFactory,
    world: RenderWorld,
  ) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.layers = layers;
    this.elements = world.getElements();
    this.rollovers = this.elements.filter((el) => el.kind === "rollover" && !el.mount);
    // The pooled flipper snapshots: geometry is constant, and `angle` is the
    // live fallback when a frame's angle array is short.
    this.flippers = world.getFlippers();
  }

  /** Static-layer bakes so far (one per resize). */
  get bakeCount(): number {
    return this.bakes;
  }

  /**
   * Size the canvas for `view`, bake the static layer and rebuild the cached
   * gradients. Setting the canvas size resets its context state (Pitfall 9),
   * so everything cached on it is rebuilt here.
   */
  resize(view: ViewTransform): void {
    this.canvas.width = view.backingW;
    this.canvas.height = view.backingH;
    this.canvas.style.width = `${view.cssW}px`;
    this.canvas.style.height = `${view.cssH}px`;

    const layer = this.layers.create(view.backingW, view.backingH);
    bakeStatic(layer.ctx, this.elements, view);
    this.layer = layer;
    this.view = view;

    const ctx = this.ctx;
    // Ball gradient in ball-local meters at BALL_RADIUS_M (scaled per ball).
    const r = BALL_RADIUS_M;
    const ball = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    ball.addColorStop(0, BALL_CORE);
    ball.addColorStop(1, BALL_EDGE);
    this.ballGradient = ball;

    // One cross-section gradient per bat, in flipper-local meters.
    const grads: CanvasGradient[] = [];
    for (let i = 0; i < this.flippers.length; i++) {
      const f = this.flippers[i];
      const t = f ? f.tipRadius : BALL_RADIUS_M * 0.5;
      const g = ctx.createLinearGradient(0, -t, 0, t);
      g.addColorStop(0, FLIPPER_EDGE);
      g.addColorStop(0.5, FLIPPER_BODY);
      g.addColorStop(1, FLIPPER_EDGE);
      grads.push(g);
    }
    this.flipperGradients = grads;
    this.bakes++;
  }

  /** Draw one frame. A no-op before the first `resize`. */
  draw(frame: RenderFrame): void {
    const view = this.view;
    const layer = this.layer;
    if (!view || !layer) return;
    const ctx = this.ctx;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    this.drawLitRollovers(frame.lights);
    this.drawFlippers(frame.flipperAngles);
    this.drawPlunger(frame.plungerCharge);
    this.drawBalls(frame.balls, view);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawLitRollovers(lights: LightState | null): void {
    if (!lights) return;
    const ctx = this.ctx;
    const rollovers = this.rollovers;
    for (let i = 0; i < rollovers.length; i++) {
      const el = rollovers[i];
      if (!el || !lights.isLit(el.id)) continue;
      traceElement(ctx, el);
      ctx.strokeStyle = ROLLOVER_LIT;
      ctx.lineWidth = RUBBER_LINE_M;
      ctx.stroke();
    }
  }

  /**
   * Each bat as the stadium of its collider (drawn equals hit, 03-REVIEW WR-03):
   * a core between the hinge and tip circle centres, half-thickness tipRadius,
   * spanning local x in [0, length], rotated to its interpolated angle.
   */
  private drawFlippers(angles: readonly number[]): void {
    const ctx = this.ctx;
    const view = this.view;
    if (!view) return;
    const flippers = this.flippers;
    for (let i = 0; i < flippers.length; i++) {
      const f = flippers[i];
      const grad = this.flipperGradients[i];
      if (!f || !grad) continue;
      const a = angles[i];
      const angle = a === undefined ? f.angle : a;
      const tr = f.tipRadius;
      const tipC = f.length - tr;
      ctx.translate(f.pivotX, f.pivotY);
      ctx.rotate(angle);
      ctx.fillStyle = grad;
      ctx.fillRect(tr, -tr, tipC - tr, tr * 2);
      ctx.beginPath();
      ctx.arc(tipC, 0, tr, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tr, 0, tr, 0, TAU);
      ctx.fill();
      ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
    }
  }

  /** The charge meter beside the chute and the plunger tip and rod under the resting ball. */
  private drawPlunger(charge: number): void {
    const ctx = this.ctx;
    const c = Math.min(Math.max(Number.isFinite(charge) ? charge : 0, 0), 1);
    const z = PLUNGER_ZONE;

    const x = z.maxX + METER_GAP_M;
    const w = METER_WIDTH_M;
    const top = z.minY;
    const h = z.maxY - z.minY;
    if (c > 0) {
      ctx.fillStyle = c >= 1 ? METER_FULL : METER_FILL;
      ctx.fillRect(x, top + h * (1 - c), w, h * c);
    }
    ctx.globalAlpha = METER_TICK_ALPHA;
    ctx.strokeStyle = METER_FRAME;
    ctx.lineWidth = SENSOR_LINE_M * 0.5;
    ctx.beginPath();
    for (let q = 1; q < 4; q++) {
      const ty = top + (h * q) / 4;
      ctx.moveTo(x, ty);
      ctx.lineTo(x + w, ty);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = SENSOR_LINE_M;
    ctx.strokeRect(x, top, w, h);

    const tipY = PLUNGER_REST.y + BALL_RADIUS_M + c * PULLBACK_M;
    const tipX0 = z.minX + PLUNGER_TIP_INSET_M;
    const tipX1 = z.maxX - PLUNGER_TIP_INSET_M;
    ctx.fillStyle = PLUNGER;
    ctx.fillRect(tipX0, tipY, tipX1 - tipX0, PLUNGER_TIP_THICK_M);
    ctx.strokeStyle = PLUNGER;
    ctx.lineWidth = PLUNGER_ROD_M;
    ctx.beginPath();
    ctx.moveTo(PLUNGER_REST.x, tipY + PLUNGER_TIP_THICK_M);
    ctx.lineTo(PLUNGER_REST.x, z.maxY + PULLBACK_MARGIN_Y_M);
    ctx.stroke();
  }

  /** Each ball with the cached gradient plus a fixed glint, at its drawn position. */
  private drawBalls(balls: readonly BallState[], view: ViewTransform): void {
    const ctx = this.ctx;
    const grad = this.ballGradient;
    if (!grad) return;
    const r = BALL_RADIUS_M;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b) continue;
      ctx.translate(b.x, b.y);
      const k = b.radius / r;
      if (k !== 1 && Number.isFinite(k) && k > 0) ctx.scale(k, k);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = BALL_GLINT;
      ctx.beginPath();
      ctx.arc(-r * GLINT_OFFSET, -r * GLINT_OFFSET, r * GLINT_RADIUS, 0, TAU);
      ctx.fill();
      ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
    }
  }
}
