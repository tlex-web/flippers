---
phase: 05-rendering-audio
reviewed: 2026-11-21T00:00:00Z
depth: standard
files_reviewed: 50
files_reviewed_list:
  - index.html
  - src/app/cue-queue.test.ts
  - src/app/cue-queue.ts
  - src/audio/audio-context-like.ts
  - src/audio/audio-engine.test.ts
  - src/audio/audio-engine.ts
  - src/audio/audio-unlock.test.ts
  - src/audio/audio-unlock.ts
  - src/audio/envelope.test.ts
  - src/audio/envelope.ts
  - src/audio/mapping.test.ts
  - src/audio/mapping.ts
  - src/audio/recipes.test.ts
  - src/audio/recipes.ts
  - src/audio/test/fake-audio-context.ts
  - src/audio/voice-pool.test.ts
  - src/audio/voice-pool.ts
  - src/control/flipper-controller.test.ts
  - src/control/flipper-controller.ts
  - src/control/plunger-controller.test.ts
  - src/control/plunger-controller.ts
  - src/game/reactive-elements.test.ts
  - src/game/reactive-elements.ts
  - src/input/game-input.test.ts
  - src/input/game-input.ts
  - src/render/asset-free.test.ts
  - src/render/contact-flash.test.ts
  - src/render/contact-flash.ts
  - src/render/flash.test.ts
  - src/render/flash.ts
  - src/render/interpolate.test.ts
  - src/render/interpolate.ts
  - src/render/palette.ts
  - src/render/sprites.ts
  - src/render/static-layer.test.ts
  - src/render/static-layer.ts
  - src/render/table-renderer.test.ts
  - src/render/table-renderer.ts
  - src/render/test/recording-context.ts
  - src/render/view-transform.test.ts
  - src/render/view-transform.ts
  - src/sandbox/cue-pipeline.test.ts
  - src/sandbox/main.ts
  - src/sandbox/presentation-observer.test.ts
  - src/sandbox/presentation-observer.ts
  - src/sandbox/presentation.determinism.test.ts
  - src/sim/loop.flippers.test.ts
  - src/sim/loop.ts
  - src/ui/key-labels.test.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
  necessity: 0
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-11-21
**Depth:** standard
**Files Reviewed:** 50
**Status:** issues_found

## Summary

I reviewed the Phase 5 rendering and audio stack: the cue queue and observer, the audio engine, unlock, envelope, mapping, recipes and voice pool, the flash tracker and contact flash, the table renderer, static layer, sprites, view transform and interpolation, the flipper-angle snapshots in the loop, the new presentation counters in the controllers and reactive elements, the mute key, and the sandbox wiring.

The simulation and presentation are well separated. The observer, contact flash and cue feedback only write scalars and never mutate the world. The step-path code allocates nothing. The renderer resets its composite and alpha state. Element ids line up across the flash tracker, the recipes and `TABLE_SPEC`: flippers are 0/1, bumpers 200-202 and the drain is 600.

The two real defects are both in the audio scheduling, and neither is caught by the fake `AudioContext`:

- **WR-01:** The mute ramp, and the voice-steal fade in Firefox, start from a stale automation event. The 50 ms fade is effectively an instant cut, so muting clicks.
- **WR-02:** The fake context starts in the `"running"` state, so nothing tests the gap between creating the context and it actually starting. Cues in that gap, including the very first "start" jingle, are thrown away.

No security issues. The only untrusted input is keyboard and pointer events, which are gated by `isTrusted`, and a `?debug=1` query parameter compared with exact string equality.

I read `necessity-review.md` and found no necessity findings that meet its evidence rule. Most remaining guards are `noUncheckedIndexedAccess` artifacts, test seams (the `NO_FEEDBACK` default, nullable `flash` and `lights`) or real browser differences (the `cancelAndHoldAtTime` feature check).

## Warnings

### WR-01: Mute ramp and Firefox voice-steal fade start from a stale event, so the 50 ms fade is effectively an instant cut

**File:** `src/audio/audio-engine.ts:104-112`, `src/audio/voice-pool.ts:50-53`, `src/audio/voice-pool.ts:127-133`

**Issue:** `linearRampToValueAtTime` always ramps from the *previous automation event's* time and value. It does not ramp from "now". `holdAt()` does not insert an anchor at `now` in the cases these call sites hit.

- **Master mute (all browsers).** The master gain's only event is `setValueAtTime(MASTER_GAIN, buildTime)` from `build()`.
  - `cancelAndHoldAtTime(now)` finds no ramp after `now`, and the last event before it is a plain set. Per the Web Audio spec, nothing is inserted.
  - The following `linearRampToValueAtTime(0, now + 0.05)` therefore runs from `(buildTime, 0.6)`. At `now` the gain is already `0.6 * 0.05 / (now + 0.05 - buildTime)`, which is about 0.0005 after one minute of play.
  - Muting during play (with voices sounding) is a hard cut and clicks, so D-02's "linear ramp over MUTE_RAMP_S" does not hold.
  - Every later toggle has the same problem: it ramps from the end of the previous ramp, not from `now`.
- **Voice steal (Firefox).** Firefox has no `cancelAndHoldAtTime`, so the fallback `cancelScheduledValues(now)` deletes the in-progress exponential decay. The 5 ms linear fade then starts from the attack peak event `(t0 + attack, peak)`. The gain jumps away from its current decaying value, and the steal clicks: the code comment says "still within a few ms", but the level is wrong.
- **Why tests pass.** The tests assert only the event list (`audio-engine.test.ts:100-114`). `FakeParam` records events but does not evaluate the timeline, so this is invisible to them.

**Fix:** For the master, use a target curve, which starts from the current value by definition and needs no anchor. Add `setTargetAtTime` to `AudioParamLike`:

```ts
// audio-context-like.ts
setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;

// audio-engine.ts setMuted
const now = ctx.currentTime;
master.gain.cancelScheduledValues(now);
master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, now, MUTE_RAMP_S / 4);
```

For the steal path, anchor explicitly after the hold. Add `readonly value: number` to `AudioParamLike`; `AudioParam` already has it.

```ts
export function holdAt(param: AudioParamLike, time: number): void {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(time);
  } else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time); // ramp now starts at the current level
  }
}
```

Also teach `FakeParam` to evaluate `valueAt(t)` per the spec, and assert the level at `now` and at `now + MUTE_RAMP_S / 2`, so the test actually checks the ramp.

### WR-02: Cues recorded before a new context reports "running" are dropped, so the first "start" jingle can be lost

**File:** `src/audio/audio-engine.ts:138-160`, `src/audio/audio-engine.ts:191-197`; untested because `src/audio/test/fake-audio-context.ts:165` starts at `"running"`

**Issue:** The first trusted gesture is normally Enter, which both unlocks audio and latches the game start.

1. `unlock()` constructs the context in the keydown.
2. In the next rAF frame, the step runs `session.onStart()`, the observer pushes `"start"`, and `audio.flush(cues)` runs.
3. `flush()` drops and clears every cue unless `ctx.state === "running"`.

Per the Web Audio spec, a newly constructed context starts with control-thread state `"suspended"` and switches to `"running"` asynchronously, via a queued task and `statechange`, once the audio device starts. Gecko and WebKit behave this way, and device start-up on Windows/macOS can take tens of milliseconds, which is longer than one frame.

The very first game-start figure is therefore likely silent on those engines, and so is any cue during that window: a flipper press right after Enter, or a resume after an OS-level suspend. Test (g) in `cue-pipeline.test.ts:291` passes only because the fake is `"running"` from construction.

**Fix:** Treat a context that is starting as playable. Web Audio lets you build and schedule nodes on a suspended context; `currentTime` is frozen, so voices scheduled at `currentTime + SCHEDULE_AHEAD_S` play as soon as the context starts. Track a pending resume and only drop when the context is suspended with no resume in flight, or closed:

```ts
private starting = false; // set true in unlock() when the context was just created or resume() was called;
                          // cleared in resume().then/catch and on ctx 'statechange' to running

flush(cues: CueQueue): number {
  const ctx = this.ctx, master = this.master;
  const playable = ctx !== null && (ctx.state === "running" || (this.starting && ctx.state === "suspended"));
  if (this.muted || master === null || !playable) { cues.clear(); return 0; }
  ...
}
```

Add a fake test that sets `fake.state = "suspended"` before `unlock()`, flushes a `"start"` cue, and expects voices to be scheduled.

## Info

### IN-01: The flash clock runs one step ahead of the interpolated scene, and the first rendered frame of every flash is already past its hold

**File:** `src/render/flash.ts:104-126`, `src/sandbox/main.ts:283-292`

**Issue:** `record()` stamps `stepCount = N` during step N's `onPostStep`, then `flash.tick()` advances to N+1 before any render. So the youngest age `level()` can return is `1 + alpha`.

- `FLASH_CONTACT` (hold 0, decay 5) is never drawn at its 0.35 peak: the first visible level is at most `0.35 * e^-0.2`, about 0.29.
- A sling's one-step hold is used up before the first frame.

Meanwhile balls and bats are drawn at `previous + alpha`, which is one step behind `current`. The flash therefore leads the ball it reacts to by about one step.

**Fix:** Either stamp `hitAt[id] = stepCount + 1` in `record()` (age 0 at the post-tick render point), or evaluate `level()` at `stepCount - 1 + alpha` to match the interpolation. Then update `flash.test.ts` accordingly.

### IN-02: `FixedStepLoop.advance` does not floor a negative delta, so `alpha` can go below 0 and interpolation extrapolates

**File:** `src/sim/loop.ts:87`, `src/sandbox/main.ts:384,395`

**Issue:** `lastTimeMs` is seeded from `performance.now()`. Browsers can pass a first rAF timestamp that is earlier than that value: the timestamp is the frame's begin time. A negative `deltaMs` goes through `Math.min(realDeltaMs, MAX_FRAME_MS)` unchanged, the accumulator goes negative, and `alpha` becomes negative.

That breaks the documented `[0, 1)` contract. `interpolateBalls` and `interpolateAngles` (newly fed by `loop.alpha` this phase) do not clamp it, while `FlashTracker.level` does. The effect is invisible at boot because nothing moves yet, but the contract is broken.

**Fix:** `const clamped = Math.min(Math.max(realDeltaMs, 0), MAX_FRAME_MS);`, or seed `lastTimeMs` from the first rAF timestamp.

### IN-03: The mute key ignores modifiers and there is no on-screen mute state

**File:** `src/input/game-input.ts:97-105`, `index.html:174-175`

**Issue:** `KeyM` latches a mute toggle and calls `preventDefault()` whatever modifiers are held. Two consequences:

- Ctrl+Shift+M (Firefox responsive design mode) and Cmd+M (macOS minimize) both toggle mute as a side effect.
- After Cmd+M, the keyup is often lost to the minimize, so `held` keeps `KeyM` until the next blur.

Separately, the HUD never shows whether sound is muted: `isMuted()` has no consumer outside tests. A player who presses M by accident gets silence with no explanation. Before unlock, M silently arms a muted master.

**Fix:** In `handleKeyDown`, ignore bound codes when `e.ctrlKey || e.metaKey || e.altKey`; this needs those fields on `KeyEventLike`. Show a small "MUTED" marker in the HUD, written only on change like the other lines.

### IN-04: The asset-free gate has blind spots

**File:** `src/render/asset-free.test.ts:30-62`

**Issue:** The extension regex leaves out several types: `ico`, `avif`, `bmp`, `mp4`, `m4a`, `aac`, `flac`, `opus` and `eot`. There is no pattern for `<audio`, `<video`, `<source` or `<link rel="icon"`. Only `.ts` and `index.html` are scanned, so a future `.css` or `.js` file, or a `public/` directory, is never checked.

**Fix:** Add the missing extensions and element patterns, and widen the glob to `/src/**/*.{ts,js,css,html}`, plus a check that `public/` does not exist.

### IN-05: Per-element pitch offsets hard-code `TABLE_SPEC` ids inside the recipes

**File:** `src/audio/recipes.ts:85`, `src/audio/recipes.ts:135`

**Issue:** `idSemitones: { 200: 0, 201: 2, 202: -3 }` and `FLIPPER_ID_SEMITONES = { 0: 0, 1: 1 }` silently depend on the spec's id numbering. A renumbered or added bumper gets offset 0 with no test failure, so the "each bumper has its own pitch" behaviour quietly disappears.

**Fix:** Derive the maps from `TABLE_SPEC` (for example, by bumper index), or add a recipes test asserting that every bumper and flipper id in `TABLE_SPEC` has an entry.

### IN-06: `AudioEngine.unlock` edge cases: leaked context on a `build()` failure, and an error logged on every key with a closed context

**File:** `src/audio/audio-engine.ts:138-160`

**Issue:**

- If `createContext()` succeeds but `build()` throws (for example, a missing `createDynamicsCompressor`), the context is dropped without `close()`. It keeps holding an audio device and counts against the browser's context limit.
- If the context ever reaches `"closed"`, every later gesture, including each flipper keydown, calls `resume()`. That call rejects and logs `console.error`, flooding the console during play.

**Fix:** In the catch, call `ctx.close?.()` on the context you just created. In `unlock()`, return early when `ctx.state === "closed"`, and report it once.

### IN-07: A global 30 s `testTimeout` applies to every test, not just the heavy simulation suites

**File:** `vitest.config.ts:18-19`

**Issue:** The comment says the timeout is for heavy simulation tests, but `testTimeout: 30000` applies to the whole suite. A unit test that hangs (for example, an un-awaited promise in the audio unlock tests) now takes 30 s to fail instead of 5 s, which hides regressions in the fast suites.

**Fix:** Keep the 5 s default, and set `{ timeout: 30_000 }` on the heavy `describe`/`it` blocks: the determinism, e2e and loop-flipper suites.

---

_Reviewed: 2026-11-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
