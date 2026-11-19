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

import type { Segment, Vec2 } from "../physics/types";
import type { ElementKind, ElementSpec, TableSpec } from "./spec";

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

function resolvePolyline(
  el: ElementSpec & { readonly path: readonly Vec2[] },
  loop: boolean,
): { vertices: Vec2[]; segments: Segment[] } {
  const vertices: Vec2[] = [];
  for (const p of el.path) vertices.push(checkPoint(el, p, "vertex"));
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
