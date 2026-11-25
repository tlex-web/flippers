---
phase: 06-juice-polish
plan: 10
subsystem: render, audio-cues, ui
tags: [canvas2d, lamps, ball-save, status-line, cues, tdd]

requires:
  - phase: 06-07
    provides: "getSaveCount, getLastSaveKind, getLastSaveStep, getSaveLampPhase session getters"
  - phase: 06-08
    provides: "spec element 610 kind post (circle R 0.09 at 1.45, 5.80), FLASH_TIMING.post"
  - phase: 06-03
    provides: "lamp shape table, LampTracker, generic lens bake, halo bake from shape colors"
  - phase: 06-04
    provides: "ballSave cue kind and recipe, HUD status priority resolver"
  - phase: 06-06
    provides: "drain cue keyed on getDrainCount()"
provides:
  - "LAMP_SAVE ring lamp (lamp 8 of 9) concentric with the post: steady / 2 Hz blink / off from getSaveLampPhase"
  - "post flourish clock (LampTracker.postAge) and the pure postPose(age, out)"
  - "renderer drawPost pass between the flash pass and the bats; ring hot-spot arc"
  - "ballSave cue per save-count increment, right after drain"
  - "BALL SAVED status row 5, newer of SKILL SHOT / BALL SAVED wins"
affects: [06-13 save sparks, 06-14 replay lamp tracker, verify-work UAT]

actuals:
  tokens: 14535
  tasks: 2
  commits: 4
plan_head_before: 4026851e60ba210265ff56a6be1450adb2477be3
plan_head_after: 242e1bddcb6a34ab482eaa2ad1f286121ad63131

tech-stack:
  added: []
  patterns:
    - "Presentation flourish clocks live in the LampTracker and diff rule counters on the step clock (like FlashTracker.record)"
    - "Pure pose functions write into a caller-owned struct (postPose(age, out)) so draw() allocates nothing"
    - "Two same-priority transient status rows resolve by recency: the later of the two event steps wins inside its window"

key-files:
  created: []
  modified:
    - src/render/lamps.ts
    - src/render/lamps.test.ts
    - src/render/table-renderer.ts
    - src/render/table-renderer.test.ts
    - src/sandbox/presentation-observer.ts
    - src/sandbox/presentation-observer.test.ts
    - src/ui/hud.ts
    - src/ui/hud.test.ts

key-decisions:
  - "On a backstop save the step pushes [drain, ballSave]: the drain growl still plays, then the save sting (carried from 06-07, settled by this plan)"
  - "BALL SAVED and SKILL SHOT share row 5; the later of getLastSaveStep() and getLastSkillStep() wins while inside its 180-step window; a same-step tie keeps SKILL SHOT"
  - "Post flourish starts only on a save-count increment whose last kind is kickback; a backstop save shows no post (the ring fades out)"
  - "The ring hot-spot is a 0.01 m LAMP_HOTSPOT arc over the ring's upper-left quarter, not the centered disc the filled lenses use (it would sit on the post)"

patterns-established:
  - "LampReader = Pick<LampTracker, level | postAge>: the renderer reads presentation clocks from frame.lamps, no new RenderFrame field"

requirements-completed: [PLSH-07]

coverage:
  - id: D1
    description: "Ball-save ring lamp concentric with the post: steady while armed, 2 Hz blink in the last 240 steps, unlit when spent / tilted / game over; unlit lens baked by the generic lens bake"
    requirement: PLSH-07
    verification:
      - kind: unit
        ref: "src/render/lamps.test.ts#Ball-save ring shape (plan 06-10, D-07, D-10)"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#LampTracker ball-save ring (plan 06-10, D-10, D-22)"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#LampTracker state map (06-UI-SPEC E5 backstop)"
        status: pass
      - kind: unit
        ref: "src/render/table-renderer.test.ts#TableRenderer ball-save ring and post flourish (plan 06-10, D-07, D-10, D-24) > the ring at level 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Kickback post flourish: POST_BODY disc at the collider's circle radius R rising 0.7R to R over 3 steps, SAVE_LIT flash halo, hold 48, sink 24; drawn after the flash pass, before the bats, frame contract kept"
    requirement: PLSH-07
    verification:
      - kind: unit
        ref: "src/render/lamps.test.ts#postPose (plan 06-10, UI-SPEC post flourish)"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#LampTracker post flourish clock (plan 06-10, D-07)"
        status: pass
      - kind: unit
        ref: "src/render/table-renderer.test.ts#TableRenderer ball-save ring and post flourish (plan 06-10, D-07, D-10, D-24)"
        status: pass
      - kind: manual_procedural
        ref: "Task 1 tracer human-verify checkpoint (npm run dev, center drain): user approved"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every save pushes one ballSave cue (after drain on a backstop), heard as the save sting"
    requirement: PLSH-07
    verification:
      - kind: unit
        ref: "src/sandbox/presentation-observer.test.ts#PresentationObserver: save sting (06-10, D-10, D-25)"
        status: pass
    human_judgment: true
    rationale: "The push order is machine-proven; whether the sting reads as a rising sweep with a metallic ping, and the drain-then-sting sequence on a backstop, is a listening judgment (Task 2 human-check)"
  - id: D4
    description: "BALL SAVED on the status line for 180 fixed steps after a save, newer of SKILL SHOT / BALL SAVED wins, TILT / TILT · NO BONUS / BONUS outrank it, write-on-change"
    requirement: PLSH-07
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts#HudView BALL SAVED row (plan 06-10 Task 2, 06-UI-SPEC row 5, D-10)"
        status: pass
    human_judgment: false

duration: 28min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 10: Ball-Save Flourish Summary

**Kickbacks pop a SAVE_LIT-rimmed post up at the collider's exact radius, a violet ring lamp around it shows the armed save and blinks at 2 Hz in its last two seconds, and every save (kickback or backstop) plays the save sting and shows BALL SAVED for 180 steps.**

## Performance

- **Duration:** 28 min (including the Task 1 tracer checkpoint pause)
- **Started:** 2026-11-22T23:20:32Z
- **Completed:** 2026-11-22T23:48:11Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- LAMP_SAVE (lamp 8, LAMP_COUNT 9): a closed 48-point ring around the post circle (inner edge R + 0.02, 0.035 wide, halo 0.22, SAVE_LIT / SAVE_UNLIT). Lit on getSaveLampPhase() "steady", 2 Hz blink counted from the blink edge on "blink", unlit on "off" and in attract.
- Post flourish clock in LampTracker: a save-count increment whose last kind is "kickback" starts postAge at the next update; a backstop never starts it. postPose(age, out): rise 0.7R to R over 3 steps, hold 48, sink to 0.7R with alpha 1 to 0 over 24, flash = flashLevel(age, 10, 2).
- Renderer drawPost runs after the flash pass and before the bats: POST_BODY disc at R * scale, 0.02 m SAVE_LIT rim, SAVE_LIT halo at HALO_SCALE * R from the shape-table sprite under "lighter". R is read from the resolved "post" element's circle, the same field as the sensor (T-6-21).
- Observer pushes one "ballSave" (no element, strength 1) per getSaveCount() increment, right after the drain push. A backstop save pushes ["drain", "ballSave"].
- HUD status row 5: BALL SAVED for STATUS_TRANSIENT_STEPS (180) after a save. When SKILL SHOT is also inside its window, the newer event wins. TILT, TILT · NO BONUS and BONUS still outrank it.

## Task Commits

1. **Task 1 (tracer): post pop-up and save ring lamp**: RED `d2184b4` (test), GREEN `bda0df6` (feat). The tracer feedback gate was a human-verify checkpoint (gate=blocking), and the user approved it.
2. **Task 2: save sting and BALL SAVED**: RED `e4718e1` (test), GREEN `242e1bd` (feat)

No REFACTOR commits were needed.

## TDD Evidence

Records are in `.gsd/tdd-evidence/06-10/`, which is self-ignoring. All four came from the Vitest JUnit reporter and all four returned `RED_EVIDENCE_OK`.

- **t1-lamps.json**: 20 of 49 failing.
  - Target: `postPose (plan 06-10, UI-SPEC post flourish) > rises from 0.7R at age 0 to R at age 3`.
  - Semantic check: the new ring, clock and pose cases failed because the symbols they assert on (LAMP_SAVE, postAge, postPose) did not exist yet. There were no load errors, and the pre-existing cases passed.
- **t1-renderer.json**: 5 failing.
  - Target: `TableRenderer ball-save ring and post flourish ... > a post at age 0 ...`.
  - Semantic check: no post disc, rim or halo was drawn, and there was no ring row. These are the planned assertions.
- **t2-observer.json**: 3 of 46 failing.
  - Target: `PresentationObserver: save sting ... > a backstop save ... pushes drain then ballSave`.
  - Semantic check: the step pushed `["drain"]` with no ballSave, because the observer did not read getSaveCount yet. The other two failures are sibling save-sting cases. There were no load or syntax faults.
- **t2-hud.json**: 6 of 88 failing.
  - Target: `HudView BALL SAVED row ... > a save at step 100 shows BALL SAVED through step 279 and not at 280`.
  - Semantic check: the status line read `""` instead of `BALL SAVED` because the resolver had no ballSaved row. The other five are sibling BALL SAVED cases. There were no load or syntax faults.

## TDD Gate Compliance

Both tasks have a `test(06-10)` RED commit followed by a `feat(06-10)` GREEN commit that descends from it: d2184b4 then bda0df6, and e4718e1 then 242e1bd. No violations.

## Files Created/Modified

- `src/render/lamps.ts`: LAMP_SAVE ring shape and target, LampRules save getters, the post flourish clock, postAge, PostPose, postPose and POST_*_STEPS.
- `src/render/table-renderer.ts`: post center and radius cache, the renderer-owned PostPose, drawPost, and the closed-stroke hot-spot arc rule.
- `src/sandbox/presentation-observer.ts`: ObserverSession gains getSaveCount, and the ballSave push between drain and bonusTick.
- `src/ui/hud.ts`: StatusCode "ballSaved", HudSource getSaveCount / getLastSaveStep, the row-5 recency rule, and `statusText` returning "BALL SAVED".
- Tests: `src/render/lamps.test.ts`, `src/render/table-renderer.test.ts`, `src/sandbox/presentation-observer.test.ts`, `src/ui/hud.test.ts`.

## Decisions Made

- Backstop save cues are `["drain", "ballSave"]`. The drain growl still plays, followed by the save sting (carried over from 06-07 and settled by the plan).
- Row-5 recency: the later of getLastSaveStep() and getLastSkillStep() wins while inside its 180-step window. A same-step tie keeps SKILL SHOT; the two events cannot share a step in play.
- The post flourish is kickback-only. A backstop save shows no post, matching the UI-SPEC: the ring fades out, BALL SAVED appears and the sting plays.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier formatting in the Task 1 renderer test**
- **Found during:** Task 1 GREEN
- **Issue:** The RED renderer test file failed the prettier check.
- **Fix:** Formatted the file with prettier. Formatting only, no change to test logic.
- **Files modified:** src/render/table-renderer.test.ts
- **Committed in:** bda0df6

---

**Total deviations:** 1 auto-fixed (1 blocking, formatting only)
**Impact on plan:** None. No scope change.

## Issues Encountered

- The Vitest TAP reporter breaks on multi-line diffs, so the RED evidence used the JUnit reporter instead. The classifier supports JUnit.
- Some files already failed the prettier check before this plan and were left alone: src/audio/recipes.ts, index.html, src/sandbox/main.ts, src/sandbox/debug-draw.ts and src/sandbox/game-e2e.test.ts.

## Verification

- `npx vitest run src/sandbox/presentation-observer.test.ts src/ui src/sandbox/presentation.determinism.test.ts`: 4 files, 163 tests passed.
- `npx tsc --noEmit`: exit 0. `npx eslint src`: exit 0.
- `npx vitest run`: 58 files, 1181 tests passed, including asset-free.test.ts and presentation.determinism.test.ts.
- `npm run build`: passed.
- Acceptance greps: `"ballSave"` appears 2 times in presentation-observer.ts and `BALL SAVED` appears 4 times in hud.ts. All Task 1 greps were met at bda0df6.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- The ball save is now visible and audible. Task 2's listening check (sting character, and drain-then-sting on a backstop) is left for verify-work UAT.
- 06-13 can add save sparks off postAge / the save count. 06-14 can attach the LampTracker, which now covers the complete lamp set, to the read-only replay.

## Self-Check: PASSED

- All four modified source files exist.
- Commits d2184b4, bda0df6, e4718e1 and 242e1bd are ancestors of HEAD.
- The evaluation scope resolves the plan's commits on this branch.

---
*Phase: 06-juice-polish*
*Completed: 2026-11-22*
