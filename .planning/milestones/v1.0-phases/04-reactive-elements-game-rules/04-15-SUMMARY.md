---
phase: 04-reactive-elements-game-rules
plan: 15
subsystem: input
tags: [keyboard, windows, shift, typematic, timestamp, flipper-input, g-04-21]

requires:
  - phase: 04-reactive-elements-game-rules (plan 04-14)
    provides: "repeatingShift marker (G-04-21 heal past a force-clear), WR-02 Shift-keydown no-reconcile rule"
provides:
  - "KeyEventLike.timeStamp (optional) and exported SHIFT_REPEAT_GAP_MS = 450"
  - "Timed re-press rule: the auto-repeating Shift re-pressed > 450 ms after its last ignored repeat counts as a press (G-04-21 cradle)"
  - "IN-01: dropStaleShift clears the repeat marker and its time whenever it drops both Shift codes"
  - "17 unit + 2 keyboard-to-Planck cradle cases; IN-02/IN-03 doc fixes; header residual"
affects: [phase-04-verification, uat-g-04-21, flip-01, game-02]

actuals:
  tokens: 6743
  tasks: 3
  commits: 5
plan_head_before: 9e87cab68af17b3097d09fc372535b40285befe2
plan_head_after: 7042576cf8e61288ebcc81540c5f3ca38447fce2

tech-stack:
  added: []
  patterns:
    - "Event timeStamp as classification input only (finite-checked, never a global clock); rules stay step-clocked"
    - "Timed e2e rig: rig spread with step() advancing a local fixed-step clock that stamps every synthetic event"

key-files:
  created: []
  modified:
    - src/input/flipper-input.ts
    - src/input/flipper-input.test.ts
    - src/sandbox/flipper-e2e.test.ts

key-decisions:
  - "G-04-21 cradle closed with option A (timing): SHIFT_REPEAT_GAP_MS = 450 ms, above the slowest nominal Windows repeat interval (~400 ms) and below the 500 ms default typematic delay so a missed fast re-press is still picked up on its own first auto-repeat"
  - "The timed rule runs after the held check, so a held Shift's re-press stays a de-duped no-op; an untimed or non-finite event never counts, and an untimed ignored repeat clears the reference"
  - "IN-01: the marker/time reset moved into dropStaleShift (any event proving no Shift is down); the handleKeyUp special case was removed as redundant"

patterns-established:
  - "Timed synthetic events (tev/tkey) without return-type annotations so tests typecheck before and after an optional interface field is added"

requirements-completed: [FLIP-01, GAME-02]

coverage:
  - id: D1
    description: "Both Shifts held across a focus regain, blur or hidden tab: re-pressing the auto-repeating Shift after a pause > 450 ms raises its bat within 2 fixed steps; the final Shift keyup drops it (both mirrors)"
    requirement: FLIP-01
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#C1 (focus) / C1 (blur) / C1 (hidden) / C2 (mirror)"
        status: pass
      - kind: e2e
        ref: "src/sandbox/flipper-e2e.test.ts#both Shifts held across a focus regain: re-pressing Right Shift after a pause raises the right bat and the final ShiftLeft keyup drops it"
        status: pass
      - kind: e2e
        ref: "src/sandbox/flipper-e2e.test.ts#mirror: re-pressing Left Shift after a pause raises the left bat and the final ShiftRight keyup drops it"
        status: pass
    human_judgment: false
  - id: D2
    description: "A steady auto-repeat stream (400 ms), the exact-gap boundary, untimed/non-finite events, a held Shift's re-press and the heal-off path never latch a press"
    requirement: FLIP-01
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#C3 (boundary), C4, C7 x2, C8, C9, C10 x2"
        status: pass
    human_judgment: false
  - id: D3
    description: "Documented residuals pinned: a faster re-press within 450 ms is missed (C5) and a held missed key is picked up on its first auto-repeat (C6, C11)"
    requirement: FLIP-01
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#C5 (residual), C6, C11 (residual)"
        status: pass
    human_judgment: false
  - id: D4
    description: "IN-01: an event that drops both Shift codes clears the repeat marker and its time"
    requirement: GAME-02
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#I1 (IN-01), I2 (IN-01), R5"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real Windows keyboard cradle re-test: Windows delivers the last-pressed Shift's typematic to the page after a focus regain with real time stamps, and the 450 ms threshold feels right"
    requirement: FLIP-01
    verification: []
    human_judgment: true
    rationale: "Injected input generates no OS auto-repeat; only a person's key timing on real Windows proves the premise and the threshold feel (Task 3 human-check, end-of-phase UAT)"

duration: 37min
completed: 2026-11-21
status: complete
---

# Phase 4 Plan 15: G-04-21 Cradle Timed Re-press Summary

**The Windows Shift that auto-repeats in a both-Shift cradle now counts again when it is re-pressed more than 450 ms after its last auto-repeat. The time comes only from the KeyboardEvent's own timeStamp. dropStaleShift now clears the stale repeat marker (IN-01).**

## Performance

- **Duration:** 37 min
- **Started:** 2026-11-21T02:11:14Z
- **Completed:** 2026-11-21T02:48:39Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- `KeyEventLike` gains an optional `timeStamp`. `SHIFT_REPEAT_GAP_MS = 450` is exported with its Windows repeat-rate and delay justification. `lastShiftRepeatAt` is recorded next to `repeatingShift`.
- `isSecondShiftPress(code, timeStamp)`: after the held check, the marker's own code counts as a press when its finite timeStamp is more than 450 ms after the last ignored repeat.
- IN-01: `dropStaleShift` resets the marker and its time. The redundant Shift-keyup reset in `handleKeyUp` is gone, and R5 still passes.
- The header now documents the timed re-press and the faster-re-press residual with its late pickup. IN-02 (`handleKeyDown` doc) and IN-03 (`anyEdge` doc) are fixed.
- Suite: 521 tests in 34 files (502 + 19: 17 unit, 2 e2e). Typecheck and lint are clean.

## Task Commits

1. **Task 1: Tracer, cradle across a focus regain (RED then GREEN)**: `3b4f351` (test), `208a788` (feat)
2. **Task 2: Cradle matrix and IN-01**: `183931f` (test), `03b8791` (fix)
3. **Task 3: Teeth check, header and docs, IN-02/IN-03**: `7042576` (docs)

## RED Evidence

**Task 1 RED at 2e9116a code (commit 3b4f351):** exactly 2 of 128 tests failed, both on the planned assertion:
- `flipper-input.test.ts > ... (G-04-21 cradle) > C1 (focus) ...`: `AssertionError: expected false to be true` at `expect(pressOf(input.drainEdges(), last)).toBe(true)` (rightPress false at the 1930 ms re-press).
- `flipper-e2e.test.ts > ... (G-04-21 cradle) > both Shifts held across a focus regain ...`: `AssertionError: expected -1 to be greater than or equal to 1` (stepsUntilMoved returned -1 at the re-press).
- Assessment: each target ran and failed on the cradle re-press assertion. No load, type or fixture error (typecheck and lint were green at RED).

**Task 2 RED at the Task 1 head (commit 183931f):** exactly I1 and I2 failed (`expected true to be false` on `anyEdge(...)`: the stale marker gave rightPress in I1, and the stale marker plus its time gave leftPress in I2). The other 15 new unit cases and the e2e mirror case passed: C1 blur/hidden, C2, C3, C4, C5, C6, C7 x2, C8, C9, C10 x2, C11. 143 passed, 2 failed.

**GREEN:** 145/145 in the two files after each GREEN commit. The full suite gave 504/504 after Task 1 and 521/521 after Tasks 2 and 3.

## Teeth Check (Task 3, run on a clean tree at 03b8791, not committed)

| Mutation | Went red |
|---|---|
| M1 timed rule never returns true | C1 (focus, blur, hidden), C2, C3, C6, C8, C11, both e2e cradle cases (10) |
| M2 `>` becomes `>=` | C3 |
| M3 time written only when finite (else keeps old) | C8 |
| M4 finiteness check dropped | C7 (non-finite timeStamp) |
| M5 timed rule before the held check | C9 |
| M6 dropStaleShift no longer clears marker and time | R5, I1, I2 |

Each mutation turned exactly its named cases red. After each one the source was restored with `git checkout -- src/input/flipper-input.ts`, and `git status --short src` was empty. The forceClear reset of `lastShiftRepeatAt` has no mutation: the timed rule needs the marker, and the marker is always re-recorded together with a fresh time, so a stale time can never be read.

## main.ts Plumbing (confirmed, not edited)

`main.ts:107-108` constructs `FlipperInput({ windowsShiftHeal: isWindowsPlatform(navigator) })` and calls `input.attach()`. `attach()` registers `onWindowKeyDown`, which is typed `(e: KeyboardEvent)` and passes the native event straight to `handleKeyDown`, so `timeStamp` (a DOMHighResTimeStamp) reaches the timed rule. `tsc --noEmit` passes, so `KeyboardEvent` is still assignable to `KeyEventLike`.

## Files Created/Modified
- `src/input/flipper-input.ts`: timeStamp field, SHIFT_REPEAT_GAP_MS, lastShiftRepeatAt, timed re-press rule, IN-01 reset, header and method docs
- `src/input/flipper-input.test.ts`: nested "G-04-21 cradle" block (C1-C11, I1-I2, 17 cases), SHIFT_REPEAT_GAP_MS import, IN-03 doc
- `src/sandbox/flipper-e2e.test.ts`: nested "G-04-21 cradle" block on a timed rig (2 mirrors)

## Decisions Made
- The ignore branch is now a single heal-on, Shift-code guard that writes the marker and its time together. This behaves the same as the old two-branch marker assignment.
- Followed the plan otherwise.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered
- Full `npm test` runs sometimes hit `Test timed out in 5000ms` on the heavy soak, determinism and G-04-10 tests when many workers run at once (7 timeouts in one run, 1 in the next, none in later runs). There were no assertion failures. `--maxWorkers=6` and later default runs passed 504/504 and then 521/521. This is the known load flake already tracked in the pending todo for explicit timeouts on heavy simulation tests (also recorded in 04-14), and out of scope here.
- `prettier --check` flags pre-existing lines in `flipper-input.ts` (onVisibilityChange) and `flipper-e2e.test.ts` (byX, stepsUntilMoved). These lines are untouched by this plan and out of scope. The new code is prettier-clean.
- The session was interrupted once by an API network error (ENOTFOUND) after the Task 1 GREEN edit was made and before it was committed. The edit was intact on resume. It was re-verified (145/145 in the two files, typecheck and lint clean) and then committed as 208a788.

## Known Stubs

None.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness
- The G-04-21 cradle is closed in code. The real-keyboard check is still needed (Task 3 human-check, harvested at end-of-phase UAT): (a) cradle across a focus steal with Right Shift re-pressed after about 1 s, (b) the mirror, (c) a fast re-press rises about 0.5 s late, (d) the 04-14 and UAT 19 regressions. Known residuals that do not count as failures: a re-press faster than about 0.45 s that is released again is missed; a second Shift pressed within about 0.5 s of focus regain rises only after the repeat delay; a released first Shift's bat stays up while the other Shift is held.
- Phase 4 needs re-verification after this gap closure.

## Self-Check: PASSED
- FOUND: src/input/flipper-input.ts, src/input/flipper-input.test.ts, src/sandbox/flipper-e2e.test.ts
- FOUND commits: 3b4f351, 208a788, 183931f, 03b8791, 7042576 (all ancestors of HEAD)

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-21*
