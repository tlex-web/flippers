import { describe, it, expect } from "vitest";

import { FIXED_DT } from "./constants";
import { PlanckWorld } from "./planck-world";
import type { PhysicsWorld } from "./types";
import { PROOF_BOX_SPEC } from "../table/spec";
import { FixedStepLoop } from "../sim/loop";

/**
 * Adapter-level flipper RESPONSE pin (G-04-10), the FSM-free twin of the
 * keyboard-path latency cases in src/sandbox/flipper-e2e.test.ts. It drives
 * `PlanckWorld.setFlipperMotor` directly, through the engine-agnostic
 * interface only (no engine import), on both the playfield (TABLE_SPEC) and
 * the harness proof box, for both bats.
 *
 * What it pins: a bat answers a commanded direction change within 2 fixed
 * steps however long it was held into a joint limit before. This is the
 * planck@1.5.0 joint behavior the adapter's reset relies on: Planck warm-starts
 * the revolute joint's accumulated limit impulse, so a bat held into a limit
 * carries a stale impulse reserve that a reversed motor must first unwind (the
 * ~15-step dead time). `setFlipperMotor` clears it through the public
 * `RevoluteJoint.enableLimit(false)` / `enableLimit(true)` toggle on every
 * direction change. If a planck upgrade turns this file red, re-check the
 * RevoluteJoint.enableLimit semantics (does toggling the flag still clear the
 * accumulated limit impulse?) before touching anything else.
 *
 * It also pins the other side of the trade: a bat HELD up (same-sign +1 every
 * step) keeps its warm-started limit impulse and stays pinned at the limit.
 */

const MOVE_EPS_RAD = 0.01;

interface Rig {
  /** Run one fixed 120 Hz step with `id`'s motor commanded `dir` at the top. */
  readonly step: (id: number, dir: number) => void;
  readonly angleOf: (id: number) => number;
}

function makeRig(world: PhysicsWorld): Rig {
  const loop = new FixedStepLoop(world);
  const angleOf = (id: number): number => {
    const f = world.getFlippers().find((x) => x.id === id);
    if (!f) throw new Error(`flipper ${id} missing`);
    return f.angle;
  };
  const step = (id: number, dir: number): void => {
    const n = loop.advance(FIXED_DT * 1000, () => world.setFlipperMotor(id, dir));
    if (n !== 1) throw new Error(`expected exactly 1 fixed step, got ${n}`);
  };
  return { step, angleOf };
}

/** Steps (under a constant `dir`) until `id` leaves its angle by > MOVE_EPS_RAD, or -1. */
function stepsUntilMoved(rig: Rig, id: number, dir: number, maxSteps: number): number {
  const start = rig.angleOf(id);
  for (let i = 1; i <= maxSteps; i++) {
    rig.step(id, dir);
    if (Math.abs(rig.angleOf(id) - start) > MOVE_EPS_RAD) return i;
  }
  return -1;
}

const WORLDS = [
  { name: "TABLE_SPEC", make: (): PhysicsWorld => new PlanckWorld() },
  {
    name: "PROOF_BOX_SPEC",
    make: (): PhysicsWorld => new PlanckWorld({ table: PROOF_BOX_SPEC }),
  },
] as const;

describe("setFlipperMotor response latency (planck@1.5.0 joint pin, G-04-10)", () => {
  for (const w of WORLDS) {
    const ids = w
      .make()
      .getFlippers()
      .map((f) => f.id);
    for (const id of ids) {
      for (const hold of [10, 60, 200]) {
        it(`${w.name} flipper ${id}: -1 after a ${hold}-step +1 hold moves within 2 steps`, () => {
          const rig = makeRig(w.make());
          for (let i = 0; i < hold; i++) rig.step(id, 1);
          const n = stepsUntilMoved(rig, id, -1, 40);
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(2);
        });
      }

      it(`${w.name} flipper ${id}: +1 after a 240-step rest (motor 0) moves within 2 steps`, () => {
        const rig = makeRig(w.make());
        for (let i = 0; i < 30; i++) rig.step(id, -1);
        for (let i = 0; i < 240; i++) rig.step(id, 0);
        const n = stepsUntilMoved(rig, id, 1, 40);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(2);
      });

      it(`${w.name} flipper ${id}: a 120-step +1 hold stays pinned at the up limit`, () => {
        const rig = makeRig(w.make());
        let prev = rig.angleOf(id);
        let maxDelta = 0;
        for (let i = 0; i < 120; i++) {
          rig.step(id, 1);
          const a = rig.angleOf(id);
          if (i >= 60) maxDelta = Math.max(maxDelta, Math.abs(a - prev));
          prev = a;
        }
        expect(maxDelta).toBeLessThan(1e-3);
      });
    }
  }
});
