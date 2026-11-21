---
phase: 04-reactive-elements-game-rules
reviewed: 2026-11-21T01:33:07Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/input/flipper-input.test.ts
  - src/input/flipper-input.ts
  - src/sandbox/flipper-e2e.test.ts
  - src/sandbox/main.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
  necessity: 0
status: issues_found
---

# Phase 4: Code Review Report (incremental: 04-14 / G-04-21)

**Reviewed:** 2026-11-21T01:33:07Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Incremental review of plan 04-14 (G-04-21) since `c4c8a46`. The plan fixes the previous review's WR-01 and WR-02 and closes IN-01. The four in-scope files changed: the `repeatingShift` marker and `dropStaleShift(e, isKeyUp)` in `flipper-input.ts`, the R1-R7 / K1-K6 unit block, three keyboard-to-Planck cases, and one comment in `main.ts`.

Checks run: both test files pass (126 tests), and `tsc --noEmit` is clean. I also ran two throwaway probe tests from the scratchpad against the real `FlipperInput`. No source file was modified.

Status of the previous findings:

- **WR-02: resolved.** A Shift keydown can no longer reach the drop (`isShiftCode && !(heal && isKeyUp)` returns early, line 393). Shift keyups with the heal on and non-Shift events on both keydown and keyup still reconcile. K1-K6 and the e2e case pin all of this.
- **IN-01: resolved.** The `main.ts:142-145` comment now names the G-04-17 Shift-keyup heal.
- **WR-01: resolved only for one held Shift.** If ONE Shift is held across a force-clear, the other Shift's repeat-flagged press is accepted once the held Shift auto-repeats (R1/R2 and the e2e mirrors). If BOTH Shifts are held across the clear (the D-09 cradle), the original symptom is still there. This is a second residual, and it is not documented (WR-01 below). Plan 04-14 line 90 (UAT 21 decision A) says the only accepted residual is "a second press before the first OS auto-repeat after a clear".

Previous IN-02..IN-04 (`key-labels.ts`, `index.html`) were out of scope for 04-14. Those files are not in this review's scope and stay open as recorded at `c4c8a46`.

No necessity findings. The new marker and the `isKeyUp` gate both handle states that keyboard events really produce.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Cradle held across a force-clear: re-pressing the auto-repeating Shift is still dropped, so both bats stay dead until every Shift is released

**File:** `src/input/flipper-input.ts:239-245`, `src/input/flipper-input.ts:407-413`, `src/input/flipper-input.ts:59-64`
**Issue:** The marker records the Shift whose ignored auto-repeat arrived most recently. A repeat-flagged keydown of that same code is always treated as its own auto-repeat. Windows typematic repeats only the LAST-pressed key. So if the player is cradling (both Shifts down, ShiftRight pressed last) when a blur, focus regain or hidden tab clears the set, this happens:

1. `forceClear()` -> `held = {}`, `repeatingShift = null`. Both bats drop, as designed.
2. ShiftRight's auto-repeat arrives -> ignored, `repeatingShift = "ShiftRight"`. ShiftLeft never repeats, because typematic does not resume an earlier key.
3. The player releases ShiftRight to re-press it. ShiftLeft is still down, so Windows sends no keyup.
4. The player re-presses ShiftRight. Windows sends `{code:"ShiftRight", repeat:true, shiftKey:true}`. `isSecondShiftPress("ShiftRight")`: not held; other = ShiftLeft is not held and `repeatingShift !== "ShiftLeft"`, so it returns false. The keydown is dropped as auto-repeat and the marker stays ShiftRight.
5. Every further ShiftRight press repeats step 4. ShiftLeft is physically held, so it cannot get a fresh press either. **Neither bat rises until every Shift is released.** That is exactly the symptom WR-01 described.

I confirmed this with a probe against the real class: ShiftLeft down, ShiftRight down (repeat-flagged), `handleFocus()`, ShiftRight repeat, ShiftRight repeat. The result was no edges and `isHeld("right") === false`. Re-pressing ShiftLeft instead does work, because the marker names the other code, but the player has no way to know which key to use.

The header residual (lines 61-64) says the remaining miss is only "a second Shift pressed before the held Shift's first OS auto-repeat". Here the miss is permanent and follows an auto-repeat. The plan's acceptance criteria accept only the documented residual. No test covers both Shifts held across a clear. The trigger is the same one that motivated G-04-11 and G-04-21: the cradle is the D-09 use case, and rapid Shift taps raise the Sticky Keys prompt, which steals focus.

**Fix:** From events alone, an auto-repeat of ShiftRight and a fresh repeat-flagged ShiftRight press look identical. Only timing separates them. Choose one of these:

- (A, recommended) Use timing to tell them apart. The typematic stream stops when the key is released, so a gap in it marks a fresh press:
  ```ts
  private lastShiftRepeatAt = -Infinity; // reset in forceClear and on the Shift-up keyup
  // in isSecondShiftPress, after the held check:
  //   if (this.repeatingShift === code && e.timeStamp - this.lastShiftRepeatAt > SHIFT_REPEAT_GAP_MS) return true;
  // in the repeat-ignore branch: this.lastShiftRepeatAt = e.timeStamp;
  ```
  `KeyEventLike` needs an optional `timeStamp`. Pick a gap above the slowest Windows repeat interval, about 400 ms, for example 450 ms. A re-press made faster than that is still missed, and the residual paragraph must say so.
- (B) Accept it as a second residual. This needs an explicit user decision, because it contradicts plan line 90. Extend the header residual paragraph, and add a pinning unit test like R3: cradle -> clear -> ShiftRight repeat -> ShiftRight repeat => no edge.

## Info

### IN-01: `repeatingShift` survives the G-04-11 non-Shift reconciliation, breaking the "lone repeat stays ignored" invariant

**File:** `src/input/flipper-input.ts:390-396`, `src/input/flipper-input.ts:190-197`, `src/input/flipper-input.ts:405`
**Issue:** The marker doc says it "proves that Shift is physically down". `isSecondShiftPress`'s doc says "a lone repeat stay[s] ignored". A non-Shift event reporting `shiftKey: false` proves no Shift is down, and `dropStaleShift` drops both held Shift codes, but `repeatingShift` is not reset. Probe: heal on, ShiftLeft down, ShiftLeft repeat, `KeyX` with `shiftKey:false`, then a lone repeat-flagged ShiftRight. The result is `rightPress: true`. I found no realistic Windows event order that yields a lone repeat-flagged Shift without a clear in between, which would reset the marker anyway. So this breaks a documented invariant, not a confirmed gameplay bug.
**Fix:** In `dropStaleShift`, after the two `held.delete` calls, add `this.repeatingShift = null;`. That runs only when some event proved every Shift is up, which also covers the Shift-up keyup reset in `handleKeyUp` (lines 270-273). That block can then be removed.

### IN-02: `handleKeyDown` doc still says every event drops a stale Shift

**File:** `src/input/flipper-input.ts:228-234`
**Issue:** "Drops a stale Shift first (every event, repeat or unbound included, carries valid modifier state)". Since G-04-21, a Shift keydown never reconciles (line 393). The doc also does not mention that the repeat branch now records `repeatingShift` (lines 241-245), which is the main G-04-21 side effect of this method.
**Fix:** Change it to "Drops a stale Shift first on any non-Shift keydown reporting Shift up (a Shift keydown never reconciles, G-04-21), then ignores OS auto-repeat, recording a Shift auto-repeat for the Windows heal, ...".

### IN-03: `anyEdge` test helper doc states the opposite of what it returns

**File:** `src/input/flipper-input.test.ts:703`
**Issue:** The doc says "True when a drained view carries no edge at all", but the body returns `leftPress || leftRelease || rightPress || rightRelease`, which is true when ANY edge is present. The call sites use `expect(anyEdge(...)).toBe(false)`, so the tests are correct. The comment misleads anyone adding a case.
**Fix:** Change it to "True when a drained view carries at least one edge."

---

_Reviewed: 2026-11-21T01:33:07Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
