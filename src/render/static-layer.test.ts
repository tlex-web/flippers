import { describe, it, expect } from "vitest";

import { resolve, type ResolvedElement } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";
import { DROP_SHADOW, LIGHT_POOL, LIGHT_POOL_FADE, VIGNETTE_CLEAR, VIGNETTE_EDGE } from "./palette";
import { bakeStatic, traceElement } from "./static-layer";
import {
  createRecordingContext,
  GradientStub,
  type CallEntry,
  type Recorder,
} from "./test/recording-context";
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

/**
 * PLSH-03 depth bake (plan 06-02 Task 2, D-20/D-24): a lighter light pool right
 * after the background, a down-right drop shadow before every bumper, sling and
 * wall, and the vignette last at identity. All of it is bake time only.
 */

type Transform = readonly [number, number, number, number, number, number];

/** Context state replayed from the log at one call. */
interface Snapshot {
  readonly transform: Transform;
  readonly props: ReadonlyMap<string, unknown>;
  /** Path calls since the last beginPath (excluding it). */
  readonly path: readonly CallEntry[];
}

interface DrawCall {
  readonly index: number;
  readonly call: CallEntry;
  readonly state: Snapshot;
}

const IDENTITY: Transform = [1, 0, 0, 1, 0, 0];
const WORLD: Transform = [view.scale, 0, 0, view.scale, view.offX, view.offY];

function shifted(dxM: number, dyM: number): Transform {
  return [view.scale, 0, 0, view.scale, view.offX + dxM * view.scale, view.offY + dyM * view.scale];
}

const DRAW_NAMES = new Set(["fill", "fillRect", "stroke"]);
const PATH_NAMES = new Set(["moveTo", "lineTo", "arc", "closePath"]);

/** Every fill, fillRect and stroke of the bake with the state it ran under. */
function draws(rec: Recorder): DrawCall[] {
  const out: DrawCall[] = [];
  let transform: Transform = IDENTITY;
  const props = new Map<string, unknown>([
    ["globalAlpha", 1],
    ["globalCompositeOperation", "source-over"],
    ["shadowBlur", 0],
  ]);
  let path: CallEntry[] = [];
  rec.log.forEach((e, index) => {
    if (e.kind === "set") {
      props.set(e.name, e.value);
      return;
    }
    if (e.name === "setTransform") {
      transform = e.args as unknown as Transform;
    } else if (e.name === "beginPath") {
      path = [];
    } else if (PATH_NAMES.has(e.name)) {
      path.push(e);
    } else if (DRAW_NAMES.has(e.name)) {
      out.push({ index, call: e, state: { transform, props: new Map(props), path: [...path] } });
    }
  });
  return out;
}

/** The exact path calls traceElement makes for `el`. */
function expectedPath(el: ResolvedElement): CallEntry[] {
  const r = createRecordingContext();
  traceElement(r.ctx, el);
  return r.log.filter((e): e is CallEntry => e.kind === "call" && e.name !== "beginPath");
}

function samePath(a: readonly CallEntry[], b: readonly CallEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => {
    const d = b[i];
    return d !== undefined && c.name === d.name && c.args.every((v, j) => v === d.args[j]);
  });
}

function drawsOf(rec: Recorder, el: ResolvedElement, name: string): DrawCall[] {
  const want = expectedPath(el);
  return draws(rec).filter((d) => d.call.name === name && samePath(d.state.path, want));
}

function gradientOf(d: DrawCall, prop: string): GradientStub {
  const g = d.state.props.get(prop);
  expect(g).toBeInstanceOf(GradientStub);
  return g as GradientStub;
}

function setsBetween(rec: Recorder, name: string, from: number, to: number): unknown[] {
  return rec.log
    .slice(from + 1, to)
    .filter((e) => e.kind === "set" && e.name === name)
    .map((e) => (e as { value: unknown }).value);
}

const ofKind = (kind: string): ResolvedElement[] =>
  elements.filter((el) => !el.mount && el.kind === kind);

describe("bakeStatic depth (PLSH-03)", () => {
  it("draws a lighter radial light pool as the first fill after the background", () => {
    const { rec } = bake();
    const all = draws(rec);
    const worldAt = all.findIndex((d) => d.state.transform.every((v, i) => v === WORLD[i]));
    expect(worldAt).toBeGreaterThan(0);
    const pool = all[worldAt];
    expect(pool).toBeDefined();
    if (!pool) return;
    expect(pool.call.name).toBe("fillRect");
    expect(pool.state.props.get("globalCompositeOperation")).toBe("lighter");
    const g = gradientOf(pool, "fillStyle");
    expect(g.type).toBe("radial");
    expect(g.params).toEqual([1.45, 4.6, 0, 1.45, 4.6, 2.6]);
    expect(g.stops).toEqual([
      [0, LIGHT_POOL],
      [1, LIGHT_POOL_FADE],
    ]);
    const next = all[worldAt + 1];
    expect(next).toBeDefined();
    expect(next?.state.props.get("globalCompositeOperation")).toBe("source-over");
  });

  it("drops a blurred DROP_SHADOW fill offset (0.04, 0.06) m before every bumper and slingshot", () => {
    const { rec } = bake();
    const solids = [...ofKind("bumper"), ...ofKind("slingshot")];
    expect(ofKind("bumper").length).toBeGreaterThan(0);
    expect(ofKind("slingshot").length).toBeGreaterThan(0);
    const offset = shifted(0.04, 0.06);
    for (const el of solids) {
      const fills = drawsOf(rec, el, "fill");
      expect(fills.length, `element ${el.id}`).toBeGreaterThanOrEqual(2);
      const [shadow, body] = fills;
      if (!shadow || !body) continue;
      expect(shadow.state.props.get("fillStyle"), `element ${el.id}`).toBe(DROP_SHADOW);
      expect(shadow.state.props.get("shadowColor"), `element ${el.id}`).toBe(DROP_SHADOW);
      expect(shadow.state.props.get("shadowBlur"), `element ${el.id}`).toBeCloseTo(
        0.04 * view.scale,
        9,
      );
      expect([...shadow.state.transform], `element ${el.id}`).toEqual([...offset]);
      expect(body.index).toBeGreaterThan(shadow.index);
      expect(body.state.props.get("fillStyle"), `element ${el.id}`).not.toBe(DROP_SHADOW);
      expect([...body.state.transform], `element ${el.id}`).toEqual([...WORLD]);
      expect(
        setsBetween(rec, "shadowBlur", shadow.index, body.index),
        `element ${el.id}`,
      ).toContain(0);
    }
  });

  it("strokes a 0.04 m DROP_SHADOW offset (0.02, 0.03) m under every wall's neon", () => {
    const { rec } = bake();
    const walls = ofKind("wall");
    expect(walls.length).toBeGreaterThan(0);
    const offset = shifted(0.02, 0.03);
    for (const el of walls) {
      const strokes = drawsOf(rec, el, "stroke");
      expect(strokes.length, `element ${el.id}`).toBeGreaterThanOrEqual(3);
      const [shadow, ...neon] = strokes;
      if (!shadow) continue;
      expect(shadow.state.props.get("strokeStyle"), `element ${el.id}`).toBe(DROP_SHADOW);
      expect(shadow.state.props.get("lineWidth"), `element ${el.id}`).toBe(0.04);
      expect([...shadow.state.transform], `element ${el.id}`).toEqual([...offset]);
      for (const n of neon) {
        expect(n.index).toBeGreaterThan(shadow.index);
        expect([...n.state.transform], `element ${el.id}`).toEqual([...WORLD]);
        expect(n.state.props.get("strokeStyle")).not.toBe(DROP_SHADOW);
      }
    }
  });

  it("ends with the vignette over the whole backing at identity", () => {
    const { rec } = bake();
    const fills = draws(rec).filter((d) => d.call.name !== "stroke");
    const last = fills[fills.length - 1];
    expect(last).toBeDefined();
    if (!last) return;
    expect(last.call.name).toBe("fillRect");
    expect(last.call.args).toEqual([0, 0, view.backingW, view.backingH]);
    expect([...last.state.transform]).toEqual([...IDENTITY]);
    expect(last.state.props.get("globalCompositeOperation")).toBe("source-over");
    const g = gradientOf(last, "fillStyle");
    expect(g.type).toBe("radial");
    const [x0, y0, r0, x1, y1, r1] = g.params as number[];
    const cx = view.backingW / 2;
    const cy = view.backingH / 2;
    const half = Math.hypot(view.backingW, view.backingH) / 2;
    expect([x0, y0, x1, y1]).toEqual([cx, cy, cx, cy]);
    const radiusAt = (stop: number): number => (r0 ?? 0) + stop * ((r1 ?? 0) - (r0 ?? 0));
    const clear = g.stops.find(([, c]) => c === VIGNETTE_CLEAR);
    const edge = g.stops.find(([, c]) => c === VIGNETTE_EDGE);
    expect(clear).toBeDefined();
    expect(edge).toBeDefined();
    if (!clear || !edge) return;
    expect(radiusAt(clear[0])).toBeCloseTo(0.5 * half, 6);
    expect(radiusAt(edge[0])).toBeCloseTo(half, 6);
    expect(g.stops[g.stops.length - 1]).toEqual([1, VIGNETTE_EDGE]);
  });

  it("returns with shadowBlur 0, globalAlpha 1 and source-over", () => {
    const { rec } = bake();
    expect(rec.ctx.shadowBlur).toBe(0);
    expect(rec.ctx.globalAlpha).toBe(1);
    expect(rec.ctx.globalCompositeOperation).toBe("source-over");
  });

  it("keeps the drawn-id list in element order, mounts excluded", () => {
    const { ids } = bake();
    expect(ids).toEqual(elements.filter((el) => !el.mount).map((el) => el.id));
  });
});
