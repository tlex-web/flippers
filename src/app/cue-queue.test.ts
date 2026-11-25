import { describe, it, expect } from "vitest";

import { BALL_RADIUS_M, ballMass } from "../physics/constants";
import {
  CUE_KINDS,
  CUE_QUEUE_CAPACITY,
  CueFeedback,
  CueQueue,
  KICK_FLASH_FLOOR,
  KICK_REF_SPEED,
  impulseStrength,
  type FlashSink,
} from "./cue-queue";

/**
 * Contract cases for the cue ring and the rules-to-cue adapter (plan 05-07,
 * T-05-01): the ring is a fixed FIFO of preallocated records that never grows,
 * every strength is clamped, and CueFeedback maps registered hits to cues and
 * floored flashes. D-03: there is no wall or chute cue kind.
 */

const M = ballMass(BALL_RADIUS_M);
/** The impulse that saturates impulseStrength for the game ball. */
const FULL = M * KICK_REF_SPEED;

class SpyFlash implements FlashSink {
  readonly records: [number, number][] = [];
  record(elementId: number, strength: number): void {
    this.records.push([elementId, strength]);
  }
}

describe("CueQueue ring (T-05-01)", () => {
  it("push, size and at are first-in first-out", () => {
    const q = new CueQueue();
    expect(q.size).toBe(0);
    expect(q.push("bumper", 200, 0.1)).toBe(true);
    expect(q.push("slingshot", 300, 0.2)).toBe(true);
    expect(q.push("drain", 600, 0.3)).toBe(true);
    expect(q.size).toBe(3);
    expect(q.at(0)).toEqual({ kind: "bumper", elementId: 200, strength: 0.1 });
    expect(q.at(1)).toEqual({ kind: "slingshot", elementId: 300, strength: 0.2 });
    expect(q.at(2)).toEqual({ kind: "drain", elementId: 600, strength: 0.3 });
    expect(q.at(3)).toBeUndefined();
    expect(q.at(-1)).toBeUndefined();
  });

  it("the 65th push into a default queue returns false, counts a drop and keeps size at 64", () => {
    const q = new CueQueue();
    expect(CUE_QUEUE_CAPACITY).toBe(64);
    for (let i = 0; i < CUE_QUEUE_CAPACITY; i++) expect(q.push("bumper", i, 1)).toBe(true);
    expect(q.dropped).toBe(0);
    expect(q.push("bumper", 64, 1)).toBe(false);
    expect(q.dropped).toBe(1);
    expect(q.size).toBe(64);
    expect(q.at(64)).toBeUndefined();
    // Drop-newest: the oldest 64 are intact.
    expect(q.at(0)?.elementId).toBe(0);
    expect(q.at(63)?.elementId).toBe(63);
  });

  it("clear() resets size but not dropped", () => {
    const q = new CueQueue();
    for (let i = 0; i <= CUE_QUEUE_CAPACITY; i++) q.push("bumper", i, 1);
    expect(q.dropped).toBe(1);
    q.clear();
    expect(q.size).toBe(0);
    expect(q.at(0)).toBeUndefined();
    expect(q.dropped).toBe(1);
  });

  it("records are reused across push/clear cycles (no allocation per push)", () => {
    const q = new CueQueue();
    for (let i = 0; i < CUE_QUEUE_CAPACITY; i++) q.push("bumper", i, 1);
    const first: unknown[] = [];
    for (let i = 0; i < CUE_QUEUE_CAPACITY; i++) first.push(q.at(i));
    for (let cycle = 0; cycle < 3; cycle++) {
      q.clear();
      for (let i = 0; i < CUE_QUEUE_CAPACITY; i++) q.push("lane", 500 + i, 0.5);
      for (let i = 0; i < CUE_QUEUE_CAPACITY; i++) expect(q.at(i)).toBe(first[i]);
    }
    q.clear();
    q.push("tilt", 0, 1);
    expect(q.at(0)).toBe(first[0]);
    expect(q.at(0)?.kind).toBe("tilt");
  });

  it("every stored strength is clamped to [0, 1], NaN as 0", () => {
    const q = new CueQueue();
    q.push("bumper", 1, Number.NaN);
    q.push("bumper", 2, -1);
    q.push("bumper", 3, 2);
    q.push("bumper", 4, 0.4);
    expect(q.at(0)?.strength).toBe(0);
    expect(q.at(1)?.strength).toBe(0);
    expect(q.at(2)?.strength).toBe(1);
    expect(q.at(3)?.strength).toBe(0.4);
  });
});

describe("impulseStrength", () => {
  it("0 maps to 0", () => {
    expect(impulseStrength(0, M)).toBe(0);
  });
  it("m * KICK_REF_SPEED saturates at 1", () => {
    expect(impulseStrength(FULL, M)).toBe(1);
  });
  it("half of the saturating impulse maps to 0.5", () => {
    expect(impulseStrength(FULL / 2, M)).toBeCloseTo(0.5, 12);
  });
  it("negative and NaN map to 0", () => {
    expect(impulseStrength(-FULL, M)).toBe(0);
    expect(impulseStrength(Number.NaN, M)).toBe(0);
  });
  it("a value past saturation maps to 1", () => {
    expect(impulseStrength(FULL * 3, M)).toBe(1);
  });
});

describe("CueFeedback (AUD-01/RND-03)", () => {
  it("onKick pushes the kind, id and impulseStrength and flashes at that strength above the floor", () => {
    const q = new CueQueue();
    const flash = new SpyFlash();
    const fb = new CueFeedback(q, flash);
    fb.onKick("bumper", 202, FULL * 0.8, 0, 0);
    expect(q.size).toBe(1);
    expect(q.at(0)?.kind).toBe("bumper");
    expect(q.at(0)?.elementId).toBe(202);
    expect(q.at(0)?.strength).toBeCloseTo(0.8, 12);
    expect(flash.records).toHaveLength(1);
    expect(flash.records[0]?.[0]).toBe(202);
    expect(flash.records[0]?.[1]).toBeCloseTo(0.8, 12);
  });

  it("a weak kick flashes at exactly KICK_FLASH_FLOOR while its cue keeps the true strength", () => {
    const q = new CueQueue();
    const flash = new SpyFlash();
    const fb = new CueFeedback(q, flash);
    fb.onKick("slingshot", 300, FULL * 0.1, 0, 0);
    expect(q.at(0)?.kind).toBe("slingshot");
    expect(q.at(0)?.strength).toBeCloseTo(0.1, 12);
    expect(flash.records).toEqual([[300, KICK_FLASH_FLOOR]]);
  });

  it("onSensor pushes its kind for a plain pass and bank for the bank pass", () => {
    const q = new CueQueue();
    const fb = new CueFeedback(q, new SpyFlash());
    fb.onSensor("lane", 500, false);
    fb.onSensor("rollover", 400, false);
    fb.onSensor("rollover", 401, true);
    expect([q.at(0)?.kind, q.at(1)?.kind, q.at(2)?.kind]).toEqual(["lane", "rollover", "bank"]);
    expect(q.at(2)?.elementId).toBe(401);
  });

  it("with no flash sink nothing throws and cues are still pushed", () => {
    const q = new CueQueue();
    const fb = new CueFeedback(q);
    expect(() => {
      fb.onKick("bumper", 200, FULL, 0, 0);
      fb.onSensor("rollover", 402, true);
    }).not.toThrow();
    expect(q.size).toBe(2);
  });

  it("CUE_KINDS holds 18 distinct kinds and none is wall or chute (D-03)", () => {
    expect(CUE_KINDS).toHaveLength(18);
    expect(new Set(CUE_KINDS).size).toBe(18);
    const kinds: readonly string[] = CUE_KINDS;
    expect(kinds).not.toContain("wall");
    expect(kinds).not.toContain("chute");
  });
});
