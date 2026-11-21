---
phase: 05-rendering-audio
verified: 2026-11-21T23:45:00Z
status: human_needed
score: 7/7 must-haves verified
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
  - "src/audio/audio-context-like.ts"
  - "src/audio/audio-engine.ts"
  - "src/audio/audio-unlock.ts"
  - "src/audio/envelope.ts"
  - "src/audio/mapping.ts"
  - "src/audio/recipes.ts"
  - "src/audio/voice-pool.ts"
  - "src/input/flipper-input.ts"
  - "src/input/game-input.ts"
  - "src/render/asset-free.test.ts"
  - "src/render/contact-flash.ts"
  - "src/render/flash.ts"
  - "src/render/interpolate.ts"
  - "src/render/sprites.ts"
  - "src/render/static-layer.ts"
  - "src/render/table-renderer.ts"
  - "src/sandbox/main.ts"
  - "src/sandbox/presentation-observer.ts"
  - "src/sim/loop.ts"
  - "src/ui/hud.ts"
  - "vitest.config.ts"
covered_digest: "v4:sha256:d14514c2f54a9af9a2e8319713105561d4110dade14cbde4a19e9fc76bf16e95"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "SC1: Entire table (playfield, ball, flippers, lanes, plunger, HUD) rendered procedurally in code with zero image assets"
    reason: "D-01: the HUD is DOM text (src/ui/hud.ts), not painted on the Canvas. ROADMAP SC1 says 'HUD ... rendered on Canvas'; the maintainer accepts 'procedural, zero image assets' as meeting it. The asset-free gate (src/render/asset-free.test.ts) still covers the HUD markup and CSS."
    accepted_by: "maintainer (05-UAT test 4)"
    accepted_at: "2026-11-22T00:00:00Z"
re_verification:
  previous_status: human_needed
  previous_score: 5/7
  gaps_closed:
    - "D-02 mute fade (was PRESENT_BEHAVIOR_UNVERIFIED, prior WR-01): fixed in 11ab06a, now proven by a timeline-evaluating test"
    - "First-frame cue drop (was PRESENT_BEHAVIOR_UNVERIFIED, prior WR-02): fixed in c5d02e2, now proven by a suspended-context test"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "05-REVIEW WR-01 (new, WR-02 fix code): voices queued while the AudioContext is suspended with a resume() in flight are torn down only in onended, which a non-rendering context never fires; VoicePool.steal() stops sources but disconnects nothing. The 16-voice cap bounds the pool's active list, not the audio-graph nodes, in the never-settling-resume case"
    category: other
    reason: "Does not defeat any Phase 5 must-have (analysis in Gaps Summary). Recommended fix: a bounded starting window plus a teardown() on VoiceHandle called from steal()"
    evidence_status: "reproducible by inspection of audio-engine.ts:266-275, 328-331 and voice-pool.ts:140-154; no test keeps resume() pending, so none exercises it"
coincidental_reliance_items: []
human_verification:
  - test: "60 fps pacing: play 2 minutes in Chrome at 60 Hz with the diag readout and a DevTools Performance trace"
    expected: "FPS holds at 60, no long frames, no GC spikes"
    why_human: "Frame pacing on real hardware cannot be measured headless (RND-02, SC2)"
  - test: "144 Hz smoothness: repeat on a 120/144 Hz display (or the DevTools FPS meter)"
    expected: "Ball and both bats advance every frame, no visible stepping"
    why_human: "Display refresh is a hardware property. The 144 Hz monotonic-angle tracer test passes headless, the perceptual result does not"
  - test: "Visual polish at 1x and HiDPI (Ctrl + / Ctrl -), then open ?debug=1"
    expected: "Dark space scene, stars, neon walls, glowing bumpers, sharp lines at every zoom, HUD legible and in theme (the MUTED marker beside the M key cap was already confirmed at 1280x684 @150% in the Phase 4 UAT; glance at it at the other zooms); ?debug=1 shows the old debug drawing; Network tab shows no image, audio or font request"
    why_human: "Crispness and art direction are visual judgments (RND-01). 05-UI-REVIEW scored 16/24 (advisory)"
  - test: "Confirm the D-01 interpretation of ROADMAP SC1: the HUD is DOM text (src/ui/hud.ts), not painted on the Canvas"
    expected: "Maintainer accepts 'procedural, zero image assets' as meeting 'HUD ... rendered on Canvas', or asks for a canvas HUD. If accepted, add an overrides: entry"
    why_human: "The roadmap text and the shipped behavior differ. The deviation is recorded in the plans and index.html, but no override or maintainer acceptance is recorded"
  - test: "Hit each bumper, sling, rollover, wall, chute and both flippers"
    expected: "Each flashes and decays cleanly (a contact flash is at or just under its 0.35 peak on the first frame after the hit and then decays, not already faded), nothing outside the element flashes, walls and chute flash silently (RND-03)"
    why_human: "Flash visibility and decay feel are perceptual. IN-01 moved the first-frame timing, which only the eye can judge"
  - test: "Headphone listening pass in Chrome and Firefox: bumper, slingshot, flipper up and down, launch short and full, drain, tilt, warning, start, game over, rollover, lane. Include: (a) the very first Enter on a fresh page load plays the three-note start figure; (b) press M and M again with voices sounding, both fades are click-free; (c) bumper spam steals voices without clicks"
    expected: "Every voice distinct and click-free, level and pitch follow impact strength, no distortion under bumper spam, nothing before the first gesture, start figure audible on the first Enter, mute fade smooth on both edges (AUD-01, SC4, D-02)"
    why_human: "Audio quality, distinctness to the ear and real Web Audio scheduling cannot be judged headless. The mute fade and starting-context behavior are proven against the fake context's spec model only"
---

# Phase 5: Rendering & Audio Verification Report

**Phase Goal:** The whole table is drawn procedurally at a stable 60fps and every element speaks through distinct runtime-synthesized sound, as a read-only presentation layer over state that already exists.
**Verified:** 2026-11-21T23:45:00Z
**Status:** human_needed
**Re-verification:** Yes, after the 9 code-review fix commits (11ab06a, c5d02e2, 2259d2e, 6956600, c91183a, 309a1b0, 5d73335, 69129bd, 023ded9). All prior evidence was re-read against the current code, not carried over.

## Goal Achievement

The code half of the goal is achieved at HEAD. The procedural renderer, interpolation, flash system, 13-recipe synthesizer, cue pipeline and gesture unlock are present, substantive, wired in `src/sandbox/main.ts`, and proven read-only by the bit-identity replay test. Nothing fails. The two items that were present-but-behavior-unverified in the prior report (mute fade, first-frame cue drop) are now fixed and backed by passing behavioral tests. What remains is perceptual and real-hardware, which no headless check can settle: 60 fps pacing, 144 Hz smoothness, visual polish, flash feel, the listening pass, and one roadmap-wording acceptance (HUD as DOM). Hence `human_needed`, not `passed`.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Entire table (playfield, ball, flippers, lanes, plunger, HUD) rendered procedurally in code with zero image assets | VERIFIED (D-01 interpretation flagged) | `table-renderer.ts` and `static-layer.ts` draw every non-mount element from `TABLE_SPEC`. Grep over `src/` and `index.html` (non-test) for `new Image`, `<img`, `decodeAudioData`, `new Audio(`, `@font-face`, `fetch(` returns nothing. `asset-free.test.ts` passes, and IN-04 widened it (glob now ts/js/css/html, more extensions, `<audio>/<video>/<source>/<link rel=icon>`, a no-`public/` check). HUD is DOM text, not Canvas. The roadmap says "HUD ... on Canvas". See human_verification |
| 2 | SC2: Stable 60fps via render interpolation, smooth on high-refresh displays | VERIFIED (code); pacing is human | `main.ts:413-414` calls `interpolateBalls` and `interpolateAngles` into preallocated arrays, then `tableRenderer.draw(renderFrame)` at `:461`. Static layer baked once per resize. `loop.ts` now floors negative, NaN and Infinity frame deltas (IN-02) so alpha stays in [0, 1); `loop.tabblur.test.ts` covers it. 144 Hz monotonic-angle tracer in `loop.flippers.test.ts` passes. Real 60 fps and 144 Hz feel are unmeasured, see human_verification |
| 3 | SC3: Every element flashes on contact | VERIFIED (code); visibility is human | All 8 element kinds route to `FlashTracker.record`: bumper, sling, rollover, lane via `CueFeedback`; wall, chute, flipper via `ContactFlash` (`main.ts:201`); drain via `PresentationObserver` (`main.ts:289`, before `flash.tick()` at `:291`). IN-01 stamps `stepCount + 1` in `flash.ts:112`, consistent because every `record()` runs inside `onPostStep` before the tick. `flash.test.ts`, `contact-flash.test.ts`, `table-renderer.test.ts` pass |
| 4 | SC4: Each element has a distinct runtime-synthesized sound with velocity/pitch variation, no audio files, shared gesture-resumed context, enveloped one-shots | VERIFIED (code); hearing is human | `RECIPES` covers 13 kinds, pairwise-distinct signatures in `recipes.test.ts` (IN-05 added pitch-map guards against `TABLE_SPEC` ids). `strengthToGain` and `playbackSemitones` give level and pitch variation from an injected rng. `VoicePool` caps the active list at 16. One master gain, compressor, destination chain. `AudioUnlock` attached at `main.ts:226`. IN-06 reports a closed context once and closes an unbuildable one. Cues come from `ReactiveElements`, `PresentationObserver` and `PlungerController`. The audio graph is bounded in any context that is running, see Gaps Summary for the never-settling-resume caveat |
| 5 | Presentation is read-only over existing sim state | VERIFIED | `presentation.determinism.test.ts` replays the scripted Phase-4 game with the whole presentation stack attached and gets bit-identical results at 144 and 60 Hz with non-vacuous cue tallies. The fixes are presentation-only and that test still passes at HEAD. `cue-pipeline.test.ts` case (j) (throwing sink) passes. Only `planck-world.ts` imports planck |
| 6 | D-02: M mutes with a real 50 ms master-gain ramp from the live level, no click | VERIFIED (model-level); real-browser fade is human | Prior WR-01 is fixed. `setMuted` (`audio-engine.ts:132-150`) does `cancelScheduledValues(now)`, `setValueAtTime(level, now)`, `linearRampToValueAtTime(target, now + MUTE_RAMP_S)`, with the live level from a tracked segment. Test "the mute fade starts at the live level after a minute of play (WR-01)" runs against `FakeParam.valueAt`, which now evaluates the timeline per spec: at t=60 the gain is 0.6, at the ramp midpoint 0.3, at the end 0, a mid-ramp reversal continues from 0.3 with no jump. Run and passing. Click-free audibility stays in the listening pass |
| 7 | 05-05: Game start (and early cues) audible after the first gesture | VERIFIED (model-level); real-browser audibility is human | Prior WR-02 is fixed. `flush()` (`audio-engine.ts:266-275`) treats a context as playable when `running` or `suspended` with `resumePending`. Test "a 'start' cue flushed right after unlock, before the context runs, is scheduled" uses a context that reports `suspended` like a new browser one: `flush` returns 1, queue emptied, sources have start times at or after `SCHEDULE_AHEAD_S`. Companion tests: after the resume settles a still-suspended context drops cues again; with no resume in flight it drops them. Run and passing. Real Firefox/Safari audibility stays in the listening pass |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Deferred Items

None. Phase 6 (juice and polish) does not claim these items.

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | 05-REVIEW WR-01: voices scheduled on a suspended context with a resume in flight are never disconnected if the context never renders; the pool cap bounds `active`, not graph nodes | other | Reproducible by inspection, but it needs a never-settling `resume()`. It defeats no must-have (see Gaps Summary). No test exercises it |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/render/table-renderer.ts`, `static-layer.ts`, `sprites.ts` | Procedural frame draw, baked layer, halo sprites | VERIFIED | Real draw code, no stubs, wired at `main.ts:461` |
| `src/render/flash.ts`, `contact-flash.ts` | Flash clock and bus listener | VERIFIED | Wired in `main.ts` |
| `src/render/interpolate.ts`, `src/sim/loop.ts` | Ball and angle interpolation, snapshots | VERIFIED | Used every frame, delta clamp in place |
| `src/render/asset-free.test.ts` | RND-01 gate | VERIFIED | Passes; remaining blind spot is review IN-03 (remote link/script), advisory |
| `src/audio/audio-engine.ts`, `recipes.ts`, `voice-pool.ts`, `envelope.ts`, `mapping.ts`, `audio-context-like.ts` | Synthesizer | VERIFIED | Real node graph, no audio files |
| `src/audio/audio-unlock.ts` | Gesture-gated context | VERIFIED | Attached `main.ts:226` |
| `src/app/cue-queue.ts` | Ring and `CueFeedback` | VERIFIED | Wired through `ReactiveElements` |
| `src/sandbox/presentation-observer.ts` | Game-event cues | VERIFIED | Called in `onPostStep` before `flash.tick()` |
| `src/ui/hud.ts`, `index.html` | HUD plus `MuteView` and `#hud-mute` | VERIFIED | `MuteView` constructed at `main.ts:355`, updated at `:468` |
| `src/input/game-input.ts`, `flipper-input.ts` | Mute edge, modifier guard (IN-03) | VERIFIED | `main.ts:273` toggles mute on the edge |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `ReactiveElements` | `CueFeedback` | constructor arg | WIRED |
| `onPostStep` | `observer.observe()`, `flash.tick()` | `main.ts:289`, `:291` | WIRED |
| `frame()` | `audio.flush(cues)` | `main.ts:407`, once per frame | WIRED |
| `frame()` | `interpolateBalls` / `interpolateAngles` into `tableRenderer.draw` | `main.ts:413-414`, `:461` | WIRED |
| `AudioUnlock` | `AudioEngine.unlock` | `main.ts:226` | WIRED |
| `ge.mute` | `audio.toggleMute()` | `main.ts:273` | WIRED |
| `ContactFlash` | `CollisionRouter` | `main.ts:201` | WIRED |
| `audio.isMuted()` | `MuteView` / `#hud-mute` | `main.ts:468` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
| -------- | ---- | ------ | --------- | ------ |
| `TableRenderer.drawBalls` | `frame.balls` | `loop.previous/current` via `interpolateBalls` | Yes | FLOWING |
| `drawFlippers` | `frame.flipperAngles` | loop flipper snapshots via `interpolateAngles` | Yes | FLOWING |
| `drawFlashes` | `flash.level()` | `FlashTracker` fed by `CueFeedback`, `ContactFlash`, observer | Yes | FLOWING |
| `AudioEngine.flush` | `cues` | `CueQueue` pushed on the step path | Yes | FLOWING |
| `#hud-mute` | `audio.isMuted()` | `AudioEngine.muted` flag | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Types | `npx tsc --noEmit` | exit 0 | PASS |
| Lint | `npx eslint src` | exit 0 | PASS |
| Full suite (single run) | `npx vitest run` | 52 files, 758 tests passed | PASS |
| D-02 mute fade and starting-context tests (named) | `npx vitest run src/audio/audio-engine.test.ts src/audio/voice-pool.test.ts -t "live level\|mid-ramp\|starting\|WR-01\|steal"` | 9 passed | PASS |
| Soak | `npm run soak` | caller reports 4/4 gates pass; not re-run here | PASS (reported) |

Step 7c (probes): none declared by the plans.

### Requirements Coverage

Plan frontmatter IDs: 05-01 AUD-01; 05-02 RND-01, RND-02; 05-03 AUD-01; 05-04 RND-03; 05-05 AUD-01; 05-06 RND-01, RND-02, AUD-01; 05-07 AUD-01, RND-03; 05-08 RND-01, RND-02. REQUIREMENTS.md maps exactly RND-01, RND-02, RND-03, AUD-01 to Phase 5. No orphaned and no unclaimed IDs.

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| RND-01 | 05-02, 05-06, 05-08 | Table rendered procedurally on Canvas, no image assets | SATISFIED (HUD as DOM, flagged) | Truth 1 |
| RND-02 | 05-02, 05-06, 05-08 | Stable 60fps via render interpolation | SATISFIED in code; pacing NEEDS HUMAN | Truth 2 |
| RND-03 | 05-04, 05-07 | Elements flash on contact | SATISFIED in code; visibility NEEDS HUMAN | Truth 3 |
| AUD-01 | 05-01, 05-03, 05-05, 05-06, 05-07 | Distinct synthesized sound per element, velocity/pitch variation, no audio files | SATISFIED in code; listening pass NEEDS HUMAN | Truths 4, 6, 7 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| none | | TBD/FIXME/XXX scan over `src/` and `index.html` (non-test) | none | No debt markers |
| `src/audio/audio-engine.ts`, `voice-pool.ts` | 266-275, 328-331, 140-154 | Starting-window voices not torn down if the context never renders (review WR-01) | Warning (advisory) | Graph growth only in the never-settling-resume case |
| `src/sandbox/main.ts` | 55-58 | Header says cues are dropped while the context is not running; now stale after c5d02e2 (review IN-01) | Info | Doc drift only |
| `index.html`, `src/ui/hud.ts` | 79-80, 89-90, 189, 14-16 | Second live region `#hud-mute`; comments say one announced line; unmute announces nothing (review IN-02) | Info | Accessibility and doc drift |
| `src/render/asset-free.test.ts` | 35-77 | Gate misses remote stylesheets, scripts, iframes, WebSocket (review IN-03) | Info | Gate blind spot, no violation present |
| `src/audio/audio-engine.ts`, `envelope.ts` | 375-376 | Envelope points built twice per layer (review IN-04) | Info | Latent drift risk, per voice not per frame |

No blockers. The prior report's WR-01 and WR-02 and IN-01 to IN-07 are resolved by the fix commits (confirmed in code above and by the passing suite). 05-SECURITY.md reports `threats_open: 0`.

### Human Verification Required

Six items, listed in the `human_verification` frontmatter and unchanged in count from `05-UAT.md`, with wording updated for the fixes:
- item 3 now notes the MUTED marker was already confirmed in the Phase 4 UAT;
- item 5 now states the post-IN-01 first-frame flash expectation;
- item 6 now folds in the first-Enter start figure and the click-free mute fade, which replace the two former behavior-unverified items (no separate entries, no duplicates).

### Gaps Summary

No gaps. Every roadmap success criterion is implemented, wired and machine-tested at HEAD, and the presentation layer is provably read-only.

**Judgment on 05-REVIEW.md WR-01 (the one warning):** it is advisory and does not break a Phase 5 must-have.
- The roadmap SC4 and the plan truths for the pool concern sounds that are heard. In a never-settling-resume context nothing is rendered, so no sound is lost or distorted; the cost is node and memory growth.
- The state is bounded in practice. `resumePending` clears when `resume()` settles, and the next trusted keydown or pointerdown (Enter to start is a real activation) calls `unlock()` and settles it. The unbounded case needs a context that cannot start at all, such as an output device that cannot open. Before the first gesture no context exists and no node is built.
- Truth 4's pool claim stands as: the active list is capped at 16, and the audio graph is bounded whenever the context is running. It does not hold for the graph in the never-settling-resume case. The 05-REVIEW-FIX note, "The pool caps them at 16", overstates this and should be read that way.
- One older plan statement is deliberately narrowed by c5d02e2. 05-01's truth "cues produced while the context was not running are never replayed after it resumes" now has an exception for a context that is suspended with a resume in flight, which is the intended fix for the lost start figure. The tests were updated to match.
- Recommended before the milestone ships, not blocking: apply the review's fix (a wall-clock bound on the starting window, plus a `teardown()` on `VoiceHandle` called from `steal()`), and add a fake-context test that keeps `resume()` pending and asserts a bounded node count.
- Review IN-01 to IN-04 (stale header, second live region, asset-gate blind spots, double envelope-point build) are likewise advisory. None defeats a must-have, and none reopens a prior finding.

Status is `human_needed` for two reasons.
- Perceptual and hardware criteria cannot be checked headless: 60 fps pacing, 144 Hz smoothness, visual polish, flash feel, and the listening pass (including the real-browser mute fade and first-Enter start figure).
- One roadmap wording needs maintainer acceptance: SC1 says "HUD ... on Canvas" and the HUD is DOM (D-01).

---

_Verified: 2026-11-21T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
