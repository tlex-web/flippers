import { describe, expect, it } from "vitest";

import { BALL_RADIUS_M } from "../physics/constants";
import type { Vec2 } from "../physics/types";
import { ARC_CHORD_EPS, MIN_VERTEX_SPACING, resolve } from "./resolve";
import type { TableSpec } from "./spec";

/**
 * Contract proof of the table resolver (03-01 Task 2). Every case uses a small
 * INLINE fixture spec — never the playfield — so the suite proves the resolver
 * contract, not the layout.
 */

const TOL = 1e-9;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function arcPoint(c: Vec2, r: number, a: number): Vec2 {
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
}

/** A slingshot-sized triangle loop: 3 segments, so a valid kickFace is 0, 1 or 2. */
const TRIANGLE: readonly Vec2[] = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

/** Index of the vertex equal (within TOL) to `p`, or -1. */
function indexOfPoint(vs: readonly Vec2[], p: Vec2): number {
  return vs.findIndex((v) => dist(v, p) <= TOL);
}

describe("resolve() — shape", () => {
  it("returns one element per descriptor, ids and order preserved", () => {
    const spec: TableSpec = [
      {
        id: 7,
        kind: "wall",
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
      { id: 3, kind: "bumper", center: { x: 1, y: 1 }, radius: 0.3 },
      { id: 9, kind: "flipper", pivot: { x: 0.5, y: 2 }, mirror: false },
    ];
    const out = resolve(spec);
    expect(out.map((e) => e.id)).toEqual([7, 3, 9]);
    expect(out.map((e) => e.kind)).toEqual(["wall", "bumper", "flipper"]);
  });

  it("a looped polyline of n vertices yields n segments closing on the first vertex", () => {
    const [el] = resolve([
      {
        id: 1,
        kind: "wall",
        path: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
        ],
        loop: true,
      },
    ]);
    expect(el?.segments).toHaveLength(4);
    const last = el?.segments[3];
    expect(last?.b).toBe(el?.vertices[0]);
    expect(el?.loop).toBe(true);
  });

  it("an open polyline of n vertices yields n-1 segments", () => {
    const [el] = resolve([
      {
        id: 1,
        kind: "wall",
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ]);
    expect(el?.segments).toHaveLength(2);
    expect(el?.loop).toBe(false);
  });

  it("a circle yields circle set and no segments; a sensor flag carries through", () => {
    const [solid, sensor] = resolve([
      { id: 1, kind: "bumper", center: { x: 1, y: 2 }, radius: 0.25 },
      {
        id: 2,
        kind: "drain",
        path: [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
        ],
        sensor: true,
      },
    ]);
    expect(solid?.circle).toEqual({ center: { x: 1, y: 2 }, radius: 0.25 });
    expect(solid?.segments).toHaveLength(0);
    expect(solid?.sensor).toBe(false);
    expect(sensor?.sensor).toBe(true);
  });

  it("a mount yields mount set and no segments", () => {
    const [el] = resolve([{ id: 0, kind: "flipper", pivot: { x: 0.7, y: 5.4 }, mirror: true }]);
    expect(el?.mount).toEqual({ pivot: { x: 0.7, y: 5.4 }, mirror: true, restPose: false });
    expect(el?.segments).toHaveLength(0);
    expect(el?.circle).toBeNull();
  });

  it("carries a mount's restPose through", () => {
    const [el] = resolve([
      { id: 0, kind: "flipper", pivot: { x: 0.7, y: 5.4 }, mirror: false, restPose: true },
    ]);
    expect(el?.mount?.restPose).toBe(true);
  });

  it("carries a slingshot's kickFace through; walls, circles and mounts carry null (06.3 D-09)", () => {
    const [sling, wall, bumper, mount] = resolve([
      { id: 1, kind: "slingshot", path: TRIANGLE, loop: true, kickFace: 2 },
      {
        id: 2,
        kind: "wall",
        path: [
          { x: 0, y: 3 },
          { x: 1, y: 3 },
        ],
      },
      { id: 3, kind: "bumper", center: { x: 2, y: 2 }, radius: 0.25 },
      { id: 4, kind: "flipper", pivot: { x: 0.7, y: 5.4 }, mirror: false },
    ]);
    expect(sling?.kickFace).toBe(2);
    expect(wall?.kickFace).toBeNull();
    expect(bumper?.kickFace).toBeNull();
    expect(mount?.kickFace).toBeNull();
  });
});

describe("resolve() — arc tessellation", () => {
  for (const radius of [1.5, 0.15]) {
    it(`tessellates an arc node in place within the chord bounds (r=${radius})`, () => {
      const center = { x: 2, y: 2 };
      const a0 = Math.PI;
      const a1 = 1.5 * Math.PI;
      const [el] = resolve([
        {
          id: 5,
          kind: "wall",
          path: [
            { x: 0, y: 5 },
            { center, radius, a0, a1 },
            { x: 5, y: 0.2 },
          ],
        },
      ]);
      const vs = el?.vertices ?? [];
      const first = indexOfPoint(vs, arcPoint(center, radius, a0));
      const last = indexOfPoint(vs, arcPoint(center, radius, a1));
      expect(first).toBe(1);
      expect(last).toBeGreaterThan(first + 1);
      expect(last).toBe(vs.length - 2);
      for (let i = first; i < last; i++) {
        const p = vs[i] as Vec2;
        const q = vs[i + 1] as Vec2;
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const sagitta = radius - dist(center, mid);
        expect(sagitta).toBeLessThanOrEqual(ARC_CHORD_EPS + TOL);
        expect(dist(p, q)).toBeLessThanOrEqual(BALL_RADIUS_M + TOL);
      }
    });
  }

  it("merges an arc endpoint that coincides with its neighbouring straight vertex", () => {
    const center = { x: 1, y: 1 };
    const [el] = resolve([
      {
        id: 6,
        kind: "wall",
        path: [
          { x: 0, y: 1 },
          { center, radius: 1, a0: Math.PI, a1: 1.5 * Math.PI },
          { x: 1, y: 0 },
          { x: 3, y: 0 },
        ],
      },
    ]);
    const segs = el?.segments ?? [];
    expect(segs.length).toBeGreaterThan(2);
    for (const s of segs) expect(dist(s.a, s.b)).toBeGreaterThan(TOL);
    const vs = el?.vertices ?? [];
    for (let i = 0; i + 1 < vs.length; i++) {
      expect(dist(vs[i] as Vec2, vs[i + 1] as Vec2)).toBeGreaterThanOrEqual(MIN_VERTEX_SPACING);
    }
  });
});

describe("resolve() — rejection (throws naming the element id)", () => {
  const cases: [string, TableSpec][] = [
    [
      "a NaN vertex",
      [
        {
          id: 777,
          kind: "wall",
          path: [
            { x: 0, y: 0 },
            { x: NaN, y: 1 },
          ],
        },
      ],
    ],
    [
      "an Infinity vertex",
      [
        {
          id: 777,
          kind: "wall",
          path: [
            { x: 0, y: 0 },
            { x: 1, y: Infinity },
          ],
        },
      ],
    ],
    ["radius 0", [{ id: 777, kind: "bumper", center: { x: 1, y: 1 }, radius: 0 }]],
    ["a negative radius", [{ id: 777, kind: "bumper", center: { x: 1, y: 1 }, radius: -0.2 }]],
    [
      "a duplicate id",
      [
        {
          id: 777,
          kind: "wall",
          path: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
        { id: 777, kind: "bumper", center: { x: 1, y: 1 }, radius: 0.2 },
      ],
    ],
    [
      "a self-intersecting (bow-tie) loop",
      [
        {
          id: 777,
          kind: "wall",
          path: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
          loop: true,
        },
      ],
    ],
    [
      "consecutive vertices closer than MIN_VERTEX_SPACING",
      [
        {
          id: 777,
          kind: "wall",
          path: [
            { x: 0, y: 0 },
            { x: 0.005, y: 0 },
            { x: 1, y: 0 },
          ],
        },
      ],
    ],
    ["a one-vertex polyline", [{ id: 777, kind: "wall", path: [{ x: 0, y: 0 }] }]],
    ["a slingshot without kickFace", [{ id: 777, kind: "slingshot", path: TRIANGLE, loop: true }]],
    [
      "an out-of-range kickFace (3 on a triangle)",
      [{ id: 777, kind: "slingshot", path: TRIANGLE, loop: true, kickFace: 3 }],
    ],
    [
      "a negative kickFace",
      [{ id: 777, kind: "slingshot", path: TRIANGLE, loop: true, kickFace: -1 }],
    ],
    [
      "a non-integer kickFace (1.5)",
      [{ id: 777, kind: "slingshot", path: TRIANGLE, loop: true, kickFace: 1.5 }],
    ],
    [
      "a kickFace on a wall",
      [
        {
          id: 777,
          kind: "wall",
          path: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
          kickFace: 0,
        },
      ],
    ],
    [
      "a circle slingshot (no kickFace possible)",
      [{ id: 777, kind: "slingshot", center: { x: 1, y: 1 }, radius: 0.2 }],
    ],
  ];
  for (const [name, spec] of cases) {
    it(`throws on ${name}`, () => {
      expect(() => resolve(spec)).toThrow(/777/);
    });
  }
});

describe("resolve() — purity", () => {
  it("is deterministic and never mutates its input", () => {
    const spec: TableSpec = [
      {
        id: 1,
        kind: "wall",
        path: [
          { x: 0, y: 4 },
          { center: { x: 1, y: 1 }, radius: 1, a0: Math.PI, a1: 1.5 * Math.PI },
          { x: 3, y: 0 },
        ],
      },
      { id: 2, kind: "bumper", center: { x: 1.5, y: 2 }, radius: 0.3 },
      { id: 3, kind: "flipper", pivot: { x: 0.5, y: 3.5 }, mirror: false },
    ];
    const before = structuredClone(spec);
    const a = resolve(spec);
    const b = resolve(spec);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(spec).toEqual(before);
  });
});
