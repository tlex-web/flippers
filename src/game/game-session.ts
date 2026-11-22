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
 * - `"bonus"`: the ball in play drained and the end-of-ball bonus is being
 *   tallied (PLSH-06, D-12). No ball on the table, `activeBallId` is -1, the
 *   flippers are off and nothing scores (`isLive()` is false). The tally holds
 *   for `bonusDurationSteps(rows, forfeit)` counted fixed steps; a flipper press
 *   latched on a fixed step (`onFlipperPress()`) ends it on the next
 *   `service()`, except a tilt forfeit's fixed hold. When it ends the bonus is
 *   credited (none for a forfeit) and the next ball is served, or the game
 *   ends after the last ball.
 *
 * Flipper relay (R11, GAME-03, Open Question 1): the session switches the
 * flippers through a `FlipperGate`. They are off at boot (attract), off on a
 * tilt (both bats drop and presses are ignored), off at every drain (the bonus
 * tally) and after the final ball, and on again with every serve (game start
 * and each next ball, tilted or not). The gate owner re-presses a bat whose key
 * is still held when the flippers come back on (Pitfall 5).
 *
 * End-of-ball bonus (PLSH-06, D-11..D-13): `onSwitch()` feeds per-ball
 * `BonusCounters` (rollovers, inlanes, completed banks), reset on every serve.
 * A drain snapshots them into one `BonusTally` (a tilted drain is a forfeit
 * with zero rows) and enters `"bonus"`. The credit goes through a private
 * `credit()` that keeps `award()`'s non-negative safe-integer, saturating guard
 * but not its `isLive()` gate, so it is never dropped in `"bonus"` (research
 * Pitfall 1); `award()` itself stays a no-op outside playing.
 *
 * Wiring (fixed-step seam, never the render frame), carried over from the
 * retired sandbox ball feed:
 * - construct it once, after the controllers, with the router and the
 *   flipper gate;
 * - `onStart()` from the top of a fixed step when the start key latched;
 * - `onNudge(dir)` from the top of a fixed step for each latched nudge key,
 *   then `tick()` once per fixed step (after the game edges);
 * - `onFlipperPress()` from the top of a fixed step when a flipper press edge
 *   latched (skips the bonus tally; ignored outside `"bonus"`);
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
 * enters `"tilted"`. Accepted nudges are counted for presentation
 * (`getNudgeCount()`, `getLastNudgeDir()`). `tick()` decays the meter. Time is the step count
 * advanced by `tick()`, never a wall clock or a random source.
 *
 * The drain is read from the collision bus only (the drain sensor, spec id 600),
 * never from a positional `y > DRAIN_Y` test: the plunger rest position lies
 * BELOW the drain line, so a positional check mistakes the parked ball for a
 * drained one and respawns it every frame (03-REVIEW CR-01). The bus listener
 * only records the drained id; `service()` removes it after the batch has been
 * delivered and, once the bonus tally ends, serves the next ball
 * (remove-then-add, so at most one ball ever exists).
 *
 * The score is always an exact, non-negative integer: anything that is not a
 * non-negative safe integer is ignored, and the sum saturates at
 * `Number.MAX_SAFE_INTEGER` so it never loses integer precision.
 *
 * Skill shot (PLSH-05, D-01..D-05): the session composes a pure `SkillShot`.
 * Every serve (game start and each next ball) arms it; `onStart()` first
 * resets its value ladder (a new game). `tick()` feeds it the plunger phase
 * read through `GameSessionOptions.plunger` (default: always idle), so the lit
 * lane rotates on the step clock and freezes while the plunger charges. A weak
 * plunge that falls back and rests in `PLUNGER_ZONE` with the plunger idle
 * (the shared `isRestingInZone` test) reopens the rotation. The
 * session implements `RuleHooks`: `ReactiveElements` reports every registered
 * scoring switch to `onSwitch()`, and the first one after the arm decides the
 * shot (the lit rollover awards through `award()`, anything else disarms). A
 * tilt and game over disarm it. `onSwitch()` only awards and records; the
 * world is still written only in `service()`.
 *
 * Inlane flags (D-21): a "lane" switch while playing records its element id
 * for this ball, read through `isInlaneScored(id)` (the inlane arrow lamps).
 * Every serve clears them. A backstop re-serve (06-07) is the same ball and
 * does not clear them.
 *
 * Ball save (PLSH-07, D-08..D-10): the session composes a pure `BallSave`
 * (window `GameSessionOptions.ballSaveSteps`, default `BALL_SAVE_STEPS`; 0
 * disables it). Every serve arms it; `tick()` feeds it the active ball's x, so
 * the timer starts on the chute exit. While it runs, a drain of the active ball
 * is a backstop save: the ball is removed and a new one served to the plunger
 * through the private `reServe()`, with the same ball number, state playing
 * and the flippers on. That is the same ball (research A3): the bonus
 * counters, inlane flags, tilt meter and skill shot carry over and the save is
 * not re-armed, so it is one save per ball. `trySave(ballId)` spends the save
 * as a kickback (the 06-08 center post); a drain on the very step of a
 * kickback is kept as a backstop re-serve that counts once, as the kickback
 * (research A4). A tilt, the bonus state and game over disarm it.
 *
 * High score (PLSH-08, D-15, research Open Question 3): the session submits
 * the final score to its `HighScoreSink` (`GameSessionOptions.highScore`,
 * default an in-memory `HighScore(null)`) exactly once, when the last ball's
 * tally ends, after the credit and before entering game-over. Nothing is
 * submitted during play or the bonus state. `isNewBest()` and
 * `getNewBestCount()` record a new best, `getGameOverStep()` records when, and
 * `onStart()` clears `isNewBest()`.
 *
 * Engine-agnostic: no engine import, talks to the `PhysicsWorld` interface
 * only. Steady state allocates nothing; remove/add run only on a start or drain.
 */

import type { CollisionRouter } from "../app/collision-router";
import {
  isRestingInZone,
  type PlungerController,
  type PlungerPhase,
} from "../control/plunger-controller";
import type { BallId, BallSpec, CollisionEvent, PhysicsWorld } from "../physics/types";
import { PLUNGER_ZONE } from "../table/spec";
import { BallSave, type SaveKind, type SaveLampPhase } from "./ball-save";
import { BonusCounters, BonusTally, bonusDurationSteps } from "./bonus";
import { HighScore, type HighScoreSink } from "./high-score";
import type { RuleHooks, RulesGate, SwitchKind } from "./reactive-elements";
import { SkillShot, type SkillPhase } from "./skill-shot";
import { TiltMeter } from "./tilt-meter";
import {
  BALL_SAVE_STEPS,
  NUDGE_COOLDOWN_STEPS,
  NUDGE_DIRS,
  NUDGE_IMPULSE,
  WARNING_FLASH_STEPS,
  type NudgeDir,
} from "./tuning";

/** Balls per game (GAME-02). */
export const BALLS_PER_GAME = 3;

/** Game states. */
export type GameState = "game-over" | "playing" | "tilted" | "bonus";

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
  /**
   * Ball-save window in fixed steps once the ball clears the chute (default
   * `BALL_SAVE_STEPS`; 0 disables the save). Legacy FSM tests whose spy balls
   * sit at x = 0 pass 0 explicitly; the live game uses the default.
   */
  readonly ballSaveSteps?: number;
  /**
   * The best score (PLSH-08): submitted once when the game ends (default an
   * in-memory `HighScore(null)`, so the session stays storage-free and
   * deterministic). `main.ts` injects one over the guarded localStorage.
   */
  readonly highScore?: HighScoreSink;
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

  /** The plunger phase `tick()` saw on the previous step. */
  private prevPlungerPhase: PlungerPhase = "idle";

  /**
   * Lane (inlane) ids that scored on this ball, reused: cleared with
   * `length = 0` in `serveBall()`, at most one entry per inlane.
   */
  private readonly scoredLanes: number[] = [];

  /** This ball's bonus counters (D-11), reset on every serve. */
  private readonly bonusCounters = new BonusCounters();

  /** The tally of the most recent drain, overwritten in place. */
  private readonly tally = new BonusTally();

  /** `step` at the drain that entered `"bonus"`. */
  private bonusStartStep = 0;

  /** First step at which the bonus tally ends. */
  private bonusEndsAt = 0;

  /** A flipper press latched during `"bonus"`: end the tally on the next service. */
  private skipRequested = false;

  /** Drains of the active ball since construction (presentation counter). */
  private drainCount = 0;

  /** Accepted nudges since construction (presentation counter). */
  private nudgeCount = 0;

  /** Direction of the most recent accepted nudge ("left" before any). */
  private lastNudgeDir: NudgeDir = "left";

  /** The timed ball save (PLSH-07). */
  private readonly save: BallSave;

  /** Saves since construction, kickback or backstop (presentation counter). */
  private saveCount = 0;

  /** How the most recent save was spent ("none" before any). */
  private lastSaveKind: SaveKind | "none" = "none";

  /** `step` at the most recent save, -1 before any. */
  private lastSaveStep = -1;

  /** `step` of a kickback spent by `trySave()`, -1 once used or before any. */
  private savedAtStep = -1;

  /** The best score, submitted once per game at game over (PLSH-08). */
  private readonly highScore: HighScoreSink;

  /** Whether the game that just ended set a new best (cleared by `onStart()`). */
  private newBest = false;

  /** New bests since construction (presentation counter: the fanfare). */
  private newBestCount = 0;

  /** `step` at the most recent game over, -1 before any. */
  private gameOverStep = -1;

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
    this.save = new BallSave(options.ballSaveSteps ?? BALL_SAVE_STEPS);
    this.highScore = options.highScore ?? new HighScore(null);
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
        this.newBest = false;
        this.drained = NO_BALL;
        this.savedAtStep = -1;
        this.skill.reset();
        this.lastSkillStep = -1;
        this.lastSkillValue = 0;
        this.serveBall();
        return true;
      case "playing":
      case "tilted":
      case "bonus":
        return false;
    }
  }

  /**
   * Call once per fixed step, right after `router.dispatch()`.
   *
   * A drain recorded while playing with the ball save running, or on the step
   * a kickback spent it, is a backstop save: the ball is removed and re-served
   * to the plunger (`reServe()`), costing no ball. Otherwise, a drain recorded in this step's batch (while playing or tilted) removes the
   * ball and enters `"bonus"`: the counters are snapshotted into the tally (a
   * tilted ball is a forfeit with zero rows), the tally is timed to end at
   * `step + bonusDurationSteps(...)`, the skill shot is disarmed and the
   * flippers go off.
   *
   * While in `"bonus"`, the tally ends at the first service where
   * `step >= bonusEndsAt`, or where a flipper press was latched (not for a
   * forfeit). Then the bonus is credited (none for a forfeit) and the next ball
   * is served (tilt cleared, counters reset, flippers on, skill shot armed), or,
   * after the last ball, the game ends with the flippers off.
   *
   * No-op otherwise.
   */
  service(): void {
    if (this.state === "bonus") {
      const forfeit = this.tally.forfeit;
      if (this.step >= this.bonusEndsAt || (this.skipRequested && !forfeit)) this.endBonus();
      return;
    }
    if (this.drained === NO_BALL) return;
    if (this.state === "playing" && (this.save.canSave() || this.savedAtStep === this.step)) {
      this.backstop();
      return;
    }
    this.world.removeBall(this.drained);
    this.drained = NO_BALL;
    this.drainCount++;
    this.save.disarm();
    if (this.state === "tilted") this.tally.markForfeit();
    else this.tally.snapshot(this.bonusCounters);
    this.active = NO_BALL;
    this.bonusStartStep = this.step;
    this.bonusEndsAt = this.step + bonusDurationSteps(this.tally.rows, this.tally.forfeit);
    this.skipRequested = false;
    this.skill.disarm();
    this.state = "bonus";
    this.flippers.setEnabled(false);
  }

  /**
   * The backstop save (D-08): remove the drained ball and re-serve the same
   * ball to the plunger. Spends the save as a backstop, unless a kickback
   * already spent it on this very step (then it counts once, as the kickback).
   */
  private backstop(): void {
    this.world.removeBall(this.drained);
    this.drained = NO_BALL;
    this.drainCount++;
    if (this.savedAtStep !== this.step && this.save.consume("backstop")) {
      this.saveCount++;
      this.lastSaveKind = "backstop";
      this.lastSaveStep = this.step;
    }
    this.savedAtStep = -1;
    this.reServe();
  }

  /**
   * End the tally: credit it (unless forfeit), then serve or end the game.
   * Ending the game submits the final score to the high score exactly once,
   * after the credit and before entering game-over (research Open Question 3).
   */
  private endBonus(): void {
    this.skipRequested = false;
    if (!this.tally.forfeit) this.credit(this.tally.total);
    if (this.ball < BALLS_PER_GAME) {
      this.ball++;
      this.serveBall();
    } else {
      this.newBest = this.highScore.submit(this.score);
      if (this.newBest) this.newBestCount++;
      this.gameOverStep = this.step;
      this.state = "game-over";
      this.active = NO_BALL;
      this.flippers.setEnabled(false);
      this.skill.disarm();
      this.save.disarm();
    }
  }

  /**
   * A flipper press latched at the top of a fixed step: during `"bonus"` it
   * ends the tally on the next `service()` (a forfeit's hold ignores it). Does
   * nothing in any other state, so a press while playing never shortens a later
   * tally.
   */
  onFlipperPress(): void {
    if (this.state === "bonus") this.skipRequested = true;
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
    this.nudgeCount++;
    this.lastNudgeDir = dir;
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
      this.save.disarm();
    }
  }

  /**
   * Advance the session clock by one fixed step, decay the tilt meter, step
   * the skill shot with the plunger phase (read after `plunger.applyEdges`, so
   * a press on this step freezes the lane shown on this step) and step the ball
   * save with the active ball's x (the chute-exit test). Call once per fixed
   * step, after the game edges.
   */
  tick(): void {
    this.step++;
    this.tilt.update();
    const phase = this.plunger.getPhase();
    // The ball snapshot is from the end of the previous world step, i.e. from
    // BEFORE this step's plunger edges. On the step the plunger leaves
    // "charging" (the release that may have just launched the ball) it still
    // shows the ball at rest, and counting that would reopen the rotation under
    // a ball that is leaving. So the rest test only counts once the plunger was
    // already idle on the previous step.
    const resting =
      phase === "idle" && this.prevPlungerPhase === "idle" && this.activeRestingInZone();
    this.prevPlungerPhase = phase;
    this.skill.update(phase, resting);
    this.save.update(this.activeBallX());
  }

  /** The active ball's x, or NaN with no ball (which never starts the save). */
  private activeBallX(): number {
    if (this.active === NO_BALL) return Number.NaN;
    const balls = this.world.getBalls();
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b && b.id === this.active) return b.x;
    }
    return Number.NaN;
  }

  /** Whether the ball in play is resting in the plunger zone (false with no ball). */
  private activeRestingInZone(): boolean {
    if (this.active === NO_BALL) return false;
    const balls = this.world.getBalls();
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b && b.id === this.active) return isRestingInZone(b, PLUNGER_ZONE);
    }
    return false;
  }

  /**
   * Rule hook (`RuleHooks`): a registered scoring switch from
   * `ReactiveElements`, after its own award. The first switch after the arm
   * resolves the skill shot; the lit rollover awards its value through
   * `award()`. It also feeds this ball's bonus counters (`bank`: the rollover
   * completed the 3-lit bank). Only awards and records; never touches the world.
   */
  onSwitch(kind: SwitchKind, elementId: number, bank = false): void {
    if (kind === "lane" && this.state === "playing" && !this.scoredLanes.includes(elementId)) {
      this.scoredLanes.push(elementId);
    }
    if (this.state === "playing") this.bonusCounters.count(kind, bank);
    const v = this.skill.resolve(kind, elementId);
    if (v > 0) {
      this.award(v);
      this.lastSkillStep = this.step;
      this.lastSkillValue = v;
    }
  }

  /**
   * Spend the ball save as a kickback (the 06-08 center post, through
   * `RuleHooks`). Returns true only while playing, for the active ball, with
   * the save timer running; otherwise returns false and changes nothing. A
   * drain of the same ball on this step is then kept as a backstop re-serve
   * that does not count again (research A4).
   */
  trySave(ballId: BallId): boolean {
    if (this.state !== "playing" || ballId === NO_BALL || ballId !== this.active) return false;
    if (!this.save.consume("kickback")) return false;
    this.saveCount++;
    this.lastSaveKind = "kickback";
    this.lastSaveStep = this.step;
    this.savedAtStep = this.step;
    return true;
  }

  // Presentation counters: read-only getters that change no behavior.

  /** The best score (stored, or the best submitted since boot). */
  getBest(): number {
    return this.highScore.getBest();
  }

  /** Whether the game that just ended set a new best (false again after `onStart()`). */
  isNewBest(): boolean {
    return this.newBest;
  }

  /** New bests since construction (one per game at most). */
  getNewBestCount(): number {
    return this.newBestCount;
  }

  /** `getStep()` at the most recent game over (-1 before any). */
  getGameOverStep(): number {
    return this.gameOverStep;
  }

  /** Saves since construction, kickback or backstop. */
  getSaveCount(): number {
    return this.saveCount;
  }

  /** How the most recent save was spent ("none" before any). */
  getLastSaveKind(): SaveKind | "none" {
    return this.lastSaveKind;
  }

  /** `getStep()` at the most recent save (-1 before any). */
  getLastSaveStep(): number {
    return this.lastSaveStep;
  }

  /** The save lamp: the `BallSave` phase while playing, off in any other state. */
  getSaveLampPhase(): SaveLampPhase {
    return this.state === "playing" ? this.save.lampPhase() : "off";
  }

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
   * Drains of the active ball since construction (a stray id never counts). A
   * backstop save counts too: the ball did drain (06-06 keys the drain cue on it).
   */
  getDrainCount(): number {
    return this.drainCount;
  }

  /** Accepted nudges since construction. */
  getNudgeCount(): number {
    return this.nudgeCount;
  }

  /** Direction of the most recent accepted nudge ("left" before any). */
  getLastNudgeDir(): NudgeDir {
    return this.lastNudgeDir;
  }

  /** Fixed steps since the drain that entered `"bonus"`; 0 in any other state. */
  getBonusElapsed(): number {
    return this.state === "bonus" ? this.step - this.bonusStartStep : 0;
  }

  /** The most recent drain's tally (read-only; overwritten on the next drain). */
  getBonusTally(): Readonly<BonusTally> {
    return this.tally;
  }

  /** The most recent drain's bonus total (0 for a forfeit). */
  getBonusTotal(): number {
    return this.tally.total;
  }

  /** Whether the bonus tally in progress is a tilt forfeit (false outside `"bonus"`). */
  isBonusForfeit(): boolean {
    return this.state === "bonus" && this.tally.forfeit;
  }

  /** Whether the inlane `elementId` scored on this ball (cleared on every serve). */
  isInlaneScored(elementId: number): boolean {
    return this.scoredLanes.includes(elementId);
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
    this.addPoints(points);
  }

  /**
   * Credit the bonus: `award()`'s guard without the `isLive()` gate, so it is
   * never dropped in `"bonus"` (research Pitfall 1). Ignores invalid input,
   * saturates.
   */
  private credit(points: number): void {
    if (!Number.isSafeInteger(points) || points < 0) return;
    this.addPoints(points);
  }

  /** Add a validated non-negative safe integer, saturating at MAX_SAFE_INTEGER. */
  private addPoints(points: number): void {
    const headroom = Number.MAX_SAFE_INTEGER - this.score;
    this.score = points >= headroom ? Number.MAX_SAFE_INTEGER : this.score + points;
  }

  /** The running score (kept after game over until the next start). */
  getScore(): number {
    return this.score;
  }

  /**
   * Serve a ball: tilt cleared, inlane flags cleared, state playing, one ball
   * at the spawn, the flippers on, then the skill shot and the ball save armed
   * (game start and every next ball). A backstop re-serve of the same ball
   * goes through `reServe()` instead, or it would clear the inlane flags.
   */
  private serveBall(): void {
    this.clearTilt();
    this.scoredLanes.length = 0;
    this.bonusCounters.reset();
    this.skipRequested = false;
    this.state = "playing";
    this.active = this.world.addBall(this.spawn);
    this.flippers.setEnabled(true);
    this.skill.arm();
    this.save.arm();
  }

  /**
   * Re-serve the same ball after a backstop save: only a new ball at the spawn,
   * made active. State stays playing and the flippers stay on; the counters,
   * inlane flags, tilt meter and skill shot are untouched and the save is not
   * re-armed (research A3).
   */
  private reServe(): void {
    this.active = this.world.addBall(this.spawn);
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
