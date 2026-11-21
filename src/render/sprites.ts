/**
 * Baked flash sprites (RND-03, research Pattern 3). A halo is a soft radial
 * glow drawn once per resize into its own small layer; the live frame stamps it
 * with `drawImage` under "lighter" and scales its intensity through
 * `globalAlpha`. The rgba stop strings are built here at bake time only, never
 * in `draw()` (Pitfall 3).
 */

import type { Layer, LayerFactory } from "./static-layer";

/** A bumper halo spans this many bumper radii from its center. */
export const HALO_SCALE = 2.4;

/** Radius of the halo on a rollover or inlane pass (m). */
export const SENSOR_HALO_M = 0.18;

/** Halo alpha at the center, at 40 percent of the radius, and at the edge. */
const HALO_CORE_ALPHA = 0.9;
const HALO_MID_ALPHA = 0.35;
const HALO_MID_STOP = 0.4;

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
