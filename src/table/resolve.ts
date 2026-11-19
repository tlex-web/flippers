/**
 * Table resolver — turns a `TableSpec` into the ONE resolved element list that
 * every consumer reads (D-01/D-02): the physics adapter builds its fixtures from
 * it, the containment harness reads its solid segments, and the debug renderer
 * strokes its vertices. One resolve, three readers, no second copy — so the
 * collider and the drawn line cannot drift.
 *
 * Pure and engine-agnostic: top-level functions, no class, no engine import.
 * The output is freshly allocated (never aliases the input spec) and is built
 * once at world construction, never on a per-frame path.
 *
 * Validation is fail-loud (threat T-03-01): a malformed descriptor throws an
 * Error naming its element id BEFORE any physics body exists, instead of
 * silently corrupting the solver.
 */

import { BALL_RADIUS_M } from "../physics/constants";
import type { Segment, Vec2 } from "../physics/types";
import type { ArcNode, ElementKind, ElementSpec, PathNode, TableSpec } from "./spec";

/**
 * Max chord deviation (sagitta) of a tessellated arc from the true curve, in
 * meters: 0.1 · BALL_RADIUS_M = 0.02 m. Chord-error tessellation (angular step
 * Δθ = 2·acos(1 − ε/r)) keeps every arc this close to its circle at ANY radius,
 * so the ball never catches on a facet and the polyline stays smooth. Tied to
 * the ball radius so resolution scales with the table scale.
 */
export const ARC_CHORD_EPS = 0.1 * BALL_RADIUS_M;

/**
 * Minimum distance between consecutive resolved vertices (meters). Planck
 * asserts chain vertices are farther apart than its linear slop (0.005 m); 0.01
 * leaves 2× headroom, and anything closer is an authoring mistake (a stray
 * near-duplicate) rather than intended geometry. Exactly-coincident joins
 * (within COINCIDENT_EPS) are merged instead of rejected.
 */
export const MIN_VERTEX_SPACING = 0.01;

/** Two vertices this close are the same point (an arc meeting its neighbour). */
const COINCIDENT_EPS = 1e-9;

/** One resolved element: geometry flattened to vertices + segments, identity kept. */
export interface ResolvedElement {
  readonly id: number;
  readonly kind: ElementKind;
  /** Polyline vertices in path order (empty for circles and mounts). */
  readonly vertices: readonly Vec2[];
  /** Whether the polyline closes back to its first vertex. */
  readonly loop: boolean;
  /**
   * Segments between consecutive vertices (+ the closing one for a loop). Each
   * segment's endpoints ARE the `vertices` objects — shared references.
   */
  readonly segments: readonly Segment[];
  /** Set for circle descriptors, else null. */
  readonly circle: { readonly center: Vec2; readonly radius: number } | null;
  /** True for non-solid triggers (drain line, lanes, rollovers). */
  readonly sensor: boolean;
  /** Set for flipper mounts, else null. */
  readonly mount: { readonly pivot: Vec2; readonly mirror: boolean } | null;
}

function fail(el: ElementSpec, reason: string): never {
  throw new Error(`resolve: element ${el.id} (${el.kind}): ${reason}`);
}

function checkPoint(el: ElementSpec, p: Vec2, what: string): Vec2 {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    fail(el, `${what} has a non-finite coordinate (${p.x}, ${p.y})`);
  }
  return { x: p.x, y: p.y };
}

function isArc(node: PathNode): node is ArcNode {
  return "center" in node;
}

/**
 * Angular step for an arc of radius `r`: the smaller of the chord-error step
 * (sagitta ≤ ARC_CHORD_EPS) and the chord-length step (chord ≤ BALL_RADIUS_M).
 */
function arcStep(r: number): number {
  const sagittaStep = 2 * Math.acos(Math.max(-1, 1 - ARC_CHORD_EPS / r));
  const chordStep = 2 * Math.asin(Math.min(1, BALL_RADIUS_M / (2 * r)));
  return Math.min(sagittaStep, chordStep);
}

/** Append `p`, merging it into the previous vertex when they coincide. */
function pushVertex(vertices: Vec2[], p: Vec2): void {
  const last = vertices[vertices.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) <= COINCIDENT_EPS) return;
  vertices.push(p);
}

/** Tessellate one arc node into `vertices` (n uniform chords, endpoints exact). */
function pushArc(el: ElementSpec, vertices: Vec2[], arc: ArcNode): void {
  const c = checkPoint(el, arc.center, "arc center");
  if (!Number.isFinite(arc.radius) || arc.radius <= 0) {
    fail(el, `arc radius must be a positive finite number, got ${arc.radius}`);
  }
  if (!Number.isFinite(arc.a0) || !Number.isFinite(arc.a1)) {
    fail(el, `arc angles must be finite, got ${arc.a0} .. ${arc.a1}`);
  }
  const r = arc.radius;
  const n = Math.max(1, Math.ceil(Math.abs(arc.a1 - arc.a0) / arcStep(r)));
  for (let i = 0; i <= n; i++) {
    const a = i === n ? arc.a1 : arc.a0 + ((arc.a1 - arc.a0) * i) / n;
    pushVertex(vertices, { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
}

/** Signed twice-area of triangle (a, b, c); >0 = ccw, <0 = cw, 0 = collinear. */
function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Is collinear point `c` within the bounding box of segment a-b? */
function onSegment(a: Vec2, b: Vec2, c: Vec2): boolean {
  return (
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y)
  );
}

/** Do segments s and t intersect (proper crossing or collinear touch)? */
function segmentsIntersect(s: Segment, t: Segment): boolean {
  const d1 = orient(t.a, t.b, s.a);
  const d2 = orient(t.a, t.b, s.b);
  const d3 = orient(s.a, s.b, t.a);
  const d4 = orient(s.a, s.b, t.b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(t.a, t.b, s.a)) return true;
  if (d2 === 0 && onSegment(t.a, t.b, s.b)) return true;
  if (d3 === 0 && onSegment(s.a, s.b, t.a)) return true;
  if (d4 === 0 && onSegment(s.a, s.b, t.b)) return true;
  return false;
}

/**
 * Reject a chain where two NON-adjacent segments intersect (the closing segment
 * counts for loops). Planck chains collide two-sided, so winding is irrelevant;
 * self-intersection is the documented hazard ("will not collide properly").
 */
function checkSelfIntersection(el: ElementSpec, segments: readonly Segment[], loop: boolean): void {
  const n = segments.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (loop && i === 0 && j === n - 1) continue; // adjacent through the close
      const si = segments[i] as Segment;
      const sj = segments[j] as Segment;
      if (segmentsIntersect(si, sj)) {
        fail(el, `self-intersecting chain: segment ${i} crosses segment ${j}`);
      }
    }
  }
}

function resolvePolyline(
  el: ElementSpec & { readonly path: readonly PathNode[] },
  loop: boolean,
): { vertices: Vec2[]; segments: Segment[] } {
  const vertices: Vec2[] = [];
  for (const node of el.path) {
    if (isArc(node)) pushArc(el, vertices, node);
    else pushVertex(vertices, checkPoint(el, node, "vertex"));
  }
  // A loop whose last vertex returns onto its first: the close is implicit.
  const head = vertices[0];
  const tail = vertices[vertices.length - 1];
  if (
    loop &&
    vertices.length > 1 &&
    head &&
    tail &&
    Math.hypot(head.x - tail.x, head.y - tail.y) <= COINCIDENT_EPS
  ) {
    vertices.pop();
  }
  const min = loop ? 3 : 2;
  if (vertices.length < min) {
    fail(
      el,
      `${loop ? "loop" : "polyline"} needs at least ${min} vertices, got ${vertices.length}`,
    );
  }
  const segments: Segment[] = [];
  for (let i = 0; i + 1 < vertices.length; i++) {
    segments.push({ a: vertices[i] as Vec2, b: vertices[i + 1] as Vec2 });
  }
  if (loop) {
    segments.push({ a: vertices[vertices.length - 1] as Vec2, b: vertices[0] as Vec2 });
  }
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i] as Segment;
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (len < MIN_VERTEX_SPACING) {
      fail(
        el,
        `vertices ${i} and ${(i + 1) % vertices.length} are ${len} m apart (< ${MIN_VERTEX_SPACING})`,
      );
    }
  }
  checkSelfIntersection(el, segments, loop);
  return { vertices, segments };
}

/**
 * Resolve a table spec into one `ResolvedElement` per descriptor, in input
 * order, ids preserved. Throws (naming the element id) on any malformed
 * descriptor.
 */
export function resolve(spec: TableSpec): readonly ResolvedElement[] {
  const seen = new Set<number>();
  const out: ResolvedElement[] = [];
  for (const el of spec) {
    if (!Number.isFinite(el.id)) fail(el, "id is not a finite number");
    if (seen.has(el.id)) fail(el, "duplicate id");
    seen.add(el.id);

    if ("path" in el) {
      const loop = el.loop ?? false;
      const { vertices, segments } = resolvePolyline(el, loop);
      out.push({
        id: el.id,
        kind: el.kind,
        vertices,
        loop,
        segments,
        circle: null,
        sensor: el.sensor ?? false,
        mount: null,
      });
    } else if ("center" in el) {
      const center = checkPoint(el, el.center, "center");
      if (!Number.isFinite(el.radius) || el.radius <= 0) {
        fail(el, `radius must be a positive finite number, got ${el.radius}`);
      }
      out.push({
        id: el.id,
        kind: el.kind,
        vertices: [],
        loop: false,
        segments: [],
        circle: { center, radius: el.radius },
        sensor: el.sensor ?? false,
        mount: null,
      });
    } else {
      const pivot = checkPoint(el, el.pivot, "pivot");
      out.push({
        id: el.id,
        kind: el.kind,
        vertices: [],
        loop: false,
        segments: [],
        circle: null,
        sensor: false,
        mount: { pivot, mirror: el.mirror },
      });
    }
  }
  return out;
}
