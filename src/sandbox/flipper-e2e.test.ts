import { describe, it, expect } from "vitest";

import {
  FIXED_DT,
  FLIPPER_LOWER_ANGLE,
  FLIPPER_UPPER_ANGLE,
} from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { KeyEventLike } from "../input/flipper-input";
import { FlipperInput } from "../input/flipper-input";
import { FlipperController } from "../control/flipper-controller";
import { FixedStepLoop } from "../sim/loop";

/**
 * Headless END-TO-END proof of the whole flipper stack (plan 02-03, D-10/D-11).
 *
 * Unlike the per-module unit tests (which drive the FSM against a SPY world and
 * the input module against synthetic events in isolation), this exercises the
 * REAL path with NO mocks of the intermediate modules:
 *
 *   FlipperInput.handleKeyDown   (a synthetic {code, repeat, preventDefault})
 *     -> drainEdges()            (latched per-side edges)
 *     -> FlipperController.onPressEdge / onReleaseEdge / update()
 *     -> PhysicsWorld.setFlipperMotor(id, +/-1/0)   (the real Planck adapter)
 *     -> FixedStepLoop.advance() -> world.step()    (the real 120 Hz solver)
 *     -> getFlippers()[i].angle                     (the live bat orientation)
 *
 * The drain + FSM-tick happen at the TOP OF EACH FIXED STEP (D-10): every
 * `advance(FIXED_DT*1000)` runs exactly one 120 Hz step, and the drain/feed/tick
 * are done immediately before it — the same ordering the production `onStep` hook
 * gives `main.ts` (plan 02-03 Task 2). So "raise begins within 1-2 fixed steps"
 * here IS the sub-frame (<= ~8.3 ms) guarantee versus a 60 fps (16.6 ms) render.
 *
 * Deterministic: no timers, no Math.random — Planck under a fixed step is
 * reproducible.
 */

/** A synthetic KeyboardEvent-shaped object (no real DOM needed). */
function key(code: string, repeat = false): KeyEventLike {
  return { code, repeat, preventDefault: () => {} };
}

/** The real end-to-end rig, wired exactly as `main.ts` will wire it. */
function makeRig(): {
  input: FlipperInput;
  controller: FlipperController;
  leftId: number;
  rightId: number;
  angleOf: (id: number) => number;
  /** Drain the latch, feed the FSM, tick it, then run ONE fixed 120 Hz step. */
  step: () => void;
} {
  const world = new PlanckWorld();
  const input = new FlipperInput();
  const controller = new FlipperController(world);
  const loop = new FixedStepLoop(world);

  // Side -> flipper-id mapping, established from the world exactly like main.ts:
  // the flipper with the smaller pivot x is the physical LEFT flipper. Recorded
  // explicitly so the mapping under test is unambiguous.
  const byX = world.getFlippers().slice().sort((a, b) => a.pivotX - b.pivotX);
  const left = byX[0];
  const right = byX[1];
  if (!left || !right) throw new Error("expected two flippers on the rig");
  const leftId = left.id;
  const rightId = right.id;

  const angleOf = (id: number): number => {
    const f = world.getFlippers().find((x) => x.id === id);
    if (!f) throw new Error(`flipper ${id} vanished`);
    return f.angle;
  };

  const step = (): void => {
    // Top of the fixed step (D-10): drain the input latch, feed per-side edges to
    // the FSM, tick it, THEN advance exactly one 120 Hz step.
    const edges = input.drainEdges();
    if (edges.leftPress) controller.onPressEdge(leftId);
    if (edges.leftRelease) controller.onReleaseEdge(leftId);
    if (edges.rightPress) controller.onPressEdge(rightId);
    if (edges.rightRelease) controller.onReleaseEdge(rightId);
    controller.update();
    const n = loop.advance(FIXED_DT * 1000);
    if (n !== 1) throw new Error(`expected exactly 1 fixed step, got ${n}`);
  };

  return { input, controller, leftId, rightId, angleOf, step };
}

/** Drive one side's flipper fully DOWN to the lower limit and let it settle. */
function pressThenRelease(rig: ReturnType<typeof makeRig>): void {
  rig.input.handleKeyDown(key("KeyZ"));
  for (let i = 0; i < 8; i++) rig.step(); // raise + reach the upper limit
  rig.input.handleKeyUp(key("KeyZ"));
  for (let i = 0; i < 30; i++) rig.step(); // return + settle at the lower limit
}

describe("flipper end-to-end: keyboard -> FSM -> setFlipperMotor -> Planck (FLIP-01)", () => {
  it("records the left flipper as the smaller-pivot-x flipper (explicit side->id map)", () => {
    const rig = makeRig();
    // The left key must map to the physically-left flipper; the two are distinct.
    expect(rig.leftId).not.toBe(rig.rightId);
  });

  it("a left keydown raises the left flipper toward its upper limit within 1-2 fixed steps (sub-frame)", () => {
    const rig = makeRig();
    const rest = rig.angleOf(rig.leftId);

    rig.input.handleKeyDown(key("KeyZ"));

    // ONE fixed step (1/120 s = ~8.3 ms, sub-frame vs a 60 fps 16.6 ms frame) must
    // already move the real bat measurably toward its upper limit.
    rig.step();
    const afterOne = rig.angleOf(rig.leftId);
    expect(afterOne).toBeGreaterThan(rest + 0.1); // measurable, non-trivial rise
    // Direction is toward the UPPER angle limit (rest sits between the limits).
    expect(FLIPPER_UPPER_ANGLE).toBeGreaterThan(rest);
    expect(afterOne - rest).toBeGreaterThan(0);

    // A second step continues the raise up to (and pinned at) the upper limit.
    rig.step();
    expect(rig.angleOf(rig.leftId)).toBeGreaterThan(afterOne - 0.05); // still up
    expect(rig.angleOf(rig.leftId)).toBeGreaterThan(FLIPPER_UPPER_ANGLE - 0.05);
  });

  it("a left keyup drives the flipper back down toward its lower limit (returning)", () => {
    const rig = makeRig();

    rig.input.handleKeyDown(key("KeyZ"));
    for (let i = 0; i < 8; i++) rig.step(); // raise + hold up
    const up = rig.angleOf(rig.leftId);
    expect(up).toBeGreaterThan(FLIPPER_UPPER_ANGLE - 0.05); // genuinely up first

    rig.input.handleKeyUp(key("KeyZ"));
    let minAngle = Infinity;
    for (let i = 0; i < 30; i++) {
      rig.step();
      minAngle = Math.min(minAngle, rig.angleOf(rig.leftId));
    }
    // The bat came back down to (and settled at) the lower limit — a real drop of
    // the full ~45 deg sweep, driven purely by the keyup edge through the FSM.
    expect(minAngle).toBeLessThan(up - 0.5);
    expect(minAngle).toBeLessThan(FLIPPER_LOWER_ANGLE + 0.05);
  });

  it("OS auto-repeat never re-triggers a flip end-to-end (no phantom re-snap)", () => {
    const rig = makeRig();

    // Put the left flipper fully DOWN and at rest first (so a phantom re-flip
    // would be an unmistakable RISE).
    pressThenRelease(rig);
    const down = rig.angleOf(rig.leftId);
    expect(down).toBeLessThan(FLIPPER_LOWER_ANGLE + 0.05);

    // A repeat==true keydown latches NO press edge (input-level suppression)...
    rig.input.handleKeyDown(key("KeyZ", true));
    expect(rig.input.drainEdges().leftPress).toBe(false);

    // ...and end-to-end: firing repeat keydowns across several fixed steps leaves
    // the flipper DOWN — it never re-snaps up.
    for (let i = 0; i < 6; i++) {
      rig.input.handleKeyDown(key("KeyZ", true));
      rig.step();
    }
    expect(rig.angleOf(rig.leftId)).toBeLessThan(down + 0.02); // no rise at all
  });

  it("a one-sided (left) press leaves the right flipper unaffected", () => {
    const rig = makeRig();
    const rightRest = rig.angleOf(rig.rightId);

    rig.input.handleKeyDown(key("KeyZ")); // LEFT key only
    for (let i = 0; i < 4; i++) rig.step();

    // The left flipper has clearly moved up...
    expect(rig.angleOf(rig.leftId)).toBeGreaterThan(FLIPPER_UPPER_ANGLE - 0.05);
    // ...while the right flipper (never keyed) has not moved.
    expect(Math.abs(rig.angleOf(rig.rightId) - rightRest)).toBeLessThan(0.02);
  });

  it("a genuine (non-repeat) re-press after release raises the flipper again", () => {
    const rig = makeRig();

    pressThenRelease(rig);
    expect(rig.angleOf(rig.leftId)).toBeLessThan(FLIPPER_LOWER_ANGLE + 0.05);

    rig.input.handleKeyDown(key("KeyZ")); // fresh, real press
    let maxAngle = -Infinity;
    for (let i = 0; i < 12; i++) {
      rig.step();
      maxAngle = Math.max(maxAngle, rig.angleOf(rig.leftId));
    }
    expect(maxAngle).toBeGreaterThan(FLIPPER_UPPER_ANGLE - 0.05); // raised again
  });
});
