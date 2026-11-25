---
phase: 05-rendering-audio
plan: 04
subsystem: rendering
tags: [canvas2d, flash, step-clock, collision-bus, rnd-03, d-03]

requires:
  - phase: 05-01
    provides: FlashSink, CueFeedback(cues, flash) recording registered kicks and sensor passes, KICK_FLASH_FLOOR
  - phase: 05-02
    provides: TableRenderer, RenderFrame, LayerFactory, flash palette, recording context test support
provides:
  - FlashTracker step-clock flash state (record / tick / level) with per-kind timings and hard cutoff
  - Baked halo sprites (bakeHalo) and the renderer flash pass under "lighter"
  - ContactFlash bus listener for wall / chute / flipper hits at or above SLING_MIN_IMPULSE (silent, D-03)
  - Live wiring in main.ts (FlashTracker into CueFeedback, flash.tick() at end of onPostStep, ContactFlash, renderFrame.flash/alpha)
affects: [05-05 drain observer records the drain flash id 600, 05-06, UAT flash-timing tuning]

actuals:
  tokens: 11650
  tasks: 2
  commits: 3
plan_head_before: 532e1066ec267b99aa95e314081f832340087ca0
plan_head_after: 408b6f2e7298ab05349d84175754a8581076981d

tech-stack:
  added: []
  patterns:
    - "Step-clock presentation state: typed arrays indexed by element id, tick() once per fixed step, read at step + loop.alpha"
    - "Sprites baked once per resize; per-frame intensity via globalAlpha under 'lighter', composite and alpha reset after the pass"
    - "Passive-surface bus listener: bound-arrow field, kind filter, inclusive impulse threshold, scalars only, no cue access"

key-files:
  created:
    - src/render/flash.ts
    - src/render/flash.test.ts
    - src/render/sprites.ts
    - src/render/contact-flash.ts
    - src/render/contact-flash.test.ts
  modified:
    - src/render/table-renderer.ts
    - src/render/table-renderer.test.ts
    - src/sandbox/main.ts

key-decisions:
  - "Flipper flash is a stadium FLIPPER_FLASH_RIM_M (0.02 m) wider than the bat, because the flash pass runs before the opaque bat and a same-size redraw would be hidden"
  - "ContactFlash filters to wall, chute and flipper only; kickers and sensors flash solely through the rules hook, so tilt, cooldown repeats and passive sling faces never flash"
  - "ContactFlash NaN guard is the negated comparison !(impulse >= SLING_MIN_IMPULSE), so a corrupt impulse records nothing without a separate isFinite check"

patterns-established:
  - "Flash pass: precompute flashable lists by kind in the constructor; draw() reads level per element and skips at or below FLASH_EPS"

requirements-completed: [RND-03]

coverage:
  - id: D1
    description: "FlashTracker: per-kind step-clock timings, hold then exponential decay, hard cutoff at hold + 4 decays, bounds/NaN-safe record, interpolated level at alpha"
    requirement: RND-03
    verification:
      - kind: unit
        ref: "src/render/flash.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "ContactFlash: wall/chute/flipper flash at CONTACT_FLASH_PEAK on hits >= SLING_MIN_IMPULSE (inclusive); rolling, resting, NaN and all other kinds record nothing"
    requirement: RND-03
    verification:
      - kind: unit
        ref: "src/render/contact-flash.test.ts#ContactFlash passive-surface rule (RND-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-03: a wall hit through a real router flashes id 100 and pushes zero cues"
    requirement: RND-03
    verification:
      - kind: integration
        ref: "src/render/contact-flash.test.ts#D-03: a wall contact flashes but makes no sound"
        status: pass
    human_judgment: false
  - id: D4
    description: "Flash pass frame rules: one centered bumper halo under lighter, nothing drawn without a flash or below FLASH_EPS, no blur/gradient/new layer with every id lit, only static and halo sprites drawn, wall stroke and flipper fill, frame ends source-over / alpha 1"
    requirement: RND-03
    verification:
      - kind: unit
        ref: "src/render/table-renderer.test.ts#TableRenderer flash pass (RND-03, T-05-15)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Flash visibility and decay feel in the live game (bumper pink bloom about a third of a second, sling amber, rollover green, ball and bats drawn over the glow, nothing outside the element flashes); no large-area strobe"
    requirement: RND-03
    verification:
      - kind: manual_procedural
        ref: "Task 1 tracer human-verify checkpoint (npm run dev, hit bumpers / sling / rollovers)"
        status: pass
    human_judgment: true
    rationale: "Perceived flash visibility, decay feel and strobe risk are perceptual; the user approved the Task 1 tracer checkpoint, and the prohibition on large-area flashes routes to judgment review at UAT. Wall/chute/flipper flash feel (added in Task 2) has not been seen live yet."

duration: 17min
completed: 2026-11-21
status: complete
---

# Phase 05 Plan 04: Element Flashes Summary

**Every hit now flashes on the fixed-step clock: registered bumper/sling/sensor hits light baked halos and bright strokes through CueFeedback, and walls, the chute and the bats flash silently off the collision bus via ContactFlash at or above SLING_MIN_IMPULSE.**

## Performance

- **Duration:** 17 min (wall clock from plan start, including the Task 1 checkpoint pause)
- **Started:** 2026-11-21T14:41:55Z
- **Completed:** 2026-11-21T14:59:24Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- FlashTracker (src/render/flash.ts): typed-array flash state indexed by element id, `tick()` as the last call of `onPostStep`, `level(id, alpha, timing)` read at `step + alpha`. Flashes pause with the sim and never read a wall clock. Per-kind timings: bumper 2/10, sling 1/7, sensors 0/14, contact 0/5 at 0.35 peak, drain 0/20, hard cutoff at hold + 4 decays.
- Halo sprites baked once per resize (src/render/sprites.ts). The renderer flash pass draws only element-local marks under "lighter" with level as `globalAlpha`: a bumper halo, the sling rubber stroke, a sensor halo plus stroke, drain/wall/chute strokes, and a rim around the flipper bat.
- ContactFlash (src/render/contact-flash.ts): walls, the chute and the bats flash on real hits only, and make no sound (D-03, it never holds the cue queue).
- Live wiring in src/sandbox/main.ts: `new CueFeedback(cues, flash)`, `flash.tick()`, `new ContactFlash(router, flash)`, and `renderFrame.flash` / `renderFrame.alpha` set each frame.

## Task Commits

1. **Task 1: Tracer. A registered bumper kick lights a glowing halo that decays on the step clock** - `1bb1b9b` (feat). Tracer checkpoint approved by the user.
2. **Task 2: Walls, chute and flippers flash on real hits only, silently; flash pass contract** (TDD)
   - RED `b5e7433` (test): ContactFlash contract, D-03 case, flash-pass frame cases, plus a stub ContactFlash that records nothing
   - GREEN `408b6f2` (feat): ContactFlash implementation and main.ts wiring
   - REFACTOR: none needed

## TDD Gate Compliance (Task 2)

- **RED:** `npx vitest run src/render/contact-flash.test.ts --reporter=tap-flat` exited 1: 8 tests, 5 failed, 3 passed. Target test: "a wall hit at 0.0393 records (100, CONTACT_FLASH_PEAK)". Expected `100@0.35`, got an empty log. Classifier returned `RED_EVIDENCE_OK` (`target_test_failed`). Semantic assessment: the target ran and failed on its planned `toBe` assertion because the stub registers but records nothing. There was no import, syntax or fixture fault. The 3 cases that pass are the never-record cases, which a do-nothing stub satisfies by construction.
- **Expected-green characterization:** the 6 new flash-pass cases in table-renderer.test.ts passed on first run. The tracer (Task 1) had already built the flash pass. The plan says to fix the renderer only if a behavior line exposes a gap, and none did, so these cases pin existing behavior. They did not drive new code.
- **GREEN:** all 8 contact-flash cases pass. Full suite: 50 files / 694 tests.
- Gate log: `test(05-04)` b5e7433 comes before `feat(05-04)` 408b6f2, and the GREEN commit descends from the RED one. No violation.

## Files Created/Modified

- `src/render/flash.ts` - FlashTiming, FLASH_* timings, FLASH_TIMING by kind, FLASH_EPS, CONTACT_FLASH_PEAK, flashLevel, maxElementId, FlashTracker
- `src/render/flash.test.ts` - decay law, cutoff, NaN/out-of-range ids, interpolation, clamp, maxElementId 600
- `src/render/sprites.ts` - HALO_SCALE, SENSOR_HALO_M, bakeHalo (radial gradient baked at resize only)
- `src/render/contact-flash.ts` - ContactFlash bus listener
- `src/render/contact-flash.test.ts` - kind filter, inclusive threshold, NaN, pooled-record copy, D-03 integration
- `src/render/table-renderer.ts` - FlashReader, RenderFrame.flash/alpha, precomputed flashable lists, halo bakes, the flash pass
- `src/render/table-renderer.test.ts` - frameOf supplies flash/alpha; halo layer count; 6 flash-pass cases
- `src/sandbox/main.ts` - FlashTracker, CueFeedback(cues, flash), flash.tick(), ContactFlash, renderFrame.flash/alpha

## Decisions Made

- Flipper flash is drawn as a stadium 0.02 m (`FLIPPER_FLASH_RIM_M`) wider than the bat. The flash pass runs before the opaque bat, so a same-size redraw would be invisible.
- ContactFlash handles wall, chute and flipper only. Kickers and sensors flash only through the rules hook, and the drain's flash belongs to the 05-05 observer.
- Contact-flash test assertions compare single-line strings (`"100@0.35"`), not nested arrays. This keeps the TAP report flat enough for the RED evidence classifier, which rejected Vitest's multi-line YAML diff of arrays as malformed TAP.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] table-renderer.test.ts updated in Task 1 (outside Task 1's file list)**
- **Found during:** Task 1
- **Issue:** the new required RenderFrame fields broke `frameOf`, and the layer-count assertions did not count the halo layers baked at resize.
- **Fix:** `frameOf` supplies `flash: null, alpha: 0`. The two layer-count assertions now expect 1 static layer + 2 halo layers per resize.
- **Files modified:** src/render/table-renderer.test.ts
- **Committed in:** 1bb1b9b

**2. [Design choice] Flipper flash rim instead of a same-size bat redraw**
- **Found during:** Task 1
- **Issue:** the plan's "bat stadium redrawn in FLASH_FLIPPER" would be fully covered by the opaque bat drawn right after the flash pass.
- **Fix:** the stadium is drawn 0.02 m wider (`FLIPPER_FLASH_RIM_M`), so a glowing rim shows around the bat.
- **Files modified:** src/render/table-renderer.ts
- **Committed in:** 1bb1b9b

**3. [Rule 3 - Blocking] RED stub of contact-flash.ts committed with the failing tests**
- **Found during:** Task 2 RED
- **Issue:** without the module, the test file fails at import, which tdd.md classifies as INVALID_RED.
- **Fix:** the RED commit includes a stub ContactFlash that registers and records nothing, so the target fails on its assertion. GREEN replaced the stub.
- **Files modified:** src/render/contact-flash.ts
- **Committed in:** b5e7433 (stub), 408b6f2 (implementation)

---

**Total deviations:** 3 (2 blocking fixes, 1 design choice)
**Impact on plan:** none on scope. All three were needed for correctness, visibility or a valid TDD gate.

## Issues Encountered

- The first RED evidence run came back `INVALID_RED (invalid_record)`. Vitest's tap-flat reporter writes a multi-line YAML `expected:` block for array diffs, and the classifier parses that as malformed TAP. I rewrote the assertions as single-line string comparisons and re-ran: `RED_EVIDENCE_OK`.
- Out of scope, logged in `deferred-items.md`: `src/sandbox/main.ts` has failed `prettier --check` since 05-02 (df0afc5), on one long `tr.resize(...)` line. ESLint and tsc are clean, and I did not touch it.

## Verification

- `npx vitest run src/render src/game`: 11 files / 146 tests pass
- `npx tsc --noEmit`: clean
- `npx eslint src`: clean
- `npx vitest run`: 50 files / 694 tests pass (src/sandbox/game.determinism.test.ts unchanged and passing)
- Only src/physics/planck-world.ts imports the engine. src/render never imports it.
- Acceptance greps: `class ContactFlash` 1, `new ContactFlash(` 1, `SLING_MIN_IMPULSE` in contact-flash.ts 3. All Task 1 greps hit (see 1bb1b9b).

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- 05-05 can record the drain flash on id 600. The renderer already draws a FLASH_DRAIN stroke whenever FlashTracker holds a level for it.
- UAT should check the live feel of the wall, chute and flipper flash (0.35 peak, 5-step decay). Only the Task 1 kicker and sensor flashes were seen at the tracer checkpoint. All timings are tunable in src/render/flash.ts (A1).

---
*Phase: 05-rendering-audio*
*Completed: 2026-11-21*

## Self-Check: PASSED

- Files: src/render/flash.ts, flash.test.ts, sprites.ts, contact-flash.ts, contact-flash.test.ts all FOUND
- Commits: 1bb1b9b, b5e7433, 408b6f2 all FOUND on HEAD; evaluation-scope resolved 3 plan commits on this branch
