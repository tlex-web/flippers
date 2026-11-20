---
phase: 04-reactive-elements-game-rules
reviewed: 2026-11-20T23:45:00Z
depth: standard
scope: incremental (04-11 delta, f3ab8be..HEAD)
files_reviewed: 5
files_reviewed_list:
  - src/input/flipper-input.test.ts
  - src/input/flipper-input.ts
  - src/sandbox/flipper-e2e.test.ts
  - src/sandbox/game-e2e.test.ts
  - src/sandbox/main.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
  necessity: 0
status: issues_found
---

# Phase 4: Code Review Report (04-11 delta)

**Reviewed:** 2026-11-20T23:45:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This is an incremental review of gap-closure plan 04-11 (G-04-11: a lost Shift keyup pins a flipper bat). It covers only the diff `f3ab8be..HEAD` for the five files listed, and reads each file whole for context. It replaces the earlier 04-09/04-10 report.

The delta adds two things to `FlipperInput`. First, `handleFocus()` with a window `focus` listener, which force-clears the held set. Second, `dropStaleShift()`, which drops ShiftLeft/ShiftRight on any non-Shift key event that reports `shiftKey === false`. Edges are now emitted from each event's net per-side transition. `main.ts` changes only in comments. The in-scope tests pass (3 files, 82 tests) and `tsc --noEmit` is clean.

The per-event logic is correct for every order I traced: repeat, unbound, untracked keyup, cross-side, the cradle, and an absent `shiftKey`. `preventDefault` still fires only on bound, non-repeat keydowns, and nothing is allocated per event. Two problems remain:
- The net-transition rule fixes the "bat drops under the finger" problem for a single event only. If the heal's release and a new press land in the same drain window, `main.ts` still drops the bat while the key is held. I confirmed this with a scratch test.
- Excluding Shift-key events from reconciliation leaves the Windows both-Shift lost keyup unhealed.

No necessity findings: the delta adds no guard against a state that provably cannot occur.

## Warnings

### WR-01: A stale-Shift heal and a same-side press in one drain window drop the bat while the key is held

**File:** `src/sandbox/main.ts:167-171` (consumer); `src/input/flipper-input.ts:286-300` (the `commitTransitions` rationale)
**Issue:** `commitTransitions` nets edges within ONE event only. Its doc says this keeps the bat from dropping under the player's finger, because `main.ts` applies press before release. The latch, however, collects edges from every event between two fixed-step drains. Key events are only dispatched between rAF callbacks, so in practice that window is a whole render frame (~16.7 ms, more on a hitch). Take a stale ShiftLeft with the bat held up. The player presses X (a nudge, `shiftKey` false) and Z in the same frame, which is normal pinball play (nudge and flip together):
1. KeyX keydown: the heal drops ShiftLeft and latches `leftRelease`.
2. KeyZ keydown: Z is added and latches `leftPress`.
3. Drain: `onPressEdge` is a no-op on a `held-up` bat (`flipper-controller.ts:171`), then `onReleaseEdge` -> `drop()` -> `returning` (`flipper-controller.ts:241-246`).

The bat falls while Z is physically held and `input.isHeld("left")` is true. It stays down until Z is pressed again. I confirmed the drain contents with a scratch test: after the sequence above, one `drainEdges()` returns `leftPress: true, leftRelease: true` with `isHeld("left") === true`. Before 04-11, this sequence left the bat up. The heal therefore adds a new way to drop a bat under the player's finger, which the plan's must-have says cannot happen. The same ordering defect already existed for a finger roll between two same-side bindings (ShiftLeft up then Z down inside one frame). `PlungerInput` already solves this through `applyEdges`, which orders edges by the held state at drain time (IN-02, `main.ts:174-178`). The flipper drain does not.
**Fix:** In `onFixedStep`, order a side's two edges by its held state at drain time, the same way the plunger does:
```ts
function applySide(press: boolean, release: boolean, held: boolean, id: number): void {
  if (press && release) {
    if (held) { controller.onReleaseEdge(id); controller.onPressEdge(id); } // release then re-press: ends up
    else { controller.onPressEdge(id); controller.onReleaseEdge(id); }      // tap inside one window: flip then drop
    return;
  }
  if (press) controller.onPressEdge(id);
  if (release) controller.onReleaseEdge(id);
}
const edges = input.drainEdges();
applySide(edges.leftPress, edges.leftRelease, input.isHeld("left"), leftFlipperId);
applySide(edges.rightPress, edges.rightRelease, input.isHeld("right"), rightFlipperId);
```
Add an e2e case: stale ShiftLeft, then KeyX and KeyZ keydowns (`shiftKey` false) with no step between them. Over the next 10 steps the left phase must stay `flipping-up`/`held-up`. Also fix the `commitTransitions` doc, which currently claims more than the code guarantees.

### WR-02: The Windows both-Shift lost keyup is never reconciled, because Shift-key events are excluded

**File:** `src/input/flipper-input.ts:280-284` (also the header at lines 28-38 and the B6 test at `src/input/flipper-input.test.ts`, "B6: Shift-key events never reconcile")
**Issue:** `dropStaleShift` returns early for any event whose code is ShiftLeft or ShiftRight. On Windows, when both Shift keys are held, releasing the first one sends no keyup at all. GLFW works around this in `win32_window.c` ("HACK: Release both Shift keys on Shift up event, as when both are pressed the first release does not emit any event"). That is the D-09 both-Shift cradle on Windows, which is this user's platform:
1. Hold both Shifts. Release ShiftLeft: no event, so the left bat stays up. No browser check can see this.
2. Release ShiftRight: a ShiftRight keyup arrives with `shiftKey: false`, which proves no Shift is down. Because the event is a Shift key's own, the reconciliation skips it. ShiftLeft stays in `held`, and the left bat stays raised after both Shifts are up.

The bat recovers only on the next non-Shift key or a focus regain. If neither happens before a drain, the flipper gate re-presses it on the next serve (`main.ts:146`). This is exactly the "lost keyup leaves a bat hanging raised" class G-04-11 was meant to close. The header records only the Sticky Keys residual, not this one. This rests on external platform behavior, so confirm it on a Windows keyboard before acting. The plan's own reason for the exclusion (some platforms may report `false` on one Shift's keyup while the other is still held) is likewise unverified.
**Fix:** On a Shift keyup whose `shiftKey === false`, also drop the opposite Shift. On Windows, the final Shift release reliably reports `false` (state after the event). Verify on Linux/Firefox that releasing one Shift while the other is held reports `shiftKey: true`. If that holds, the cradle risk the exclusion guards against does not exist:
```ts
private dropStaleShift(e: KeyEventLike): void {
  if (e.shiftKey !== false) return;
  if (e.code !== SHIFT_LEFT) this.held.delete(SHIFT_LEFT);
  if (e.code !== SHIFT_RIGHT) this.held.delete(SHIFT_RIGHT);
}
```
(The event's own code is still removed by `handleKeyUp`.) If the Linux risk is real, at least record this Windows residual in the header and in the human-check expectations next to the Sticky Keys note, so it is not taken for a regression.

## Info

### IN-01: PlungerInput and GameInput lack the focus-regain clear, so the same late-keydown race strands a plunger charge

**File:** `src/input/plunger-input.ts:61-87,113-127`
**Issue:** T-04-27's mitigation (clear on window `focus`) is applied only to `FlipperInput`. Suppose a Space keydown is handled after an OS dialog's blur and its keyup goes to the dialog. `PlungerInput.held` then stays true and the charge keeps building. The next Space keydown is de-duped (`if (this.held) return`), so its keyup fires a full-charge launch the player did not wind up. The impact is lower than a pinned bat, and it heals on the next tap, but the race is the same one.
**Fix:** Add `handleFocus()` -> `cancelHeld()` and a window `focus` listener in `PlungerInput.attach()/detach()`, plus the same for `GameInput` (forget held codes), to keep the three inputs consistent.

### IN-02: `handleFocus` doc says "window focus only follows a blur", which is not always true

**File:** `src/input/flipper-input.ts:193-195`
**Issue:** A window also gets `focus` without a prior `blur`, for example when a tab first loaded in the background is activated, or when the browser window first gains focus after load. The clear is still harmless in those cases, because a page without focus received no keydowns. The safety argument in the doc is stated more strongly than it needs to be.
**Fix:** Reword it: "focus either follows a blur (which already cleared every key held before it) or is the page's first focus (nothing can be held), so the clear can only drop keydowns handled while blurred."

### IN-03: The game-e2e comment says Space reaches every input, but `g.gameInput` is not fed

**File:** `src/sandbox/game-e2e.test.ts` (G-04-11 block, the `spaceDown` / `spaceUp` delivery)
**Issue:** The comment says main.ts delivers every key event to each input, but the test feeds only `g.input` and `g.plungerInput`. Space is not a GameInput code, so this does not change the result, but the comment is wrong as written.
**Fix:** Either also call `g.gameInput.handleKeyDown/handleKeyUp(spaceDown/spaceUp)`, or reword the comment to "reaches the flipper and plunger inputs".

---

_Reviewed: 2026-11-20T23:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
