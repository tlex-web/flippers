/**
 * The local high score (PLSH-08, D-15, D-16): one best score that persists
 * across browser sessions.
 *
 * Storage contract (D-15, costly to change): the best is stored as a decimal
 * integer string under the single versioned key `HISCORE_KEY`
 * (`flippers.hiscore.v1`). Nothing else is ever persisted: no identifiers, no
 * timestamps, no play history. Renaming or reformatting the key later orphans
 * every saved best unless migration code reads the old key.
 *
 * Read once, written rarely (D-16): the constructor reads the key exactly once
 * (at boot); `submit()` writes it only when a final score beats the best, which
 * `GameSession` calls once at game over. Never per frame.
 *
 * Fully guarded and silent (D-16): the stored value is untrusted (user-editable,
 * possibly corrupt), so `parseBest` accepts only a non-negative safe integer and
 * maps anything else to 0, with no rounding or truncation. `getItem` and
 * `setItem` each run inside their own try/catch (a `SecurityError` on read, a
 * `QuotaExceededError` on write); a failure leaves the in-memory best in charge,
 * play continues, and nothing is shown or logged. The `window.localStorage`
 * getter itself can throw too; `main.ts` guards that one (`safeLocalStorage()`)
 * and passes null when storage is unavailable.
 *
 * No DOM globals: the storage is injected as a `StorageLike` (a `Storage`
 * satisfies it structurally), so this module is testable in Vitest's node
 * environment.
 */

/** The storage slice the high score needs. `window.localStorage` satisfies it. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The one storage key (D-15, versioned; locked). */
export const HISCORE_KEY = "flippers.hiscore.v1";

/**
 * Parse a stored best (D-16): `Number(raw)`, accepted only when it is a
 * non-negative safe integer, otherwise 0. null (no value), "", "abc", "-1",
 * "1.5", "NaN", "Infinity" and "9007199254740993" all give 0; a fractional
 * value is rejected, never floored.
 */
export function parseBest(raw: string | null): number {
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/** The best score over an injected, possibly throwing or absent, storage. */
export class HighScore {
  private readonly storage: StorageLike | null;
  private best: number;

  /** Reads the stored best once; a throwing read counts as no value. */
  constructor(storage: StorageLike | null) {
    this.storage = storage;
    let raw: string | null = null;
    try {
      raw = storage === null ? null : storage.getItem(HISCORE_KEY);
    } catch {
      raw = null; // SecurityError and the like: no stored best (silent, D-16)
    }
    this.best = parseBest(raw);
  }

  /** The best score: the stored one, or the best submitted since. */
  getBest(): number {
    return this.best;
  }

  /**
   * Offer a final score (game over only). Returns true on a new best: the
   * score is a non-negative safe integer strictly greater than the best. The
   * in-memory best updates first, then the store is written once; a failing
   * write is silent and the in-memory best stands. Anything else returns false
   * and writes nothing.
   */
  submit(score: number): boolean {
    if (!Number.isSafeInteger(score) || score < 0 || score <= this.best) return false;
    this.best = score;
    if (this.storage !== null) {
      try {
        this.storage.setItem(HISCORE_KEY, String(score));
      } catch {
        // QuotaExceededError and the like: silent per D-16; the in-memory best stands.
      }
    }
    return true;
  }
}

/** What `GameSession` needs from the high score. */
export type HighScoreSink = Pick<HighScore, "getBest" | "submit">;
