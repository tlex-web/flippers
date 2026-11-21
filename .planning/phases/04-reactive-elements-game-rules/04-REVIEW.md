---
phase: 04-reactive-elements-game-rules
reviewed: 2026-11-21T00:19:28Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - index.html
  - src/input/flipper-input.test.ts
  - src/input/flipper-input.ts
  - src/sandbox/flipper-e2e.test.ts
  - src/sandbox/main.ts
  - src/ui/key-labels.test.ts
  - src/ui/key-labels.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
  necessity: 0
status: issues_found
---

# Phase 4: Code Review Report (incremental: 04-12 / 04-13)

**Reviewed:** 2026-11-21T00:19:28Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Incremental review of what the gap-closure plans 04-12 and 04-13 changed since `40f8c0e`:

- 04-12: the Windows both-Shift heal behind `windowsShiftHeal` (`isSecondShiftPress`, and `dropStaleShift` running on the Shift keys' own events), `isWindowsPlatform`, and the WR-01 same-window release/press resolution in `drainEdges`.
- 04-13: layout-labelled key caps through the Keyboard Map API (`src/ui/key-labels.ts`), the `data-code` caps, and the Windows reliability note in `index.html`.

Checks run: the three in-scope test files pass (133 tests, 1.5 s), and `tsc --noEmit` is clean.

I traced the WR-01 rule against every edge order a single drain window can hold. Every held-set change goes through `commitTransitions`, so a latched release on a side that is held at drain time always has a later press. Dropping that release is correct in every order, and `FlipperController.onPressEdge` ignores a press on a bat that is already up, so held -> release -> press leaves the bat up. The key-label module narrows the untrusted `navigator.keyboard` result correctly, writes only through `textContent`, and never rejects.

Two defects remain in the Windows heal:

- The heal treats every repeat-flagged Shift keydown as an auto-repeat unless the other Shift is already in the held set. After any force-clear (blur, focus regain, a hidden tab, or the page gaining focus with a Shift already down), a genuine press of the second Shift is silently dropped (WR-01).
- The "drop both Shift codes" heal is documented as keyup-only, but it also runs on Shift keydowns (WR-02).

No necessity findings: every runtime guard in the changed code sits on a trust boundary (browser `navigator`, layout-map values, keyboard events).

## Warnings

### WR-01: Windows heal ignores a genuine second-Shift press after any force-clear, so both Shift keys go dead while one Shift is held

**File:** `src/input/flipper-input.ts:220`, `src/input/flipper-input.ts:369-374`
**Issue:** On Windows, a Shift pressed while the other Shift is physically down always arrives with `repeat: true`. That is the VK_SHIFT merge the heal exists for. `isSecondShiftPress` accepts that keydown only when the other Shift code is already in `held`. `forceClear()` empties `held` on window blur, window focus regain and a hidden tab, and `held` also starts empty. So if the player is holding ShiftLeft when the set is cleared, the trace is:

1. `handleFocus()` -> `held = {}`. The rule that a held key needs a fresh press applies to ShiftLeft, as intended.
2. The player presses ShiftRight, a genuinely new physical press. Windows sends `{code:"ShiftRight", repeat:true, shiftKey:true}`.
3. `isSecondShiftPress("ShiftRight")` sees `!held.has("ShiftRight") && held.has("ShiftLeft")`, which is `true && false`, so it returns false and the keydown is dropped as auto-repeat.
4. Releasing and re-pressing ShiftRight repeats step 2 for as long as ShiftLeft stays down. ShiftLeft's own repeats are also ignored, so **neither Shift can raise a bat until every Shift is released**.

The documented fresh-press rule covers only the key held across the clear. This also drops a fresh press of the *other* key, which works off Windows: with the heal off, ShiftRight there arrives `repeat: false` and is honored. G-04-11 shows the trigger is real: the Sticky Keys prompt steals focus while the player is mid-Shift, and Shift+click into the page lands in the same state. No test covers a second-Shift press after `handleFocus` / `handleBlur` with the heal on.

**Fix:** Remember which Shift code the ignored auto-repeats carry since the last clear. A repeat-flagged keydown for the *other* Shift code is then a new physical press, even if nothing is in `held`:

```ts
/** Shift code of the most recent ignored Shift auto-repeat (heal only); reset by forceClear. */
private repeatingShift: string | null = null;

private isSecondShiftPress(code: string): boolean {
  if (!this.windowsShiftHeal) return false;
  if (code !== SHIFT_LEFT && code !== SHIFT_RIGHT) return false;
  if (this.held.has(code)) return false;
  const other = code === SHIFT_LEFT ? SHIFT_RIGHT : SHIFT_LEFT;
  return this.held.has(other) || this.repeatingShift === other;
}
// in handleKeyDown's repeat-ignore branch:
//   if (e.code === SHIFT_LEFT || e.code === SHIFT_RIGHT) this.repeatingShift = e.code;
// in forceClear(): this.repeatingShift = null;
// in handleKeyUp for a Shift code with shiftKey === false: this.repeatingShift = null;
```

This still misses a second press that lands before the OS repeat delay (~500 ms) has produced one repeat. Add that case to the module's Residual paragraph, and add a heal-on unit test (focus -> ShiftLeft repeat -> ShiftRight repeat => `rightPress`).

### WR-02: "Drop both Shift codes" heal also runs on Shift keydowns, not only on the documented keyup

**File:** `src/input/flipper-input.ts:219`, `src/input/flipper-input.ts:355-360`
**Issue:** The contract says keyup only, in three places: the header ("(2) a ShiftLeft/ShiftRight **keyup** reporting `shiftKey` strictly false drops BOTH Shift codes", lines 47-49), `FlipperInputOptions.windowsShiftHeal` ("drop both Shift codes on a Shift **keyup**", line 103) and the `dropStaleShift` doc ("a Shift keyup reporting Shift up means VK_SHIFT is fully up", lines 351-352). But `handleKeyDown` also calls `dropStaleShift(e)` (line 219), and with the heal on, its Shift-code exemption is gone (line 357). A ShiftLeft **keydown** reporting `shiftKey: false` would delete a held ShiftRight before adding ShiftLeft, which drops the right bat. The VK_SHIFT reasoning only justifies the keyup case: a keydown reporting Shift up proves nothing about the other Shift. Known sources of odd Shift keydowns exist, such as the fake Shift down/up pairs Windows injects around NumLock numpad keys, and remote-desktop or IME injection. No test pins the keydown behavior either way, so the widened scope is accidental and unguarded.

**Fix:** Limit the Shift-own-event reconciliation to keyup:

```ts
private dropStaleShift(e: KeyEventLike, isKeyUp: boolean): void {
  if (e.shiftKey !== false) return;
  const isShift = e.code === SHIFT_LEFT || e.code === SHIFT_RIGHT;
  if (isShift && !(this.windowsShiftHeal && isKeyUp)) return;
  this.held.delete(SHIFT_LEFT);
  this.held.delete(SHIFT_RIGHT);
}
```

Call it with `false` from `handleKeyDown` and `true` from `handleKeyUp`. Add a heal-on test: ShiftRight held, then a `ShiftLeft` keydown with `shiftKey:false` keeps right held.

## Info

### IN-01: Stale comment on the flipper gate's healing sources

**File:** `src/sandbox/main.ts:142-144`
**Issue:** The comment says `isHeld` "heals on a window focus regain and on any non-Shift key event that reports Shift up (G-04-11)". Since 04-12, on Windows it also heals on a Shift keyup reporting Shift up (G-04-17), which is the main path that clears both Shift codes there.
**Fix:** Append "and, on Windows, on a Shift keyup reporting Shift up (G-04-17)".

### IN-02: Layout-only content is revealed when no coded cap exists

**File:** `src/ui/key-labels.ts:77-90`
**Issue:** `allResolved` starts `true` and only a coded cap can clear it, so `applyKeyLabels([], layoutOnly, layout)` reveals every `[data-layout-only]` element. That breaks the module's promise that the page "names only keys it can vouch for". With today's markup this cannot happen: the revealed span contains coded caps itself. A markup edit that drops the `data-code` attributes but keeps the span would expose unverified labels silently.
**Fix:** Track `resolvedCount` and reveal only when `allResolved && resolvedCount > 0`.

### IN-03: The Windows reliability note shows on every platform

**File:** `index.html:145-151`
**Issue:** The "On Windows, ... Shift can stick." paragraph renders unconditionally, so macOS and Linux players see a Windows-only caveat on a panel that is meant to be minimal. `isWindowsPlatform(navigator)` is already computed at boot in `main.ts:107`.
**Fix:** If decision A allows it, mark the paragraph `hidden` and unhide it in `main.ts` when `isWindowsPlatform(navigator)` is true. Otherwise leave it as the deliberate UAT 18 choice.

### IN-04: `keyLabel` accepts whitespace and control characters as a cap label

**File:** `src/ui/key-labels.ts:60-64`
**Issue:** Any single code point passes, including `" "`, `"\t"`, combining marks and lone surrogates (which `codePoints` counts as one). A layout map that returned one of these would produce a blank or garbled cap and still count as resolved, which also reveals the layout-only note. Chromium's map currently returns printable characters for these four codes, so the risk is low.
**Fix:** Reject labels that do not match `/^\P{C}$/u` and that are whitespace (`/\s/u.test(raw)`), returning `null` so the markup label is kept.

---

_Reviewed: 2026-11-21T00:19:28Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
