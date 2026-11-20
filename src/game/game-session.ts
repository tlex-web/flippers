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
 *
 * Wiring (fixed-step seam, never the render frame), carried over from the
 * retired sandbox ball feed:
 * - construct it once, after the controllers, with the router;
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
 * last accepted one. Time is the step count advanced by `tick()`, never a wall
 * clock.
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
 * Engine-agnostic: type-only imports, talks to the `PhysicsWorld` interface
 * only. Steady state allocates nothing; remove/add run only on a start or drain.
 */

import type { CollisionRouter } from "../app/collision-router";
import type { BallId, BallSpec, CollisionEvent, PhysicsWorld } from "../physics/types";
import type { RulesGate } from "./reactive-elements";
import { NUDGE_COOLDOWN_STEPS, NUDGE_DIRS, NUDGE_IMPULSE, type NudgeDir } from "./tuning";

/** Balls per game (GAME-02). */
export const BALLS_PER_GAME = 3;

/** Game states. 04-06 adds `"tilted"`. */
export type GameState = "game-over" | "playing";

/** The world slice the session needs. */
export type GameSessionWorld = Pick<
  PhysicsWorld,
  "addBall" | "removeBall" | "getBalls" | "applyImpulse"
>;

/** `activeBallId` when no ball is in play. */
const NO_BALL: BallId = -1;

export class GameSession implements RulesGate {
  private readonly world: GameSessionWorld;
  private readonly spawn: BallSpec;

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

  constructor(world: GameSessionWorld, router: CollisionRouter, spawn: BallSpec) {
    this.world = world;
    this.spawn = spawn;
    router.register(this.onEvent);
  }

  /**
   * Start a game, only from game-over: score 0, ball 1, and one ball served to
   * the spawn. Returns whether a game started; in any other state it returns
   * false and changes nothing.
   */
  onStart(): boolean {
    switch (this.state) {
      case "game-over":
        this.score = 0;
        this.ball = 1;
        this.played = true;
        this.drained = NO_BALL;
        this.state = "playing";
        this.active = this.world.addBall(this.spawn);
        return true;
      case "playing":
        return false;
    }
  }

  /**
   * Handle a drain recorded in this step's batch: remove the ball, then serve
   * the next one, or end the game after the last. Call once per fixed step,
   * right after `router.dispatch()`. No-op when nothing drained.
   */
  service(): void {
    if (this.drained === NO_BALL) return;
    this.world.removeBall(this.drained);
    this.drained = NO_BALL;
    if (this.ball < BALLS_PER_GAME) {
      this.ball++;
      this.active = this.world.addBall(this.spawn);
    } else {
      this.state = "game-over";
      this.active = NO_BALL;
    }
  }

  /**
   * Nudge the table: while playing and outside the cooldown, apply
   * `NUDGE_IMPULSE` along `NUDGE_DIRS[dir]` to every ball. Velocity only, never
   * a position write. Call it at the top of a fixed step (between steps, as the
   * `applyImpulse` contract requires). Ignored in any other state.
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
  }

  /** Advance the session clock by one fixed step. Call once per fixed step. */
  tick(): void {
    this.step++;
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

  /** Whether contacts score right now: only while a ball is in play. */
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

  /** Bus listener, bound once: record the drain, never touch the world here. */
  private readonly onEvent = (e: CollisionEvent): void => {
    if (e.elementKind === "drain" && e.ballId === this.active) this.drained = e.ballId;
  };
}
