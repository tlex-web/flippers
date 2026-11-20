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
 * Limit detection is mirror-independent. The UP limit is detected by settling:
 * the bat has REACHED it when its angle stops advancing (|delta| <
 * ANGLE_SETTLE_EPS) after it has actually moved. The detector is sign-agnostic:
 * since the 02 GAP-01 raiseSign fix, motor +1 raises the absolute
 * `getFlippers()` angle on one bat and lowers it on the mirrored other, so only
 * |delta| is ever compared. The REST limit additionally requires position
 * (G-04-10): `returning` enters `resting` only after REST_SETTLE_UPDATES
 * consecutive settled observations within REST_ANGLE_TOL of the bat's own
 * `FlipperState.restLimitAngle` (static geometry the world reports, so no
 * hard-coded per-side limit lives here). Settling alone was not enough: a
 * reversing bat can sit still for a few steps mid-sweep (limit-impulse dead
 * time, position-correction drift), and reading that as "settled" parked the
 * bat raised with motor 0. A bat that stops short keeps being driven -1.
 *
 * Enable gate (R11, GAME-03): `setEnabled(false)` drops both bats, the way a
 * real machine's flipper relay cuts out on TILT and outside a game. Every bat
 * that is flipping up or held up is driven back down through the same
 * `returning` transition a key release uses (motor -1), and `onPressEdge` is
 * ignored until `setEnabled(true)`. Releases and `update()` keep running, so a
 * dropping bat still settles to `resting` with motor 0. Tilt and attract drop
 * the bats through the FSM's motor drive only, never by changing the body type
 * or the joints: the flippers stay dynamic bodies on motorized revolute joints
 * (CLAUDE.md flipper lock). Enabled is the construction default, and enabling
 * issues no motor command, so every Phase-2/3 proof runs unchanged.
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

/**
 * How close (radians) to its `restLimitAngle` a settled bat must be to count as
 * resting (G-04-10). Measured in planning on the real world: a resting bat sits
 * at most ~0.036 rad from its rest limit (Planck's ~2° angular slop), while a
 * bat parked raised by the old settle-only detector sat ~0.82 rad away. 0.1 is
 * well clear of both.
 */
const REST_ANGLE_TOL = 0.1;

/**
 * Consecutive settled observations at the rest limit required to enter
 * `resting`. The first update after a release always reads delta 0, because
 * `drop()` refreshes `prevAngle` to the live angle, so one observation proves
 * nothing; a second proves a real fixed step saw no motion.
 */
const REST_SETTLE_UPDATES = 2;

interface FlipperFsm {
  readonly id: number;
  phase: FlipperPhase;
  /** Angle observed on the previous relevant update (settle detector). */
  prevAngle: number;
  /** Whether the bat has moved since entering flipping-up (held-up detector). */
  moved: boolean;
  /** World-frame rest-limit angle, read once from FlipperState (static). */
  readonly restLimitAngle: number;
  /** Consecutive settled updates within REST_ANGLE_TOL of the rest limit. */
  restSettled: number;
}

export class FlipperController {
  private readonly world: FlipperWorld;
  private readonly fsms: FlipperFsm[] = [];
  /** Whether presses are honored (the flipper relay); true from construction. */
  private enabled = true;

  constructor(world: FlipperWorld) {
    this.world = world;
    // Seed one FSM per live flipper (mirrors FixedStepLoop seeding snapshots in
    // its constructor). Built once — never re-created per update.
    const flippers = world.getFlippers();
    for (let i = 0; i < flippers.length; i++) {
      const f = flippers[i];
      if (!f) continue;
      this.fsms.push({
        id: f.id,
        phase: "resting",
        prevAngle: f.angle,
        moved: false,
        restLimitAngle: f.restLimitAngle,
        restSettled: 0,
      });
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

  /** Whether presses are honored right now (see {@link setEnabled}). */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Open or cut the flipper relay. Disabling drives every bat that is
   * flipping up or held up into `returning` (motor -1), exactly as a key
   * release does, and makes `onPressEdge` a no-op; a resting or already
   * returning bat gets no motor command. Enabling only stores the flag and
   * issues no motor command: the caller re-presses any side whose key is still
   * held (Pitfall 5). Never changes a body type or a joint.
   */
  setEnabled(enabled: boolean): void {
    if (!enabled) {
      for (let i = 0; i < this.fsms.length; i++) {
        const fsm = this.fsms[i];
        if (fsm) this.drop(fsm);
      }
    }
    this.enabled = enabled;
  }

  /**
   * A side went not-held -> held. From resting or returning, snap into
   * flipping-up and drive +1 (a press during returning re-flips immediately).
   * A press while already flipping-up/held-up is ignored (already up), and so
   * is every press while disabled.
   */
  onPressEdge(id: number): void {
    if (!this.enabled) return; // relay cut: tilt or no game in progress
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
    if (fsm) this.drop(fsm);
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
          // Rest only when settled AT the rest limit, twice in a row (G-04-10);
          // a bat that stops short of it keeps being driven down.
          if (settled && Math.abs(angle - fsm.restLimitAngle) <= REST_ANGLE_TOL) {
            fsm.restSettled++;
          } else {
            fsm.restSettled = 0;
          }
          if (fsm.restSettled >= REST_SETTLE_UPDATES) {
            fsm.phase = "resting";
            fsm.moved = false;
            fsm.restSettled = 0;
            this.world.setFlipperMotor(fsm.id, 0); // settled at the rest limit
          } else {
            this.world.setFlipperMotor(fsm.id, -1);
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

  /**
   * From flipping-up or held-up, enter returning and drive -1 back down (the
   * release transition, shared by `onReleaseEdge` and `setEnabled(false)`).
   * Resting or returning: no-op, no motor command.
   */
  private drop(fsm: FlipperFsm): void {
    if (fsm.phase === "flipping-up" || fsm.phase === "held-up") {
      fsm.phase = "returning";
      fsm.moved = false;
      fsm.restSettled = 0;
      fsm.prevAngle = this.angleOf(fsm.id, fsm.prevAngle);
      this.world.setFlipperMotor(fsm.id, -1);
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
