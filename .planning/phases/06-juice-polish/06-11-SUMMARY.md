---
phase: 06-juice-polish
plan: 11
subsystem: game, ui, audio-cues, storage
tags: [localStorage, high-score, hud, status-line, cues, tdd]

requires:
  - phase: 06-05
    provides: "GameSession tally-end -> game-over branch, onStart, getStep"
  - phase: 06-04
    provides: "highScore cue kind and recipe"
  - phase: 06-10
    provides: "HUD status priority resolver (rows 1-8) and observer push order ending ..., drain, ballSave, bonusTick, gameOver"
provides:
  - "src/game/high-score.ts: StorageLike, HISCORE_KEY (flippers.hiscore.v1), parseBest, HighScore (getBest, submit), HighScoreSink"
  - "GameSession highScore option, one submit at game over, isNewBest / getNewBestCount / getGameOverStep / getBest"
  - "safeLocalStorage() and a single boot-time HighScore injected in main.ts"
  - "#hud-best line (HIGH SCORE n in game over) with a data-new pulse; NEW HIGH SCORE status row 4 for 360 steps"
  - "highScore fanfare cue per new-best increment, pushed after gameOver"
affects: [06-14 determinism observable, verify-work UAT, gsd-secure-phase T-6-22..24]

actuals:
  tokens: 7503
  tasks: 2
  commits: 3
plan_head_before: b6c313d56fae88a1d71ff891e46ba5093a0813b6
plan_head_after: 8aebc8e33f28189a09b120df85e2782be708e5a7

tech-stack:
  added: []
  patterns:
    - "Browser I/O behind an injected structural interface (StorageLike) so the module stays node-testable; the one DOM-global access (window.localStorage getter) is guarded in main.ts"
    - "Every storage call in its own silent try/catch; the in-memory value updates before the write so a failing write never loses the best"
    - "Session-level event counters (getNewBestCount) drive both the HUD and the observer cue, matching the save/drain/skill counters"

key-files:
  created:
    - src/game/high-score.ts
    - src/game/high-score.test.ts
  modified:
    - src/game/game-session.ts
    - src/ui/hud.ts
    - src/ui/hud.test.ts
    - src/sandbox/main.ts
    - src/sandbox/presentation-observer.ts
    - src/sandbox/presentation-observer.test.ts
    - src/sandbox/game-e2e.test.ts
    - index.html

key-decisions:
  - "The best is stored only as a decimal integer string under flippers.hiscore.v1, read once at boot, written only on a strictly greater final score at game over (D-15, D-16)"
  - "GameSession submits once when ball 3's tally ends, after the credit and before entering game-over; onStart() clears the new-best flag (research Open Question 3)"
  - "NEW HIGH SCORE is status row 4 (after BONUS, before SKILL SHOT / BALL SAVED) for 360 steps from getGameOverStep(), then GAME OVER · PRESS ENTER"
  - "The highScore cue is pushed after gameOver on the same step, once per getNewBestCount() increment, on no element at strength 1"
  - "The data-new pulse stays under reduced motion (it is a flash, not motion)"

patterns-established:
  - "safeLocalStorage(): StorageLike | null in main.ts is the only place window.localStorage is touched"

requirements-completed: [PLSH-08]

coverage:
  - id: D1
    description: "Best score persists across sessions under flippers.hiscore.v1 through a guarded StorageLike; submitted once at game over; a fresh HighScore reads it back"
    requirement: PLSH-08
    verification:
      - kind: unit
        ref: "src/game/high-score.test.ts#HighScore tracer (plan 06-11 Task 1, PLSH-08)"
        status: pass
      - kind: unit
        ref: "src/game/high-score.test.ts#HighScore submit writes (plan 06-11 Task 2, D-16, T-6-24)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Hostile, corrupt, throwing and absent storage degrade silently to an in-memory best (parseBest table, SecurityError read, QuotaExceededError write, no console output)"
    requirement: PLSH-08
    verification:
      - kind: unit
        ref: "src/game/high-score.test.ts#parseBest hostile values (plan 06-11 Task 2, D-16, T-6-22)"
        status: pass
      - kind: unit
        ref: "src/game/high-score.test.ts#HighScore throwing and absent storage (plan 06-11 Task 2, D-16, T-6-23)"
        status: pass
    human_judgment: false
  - id: D3
    description: "HUD #hud-best shows HIGH SCORE n in game over (empty in play and for a best of 0), data-new on a new best, NEW HIGH SCORE for 360 steps then the game-over prompt"
    requirement: PLSH-08
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts#HudView best line and NEW HIGH SCORE (plan 06-11 Task 2, 06-UI-SPEC row 4, PLSH-08)"
        status: pass
      - kind: e2e
        ref: "src/sandbox/game-e2e.test.ts#HUD walk-through (NEW HIGH SCORE then GAME OVER · PRESS ENTER)"
        status: pass
    human_judgment: false
  - id: D4
    description: "highScore fanfare cue once per new best, after gameOver"
    requirement: PLSH-08
    verification:
      - kind: unit
        ref: "src/sandbox/presentation-observer.test.ts#PresentationObserver: high score fanfare (06-11, D-15, D-25)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real-browser persistence across a reload, the pulse look and the sting sound"
    requirement: PLSH-08
    verification:
      - kind: manual_procedural
        ref: "Task 1 tracer human-check: finish a game, reload, inspect Local Storage"
        status: pass
    human_judgment: true
    rationale: "Reload persistence and the perceptual pulse/sting need a real browser; approved by the user at the Task 1 tracer gate"

duration: 13min
completed: 2026-11-23
status: complete
---

# Phase 6 Plan 11: Local High Score Summary

**One guarded `flippers.hiscore.v1` best score: read once at boot through an injected StorageLike and written only when a game-over score beats it. It shows as HIGH SCORE on attract and game over, with a NEW HIGH SCORE row, a CSS pulse and the highScore fanfare.**

## Performance

- **Duration:** 13 min (wall clock, including the Task 1 human-verify gate)
- **Started:** 2026-11-22T23:51:37Z
- **Completed:** 2026-11-23T00:04:03Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- `HighScore` over an injected `StorageLike`. `parseBest` accepts only non-negative safe integers. `getItem` and `setItem` each sit in their own silent try/catch, and the in-memory best is updated before the write.
- `GameSession` submits the final score exactly once as ball 3's tally ends. It exposes `isNewBest`, `getNewBestCount`, `getGameOverStep` and `getBest`.
- `main.ts` adds `safeLocalStorage()`, which guards the `window.localStorage` getter, and creates one `HighScore` at boot.
- The HUD `#hud-best` line shows `HIGH SCORE 48,250` in game over. It uses tabular-nums and nowrap, and a new best sets `data-new` (3 pulses at 1.5 Hz over 2 s, then a steady glow). Status row 4 shows `NEW HIGH SCORE` for 360 steps.
- The presentation observer pushes `highScore` once per new-best increment, right after `gameOver`.

## Task Commits

1. **Task 1 (tracer): the final score is saved, read back by a fresh session, and shown as HIGH SCORE and NEW HIGH SCORE.** Commit `640064b` (feat). Tracer gate (human-verify, gate=blocking) was approved by the user.
2. **Task 2: hostile values, throwing storage, the HUD best line and the fanfare.** RED `2440cf5` (test), then GREEN `8aebc8e` (feat).

No REFACTOR commit was needed.

## TDD Gate Compliance (Task 2)

- **RED (`2440cf5`):** the target test `PresentationObserver: high score fanfare (06-11, D-15, D-25) > a new-best increment on the game-over step pushes highScore after gameOver on no element at strength 1` failed on its planned assertion: expected `[gameOver, highScore]`, received `[gameOver]`. JUnit report: 50 tests, 1 failure. Classifier: `RED_EVIDENCE_OK (target_test_failed)`. Record: `.gsd/tdd-evidence/06-11/red-highscore-push.json` (git-ignored).
- **Semantic assessment:** the target ran and failed only on the missing fanfare push. There was no load, syntax or fixture fault. The other new high-score and HUD cases passed at RED because Task 1's tracer already implemented that behavior, so they are characterization pins rather than drivers. high-score.ts needed no change.
- **GREEN (`8aebc8e`):** `ObserverSession` adds `getNewBestCount`. The observer snapshots the count and pushes `highScore` per increment after the `gameOver` push. 208/208 targeted tests pass, as does the full suite (1228).

## Files Created/Modified
- `src/game/high-score.ts`: StorageLike, HISCORE_KEY, parseBest, HighScore, HighScoreSink.
- `src/game/high-score.test.ts`: tracer session cases, the hostile parse table, throwing read and quota write, and the write shape and count.
- `src/game/game-session.ts`: the highScore option, the single submit at game over, and the new-best getters.
- `src/ui/hud.ts`: the `newHighScore` StatusCode, `NEW_BEST_STATUS_STEPS = 360`, `bestText`, and the best and bestAttr sinks.
- `src/ui/hud.test.ts`: FakeSource getters, plus best-line, data-new, row-4 window and formatting cases.
- `src/sandbox/main.ts`: `safeLocalStorage()`, the HighScore injection, and the `#hud-best` sinks.
- `src/sandbox/presentation-observer.ts`: the `highScore` push and the updated order doc.
- `src/sandbox/presentation-observer.test.ts`: the fanfare cases.
- `src/sandbox/game-e2e.test.ts`: the HUD walk-through now expects NEW HIGH SCORE.
- `index.html`: the `#hud-best` markup and the `.hud-best[data-new="true"]` pulse keyframes.

## Decisions Made
See `key-decisions` in the frontmatter. All of them follow the locked decisions D-15/D-16 and the UI-SPEC. No new architectural choices were made.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The e2e HUD walk-through expected the old game-over status sequence**
- **Found during:** Task 1
- **Issue:** In `src/sandbox/game-e2e.test.ts`, the first scoring game now beats the empty in-memory best. Its HUD walk-through therefore shows `NEW HIGH SCORE` before the game-over prompt, which made the previous expectations wrong.
- **Fix:** The test now expects `NEW HIGH SCORE`, then `GAME OVER · PRESS ENTER` after `NEW_BEST_STATUS_STEPS`. The status write count went from 10 to 11.
- **Files modified:** src/sandbox/game-e2e.test.ts. Also, `src/ui/hud.test.ts` FakeSource gained the three new HudSource getters so tsc passes.
- **Verification:** full Vitest suite passes.
- **Committed in:** 640064b

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** test expectations only; no scope change.

## Issues Encountered
- The RED evidence classifier needs the target name qualified with its suite (`suite > test`). The first record failed as `no_target_test_failure` until the name was qualified.
- Some prettier failures were already present before this plan: src/audio/recipes.ts, index.html, the src/sandbox/main.ts tr.resize line, src/sandbox/debug-draw.ts and src/sandbox/game-e2e.test.ts. They are out of scope and untouched. Every file this task changed is prettier-clean.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- PLSH-08 is delivered. 06-14 also declares PLSH-08 and will add the high-score observable to the determinism test. The session's default in-memory store keeps that test storage-free.
- Ready for 06-12.

## Self-Check: PASSED
- FOUND src/game/high-score.ts and src/game/high-score.test.ts
- FOUND commits 640064b, 2440cf5, 8aebc8e on HEAD
- Acceptance greps: `"highScore"` in presentation-observer.ts = 2, `QuotaExceededError` in high-score.test.ts = 3, plus all of Task 1's greps (>= thresholds)
- `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (59 files, 1228 tests) and `npm run build` all exit 0
- No DOM global is referenced in src/game/high-score.ts (only a doc comment mentions window.localStorage)

---
*Phase: 06-juice-polish*
*Completed: 2026-11-23*
