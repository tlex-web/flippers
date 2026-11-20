/**
 * Table spec — the single source of truth for every static collider and every
 * flipper mount (D-01/D-02). The geometric sibling of `src/physics/constants.ts`:
 * plain exported data, per-const documented, and HMR-tunable ("change a number,
 * feel it" — edit a vertex, see the wall move).
 *
 * Engine-agnostic by construction: this module never imports the physics
 * engine. `resolve()` (`./resolve`) turns these descriptors into vertex lists
 * ONCE, and that one output feeds the Planck fixtures, the containment boundary
 * and the debug drawing alike — so what the ball hits is exactly what is drawn
 * (SC#4), structurally rather than by discipline.
 *
 * Frame: meters, origin top-left, y-down, down-slope = +y (the incline is
 * already modeled as reduced in-plane gravity, so no tilt geometry lives here).
 */

import { BALL_RADIUS_M } from "../physics/constants";
import type { Vec2 } from "../physics/types";

/**
 * Semantic element taxonomy (D-12). Defined HERE and nowhere else: every element
 * identity (fixture tags, collision events, renderer styling, later rules and
 * audio) originates from this union.
 */
export type ElementKind =
  "wall" | "chute" | "drain" | "bumper" | "slingshot" | "lane" | "rollover" | "flipper";

/** Every descriptor carries a stable numeric id plus its semantic kind. */
interface ElementBase {
  readonly id: number;
  readonly kind: ElementKind;
}

/**
 * A circular arc inside a polyline path: center, radius, and start/end angles
 * in radians in the y-down frame (point = center + radius·(cos a, sin a), so
 * increasing angle turns clockwise on screen). `resolve()` tessellates it in
 * place into chords no coarser than the ball-radius-tied bounds in
 * `./resolve` (ARC_CHORD_EPS, BALL_RADIUS_M). Sweeps from `a0` to `a1`.
 */
export interface ArcNode {
  readonly center: Vec2;
  readonly radius: number;
  readonly a0: number;
  readonly a1: number;
}

/** One node of a polyline path: a straight vertex or an arc. */
export type PathNode = Vec2 | ArcNode;

/**
 * A polyline collider: vertices and arcs joined in order. `loop` closes the
 * last vertex back to the first; `sensor` makes it a non-solid trigger (drain
 * line, lane, rollover) that reports contact but never deflects the ball.
 */
export interface PolylineSpec extends ElementBase {
  readonly kind: Exclude<ElementKind, "flipper">;
  readonly path: readonly PathNode[];
  readonly loop?: boolean;
  readonly sensor?: boolean;
}

/** A circle collider (bumper, post) or circular sensor (rollover button). */
export interface CircleSpec extends ElementBase {
  readonly kind: Exclude<ElementKind, "flipper">;
  readonly center: Vec2;
  readonly radius: number;
  readonly sensor?: boolean;
}

/**
 * A flipper mount: where a bat's hinge sits and whether it is the mirrored
 * (right-hand, pointing −x) bat. The bat itself is built by the adapter from
 * the unchanged feel constants; the spec only places it (D-05).
 */
export interface MountSpec extends ElementBase {
  readonly kind: "flipper";
  readonly pivot: Vec2;
  readonly mirror: boolean;
  /**
   * Build the bat resting at its droop limit (the limit opposite its raise
   * direction) with a zero construction motor, instead of level with the
   * construction-default motor. Set on the playfield mounts so the real flippers
   * start as a resting inverted-V; left unset on the harness proof box so its
   * calibrated proofs stay byte-identical. Defaults to false.
   */
  readonly restPose?: boolean;
}

/** One table element descriptor. */
export type ElementSpec = PolylineSpec | CircleSpec | MountSpec;

/** A whole table: an ordered descriptor list. Order is fixture-creation order. */
export type TableSpec = readonly ElementSpec[];

/* ------------------------------------------------------------------------- *
 * Harness proof fixture.
 * ------------------------------------------------------------------------- */

/**
 * The Phase-1/2 proof geometry, expressed as plain data: a closed 2 × 3 m box
 * (id 2), one zero-width thin interior wall as the standing tunneling target
 * (id 3), and the level mirrored flipper pair (ids 0/1) the primitive proofs
 * were calibrated against.
 *
 * This is the HARNESS fixture for the Phase-1/2 primitive proofs (soak gates,
 * flipper feel/tunnel, stability), NOT the playfield. Its element order
 * reproduces the original body/fixture/flipper creation order exactly, which
 * is what keeps every seeded, calibrated proof byte-identical. Do not edit.
 */
export const PROOF_BOX_SPEC: TableSpec = [
  {
    id: 2,
    kind: "wall",
    path: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 3 },
      { x: 0, y: 3 },
    ],
    loop: true,
  },
  {
    id: 3,
    kind: "wall",
    path: [
      { x: 0.2, y: 2.0 },
      { x: 0.8, y: 2.0 },
    ],
  },
  { id: 0, kind: "flipper", pivot: { x: 0.35, y: 2.6 }, mirror: false },
  { id: 1, kind: "flipper", pivot: { x: 1.65, y: 2.6 }, mirror: true },
];

/* ------------------------------------------------------------------------- *
 * The playfield — our original table (D-03), sized from the unchanged Phase-2
 * feel constants (D-04): FLIPPER_LENGTH_M / WIDTH_M = 0.5 / 3.4 ≈ 1/6.8.
 *
 * Clearance rules every tuned value must keep:
 *   (1) a gap the ball must pass is ≥ 2·BALL_RADIUS_M + 0.05; a gap it must not
 *       pass is < 2·BALL_RADIUS_M;
 *   (2) each chain is non-self-intersecting (separate chains may touch);
 *   (3) every coordinate lies inside [0, WIDTH_M] × [0, HEIGHT_M];
 *   (4) funnel and trough walls end ≥ 0.12 m from a pivot, so no static fixture
 *       overlaps a bat's hinge.
 * ------------------------------------------------------------------------- */

/** Cabinet width (meters). Playfield x ∈ [0, 2.9]; launch chute x ∈ [2.9, 3.4]. */
export const WIDTH_M = 3.4;

/** Cabinet height (meters). Portrait ≈ 1.9 : 1. */
export const HEIGHT_M = 6.4;

/**
 * Playfield mirror axis (meters). The playfield (not the cabinet) is symmetric
 * about x = 1.45; the chute lane sits to the right of it.
 */
export const PLAYFIELD_CENTER_X = 1.45;

/** Mirror a point across the playfield axis — derive every right-hand twin. */
export function mirrorX(p: Vec2): Vec2 {
  return { x: 2 * PLAYFIELD_CENTER_X - p.x, y: p.y };
}

/**
 * Mirror a whole path across the playfield axis: a vertex maps through
 * `mirrorX`; an arc maps its center through `mirrorX` and each angle a to π − a
 * (the reflection of (cos a, sin a) about the vertical). Path order is kept, so
 * the mirrored chain traverses the reflected points in the same sequence.
 */
export function mirrorPath(path: readonly PathNode[]): PathNode[] {
  return path.map((node) =>
    "center" in node
      ? {
          center: mirrorX(node.center),
          radius: node.radius,
          a0: Math.PI - node.a0,
          a1: Math.PI - node.a1,
        }
      : mirrorX(node),
  );
}

/** Inner wall of the launch chute (x). Lane width 0.5 = ball diameter + 0.1. */
const CHUTE_X = 2.9;

/** Top of the chute's inner wall (y): where a launched ball enters the field. */
const CHUTE_TOP_Y = 1.9;

/**
 * Drain line (y). The drain sensor (id 600) lies on this line between the
 * trough walls and fires on begin-contact, when the ball's rim first overlaps
 * it: about one ball radius (0.2 m) before the ball's center reaches the line.
 */
export const DRAIN_Y = 6.05;

/**
 * Plunger rest position: the ball center resting on the chute floor, centred
 * in the 0.5 m lane.
 */
export const PLUNGER_REST: Vec2 = { x: 3.15, y: 6.2 };

/** Region a ball parked on the plunger stays inside until launched. */
export const PLUNGER_ZONE = {
  minX: CHUTE_X,
  maxX: WIDTH_M,
  minY: 5.6,
  maxY: HEIGHT_M,
} as const;

/**
 * Bumper radius (meters), ball-relative: 1.1 · BALL_RADIUS_M = 0.22 m. A pop
 * bumper reads slightly larger than the ball, and every bumper gap below is
 * sized against this value so the ball always weaves through the cluster.
 */
export const BUMPER_RADIUS_M = 1.1 * BALL_RADIUS_M;

/**
 * Upper-left bumper of the three-bumper cluster. The upper-right one is its
 * mirror. The 1.0 m top-pair spacing leaves a 0.56 m gap between rims.
 */
const BUMPER_UPPER_LEFT: Vec2 = { x: 0.95, y: 2.55 };

/**
 * Lower (center) bumper of the cluster, on the mirror axis. Its rim gap to each
 * upper bumper is ≈ 0.46 m, wider than the 0.40 m ball, so no wedge forms.
 */
const BUMPER_LOWER: Vec2 = { x: PLAYFIELD_CENTER_X, y: 3.3 };

/**
 * Left orbit guide: a vertical wall that separates the left orbit lane
 * (x 0..0.7, 0.7 m wide) from the upper field and doubles as the outer wall of
 * the leftmost rollover lane. Its mirror (x = 2.2) bounds the right orbit lane
 * along the chute wall. A full-power plunge rides the top-right arc, the top
 * edge and the top-left arc, then drops down the left orbit; a weaker plunge
 * falls into a rollover lane. The lower end (y 1.9) sits ≈ 0.48 m from the
 * upper-left bumper rim, so no wedge forms there.
 */
const LEFT_ORBIT_GUIDE: readonly Vec2[] = [
  { x: 0.7, y: 1.9 },
  { x: 0.7, y: 0.75 },
];

/** Top of the rollover-lane guides (y). Leaves a 0.7 m pass above to the arc. */
const LANE_TOP_Y = 0.75;

/** Bottom of the short rollover-lane guides (y). */
const LANE_GUIDE_BOTTOM_Y = 1.15;

/**
 * Left rollover-lane guide (x = 1.2). With its mirror (x = 1.7) and the two
 * orbit guides it splits the top into three 0.5 m lanes: [0.7, 1.2],
 * [1.2, 1.7], [1.7, 2.2].
 */
const LEFT_LANE_GUIDE: readonly Vec2[] = [
  { x: 1.2, y: LANE_TOP_Y },
  { x: 1.2, y: LANE_GUIDE_BOTTOM_Y },
];

/** Rollover sensor line (y), mid-way down the lane guides. */
const ROLLOVER_Y = 0.95;

/**
 * Left slingshot: a closed triangle above the left bat. Its vertical face
 * (x = 0.86) bounds the inlane; its lower face clears the raised bat; the
 * passage from its lower-left corner to the funnel wall is ≈ 0.45 m.
 */
const LEFT_SLING: readonly Vec2[] = [
  { x: 0.86, y: 4.2 },
  { x: 0.86, y: 4.95 },
  { x: 1.16, y: 5.1 },
];

/** Left inlane sensor: across the inlane from the funnel wall to the sling. */
const LEFT_INLANE: readonly Vec2[] = [
  { x: 0.33, y: 4.95 },
  { x: 0.84, y: 4.95 },
];

/**
 * Open mid-field below the orbit guides and lane guides, around the bumper
 * cluster: the region the 03-03 table soak and the seeded flow proof draw ball
 * drop points from (callers reject points too close to a collider).
 */
export const OPEN_FIELD_REGION = {
  minX: 0.45,
  maxX: 2.45,
  minY: 2.0,
  maxY: 4.0,
} as const;

/** Left flipper hinge. The right hinge is its mirror. */
const LEFT_PIVOT: Vec2 = { x: 0.69, y: 5.45 };

/** Left funnel wall: guides a ball off the left side down onto the left bat. */
const LEFT_FUNNEL: readonly Vec2[] = [
  { x: 0.0, y: 4.5 },
  { x: 0.6, y: 5.37 },
];

/** Left trough wall: below the left bat, closing the outlane toward the drain. */
const LEFT_TROUGH: readonly Vec2[] = [
  { x: 0.62, y: 5.62 },
  { x: 1.05, y: HEIGHT_M },
];

/**
 * Our original table (D-03). Outer cabinet with rounded top corners, a
 * right-side launch chute, a center-bottom drain funnel, and two lower flippers
 * in a classic inverted-V whose droop-limit tip gap (~0.46 m) is wider than the
 * 0.40 m ball. Right-hand elements are derived from their left twins with
 * `mirrorX` / `mirrorPath`. Ids: 0/1 flipper mounts, 1xx static walls, 2xx
 * bumpers, 3xx slingshots, 4xx rollover sensors, 5xx lane sensors, 600 drain.
 *
 * Wedge rule (the trap the flow proof hunts): under purely +y gravity a ball
 * rests stably on any two supports closer than 2·BALL_RADIUS_M. Every such pair
 * here is ≥ 0.45 m apart or fully closed; re-check it whenever a position moves.
 */
export const TABLE_SPEC: TableSpec = [
  {
    id: 100,
    kind: "wall",
    path: [
      { x: 0, y: HEIGHT_M },
      // Rounded top-left corner: (0, 1.0) sweeping up to (1.0, 0).
      { center: { x: 1.0, y: 1.0 }, radius: 1.0, a0: Math.PI, a1: 1.5 * Math.PI },
      // Rounded top-right corner: (2.4, 0) sweeping down to (3.4, 1.0).
      { center: { x: 2.4, y: 1.0 }, radius: 1.0, a0: -0.5 * Math.PI, a1: 0 },
      { x: WIDTH_M, y: HEIGHT_M },
    ],
    loop: true,
  },
  {
    id: 110,
    kind: "chute",
    path: [
      { x: CHUTE_X, y: HEIGHT_M },
      { x: CHUTE_X, y: CHUTE_TOP_Y },
    ],
  },
  { id: 120, kind: "wall", path: LEFT_FUNNEL },
  { id: 121, kind: "wall", path: LEFT_FUNNEL.map(mirrorX) },
  { id: 130, kind: "wall", path: LEFT_TROUGH },
  { id: 131, kind: "wall", path: LEFT_TROUGH.map(mirrorX) },
  // Rollover-lane guides and orbit guides.
  { id: 141, kind: "wall", path: LEFT_LANE_GUIDE },
  { id: 142, kind: "wall", path: mirrorPath(LEFT_LANE_GUIDE) },
  { id: 150, kind: "wall", path: LEFT_ORBIT_GUIDE },
  { id: 151, kind: "wall", path: mirrorPath(LEFT_ORBIT_GUIDE) },
  // Upper bumper cluster (D-06: inert solid circles, ordinary wall material,
  // no kick and no score this phase).
  { id: 200, kind: "bumper", center: BUMPER_UPPER_LEFT, radius: BUMPER_RADIUS_M },
  { id: 201, kind: "bumper", center: mirrorX(BUMPER_UPPER_LEFT), radius: BUMPER_RADIUS_M },
  { id: 202, kind: "bumper", center: BUMPER_LOWER, radius: BUMPER_RADIUS_M },
  // Slingshots (D-06: inert solid triangles, no kick this phase).
  { id: 300, kind: "slingshot", path: LEFT_SLING, loop: true },
  { id: 301, kind: "slingshot", path: mirrorPath(LEFT_SLING), loop: true },
  // Top rollover sensors, one per lane.
  {
    id: 400,
    kind: "rollover",
    path: [
      { x: 0.75, y: ROLLOVER_Y },
      { x: 1.15, y: ROLLOVER_Y },
    ],
    sensor: true,
  },
  {
    id: 401,
    kind: "rollover",
    path: [
      { x: 1.25, y: ROLLOVER_Y },
      { x: 1.65, y: ROLLOVER_Y },
    ],
    sensor: true,
  },
  {
    id: 402,
    kind: "rollover",
    path: mirrorPath([
      { x: 0.75, y: ROLLOVER_Y },
      { x: 1.15, y: ROLLOVER_Y },
    ]),
    sensor: true,
  },
  // Inlane sensors.
  { id: 500, kind: "lane", path: LEFT_INLANE, sensor: true },
  { id: 501, kind: "lane", path: mirrorPath(LEFT_INLANE), sensor: true },
  {
    id: 600,
    kind: "drain",
    path: [
      { x: 0.86, y: DRAIN_Y },
      { x: 2.04, y: DRAIN_Y },
    ],
    sensor: true,
  },
  { id: 0, kind: "flipper", pivot: LEFT_PIVOT, mirror: false, restPose: true },
  { id: 1, kind: "flipper", pivot: mirrorX(LEFT_PIVOT), mirror: true, restPose: true },
];
