---
phase: 04-reactive-elements-game-rules
plan: 05
subsystem: game-rules
tags: [fsm, game-session, input, planck-e2e, vitest]

requires:
  - phase: 04-02
    provides: "PlungerController.applyEdges(press, release, cancel, heldNow, ballId) and PlungerInput.isHeld()"
  - phase: 04-03
    provides: "ReactiveElements.resetLights() / isLit(); every rule gated by RulesGate.isLive()"
provides:
  - "GameSession 3-ball FSM: BALLS_PER_GAME, GameState, GameSessionWorld, onStart(), service(), activeBallId, getBall(), getState(), hasPlayed()"
  - "GameInput Enter/NumpadEnter start latch with GameEdges"
  - "main.ts recomposed around the session: boots into attract, Enter starts, applyEdges + isHeld() live (IN-02)"
  - "BallFeed retired; its CR-01 cases live in game-e2e.test.ts and game-session.test.ts"
affects: [04-06 tilt (adds "tilted" state and nudge edges), 04-07 HUD (ball and status lines), 04-08 flipper setEnabled and UAT]

plan_head_before: 7bb7c164889220174fbbf99a6c21bdc38cded32f
plan_head_after: 3b38a3ef72f7bca92b0140f2d804a32003e4fe1f
actuals:
  tokens: 14167
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Game FSM as a string union with a switch, no library; listener records, service() mutates after dispatch"
    - "Press-only input latch: held set + one reused view; blur/hidden clear held and latch nothing"

key-files:
  created:
    - src/input/game-input.ts
    - src/input/game-input.test.ts
    - src/sandbox/game-e2e.test.ts
  modified:
    - src/game/game-session.ts
    - src/game/game-session.test.ts
    - src/sandbox/main.ts
  deleted:
    - src/sandbox/ball-feed.ts
    - src/sandbox/ball-feed.test.ts

key-decisions:
  - "GameSession boots into game-over with no ball; onStart() only from game-over; the third drain ends the game with the score kept; drain read from the bus for the active id only (CR-01)"
  - "The e2e's ball 1 uses a part-charge hold (LIGHTING_HOLD_STEPS 62) that lights rollover 401 and then drains, so the restart's light reset is not vacuous; balls 2 and 3 use a full charge"

patterns-established:
  - "game-e2e makeGame() mirrors main.ts's composition and step bodies exactly; any main.ts wiring change must be mirrored there"

requirements-completed: [GAME-02]

coverage:
  - id: D1
    description: "A full 3-ball game runs headless on the real table: attract, Enter, three launches and drains with the next ball served to PLUNGER_REST, game over with no ball and the score kept, Enter ignored mid-game, restart at 0 with every light off"
    requirement: GAME-02
    verification:
      - kind: integration
        ref: "src/sandbox/game-e2e.test.ts#plays a full 3-ball game through the main.ts composition"
        status: pass
    human_judgment: false
  - id: D2
    description: "FSM contract: boot state, start, double start refused, remove-before-serve order, listener only records, non-active drain ignored, 600 idle steps never respawn, third drain ends the game, restart, duplicate drain serves once"
    requirement: GAME-02
    verification:
      - kind: unit
        ref: "src/game/game-session.test.ts#GameSession 3-ball FSM (GAME-02) (11 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Start latch: Enter and NumpadEnter latch, repeat and duplicate keydown do not, keyup re-arms, preventDefault only on bound codes, reused view, blur and hidden tab"
    requirement: GAME-02
    verification:
      - kind: unit
        ref: "src/input/game-input.test.ts#GameInput: start latch (R6) (10 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ported CR-01 cases in a started game (parked ball kept 600 frames, full launch clears the chute at 60/120/144 Hz, minimum tap falls back) and the IN-02 same-window release and re-press, through main.ts's applyEdges + isHeld() wiring"
    requirement: GAME-02
    verification:
      - kind: integration
        ref: "src/sandbox/game-e2e.test.ts#ported ball-feed cases (CR-01) in a started game (5 cases)"
        status: pass
      - kind: integration
        ref: "src/sandbox/game-e2e.test.ts#IN-02 live: a release and re-press inside one fixed-step window"
        status: pass
    human_judgment: false
  - id: D5
    description: "The live sandbox boots with an empty table, Enter serves a ball, and three drains end the game"
    requirement: GAME-02
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npx eslint src (main.ts compiles and lints; browser run not driven)"
        status: pass
    human_judgment: true
    rationale: "The browser composition is mirrored by game-e2e but not run in a browser here; there is no HUD prompt until 04-07, so an empty table at boot must be checked by eye in end-of-phase UAT."

duration: 11min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 05: 3-Ball Game Loop Summary

**`GameSession` is now the 3-ball state machine: the sandbox boots into attract with no ball, Enter or NumpadEnter starts a game, each bus-reported drain removes the ball and serves the next one to the plunger, and the third drain ends the game with the score kept. It replaces the sandbox `BallFeed`, and `main.ts` now drives the plunger through `applyEdges` with `isHeld()`.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-20T17:25:45Z
- **Completed:** 2026-11-20T17:36:30Z
- **Tasks:** 3
- **Files modified:** 8 (3 created, 3 modified, 2 deleted)

## Accomplishments

- `GameSession(world, router, spawn)` holds the `"game-over" | "playing"` FSM. `onStart()` works only from game-over. `service()` removes a drained ball before serving the next one. `isLive()` is true only while playing, so kicks, points and lights switch on and off with the game.
- `GameInput` is a press-only start latch. It calls `preventDefault` only for Enter and NumpadEnter, ignores auto-repeat, and allocates nothing.
- `main.ts`:
  - the session replaces the feed;
  - plunger edges go through `plunger.applyEdges(..., plungerInput.isHeld(), session.activeBallId)`;
  - a start edge that starts a game calls `reactive.resetLights()`;
  - the Phase-3 demo console logger is removed;
  - `onPostStep` runs dispatch, then reactive service, then session service.
- `game-e2e.test.ts` mirrors `main.ts` exactly and plays a full game on the real table: attract, three drains, game over, then a restart with lights off. Ball 1 lights rollover 401 on the way, so the reset has a lit light to clear. The file also carries the ported CR-01 cases and the live IN-02 case.
- BallFeed is deleted with no loss of coverage. The suite is 30 files and 253 tests, all green.

## Task Commits

1. **Task 1 (tracer): full 3-ball game on the real table** - `d14dc0b` (feat)
2. **Task 2 (tdd): FSM and start-latch contracts** - `974d758` (test)
3. **Task 3: retire BallFeed, port CR-01, IN-02 live** - `3b38a3e` (test)

## Files Created/Modified

- `src/game/game-session.ts`: the 3-ball FSM, bus drain listener, serving.
- `src/game/game-session.test.ts`: `makeSession()` builds a started session over a spy world; 11 FSM cases over a scripted router.
- `src/input/game-input.ts` (new): `GameInput`, `GameEdges`.
- `src/input/game-input.test.ts` (new): 10 latch cases.
- `src/sandbox/main.ts`: session-driven serving, `GameInput`, `applyEdges` consumer, demo logger removed, header doc with the step order.
- `src/sandbox/game-e2e.test.ts` (new): the full-game scenario, the ported CR-01 cases and the IN-02 live case.
- `src/sandbox/ball-feed.ts`, `src/sandbox/ball-feed.test.ts`: deleted (intentional).

## Decisions Made

See `key-decisions`. The tracer verify re-ran green before expansion (interactive, end-of-phase mode, automated-only verify), so no checkpoint was needed.

## TDD Gate Compliance

- **RED: not observed (unexpected GREEN).** Task 2 is `tdd="true"`, but the plan has the Task 1 tracer build the FSM and the latch first. Task 2 says to write the cases and fix code only where a case fails. All 25 cases passed on the first run against `d14dc0b`. Following fail-fast rule 1, I checked why they passed: the feature already existed, and the tests do test it. No RED evidence record was written, because none exists honestly.
- **Substitute teeth evidence:** I made nine targeted mutations of the Task 1 code and ran the two test files against each. All nine were killed:
  - add before remove (4 cases failed);
  - onStart allowed while playing;
  - drain listener ignores the active id;
  - world mutated inside the listener;
  - award while not live;
  - repeat not ignored;
  - blur keeps held;
  - preventDefault on every code;
  - drainEdges allocates a new view.

  The source was restored after each run.
- **GREEN:** `d14dc0b` (feat, Task 1), before the `test(04-05)` commit `974d758`. In git order, GREEN comes before RED, so the gate review will flag `green_before_red` for this plan. That ordering is what the plan asked for (a tracer first), not a skipped RED.
- **REFACTOR:** none needed.
- Task 1 and Task 3 mutation checks:
  - Removing `resetLights()` from the start path fails the restart assertion.
  - Letting a 4th ball serve fails the game-over assertion.
  - Passing `false` instead of `isHeld()` fails the IN-02 live case.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical test coverage] The restart light-reset assertion was vacuous**
- **Found during:** Task 1
- **Issue:** With a full-charge hold on all three balls, no rollover is ever lit on this table. Asserting "isLit is false after restart" therefore proved nothing about `resetLights()`.
- **Fix:** Ball 1 uses a fixed part-charge hold, `LIGHTING_HOLD_STEPS = 62`, chosen by a sweep of hold lengths. It lights rollover 401 and the ball still drains. The test asserts 401 is lit after every drain and off after the restart. Balls 2 and 3 keep the full charge. No ball is removed by hand.
- **Files modified:** src/sandbox/game-e2e.test.ts
- **Verification:** Removing `resetLights()` from the start path turns the case red.
- **Committed in:** `d14dc0b`

**2. [Rule 2 - Coverage] Extra FSM cases beyond the behavior list**
- **Found during:** Task 2
- **Issue:** The plan's behavior list did not pin "the listener only records" or "stray events after game over do nothing".
- **Fix:** Added a `dispatchOnly` rig hook and two cases. Both are thin and test only the contracts already stated in the plan.
- **Committed in:** `974d758`

---

**Total deviations:** 2 auto-fixed (both test-side, Rule 2)
**Impact on plan:** no production change beyond the plan; no scope creep.

## Issues Encountered

- During a Task 1 mutation check, a backup copy landed in `/tmp` rather than the scratchpad, so the first restore attempt missed. The file was restored from `/tmp`, re-checked green, and committed clean.

## Known Stubs

None.

## Threat Flags

None. T-04-11, T-04-12 and T-04-13 are mitigated as planned:
- The drain is read from the bus for the active id only.
- `service()` removes the drained ball before any add, and a duplicate drain serves once.
- The latch calls `preventDefault` on bound codes only, and repeats are ignored.

## User Setup Required

None.

## Next Phase Readiness

- 04-06 can add `"tilted"` to `GameState` (the `onStart` switch is exhaustive, so the compiler will flag the new case) and nudge edges to `GameEdges`.
- 04-07 can read `getBall()`, `getState()` and `hasPlayed()` for the HUD's ball and status lines.
- Until 04-08's `FlipperController.setEnabled`, the bats still respond in attract and game-over. With no ball on the table, that has no effect on the game.
- Human check for end-of-phase UAT: in `npm run dev`, confirm the table is empty at boot, Enter serves a ball, Space launches it, three drains end the game, and Enter restarts at 0.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*

## Self-Check: PASSED

- All 6 created/modified files exist; both deleted files are gone.
- Commits d14dc0b, 974d758 and 3b38a3e are ancestors of HEAD.
- `npx tsc --noEmit`, `npx eslint src` and `npx vitest run` exit 0 (30 files, 253 tests); only `src/physics/planck-world.ts` imports planck.
