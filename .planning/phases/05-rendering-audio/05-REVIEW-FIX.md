---
phase: 05-rendering-audio
fixed_at: 2026-11-22T00:42:00Z
review_path: .planning/phases/05-rendering-audio/05-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-11-22T00:42:00Z
**Source review:** .planning/phases/05-rendering-audio/05-REVIEW.md (incremental review of fix commits 9d1f3b1..7534110)
**Iteration:** 1
**Fix scope:** all (Warning and Info; the review has no necessity findings)

**Summary:**
- Findings in scope: 6 (2 Warning, 4 Info)
- Fixed: 6 (WR-01 and WR-02 marked "requires human verification")
- Skipped: 0

## Verification

| Gate | Isolated worktree (per fix, then full) | Main checkout (after fast-forward) |
|------|----------------------------------------|------------------------------------|
| `tsc --noEmit` | exit 0 | exit 0 |
| `vitest run` | 52 files, 775/775 passed | 52 files, 775/775 passed |
| `eslint .` | exit 0 | exit 0 |

Per-fix checks ran in the isolated worktree (`.claude/worktrees/rf-05-*`, using the main checkout's `node_modules` by ancestor resolution): `tsc --noEmit`, `eslint` on the changed files, and the affected test file. After the fast-forward and worktree removal, all three gates were re-run in the main checkout, so the numbers above reproduce from the current tree. The suite grew from 771 to 775 tests: three new engine tests (two for WR-01, one for WR-02) and one new asset-gate test (IN-03). IN-04 extends an existing test.

Regression checks: each new WR test was run against the pre-fix engine and failed (WR-01: 2 tests fail; WR-02: 1 test fails), then passed with the fix. For IN-04, removing the `this.resumePending &&` term from `isRendering` makes the extended test fail. That mutation was reverted and never committed.

## Fixed Issues

### WR-01: [new, 9d1f3b1 WR-01 fix] Any activating gesture after expiry reopens the window, so a resume that never settles is unbounded again (regression of the previous WR-01 bound)

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-engine.test.ts`
**Commits:** 660e019 (fix + tests), 665dc82 (corrects the activation-probe doc comment the finding cites at `:106-110`)
**Status:** fixed: requires human verification (state-handling logic)
**Applied fix:** Added an `activationReopened` flag. `unlock()` now opens a fresh window when no resume is pending, and clears the flag when it does. While a resume is pending, the first activating gesture after the deadline reopens the window once and sets the flag. Later gestures cannot reopen it until the resume settles, rejects, or throws. All three paths clear the flag. Window opening moved into a small `openStartingWindow()` helper. The `hasTransientActivation` doc no longer says flipper keys lack activation. The Shift-first then Enter path is unchanged: Shift opens the first window and leaves the flag clear, so the activating Enter after expiry still reopens and the "start" cue still plays. The existing WR-01 regression test passes unchanged.
**Tests added:**
- 60 s held activating key on a resume that never settles: unlock every 2 frames, a bumper cue every frame. Voices started stay within two windows' worth, the last voice is built within the first ~3 windows, created nodes stay at or below `2 x framesPerWindow x MAX_NODES_PER_VOICE`, and nothing is left connected. Before the fix, this run grew by about 17,600 nodes.
- Once the stuck resume settles (context still suspended), a fresh resume gets a fresh window and its own single reopen. This shows the flag does not stay latched.

### WR-02: [new, 9d1f3b1 x 60c34ac] The reopen path discards and hard-cuts voices on a context that IN-05 already treats as rendering

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-engine.test.ts`
**Commit:** 23f874d
**Status:** fixed: requires human verification (state-handling logic)
**Applied fix:** The reopen branch now also requires `!this.isRendering(ctx)`. On a context whose audio clock is already moving while `state` still reads "suspended", an activating gesture after the deadline no longer calls `discardAll` and no longer resets `startAudioT`. It only issues `resume()`.
**Test added:** This test reaches the IN-05 state: the clock is at 0.02, the window has expired, and the flush returns 1. An activating `unlock()` then leaves `activeVoices()` and the connected node count unchanged. A flush before the clock moves again still counts as rendering, so the stolen voice stays connected. After the clock advances to 0.04 and another activating `unlock()`, nothing is discarded.

### IN-01: [new, 56df7b0 / 9d1f3b1 / 60c34ac] The window documentation still says "at most STARTING_WINDOW_MS after the first resume()"

**Files modified:** `src/audio/audio-engine.ts`, `src/sandbox/main.ts`
**Commit:** ca0496d
**Applied fix:** The engine header, the `STARTING_WINDOW_MS` doc and the `flush()` doc now measure the window from its (re)opening. They say an activating re-gesture can reopen an expired window once, that a context which is already rendering is never reopened, and that a suspended context whose audio clock is already advancing counts as running. `main.ts` uses the same wording.

### IN-02: [new, 47d0caa] `applyEnvelope` is now test-only, and the envelope header still describes "one thin applier"

**Files modified:** `src/audio/envelope.ts`
**Commit:** c4c8b53
**Applied fix:** The doc comment now marks `applyEnvelope` as a test convenience and names the production path (`scheduleEnvelope(param, envelopePoints(...))` plus `envelopeEnd`). The module header describes the scheduler and the test-only wrapper. The function and its two test call sites were kept.

### IN-03: [new, 3876b5b] The asset gate still misses a few ways to pull assets into the page from script

**Files modified:** `src/render/asset-free.test.ts`
**Commit:** af96c21
**Applied fix:** Added the four suggested patterns, each with a positive sample: remote ES module specifier (static `from` and dynamic `import()`), `createElement` of img/audio/video/source, `data:` image/audio/font/video URIs, and `new Worker` / `new SharedWorker` / `importScripts`. A new test checks extra positives and negatives: a local `from "../app/cue-queue"`, `import("./lazy")` and `createElement("canvas")` do not match. The current tree still scans clean.

### IN-04: [new, 60c34ac] IN-05's "suspended with no resume pending stays not-rendering" branch has no clock-advanced test

**Files modified:** `src/audio/audio-engine.test.ts`
**Commit:** 0c11790
**Applied fix:** In "a suspended context with no resume in flight drops cues", `fake.currentTime` now moves 0.5 s past its value at unlock before the OS-level suspend. The test asserts `flush()` returns 0, `activeVoices()` is 0, and no node is created.

---

_Fixed: 2026-11-22T00:42:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
