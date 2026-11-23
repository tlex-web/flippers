---
phase: 06-juice-polish
reviewed: 2026-11-23T12:30:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/game/ball-save.test.ts
  - src/game/ball-save.ts
  - src/game/game-session.test.ts
  - src/game/game-session.ts
  - src/game/tuning.ts
  - src/render/effects.ts
  - src/render/lamps.test.ts
  - src/render/lamps.ts
  - src/render/table-renderer.ts
  - src/sandbox/game-e2e.test.ts
  - src/sandbox/presentation-observer.test.ts
  - src/sandbox/presentation-observer.ts
  - src/table/resolve.ts
  - src/ui/hud.test.ts
  - src/ui/hud.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
  necessity: 0
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-11-23T12:30:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

This is round 3, an incremental re-review of edd8db7..b653ee4 (diff base `c4a365d`). Those commits fix round 2's CR-01, WR-01 and IN-01..06. I read every changed hunk and the code around it. I traced the fixed-step order in `sandbox/main.ts` (`session.tick()`, then `world.step()`, then `router.dispatch()`, `reactive.service()`, `session.service()`, `observer.observe()` and `lamps.update()`). I also checked every consumer of the new and changed getters.

Baseline: `npx vitest run` gives 60 files, 1288 passed. `npx tsc --noEmit` exits 0.

**CR-01 (grace end) is correct, with no off-by-one.**
- `trySave()` runs during dispatch, after this step's `save.update()`. So `remaining = R` is the value after this step's update.
- `BallSave.update` disarms on the tick where `remaining` reaches 0. Without the kick, `canSave()` therefore holds on steps `S .. S+R-1`, and `graceEndsAt = S + max(240, R-1)` ends on exactly that last step.
- The edge case of a timer that starts on this tick also holds: R = 840 gives 840 covered steps.
- The session tests pin both sides of the boundary for the window path (840 saved, 841 lost) and for the floor path (1040 saved, 1041 lost).
- The e2e bound `drainStep > exitSessionStep + BALL_SAVE_STEPS` is also exact. The timer starts on the tick after the exit step, because it reads the previous world step's ball.

**`endGrace()` runs everywhere it must:**
- tilt (`onNudge`)
- bonus entry (which precedes every game over, so `endBonus` needs no call)
- `onStart`
- every `backstop()`

A grace that expires naturally needs no clear, because `step` only increases and is never reset.

**WR-01 (re-serve sting) is correct.** `graceReserves = Δreserves − Δsaves` comes out as follows:
- a plain backstop: 1 − 1 = 0
- a same-step kick plus drain: 1 − 1 = 0
- a kick alone: 0 − 1 = −1, so no cue
- a grace re-serve: 1 − 0 = 1

So there is never a double sting and never a missed one. A second kick cannot land inside the grace (`consume()` fails once the save is spent), and a re-served ball is not re-armed, so no other mix can occur within one step. `fx.onSave` is not called on the grace path. Normal backstops call `onSave("backstop")`, which is a no-op in `EffectsTracker`, so a grace backstop's visuals match a normal one. `LampTracker`'s post flourish keys on save-count increments only, so it does not replay.

**IN-02 (save lamp during the grace) is correct.**
- `graceEndsAt − step = remaining − 1`, so the lamp turns to blink one step before `BallSave` would, as documented.
- In the floor case (R − 1 ≤ 240), the lamp blinks from the kick without a gap. `wasSaveBlink` stays true, so the blink rhythm does not restart.
- Once the grace is used or expires, the lamp reads `BallSave` (spent, so `off`).

**The other fixes are correct:**
- **IN-01:** `skillOn` is gated on `state === "playing"`, and `lastSkillStep` is cleared at bonus entry and in `onStart`.
- **IN-03:** `consume()` has exactly two callers, both in `game-session.ts`. No `getLastKind` reference is left.
- **IN-05:** the chevron loop and the length assertion are in place.
- **IN-06:** `pathMidpoint` is now imported only from `table/resolve.ts` (by effects, lamps, the renderer and the lamp tests). `lamps.ts` no longer imports `./effects`.

I found no regressions. There are two minor items below.

Necessity was assessed with `necessity-review.md`. The `skillStep >= 0` guard in `hud.ts` can be reached through the `HudSource` interface, and it can be reached in the first 179 session steps, so it is not a necessity finding.

## Narrative Findings (AI reviewer)

## Info

### IN-01: The new HUD test "a skill step cleared to -1 shows nothing" passes without the guard it claims to pin

**File:** `src/ui/hud.test.ts:250-256`
**Issue:** The test sets `src.skillStep = -1` and `src.step = 1020`, with state `"playing"` from `awarded()`. With `skillStep = -1`, the window test `now < skillStep + STATUS_TRANSIENT_STEPS` is `1020 < 179`, which is already false. So the test passes if you delete the new `skillStep >= 0` term in `hud.ts:303`. It also passes if the session never clears the step, since it fakes the source. It pins nothing the old code did not already do. The sibling test at `:242-248` (game over inside the window) does exercise the `state === "playing"` gate.
**Fix:** Put `now` inside the window that a `-1` step would open, so that only the guard hides the text:
```ts
src.skillStep = -1;
src.step = 50; // < -1 + STATUS_TRANSIENT_STEPS: only `skillStep >= 0` hides it
view.update(src);
expect(status.textContent).toBe("");
```

### IN-02: `SaveKind` is still declared in `ball-save.ts`, which no longer uses it

**File:** `src/game/ball-save.ts:35-39`
**Issue:** After IN-03, `BallSave` neither takes nor stores a `SaveKind`. The type's only producer is `GameSession.lastSaveKind`, and its consumers (`effects.ts`, `presentation-observer.ts`, `lamps.ts`, the tests) import it from `ball-save`. The doc comment now points readers at the session. This is harmless today, but the type sits in a module that has no say over it, which partly undoes the "one source" goal of IN-03.
**Fix:** Move `export type SaveKind = "kickback" | "backstop";` to `game-session.ts`, next to `getLastSaveKind()`, and update the type-only imports. Or leave it and accept the split.

---

_Reviewed: 2026-11-23T12:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
