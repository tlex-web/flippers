import { describe, it, expect } from "vitest";

import {
  BonusCounters,
  BonusTally,
  bonusDurationSteps,
  revealedRowCount,
  rowRevealed,
  rowShownValue,
} from "./bonus";
import {
  BONUS_BANK_UNIT,
  BONUS_ROLLOVER_UNIT,
  BONUS_ROW_STEPS,
  TILT_FORFEIT_HOLD_STEPS,
} from "./tuning";

/**
 * Bonus contracts (plan 06-05 Task 2, PLSH-06, D-11, D-12, D-13): the pure tally
 * schedule (durations, reveal and count-up edges, guards) and the per-ball
 * counters and their itemized snapshot.
 */

describe("bonusDurationSteps (D-12 tally timing)", () => {
  it.each([
    [0, 60],
    [1, 168],
    [2, 216],
    [3, 264],
  ])("%d rows hold for %d steps", (rows, steps) => {
    expect(bonusDurationSteps(rows, false)).toBe(steps);
  });

  it("a forfeit holds TILT_FORFEIT_HOLD_STEPS (120) whatever the rows", () => {
    for (const rows of [0, 1, 2, 3]) {
      expect(bonusDurationSteps(rows, true)).toBe(TILT_FORFEIT_HOLD_STEPS);
      expect(bonusDurationSteps(rows, true)).toBe(120);
    }
  });

  it("is at most 264 steps; out-of-range and non-finite rows clamp", () => {
    expect(bonusDurationSteps(4, false)).toBe(264);
    expect(bonusDurationSteps(-1, false)).toBe(60);
    expect(bonusDurationSteps(Number.NaN, false)).toBe(60);
  });
});

describe("rowRevealed / rowShownValue / revealedRowCount (D-12 schedule edges)", () => {
  it("row i is revealed at elapsed 48 i and not at 48 i - 1", () => {
    expect(rowRevealed(2, 95)).toBe(false);
    expect(rowRevealed(2, 96)).toBe(true);
    expect(rowRevealed(0, 0)).toBe(true);
    expect(rowRevealed(1, BONUS_ROW_STEPS - 1)).toBe(false);
    expect(rowRevealed(1, BONUS_ROW_STEPS)).toBe(true);
  });

  it("a row counts up linearly and reaches its full value at 48 i + 48", () => {
    expect(rowShownValue(3000, 0, 24)).toBe(1500);
    expect(rowShownValue(3000, 0, 48)).toBe(3000);
    expect(rowShownValue(3000, 0, 500)).toBe(3000);
    expect(rowShownValue(3000, 1, 47)).toBe(0);
    expect(rowShownValue(3000, 1, 48)).toBe(0);
    expect(rowShownValue(3000, 1, 72)).toBe(1500);
    expect(rowShownValue(3000, 1, 96)).toBe(3000);
  });

  it("the shown value is rounded to an integer", () => {
    expect(rowShownValue(1000, 0, 1)).toBe(21); // 1000 / 48 = 20.83
  });

  it("a NaN or negative elapsed shows 0 and reveals nothing", () => {
    for (const e of [Number.NaN, -1, Number.NEGATIVE_INFINITY]) {
      expect(rowShownValue(3000, 0, e)).toBe(0);
      expect(rowRevealed(0, e)).toBe(false);
      expect(revealedRowCount(3, e)).toBe(0);
    }
  });

  it("revealedRowCount: (3, 0) = 1, (3, 47) = 1, (3, 48) = 2, (3, 96) = 3, never more than rows", () => {
    expect(revealedRowCount(3, 0)).toBe(1);
    expect(revealedRowCount(3, 47)).toBe(1);
    expect(revealedRowCount(3, 48)).toBe(2);
    expect(revealedRowCount(3, 96)).toBe(3);
    expect(revealedRowCount(3, 1000)).toBe(3);
    expect(revealedRowCount(1, 1000)).toBe(1);
    expect(revealedRowCount(0, 1000)).toBe(0);
  });
});

describe("BonusCounters and BonusTally (D-11 itemized rows)", () => {
  it("two rollovers with the third completing a bank give rollovers 3, banks 1", () => {
    const c = new BonusCounters();
    c.count("rollover", false);
    c.count("rollover", false);
    c.count("rollover", true);
    expect(c.rollovers).toBe(3);
    expect(c.banks).toBe(1);
    expect(c.inlanes).toBe(0);
  });

  it("the snapshot omits zero rows: ROLLOVERS x 3 = 3,000 and BANKS x 1 = 5,000, total 8,000", () => {
    const c = new BonusCounters();
    c.count("rollover", false);
    c.count("rollover", false);
    c.count("rollover", true);
    const t = new BonusTally();
    t.snapshot(c);
    expect(t.rows).toBe(2);
    expect(t.kinds.slice(0, t.rows)).toEqual(["rollovers", "banks"]);
    expect(t.counts.slice(0, t.rows)).toEqual([3, 1]);
    expect(t.values.slice(0, t.rows)).toEqual([3 * BONUS_ROLLOVER_UNIT, BONUS_BANK_UNIT]);
    expect(t.values.slice(0, t.rows)).toEqual([3000, 5000]);
    expect(t.total).toBe(8000);
    expect(t.forfeit).toBe(false);
  });

  it("rows keep the order ROLLOVERS, INLANES, BANKS", () => {
    const c = new BonusCounters();
    c.count("lane", false);
    c.count("rollover", true);
    const t = new BonusTally();
    t.snapshot(c);
    expect(t.rows).toBe(3);
    expect(t.kinds).toEqual(["rollovers", "inlanes", "banks"]);
    expect(t.values).toEqual([1000, 2000, 5000]);
    expect(t.total).toBe(8000);
  });

  it("bumper and slingshot switches never count", () => {
    const c = new BonusCounters();
    c.count("bumper", true);
    c.count("slingshot", true);
    c.count("bumper", false);
    expect(c.rollovers).toBe(0);
    expect(c.inlanes).toBe(0);
    expect(c.banks).toBe(0);
    const t = new BonusTally();
    t.snapshot(c);
    expect(t.rows).toBe(0);
    expect(t.total).toBe(0);
  });

  it("reset zeroes every counter", () => {
    const c = new BonusCounters();
    c.count("rollover", true);
    c.count("lane", false);
    c.reset();
    expect([c.rollovers, c.inlanes, c.banks]).toEqual([0, 0, 0]);
  });

  it("a forfeit has zero rows and total 0; the next snapshot clears it; the arrays are reused", () => {
    const c = new BonusCounters();
    c.count("rollover", false);
    const t = new BonusTally();
    const { kinds, counts, values } = t;
    t.snapshot(c);
    t.markForfeit();
    expect(t.forfeit).toBe(true);
    expect(t.rows).toBe(0);
    expect(t.total).toBe(0);
    t.snapshot(c);
    expect(t.forfeit).toBe(false);
    expect(t.total).toBe(1000);
    t.markForfeit();
    t.clearForfeit();
    expect(t.forfeit).toBe(false);
    expect(t.kinds).toBe(kinds);
    expect(t.counts).toBe(counts);
    expect(t.values).toBe(values);
    expect(t.kinds).toHaveLength(3);
  });
});
