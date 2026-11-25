---
phase: 06-juice-polish
plan: 14
subsystem: testing
tags: [determinism, replay, read-only-presentation, soak, ball-save, phase-gate, vitest]

# Dependency graph
requires:
  - phase: 06-juice-polish
    provides: "06-01..06-13: skill shot, depth, lamps, stings, bonus rules and overlay, ball save and kickback, shake, save flourish, high score, particles, glints (the rule and module surface this plan proves together)"
provides:
  - "game.determinism.test.ts: main.ts-parity Phase-6 composition, state-keyed script reactions, Outcome with skillShotCount/saveCount/lastSaveKind/drainCount/best/isNewBest/trace and sawSkip/sawForfeit/anchorCharge non-vacuity"
  - "presentation.determinism.test.ts: every Phase-6 presentation module attached in main.ts order, plus a reduced-motion run, bit-identical to the bare run"
  - "ReactiveSoakWorld({ bullet, saveArmed? = true }) with always-armed RuleHooks and a postKicks getter; postKicks > 0 asserted in the fast soak and the 630 s gate"
affects: [phase-06-verification, uat, future-rule-changes]

# Actuals (#2632)
actuals:
  tokens: 7200
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "State-keyed replay script: reactions read session state at the top of a fixed step and schedule keys by step index, so they stay cadence-independent"
    - "Shake read from the recorded static drawImage offset, so the reduced-motion proof needs no renderer seam"

key-files:
  created: []
  modified:
    - src/sandbox/game.determinism.test.ts
    - src/sandbox/presentation.determinism.test.ts
    - src/harness/reactive-world.ts
    - src/harness/reactive-soak.test.ts
    - src/harness/reactive-table-soak.gate.test.ts

key-decisions:
  - "Replay script is two fixed keys (Enter on step 0, the D-05 anchor hold 121..183) plus state-keyed reactions: full plunge on any rest after the anchor, skip the first non-forfeit tally 10 steps in, tilt ball 2 240 steps after its launch; the whole 3-ball game ends at step 2924, so EXPECTED_STEPS stays 3600"
  - "Both bats are tapped (steps 20-40, 50-70) while ball 1 sits in the shooter lane, so flipper coil cues and the relay stay covered without touching the anchor"
  - "The always-armed soak save is the ReactiveSoakWorld default; saveArmed: false restores the Phase-4 wrapper"

patterns-established:
  - "Phase gate tests assert per-feature non-vacuity flags (sawSkip, sawForfeit, anchorCharge, cue tallies, particleFrames, maxLamp, shakenFrames, postKicks) beside bit-identity, so a silently skipped rule turns the gate red"

requirements-completed: [PLSH-01, PLSH-02, PLSH-03, PLSH-04, PLSH-05, PLSH-06, PLSH-07, PLSH-08]

coverage:
  - id: D1
    description: "The full Phase-6 rules replay bit-identically at 60, 120 and 144 Hz with the skill shot, a save, a skipped tally, a forfeit and a new-best game over exercised in every run"
    requirement: "PLSH-05"
    verification:
      - kind: integration
        ref: "src/sandbox/game.determinism.test.ts#the same key timeline gives the same Phase-6 game at 60, 120 and 144 Hz"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every Phase-6 presentation module (effects, lamps, renderer frame, HUD, bonus overlay) is read-only at 144 and 60 Hz and under reduced motion, and each demonstrably ran"
    requirement: "PLSH-02"
    verification:
      - kind: integration
        ref: "src/sandbox/presentation.determinism.test.ts#the presentation layer is read-only (RND-02, T-05-18, D-23)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The always-armed ball save runs through the rules-live soak (fast suite and 630 s gate) with post kicks firing, no escape, and the CCD-off RED control still red and replayable"
    requirement: "PLSH-07"
    verification:
      - kind: integration
        ref: "src/harness/reactive-soak.test.ts"
        status: pass
      - kind: other
        ref: "npm run soak (src/harness/reactive-table-soak.gate.test.ts)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Phase gate green: tsc --noEmit, eslint src, vitest run (60 files, 1264 tests), npm run soak, npm run build; asset-free gate green; only planck-world.ts imports the engine"
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak && npm run build"
        status: pass
    human_judgment: false
  - id: D5
    description: "Perceptual feel of the phase (shake subtlety, lamp look, post read, skill-shot band, count-up pacing, 60 fps at 144 Hz, real-browser high-score reload)"
    verification: []
    human_judgment: true
    rationale: "Perceptual UAT is out of scope for headless gates by plan (flagged assumptions); judged in /gsd-verify-work"

duration: 10min
completed: 2026-11-23
status: complete
commits: 3
plan_head_before: c2bd7220d1998042bdff7eed7ef110fe5e7c419b
plan_head_after: f6da1609a04e5fe8fc3ff16468df66563a2806ea
---

# Phase 6 Plan 14: Phase Proof Gates Summary

**The whole Phase-6 game (D-05 anchor skill shot, kickback saves, a flipper-skipped tally, a tilt forfeit, game over on a new best) now replays bit-identically at 60/120/144 Hz, stays bit-identical with every Phase-6 presentation module attached (reduced motion on and off), and the always-armed ball save runs through the 630 s rules-live soak with post kicks and zero escapes.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-23T00:52:43Z
- **Completed:** 2026-11-23T01:02:37Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `game.determinism.test.ts` mirrors main.ts exactly (GameSession `{ plunger }`, session as rule hooks, `onFlipperPress()` on a press edge). Its script hits every Phase-6 rule. Ball 1 takes the D-05 skill shot at charge 62 * rate * dt, and its tally is skipped 11 steps in. Ball 2 gets a kickback save, then is tilted into a forfeit. Ball 3 gets a kickback save, drains, and the game ends at step 2924 on a new in-memory best.
- The Outcome adds skill-shot count, save count and kind, drain count, best, isNewBest and a 120-step in-play trace (step, score, ball x, y). All of these are asserted equal across cadences, with sawSkip, sawForfeit and anchorCharge as non-vacuity flags.
- `presentation.determinism.test.ts` attaches the EffectsTracker (CueFeedback and observer fx), LampTracker, renderer frame (lamps, effects, reducedMotion), HudView (dt and best sinks) and BonusView in main.ts order. The bare 144 Hz run equals presented 144 Hz, presented 60 Hz and presented 144 Hz with reduced motion on every Outcome field.
- Presentation non-vacuity: skillShot, ballSave, bonusTick, nudge and highScore cues all fire, particles are live, a lamp exceeds 0.5, the static blit is shaken in some frame, and the HUD and bonus overlay are written. The reduced-motion run blits the static layer only at (0, 0) and gets the same cue tally. A mutation check (one `session.award(10)` inside the presented path) turns the gate red.
- `ReactiveSoakWorld` gains `saveArmed` (default true) and `postKicks`. The fast soak and the 630 s gate assert postKicks > 0, and the CCD-off RED control and its replay still pass with the save armed.

## Task Commits

1. **Task 1: Tracer. Full Phase-6 rules replay at 60/120/144 Hz** - `427a32b` (test)
2. **Task 2: Every Phase-6 presentation module proven read-only, reduced motion on and off** - `470b1c0` (test)
3. **Task 3: Armed ball save joins the rules-live soak; phase gate green** - `f6da160` (test)

## Files Created/Modified

- `src/sandbox/game.determinism.test.ts` - main.ts-parity composition, state-keyed Phase-6 script, extended Outcome and non-vacuity
- `src/sandbox/presentation.determinism.test.ts` - full Phase-6 presentation stack, reduced-motion run, module non-vacuity (LightState import dropped)
- `src/harness/reactive-world.ts` - `saveArmed` option, always-armed RuleHooks, `postKicks` getter, D-10 doc
- `src/harness/reactive-soak.test.ts` - postKicks tally and assertion in the bounded green
- `src/harness/reactive-table-soak.gate.test.ts` - summed postKicks > 0 beside the kicks assertion

## Decisions Made

- The script reacts to session state observed at the top of each fixed step (plan discretion). The full 3-ball game fits inside 3600 steps, so EXPECTED_STEPS did not grow.
- Both bats are tapped while ball 1 sits in the shooter lane. This keeps flipper coil and relay coverage (the old script pressed both flippers) without touching the anchor. It does change the later ball path (final score 31,000 instead of 28,500 without the taps), and every non-vacuity flag still holds.
- The always-armed save is the soak wrapper's default, as the plan specifies. `saveArmed: false` restores the Phase-4 wrapper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Flipper taps added to Task 1's script during Task 2**
- **Found during:** Task 2
- **Issue:** Task 2 copies Task 1's script and keeps the Phase-5 assertion `flipperUp/flipperDown >= 2`. Task 1's script never raised a bat during play (its only flipper press lands in the bonus state with the flippers off), so that existing assertion could not hold.
- **Fix:** Added KeyZ 20-40 and Slash 50-70 to the fixed timeline of both files, while ball 1 settles in the shooter lane. The two scripts stay identical.
- **Files modified:** src/sandbox/game.determinism.test.ts, src/sandbox/presentation.determinism.test.ts
- **Verification:** Both determinism suites green; anchor charge and skill shot still asserted
- **Committed in:** 470b1c0

**2. [Scope] Pre-existing prettier drift in the gate file left alone**
- **Found during:** Task 3
- **Issue:** `reactive-table-soak.gate.test.ts` already failed `prettier --check` at HEAD, and `--write` reflowed the whole `it(...)` block.
- **Fix:** Restored the file and applied only the postKicks lines and the doc change, so the diff stays minimal. The file is still prettier-dirty, as before.
- **Files modified:** src/harness/reactive-table-soak.gate.test.ts
- **Committed in:** f6da160

---

**Total deviations:** 1 auto-fixed (1 blocking) and 1 scope note.
**Impact on plan:** No scope creep. No assertion was moved or weakened.

## Issues Encountered

None.

## Requirement Status

`requirements.ready-ids` reports all eight PLSH requirements ready (no sibling plan is still open). PLSH-01..08 are marked complete with this plan.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- All 14 Phase-6 plans are done. The phase is ready for `/gsd-verify-work 06`.
- Perceptual UAT is still open for verify-work: shake subtlety, lamp look, post read, skill-shot band feel (D-02), count-up pacing, 60 fps at 144 Hz, and a real-browser reload for the high score.

## Self-Check: PASSED

- FOUND: src/sandbox/game.determinism.test.ts, src/sandbox/presentation.determinism.test.ts, src/harness/reactive-world.ts, src/harness/reactive-soak.test.ts, src/harness/reactive-table-soak.gate.test.ts
- FOUND commits on HEAD: 427a32b, 470b1c0, f6da160
- Acceptance greps: getSkillShotCount 1, onFlipperPress() 1, sawForfeit 5, sawSkip 5, LampTracker 3, EffectsTracker 3, BonusView 3, postKicks 3/3/3
- Plan verification: tsc, eslint src, vitest run, npm run soak, npm run build all exit 0; only src/physics/planck-world.ts imports planck

---
*Phase: 06-juice-polish*
*Completed: 2026-11-23*
