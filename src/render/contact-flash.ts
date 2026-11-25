/**
 * ContactFlash (RND-03, D-03): passive surfaces flash on a real hit.
 *
 * Walls, the chute and the flipper bats are never registered by the rules, so
 * their flashes come straight off the collision bus: a contact of kind wall,
 * chute or flipper at `normalImpulse >= SLING_MIN_IMPULSE` records a flash of
 * `CONTACT_FLASH_PEAK`. The threshold is the slingshot's, which separates a
 * rolling (0.0015) or resting (0.0048) ball from a real hit (0.0393). Every
 * other kind is ignored here: bumpers, slingshots, rollovers and lanes flash
 * only through the rules hook (`CueFeedback`), so a tilted table, a cooldown
 * repeat or a passive sling face never flashes them, and the drain's flash
 * belongs to the drain observer.
 *
 * D-03: this listener holds only a `FlashSink`. It has no cue queue, so a wall
 * flashes but never makes a sound.
 *
 * Bus contract: construct it once at the composition root; the constructor
 * registers the listener. The listener copies scalars out of the pooled record,
 * never retains it, never allocates and never touches the world.
 */

import type { CollisionRouter } from "../app/collision-router";
import type { FlashSink } from "../app/cue-queue";
import { SLING_MIN_IMPULSE } from "../game/tuning";
import type { CollisionEvent } from "../physics/types";
import { CONTACT_FLASH_PEAK } from "./flash";

export class ContactFlash {
  private readonly flash: FlashSink;

  constructor(router: Pick<CollisionRouter, "register">, flash: FlashSink) {
    this.flash = flash;
    router.register(this.onEvent);
  }

  private readonly onEvent = (e: CollisionEvent): void => {
    const kind = e.elementKind;
    if (kind !== "wall" && kind !== "chute" && kind !== "flipper") return;
    const id = e.elementId;
    const impulse = e.normalImpulse;
    // NaN fails this comparison, so a corrupt impulse records nothing.
    if (!(impulse >= SLING_MIN_IMPULSE)) return;
    this.flash.record(id, CONTACT_FLASH_PEAK);
  };
}
