/**
 * Procedural table renderer (RND-01/RND-02, research Patterns 1-3).
 *
 * `resize(view)` sizes the visible canvas from the display (the backing follows
 * the CSS fit, Finding 1), bakes the static playfield once into an offscreen
 * layer and rebuilds the cached gradients. `draw(frame)` blits that layer with
 * one `drawImage` at identity, sets the world transform once and draws only what
 * moves, in this order: lit rollovers, element flashes, both bats at their
 * interpolated angles, the plunger and its charge meter, one baked soft shadow
 * per ball (PLSH-03, D-20) and every ball at its interpolated position.
 *
 * Flash pass (RND-03): every flashable element reads its level from the frame's
 * `FlashReader` at `frame.alpha` with its kind's timing. A lit element draws only
 * element-local marks under "lighter" with its level as `globalAlpha`: a baked
 * halo sprite (bumpers, rollover and lane passes), a bright stroke of its own
 * outline (sling rubber, sensor, drain apron, wall, chute) or a glowing rim
 * around a bat. Nothing larger than the element is ever drawn (photosensitive
 * safety). Halos are baked once per resize (`bakeHalo`).
 *
 * Ball shadows (PLSH-03, D-20): one radial sprite baked per resize
 * (`bakeShadow`), stamped source-over at globalAlpha 1 with one `drawImage` per
 * ball at ball center + (SHADOW_OFFSET_X_M, SHADOW_OFFSET_Y_M), a fixed size
 * that never scales with speed.
 *
 * Frame rules (Pitfalls 3-4): no string building, no gradient creation, no
 * closures and no shadowBlur in `draw()`; index loops only; every frame ends with
 * `globalAlpha` 1 and `globalCompositeOperation` "source-over". The canvas paints
 * no text (D-01: the HUD is DOM). No DOM globals: the canvas, its context and the
 * layer factory are injected, and the world is read only through `PhysicsWorld`.
 */

import { BALL_RADIUS_M } from "../physics/constants";
import type { BallState, FlipperState, PhysicsWorld } from "../physics/types";
import { deriveKickFace } from "../game/reactive-elements";
import type { ResolvedElement } from "../table/resolve";
import { PLUNGER_REST, PLUNGER_ZONE, type ElementKind } from "../table/spec";
import { FLASH_EPS, FLASH_TIMING, type FlashTracker } from "./flash";
import {
  BALL_CORE,
  BALL_EDGE,
  BALL_GLINT,
  FLASH_BUMPER,
  FLASH_DRAIN,
  FLASH_FLIPPER,
  FLASH_SENSOR,
  FLASH_SLING,
  FLASH_WALL,
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
import {
  bakeHalo,
  bakeShadow,
  HALO_SCALE,
  SENSOR_HALO_M,
  SHADOW_OFFSET_X_M,
  SHADOW_OFFSET_Y_M,
  SHADOW_RADIUS_M,
} from "./sprites";
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

/** The read side of the flash clock (a `FlashTracker` in production). */
export type FlashReader = Pick<FlashTracker, "level">;

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
  /** Element flash levels, or null to draw no flashes. */
  readonly flash: FlashReader | null;
  /** Render point between the last two fixed steps, in [0, 1] (`loop.alpha`). */
  readonly alpha: number;
}

/** A flashable circle element (bumper): drawn as a halo. */
interface FlashCircle {
  readonly id: number;
  readonly kind: ElementKind;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** A slingshot's rubber face: drawn as a bright stroke. */
interface FlashFace {
  readonly id: number;
  readonly kind: ElementKind;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

/** A rollover or inlane: a halo at its path midpoint plus a bright stroke. */
interface FlashSensor {
  readonly el: ResolvedElement;
  readonly mx: number;
  readonly my: number;
}

/** A drain, wall or chute path: drawn as a bright stroke of its outline. */
interface FlashPath {
  readonly el: ResolvedElement;
  readonly color: string;
  readonly lineWidth: number;
}

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/** Meter quarter-tick alpha (fixed color, intensity through globalAlpha). */
const METER_TICK_ALPHA = 0.45;

/** Plunger rod width (m). */
const PLUNGER_ROD_M = 0.015;

/** Ball glint: offset and radius as fractions of the ball radius. */
const GLINT_OFFSET = 0.35;
const GLINT_RADIUS = 0.22;

/**
 * A flipper flash is a rim this much wider than the bat (m): the bat is drawn
 * opaque on top of the flash pass, so only the rim shows.
 */
const FLIPPER_FLASH_RIM_M = 0.02;

/** Point at half the arc length of an element's polyline (its first vertex if degenerate). */
function pathMidpoint(el: ResolvedElement): { x: number; y: number } {
  const v = el.vertices;
  const first = v[0];
  if (!first) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 1; i < v.length; i++) {
    const a = v[i - 1];
    const b = v[i];
    if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  let left = total / 2;
  for (let i = 1; i < v.length; i++) {
    const a = v[i - 1];
    const b = v[i];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0 && left <= len) {
      const t = left / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= len;
  }
  return { x: first.x, y: first.y };
}

export class TableRenderer {
  private readonly canvas: CanvasTarget;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layers: LayerFactory;
  private readonly elements: readonly ResolvedElement[];
  private readonly rollovers: readonly ResolvedElement[];
  private readonly flippers: readonly FlipperState[];
  private readonly flashCircles: readonly FlashCircle[];
  private readonly flashFaces: readonly FlashFace[];
  private readonly flashSensors: readonly FlashSensor[];
  private readonly flashPaths: readonly FlashPath[];
  private readonly maxBumperRadius: number;

  private view: ViewTransform | null = null;
  private layer: Layer | null = null;
  private bumperHalo: Layer | null = null;
  private sensorHalo: Layer | null = null;
  private ballShadow: Layer | null = null;
  private flashLit = false;
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

    // Flashable elements by kind, precomputed once (geometry never changes).
    const circles: FlashCircle[] = [];
    const faces: FlashFace[] = [];
    const sensors: FlashSensor[] = [];
    const paths: FlashPath[] = [];
    let maxR = 0;
    for (const el of this.elements) {
      if (el.mount) continue;
      switch (el.kind) {
        case "bumper":
          if (el.circle) {
            const c = el.circle;
            circles.push({ id: el.id, kind: el.kind, cx: c.center.x, cy: c.center.y, r: c.radius });
            if (c.radius > maxR) maxR = c.radius;
          }
          break;
        case "slingshot": {
          const f = deriveKickFace(el);
          if (f) faces.push({ id: el.id, kind: el.kind, ax: f.ax, ay: f.ay, bx: f.bx, by: f.by });
          break;
        }
        case "rollover":
        case "lane": {
          const m = pathMidpoint(el);
          sensors.push({ el, mx: m.x, my: m.y });
          break;
        }
        case "drain":
          paths.push({ el, color: FLASH_DRAIN, lineWidth: RUBBER_LINE_M });
          break;
        case "wall":
        case "chute":
          paths.push({ el, color: FLASH_WALL, lineWidth: RUBBER_LINE_M });
          break;
        default:
          break;
      }
    }
    this.flashCircles = circles;
    this.flashFaces = faces;
    this.flashSensors = sensors;
    this.flashPaths = paths;
    this.maxBumperRadius = maxR;
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

    // One halo sprite per halo color, sized to its on-screen device pixels.
    this.bumperHalo =
      this.maxBumperRadius > 0
        ? bakeHalo(this.layers, FLASH_BUMPER, 2 * HALO_SCALE * this.maxBumperRadius * view.scale)
        : null;
    this.sensorHalo =
      this.flashSensors.length > 0
        ? bakeHalo(this.layers, FLASH_SENSOR, 2 * SENSOR_HALO_M * view.scale)
        : null;
    // One ball-shadow sprite at its on-screen device-pixel size.
    this.ballShadow = bakeShadow(this.layers, 2 * SHADOW_RADIUS_M * view.scale);
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
    if (frame.flash) this.drawFlashes(frame.flash, frame.alpha, frame.flipperAngles);
    this.drawFlippers(frame.flipperAngles);
    this.drawPlunger(frame.plungerCharge);
    this.drawBallShadows(frame.balls);
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
   * The flash pass: element-local marks for every element whose level is above
   * FLASH_EPS, under "lighter" with the level as globalAlpha. Composite and
   * alpha are switched only when something is drawn, and reset after the pass.
   */
  private drawFlashes(flash: FlashReader, alpha: number, angles: readonly number[]): void {
    const ctx = this.ctx;
    const view = this.view;
    if (!view) return;
    this.flashLit = false;

    const halo = this.bumperHalo;
    const circles = this.flashCircles;
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      if (!c || !halo) continue;
      if (!this.flashOn(flash.level(c.id, alpha, FLASH_TIMING[c.kind]))) continue;
      const hr = HALO_SCALE * c.r;
      ctx.drawImage(halo.canvas, c.cx - hr, c.cy - hr, 2 * hr, 2 * hr);
    }

    const faces = this.flashFaces;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (!f) continue;
      if (!this.flashOn(flash.level(f.id, alpha, FLASH_TIMING[f.kind]))) continue;
      ctx.beginPath();
      ctx.moveTo(f.ax, f.ay);
      ctx.lineTo(f.bx, f.by);
      ctx.strokeStyle = FLASH_SLING;
      ctx.lineWidth = RUBBER_LINE_M;
      ctx.stroke();
    }

    const sensorHalo = this.sensorHalo;
    const sensors = this.flashSensors;
    for (let i = 0; i < sensors.length; i++) {
      const s = sensors[i];
      if (!s) continue;
      if (!this.flashOn(flash.level(s.el.id, alpha, FLASH_TIMING[s.el.kind]))) continue;
      if (sensorHalo) {
        const hr = SENSOR_HALO_M;
        ctx.drawImage(sensorHalo.canvas, s.mx - hr, s.my - hr, 2 * hr, 2 * hr);
      }
      traceElement(ctx, s.el);
      ctx.strokeStyle = FLASH_SENSOR;
      ctx.lineWidth = RUBBER_LINE_M;
      ctx.stroke();
    }

    const paths = this.flashPaths;
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (!p) continue;
      if (!this.flashOn(flash.level(p.el.id, alpha, FLASH_TIMING[p.el.kind]))) continue;
      traceElement(ctx, p.el);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.lineWidth;
      ctx.stroke();
    }

    // A flipper flash: one stadium contour a rim wider than the bat, at the
    // bat's interpolated angle; the opaque bat drawn next covers its core.
    const flippers = this.flippers;
    for (let i = 0; i < flippers.length; i++) {
      const f = flippers[i];
      if (!f) continue;
      if (!this.flashOn(flash.level(f.id, alpha, FLASH_TIMING.flipper))) continue;
      const a = angles[i];
      const angle = a === undefined ? f.angle : a;
      const tr = f.tipRadius;
      const tipC = f.length - tr;
      const rr = tr + FLIPPER_FLASH_RIM_M;
      ctx.translate(f.pivotX, f.pivotY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(tr, -rr);
      ctx.lineTo(tipC, -rr);
      ctx.arc(tipC, 0, rr, -HALF_PI, HALF_PI);
      ctx.lineTo(tr, rr);
      ctx.arc(tr, 0, rr, HALF_PI, 3 * HALF_PI);
      ctx.closePath();
      ctx.fillStyle = FLASH_FLIPPER;
      ctx.fill();
      ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
    }

    if (this.flashLit) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      this.flashLit = false;
    }
  }

  /**
   * Prepare to draw one flash at `level`: false (draw nothing) at or below
   * FLASH_EPS; else switch to "lighter" once per pass and set globalAlpha.
   */
  private flashOn(level: number): boolean {
    if (!(level > FLASH_EPS)) return false;
    const ctx = this.ctx;
    if (!this.flashLit) {
      ctx.globalCompositeOperation = "lighter";
      this.flashLit = true;
    }
    ctx.globalAlpha = level < 1 ? level : 1;
    return true;
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

  /**
   * One baked soft shadow per ball, source-over at full alpha, offset
   * down-right of its drawn center at a fixed size (D-20). Drawn after the bats
   * and plunger and before the balls.
   */
  private drawBallShadows(balls: readonly BallState[]): void {
    const shadow = this.ballShadow;
    if (!shadow || balls.length === 0) return;
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const d = 2 * SHADOW_RADIUS_M;
    const dx = SHADOW_OFFSET_X_M - SHADOW_RADIUS_M;
    const dy = SHADOW_OFFSET_Y_M - SHADOW_RADIUS_M;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b) continue;
      ctx.drawImage(shadow.canvas, b.x + dx, b.y + dy, d, d);
    }
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
