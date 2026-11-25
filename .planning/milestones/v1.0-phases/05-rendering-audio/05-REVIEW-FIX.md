---
phase: 05-rendering-audio
fixed_at: 2026-11-22T01:37:30Z
review_path: .planning/phases/05-rendering-audio/05-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-11-22T01:37:30Z
**Source review:** .planning/phases/05-rendering-audio/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

The episode-based starting-window design from b04d725 is unchanged. The only behaviour change is IN-01's one line. WR-01 touches docs and tests only.

## Fixed Issues

### WR-01: Invariant 2 holds only for the episode's first two gestures. After a failed device start, the recovering Enter's "start" figure is dropped

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-engine.test.ts`
**Commit:** bbcdbf7
**Applied fix:** Docs and tests only, as the reviewer recommended. Windows are not reopened after a rejection.
- The file header now states the limit outright. Only two gestures per episode get a window: the opener and the first activating, non-rendering re-gesture. The "start" figure survives only if the device starts within STARTING_WINDOW_MS of one of those two. A later gesture in a spent episode gets no window, even when its own `resume()` starts the device. That is the cost of the two-window bound. No other place in `src/` stated the unconditional form. The existing re-arm comments describe the first activating re-gesture, so they were already accurate.
- The invariant table has a new outcome, `"fails-then-runs"`. Every resume rejects until an activating recovery gesture arrives at +1500 ms, and the device starts 60 ms after it. The outcome is only paired with rows that have an activating gesture before the recovery, which adds 20 rows (84 to 104).
  - When an activating second gesture has already spent the episode (12 rows), the recovering gesture's "start" flush is asserted to be `0`.
  - Otherwise (8 rows) the recovery is the first activating re-gesture, so the "start" figure is asserted to play and never be cut.
  - In all 20 rows the rejection is asserted to be reported exactly once.
- The "table reaches…" test now also runs two named rows. One is the reviewer's sequence (Shift, then a failing Z, then Enter), asserting `startFlushed === 0`. The other has the opener as the failing gesture, and its recovery keeps its window.
- Mutation check: I made a rejection reopen window 2 and 14 tests failed. The source was then restored with `git checkout`.

### IN-01: The rendering test compares the clock with a per-window anchor, so an unobserved run makes a frozen, suspended context count as "rendering" forever

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-engine.test.ts`
**Commit:** ba7faae
**Applied fix:**
- In `unlock()`, added `if (!this.resumePending) this.startAudioT = ctx.currentTime;` immediately before `this.resumePending = true;`, exactly as specified, with a short comment. The `startAudioT` field doc now names this second anchor point.
- Added a regression test based on the reviewer's repro C2. The context runs and is suspended again with no `flush()`/`unlock()` in between. A gesture then arrives after the episode is spent, and its resume stays stuck. Over 600 frames it asserts 0 voices built, 0 voice nodes connected and 0 active voices.
- Before the fix the test failed with `expected 600 to be +0`, which matches C2. After the fix all 138 `audio-engine.test.ts` tests pass.

## Verification

Gates were re-run in the **main checkout** after the fast-forward to ba7faae, so the results reproduce from this tree. Per-fix checks ran in the isolated worktree; the parent's `node_modules` resolved through the directory walk.
- `npx tsc --noEmit`: exit 0
- `npx eslint .`: exit 0
- `npx vitest run`: 52 files, 891 tests, all passed (exit 0)

`prettier --check` reports both touched files as unformatted. It reports the same on the pre-fix HEAD (ae2605c), and it is not one of the requested gates. I left it alone.

Housekeeping: the worktree was removed, the temp branch `gsd-reviewfix/05-110833` was deleted after the fast-forward, and the recovery sentinel was removed. `.planning/config.json`, `.planning/state.json` and `.planning/research/.cache/` were never staged.

---

_Fixed: 2026-11-22T01:37:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
