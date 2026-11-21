---
phase: 05-rendering-audio
verified: 2026-11-21T21:35:00Z
status: human_needed
score: 5/7 must-haves verified
covered_files:
  - ".planning/phases/05-rendering-audio/05-01-PLAN.md"
  - ".planning/phases/05-rendering-audio/05-01-SUMMARY.md"
  - ".planning/phases/05-rendering-audio/05-02-PLAN.md"
  - ".planning/phases/05-rendering-audio/05-02-SUMMARY.md"
  - ".planning/phases/05-rendering-audio/05-03-PLAN.md"
  - ".planning/phases/05-rendering-audio/05-03-SUMMARY.md"
  - ".planning/phases/05-rendering-audio/05-04-PLAN.md"
  - ".planning/phases/05-rendering-audio/05-04-SUMMARY.md"
  - ".planning/phases/05-rendering-audio/05-05-PLAN.md"
  - ".planning/phases/05-rendering-audio/05-05-SUMMARY.md"
  - ".planning/phases/05-rendering-audio/05-06-PLAN.md"
  - ".planning/phases/05-rendering-audio/05-06-SUMMARY.md"
  - ".planning/phases/05-rendering-audio/05-07-PLAN.md"
  - ".planning/phases/05-rendering-audio/05-07-SUMMARY.md"
  - ".planning/phases/05-rendering-audio/05-08-PLAN.md"
  - ".planning/phases/05-rendering-audio/05-08-SUMMARY.md"
  - "index.html"
  - "src/app/cue-queue.ts"
  - "src/audio/audio-engine.ts"
  - "src/audio/recipes.ts"
  - "src/audio/voice-pool.ts"
  - "src/render/flash.ts"
  - "src/render/interpolate.ts"
  - "src/render/static-layer.ts"
  - "src/render/table-renderer.ts"
  - "src/sandbox/main.ts"
  - "src/sandbox/presentation-observer.ts"
  - "src/sim/loop.ts"
covered_digest: "v4:sha256:2547d4e5fdcdee441005a49fa7b6e20c7fd48de23d9b52a8c8e16302a1eff552"
behavior_unverified: 2
overrides_applied: 0
behavior_unverified_items:
  - truth: "Pressing M ramps the master gain to 0 and back over 50 ms (D-02, 05-03/05-06): no click"
    test: "In Chrome and Firefox, play with voices sounding, press M, press M again; listen for a click on both edges"
    expected: "A 50 ms fade out and back in, no click. Master gain after 25 ms is about half level"
    why_human: "AudioEngine.setMuted calls holdAt() then linearRampToValueAtTime. On a master gain whose only event is the build-time setValueAtTime, holdAt inserts no anchor at now, so the ramp runs from the previous event (build time, 0.6). The fade is effectively an instant cut. FakeParam records events and never evaluates the timeline, so no test sees it (05-REVIEW WR-01, still open). Mute does silence the game; the fade quality is unproven."
  - truth: "Game start (and any cue in the first frames after the first gesture) is heard (05-05: Enter plays a rising three-note figure; VALIDATION manual: first Enter press makes sound)"
    test: "Fresh page load, press Enter as the very first gesture; listen for the start figure. Repeat in Firefox and Safari if available"
    expected: "The three-note start figure is audible on the first Enter"
    why_human: "unlock() builds the context inside keydown; the next rAF frame runs the start edge and audio.flush(). flush() (audio-engine.ts:194) clears the queue unless ctx.state === 'running'. A new AudioContext reports 'suspended' until the device starts asynchronously, so the first frame's cues can be dropped. The fake context starts 'running', so cue-pipeline test (g) cannot see it (05-REVIEW WR-02, still open)."
human_verification:
  - test: "60 fps pacing: play 2 minutes in Chrome at 60 Hz with the diag readout and a DevTools Performance trace"
    expected: "FPS holds at 60, no long frames, no GC spikes"
    why_human: "Frame pacing on real hardware cannot be measured headless (RND-02, SC2)"
  - test: "144 Hz smoothness: repeat on a 120/144 Hz display (or the DevTools FPS meter)"
    expected: "Ball and both bats advance every frame, no visible stepping"
    why_human: "Display refresh is a hardware property. The 144 Hz monotonic-angle tracer test passes headless, the perceptual result does not"
  - test: "Visual polish at 1x and HiDPI (Ctrl + / Ctrl -), then open ?debug=1"
    expected: "Dark space scene, stars, neon walls, glowing bumpers, sharp lines at every zoom, HUD legible and in theme; ?debug=1 shows the old debug drawing; Network tab shows no image, audio or font request"
    why_human: "Crispness and art direction are visual judgments (RND-01). 05-UI-REVIEW scored 16/24 (advisory)"
  - test: "Confirm the D-01 interpretation of ROADMAP SC1: the HUD is DOM text (src/ui/hud.ts), not painted on the Canvas"
    expected: "Maintainer accepts 'procedural, zero image assets' as meeting 'HUD ... rendered on Canvas', or asks for a canvas HUD. If accepted, add an overrides: entry"
    why_human: "The roadmap text and the shipped behavior differ. The deviation is recorded in the plans and index.html, but no override or maintainer acceptance is recorded"
  - test: "Hit each bumper, sling, rollover, wall, chute and both flippers"
    expected: "Each flashes and decays cleanly, nothing outside the element flashes, walls and chute flash silently (RND-03)"
    why_human: "Flash visibility and decay feel are perceptual"
  - test: "Headphone listening pass: bumper, slingshot, flipper up and down, launch short and full, drain, tilt, warning, start, game over, rollover, lane"
    expected: "Every voice distinct and click-free, level and pitch follow impact strength, no distortion under bumper spam, nothing before the first gesture (AUD-01, SC4)"
    why_human: "Audio quality and distinctness-to-the-ear are perceptual. The recipes pass a pairwise-distinct signature test, which is not a hearing test"
---

# Phase 5: Rendering & Audio Verification Report

**Phase Goal:** The whole table is drawn procedurally at a stable 60fps and every element speaks through distinct runtime-synthesized sound, as a read-only presentation layer over state that already exists.
**Verified:** 2026-11-21T21:35:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

The code half of the goal is achieved. The procedural renderer, interpolation, flash system, 13-recipe synthesizer, cue pipeline and unlock are present, substantive, wired in `src/sandbox/main.ts`, and proven read-only by a bit-identity replay test. Nothing fails. Two audio behaviors in a real browser (mute fade, first-frame cue drop) are present and wired but unproven, and the perceptual items (60 fps pacing, visual polish, listening pass) need a human. Hence `human_needed`, not `passed`.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Entire table (playfield, ball, flippers, lanes, plunger, HUD) rendered procedurally in code with zero image assets | VERIFIED (D-01 interpretation flagged) | `TableRenderer` (554 lines) draws baked static layer plus live flippers, plunger, ball and flash pass. `bakeStatic` draws every non-mount element from `TABLE_SPEC`. Grep over `src/` and `index.html` for `new Image`, `<img`, `url(`, image/audio/font extensions, `decodeAudioData`, `new Audio(`, `fetch(`, `@font-face` finds nothing outside tests. `asset-free.test.ts` passes. HUD is DOM text (`#hud-score/#hud-ball/#hud-status`), not Canvas. The roadmap says "HUD ... on Canvas". The deviation is recorded as D-01 but has no override. See human_verification |
| 2 | SC2: Stable 60fps via render interpolation, smooth on high-refresh displays | VERIFIED (code); pacing is human | `main.ts` `frame()` calls `interpolateBalls(loop.previous, loop.current, alpha, ...)` and `interpolateAngles(loop.previousFlipperAngles, loop.currentFlipperAngles, alpha, ...)` into preallocated arrays. Static layer baked once per resize (`bakeCount` tests), one `drawImage` per frame, no gradient or shadowBlur in `draw()`. `loop.flippers.test.ts` real-table 144 Hz tracer passes (strictly monotonic angle per frame). Real 60 fps and 144 Hz feel are unmeasured, see human_verification |
| 3 | SC3: Every element flashes on contact | VERIFIED (code); visibility is human | Spec has 8 element kinds. All are covered: bumper, slingshot, rollover, lane via `CueFeedback.onKick/onSensor` into `FlashTracker.record`; wall, chute, flipper via `ContactFlash` on the bus; drain via `PresentationObserver`. `TableRenderer.drawFlashes` draws circles, sling faces, sensor halos, wall and drain paths and a flipper contour under "lighter" and resets alpha and composite. Flash clock ticks once per fixed step at the end of `onPostStep`. `flash.test.ts`, `contact-flash.test.ts` and `table-renderer.test.ts` pass |
| 4 | SC4: Each element (bumper, flipper, slingshot, drain, launch, tilt) has a distinct runtime-synthesized sound with velocity/pitch variation, no audio files, shared gesture-resumed context, enveloped one-shots | VERIFIED (code); hearing is human | `RECIPES` has all 13 kinds (bumper, slingshot, rollover, lane, bank, flipperUp, flipperDown, launch, drain, tilt, warning, start, gameOver), each built from osc/noise/filter layers. `recipes.test.ts` asserts pairwise-distinct signatures. `strengthToGain` and `playbackSemitones` with injected rng give level and pitch variation. `applyEnvelope` anchors and ramps exponentially between positive values. `VoicePool` caps at 16 voices. One master gain, compressor, destination chain. `AudioUnlock` is trusted keydown/pointerdown only, Escape excluded, and the DOM `AudioContext` factory is passed to `() => AudioContextLike` with no cast (`tsc` clean). Cues are produced by `ReactiveElements` (bumper, sling, sensors), `PresentationObserver` (start, flipper coils, launch, tilt, warning, drain, game over) and `PlungerController` counters. All wired in `main.ts` |
| 5 | Presentation is read-only over existing sim state | VERIFIED | `presentation.determinism.test.ts` replays the scripted Phase-4 game with CueQueue, CueFeedback, FlashTracker, ContactFlash, PresentationObserver, AudioEngine (fake ctx) and TableRenderer attached and gets bit-identical steps, score, ball, state and ball states at 144 and 60 Hz, with non-vacuous cue tallies. `cue-pipeline.test.ts` case (j): a throwing feedback sink leaves the real-table drop bit-identical. Only `planck-world.ts` imports planck |
| 6 | D-02 (05-03/05-06): M mutes with a 50 ms master-gain ramp, no click | PRESENT_BEHAVIOR_UNVERIFIED | `KeyM` edge, `main.ts` `audio.toggleMute()`, `AudioEngine.setMuted` with `MUTE_RAMP_S` and the "Mute M" row are present and tested. Mute does silence output. The ramp does not run from "now" in a real browser (WR-01). See behavior_unverified_items |
| 7 | 05-05: Game start (and early cues) audible after the first gesture | PRESENT_BEHAVIOR_UNVERIFIED | `flush()` drops cues while `ctx.state !== "running"`. A new context starts suspended, so the first frame's `start` cue can be lost (WR-02). See behavior_unverified_items |

**Score:** 5/7 truths verified (2 present, behavior-unverified)

### Deferred Items

None. Phase 6 (juice and polish) does not claim these items, and none is needed.

### Required Artifacts

`verify.artifacts` on all 8 plans: 7/7, 5/5, 5/5, 4/4, 3/3, 3/3, 5/5, 5/5, all passed. Checked substance by reading `main.ts`, `table-renderer.ts`, `audio-engine.ts`, `audio-unlock.ts`, `presentation-observer.ts`, `cue-queue.ts` and `recipes.ts`.

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/render/table-renderer.ts` | Procedural frame draw, flash pass | VERIFIED | 554 lines, real draw code, no stubs |
| `src/render/static-layer.ts` | One bake per resize | VERIFIED | Draws all elements, seeded starfield |
| `src/render/flash.ts`, `contact-flash.ts`, `sprites.ts` | Flash clock, bus listener, halo sprites | VERIFIED | Wired in main.ts |
| `src/render/interpolate.ts`, `src/sim/loop.ts` | Ball and angle interpolation, snapshots | VERIFIED | Used every frame in main.ts |
| `src/render/asset-free.test.ts` | RND-01 asset gate | VERIFIED | Passes, with blind spots noted in IN-04 (advisory) |
| `src/audio/audio-engine.ts`, `recipes.ts`, `voice-pool.ts`, `envelope.ts`, `mapping.ts` | Synthesizer | VERIFIED | Real node graph, no audio files |
| `src/audio/audio-unlock.ts` | Gesture-gated context | VERIFIED | Attached in main.ts |
| `src/app/cue-queue.ts` | 64-slot ring, `CueFeedback` | VERIFIED | Wired through ReactiveElements |
| `src/sandbox/presentation-observer.ts` | Game-event cues | VERIFIED | Called in `onPostStep` before `flash.tick()` |

### Key Link Verification

`verify.key-links` on all 8 plans: 4/4, 4/4, 4/4, 3/3, 4/4, 3/3, 3/3, 3/3, all verified. Manual confirmation in `main.ts`:

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `ReactiveElements` | `CueFeedback` | 4th constructor arg `cueFeedback` | WIRED |
| `onPostStep` | `observer.observe()`, `flash.tick()` | after `session.service()` | WIRED |
| `frame()` | `audio.flush(cues)` | once per frame after `loop.advance` | WIRED |
| `frame()` | `interpolateBalls` / `interpolateAngles` into `renderFrame` | `tableRenderer.draw(renderFrame)` | WIRED |
| `AudioUnlock` | `AudioEngine.unlock` | window keydown/pointerdown capture | WIRED |
| `ge.mute` | `audio.toggleMute()` | `onFixedStep` | WIRED |
| `ContactFlash` | `CollisionRouter` | `new ContactFlash(router, flash)` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
| -------- | ---- | ------ | --------- | ------ |
| `TableRenderer.drawBalls` | `frame.balls` | `loop.previous/current` from `world.getBalls()` via `interpolateBalls` | Yes | FLOWING |
| `drawFlippers` | `frame.flipperAngles` | `loop.previous/currentFlipperAngles` from `world.getFlippers()` | Yes | FLOWING |
| `drawFlashes` | `flash.level()` | `FlashTracker` fed by `CueFeedback`, `ContactFlash`, observer | Yes | FLOWING |
| `drawLitRollovers` | `reactive.isLit` | `ReactiveElements` rules state | Yes | FLOWING |
| `drawPlunger` | `plunger.getCharge()` | `PlungerController` | Yes | FLOWING |
| `AudioEngine.flush` | `cues` | `CueQueue` pushed on the step path | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Types | `npx tsc --noEmit` | exit 0 | PASS |
| Lint | `npx eslint src` | exit 0 | PASS |
| Full suite (single run) | `npx vitest run` | 52 files, 738 tests passed | PASS |
| Phase seams: asset gate, recipes distinct, presentation determinism, 144 Hz tracer, cue pipeline | `npx vitest run src/render src/audio src/app src/sandbox/... src/sim/loop.flippers.test.ts src/input src/ui` | 24 files, 398 tests passed | PASS |

Step 7c (probes): none declared. Soak and build were not re-run here; the caller reports `npm run soak` 4/4 and `npm run build` OK at HEAD.

### Requirements Coverage

Plan frontmatter IDs: 05-01 AUD-01; 05-02 RND-01, RND-02; 05-03 AUD-01; 05-04 RND-03; 05-05 AUD-01; 05-06 RND-01, RND-02, AUD-01; 05-07 AUD-01, RND-03; 05-08 RND-01, RND-02. REQUIREMENTS.md maps exactly RND-01, RND-02, RND-03, AUD-01 to Phase 5. No orphaned and no unclaimed IDs.

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| RND-01 | 05-02, 05-06, 05-08 | Table rendered procedurally on Canvas, no image assets | SATISFIED (HUD as DOM, flagged) | Truth 1 |
| RND-02 | 05-02, 05-06, 05-08 | Stable 60fps via render interpolation | SATISFIED in code; pacing NEEDS HUMAN | Truth 2 |
| RND-03 | 05-04, 05-07 | Elements flash on contact | SATISFIED in code; visibility NEEDS HUMAN | Truth 3 |
| AUD-01 | 05-01, 05-03, 05-05, 05-06, 05-07 | Distinct synthesized sound per element, velocity/pitch variation, no audio files | SATISFIED in code; two real-browser timing items and the listening pass NEED HUMAN | Truths 4, 6, 7 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| none | | TBD/FIXME/XXX/TODO/HACK scan over `src/` and `index.html` (non-test) | none | The one `XXX` hit, in `src/harness/containment.ts:171`, is prose and not in a file changed by this phase |
| `src/audio/audio-engine.ts` | 104-112 | `holdAt` then ramp from a stale event (WR-01) | Warning | Mute fade is an abrupt cut |
| `src/audio/audio-engine.ts` | 191-197 | Drop cues while `state !== "running"` (WR-02) | Warning | First start figure may be lost |
| various | | IN-01..IN-07 (flash clock one step ahead, negative-delta alpha, modifier keys on M, asset-gate blind spots, hard-coded recipe ids, unlock edge cases, global 30 s timeout) | Info | Advisory, all open in 05-REVIEW-DISPOSITION.md |

No blockers. 05-SECURITY.md reports `threats_open: 0`.

### Human Verification Required

See the `human_verification` and `behavior_unverified_items` frontmatter. Items 1 to 6 there are the end-of-phase UAT. The `<human-check>` blocks in plans 05-01, 05-02, 05-04, 05-05 and 05-06 collapse into the same six checks. Run the two behavior-unverified items first: they are the only places where wired code is suspected to misbehave in a real browser.

### Gaps Summary

No gaps. Every roadmap success criterion is implemented, wired and machine-tested, and the presentation layer is provably read-only. Status is `human_needed` for three reasons.

- Two audio behaviors exist in code but no test exercises them with real Web Audio semantics: the 50 ms mute fade (WR-01) and the first-frame cue drop (WR-02).
- Perceptual criteria cannot be checked headless: 60 fps pacing, 144 Hz smoothness, visual polish, flash visibility and the listening pass.
- One roadmap wording needs maintainer acceptance: SC1 says "HUD ... on Canvas" and the HUD is DOM.

Recommended, non-blocking: fix WR-01 and WR-02 before the UAT listening pass, since the first Enter is the first thing a player does. Fix WR-01 with a `setTargetAtTime` or an explicit `setValueAtTime(param.value, now)` anchor. Fix WR-02 by not dropping cues while a resume is in flight.

---

_Verified: 2026-11-21T21:35:00Z_
_Verifier: Claude (gsd-verifier)_
