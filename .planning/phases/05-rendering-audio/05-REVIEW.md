---
phase: 05-rendering-audio
reviewed: 2026-11-22T00:27:22Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/audio/audio-engine.test.ts
  - src/audio/audio-engine.ts
  - src/render/asset-free.test.ts
  - src/sandbox/main.ts
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
  necessity: 0
status: issues_found
---

# Phase 5: Code Review Report (incremental: round-3 fix commits b04d725, 7487c53, 2ae42d4)

**Reviewed:** 2026-11-22T00:27:22Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found
**Scope:** `git diff cf48843..HEAD -- src`. For context I also read `src/audio/voice-pool.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/audio-unlock.ts` and the frame loop in `src/sandbox/main.ts:397-475`. I modelled resume behaviour on the Web Audio spec's `resume()` algorithm and its "control message to resume" steps.

## Summary

The episode model is sound. I traced every path through `unlock()`/`flush()` against the five stated invariants:

1. **Bounded:** holds on every input where the engine sees `state === "running"` at least once during each run of the context. One unobserved run leaves `startAudioT` stale and lets the graph grow without limit (IN-01). Reaching that needs a rAF-paused run followed by a stuck resume, so I list it as hardening.
2. **"start" survives:** holds for the episode's opener and for its first activating, non-rendering re-gesture. It does **not** hold for any later activating gesture. The spec allows one reachable case: a device start that fails, then recovers inside the same episode (WR-01).
3. **No hard cut while the clock advances:** holds. Both discard sites (`unlock()`'s re-arm and `flush()`'s not-playable branch) are gated by `isRendering`. `isRendering` can only miss an advancing clock if `resumePending` is false while `state` still lags, and the spec rules that out (see the residual below).
4. **Reject reported once per episode:** holds. The throw path and the reject path share `rejectReported`, and only `endEpisode()` resets it.
5. **Running then suspended resets:** holds whenever the engine observes the run (the IN-01 caveat applies).

**Does the table exercise them?** Mostly. The 84 rows cover invariants 2-4 over the gesture and outcome space that was modelled. The 8 held-key cases and the dedicated tests cover 1, 4 and 5. Gaps:
- no outcome where an activating resume fails and a later one succeeds (WR-01);
- no run the engine does not observe (IN-01);
- no row asserts a node bound. Invariant 1 rests on the held-key cases alone;
- invariant 3 is measured only for cuts caused by `unlock()`. A cut made by `flush()` is caught only when it hits the "start" voice (`startCut`).

**The out-of-scope residual (one `resumePending` flag, late settle).** It is reachable, but harmless. The spec settles every promise in `[[pending resume promises]]` and sets `state` to `"running"` in the **same** queued task. The `.then` callbacks then run at that task's microtask checkpoint, before any later gesture task can call `resume()`. An earlier promise can resolve while `state` is still suspended and a newer start is under way? That cannot happen. There is exactly one spec path where an earlier settle clears the flag while a newer resume stays in flight. A blocked resume A sits on the pending list. An allowed resume B attempts a device start, and the start fails. The failure task rejects only the pending-list promises, so A rejects. B was never on the list, so B never settles. The flag is now false while B is "in flight". But the device failed, so dropping cues and discarding voices is the correct result. Scratch repro B shows it: `flush` returns 0 and no voice stays held. A synchronous throw from `resume()` (the `catch` at `audio-engine.ts:347-350`) also clears the flag over an older pending promise, but only non-conforming engines throw. **No change needed.**

`asset-free.test.ts` (IN-02 regexes) and the `main.ts` doc edit: no defects. `tsc`, `vitest` and `eslint` were reported green by the fixer and not re-run here.

**Scratch repros:** `C:\Users\aster\AppData\Local\Temp\claude\de811a44c71c6315\0f5cbbd4-c854-4188-a9bc-a1b26aab1b8a\scratchpad\r4\episode.spec.ts`. Run them with `npx vitest run --config <scratch>/r4/vitest.config.mjs --dir <scratch>/r4` from the repo root. All 4 pass. Their output: `A start flushed: 0`; `B flush after A rejects with B in flight: 0 active 0`; `C built 15 connected nodes 0` (windowsOpened 1, which re-anchors and is safe); `C2 built 600 connected nodes 3000` (episode spent, stale anchor: unbounded).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Invariant 2 holds only for the episode's first two gestures. After a failed device start, the recovering Enter's "start" figure is dropped

**File:** `src/audio/audio-engine.ts:327-336` (doc: `:23-30`)
**Issue:** The fix report states invariant 2 without a condition: the "start" figure survives an activating gesture whose context starts within STARTING_WINDOW_MS. The code grants windows only to the opener and to the first activating, non-rendering re-gesture (`windowsOpened` 0 to 1 to 2). Any later activating gesture in the same episode gets no window, even if its own `resume()` is the one that starts the device. One reachable sequence follows the spec's resume algorithm:
1. Shift (not activating) opens window 1. Its resume A is blocked and goes on the pending list.
2. Z (activating) re-arms, so `windowsOpened = 2`. Its allowed resume B attempts a device start.
3. The start fails: the device is busy in exclusive mode, or a Bluetooth headset is still connecting. A rejects (reported once). B never settles.
4. The device recovers. Enter (activating) calls resume C, and the device starts 60 ms later.
5. `isStarting` is false because no window is open and `resumePending` was cleared by A. The "start" frame's `flush` returns 0 and the figure is lost.

Scratch repro A (`episode.spec.ts`, "A. invariant 2…") asserts `flushed === 0`, and it passes. A held activating key during the failure spends window 2 in the same way. The 84-row table cannot reach this: its only success outcome ("runs") starts the device 60 ms after the *first* activating gesture, and no row has a failure followed by a success.
**Fix:** Do not reopen windows on rejection. That brings back the WR-02 unbounded case. Make the stated invariant match the bound and pin it with a test. Change the header line at `:23-27` to something like: "the 'start' figure survives when the device starts within STARTING_WINDOW_MS of the episode's opener or of its first activating, non-rendering re-gesture; a later gesture in a spent episode gets no window (the cost of the two-window bound)". Then add an outcome to the table such as `"fails-then-runs"`: the first activating resume rejects, and the device starts 60 ms after the next activating gesture. Assert `startFlushed === 0` for rows where that gesture is the episode's third, so the trade-off is documented rather than accidental.

## Info

### IN-01: The rendering test compares the clock with a per-window anchor, so an unobserved run makes a frozen, suspended context count as "rendering" forever

**File:** `src/audio/audio-engine.ts:452-455`, `:370-373`, `:357-360`
**Issue:** `isRendering` returns true when `resumePending && state === "suspended" && currentTime > startAudioT`. `startAudioT` is anchored only when a window opens. Suppose the context runs and is suspended again with no `flush()`/`unlock()` in between: a rAF-paused page, or a long main-thread task. Then `endEpisode()` never runs and `windowsOpened` stays at 2, so the next gesture opens no window and does not re-anchor. That gesture sets `resumePending = true`. If its resume stays pending (an allowed outcome, per the header), every frame counts as rendering on a frozen clock. Voices are admitted with `rendering = true`, so stolen voices are never torn down, and `onended` never fires. Scratch repro C2: 600 frames build 600 voices and leave 3000 nodes connected, growing linearly. Invariant 1 is broken, and invariant 5 does not apply because the run was never observed. With `windowsOpened === 1`, the activating re-arm re-anchors and the graph stays bounded (repro C). Reaching this needs an unobserved run plus a stuck resume afterwards. I could not show that combination on a shipping browser: desktop Chrome keeps hidden-tab contexts running, and iOS reports `"interrupted"`, which fails the `"suspended"` check. So it is listed as hardening, not as a reachable defect.
**Fix:** One line. Re-anchor the audio clock whenever a resume goes in flight from idle. `isRendering` only counts while `resumePending` is true, so this is exactly the moment the anchor must be fresh:
```ts
// unlock(), before `this.resumePending = true;`
if (!this.resumePending) this.startAudioT = ctx.currentTime;
this.resumePending = true;
```
The anchor is not touched while a resume stays pending, which keeps IN-05's interval detection. Also add C2 as a regression test. I checked this in a scratch copy of `src/`: with the line applied, all 117 existing `audio-engine.test.ts` tests pass and C2 drops to 0 voices built and 0 nodes connected.

---

_Reviewed: 2026-11-22T00:27:22Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
