---
phase: 05-rendering-audio
fixed_at: 2026-11-22T00:04:00Z
review_path: .planning/phases/05-rendering-audio/05-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-11-22T00:04:00Z
**Source review:** .planning/phases/05-rendering-audio/05-REVIEW.md (incremental review of f1b2a1e)
**Iteration:** 1
**Fix scope:** all (Warning, Info, and the necessity finding)

**Summary:**
- Findings in scope: 8 (1 Warning, 7 Info, including 1 necessity finding)
- Fixed: 8 (3 of them marked "requires human verification")
- Skipped: 0

## Verification

| Gate | Isolated worktree (per fix, then full) | Main checkout (after fast-forward) |
|------|----------------------------------------|------------------------------------|
| `tsc --noEmit` | exit 0 | exit 0 |
| `vitest run` | 52 files, 771/771 passed | 52 files, 771/771 passed |
| `eslint` | exit 0 (changed files) | exit 0 (`eslint .`) |

- Baseline before the fixes: tsc exit 0, 764/764 tests. This pass adds 7 tests.
- Each fix was checked in the isolated worktree before its commit (tsc plus the affected test files). The worktree had no `node_modules`; it sat inside the repo, so Node and TypeScript resolved them from the main checkout's `node_modules` through ancestor lookup. No link or junction was created.
- After the fast-forward, every gate was re-run in the main checkout. Those numbers can be reproduced from the current tree.
- `prettier --check` flags many audio files that this pass never touched. That is a pre-existing line-ending difference, not something introduced here.
- I confirmed that the WR-01 regression test fails on the unfixed engine (`flush` returns 0) and passes with the fix.

## Fixed Issues

### WR-01: [new, f1b2a1e WR-01 fix code] The starting window never reopens while the first resume is pending, so the "start" cue is dropped when a real activation finally starts the context

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-engine.test.ts`
**Commit:** 9d1f3b1
**Status:** fixed: requires human verification (lifecycle and state logic)
**Applied fix:** I used the reviewer's activation-probe option and did not change `AudioUnlock`.
- `AudioEngine` takes a 4th constructor parameter, `isActivation`. Its default is `navigator.userActivation.isActive`, and it falls back to `true` when the API or `navigator` is missing.
- `unlock()` reopens the window in two cases: no resume is pending, or the window has expired **and** the gesture has transient activation. On a reopen it first calls `pool.discardAll()`, so voices from the expired window do not carry over into the new one.
- A non-activating re-gesture, such as held-Shift auto-repeat, still cannot reopen the window. The node-growth bound therefore still holds.
- In the tests, `stuckRig` injects the probe. It defaults to non-activating, which keeps the existing "frame-60 re-gesture does not reopen" assertion meaningful.
- New test: the resume is stuck, the window expires, a non-activating re-gesture leaves it closed, then a re-gesture with activation reopens it. A "start" cue flushed 16 ms later, with the context still suspended, returns 1. The reopened window is also bounded and discards when it expires.
- New test: a re-gesture with activation inside a window that is still open does not extend it.

I did not take the alternative (making `AudioUnlock` ignore modifier-only keys). On its own it leaves the engine unable to recover, and the engine-level regression test the review asked for would still fail.

### IN-01: [new, WR-02 fix code] The sandbox header still says cues are dropped while the context is not running

**Files modified:** `src/sandbox/main.ts`
**Commit:** 56df7b0
**Applied fix:** I reworded the presentation paragraph as the review suggested. Cues are dropped only when the context is neither running nor starting (starting means suspended with a resume in flight, for at most STARTING_WINDOW_MS). Cues on a starting context are scheduled and sound once it runs.

### IN-02: [new, IN-03 fix code] A second live region contradicts the "only announced line" documentation, and unmuting is silent to assistive tech

**Files modified:** `index.html`, `src/ui/hud.ts`, `src/ui/hud.test.ts`, `src/sandbox/main.ts`
**Commit:** ad83a46
**Applied fix:**
- I took `role="status"`/`aria-live` off the visible `#hud-mute` marker. The controls `<dl>` really is unannounced again.
- I added a visually hidden live region, `#hud-mute-live`, after the `<dl>`, with a standard clip-path `.visually-hidden` class.
- `MuteView` takes an optional `announce` sink and writes `muteAnnouncement(muted)` ("Muted" or "Sound on") on every change after the first write. The initial state is not announced, so nothing is read out at boot.
- I wired it in `main.ts`.
- I updated the `.hud-status` CSS comment and the `hud.ts` header to say there are two live regions.
- New test: both the mute and the unmute are announced, a steady frame announces nothing, and the initial state is not announced.

### IN-03: [new, IN-04 fix code] The asset gate still misses remote stylesheets, fonts and scripts

**Files modified:** `src/render/asset-free.test.ts`
**Commit:** 3876b5b
**Applied fix:** I added five patterns, each with a positive sample:
- a remote `href`/`src` URL (`https:`, `http:` or protocol-relative)
- CSS `@import`
- `<object>`, `<embed>` and `<iframe>`
- `new WebSocket(` and `new EventSource(`
- CSS `image-set(`

A further test checks two things. The remote-URL pattern catches a CDN `<script src>` and a protocol-relative `<link href>`. It does not match the page's own `<script type="module" src="/src/sandbox/main.ts">`. The real tree still scans clean.

### IN-04: [new, WR-01 fix code] Envelope points are built twice per layer; the steal anchor relies on two independent calls staying in step

**Files modified:** `src/audio/envelope.ts`, `src/audio/envelope.test.ts`, `src/audio/audio-engine.ts`
**Commit:** 47d0caa
**Applied fix:**
- New `scheduleEnvelope(param, points)`: it cancels from the first point's time, then schedules each point.
- `applyEnvelope` now delegates to it, so its API and behavior are unchanged.
- `buildLayer` builds the points once, schedules that same array, stores it on the handle and takes `end` from `envelopeEnd`. The steal anchor can no longer drift from the scheduled automation.
- The determinism tests (identical automation logs) still pass.
- New tests: the given points are scheduled exactly as passed, and an empty list is a no-op.

### IN-05: [new, f1b2a1e WR-01 fix code] `state === "running"` lags real rendering, so a steal or discard during start-up can cut a voice that is already sounding

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-engine.test.ts`
**Commit:** 60c34ac
**Status:** fixed: requires human verification (rendering-state logic)
**Applied fix:**
- `unlock()` records `startAudioT = ctx.currentTime` whenever it opens or reopens the window.
- New `isRendering(ctx)`: true when `state === "running"`, or when a resume is pending, the state is `"suspended"` and `currentTime > startAudioT`.
- `flush()` uses `isRendering()` for both the steal `rendering` flag and the discard gate. A context whose clock is already moving is no longer discarded past the deadline, and its stolen voices are no longer torn down mid-fade.
- A context suspended with no resume pending is still not rendering.
- New test: the clock advances while the state still reads "suspended" and the wall-clock window has passed. The cue still plays, nothing is discarded, and the stolen voice stays connected until its `onended`.

### IN-06: [new, f1b2a1e WR-01 fix code] The "starts inside the window" test cannot detect a too-short window, and the double-teardown path has no test

**Files modified:** `src/audio/audio-engine.test.ts`
**Commit:** de4923e
**Applied fix:**
- **Inside-window test:** it now flushes again at +40 ms while still suspended and expects 1, then switches to running. A window of 1 ms would now fail it.
- **Bounded-window test:** after the window expires, it sets the fake to running, checks that `fireAllEnded()` does not throw, and checks that `activeVoices()` and the connected-node count stay 0. This exercises `onended` after both a non-rendering steal and `discardAll` (the `release` miss plus the second `teardown`).
- **Cleanup:** I removed the `await Promise.resolve()` that had no effect, and the `async` that went with it.
- The WR-01 scenario is covered by the WR-01 commit.

### IN-07: [new, f1b2a1e WR-01 fix code] Already-defended-elsewhere: `add()`'s steal loop, and the `rendering` flag added to it, never run from the engine

**Files modified:** `src/audio/voice-pool.ts`, `src/audio/voice-pool.test.ts`
**Commit:** 7534110
**Status:** fixed: requires human verification (necessity finding, a scope decision)
**Applied fix:** I took the minimal option the orchestrator asked for.
- `rendering` is now a required parameter on both `VoicePool.admit` and `VoicePool.add`, so forgetting it is a type error instead of a quiet leak.
- I kept `add()`'s steal loop and documented it as a deliberate public-API invariant: it runs only for a caller that skips `admit`.
- No code was removed.
- The engine already passed the flag. The 21 pool-test call sites now pass `true` explicitly.

---

_Fixed: 2026-11-22T00:04:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
