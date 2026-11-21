---
phase: 04-reactive-elements-game-rules
plan: 14
subsystem: input
tags: [keyboard, windows, shift, flipper-input, planck, vitest]

requires:
  - phase: 04-reactive-elements-game-rules
    provides: "04-12 windowsShiftHeal (second-press recovery, final-keyup drop-both) and the WR-01 drain rule"
provides:
  - "repeatingShift marker: after a force-clear, the other Shift counts as a press once the held Shift has auto-repeated (WR-01)"
  - "dropStaleShift(e, isKeyUp): a Shift key's own event reconciles only on keyup with the heal on (WR-02)"
  - "G-04-21 unit block (R1-R7, K1-K6) and keyboard-to-Planck block (both focus mirrors, WR-02)"
  - "IN-01: main.ts flipperGate comment names the Windows Shift-keyup heal"
affects: [phase-04-verification, uat-g-04-21]

actuals:
  tokens: 6981
  tasks: 3
  commits: 5
plan_head_before: 16c319810238a93e8597682ff23029accaa120d4
plan_head_after: 0c58671ceed54dd3c310fb8b61ebe789ceffad21

tech-stack:
  added: []
  patterns:
    - "Repeat marker: an ignored Shift auto-repeat records which Shift is physically down, reset on every force-clear and on a Shift keyup reporting Shift up"
    - "Shift keys' own events reconcile on keyup only; non-Shift events reconcile on keydown and keyup"

key-files:
  created: []
  modified:
    - src/input/flipper-input.ts
    - src/input/flipper-input.test.ts
    - src/sandbox/flipper-e2e.test.ts
    - src/sandbox/main.ts

key-decisions:
  - "04-14: after a force-clear, a repeat-flagged keydown of the OTHER Shift is a press once the held Shift's ignored auto-repeat set repeatingShift (heal only); marker resets in forceClear and on a Shift keyup with shiftKey false"
  - "04-14: dropStaleShift(e, isKeyUp) - a Shift keydown never reconciles; a Shift keyup reconciles only with windowsShiftHeal on; non-Shift events unchanged"
  - "04-14: accepted residual pinned by R3 - a second Shift pressed before the held Shift's first OS auto-repeat (~500 ms) after a clear is still missed"

patterns-established:
  - "Teeth check: each fix mutated alone (M1-M5) and each named case confirmed red before restore"

requirements-completed: [FLIP-01, GAME-02]

coverage:
  - id: D1
    description: "WR-01: after a focus regain, blur or hidden tab, a Shift held across the clear no longer blocks the other Shift once its auto-repeat arrives; the other bat rises within 2 fixed steps"
    requirement: FLIP-01
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#G-04-21 R1 (focus|blur|hidden), R2 (mirror)"
        status: pass
      - kind: integration
        ref: "src/sandbox/flipper-e2e.test.ts#Windows Shift after a force-clear (G-04-21) - both focus mirrors"
        status: pass
    human_judgment: true
    rationale: "The fix relies on Windows delivering the held Shift's typematic auto-repeat to the page after a focus regain; only a real keyboard on Windows proves that (plan human-check)."
  - id: D2
    description: "WR-02: a Shift keydown reporting shiftKey false never drops the other held Shift; Shift keyup drop-both and non-Shift reconciliation unchanged"
    requirement: GAME-02
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#G-04-21 K1-K6"
        status: pass
      - kind: integration
        ref: "src/sandbox/flipper-e2e.test.ts#a Shift keydown reporting Shift up keeps the other held Shift's bat up (WR-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Marker resets, lone-repeat suppression, heal-off guard and the documented residual are pinned"
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#G-04-21 R3-R7"
        status: pass
    human_judgment: false
  - id: D4
    description: "IN-01: main.ts flipperGate comment names the Windows Shift-keyup heal; no code line changed"
    verification:
      - kind: other
        ref: "git diff e592cb1 -- src/sandbox/main.ts (comment lines only, AC grep == 0 code lines)"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-21
status: complete
---

# Phase 04 Plan 14: Windows Shift heal after a force-clear and on Shift keydowns Summary

**A `repeatingShift` marker lets the other Shift raise its bat after a focus regain, blur or hidden tab once the held Shift auto-repeats (WR-01). `dropStaleShift(e, isKeyUp)` stops a Shift keydown reporting Shift up from dropping the other held Shift (WR-02).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-21T01:13:02Z
- **Completed:** 2026-11-21T01:20:23Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- WR-01 closed: with `windowsShiftHeal` on, a Shift held across a force-clear no longer blocks the other Shift. Once the held Shift's OS auto-repeat has reached the page, a repeat-flagged keydown of the other Shift counts as a press, and the Planck bat starts rising within 2 fixed steps. The Shift held across the clear still needs a fresh press.
- WR-02 closed: a ShiftLeft/ShiftRight keydown reporting `shiftKey` false no longer deletes the other held Shift. A Shift keyup reporting Shift up still drops both (G-04-17), and non-Shift events still reconcile on keydown and keyup (G-04-11).
- The residual is documented in the module header and pinned by R3: after a clear, a second Shift pressed before the held Shift's first OS auto-repeat (~500 ms) is still missed.
- IN-01: the main.ts flipperGate comment now names the Windows Shift-keyup heal. Only comment lines changed.
- Suite: 482 to 502 tests (+17 unit, +3 e2e), still 34 files, all green. No pre-existing `expect(` line was edited. src/physics, src/control, src/ui, index.html and both game mirrors are byte-identical to e592cb1. The six D-09 bindings are unchanged.

## Task Commits

1. **Task 1 (tracer): WR-01, from the key handler to the Planck bat**: `1389270` (test, RED), `b4edd8b` (feat, GREEN)
2. **Task 2: WR-02, a Shift keydown never drops the other Shift**: `3821706` (test, RED), `7be129b` (feat, GREEN)
3. **Task 3: WR-01 matrix, header residual, IN-01 comment**: `0c58671` (test)

## RED evidence

**Task 1 (at e592cb1 code, commit 1389270):**
- `flipper-input.test.ts > ... (G-04-21) > R1 (focus): ...`: `AssertionError: expected false to be true`. `rightPress` was false: the repeat-flagged ShiftRight was dropped because `held` was empty after the clear.
- `flipper-e2e.test.ts > Windows Shift after a force-clear (G-04-21) > ShiftLeft held across a focus regain: ...`: `AssertionError: expected -1 to be greater than or equal to 1`. The right bat never moved within 40 steps.
- Tracer gate (interactive, end-of-phase, automated-only verify): verify re-run after GREEN passed, then expansion went ahead.

**Task 2 (at the Task 1 head, commit 3821706):**
- Failed as planned: K1 and K2 (`expected true to be false`: the other side's release latched), K3 (`expected false to be true`: dropStaleShift emptied held before the second-press check, so leftPress was false), and the WR-02 e2e case (`expected 'returning' to be 'held-up'`).
- Passed as planned: K4, K6 (new FlipperInput()), K6 (windowsShiftHeal: false).
- Deviation: K5 also failed at the Task 1 head (`expected false to be true` on rightRelease). See Deviations.
- Machine check: `gsd_run check tdd-red-evidence` on the K1 TAP record (`npx vitest run src/input/flipper-input.test.ts --reporter=tap-flat`, exit 1) returned `RED_EVIDENCE_OK` (`target_test_failed`).
- Semantic assessment: K1 ran and failed on the planned assertion (`rightRelease` expected false, got true), caused by the WR-02 defect (dropStaleShift on a Shift keydown). No load, syntax or fixture fault.

## Teeth check (Task 3, run once, not committed; source restored)

| Mutation | Cases that went red |
|----------|--------------------|
| M1: isSecondShiftPress ignores repeatingShift | R1 (focus), R1 (blur), R1 (hidden), R2 (mirror), both focus e2e cases |
| M2: forceClear keeps repeatingShift | R4 |
| M3: handleKeyUp keeps repeatingShift | R5 |
| M4: dropStaleShift ignores isKeyUp | K1, K2, K3, K5, WR-02 e2e case |
| M5: dropStaleShift returns on every keydown | K4, B2 (Space), B2 (Enter), B3, B4, W1, W2 |

Every named case went red under its mutation. No test needed strengthening. After `git checkout -- src/input/flipper-input.ts` the tree was clean and green.

## TDD Gate Compliance

- Task 1: RED `1389270` test(04-14), then GREEN `b4edd8b` feat(04-14).
- Task 2 (tdd="true"): RED `3821706` test(04-14), then GREEN `7be129b` feat(04-14). No refactor commit was needed.
- No violations.

## Files Created/Modified
- `src/input/flipper-input.ts`: `repeatingShift` field, recorded in the repeat-ignore branch (heal only). `isSecondShiftPress` also accepts the other Shift when the marker names it. The marker resets in `forceClear` and on a Shift keyup with shiftKey false. `dropStaleShift(e, isKeyUp)`. Header, option and `handleFocus` docs updated, with the residual.
- `src/input/flipper-input.test.ts`: G-04-21 block with 17 cases (R1 x3, R2-R6, R7 x2, K1-K5, K6 x2).
- `src/sandbox/flipper-e2e.test.ts`: G-04-21 block with 3 keyboard-to-Planck cases (both focus mirrors, WR-02).
- `src/sandbox/main.ts`: flipperGate comment only (IN-01).

## Decisions Made
- The marker records only with the heal on, and is not cleared when the second press is accepted. These are the plan's discretion items, followed as written.
- Task 1 used the shared helper `heldLeftAcrossClear(clear)`, so the focus case stayed byte-identical when Task 3 added the blur and hidden loop.

## Deviations from Plan

**1. [Rule 1 - Plan premise] K5 failed at the Task 1 head instead of passing**
- **Found during:** Task 2 RED
- **Issue:** The plan listed K5 as a guard that passes before the fix. K5 starts with K1's two events, and at the Task 1 head the WR-02 defect already drops ShiftRight on the ShiftLeft keydown. So the final keyup has no right side left to release, and `rightRelease` is false. The G-04-17 keyup heal itself was unchanged: A1, B, D, D' and W6 stayed green throughout.
- **Fix:** None. The test was left as specified. It is correct for the fixed behavior and passes after GREEN, and the teeth check (M4) shows it catches WR-02 too.
- **Files modified:** none
- **Committed in:** 3821706 (as written)

---

**Total deviations:** 1 (plan expectation corrected, no code impact)
**Impact on plan:** None. The RED and pass lists are recorded above as observed.

## Issues Encountered
- The first full `npm test` after Task 1 had 5 `Test timed out in 5000ms` failures (the soak, determinism and G-04-10 tests) on a cold, loaded run that took 14 s. These are the load timeouts already tracked in the pending todo `2026-11-21-give-heavy-simulation-tests-an-explicit-timeout...`, with zero assertion failures. Two immediate re-runs passed 484/484, one of them with `--maxWorkers=6`. Every later run passed: 492/492 after Task 2 and 502/502 after Task 3. Not in scope here.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- G-04-21 has code and automated proof. The Task 3 human check (a Windows focus-steal re-test on a real keyboard, plus the UAT 19 four-order regression) is still open for end-of-phase UAT. It needs a real keyboard because SendInput generates no typematic auto-repeat.
- Known residuals, not failures: a second Shift pressed within ~0.5 s of focus returning may be missed, and the 04-12 residual where a bat stays up until the other Shift is released is unchanged.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-21*

## Self-Check: PASSED
