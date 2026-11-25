---
phase: 04-reactive-elements-game-rules
plan: 08
subsystem: game-rules
tags: [flipper-relay, tilt, attract, determinism, replay, review-triage, vitest]

# Dependency graph
requires:
  - phase: 04-reactive-elements-game-rules
    provides: "GameSession 3-ball FSM (04-05), TiltMeter and the tilted state (04-06), HUD wiring (04-07), IN-01/02/03/05 fixes (04-01, 04-02, 04-04)"
  - phase: 02-flippers
    provides: "FlipperController FSM (resting / flipping-up / held-up / returning) and FlipperInput"
provides:
  - "FlipperController.setEnabled(enabled) / isEnabled(): disabling drops up bats to returning (motor -1) and ignores presses; enabling issues no motor command"
  - "FlipperInput.isHeld(side)"
  - "GameSession FlipperGate (4th constructor arg): off at boot, on tilt and at game over; on with every serve"
  - "main.ts flipper-gate adapter: controller.setEnabled plus a re-press for any held side on enable (Pitfall 5)"
  - "src/sandbox/game.determinism.test.ts: cadence-independent replay of a scripted full-game timeline"
  - "03-REVIEW-DISPOSITION.md: IN-01/02/03/05 fixed, IN-04 deferred, WR-01 residual accepted, open: 0"
affects: [05-renderer, phase-04-verify-work, game-rules]

# Actuals (#2632)
actuals:
  tokens: 8421
  tasks: 3
  commits: 3
plan_head_before: e7caceeab95a163290acfe958879109f936be4c4
plan_head_after: aa19982a5d510a1f7a18268a4270787f837f2db8

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flipper relay as a gate interface owned by the session, adapted in the composition root (session never imports the controller)"
    - "Replay determinism over the whole rules stack: scripted key timeline keyed by fixed-step index, injected by a wrapper before onFixedStep"

key-files:
  created:
    - src/sandbox/game.determinism.test.ts
  modified:
    - src/control/flipper-controller.ts
    - src/control/flipper-controller.test.ts
    - src/input/flipper-input.ts
    - src/input/flipper-input.test.ts
    - src/game/game-session.ts
    - src/game/game-session.test.ts
    - src/sandbox/main.ts
    - src/sandbox/game-e2e.test.ts
    - .planning/phases/03-table-plunger-event-bus/03-REVIEW-DISPOSITION.md

key-decisions:
  - "TILT and attract drop the bats through the FSM's existing release transition (returning, motor -1), shared by onReleaseEdge and setEnabled(false) via one private drop(); never a body-type or joint change"
  - "Flippers are dead outside a game (Open Question 1 adopted): the session disables them in its constructor and on the final drain"
  - "Every serve re-enables the flippers, and the main.ts adapter re-presses any side input.isHeld() reports, so a key held through a drain raises its bat on the next ball (Pitfall 5)"
  - "WR-01 residual priming step accepted, not reworked: serves run at fixed-step boundaries and game.determinism.test.ts proves cadence-identical games"

patterns-established:
  - "Gate interfaces for cross-module switches: the rules layer exports a one-method interface (FlipperGate) and main.ts adapts the concrete controller, keeping game/ free of control/ imports"

requirements-completed: [GAME-03, GAME-02]

coverage:
  - id: D1
    description: "TILT drops a held-up bat (returning on the tilt step, then resting) and locks both bats until the next ball; presses while tilted never raise a bat and nothing scores until the drain"
    requirement: GAME-03
    verification:
      - kind: e2e
        ref: "src/sandbox/game-e2e.test.ts#a tilt drops a held-up bat and locks it; the key held through the drain raises it on ball 2; game over leaves both bats dead"
        status: pass
      - kind: unit
        ref: "src/control/flipper-controller.test.ts#FlipperController enable gate (GAME-03, R11, Pitfall 5) (8 cases)"
        status: pass
      - kind: unit
        ref: "src/game/game-session.test.ts#GameSession flipper relay (GAME-03, R11, Open Question 1) (8 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Flippers are dead outside a game: before Enter and after the final drain, KeyZ and Slash leave both bats resting"
    requirement: GAME-02
    verification:
      - kind: e2e
        ref: "src/sandbox/game-e2e.test.ts#before Enter (attract), KeyZ keeps the left bat resting"
        status: pass
      - kind: e2e
        ref: "src/sandbox/game-e2e.test.ts#after Enter, KeyZ raises the left bat to flipping-up and then held-up"
        status: pass
    human_judgment: false
  - id: D3
    description: "On every serve the flippers come back on and a still-held key raises its bat with no new press (right bat untouched)"
    requirement: GAME-03
    verification:
      - kind: e2e
        ref: "src/sandbox/game-e2e.test.ts#a tilt drops a held-up bat and locks it; the key held through the drain raises it on ball 2; game over leaves both bats dead"
        status: pass
      - kind: unit
        ref: "src/input/flipper-input.test.ts#FlipperInput.isHeld (Pitfall 5: the held-key re-press on serve) (5 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The finished game replays identically at 60, 120 and 144 Hz render cadences (steps, score, ball, state, hasPlayed, ball states, flipper angles), with the tilt observed in every run"
    requirement: GAME-03
    verification:
      - kind: integration
        ref: "src/sandbox/game.determinism.test.ts#the same key timeline gives the same game at 60, 120 and 144 Hz"
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase-3 review triage recorded: IN-01/02/03/05 fixed, IN-04 deferred with reason, WR-01 residual accepted, open: 0"
    verification:
      - kind: other
        ref: "grep -c 'IN-0[1235] | info | fixed' (4), grep -c 'IN-04 | info | deferred' (1), grep -c '^open: 0' (1) on 03-REVIEW-DISPOSITION.md"
        status: pass
    human_judgment: false
  - id: D6
    description: "No regression: every pre-existing flipper proof, the full suite and the four soak tunnel gates stay green with the finished rules"
    verification:
      - kind: integration
        ref: "npx vitest run (32 files, 338 tests)"
        status: pass
      - kind: integration
        ref: "npm run soak (4 gates)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Phase-end by-feel UAT: flippers dead before Enter, instant in play, TILT drops both bats and ignores presses, a held flipper rises on the next serve, bumpers and slings lively without trapping, nudge useful and over-nudge fairly punished, GAME OVER then a fresh game at 0 with lights off"
    requirement: GAME-03
    verification: []
    human_judgment: true
    rationale: "Feel and perception (assumptions A2-A5) cannot be asserted headlessly; Task 3's human-check is harvested by verify-work at end of phase"

# Metrics
duration: 9min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 08: Flipper Relay, Replay Determinism and Phase-3 Triage Summary

**TILT drops both bats through the FSM's motor -1 and locks them until the next serve, the flippers are dead outside a game, a held key re-raises its bat on the next ball, and a scripted full game replays bit-identically at 60/120/144 Hz.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-20T18:10:59Z
- **Completed:** 2026-11-20T18:20:16Z
- **Tasks:** 3
- **Files modified:** 10 (1 created, 9 modified)

## Accomplishments

- `FlipperController.setEnabled(false)` drives every flipping-up or held-up bat into `returning` with motor -1 (the release transition, now one private `drop()`), and `onPressEdge` is a no-op while disabled. Releases and `update()` keep running, so a dropped bat still settles to `resting` with motor 0. Enabled is the construction default and enabling issues no motor command, so every Phase-2/3 flipper proof is unchanged.
- `GameSession` takes a `FlipperGate`. It switches the flippers off in its constructor (attract), on a tilting nudge and on the final drain, and on in `onStart()` and on every serve after a drain.
- The `main.ts` adapter (mirrored in `makeGame`) wraps `controller.setEnabled` and, on enable, re-presses any side `input.isHeld(side)` reports.
- Five e2e cases on the real table: attract, in play, tilt drop and lock, re-enable with the key held through the drain, and game over.
- `game.determinism.test.ts` drives three `main.ts` compositions for 3600 steps with the same key timeline (start, launch, four nudges that tilt, both flippers, relaunch). Step count, score (4000), ball (3), state, `hasPlayed`, every ball state and both flipper angles match exactly, and every run sees the tilt.
- `03-REVIEW-DISPOSITION.md` now reads `open: 0`.

## Task Commits

1. **Task 1 (tracer): over-nudging drops both flippers and locks them; the flippers are dead outside a game.** Commit `8c2156e` (feat).
2. **Task 2: the disable contract is pinned in the FSM, the input and the session.** Commit `4fd906f` (test).
3. **Task 3: the full game replays identically at every render rate, and the Phase-3 triage is recorded.** Commit `aa19982` (test).

## Files Created/Modified

- `src/control/flipper-controller.ts`: `setEnabled`, `isEnabled` and the shared private `drop()`. The doc records the CLAUDE.md flipper lock.
- `src/input/flipper-input.ts`: public `isHeld(side)`.
- `src/game/game-session.ts`: `FlipperGate` interface, the 4th constructor parameter, and the relay calls at boot, start, serve, tilt and game over.
- `src/sandbox/main.ts`: the flipper ids are computed before the session, and the flipper-gate adapter is passed as the session's 4th argument.
- `src/sandbox/game-e2e.test.ts`: `makeGame` mirrors the adapter and now exposes `input`, `controller` and the flipper ids. Adds the relay `describe` (3 cases covering the 5 scenarios).
- `src/control/flipper-controller.test.ts`: 8 enable-gate cases.
- `src/input/flipper-input.test.ts`: 5 `isHeld` cases.
- `src/game/game-session.test.ts`: `NO_GATE` for `makeSession`, a recording gate in `makeRig`, and 8 relay cases.
- `src/sandbox/game.determinism.test.ts` (new): the cadence-independent replay of a full game.
- `.planning/phases/03-table-plunger-event-bus/03-REVIEW-DISPOSITION.md`:
  - IN-01, IN-02, IN-03 and IN-05 are fixed. IN-04 is deferred, with the reason in the Source cell.
  - The WR-01 Source cell records the accepted residual.
  - `open: 0`. Every other row is byte-identical.

## Decisions Made

- The disable path reuses the release transition through one private `drop()`, so a key release and a tilt cannot drift apart.
- The session owns *when* the flippers are on and `main.ts` owns *how*, through the one-method `FlipperGate`. `src/game` still never imports `src/control`.
- Open Question 1 adopted "dead". To make the flippers live in attract, delete the constructor's `setEnabled(false)` (one line).
- The WR-01 priming step is accepted rather than reworked, per the plan. The replay test is the evidence that it does not break determinism.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] No-op FlipperGate in game-session.test.ts during Task 1**
- **Found during:** Task 1
- **Issue:** The new required 4th constructor argument broke `tsc --noEmit` in `game-session.test.ts`, which Task 1's verify runs, but that file belongs to Task 2.
- **Fix:** Task 1 passed a `NO_GATE` no-op to both session builders. Task 2 then replaced `makeRig`'s gate with a recording one. `makeSession`, the score cases, keeps `NO_GATE`, because the relay cases live on the FSM rig.
- **Files modified:** `src/game/game-session.test.ts`
- **Commit:** `8c2156e`, then `4fd906f`

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** None. It was needed to keep Task 1's typecheck green, and there is no scope change.

## TDD Note (Task 2, tdd="true")

- **RED was not observable by design.** Task 1 is the tracer and already shipped the implementation, and the plan says to "fix only where a case fails". All 62 cases passed on first run against the Task-1 code. The one red was a test bug: the cross-game walk forgot the nudge cooldown carried over from the previous ball. It was fixed in the test.
- **Teeth replace RED evidence.** Seven mutants of the Task-1 implementation each turn the new cases red:
  - M1, no drop on disable: 4 failures.
  - M2, a press ignores the gate: the "while disabled" case fails.
  - M3, enable issues motor 0: 1 failure.
  - M4, `isHeld` always false: 4 failures.
  - M5, no enable on serve: 3 failures.
  - M6, no disable at boot: 8 failures.
  - M7, no disable at game over: 1 failure.
- **The e2e and replay tests also have teeth.**
  - Removing the boot and tilt `setEnabled(false)` calls fails the attract and tilt e2e cases.
  - Shifting the 144 Hz script by one step fails the replay test on the flipper angles.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Phase 4 is code-complete (8/8 plans) and ready for `/gsd-verify-work 4`. The Task-3 by-feel UAT (D7) is harvested there.
- The STATE.md blocker on the open Phase-3 findings is resolved (`open: 0`).
- An unclassified edge, flagged in the plan: a tilt in the same step as the final drain. `service()` ends the game with the flippers disabled either way. Review it manually.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*

## Self-Check: PASSED
