---
phase: 06-juice-polish
plan: 09
subsystem: render
tags: [screen-shake, nudge-kick, trauma, reduced-motion, canvas2d, presentation, vitest]

requires:
  - phase: 06-juice-polish
    provides: "06-06 reducedMotion flag in main.ts and the drain-count-keyed observer; 06-05 GameSession.getNudgeCount()/getLastNudgeDir() and the nudge recipe; 06-03 RenderFrame lamps"
provides:
  - "src/render/shake.ts: ShakeTracker (kick, addTrauma, tick, sample, sampleExact, getTrauma), ShakeOut, kickDisplacement, noiseX/noiseY and the SHAKE_* / TRAUMA_* constants"
  - "src/render/effects.ts: EffectsTracker implementing FxSink and ObserverFx, owning the ShakeTracker; EffectsReader"
  - "src/app/cue-queue.ts: FxSink and CueFeedback's third optional fx argument"
  - "src/sandbox/presentation-observer.ts: ObserverFx, eighth optional fx argument, \"nudge\" cue (elementId left 0 / right 1 / up 2) between launch and tilt, ObserverSession + getNudgeCount/getLastNudgeDir"
  - "src/render/table-renderer.ts: BG_BOTTOM fill, shaken blit, single resetWorld(), RenderFrame.effects and RenderFrame.reducedMotion, renderer-side reduced-motion guard"
  - "src/sandbox/main.ts: one EffectsTracker wired into CueFeedback, the observer, onPostStep (effects.tick) and the render frame"
affects: [06-10 post drawing and save flourish, 06-11..06-13 particle plans (extend EffectsTracker through the same FxSink/ObserverFx seam and the resolved elements), 06-14 determinism replay attaching the EffectsTracker]

actuals:
  tokens: 14550
  tasks: 2
  commits: 3
plan_head_before: d0e6b33de3b1d0eb51a24da3a55ad7989bd2b7bb
plan_head_after: ba7df19760c6aaa77c7ff58daaaf85d15632c6c9

tech-stack:
  added: []
  patterns:
    - "Closed-form damped oscillator for the nudge kick: exact at any step + alpha, no integrator state, peak factor computed at module load"
    - "Effects seam: FxSink out of CueFeedback and ObserverFx out of the observer feed one EffectsTracker the renderer reads"
    - "One resetWorld() is the only world setTransform, so every layer carries the same shake offset"
    - "Safety preference enforced twice: the tracker zeroes under reducedMotion and the renderer skips the sample entirely"

key-files:
  created:
    - src/render/shake.ts
    - src/render/effects.ts
    - src/render/shake.test.ts
  modified:
    - src/app/cue-queue.ts
    - src/sandbox/presentation-observer.ts
    - src/sandbox/presentation-observer.test.ts
    - src/render/table-renderer.ts
    - src/render/table-renderer.test.ts
    - src/sandbox/main.ts

key-decisions:
  - "A drain saved by the 06-07 backstop still raises getDrainCount(), so it shakes like a real drain (per plan)"
  - "The 06-08 center-post kick sends no feedback, so it does not shake (the plan adds no hook for it)"
  - "The nudge cue sits after launch and before tilt; its elementId is the direction (left 0, right 1, up 2) at strength 1"
  - "Under reducedMotion the renderer skips the shake sample entirely (defence in depth beside the tracker's own zeroing, T-6-18)"

patterns-established:
  - "Presentation effects tracker: step-path scalar writes through FxSink/ObserverFx, one tick() in onPostStep after lamps.update() and before flash.tick(), read-only on the render side"

requirements-completed: [PLSH-01]

coverage:
  - id: D1
    description: "Bumper and sling hits, drains and tilts add capped trauma (0.12 * s, 0.08 * s, 0.25, 0.70), decaying 1.5/s on the step clock, offset 8 px * dpr * trauma^2 * two-sine noise, no random source"
    requirement: PLSH-01
    verification:
      - kind: unit
        ref: "src/render/shake.test.ts#ShakeTracker trauma (D-17)"
        status: pass
      - kind: unit
        ref: "src/render/shake.test.ts#ShakeTracker determinism (D-17, D-23)"
        status: pass
    human_judgment: false
  - id: D2
    description: "An accepted nudge kicks the view opposite the ball impulse, peak 6 +/- 0.1 px * dpr, below 0.06 px from step 30, a new kick restarts the response"
    requirement: PLSH-01
    verification:
      - kind: unit
        ref: "src/render/shake.test.ts#ShakeTracker nudge kick (D-17)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every accepted nudge pushes one nudge cue (left 0, right 1, up 2) between launch and tilt and calls fx.onNudge; tilt and drain call fx.onTilt / fx.onDrain; fx null is safe"
    requirement: PLSH-01
    verification:
      - kind: unit
        ref: "src/sandbox/presentation-observer.test.ts#PresentationObserver: nudge thump and effects (06-09, D-17, D-25)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The shaken frame: identity, BG_BOTTOM fill over the backing, blit at the offset, every world transform at offX + shakeX / offY + shakeY; no save/restore, gradient, blur, filter, text or new layer; ends at alpha 1 / source-over"
    requirement: PLSH-01
    verification:
      - kind: unit
        ref: "src/render/table-renderer.test.ts#TableRenderer screen shake (PLSH-01, D-17, D-18, Pitfall 8)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Under prefers-reduced-motion the offset is exactly 0 for nudge, bumper, drain and tilt, while flash halos still draw"
    requirement: PLSH-01
    verification:
      - kind: unit
        ref: "src/render/shake.test.ts#ShakeTracker under reducedMotion (D-18, T-6-18)"
        status: pass
      - kind: unit
        ref: "src/render/table-renderer.test.ts#with reducedMotion true a live kick plus trauma 1 moves nothing, while the flash halo still draws"
        status: pass
    human_judgment: false
  - id: D6
    description: "Bumper chains and drains read as a subtle shake with every layer registered and the HUD still"
    requirement: PLSH-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 tracer human-verify checkpoint (npm run dev, bumper cluster then a drain)"
        status: pass
    human_judgment: true
    rationale: "Perceptual subtlety; approved by the user at the Task 1 checkpoint"
  - id: D7
    description: "Each nudge shoves the table once and settles in about a quarter second with a thump; TILT is the only clearly visible shake; reduce motion keeps the thump, flashes and blinks but moves nothing"
    requirement: PLSH-01
    verification:
      - kind: manual_procedural
        ref: "Task 2 human-check (npm run dev: X, Period, ArrowUp, nudge to TILT, then OS reduce motion on)"
        status: pending
    human_judgment: true
    rationale: "Kick feel is perceptual; the math, direction and zeroing are machine-proven. Deferred to phase UAT (human_verify_mode end-of-phase)"

duration: 47min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 09: Screen Shake and Nudge Kick Summary

**Step-clock screen shake: bumper, sling, drain and tilt events add capped trauma (two-sine noise, no random source), accepted nudges kick the view with a closed-form 8 Hz / zeta 0.55 spring that peaks at 6 px opposite the ball's push and is heard as a cabinet thump, all applied through one shaken blit plus one `resetWorld()` so no layer swims, and exactly zero under prefers-reduced-motion.**

## Performance

- **Duration:** 47 min wall-clock (includes the Task 1 checkpoint wait)
- **Started:** 2026-11-22T22:30:49Z
- **Completed:** 2026-11-22T23:17:26Z
- **Tasks:** 2
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments
- `ShakeTracker`: scalar-only state, kick stamped on the next step and replacing any running kick, trauma clamped to [0, 1] with linear decay, offset clamped to 12 px * dpr and rounded to whole device pixels
- `EffectsTracker`: the one presentation-effects object; bumper/sling kicks arrive through the new `FxSink` on `CueFeedback`, nudges/tilts/drains through `ObserverFx` on the observer; it holds no world or rules handle
- Renderer: BG_BOTTOM fill at identity, static blit at the shake offset, every world transform (frame start, flipper flash, bats, balls) through one `resetWorld()`; under reduced motion the sample is skipped
- Observer: one `"nudge"` cue per accepted nudge (direction as the element id), so the 06-05 thump recipe is finally heard, with `fx.onNudge(dir)` kicking the view
- Live game: one `EffectsTracker` built from `world.getElements()`, ticked in `onPostStep` after `lamps.update()` and before `flash.tick()`, read by every render frame with the 06-06 `reducedMotion` flag

## Task Commits

1. **Task 1: Tracer, bumper hits, drains and tilts give the live view a trauma shake, and every layer stays registered** - `04855f2` (feat). Tracer feedback gate: human-verify (gate=blocking) approved by the user ("approved").
2. **Task 2: Nudges kick the view and thump, tilts and drains shake, reduced motion zeroes it all, and the shaken frame is pinned**
   - RED: `84bf4c7` (test)
   - GREEN: `ba7df19` (feat)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY

## Measured Results

| Check | Result |
|-------|--------|
| Left nudge, 60 steps at alpha 0 and 0.5, dpr 1 | sampled peak within 6 +/- 0.1 px (analytic about 5.98), first excursion -x, y 0 |
| Kick settle | below 0.06 px from step 30 (envelope about 0.014 px at 0.25 s) |
| Trauma 1 held, 600 steps, dpr 1 and 2 | trauma term never above 8 px * dpr |
| Kick + trauma 1, 1200 steps | clamp reached exactly 12 px * dpr, never exceeded; all outputs whole pixels |
| One full bumper (trauma 0.12) | at most 0.1152 px before rounding |
| `npx vitest run` / `npm test` | 58 files, 1134 tests passed |
| `npx tsc --noEmit`, `npx eslint src`, `npm run build` | clean |

## TDD Gate Compliance

Task 2 (`tdd="true"`): `test(06-09)` 84bf4c7 precedes `feat(06-09)` ba7df19.

- **RED:** two targets, each recorded with the JUnit reporter under `.gsd/tdd-evidence/06-09/` and classified `RED_EVIDENCE_OK` (the TAP-flat report was rejected as malformed because Vitest's multi-line diff output is not valid TAP; the JUnit rerun used the same test files and command).
  - `presentation-observer.test.ts#...a nudge-count increment with last dir right pushes one nudge on element 1...`: failed on `expected [] to deeply equal ['nudge']`. Semantic assessment: the target ran and failed on its planned assertion because the observer did not yet diff `getNudgeCount()`; four sibling nudge cases failed for the same reason; no load, syntax or fixture fault.
  - `table-renderer.test.ts#...with reducedMotion true the blit is at (0, 0)...even if the shake reports an offset`: failed with the blit at (3, -2) instead of (0, 0). Semantic assessment: the target ran and failed on the planned blit assertion because `draw()` trusted the effects sample under reduced motion; only this case failed.
- **Expected unexpected-GREEN:** the 13 `shake.test.ts` cases and the other shaken-frame cases passed on first run, because Task 1's tracer built `shake.ts` and the shaken frame (the plan's tracer-first order). The plan says to fix `shake.ts` only if a case exposed a gap, and none did.
- **GREEN:** the observer nudge push and the renderer guard made all cases pass.
- **REFACTOR:** none needed.

## Files Created/Modified
- `src/render/shake.ts` (new) - ShakeTracker, kick/noise functions, shake and trauma constants
- `src/render/effects.ts` (new) - EffectsTracker (FxSink + ObserverFx), EffectsReader
- `src/render/shake.test.ts` (new) - kick, trauma, caps, determinism, reduced-motion cases (13)
- `src/app/cue-queue.ts` - FxSink, CueFeedback fx forwarding
- `src/sandbox/presentation-observer.ts` - ObserverFx, nudge cue and fx.onNudge, tilt/drain fx calls, widened ObserverSession
- `src/sandbox/presentation-observer.test.ts` - FakeSession nudge getters, SpyFx, 9 nudge/effects cases
- `src/render/table-renderer.ts` - BG_BOTTOM fill, shaken blit, resetWorld(), RenderFrame.effects/reducedMotion, reduced-motion guard
- `src/render/table-renderer.test.ts` - re-pinned identity-fill-blit order, 5 shaken-frame cases
- `src/sandbox/main.ts` - EffectsTracker construction and wiring

## Decisions Made
See `key-decisions`. In short: backstop-saved drains shake, center-post kicks do not, the nudge cue carries its direction as the element id between launch and tilt, and reduced motion is enforced in the renderer as well as in the tracker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Static-blit test re-pinned in Task 1 instead of Task 2**
- **Found during:** Task 1
- **Issue:** the BG_BOTTOM fill before the blit broke the existing table-renderer test that expected the static blit as the second call, so the tracer's verify could not pass
- **Fix:** that test now expects identity `setTransform`, then `fillRect` (BG_BOTTOM) over the backing, then the blit at (0, 0). The shaken-frame recorder cases stayed in Task 2.
- **Files modified:** src/render/table-renderer.test.ts
- **Committed in:** 04855f2

**2. [Rule 2 - Critical] The renderer zeroes the shake under reduced motion on its own**
- **Found during:** Task 2
- **Issue:** `draw()` passed `reducedMotion` to `effects.shake.sample()` and trusted the result, so the vestibular-safety guarantee (T-6-18, a high-severity mitigate) depended on every effects source honoring the flag
- **Fix:** under `frame.reducedMotion` the renderer skips the sample and uses (0, 0); a recorder case with a shake that ignores the flag pins it
- **Files modified:** src/render/table-renderer.ts, src/render/table-renderer.test.ts
- **Committed in:** 84bf4c7 (test), ba7df19 (fix)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 critical safety hardening)
**Impact on plan:** no scope change; the safety fix makes the T-6-18 guarantee hold at the renderer.

## Issues Encountered
- The prettier failures in `src/sandbox/main.ts` (`tr.resize(computeView(...))`), `src/audio/recipes.ts`, `index.html`, `src/sandbox/debug-draw.ts` and `src/sandbox/game-e2e.test.ts` were already there and are out of scope. Every file this plan touched in Task 2 passes `prettier --check`.

## User Setup Required
None.

## Next Phase Readiness
- The particle plans can extend `EffectsTracker` through `onKick`/`onSensor`/`onNudge`/`onTilt`/`onDrain` and the stored resolved elements; the renderer already reads `frame.effects`.
- UAT flags: the vignette moves with the shake (research Pitfall 9, a deliberate D-20 trade-off), and the nudge kick feel plus reduced-motion behavior (D7) need the human check at phase UAT.

## Self-Check: PASSED
- FOUND: src/render/shake.ts, src/render/shake.test.ts, src/render/effects.ts
- FOUND commits: 04855f2, 84bf4c7, ba7df19
