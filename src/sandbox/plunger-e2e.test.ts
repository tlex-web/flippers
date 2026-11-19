import { describe, it, expect } from "vitest";

import { sweptEscaped } from "../harness/containment";
import {
  BALL_RADIUS_M,
  FIXED_DT,
  PLUNGER_CHARGE_RATE,
  PLUNGER_MAX_CHARGE,
} from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallId, BallState, Vec2 } from "../physics/types";
import { FlipperController } from "../control/flipper-controller";
import { PlungerController } from "../control/plunger-controller";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST, PLUNGER_ZONE } from "../table/spec";

/**
 * Headless END-TO-END proof of the plunger launch on the real table (plan 03-05,
 * LNCH-01, D-07/D-09). No mocks: a no-options `PlanckWorld` (TABLE_SPEC), a
 * `FlipperController` holding both bats at motor 0, the `PlungerController`, and
 * the real `FixedStepLoop`. Each fixed step first runs the top-of-step work
 * (edges, then `update()`), then advances exactly one 120 Hz step, the same
 * order `main.ts` uses through `onFixedStep`.
 *
 * The chute's wall x and top y are read from the resolved `chute` element, so
 * the proof follows the spec rather than duplicating its numbers.
 *
 * Containment uses the same `BALL_RADIUS_M - 0.05` swept radius as the table
 * flow proofs: the chute lane leaves 0.05 m of side clearance by design.
 */

/** Steps until a held charge reaches the cap (the clamp lands on this step). */
const STEPS_TO_CAP = Math.ceil(PLUNGER_MAX_CHARGE / (PLUNGER_CHARGE_RATE * FIXED_DT));

/** Settle steps for a freshly fed ball on the plunger. */
const SETTLE_STEPS = 60;

/** Watch window after release (3 simulated seconds). */
const WATCH_STEPS = Math.round(3 / FIXED_DT);

interface Rig {
  readonly world: PlanckWorld;
  readonly plunger: PlungerController;
  readonly ballId: BallId;
  readonly chuteX: number;
  readonly chuteTopY: number;
  ball(): BallState;
  /** Run `top` (if any), then exactly one fixed step; swept containment checked. */
  step(top?: () => void): void;
}

function makeRig(): Rig {
  const world = new PlanckWorld();
  // Constructed before the ball, as main.ts does: both bats brake-held at rest.
  new FlipperController(world);
  const plunger = new PlungerController(world);
  const ballId = world.addBall({ x: PLUNGER_REST.x, y: PLUNGER_REST.y });
  const loop = new FixedStepLoop(world);

  const chute = world.getElements().find((el) => el.kind === "chute");
  if (!chute || chute.vertices.length < 2) throw new Error("table has no chute element");
  const chuteX = chute.vertices[0]?.x ?? NaN;
  const chuteTopY = Math.min(...chute.vertices.map((v) => v.y));

  const boundary = world.getBoundarySegments();
  const ball = (): BallState => {
    const b = world.getBalls().find((x) => x.id === ballId);
    if (!b) throw new Error(`ball ${ballId} vanished`);
    return b;
  };
  let prev: Vec2 = { x: PLUNGER_REST.x, y: PLUNGER_REST.y };
  let stepNo = 0;

  const step = (top?: () => void): void => {
    if (top) top();
    const n = loop.advance(FIXED_DT * 1000);
    if (n !== 1) throw new Error(`expected exactly 1 fixed step, got ${n}`);
    const b = ball();
    const next: Vec2 = { x: b.x, y: b.y };
    if (sweptEscaped(prev, next, BALL_RADIUS_M - 0.05, boundary)) {
      throw new Error(
        `ball escaped at step ${stepNo}: (${prev.x},${prev.y}) -> (${next.x},${next.y})`,
      );
    }
    prev = next;
    stepNo++;
  };

  for (let i = 0; i < SETTLE_STEPS; i++) step();
  return { world, plunger, ballId, chuteX, chuteTopY, ball, step };
}

interface LaunchResult {
  /** Velocity right after the release step. */
  readonly vx: number;
  readonly vy: number;
  /** Resting y before the press minus the highest (smallest) y reached. */
  readonly climb: number;
  /** First watch step whose y is above the chute top, or -1. */
  readonly aboveTopStep: number;
  /** First watch step after `aboveTopStep` whose x is left of the chute wall, or -1. */
  readonly onFieldStep: number;
  /** Ball state at the end of the watch window. */
  readonly final: { readonly x: number; readonly y: number };
}

/** Press, hold for `k` charging steps, release at the top of the next step. */
function launch(rig: Rig, k: number): LaunchResult {
  const restY = rig.ball().y;
  rig.plunger.onPressEdge();
  for (let i = 0; i < k; i++) rig.step(() => rig.plunger.update());
  rig.step(() => {
    rig.plunger.onReleaseEdge(rig.ballId);
    rig.plunger.update();
  });
  const { vx, vy } = rig.ball();

  let minY = rig.ball().y;
  let aboveTopStep = -1;
  let onFieldStep = -1;
  for (let i = 0; i < WATCH_STEPS; i++) {
    rig.step(() => rig.plunger.update());
    const b = rig.ball();
    minY = Math.min(minY, b.y);
    if (aboveTopStep < 0 && b.y < rig.chuteTopY) aboveTopStep = i;
    if (aboveTopStep >= 0 && onFieldStep < 0 && b.x < rig.chuteX) onFieldStep = i;
  }
  const end = rig.ball();
  return { vx, vy, climb: restY - minY, aboveTopStep, onFieldStep, final: { x: end.x, y: end.y } };
}

function inZone(p: { x: number; y: number }): boolean {
  const z = PLUNGER_ZONE;
  return p.x >= z.minX && p.x <= z.maxX && p.y >= z.minY && p.y <= z.maxY;
}

describe("plunger end-to-end: charge -> release -> applyImpulse -> real chute (LNCH-01)", () => {
  it("parks a fed ball at rest inside PLUNGER_ZONE", () => {
    const rig = makeRig();
    const b = rig.ball();
    expect(inZone(b)).toBe(true);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(1e-3);
  });

  it("a full-charge release fires the ball straight up the chute and out onto the playfield", () => {
    const rig = makeRig();
    const r = launch(rig, STEPS_TO_CAP + 10);

    // The release step: straight up the chute axis, no sideways component.
    expect(r.vy).toBeLessThan(0);
    expect(Math.abs(r.vx)).toBeLessThan(1e-6 * Math.abs(r.vy));

    // Within 3 s it clears the chute top, then crosses left of the chute wall.
    expect(r.aboveTopStep).toBeGreaterThanOrEqual(0);
    expect(r.onFieldStep).toBeGreaterThan(r.aboveTopStep);
  });

  it("a half-charge hold climbs strictly less than a full charge", () => {
    const full = launch(makeRig(), STEPS_TO_CAP + 10);
    const half = launch(makeRig(), Math.round(STEPS_TO_CAP / 2));
    expect(Math.abs(half.vy)).toBeLessThan(Math.abs(full.vy));
    expect(half.climb).toBeLessThan(full.climb);
  });

  it("an immediate release still applies the minimum impulse: a short climb that falls back onto the plunger", () => {
    const r = launch(makeRig(), 0);
    expect(r.vy).toBeLessThan(0);
    expect(r.climb).toBeGreaterThan(0.3);
    expect(r.aboveTopStep).toBe(-1);
    expect(inZone(r.final)).toBe(true);
  });
});
