---
phase: 05-rendering-audio
fixed_at: 2026-11-22T00:17:12Z
review_path: .planning/phases/05-rendering-audio/05-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-11-22T00:17:12Z
**Source review:** .planning/phases/05-rendering-audio/05-REVIEW.md (incremental review of round-2 fix commits 660e019..0c11790)
**Iteration:** 1
**Fix scope:** all (Warning, Info and the one necessity finding)

**Summary:**
- Findings in scope: 5 (3 Warning, one of them the necessity finding WR-03; 2 Info)
- Fixed: 5 (WR-01, WR-02 and WR-03 need human verification: they change the state machine's logic or remove code)
- Skipped: 0

The maintainer decided this round should replace the starting-window logic with one design, instead of patching each finding separately. So WR-01, WR-02 and WR-03 are fixed together in one commit (b04d725). That commit replaces `activationReopened` with a per-episode model (`windowsOpened: 0 | 1 | 2`, `rejectReported`) and adds a table-driven invariant suite. IN-01 and IN-02 have their own commits.

## Fixed Issues

### WR-01: An activating gesture inside a live starting window gets no window of its own, so a late Enter's "start" figure is discarded if the device starts after the window

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-engine.test.ts`, `src/sandbox/main.ts`
**Commit:** b04d725 (shared with WR-02 and WR-03)
**Status:** fixed: requires human verification (logic change)
**Applied fix:** In an episode, the first activating gesture re-arms the window when `windowsOpened === 1` and the context is not rendering, whether or not the window has expired. `pool.discardAll` runs only if the window had expired. Re-arming sets `windowsOpened = 2`. The old test "a re-gesture with activation inside a live window does not extend it" contradicted the design. It is replaced by "an activating re-gesture inside a live window re-arms it once and keeps its voices": nothing is discarded at the re-arm, a flush 20 ms past the original deadline returns 1, the "start" nodes stay connected, a third gesture does not re-arm, and a flush at the re-armed deadline returns 0. The invariant table also covers the reproduced sequence (Shift, then Enter at +230 ms, device up 60 ms later). The earlier WR-01 regression test (stuck resume, expired window, a non-activating re-gesture leaves it closed, an activating one reopens it, the "start" flush returns 1) passes unchanged.

### WR-02: A resume() that rejects re-arms the window on every gesture, so the bound only holds for a resume that stays pending

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-engine.test.ts`
**Commit:** b04d725 (shared with WR-01 and WR-03)
**Status:** fixed: requires human verification (logic change)
**Applied fix:** When a `resume()` settles or rejects, the engine now clears only `resumePending`. It never touches `windowsOpened`, so an episode opens at most two windows however `resume()` behaves. The episode resets (`windowsOpened = 0`, `rejectReported = false`) only when the engine observes `ctx.state === "running"`, in `unlock()`'s running early return and at the top of `flush()`. A rejected or throwing `resume()` is reported at most once per episode (`reportResumeFailure`). The old test "once the stuck resume settles, the next stuck resume may be reopened once again" also contradicted the design. It is rewritten: a settle on a context that is still suspended opens no window, and only running followed by suspended starts a fresh episode with its own second window.

### WR-03: Impossible-state guard: `activationReopened = false` in the fresh-resume branch

**Files modified:** `src/audio/audio-engine.ts`
**Commit:** b04d725 (shared with WR-01 and WR-02)
**Status:** fixed: requires human verification (necessity finding: code removed)
**Applied fix:** The `activationReopened` flag is gone, together with the dead store and its three companion resets. The per-episode `windowsOpened` counter replaces it, and its reset now does real work.

### IN-01: The "settles" test says every pending resume settles together, but only the last promise resolves

**Files modified:** `src/audio/audio-engine.test.ts`
**Commit:** 7487c53
**Status:** fixed
**Applied fix:** `stuckRig` takes an optional `resume` factory, which is installed before the rig's first `unlock()`. The test collects every resolver, asserts there are 3 (the rig's first unlock included), and resolves them all, so the comment "every pending resume settles together" is now true.

### IN-02: The remote-module asset pattern misses side-effect imports and template-literal specifiers

**Files modified:** `src/render/asset-free.test.ts`
**Commit:** 2ae42d4
**Status:** fixed
**Applied fix:** The remote-module pattern is now `/\b(from|import)\s*["'`](https?:)?\/\/|\bimport\s*\(\s*["'`](https?:)?\/\//`, and the `createElement` pattern accepts backtick quotes. New positive samples: `import "https://x/y.js";`, `` import(`https://x`) `` and `` document.createElement(`img`) ``. There is also a negative sample, `import "./style.css";`. I checked that the old patterns miss all three positive samples. The real tree still scans clean.

## Design notes and deviations

- **No deviation from the binding design.** `unlock()` steps 1 to 4, the episode reset points, `isRendering` / `isStarting` and the `closed` branch are as specified.
- **Docs:** the episode model is described once, in the file header ("Starting episodes"), and in the comment on the `windowsOpened` field. The `STARTING_WINDOW_MS` doc, the `flush()` doc, the constructor's `isActivation` doc and `src/sandbox/main.ts` now point to that description. The scattered "at most STARTING_WINDOW_MS after ..." wording is gone. The `hasTransientActivation` comment states that engines without `navigator.userActivation` can spend the second window early on a key that is not activation, and that this stays within the bound. One consequence is documented in the header: a live window's voices are kept when it is re-armed, so a stale cue can now sound up to (but not including) two windows after it was recorded. The old bound was one window.
- **Existing held-key test (60 s, activating, stuck resume):** its lower bound changed from "more than one window" to "at least one full window". The first auto-repeat now re-arms the live window right away, so the episode's second window is spent in the first frames: 15 voices built, with the upper bound unchanged at 2 windows.
- **Table interpretation:** for the "advancing" clock, `currentTime` moves from the device start and `state` flips to running (with every resume resolving) 300 ms later. That is longer than a window, the worst case of the IN-05 lag, and it puts an activating gesture inside the rendering interval. For the "frozen" clock, `currentTime` never moves and the `state` flip is the only signal. A dedicated test asserts that the table really reaches both the late re-arm and a gesture while rendering.
- **Residual, not changed (outside the design):** `resumePending` is one flag, so a late settle of an earlier `resume()` clears it even while a newer one is in flight. Browsers settle all pending resumes together, so the table could not reach a harmful case.

## Invariant suite (src/audio/audio-engine.test.ts)

The table covers 84 rows: first gesture (activating or not) x second gesture (none, or +20, +230 or +1000 ms, activating or not) x resume outcome (runs 60 ms after the first activating gesture, pending forever, rejects every time) x clock (frozen or advancing). On top of the table:
1. **Bounded:** a key held for 60 s, with activation true and separately false, on a pending and on a rejecting resume, with microtasks drained before and after each flush (8 cases). Voices started stay at or below 2 x 16 frames, nodes created at or below 2 x 16 x the most nodes one voice can create, and all 1800 resumes are issued.
2. **Start figure survives:** in every "runs" row that has an activating gesture, the "start" flush returns at least 1 and none of its nodes is disconnected by the end of the run.
3. **No hard cut while rendering:** in every row, `unlock()` disconnects nothing while the audio clock advances.
4. **Reject reported once per episode:** every row logs exactly 1 `console.error` for "rejects" and 0 otherwise. A dedicated test covers the reject path, then a throw in the same episode, then running followed by suspended, which logs a 2nd error.
5. **Episode reset:** after running followed by suspended, a non-activating gesture opens a fresh window, the first activating gesture opens its own second window, and further gestures open nothing.

Run against the old engine, the new suite fails 34 tests: the late re-arm rows, every reject row, the held-key reject cases, the reset and coverage tests, and the two rewritten tests. Against the new engine it passes.

## Verification

All gates ran in the **main checkout** after the fast-forward, so the numbers can be reproduced from the current tree. During the fixes, each check also ran in the isolated worktree (`.claude/worktrees/rf-05-107598-*`, now removed).

- `npx tsc --noEmit`: exit 0
- `npx vitest run`: 52 files, 870 tests passed, exit 0
- `npx eslint .`: exit 0
- **Scratch repros against the new engine** (run from the scratchpad, not copied into the repo):
  - `late-enter.spec.ts`: **passes** (0 of the "start" nodes disconnected).
  - `reject.spec.ts`: ends in `expect({...}).toEqual({})`, which only prints the result and fails for any engine. The printed result is now `{ started: 9, nodes: 47, errors: 1, resumes: 1800 }`, against the review's `{ 1800, 9002, 1800, 1800 }`. A scratch copy that replaces that last line with `started <= 32` and `errors === 1` **passes**.
- Prettier (not a requested gate): `prettier --check` flags every file in this CRLF checkout, `main.ts` was already flagged at HEAD, and one long line at `audio-engine.test.ts:401` is from before this change. All new lines are formatted the way prettier would format them.

---

_Fixed: 2026-11-22T00:17:12Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
