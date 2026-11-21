---
phase: 05-rendering-audio
reviewed: 2026-11-22T00:30:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - index.html
  - src/audio/audio-engine.test.ts
  - src/audio/audio-engine.ts
  - src/audio/envelope.test.ts
  - src/audio/envelope.ts
  - src/audio/voice-pool.test.ts
  - src/audio/voice-pool.ts
  - src/render/asset-free.test.ts
  - src/sandbox/main.ts
  - src/ui/hud.test.ts
  - src/ui/hud.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
  necessity: 0
status: issues_found
---

# Phase 5: Code Review Report (incremental: fix commits 9d1f3b1..7534110)

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found
**Scope:** `git diff 0ef68ab..HEAD -- index.html src`, which covers the 8 fix commits for WR-01 and IN-01 to IN-07 from the previous review. For context I also read `src/audio/audio-unlock.ts`, `src/input/flipper-input.ts` (the key bindings) and `src/audio/test/fake-audio-context.ts`.

## Summary

Seven of the eight fixes are correct and complete. They are IN-01, IN-02, IN-03 (as scoped), IN-04, IN-06, IN-07, and IN-05 on its own. I ran the affected test files and all 130 tests pass. The WR-01 fix does what the UAT confirmed: after a Shift-first unlock, the next Enter reopens the window and the "start" figure plays. But the fix gates the reopen on `navigator.userActivation.isActive`, and that is broader than "this gesture is the one that can start the context". This brings back the unbounded node growth that the previous WR-01 had bounded (new WR-01). The reopen path also interacts badly with the IN-05 fix (new WR-02). I reproduced both with a scratch vitest against the real engine and the fake context. The scratch file lives outside the repo and the source tree was not changed.

**Per-fix verdicts:**

| Fix | Verdict | Notes |
|---|---|---|
| WR-01 (9d1f3b1) | Fixed, with a regression | "start" after Shift then Enter now plays. But every activating gesture after the window expires reopens it, so a resume that never settles has unbounded node growth again (WR-01 below). |
| IN-01 (56df7b0) | Fixed, then made stale by WR-01/IN-05 | The wording matches the engine as it was. "At most STARTING_WINDOW_MS" no longer holds with reopen and the clock-advancing path (IN-01 below). |
| IN-02 (ad83a46) | Fixed | `#hud-mute` is no longer a live region. `#hud-mute-live` is the only other `role="status"` (checked `index.html:189`, `:207`). Toggles are announced and the boot state is not. Writing only on change means a mute and unmute inside one frame announces nothing, which is correct because nothing changed. |
| IN-03 (3876b5b) | Fixed as scoped | All five suggested patterns are present, each with a sample, and the local `<script type="module" src="/...">` does not match. A few remaining gaps are listed as IN-03 below. |
| IN-04 (47d0caa) | Fixed | `scheduleEnvelope` cancels from `points[0].time === lt`, the same as the old `applyEnvelope(env.gain, lt, …)`, so behaviour is unchanged. The handle stores the very array that was scheduled. `applyEnvelope` is now used only by tests (IN-02 below). |
| IN-05 (60c34ac) | Fixed | `isRendering` is correct for flush. `startAudioT` is reset on every window open, so clock movement before the window does not count. Suspended with no pending resume stays not-rendering. The reopen path breaks the invariant, see WR-02. |
| IN-06 (de4923e) | Fixed | Adding a suspended flush at +40 ms would catch a window that is too short. `fireAllEnded()` after the pool teardown is pinned. The useless `await` is gone. |
| IN-07 (7534110) | Fixed | `rendering` is required on `admit` and `add`. tsc reports no other callers (`grep` shows the engine at `audio-engine.ts:422`/`:453` and the pool tests). |

**Necessity:** I read `necessity-review.md` and found no necessity findings in this diff.

## Warnings

### WR-01: [new, 9d1f3b1 WR-01 fix] Any activating gesture after expiry reopens the window, so a resume that never settles is unbounded again (regression of the previous WR-01 bound)

**File:** `src/audio/audio-engine.ts:293-300` (reopen condition), `src/audio/audio-engine.ts:106-110` (`hasTransientActivation`), `src/input/flipper-input.ts:225-226` (flipper keys `KeyZ`, `ArrowLeft`, `Slash`, `ArrowRight`)

**Issue:** The fix assumes that only a modifier-only keydown (held Shift) lacks activation, so only that case can repeat. That assumption is wrong for this table and for the browser's activation model:
- `KeyZ`, `Slash`, `ArrowLeft` and `ArrowRight` are bound flipper keys, and they are not modifiers. In Chromium every keydown of them notifies user activation before dispatch, auto-repeat keydowns included.
- `isActive` is *transient* activation. It stays true for the activation lifespan, about 5 s in Chromium and Firefox, after any activating input, and `AudioContext.resume()` does not consume it. So within 5 s of any Z or arrow press, even a held-Shift auto-repeat reads `isActive === true`.
- In engines without `navigator.userActivation`, the fallback (`?? true`, line 109) treats every re-gesture as activating, Shift auto-repeat included.

In the never-settling scenario that bounded the window in the first place (no output device, see the header at line 25), every flipper press after expiry discards the held voices and opens a fresh 250 ms window. Each window builds voices whose started sources cannot reach `stop()` on a context that never renders. The previous review already noted that the browser may keep those disconnected nodes alive. So node creation is now bounded per gesture, not per stuck resume.

**Reproduced:** I ran a scratch vitest with the real engine, a fake context whose resume never settles, and `isActivation` returning true (a held Z/arrow key). Over 60 s of frames there was a bumper cue every frame and `unlock()` every 2 frames (key auto-repeat). The result: **3520 voices started, 17600 nodes created**, 1801 `resume()` calls. Before 9d1f3b1 the same run starts at most one window's worth of voices, about 15.

The regression test models a re-gesture as `active: false`. It never covers a re-gesture with activation while a resume stays stuck, which is the case that grows.

**Fix:** Allow at most one activation reopen per stuck resume. If the first activating `resume()` does not start the context, later gestures cannot either: all pending `resume()` promises settle together once the context is allowed to start.

```ts
private activationReopened = false;

// unlock():
const nowMs = this.clock();
const expired = nowMs >= this.startingUntilMs;
const reopen =
  this.resumePending && expired && !this.activationReopened && this.isActivation();
if (!this.resumePending || reopen) {
  if (reopen) {
    this.activationReopened = true;
    this.pool.discardAll(ctx.currentTime);
  } else {
    this.activationReopened = false;
  }
  this.startingUntilMs = nowMs + STARTING_WINDOW_MS;
  this.startAudioT = ctx.currentTime;
}
// and clear `activationReopened` in both resume() settle callbacks.
```

Add an engine test that uses `stuckRig` with `activation.active = true` throughout, unlocks every 2 frames for several seconds, and asserts that `started` stays within two windows' worth of voices.

### WR-02: [new, 9d1f3b1 x 60c34ac] The reopen path discards and hard-cuts voices on a context that IN-05 already treats as rendering

**File:** `src/audio/audio-engine.ts:295-299`, `src/audio/audio-engine.ts:392-395`

**Issue:** IN-05's invariant is that once the audio clock has moved, the context is rendering, and its voices must not be torn down or discarded. The reopen branch does not check it. Suppose the context is in the IN-05 interval: rendering, `state` still `"suspended"`, `resumePending` true. If an activating gesture arrives after the window's wall-clock deadline, `unlock()`:
1. calls `pool.discardAll(ctx.currentTime)`, and `discardAll` calls `steal(i, now, false)`, which disconnects every voice at once. The 5 ms fade it schedules is never heard, so audibly playing voices click off. This is the exact failure IN-05 was written to stop.
2. resets `startAudioT` to the current clock, so `isRendering()` reads false until the clock moves again. A steal in that gap tears down at once.

This is reachable when start-up takes longer than 250 ms after the reopening gesture (slow output devices such as Bluetooth sinks) and a flipper press lands in the state-lag interval. It is rare, but it is a logic hole between two fixes, and the reopen serves no purpose on a context that is already rendering.

**Reproduced (scratch vitest):** I flushed "start" on the stuck rig, set `currentTime = 0.02`, and moved the clock 260 ms on. The flush returned 1 (IN-05 path). Then `unlock()` with activation took the connected voice nodes **from 11 to 0** and `activeVoices()` to 0.

**Fix:** Do not reopen, discard or re-anchor a context that is already rendering:

```ts
if (!this.resumePending || (expired && !this.isRendering(ctx) && this.isActivation())) {
```

Add a test that sets the IN-05 state, lets the window expire, sends an activating `unlock()`, and asserts the voices stay connected.

## Info

### IN-01: [new, 56df7b0 / 9d1f3b1 / 60c34ac] The window documentation still says "at most STARTING_WINDOW_MS after the first resume()"

**File:** `src/audio/audio-engine.ts:21-23`, `src/audio/audio-engine.ts:29-30`, `src/audio/audio-engine.ts:346-352`, `src/sandbox/main.ts:58-60`

**Issue:**
- The engine header says a starting context "is playable for at most STARTING_WINDOW_MS after the first `resume()` call". After WR-01, an activating gesture reopens the window, so the time is measured from the latest (re)open, not the first resume.
- After IN-05, a suspended context whose clock is moving is playable with no time limit, because it is rendering.
- The `flush()` doc (`:348-349`) defines "playable" only as running or starting, and leaves out the clock-advancing case.
- `main.ts:59` repeats "at most STARTING_WINDOW_MS", which IN-01 had just made accurate.

**Fix:** Say "from the window's (re)opening; an activating re-gesture can reopen an expired window once" (once, after the WR-01 fix), and add the rendering case: "a suspended context whose audio clock is already advancing counts as running". Mirror the same wording in `main.ts`.

### IN-02: [new, 47d0caa] `applyEnvelope` is now test-only, and the envelope header still describes "one thin applier"

**File:** `src/audio/envelope.ts:4`, `src/audio/envelope.ts:122-134`

**Issue:** After IN-04, production calls `scheduleEnvelope` plus `envelopeEnd` directly (`audio-engine.ts:505-507`). `applyEnvelope` is imported only by `envelope.test.ts:5` and `voice-pool.test.ts:6`. The module header (line 4) still says "Pure point math plus one thin applier", but there are now two.

**Fix:** Either mark `applyEnvelope` as a test convenience in its doc comment, or move the two test call sites to `scheduleEnvelope(param, envelopePoints(...))` and delete it. Update the header line either way.

### IN-03: [new, 3876b5b] The asset gate still misses a few ways to pull assets into the page from script

**File:** `src/render/asset-free.test.ts:35-96`

**Issue:** The IN-03 patterns cover markup and CSS. None of the following matches any pattern:
- a remote ES module specifier, `import x from "https://esm.sh/…"` or `import("https://…")`. Vite leaves `https:` specifiers external, so it is a runtime network fetch.
- `document.createElement("img" | "audio" | "video")` with a `.src`. Only `new Image(`, `new Audio(` and the literal tags are caught.
- `data:` URIs (`src = "data:image/png;base64,…"`).
- `new Worker(` or `importScripts(` with a remote URL.

The current tree is clean. This is only about the gate's coverage.

**Fix:** Add patterns, each with a sample:
- `/\bfrom\s*["'](https?:)?\/\/|\bimport\s*\(\s*["'](https?:)?\/\//`
- `/\bcreateElement\s*\(\s*["'](img|audio|video|source)["']/i`
- `/["'`]data:(image|audio|font|video)\//i`
- `/\bnew\s+(Shared)?Worker\s*\(|\bimportScripts\s*\(/`

### IN-04: [new, 60c34ac] IN-05's "suspended with no resume pending stays not-rendering" branch has no clock-advanced test

**File:** `src/audio/audio-engine.ts:392-395`, `src/audio/audio-engine.test.ts:227-237`

**Issue:** The fix report says a context suspended with no resume pending is still not rendering. The existing test at `:227` ("a suspended context with no resume in flight drops cues") predates `isRendering`. It does not pin the case where `currentTime > startAudioT` (a context that ran, then was suspended at the OS level, with its clock advanced). If someone drops the `this.resumePending &&` term from `isRendering`, flush would treat that suspended context as rendering. It would keep building voices that never end, and steals would skip teardown. That is the original leak.

**Fix:** In that test, set `fake.currentTime` past the value it had at unlock before the suspended flush, and assert `flush()` returns 0 and `activeVoices()` is 0.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
