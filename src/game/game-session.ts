/**
 * GameSession (RED skeleton, plan 04-01 Task 2): the surface only, so the score
 * contract tests load and fail on their assertions. Implemented in GREEN.
 */

import type { RulesGate } from "./reactive-elements";

export class GameSession implements RulesGate {
  isLive(): boolean {
    return false;
  }

  award(points: number): void {
    void points;
  }

  getScore(): number {
    return 0;
  }
}
