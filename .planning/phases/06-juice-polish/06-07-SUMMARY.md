---
phase: 06-juice-polish
plan: 07
subsystem: game-rules
tags: [ball-save, backstop, kickback-entry, game-session, vitest, planck]

requires:
  - phase: 06-juice-polish
    provides: "06-05 bonus state on every drain, private credit(), getDrainCount(); 06-03 per-ball inlane flags (isInlaneScored) that a backstop must keep"
provides:
  - "src/game/ball-save.ts: BallSave (arm, disarm, update, canSave, consume, lampPhase, isStarted, getRemaining, getLastKind), SaveKind, SaveLampPhase"
  - "src/game/tuning.ts: BALL_SAVE_STEPS = 840, BALL_SAVE_BLINK_STEPS = 240"
  - "src/table/spec.ts: export const CHUTE_X (value unchanged, 2.9)"
  - "src/game/game-session.ts: GameSessionOptions.ballSaveSteps, trySave(ballId), getSaveCount, getLastSaveKind, getLastSaveStep, getSaveLampPhase, private backstop() and reServe()"
affects: [06-08 center-post kickback (calls trySave through RuleHooks), 06-10 save lamp / BALL SAVED status / sting (reads getSaveLampPhase, getSaveCount, getLastSaveKind), 06-14 determinism coverage]

actuals:
  tokens: 15900
  tasks: 2
  commits: 2
plan_head_before: 5e9a99cdea98fd2a9dd43539963e89d1664b2b80
plan_head_after: ea488f3a3053d5985b2e73d76c0aa03c5979b48a

tech-stack:
  added: []
  patterns:
    - "Pure step-driven rule module composed by GameSession (same shape as TiltMeter and SkillShot)"
    - "Same-ball re-serve path (reServe) kept separate from serveBall so per-ball state survives a save"
    - "Spy-world tests disable position-driven rules explicitly (NO_SAVE) instead of the production default changing"

key-files:
  created:
    - src/game/ball-save.ts
    - src/game/ball-save.test.ts
  modified:
    - src/game/tuning.ts
    - src/table/spec.ts
    - src/game/game-session.ts
    - src/game/game-session.test.ts
    - src/sandbox/game-e2e.test.ts

key-decisions:
  - "The timer start does not count down: the save is usable on exactly BALL_SAVE_STEPS updates once the ball clears the chute"
  - "A backstop save still increments getDrainCount() (the plan says so), so the 06-06 drain cue sounds on a saved drain too. 06-10 may want to suppress it or layer the BALL SAVED sting on top"
  - "A backstop does not enter the bonus state and does not touch the flipper gate. Bonus counters, inlane flags, tilt meter and skill shot carry over, and the save is not re-armed (research A3)"
  - "saveCount and lastSaveKind are counters since construction, like drainCount, so presentation can detect edges"
  - "trySave is a public GameSession method. Adding it to the RuleHooks interface is left to 06-08, which owns reactive-elements.ts"

patterns-established:
  - "Same-ball re-serve: reServe() only adds a ball at the spawn and sets it active. serveBall() stays the only path that resets per-ball state and arms per-ball rules"

requirements-completed: [PLSH-07]

coverage:
  - id: D1
    description: "A drain inside the save window costs no ball on the spy world and on the real table: ball removed and re-served to the plunger as the same ball number, still playing, one backstop save; the next drain enters the bonus state"
    requirement: "PLSH-07"
    verification:
      - kind: unit
        ref: "src/game/game-session.test.ts#GameSession ball save (plan 06-07 Task 1, PLSH-07, D-08, D-09) > tracer"
        status: pass
      - kind: e2e
        ref: "src/sandbox/game-e2e.test.ts#ball save (PLSH-07) > a full plunge drains inside BALL_SAVE_STEPS of the chute exit..."
        status: pass
    human_judgment: false
  - id: D2
    description: "Timer starts on the strict chute exit (x + BALL_RADIUS_M < CHUTE_X), runs 840 steps, lamp steady/blink(<=240)/off; one consume per arm; BallSave(0) disabled"
    requirement: "PLSH-07"
    verification:
      - kind: unit
        ref: "src/game/ball-save.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "One save per ball; re-armed on every serve but not on the backstop re-serve; tilt, bonus and game over disarm; trySave guards; double drain batch, stale id, same-step kickback-drain counts once"
    requirement: "PLSH-07"
    verification:
      - kind: unit
        ref: "src/game/game-session.test.ts#GameSession ball save rules (plan 06-07 Task 2, PLSH-07, D-08, D-09, research A3, A4)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Legacy FSM, determinism and skill-shot suites still pass: spy cases pass ballSaveSteps 0 explicitly, and determinism/skill-shot run with the production default unchanged"
    verification:
      - kind: integration
        ref: "npx vitest run (1091 passed); npx vitest run src/sandbox/game.determinism.test.ts src/sandbox/presentation.determinism.test.ts src/sandbox/skill-shot-e2e.test.ts"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 07: Ball Save Rule Summary

**A drain within 7 s (840 steps) of the ball leaving the chute now costs no ball. The ball is re-served to the plunger with the same ball number and per-ball state, once per ball. The rule lives in a pure `BallSave`, and `trySave()` is ready for the 06-08 center-post kickback.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-11-22T21:57:03Z
- **Completed:** 2026-11-22T22:07:00Z
- **Tasks:** 2
- **Files modified:** 7 (2 created)

## Accomplishments

- `BallSave` is a pure rule driven one fixed step at a time. The timer starts on the first `update(x)` where `x + BALL_RADIUS_M < CHUTE_X` (strict), so a held plunger or a weak plunge that falls back never starts it. The window then runs `BALL_SAVE_STEPS` (840). The lamp is steady, blinks for the last 240 steps, and is off once the save is spent, timed out or disarmed.
- `GameSession` arms the save on every serve. `tick()` passes it the active ball's x through the same allocation-free loop as the skill rest test. A tilt, the bonus entry and game over disarm it.
- Backstop (D-08): a drain while playing with the save running removes the ball and calls `reServe()`. The ball number stays the same, the state stays playing and the flipper gate is untouched. Bonus counters, inlane flags, the tilt meter and the skill shot carry over, and the save is not re-armed, so it is one save per ball (research A3).
- `trySave(ballId)` spends the save as a kickback, but only while playing, for the active ball, with the timer running. If the same ball drains on that same step, it is re-served and the save counts once, as the kickback (research A4).
- On the real table, a full plunge leaves the chute at step 84 after release and drains at step 373. That is 289 steps after the exit, well inside the 840-step window. The e2e case asserts this so a geometry or tuning change fails loudly.

## Task Commits

1. **Task 1 (tracer): On the real table, a launched ball that drains inside the save window is re-served without costing the ball** - `ecc4fdb` (feat). Tracer gate: auto mode off and `human_verify_mode` end-of-phase, and `<verify>` is automated only. It was re-run in full (tsc, eslint, 1064 tests) and passed, so expansion went ahead with no checkpoint.
2. **Task 2 (tdd): One save per ball, the arming rules, trySave and the same-step kickback-drain case are pinned** - `ea488f3` (test). There is no GREEN commit because no implementation change was needed. See TDD Gate Compliance.

## Files Created/Modified

- `src/game/ball-save.ts` - BallSave rule, SaveKind, SaveLampPhase
- `src/game/ball-save.test.ts` - unit cases for the start, window, lamp and one-per-arm rules
- `src/game/tuning.ts` - "Ball save (PLSH-07)" section: BALL_SAVE_STEPS, BALL_SAVE_BLINK_STEPS
- `src/table/spec.ts` - `CHUTE_X` exported, with a doc line naming the chute-exit test
- `src/game/game-session.ts` - ballSaveSteps option, backstop, reServe, trySave, save getters, header doc
- `src/game/game-session.test.ts` - `makeRig(options, extraBallIds)` with `setBallX`; 46 legacy calls now pass `NO_SAVE`; the tracer case plus 14 rule cases
- `src/sandbox/game-e2e.test.ts` - `makeGame(options)` merged over `{ plunger }`; `NO_SAVE` on the full-game, HUD walk-through, tilt relay and G-04-11 cases; the real-table backstop case

## Decisions Made

- The timer-start update does not count down, so the window is exactly 840 usable steps. A unit case pins this.
- A backstop still increments `getDrainCount()`, as the plan's action says. Since 06-06 keys the drain cue on that counter, **a saved drain plays the drain growl**. 06-10 adds the BALL SAVED sting and should decide whether to keep or suppress the growl on a save. It can tell a save apart through `getSaveCount()`, which rises on the same step.
- A backstop never enters `"bonus"`, so the bonus overlay and tally do not show on a save.
- The 06-03 cross-plan constraint is met: the re-serve never goes through `serveBall()`. A mutation that routes it through `serveBall()` fails 5 cases.
- `trySave` was not added to the `RuleHooks` interface, because `reactive-elements.ts` is not in this plan's files. 06-08 wires it.
- The live game (`main.ts`) gets the save with no code change, since the production default applies through `{ plunger }`. Nothing shows it on screen until 06-10.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test gap] The strict chute comparison was not actually pinned by the planned 2.70 case**
- **Found during:** Task 2 (mutation check)
- **Issue:** In binary floating point, `2.70 + 0.2` is `2.9000000000000004`, so `update(2.70)` stays unstarted under both `<` and `<=`. The `<` to `<=` mutant survived.
- **Fix:** Kept the planned 2.70 case and added one at `x = CHUTE_X - BALL_RADIUS_M` (2.6999999999999997), which sums back to exactly 2.9. That case kills the mutant.
- **Files modified:** src/game/ball-save.test.ts
- **Committed in:** ea488f3

---

**Total deviations:** 1 auto-fixed (1 test gap)
**Impact on plan:** The test now proves the strictness that T-6-14 requires. No scope change.

## TDD Gate Compliance

- **RED (Task 2):** the cases are in `ea488f3`. The evidence in `.gsd/tdd-evidence/06-07/red-task2-save-rules.json` (junit, 78 cases, exit 0) was classified `INVALID_RED / unexpected_green`.
- **Semantic assessment:** this is not a wrong test. The feature already existed because the plan put it there: Task 1's action (the tracer) specified `trySave`, the tilt, bonus and game-over disarms, the same-step `savedAtStep` path and the backstop itself. Task 2's action ("fix ... until they pass") therefore had nothing left to fix.
- **Evidence that the cases discriminate:** each mutation was applied to the implementation alone and the two target files were run (scratchpad `0607-mutate.cjs`). 8 of 10 mutants were killed:
  - chute test not strict (1 failure)
  - blink threshold off by one (2)
  - start update also counts down (3)
  - consume does not disarm (8)
  - no same-step kickback path (1)
  - backstop through `serveBall()` (5)
  - trySave ignores the ball id (1)
  - same-step kickback counted twice (1)

  The 2 survivors are equivalent mutants, with no difference the session API can observe. Removing the tilt disarm changes nothing because the backstop is gated on `state === "playing"` and the bonus entry disarms anyway. Removing the lamp's state gate changes nothing because every non-playing state is already disarmed.
- **GREEN:** none. No implementation code changed in Task 2, so there is no `feat(06-07)` commit after the `test(06-07)` commit. The Task 1 `feat` commit comes before it. This is a gate-sequence violation in form only, recorded here for the end-of-phase TDD review.

## Issues Encountered

- `prettier --check` still warns on `src/game/game-session.test.ts` (the `type Call` line) and on `src/sandbox/game-e2e.test.ts` (the `applyEdges(...)` call and the `for (...; )` spacing). All three hunks were there before this plan, which added no prettier diffs. The other known warnings (`src/audio/recipes.ts`, index.html, `src/sandbox/main.ts`) were left alone.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 06-08 can call `session.trySave(ballId)` from the post kicker. If the kicker misses and the ball drains on the same step, the ball is still re-served, so an armed save never feels broken.
- 06-10 can read `getSaveLampPhase()` for the ring lamp, and `getSaveCount()` / `getLastSaveKind()` / `getLastSaveStep()` for BALL SAVED and the sting. It also needs to decide on the drain growl for a saved drain (see Decisions).
- PLSH-07 is shared with 06-08, 06-10 and 06-14, so it is not marked complete until the last of those plans finishes.

## Self-Check: PASSED

- FOUND: src/game/ball-save.ts, src/game/ball-save.test.ts
- FOUND: ecc4fdb, ea488f3 (ancestors of HEAD)
- `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (1091 passed), `npm run build` and `npm test` all exit 0
- Task 1 acceptance greps all >= 1. The determinism and skill-shot suites pass unchanged. `grep -c canSave src/game/ball-save.test.ts` = 13

---
*Phase: 06-juice-polish*
*Completed: 2026-11-22*
