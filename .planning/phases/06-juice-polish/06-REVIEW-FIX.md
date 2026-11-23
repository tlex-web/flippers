---
phase: 06-juice-polish
fixed_at: 2026-11-23T10:02:54Z
review_path: .planning/phases/06-juice-polish/06-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-11-23T10:02:54Z
**Source review:** .planning/phases/06-juice-polish/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (fix_scope: all, so the necessity finding WR-04 was included and done last)
- Fixed: 10
- Skipped: 0

## Verification

- The per-fix checks (targeted `vitest run`, `tsc --noEmit`, eslint on touched files) ran in the isolated worktree `.claude/worktrees/rf-06-28633-*`. That worktree resolves `node_modules` from the main checkout's parent directory.
- The final gates ran in BOTH places. First in the worktree, then again in the **main checkout** after the fast-forward to `d64ad4c`, so the main-checkout numbers can be reproduced from this tree:
  - `npx vitest run`: 60 files, **1280 passed**, 0 failed (baseline before the fixes: 1264)
  - `npx tsc --noEmit`: exit 0
  - `npx eslint .`: exit 0 (checked in the worktree)
- Not run: `npm run soak`, the 10-minute physics gate. Its harness (`src/harness/reactive-world.ts`) uses no `GameSession`, and no physics or reactive-element code changed.
- Prettier `--check` warns on the touched files. It warned on them before these edits too: the repo files are CRLF and `.prettierrc` sets `endOfLine: lf`. CRLF was kept.

## Fixed Issues

### CR-01: A kickback spends the ball save, and the ball still drains inside the save window, costing a ball

**Files modified:** `src/game/tuning.ts`, `src/game/game-session.ts`, `src/game/game-session.test.ts`, `src/sandbox/game-e2e.test.ts`, `src/sandbox/game.determinism.test.ts`, `src/sandbox/presentation.determinism.test.ts`
**Commit:** 24b6c31
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- Added `KICKBACK_GRACE_STEPS = 240` (2 s). `service()` now backstops a drain when `save.canSave()` is true or `inKickbackGrace()` is true (`savedAtStep >= 0 && step - savedAtStep <= KICKBACK_GRACE_STEPS`).
- A grace backstop does not count again. It moves `lastSaveStep` to the re-serve step so the HUD shows BALL SAVED for the re-serve.
- `savedAtStep` is cleared on tilt, on bonus entry and on start.
- The old test "kickback then LATER drain is real" was replaced by three tests: a re-serve at the last grace step with `saveCount` unchanged, a real drain after the grace, and a tilt or bonus ending the grace.
- The live e2e kickback test now asserts that its drain lands past the grace. If tuning moves it inside the grace, the test fails loudly.
- The two scripted determinism games now run 40 s instead of 30 s. The extra re-serve kept ball 3's tally running at 30 s, so the game had not reached game over. Following the file's own rule ("move script steps, never assertions"), only the length changed and every assertion is the same.

### WR-01: "BALL SAVED" (and the live-region announcement) can outlive a lost ball and override the game-over prompt

**Files modified:** `src/ui/hud.ts`, `src/ui/hud.test.ts`, `src/game/game-session.ts`, `src/game/game-session.test.ts`
**Commit:** c262aa1
**Status:** fixed: requires human verification (logic change)
**Applied fix:** Both of the review's options are applied. `GameSession` sets `lastSaveStep = -1` on bonus entry and in `onStart()`. The HUD's `saveOn` now also requires `state === "playing"` and `saveStep >= 0`. New tests cover: GAME OVER beating BALL SAVED inside the window, a cleared save step showing nothing, and the session clearing the step when a ball is lost.

### WR-02: The same-step kickback+drain path plays the post flourish and save sparks for a ball that was removed and re-served

**Files modified:** `src/game/game-session.ts`, `src/game/game-session.test.ts`
**Commit:** fd1c559
**Status:** fixed: requires human verification (logic change)
**Applied fix:** In `backstop()`, when `savedAtStep === step`, `lastSaveKind` becomes `"backstop"`. The save still counts once. `LampTracker` and `EffectsTracker` key on `"kickback"`, so the flourish and the sparks no longer fire for that case. The same-step test now expects `"backstop"`.

### WR-03: Lamp geometry and skill-shot lanes are hard-coded copies of spec positions and ids

**Files modified:** `src/render/lamps.ts`, `src/render/lamps.test.ts`
**Commit:** b2d9349
**Applied fix:**
- Chevrons are placed at `CHEVRON_DROP_M` (0.37) below `pathMidpoint` of each `SKILL_SHOT_LANES` rollover.
- Inlane arrows are placed at `ARROW_RISE_M` (0.23) above `pathMidpoint` of lane sensors 500 and 501, using a new `INLANE_LAMPS` table that `update()` also reads (an indexed loop, no allocation).
- `skillLampOf` now maps by the `SKILL_SHOT_LANES` slot. Positions on the current table are unchanged; the existing geometry tests still pass.
- For `SKILL_SHOT_LANES`, I added a test instead of deriving the list or asserting at module load. The test checks that every skill lane is a `TABLE_SPEC` rollover, in left-to-right order, with its chevron under its midpoint. A second test checks the arrows. Keeping the list explicit keeps the choice of skill lanes a rule decision.

### IN-01: `parseBest` accepts hex, exponent and padded strings, contrary to its "decimal integer string" contract

**Files modified:** `src/game/high-score.ts`, `src/game/high-score.test.ts`
**Commit:** 195a0bb
**Applied fix:** `parseBest` now returns 0 unless `raw` matches `/^(0|[1-9]\d*)$/`, checked before `Number()`. Added cases: `0x10`, `1e3`, `0b11`, `0o7`, ` 42 `, `+42`, `007`, `42\n`.

### IN-02: Dead code left by Phase 6

**Files modified:** `src/game/bonus.ts`, `src/game/bonus.test.ts`, `src/render/table-renderer.ts`
**Commit:** 078f337
**Applied fix:** Deleted `BonusTally.clearForfeit()` and its test lines. Deleted the unused exported `LightState` from table-renderer.ts; debug-draw.ts keeps its own copy.

### IN-03: The render layer imports a type from the sandbox composition root

**Files modified:** `src/app/cue-queue.ts`, `src/render/effects.ts`, `src/sandbox/presentation-observer.ts`
**Commit:** 01ed0ab
**Applied fix:** `ObserverFx` moved next to `FxSink` in `app/cue-queue.ts`. effects.ts imports it from there. presentation-observer imports it and re-exports the type, so its test and other consumers did not change. Nothing in `src/render`, `src/app`, `src/game` or `src/ui` imports from `../sandbox` any more.

### IN-04: A backstop re-serve can reopen an unresolved skill shot, giving the same ball a second attempt

**Files modified:** `src/game/game-session.ts`, `src/game/game-session.test.ts`
**Commit:** 40295c0
**Status:** fixed: requires human verification (rule decision)
**Applied fix:** I chose one skill shot per ball: `reServe()` calls `this.skill.disarm()`, and the docs were updated to match. A new test pins it: frozen skill shot, then backstop, then phase is `off`, the lit lane is -1, and a rollover awards nothing. If a second attempt was intended, revert this commit and flip the test.

### IN-05: The lamp shape table is built twice

**Files modified:** `src/render/static-layer.ts`, `src/render/table-renderer.ts`
**Commit:** 31819a1
**Applied fix:** `bakeStatic` takes an optional `lampShapes` parameter, defaulting to `buildLampShapes(elements)`. `TableRenderer.resize()` passes `this.lampShapes`.

### WR-04: Impossible-state guard — `NUDGE_DIRS[dir]` undefined check in `ShakeTracker.kick`

**Files modified:** `src/render/shake.ts`
**Commit:** d64ad4c
**Status:** fixed: requires human verification (necessity finding, code removed)
**Applied fix:** Removed `if (!d) return;`. `tsc` still passes, since a `Record<NudgeDir, Vec2>` lookup on a `NudgeDir` key is typed `Vec2`.

## Notes

- Commits were made with plain `git commit`, one per finding, staging only that finding's files, not with `gsd_run query commit`. The unrelated working-tree changes (`.planning/config.json`, `.planning/research/.cache/`, `.planning/state.json`) were never staged.
- Worktree cleanup finished: `gsd/phase-03-table-plunger-event-bus` was fast-forwarded to `d64ad4c`, the worktree was removed, the temp branch `gsd-reviewfix/06-28633` was deleted and the recovery sentinel was removed.

---

_Fixed: 2026-11-23T10:02:54Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
