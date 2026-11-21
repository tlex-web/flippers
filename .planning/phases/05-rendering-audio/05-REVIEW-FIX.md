---
phase: 05-rendering-audio
fixed_at: 2026-11-21T22:35:00Z
review_path: .planning/phases/05-rendering-audio/05-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-11-21T22:35:00Z
**Source review:** .planning/phases/05-rendering-audio/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (2 warnings, 7 info; fix_scope = all; no necessity findings)
- Fixed: 9
- Skipped: 0

## Verification

- **Per fix:** `tsc --noEmit` and the affected test files. These ran in the isolated worktree, which resolved `node_modules` from the main checkout through the parent directories. Nothing was linked or copied.
- **Final, in the worktree at 023ded9:** `tsc --noEmit` clean, `vitest run` gave 52 files and 758 tests passing, and `eslint` on every changed `.ts` file was clean.
- **Final, in the main checkout after the fast-forward to 023ded9:** `npx tsc --noEmit` clean and `npx vitest run` gave 758/758 passing. These results can be reproduced from the main tree.
- **Commits:** made with plain `git commit` on explicit paths. No pre-existing dirty files (`.planning/config.json`, `.planning/state.json`, `.planning/research/.cache/`) were staged.

## Fixed Issues

### WR-01: Mute ramp and Firefox voice-steal fade start from a stale event, so the 50 ms fade is effectively an instant cut

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/voice-pool.ts`, `src/audio/envelope.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/audio-engine.test.ts`, `src/audio/voice-pool.test.ts`
**Commit:** 11ab06a
**Status:** fixed: requires human verification (audio scheduling logic, listen in Chrome and Firefox)
**Applied fix:** The fix differs from the review's suggestion in two places:
- **Master mute.** The engine now tracks the master gain's linear segment and computes the live level. `setMuted` does `cancelScheduledValues(now)`, then `setValueAtTime(level, now)`, then a linear ramp over MUTE_RAMP_S. This keeps D-02's linear ramp, needs no `setTargetAtTime`, and is exact in every browser because `now === currentTime`.
- **Voice steal.** The review proposed `param.value`. That reads the level at `currentTime`, but the steal time is `currentTime + 5 ms`, and in Firefox `cancelScheduledValues` would also drop the in-progress decay for those 5 ms. Instead, `VoiceHandle.envs` now carries each gain's envelope points, and `envelopeValueAt(points, now)` gives the exact level. `holdAt(param, time, value)` then anchors in one of two ways:
  - With `cancelAndHoldAtTime`, it adds a set at `time`. This also fixes a Chrome case the review missed: a steal during a hold segment (the TILT envelope has a 0.5 s hold, the beep 60 ms), where nothing was inserted and the fade ramped from a stale earlier event.
  - Without it (Firefox), it re-creates the cancelled segment with an exponential ramp to the live value at `time`, which traces the same set/exp curve exactly.

`FakeParam` now evaluates the effective timeline (`valueAt`, applying cancel and cancelAndHold as the spec does). New tests assert the actual levels at `now`, mid-fade and the end, for mute, a mid-ramp toggle, a hold-segment steal and a Firefox mid-decay steal.

### WR-02: Cues recorded before a new context reports "running" are dropped, so the first "start" jingle can be lost

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-engine.test.ts`
**Commit:** c5d02e2
**Status:** fixed: requires human verification (lifecycle logic, confirm the first "start" jingle sounds in Firefox and Safari)
**Applied fix:** `unlock()` sets `resumePending` around `resume()` and clears it when the promise resolves or rejects. `flush()` now counts a context as playable when it is running, or when it is suspended with a resume in flight. Nodes are scheduled at the frozen `currentTime` and play when the context starts. Once the resume settles, a context that is still suspended drops cues again. New tests cover three cases: a suspended new context voices the "start" cue, a rejected resume returns to dropping, and an OS-level suspend with no resume pending drops. One limit: if a `resume()` promise never settles, voices keep being scheduled on the suspended context. The pool caps them at 16. `unlock()` only runs in trusted gestures, where the resume does settle.

### IN-01: The flash clock runs one step ahead of the interpolated scene, and the first rendered frame of every flash is already past its hold

**Files modified:** `src/render/flash.ts`, `src/render/flash.test.ts`, `src/render/table-renderer.test.ts`
**Commit:** 2259d2e
**Status:** fixed: requires human verification (visual timing, check the contact and sling flashes by eye)
**Applied fix:** `record()` now stamps `stepCount + 1`, so the first render after the recording step's tick reads age `alpha` instead of `1 + alpha`. A read before that tick is clamped to age 0. FLASH_CONTACT is now drawn at its 0.35 peak, and a sling's one-step hold lasts the whole first frame. Two tests were changed to model the real record-then-tick order: the e^-1 decay test and the renderer's below-EPS test. A new test checks the first-frame peak.

### IN-02: `FixedStepLoop.advance` does not floor a negative delta, so `alpha` can go below 0 and interpolation extrapolates

**Files modified:** `src/sim/loop.ts`, `src/sim/loop.tabblur.test.ts`
**Commit:** 6956600
**Applied fix:** `const clamped = realDeltaMs > 0 ? Math.min(realDeltaMs, MAX_FRAME_MS) : 0;` treats both negative and NaN deltas as 0. A new test checks that negative and NaN deltas run no step, leave `alpha` unchanged and inside [0, 1), and that the next real frame steps normally.

### IN-03: The mute key ignores modifiers and there is no on-screen mute state

**Files modified:** `src/input/flipper-input.ts`, `src/input/game-input.ts`, `src/input/game-input.test.ts`, `src/ui/hud.ts`, `src/ui/hud.test.ts`, `src/sandbox/main.ts`, `index.html`
**Commit:** c91183a
**Status:** fixed: requires human verification (the new HUD marker is a visual change)
**Applied fix:** `KeyEventLike` gains optional `ctrlKey`, `metaKey` and `altKey`. In `GameInput.handleKeyDown`, a bound code pressed with any of them is left alone: no latch, no `preventDefault`, and it is not marked held. That means a keyup lost to Cmd+M can no longer leave KeyM stuck. Shift still never blocks an edge, because it is a flipper key. A new `MuteView` writes "MUTED" only when the state changes. It sits in a `#hud-mute` span beside the M key cap, styled in the status magenta with `role="status"` and `aria-live="polite"`, and hidden while empty. It also shows a mute that was armed before the audio unlocked.

### IN-04: The asset-free gate has blind spots

**Files modified:** `src/render/asset-free.test.ts`
**Commit:** 309a1b0
**Applied fix:** Changes to the gate:
- The glob is widened to `/src/**/*.{ts,js,css,html}`.
- New extensions: ico, avif, bmp, mp4, webm, m4a, aac, flac, opus and eot.
- New patterns for `<audio>`, `<video>` and `<source>` elements and for `<link rel="...icon...">`.
- A new test fails if any `public/` file exists. It uses a lazy `import.meta.glob("/public/**/*")`, which reads only the keys.

I confirmed the `public/` check fails when a temporary `public/a.txt` is present.

### IN-05: Per-element pitch offsets hard-code `TABLE_SPEC` ids inside the recipes

**Files modified:** `src/audio/recipes.test.ts`, `src/audio/recipes.ts`
**Commit:** 5d73335
**Applied fix:** I took the review's test option rather than deriving the maps. New recipes tests require a distinct `idSemitones` entry for every bumper id in `TABLE_SPEC`, and for both flipper ids under flipperUp and flipperDown. A comment on the map points at the guard.

### IN-06: `AudioEngine.unlock` edge cases: leaked context on a `build()` failure, and an error logged on every key with a closed context

**Files modified:** `src/audio/audio-engine.ts`, `src/audio/audio-context-like.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/audio-engine.test.ts`
**Commit:** 69129bd
**Applied fix:** If `build()` throws after the context was created, the context is now closed with `close?.()`, and a close rejection is swallowed. `unlock()` on a closed context returns early and reports it once, so later gestures no longer flood the console with rejected `resume()` calls. `AudioContextLike` gains an optional `close()`, which the DOM `AudioContext` still satisfies (the A5 type test passes). The fake gains `close()` and `closeCalls`. There are two new tests.

### IN-07: A global 30 s `testTimeout` applies to every test, not just the heavy simulation suites

**Files modified:** `vitest.config.ts` and 15 heavy suites: `src/sandbox/{game-e2e,flipper-e2e,plunger-e2e,game.determinism,presentation.determinism,cue-pipeline}.test.ts`, `src/sim/{loop.determinism,loop.flippers}.test.ts`, `src/game/reactive-table.test.ts`, `src/table/table-world.test.ts`, `src/harness/{soak,table-soak,reactive-soak,flipper-tunnel,stability}.test.ts`
**Commit:** 023ded9
**Applied fix:** The global `testTimeout: 30000` is removed, so the default 5 s applies again. Each heavy file calls `vi.setConfig({ testTimeout: 30_000 })` at module scope, and I confirmed with a probe that this is scoped per file. I picked these files from a verbose timing run: any file with a test of about 300 ms or more, the slowest being 10.8 s in flipper-e2e, plus the suites the review named. The soak gate (`*.gate.test.ts`, its own config) is untouched.

## Notes

- **Unrelated reformat in WR-01's commit (11ab06a):** Prettier reformatted one existing line in `src/audio/audio-engine.test.ts`, splitting `new AudioEngine(() => fake, () => 0.5)` across lines. It has no behavioural effect. I reverted other unrelated Prettier hunks before committing.
- **Worktree cleanup:** the branch was fast-forwarded 047e76b..023ded9, the worktree was removed, the temporary branch was deleted and the recovery sentinel was removed.

---

_Fixed: 2026-11-21T22:35:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
