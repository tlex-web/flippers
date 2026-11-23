---
phase: 06-juice-polish
reviewed: 2026-11-23T00:00:00Z
depth: standard
files_reviewed: 50
files_reviewed_list:
  - index.html
  - src/app/cue-queue.test.ts
  - src/app/cue-queue.ts
  - src/audio/recipes.test.ts
  - src/audio/recipes.ts
  - src/control/plunger-controller.ts
  - src/game/ball-save.test.ts
  - src/game/ball-save.ts
  - src/game/bonus.test.ts
  - src/game/bonus.ts
  - src/game/game-session.test.ts
  - src/game/game-session.ts
  - src/game/high-score.test.ts
  - src/game/high-score.ts
  - src/game/reactive-elements.test.ts
  - src/game/reactive-elements.ts
  - src/game/reactive-table.test.ts
  - src/game/skill-shot.test.ts
  - src/game/skill-shot.ts
  - src/game/tuning.ts
  - src/harness/reactive-soak.test.ts
  - src/harness/reactive-table-soak.gate.test.ts
  - src/harness/reactive-world.ts
  - src/render/effects.ts
  - src/render/flash.test.ts
  - src/render/flash.ts
  - src/render/lamps.test.ts
  - src/render/lamps.ts
  - src/render/palette.ts
  - src/render/particles.test.ts
  - src/render/particles.ts
  - src/render/shake.test.ts
  - src/render/shake.ts
  - src/render/sprites.ts
  - src/render/static-layer.test.ts
  - src/render/static-layer.ts
  - src/render/table-renderer.test.ts
  - src/render/table-renderer.ts
  - src/sandbox/cue-pipeline.test.ts
  - src/sandbox/debug-draw.ts
  - src/sandbox/game-e2e.test.ts
  - src/sandbox/game.determinism.test.ts
  - src/sandbox/main.ts
  - src/sandbox/presentation-observer.test.ts
  - src/sandbox/presentation-observer.ts
  - src/sandbox/presentation.determinism.test.ts
  - src/sandbox/skill-shot-e2e.test.ts
  - src/table/spec.ts
  - src/ui/hud.test.ts
  - src/ui/hud.ts
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
  necessity: 1
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-11-23
**Depth:** standard
**Files Reviewed:** 50
**Status:** issues_found

## Summary

I reviewed the Phase-6 changes (diff 710326a..HEAD): skill shot, bonus tally, ball save and center-post kickback, high score, lamps, shake, particles, shadows and the static bake, the HUD and bonus overlay, the new cues and recipes, and the main.ts wiring. `tsc --noEmit` passes. The pure modules are tidy: no per-frame allocation, everything runs on the step clock, storage access is guarded, and the DOM is written with text only.

The main defect is in the ball save. The center-post kickback spends the one save per ball on a kick that does not reliably keep the ball in play. The backstop only covers a drain on the exact step of the kickback, so a ball that falls back and drains a few hundred milliseconds later costs the player a ball even though the 7 s save window was still running. I confirmed this with a headless probe against the real `PlanckWorld` + `TABLE_SPEC`, described in CR-01.

The other findings: a transient HUD status that can outlive the ball it describes, a post flourish that plays for a save that never kicked, lamp geometry that duplicates the spec, and minor cleanups.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A kickback spends the ball save, and the ball still drains inside the save window, costing a ball

**File:** `src/game/reactive-elements.ts:464-471`, `src/game/game-session.ts:361`, `src/game/game-session.ts:537-545`, `src/game/tuning.ts:244-265`
**Issue:** The contract in `tuning.ts:244` says: "While it runs, a drain costs no ball (the backstop re-serve) or the center-post kickback saves it". The backstop is a guarantee. The kickback is not, yet it takes priority: `onPost` calls `trySave()`, which `consume("kickback")`s the save. The session then honors a backstop only when the drain lands on the same step (`this.savedAtStep === this.step`, line 361). Any later drain falls through to the bonus state, and the ball is gone.

Probe (headless, scratch test using the real `PlanckWorld`, `CollisionRouter`, `ReactiveElements` and `TABLE_SPEC`, flippers dead, ball dropped on the mirror axis): every drop got its kickback (`vy` after the kick about -5.4 m/s, so the kick works as designed). But a dead-center drop came straight back down through the bat gap and hit the drain sensor 100 steps (0.83 s) after the kick, for `vy0` = 1, 3 and 6 m/s. With the bats held up, 8 of 12 drops at offsets 0 to 0.28 m drained 32 to 115 steps after the kick. In the game, each of those drains is a real drain: the save was already spent, `canSave()` is false, and `savedAtStep !== step`. The player loses the ball in the middle of the save window. On the screen they also saw "BALL SAVED", the save sting, the save sparks and the post flourish a moment earlier. `game-session.test.ts:1213` ("a kickback followed by a drain on a LATER step is a real drain") and the e2e test at `game-e2e.test.ts:1058` pin this behavior instead of catching it.

**Fix:** Keep the backstop live for a short grace window after a kickback, so the kickback can only improve on the guaranteed save, never make it worse. Count it once, as the kickback (same rule as A4):
```ts
// tuning.ts
/** Steps after a kickback during which a drain of the same ball is still backstopped (2 s). */
export const KICKBACK_GRACE_STEPS = 240;

// game-session.ts service()
const inKickbackGrace =
  this.savedAtStep >= 0 && this.step - this.savedAtStep <= KICKBACK_GRACE_STEPS;
if (this.state === "playing" && (this.save.canSave() || inKickbackGrace)) {
  this.backstop();
  return;
}
// backstop(): count only when no kickback is in grace
if (!inKickbackGrace && this.save.consume("backstop")) { ... }
this.savedAtStep = -1;
```
Also clear `savedAtStep` on a tilt and when entering the bonus state. Add a test for a kickback followed by a drain within the grace window: the result should be a backstop re-serve with `saveCount` unchanged. Another option is to give the kick a lateral component toward a bat, so it does not return straight down the gap. The grace window is the simpler change and keeps the contract.

## Warnings

### WR-01: "BALL SAVED" (and the live-region announcement) can outlive a lost ball and override the game-over prompt

**File:** `src/ui/hud.ts:296-298`, `src/ui/hud.ts:314-315`, `src/game/game-session.ts:314-327`
**Issue:** `saveOn` is `getSaveCount() > 0 && now < getLastSaveStep() + 180`. That depends only on time, not on the ball or the state, and `onStart()` resets neither value. With the CR-01 flow (kickback at S, drain at S+32 in the probe, empty tally, 60-step hold), the next ball is served at S+92 and the status line reads "BALL SAVED" for the next 88 steps, right after a ball was lost. On the last ball, BALL SAVED (priority 5) beats the GAME OVER prompt (priority 6) for the same window. The status line is `role="status" aria-live="polite"`, so a screen reader announces "BALL SAVED" after the ball drained.
**Fix:** Keep the transient only while the ball it belongs to is still in play. Record the ball number at the save (`lastSaveBall = this.ball`, cleared on serve, drain-to-bonus and `onStart()`), and require `state === "playing" && session.getBall() === lastSaveBall` for `saveOn`. Alternatively, have `GameSession` set `lastSaveStep = -1` when it enters the bonus state, and in `onStart()`.

### WR-02: The same-step kickback+drain path plays the post flourish and save sparks for a ball that was removed and re-served

**File:** `src/game/game-session.ts:385-396`, `src/render/lamps.ts:533-537`, `src/render/effects.ts:291-312`
**Issue:** When `trySave()` grants a kickback and the drain lands on the same step, `backstop()` removes the ball and re-serves it at the plunger. `lastSaveKind` stays `"kickback"`. `LampTracker.updateSave` then starts the post flourish, and `EffectsTracker.onSave("kickback")` throws 10 save sparks up off the post, but there is no ball there: it is sitting on the plunger. The observer also pushes the drain growl, the drain shake and the drain flash. The player sees a kick that did not happen. This project treats visual defects as bugs.
**Fix:** In `backstop()`, when `savedAtStep === step`, set `lastSaveKind = "backstop"` (it still counts once). Or expose a `wasKicked` flag the presentation reads. The flourish and sparks should play only when the kick was actually applied to a live ball.

### WR-03: Lamp geometry and skill-shot lanes are hard-coded copies of spec positions and ids

**File:** `src/render/lamps.ts:113-131`, `src/game/tuning.ts:180`
**Issue:** The chevron centers (`CHEVRON_XS_M = [0.95, 1.45, 1.95]`, `CHEVRON_Y_M = 1.32`) and the inlane arrow center (`ARROW_CX_M = 0.585`, `ARROW_CY_M = 4.72`) duplicate the rollover and inlane positions in `spec.ts:369-398` by hand. `SKILL_SHOT_LANES` and `skillLampOf` hard-code ids 400 to 402. The rollover lenses and the post ring are derived from the resolved elements, and spec.ts says it is the single origin of table geometry. If a lane moves, the chevrons and arrows silently stop lining up with what they light, and no test would notice.
**Fix:** In `buildLampShapes`, derive the chevron x from each rollover element's midpoint (`pathMidpoint`) plus a fixed down-table offset, and the arrow x/y from each lane element's midpoint plus an offset. Derive `SKILL_SHOT_LANES` from `TABLE_SPEC` rollovers sorted by x, or at least assert at module load that every id exists as a rollover.

### WR-04: Impossible-state guard — `NUDGE_DIRS[dir]` undefined check in `ShakeTracker.kick`

**File:** `src/render/shake.ts:142-143`
**Category:** necessity
**Issue:** `NUDGE_DIRS` is `Readonly<Record<NudgeDir, Vec2>>` (`tuning.ts:127`) and `dir: NudgeDir`, so the lookup is typed `Vec2` and always defined for every member of the union. The only caller is `EffectsTracker.onNudge`, which forwards `session.getLastNudgeDir()` (typed `NudgeDir`), so no untrusted data reaches it. `if (!d) return;` guards a state that cannot occur.
**Fix:** Remove the guard; `const d = NUDGE_DIRS[dir];` is enough.

## Info

### IN-01: `parseBest` accepts hex, exponent and padded strings, contrary to its "decimal integer string" contract

**File:** `src/game/high-score.ts:44-48`
**Issue:** `Number(raw)` accepts `"0x10"` (16), `"1e3"` (1000), `"0b11"` and `" 42 "`, which all pass `isSafeInteger`. The header says the best is stored as a decimal integer string. This does no harm, but it is not the strict parse the doc claims.
**Fix:** `if (raw === null || !/^(0|[1-9]\d*)$/.test(raw)) return 0;` before the `Number()`.

### IN-02: Dead code left by Phase 6

**File:** `src/game/bonus.ts:122-125`, `src/render/table-renderer.ts:155-162`
**Issue:** No production code calls `BonusTally.clearForfeit()`. `snapshot()` already clears the flag. The `LightState` interface in table-renderer.ts is exported with a doc comment saying the renderer no longer reads it, and debug-draw.ts has its own copy.
**Fix:** Delete both.

### IN-03: The render layer imports a type from the sandbox composition root

**File:** `src/render/effects.ts:35`
**Issue:** `EffectsTracker` implements `ObserverFx`, which is imported from `../sandbox/presentation-observer`. Render now depends on sandbox, the composition layer. `FxSink` was placed in `app/cue-queue.ts` for exactly this reason.
**Fix:** Move `ObserverFx` next to `FxSink` in `src/app/cue-queue.ts`, or to a small `app/fx.ts`, and import it from there in both modules.

### IN-04: A backstop re-serve can reopen an unresolved skill shot, giving the same ball a second attempt

**File:** `src/game/game-session.ts:760-762`, `src/game/skill-shot.ts:83-88`
**Issue:** If the saved ball drained without touching a scoring switch, the skill shot is still `"frozen"`. `reServe()` puts a ball back to rest in `PLUNGER_ZONE` with the plunger idle, so `update(..., true)` reopens the rotation and the same ball gets a second skill shot. Research A3 says the skill shot "carries over"; it is unclear whether a second attempt was intended.
**Fix:** If not intended, call `this.skill.disarm()` in `reServe()`. Either way, add a test that pins the chosen behavior.

### IN-05: The lamp shape table is built twice

**File:** `src/render/static-layer.ts:474`, `src/render/table-renderer.ts:331`
**Issue:** `bakeStatic` calls `buildLampShapes(elements)` on every resize, while `TableRenderer` already holds the same table from its constructor. This is a harmless allocation at bake time, but it creates two sources for one table.
**Fix:** Pass `this.lampShapes` into `bakeStatic`, as an optional parameter with the current call as the default.

---

_Reviewed: 2026-11-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
