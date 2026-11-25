---
phase: 04-reactive-elements-game-rules
reviewed: 2026-11-21T04:05:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/input/flipper-input.test.ts
  - src/input/flipper-input.ts
  - src/sandbox/flipper-e2e.test.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
  necessity: 0
status: issues_found
---

# Phase 4: Code Review Report (incremental: 04-15 / G-04-21 cradle)

**Reviewed:** 2026-11-21T04:05:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

This is an incremental review of plan 04-15 since `3ae1d4d`. The plan adds the timed re-press rule (`SHIFT_REPEAT_GAP_MS` = 450, `lastShiftRepeatAt`, optional `KeyEventLike.timeStamp`), moves the marker reset into `dropStaleShift` (IN-01), and fixes two docs (IN-02, IN-03). It also adds the C1-C11 / I1-I2 unit block and two keyboard-to-Planck cradle cases.

Checks run:

- Both in-scope test files pass (145 tests). The full suite passes (521 tests).
- `tsc --noEmit` is clean.
- I ran four throwaway probes against the real `FlipperInput` from a temporary folder, then deleted it. No source file was modified.

Status of the 04-14 findings:

- **WR-01: resolved.** Cradle held across a clear, then the auto-repeating Shift re-pressed after a pause: this is now a press (C1/C2 for focus, blur and hidden, plus both e2e mirrors). Probe P3 also confirms that re-pressing the other Shift afterwards restores the full cradle, because the other Shift is then in `held`. The fast re-press residual is documented and pinned (C5, C6).
- **IN-01: resolved.** `dropStaleShift` clears `repeatingShift` and `lastShiftRepeatAt` whenever both Shift codes are dropped (lines 454-457). The keyup-only block in `handleKeyUp` is gone. I1 and I2 pin this.
- **IN-02 / IN-03: resolved.** The `handleKeyDown` doc and the `anyEdge` doc now match the code.

Carry-overs: of the out-of-scope findings from earlier reviews, only the old WR-04 (`f3ab8be`) is in a file reviewed here, and it is still present. It is re-reported as WR-01 below. WR-03, IN-04..IN-09 and the `key-labels.ts` / `index.html` items concern files outside this scope. They stay open as recorded.

The timing logic is correct for every Windows event order I traced:

- `lastShiftRepeatAt` is only written together with the marker.
- A non-finite or missing `timeStamp` never counts.
- A negative delta (clock skew) never counts.
- The held check comes first, so a held Shift is never pressed twice.

The remaining findings are about documentation accuracy and test-suite robustness.

No necessity findings. The `Number.isFinite` guards check `timeStamp`, which comes from browser events across a trust boundary. The marker and timing state handle event orders that Windows really produces.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Quick-tap sweep still has no timeout budget and now takes 4.2 s of the 5 s default under full-suite load (carry-over of `f3ab8be` WR-04)

**File:** `src/sandbox/flipper-e2e.test.ts:327-365`
**Issue:** The test `no quick tap (3-10 steps, any rest, all six bindings) leaves a bat raised` still builds 192 full `PlanckWorld` rigs inside one `it` with no timeout. `vitest.config.*` sets no `testTimeout`, so the 5000 ms default applies. In this review's full `npx vitest run`, it took **4201 ms**. That leaves about 800 ms of headroom, and `f3ab8be` already measured it failing at 6427 ms and 6666 ms on a busier host. 04-15 added two more full-rig e2e cases to this same file (lines 827-940), which adds load in the same worker. Whether `npm test` passes still depends on host load.
**Fix:** Give it an explicit budget, or split it per binding so each case stays small:
```ts
it("no quick tap (3-10 steps, any rest, all six bindings) leaves a bat raised", () => {
  ...
}, 30_000);
// or: for (const b of ALL_BINDINGS) it(`no quick tap on ${b.code} leaves a bat raised`, () => { ... });
```

## Info

### IN-01: The timed re-press also fires for a SINGLE Shift held across a clear at slow typematic, which the `handleFocus` doc and header say cannot happen

**File:** `src/input/flipper-input.ts:345-350`, `src/input/flipper-input.ts:52-58`, `src/input/flipper-input.ts:209-211`, `src/input/flipper-input.ts:480-486`
**Issue:** The timed path in `isSecondShiftPress` only requires `repeatingShift === code`, `code` not held, and a gap above 450 ms. Nothing limits it to the both-Shift cradle. Probe P2: heal on, ShiftLeft down, `handleFocus()`, a ShiftLeft repeat at 1000 ms (ignored, marker set), then a ShiftLeft repeat at 1480 ms gives `leftPress: true`. That is a 480 ms interval, which is KeyboardSpeed 0 with the 20% deviation the constant's doc cites.

With one Shift held alone, a real re-press always sends a keyup first (Shift up), which clears the marker. So for a single Shift, this path can only ever fire from auto-repeat. The constant's doc (lines 209-211) mentions this in general terms. But `handleFocus` (lines 345-346) still says "A key physically held across the focus regain needs a fresh press". Both the header (line 52) and `handleFocus` (lines 348-349) describe the timed rule as applying "with both Shifts held". In practice the result is harmless: a bat rises for a key that is really held. Still, the documented contract is wrong, and no test pins the single-Shift behaviour either way.
**Fix:** Add one sentence to the `handleFocus` doc and to the header's timed re-press paragraph: "At the slowest Windows repeat rate, a held Shift's own auto-repeat can exceed SHIFT_REPEAT_GAP_MS and then counts as a press, also for a single Shift held across a clear." Add a pinning unit test like P2 next to C4.

### IN-02: The header residual names only two ways to recover from a missed fast re-press; a slower re-press of the same Shift also works

**File:** `src/input/flipper-input.ts:73-79`
**Issue:** The residual says a fast re-press released before the typematic delay, or any fast re-press at the 250 ms delay setting, "stays missed until the other Shift is re-pressed or every Shift is released". A missed re-press only moves `lastShiftRepeatAt` to its own time (line 303). So a later re-press of the SAME Shift, more than 450 ms after the missed one, is a press. Probe P1: a re-press at T+200 is missed, and a re-press at T+800 gives `rightPress: true`. Probe P4 confirms the 250 ms case: a fast re-press held at 33 ms repeats never presses. The doc makes the miss sound stuck until another key is used. In fact it only lasts until the player re-presses the same Shift more slowly. No test pins that recovery. C6 covers only the held-past-delay route.
**Fix:** Change the end of the residual to "...stays missed until that Shift is re-pressed after a pause longer than SHIFT_REPEAT_GAP_MS, the other Shift is re-pressed, or every Shift is released". Optionally add a C5b test: miss at T+200, then a press at T+200+SHIFT_REPEAT_GAP_MS+1.

### IN-03: The timed re-press text is spliced into heal item (1), leaving "(2) a" dangling mid-paragraph

**File:** `src/input/flipper-input.ts:47-62`
**Issue:** The two-heal list in the header opens item (1) at line 47. Lines 52-59 then insert the whole timed re-press paragraph, and item (2) starts mid-line as "never counts this way; (2) a" (lines 59-60), followed by "Both are gated to Windows" (lines 62-63). With three behaviours, "two heals" and "Both" are now ambiguous: the timed re-press is a third accept path that is also Windows-gated. The `FlipperInputOptions.windowsShiftHeal` doc (lines 138-143) already lists all three cleanly.
**Fix:** Restructure the header to match the options doc. Use (1) second-Shift press (G-04-17, extended past a clear by G-04-21), (2) timed re-press (G-04-21 cradle), and (3) drop-both on a Shift keyup reporting Shift up. Then say "All three are gated to Windows".

---

_Reviewed: 2026-11-21T04:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
