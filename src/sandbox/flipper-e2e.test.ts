import { describe, it, expect, vi } from "vitest";

import { FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { KeyEventLike } from "../input/flipper-input";
import { FlipperInput } from "../input/flipper-input";
import { FlipperController } from "../control/flipper-controller";
import { FixedStepLoop } from "../sim/loop";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

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

/**
 * The real end-to-end rig, wired exactly as `main.ts` will wire it.
 * `windowsShiftHeal` picks the FlipperInput path (G-04-17); every pre-existing
 * caller passes nothing and gets the default (off) path.
 */
function makeRig(windowsShiftHeal = false): {
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
  const input = new FlipperInput({ windowsShiftHeal });
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

/**
 * Record each id's angle, then step up to `cap` times. Returns, per id, the
 * first step at which that angle left its start by more than MOVE_EPS_RAD, or
 * -1 if it never moved within `cap`.
 */
function stepsUntilEachMoved(
  rig: ReturnType<typeof makeRig>,
  ids: readonly number[],
  cap: number,
): number[] {
  const start = ids.map((id) => rig.angleOf(id));
  const moved = ids.map(() => -1);
  for (let i = 1; i <= cap; i++) {
    rig.step();
    ids.forEach((id, k) => {
      if (moved[k] === -1 && Math.abs(rig.angleOf(id) - (start[k] ?? 0)) > MOVE_EPS_RAD) {
        moved[k] = i;
      }
    });
    if (moved.every((m) => m !== -1)) break;
  }
  return moved;
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

/* ------------------------------------------------------------------------- *
 * G-04-11: a keyup lost to an OS dialog must never strand a bat raised.
 * ------------------------------------------------------------------------- */

/** Step until `id` reports `phase`; returns the step count, or -1 past `cap`. */
function stepsUntilPhase(
  rig: ReturnType<typeof makeRig>,
  id: number,
  phase: string,
  cap: number,
): number {
  for (let i = 1; i <= cap; i++) {
    rig.step();
    if (rig.controller.getPhase(id) === phase) return i;
  }
  return -1;
}

describe("a lost keyup never strands a bat (G-04-11)", () => {
  // The Shift codes are the reported ones (the Windows Sticky Keys prompt); the
  // late-keydown race (a keydown handled after the dialog's blur, whose keyup
  // then goes to the dialog) can hit any binding.
  for (const b of [
    { code: "ShiftLeft", side: "left" },
    { code: "ShiftRight", side: "right" },
    { code: "KeyZ", side: "left" },
    { code: "Slash", side: "right" },
  ] as const) {
    it(`${b.code}: a keydown whose keyup never arrives is released by a window focus regain`, () => {
      const rig = makeRig();
      const id = sideId(rig, b.side);
      for (let i = 0; i < 20; i++) rig.step();
      const restTip = rig.tipY(id);

      // The keydown reaches the page; its keyup is taken by the OS dialog.
      rig.input.handleKeyDown(key(b.code));
      for (let i = 0; i < 20; i++) rig.step();
      expect(rig.controller.getPhase(id)).toBe("held-up");
      // The stale state the diagnosis reproduced (S2): the bat stays up.
      for (let i = 0; i < 120; i++) rig.step();
      expect(rig.controller.getPhase(id)).toBe("held-up");

      // The window regains focus: the stale key is cleared and the bat falls.
      rig.input.handleFocus();
      const fall = stepsUntilMoved(rig, id, 40);
      expect(fall).toBeGreaterThanOrEqual(1);
      expect(fall).toBeLessThanOrEqual(2);
      for (let i = 0; i < 90; i++) rig.step();
      expect(rig.controller.getPhase(id)).toBe("resting");
      expect(Math.abs(rig.tipY(id) - restTip)).toBeLessThan(0.02);
      expect(rig.input.isHeld(b.side)).toBe(false);

      // A fresh press of the same key is no longer de-duped: the bat rises again.
      rig.input.handleKeyDown(key(b.code));
      const rise = stepsUntilMoved(rig, id, 40);
      expect(rise).toBeGreaterThanOrEqual(1);
      expect(rise).toBeLessThanOrEqual(2);
      expect(stepsUntilPhase(rig, id, "held-up", 30)).toBeGreaterThan(0);
      rig.input.handleKeyUp(key(b.code));
      expect(stepsUntilPhase(rig, id, "resting", 90)).toBeGreaterThan(0);
    });
  }

  /** A synthetic key event carrying an explicit Shift modifier state. */
  const skey = (code: string, shiftKey: boolean): KeyEventLike => ({
    code,
    shiftKey,
    repeat: false,
    preventDefault: () => {},
  });

  for (const c of [
    { shift: "ShiftLeft", side: "left", other: ["KeyZ", "ArrowLeft"] },
    { shift: "ShiftRight", side: "right", other: ["Slash", "ArrowRight"] },
  ] as const) {
    for (const code of c.other) {
      it(`${code} releases a ${c.side} bat pinned by a stale ${c.shift}, with no drop while it is down`, () => {
        const rig = makeRig();
        const id = sideId(rig, c.side);
        for (let i = 0; i < 20; i++) rig.step();
        const restTip = rig.tipY(id);

        // Stale Shift: its keydown arrived (Shift down), its keyup was lost.
        rig.input.handleKeyDown(skey(c.shift, true));
        for (let i = 0; i < 20; i++) rig.step();
        expect(rig.controller.getPhase(id)).toBe("held-up");

        // The other binding goes down with Shift physically up: no drop.
        rig.input.handleKeyDown(skey(code, false));
        for (let i = 0; i < 10; i++) {
          rig.step();
          expect(["flipping-up", "held-up"]).toContain(rig.controller.getPhase(id));
        }

        // Its keyup releases the bat.
        rig.input.handleKeyUp(skey(code, false));
        const fall = stepsUntilMoved(rig, id, 40);
        expect(fall).toBeGreaterThanOrEqual(1);
        expect(fall).toBeLessThanOrEqual(2);
        for (let i = 0; i < 90; i++) rig.step();
        expect(rig.controller.getPhase(id)).toBe("resting");
        expect(Math.abs(rig.tipY(id) - restTip)).toBeLessThan(0.02);
        expect(rig.input.isHeld(c.side)).toBe(false);
      });
    }
  }

  it("the both-Shift cradle survives a nudge key, and releasing one Shift leaves the other bat up", () => {
    const rig = makeRig();
    rig.input.handleKeyDown(skey("ShiftLeft", true));
    rig.input.handleKeyDown(skey("ShiftRight", true));
    for (let i = 0; i < 20; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("held-up");
    expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");

    rig.input.handleKeyDown(skey("KeyX", true));
    rig.input.handleKeyUp(skey("KeyX", true));
    for (let i = 0; i < 30; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("held-up");
    expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");

    rig.input.handleKeyUp(skey("ShiftLeft", true));
    const fall = stepsUntilMoved(rig, rig.leftId, 40);
    expect(fall).toBeGreaterThanOrEqual(1);
    expect(fall).toBeLessThanOrEqual(2);
    expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");
    for (let i = 0; i < 30; i++) {
      rig.step();
      expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");
    }
  });
});

/* ------------------------------------------------------------------------- *
 * G-04-17: Windows merges both Shifts into one VK_SHIFT.
 * ------------------------------------------------------------------------- */

describe("Windows both-Shift hold (G-04-17)", () => {
  /** A synthetic key event shaped like the live Windows capture (shiftKey, repeat). */
  const wkey = (code: string, shiftKey: boolean, repeat: boolean): KeyEventLike => ({
    code,
    shiftKey,
    repeat,
    preventDefault: () => {},
  });

  type ShiftCode = "ShiftLeft" | "ShiftRight";

  /**
   * One both-Shift order on a heal-on rig, as the browser sees it on Windows:
   * the first press, `gapSteps` later the repeat-flagged second press, a 30-step
   * window in which the first physical release sends nothing (optionally
   * carrying `windowEvent`), then the only keyup, `finalCode` with Shift up.
   */
  function runOrder(
    firstCode: ShiftCode,
    secondCode: ShiftCode,
    finalCode: ShiftCode,
    gapSteps = 20,
    windowEvent?: KeyEventLike,
  ): void {
    const rig = makeRig(true);
    const ids = [rig.leftId, rig.rightId] as const;
    const idOf = (c: ShiftCode): number => (c === "ShiftLeft" ? rig.leftId : rig.rightId);
    for (let i = 0; i < 20; i++) rig.step();
    const restTip = ids.map((id) => rig.tipY(id));

    rig.input.handleKeyDown(wkey(firstCode, true, false));
    for (let i = 0; i < gapSteps; i++) rig.step();
    expect(rig.controller.getPhase(idOf(firstCode))).toBe("held-up");

    // The second Shift arrives flagged repeat (second-press recovery).
    rig.input.handleKeyDown(wkey(secondCode, true, true));
    for (let i = 0; i < 20; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("held-up");
    expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");

    // The first physical release: the browser receives nothing, so both bats
    // stay up (the residual window).
    if (windowEvent) rig.input.handleKeyDown(windowEvent);
    for (let i = 0; i < 30; i++) {
      rig.step();
      expect(rig.controller.getPhase(rig.leftId)).toBe("held-up");
      expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");
    }

    // The final physical release: the only keyup, Shift up, drops both.
    rig.input.handleKeyUp(wkey(finalCode, false, false));
    const fall = stepsUntilEachMoved(rig, ids, 40);
    for (const n of fall) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
    }
    for (let i = 0; i < 90; i++) rig.step();
    ids.forEach((id, k) => {
      expect(rig.controller.getPhase(id)).toBe("resting");
      expect(Math.abs(rig.tipY(id) - (restTip[k] ?? 0))).toBeLessThan(0.02);
    });
    expect(rig.input.isHeld("left")).toBe(false);
    expect(rig.input.isHeld("right")).toBe(false);
  }

  it("order A (LD RD LU RU): both bats rise, and both drop on the final ShiftRight keyup", () => {
    runOrder("ShiftLeft", "ShiftRight", "ShiftRight");
  });

  it("order B (LD RD RU LU): both bats rise, and both drop on the final ShiftLeft keyup", () => {
    runOrder("ShiftLeft", "ShiftRight", "ShiftLeft");
  });

  it("order D (RD LD LU RU): both bats rise, and both drop on the final ShiftRight keyup", () => {
    runOrder("ShiftRight", "ShiftLeft", "ShiftRight");
  });

  it("order D' (RD LD RU LU): both bats rise, and both drop on the final ShiftLeft keyup", () => {
    runOrder("ShiftRight", "ShiftLeft", "ShiftLeft");
  });

  it("order E (LD, 2600 ms, RD LU RU): a 312-step gap still recovers the second press", () => {
    runOrder("ShiftLeft", "ShiftRight", "ShiftRight", 312);
  });

  it("order F (LD RD LU LD LU RU): a ShiftLeft re-tap repeat in the no-event window changes nothing", () => {
    runOrder("ShiftLeft", "ShiftRight", "ShiftRight", 20, wkey("ShiftLeft", true, true));
  });

  it("a single Shift tap on the Windows path raises and drops the left bat only", () => {
    const rig = makeRig(true);
    for (let i = 0; i < 20; i++) rig.step();
    const restTip = rig.tipY(rig.leftId);

    rig.input.handleKeyDown(wkey("ShiftLeft", true, false));
    for (let i = 0; i < 20; i++) {
      rig.step();
      expect(rig.controller.getPhase(rig.rightId)).toBe("resting");
    }
    expect(rig.controller.getPhase(rig.leftId)).toBe("held-up");

    rig.input.handleKeyUp(wkey("ShiftLeft", false, false));
    const fall = stepsUntilMoved(rig, rig.leftId, 40);
    expect(fall).toBeGreaterThanOrEqual(1);
    expect(fall).toBeLessThanOrEqual(2);
    for (let i = 0; i < 90; i++) {
      rig.step();
      expect(rig.controller.getPhase(rig.rightId)).toBe("resting");
    }
    expect(rig.controller.getPhase(rig.leftId)).toBe("resting");
    expect(Math.abs(rig.tipY(rig.leftId) - restTip)).toBeLessThan(0.02);
  });

  it("the cradle with a shiftKey-true one-of-two release drops only the released bat", () => {
    const rig = makeRig(true);
    rig.input.handleKeyDown(wkey("ShiftLeft", true, false));
    rig.input.handleKeyDown(wkey("ShiftRight", true, true));
    for (let i = 0; i < 20; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("held-up");
    expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");

    rig.input.handleKeyUp(wkey("ShiftLeft", true, false));
    const fall = stepsUntilMoved(rig, rig.leftId, 40);
    expect(fall).toBeGreaterThanOrEqual(1);
    expect(fall).toBeLessThanOrEqual(2);
    for (let i = 0; i < 30; i++) {
      rig.step();
      expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");
    }
  });
});

/* ------------------------------------------------------------------------- *
 * WR-01: a release and a same-side press in one drain window.
 * ------------------------------------------------------------------------- */

describe("same-window release and press (WR-01)", () => {
  /** A synthetic key event carrying an explicit Shift modifier state. */
  const ekey = (code: string, shiftKey: boolean, repeat = false): KeyEventLike => ({
    code,
    shiftKey,
    repeat,
    preventDefault: () => {},
  });

  it("a stale ShiftLeft healed by KeyX plus a KeyZ press in one window never drops the held left bat", () => {
    const rig = makeRig();
    for (let i = 0; i < 20; i++) rig.step();
    const restTip = rig.tipY(rig.leftId);

    rig.input.handleKeyDown(ekey("ShiftLeft", true));
    for (let i = 0; i < 20; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("held-up");

    // Nudge and flip in the same frame: no step between the two keydowns.
    rig.input.handleKeyDown(ekey("KeyX", false));
    rig.input.handleKeyDown(ekey("KeyZ", false));
    for (let i = 0; i < 10; i++) {
      rig.step();
      expect(["flipping-up", "held-up"]).toContain(rig.controller.getPhase(rig.leftId));
    }

    rig.input.handleKeyUp(ekey("KeyZ", false));
    const fall = stepsUntilMoved(rig, rig.leftId, 40);
    expect(fall).toBeGreaterThanOrEqual(1);
    expect(fall).toBeLessThanOrEqual(2);
    for (let i = 0; i < 90; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("resting");
    expect(Math.abs(rig.tipY(rig.leftId) - restTip)).toBeLessThan(0.02);
  });

  it("the Windows final-keyup heal plus a KeyZ press in one window drops the right bat and keeps the left up", () => {
    const rig = makeRig(true);
    rig.input.handleKeyDown(ekey("ShiftLeft", true, false));
    rig.input.handleKeyDown(ekey("ShiftRight", true, true));
    for (let i = 0; i < 20; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("held-up");
    expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");

    rig.input.handleKeyUp(ekey("ShiftRight", false));
    rig.input.handleKeyDown(ekey("KeyZ", false));
    const rightStart = rig.angleOf(rig.rightId);
    let rightFall = -1;
    for (let i = 1; i <= 10; i++) {
      rig.step();
      if (rightFall === -1 && Math.abs(rig.angleOf(rig.rightId) - rightStart) > MOVE_EPS_RAD) {
        rightFall = i;
      }
      expect(["flipping-up", "held-up"]).toContain(rig.controller.getPhase(rig.leftId));
    }
    expect(rightFall).toBeGreaterThanOrEqual(1);
    expect(rightFall).toBeLessThanOrEqual(2);

    rig.input.handleKeyUp(ekey("KeyZ", false));
    const leftFall = stepsUntilMoved(rig, rig.leftId, 40);
    expect(leftFall).toBeGreaterThanOrEqual(1);
    expect(leftFall).toBeLessThanOrEqual(2);
  });

  it("a KeyZ tap inside one window flips and drops the left bat back to rest", () => {
    const rig = makeRig();
    for (let i = 0; i < 20; i++) rig.step();
    const restTip = rig.tipY(rig.leftId);

    rig.input.handleKeyDown(ekey("KeyZ", false));
    rig.input.handleKeyUp(ekey("KeyZ", false));
    for (let i = 0; i < 90; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("resting");
    expect(Math.abs(rig.tipY(rig.leftId) - restTip)).toBeLessThan(0.02);
  });
});

/* ------------------------------------------------------------------------- *
 * G-04-21: the Windows Shift heal after a force-clear and on Shift keydowns.
 * ------------------------------------------------------------------------- */

describe("Windows Shift after a force-clear (G-04-21)", () => {
  /** A synthetic key event carrying explicit Shift state and repeat flag. */
  const fkey = (code: string, shiftKey: boolean, repeat: boolean): KeyEventLike => ({
    code,
    shiftKey,
    repeat,
    preventDefault: () => {},
  });

  type ShiftCode = "ShiftLeft" | "ShiftRight";

  /**
   * WR-01 on a heal-on rig: `heldCode` is held across a focus regain, its OS
   * auto-repeat reaches the page, then `otherCode` is pressed (Windows flags it
   * repeat). The other bat rises; the held-across bat stays down until a fresh
   * press; the final keyup of `heldCode` (Shift up) drops everything.
   */
  function heldAcrossClear(heldCode: ShiftCode, otherCode: ShiftCode): void {
    const rig = makeRig(true);
    const ids = [rig.leftId, rig.rightId] as const;
    const idOf = (c: ShiftCode): number => (c === "ShiftLeft" ? rig.leftId : rig.rightId);
    const heldId = idOf(heldCode);
    const otherId = idOf(otherCode);
    for (let i = 0; i < 20; i++) rig.step();
    const restTip = ids.map((id) => rig.tipY(id));

    rig.input.handleKeyDown(fkey(heldCode, true, false));
    for (let i = 0; i < 20; i++) rig.step();
    expect(rig.controller.getPhase(heldId)).toBe("held-up");

    rig.input.handleFocus();
    for (let i = 0; i < 90; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("resting");
    expect(rig.controller.getPhase(rig.rightId)).toBe("resting");

    // The held Shift's OS auto-repeat: it needs a fresh press, so nothing rises.
    rig.input.handleKeyDown(fkey(heldCode, true, true));
    for (let i = 0; i < 10; i++) rig.step();
    expect(rig.controller.getPhase(rig.leftId)).toBe("resting");
    expect(rig.controller.getPhase(rig.rightId)).toBe("resting");

    // The genuine press of the other Shift, flagged repeat by Windows.
    rig.input.handleKeyDown(fkey(otherCode, true, true));
    const rise = stepsUntilMoved(rig, otherId, 40);
    expect(rise).toBeGreaterThanOrEqual(1);
    expect(rise).toBeLessThanOrEqual(2);
    for (let i = 0; i < 20; i++) rig.step();
    expect(rig.controller.getPhase(otherId)).toBe("held-up");
    expect(rig.controller.getPhase(heldId)).toBe("resting");

    // The physical release of the other Shift sends nothing.
    for (let i = 0; i < 30; i++) {
      rig.step();
      expect(rig.controller.getPhase(otherId)).toBe("held-up");
    }

    // The only keyup: the held-across Shift, reporting Shift up.
    rig.input.handleKeyUp(fkey(heldCode, false, false));
    const fall = stepsUntilMoved(rig, otherId, 40);
    expect(fall).toBeGreaterThanOrEqual(1);
    expect(fall).toBeLessThanOrEqual(2);
    for (let i = 0; i < 90; i++) rig.step();
    ids.forEach((id, k) => {
      expect(rig.controller.getPhase(id)).toBe("resting");
      expect(Math.abs(rig.tipY(id) - (restTip[k] ?? 0))).toBeLessThan(0.02);
    });
    expect(rig.input.isHeld("left")).toBe(false);
    expect(rig.input.isHeld("right")).toBe(false);
  }

  it("ShiftLeft held across a focus regain: a Right Shift press raises the right bat and the final ShiftLeft keyup drops it", () => {
    heldAcrossClear("ShiftLeft", "ShiftRight");
  });

  it("ShiftRight held across a focus regain: a Left Shift press raises the left bat and the final ShiftRight keyup drops it", () => {
    heldAcrossClear("ShiftRight", "ShiftLeft");
  });

  it("a Shift keydown reporting Shift up keeps the other held Shift's bat up (WR-02)", () => {
    const rig = makeRig(true);
    const ids = [rig.leftId, rig.rightId] as const;
    for (let i = 0; i < 20; i++) rig.step();

    rig.input.handleKeyDown(fkey("ShiftRight", true, false));
    for (let i = 0; i < 20; i++) rig.step();
    expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");

    rig.input.handleKeyDown(fkey("ShiftLeft", false, false));
    for (let i = 0; i < 30; i++) {
      rig.step();
      expect(rig.controller.getPhase(rig.rightId)).toBe("held-up");
    }
    expect(rig.controller.getPhase(rig.leftId)).toBe("held-up");

    rig.input.handleKeyUp(fkey("ShiftLeft", false, false));
    const fall = stepsUntilEachMoved(rig, ids, 40);
    for (const n of fall) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
    }
    for (let i = 0; i < 90; i++) rig.step();
    for (const id of ids) expect(rig.controller.getPhase(id)).toBe("resting");
    expect(rig.input.isHeld("left")).toBe(false);
    expect(rig.input.isHeld("right")).toBe(false);
  });

  describe("cradle held across a force-clear (G-04-21 cradle)", () => {
    /** A timed synthetic key event; the timeStamp (ms) comes from the fixed-step clock. */
    const tkey = (code: string, shiftKey: boolean, repeat: boolean, timeStamp: number) => ({
      code,
      shiftKey,
      repeat,
      timeStamp,
      preventDefault: () => {},
    });

    /** One fixed step in ms: the timed rig's clock advances by this on every step. */
    const STEP_MS = FIXED_DT * 1000;

    /**
     * Both Shifts held (firstCode, then lastCode) across a focus regain on a
     * heal-on rig whose events carry the fixed-step clock as their timeStamp.
     * lastCode auto-repeats after the clear (Windows repeats only the
     * last-pressed key), then is lifted and re-pressed after a 600 ms pause;
     * Windows flags the re-press as a repeat. Its bat rises; the final
     * firstCode keyup (Shift up) drops it.
     */
    function cradleAcrossClear(firstCode: ShiftCode, lastCode: ShiftCode): void {
      const rig = makeRig(true);
      let now = 0;
      const tr: ReturnType<typeof makeRig> = {
        ...rig,
        step: (): void => {
          rig.step();
          now += STEP_MS;
        },
      };
      const steps = (n: number): void => {
        for (let i = 0; i < n; i++) tr.step();
      };
      const ids = [rig.leftId, rig.rightId] as const;
      const idOf = (c: ShiftCode): number => (c === "ShiftLeft" ? rig.leftId : rig.rightId);
      const firstId = idOf(firstCode);
      const lastId = idOf(lastCode);
      steps(20);
      const restTip = ids.map((id) => rig.tipY(id));

      rig.input.handleKeyDown(tkey(firstCode, true, false, now));
      steps(20);
      expect(rig.controller.getPhase(firstId)).toBe("held-up");

      // The second Shift, flagged repeat by Windows (G-04-17).
      rig.input.handleKeyDown(tkey(lastCode, true, true, now));
      steps(20);
      expect(rig.controller.getPhase(firstId)).toBe("held-up");
      expect(rig.controller.getPhase(lastId)).toBe("held-up");

      // The held last-pressed Shift's typematic.
      for (let i = 0; i < 3; i++) {
        rig.input.handleKeyDown(tkey(lastCode, true, true, now));
        steps(4);
        expect(rig.controller.getPhase(firstId)).toBe("held-up");
        expect(rig.controller.getPhase(lastId)).toBe("held-up");
      }

      rig.input.handleFocus();
      steps(90);
      expect(rig.controller.getPhase(rig.leftId)).toBe("resting");
      expect(rig.controller.getPhase(rig.rightId)).toBe("resting");

      // The post-clear typematic of the last-pressed Shift never raises a bat.
      for (let i = 0; i < 10; i++) {
        rig.input.handleKeyDown(tkey(lastCode, true, true, now));
        steps(4);
        expect(rig.controller.getPhase(rig.leftId)).toBe("resting");
        expect(rig.controller.getPhase(rig.rightId)).toBe("resting");
      }

      // lastCode lifted (Windows sends nothing) for 600 ms.
      steps(72);
      expect(rig.controller.getPhase(rig.leftId)).toBe("resting");
      expect(rig.controller.getPhase(rig.rightId)).toBe("resting");

      // The re-press, flagged repeat by Windows.
      rig.input.handleKeyDown(tkey(lastCode, true, true, now));
      const rise = stepsUntilMoved(tr, lastId, 40);
      expect(rise).toBeGreaterThanOrEqual(1);
      expect(rise).toBeLessThanOrEqual(2);
      steps(20);
      expect(rig.controller.getPhase(lastId)).toBe("held-up");
      expect(rig.controller.getPhase(firstId)).toBe("resting");

      // The re-pressed key's own typematic keeps it up, no new edge.
      for (let i = 0; i < 5; i++) {
        rig.input.handleKeyDown(tkey(lastCode, true, true, now));
        steps(4);
        expect(rig.controller.getPhase(lastId)).toBe("held-up");
      }

      // lastCode released (nothing), then firstCode: the only keyup.
      rig.input.handleKeyUp(tkey(firstCode, false, false, now));
      const fall = stepsUntilMoved(tr, lastId, 40);
      expect(fall).toBeGreaterThanOrEqual(1);
      expect(fall).toBeLessThanOrEqual(2);
      steps(90);
      ids.forEach((id, k) => {
        expect(rig.controller.getPhase(id)).toBe("resting");
        expect(Math.abs(rig.tipY(id) - (restTip[k] ?? 0))).toBeLessThan(0.02);
      });
      expect(rig.input.isHeld("left")).toBe(false);
      expect(rig.input.isHeld("right")).toBe(false);
    }

    it("both Shifts held across a focus regain: re-pressing Right Shift after a pause raises the right bat and the final ShiftLeft keyup drops it", () => {
      cradleAcrossClear("ShiftLeft", "ShiftRight");
    });

    it("mirror: re-pressing Left Shift after a pause raises the left bat and the final ShiftRight keyup drops it", () => {
      cradleAcrossClear("ShiftRight", "ShiftLeft");
    });
  });
});
