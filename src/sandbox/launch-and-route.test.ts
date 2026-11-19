import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { PlungerController } from "../control/plunger-controller";
import type { KeyEventLike } from "../input/flipper-input";
import { PlungerInput } from "../input/plunger-input";
import { FIXED_DT, PLUNGER_CHARGE_RATE, PLUNGER_MAX_CHARGE } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallId, CollisionPartnerKind } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST, type ElementKind } from "../table/spec";

/**
 * Headless proof of the wired sandbox composition (plan 03-06 Task 3): the same
 * stack `main.ts` builds, without the canvas. A synthetic Space launch fires the
 * parked ball up the real chute, and its contacts arrive on the bus carrying the
 * launched ball's id and spec element kinds, one dispatch per fixed step.
 */

/** Every spec element kind (the ElementKind union, spelled out). */
const SPEC_KINDS: readonly ElementKind[] = [
  "wall",
  "chute",
  "drain",
  "bumper",
  "slingshot",
  "lane",
  "rollover",
  "flipper",
];

const STEPS_TO_CAP = Math.ceil(PLUNGER_MAX_CHARGE / (PLUNGER_CHARGE_RATE * FIXED_DT));
const SETTLE_STEPS = 60;
const WATCH_STEPS = Math.round(4 / FIXED_DT);

function key(code: string): KeyEventLike {
  return { code, repeat: false, preventDefault: () => {} };
}

interface Seen {
  readonly ballId: BallId;
  readonly elementKind: CollisionPartnerKind;
  readonly elementId: number;
}

describe("sandbox composition: Space launch -> routed collision events", () => {
  it("a full-charge launch climbs out of the chute and its contacts reach the listener with spec identity", () => {
    // Composition root, in main.ts order: controllers before the first ball.
    const world = new PlanckWorld();
    const flippers = new FlipperController(world);
    const plungerInput = new PlungerInput();
    const plunger = new PlungerController(world);
    const ballId = world.addBall({ x: PLUNGER_REST.x, y: PLUNGER_REST.y });
    const loop = new FixedStepLoop(world);

    const router = new CollisionRouter(world);
    const seen: Seen[] = [];
    router.register((e) => {
      seen.push({ ballId: e.ballId, elementKind: e.elementKind, elementId: e.elementId });
    });

    function onFixedStep(): void {
      const edges = plungerInput.drainEdges();
      if (edges.press) plunger.onPressEdge();
      if (edges.release) plunger.onReleaseEdge(ballId);
      if (edges.cancel) plunger.onCancelEdge();
      flippers.update();
      plunger.update();
    }
    let dispatches = 0;
    function onPostStep(): void {
      dispatches++;
      router.dispatch();
    }

    const chute = world.getElements().find((el) => el.kind === "chute");
    if (!chute) throw new Error("table has no chute");
    const chuteTopY = Math.min(...chute.vertices.map((v) => v.y));

    let totalSteps = 0;
    const run = (n: number): void => {
      for (let i = 0; i < n; i++) {
        totalSteps += loop.advance(FIXED_DT * 1000, onFixedStep, onPostStep);
      }
    };

    run(SETTLE_STEPS);
    plungerInput.handleKeyDown(key("Space"));
    run(STEPS_TO_CAP + 10);
    expect(plunger.getCharge()).toBe(1);
    plungerInput.handleKeyUp(key("Space"));

    let minY = Infinity;
    for (let i = 0; i < WATCH_STEPS; i++) {
      run(1);
      const b = world.getBalls().find((x) => x.id === ballId);
      if (b) minY = Math.min(minY, b.y);
    }

    // The ball climbed out of the chute.
    expect(minY).toBeLessThan(chuteTopY);

    // Routed events name the launched ball and a spec element kind.
    const routed = seen.filter(
      (e) => e.ballId === ballId && (SPEC_KINDS as readonly string[]).includes(e.elementKind),
    );
    expect(routed.length).toBeGreaterThan(0);
    // The launch rides the chute and the cabinet's walls.
    expect(routed.some((e) => e.elementKind === "chute" || e.elementKind === "wall")).toBe(true);

    // Exactly one dispatch per fixed step, over the whole run.
    expect(totalSteps).toBe(SETTLE_STEPS + STEPS_TO_CAP + 10 + WATCH_STEPS);
    expect(dispatches).toBe(totalSteps);
  });
});
