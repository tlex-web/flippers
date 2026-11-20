import { describe, it, expect } from "vitest";

import { FIXED_DT } from "../physics/constants";
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
 * ── Raise direction is asserted against TRUE WORLD MOTION (gap 01) ──
 * The 02 verification found a mirror sign-inversion: the FSM's `+1`/"raise" DROOPED
 * the left bat while raising the right. These assertions therefore check the bat's
 * TIP WORLD-Y — pivotY + length·sin(angle), where SMALLER y is physically HIGHER on
 * the screen — and require that pressing EACH side's key lifts THAT side's tip UP
 * and releasing lowers it, for BOTH the left AND the mirrored right flipper. They
 * deliberately do NOT assert "the angle moves toward the constant named
 * FLIPPER_UPPER_ANGLE" (the naming artifact that hid the bug).
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
  /** True WORLD tip height (m): pivotY + length·sin(angle). Smaller = higher up. */
  tipY: (id: number) => number;
  /** Static world-frame rest-limit angle the world reports for a bat. */
  restLimitAngleOf: (id: number) => number;
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

  const stateOf = (id: number) => {
    const f = world.getFlippers().find((x) => x.id === id);
    if (!f) throw new Error(`flipper ${id} vanished`);
    return f;
  };
  const angleOf = (id: number): number => stateOf(id).angle;
  const tipY = (id: number): number => {
    const f = stateOf(id);
    return f.pivotY + f.length * Math.sin(f.angle);
  };
  const restLimitAngleOf = (id: number): number => stateOf(id).restLimitAngle;

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

  return { input, controller, leftId, rightId, angleOf, tipY, restLimitAngleOf, step };
}

/** Drive one side's flipper fully DOWN to its rest limit and let it settle. */
function pressThenRelease(rig: ReturnType<typeof makeRig>, code: string): void {
  rig.input.handleKeyDown(key(code));
  for (let i = 0; i < 8; i++) rig.step(); // raise + reach the up limit
  rig.input.handleKeyUp(key(code));
  for (let i = 0; i < 30; i++) rig.step(); // return + settle at the rest/down limit
}

/** The two controllable sides, each with its classic primary key. */
const SIDES = [
  { name: "left", code: "KeyZ", idOf: (r: ReturnType<typeof makeRig>) => r.leftId },
  { name: "right", code: "Slash", idOf: (r: ReturnType<typeof makeRig>) => r.rightId },
] as const;

describe("flipper end-to-end: keyboard -> FSM -> setFlipperMotor -> Planck (FLIP-01)", () => {
  it("records the left flipper as the smaller-pivot-x flipper (explicit side->id map)", () => {
    const rig = makeRig();
    // The left key must map to the physically-left flipper; the two are distinct.
    expect(rig.leftId).not.toBe(rig.rightId);
  });

  for (const side of SIDES) {
    it(`a ${side.name} keydown RAISES the ${side.name} flipper (tip world-Y goes UP) sub-frame, and keyup returns it DOWN`, () => {
      const rig = makeRig();
      const id = side.idOf(rig);
      const restTip = rig.tipY(id);

      rig.input.handleKeyDown(key(side.code));

      // ONE fixed step (1/120 s = ~8.3 ms, sub-frame vs a 60 fps 16.6 ms frame) must
      // already lift the real tip measurably UP (world −y => a SMALLER tip-Y).
      rig.step();
      const afterOne = rig.tipY(id);
      expect(afterOne).toBeLessThan(restTip - 0.02); // measurable, correct-direction rise

      // The raise continues up to (and pins at) the raised/held-up cradle limit.
      for (let i = 0; i < 8; i++) rig.step();
      const raised = rig.tipY(id);
      expect(raised).toBeLessThan(restTip - 0.15); // clearly, physically UP

      // Release: the tip comes back DOWN (world +y => a LARGER tip-Y) toward rest.
      rig.input.handleKeyUp(key(side.code));
      let maxTip = -Infinity;
      for (let i = 0; i < 30; i++) {
        rig.step();
        maxTip = Math.max(maxTip, rig.tipY(id));
      }
      expect(maxTip).toBeGreaterThan(raised + 0.15); // a real drop of the full sweep
    });
  }

  it("OS auto-repeat never re-triggers a flip end-to-end (no phantom re-snap up)", () => {
    const rig = makeRig();

    // Put the left flipper fully DOWN and at rest first (so a phantom re-flip would
    // be an unmistakable RISE of the tip).
    pressThenRelease(rig, "KeyZ");
    const downTip = rig.tipY(rig.leftId);

    // A repeat==true keydown latches NO press edge (input-level suppression)...
    rig.input.handleKeyDown(key("KeyZ", true));
    expect(rig.input.drainEdges().leftPress).toBe(false);

    // ...and end-to-end: firing repeat keydowns across several fixed steps leaves the
    // flipper DOWN — the tip never rises (would go to a SMALLER tip-Y if it re-flipped).
    for (let i = 0; i < 6; i++) {
      rig.input.handleKeyDown(key("KeyZ", true));
      rig.step();
    }
    expect(rig.tipY(rig.leftId)).toBeGreaterThan(downTip - 0.02); // no rise at all
  });

  it("a one-sided (left) press raises the LEFT tip and leaves the right flipper unmoved", () => {
    const rig = makeRig();
    const leftRest = rig.tipY(rig.leftId);
    const rightRest = rig.tipY(rig.rightId);

    rig.input.handleKeyDown(key("KeyZ")); // LEFT key only
    for (let i = 0; i < 5; i++) rig.step();

    // The left flipper's tip has clearly risen (world up)...
    expect(rig.tipY(rig.leftId)).toBeLessThan(leftRest - 0.15);
    // ...while the right flipper (never keyed) has not moved.
    expect(Math.abs(rig.tipY(rig.rightId) - rightRest)).toBeLessThan(0.02);
  });

  it("a genuine (non-repeat) re-press after release raises the flipper again", () => {
    const rig = makeRig();

    pressThenRelease(rig, "KeyZ");
    const downTip = rig.tipY(rig.leftId);

    rig.input.handleKeyDown(key("KeyZ")); // fresh, real press
    let minTip = Infinity;
    for (let i = 0; i < 12; i++) {
      rig.step();
      minTip = Math.min(minTip, rig.tipY(rig.leftId));
    }
    expect(minTip).toBeLessThan(downTip - 0.15); // raised (tip up) again
  });
});

/* ------------------------------------------------------------------------- *
 * G-04-10: response latency after ANY hold or rest, and no stuck quick tap.
 * ------------------------------------------------------------------------- */

/** A bat has "started moving" once its angle leaves the start by more than this (rad). */
const MOVE_EPS_RAD = 0.01;

/**
 * Step the rig until `id`'s angle has left its current value by more than
 * MOVE_EPS_RAD. Returns the number of fixed steps that took (1 = it moved on
 * the very first step), or -1 if it never moved within `maxSteps`.
 */
function stepsUntilMoved(
  rig: ReturnType<typeof makeRig>,
  id: number,
  maxSteps: number,
): number {
  const start = rig.angleOf(id);
  for (let i = 1; i <= maxSteps; i++) {
    rig.step();
    if (Math.abs(rig.angleOf(id) - start) > MOVE_EPS_RAD) return i;
  }
  return -1;
}

/** One primary and one arrow binding per side (the latency cases). */
const LATENCY_BINDINGS = [
  { code: "KeyZ", side: "left" },
  { code: "Slash", side: "right" },
  { code: "ArrowLeft", side: "left" },
  { code: "ArrowRight", side: "right" },
] as const;

/** All six flipper bindings (src/input/flipper-input.ts), for the quick-tap sweep. */
const ALL_BINDINGS = [
  { code: "KeyZ", side: "left" },
  { code: "ShiftLeft", side: "left" },
  { code: "ArrowLeft", side: "left" },
  { code: "Slash", side: "right" },
  { code: "ShiftRight", side: "right" },
  { code: "ArrowRight", side: "right" },
] as const;

function sideId(rig: ReturnType<typeof makeRig>, side: "left" | "right"): number {
  return side === "left" ? rig.leftId : rig.rightId;
}

describe("flipper response after any hold or rest (G-04-10)", () => {
  for (const b of LATENCY_BINDINGS) {
    for (const hold of [10, 60, 200]) {
      it(`${b.code}: a release after a ${hold}-step hold starts the ${b.side} bat falling within 2 steps`, () => {
        const rig = makeRig();
        const id = sideId(rig, b.side);
        rig.input.handleKeyDown(key(b.code));
        for (let i = 0; i < hold; i++) rig.step();
        rig.input.handleKeyUp(key(b.code));
        const n = stepsUntilMoved(rig, id, 40);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(2);
      });
    }

    for (const rest of [30, 240]) {
      it(`${b.code}: a press after a ${rest}-step rest starts the ${b.side} bat rising within 2 steps`, () => {
        const rig = makeRig();
        const id = sideId(rig, b.side);
        pressThenRelease(rig, b.code);
        for (let i = 0; i < rest; i++) rig.step();
        rig.input.handleKeyDown(key(b.code));
        const n = stepsUntilMoved(rig, id, 40);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(2);
      });
    }
  }

  for (const b of [
    { code: "KeyZ", side: "left" },
    { code: "Slash", side: "right" },
  ] as const) {
    it(`TILT (setEnabled(false)) starts a held-up ${b.side} bat falling within 2 steps`, () => {
      const rig = makeRig();
      const id = sideId(rig, b.side);
      rig.input.handleKeyDown(key(b.code));
      for (let i = 0; i < 60; i++) rig.step();
      rig.controller.setEnabled(false);
      const n = stepsUntilMoved(rig, id, 40);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
    });
  }

  it("no quick tap (3-10 steps, any rest, all six bindings) leaves a bat raised", () => {
    const stuck: string[] = [];
    // Resting invariant, checked after EVERY step of every tap: the FSM may only
    // report "resting" while the bat is within 0.1 rad of its rest limit.
    const restingAway: string[] = [];
    for (const b of ALL_BINDINGS) {
      for (let hold = 3; hold <= 10; hold++) {
        for (const pre of [20, 57, 94, 131]) {
          const rig = makeRig();
          const id = sideId(rig, b.side);
          const restLimit = rig.restLimitAngleOf(id);
          const label = `${b.code} hold=${hold} pre=${pre}`;
          let violated = false;
          const stepChecked = (): void => {
            rig.step();
            if (
              !violated &&
              rig.controller.getPhase(id) === "resting" &&
              Math.abs(rig.angleOf(id) - restLimit) > 0.1
            ) {
              violated = true;
              restingAway.push(label);
            }
          };
          for (let i = 0; i < pre; i++) stepChecked();
          const restTip = rig.tipY(id);
          rig.input.handleKeyDown(key(b.code));
          for (let i = 0; i < hold; i++) stepChecked();
          rig.input.handleKeyUp(key(b.code));
          for (let i = 0; i < 90; i++) stepChecked();
          const resting = rig.controller.getPhase(id) === "resting";
          const atRest = Math.abs(rig.tipY(id) - restTip) < 0.02;
          if (!resting || !atRest) stuck.push(label);
        }
      }
    }
    expect(stuck).toEqual([]);
    expect(restingAway).toEqual([]);
  });
});
