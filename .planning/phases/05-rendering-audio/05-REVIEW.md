---
phase: 05-rendering-audio
reviewed: 2026-11-21T23:50:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/audio/audio-engine.test.ts
  - src/audio/audio-engine.ts
  - src/audio/voice-pool.test.ts
  - src/audio/voice-pool.ts
findings:
  critical: 0
  warning: 1
  info: 7
  total: 8
  necessity: 1
status: issues_found
---

# Phase 5: Code Review Report (incremental: WR-01 fix f1b2a1e)

**Reviewed:** 2026-11-21
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found
**Scope:** `git diff 3a0636c..HEAD -- src/audio`, the single fix commit f1b2a1e (+314/-34). Context read: `src/audio/test/fake-audio-context.ts`, `src/audio/audio-unlock.ts`, `src/audio/envelope.ts`, `src/sandbox/main.ts`.

## Summary

This pass checks the fix for the prior pass's WR-01 ("Voices queued on a frozen-clock suspended context are never torn down, so the 16-voice bound does not hold for the audio graph"). IN-01 to IN-04 are carried forward unchanged from the prior pass: their code was not touched, and I re-checked that each one still applies. IN-05 onward and WR-01 are new findings about the f1b2a1e fix code.

**Is the prior WR-01 resolved?** Mostly, yes.

| Point | Verdict | Notes |
|---|---|---|
| (1) Graph growth while `resume()` never settles | Resolved | Within the window, a steal with `rendering=false` disconnects the stolen voice at once. At most 16 voices stay connected. After the window, `flush()` builds nothing. The window opens only when no resume is pending, so node creation is limited to one window (about 15 frames) for each pending resume. One caveat: started sources on a context that never renders cannot finish, so the browser may keep the disconnected nodes alive. They stop costing processing, but memory is bounded by the window rather than by the pool. |
| (2) Stale burst on a late start | Resolved | The first flush after the deadline calls `discardAll`, which stops and disconnects every held voice. A voice can sound at most about STARTING_WINDOW_MS late, apart from the state-lag race in IN-05. |
| Regression in the scenario the window was built for | **New WR-01** | A Shift keydown creates the context, its resume never settles, and the window expires. The window then never reopens. When the player presses Enter, the context really starts, but the "start" cue arrives while the context still reports `suspended`, so it is dropped. Before the fix it played. I reproduced this against the fake context with a scratch test: `flush` returns 0. |

**Regression checks that passed:**
- **Double teardown or release.** `steal()` and `prune()` splice the handle out of `active`. A later `onended` calls `release` (an `indexOf` miss, so a no-op) and then `teardown()` again. Calling `AudioNode.disconnect()` with no arguments never throws, so repeating it is safe. `discardAll` walks downward, so its splices do not skip anything.
- **Release then teardown order.** This order is fine, and neither call can throw.
- **A voice removed from the pool twice.** This is impossible: every removal path splices by its current index, and `release` tolerates a miss.
- **`resume()` rejection.** Rejection clears `resumePending`. The next flush is then not starting and discards. The next gesture opens a fresh window. The stale `startingUntilMs` is harmless because it is only read when `resumePending` is true.
- **Running, then suspended (with no resume pending), then running.** While suspended, `flush` discards. After resume, the stopped sources fire `onended`, and both calls in it are no-ops. The Safari `interrupted` state is never playable, which is correct. A closed context discards once, and later flushes find the pool empty.
- **"start" on a first-gesture Enter.** This still sounds. The window opens in `unlock()`, and the cue is built at the frozen `currentTime`.
- **Mute paths.** `setMuted`, `masterLevelAt` and `build` are unchanged, so the live-level anchoring from the earlier WR-01 fix is intact.
- **Allocation in `flush()`.** None was added. `isStarting` reads the clock only when `resumePending && suspended`, and `discardAll` on an empty pool is a loop that never runs. The new `teardown` closure is allocated once per voice, not per frame.

**Do the new tests test what they claim?** The "bounded window" engine test is meaningful:
- Without teardown on steal, the per-frame `connected <= graphBound` assertion fails by frame 2.
- If the re-gesture at frame 60 reopened the window, `started === 0` would fail.

The "starts inside the window" test is weak, and the double-teardown path has no test at all. See IN-06.

**Necessity:** I read `necessity-review.md`. One finding applies (IN-07).

## Warnings

### WR-01: [new, f1b2a1e WR-01 fix code] The starting window never reopens while the first resume is pending, so the "start" cue is dropped when a real activation finally starts the context

**File:** `src/audio/audio-engine.ts:250-254` (window opens only when `!this.resumePending`), `src/audio/audio-engine.ts:315-320` (drop and discard), `src/audio/audio-engine.ts:341-343` (`isStarting`), `src/audio/audio-unlock.ts:41-45` (any non-Escape keydown, including a modifier, unlocks)

**Issue:** The window opens once for each pending resume, and the fix assumes a later gesture cannot help. It can. The prior review gave this case as its main example:
1. The player presses Shift (a flipper key) first. `AudioUnlock` creates the context. Chromium does not count a modifier-only keydown as activation, so `resume()` stays pending, and the window expires 250 ms later.
2. The player presses Enter. `unlock()` sees `resumePending === true`, so it calls `resume()` but does **not** reopen the window. This `resume()` has activation, so the context really starts, which takes tens of ms.
3. The "start" cue is recorded on the next fixed step and flushed in the same frame (`main.ts:406-407`), while `ctx.state` is still `"suspended"`. `isStarting()` is false because the deadline has passed. `flush` calls `discardAll`, drops the cue and returns 0.

Before f1b2a1e this cue played, because `resumePending && suspended` alone made the context playable. So the fix loses the very "start" figure that WR-02 added the starting state to protect. It also loses any other cue in the first frames after the first real activation.

**Reproduced:** I ran a scratch vitest against the real engine and the fake context. The resume never settles. I called `unlock()` at 1000 ms, then `unlock()` at 3000 ms, then pushed a `"start"` cue and flushed at 3016 ms. The result was `flush() === 0`.

**Fix:** Reopen an expired window when the new gesture can actually start the context. Do not reopen it on every keydown: Shift auto-repeat while held would reopen it every 250 ms. Each reopening keeps creating sources that a context that never renders cannot finish, which brings node growth back. Inject an activation probe next to the clock:

```ts
// constructor: isActivation: () => boolean = () => navigator.userActivation?.isActive ?? true
// unlock():
const nowMs = this.clock();
const expired = nowMs >= this.startingUntilMs;
if (!this.resumePending || (expired && this.isActivation())) {
  // Voices from an expired window must not ride into the new one.
  if (this.resumePending) this.pool.discardAll(ctx.currentTime);
  this.startingUntilMs = nowMs + STARTING_WINDOW_MS;
}
```

A simpler option is to make `AudioUnlock` ignore modifier-only keydowns (`Shift`, `Control`, `Alt`, `Meta`, `CapsLock`). Then the context is created on the first gesture that can start it. Either way, add the scratch scenario as an engine test: a stuck resume, an expired window, a re-gesture with activation, then "start" flushed while still suspended, expecting 1.

## Info

### IN-01: [new, WR-02 fix code] The sandbox header still says cues are dropped while the context is not running

**File:** `src/sandbox/main.ts:55-58`

**Issue:** This is carried forward and still applies, because f1b2a1e did not touch `main.ts`. The header says: "a cue recorded before that, or while the context is not running, is dropped, never replayed." In fact, a suspended context with a resume in flight is playable for up to STARTING_WINDOW_MS (`audio-engine.ts:316`, `341-343`), and its cues are voiced. The composition root's documentation contradicts the engine, and the contradiction is now larger because the window is bounded.

**Fix:** Reword it to: "a cue recorded before that, or while the context is neither running nor starting (suspended with a resume in flight, at most STARTING_WINDOW_MS), is dropped; cues on a starting context are scheduled and sound when it runs."

### IN-02: [new, IN-03 fix code] A second live region contradicts the "only announced line" documentation, and unmuting is silent to assistive tech

**File:** `index.html:79-80`, `index.html:89-90`, `index.html:189`, `src/ui/hud.ts:14-16`

**Issue:** This is carried forward and still applies; the files are unchanged.
- `#hud-mute` is a second `role="status" aria-live="polite"` region.
- It sits inside the controls `<dl>`, which the CSS comment calls "a static key/action list, not announced".
- `.hud-status` is documented as "the one announced line", and `hud.ts:14-16` says the status line "is the only line announced to assistive tech".
- Unmuting writes `""`. Clearing a live region announces nothing, so a screen-reader user hears "MUTED" but never hears that the sound is back on.

**Fix:** Update the three comments to describe two live regions. Then either accept that unmuting is silent (and say so), or announce through a visually hidden sibling that reads "Sound on" or "Muted".

### IN-03: [new, IN-04 fix code] The asset gate still misses remote stylesheets, fonts and scripts

**File:** `src/render/asset-free.test.ts:35-77`

**Issue:** This is carried forward and still applies; the file is unchanged. None of the following is caught:
- `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`
- CSS `@import "https://..."`
- `<script src="https://cdn...">`, `<object>`, `<embed>` and `<iframe>`
- `new WebSocket(` and `new EventSource(`
- CSS `image-set(`

**Fix:** Add patterns, each with a positive sample:

```ts
{ name: "remote URL in markup or CSS", re: /\b(href|src)\s*=\s*["']?(https?:)?\/\//i, sample: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">' },
{ name: "CSS @import", re: /@import\b/i, sample: '@import "https://x/y.css";' },
{ name: "embedded document element", re: /<(object|embed|iframe)\b/i, sample: '<iframe src="x"></iframe>' },
{ name: "streaming connection", re: /\bnew\s+(WebSocket|EventSource)\s*\(/, sample: 'new WebSocket("wss://x");' },
```

### IN-04: [new, WR-01 fix code] Envelope points are built twice per layer; the steal anchor relies on two independent calls staying in step

**File:** `src/audio/audio-engine.ts:445-446` (was 375-376), `src/audio/envelope.ts:108-123`

**Issue:** This is carried forward. I re-assessed it, and it still applies: f1b2a1e did not change how envelope points are built.
- `buildLayer` calls `applyEnvelope(env.gain, lt, envelope, peak)`, which builds and schedules its own points.
- It then calls `envelopePoints(lt, envelope, peak)` a second time to store on the handle for `envelopeValueAt`.
- Today the two agree because both are pure functions of the same inputs. If they ever diverge, the steal anchor drifts silently.

The fix makes this matter more. `discardAll` and the non-rendering steal now also anchor their fades through `envelopeValueAt(env.points, now)` (`voice-pool.ts:179`).

**Fix:** Build the points once and schedule that same array (`scheduleEnvelope(param, points)`), or have `applyEnvelope` return the points it scheduled.

### IN-05: [new, f1b2a1e WR-01 fix code] `state === "running"` lags real rendering, so a steal or discard during start-up can cut a voice that is already sounding

**File:** `src/audio/audio-engine.ts:315-316`, `src/audio/audio-engine.ts:342`, `src/audio/voice-pool.ts:184`

**Issue:** The fix uses `ctx.state === "running"` to decide that a context is rendering. Per the Web Audio spec, the control thread updates `state` in a queued task *after* the rendering thread has started. `currentTime` starts advancing before `state` flips. In that interval:
- **(a)** A steal passes `rendering=false`. `steal()` calls `teardown()` at once, so a voice that is actually sounding is disconnected mid-waveform. That cuts the 5 ms fade, which is the click the `rendering` flag exists to prevent.
- **(b)** If the interval straddles the deadline, `flush` calls `discardAll` on voices that are audibly playing, which also causes a click.

Both need start-up to finish within one task turn of a steal or of the deadline, so this is rare.

**Fix:** Also treat the context as rendering once its clock has moved. Record `ctx.currentTime` when the window opens, and use `const rendering = ctx.state === "running" || ctx.currentTime > this.startAudioT;` in `flush()`. The same check in `isStarting()` stops a context whose clock is already advancing from being discarded.

### IN-06: [new, f1b2a1e WR-01 fix code] The "starts inside the window" test cannot detect a too-short window, and the double-teardown path has no test

**File:** `src/audio/audio-engine.test.ts` (the `"a context that starts inside the window keeps the voices scheduled while starting"` case, and `stuckRig`)

**Issue:**
- **The "starts inside the window" test.** It flushes once at window open, then flips the fake to `"running"` before the second flush. So `isStarting()` is only ever checked at t = 0 ms. With `STARTING_WINDOW_MS = 1` the test still passes. It never checks that a *still-suspended* flush at +40 ms is playable, and that check is what "inside the window" means.
- **No test for `onended` after a pool teardown.** No test fires `onended` after `discardAll` or a non-rendering steal (`release` miss plus a second `teardown()`). The fix report says this is safe, and it is, but nothing pins it.
- **The WR-01 scenario is not covered** (a re-gesture with activation after expiry).
- **Minor:** `await Promise.resolve()` in the first test has no effect, because the stuck resume never settles.

**Fix:** In the inside-window test, add a suspended flush at `clock.ms += 40` that expects 1 before switching to running. In the bounded-window test, after the window expires, set `fake.state = "running"`, call `fake.fireAllEnded()`, and assert that `activeVoices()` stays 0 and nothing throws. Add the WR-01 regression test.

### IN-07: [new, f1b2a1e WR-01 fix code] Already-defended-elsewhere: `add()`'s steal loop, and the `rendering` flag added to it, never run from the engine

**File:** `src/audio/voice-pool.ts:111-117`, `src/audio/audio-engine.ts:364`, `src/audio/audio-engine.ts:395`
**Category:** necessity

**Issue:** `play()` calls `pool.admit(...)`, then builds the voice synchronously, then calls `pool.add(handle, rendering)`. Nothing between the two touches the pool: `onended` cannot fire synchronously, and `buildLayer` only calls context factories. `admit()` exits only when `active.length < maxVoices` (`voice-pool.ts:104-107`). So `add()`'s `while (active.length >= maxVoices)` body never runs in production, and the `rendering` argument the fix threads into it has no effect. Only the pool unit test on a 1-voice pool reaches that path. The `= true` defaults on `admit` and `add` also mean a future caller that forgets the flag silently gets the leaking behaviour on a non-rendering context.

**Fix:** This is a scope decision. Either keep the loop as a documented public-API invariant, or reduce `add()` to `push`. In either case, consider making `rendering` a required parameter on `admit`, so that forgetting it is a type error rather than a quiet leak.

---

_Reviewed: 2026-11-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
