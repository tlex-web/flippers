import { describe, it, expect } from "vitest";

import { PIXELS_PER_METER } from "../physics/constants";
import { resolve } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";
import { computeView, tableBounds, VIEW_FILL, VIEW_PAD_CSS, type ViewTransform } from "./view-transform";

/**
 * RND-02 backing-store sizing (research Finding 1, T-05-06): the CSS fit comes
 * first and the backing follows the display.
 */

const bounds = tableBounds(resolve(TABLE_SPEC));

/** The debug renderer's old backing formula: world box at 400 px/m times dpr. */
function oldBackingArea(dpr: number): number {
  const boxWpx = (bounds.maxX - bounds.minX) * PIXELS_PER_METER + VIEW_PAD_CSS * 2;
  const boxHpx = (bounds.maxY - bounds.minY) * PIXELS_PER_METER + VIEW_PAD_CSS * 2;
  return Math.round(boxWpx * dpr) * Math.round(boxHpx * dpr);
}

function sameView(a: ViewTransform, b: ViewTransform): void {
  expect(a.backingW).toBe(b.backingW);
  expect(a.backingH).toBe(b.backingH);
  expect(a.cssW).toBe(b.cssW);
  expect(a.cssH).toBe(b.cssH);
  expect(a.scale).toBe(b.scale);
  expect(a.offX).toBe(b.offX);
  expect(a.offY).toBe(b.offY);
  expect(a.dpr).toBe(1);
}

describe("computeView (RND-02)", () => {
  const v = computeView(bounds, 1280, 684, 1.5);

  it("sizes the backing to css * dpr, never more than one pixel over", () => {
    expect(v.backingW).toBeLessThanOrEqual(v.cssW * 1.5 + 1);
    expect(v.backingH).toBeLessThanOrEqual(v.cssH * 1.5 + 1);
  });

  it("fills under a tenth of the old 400 px/m backing at 1280x684 dpr 1.5", () => {
    expect(v.backingW * v.backingH).toBeLessThan(oldBackingArea(1.5) / 10);
  });

  it("keeps the aspect ratio within one pixel", () => {
    expect(Math.abs(v.backingH - (v.backingW * v.cssH) / v.cssW)).toBeLessThanOrEqual(1);
  });

  it("fits inside 96% of the viewport with one axis binding", () => {
    expect(v.cssW).toBeLessThanOrEqual(VIEW_FILL * 1280 + 1e-9);
    expect(v.cssH).toBeLessThanOrEqual(VIEW_FILL * 684 + 1e-9);
    const bindsW = Math.abs(v.cssW - VIEW_FILL * 1280) < 1e-6;
    const bindsH = Math.abs(v.cssH - VIEW_FILL * 684) < 1e-6;
    expect(bindsW || bindsH).toBe(true);
  });

  it("maps every bounds corner inside the backing store", () => {
    const xs = [bounds.minX, bounds.maxX];
    const ys = [bounds.minY, bounds.maxY];
    for (const x of xs) {
      for (const y of ys) {
        const px = x * v.scale + v.offX;
        const py = y * v.scale + v.offY;
        expect(px).toBeGreaterThanOrEqual(0);
        expect(px).toBeLessThanOrEqual(v.backingW);
        expect(py).toBeGreaterThanOrEqual(0);
        expect(py).toBeLessThanOrEqual(v.backingH);
      }
    }
  });

  it("treats dpr NaN, 0 and -2 exactly like dpr 1", () => {
    const one = computeView(bounds, 1280, 684, 1);
    sameView(computeView(bounds, 1280, 684, Number.NaN), one);
    sameView(computeView(bounds, 1280, 684, 0), one);
    sameView(computeView(bounds, 1280, 684, -2), one);
  });

  it("gives a 0 x 0 viewport a finite scale and a backing of at least 1 x 1", () => {
    const z = computeView(bounds, 0, 0, 1);
    expect(Number.isFinite(z.scale)).toBe(true);
    expect(Number.isFinite(z.offX)).toBe(true);
    expect(Number.isFinite(z.offY)).toBe(true);
    expect(z.backingW).toBeGreaterThanOrEqual(1);
    expect(z.backingH).toBeGreaterThanOrEqual(1);
  });

  it("doubles the backing at dpr 2, within one pixel per axis", () => {
    const one = computeView(bounds, 1280, 684, 1);
    const two = computeView(bounds, 1280, 684, 2);
    expect(Math.abs(two.backingW - one.backingW * 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(two.backingH - one.backingH * 2)).toBeLessThanOrEqual(1);
  });
});
