import { describe, it, expect } from "vitest";

import type {
  BallId,
  BallState,
  CollisionEvent,
  FlipperState,
  PhysicsWorld,
  Segment,
  Vec2,
} from "../physics/types";
import { FlipperController } from "./flipper-controller";

/**
 * Unit proof for the engine-agnostic flipper FSM (D-05). It drives the
 * controller against a hand-rolled SPY `PhysicsWorld` — no `planck`, no real
 * engine — that records every `setFlipperMotor` call and returns a SCRIPTED
 * `getFlippers()` angle. The controller detects "reached a limit" by motion
 * settling (angle stops advancing), so it is mirror-safe: the same logic proves
 * a left flipper sweeping around angle 0 and a mirrored right flipper around π.
 */

interface MotorCall {
  readonly id: number;
  readonly direction: number;
}

/** A spy world implementing the interface; only flippers/motor matter here. */
class SpyWorld implements PhysicsWorld {
  readonly motorCalls: MotorCall[] = [];
  private readonly flippers: {
    id: number;
    pivotX: number;
    pivotY: number;
    angle: number;
    length: number;
    halfWidth: number;
    tipRadius: number;
  }[] = [];

  constructor(ids: readonly { id: number; angle: number }[]) {
    for (const f of ids) {
      this.flippers.push({
        id: f.id,
        pivotX: 0,
        pivotY: 0,
        angle: f.angle,
        length: 0.5,
        halfWidth: 0.07,
        tipRadius: 0.07,
      });
    }
  }

  /** Script the live angle a flipper reports on the next `getFlippers()`. */
  setAngle(id: number, angle: number): void {
    const f = this.flippers.find((x) => x.id === id);
    if (f) f.angle = angle;
  }

  clearMotorCalls(): void {
    this.motorCalls.length = 0;
  }

  lastMotor(id: number): number | undefined {
    for (let i = this.motorCalls.length - 1; i >= 0; i--) {
      const c = this.motorCalls[i];
      if (c && c.id === id) return c.direction;
    }
    return undefined;
  }

  // --- Interface surface the FSM uses -------------------------------------
  getFlippers(): readonly FlipperState[] {
    return this.flippers;
  }
  setFlipperMotor(id: number, direction: number): void {
    this.motorCalls.push({ id, direction });
  }

  // --- Unused stubs (the FSM never calls these; params omitted deliberately) ---
  step(): void {}
  addBall(): BallId {
    return 0;
  }
  removeBall(): void {}
  getBalls(): readonly BallState[] {
    return [];
  }
  getBoundarySegments(): readonly Segment[] {
    return [];
  }
  drainEvents(): CollisionEvent[] {
    return [];
  }
  getContactPoints(): readonly Vec2[] {
    return [];
  }
}

// Left flipper sweeps around angle 0; a MOTION ramp from rest to up and back.
const L_REST = -0.4;
const L_UP = 0.4;

/** Ramp the scripted angle from `from` to `to` in `n` updates, stepping the FSM. */
function sweep(
  world: SpyWorld,
  ctrl: FlipperController,
  id: number,
  from: number,
  to: number,
  n: number,
): void {
  for (let i = 1; i <= n; i++) {
    world.setAngle(id, from + ((to - from) * i) / n);
    ctrl.update();
  }
}

/** Hold the angle constant for `n` updates so the FSM sees it as settled. */
function hold(world: SpyWorld, ctrl: FlipperController, id: number, angle: number, n: number): void {
  for (let i = 0; i < n; i++) {
    world.setAngle(id, angle);
    ctrl.update();
  }
}

describe("FlipperController — resting -> flipping-up -> held-up -> returning (D-04/D-05/D-06)", () => {
  it("a press edge transitions resting -> flipping-up and commands +1", () => {
    const world = new SpyWorld([{ id: 0, angle: L_REST }]);
    const ctrl = new FlipperController(world);
    expect(ctrl.getPhase(0)).toBe("resting");

    ctrl.onPressEdge(0);
    expect(ctrl.getPhase(0)).toBe("flipping-up");
    expect(world.lastMotor(0)).toBe(1);
  });

  it("reaches held-up at the upper limit and STILL commands +1 every update (never 0) — D-06(1)", () => {
    const world = new SpyWorld([{ id: 0, angle: L_REST }]);
    const ctrl = new FlipperController(world);

    ctrl.onPressEdge(0);
    sweep(world, ctrl, 0, L_REST, L_UP, 4); // bat sweeps up
    hold(world, ctrl, 0, L_UP, 2); // pinned at the upper limit -> settles to held-up
    expect(ctrl.getPhase(0)).toBe("held-up");

    // The cradle: every further update must re-assert +1, and NEVER release to 0.
    world.clearMotorCalls();
    hold(world, ctrl, 0, L_UP, 5);
    expect(ctrl.getPhase(0)).toBe("held-up");
    expect(world.motorCalls.length).toBe(5);
    for (const c of world.motorCalls) expect(c.direction).toBe(1);
    expect(world.motorCalls.some((c) => c.direction === 0)).toBe(false);
  });

  it("a release edge -> returning (-1), and settling at the lower limit -> resting (0)", () => {
    const world = new SpyWorld([{ id: 0, angle: L_REST }]);
    const ctrl = new FlipperController(world);

    ctrl.onPressEdge(0);
    sweep(world, ctrl, 0, L_REST, L_UP, 4);
    hold(world, ctrl, 0, L_UP, 2);
    expect(ctrl.getPhase(0)).toBe("held-up");

    world.clearMotorCalls();
    ctrl.onReleaseEdge(0);
    expect(ctrl.getPhase(0)).toBe("returning");
    expect(world.lastMotor(0)).toBe(-1);

    sweep(world, ctrl, 0, L_UP, L_REST, 4); // bat returns down
    hold(world, ctrl, 0, L_REST, 2); // pinned at the lower limit -> resting
    expect(ctrl.getPhase(0)).toBe("resting");
    expect(world.lastMotor(0)).toBe(0);
  });

  it("a press during returning re-enters flipping-up (+1) without waiting to reach rest", () => {
    const world = new SpyWorld([{ id: 0, angle: L_REST }]);
    const ctrl = new FlipperController(world);

    ctrl.onPressEdge(0);
    sweep(world, ctrl, 0, L_REST, L_UP, 4);
    hold(world, ctrl, 0, L_UP, 2);
    ctrl.onReleaseEdge(0);
    sweep(world, ctrl, 0, L_UP, 0, 2); // part-way down, NOT yet at rest
    expect(ctrl.getPhase(0)).toBe("returning");

    world.clearMotorCalls();
    ctrl.onPressEdge(0); // re-flip mid-return
    expect(ctrl.getPhase(0)).toBe("flipping-up");
    expect(world.lastMotor(0)).toBe(1);
  });

  it("ignores a release while resting and a press while already held-up (no spurious motor flip)", () => {
    const world = new SpyWorld([{ id: 0, angle: L_REST }]);
    const ctrl = new FlipperController(world);

    // Release while resting: no-op.
    world.clearMotorCalls();
    ctrl.onReleaseEdge(0);
    expect(ctrl.getPhase(0)).toBe("resting");
    expect(world.motorCalls.length).toBe(0);

    // Reach held-up, then a redundant press must not change state or command -1/0.
    ctrl.onPressEdge(0);
    sweep(world, ctrl, 0, L_REST, L_UP, 4);
    hold(world, ctrl, 0, L_UP, 2);
    expect(ctrl.getPhase(0)).toBe("held-up");

    world.clearMotorCalls();
    ctrl.onPressEdge(0);
    expect(ctrl.getPhase(0)).toBe("held-up");
    expect(world.motorCalls.some((c) => c.direction !== 1)).toBe(false);
  });

  it("is mirror-safe: a right flipper sweeping around +pi drives the same phase sequence", () => {
    const R_REST = Math.PI - 0.4;
    const R_UP = Math.PI + 0.4;
    const world = new SpyWorld([{ id: 1, angle: R_REST }]);
    const ctrl = new FlipperController(world);

    ctrl.onPressEdge(1);
    expect(world.lastMotor(1)).toBe(1);
    sweep(world, ctrl, 1, R_REST, R_UP, 4);
    hold(world, ctrl, 1, R_UP, 2);
    expect(ctrl.getPhase(1)).toBe("held-up");

    ctrl.onReleaseEdge(1);
    expect(world.lastMotor(1)).toBe(-1);
    sweep(world, ctrl, 1, R_UP, R_REST, 4);
    hold(world, ctrl, 1, R_REST, 2);
    expect(ctrl.getPhase(1)).toBe("resting");
    expect(world.lastMotor(1)).toBe(0);
  });

  it("drives multiple flippers independently (an unknown id is a safe no-op)", () => {
    const world = new SpyWorld([
      { id: 0, angle: L_REST },
      { id: 1, angle: L_REST },
    ]);
    const ctrl = new FlipperController(world);

    ctrl.onPressEdge(0);
    expect(ctrl.getPhase(0)).toBe("flipping-up");
    expect(ctrl.getPhase(1)).toBe("resting"); // untouched

    // Unknown id must not throw and must record no motor call.
    world.clearMotorCalls();
    ctrl.onPressEdge(99);
    expect(world.motorCalls.length).toBe(0);
  });
});
