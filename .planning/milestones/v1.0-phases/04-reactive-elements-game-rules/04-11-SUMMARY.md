---
phase: 04-reactive-elements-game-rules
plan: 11
subsystem: input
tags: [keyboard, flipper-input, sticky-keys, focus, shiftKey, vitest, planck]

# Dependency graph
requires:
  - phase: 02-flipper-feel
    provides: FlipperInput held set with per-side OR edges and blur/visibility clear (D-09/D-10)
  - phase: 04-reactive-elements-game-rules
    provides: flipperGate re-press of held sides on every serve (Pitfall 5)
provides:
  - FlipperInput.handleFocus() plus a window focus listener in attach()/detach()
  - stale-Shift reconciliation on any non-Shift key event with shiftKey === false
  - edges emitted from each event's net per-side transition (commitTransitions)
  - KeyEventLike.shiftKey?: boolean (optional, absent = unknown state)
affects: [05-renderer, flipper-input, game-session, uat-04-test-11]

# Actuals (#2632)
actuals:
  tokens: 5542
  tasks: 2
  commits: 4
plan_head_before: 0bc2ee1e8fd7ba0f351705294f977083b911e952
plan_head_after: 8ac8792b3160352c94428e2e6c149722bf92eaa8

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Net-transition edge latching: snapshot both sides' held state, mutate the held set, then latch press/release from before/after (never separate drop and add edges)"
    - "Self-healing input state: OS modifier state (shiftKey strictly false) reconciles stale modifier codes; window focus regain force-clears"

key-files:
  created: []
  modified:
    - src/input/flipper-input.ts
    - src/input/flipper-input.test.ts
    - src/sandbox/flipper-e2e.test.ts
    - src/sandbox/game-e2e.test.ts
    - src/sandbox/main.ts

key-decisions:
  - "04-11: FlipperInput clears its held set on window focus regain (handleFocus, window focus listener); pageshow not wired (bfcache goes hidden first, visibilitychange already clears)"
  - "04-11: a non-Shift key event with shiftKey strictly false drops a held ShiftLeft/ShiftRight; Shift-key events and events without shiftKey never reconcile (D-09 both-Shift cradle safe)"
  - "04-11: FlipperInput edges come from each event's net per-side transition, so Z over a stale ShiftLeft latches nothing and its keyup releases the bat"
  - "04-11: Sticky-Keys-ON residual accepted (T-04-29); whether Shift stays a default flipper binding is left to the user, bindings unchanged"

patterns-established:
  - "Net-transition latch: handlers snapshot isSideHeld for both sides, mutate held, then call commitTransitions(leftBefore, rightBefore)"

requirements-completed: [FLIP-01, GAME-02]

coverage:
  - id: D1
    description: "A keydown whose keyup never arrives is released by a window focus regain: bat falls within 2 steps, settles at rest, and the same key raises it again (ShiftLeft, ShiftRight, KeyZ, Slash)"
    requirement: "FLIP-01"
    verification:
      - kind: integration
        ref: "src/sandbox/flipper-e2e.test.ts#a lost keyup never strands a bat (G-04-11) > <code>: a keydown whose keyup never arrives is released by a window focus regain"
        status: pass
      - kind: unit
        ref: "src/input/flipper-input.test.ts#focus regain (G-04-11)"
        status: pass
    human_judgment: false
  - id: D2
    description: "attach()/detach() register and remove a window focus listener (same function reference) that routes to the force-clear"
    requirement: "FLIP-01"
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#focus regain (G-04-11) > attach() registers a window focus listener that clears the held set; detach() removes the same function"
        status: pass
    human_judgment: false
  - id: D3
    description: "With a stale ShiftLeft/ShiftRight, Z/ArrowLeft and Slash/ArrowRight release the bat on keyup with no drop while held; unbound keys, cross-side and repeat events with Shift up also heal"
    requirement: "FLIP-01"
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#stale Shift reconciliation (G-04-11) > B1-B4"
        status: pass
      - kind: integration
        ref: "src/sandbox/flipper-e2e.test.ts#a lost keyup never strands a bat (G-04-11) > <code> releases a <side> bat pinned by a stale <Shift>"
        status: pass
    human_judgment: false
  - id: D4
    description: "A held Shift is never dropped: both-Shift cradle survives a nudge key; releasing one Shift leaves the other bat up; events without shiftKey never reconcile"
    requirement: "FLIP-01"
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#stale Shift reconciliation (G-04-11) > B5-B7"
        status: pass
      - kind: integration
        ref: "src/sandbox/flipper-e2e.test.ts#the both-Shift cradle survives a nudge key, and releasing one Shift leaves the other bat up"
        status: pass
    human_judgment: false
  - id: D5
    description: "A stale ShiftLeft is dropped by the launch key (Space, shiftKey false) and the flipper gate does not re-raise the left bat on ball 2"
    requirement: "GAME-02"
    verification:
      - kind: integration
        ref: "src/sandbox/game-e2e.test.ts#G-04-11: a stale Shift is not re-raised on the next serve"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real Windows Sticky Keys prompt (UAT test 11 re-test): every binding works after the prompt closes and no bat stays raised once the window has focus"
    requirement: "FLIP-01"
    verification: []
    human_judgment: true
    rationale: "The real Sticky Keys dialog cannot be opened by synthetic events; the OS interaction needs a Windows keyboard (Task 2 human-check)."

# Metrics
duration: 7min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 11: Lost-keyup self-heal for FlipperInput Summary

**FlipperInput now heals a held set the OS left stale: a window focus regain force-clears it, and any non-Shift key event reporting shiftKey false drops a stuck ShiftLeft/ShiftRight, with edges latched from each event's net per-side transition so the bat never drops under the player's finger (G-04-11).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-20T22:26:08Z
- **Completed:** 2026-11-20T22:33:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- A keydown whose keyup an OS dialog took is released when the window regains focus: the bat starts falling within 2 fixed steps, settles at rest, and the same key raises it again. Before this, the bat stayed up and the re-press was de-duped.
- With a stale Shift, the side's other bindings work again. Z/ArrowLeft (and Slash/ArrowRight on the right) hold the bat with no drop while down and release it on keyup. Space, Enter, cross-side keys and auto-repeat events with Shift up also clear the stale Shift.
- The serve no longer re-raises a stale bat. A stale ShiftLeft is dropped by the launch key, and on ball 2 `isHeld("left")` is false and the bat stays down.
- A held Shift is never dropped. The both-Shift cradle (D-09) survives a nudge key, and releasing one Shift leaves the other bat up.

## Task Commits

1. **Task 1: Focus regain releases a lost keydown (tracer)**: `c3eba93` (test, RED), `bb4a427` (feat, GREEN)
2. **Task 2: Stale-Shift reconciliation (TDD)**: `9e146d1` (test, RED), `8ac8792` (feat, GREEN)

No REFACTOR commit; the GREEN code needed no cleanup.

## Files Created/Modified

- `src/input/flipper-input.ts`: `handleFocus()`, the `onWindowFocus` listener in attach/detach, `KeyEventLike.shiftKey?`, `dropStaleShift`, `commitTransitions` (net-transition latch); `forceClear` and both key handlers now go through it. Header and docs updated.
- `src/input/flipper-input.test.ts`: "focus regain (G-04-11)" (3 cases, including `vi.stubGlobal` attach/detach wiring) and "stale Shift reconciliation (G-04-11)" (B1-B7, 11 cases).
- `src/sandbox/flipper-e2e.test.ts`: G-04-11 block with 4 focus-regain cases, 4 stale-Shift release cases and the cradle case.
- `src/sandbox/game-e2e.test.ts`: G-04-11 serve case (a stale ShiftLeft dropped by Space and not re-raised on ball 2).
- `src/sandbox/main.ts`: comments only (the focus listener, and the gate's `isHeld` now healing itself).

## TDD Gate Compliance

**Task 1 (tracer, RED first).** These failed at HEAD 0bc2ee1. Each e2e case got past both `held-up` assertions, which confirms the S2 stale state, and then hit `handleFocus is not a function`. The unit wiring case failed on `focusCall` being undefined.
- flipper-e2e: `ShiftLeft` / `ShiftRight` / `KeyZ` / `Slash`: "a keydown whose keyup never arrives is released by a window focus regain"
- flipper-input: "handleFocus() force-clears like blur...", "handleFocus() with nothing held emits no edges", "attach() registers a window focus listener..."

**Task 2 RED.** The tap-flat report was classified `RED_EVIDENCE_OK` (`target_test_failed`): 82 tests, 69 pass, 13 fail. Target: B1 KeyZ over a stale ShiftLeft.
- **Failed at HEAD (expected):** B1 ×4 (KeyZ, ArrowLeft, Slash, ArrowRight), B2 ×2 (Space, Enter), B3, B4; e2e KeyZ / ArrowLeft / Slash / ArrowRight "releases a … bat pinned by a stale …"; the game case "a stale ShiftLeft is dropped by the launch key…".
- **Passed at HEAD (over-healing guards, expected):** B5, B6, B7, and the e2e "both-Shift cradle survives a nudge key…".
- **Semantic assessment:** every failure was on its planned assertion. B1 failed with `leftRelease` false on the KeyZ keyup. The e2e cases failed with `stepsUntilMoved` returning -1 (the bat never moved after the keyup). The game case failed with `dropped` false within 2 steps. There were no load, syntax or fixture faults.

**GREEN.** `bb4a427` and `8ac8792` pass all targeted files. Commit order test → feat holds for both tasks.

## Decisions Made

- Shift-key events are excluded from reconciliation. How platforms report the remaining Shift on one Shift's keyup varies, so including them could drop the D-09 cradle. A stale Shift still heals on the next non-Shift key event or on focus regain.
- `pageshow` is not wired. A page entering the bfcache goes hidden first, and visibilitychange already clears.
- Edges are latched from the net transition (snapshot, mutate, commit), not from separate drop and add calls. main.ts applies a side's press before its release within one drain window, so separate edges would drop the bat under the finger.

## Deviations from Plan

None. The plan was executed exactly as written.

## Issues Encountered

- `npx prettier --check` flags `flipper-input.ts`, `flipper-e2e.test.ts`, `game-e2e.test.ts` and `main.ts`. The baseline `flipper-input.ts` at 0bc2ee1 fails the same check (the working copy uses CRLF line endings), so this predates the plan and was left alone. tsc and eslint are clean.

## Verification

- `npx tsc --noEmit`: 0 errors. `npx eslint src`: 0 problems.
- `npx vitest run`: 33 files, 416 tests, all passing (392 at the 5365b95 baseline, plus 7 from Task 1 and 17 from Task 2; no new files, no pre-existing assertion edited).
- `npm run soak`: all 4 gate files green.
- `git diff --quiet 5365b95 -- src/physics src/control index.html` exits 0. main.ts has 0 changed non-comment lines. CODE_TO_SIDE still holds exactly the six D-09 bindings. src/input and src/control have no engine import.

## User Setup Required

None. No external service configuration is required.

## Known Residual / Notes for the User

- **Sticky Keys ON (T-04-29, accepted).** If the 5x-Shift prompt turns Sticky Keys ON, Windows holds Shift logically down after a Shift tap, reports `shiftKey` true and withholds the keyup until the next non-modifier key. The bat then stays up until another key is pressed, and no browser check can see it. Whether Shift stays a default binding (Phase 2 D-09), and whether the controls hint mentions this, is your decision. Bindings are unchanged.
- **Human check pending (UAT test 11 re-test).** Turn Sticky Keys OFF, run `npm run dev`, and press Enter. Then try all six bindings: quick taps, a long cradle, and the both-Shift cradle. Next, tap Left Shift five times to open the Sticky Keys prompt and click "No". Back in the game, tap Z, Left Arrow and Left Shift. Expected: no bat stays raised once the window has focus, and every binding works.

## Next Phase Readiness

- G-04-11 is closed at the code level. With this plan, all 11 Phase 04 plans have summaries, and the phase is ready for verification and the UAT re-test of test 11.

## Self-Check: PASSED

- FOUND: src/input/flipper-input.ts, src/input/flipper-input.test.ts, src/sandbox/flipper-e2e.test.ts, src/sandbox/game-e2e.test.ts, src/sandbox/main.ts
- FOUND commits: c3eba93, bb4a427, 9e146d1, 8ac8792 (evaluation-scope resolved 4 plan commits on this branch)

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*
