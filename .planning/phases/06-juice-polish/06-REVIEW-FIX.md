---
phase: 06-juice-polish
fixed_at: 2026-11-23T11:00:11Z
review_path: .planning/phases/06-juice-polish/06-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-11-23T11:00:11Z
**Source review:** .planning/phases/06-juice-polish/06-REVIEW.md
**Iteration:** 1 (second fix round: the re-review of the first round's fixes)

**Summary:**
- Findings in scope: 8 (fix_scope: all; no necessity findings)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: The kickback grace is a fixed 2 s, so a kicked ball that drains later but still inside the save window costs a ball (CR-01 only partly fixed)

**Files modified:** `src/game/game-session.ts`, `src/game/tuning.ts`, `src/game/game-session.test.ts`, `src/sandbox/game-e2e.test.ts`
**Commit:** edd8db7
**Status:** fixed: requires human verification (rule logic)
**Applied fix:** `trySave()` reads `save.getRemaining()` before `consume()` and sets `graceEndsAt = step + max(KICKBACK_GRACE_STEPS, remaining - 1)`. `inKickbackGrace()` is now `savedAtStep >= 0 && step <= graceEndsAt`. A new `endGrace()` clears both fields everywhere `savedAtStep` was cleared (tilt, bonus entry, `onStart`, every backstop). The bound is `remaining - 1`, not the reviewer's `remaining`. With `remaining` left on the kick step, the next `remaining - 1` ticks keep the save running and the tick after that times it out. So the backstop would have covered drains through `step + remaining - 1`, and the grace now ends on exactly that step. This keeps the "never make it worse" contract without granting an extra step. The docs in `tuning.ts` and `game-session.ts` now describe the window-plus-floor rule, so the contract the code states is the contract it delivers.
**Tests:**
- A session case kicks at window step 100 (session step 101). It drains the kicked ball at kick + 600, which is past the 240-step grace but inside the window, and asserts the ball is re-served: remove then add, ball 1, playing, one save. It also drains on the window's last step (re-served) and one step past it (bonus).
- A plain no-kick rig confirms the same last step is backstopped, so both paths match.
- A late-kick case (step 800, 41 window steps left) pins the 240-step floor at kick + 240 (saved) and kick + 241 (lost). It replaces the old "drain after the grace is real" case, because that case kicked at step 1 and its drain now falls inside the window.
- The e2e live kickback case now records the session step of the chute exit and asserts the kicked ball's real drain lies past both `kickStep + KICKBACK_GRACE_STEPS` and the original window's last step (measured: exit 235, kick 500, drain 1103 > 1075).
- Mutation check: both a 240-only grace and an off-by-one `remaining` bound fail the new session test.

### WR-01: A grace backstop shows BALL SAVED but sounds like a lost ball: drain cue and shake, no ballSave cue

**Files modified:** `src/game/game-session.ts`, `src/sandbox/presentation-observer.ts`, `src/sandbox/presentation-observer.test.ts`
**Commits:** a3a6ba6, b653ee4 (Prettier wrap of the new test line)
**Applied fix:** `GameSession` now has a `reserveCount` presentation counter, read through `getReserveCount()`. `backstop()` raises it on every path. The observer adds `getReserveCount` to `ObserverSession` and snapshots it. After the save loop it pushes one `ballSave` cue for each re-serve that brought no new save that step: `(reserves delta) - (saves delta)`, when positive. It calls no `fx.onSave`, so no save sparks play. The step's cue counts work out as follows:
- A normal backstop raises both counters, so it plays one sting.
- A kick plus drain on the same step raises both, so it plays one sting.
- A kick alone raises only the save count, so it plays one sting.
- A grace backstop raises only the re-serve count, so it now plays drain, then sting.

The observer header docs are updated.
**Tests:** The fake-session unit cases cover:
- a grace re-serve, which pushes `drain` then `ballSave` and calls only `fx.onDrain`
- a same-step kickback plus re-serve, which pushes one `ballSave`

A real-`GameSession` case runs kickback, then a drain of the kicked ball 100 steps later. It asserts `["drain", "ballSave"]` and no second save sparks. Mutation check: disabling the new loop fails 2 tests.

### IN-01: SKILL SHOT can still outlive the ball, the same defect WR-01 fixed for BALL SAVED

**Files modified:** `src/ui/hud.ts`, `src/game/game-session.ts`, `src/ui/hud.test.ts`, `src/game/game-session.test.ts`
**Commit:** 5d8c9e0
**Applied fix:** `skillOn` is now gated like `saveOn`: `state === "playing" && count > 0 && skillStep >= 0 && now < skillStep + STATUS_TRANSIENT_STEPS`. The session sets `lastSkillStep = -1` at bonus entry, next to `lastSaveStep = -1`. The skill count and value are untouched because they are per game. The doc for `getLastSkillStep()` now says "of the ball in play". New tests cover three cases: a game over inside the skill window shows the GAME OVER prompt, a cleared skill step shows nothing, and the session clears `getLastSkillStep()` when a ball is lost.

### IN-02: The save lamp is off while the kickback grace still saves the ball

**Files modified:** `src/game/game-session.ts`, `src/game/game-session.test.ts`
**Commit:** dab5c3a
**Applied fix:** While the state is playing and `inKickbackGrace()` is true, `getSaveLampPhase()` returns `"steady"` if more than `BALL_SAVE_BLINK_STEPS` grace steps follow this one, and `"blink"` otherwise.
- A grace that runs to the window's end reads as the save would have, except that it starts blinking 1 fixed step (8 ms) sooner.
- A late kick, where the 240-step floor governs, blinks from the kick with no steady blip, so the blink rhythm does not restart.
- When the grace ends or is used, the lamp falls back to `BallSave` and reads `off`.

The `trySave` test now expects `"steady"` right after the kick. A new test walks steady, then blink, then off for an early kick. It checks that a late kick blinks through the floor and that a grace re-serve turns the lamp off.

### IN-03: The same-step path rewrites the session's save kind but not `BallSave`'s

**Files modified:** `src/game/ball-save.ts`, `src/game/ball-save.test.ts`, `src/game/game-session.ts`
**Commit:** 240e083
**Applied fix:** Took the delete option. `BallSave.lastKind` and `getLastKind()` are removed, since they had no production caller, and `consume()` no longer takes a kind. `GameSession.getLastSaveKind()` is now the only source. `SaveKind` stays exported and its doc points at the session. The `BallSave` tests were updated to the argument-free `consume()`.

### IN-04: The test title still claims the skill phase carries over a backstop

**Files modified:** `src/game/game-session.test.ts`
**Commit:** e57a1b6
**Applied fix:** The test is renamed to "a backstop is the same ball: bonus counts, inlane flags and the ball number carry over". The disarm is already pinned by the dedicated IN-04 test.

### IN-05: The chevron loop silently drops skill lanes beyond three, and the WR-03 test computes lamp indices by arithmetic

**Files modified:** `src/render/lamps.ts`, `src/render/lamps.test.ts`
**Commit:** 1512bad
**Applied fix:** `SKILL_LAMPS` is now exported. `buildLampShapes` loops over `SKILL_SHOT_LANES` and uses `continue` when `SKILL_LAMPS[i]` is undefined. The `?? LAMP_SKILL_400` fallback is gone. The WR-03 test asserts `SKILL_SHOT_LANES.length === SKILL_LAMPS.length` and looks chevrons up by `SKILL_LAMPS[i]` instead of `LAMP_SKILL_400 + i`.

### IN-06: The lamp shape table now pulls in the effects runtime for one geometry helper

**Files modified:** `src/table/resolve.ts`, `src/render/effects.ts`, `src/render/lamps.ts`, `src/render/table-renderer.ts`, `src/render/lamps.test.ts`
**Commit:** 6c9c759
**Applied fix:** `pathMidpoint` moved, unchanged, into `table/resolve.ts`, which is pure geometry with only a constants import and type imports. `effects.ts`, `lamps.ts`, `table-renderer.ts` and the lamp tests import it from there. `lamps.ts` no longer imports `./effects`, so baking lenses through `static-layer` → `lamps` no longer loads the effects stack. `table-renderer.ts` keeps only a type import from `./effects`.

## Verification

All gates ran in the main checkout, `C:\Users\aster\projects-source\flippers`, on branch `gsd/phase-03-table-plunger-event-bus`. No worktree was used, as the orchestrator instructed, so the results can be reproduced from this tree at HEAD `b653ee4`.

- After each fix: the relevant `npx vitest run <files>`, `npx tsc --noEmit`, and `npx eslint` on the touched files all passed.
- Final full run:
  - `npx vitest run`: 60 files, 1288 passed (baseline 1280; +8 new tests)
  - `npx tsc --noEmit`: exit 0
  - `npx eslint .`: exit 0
- Prettier: every file changed in this round matches the project style, apart from lines that already differed before this round in `game-session.test.ts` and `game-e2e.test.ts`. Those lines were left alone.
- Pre-existing unrelated working-tree changes were never staged: `.planning/config.json`, `.planning/research/.cache/` and `.planning/state.json`.

---

_Fixed: 2026-11-23T11:00:11Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
