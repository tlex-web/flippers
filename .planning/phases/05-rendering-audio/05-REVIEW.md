---
phase: 05-rendering-audio
reviewed: 2026-11-21T23:58:52Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/audio/audio-engine.test.ts
  - src/audio/audio-engine.ts
  - src/audio/envelope.ts
  - src/render/asset-free.test.ts
  - src/sandbox/main.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
  necessity: 1
status: issues_found
---

# Phase 5: Code Review Report (incremental: round-2 fix commits 660e019..0c11790)

**Reviewed:** 2026-11-21T23:58:52Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found
**Scope:** `git diff f6f6a1a..HEAD -- src`, the 7 fix commits for WR-01, WR-02 and IN-01..IN-04 of the previous review. For context I also read `src/audio/audio-unlock.ts`, `src/audio/test/fake-audio-context.ts` and the flipper key bindings in `src/input/flipper-input.ts:223-226`.

## Summary

All six fixes do what they claim. `vitest run src/audio src/render/asset-free.test.ts` passes (7 files, 97 tests). I traced the `unlock()` state machine through every flag transition. `activationReopened` implies `resumePending` on every path (set at `:322` just before `:327`, and cleared at `:331`, `:335` and `:341` together with `resumePending`). So "one activation reopen per stuck resume" holds, and the WR-02 `!isRendering(ctx)` guard does what it says. Both UAT paths trace through correctly.

There are two remaining holes in the same state machine, and I reproduced both with scratch vitests (the scratch files are outside the repo and the tree was not changed):
- **WR-01 is not complete for an Enter that lands late in the first window.** That Enter starts the context, but it does not get a window of its own. If the device needs longer than the time left in the window, the next flush discards the "start" figure.
- **The window bound only covers a resume that stays pending.** A `resume()` that rejects clears `resumePending`, so every later gesture opens a fresh window. A held key then builds voices with no bound and logs an error on every keydown.

**Per-fix verdicts:**

| Fix | Verdict | Notes |
|---|---|---|
| WR-01 (660e019, 665dc82) | Fixed for a stuck resume, with gaps | Once per stuck resume is enforced and pinned by the 60 s held-key test. Not covered: an activating gesture inside a live window (WR-01 below), and a resume that rejects (WR-02 below). |
| WR-02 (23f874d) | Fixed | The reopen requires `!isRendering(ctx)`, so the IN-05 interval no longer discards voices or re-anchors `startAudioT`. The reopen allowance stays unspent there, which is correct. |
| IN-01 (ca0496d) | Fixed | The engine header, the `STARTING_WINDOW_MS` doc, the `flush()` doc and `main.ts:57-63` match the code. |
| IN-02 (c4c8b53) | Fixed | `applyEnvelope` is used only by `envelope.test.ts` and `voice-pool.test.ts`, and production calls `scheduleEnvelope` plus `envelopeEnd` (`audio-engine.ts:542-544`). |
| IN-03 (af96c21) | Fixed as suggested | The four patterns are in place and the tree scans clean. A small gap remains in the remote-module pattern (IN-02 below). |
| IN-04 (0c11790) | Fixed | The clock now moves past `startAudioT` before the suspended flush, and `activeVoices()` is asserted. |

**Necessity:** I read `necessity-review.md`. There is one finding (WR-03).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: An activating gesture inside a live starting window gets no window of its own, so a late Enter's "start" figure is discarded if the device starts after the window

**File:** `src/audio/audio-engine.ts:316-326` (the reopen requires `nowMs >= this.startingUntilMs`), `src/audio/audio-engine.ts:399-403` (the discard on expiry), `src/audio/audio-engine.test.ts:434-443` (this test pins the behaviour)

**Issue:** The WR-01 goal is that after a non-activating first gesture (Shift, which is also a flipper key), the Enter that really starts the context still gets its "start" cue played. The reopen only fires once the first window has expired. Here is what happens if Enter lands inside the window, for example at t0 + 230 ms:
1. `unlock()` takes neither branch, so the deadline stays at t0 + 250 ms. Enter's `resume()` starts the audio device.
2. The "start" cue is flushed at about t0 + 240 ms. It is inside the window, so it is scheduled on the frozen clock.
3. The device needs some tens of ms to come up. The first flush after t0 + 250 ms sees a context that is neither rendering (the clock has not moved yet) nor starting, and `pool.discardAll()` stops and disconnects the whole "start" figure before it can sound.

The "do not extend a live window" rule existed to stop re-gestures from extending the window without limit. Since 660e019 the `activationReopened` flag already caps activation reopens at one per stuck resume. Extending a live window once on the first activating gesture therefore keeps the same bound of two windows per stuck resume. The `expired` condition no longer protects anything, and it creates this gap. The UAT covered "Shift, **wait**, Enter", which waits past expiry, so it did not reach this case. A quick Shift-then-Enter, the natural start, does.

**Reproduced (scratch vitest, real engine and the fake context):** Shift-unlock at 1000 ms, then an activating unlock at 1230 ms. Flush "start" at 1240 ms, which returns 1. Then flush at 1257 ms with the clock still frozen: **6 of the 6 "start" nodes were disconnected**.

**Fix:** Let the first activating gesture while a resume is pending (re)arm the window whether or not it has expired. Discard old voices only when the window had expired:

```ts
} else if (!this.activationReopened && !this.isRendering(ctx) && this.isActivation()) {
  this.activationReopened = true;
  // Voices from an expired window must not ride into the new one; a live
  // window's voices are at most STARTING_WINDOW_MS old and may stay.
  if (nowMs >= this.startingUntilMs) this.pool.discardAll(ctx.currentTime);
  this.openStartingWindow(ctx, nowMs);
}
```

Update `audio-engine.test.ts:434` to expect a flush 20 ms past the original deadline to return 1, and a flush past `nowMs + STARTING_WINDOW_MS` to return 0. Add a test for the reproduced sequence (an activating unlock at t0 + 230 ms, "start" flushed, then a flush at t0 + 257 ms on a frozen clock, with no "start" node disconnected).

### WR-02: A resume() that rejects re-arms the window on every gesture, so the bound only holds for a resume that stays pending

**File:** `src/audio/audio-engine.ts:313-315`, `src/audio/audio-engine.ts:333-337`

**Issue:** The window bound, and the round-2 WR-01 argument for it ("at most one activation reopen per stuck resume"), assume a resume that fails stays pending. A resume that rejects instead (a device start failure, which the header already treats as possible at `:17-18`) goes through the reject handler. That handler clears both `resumePending` and `activationReopened`. The next gesture then takes the `!this.resumePending` branch and opens a fresh 250 ms window, and its `resume()` rejects again. With a held flipper key (auto-repeat at about 30 Hz), every repeat re-arms the window:
- voices are built on a context that never renders, about one per keydown, with no bound for as long as keys are pressed. The pool keeps the live graph at 16 voices, but node creation grows. That is the growth the previous two WR-01 rounds set out to bound.
- `report("resume() was rejected", …)` runs on every keydown, which floods the console. `closedReported` already guards against the same flood for the closed state (`:290-297`).

**Reproduced (scratch vitest):** `resume()` returns `Promise.reject(...)` every time, `isActivation` is true, and there is an unlock every 2 frames and a bumper cue every frame for 60 s. The result: **1800 voices started, 9002 nodes created, 1800 `console.error` lines**. The same run with a stuck resume stays within two windows, about 34 voices (the round-2 test at `audio-engine.test.ts:375`).

**Fix:** Bound the windows per episode that ends in "running", not per promise, and report a rejection once. For example:

```ts
/** Starting windows opened since the context last ran (or was created). */
private windowsOpened = 0;
private rejectReported = false;

// unlock(), replacing the two branches' guards:
const fresh = !this.resumePending && this.windowsOpened === 0;
const reopen =
  !fresh && this.windowsOpened < 2 && !this.isRendering(ctx) && this.isActivation();
if (fresh || reopen) {
  if (reopen && nowMs >= this.startingUntilMs) this.pool.discardAll(ctx.currentTime);
  this.windowsOpened++;
  this.openStartingWindow(ctx, nowMs);
}
// resolve: this.resumePending = false; if (ctx.state === "running") this.windowsOpened = 0;
// reject:  this.resumePending = false; if (!this.rejectReported) { this.rejectReported = true; report(...); }
```

Also reset `windowsOpened` when `unlock()` sees `state === "running"`. Then a later OS-level suspend gets a fresh allowance. Add a test with a resume that always rejects, a held activating key and 60 s of frames, asserting that the voices started stay within two windows and that there is one `console.error`.

### WR-03: Impossible-state guard: `activationReopened = false` in the fresh-resume branch

**File:** `src/audio/audio-engine.ts:314`
**Category:** necessity
**Issue:** The fresh-resume branch runs only when `resumePending` is false. `activationReopened` is set true in only one place (`:322`), and `resumePending = true` follows unconditionally (`:327`). If anything in between throws, the catch at `:340-341` clears both. Every other write of `resumePending = false` (`:330`, `:334`, `:340`) also writes `activationReopened = false`. So `activationReopened` implies `resumePending`, and the reset at `:314` always writes `false` over `false`. It also suggests to the reader that the flag could be stale, which it cannot be. If the WR-02 fix changes how the flag is reset, the line should go with it.
**Fix:** Remove line 314, or replace the separate flag with the per-episode counter from WR-02, where the reset has a real job.

## Info

### IN-01: The "settles" test says every pending resume settles together, but only the last promise resolves

**File:** `src/audio/audio-engine.test.ts:404-432`
**Issue:** `pending.settle` is overwritten on each `resume()` call, so `pending.settle?.()` at `:422` resolves only the third promise. The second (the reopen's) never settles, and neither does the first, which comes from `stuckRig`'s never-settling fake. The comment at `:421` says "Every pending resume settles together". The test passes because any one callback clears both flags. It therefore never shows that a late callback from an earlier resume is harmless after a fresh window has opened.
**Fix:** Collect every resolver (`const resolvers: (() => void)[] = []`), install the override before the rig's first `unlock()`, and resolve them all at `:422`. Or reword the comment to say that only the latest resume is settled.

### IN-02: The remote-module asset pattern misses side-effect imports and template-literal specifiers

**File:** `src/render/asset-free.test.ts:98-102`, `src/render/asset-free.test.ts:103-107`
**Issue:** `import "https://esm.sh/x";` has no `from` and no `(`, so no pattern matches it (the URL pattern needs `href=`/`src=`). It is still a runtime fetch that Vite leaves external. `` import(`https://…`) `` and `` createElement(`img`) `` are also missed, because the character classes accept only `"` and `'`.
**Fix:** Use `/\b(from|import)\s*["'`](https?:)?\/\/|\bimport\s*\(\s*["'`](https?:)?\/\//` and `["'`]` in the `createElement` pattern, with positive samples for `import "https://x/y.js";` and `` import(`https://x`) ``.

---

_Reviewed: 2026-11-21T23:58:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
