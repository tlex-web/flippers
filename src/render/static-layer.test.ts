import { describe, it, expect } from "vitest";

import { resolve, type ResolvedElement } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";
import { bakeStatic } from "./static-layer";
import { createRecordingContext, type CallEntry, type Recorder } from "./test/recording-context";
import { computeView, tableBounds } from "./view-transform";

/**
 * RND-01 static bake (plan 05-02 Task 2): every non-mount element of TABLE_SPEC
 * is drawn, mounts never are (the bats are live), the seeded starfield makes the
 * bake reproducible, and the bake-only shadowBlur is reset before it returns.
 */

const elements = resolve(TABLE_SPEC);
const view = computeView(tableBounds(elements), 1280, 684, 1.5);

function bake(): { rec: Recorder; ids: readonly number[] } {
  const rec = createRecordingContext();
  const ids = bakeStatic(rec.ctx, elements, view);
  return { rec, ids };
}

/** The calls made after the world transform is set (the element pass). */
function worldCalls(rec: Recorder): CallEntry[] {
  const all = rec.log.filter((e): e is CallEntry => e.kind === "call");
  const at = all.findIndex(
    (c) =>
      c.name === "setTransform" &&
      c.args[0] === view.scale &&
      c.args[3] === view.scale &&
      c.args[4] === view.offX &&
      c.args[5] === view.offY,
  );
  expect(at).toBeGreaterThanOrEqual(0);
  return all.slice(at + 1);
}

function isPolyline(el: ResolvedElement): boolean {
  return !el.mount && !el.circle && el.vertices.length > 1;
}

describe("bakeStatic (RND-01)", () => {
  it("returns exactly the set of non-mount element ids", () => {
    const { ids } = bake();
    const expected = elements.filter((el) => !el.mount).map((el) => el.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
    const mountIds = elements.filter((el) => el.mount).map((el) => el.id);
    expect(mountIds.length).toBeGreaterThan(0);
  });

  it("draws at least one arc at every circle element's centre and radius", () => {
    const { rec } = bake();
    const arcs = worldCalls(rec).filter((c) => c.name === "arc");
    const circles = elements.filter((el) => !el.mount && el.circle);
    expect(circles.length).toBeGreaterThan(0);
    for (const el of circles) {
      const c = el.circle;
      if (!c) continue;
      const hits = arcs.filter(
        (a) => a.args[0] === c.center.x && a.args[1] === c.center.y && a.args[2] === c.radius,
      );
      expect(hits.length, `element ${el.id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("draws at least (vertices - 1) lineTo calls along every polyline element", () => {
    const { rec } = bake();
    const lineTos = worldCalls(rec).filter((c) => c.name === "lineTo");
    const polylines = elements.filter(isPolyline);
    expect(polylines.length).toBeGreaterThan(0);
    for (const el of polylines) {
      let matched = 0;
      for (let i = 1; i < el.vertices.length; i++) {
        const v = el.vertices[i];
        if (v && lineTos.some((l) => l.args[0] === v.x && l.args[1] === v.y)) matched++;
      }
      expect(matched, `element ${el.id}`).toBeGreaterThanOrEqual(el.vertices.length - 1);
    }
  });

  it("produces identical call logs for two bakes of the same view (seeded starfield)", () => {
    const a = bake();
    const b = bake();
    expect(a.rec.log.length).toBeGreaterThan(0);
    expect(b.rec.log).toEqual(a.rec.log);
    expect(b.ids).toEqual(a.ids);
  });

  it("leaves shadowBlur at 0 when it returns, after using it for the bumper glow", () => {
    const { rec } = bake();
    const raised = rec.sets("shadowBlur").filter((s) => typeof s.value === "number" && s.value > 0);
    expect(raised.length).toBeGreaterThan(0);
    expect(rec.ctx.shadowBlur).toBe(0);
  });
});
