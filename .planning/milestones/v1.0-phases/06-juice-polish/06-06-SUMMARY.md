---
phase: 06-juice-polish
plan: 06
subsystem: presentation
tags: [hud, bonus, overlay, count-up, reduced-motion, audio-cues, vitest]

requires:
  - phase: 06-juice-polish
    provides: "06-05 bonus state, tally getters (getBonusTally, getBonusElapsed, getDrainCount), onFlipperPress() skip latch and the bonus.ts schedule; 06-04 bonusTick cue kind and recipe"
provides:
  - "src/ui/hud.ts: AttrSink, BonusSource, BonusView, bonusRowLabel, COUNT_UP_TAU_S, COUNT_UP_SNAP, HudView.update(src, dtSeconds, reducedMotion)"
  - "index.html: #hud-bonus overlay markup and styles, --accent-glow, white-space: nowrap on .hud-score"
  - "src/sandbox/main.ts: flipper-press skip latch, bonusView, reducedMotion boolean with one change listener, HUD dt = steps * FIXED_DT"
  - "src/sandbox/presentation-observer.ts: drain from getDrainCount(), one bonusTick per row reveal, widened ObserverSession"
affects: [06-07 ball save (drain cue now rises on a backstop save too), 06-09 shake (reuses the reducedMotion boolean), 06-14 determinism coverage]

actuals:
  tokens: 11834
  tasks: 2
  commits: 4
plan_head_before: 9be91732f4e212bb0b753221659f2c57e4ab9d03
plan_head_after: 9c5ef9234699260a4da975c0f588687d37a4eea8

tech-stack:
  added: []
  patterns:
    - "Display-only exponential chase on the step clock (dt = steps * FIXED_DT), write-on-change on the rounded value"
    - "Media query read once at boot plus one change listener; the frame reads a boolean"
    - "Observer pushes counter-driven cues (drain count, revealed row count) instead of inferring them from state transitions"

key-files:
  created: []
  modified:
    - src/ui/hud.ts
    - src/ui/hud.test.ts
    - index.html
    - src/sandbox/main.ts
    - src/sandbox/presentation-observer.ts
    - src/sandbox/presentation-observer.test.ts

key-decisions:
  - "06-06: the bonus overlay stays hidden during a tilt forfeit hold; the status line carries TILT · NO BONUS"
  - "06-06: HudView.update's dt defaults to +Infinity so callers without a dt snap; a non-finite dt also snaps, dt 0 leaves the shown value"
  - "06-06: the score snap test is gap <= COUNT_UP_SNAP, which also covers a target drop (gap < 0), so a new game snaps to 0"
  - "06-06: the observer no longer tracks the ball number; the drain cue is one per getDrainCount() increment and gameOver is pushed alone after the tally"
  - "06-06: bonusTick strength 1 on element -1; the revealed-row count is snapshotted at construction and reset outside the bonus state"

patterns-established:
  - "FakeSession.drain(r, i, b, forfeit) in the observer test mirrors the session's drain step (count up, bonus at elapsed 0, ball unchanged)"
  - "RED evidence via Vitest's junit reporter; target id format file#describe > test"

requirements-completed: [PLSH-06]

coverage:
  - id: D1
    description: "The bonus overlay reveals the tally row by row (48 steps per row, linear count, TOTAL last), hidden outside bonus and for a forfeit, write-on-change"
    requirement: "PLSH-06"
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts#BonusView overlay (plan 06-06 Task 1, 06-UI-SPEC bonus overlay, D-12)"
        status: pass
      - kind: manual
        ref: "Task 1 tracer human-verify: live overlay legibility, pacing and flipper-press skip"
        status: pass
    human_judgment: true
  - id: D2
    description: "The HUD score counts up (tau 0.20 s, snap 10), never overshoots, snaps on a drop, under reduced motion and without a dt"
    requirement: "PLSH-06"
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts#HudView score count-up (plan 06-06 Task 2, D-14, PLSH-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Drain cue and apron flash on the drain step from getDrainCount(); one bonusTick per row reveal, none for TOTAL, all-zero or forfeit"
    requirement: "PLSH-06"
    verification:
      - kind: unit
        ref: "src/sandbox/presentation-observer.test.ts#PresentationObserver: bonus row ticks (06-06, D-25)"
        status: pass
      - kind: integration
        ref: "src/sandbox/presentation.determinism.test.ts (still hears the drain)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Count-up pacing and drain/tick timing feel right in the live game, with and without OS reduce motion"
    requirement: "PLSH-06"
    verification:
      - kind: manual
        ref: "Task 2 human-check (npm run dev, score bumpers, drain, repeat with reduce motion on)"
        status: pending
    human_judgment: true

duration: 16min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 06: Bonus Tally Overlay and Score Count-Up Summary

**A centered BONUS overlay that reveals ROLLOVERS / INLANES / BANKS rows every 48 steps with counting values and a TOTAL, skippable with a flipper press; a HUD score that chases its target exponentially (tau 0.20 s, snap 10) on the step clock; prefers-reduced-motion read once and honored by both; and the drain growl and a per-row bonusTick heard on the steps they happen.**

## Performance

- **Duration:** 16 min (including the Task 1 tracer checkpoint)
- **Started:** 2026-11-22T21:38:04Z
- **Completed:** 2026-11-22T21:54:06Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `BonusView` (Task 1): write-on-change overlay over injected `AttrSink` / `TextSink`s. Every included row is laid out from step 0 with `data-revealed="false"`, so a partial reveal never reflows the panel. Labels read `KIND × n` with U+00D7. TOTAL text is written at full value from the first step and revealed after the last row.
- `#hud-bonus` markup and styles per UI-SPEC: fixed center, panel frame, two-column grid from min-width 240px, nowrap, tabular-nums, `--accent-glow` text shadow, TOTAL rule. `.hud-score` gets `white-space: nowrap`.
- Live skip (Task 1): a left or right press edge in `onFixedStep` calls `session.onFlipperPress()`.
- Count-up (Task 2): `HudView` keeps a float `shown` and steps it by `gap * (1 - exp(-dt / 0.2))`. It snaps when the gap is at most 10, on a drop, under reduced motion and when dt is missing or non-finite. The line is written only when `Math.round(shown)` changes. `getScore()` is untouched.
- Reduced motion (Task 2): `matchMedia("(prefers-reduced-motion: reduce)")` is read once at boot with one change listener. `main.ts` passes `steps * FIXED_DT` and the boolean to `hudView.update`, and the boolean to `bonusView.update`.
- Observer (Task 2): the drain cue and apron flash fire once per `getDrainCount()` increment, on the drain step instead of at the post-tally serve. One `bonusTick` fires per increase of `revealedRowCount(rows, elapsed)` in a non-forfeit tally with rows. The ball-number tracking was removed.

## Task Commits

1. **Task 1 (tracer): The live game shows the bonus tally overlay, and a flipper press skips it** - `55240d7` (test, RED), `dd476d4` (feat, GREEN). Tracer gate: human-verify, approved.
2. **Task 2 (tdd): The score counts up, reduced motion is honored, and the drain and row ticks are heard on time** - `d279bc6` (test, RED), `9c5ef92` (feat, GREEN)

**Plan metadata:** recorded in the docs commit that follows this SUMMARY.

## Files Created/Modified

- `src/ui/hud.ts` - `AttrSink`, `BonusSource`, `BonusView`, `bonusRowLabel`, `COUNT_UP_TAU_S`, `COUNT_UP_SNAP`, the chase in `HudView.update`
- `src/ui/hud.test.ts` - BonusView overlay cases (fake attribute sink), count-up cases
- `index.html` - `#hud-bonus` overlay, `--accent-glow`, nowrap score
- `src/sandbox/main.ts` - skip latch, BonusView construction, reducedMotion boolean and listener, HUD dt
- `src/sandbox/presentation-observer.ts` - drain counter, bonusTick, widened `ObserverSession`, order doc
- `src/sandbox/presentation-observer.test.ts` - FakeSession drain/tally fields, drain cases rewritten to the counter, bonus tick cases

## Decisions Made

- The overlay stays hidden during a forfeit hold, because there is nothing to tally. The status line shows TILT · NO BONUS.
- The snap condition is the single test `gap <= COUNT_UP_SNAP`, which covers both the snap band and a target drop.
- The observer drops `getBall` from `ObserverSession`. The drain is never inferred from the ball number, so a serve pushes nothing.
- `bonusTick` is pushed at strength 1 on element -1. The recipe has `levelFromStrength: false`, so strength does not matter. The revealed-row count is snapshotted at construction, so an observer built mid-tally does not replay ticks.

## Deviations from Plan

### Auto-fixed Issues

None. Both tasks were implemented as written.

**Note: existing observer drain cases rewritten.** The 05-05 cases (`playing/1 -> playing/2 pushes drain`, `playing/3 -> game-over pushes drain then gameOver`, and the tilted variants) encoded the ball-number inference that this plan replaces. They were rewritten to the drain-counter contract in the RED commit: the drain on the counter, no drain on the serve, and gameOver alone after the tally. The skill-shot ordering case now raises the drain count instead of the ball number.

---

**Total deviations:** 0. One set of legacy test cases was rewritten to the new contract, as the plan intends.
**Impact on plan:** None.

## TDD Gate Compliance

- **Task 1 RED:** `55240d7`. Evidence `.gsd/tdd-evidence/06-06/red-task1-bonusview.json` = `RED_EVIDENCE_OK`, a TypeError "BonusView is not a constructor" on the target BonusView case. GREEN `dd476d4`.
- **Task 2 RED:** `d279bc6`. Evidence `.gsd/tdd-evidence/06-06/red-task2-countup-observer.json` = `RED_EVIDENCE_OK` (`target_test_failed`). Target: `src/ui/hud.test.ts#HudView score count-up ... shows round(10,000 * (1 - e^-1)) = 6,321`. 15 failures, all assertion-level: the score snapped to 10,000, `COUNT_UP_*` were undefined, the drain was inferred from the ball, and no bonusTick was pushed. There were no load or compile failures. The first record used `--reporter=tap-flat` and was rejected as `invalid_record` because Vitest's TAP output breaks multi-line array diffs. It was re-recorded with `--reporter=junit`, which is supported.
- **Task 2 GREEN:** `9c5ef92`. No refactor commit was needed.

## Issues Encountered

- `prettier --check` still warns on `src/sandbox/main.ts`, only at the existing `tr.resize(computeView(...))` line, which predates this plan. The lines added here match prettier's output. The other existing warnings (index.html near line 30, `src/audio/recipes.ts`) are out of scope and were left untouched.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- 06-07 (ball save): the drain counter also rises on a backstop save, so the drain cue plays before the save sting. This was kept on purpose (flagged assumption).
- 06-09 (shake) can read the same `reducedMotion` boolean in `main.ts`.
- Pending perceptual check (Task 2 human-check): count-up pacing, the drain growl on the drain step, the per-row tick, and reduce-motion snapping in `npm run dev`.
- Verification: `npx tsc --noEmit` and `npx eslint src` are clean. `npx vitest run` passes 56 files, 1062 tests, and `npm run build` succeeds. presentation.determinism passes.

## Self-Check: PASSED

- FOUND: src/ui/hud.ts, src/ui/hud.test.ts, index.html, src/sandbox/main.ts, src/sandbox/presentation-observer.ts, src/sandbox/presentation-observer.test.ts
- FOUND: 55240d7, dd476d4, d279bc6, 9c5ef92 (all ancestors of HEAD)

---
*Phase: 06-juice-polish*
*Completed: 2026-11-22*
