/**
 * Static playfield bake (RND-01/RND-02, research Pattern 2). Everything that
 * never moves is drawn once per resize into an offscreen layer of the backing
 * size, and the live frame blits it with one `drawImage` at identity.
 *
 * Draw order: at identity, the space background gradient, two nebula clouds and
 * a seeded starfield (identical on every load); then, in world meters after one
 * `setTransform`, every non-mount table element by kind. Flipper mounts are
 * skipped: the bats are drawn live. `shadowBlur` is used only here (bake time)
 * and is reset to 0 before returning. Pure geometry and gradients, no assets.
 */

import { mulberry32 } from "../harness/prng";
import { deriveKickFace } from "../game/reactive-elements";
import type { ResolvedElement } from "../table/resolve";
import {
  BG_BOTTOM,
  BG_TOP,
  BUMPER_BODY,
  BUMPER_CAP,
  BUMPER_RING,
  CHUTE,
  DRAIN,
  LANE,
  NEBULA_TEAL,
  NEBULA_TEAL_FADE,
  NEBULA_VIOLET,
  NEBULA_VIOLET_FADE,
  ROLLOVER_UNLIT,
  RUBBER_LINE_M,
  SENSOR_LINE_M,
  SLING_BODY,
  SLING_RUBBER,
  STAR,
  WALL,
  WALL_GLOW,
  WALL_GLOW_LINE_M,
  WALL_LINE_M,
} from "./palette";
import type { ViewTransform } from "./view-transform";

/** One offscreen drawing surface. */
export interface Layer {
  readonly canvas: CanvasImageSource;
  readonly ctx: CanvasRenderingContext2D;
}

/** Creates offscreen layers (a DOM canvas in production, a recorder in tests). */
export interface LayerFactory {
  create(width: number, height: number): Layer;
}

/** Seed of the starfield PRNG, so the sky is identical on every load. */
export const STARFIELD_SEED = 0x05f1a5;

/** Number of background stars. */
export const STAR_COUNT = 220;

/** Star radius range (device px). */
const STAR_MIN_PX = 0.5;
const STAR_SPAN_PX = 1.1;

/** Star alpha range. */
const STAR_MIN_ALPHA = 0.35;
const STAR_SPAN_ALPHA = 0.65;

/** Alpha of the chute and drain glow pass (the wall glow carries its own alpha). */
const GLOW_PASS_ALPHA = 0.22;

/** Alpha of the dim lane inserts. */
const LANE_ALPHA = 0.55;

/** Bake-time bumper glow radius (meters, converted to device px for shadowBlur). */
const BUMPER_GLOW_M = 0.06;

const TAU = Math.PI * 2;

/**
 * Trace an element's outline as the current path: a full circle for circle
 * elements, else its polyline (closed for loops). Shared with the live frame's
 * lit-rollover pass; allocation-free.
 */
export function traceElement(ctx: CanvasRenderingContext2D, el: ResolvedElement): void {
  ctx.beginPath();
  if (el.circle) {
    const c = el.circle;
    ctx.arc(c.center.x, c.center.y, c.radius, 0, TAU);
    return;
  }
  const v = el.vertices;
  const first = v[0];
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < v.length; i++) {
    const p = v[i];
    if (p) ctx.lineTo(p.x, p.y);
  }
  if (el.loop) ctx.closePath();
}

/** Two-pass neon stroke of the current path: a wide glow, then the thin bright line. */
function neon(
  ctx: CanvasRenderingContext2D,
  glow: string,
  glowAlpha: number,
  line: string,
  lineWidth: number,
): void {
  ctx.globalAlpha = glowAlpha;
  ctx.strokeStyle = glow;
  ctx.lineWidth = WALL_GLOW_LINE_M;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = line;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawBackground(ctx: CanvasRenderingContext2D, view: ViewTransform): void {
  const w = view.backingW;
  const h = view.backingH;
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const big = Math.max(w, h);
  const violet = ctx.createRadialGradient(w * 0.28, h * 0.22, 0, w * 0.28, h * 0.22, big * 0.55);
  violet.addColorStop(0, NEBULA_VIOLET);
  violet.addColorStop(1, NEBULA_VIOLET_FADE);
  ctx.fillStyle = violet;
  ctx.fillRect(0, 0, w, h);

  const teal = ctx.createRadialGradient(w * 0.78, h * 0.7, 0, w * 0.78, h * 0.7, big * 0.45);
  teal.addColorStop(0, NEBULA_TEAL);
  teal.addColorStop(1, NEBULA_TEAL_FADE);
  ctx.fillStyle = teal;
  ctx.fillRect(0, 0, w, h);

  const rng = mulberry32(STARFIELD_SEED);
  ctx.fillStyle = STAR;
  for (let i = 0; i < STAR_COUNT; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = STAR_MIN_PX + rng() * STAR_SPAN_PX;
    ctx.globalAlpha = STAR_MIN_ALPHA + rng() * STAR_SPAN_ALPHA;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBumper(ctx: CanvasRenderingContext2D, el: ResolvedElement, view: ViewTransform): void {
  const c = el.circle;
  if (!c) return;
  const cx = c.center.x;
  const cy = c.center.y;
  const r = c.radius;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, BUMPER_CAP);
  g.addColorStop(1, BUMPER_BODY);
  ctx.shadowColor = BUMPER_CAP;
  ctx.shadowBlur = BUMPER_GLOW_M * view.scale;
  traceElement(ctx, el);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = BUMPER_RING;
  ctx.lineWidth = RUBBER_LINE_M;
  ctx.stroke();
}

function drawSlingshot(ctx: CanvasRenderingContext2D, el: ResolvedElement): void {
  traceElement(ctx, el);
  ctx.fillStyle = SLING_BODY;
  ctx.fill();
  const face = deriveKickFace(el);
  if (!face) return;
  ctx.beginPath();
  ctx.moveTo(face.ax, face.ay);
  ctx.lineTo(face.bx, face.by);
  ctx.strokeStyle = SLING_RUBBER;
  ctx.lineWidth = RUBBER_LINE_M;
  ctx.stroke();
}

/**
 * Bake the static playfield into `ctx` (a layer of the view's backing size) and
 * return the ids of the elements drawn, in draw order. Mounts are never baked.
 */
export function bakeStatic(
  ctx: CanvasRenderingContext2D,
  elements: readonly ResolvedElement[],
  view: ViewTransform,
): readonly number[] {
  const drawn: number[] = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  drawBackground(ctx, view);

  ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const el of elements) {
    if (el.mount) continue;
    switch (el.kind) {
      case "wall":
        traceElement(ctx, el);
        neon(ctx, WALL_GLOW, 1, WALL, WALL_LINE_M);
        break;
      case "chute":
        traceElement(ctx, el);
        neon(ctx, CHUTE, GLOW_PASS_ALPHA, CHUTE, WALL_LINE_M);
        break;
      case "drain":
        traceElement(ctx, el);
        neon(ctx, DRAIN, GLOW_PASS_ALPHA, DRAIN, SENSOR_LINE_M);
        break;
      case "lane":
        traceElement(ctx, el);
        ctx.globalAlpha = LANE_ALPHA;
        ctx.strokeStyle = LANE;
        ctx.lineWidth = SENSOR_LINE_M;
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      case "rollover":
        traceElement(ctx, el);
        ctx.strokeStyle = ROLLOVER_UNLIT;
        ctx.lineWidth = RUBBER_LINE_M;
        ctx.stroke();
        break;
      case "bumper":
        drawBumper(ctx, el, view);
        break;
      case "slingshot":
        drawSlingshot(ctx, el);
        break;
      case "flipper":
        // A flipper element without a mount has nothing static to draw.
        continue;
      default: {
        const unknown: never = el.kind;
        throw new Error(`bakeStatic: unhandled element kind ${String(unknown)}`);
      }
    }
    drawn.push(el.id);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  return drawn;
}
