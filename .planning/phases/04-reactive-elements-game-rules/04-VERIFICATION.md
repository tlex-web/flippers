---
phase: 04-reactive-elements-game-rules
verified: 2026-11-21T01:30:00Z
status: human_needed
score: 10/10 must-haves verified
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
  - "index.html"
  - "src/control/flipper-controller.ts"
  - "src/input/flipper-input.test.ts"
  - "src/input/flipper-input.ts"
  - "src/physics/planck-world.ts"
  - "src/sandbox/flipper-e2e.test.ts"
  - "src/sandbox/game-e2e.test.ts"
  - "src/sandbox/main.ts"
  - "src/ui/hud.ts"
  - "src/ui/key-labels.test.ts"
  - "src/ui/key-labels.ts"
covered_digest: "v4:sha256:9f5e43d34c0e3fceb29c8f9ce211828acef3b8a8fa61ef9244f04e6d85086783"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 8/8
  gaps_closed:
    - "G-04-17 input half: on Windows, holding both Shifts raises both bats in all four orders and the final Shift keyup drops both; the serve gate cannot re-press a healed Shift"
    - "G-04-17 hint half: layout-correct key caps and the Windows reliability note under the controls list (UAT 18 decision A)"
    - "Prior review WR-01 (stale-Shift heal plus same-side press in one drain window drops a held bat): fixed in drainEdges"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "New review WR-01: with windowsShiftHeal on, a genuine second-Shift press after any force-clear (blur, focus regain, hidden tab) arrives repeat-flagged while the other Shift is physically down but absent from the held set, so isSecondShiftPress rejects it and neither Shift can raise a bat until every Shift is released"
    category: other
    reason: "Confirmed by reading flipper-input.ts lines 369-374. Outside every 04-12 truth (all pinned sequences have no intervening force-clear), Windows-only, self-clears on release of all Shift keys, and arrow keys and Z / Slash are unaffected. Proposed fix (track the repeating Shift code since the last clear) is small. Open in 04-REVIEW-DISPOSITION.md."
    evidence_status: "none provided (no failing test demonstrating a user-facing goal break)"
  - finding: "New review WR-02: dropStaleShift also runs on Shift keydown, so a ShiftLeft keydown reporting shiftKey:false deletes a held ShiftRight (heal on)"
    category: other
    reason: "Confirmed in code (handleKeyDown line 219 calls dropStaleShift; line 357 exemption is lifted when the heal is on). Requires an anomalous Shift keydown with shiftKey false (injected or remote-desktop events); no captured real sequence does this. Documented contract says keyup only. Open in disposition ledger."
    evidence_status: "none provided"
  - finding: "Review IN-01..IN-04 (stale main.ts comment, layout-only reveal with zero coded caps, Windows note shown on every platform, keyLabel accepts whitespace)"
    category: other
    reason: "Informational; none affects a must-have with today's markup."
    evidence_status: "none provided"
human_verification:
  - test: "UAT test 17 re-test on the real Windows keyboard (04-12 Task 3 human-check). Sticky Keys OFF, `npm run dev`, press Enter. Hold Left Shift, then also press Right Shift: both bats must be up. Release Left Shift first, then Right Shift. Repeat with the other three orders (LD RD RU LU; RD LD LU RU; RD LD RU LU). Then tap each Shift alone a few times, and finally hold Left Shift and tap the key printed Y while also tapping X."
    expected: "In every order both bats rise while both Shifts are held and both drop the moment the second Shift comes up. No bat is left raised after both Shifts are up, and none rises again on the next serve. Single Shift taps flip and drop as before. Known residual, not a failure: after releasing the first Shift while the other is held, that bat stays up until the second Shift is released (Windows sends the page nothing)."
    why_human: "The event sequences were captured with injected scancodes, not typed keys. Whether physical keys produce the identical page-level sequence cannot be driven synthetically. Also the carried real-OS Sticky Keys and six-binding feel verdict (UAT test 16) and the by-feel core-value judgement."
  - test: "UAT 18 decision A visual check (04-13 Task 2 human-check). Chrome, German QWERTZ, 1280x684 window at 150% scaling. Press Enter, read the controls panel, then press the key printed Y and the key printed - . Optionally open in Firefox."
    expected: "Chrome: Left flipper row reads Y <- Left Shift, Right flipper row reads - -> Right Shift, Nudge reads X . up-arrow. Under the list a small note reads 'On Windows, <- -> Y - are the most reliable flipper keys. Shift can stick.' wrapped inside the panel; panel no wider than before and covering neither table nor plunger meter. Y raises the left bat and - raises the right. Firefox: note reads 'On Windows, <- -> are the most reliable flipper keys. Shift can stick.' and the rows keep their markup labels."
    why_human: "Real layout labels come from Chrome's Keyboard Map API against the OS layout, absent in Vitest's node environment. Panel fit at 150% scaling is a visual judgement."
  - test: "Decide disposition of open review findings WR-01 (second-Shift press after a force-clear is dropped on Windows) and WR-02 (Shift keydown reporting shiftKey false drops the other Shift)."
    expected: "A recorded user decision: fix in a follow-up gap plan, or accept as residual."
    why_human: "Product/risk decision. Neither contradicts a written must-have; both are Windows-heal corner cases the plan did not specify."
---

# Phase 4: Reactive Elements & Game Rules Verification Report

**Phase Goal:** The table becomes a game: reactive elements bounce and score off the event bus, a 3-ball loop runs to game-over, and nudge/tilt behaves like a real table.
**Verified:** 2026-11-21T01:30:00Z
**Status:** human_needed
**Re-verification:** Yes, over all 13 plans, at HEAD `6eb5cae` (after gap-closure plans 04-12 and 04-13, UAT gap G-04-17)

All five roadmap success criteria still hold. Both new gap-closure plans are implemented in the code, wired, and covered by behavioral tests that fail when I mutate the mechanism. No gaps remain. The status is `human_needed` because the physical-keyboard UAT 17 re-test, the German-layout panel check and a decision on two open review warnings need the user.

## Goal Achievement

### Observable Truths

Roadmap success criteria (the contract), regression-checked at HEAD:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bumpers pop the ball back with added energy and award points | VERIFIED (regression) | `git diff 5365b95 --stat -- src` lists only input/UI/sandbox-main/test files; `src/game`, `src/physics`, `src/control` byte-identical to `f481932` (`git diff --quiet` exits 0). Reactive tests green in the full run (482/482). UAT 1 pass. |
| 2 | Slingshots kick on contact; lanes and rollovers register and award points | VERIFIED (regression) | Same; `src/game/reactive-elements.ts` untouched; `npm run soak` 4/4 in my run. UAT 2 pass. |
| 3 | A live running score updates on-screen | VERIFIED (regression) | `src/ui/hud.ts` untouched; `index.html` only gained the note and `data-code` attributes (five `<dt>` rows intact). UAT 13 pass. |
| 4 | 3-ball loop serves next ball on drain, ends after the last drain | VERIFIED (regression) | `game-session.ts` untouched; `game-e2e` and `game.determinism` pass unchanged (byte-identical to `f481932`). UAT 7, 8 pass. |
| 5 | Nudge applies a small impulse; over-nudging trips TILT that kills elements and drops flippers | VERIFIED (regression) | Nudge/tilt files untouched; tests green. UAT 3-5 pass. |

Gap-closure truths (04-12 and 04-13 must_haves, read in code and re-run):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | 04-12: second-pressed Shift (repeat-flagged, other Shift held) raises its bat | VERIFIED | `isSecondShiftPress` (flipper-input.ts 369-374) wired into `handleKeyDown` line 220; unit A1/B/D/D'/F and e2e orders A/B/D/D'/E/F pass. My mutation (`isSecondShiftPress` forced false) failed 15 tests across the two files. |
| 7 | 04-12: in all four both-Shift orders both bats rise, both fall within 2 steps of the final Shift keyup and settle at rest; `isHeld` false on both sides | VERIFIED (behavioral) | Behavior-dependent (state transition), so backed by passing named e2e keyboard-to-Planck cases (`order A/B/D/D'/E/F`), each asserting rise, 30-step no-event window, fall within 1-2 steps, rest within 0.02, and `isHeld` false. `dropStaleShift` (355-360) drops both codes on a Shift keyup with `shiftKey === false` when the heal is on. |
| 8 | 04-12: held Shift's own auto-repeat never re-triggers; single tap unchanged; heal off behaves exactly as at `f481932` (B6 intact) | VERIFIED | Unit cases (own auto-repeat, lone repeat, non-Shift repeat, non-Windows guard for both constructions) pass. Guard: `git diff f481932` removed zero pre-existing `expect(` lines in the two test files. |
| 9 | 04-12: WR-01, a same-window release plus same-side press never drops a bat held at drain time; a tap inside one window still delivers both edges | VERIFIED (behavioral) | `drainEdges` (283-292) drops the release only when `pending press AND side held`. W1-W6 unit and three WR-01 e2e cases pass. Mutation check: removing the guard fails W1, W3, W6 and both held-bat e2e cases (5 targeted failures); W4/W5/tap case stay green as the not-held guards. |
| 10 | 04-13: key caps show the player's layout via the Keyboard Map API with a no-API fallback; Windows note names arrows always and layout-labelled Z/Slash only when every coded cap resolved; five rows kept; Shift stays bound and listed; text-only writes | VERIFIED | `src/ui/key-labels.ts` read in full: `keyLabel` (one code point), `applyKeyLabels` (textContent only, reveal only if all coded caps resolved), `readLayoutMap` (runtime narrowing, try around call and await), `initKeyLabels` never rejects. `index.html`: 6 `data-code` caps, one `hud-controls-note`, one `data-layout-only hidden` span, `contain: inline-size`, 5 `<dt>`, `Left Shift`/`Right Shift` kbd caps present. `main.ts` calls `void initKeyLabels(...)` once at boot (line 228). `key-labels.test.ts` 27 cases pass; `npm run build` OK. |

**Score:** 10/10 truths verified (0 present, behavior-unverified). Real-OS and visual confirmation routed to human verification below.

Scope and constraint checks (04-12/04-13 plan criteria, all re-run by me):

- `CODE_TO_SIDE` grep prints exactly the six D-09 bindings.
- `git diff --quiet f481932 -- src/physics src/control src/sandbox/game-e2e.test.ts src/sandbox/game.determinism.test.ts` exits 0; `package.json`/`package-lock.json` unchanged (exit 0).
- `main.ts` diff vs `f481932`: zero code lines beyond the `FlipperInput` construction, `isWindowsPlatform`, and the `initKeyLabels` call (guard prints 0).
- No `planck` import in `src/input`, `src/control`, `src/ui` (count 0).
- No `innerHTML` in key-labels code; no TBD/FIXME/XXX/TODO/HACK in changed source files.
- `FlipperInput` allocates nothing per event or drain (Set add/delete/clear, booleans, reused view object).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/input/flipper-input.ts` | `windowsShiftHeal`, `isWindowsPlatform`, `isSecondShiftPress`, gated `dropStaleShift`, held-aware `drainEdges` | VERIFIED | All present, substantive, wired from `main.ts` |
| `src/input/flipper-input.test.ts` | G-04-17 and WR-01 unit cases | VERIFIED | 57 tests pass |
| `src/sandbox/flipper-e2e.test.ts` | both-Shift matrix and WR-01 e2e | VERIFIED | 49 tests pass |
| `src/sandbox/main.ts` | `FlipperInput({ windowsShiftHeal: isWindowsPlatform(navigator) })`; `initKeyLabels` boot call | VERIFIED | Lines 107 and 228 |
| `src/ui/key-labels.ts` | `keyLabel`, `applyKeyLabels`, `readLayoutMap`, `initKeyLabels` | VERIFIED | Engine-free, no module-scope DOM globals |
| `src/ui/key-labels.test.ts` | unit plus markup tests | VERIFIED | 27 tests pass |
| `index.html` | `data-code` caps, `hud-controls-note`, `data-layout-only` span, CSS | VERIFIED | Counts match plan criteria (6, 1, 1, 1) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.ts` | `flipper-input.ts` | `isWindowsPlatform(navigator)` -> `windowsShiftHeal` | WIRED | line 107 |
| `flipper-input.ts` | `main.ts` | `drainEdges()` consumed in `onFixedStep`, press before release | WIRED | drain-side order resolved in `drainEdges`; consumer untouched |
| `main.ts` | `flipper-input.ts` | `flipperGate.setEnabled(true)` -> `input.isHeld()` | WIRED | after final Shift keyup both sides read false (e2e asserts it) |
| `main.ts` | `key-labels.ts` | `void initKeyLabels(querySelectorAll kbd[data-code], [data-layout-only], navigator)` | WIRED | line 228 |
| `key-labels.ts` | `index.html` | `data-code` attributes and `data-layout-only` span | WIRED | markup tests assert the allow-list of four codes and the span |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Real data | Status |
|----------|---------------|--------|-----------|--------|
| `FlipperInput.held`/edges | `held`, `pending` | window keydown/keyup/blur/focus/visibilitychange via `attach()` | Yes | FLOWING |
| Key caps / note | cap `textContent`, `hidden` | `navigator.keyboard.getLayoutMap()` at boot | Yes in Chromium; markup fallback elsewhere (by design) | FLOWING (real-layout result is human item 2) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit` | exit 0 | PASS |
| Lint | `npx eslint src` | exit 0 | PASS |
| Full fast suite | `npx vitest run --maxWorkers=4` | 34 files, 482/482 pass | PASS |
| Soak gates | `npm run soak` | 4 files, 4/4 pass | PASS |
| Build | `npm run build` | built, `dist/index.html` 5.11 kB | PASS |
| WR-01 teeth | removed the drain guard, ran the two input test files | 5 targeted WR-01 tests failed (15 total including cascade); source restored via `git checkout`, tree clean | PASS (tests bite) |
| Second-press teeth | forced `isSecondShiftPress` to false, ran the two files | failures in every order case; source restored | PASS (tests bite) |

I did not run default-parallel `npx vitest run`. The known load-dependent 5 s timeout on 4-5 CPU-heavy simulation tests (review WR-04, pending todo) is accepted context; the same files pass here at `--maxWorkers=4` and `npm run soak` is 4/4.

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist and no plan declares one. Not applicable.

### Requirements Coverage

Every requirement ID in PLAN frontmatter across 04-01..04-13 (ELEM-01, ELEM-02, ELEM-03, GAME-01, GAME-02, GAME-03, plus FLIP-01 from 04-09/04-11/04-12/04-13) is present in REQUIREMENTS.md and marked Complete. No orphaned Phase 4 IDs: REQUIREMENTS.md maps exactly ELEM-01..03 and GAME-01..03 to Phase 4.

| Requirement | Source plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| ELEM-01 | 04-01, 04-03, 04-04 | Bumpers pop with added energy and score | SATISFIED | Truth 1 |
| ELEM-02 | 04-03, 04-04 | Slingshots kick on contact | SATISFIED | Truth 2 |
| ELEM-03 | 04-03 | Lanes and rollovers light and score | SATISFIED | Truth 2 |
| GAME-01 | 04-01, 04-07, 04-10, 04-13 | Live score HUD, controls list correct for the player's keyboard | SATISFIED | Truths 3 and 10 |
| GAME-02 | 04-02, 04-05..04-08, 04-11, 04-12 | 3-ball loop; serve never re-presses a healed Shift | SATISFIED | Truths 4, 7, 9 |
| GAME-03 | 04-02, 04-06..04-09 | Nudge, tilt, flippers drop | SATISFIED | Truth 5 |
| FLIP-01 (Phase 2, Complete) | 04-09, 04-11, 04-12, 04-13 | Keyboard flippers, sub-frame response | SATISFIED in code; real-OS confirmation pending (human item 1) | Truths 6-8, 10 |

### Prohibitions (judgment tier, non-authoritative verifier verdict)

Flagged `unverified-prohibition: human review recommended`, carried forward. 04-12/04-13 touch only the input layer, HUD markup and a UI label module; none of the four is affected. UAT 9 recorded all four as pass.

| Prohibition | Verifier verdict | Basis |
|-------------|------------------|-------|
| Kicks must not inject unbounded energy or trap the ball | SATISFIED (non-authoritative) | Reactive soak gate green (4/4 in my run); `src/game` untouched |
| No reuse of commercial table rule names or score tables | SATISFIED (non-authoritative) | New user-facing strings are the controls note only; generic |
| A nudge must not write the ball position | SATISFIED (non-authoritative) | Nudge path untouched |
| A tilt must not cost more than the current ball | SATISFIED (non-authoritative) | Tilt logic untouched; `game-e2e` passes unchanged |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| changed source files | - | TBD/FIXME/XXX/TODO/HACK grep | None | No markers in `flipper-input.ts`, `key-labels.ts`, `main.ts` |
| `src/input/flipper-input.ts` | 369-374 | isSecondShiftPress rejects a second-Shift press after a force-clear (review WR-01) | Advisory | Windows-only corner, self-clears when all Shifts release; arrows/Z/Slash unaffected |
| `src/input/flipper-input.ts` | 219, 357 | dropStaleShift runs on Shift keydown with heal on (review WR-02) | Advisory | Needs an anomalous Shift keydown with `shiftKey:false`; contract says keyup only |

### Code review findings (04-REVIEW.md, 04-12/04-13 delta: 0 critical, 2 warning, 4 info; advisory)

**WR-01 (new): second-Shift press dropped after any force-clear (heal on).** I confirmed the trace in code: after `forceClear` empties `held` while a Shift is physically down, the OS-repeat-flagged second Shift fails `held.has(other)` and is ignored. This is a real defect in a Windows-only corner, not a failure of a written must-have: every 04-12 truth and pinned sequence assumes no intervening force-clear, the player can recover by releasing all Shift keys, and non-Shift bindings are unaffected. No test demonstrates a goal-level break, so it is recorded as advisory rather than a gap. Whether a Sticky Keys prompt or Shift+click lands in this state on the user's machine is part of human item 1. The reviewer's fix is small and sound.

**WR-02 (new): the "drop both Shift codes" heal also runs on Shift keydowns.** Confirmed: `handleKeyDown` line 219 calls `dropStaleShift(e)` and the Shift-code exemption is gone with the heal on. The documented contract (header, option doc, method doc) says keyup only. Real keyboards report `shiftKey:true` on a Shift keydown, so this needs injected or remote-desktop events. Advisory.

**IN-01..IN-04**: stale `main.ts` comment on healing sources, layout-only reveal with zero coded caps, note shown on every platform, `keyLabel` accepts whitespace. Informational, none blocks a must-have with today's markup.

The prior review WR-01 (stale-Shift heal plus same-side press in one window drops a held bat) is CLOSED by 04-12 (truth 9). Earlier findings WR-03, WR-04 and IN-05..IN-09 stand as recorded in `04-REVIEW-DISPOSITION.md` (13 findings, all `open`).

### Human Verification Required

See the `human_verification` list in the frontmatter (3 items): the physical-keyboard UAT 17 re-test of 04-12 (including the carried real-OS and feel verdict), the German QWERTZ panel check of 04-13, and a decision on the two open review warnings. The earlier "keep Shift as a default binding" decision is closed (UAT 18 recorded decision A, implemented in 04-13).

### Gaps Summary

No gaps. G-04-17 is closed in code on both halves with behavioral tests that fail under mutation, the scope guards (bindings, `src/physics`, `src/control`, game mirrors, dependencies) hold, the engine stays isolated, and every Phase 4 requirement ID is satisfied. The status is `human_needed`, not `passed`, because only a real Windows keyboard and the user's German-layout Chrome can confirm the capture-based fix and the panel fit, and the user owns the call on two open review warnings.

---

_Verified: 2026-11-21T01:30:00Z_
_Verifier: Claude (gsd-verifier)_
