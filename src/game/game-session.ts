/**
 * GameSession: the score state behind the rules gate (GAME-01).
 *
 * Engine-agnostic and world-free: it never touches the physics world, it only
 * decides whether contacts count (`isLive()`) and keeps the running score
 * (`award()`). This plan has no start or game-over yet, so a session is always
 * live; the 3-ball FSM in 04-05 adds those states behind the same
 * `isLive()`/`award()` surface.
 *
 * The score is always an exact, non-negative integer: anything that is not a
 * non-negative safe integer is ignored, and the sum saturates at
 * `Number.MAX_SAFE_INTEGER` so it never loses integer precision.
 */

import type { RulesGate } from "./reactive-elements";

export class GameSession implements RulesGate {
  private score = 0;

  /** Whether contacts score right now. */
  isLive(): boolean {
    return true;
  }

  /** Add points; ignores invalid input and saturates at MAX_SAFE_INTEGER. */
  award(points: number): void {
    if (!Number.isSafeInteger(points) || points < 0) return;
    if (!this.isLive()) return;
    const headroom = Number.MAX_SAFE_INTEGER - this.score;
    this.score = points >= headroom ? Number.MAX_SAFE_INTEGER : this.score + points;
  }

  /** The running score. */
  getScore(): number {
    return this.score;
  }
}
