/**
 * Engine-agnostic flipper state machine (D-05). It imports NO physics engine
 * (`planck`) — only the `PhysicsWorld` interface, and only as a TYPE — and drives
 * the world SOLELY through the sign-only `setFlipperMotor(id, direction)` hook
 * (+1 = toward the upper limit, -1 = toward the lower, 0 = hold). Speed magnitudes
 * live in the adapter's tuned constants, not here (D-05), so a future custom
 * solver reuses this FSM unchanged. Zero per-frame allocation: the per-flipper
 * records are built ONCE in the constructor and mutated in place.
 *
 * Observable FSM (D-04/D-05): each flipper is in exactly one of
 *   resting -> flipping-up -> held-up -> returning -> resting
 * driven by input edges (`onPressEdge` / `onReleaseEdge`, fed by the drained
 * keyboard latch in plan 02-03) and advanced once per fixed step by `update()`.
 *
 * Cradle hold (D-06(1)): through BOTH flipping-up and held-up the FSM re-asserts
 * `+1` on EVERY update — it never releases to 0 while up, or gravity + the ball's
 * weight would sag the bat off the upper limit.
 *
 * Limit detection is geometry/mirror-independent: instead of comparing the live
 * angle to a hard-coded limit (which would differ for the referenceAngle-mirrored
 * right flipper), the FSM detects that the bat has REACHED a limit when its angle
 * stops advancing (|delta| < ANGLE_SETTLE_EPS) after it has actually moved. Under
 * motor +1 the absolute `getFlippers()` angle rises for BOTH flippers and under
 * -1 it falls, so "stopped moving while driven" == "pinned at the limit".
 *
 * Interface slice: the FSM depends only on `FlipperWorld` (`getFlippers` and
 * `setFlipperMotor`), never the full `PhysicsWorld`. Growth elsewhere on the
 * interface (03-05 adds `applyImpulse`) therefore never ripples into this
 * module or its spy-world tests. `PlanckWorld` satisfies it structurally.
 */

import type { PhysicsWorld } from "../physics/types";

/** The slice of `PhysicsWorld` the flipper FSM actually reads and drives. */
export type FlipperWorld = Pick<PhysicsWorld, "getFlippers" | "setFlipperMotor">;

/** The four observable per-flipper states (criterion #3: explicit FSM). */
export type FlipperPhase = "resting" | "flipping-up" | "held-up" | "returning";

/**
 * Angular "has settled" threshold (radians). A driven bat sweeps ~omega * dt per
 * fixed step (~30 * 1/120 ~= 0.25 rad at the feel raise speed) — orders of
 * magnitude above this — while a bat pinned at its hard revolute limit barely
 * moves. So a per-update delta below this, once the bat has moved at all, means
 * "reached the limit". Well clear of both regimes; not a feel magnitude, so it
 * lives with the FSM rather than in the adapter's tuning constants.
 */
const ANGLE_SETTLE_EPS = 1e-3;

interface FlipperFsm {
  readonly id: number;
  phase: FlipperPhase;
  /** Angle observed on the previous relevant update (settle detector). */
  prevAngle: number;
  /** Whether the bat has moved since entering the current driven phase. */
  moved: boolean;
}

export class FlipperController {
  private readonly world: FlipperWorld;
  private readonly fsms: FlipperFsm[] = [];

  constructor(world: FlipperWorld) {
    this.world = world;
    // Seed one FSM per live flipper (mirrors FixedStepLoop seeding snapshots in
    // its constructor). Built once — never re-created per update.
    const flippers = world.getFlippers();
    for (let i = 0; i < flippers.length; i++) {
      const f = flippers[i];
      if (!f) continue;
      this.fsms.push({ id: f.id, phase: "resting", prevAngle: f.angle, moved: false });
      // Enforce the resting invariant IMMEDIATELY (D-04/D-06): command motor 0 so
      // each bat is brake-held at rest rather than left running the adapter's
      // construction-default motor speed. Without this, the leftover speed keeps
      // driving a never-pressed bat hard into a joint limit, where the high-torque
      // revolute motor overshoots and Box2D locks the joint (a "limit jam") — an
      // idle flipper enters that jam on startup and it then swallows the first
      // real press/release. The whole FSM assumes "resting == motor 0"; the world
      // does not start there, so make it true here (once, in the constructor).
      this.world.setFlipperMotor(f.id, 0);
    }
  }

  /** Observable phase of a flipper (for the renderer / tests). */
  getPhase(id: number): FlipperPhase {
    const fsm = this.find(id);
    return fsm ? fsm.phase : "resting";
  }

  /**
   * A side went not-held -> held. From resting or returning, snap into
   * flipping-up and drive +1 (a press during returning re-flips immediately).
   * A press while already flipping-up/held-up is ignored (already up).
   */
  onPressEdge(id: number): void {
    const fsm = this.find(id);
    if (!fsm) return; // unknown id: safe no-op
    if (fsm.phase === "resting" || fsm.phase === "returning") {
      fsm.phase = "flipping-up";
      fsm.moved = false;
      fsm.prevAngle = this.angleOf(id, fsm.prevAngle);
      this.world.setFlipperMotor(id, 1);
    }
  }

  /**
   * A side went held -> not-held. From flipping-up or held-up, drive -1 back down.
   * A release while resting/returning is ignored (already heading down).
   */
  onReleaseEdge(id: number): void {
    const fsm = this.find(id);
    if (!fsm) return;
    if (fsm.phase === "flipping-up" || fsm.phase === "held-up") {
      fsm.phase = "returning";
      fsm.moved = false;
      fsm.prevAngle = this.angleOf(id, fsm.prevAngle);
      this.world.setFlipperMotor(id, -1);
    }
  }

  /**
   * Advance every flipper one fixed step: re-assert the hold while up (D-06(1)),
   * and use the settle detector to advance flipping-up -> held-up and
   * returning -> resting (issuing motor 0 exactly when it settles into resting).
   */
  update(): void {
    for (let i = 0; i < this.fsms.length; i++) {
      const fsm = this.fsms[i];
      if (!fsm) continue;
      const angle = this.angleOf(fsm.id, fsm.prevAngle);
      const settled = Math.abs(angle - fsm.prevAngle) < ANGLE_SETTLE_EPS;

      switch (fsm.phase) {
        case "flipping-up":
          this.world.setFlipperMotor(fsm.id, 1); // hold into the upper limit
          if (!settled) fsm.moved = true;
          else if (fsm.moved) fsm.phase = "held-up"; // pinned at upper limit
          break;
        case "held-up":
          this.world.setFlipperMotor(fsm.id, 1); // D-06(1): never release to 0
          break;
        case "returning":
          if (!settled) {
            fsm.moved = true;
            this.world.setFlipperMotor(fsm.id, -1);
          } else if (fsm.moved) {
            fsm.phase = "resting";
            fsm.moved = false;
            this.world.setFlipperMotor(fsm.id, 0); // settled at the lower limit
          } else {
            this.world.setFlipperMotor(fsm.id, -1); // not moved yet: keep driving
          }
          break;
        case "resting":
          // Motor is already 0 (set on the transition in); the lower limit holds
          // the bat, so no re-assert is needed.
          break;
      }
      fsm.prevAngle = angle;
    }
  }

  private find(id: number): FlipperFsm | undefined {
    for (let i = 0; i < this.fsms.length; i++) {
      const fsm = this.fsms[i];
      if (fsm && fsm.id === id) return fsm;
    }
    return undefined;
  }

  /** Live angle for a flipper id, or `fallback` if it is not reported. */
  private angleOf(id: number, fallback: number): number {
    const flippers = this.world.getFlippers();
    for (let i = 0; i < flippers.length; i++) {
      const f = flippers[i];
      if (f && f.id === id) return f.angle;
    }
    return fallback;
  }
}
