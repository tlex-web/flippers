---
phase: 04-reactive-elements-game-rules
verified: 2026-11-20T23:55:00Z
status: human_needed
score: 8/8 must-haves verified
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
  - "index.html"
  - "src/control/flipper-controller.ts"
  - "src/input/flipper-input.test.ts"
  - "src/input/flipper-input.ts"
  - "src/physics/planck-world.ts"
  - "src/sandbox/flipper-e2e.test.ts"
  - "src/sandbox/game-e2e.test.ts"
  - "src/sandbox/main.ts"
  - "src/ui/hud.ts"
covered_digest: "v4:sha256:5c10cb28b8ce00ddc51e95242a4ccabf52aa5e08ca0f36dc6532b6372dfc1016"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/7
  gaps_closed:
    - "G-04-11: a lost keyup (OS dialog / Sticky Keys prompt) no longer pins a flipper bat; stale Shift is healed by focus regain and by any non-Shift key event reporting Shift up"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "UAT test 11 re-test on a real Windows keyboard. Confirm Sticky Keys is OFF, run `npm run dev`, press Enter. On each of Z, Left Shift, Left Arrow, /, Right Shift, Right Arrow make quick taps of varied length, hold a long cradle then release, and hold both Shifts together for a cradle. Then tap Left Shift five times to open the Sticky Keys prompt, close it with the mouse (No), return to the game and tap Z, Left Arrow, then Left Shift. Also over-nudge to TILT once while holding a bat up."
    expected: "Each bat snaps up on its key and falls on release on all six bindings. The both-Shift cradle holds both bats up. After the prompt closes, no bat stays raised once the window has focus; a tap of Z, Left Arrow or Space releases a raised bat; every binding works afterwards. On TILT the held bat drops at once. Cradle and catch still feel heavy. Known residual, not a failure: if Sticky Keys was turned ON by the prompt, Windows itself holds Shift down after a Shift tap until the next non-Shift key."
    why_human: "The real Windows Sticky Keys dialog and OS key-swallowing cannot be driven by synthetic events. The event orders are machine-proven (unit, keyboard-to-Planck and full-game tests) but the OS interaction and the core-value feel verdict are the user's."
  - test: "Windows both-Shift release (code-review WR-02). Hold ShiftLeft and ShiftRight together (both bats up), release ShiftLeft first, then ShiftRight, then watch both bats."
    expected: "Both bats drop. If the left bat stays raised after both Shifts are up (Windows emits no keyup for the first Shift released while both are held), it is the unhealed WR-02 residual and clears on the next non-Shift key press or a focus regain."
    why_human: "Rests on external Windows keyboard behavior (reported by the reviewer from GLFW's workaround, not reproduced) that no synthetic event reproduces. Decision for the user: accept, or reconcile on Shift-key events too."
  - test: "Shift as a default binding (plan 04-11 flagged design note, T-04-29 accepted). Decide whether Left/Right Shift stay default flipper bindings (Phase 2 D-09) given the OS Sticky Keys shortcut, and whether the controls list should hint at it."
    expected: "A recorded user decision. Bindings are unchanged in the code today."
    why_human: "Product/UX decision, explicitly reserved for the user in the plan; not a code defect."
---

# Phase 4: Reactive Elements & Game Rules Verification Report

**Phase Goal:** The table becomes a game: reactive elements bounce and score off the event bus, a 3-ball loop runs to game-over, and nudge/tilt behaves like a real table.
**Verified:** 2026-11-20T23:55:00Z
**Status:** human_needed
**Re-verification:** Yes, over all 11 plans after gap closure 04-11 (G-04-11); regression-checked against HEAD `7c054fb`

All five roadmap success criteria and all three UAT gaps (G-04-6, G-04-10, G-04-11) hold in the codebase. No gaps remain. The status is `human_needed` because the one thing machines cannot prove for G-04-11, the real Windows Sticky Keys prompt and the by-feel verdict across six bindings (UAT test 11 re-test), still needs a person, plus two flagged review/design items routed to the user. UAT tests 12-15 (real-table pinch, HUD layout, nudge labeling, carried by-feel items) already passed on the human record, so those prior human items are closed.

## Goal Achievement

### Observable Truths

Roadmap success criteria (the contract), regression-checked at HEAD:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bumpers pop the ball back with added energy and award points | VERIFIED (regression check) | `src/game/reactive-elements.ts` and reactive-table tests not touched since the first verification; `git diff 5365b95 --stat -- src` lists only the five 04-11 files. UAT test 1 pass. Orchestrator full suite 416/416. |
| 2 | Slingshots kick on contact; lanes and rollovers register and award points | VERIFIED (regression check) | Same: no `src/game` change; UAT test 2 pass; soak gates green. |
| 3 | A live running score updates on-screen | VERIFIED (regression check) | HUD files unchanged by 04-11; UAT test 13 pass. |
| 4 | 3-ball loop serves next ball on drain and ends after the last drain | VERIFIED | `GameSession` untouched; `game-e2e.test.ts` (now incl. the G-04-11 serve case) and determinism tests pass (my run: 3 files, 82 tests). UAT tests 7 and 8 pass. |
| 5 | Nudge applies a small impulse; over-nudging trips TILT that kills elements and drops flippers | VERIFIED (regression check) | Nudge/tilt logic untouched by 04-11; UAT tests 3, 4, 5 pass. |

Gap-closure truths:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | G-04-10: bat rises/falls within 1-2 steps of press/release after any hold; released bat returns to rest | VERIFIED (regression check) | 04-09 code and tests unchanged: `git diff --quiet 5365b95 -- src/physics src/control index.html` exits 0. |
| 7 | G-04-6: HUD legible, hint unambiguous and unwrapped | VERIFIED | `index.html` byte-identical since 5365b95; UAT test 13 (human) pass. |
| 8 | G-04-11: a lost keyup never leaves a bat hanging raised on any of the six bindings; held Shift never dropped | VERIFIED (behavioral tests pass); real-OS confirmation routed to human | See "G-04-11 evidence" below. Behavior-dependent, so backed by named behavioral tests that pass, not presence alone. |

**Score:** 8/8 truths verified (0 present, behavior-unverified).

#### G-04-11 evidence (04-11), read in code and re-run

- **Focus regain clear.** `flipper-input.ts` has `handleFocus()` -> `forceClear()` (line ~196), a bound `onWindowFocus` handler, and `window.addEventListener("focus", ...)` in `attach()` with the matching `removeEventListener` in `detach()`. Comment-filtered `grep -c 'EventListener("focus"'` returns 2 (plan criterion >= 2).
- **Stale-Shift reconciliation.** `dropStaleShift(e)` is a no-op unless `e.shiftKey === false` strictly AND the event code is neither `ShiftLeft` nor `ShiftRight`; then it deletes both Shift codes. `KeyEventLike.shiftKey?` is optional readonly, so absent means unknown and never reconciles. It is invoked from both `handleKeyDown` (before the repeat and unbound returns, so Space, Enter and auto-repeat events heal) and `handleKeyUp`.
- **Net-transition edges.** `handleKeyDown`, `handleKeyUp` and `forceClear` each snapshot both sides' held state, mutate `held`, then call `commitTransitions`, which latches one press or one release per side per event. Z over a stale ShiftLeft nets to no edge, so the bat does not drop under the finger for a single event.
- **Serve path.** `main.ts` `flipperGate.setEnabled(true)` re-presses `input.isHeld(side)`; because `isHeld` now reads a self-healing set, a stale Shift is not re-raised on the next serve. `main.ts` diff vs 5365b95 is comment lines only (6 lines: 5 added, 1 changed; matches plan criterion of zero non-comment changes per the SUMMARY, and the diff stat is 6 lines).
- **Bindings unchanged.** `CODE_TO_SIDE` grep prints exactly the six D-09 bindings.
- **Scope held.** `git diff --quiet 5365b95 -- src/physics src/control index.html` exits 0. `grep -rlE "from ['\"]planck['\"]" src` returns only `src/physics/planck-world.ts`; `src/input` and `src/control` import no engine. No per-event allocation in `FlipperInput` (booleans plus `Set` add/delete/clear on the long-lived set).
- **Behavioral tests (my run, one pass of the three affected files: 3 files, 82 tests, all pass):**
  - `flipper-e2e.test.ts` "a lost keyup never strands a bat (G-04-11)": ShiftLeft, ShiftRight, KeyZ, Slash lost-keyup cases released by focus regain within 1-2 steps, settle at rest, re-press works; KeyZ, ArrowLeft, Slash, ArrowRight release a bat pinned by a stale Shift with no drop while down; the both-Shift cradle survives a nudge key and releasing one Shift leaves the other bat up.
  - `flipper-input.test.ts` "focus regain (G-04-11)" (3 cases incl. `vi.stubGlobal` attach/detach wiring) and "stale Shift reconciliation (G-04-11)" B1-B7 (11 cases), including the over-healing guards B5-B7 that passed at HEAD~RED.
  - `game-e2e.test.ts` "G-04-11: a stale Shift is not re-raised on the next serve".
- **TDD evidence.** Commit order test -> feat holds for both tasks (`c3eba93` -> `bb4a427`, `9e146d1` -> `8ac8792`); the SUMMARY records the RED set and the guards that passed at HEAD. I did not re-run the RED-at-HEAD state; the passing suite plus the code read is my evidence.

### Plan-level must-haves (04-11), checked against code

| Truth | Status | Evidence |
|-------|--------|----------|
| Lost keydown released by focus regain, falls within 2 steps, settles at rest, re-press works | VERIFIED | e2e cases above pass |
| Stale ShiftLeft: Z/ArrowLeft hold with no drop and release on keyup (mirror on right) | VERIFIED | e2e and B1 pass |
| Any non-Shift event with shiftKey false (incl. Space/Enter) drops stale Shift; serve does not re-raise | VERIFIED | B2, B4, game-e2e G-04-11 case pass |
| Held Shift never dropped (shiftKey true, absent, or Shift's own events) | VERIFIED | B5, B6, B7, cradle e2e pass |
| Bindings/physics unchanged; no engine import; no per-event allocation | VERIFIED | greps and diff above |
| Existing gates green | VERIFIED | Orchestrator: 416/416 (two consecutive runs; one earlier run hit 5000 ms timeouts on 4 CPU-heavy tests under machine load, no assertion failures), `npm run soak` 4/4, build, tsc, eslint clean. I re-ran tsc (exit 0) and the three affected test files (82/82). |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/input/flipper-input.ts` | `handleFocus`, focus listener in attach/detach, `dropStaleShift`, `commitTransitions` | VERIFIED | Substantive and wired: instantiated and `attach()`ed in `main.ts`, edges drained in `onFixedStep`, `isHeld` read by the flipper gate |
| `src/input/flipper-input.test.ts` | G-04-11 unit cases | VERIFIED | Present, passes |
| `src/sandbox/flipper-e2e.test.ts` | keyboard-to-Planck G-04-11 block | VERIFIED | Present, passes |
| `src/sandbox/game-e2e.test.ts` | serve case | VERIFIED | Present, passes |
| `src/sandbox/main.ts` | comments only | VERIFIED | Diff is comment-only |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `flipper-input.ts` | `main.ts` | `input.attach()` registers window focus listener -> `handleFocus` -> `forceClear` | WIRED | `main.ts` calls `input.attach()`; listener present in `attach()`; unit test asserts the registered function routes to the clear |
| `main.ts` | `flipper-input.ts` | `flipperGate.setEnabled(true)` -> `input.isHeld()` | WIRED | `main.ts` flipperGate block; `isHeld` reads the healing set |
| `flipper-input.ts` | `main.ts` | latched edges -> `onFixedStep` -> `FlipperController.onPressEdge/onReleaseEdge` | WIRED | `main.ts` onFixedStep; press applied before release within a drain window (see WR-01) |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Real data | Status |
|----------|---------------|--------|-----------|--------|
| `FlipperInput.held` / edges | `held` Set, `pending` latch | Real window keydown/keyup/blur/focus/visibilitychange events via `attach()` | Yes | FLOWING |
| Flipper bat motion | `controller.onPressEdge/onReleaseEdge` | Drained edges each fixed step | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| G-04-11 unit, keyboard-to-Planck and full-game cases | `npx vitest run src/input/flipper-input.test.ts src/sandbox/flipper-e2e.test.ts src/sandbox/game-e2e.test.ts` | 3 files, 82 tests pass | PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | PASS |
| Full suite, build, eslint, soak | Orchestrator gate results this run | 416/416 (twice), build clean, eslint clean, soak 4/4 | PASS (orchestrator-reported; not re-run by me) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist and no plan declares one. Not applicable.

### Requirements Coverage

Every ID in the PLAN `requirements` frontmatter across plans 04-01..04-11 (ELEM-01, ELEM-02, ELEM-03, GAME-01, GAME-02, GAME-03, plus FLIP-01 from 04-09 and 04-11) is accounted for in REQUIREMENTS.md, all marked Complete.

| Requirement | Source plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| ELEM-01 | 04-01, 04-03, 04-04 | Bumpers pop with added energy and score | SATISFIED | Truth 1; UAT 1 |
| ELEM-02 | 04-03, 04-04 | Slingshots kick on contact | SATISFIED | Truth 2; UAT 2 |
| ELEM-03 | 04-03 | Lanes and rollovers light and score | SATISFIED | Truth 2 |
| GAME-01 | 04-01, 04-07, 04-10 | Live score HUD | SATISFIED | Truths 3 and 7; UAT 13 |
| GAME-02 | 04-02, 04-05, 04-06, 04-07, 04-08, 04-11 | 3-ball loop to game-over | SATISFIED | Truths 4 and 8 (serve no longer re-raises a stale bat) |
| GAME-03 | 04-02, 04-06, 04-07, 04-08, 04-09 | Nudge, tilt, flippers drop | SATISFIED | Truths 5 and 6; UAT 3-5 |
| FLIP-01 (Phase 2, Complete) | 04-09, 04-11 | Keyboard flippers, sub-frame response | SATISFIED | Truths 6 and 8; real-OS confirmation pending (human item 1) |

No orphaned Phase 4 requirements: REQUIREMENTS.md maps ELEM-01..03 and GAME-01..03 to Phase 4, and each appears in at least one plan.

### Prohibitions (judgment tier, non-authoritative verifier verdict)

Flagged `unverified-prohibition: human review recommended`, carried forward. 04-11 touches only the input layer; none of the four is affected. UAT test 9 recorded all four as pass.

| Prohibition | Verifier verdict | Basis |
|-------------|------------------|-------|
| Kicks must not inject unbounded energy or trap the ball | SATISFIED (non-authoritative) | Reactive soak gate green (orchestrator, 4/4) |
| No reuse of commercial table rule names or score tables | SATISFIED (non-authoritative) | No new user-facing strings in 04-11 |
| A nudge must not write the ball position | SATISFIED (non-authoritative) | Nudge path untouched |
| A tilt must not cost more than the current ball | SATISFIED (non-authoritative) | Tilt logic untouched; game-e2e passes |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/input/flipper-input.ts`, `src/sandbox/main.ts` | - | TBD/FIXME/XXX/TODO/HACK grep | None | No markers found in the files changed by 04-11 |

### Code review findings (04-REVIEW.md, 04-11 delta: 0 critical, 2 warning, 3 info; advisory)

**WR-01: stale-Shift heal plus same-side press in one drain window drops the bat while the key is held. WARNING, not a goal gap.** I confirmed by reading the code: `commitTransitions` nets edges within one event only, and `onFixedStep` (`main.ts`) applies a side's press before its release. With a stale ShiftLeft, a KeyX keydown (heal -> `leftRelease`) and a KeyZ keydown (`leftPress`) between two drains give `leftPress` and `leftRelease` both true with `isHeld("left")` true, so the bat falls while Z is down until Z is pressed again. Why this is not a FAILED must-have: (a) the 04-11 truths are written for single events (Z over a stale Shift) and those hold and are tested; (b) the scenario needs an already-stale Shift plus two same-side-relevant events inside one frame, a corner of a corner; (c) before 04-11 the same state left the bat stuck up indefinitely, so the outcome is no worse than the baseline; (d) the same ordering weakness predates 04-11 for a finger roll between two same-side bindings (`PlungerInput.applyEdges` already orders by held state, the flipper drain does not). The reviewer's suggested fix (order a side's edges by held state at drain time in `onFixedStep`, plus one e2e case and a `commitTransitions` doc correction) is small and sound. It is an open follow-up, not a Phase 4 blocker. Per the disposition ledger it stays advisory.

**WR-02: Windows both-Shift first-release keyup not delivered, so Shift-key events never reconcile. WARNING, routed to human verification.** Reasoning confirmed in code: `dropStaleShift` early-returns for Shift-key events by design (plan flagged assumption, protecting the D-09 cradle on platforms that might report the remaining Shift differently). The claimed Windows behavior is external and unreproduced here, so this is UNCERTAIN, not FAILED; it self-heals on the next non-Shift key or focus regain. See human item 2. The header comment records only the Sticky Keys residual, not this one.

**IN-01** (PlungerInput/GameInput lack the focus-regain clear; same late-keydown race can strand a plunger charge, lower impact, heals on next tap), **IN-02** (the `handleFocus` doc over-states "window focus only follows a blur"), **IN-03** (a `game-e2e` comment overstates which inputs the test feeds). Informational, none blocking.

Earlier findings from the 04-09/04-10 review (WR-03 pinch over-speed, WR-04 sweep timeout under load, IN-06..IN-09) stand as recorded in `04-REVIEW-DISPOSITION.md`. WR-03 was exercised by the user in UAT test 12 and passed; WR-04 matches the transient 5000 ms timeouts the orchestrator saw under machine load (not assertion failures; two consecutive full runs green).

### Human Verification Required

See the `human_verification` list in the frontmatter (3 items): the real Windows Sticky Keys re-test and six-binding flipper feel (UAT test 11), the Windows both-Shift release check (WR-02), and the user's decision on keeping Shift as a default binding. Items from the previous report that UAT has since resolved (real-table pinch, HUD layout, nudge labeling, by-feel regression glance) are closed on the human record and removed.

### Gaps Summary

No gaps. All five roadmap success criteria hold, G-04-6, G-04-10 and G-04-11 are closed in code with behavioral tests I read and re-ran for the affected files, scope constraints (bindings, `src/physics`, `src/control`, `index.html` untouched; engine isolation) hold, and every Phase 4 requirement ID is satisfied. The status is `human_needed`, not `passed`, because the real Windows Sticky Keys prompt cannot be driven by synthetic events and the user still owns the feel verdict and two flagged review/design decisions.

---

_Verified: 2026-11-20T23:55:00Z_
_Verifier: Claude (gsd-verifier)_
