import { describe, it, expect } from "vitest";

import {
  FIXED_DT,
  PLUNGER_AXIS,
  PLUNGER_CHARGE_RATE,
  PLUNGER_MAX_CHARGE,
  PLUNGER_MAX_IMPULSE,
  PLUNGER_MIN_IMPULSE,
} from "../physics/constants";
import type { BallId, BallState } from "../physics/types";
import { PLUNGER_REST } from "../table/spec";
import { PlungerController, type PlungerWorld } from "./plunger-controller";

/**
 * Unit proof for the engine-agnostic plunger (plan 03-05, D-07/D-08/D-10). It
 * drives the controller against a SPY world that implements only the
 * `PlungerWorld` slice: it records every `applyImpulse` call and serves a
 * scripted `getBalls()` snapshot. No engine.
 */

interface ImpulseCall {
  readonly ballId: BallId;
  readonly ix: number;
  readonly iy: number;
}

class SpyWorld implements PlungerWorld {
  readonly calls: ImpulseCall[] = [];
  readonly balls: BallState[] = [];

  /** Script one ball at (x, y) moving at (vx, vy); at rest by default. */
  putBall(id: BallId, x: number, y: number, vx = 0, vy = 0): void {
    this.balls.push({ id, x, y, vx, vy, radius: 0.2, angle: 0 });
  }

  getBalls(): readonly BallState[] {
    return this.balls;
  }
  applyImpulse(ballId: BallId, ix: number, iy: number): void {
    this.calls.push({ ballId, ix, iy });
  }
}

const BALL = 7;
const STEP = (PLUNGER_CHARGE_RATE * FIXED_DT) / PLUNGER_MAX_CHARGE;
const STEPS_TO_CAP = Math.ceil(PLUNGER_MAX_CHARGE / (PLUNGER_CHARGE_RATE * FIXED_DT));

function rig(): { world: SpyWorld; plunger: PlungerController } {
  const world = new SpyWorld();
  world.putBall(BALL, PLUNGER_REST.x, PLUNGER_REST.y);
  return { world, plunger: new PlungerController(world) };
}

/** Press, run `k` updates, release `BALL`; returns the impulse magnitude applied. */
function chargeAndRelease(k: number): { mag: number; chargeBefore: number; world: SpyWorld } {
  const { world, plunger } = rig();
  plunger.onPressEdge();
  for (let i = 0; i < k; i++) plunger.update();
  const chargeBefore = plunger.getCharge();
  plunger.onReleaseEdge(BALL);
  const call = world.calls[0];
  if (!call || world.calls.length !== 1) {
    throw new Error(`expected exactly one impulse, got ${world.calls.length}`);
  }
  return { mag: Math.hypot(call.ix, call.iy), chargeBefore, world };
}

describe("PlungerController: charge accumulation (D-08)", () => {
  it("reads 0 and idle before any press", () => {
    const { plunger } = rig();
    expect(plunger.getCharge()).toBe(0);
    expect(plunger.getPhase()).toBe("idle");
    plunger.update();
    expect(plunger.getCharge()).toBe(0);
  });

  it("rises by PLUNGER_CHARGE_RATE * FIXED_DT / PLUNGER_MAX_CHARGE per update while charging", () => {
    const { plunger } = rig();
    plunger.onPressEdge();
    expect(plunger.getPhase()).toBe("charging");
    let prev = plunger.getCharge();
    for (let i = 0; i < STEPS_TO_CAP - 1; i++) {
      plunger.update();
      const c = plunger.getCharge();
      expect(c - prev).toBeCloseTo(STEP, 12);
      prev = c;
    }
  });

  it("reaches exactly 1 at the cap and never exceeds it", () => {
    const { plunger } = rig();
    plunger.onPressEdge();
    for (let i = 0; i < STEPS_TO_CAP; i++) plunger.update();
    expect(plunger.getCharge()).toBe(1);
    for (let i = 0; i < 500; i++) {
      plunger.update();
      expect(plunger.getCharge()).toBeLessThanOrEqual(1);
    }
    expect(plunger.getCharge()).toBe(1);
  });

  it("a second press while charging does not restart the charge", () => {
    const { plunger } = rig();
    plunger.onPressEdge();
    for (let i = 0; i < 10; i++) plunger.update();
    const c = plunger.getCharge();
    plunger.onPressEdge();
    expect(plunger.getCharge()).toBe(c);
  });
});

describe("PlungerController: release impulse (D-07/D-09)", () => {
  it("an in-zone release applies exactly one impulse along PLUNGER_AXIS to the named ball", () => {
    const { world, plunger } = rig();
    plunger.onPressEdge();
    for (let i = 0; i < 20; i++) plunger.update();
    const c = plunger.getCharge();
    plunger.onReleaseEdge(BALL);
    const mag = PLUNGER_MIN_IMPULSE + (PLUNGER_MAX_IMPULSE - PLUNGER_MIN_IMPULSE) * c;
    expect(world.calls).toEqual([
      { ballId: BALL, ix: PLUNGER_AXIS.x * mag, iy: PLUNGER_AXIS.y * mag },
    ]);
  });

  it("the magnitude strictly increases across k = 0, 10, 20 and the cap; k = 0 is exactly PLUNGER_MIN_IMPULSE", () => {
    const ks = [0, 10, 20, STEPS_TO_CAP];
    const mags = ks.map((k) => chargeAndRelease(k).mag);
    expect(mags[0]).toBe(PLUNGER_MIN_IMPULSE);
    for (let i = 1; i < mags.length; i++) {
      expect(mags[i]).toBeGreaterThan(mags[i - 1] ?? Infinity);
    }
    expect(mags[mags.length - 1]).toBeCloseTo(PLUNGER_MAX_IMPULSE, 12);
  });

  it("only the in-zone charging release calls applyImpulse; every path leaves the charge at 0", () => {
    // In-zone charging release: one call, charge reset.
    {
      const { world, plunger } = rig();
      plunger.onPressEdge();
      for (let i = 0; i < 30; i++) plunger.update();
      plunger.onReleaseEdge(BALL);
      expect(world.calls.length).toBe(1);
      expect(plunger.getCharge()).toBe(0);
      expect(plunger.getPhase()).toBe("idle");
    }
    // Cancel: no call, charge reset.
    {
      const { world, plunger } = rig();
      plunger.onPressEdge();
      for (let i = 0; i < 30; i++) plunger.update();
      plunger.onCancelEdge();
      expect(world.calls.length).toBe(0);
      expect(plunger.getCharge()).toBe(0);
      expect(plunger.getPhase()).toBe("idle");
      // The key-up after a cancel is an idle release: still nothing.
      plunger.onReleaseEdge(BALL);
      expect(world.calls.length).toBe(0);
    }
    // Out-of-zone ball (in play on the field): no call, charge reset.
    {
      const world = new SpyWorld();
      world.putBall(BALL, 1.45, 3.0);
      const plunger = new PlungerController(world);
      plunger.onPressEdge();
      for (let i = 0; i < 30; i++) plunger.update();
      plunger.onReleaseEdge(BALL);
      expect(world.calls.length).toBe(0);
      expect(plunger.getCharge()).toBe(0);
    }
    // Unknown / removed ball id: no call, charge reset.
    {
      const { world, plunger } = rig();
      plunger.onPressEdge();
      for (let i = 0; i < 30; i++) plunger.update();
      plunger.onReleaseEdge(BALL + 1);
      expect(world.calls.length).toBe(0);
      expect(plunger.getCharge()).toBe(0);
    }
    // Idle release (no press): no call, charge stays 0.
    {
      const { world, plunger } = rig();
      plunger.onReleaseEdge(BALL);
      expect(world.calls.length).toBe(0);
      expect(plunger.getCharge()).toBe(0);
    }
  });

  it("honors a custom zone", () => {
    const world = new SpyWorld();
    world.putBall(BALL, 0.5, 0.5);
    const plunger = new PlungerController(world, { minX: 0, maxX: 1, minY: 0, maxY: 1 });
    plunger.onPressEdge();
    plunger.onReleaseEdge(BALL);
    expect(world.calls.length).toBe(1);
  });
});

describe("PlungerController: rest gate (IN-01)", () => {
  /** An in-zone ball at PLUNGER_REST moving at (vx, vy): charge 20 steps, release. */
  function releaseMoving(vx: number, vy: number): { world: SpyWorld; plunger: PlungerController } {
    const world = new SpyWorld();
    world.putBall(BALL, PLUNGER_REST.x, PLUNGER_REST.y, vx, vy);
    const plunger = new PlungerController(world);
    plunger.onPressEdge();
    for (let i = 0; i < 20; i++) plunger.update();
    plunger.onReleaseEdge(BALL);
    return { world, plunger };
  }

  it("an in-zone ball moving at (0, 2) gets no impulse, and the controller ends idle with charge 0", () => {
    const { world, plunger } = releaseMoving(0, 2);
    expect(world.calls.length).toBe(0);
    expect(plunger.getPhase()).toBe("idle");
    expect(plunger.getCharge()).toBe(0);
  });

  it("an in-zone ball at 0.049 m/s is resting and launches", () => {
    const { world } = releaseMoving(0, 0.049);
    expect(world.calls.length).toBe(1);
  });

  it("an in-zone ball at exactly 0.05 m/s is not resting (strict less-than)", () => {
    const { world, plunger } = releaseMoving(0.03, 0.04); // hypot = 0.05 exactly
    expect(Math.hypot(0.03, 0.04)).toBe(0.05);
    expect(world.calls.length).toBe(0);
    expect(plunger.getCharge()).toBe(0);
  });
});

describe("PlungerController: determinism and meter honesty (T-03-11, D-10)", () => {
  it("two fresh controllers fed the same edge script produce identical impulse calls", () => {
    const script = (plunger: PlungerController): void => {
      plunger.onPressEdge();
      for (let i = 0; i < 37; i++) plunger.update();
      plunger.onReleaseEdge(BALL);
      plunger.onPressEdge();
      for (let i = 0; i < 5; i++) plunger.update();
      plunger.onCancelEdge();
      plunger.onPressEdge();
      for (let i = 0; i < STEPS_TO_CAP + 40; i++) plunger.update();
      plunger.onReleaseEdge(BALL);
      plunger.onPressEdge();
      plunger.onReleaseEdge(BALL);
    };
    const a = rig();
    const b = rig();
    script(a.plunger);
    script(b.plunger);
    expect(a.world.calls.length).toBe(3);
    expect(b.world.calls).toEqual(a.world.calls);
  });

  it("the charge read just before release is exactly the normalized power the impulse used", () => {
    for (const k of [0, 1, 13, 40, 79, STEPS_TO_CAP, STEPS_TO_CAP + 25]) {
      const { mag, chargeBefore } = chargeAndRelease(k);
      const used = (mag - PLUNGER_MIN_IMPULSE) / (PLUNGER_MAX_IMPULSE - PLUNGER_MIN_IMPULSE);
      expect(Math.abs(chargeBefore - used)).toBeLessThan(1e-12);
    }
  });
});
