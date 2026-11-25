---
phase: 04-reactive-elements-game-rules
plan: 12
subsystem: input
tags: [keyboard, windows, shift, vk_shift, flipper-input, drain-ordering, vitest, planck]

requires:
  - phase: 04-reactive-elements-game-rules
    provides: "04-11 FlipperInput stale-Shift reconciliation, focus-regain clear, net per-event transitions (B1-B7)"
provides:
  - "FlipperInputOptions.windowsShiftHeal (default off) and exported isWindowsPlatform(nav)"
  - "Windows second-Shift press recovery: a repeat keydown for a Shift code that is not held while the other Shift is held counts as a press"
  - "Windows final-keyup heal: a ShiftLeft/ShiftRight keyup with shiftKey false drops both Shift codes when the heal is on"
  - "drainEdges supersedes a same-window release for a side held at drain time (WR-01)"
  - "main.ts constructs FlipperInput with windowsShiftHeal from isWindowsPlatform(navigator)"
affects: [04-13, 05-renderer, uat-17]

actuals:
  tokens: 7555
  tasks: 3
  commits: 4
plan_head_before: 1e719790cfbe034fa09d2bfefd58503dccb619a8
plan_head_after: fe28b0f1cdfd29e9249234ca959a89e8308f0b1f

tech-stack:
  added: []
  patterns:
    - "Platform gate injected as a constructor option from main.ts; the input module never reads a global (Node >= 21 exposes navigator)"
    - "Drain-time held state resolves same-window edge order (mirrors PlungerController.applyEdges IN-02)"

key-files:
  created: []
  modified:
    - src/input/flipper-input.ts
    - src/input/flipper-input.test.ts
    - src/sandbox/flipper-e2e.test.ts
    - src/sandbox/main.ts

key-decisions:
  - "04-12: both Windows Shift heals (second-press recovery and final-keyup drop-both) share one option, windowsShiftHeal, default off; main.ts sets it from isWindowsPlatform(navigator); off is byte-for-byte the f481932 behavior, B6 included"
  - "04-12: isWindowsPlatform prefers a non-empty userAgentData.platform and falls back to navigator.platform; matches a case-insensitive 'win' prefix"
  - "04-12: WR-01 fixed inside drainEdges (release dropped when the side is pressed and held at drain time), not with a consumer applyEdges; main.ts and all three test mirrors are fixed with no drain-code change"
  - "04-12: residual accepted and pinned: on Windows a bat whose Shift is released while the other Shift is held stays up until the other Shift is released (no browser event exists)"

patterns-established:
  - "Captured-sequence regression matrix: live OS event traces replayed as unit and keyboard-to-Planck cases, with a teeth check per mechanism"

requirements-completed: [FLIP-01, GAME-02]

coverage:
  - id: D1
    description: "On a Windows-flagged input, all four both-Shift orders (A, B, D, D') plus E (2.6 s gap) and F (re-tap repeat) raise both bats and drop both on the final Shift keyup, ending at rest with nothing held"
    requirement: FLIP-01
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#Windows both-Shift merge (G-04-17) A1, B, D, D', F"
        status: pass
      - kind: integration
        ref: "src/sandbox/flipper-e2e.test.ts#Windows both-Shift hold (G-04-17) order A, B, D, D', E, F"
        status: pass
    human_judgment: false
  - id: D2
    description: "With windowsShiftHeal off (default and every non-Windows platform) FlipperInput behaves exactly as at f481932; single taps, own auto-repeat and lone repeats are unchanged"
    requirement: FLIP-01
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#non-Windows guard (both constructions), B6, C, own auto-repeat, lone repeat, non-Shift repeat"
        status: pass
    human_judgment: false
  - id: D3
    description: "isWindowsPlatform detects Win32 / Windows and falls back correctly; main.ts passes it into FlipperInput"
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#isWindowsPlatform (8 cases)"
        status: pass
      - kind: other
        ref: "grep -c 'isWindowsPlatform(navigator)' src/sandbox/main.ts == 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "WR-01: a release and a same-side press in one drain window never drop a bat held at drain time; a tap inside one window still flips and drops"
    requirement: GAME-02
    verification:
      - kind: unit
        ref: "src/input/flipper-input.test.ts#same-window release and press (WR-01) W1-W6"
        status: pass
      - kind: integration
        ref: "src/sandbox/flipper-e2e.test.ts#same-window release and press (WR-01) (3 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Physical-keyboard UAT 17 re-test on the user's Windows machine (all four both-Shift orders, single taps, Shift + Z + X)"
    verification: []
    human_judgment: true
    rationale: "The live capture used SendInput scancodes, not typed keys; whether physical keys produce the identical sequence needs a real keyboard on the user's Windows machine (Task 3 human-check)."

duration: 8min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 12: Windows both-Shift heal and WR-01 drain ordering Summary

**FlipperInput now recovers the repeat-flagged second Shift press and drops both Shift codes on the final Shift keyup (Windows only, via windowsShiftHeal from isWindowsPlatform(navigator)). drainEdges also supersedes a same-window release for a side held at drain time (WR-01).**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-20T23:40:45Z
- **Completed:** 2026-11-20T23:48:55Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- G-04-17 input half closed: on Windows, holding both Shifts raises both bats in every order, and the final Shift keyup drops both. isHeld reads false on both sides afterwards, so the flipper gate cannot re-press a healed Shift on the next serve.
- Non-Windows path is unchanged: with the heal off, B6 and every pre-existing case pass with no expect line edited.
- WR-01 closed in drainEdges: a release latched in the same window as a press is dropped when the side is held at drain time. This fixes main.ts and the flipper-e2e / game-e2e / game.determinism mirrors without changing their drain code.
- The VK_SHIFT residual is written into the module header and pinned by the 30-step no-event window in every e2e order case.

## Task Commits

1. **Task 1: Tracer, order A end to end with the heal on from main.ts** - `54bd322` (feat)
2. **Task 2: Captured-sequence regression matrix plus header contract** - `10d0780` (test)
3. **Task 3: WR-01 same-window release and press** - `294f0f5` (test, RED) and `fe28b0f` (feat, GREEN)

## Files Created/Modified
- `src/input/flipper-input.ts`: FlipperInputOptions, PlatformLike, isWindowsPlatform, the constructor, isSecondShiftPress, Windows-gated dropStaleShift, held-aware drainEdges, and the rewritten header, InputEdges and commitTransitions docs
- `src/input/flipper-input.test.ts`: G-04-17 block (A1, B, D, D', F, C, own auto-repeat, lone repeat, non-Shift repeat, shiftKey-true release, non-Windows guard x2 constructions, 8 isWindowsPlatform cases) and WR-01 block (W1-W6)
- `src/sandbox/flipper-e2e.test.ts`: makeRig(windowsShiftHeal = false), stepsUntilEachMoved, the G-04-17 runOrder matrix (A, B, D, D', E, F, single tap, shiftKey-true cradle) and the WR-01 e2e block
- `src/sandbox/main.ts`: import isWindowsPlatform, `new FlipperInput({ windowsShiftHeal: isWindowsPlatform(navigator) })`, plus one comment sentence each for G-04-17 and WR-01

## RED / Teeth Evidence

**Task 1 RED (at f481932 code, tests added first):** 10 failures.
- `A1: captured order A (LD RD LU RU) ...` failed on `rightPress` (expected false to be true): the repeat-flagged second Shift was dropped.
- All 8 `isWindowsPlatform` cases failed with `TypeError: isWindowsPlatform is not a function` (export missing).
- e2e `order A (LD RD LU RU): both bats rise, and both drop on the final ShiftRight keyup` failed with `expected 'resting' to be 'held-up'` (the right bat never rose).
After GREEN all pass. The fast suite went from 416 to 426 tests, still 33 files.

**Tracer gate:** interactive run, end-of-phase mode, automated-only `<verify>`. Verify was re-run green before expansion.

**Task 2 teeth check (not committed; source restored, suite green):**
- Mutation 1 (`isSecondShiftPress` always returns false): 13 cases failed. Every e2e order case (A, B, D, D', E, F) and the shiftKey-true cradle failed with `expected 'resting' to be 'held-up'` at the "both held-up" check. Unit A1, B, D, D', F and the shiftKey-true release case also failed.
- Mutation 2 (the unconditional Shift-code early return restored in dropStaleShift): 11 cases failed. Every e2e order case (A, B, D, D', E, F) failed on the end state with `expected -1 to be greater than or equal to 1`: the bat whose Shift the final keyup does not name never starts falling. Unit A1, B, D, D', F also failed.
- After restoring, all 97 tests in the two files passed.

**Task 3 RED (at the Task 2 head, 10d0780):**
- Failed: W1, W2, W3, W6, e2e `a stale ShiftLeft healed by KeyX plus a KeyZ press in one window never drops the held left bat`, e2e `the Windows final-keyup heal plus a KeyZ press in one window drops the right bat and keeps the left up`.
- Passed (the not-held order guards): W4, W5, e2e `a KeyZ tap inside one window flips and drops the left bat back to rest`.
- Classifier: `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` (TAP, target W1, exit 1, 4 failing tests: W1, W2, W3, W6).
- Semantic assessment: W1 executed and failed on its planned assertion `expect(edges.leftRelease).toBe(false)`. At the Task 2 head, drainEdges reported both edges for a side held at drain time. There was no load, syntax or fixture fault.
- GREEN: all pass. A REFACTOR commit was not needed.

## Verification

- `npx tsc --noEmit`: 0 errors. `npx eslint src`: clean.
- `npx vitest run`: 455 tests in 33 files, all passing (416 at f481932 plus 39 new cases, no new files).
- `npm run soak`: 4 gate files green, no `ESCAPE[` lines.
- `git diff --quiet f481932 -- src/physics src/control index.html src/sandbox/game-e2e.test.ts src/sandbox/game.determinism.test.ts`: exit 0.
- The main.ts code diff is only the FlipperInput import and construction (guard prints 0). No pre-existing `expect(` line was removed or edited (guard prints 0).
- CODE_TO_SIDE still holds exactly the six D-09 bindings. src/input and src/control have no engine import.

## Decisions Made
- The two heals share one gate, `windowsShiftHeal`. A repeat-flagged second Shift only happens because of Windows' merged VK_SHIFT, so with the gate off the module matches f481932 exactly.
- WR-01 is fixed in drainEdges rather than with a consumer applyEdges. Every reachable edge combination ends in the same state, and src/control and the consumers stay untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Doc accuracy] Updated the dropStaleShift doc comment in Task 2**
- **Found during:** Task 2 (header rewrite)
- **Issue:** After Task 1, the private dropStaleShift doc still said the Shift keys' own events never reconcile. With the heal on, that is no longer true.
- **Fix:** A comment-only rewrite stating that Shift-key events reconcile only with windowsShiftHeal on.
- **Files modified:** src/input/flipper-input.ts
- **Verification:** The diff against 54bd322 has no non-comment lines. The suite is green.
- **Committed in:** 10d0780

---

**Total deviations:** 1 auto-fixed (1 doc accuracy, comment only)
**Impact on plan:** None on behavior. It keeps the module contract truthful.

## Issues Encountered
None.

## User Setup Required
None. No external service configuration required.

## Next Phase Readiness
- Plan 04-13 (UAT 18 controls-list hint) is unblocked.
- Pending human check (Task 3 `<human-check>`, harvested at end of phase): re-run UAT 17 on the real Windows keyboard with Sticky Keys OFF. Test all four both-Shift orders, single Shift taps, and Left Shift held while tapping Z (labelled Y on QWERTZ) and X. Expected: both bats rise while both Shifts are held and both drop on the second Shift release. Known residual: the first-released bat stays up until the other Shift is released.

## Self-Check: PASSED
- FOUND: src/input/flipper-input.ts, src/input/flipper-input.test.ts, src/sandbox/flipper-e2e.test.ts, src/sandbox/main.ts
- FOUND commits: 54bd322, 10d0780, 294f0f5, fe28b0f

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*
