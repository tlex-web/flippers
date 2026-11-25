---
phase: 06-juice-polish
plan: 05
subsystem: game-rules
tags: [fsm, bonus, scoring, hud, determinism, vitest]

requires:
  - phase: 06-juice-polish
    provides: "06-01 RuleHooks.onSwitch (live registered switches only), 06-03 inlane flags cleared in serveBall(), 06-04 HudView (StatusCode, value) status resolver"
provides:
  - "src/game/bonus.ts: BonusCounters, BonusTally, BonusRowKind, bonusDurationSteps, rowRevealed, rowShownValue, revealedRowCount"
  - "GameState \"bonus\": a counted-step tally between every drain and the next serve or game over"
  - "GameSession.onFlipperPress() skip latch, private credit(), tilt forfeit"
  - "Presentation getters: getDrainCount, getNudgeCount, getLastNudgeDir, getBonusElapsed, getBonusTally, getBonusTotal, isBonusForfeit"
  - "HUD rows: TILT · NO BONUS (row 2) and BONUS <total> (row 3); BALL n / 3 during the tally"
  - "tuning.ts: BONUS_ROLLOVER_UNIT, BONUS_INLANE_UNIT, BONUS_BANK_UNIT, BONUS_ROW_STEPS, BONUS_TOTAL_HOLD_STEPS, BONUS_EMPTY_HOLD_STEPS, TILT_FORFEIT_HOLD_STEPS"
affects: [06-06 bonus overlay and skip latch, 06-06 observer drain cue via getDrainCount, 06-09 nudge counters, 06-14 determinism bonus coverage, ball save (06-07)]

actuals:
  tokens: 11242
  tasks: 2
  commits: 2
plan_head_before: 3b24569efa44e166ad87dd011488fa3fb491bf50
plan_head_after: a544970b5a83648e32c411b2739d14e73b56d449

tech-stack:
  added: []
  patterns:
    - "Rule-level timed state: the session holds the serve for counted fixed steps (bonusEndsAt = step + duration), ended in service() with a strict step >= bonusEndsAt test"
    - "Guarded credit path beside award(): same safe-integer and saturation guard, no isLive() gate"
    - "Pure closed-form tally schedule in bonus.ts, read by presentation through session getters"

key-files:
  created:
    - src/game/bonus.ts
    - src/game/bonus.test.ts
  modified:
    - src/game/tuning.ts
    - src/game/game-session.ts
    - src/game/game-session.test.ts
    - src/sandbox/game-e2e.test.ts
    - src/ui/hud.ts
    - src/ui/hud.test.ts

key-decisions:
  - "06-05: every drain enters the \"bonus\" state with the flippers off and activeBallId -1; the tally ends at step >= bonusEndsAt or on a latched flipper press (not for a forfeit), credits through private credit(), then serves or ends the game"
  - "06-05: GameSession.onSwitch gains the bank flag (default false) that ReactiveElements already passed; counters advance only while playing"
  - "06-05: isBonusForfeit() is true only in the bonus state; getBonusTotal() keeps the last tally total (the HUD reads it only in bonus)"
  - "06-05: an all-zero tally shows BONUS 0 on the status line for its 60-step hold (UI-SPEC row 3 applies to the whole bonus state)"
  - "06-05: a tilted drain calls setEnabled(false) again at bonus entry and game over calls it again after the last tally; the gate logs pin both"

patterns-established:
  - "finishBonus(rig) / finishTally(game): tests run the tally out explicitly instead of assuming an immediate serve"
  - "e2e makeGame has main.ts parity for the session ({ plunger } option, session as ReactiveElements' rule hooks)"

requirements-completed: [PLSH-06]

coverage:
  - id: D1
    description: "A drained ball's itemized bonus (ROLLOVERS, INLANES, BANKS) is tallied over counted steps and credited before the next serve, on the spy world and the real table"
    requirement: "PLSH-06"
    verification:
      - kind: unit
        ref: "src/game/game-session.test.ts#tracer: 2 rollovers and 1 inlane are tallied over 216 counted steps, credited, then ball 2 is served"
        status: pass
      - kind: e2e
        ref: "src/sandbox/game-e2e.test.ts#a launch that lights a rollover drains into a bonusDurationSteps tally and the score rises by its total before ball 2"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tally schedule edges: durations 60/168/216/264, forfeit 120, reveal at 48i, count-up rounding, NaN/negative guards, duration-1 vs duration boundary"
    requirement: "PLSH-06"
    verification:
      - kind: unit
        ref: "src/game/bonus.test.ts"
        status: pass
      - kind: unit
        ref: "src/game/game-session.test.ts#at elapsed duration - 1 the state is still bonus and the score unchanged; at duration the credit lands and ball 2 is served in the same service()"
        status: pass
    human_judgment: false
  - id: D3
    description: "Skip, forfeit, all-zero hold, last-ball game over, saturating credit, per-ball reset, drain and nudge counters"
    requirement: "PLSH-06"
    verification:
      - kind: unit
        ref: "src/game/game-session.test.ts#GameSession bonus edges (plan 06-05 Task 2, PLSH-06, D-11..D-13)"
        status: pass
    human_judgment: false
  - id: D4
    description: "HUD reads the bonus state: BALL n / 3, BONUS <total> written once, TILT · NO BONUS, TILT still wins, BONUS outranks SKILL SHOT"
    requirement: "PLSH-06"
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts#HudView bonus rows (plan 06-05 Task 2, 06-UI-SPEC rows 2 and 3, PLSH-06)"
        status: pass
      - kind: e2e
        ref: "src/sandbox/game-e2e.test.ts#shows the start prompt, the ball number, WARNING, TILT, TILT · NO BONUS, BONUS, the next ball and GAME OVER"
        status: pass
    human_judgment: false
  - id: D5
    description: "Determinism unchanged: game.determinism and presentation.determinism pass with the new bonus state"
    verification:
      - kind: integration
        ref: "npx vitest run src/sandbox/game.determinism.test.ts src/sandbox/presentation.determinism.test.ts"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 05: End-of-Ball Bonus Rules Summary

**A rule-level "bonus" GameState that holds every serve for a counted 60 to 264-step itemized tally (ROLLOVERS 1,000, INLANES 2,000, BANKS 5,000), credits it through a guarded credit(), skips on a latched flipper press, forfeits on a tilt with a fixed 120-step TILT · NO BONUS hold, and drives the HUD's BONUS row.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-22T21:23:12Z
- **Completed:** 2026-11-22T21:34:10Z
- **Tasks:** 2
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- `bonus.ts` (pure): per-ball counters fed from `RuleHooks.onSwitch`, a preallocated 3-row tally snapshot in ROLLOVERS, INLANES, BANKS order (n >= 1 rows only), and the closed-form schedule (`bonusDurationSteps`, `rowRevealed`, `rowShownValue`, `revealedRowCount`).
- `GameSession`: a drain removes the ball, snapshots the tally (or marks a forfeit when tilted), sets `bonusEndsAt = step + duration`, disarms the skill shot, turns the flippers off and enters `"bonus"`. The tally ends at `step >= bonusEndsAt` or on a latched `onFlipperPress()` (a forfeit ignores it), credits through `credit()`, then serves or ends the game. `award()` stays a no-op outside playing.
- Presentation counters that change no behavior: `getDrainCount()` for the 06-06 observer fix, `getNudgeCount()` / `getLastNudgeDir()` for 06-09, and the tally getters for the 06-06 overlay.
- HUD: `ballText` covers `"bonus"`, and the status resolver adds `tiltNoBonus` (row 2) and `bonus` (row 3) between TILT and SKILL SHOT. The total is fixed for the whole tally, so BONUS is written and announced once.
- Every legacy FSM, relay and e2e case now goes through the tally on purpose (`finishBonus`, `finishTally`), with the gate logs re-pinned. The e2e `makeGame` now builds the session the way main.ts does.

## Task Commits

1. **Task 1 (tracer): A drained ball's bonus is tallied over counted steps and credited before the next serve, on the real table** - `13baabc` (feat)
2. **Task 2 (tdd): skip, forfeit, all-zero hold, per-ball reset and the tally schedule edges are pinned** - `a544970` (test)

**Plan metadata:** recorded in the docs commit that follows this SUMMARY.

## Files Created/Modified

- `src/game/bonus.ts` - counters, tally and pure tally schedule
- `src/game/bonus.test.ts` - schedule edges, guards, itemized snapshot
- `src/game/tuning.ts` - the seven Bonus (PLSH-06) constants
- `src/game/game-session.ts` - the `"bonus"` state, skip latch, `credit()`, forfeit, getters, header docs
- `src/game/game-session.test.ts` - `finishBonus` / `drainAndFinish`, adapted legacy cases, tracer case and the Task 2 edge cases
- `src/sandbox/game-e2e.test.ts` - main.ts parity, `finishTally`, adapted full-game, HUD walk-through, tilt relay and stale-Shift cases, real-table bonus case
- `src/ui/hud.ts` - `ballText("bonus")`, `StatusCode` `tiltNoBonus` / `bonus`, resolver rows 2 and 3, `HudSource` additions
- `src/ui/hud.test.ts` - FakeSource bonus fields, bonus row cases

## Decisions Made

- `onSwitch(kind, id, bank = false)` now reads the bank flag that `ReactiveElements` already passed. 06-04 had deferred it until the counters needed it. The counters advance only while playing; `ReactiveElements` already calls the hook only on live hits, so this is a second guard.
- `isBonusForfeit()` is scoped to the bonus state, and `getBonusTotal()` keeps the last tally's total. The HUD reads both only when the state is `"bonus"`.
- An all-zero tally reads `BONUS 0` for its 60-step hold. UI-SPEC row 3 covers the whole bonus state, and the plan's walk-through expects `BONUS <total>`.
- The gate log now records a second `false` in two places: at the bonus entry of a tilted drain, and at game over after the last tally. Both cases are pinned, and the relay invariant "on exactly while playing" still holds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] hud.test.ts FakeSource updated in Task 1**
- **Found during:** Task 1
- **Issue:** Adding `getBonusTotal` / `isBonusForfeit` to `HudSource` broke `tsc --noEmit` because the existing FakeSource no longer implemented the interface. The plan lists `hud.test.ts` only under Task 2.
- **Fix:** Added the two fields and getters to FakeSource in the Task 1 commit. The bonus-row cases themselves landed in Task 2.
- **Files modified:** src/ui/hud.test.ts
- **Commit:** 13baabc

**2. [Plan wording] The interfaces block lists `serveBall()` and `onSwitch(kind, id, bank)` as existing**
- Before this plan `onSwitch` took `(kind, elementId)`. The bank flag was added here with a default, which matches the 06-04 note.

---

**Total deviations:** 1 auto-fixed (blocking compile fix) plus 1 interface-wording note.
**Impact on plan:** None on scope.

## TDD Gate Compliance

Task 2 is `tdd="true"`. `workflow.tdd_mode` is off, so this section is advisory.

- **RED:** All 36 new cases were written first and run against the Task 1 implementation. 33 passed straight away; the plan expected this ("Task 1 should already satisfy most"). The other 3 failed, and every failure came from the tests themselves: the first rollover switch on 400 also scores the armed skill shot (+5,000), and those cases assumed a score of 0. They were fixed to measure from a baseline. **Semantic assessment:** there was no behavioral RED, because the feature already existed from the tracer. No `gsd_run check tdd-red-evidence` record was produced, since it would only show unexpected green.
- **Teeth (instead of RED):** five production mutants, each applied and reverted with `git checkout -- <file>`, were each caught by the new cases:
  - `>=` to `>` on the tally end: 5 failures
  - a forfeit made skippable: 1
  - the drain count doubled: 1
  - a bank counted on every rollover: 3
  - the counter reset removed: 1
- **GREEN:** the `feat(06-05)` commit `13baabc` comes before the `test(06-05)` commit `a544970`. A gate review will report this as green-before-red. It is expected for a tracer-then-pin plan. No implementation change was needed after the tests.

## Issues Encountered

- A working-copy-only CRLF conversion after the mutation reverts (autocrlf) makes `prettier --check` warn on `bonus.ts` / `game-session.ts`. Only line endings differ. The committed blobs are LF and match prettier's output. Other `prettier --check` failures already existed before this plan (`src/game/game-session.test.ts` line 97 `type Call`, and `src/sandbox/game-e2e.test.ts` `applyEdges` and the `for (...; )` spacing). They are out of scope and were left untouched.

## Known Stubs

None. The flipper-press skip is fully implemented in the session. The live key latch in `main.ts` lands in 06-06 as planned, so until then a live tally always runs its counted length (a flagged assumption in the plan).

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- 06-06 can build the bonus overlay from `getBonusTally()` / `getBonusElapsed()` and the bonus.ts schedule functions, wire the flipper-press latch to `onFlipperPress()`, and switch the observer's drain cue to `getDrainCount()`. Until then the drain sound plays at the serve, after the tally (research Pitfall 2, accepted for one wave).
- 06-07 (ball save) must route its backstop re-serve around the bonus entry in `service()` and must not call `serveBall()`.
- Verification: `npx tsc --noEmit`, `npx eslint src`, `npm run build` and `npm test` all exit 0 (56 files, 1036 tests). game.determinism and presentation.determinism pass unchanged.

## Self-Check: PASSED

- FOUND: src/game/bonus.ts, src/game/bonus.test.ts, src/game/game-session.ts, src/ui/hud.ts, src/game/tuning.ts
- FOUND: 13baabc, a544970 (both ancestors of HEAD; `check evaluation-scope --plan 06-05 --commits-only` resolves both)

---
*Phase: 06-juice-polish*
*Completed: 2026-11-22*
