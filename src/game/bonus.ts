/**
 * Bonus: the end-of-ball bonus counters, tally and tally schedule (plan 06-05,
 * PLSH-06, D-11, D-12, D-13).
 *
 * A pure module: no world, no clock, no random source. Time is the number of
 * elapsed fixed steps passed in by the caller, so a replay of the same switches
 * on the same steps gives the same tally and the same timing.
 *
 * Counters (D-11): `BonusCounters.count()` is fed from `RuleHooks.onSwitch`,
 * which `ReactiveElements` calls only for registered, live hits. A rollover adds
 * a rollover and, when it completed the bank of 3, a bank; a lane adds an
 * inlane; bumpers and slingshots never count. The session resets the counters on
 * every serve, so they never carry between balls. No multiplier (BONUS-01 v2).
 *
 * Tally (D-11): `BonusTally.snapshot()` copies the counters into at most three
 * rows, in the order ROLLOVERS, INLANES, BANKS, keeping only rows with n >= 1,
 * each worth n * its unit, and sums the TOTAL. A tilted ball's tally is a
 * forfeit (`markForfeit()`): zero rows, total 0 (D-13).
 *
 * Schedule (D-12, UI-SPEC tally timing), all closed-form in the elapsed steps:
 * - row i is revealed at elapsed `BONUS_ROW_STEPS * i` (`rowRevealed`);
 * - its shown value is `round(value * min(1, (elapsed - 48 i) / 48))`, so it
 *   reaches the full value at `48 i + 48` (`rowShownValue`);
 * - the tally lasts `48 * rows + BONUS_TOTAL_HOLD_STEPS`, or
 *   `BONUS_EMPTY_HOLD_STEPS` with no rows, or `TILT_FORFEIT_HOLD_STEPS` for a
 *   forfeit (`bonusDurationSteps`): 60, 168, 216, 264 steps for 0..3 rows.
 * A non-finite or negative elapsed reveals nothing and shows 0.
 *
 * Allocation-free after construction: the tally's arrays are preallocated at
 * length 3 and overwritten in place.
 */

import type { SwitchKind } from "./reactive-elements";
import {
  BONUS_BANK_UNIT,
  BONUS_EMPTY_HOLD_STEPS,
  BONUS_INLANE_UNIT,
  BONUS_ROLLOVER_UNIT,
  BONUS_ROW_STEPS,
  BONUS_TOTAL_HOLD_STEPS,
  TILT_FORFEIT_HOLD_STEPS,
} from "./tuning";

/** A tally row's kind, in display order. */
export type BonusRowKind = "rollovers" | "inlanes" | "banks";

/** The most rows a tally can have (one per kind). */
export const BONUS_MAX_ROWS = 3;

/** Per-ball bonus counters, fed by the rule hook. */
export class BonusCounters {
  /** Rollover passes this ball. */
  rollovers = 0;
  /** Inlane passes this ball. */
  inlanes = 0;
  /** Completed banks of 3 rollovers this ball. */
  banks = 0;

  /** Zero every counter (every serve and every new game). */
  reset(): void {
    this.rollovers = 0;
    this.inlanes = 0;
    this.banks = 0;
  }

  /**
   * Count one live registered switch: a rollover (plus a bank when `bank` is
   * true, i.e. it completed the 3-lit bank), or a lane. Bumpers and slingshots
   * add nothing.
   */
  count(kind: SwitchKind, bank: boolean): void {
    switch (kind) {
      case "rollover":
        this.rollovers++;
        if (bank) this.banks++;
        return;
      case "lane":
        this.inlanes++;
        return;
      case "bumper":
      case "slingshot":
        return;
    }
  }
}

/** One ball's itemized bonus, snapshotted from the counters on the drain. */
export class BonusTally {
  /** Number of included rows (0..3); entries past it are stale. */
  rows = 0;
  /** Row kinds, in display order. */
  readonly kinds: BonusRowKind[] = ["rollovers", "inlanes", "banks"];
  /** Row counts (n >= 1 for every included row). */
  readonly counts: number[] = [0, 0, 0];
  /** Row values: count * unit. */
  readonly values: number[] = [0, 0, 0];
  /** Sum of the included row values. */
  total = 0;
  /** Whether this tally is a tilt forfeit (no rows, total 0, D-13). */
  forfeit = false;

  /**
   * Fill the rows from `c`: ROLLOVERS, INLANES, BANKS, only rows with n >= 1,
   * each worth n * its unit, then the total. Clears the forfeit flag.
   */
  snapshot(c: BonusCounters): void {
    this.rows = 0;
    this.total = 0;
    this.forfeit = false;
    this.addRow("rollovers", c.rollovers, BONUS_ROLLOVER_UNIT);
    this.addRow("inlanes", c.inlanes, BONUS_INLANE_UNIT);
    this.addRow("banks", c.banks, BONUS_BANK_UNIT);
  }

  /** Mark a tilt forfeit: zero rows, total 0 (D-13). */
  markForfeit(): void {
    this.rows = 0;
    this.total = 0;
    this.forfeit = true;
  }

  /** Clear the forfeit flag (rows and total unchanged). */
  clearForfeit(): void {
    this.forfeit = false;
  }

  private addRow(kind: BonusRowKind, n: number, unit: number): void {
    if (!(n >= 1)) return;
    const i = this.rows;
    this.kinds[i] = kind;
    this.counts[i] = n;
    const value = n * unit;
    this.values[i] = value;
    this.total += value;
    this.rows = i + 1;
  }
}

/** Clamp a row count to an integer in 0..BONUS_MAX_ROWS (non-finite: 0). */
function clampRows(rows: number): number {
  if (!Number.isFinite(rows) || rows <= 0) return 0;
  return Math.min(BONUS_MAX_ROWS, Math.floor(rows));
}

/**
 * How many fixed steps the tally holds the serve: `TILT_FORFEIT_HOLD_STEPS`
 * for a forfeit, `BONUS_EMPTY_HOLD_STEPS` with no rows, else
 * `BONUS_ROW_STEPS * rows + BONUS_TOTAL_HOLD_STEPS` (at most 264).
 */
export function bonusDurationSteps(rows: number, forfeit: boolean): number {
  if (forfeit) return TILT_FORFEIT_HOLD_STEPS;
  const n = clampRows(rows);
  if (n === 0) return BONUS_EMPTY_HOLD_STEPS;
  return BONUS_ROW_STEPS * n + BONUS_TOTAL_HOLD_STEPS;
}

/** Whether row `i` is revealed at `elapsed` steps: elapsed >= 48 i. */
export function rowRevealed(i: number, elapsed: number): boolean {
  if (!Number.isFinite(elapsed) || elapsed < 0) return false;
  if (!Number.isFinite(i) || i < 0) return false;
  return elapsed >= BONUS_ROW_STEPS * i;
}

/**
 * Row `i`'s shown value at `elapsed` steps: 0 until revealed, then
 * `round(value * min(1, (elapsed - 48 i) / 48))`. Non-finite input shows 0.
 */
export function rowShownValue(value: number, i: number, elapsed: number): number {
  if (!Number.isFinite(value) || !rowRevealed(i, elapsed)) return 0;
  const t = Math.min(1, (elapsed - BONUS_ROW_STEPS * i) / BONUS_ROW_STEPS);
  return Math.round(value * t);
}

/** How many of `rows` rows are revealed at `elapsed` steps. */
export function revealedRowCount(rows: number, elapsed: number): number {
  const n = clampRows(rows);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.min(n, Math.floor(elapsed / BONUS_ROW_STEPS) + 1);
}
