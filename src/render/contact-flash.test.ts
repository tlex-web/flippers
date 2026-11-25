import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { CueFeedback, CueQueue, type FlashSink } from "../app/cue-queue";
import { ReactiveElements, type ReactiveWorld, type RulesGate } from "../game/reactive-elements";
import { SLING_MIN_IMPULSE } from "../game/tuning";
import type { BallState, CollisionEvent, CollisionPartnerKind } from "../physics/types";
import { resolve } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";
import { ContactFlash } from "./contact-flash";
import { CONTACT_FLASH_PEAK, FLASH_CONTACT, FlashTracker, maxElementId } from "./flash";

/**
 * ContactFlash contract (plan 05-04 Task 2, RND-03, D-03, T-05-13): passive
 * surfaces (wall, chute, flipper) flash on a real hit at or above
 * SLING_MIN_IMPULSE, and nothing else does. Scripted batches go through a REAL
 * CollisionRouter over a fake drainEvents source, as in reactive-elements.test.
 */

/** A FlashSink that logs every record call as "id@strength". */
class SpySink implements FlashSink {
  private readonly log: string[] = [];
  record(elementId: number, strength: number): void {
    this.log.push(`${elementId}@${strength}`);
  }
  /** Every record call so far, space-separated (one line, so reports stay flat). */
  get records(): string {
    return this.log.join(" ");
  }
}

/** The expected log for a peak contact flash on each id, in order. */
function peaks(...ids: number[]): string {
  return ids.map((id) => `${id}@${CONTACT_FLASH_PEAK}`).join(" ");
}

function ev(
  elementKind: CollisionPartnerKind,
  elementId: number,
  normalImpulse: number,
): CollisionEvent {
  return {
    type:
      elementKind === "ball"
        ? "ball-ball"
        : elementKind === "flipper"
          ? "ball-flipper"
          : "ball-wall",
    ballId: 0,
    elementKind,
    elementId,
    point: { x: 0, y: 0 },
    normalImpulse,
  };
}

interface Bus {
  readonly router: CollisionRouter;
  /** One dispatch of `batch` through the router. */
  step(batch: CollisionEvent[]): void;
}

function makeBus(): Bus {
  let pending: CollisionEvent[] = [];
  const router = new CollisionRouter({
    drainEvents(): CollisionEvent[] {
      const out = pending;
      pending = [];
      return out;
    },
  });
  return {
    router,
    step(batch) {
      pending = batch;
      router.dispatch();
    },
  };
}

function rig(): { bus: Bus; sink: SpySink } {
  const bus = makeBus();
  const sink = new SpySink();
  new ContactFlash(bus.router, sink);
  return { bus, sink };
}

describe("ContactFlash passive-surface rule (RND-03)", () => {
  it("a wall hit at 0.0393 records (100, CONTACT_FLASH_PEAK)", () => {
    const { bus, sink } = rig();
    bus.step([ev("wall", 100, 0.0393)]);
    expect(sink.records).toBe(peaks(100));
  });

  it("a hit at exactly SLING_MIN_IMPULSE records (inclusive threshold)", () => {
    const { bus, sink } = rig();
    bus.step([ev("wall", 100, SLING_MIN_IMPULSE)]);
    expect(sink.records).toBe(peaks(100));
  });

  it("rolling (0.0015) and resting (0.0048) contacts record nothing", () => {
    const { bus, sink } = rig();
    bus.step([ev("wall", 100, 0.0015), ev("wall", 100, 0.0048)]);
    expect(sink.records).toBe("");
  });

  it("a NaN impulse records nothing", () => {
    const { bus, sink } = rig();
    bus.step([ev("wall", 100, Number.NaN)]);
    expect(sink.records).toBe("");
  });

  it("chute (110) and flipper (0 and 1) hits record like walls", () => {
    const { bus, sink } = rig();
    bus.step([ev("chute", 110, 0.05), ev("flipper", 0, 0.05), ev("flipper", 1, 0.05)]);
    expect(sink.records).toBe(peaks(110, 0, 1));
  });

  it("bumper, slingshot, rollover, lane, drain and ball events never record, however hard", () => {
    const { bus, sink } = rig();
    bus.step([
      ev("bumper", 202, 0.5),
      ev("slingshot", 300, 0.5),
      ev("rollover", 400, 0.5),
      ev("lane", 500, 0.5),
      ev("drain", 600, 0.5),
      ev("ball", 1, 0.5),
    ]);
    expect(sink.records).toBe("");
  });

  it("copies scalars out of the pooled record: mutating it after dispatch changes nothing recorded", () => {
    const { bus, sink } = rig();
    const e = { ...ev("wall", 100, 0.05) };
    bus.step([e]);
    (e as { elementId: number }).elementId = 151;
    (e as { normalImpulse: number }).normalImpulse = 0;
    expect(sink.records).toBe(peaks(100));
  });
});

describe("D-03: a wall contact flashes but makes no sound", () => {
  it("a wall hit at 0.05 through a real router leaves a flash on id 100 and an empty cue queue", () => {
    const bus = makeBus();
    const elements = resolve(TABLE_SPEC);
    const world: ReactiveWorld = {
      getElements: () => elements,
      getBalls: (): readonly BallState[] => [],
      applyImpulse: () => {},
    };
    const gate: RulesGate = { isLive: () => true, award: () => {} };
    const cues = new CueQueue();
    const flash = new FlashTracker(maxElementId(elements));
    const reactive = new ReactiveElements(world, bus.router, gate, new CueFeedback(cues, flash));
    new ContactFlash(bus.router, flash);

    bus.step([ev("wall", 100, 0.05)]);
    reactive.service();

    expect(flash.level(100, 0, FLASH_CONTACT)).toBeCloseTo(CONTACT_FLASH_PEAK, 12);
    expect(cues.size).toBe(0);
  });
});
