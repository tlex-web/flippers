// RED-phase skeleton (plan 03-05 Task 2): the public shape only, so the new
// tests compile and fail on their assertions. Replaced by the GREEN commit.

import type { KeyEventLike } from "./flipper-input";

export interface PlungerEdges {
  readonly press: boolean;
  readonly release: boolean;
  readonly cancel: boolean;
}

export class PlungerInput {
  handleKeyDown(e: KeyEventLike): void {
    void e;
  }
  handleKeyUp(e: KeyEventLike): void {
    void e;
  }
  handleBlur(): void {}
  handleVisibilityChange(hidden: boolean): void {
    void hidden;
  }
  drainEdges(): PlungerEdges {
    return { press: false, release: false, cancel: false };
  }
  attach(): void {}
  detach(): void {}
}
