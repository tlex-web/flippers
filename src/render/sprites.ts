/**
 * Baked sprites (RND-03, PLSH-03, research Pattern 3). A halo is a soft radial
 * glow drawn once per resize into its own small layer; the live frame stamps it
 * with `drawImage` under "lighter" and scales its intensity through
 * `globalAlpha`. The ball shadow is the same kind of layer, stamped source-over
 * under each ball. A reward star glint (06-13) is a 4-point star over a soft
 * core, baked once per glint color and stamped under "lighter". The rgba stop
 * strings are built here at bake time only, never in `draw()` (Pitfall 3); the
 * shadow takes its stops from palette.ts.
 */

import { BALL_RADIUS_M } from "../physics/constants";
import { SHADOW_CORE, SHADOW_FADE, SHADOW_MID } from "./palette";
import type { Layer, LayerFactory } from "./static-layer";

/** A bumper halo spans this many bumper radii from its center. */
export const HALO_SCALE = 2.4;

/** Radius of the halo on a rollover or inlane pass (m). */
export const SENSOR_HALO_M = 0.18;

/** Ball-shadow radius (m): 1.25 ball radii (06-UI-SPEC Depth, D-20). */
export const SHADOW_RADIUS_M = 1.25 * BALL_RADIUS_M;
/** Ball-shadow offset from the ball center (m), down-right to match the top-left glint. */
export const SHADOW_OFFSET_X_M = 0.06;
export const SHADOW_OFFSET_Y_M = 0.09;

/** Ball-shadow stop offset of SHADOW_MID. */
const SHADOW_MID_STOP = 0.5;

/** Halo alpha at the center, at 40 percent of the radius, and at the edge. */
const HALO_CORE_ALPHA = 0.9;
const HALO_MID_ALPHA = 0.35;
const HALO_MID_STOP = 0.4;

/**
 * A reward star glint's full width (m, UI-SPEC): smaller than the 0.4 m sensor
 * it marks (photosensitive footprint, T-6-28).
 */
export const STAR_GLINT_M = 0.24;
/** Star core: alpha at the center and its radius as a fraction of the half-side. */
const STAR_CORE_ALPHA = 0.8;
const STAR_CORE_RADIUS = 0.45;
/** Star arm width at the center, as a fraction of the side. */
const STAR_ARM_WIDTH = 0.12;

/** "#rgb" or "#rrggbb" to its channels; throws on anything else (a palette bug). */
function hexChannels(hex: string): readonly [number, number, number] {
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m6) {
    return [parseInt(m6[1] ?? "0", 16), parseInt(m6[2] ?? "0", 16), parseInt(m6[3] ?? "0", 16)];
  }
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (m3) {
    return [
      parseInt((m3[1] ?? "0").repeat(2), 16),
      parseInt((m3[2] ?? "0").repeat(2), 16),
      parseInt((m3[3] ?? "0").repeat(2), 16),
    ];
  }
  throw new Error(`bakeHalo: expected a #rgb or #rrggbb color, got "${hex}"`);
}

/**
 * Bake one halo: a square layer of side max(2, round(sizePx)) device pixels,
 * filled with a radial gradient from `hexColor` at alpha 0.9 in the center,
 * through 0.35 at 40 percent, to 0 at the edge.
 */
export function bakeHalo(layers: LayerFactory, hexColor: string, sizePx: number): Layer {
  const [r, g, b] = hexChannels(hexColor);
  const n = Math.max(2, Number.isFinite(sizePx) ? Math.round(sizePx) : 2);
  const layer = layers.create(n, n);
  const ctx = layer.ctx;
  const c = n / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${HALO_CORE_ALPHA})`);
  grad.addColorStop(HALO_MID_STOP, `rgba(${r}, ${g}, ${b}, ${HALO_MID_ALPHA})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, n, n);
  return layer;
}

/**
 * Bake one reward star glint (06-13, D-19): a square layer of side
 * max(2, round(sizePx)) device pixels holding a soft radial core (`hexColor`
 * at STAR_CORE_ALPHA in the center to 0 at STAR_CORE_RADIUS of the half-side)
 * under a 4-point star: two thin crossed diamonds reaching the layer's edges,
 * each STAR_ARM_WIDTH of the side across at the center, filled in `hexColor`.
 * The caller passes its color from palette.ts; the stop strings are built here,
 * at bake time only. The live frame stamps it under "lighter" and scales it to
 * at most STAR_GLINT_M across.
 */
export function bakeStar(layers: LayerFactory, hexColor: string, sizePx: number): Layer {
  const [r, g, b] = hexChannels(hexColor);
  const n = Math.max(2, Number.isFinite(sizePx) ? Math.round(sizePx) : 2);
  const layer = layers.create(n, n);
  const ctx = layer.ctx;
  const c = n / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  const core = ctx.createRadialGradient(c, c, 0, c, c, c * STAR_CORE_RADIUS);
  core.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${STAR_CORE_ALPHA})`);
  core.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, n, n);
  const w = (n * STAR_ARM_WIDTH) / 2;
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.beginPath();
  ctx.moveTo(c, 0);
  ctx.lineTo(c + w, c);
  ctx.lineTo(c, n);
  ctx.lineTo(c - w, c);
  ctx.closePath();
  ctx.moveTo(0, c);
  ctx.lineTo(c, c - w);
  ctx.lineTo(n, c);
  ctx.lineTo(c, c + w);
  ctx.closePath();
  ctx.fill();
  return layer;
}

/**
 * Bake the ball shadow (PLSH-03, D-20): a square layer of side
 * max(2, round(sizePx)) device pixels, filled with a radial gradient from
 * SHADOW_CORE in the center through SHADOW_MID at 50 percent to SHADOW_FADE at
 * the edge. The live frame stamps it once per ball, source-over, at a fixed size.
 */
export function bakeShadow(layers: LayerFactory, sizePx: number): Layer {
  const n = Math.max(2, Number.isFinite(sizePx) ? Math.round(sizePx) : 2);
  const layer = layers.create(n, n);
  const ctx = layer.ctx;
  const c = n / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, SHADOW_CORE);
  grad.addColorStop(SHADOW_MID_STOP, SHADOW_MID);
  grad.addColorStop(1, SHADOW_FADE);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, n, n);
  return layer;
}
