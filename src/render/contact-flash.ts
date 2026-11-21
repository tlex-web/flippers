/**
 * ContactFlash (RND-03, D-03): RED stub. Registers on the bus and records
 * nothing yet; the GREEN commit implements the wall/chute/flipper rule.
 */

import type { CollisionRouter } from "../app/collision-router";
import type { FlashSink } from "../app/cue-queue";
import type { CollisionEvent } from "../physics/types";

export class ContactFlash {
  private readonly flash: FlashSink;

  constructor(router: Pick<CollisionRouter, "register">, flash: FlashSink) {
    this.flash = flash;
    router.register(this.onEvent);
  }

  private readonly onEvent = (e: CollisionEvent): void => {
    void e;
    void this.flash;
  };
}
