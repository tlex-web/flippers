---
phase: 04-reactive-elements-game-rules
reviewed: 2026-11-20T00:00:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - index.html
  - src/app/collision-router.test.ts
  - src/control/flipper-controller.test.ts
  - src/control/flipper-controller.ts
  - src/control/plunger-controller.test.ts
  - src/control/plunger-controller.ts
  - src/game/game-session.test.ts
  - src/game/game-session.ts
  - src/game/reactive-elements.test.ts
  - src/game/reactive-elements.ts
  - src/game/reactive-table.test.ts
  - src/game/tilt-meter.test.ts
  - src/game/tilt-meter.ts
  - src/game/tuning.ts
  - src/harness/reactive-soak.test.ts
  - src/harness/reactive-table-soak.gate.test.ts
  - src/harness/reactive-world.ts
  - src/input/flipper-input.test.ts
  - src/input/flipper-input.ts
  - src/input/game-input.test.ts
  - src/input/game-input.ts
  - src/input/plunger-input.test.ts
  - src/input/plunger-input.ts
  - src/physics/constants.ts
  - src/physics/planck-world.ts
  - src/physics/types.ts
  - src/sandbox/debug-draw.ts
  - src/sandbox/game-e2e.test.ts
  - src/sandbox/game.determinism.test.ts
  - src/sandbox/main.ts
  - src/sandbox/plunger-e2e.test.ts
  - src/table/spec.ts
  - src/ui/hud.test.ts
  - src/ui/hud.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
  necessity: 0
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-11-20
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

I reviewed the Phase-4 rules stack: `GameSession` (the 3-ball FSM, nudge, tilt and flipper relay), `ReactiveElements` (bumper and sling kicks, rollovers, inlanes), `TiltMeter`, `tuning.ts`, the `GameInput` latch, the flipper enable gate, the plunger `applyEdges` and rest gate, the HUD, and the `main.ts` composition. I also read the loop (`src/sim/loop.ts`) and the router (`src/app/collision-router.ts`) because the session and the rules depend on how they order things.

Baseline: `npx vitest run` gives 32 files and 338 tests passing, and `tsc --noEmit` is clean.

The core logic holds up when traced by hand:
- Drain is recorded during dispatch and acted on in service, with remove before add.
- Tilt behaves correctly when it happens on the same step as a drain.
- A held key is pressed again on every serve.
- Score saturation is correct.
- The tilt worked numbers (1.0, 1.875, 2.75 warn, 3.625 tilt) check out.
- The cooldowns are counted in fixed steps.

One suspected FSM defect turned out not to be real. A press followed by a drop in the same step (a tap inside one window, or a tilt on the step a flipper key is pressed) could have left a bat stuck in `returning`. I ran a scratch probe against the real `PlanckWorld`: the bat moves about 0.035 rad and settles to `resting`, and the next real press works normally. So that is not a finding.

No blockers. The two warnings:
1. The tests that claim to prove "the main.ts composition" actually prove two hand-made copies of it.
2. The flipper input lets OS auto-repeat keydowns through without `preventDefault`. On Firefox that very likely lets a held `/` (the right flipper) open quick-find in the middle of a cradle.

Necessity was assessed using `necessity-review.md`; there are no necessity findings. The kind cross-checks in `ReactiveElements` guard against a router and a world that were injected separately and do not match, so they are defensible.

## Warnings

### WR-01: The e2e and determinism proofs test a hand-copied composition, not `main.ts`

**Files:** `src/sandbox/main.ts:103-205`, `src/sandbox/game-e2e.test.ts:103-173`, `src/sandbox/game.determinism.test.ts:109-171`

**Issue:** The shipped wiring exists three times, written out by hand each time: the flipper gate with its re-press on enable, the `onFixedStep` ordering, `if (ge.start && session.onStart()) reactive.resetLights()`, and the `onPostStep` order of dispatch, then reactive service, then session service. `main.ts` calls `main()` at module scope, so neither test can import it.

`game-e2e.test.ts:244` is titled "plays a full 3-ball game through the main.ts composition", and the determinism test says it builds "the exact `main.ts` composition". Both actually exercise their own copies.

Any change to the order in `main.ts` would leave all 338 tests green while the real game behaves differently. Examples: moving `session.service()` before `reactive.service()`, dropping `resetLights()`, or removing the re-press from the gate. That ordering is where the subtle game behavior lives, such as a kick landing before a drained ball is removed (Pitfall 5).

**Fix:** Move the composition into an importable factory that `main.ts` and both tests share:
```ts
// src/app/game.ts
export function createGame(world: PhysicsWorld, io: {
  flipperInput: FlipperInput; plungerInput: PlungerInput; gameInput: GameInput;
}) {
  const controller = new FlipperController(world);
  const plunger = new PlungerController(world);
  const router = new CollisionRouter(world);
  /* flippersByX, flipperGate, session, reactive ... exactly as main.ts today */
  function onFixedStep(): void { /* ... */ }
  function onPostStep(): void { router.dispatch(); reactive.service(); session.service(); }
  return { controller, plunger, router, session, reactive, onFixedStep, onPostStep };
}
```
`main.ts` keeps only the DOM, the loop and rendering. `makeGame()` and `play()` call `createGame(new PlanckWorld(), ...)`.

### WR-02: Auto-repeat keydowns on the flipper keys are not `preventDefault`ed (Firefox quick-find on a held `/`)

**File:** `src/input/flipper-input.ts:119-123` (locked in by `src/input/flipper-input.test.ts:36-42`)

**Issue:** `handleKeyDown` returns on `e.repeat` before it calls `preventDefault()`. Only the first keydown of a hold is suppressed; every OS auto-repeat keydown for `Slash`, `ArrowLeft` and `ArrowRight` reaches the browser's default handling.

On Firefox, `/` opens quick-find. Holding the right flipper on `/` to cradle (any hold past the roughly 500 ms repeat delay) lets a repeat through. That very likely opens the find bar, which takes focus. The `blur` handler then force-releases the bat while the key is still physically down, and later keystrokes go into the find bar.

The repeat arrows would also scroll the page if it ever overflows.

The two latches written in this phase already use the correct order: `game-input.ts:91-93` and `plunger-input.ts:63-64` call `preventDefault()` first and then check `repeat`. The flipper test (`flipper-input.test.ts:42`) asserts the defective behavior.

I could not run a real browser here, so the Firefox focus steal is reasoned from documented quick-find behavior, not observed.

**Fix:**
```ts
handleKeyDown(e: KeyEventLike): void {
  const side = CODE_TO_SIDE.get(e.code);
  if (!side) return;
  e.preventDefault();          // bound codes, including auto-repeats
  if (e.repeat) return;
  if (this.held.has(e.code)) return;
  ...
}
```
Change the test to expect `preventDefault` to be called once on a repeat `KeyZ`, with no edge latched.

## Info

### IN-01: A second kick on the same ball in one `service()` reads a stale velocity snapshot

**File:** `src/game/reactive-elements.ts:282-301`

**Issue:** `kick()` reads `b.vx` and `b.vy` from `world.getBalls()`. `PlanckWorld` refreshes that pooled snapshot only at the end of `step()` (`planck-world.ts:762-775`), and `applyImpulse` does not update it (`planck-world.ts:845-859`). If two kickers queue the same ball in one step, the second impulse is computed from the velocity before the first kick. The ball then leaves faster than either target, which breaks the "raised to the target" law.

This cannot happen on `TABLE_SPEC` today. Bumper rim gaps are at least 0.46 m, more than the 0.40 m ball, and the slings sit far from the bumpers. But the module is table-agnostic, and no test covers one ball with two kickers.

**Fix:** In `service()`, track the velocity change already applied to each ball in this pass and add it to `vx`/`vy` before computing `vn`. Or collect the queued normals per ball and resolve them in one impulse.

### IN-02: For one render frame after a drain or serve, the drained ball still shows and the new ball is missing

**Files:** `src/sim/loop.ts` (`advance`: `snapshotInto(current)` runs before `onPostStep`), `src/sandbox/main.ts:201-205, 249-268`

**Issue:** `session.service()` removes the drained ball and adds the next one inside `onPostStep`, after the loop has already taken `current`. When the drain step is the last fixed step of a frame (about half the time at 60 fps), the renderer draws the removed ball frozen at the drain line, and nothing on the plunger, for one frame. After the last ball, the drained ball likewise lingers for one frame. Kick velocities are also missing from `current.vx/vy` (the velocity vector drawing) until the next step.

The effect is small, but this project treats visual defects as bugs.

**Fix:** Have `FixedStepLoop` take the `current` snapshot again after `onPostStep` returns. Keep the snapshot taken before the hook so a hook that throws still leaves a valid state.

### IN-03: `applyEdges` loses a press-release-press tap that lands inside one fixed-step window from idle

**File:** `src/control/plunger-controller.ts:139-143`

**Issue:** With `heldNow` true and both `press` and `release` latched, the order applied is release (a no-op while idle) and then press. If the real sequence was press, release, press while the plunger was idle, the tap launch is lost and a fresh charge starts instead. A human cannot do this inside 8.3 ms, but switch bounce could.

**Fix:** Use `this.phase` to break the tie. When `heldNow && press && release && this.phase === "idle"`, apply press, then release, then press.

### IN-04: A ball that never reaches the drain sensor soft-locks the game

**File:** `src/game/game-session.ts:142-158, 283-285`

**Issue:** A ball can only end through the drain sensor event, and `onStart()` is refused while `"playing"` or `"tilted"`. A ball that comes to rest somewhere unreachable, or escapes containment (the soaks guard against this but do not rule it out by construction), leaves no way to continue or restart without reloading the page. Real machines run a ball search. I found no stuck spot on `TABLE_SPEC`, so this rests on judgment.

**Fix:** Add a timeout in fixed steps: if the active ball has stayed below a speed threshold outside `PLUNGER_ZONE` for N steps, treat it as drained, or let a long-held Start force game-over.

### IN-05: The controls hint uses "/" both as a separator and as the Slash key

**File:** `index.html:82-85`

**Issue:** "Z / ← / Left Shift left flipper · / / → / Right Shift right flipper" reads as an ambiguous run of slashes, and players cannot tell that `/` is one of the right-flipper keys.

**Fix:** Use a different separator, for example `Z · ← · L-Shift — left flipper | / · → · R-Shift — right flipper`, or show each key as a styled key cap.

---

_Reviewed: 2026-11-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
