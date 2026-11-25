import { describe, it, expect } from "vitest";

import { isRestingInZone, PLUNGER_REST_SPEED_EPS } from "../control/plunger-controller";
import type { BallState } from "../physics/types";
import { PLUNGER_ZONE } from "../table/spec";
import { SkillShot } from "./skill-shot";
import {
  SKILL_SHOT_BASE_POINTS,
  SKILL_SHOT_LANES,
  SKILL_SHOT_MAX_POINTS,
  SKILL_SHOT_ROTATE_STEPS,
  SKILL_SHOT_STEP_POINTS,
} from "./tuning";

/**
 * SkillShot contract (plan 06-01 Task 2, PLSH-05, D-01..D-04): a pure,
 * step-driven rule with no world and no clock. Each `update()` is one fixed
 * step; the lit lane rotates 400 -> 401 -> 402 -> 400 every 72 updates while
 * rotating, freezes while the plunger charges, and reopens from the frozen
 * lane when a weak plunge falls back and rests.
 */

/** Run `n` updates with the plunger idle and the ball not resting. */
function idle(s: SkillShot, n: number): void {
  for (let i = 0; i < n; i++) s.update("idle", false);
}

/** A ball snapshot at (x, y) moving at `speed` m/s along +x. */
function ballAt(x: number, y: number, speed: number): BallState {
  return { id: 1, x, y, vx: speed, vy: 0, radius: 0.2, angle: 0 };
}

const CX = (PLUNGER_ZONE.minX + PLUNGER_ZONE.maxX) / 2;
const CY = (PLUNGER_ZONE.minY + PLUNGER_ZONE.maxY) / 2;

describe("SkillShot rotation (D-01)", () => {
  it("tuning matches D-01/D-04", () => {
    expect(SKILL_SHOT_LANES).toEqual([400, 401, 402]);
    expect(SKILL_SHOT_ROTATE_STEPS).toBe(72);
    expect(SKILL_SHOT_BASE_POINTS).toBe(5000);
    expect(SKILL_SHOT_STEP_POINTS).toBe(5000);
    expect(SKILL_SHOT_MAX_POINTS).toBe(25000);
  });

  it("after arm(), 400 for updates 0..71, 401 for 72..143, 402 for 144..215, 400 again at 216", () => {
    const s = new SkillShot();
    s.arm();
    expect(s.getPhase()).toBe("rotating");
    for (let u = 0; u <= 216; u++) {
      const expected = u < 72 ? 400 : u < 144 ? 401 : u < 216 ? 402 : 400;
      expect(s.getLitLane(), `after ${u} updates`).toBe(expected);
      s.update("idle", false);
    }
  });

  it("a charging update freezes: the lit lane stays put while charging or idle-not-resting", () => {
    const s = new SkillShot();
    s.arm();
    idle(s, 80); // 401 lit
    s.update("charging", false);
    expect(s.getPhase()).toBe("frozen");
    expect(s.getLitLane()).toBe(401);
    for (let i = 0; i < 300; i++) s.update("charging", false);
    idle(s, 300);
    expect(s.getPhase()).toBe("frozen");
    expect(s.getLitLane()).toBe(401);
  });

  it("frozen then idle-and-resting reopens with the same lane; the next change comes 72 updates later", () => {
    const s = new SkillShot();
    s.arm();
    idle(s, 80); // 401 lit
    s.update("charging", false);
    idle(s, 50);
    s.update("idle", true);
    expect(s.getPhase()).toBe("rotating");
    expect(s.getLitLane()).toBe(401);
    idle(s, 71);
    expect(s.getLitLane()).toBe(401);
    s.update("idle", false);
    expect(s.getLitLane()).toBe(402);
  });

  it("a resting ball never arms the shot by itself: off stays off", () => {
    const s = new SkillShot();
    s.update("idle", true);
    expect(s.getPhase()).toBe("off");
    expect(s.getLitLane()).toBe(-1);
  });
});

describe("SkillShot resolution and value ladder (D-03, D-04)", () => {
  it("the lit rollover pays 5000, 10000, 15000, 20000, 25000, 25000 on successive arms", () => {
    const s = new SkillShot();
    const values: number[] = [];
    for (let i = 0; i < 6; i++) {
      s.arm();
      values.push(s.resolve("rollover", s.getLitLane()));
      expect(s.getCount()).toBe(i + 1);
      expect(s.getLastLane()).toBe(400);
    }
    expect(values).toEqual([5000, 10000, 15000, 20000, 25000, 25000]);
    expect(s.getLastValue()).toBe(25000);
  });

  it.each([
    ["rollover", 401],
    ["rollover", 402],
    ["lane", 500],
    ["bumper", 300],
    ["slingshot", 201],
  ] as const)("a first switch %s %i with 400 lit awards 0 and disarms", (kind, id) => {
    const s = new SkillShot();
    s.arm();
    expect(s.resolve(kind, id)).toBe(0);
    expect(s.getPhase()).toBe("off");
    expect(s.getCount()).toBe(0);
    // Off: the lit rollover now does nothing.
    expect(s.resolve("rollover", 400)).toBe(0);
    expect(s.getPhase()).toBe("off");
  });

  it("resolve while off returns 0 and changes nothing", () => {
    const s = new SkillShot();
    s.arm();
    s.resolve("rollover", 400);
    s.disarm();
    expect(s.resolve("rollover", 400)).toBe(0);
    expect(s.getCount()).toBe(1);
    expect(s.getLastValue()).toBe(5000);
    expect(s.getLastLane()).toBe(400);
    expect(s.getPhase()).toBe("off");
  });

  it("disarm() gives off and -1; arm() keeps the count; reset() clears count, lastValue and lastLane", () => {
    const s = new SkillShot();
    s.arm();
    idle(s, 72); // 401
    expect(s.resolve("rollover", 401)).toBe(5000);
    s.arm();
    s.disarm();
    expect(s.getPhase()).toBe("off");
    expect(s.getLitLane()).toBe(-1);
    s.arm();
    expect(s.getCount()).toBe(1);
    expect(s.getLitLane()).toBe(400);
    s.reset();
    expect(s.getCount()).toBe(0);
    expect(s.getLastValue()).toBe(0);
    expect(s.getLastLane()).toBe(-1);
    expect(s.getPhase()).toBe("off");
    s.arm();
    expect(s.resolve("rollover", 400)).toBe(5000);
  });
});

describe("isRestingInZone (shared plunger rest test)", () => {
  it("uses the plunger's 0.05 m/s threshold", () => {
    expect(PLUNGER_REST_SPEED_EPS).toBe(0.05);
  });

  it("a ball centered in PLUNGER_ZONE at 0.049 m/s is resting", () => {
    expect(isRestingInZone(ballAt(CX, CY, 0.049), PLUNGER_ZONE)).toBe(true);
  });

  it("at exactly PLUNGER_REST_SPEED_EPS it is not resting (strict less-than)", () => {
    expect(isRestingInZone(ballAt(CX, CY, PLUNGER_REST_SPEED_EPS), PLUNGER_ZONE)).toBe(false);
  });

  it("outside the zone at rest it is not resting", () => {
    expect(isRestingInZone(ballAt(PLUNGER_ZONE.minX - 0.5, CY, 0), PLUNGER_ZONE)).toBe(false);
    expect(isRestingInZone(ballAt(CX, PLUNGER_ZONE.minY - 0.5, 0), PLUNGER_ZONE)).toBe(false);
  });
});
