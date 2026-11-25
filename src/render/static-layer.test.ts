import { describe, it, expect } from "vitest";

import { resolve, type ResolvedElement } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";
import { buildLampShapes, type LampShape } from "./lamps";
import {
  BG_BOTTOM,
  BG_TOP,
  DROP_SHADOW,
  LAMP_RIM,
  LIGHT_POOL,
  LIGHT_POOL_FADE,
  ROLLOVER_UNLIT,
  RUBBER_LINE_M,
  SLING_BODY,
  SLING_RIM,
  SLING_RIM_LINE_M,
  SLING_RUBBER,
  VIGNETTE_CLEAR,
  VIGNETTE_EDGE,
} from "./palette";
import * as palette from "./palette";
import { bakeStatic, drawUnlitLenses, traceElement } from "./static-layer";
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

/**
 * Whether bakeStatic draws `el`: every non-mount element except the virtual
 * center post (PLSH-07), which rises and falls with the save and is drawn live.
 */
function isBaked(el: ResolvedElement): boolean {
  return !el.mount && el.kind !== "post";
}
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
    const expected = elements.filter(isBaked).map((el) => el.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
    const mountIds = elements.filter((el) => el.mount).map((el) => el.id);
    expect(mountIds.length).toBeGreaterThan(0);
  });

  it("draws at least one arc at every circle element's centre and radius", () => {
    const { rec } = bake();
    const arcs = worldCalls(rec).filter((c) => c.name === "arc");
    const circles = elements.filter((el) => isBaked(el) && el.circle);
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
    expect(ids).toEqual(elements.filter(isBaked).map((el) => el.id));
  });

  it("never bakes the virtual center post (610), not even an arc at its circle", () => {
    const { rec, ids } = bake();
    const post = elements.find((el) => el.kind === "post");
    const c = post?.circle;
    if (!post || !c) throw new Error("post 610 missing");
    expect(ids).not.toContain(post.id);
    const hits = worldCalls(rec).filter(
      (a) =>
        a.name === "arc" &&
        a.args[0] === c.center.x &&
        a.args[1] === c.center.y &&
        a.args[2] === c.radius,
    );
    expect(hits).toHaveLength(0);
  });
});

/**
 * Unlit lens bake (plan 06-03 Task 3, D-21): every lamp in the shape table gets
 * its unlit lens and a faint specular rim, after the element loop and before
 * the vignette, generically over buildLampShapes.
 */

/** Index of the last draw of any element's own path (the end of the element loop). */
function elementLoopEnd(rec: Recorder): number {
  let end = -1;
  for (const el of elements) {
    if (el.mount) continue;
    const want = expectedPath(el);
    for (const d of draws(rec)) {
      if (samePath(d.state.path, want) && d.index > end) end = d.index;
    }
  }
  return end;
}

/** Index of the vignette (the last fillRect at identity). */
function vignetteIndex(rec: Recorder): number {
  const fills = draws(rec).filter(
    (d) => d.call.name === "fillRect" && d.state.transform.every((v, i) => v === IDENTITY[i]),
  );
  return fills[fills.length - 1]?.index ?? -1;
}

/** The closed polygon path of a lens: moveTo, lineTo per vertex, closePath. */
function polygonPath(s: LampShape): CallEntry[] {
  const out: CallEntry[] = [];
  for (let i = 0; i < s.xs.length; i++) {
    out.push({ kind: "call", name: i === 0 ? "moveTo" : "lineTo", args: [s.xs[i], s.ys[i]] });
  }
  out.push({ kind: "call", name: "closePath", args: [] });
  return out;
}

/** The segments of a stroke path as point quads (each moveTo followed by a lineTo). */
function segmentsOf(path: readonly CallEntry[]): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (a?.name === "moveTo" && b?.name === "lineTo") {
      out.push([
        a.args[0] as number,
        a.args[1] as number,
        b.args[0] as number,
        b.args[1] as number,
      ]);
    }
  }
  return out;
}

/** LAMP_RIM strokes 0.008 m wide after draw index `from`. */
function rimsAfter(rec: Recorder, from: number): DrawCall[] {
  return draws(rec).filter(
    (d) =>
      d.index > from &&
      d.call.name === "stroke" &&
      d.state.props.get("strokeStyle") === LAMP_RIM &&
      d.state.props.get("lineWidth") === 0.008,
  );
}

const lampShapes = buildLampShapes(elements);
const fillShapes = lampShapes.filter((s) => s.style === "fill");
const rolloverShapes = lampShapes.filter((s) => s.style === "stroke" && s.elementDrawn);

describe("bakeStatic unlit lenses (D-21)", () => {
  it("fills every fill lens (3 chevrons, 2 arrows) with its UNLIT color after the element loop, before the vignette", () => {
    const { rec } = bake();
    expect(fillShapes.length).toBe(5);
    const end = elementLoopEnd(rec);
    const vig = vignetteIndex(rec);
    expect(end).toBeGreaterThan(0);
    for (const s of fillShapes) {
      const want = polygonPath(s);
      const fills = draws(rec).filter(
        (d) => d.call.name === "fill" && samePath(d.state.path, want),
      );
      expect(fills.length, `lamp ${s.lamp}`).toBe(1);
      const f = fills[0];
      if (!f) continue;
      expect(f.state.props.get("fillStyle"), `lamp ${s.lamp}`).toBe(s.unlit);
      expect(f.state.props.get("globalAlpha")).toBe(1);
      expect([...f.state.transform]).toEqual([...WORLD]);
      expect(f.index).toBeGreaterThan(end);
      expect(f.index).toBeLessThan(vig);
    }
  });

  it("rims every fill lens with one 0.008 m LAMP_RIM stroke along its upper-left outer edge", () => {
    const { rec } = bake();
    const vig = vignetteIndex(rec);
    for (const s of fillShapes) {
      const want = polygonPath(s);
      const fill = draws(rec).find((d) => d.call.name === "fill" && samePath(d.state.path, want));
      expect(fill).toBeDefined();
      if (!fill) continue;
      const rim = rimsAfter(rec, fill.index)[0];
      expect(rim, `lamp ${s.lamp}`).toBeDefined();
      if (!rim) continue;
      expect(rim.index).toBeLessThan(vig);
      expect([...rim.state.transform]).toEqual([...WORLD]);
      // The upper-left outer edge: from the left foot (chevron) or the left head
      // corner (arrow) up to the apex.
      const xs = Array.from(s.xs);
      const apexY = Math.min(...Array.from(s.ys));
      const leftX = Math.min(...xs);
      const leftY = s.ys[xs.indexOf(leftX)] ?? 0;
      const segs = segmentsOf(rim.state.path);
      expect(segs.length, `lamp ${s.lamp}`).toBe(1);
      const seg = segs[0];
      if (!seg) continue;
      const pts = [
        [seg[0], seg[1]],
        [seg[2], seg[3]],
      ].sort((p, q) => (p[0] ?? 0) - (q[0] ?? 0));
      expect(pts[0]?.[0]).toBeCloseTo(leftX, 12);
      expect(pts[0]?.[1]).toBeCloseTo(leftY, 12);
      expect(pts[1]?.[0]).toBeCloseTo(s.cx, 12);
      expect(pts[1]?.[1]).toBeCloseTo(apexY, 12);
    }
  });

  it("rims every rollover with a 0.008 m LAMP_RIM line 0.012 m up-table, and strokes no second unlit lens", () => {
    const { rec } = bake();
    expect(rolloverShapes.length).toBe(3);
    const end = elementLoopEnd(rec);
    for (const s of rolloverShapes) {
      const el = elements.find((e) => e.kind === "rollover" && e.vertices[0]?.x === s.xs[0]);
      expect(el).toBeDefined();
      if (!el) continue;
      const unlit = drawsOf(rec, el, "stroke").filter(
        (d) => d.state.props.get("strokeStyle") === ROLLOVER_UNLIT,
      );
      expect(unlit.length, `rollover ${el.id}`).toBe(1);
      const want: CallEntry[] = [];
      for (let i = 0; i < s.xs.length; i++) {
        want.push({
          kind: "call",
          name: i === 0 ? "moveTo" : "lineTo",
          args: [s.xs[i], (s.ys[i] ?? 0) - 0.012],
        });
      }
      const rims = rimsAfter(rec, end).filter((d) => samePath(d.state.path, want));
      expect(rims.length, `rollover ${el.id}`).toBe(1);
    }
  });

  it("strokes a lens the elements do not draw in its UNLIT color at its lineWidth, then rims its upper-left quarter", () => {
    // A synthetic closed ring lens (the shape class of the 06-10 save ring).
    const n = 16;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = 1 + 0.2 * Math.cos((i / n) * Math.PI * 2);
      ys[i] = 3 + 0.2 * Math.sin((i / n) * Math.PI * 2);
    }
    const ring: LampShape = {
      lamp: 0,
      style: "stroke",
      xs,
      ys,
      closed: true,
      lineWidth: 0.035,
      elementDrawn: false,
      lit: "#c77dff",
      unlit: "#3c264d",
      haloRadius: 0.22,
      cx: 1,
      cy: 3,
      lensRadius: 0.2,
    };
    const rec = createRecordingContext();
    drawUnlitLenses(rec.ctx, [ring]);
    const body = draws(rec).find(
      (d) =>
        d.call.name === "stroke" &&
        d.state.props.get("strokeStyle") === "#3c264d" &&
        samePath(d.state.path, polygonPath(ring)),
    );
    expect(body).toBeDefined();
    if (!body) return;
    expect(body.state.props.get("lineWidth")).toBe(0.035);
    const rim = rimsAfter(rec, body.index)[0];
    expect(rim).toBeDefined();
    if (!rim) return;
    const segs = segmentsOf(rim.state.path);
    expect(segs.length).toBeGreaterThan(0);
    for (const [ax, ay, bx, by] of segs) {
      expect((ax + bx) / 2).toBeLessThan(1);
      expect((ay + by) / 2).toBeLessThan(3);
    }
    expect(rec.ctx.globalAlpha).toBe(1);
    expect(rec.ctx.globalCompositeOperation).toBe("source-over");
  });
});

/** The [ax, ay, bx, by] quads of every segment of `el` other than its kick face, in segment order. */
function passiveQuads(el: ResolvedElement): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  el.segments.forEach((s, i) => {
    if (i !== el.kickFace) out.push([s.a.x, s.a.y, s.b.x, s.b.y]);
  });
  return out;
}

/** Every SLING_RIM stroke of the bake. */
function slingRims(rec: Recorder): DrawCall[] {
  return draws(rec).filter(
    (d) => d.call.name === "stroke" && d.state.props.get("strokeStyle") === SLING_RIM,
  );
}

/** The SLING_RIM stroke whose path is exactly `el`'s passive faces. */
function rimOf(rec: Recorder, el: ResolvedElement): DrawCall | undefined {
  const want = passiveQuads(el);
  return slingRims(rec).find((d) => {
    const got = segmentsOf(d.state.path);
    return got.length === want.length && got.every((q, i) => q.every((v, j) => v === want[i]?.[j]));
  });
}

describe("bakeStatic slingshot rim (06.4; ELEM-02, RND-01)", () => {
  it("strokes exactly one SLING_RIM path per slingshot", () => {
    const slings = ofKind("slingshot");
    expect(slings.length).toBe(2);
    const { rec } = bake();
    expect(slingRims(rec).length).toBe(2);
    for (const el of slings) {
      expect(rimOf(rec, el), `element ${el.id}`).toBeDefined();
    }
  });

  it("draws each rim after its SLING_BODY fill, at SLING_RIM_LINE_M in world space, over every non-kick face only", () => {
    const { rec } = bake();
    for (const el of ofKind("slingshot")) {
      const body = drawsOf(rec, el, "fill").filter(
        (d) => d.state.props.get("fillStyle") === SLING_BODY,
      );
      expect(body.length, `element ${el.id}`).toBe(1);
      const rim = rimOf(rec, el);
      expect(rim, `element ${el.id}`).toBeDefined();
      const fill = body[0];
      if (!rim || !fill) return;
      expect(rim.index, `element ${el.id}`).toBeGreaterThan(fill.index);
      expect(rim.state.props.get("lineWidth"), `element ${el.id}`).toBe(SLING_RIM_LINE_M);
      expect([...rim.state.transform], `element ${el.id}`).toEqual([...WORLD]);
      const quads = segmentsOf(rim.state.path);
      expect(quads, `element ${el.id}`).toEqual(passiveQuads(el));
      expect(quads.length, `element ${el.id}`).toBe(el.segments.length - 1);
      const kick = el.kickFace === null ? undefined : el.segments[el.kickFace];
      expect(kick, `element ${el.id}`).toBeDefined();
      if (!kick) return;
      for (const q of quads) {
        expect(q, `element ${el.id}`).not.toEqual([kick.a.x, kick.a.y, kick.b.x, kick.b.y]);
      }
    }
  });

  it("draws the amber kick-face rubber right after each rim (rim under rubber)", () => {
    const { rec } = bake();
    const all = draws(rec);
    for (const el of ofKind("slingshot")) {
      const rim = rimOf(rec, el);
      expect(rim, `element ${el.id}`).toBeDefined();
      if (!rim) return;
      const next = all[all.findIndex((d) => d.index === rim.index) + 1];
      expect(next, `element ${el.id}`).toBeDefined();
      if (!next) return;
      expect(next.call.name, `element ${el.id}`).toBe("stroke");
      expect(next.state.props.get("strokeStyle"), `element ${el.id}`).toBe(SLING_RUBBER);
      expect(next.state.props.get("lineWidth"), `element ${el.id}`).toBe(RUBBER_LINE_M);
    }
  });
});

/** WCAG 2.x sRGB channel linearization of an 8-bit value. */
function linearChannel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#rrggbb` color. */
function relLuminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  expect(m, hex).not.toBeNull();
  if (!m) return NaN;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => linearChannel(parseInt(h ?? "", 16)));
  return 0.2126 * (r ?? NaN) + 0.7152 * (g ?? NaN) + 0.0722 * (b ?? NaN);
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colors. */
function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("SLING_RIM contrast and meaning (06.4; ELEM-02)", () => {
  it("clears 3:1 against both background gradient stops", () => {
    expect(contrast(SLING_RIM, BG_TOP)).toBeGreaterThanOrEqual(3);
    expect(contrast(SLING_RIM, BG_BOTTOM)).toBeGreaterThanOrEqual(3);
  });

  it("clears 3:1 against the sling's own SLING_BODY fill", () => {
    expect(contrast(SLING_RIM, SLING_BODY)).toBeGreaterThanOrEqual(3);
  });

  it("stays below the amber rubber, so the kick face is the brightest sling edge", () => {
    expect(contrast(SLING_RIM, BG_BOTTOM)).toBeLessThan(contrast(SLING_RUBBER, BG_BOTTOM));
  });

  it("control: today's unstroked SLING_BODY edge is under 3:1, so the helper tells the two apart", () => {
    expect(contrast(SLING_BODY, BG_BOTTOM)).toBeLessThan(3);
  });

  it("is a color no other palette export uses (one meaning per color)", () => {
    const rim = SLING_RIM.toLowerCase();
    const clashes = Object.entries(palette)
      .filter(([k, v]) => k !== "SLING_RIM" && typeof v === "string")
      .filter(([, v]) => (v as string).toLowerCase() === rim)
      .map(([k]) => k);
    expect(clashes).toEqual([]);
  });
});
