/**
 * GameSession: the 3-ball game state machine behind the rules gate (GAME-01,
 * GAME-02). It owns the score, the ball count and the ball in play, and it
 * serves every ball to the plunger.
 *
 * States (a hand-rolled string union, no state-machine library):
 * - `"game-over"`: attract at boot and after the last ball. No ball on the
 *   table, `activeBallId` is -1, nothing scores, and the final score is kept
 *   until the next start.
 * - `"playing"`: a ball is in play and the rules are live.
 * - `"tilted"`: the ball in play was tilted (R11). It goes dead: `isLive()` is
 *   false, so no kicks, no points and no rollover lights, and nudges are
 *   ignored. The plunger stays live (it is mechanical). The tilt costs only this
 *   ball: when it drains, the next ball is served `"playing"` with the meter
 *   and the warning cleared, the score is kept, and a tilt on the last ball ends
 *   the game.
 *
 * Flipper relay (R11, GAME-03, Open Question 1): the session switches the
 * flippers through a `FlipperGate`. They are off at boot (attract), off on a
 * tilt (both bats drop and presses are ignored), off after the final drain,
 * and on again with every serve (game start and each next ball, tilted or
 * not). The gate owner re-presses a bat whose key is still held when the
 * flippers come back on (Pitfall 5).
 *
 * Wiring (fixed-step seam, never the render frame), carried over from the
 * retired sandbox ball feed:
 * - construct it once, after the controllers, with the router and the
 *   flipper gate;
 * - `onStart()` from the top of a fixed step when the start key latched;
 * - `onNudge(dir)` from the top of a fixed step for each latched nudge key,
 *   then `tick()` once per fixed step (after the game edges);
 * - `service()` from `onPostStep`, right AFTER `router.dispatch()` (and after
 *   `ReactiveElements.service()`, so a queued kick lands before a drained ball
 *   is removed).
 *
 * Nudge (R9, GAME-03): an accepted nudge applies `NUDGE_IMPULSE` along
 * `NUDGE_DIRS[dir]` to every ball through `applyImpulse`, so it changes velocity
 * only and never writes a position (no teleport, no tunneling). It is accepted
 * only while playing and at least `NUDGE_COOLDOWN_STEPS` fixed steps after the
 * last accepted one. Each accepted nudge also feeds the `TiltMeter`: a warning
 * opens a `WARNING_FLASH_STEPS` window read through `isWarning()`, and a tilt
 * enters `"tilted"`. `tick()` decays the meter. Time is the step count
 * advanced by `tick()`, never a wall clock or a random source.
 *
 * The drain is read from the collision bus only (the drain sensor, spec id 600),
 * never from a positional `y > DRAIN_Y` test: the plunger rest position lies
 * BELOW the drain line, so a positional check mistakes the parked ball for a
 * drained one and respawns it every frame (03-REVIEW CR-01). The bus listener
 * only records the drained id; `service()` removes it and serves the next ball
 * after the batch has been delivered (remove-then-add, so exactly one ball ever
 * exists).
 *
 * The score is always an exact, non-negative integer: anything that is not a
 * non-negative safe integer is ignored, and the sum saturates at
 * `Number.MAX_SAFE_INTEGER` so it never loses integer precision.
 *
 * Skill shot (PLSH-05, D-01..D-05): the session composes a pure `SkillShot`.
 * Every serve (game start and each next ball) arms it; `onStart()` first
 * resets its value ladder (a new game). `tick()` feeds it the plunger phase
 * read through `GameSessionOptions.plunger` (default: always idle), so the lit
 * lane rotates on the step clock and freezes while the plunger charges. The
 * session implements `RuleHooks`: `ReactiveElements` reports every registered
 * scoring switch to `onSwitch()`, and the first one after the arm decides the
 * shot (the lit rollover awards through `award()`, anything else disarms). A
 * tilt and game over disarm it. `onSwitch()` only awards and records; the
 * world is still written only in `service()`.
 *
 * Engine-agnostic: type-only imports, talks to the `PhysicsWorld` interface
 * only. Steady state allocates nothing; remove/add run only on a start or drain.
 */

import type { CollisionRouter } from "../app/collision-router";
import type { PlungerController } from "../control/plunger-controller";
import type { BallId, BallSpec, CollisionEvent, PhysicsWorld } from "../physics/types";
import type { RuleHooks, RulesGate, SwitchKind } from "./reactive-elements";
import { SkillShot, type SkillPhase } from "./skill-shot";
import { TiltMeter } from "./tilt-meter";
import {
  NUDGE_COOLDOWN_STEPS,
  NUDGE_DIRS,
  NUDGE_IMPULSE,
  WARNING_FLASH_STEPS,
  type NudgeDir,
} from "./tuning";

/** Balls per game (GAME-02). */
export const BALLS_PER_GAME = 3;

/** Game states. */
export type GameState = "game-over" | "playing" | "tilted";

/** The world slice the session needs. */
export type GameSessionWorld = Pick<
  PhysicsWorld,
  "addBall" | "removeBall" | "getBalls" | "applyImpulse"
>;

/**
 * The flipper relay the session switches: off outside a game and on a tilt,
 * on with every serve. `main.ts` adapts `FlipperController.setEnabled` and
 * re-presses held keys on enable.
 */
export interface FlipperGate {
  setEnabled(enabled: boolean): void;
}

/** The read-only plunger slice the session reads for the skill shot. */
export type SessionPlunger = Pick<PlungerController, "getPhase">;

/** Optional collaborators; every field has a default. */
export interface GameSessionOptions {
  /**
   * The plunger whose phase freezes the skill-shot lane (default: always idle,
   * so the lane never freezes and existing compositions keep compiling).
   */
  readonly plunger?: SessionPlunger;
}

/** Default plunger: always idle. Module-level and frozen, shared by all. */
const IDLE_PLUNGER: SessionPlunger = Object.freeze({
  getPhase: () => "idle" as const,
});

/** `activeBallId` when no ball is in play. */
const NO_BALL: BallId = -1;

export class GameSession implements RulesGate, RuleHooks {
  private readonly world: GameSessionWorld;
  private readonly spawn: BallSpec;
  private readonly flippers: FlipperGate;
  private readonly plunger: SessionPlunger;

  private state: GameState = "game-over";
  private score = 0;
  private ball = 0;
  private played = false;
  private active: BallId = NO_BALL;

  /** Id of the active ball seen on the drain sensor this step, or -1. */
  private drained: BallId = NO_BALL;

  /** Fixed steps since construction, advanced only by `tick()`. */
  private step = 0;

  /** First step at which a nudge is accepted again (the cooldown). */
  private nudgeReadyAtStep = 0;

  /** The tilt bob: fed by accepted nudges, decayed by `tick()`. */
  private readonly tilt = new TiltMeter();

  /** First step at which the WARNING window is over. */
  private warningUntilStep = 0;

  /** The rotating lit-lane skill shot (PLSH-05). */
  private readonly skill = new SkillShot();

  /** Step of the most recent skill-shot award, -1 before any. */
  private lastSkillStep = -1;

  /** Value of the most recent skill-shot award, 0 before any. */
  private lastSkillValue = 0;

  constructor(
    world: GameSessionWorld,
    router: CollisionRouter,
    spawn: BallSpec,
    flippers: FlipperGate,
    options: GameSessionOptions = {},
  ) {
    this.world = world;
    this.spawn = spawn;
    this.flippers = flippers;
    this.plunger = options.plunger ?? IDLE_PLUNGER;
    router.register(this.onEvent);
    this.flippers.setEnabled(false); // boot into attract: the flippers are dead
  }

  /**
   * Start a game, only from game-over: score 0, ball 1, the skill-shot ladder
   * reset, then one ball served (tilt meter and warning cleared, flippers on,
   * skill shot armed). Returns whether a game started; in any other state it
   * returns false and changes nothing.
   */
  onStart(): boolean {
    switch (this.state) {
      case "game-over":
        this.score = 0;
        this.ball = 1;
        this.played = true;
        this.drained = NO_BALL;
        this.skill.reset();
        this.lastSkillStep = -1;
        this.lastSkillValue = 0;
        this.serveBall();
        return true;
      case "playing":
      case "tilted":
        return false;
    }
  }

  /**
   * Handle a drain recorded in this step's batch (while playing or tilted):
   * remove the ball, then serve the next one (tilt cleared, flippers on, skill
   * shot armed), or end the game after the last with the flippers off and the
   * skill shot disarmed. Call once per fixed step, right after
   * `router.dispatch()`. No-op when nothing drained.
   */
  service(): void {
    if (this.drained === NO_BALL) return;
    this.world.removeBall(this.drained);
    this.drained = NO_BALL;
    if (this.ball < BALLS_PER_GAME) {
      this.ball++;
      this.serveBall();
    } else {
      this.state = "game-over";
      this.active = NO_BALL;
      this.flippers.setEnabled(false);
      this.skill.disarm();
    }
  }

  /**
   * Nudge the table: while playing and outside the cooldown, apply
   * `NUDGE_IMPULSE` along `NUDGE_DIRS[dir]` to every ball, then feed the tilt
   * meter (a warning opens the WARNING window, a tilt enters `"tilted"`, drops
   * the flippers and disarms the skill shot).
   * Velocity only, never a position write. Call it at the top of a fixed step
   * (between steps, as the `applyImpulse` contract requires). Ignored in any
   * other state, so a tilted or game-over table neither moves nor fills the meter.
   */
  onNudge(dir: NudgeDir): void {
    if (this.state !== "playing") return;
    if (this.step < this.nudgeReadyAtStep) return; // spam guard
    this.nudgeReadyAtStep = this.step + NUDGE_COOLDOWN_STEPS;
    const d = NUDGE_DIRS[dir];
    const ix = d.x * NUDGE_IMPULSE;
    const iy = d.y * NUDGE_IMPULSE;
    const balls = this.world.getBalls();
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b) this.world.applyImpulse(b.id, ix, iy);
    }
    const outcome = this.tilt.addNudge();
    if (outcome === "warning") this.warningUntilStep = this.step + WARNING_FLASH_STEPS;
    else if (outcome === "tilt") {
      this.state = "tilted";
      this.flippers.setEnabled(false);
      this.skill.disarm();
    }
  }

  /**
   * Advance the session clock by one fixed step, decay the tilt meter and step
   * the skill shot with the plunger phase (read after `plunger.applyEdges`, so
   * a press on this step freezes the lane shown on this step). Call once per
   * fixed step, after the game edges.
   */
  tick(): void {
    this.step++;
    this.tilt.update();
    this.skill.update(this.plunger.getPhase(), false);
  }

  /**
   * Rule hook (`RuleHooks`): a registered scoring switch from
   * `ReactiveElements`, after its own award. The first switch after the arm
   * resolves the skill shot; the lit rollover awards its value through
   * `award()`. Only awards and records; never touches the world.
   */
  onSwitch(kind: SwitchKind, elementId: number): void {
    const v = this.skill.resolve(kind, elementId);
    if (v > 0) {
      this.award(v);
      this.lastSkillStep = this.step;
      this.lastSkillValue = v;
    }
  }

  // Presentation counters: read-only getters that change no behavior.

  /** Fixed steps advanced by `tick()` since construction. */
  getStep(): number {
    return this.step;
  }

  /** The skill-shot phase. */
  getSkillPhase(): SkillPhase {
    return this.skill.getPhase();
  }

  /** The lit skill-shot lane's element id, or -1 when not armed. */
  getSkillLitLane(): number {
    return this.skill.getLitLane();
  }

  /** Skill shots made this game. */
  getSkillShotCount(): number {
    return this.skill.getCount();
  }

  /** Value of the most recent skill shot this game (0 before any). */
  getLastSkillValue(): number {
    return this.lastSkillValue;
  }

  /** `getStep()` at the most recent skill shot this game (-1 before any). */
  getLastSkillStep(): number {
    return this.lastSkillStep;
  }

  /** Lane of the most recent skill shot this game (-1 before any). */
  getLastSkillLane(): number {
    return this.skill.getLastLane();
  }

  /**
   * Whether the HUD shows WARNING: for `WARNING_FLASH_STEPS` steps after a
   * warning edge, and only while playing (a tilt or a serve ends it).
   */
  isWarning(): boolean {
    return this.state === "playing" && this.step < this.warningUntilStep;
  }

  /** The tilt meter level (read-only; for tests and diagnosis). */
  getTiltLevel(): number {
    return this.tilt.getLevel();
  }

  /** The ball in play (the one the plunger launches), or -1. */
  get activeBallId(): BallId {
    return this.active;
  }

  /** The current ball number: 0 before the first game, then 1..BALLS_PER_GAME. */
  getBall(): number {
    return this.ball;
  }

  /** The current state. */
  getState(): GameState {
    return this.state;
  }

  /** Whether a game has ever been started (the HUD's attract line). */
  hasPlayed(): boolean {
    return this.played;
  }

  /**
   * Whether contacts score right now: only while a ball is in play and not
   * tilted, so a tilt kills every rule (kicks, points, lights) at once.
   */
  isLive(): boolean {
    return this.state === "playing";
  }

  /** Add points; ignores invalid input, no-op when not live, saturates. */
  award(points: number): void {
    if (!Number.isSafeInteger(points) || points < 0) return;
    if (!this.isLive()) return;
    const headroom = Number.MAX_SAFE_INTEGER - this.score;
    this.score = points >= headroom ? Number.MAX_SAFE_INTEGER : this.score + points;
  }

  /** The running score (kept after game over until the next start). */
  getScore(): number {
    return this.score;
  }

  /**
   * Serve a ball: tilt cleared, state playing, one ball at the spawn, the
   * flippers on, then the skill shot armed (game start and every next ball).
   */
  private serveBall(): void {
    this.clearTilt();
    this.state = "playing";
    this.active = this.world.addBall(this.spawn);
    this.flippers.setEnabled(true);
    this.skill.arm();
  }

  /** Clear the tilt meter and the WARNING window (a new ball or a new game). */
  private clearTilt(): void {
    this.tilt.reset();
    this.warningUntilStep = 0;
  }

  /** Bus listener, bound once: record the drain, never touch the world here. */
  private readonly onEvent = (e: CollisionEvent): void => {
    if (e.elementKind === "drain" && e.ballId === this.active) this.drained = e.ballId;
  };
}
