/**
 * View transform (RND-02, research Finding 1 and Pattern 1). Pure: no window
 * access, the viewport size and the device pixel ratio are arguments.
 *
 * The debug renderer sized its backing store from the world at
 * `PIXELS_PER_METER` (400 px/m) times dpr and then shrank it with CSS, filling
 * about 17x more pixels than the display shows. This module inverts that order:
 * the CSS fit is computed first, then the backing store is
 * `round(cssW * dpr) x round(cssH * dpr)`, and world meters map to device
 * pixels through `scale = fit * PIXELS_PER_METER * dpr`. The backing follows the
 * display, never the other way round.
 *
 * Device px = meters * scale + off (per axis).
 */

import { PIXELS_PER_METER } from "../physics/constants";
import type { ResolvedElement } from "../table/resolve";

/** World-space bounding box (meters). */
export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** CSS and backing sizes plus the meters-to-device-px mapping for one display state. */
export interface ViewTransform {
  /** Displayed canvas size (CSS px). */
  readonly cssW: number;
  readonly cssH: number;
  /** Backing store size (device px): round(css * dpr), at least 1. */
  readonly backingW: number;
  readonly backingH: number;
  /** The sanitized device pixel ratio the backing was sized for. */
  readonly dpr: number;
  /** Device px per meter. */
  readonly scale: number;
  /** Device-px offset of the world origin. */
  readonly offX: number;
  readonly offY: number;
}

/** Share of the viewport the table may fill on its binding axis. */
export const VIEW_FILL = 0.96;

/** Padding (logical CSS px at fit 1) around the world box so strokes are not clipped. */
export const VIEW_PAD_CSS = 24;

/*
 * Plunger charge meter and pullback layout (D-10). The meter is an outlined bar
 * just right of the chute wall spanning PLUNGER_ZONE's height; the pullback is
 * the plunger tip under the resting ball, displaced down by charge * PULLBACK_M.
 * Both sit outside the playfield, so the bounds grow by the margins below.
 */
/** Gap (m) between the cabinet's right wall and the meter. */
export const METER_GAP_M = 0.08;
/** Meter bar width (m). */
export const METER_WIDTH_M = 0.14;
/** Extra world margin (m) right of the cabinet for the meter. */
export const METER_MARGIN_X_M = METER_GAP_M + METER_WIDTH_M + 0.04;
/** Pullback travel (m) at full charge. */
export const PULLBACK_M = 0.15;
/** Plunger-tip bar thickness (m). */
export const PLUNGER_TIP_THICK_M = 0.04;
/** Plunger-tip inset (m) from each chute wall. */
export const PLUNGER_TIP_INSET_M = 0.06;
/** Extra world margin (m) below the cabinet for the pullback travel. */
export const PULLBACK_MARGIN_Y_M = PULLBACK_M + PLUNGER_TIP_THICK_M + 0.06;

function include(b: WorldBounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
}

/**
 * Bounds of every element's vertices, circle extents and mount pivots, widened
 * right by `METER_MARGIN_X_M` and down by `PULLBACK_MARGIN_Y_M` for the plunger
 * meter and pullback. An empty list yields the unit box (plus margins).
 */
export function tableBounds(elements: readonly ResolvedElement[]): WorldBounds {
  const b: WorldBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
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
  if (!(b.maxX >= b.minX) || !(b.maxY >= b.minY)) {
    b.minX = 0;
    b.minY = 0;
    b.maxX = 1;
    b.maxY = 1;
  }
  b.maxX += METER_MARGIN_X_M;
  b.maxY += PULLBACK_MARGIN_Y_M;
  return b;
}

/** A finite value at least 1, else 1. */
function atLeastOne(v: number): number {
  return Number.isFinite(v) && v >= 1 ? v : 1;
}

/** A finite non-negative span, else 0. */
function span(lo: number, hi: number): number {
  const d = hi - lo;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * Fit the world box into the viewport and size the backing store from the
 * display. A non-finite or non-positive dpr becomes 1; a viewport side below 1
 * (or non-finite) becomes 1. The scale is always finite and the backing at
 * least 1 x 1.
 */
export function computeView(
  bounds: WorldBounds,
  viewportW: number,
  viewportH: number,
  dpr: number,
): ViewTransform {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const vw = atLeastOne(viewportW);
  const vh = atLeastOne(viewportH);
  const minX = Number.isFinite(bounds.minX) ? bounds.minX : 0;
  const minY = Number.isFinite(bounds.minY) ? bounds.minY : 0;
  const boxW = span(minX, bounds.maxX) * PIXELS_PER_METER + VIEW_PAD_CSS * 2;
  const boxH = span(minY, bounds.maxY) * PIXELS_PER_METER + VIEW_PAD_CSS * 2;
  const fit = Math.min((vw * VIEW_FILL) / boxW, (vh * VIEW_FILL) / boxH, 1);
  const cssW = boxW * fit;
  const cssH = boxH * fit;
  return {
    cssW,
    cssH,
    backingW: Math.max(1, Math.round(cssW * d)),
    backingH: Math.max(1, Math.round(cssH * d)),
    dpr: d,
    scale: fit * PIXELS_PER_METER * d,
    offX: fit * d * (VIEW_PAD_CSS - minX * PIXELS_PER_METER),
    offY: fit * d * (VIEW_PAD_CSS - minY * PIXELS_PER_METER),
  };
}
