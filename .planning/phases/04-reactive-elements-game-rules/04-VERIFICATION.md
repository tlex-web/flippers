---
phase: 04-reactive-elements-game-rules
verified: 2026-11-21T03:10:00Z
status: human_needed
score: 15/15 must-haves verified
covered_files:
  - ".planning/phases/04-reactive-elements-game-rules/04-01-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-01-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-02-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-02-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-03-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-03-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-04-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-04-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-05-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-05-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-06-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-06-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-07-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-07-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-08-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-08-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-09-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-09-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-10-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-10-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-11-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-11-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-12-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-12-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-13-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-13-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-14-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-14-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-15-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-15-SUMMARY.md"
  - "src/input/flipper-input.test.ts"
  - "src/input/flipper-input.ts"
  - "src/sandbox/flipper-e2e.test.ts"
  - "src/sandbox/main.ts"
covered_digest: "v4:sha256:838954a973c0116602e48e05970a38fa5e5566d89ec801861c05f13b4034d312"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 13/14
  gaps_closed:
    - "G-04-21 cradle: both Shifts held across a force-clear; re-pressing the auto-repeating Shift more than 450 ms after its last ignored repeat now raises its bat (focus, blur, hidden; both mirrors)"
    - "Review IN-01: dropStaleShift clears the repeat marker and its time when it drops both Shifts"
    - "Review IN-02 / IN-03: handleKeyDown doc and anyEdge helper doc fixed"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "Review WR-01 (04-15 review): the quick-tap sweep e2e test has no explicit timeout and takes about 4.2 s of the 5 s default under full-suite load"
    category: other
    reason: "Known flake, tracked in .planning/todos/pending/2026-11-21-give-heavy-simulation-tests-an-explicit-timeout-so-the-suite.md. The suite passed 521/521 on this run. Does not affect the goal."
    evidence_status: "none provided (passes when run alone)"
  - finding: "Review IN-04..IN-09, WR-03, WR-04 carried, plus the 04-15 review's 3 info items"
    category: other
    reason: "Doc and informational findings recorded in 04-REVIEW-DISPOSITION.md"
    evidence_status: "none provided"
human_verification:
  - test: "04-15 Task 3 real-keyboard cradle check. Windows, Sticky Keys OFF, Chrome, npm run dev, press Enter. Hold BOTH Shifts (left bat and right bat up), click another window (not the taskbar) and click back; both bats drop. Keep holding both Shifts about 1 s (the last-pressed Shift auto-repeats and is ignored), release and re-press the Shift that was pressed LAST, then repeat with the other Shift. Also repeat the 04-14 single-Shift check: hold Left Shift across the focus change, then press Right Shift, and the mirror."
    expected: "Re-pressing the last-pressed Shift raises its bat (provided the pause since its last auto-repeat exceeds 450 ms), the bat drops when the last Shift is released, and nothing stays latched. A re-press within 450 ms of its previous auto-repeat may be missed and is then picked up by its own first auto-repeat (documented residual). A second Shift within about 0.5 s of returning focus may be missed (04-14 residual)."
    why_human: "The fix depends on Windows delivering the held Shift's typematic auto-repeat to the page after a focus regain and Chrome stamping it with the real event time. Injected input generates no auto-repeat, and the 450 ms threshold feel is a perceptual call."
  - test: "Carried: UAT 17 re-test of 04-12 on the real keyboard (four both-Shift orders, taps, Y and X) plus the real-OS Sticky Keys and six-binding feel verdict (UAT 16)."
    expected: "Both bats up during both-Shift holds, both drop on the final Shift keyup, single taps flip and drop, nothing rises again on the next serve."
    why_human: "Event sequences were captured with injected scancodes, not typed keys."
  - test: "Carried: UAT 18 decision A visual check of 04-13 (Chrome, German QWERTZ, 1280x684 at 150% scaling)."
    expected: "Left row reads Y <- Left Shift, right row - -> Right Shift, nudge X . up-arrow; the Windows note wraps inside the panel and covers neither table nor plunger meter; Firefox shows the markup labels and the shorter note."
    why_human: "Keyboard Map API layout labels and panel fit need a real browser on the user's layout."
  - test: "Carried: perceptual feel of bumper pop, slingshot kick, nudge weight and tilt (Phase 4 UAT items recorded as automated-pass only)."
    expected: "Elements feel weighty and true to a real table; nudge is a small shove; tilt kills elements and drops flippers."
    why_human: "Game feel is the project core value and cannot be judged by grep or unit tests."
---

# Phase 4: Reactive Elements & Game Rules Verification Report

**Phase Goal:** The table becomes a game: reactive elements bounce and score off the event bus, a 3-ball loop runs to game-over, and nudge/tilt behaves like a real table.
**Verified:** 2026-11-21T03:10:00Z
**Status:** human_needed
**Re-verification:** Yes, after gap-closure plan 04-15 (G-04-21 cradle), at HEAD `21555d4`

The one gap from the previous report is closed in code and proved by the real class under Node, not just the SUMMARY. All earlier must-haves still hold. No gaps remain. The status is `human_needed` only because the fix rests on Windows typematic behaviour and a 450 ms feel threshold that injected input cannot show, plus the carried keyboard and perceptual checks.

## Re-check of the open gap (G-04-21 cradle)

Implementation in `src/input/flipper-input.ts`:
- `KeyEventLike.timeStamp?: number` (line 117) and exported `SHIFT_REPEAT_GAP_MS = 450` (line 213).
- `lastShiftRepeatAt` (251) is written next to `repeatingShift` in the ignore branch (296-303); null when the repeat has no finite timeStamp.
- `isSecondShiftPress(code, timeStamp)` (473-488): after the `held.has(code)` early return, the marker's own code counts as a press when `timeStamp` is finite and more than 450 ms after `lastShiftRepeatAt`. Strict `>` at the boundary.
- `forceClear` (456-457) and `dropStaleShift` (514-515) reset marker and time (IN-01). The old `handleKeyUp` special reset is gone.
- No global clock is read: the comment-filtered grep for `performance.now|Date.now|navigator` over the file is empty.

Probe with the real class (copy run under Node, heal on, scratchpad `probe.mts`), the exact cradle that failed last time:

| Step | Event | Result |
|------|-------|--------|
| 1 | ShiftLeft down, ShiftRight down (repeat-flagged) | leftPress, rightPress, both held |
| 2 | handleFocus() | leftRelease, rightRelease |
| 3 | ShiftRight typematic at +500, +400, +400 ms | no edge, nothing held (steady stream never latches) |
| 4a | ShiftRight repeat-flagged 100 ms after the last repeat | no edge (documented fast re-press residual) |
| 4b | ShiftRight repeat-flagged 500 ms after the last repeat | **rightPress, right held** |
| 5 | ShiftRight keyup | rightRelease, nothing held |
| 6 | ShiftLeft keyup (shiftKey false) | no phantom edge |

Teeth: mutating the timed comparison to `false` turned exactly 10 cases red (C1 focus/blur/hidden, C2, C3, C6, C8, C11 in the unit file and both cradle e2e mirrors), then the source was restored with `git checkout`. `git status --short src` was empty afterwards.

## Goal Achievement

### Observable Truths

Roadmap success criteria (contract), regression-checked at HEAD:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bumpers pop the ball back with added energy and award points | VERIFIED (regression) | `git diff e592cb1 HEAD -- src` outside `src/input`, the e2e test and `main.ts` is empty; `main.ts` diff is a 3-line comment edit. Suite 521/521. UAT 1 pass. |
| 2 | Slingshots kick on contact; lanes and rollovers register and award points | VERIFIED (regression) | `src/game`, `src/physics` byte-identical to e592cb1. UAT 2 pass. |
| 3 | A live running score updates on-screen | VERIFIED (regression) | `src/ui`, `index.html` byte-identical to e592cb1. UAT 13 pass. |
| 4 | 3-ball loop serves next ball on drain, ends after the last drain | VERIFIED (regression) | `game-e2e` and determinism tests untouched and passing. UAT 7, 8 pass. |
| 5 | Nudge applies a small impulse; over-nudging trips TILT that kills elements and drops flippers | VERIFIED (regression) | Untouched, tests green. UAT 3-5 pass. |

Earlier gap-closure truths (04-12, 04-13, 04-14), regression-checked:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | 04-12: second-pressed Shift raises its bat | VERIFIED (regression) | `isSecondShiftPress` still accepts `held.has(other)`; G-04-17 unit and e2e cases pass. |
| 7 | 04-12: four both-Shift orders, both bats rise and drop within 2 steps of the final keyup | VERIFIED (regression) | Keyup branch of `dropStaleShift` intact (`heal && isKeyUp`); e2e matrix passes. |
| 8 | 04-12: held Shift's own auto-repeat never re-triggers; heal off equals e592cb1 | VERIFIED (regression) | R6, R7, B6, C10 pass; held check precedes the timed rule (C9). |
| 9 | 04-12: same-window release plus press never drops a held bat | VERIFIED (regression) | `drainEdges` untouched; W1-W6 pass. |
| 10 | 04-13: layout-correct key caps and Windows note | VERIFIED (regression) | `src/ui`, `index.html` byte-identical; `key-labels.test.ts` passes. |
| 11 | 04-14: one Shift held across a clear, other Shift's repeat-flagged press raises its bat | VERIFIED (regression) | R1-R6 and the 3 e2e `(G-04-21)` cases pass (`repeatingShift === other` branch still at line 478). |
| 12 | 04-14: a Shift keydown with shiftKey false never drops the other held Shift; Shift keyup false still drops both | VERIFIED (regression) | `dropStaleShift(e, isKeyUp)` early-return at the `isShiftCode && !(heal && isKeyUp)` line; K1-K6 and the WR-02 e2e case pass. |
| 13 | 04-14: heal off equals e592cb1; bindings and other layers byte-identical | VERIFIED | See 04-15 item below; same guards. |

04-15 must_haves:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 14 | Both Shifts held across a clear (focus, blur, hidden; both mirrors): re-pressing the auto-repeating Shift after more than 450 ms raises its bat within 2 steps and the final Shift keyup drops it | VERIFIED (behavioral) | Behavior-dependent, so backed by named tests plus my own probe above: unit C1 x3, C2, e2e cradle x2 (all fail under mutation, pass at HEAD). Probe steps 4b-5. |
| 15 | Steady auto-repeat at 400 ms never counts; boundary: exactly 450 ms is not a press, 451 is; untimed or non-finite stamps never count; no global clock; residuals pinned (C5, C6, C11); IN-01 marker/time reset; heal-off unchanged; IN-02/IN-03 docs fixed; typecheck, lint, tests green | VERIFIED | Probe steps 3-4a. C3, C4, C7 x2, C8, C9, C10 x2, I1, I2, R5 exist (19 `G-04-21 cradle` titles counted in the two files) and pass. Removed-`expect(` lines in the test diff vs 2e9116a: 0. Physics, control, ui, game, index.html byte-identical to 2e9116a; `main.ts` not edited by 04-15. Only the six D-09 bindings in `CODE_TO_SIDE` (lines 187-194). Imports in `src/input` and `src/control` are physics types/constants, no engine import. `npm test` 34 files, 521/521. |

**Score:** 15/15 truths verified (0 present, behavior-unverified).

The previous report's gap truth (old #14, G-04-21 gap truth) is now VERIFIED through truths 11 and 14 together: both the one-Shift and both-Shift cases hold across a clear.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/input/flipper-input.ts` | `timeStamp?`, `SHIFT_REPEAT_GAP_MS`, `lastShiftRepeatAt`, timed rule, IN-01 reset, header residual | VERIFIED | Present, substantive, wired from `handleKeyDown`/`handleKeyUp`/`forceClear`/`dropStaleShift` |
| `src/input/flipper-input.test.ts` | C1-C11, I1-I2 | VERIFIED | 17 unit cases added, all green, 10 turn red under the timed-rule mutation |
| `src/sandbox/flipper-e2e.test.ts` | two keyboard-to-Planck cradle mirrors on a timed rig | VERIFIED | Both pass; both fail under mutation |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.ts` | `flipper-input.ts` | `input.attach()` forwards the native `KeyboardEvent` (with `timeStamp`) to `handleKeyDown` | WIRED | `tsc --noEmit` clean, so `KeyboardEvent` is assignable to `KeyEventLike`; `main.ts` not edited |
| `main.ts` | `flipper-input.ts` | `onFixedStep` drains `drainEdges()` which carries the timed press | WIRED | untouched |
| `flipper-e2e.test.ts` | `flipper-input.ts` | `makeRig(true)` plus a timed wrapper stamping events with the fixed-step clock | WIRED | cradle describe uses it |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Real data | Status |
|----------|---------------|--------|-----------|--------|
| `FlipperInput.repeatingShift` / `lastShiftRepeatAt` | `e.code`, `e.timeStamp` | window keydown via `attach()`; real `KeyboardEvent.timeStamp` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `npm test` | 34 files, 521/521, 7.5 s | PASS |
| Typecheck, lint | `npm run typecheck`, `npm run lint` | clean | PASS |
| Build | `npm run build` | built, `dist/assets/index-BNJOUSLX.js` 244 kB | PASS |
| Cradle across a clear, timed re-press | real class run, probe table above | rightPress at 4b, none at 3/4a | PASS |
| Timed rule teeth | `timeStamp - lastShiftRepeatAt > GAP` replaced with `false`, two test files | 10 failed / 135 passed; restored | PASS (tests bite) |

I did not re-run mutations M2-M6; the SUMMARY lists them and the cases they name (C3, C8, C7, C9, R5/I1/I2) exist and pass.

### Probe Execution

No probe scripts exist and none is declared. Not applicable.

### Requirements Coverage

Requirement IDs in PLAN frontmatter across 04-01..04-15: ELEM-01, ELEM-02, ELEM-03, GAME-01, GAME-02, GAME-03, plus FLIP-01 (Phase 2, from 04-09 and 04-11..04-15). All exist in REQUIREMENTS.md. REQUIREMENTS.md maps exactly ELEM-01..03 and GAME-01..03 to Phase 4; none orphaned.

| Requirement | Source plans | Status | Evidence |
|-------------|--------------|--------|----------|
| ELEM-01 | 04-01, 04-03, 04-04 | SATISFIED | Truth 1 |
| ELEM-02 | 04-03, 04-04 | SATISFIED | Truth 2 |
| ELEM-03 | 04-03 | SATISFIED | Truth 2 |
| GAME-01 | 04-01, 04-07, 04-10, 04-13 | SATISFIED | Truths 3, 10 |
| GAME-02 | 04-02, 04-05..04-08, 04-11, 04-12, 04-14, 04-15 | SATISFIED | Truths 4, 12, 14; the serve re-press reads an `isHeld` the cradle can no longer leave dead |
| GAME-03 | 04-02, 04-06..04-09 | SATISFIED | Truth 5 |
| FLIP-01 (Phase 2, Complete) | 04-09, 04-11..04-15 | SATISFIED in code; real-OS confirmation pending | Every binding answers its key including the cradle after a clear; Windows typematic premise needs the human check |

Housekeeping, not a code gap: `.planning/REQUIREMENTS.md` still shows ELEM-01..03, GAME-01 and GAME-03 as unchecked `[ ]` with traceability status `Gaps Found` (lines 34-42, 110-115). The code evidence above satisfies them; the traceability rows should be moved to Complete once the phase is accepted.

### Prohibitions (judgment tier, non-authoritative verifier verdict)

Flagged `unverified-prohibition: human review recommended`. Not silently passed.

| Prohibition | Verdict | Basis |
|-------------|---------|-------|
| Kicks must not inject unbounded energy or trap the ball | SATISFIED (non-authoritative) | `src/game`, `src/physics` untouched since e592cb1 |
| No reuse of commercial table rule names or score tables | SATISFIED (non-authoritative) | no new user-facing strings |
| A nudge must not write the ball position | SATISFIED (non-authoritative) | nudge path untouched |
| A tilt must not cost more than the current ball | SATISFIED (non-authoritative) | tilt logic untouched |
| 04-15: must not raise a flipper from a steady auto-repeat stream | SATISFIED (non-authoritative) | Probe step 3 (400 ms stream) and unit C4/C3 |
| 04-15: must not keep, log, persist or send key timing; no global clock | SATISFIED (non-authoritative) | One number field `lastShiftRepeatAt`, global-clock grep empty |
| 04-15: must not change the six D-09 bindings or heal-off behaviour | SATISFIED (non-authoritative) | `CODE_TO_SIDE` lists exactly the six bindings; C10, R7, K6 pass |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| the three 04-15 source files | - | TBD/FIXME/XXX/TODO/HACK | None found | - |
| `src/sandbox/flipper-e2e.test.ts` | 327-365 | Quick-tap sweep with no explicit timeout, 4.2 s of 5 s under load (review WR-01) | Advisory | Known flake, tracked in a pending todo; passes alone and passed here |

### Human Verification Required

Four items, listed in the frontmatter: the new 04-15 Task 3 real-keyboard cradle check, the carried UAT 17 and UAT 18 checks, and the carried perceptual feel judgement of the reactive elements and nudge/tilt. The first matters because the fix relies on Windows delivering auto-repeat after a focus regain and Chrome stamping real times, which injected input cannot show.

### Gaps Summary

No gaps. The G-04-21 cradle case is closed by the timed re-press (option A, 450 ms), verified behaviorally by a probe of the real class, by 19 named cases that bite under mutation, and by a green suite (521/521), typecheck, lint and build. Two residuals are intentional, documented in the module header and pinned by tests: a re-press within 450 ms of the Shift's previous auto-repeat is missed (and picked up on its own first auto-repeat), and a second Shift before the held Shift's first auto-repeat is missed.

---

_Verified: 2026-11-21T03:10:00Z_
_Verifier: Claude (gsd-verifier)_
