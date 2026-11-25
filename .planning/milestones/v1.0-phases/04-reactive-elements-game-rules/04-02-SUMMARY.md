---
phase: 04-reactive-elements-game-rules
plan: 02
subsystem: control
tags: [plunger, input, fsm, vitest, planck-e2e]

requires:
  - phase: 03-table-plunger-event-bus
    provides: "PlungerController (impulse-on-release), PlungerInput Space latch, PLUNGER_ZONE/PLUNGER_REST, 03-REVIEW IN-01/IN-02"
provides:
  - "PLUNGER_REST_SPEED_EPS (0.05 m/s) rest gate: only a ball resting in PLUNGER_ZONE is launched"
  - "PlungerInput.isHeld(): the latch's held flag, read right after drainEdges()"
  - "PlungerController.applyEdges(press, release, cancel, heldNow, ballId): same-window edges applied in their real order"
affects: [04-05, 04-06, 04-08]

plan_head_before: 25b2955f987a32a924eb988e9111c39ad2e564b5
plan_head_after: ecba38dcef4cbc2ec4eb6c449acc083b8a78f36c
actuals:
  tokens: 4500
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Detector thresholds (not feel magnitudes) live as module consts beside their controller (ANGLE_SETTLE_EPS, PLUNGER_REST_SPEED_EPS)"
    - "Order-less latch booleans disambiguated by the held state at drain time"

key-files:
  created: []
  modified:
    - src/control/plunger-controller.ts
    - src/control/plunger-controller.test.ts
    - src/sandbox/plunger-e2e.test.ts
    - src/input/plunger-input.ts
    - src/input/plunger-input.test.ts

key-decisions:
  - "Plunger release requires speed < PLUNGER_REST_SPEED_EPS 0.05 m/s (strict) beside the zone test; a refused release still resets to idle with charge 0 (IN-01)"
  - "applyEdges orders same-window edges by held state at drain time (held: release, cancel, press; not held: press, release, cancel) instead of the review's fixed release-cancel-press, which would strand a sub-window tap as a never-ending charge (IN-02)"
  - "main.ts still uses the old press-release-cancel consumer; 04-05 switches it to one applyEdges call fed by plungerInput.isHeld()"

patterns-established:
  - "Two-rig bit-identical proof: run an identical twin rig without the action under test and assert the ball state matches exactly, so 'applied nothing' is proven on the real engine"

requirements-completed: [GAME-02, GAME-03]

coverage:
  - id: D1
    description: "Only a resting ball in PLUNGER_ZONE is launched; a moving ball (falling back, or shoved) gets no impulse and the charge resets"
    requirement: GAME-02
    verification:
      - kind: unit
        ref: "src/control/plunger-controller.test.ts#PlungerController: rest gate (IN-01) (3 cases: moving (0,2), 0.049 m/s launches, exactly 0.05 m/s does not)"
        status: pass
      - kind: integration
        ref: "src/sandbox/plunger-e2e.test.ts#a release while the ball falls back into the plunger lane applies nothing; a release from rest still launches"
        status: pass
    human_judgment: false
  - id: D2
    description: "PlungerInput.isHeld() tracks keydown, auto-repeat, keyup, blur and hidden tab"
    requirement: GAME-03
    verification:
      - kind: unit
        ref: "src/input/plunger-input.test.ts (7 isHeld() cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "applyEdges applies same-window edges in their real order: release+re-press launches then recharges; sub-window tap launches at minimum and ends idle; cancel+re-press and press+cancel launch nothing; single edges match direct calls"
    requirement: GAME-02
    verification:
      - kind: unit
        ref: "src/control/plunger-controller.test.ts#PlungerController: applyEdges orders same-window edges by held state (IN-02) (6 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every pre-existing plunger proof (charge, cap, min/max impulse, focus-loss cancel, chute launch, CR-01 ball-feed cases) still passes"
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npx eslint src && npx vitest run (28 files, 211 tests)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 02: Honest Plunger (IN-01 / IN-02) Summary

**The plunger now launches only a ball resting in the zone (speed under 0.05 m/s), and `applyEdges()` applies one window's press/release/cancel in the order they really happened, using `PlungerInput.isHeld()` at drain time to tell which came last.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-20T15:26:54Z
- **Completed:** 2026-11-20T15:31:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- IN-01 closed: `ballInZone` is now `ballRestingInZone` and also requires `Math.hypot(vx, vy) < PLUNGER_REST_SPEED_EPS`. The "resting inside the plunger zone" doc is now literally true. A refused release still returns to idle with charge 0, so the meter never shows a stranded charge.
- Real-chute proof: two identical rigs both get a minimum tap. Rig A gets a second press/release while its ball falls back through the zone at speed; its ball stays bit-identical to rig B's through the release step plus 10. After settling, a normal tap from rest still climbs more than 0.3 m.
- IN-02 closed at the API level: `applyEdges(press, release, cancel, heldNow, ballId)` orders the edges by the held state at drain time. A release and re-press inside 8.3 ms launches and starts a new charge. A tap shorter than one window launches at `PLUNGER_MIN_IMPULSE` and ends idle.
- `PlungerInput.isHeld()` exposes the latch's held flag.

## Task Commits

1. **Task 1 (tracer): rest gate** - `da8d3a0` (feat)
2. **Task 2 (TDD): same-window edge order**
   - RED: `593852d` (test)
   - GREEN: `ecba38d` (feat)

## Files Created/Modified

- `src/control/plunger-controller.ts`: `PLUNGER_REST_SPEED_EPS`, `ballRestingInZone`, `applyEdges`, updated header/release docs.
- `src/control/plunger-controller.test.ts`: `putBall` takes optional `vx`/`vy`; 3 rest-gate cases, 6 `applyEdges` cases.
- `src/sandbox/plunger-e2e.test.ts`: the two-rig fall-back release proof.
- `src/input/plunger-input.ts`: `isHeld()`.
- `src/input/plunger-input.test.ts`: 7 `isHeld()` cases.

## Decisions Made

See `key-decisions`. The held-state ordering replaces the review's fixed release-cancel-press suggestion; the reasoning is in the `applyEdges` doc comment.

## TDD Gate Compliance

- **RED** (`593852d`):
  - Command: `npx vitest run src/control/plunger-controller.test.ts --reporter=tap-flat`, exit 1. Classifier: `RED_EVIDENCE_OK` (`target_test_failed`).
  - Target: `charging, then release and re-press in one window (held at drain): launches once and starts a new charge`. Expected one impulse, got 0.
  - Semantic assessment: the target ran and failed on its planned `calls.length` assertion. All 4 failing controller cases and 3 failing input cases failed on assertions, none on load, syntax or fixture errors. As in 04-01, surface-only skeletons (`isHeld()` returns false, `applyEdges` is a no-op) were committed with the tests so RED is an assertion failure rather than a `TypeError`.
- **GREEN** (`ecba38d`): 45/45 in the three plunger files; full suite 211/211.
- **REFACTOR:** none needed.
- Task 1 (tracer, not TDD) teeth: with `PLUNGER_REST_SPEED_EPS` temporarily set to `Infinity`, all 3 new Task-1 cases (moving ball, exactly 0.05 m/s, real-chute fall-back) failed; the source was restored.

## Deviations from Plan

None - plan executed exactly as written. (The RED skeletons follow the 04-01 precedent for the #3770 rule and are not a scope change.)

## Issues Encountered

None.

## Verification

- `npx tsc --noEmit`: 0 errors.
- `npx eslint src`: clean.
- `npx vitest run`: 28 files, 211 tests passed.
- Only `src/physics/planck-world.ts` imports `planck`; the plunger modules stay engine-agnostic.

## Open Item (for 04-05 / 04-08)

- `src/sandbox/main.ts` still applies plunger edges press, release, cancel. 04-05 Task 1 replaces that with one `plunger.applyEdges(e.press, e.release, e.cancel, plungerInput.isHeld(), session.activeBallId)` call.
- Flipper consumer (out of IN-02's scope, unchanged): a release and re-press of a flipper key inside one 8.3 ms window leaves the bat drooped until the next press. Recorded for 04-08's disposition update.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 04-05 to wire `applyEdges` + `isHeld()` into `main.ts`. 04-08 can mark IN-01 and IN-02 resolved in 03-REVIEW-DISPOSITION.md.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*

## Self-Check: PASSED

- All 5 modified files exist on disk.
- Commits `da8d3a0`, `593852d` and `ecba38d` are ancestors of HEAD; `check evaluation-scope --plan 04-02 --commits-only` resolves all three.
