---
phase: 04-reactive-elements-game-rules
verified: 2026-11-21T02:45:00Z
status: gaps_found
score: 13/14 must-haves verified
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
  - "src/input/flipper-input.test.ts"
  - "src/input/flipper-input.ts"
  - "src/sandbox/flipper-e2e.test.ts"
  - "src/sandbox/main.ts"
covered_digest: "v4:sha256:f501bdd964240a65fa23f91b60611d1ec320c94ee496825d53b48246953ae7c5"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 10/10
  gaps_closed:
    - "G-04-21 WR-01 for ONE Shift held across a force-clear: the other Shift's repeat-flagged press raises its bat once the held Shift has auto-repeated (focus, blur, hidden; both mirrors)"
    - "G-04-21 WR-02: a Shift keydown reporting shiftKey false no longer drops the other held Shift; Shift keyups and non-Shift events reconcile as before"
    - "G-04-21 IN-01: main.ts flipperGate comment names the Windows Shift-keyup heal (comment-only diff)"
  gaps_remaining:
    - "G-04-21 truth, cradle case: BOTH Shifts held across a force-clear; re-pressing the Shift that auto-repeats is still dropped and neither bat can rise until every Shift is released"
  regressions: []
gaps:
  - truth: "On Windows, a Shift pressed while the other Shift is held raises its bat even after a focus change, blur or hidden tab cleared the held set (G-04-21 / WR-01)"
    status: partial
    reason: "Holds when ONE Shift is held across the clear (R1/R2 and the e2e mirrors pass). Fails when BOTH Shifts (the D-09 cradle) are held across the clear: the marker names the last-pressed Shift (the only one Windows typematic repeats), and a re-press of that same Shift arrives repeat-flagged, so isSecondShiftPress rejects it. Neither bat rises until every Shift is released, which is the original G-04-21 symptom. Plan 04-14 line 90 (UAT 21 decision A) accepts exactly one residual, a second press before the first OS auto-repeat; this one is permanent after an auto-repeat, is not documented in the header, and no test covers it. Confirmed by running the real class (see Behavioral Spot-Checks)."
    artifacts:
      - path: "src/input/flipper-input.ts"
        issue: "Lines 239-248 and 407-413: a repeat-flagged keydown of the code equal to repeatingShift is always treated as its own auto-repeat; no timing signal separates it from a fresh press"
      - path: "src/input/flipper-input.test.ts"
        issue: "No case holds both Shifts across a clear (R1-R7 all hold one Shift)"
    missing:
      - "Either (A) tell a fresh press from typematic by timing: add optional timeStamp to KeyEventLike, record the time of the last ignored Shift repeat, and accept a repeat-flagged keydown of the repeating code after a gap longer than the slowest typematic interval (about 450 ms); document that a faster re-press is still missed; add a cradle-across-clear unit and e2e case"
      - "Or (B) record an explicit user decision to accept it as a second residual (override below), extend the header residual paragraph, and pin it with a test like R3 (cradle, clear, ShiftRight repeat, ShiftRight repeat, no edge)"
advisory:
  - finding: "Review IN-01: repeatingShift is not reset when dropStaleShift drops both Shifts on a non-Shift event reporting shiftKey false, so a later lone repeat-flagged Shift is accepted as a press (probe-confirmed by the reviewer; reading dropStaleShift lines 390-396 confirms no reset)"
    category: other
    reason: "No realistic Windows event order yields a lone repeat-flagged Shift without an intervening clear. Fix is one line in dropStaleShift."
    evidence_status: "none provided (no failing user-facing test)"
  - finding: "Review IN-02 (handleKeyDown doc line 229-231 still says every event drops a stale Shift), IN-03 (anyEdge test helper doc inverted), plus carried IN-04..IN-09, WR-03, WR-04"
    category: other
    reason: "Doc and informational findings; all recorded open in 04-REVIEW-DISPOSITION.md"
    evidence_status: "none provided"
human_verification:
  - test: "04-14 Task 3 human-check on the real Windows keyboard. Sticky Keys OFF, Chrome, npm run dev, press Enter. (a) Hold Left Shift (left bat up), click another window (not the taskbar), click back; the left bat drops. Keep holding Left Shift about 1 s, then press Right Shift. (b) Mirror with Right Shift then Left Shift. (c) The four both-Shift orders, single Shift taps, Left Shift held while tapping Y and X, then one serve."
    expected: "(a) and (b): the second Shift's bat rises at once and drops once both Shifts are up; the bat of the Shift held across the focus change stays down until re-pressed. (c) unchanged from UAT 19. Known residuals: a second Shift within about 0.5 s of returning focus may be missed; after releasing the first Shift while the other is held, that bat stays up until the second Shift is released. Also try: hold BOTH Shifts, steal focus and return, wait 1 s, release and re-press the Shift that was pressed last; per the gap above this is expected to stay dead until all Shifts are released."
    why_human: "The fix depends on Windows delivering the held Shift's typematic auto-repeat to the page after a focus regain. Injected input (SendInput) generates none."
  - test: "Carried: UAT 17 re-test of 04-12 on the real keyboard (four orders, taps, Y and X) plus the real-OS Sticky Keys and six-binding feel verdict (UAT 16)."
    expected: "Both bats up during both-Shift holds, both drop on the final Shift keyup, single taps flip and drop, nothing rises again on the next serve."
    why_human: "Event sequences were captured with injected scancodes, not typed keys."
  - test: "Carried: UAT 18 decision A visual check of 04-13 (Chrome, German QWERTZ, 1280x684 at 150% scaling)."
    expected: "Left row reads Y <- Left Shift, right row - -> Right Shift, nudge X . up-arrow; the Windows note wraps inside the panel and covers neither table nor plunger meter; Firefox shows the markup labels and the shorter note."
    why_human: "Keyboard Map API layout labels and panel fit need a real browser on the user's layout."
  - test: "Decide the gap above: fix (option A, timing) or accept as a second residual (option B, override)."
    expected: "A recorded user decision."
    why_human: "Product/risk decision. Plan 04-14 decision A says do not ship WR-01 as a residual except the before-first-repeat case; this case is outside that wording."
---

# Phase 4: Reactive Elements & Game Rules Verification Report

**Phase Goal:** The table becomes a game: reactive elements bounce and score off the event bus, a 3-ball loop runs to game-over, and nudge/tilt behaves like a real table.
**Verified:** 2026-11-21T02:45:00Z
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure plan 04-14 (G-04-21), at HEAD `f8d2705`

All five roadmap success criteria still hold and every 04-14 deliverable exists, is wired and is behaviorally tested. One gap remains and it is narrow: the G-04-21 truth is only partly achieved, because holding both Shifts across a force-clear still leaves the Shift that auto-repeats unable to raise its bat. I confirmed the code review's finding independently (below) and weighed it against the must-haves and the UAT 21 decision.

## Weighing review WR-01 against 04-14 and G-04-21

- **04-14 must_have 1** is worded for one held Shift ("a Shift held across a force-clear no longer blocks the other Shift"). It is met: R1 (focus, blur, hidden), R2 and both e2e mirrors pass, and my mutation M1 (marker ignored) fails exactly those 6 cases.
- **The G-04-21 gap truth in 04-UAT.md** is broader: "a Shift pressed while the other Shift is held raises its bat even after a focus change, blur or hidden tab cleared the held set". The cradle (both Shifts down, one pressed last) across a clear is a case of that sentence, and it fails.
- **The accepted residual** (04-14 line 90, UAT 21 decision A, header lines 61-64) is only "a second press before the held Shift's first OS auto-repeat". The cradle failure is not that: it happens after the auto-repeat and persists until all Shifts are released, which is the original root-cause symptom ("neither Shift can raise a bat until every Shift is released").
- **Independent confirmation.** I did not rely on the review. Reading the code: after `forceClear`, ShiftRight's typematic repeat reaches the ignore branch (lines 239-245) and sets `repeatingShift = "ShiftRight"`. A re-pressed ShiftRight arrives repeat-flagged; `isSecondShiftPress("ShiftRight")` returns `held.has("ShiftLeft") || repeatingShift === "ShiftLeft"`, both false, so it is dropped. I then ran the real class under Node (copy in the scratchpad, `--experimental-strip-types`):

  | Step | Event | Result |
  |------|-------|--------|
  | 1 | ShiftLeft down, ShiftRight down (repeat-flagged) | leftPress, rightPress, both held |
  | 2 | handleFocus() | leftRelease, rightRelease |
  | 3 | ShiftRight repeat (typematic of the last-pressed key) | no edge |
  | 4 | ShiftRight re-press (repeat-flagged) | **no edge, left and right not held** |
  | 5 | ShiftLeft re-press (repeat-flagged) | leftPress (works, marker names the other code) |

  So re-pressing the Shift that was pressed last is dead; re-pressing the other one works. The player cannot know which. Recovery is releasing all Shifts (the Shift-up keyup resets the marker), pressing the other Shift, or using arrows/Z/Slash, which are unaffected.
- **Severity and verdict.** Narrow: Windows only, needs the cradle held across a clear (a Sticky Keys prompt after rapid Shift presses or a Shift+click focus steal), recoverable, and the physical game still plays with the arrow keys. It does not threaten any roadmap success criterion. But the gap closure claimed to close G-04-21 and the user chose "fix, do not accept as residual", so an unaccepted partial closure is a gap, not an advisory. It is a real defect, not a human-only judgement, so I did not downgrade it to `human_needed`. If the user decides it is acceptable, option B (override) converts it without code changes.

## Goal Achievement

### Observable Truths

Roadmap success criteria (contract), regression-checked at HEAD:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bumpers pop the ball back with added energy and award points | VERIFIED (regression) | `git diff --quiet e592cb1 -- src/physics src/control src/ui index.html` exits 0; 04-14 touched only 4 files (input, input test, e2e test, main.ts). Full suite 502/502. UAT 1 pass. |
| 2 | Slingshots kick on contact; lanes and rollovers register and award points | VERIFIED (regression) | Same; `src/game` untouched by 04-14. UAT 2 pass. |
| 3 | A live running score updates on-screen | VERIFIED (regression) | `src/ui`, `index.html` byte-identical to e592cb1. UAT 13 pass. |
| 4 | 3-ball loop serves next ball on drain, ends after the last drain | VERIFIED (regression) | `game-e2e` and `game.determinism` byte-identical and passing. UAT 7, 8 pass. |
| 5 | Nudge applies a small impulse; over-nudging trips TILT that kills elements and drops flippers | VERIFIED (regression) | Untouched; tests green. UAT 3-5 pass. |

Earlier gap-closure truths (04-12, 04-13), regression-checked:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | 04-12: second-pressed Shift (repeat-flagged, other Shift held) raises its bat | VERIFIED (regression) | `isSecondShiftPress` still accepts `held.has(other)`; the G-04-17 unit and e2e cases pass with no pre-existing `expect(` line removed (guard prints 0). |
| 7 | 04-12: four both-Shift orders, both bats rise, drop within 2 steps of the final keyup, rest, `isHeld` false | VERIFIED (regression) | Keyup branch of `dropStaleShift` (heal on, `isKeyUp`) intact; e2e matrix passes. Mutation M4' (removing the keyup drop) failed K5 as expected. |
| 8 | 04-12: held Shift's own auto-repeat never re-triggers; heal off equals e592cb1 | VERIFIED (regression) | R6, R7 (both constructions) and B6 pass. |
| 9 | 04-12: same-window release plus press never drops a held bat | VERIFIED (regression) | `drainEdges` unchanged; W1-W6 and e2e pass. |
| 10 | 04-13: layout-correct key caps and Windows note | VERIFIED (regression) | `src/ui`, `index.html` byte-identical; `key-labels.test.ts` passes. |

04-14 must_haves:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 11 | WR-01, one Shift held across a clear: after its auto-repeat the other Shift's repeat-flagged press raises its bat within 2 steps; the held Shift and the new Shift's own repeats latch nothing; marker resets on every force-clear and on a Shift keyup with shiftKey false | VERIFIED (behavioral) | Code: `repeatingShift` field (197), set in the ignore branch (241-245), read in `isSecondShiftPress` (412), reset in `forceClear` (440) and in `handleKeyUp` (270-273). Behavior-dependent, so backed by named tests: unit R1 x3, R2, R4, R5, R6 and 3 e2e `(G-04-21)` cases (17 unit + 3 e2e `(G-04-21)` titles counted). Mutation M1 (isSecondShiftPress ignores marker): R1 x3, R2 and both focus e2e mirrors fail (6 failures). Source restored by `git checkout`. |
| 12 | WR-02: a Shift keydown reporting shiftKey false never drops the other held Shift; a Shift keyup reporting false still drops both; non-Shift events still reconcile | VERIFIED (behavioral) | `dropStaleShift(e, isKeyUp)` at 390-396 with `isShiftCode && !(heal && isKeyUp)` early return; `handleKeyDown` passes `false` (238), `handleKeyUp` passes `true` (268); no `dropStaleShift(e)` remains. Mutation M4 (isKeyUp ignored): K1, K2, K3, K5 and the WR-02 e2e case fail (5 failures). K4/K6/B1-B4 pass. |
| 13 | Heal off equals e592cb1; no `expect(` line edited; bindings, physics, control, ui, index.html byte-identical; main.ts comment-only; no engine import; suite green | VERIFIED | `git diff e592cb1` removed-`expect(` count 0; `git diff --quiet` on physics/control/ui/index.html/game mirrors exit 0; main.ts non-comment changed lines 0; `CODE_TO_SIDE` grep prints exactly the six D-09 bindings; engine-import count 0; `npm test` 34 files / 502 tests; typecheck and lint clean. Zero allocation: field holds only module constants or null. |
| 14 | G-04-21 gap truth: on Windows, a Shift pressed while the other Shift is held raises its bat even after a focus change, blur or hidden tab cleared the held set | FAILED (partial) | Holds for one Shift held across the clear (truth 11). Fails for both Shifts held across the clear: re-pressing the auto-repeating Shift is dropped (probe above). Not the accepted residual. See gap. |

**Score:** 13/14 truths verified (0 present, behavior-unverified).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/input/flipper-input.ts` | `repeatingShift`, extended `isSecondShiftPress`, `dropStaleShift(e, isKeyUp)`, header residual | VERIFIED with the gap above | Present, substantive, wired from handlers; header names "Shift keydown never reconciles" and "first OS auto-repeat" |
| `src/input/flipper-input.test.ts` | R1-R7, K1-K6 | VERIFIED | 17 `(G-04-21)` cases (plan minimum 17) |
| `src/sandbox/flipper-e2e.test.ts` | keyboard-to-Planck mirrors and WR-02 case | VERIFIED | 3 `(G-04-21)` cases (plan minimum 3) |
| `src/sandbox/main.ts` | IN-01 comment | VERIFIED | comment-only diff (non-comment changed lines 0) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.ts` | `flipper-input.ts` | `flipperGate.setEnabled(true)` re-presses per `input.isHeld()` | WIRED | A Shift keydown with shiftKey false can no longer remove a held Shift from that set (K1, WR-02 e2e) |
| `main.ts` | `flipper-input.ts` | `onFixedStep` drains `drainEdges()` | WIRED | untouched |
| `flipper-e2e.test.ts` | `flipper-input.ts` | `makeRig(true)` heal-on FlipperInput drives real Planck bats | WIRED | G-04-21 describe uses it |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Real data | Status |
|----------|---------------|--------|-----------|--------|
| `FlipperInput.held` / `repeatingShift` / edges | key events from `attach()` | window keydown/keyup/blur/focus/visibilitychange | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full fast suite | `npm test` | 34 files, 502/502 | PASS |
| Typecheck, lint | `npm run typecheck`, `npm run lint` | clean | PASS |
| G-04-21 case counts | vitest verbose grep `(G-04-21) >` | 17 unit, 3 e2e | PASS |
| M1 teeth | sed-disabled `repeatingShift` read, two test files | 6 failed (R1 x3, R2, 2 focus e2e) | PASS (tests bite); restored |
| M4 teeth | sed-disabled `isKeyUp` gate | 5 failed (K1, K2, K3, K5, WR-02 e2e) | PASS (tests bite); restored, `git status --short src` empty |
| Cradle across a clear | real class run, steps above | re-press of last-pressed Shift: no edge | FAIL (the gap) |

I did not re-run M2, M3, M5; the SUMMARY records them and the R4/R5/K4 cases exist and pass.

### Probe Execution

No probe scripts exist and none is declared. Not applicable.

### Requirements Coverage

Every requirement ID in PLAN frontmatter across 04-01..04-14 (ELEM-01..03, GAME-01..03, plus FLIP-01 from 04-09/04-11..04-14) exists in REQUIREMENTS.md and is marked Complete. REQUIREMENTS.md maps exactly ELEM-01..03 and GAME-01..03 to Phase 4; none orphaned.

| Requirement | Source plans | Status | Evidence |
|-------------|--------------|--------|----------|
| ELEM-01 | 04-01, 04-03, 04-04 | SATISFIED | Truth 1 |
| ELEM-02 | 04-03, 04-04 | SATISFIED | Truth 2 |
| ELEM-03 | 04-03 | SATISFIED | Truth 2 |
| GAME-01 | 04-01, 04-07, 04-10, 04-13 | SATISFIED | Truths 3, 10 |
| GAME-02 | 04-02, 04-05..04-08, 04-11, 04-12, 04-14 | SATISFIED | Truths 4, 12; the serve re-press reads an isHeld that WR-02 can no longer corrupt |
| GAME-03 | 04-02, 04-06..04-09 | SATISFIED | Truth 5 |
| FLIP-01 (Phase 2, Complete) | 04-09, 04-11..04-14 | PARTIAL | Every binding answers its key, except the cradle-across-clear Shift re-press (truth 14); arrows/Z/Slash are unaffected; real-OS confirmation pending |

### Prohibitions (judgment tier, non-authoritative verifier verdict)

Flagged `unverified-prohibition: human review recommended`, carried forward. 04-14 touches only the input layer and a comment; none of the four is affected (UAT 9 recorded all four as pass).

| Prohibition | Verdict | Basis |
|-------------|---------|-------|
| Kicks must not inject unbounded energy or trap the ball | SATISFIED (non-authoritative) | `src/game`, `src/physics` untouched |
| No reuse of commercial table rule names or score tables | SATISFIED (non-authoritative) | no new user-facing strings |
| A nudge must not write the ball position | SATISFIED (non-authoritative) | nudge path untouched |
| A tilt must not cost more than the current ball | SATISFIED (non-authoritative) | tilt logic untouched |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/input/flipper-input.ts` | 239-248, 407-413 | Repeat-flagged keydown of `repeatingShift` always ignored | Blocker for truth 14 | Cradle across a clear: re-press of last-pressed Shift dead (gap) |
| `src/input/flipper-input.ts` | 390-396 | `repeatingShift` not reset when a non-Shift event drops both Shifts (review IN-01) | Advisory | lone-repeat invariant, no realistic trigger |
| `src/input/flipper-input.ts` | 228-234 | handleKeyDown doc stale (review IN-02) | Info | doc only |
| changed files | - | TBD/FIXME/XXX/TODO/HACK | None found in the four 04-14 files | - |

### Human Verification Required

See the frontmatter list (4 items): the 04-14 real-keyboard focus-steal check (including the cradle case), the carried UAT 17 and UAT 18 checks, and the decision on the gap. They matter even after the gap is resolved, because the 04-14 fix relies on Windows delivering auto-repeat after a focus regain, which injected input cannot show.

### Gaps Summary

One gap (partial): G-04-21 truth for the cradle held across a force-clear. 04-14 delivers what its must_haves literally list and every guard holds, but its marker records a single Shift code, and typematic repeats only the last-pressed key, so the cradle's re-press of that key is indistinguishable from auto-repeat by events alone. Fix needs timing (review option A, optional `timeStamp` on `KeyEventLike`, about 450 ms gap) or an explicit acceptance (option B). A follow-up plan via `/gsd-plan-phase --gaps` should add cradle-across-clear unit and e2e cases that fail now. Review IN-01 (reset the marker inside `dropStaleShift`, removing the keyup special case) can ride along.

**This may be intentional.** To accept the cradle case as a second residual (option B), add to VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "On Windows, a Shift pressed while the other Shift is held raises its bat even after a focus change, blur or hidden tab cleared the held set (G-04-21 / WR-01)"
    reason: "Cradle (both Shifts) held across a force-clear leaves the last-pressed Shift's re-press indistinguishable from typematic by events; Windows-only, recoverable by releasing all Shifts or using arrows"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

Then also extend the header residual paragraph and pin the case with a test so the acceptance is visible in code.

---

_Verified: 2026-11-21T02:45:00Z_
_Verifier: Claude (gsd-verifier)_
