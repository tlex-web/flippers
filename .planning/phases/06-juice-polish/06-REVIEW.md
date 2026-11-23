---
phase: 06-juice-polish
reviewed: 2026-11-23T11:45:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - src/app/cue-queue.ts
  - src/game/bonus.test.ts
  - src/game/bonus.ts
  - src/game/game-session.test.ts
  - src/game/game-session.ts
  - src/game/high-score.test.ts
  - src/game/high-score.ts
  - src/game/tuning.ts
  - src/render/effects.ts
  - src/render/lamps.test.ts
  - src/render/lamps.ts
  - src/render/shake.ts
  - src/render/static-layer.ts
  - src/render/table-renderer.ts
  - src/sandbox/game-e2e.test.ts
  - src/sandbox/game.determinism.test.ts
  - src/sandbox/presentation-observer.ts
  - src/sandbox/presentation.determinism.test.ts
  - src/ui/hud.test.ts
  - src/ui/hud.ts
findings:
  critical: 1
  warning: 1
  info: 6
  total: 8
  necessity: 0
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-11-23T11:45:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

This is an incremental re-review of the fixes in 24b6c31..d64ad4c (diff base `60db3c4`). I read every changed hunk and the code around it. I traced the grace window through `trySave`, `service`, `backstop`, `onNudge` (tilt), bonus entry, `endBonus` (game over) and `onStart`. I also traced the presentation consumers that diff session counters: `PresentationObserver`, `LampTracker`, `EffectsTracker` and `HudView`.

Baseline: `npx vitest run` gives 60 files, 1280 passed. `npx tsc --noEmit` exits 0.

What holds:
- The grace state is cleared correctly. `savedAtStep` is reset on tilt, bonus entry, `onStart` and every backstop, so it cannot leak into another ball or game.
- The same-step WR-02 path reports `"backstop"` before the observer and lamps read it.
- A grace backstop does not raise `saveCount`, so it cannot replay the post flourish or the save sparks.
- IN-04's `skill.disarm()` in `reServe()` is safe: `SkillShot.update` does nothing in phase `off`.
- IN-01, IN-02, IN-03, IN-05 and WR-04 are correct.
- The WR-03 lamp positions match the old constants: 0.95/1.45/1.95 at y 1.32, and 0.585/2.315 at y 4.72.

What does not hold:
- **The CR-01 fix is incomplete (CR-01 below).** A fixed 240-step grace does not deliver the invariant the fix writes into the code ("the kick can only improve on the guaranteed save, never make it worse"). A kicked ball that drains more than 2 s after the kick, but still inside the original 7 s save window, still costs the ball. I ran a probe on the live e2e kickback trajectory. The kicked ball drained 603 steps after the kick and 868 steps after the chute exit, which is only 28 steps past the 840-step window. Real trajectories therefore land in the gap the fix leaves open.
- A grace backstop shows BALL SAVED but plays only the drain cue (WR-01).

Necessity was assessed with `necessity-review.md`. No finding met its evidence rule.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The kickback grace is a fixed 2 s, so a kicked ball that drains later but still inside the save window costs a ball (CR-01 only partly fixed)

**File:** `src/game/game-session.ts:427-429` (also `:572-579`, `src/game/tuning.ts:247-250`, `:261-267`)
**Issue:** `trySave()` consumes the save, so `save.canSave()` is false from the kick on. After that, only `inKickbackGrace()` (`step - savedAtStep <= KICKBACK_GRACE_STEPS`, 240) keeps the backstop alive. Without the kickback, a drain anywhere in the remaining window (`save.getRemaining()` at the kick, up to 840 steps) would have been backstopped.

Take a kick at window step `w` and a drain `d` steps later, where `240 < d <= 840 - w`:
- With the kickback, the ball enters `"bonus"` and is lost.
- Without the post, the ball would have drained right away and been re-served.

So the post leaves the player worse off, which is the exact symptom of the original CR-01 ("the ball still drains inside the save window, costing a ball"). It also breaks the rule the fix documents in `tuning.ts:249-250`: "the kick can only improve on the guaranteed save, never make it worse".

This is reachable on the real table. I probed `game-e2e.test.ts`' live kickback case:
- chute exit (save start) at session step 235
- kick at step 500, with about 575 window steps left
- drain at step 1103, which is 603 steps after the kick and 868 after the start

That drain missed the window by 28 steps. A kick-up that comes back any sooner lands in the hole: past the grace and inside the window. The e2e test only asserts `> KICKBACK_GRACE_STEPS`. It does not check the window, so the suite cannot catch this.

The grace also over-covers in the other direction. A kick on the window's last step stays protected for 240 more steps, after the window has expired and while the save lamp reads `off` (see IN-02).

**Fix:** Bound the grace by what the backstop would have covered, keeping the 2 s floor for the fall-straight-back case:
```ts
// field
private graceEndsAt = -1;

trySave(ballId: BallId): boolean {
  if (this.state !== "playing" || ballId === NO_BALL || ballId !== this.active) return false;
  const remaining = this.save.getRemaining(); // read BEFORE consume
  if (!this.save.consume("kickback")) return false;
  ...
  this.savedAtStep = this.step;
  this.graceEndsAt = this.step + Math.max(KICKBACK_GRACE_STEPS, remaining);
  return true;
}

private inKickbackGrace(): boolean {
  return this.savedAtStep >= 0 && this.step <= this.graceEndsAt;
}
```
Clear `graceEndsAt` wherever `savedAtStep` is cleared. Then add a session test: kick at window step 100, drain at kick + 600, and expect a re-serve. Add a matching e2e assertion as well: the kicked ball's real drain must lie past both the grace and the original window end.

The other path is a rule decision: a kickback ends the save by design. In that case, drop the "never make it worse" wording from `tuning.ts:247-250`, `game-session.ts:105-108` and the CR-01 entry in `06-REVIEW-FIX.md`, because the code does not deliver it.

## Warnings

### WR-01: A grace backstop shows BALL SAVED but sounds like a lost ball: drain cue and shake, no ballSave cue

**File:** `src/game/game-session.ts:411-413` (consumer `src/sandbox/presentation-observer.ts:224-236`)
**Issue:** On a grace backstop (`savedAtStep !== step`), `backstop()` raises `drainCount` and moves `lastSaveStep`, but leaves `saveCount` unchanged. The observer's sounds depend on the counters, not on `lastSaveStep`:
- the drain counter fires the drain cue, the apron flash and `fx.onDrain()` (shake)
- the `ballSave` cue fires only when the save counter goes up

So the player hears and feels the drain growl with no save chime. Meanwhile the HUD reads BALL SAVED, because `hud.ts:300-304` keys on `lastSaveStep`, and the ball reappears on the plunger.

A normal backstop plays growl then chime, as the observer doc at `presentation-observer.ts:30-33` describes. The grace path breaks that pairing at the moment the player most needs to be told the ball was not lost. The project treats perceptual mismatches as bugs.

**Fix:** Give the presentation a re-serve signal that does not count as a second save. One option is a `getReserveCount()` counter, raised in `backstop()` on every path. The observer then pushes the `ballSave` cue (with no `fx.onSave` sparks) when the re-serve counter goes up and the save counter does not.

A simpler alternative: in the grace path, set `lastSaveKind = "backstop"` and increment a separate `graceSaveCount` that the observer maps to the `ballSave` cue.

Either way, add an observer test: kickback, then a drain 100 steps later, must produce `drain` then `ballSave` cues.

## Info

### IN-01: SKILL SHOT can still outlive the ball, the same defect WR-01 fixed for BALL SAVED

**File:** `src/ui/hud.ts:297`, `:322-325`
**Issue:** WR-01 tied `saveOn` to `state === "playing"` and the session clears `lastSaveStep` when a ball is lost. `skillOn` got neither treatment:
- it is still `getSkillShotCount() > 0 && now < skillStep + STATUS_TRANSIENT_STEPS` (180)
- it ranks above the `gameOver` prompt (`:322` before `:325`)
- `lastSkillStep` is not cleared at bonus entry (`game-session.ts:385-386` clears only the save fields)

Here is a sequence that shows SKILL SHOT +N over GAME OVER for the rest of the 180-step window: a skill shot on ball 3, then a fast drain down the middle, then a flipper press that skips the tally (`BONUS_*` holds are skippable). The same sequence on ball 1 or 2 replays the previous ball's SKILL SHOT on the next serve. This needs a drain within about 1.5 s of the top lanes, so it is rare.
**Fix:** Gate `skillOn` like `saveOn` (`state === "playing" && skillStep >= 0 && ...`), and set `lastSkillStep = -1` next to `lastSaveStep = -1` at bonus entry.

### IN-02: The save lamp is off while the kickback grace still saves the ball

**File:** `src/game/game-session.ts:622-625`
**Issue:** `getSaveLampPhase()` reads `save.lampPhase()`, which is `"off"` once `trySave()` has consumed the save. During the grace, the ring around the post is dark, yet a drain is re-served. The player sees no save, gets a save, and (per WR-01) hears a drain. This is minor on its own. If CR-01 is fixed by extending the grace to the window end, though, the dark ring will cover several seconds of active protection.
**Fix:** Return `"blink"` (or `"steady"`) while `inKickbackGrace()` is true and the state is `"playing"`. Alternatively, write down that the grace is deliberately invisible.

### IN-03: The same-step path rewrites the session's save kind but not `BallSave`'s

**File:** `src/game/game-session.ts:412`
**Issue:** WR-02 sets `this.lastSaveKind = "backstop"`, while `BallSave.lastKind`, set by `consume("kickback")`, still reads `"kickback"`. Today `BallSave.getLastKind()` has no production caller (grep finds only its definition), so nothing breaks. It is still a second, now-divergent source of the same fact.
**Fix:** Either delete `BallSave.getLastKind()`/`lastKind`, or have the session own the kind entirely and document `BallSave`'s as "the kind passed to `consume`".

### IN-04: The test title still claims the skill phase carries over a backstop

**File:** `src/game/game-session.test.ts:1052`
**Issue:** The title reads "a backstop is the same ball: bonus counts, inlane flags, the skill phase and the ball number carry over". Since IN-04 (`reServe()` now calls `skill.disarm()`), the skill phase is reset, not carried. The test only passes because it resolves the skill shot first. The title now contradicts the rule pinned by the new test at `:1073`.
**Fix:** Rename it to "... bonus counts, inlane flags and the ball number carry over", or assert the disarm explicitly.

### IN-05: The chevron loop silently drops skill lanes beyond three, and the WR-03 test computes lamp indices by arithmetic

**File:** `src/render/lamps.ts:359-365`, `src/render/lamps.test.ts:607`
**Issue:** `SKILL_SHOT_LANES` is typed `readonly number[]` (`tuning.ts:180`), but `SKILL_LAMPS` holds 3 entries. The loop is bounded by both lengths, so adding a fourth lane would rotate onto a lane with no chevron, and nothing would complain. The `?? LAMP_SKILL_400` fallback at `:364` cannot fire, because the loop bound already guarantees the index. A wrong fallback lamp would be worse than none in any case.

The WR-03 test is the intended guard, but it looks shapes up with `LAMP_SKILL_400 + i`. For `i = 3` that is `6 === LAMP_INLANE_500`, so the test would compare the inlane arrow against the fourth lane. It would only fail by coincidence on geometry, not with a clear "no chevron for lane" message.
**Fix:** Add `expect(SKILL_SHOT_LANES.length).toBe(SKILL_LAMPS.length)`, or export `SKILL_LAMPS` and look shapes up by `SKILL_LAMPS[i]`. Typing `SKILL_SHOT_LANES` as a 3-tuple is another option. Drop the `??` fallback in favour of a `continue` on `undefined`.

### IN-06: The lamp shape table now pulls in the effects runtime for one geometry helper

**File:** `src/render/lamps.ts:55`
**Issue:** `buildLampShapes` imports `pathMidpoint` as a value from `effects.ts`. That module value-imports `deriveKickFace` (game rules), `ParticlePool` and `ShakeTracker`. As a result, `static-layer.ts` → `lamps.ts` → `effects.ts` now loads the whole effects stack just to bake lenses. There is no cycle today, but a pure geometry helper sits in a stateful effects module. `table-renderer.ts:86` already does the same.
**Fix:** Move `pathMidpoint` to a geometry module such as `render/sprites.ts` or `table/resolve.ts`, and import it from there in `effects.ts`, `lamps.ts` and `table-renderer.ts`.

---

_Reviewed: 2026-11-23T11:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
