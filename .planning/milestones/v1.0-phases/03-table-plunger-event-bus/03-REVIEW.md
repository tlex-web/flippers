---
phase: 03-table-plunger-event-bus
reviewed: 2026-11-19T22:39:15Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - src/app/collision-router.ts
  - src/app/collision-router.test.ts
  - src/control/flipper-controller.ts
  - src/control/flipper-controller.test.ts
  - src/control/plunger-controller.ts
  - src/control/plunger-controller.test.ts
  - src/harness/soak.ts
  - src/harness/flipper-feel.test.ts
  - src/harness/stability.test.ts
  - src/harness/table-soak.test.ts
  - src/harness/table-soak.gate.test.ts
  - src/input/plunger-input.ts
  - src/input/plunger-input.test.ts
  - src/physics/constants.ts
  - src/physics/planck-world.ts
  - src/physics/types.ts
  - src/physics/collision-event.test.ts
  - src/physics/sensor-event.test.ts
  - src/physics/planck-world.smoke.test.ts
  - src/physics/substep.test.ts
  - src/sandbox/debug-draw.ts
  - src/sandbox/main.ts
  - src/sandbox/launch-and-route.test.ts
  - src/sandbox/plunger-e2e.test.ts
  - src/sim/loop.ts
  - src/sim/loop.determinism.test.ts
  - src/sim/loop.tabblur.test.ts
  - src/table/spec.ts
  - src/table/resolve.ts
  - src/table/resolve.test.ts
  - src/table/table-world.test.ts
findings:
  critical: 2
  warning: 5
  info: 5
  total: 12
  necessity: 0
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-11-19T22:39:15Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

I reviewed the spec-driven table (spec/resolve), the Planck adapter rewrite (spec fixtures, sensor begin-contact path, normalized events), the plunger stack (input latch, controller, sandbox wiring), the collision router, the loop's `onPostStep` seam, and the real-table soak.

Two defects are proven, not inferred. I confirmed both with throwaway headless probes that drove the real modules and then deleted them:

1. **The sandbox's drain check sits above the plunger rest position.** The parked ball counts as "drained" on every frame, so it is removed and re-added every frame. On a 120/144 Hz display no plunger launch ever leaves the chute; at 60 Hz, weak launches are eaten. The headless e2e tests miss this because none of them reproduce the `main.ts` drain-feed.
2. **Sensor events carry a stale contact point.** Planck's `getWorldManifold` returns the shared `scratchWm` untouched when `pointCount == 0`. Lane, rollover and drain events therefore report the last solid contact's point, not the ball's center. `sensor-event.test.ts` passes only because its world has never written `scratchWm`.

The warnings are robustness and fidelity gaps on the same surfaces:
- the CCD-priming step runs the whole world;
- interpolation is paired by index across a respawn;
- the flipper is drawn larger than its collider;
- a listener that throws freezes the loop;
- the real-table containment gate cannot see bumpers.

I found no necessity findings (rubric read). The guards I checked are trust-boundary or test-seam code, or idiomatic `noUncheckedIndexedAccess` narrowing.

## Critical Issues

### CR-01: The plunger rest position is below the drain line, so the parked ball respawns every frame and launches are lost

**File:** `src/sandbox/main.ts:201-205` (with `src/table/spec.ts:194`, `src/table/spec.ts:200`)
**Issue:** `DRAIN_Y = 6.05` but `PLUNGER_REST.y = 6.2`, and the parked ball settles at y ≈ 6.195. The feed check is `activeBall.y > DRAIN_Y`. It ignores x, even though the drain sensor only spans x ∈ [0.86, 2.04]. So the ball parked in the chute is "drained" on every render frame: `removeBall`, then `addBall`, and `addBall` runs an extra whole-world `world.step` through `primeBallCcd`.

Results, from the probe emulating the `main.ts` frame loop with real `PlungerInput`/`PlungerController`/`FixedStepLoop`:
- At 60 fps a full-charge launch survives only because 2 fixed steps run before the check (y 6.2 → ~6.0). A short tap (minimum impulse, ~3.2 m/s) is eaten: 600 respawns in 600 frames, and the ball never got higher than y = 6.13.
- At 120 Hz and 144 Hz, only 1 step runs per frame (~0.1 m at 12 m/s → y ≈ 6.10 > 6.05). **Every launch, including full charge, is eaten.** The ball never leaves the plunger (minY 6.10), with 600 respawns in 600 frames.
- Even when nothing is pressed, every frame destroys and creates a Planck body, fixtures and `Vec2`s. That breaks the zero-allocation 60 fps rule. The extra priming `world.step` also advances both flippers by an additional 1/120 s each frame, and `nextId` grows without limit.

`plunger-e2e.test.ts` and `launch-and-route.test.ts` do not run the drain-feed, so the suite stays green.
**Fix:** Drive the respawn from the drain sensor on the bus, which exists for exactly this. Run it at the fixed-step seam rather than in the render frame:
```ts
let drainedBallId: number | null = null;
router.register((e) => {
  if (e.elementKind === "drain" && e.ballId === activeBallId) drainedBallId = e.ballId;
});
function onPostStep(): void {
  router.dispatch();
}
// in frame(), after loop.advance(...):
if (drainedBallId !== null) {
  world.removeBall(drainedBallId);
  activeBallId = world.addBall(BALL_SPAWN);
  drainedBallId = null;
}
```
If you keep a positional check instead, at least exclude the plunger lane: `activeBall.y > DRAIN_Y && activeBall.x < PLUNGER_ZONE.minX`. Add an e2e test that runs the real `main.ts` feed logic at 1 step per frame and asserts that a full-charge launch clears the chute top.

### CR-02: Sensor events (lane/rollover/drain) report a stale point from an unrelated contact

**File:** `src/physics/planck-world.ts:398-409` (also `src/physics/planck-world.ts:769-781`, `src/physics/planck-world.ts:340`)
**Issue:** `emitContact` calls `contact.getWorldManifold(this.scratchWm)` and only falls back to the ball center when `wm.pointCount === 0`. Planck's `Manifold.getWorldManifold` (`node_modules/planck/dist/planck.mjs:4855-4858`) does `if (this.pointCount == 0) return wm;`, which hands back the caller's object **unmodified**. A sensor manifold always has 0 points. `scratchWm` is shared and still holds the last solid manifold written by a post-solve or by `syncContactPoints`, so `wm.pointCount > 0` and `points[0]` is a stale point from some other contact. The fallback almost never runs in real play.

Probe: ball A parked on the plunger, ball B dropped through rollover 401. The rollover event's point was `(3.15, 6.39)`, which is ball A's chute-floor contact. Ball B was at `(1.45, 0.75)`. This breaks the documented `CollisionEvent.point` contract (`src/physics/types.ts:123-127`: "For a sensor ... this is the ball's center"). It also breaks with a single ball: any sensor hit after a wall, bumper or flipper contact carries that earlier contact's point.

The same root cause feeds `syncContactPoints`. Sensor contacts are `isTouching()` while they overlap, so each one pushes duplicate stale points into `getContactPoints()`. A ball resting over the drain line puts a phantom contact marker into the debug draw on every step.

`sensor-event.test.ts:96-97` passes only because a freshly built world has never written `scratchWm`. Its zero-initialized `pointCount` makes the fallback run.
**Fix:** Do not trust a reused manifold for zero-point contacts. Check the contact's own manifold first:
```ts
const manifold = contact.getManifold();
if (manifold.pointCount > 0) {
  const wm = contact.getWorldManifold(this.scratchWm);
  const first = wm?.points[0];
  evt.point.x = first!.x; evt.point.y = first!.y;
} else {
  const ballFixture = a.kind === "ball" && a.id === evt.ballId ? fa : fb;
  const center = ballFixture.getBody().getPosition();
  evt.point.x = center.x; evt.point.y = center.y;
}
```
In `syncContactPoints`, skip a contact when `c.getManifold().pointCount === 0` or when either fixture is a sensor. Add a regression test that puts a second ball in solid contact (or steps a solid contact first) and then asserts the sensor event's point equals the ball center.

## Warnings

### WR-01: `addBall` steps the entire world outside the loop, which breaks the one-batch-per-step bus contract and determinism

**File:** `src/physics/planck-world.ts:672-696` (called from `src/sandbox/main.ts:203-204`)
**Issue:** `primeBallCcd` calls `this.world.step(FIXED_DT, ...)` on the whole world. Every other ball and both flipper motors advance one extra 1/120 s step that the `FixedStepLoop` never counts. Contacts from that hidden step (the new ball against the chute floor, and any other ball's contacts) go into the event pool and come out merged into the next real step's batch. That violates the router's "exactly one deterministic batch per simulated step" contract (`src/app/collision-router.ts:5-9`). In `main.ts` the respawn runs in the render frame (`frame()`), so the extra step lands at a wall-clock-dependent moment. A replay of the same input script then diverges with frame timing, which conflicts with the T-03-11 determinism claim. The code predates this phase, but this phase is the first to call `addBall` at runtime during play, and CR-01 makes it run every frame.
**Fix:** Prime without stepping the world. For example, put the ball and primer in a throwaway world, or set the other bodies inactive during the prime step (`setActive(false)`, then restore) and drain/discard events produced inside `primeBallCcd`. At minimum, discard events emitted during priming (save `eventCount` before and restore it after) and move the respawn into `onPostStep` so it happens at a fixed-step boundary.

### WR-02: Render interpolation pairs balls by array index, so a respawn draws a one-frame streak from the drain to the plunger

**File:** `src/sandbox/main.ts:209-227`, `src/sim/loop.ts:150-168`
**Issue:** `previous[i]` and `current[i]` are paired by index, never by `id`. After `removeBall` + `addBall` (main.ts:203-204), `loop.current[0]` still holds the drained ball. On the next `advance`, `copyStates` moves that drained-ball state into `previous[0]`, and `snapshotInto` writes the new plunger ball into `current[0]`. The renderer then lerps between two different balls and paints a ghost sweeping across the bottom of the table for one frame. With N balls (the stated N-ball readiness), `removeBall`'s swap-remove reorders `ballPool`, so every surviving ball can be paired with the wrong prior state.
**Fix:** In the interpolation loop, only lerp when the ids match: `const p = previous[i] && previous[i].id === c.id ? previous[i] : c;`. Alternatively, have the loop resnapshot both buffers (`snapshotInto(current); copyStates(current, previous)`) through a `resync()` method that the feed calls after add/remove.

### WR-03: The flipper is drawn 0.07 m longer than its collider at both ends, so what is drawn is not what is hit

**File:** `src/sandbox/debug-draw.ts:299-312` (collider: `src/physics/planck-world.ts:86-89, 542-555`)
**Issue:** The collider is a box over local x ∈ [0.07, 0.43] plus circles at x = 0.07 and x = 0.43 with radius 0.07, so it spans x ∈ [0, 0.50]. The renderer draws the core over [0, `length` = 0.5] with circles centered at 0 and 0.5, so it spans [−0.07, 0.57]. Each bat appears 0.07 m longer at the tip and pokes 0.07 m behind the hinge. In the droop inverted-V, the drawn tip-to-tip gap shrinks by ~0.13 m, from the physical ~0.46 m down to ~0.33 m. That is visually narrower than the 0.40 m ball, yet the ball falls straight through it. This contradicts the phase's "what is drawn is what is hit" goal (SC#4) and is a visible defect. The `FlipperState` contract (`length` = pivot to tip extreme) does not say where the tip circle's center is.
**Fix:** Draw from the contract: tip circle center at `length - tipRadius`, hinge circle at `tipRadius`, core between them:
```ts
const tipC = len - tr;
ctx.fillRect(tr, -tr, tipC - tr, tr * 2);
ctx.arc(tipC, 0, tr, 0, Math.PI * 2); // tip
ctx.arc(tr, 0, tr, 0, Math.PI * 2);   // hinge
```

### WR-04: A throwing bus listener permanently freezes the game loop and desyncs the accumulator

**File:** `src/app/collision-router.ts:46-58`, `src/sim/loop.ts:83-88`, `src/sandbox/main.ts:268`
**Issue:** `dispatch()` calls listeners with no isolation. In `advance`, `onPostStep()` runs after `world.step()` but before `this.accumulator -= FIXED_DT_MS; steps++`. A throw therefore leaves a step that was simulated but never subtracted from the accumulator. It also escapes `frame()` before `requestAnimationFrame(frame)` re-arms, so the sandbox stops rendering and simulating for good. Phase 4/5 consumers (scoring, Web Audio, whose `AudioContext` calls can throw) plug into exactly this seam.
**Fix:** Do the accumulator bookkeeping before the post-step hook (`this.accumulator -= FIXED_DT_MS; steps++; if (onPostStep) onPostStep();`). Isolate listeners in `dispatch()` by wrapping each call in `try { listener(e) } catch (err) { console.error(err) }`, or collect the error and rethrow it after the batch. Re-arm `requestAnimationFrame` at the top of `frame()`.

### WR-05: The real-table containment gate cannot see bumpers

**File:** `src/harness/soak.ts:585-587` (boundary source: `src/table/resolve.ts:249-258`, `src/physics/planck-world.ts:458-460`)
**Issue:** `sweptEscaped` only checks `getBoundarySegments()`, and circle elements resolve to `segments: []`, so the three bumpers are not part of the swept invariant. The table-soak gate (`table-soak.gate.test.ts:16-18`) claims the ball "never escapes a wall", and its docstring tells maintainers that a red run means bad geometry. A ball that tunnels into or through a bumper at 60 m/s is never detected. The soak's origin filter does account for circles (`soak.ts:276-297`), so the omission is specific to the invariant.
**Fix:** Add a per-step circle check in `runCase`: for each solid `el.circle`, fail if the swept chord from `prev` to `next` comes closer than `c.radius + effRadius` to the center while both endpoints are clear of it (a pass-through), or if `next` lies inside `c.radius + effRadius - CONTACT_SLOP` (penetration). Add a CCD-off negative control aimed at bumper 202 so the new check has teeth.

## Info

### IN-01: The plunger launches any ball in the zone, not only a resting one

**File:** `src/control/plunger-controller.ts:84-92, 129-138`
**Issue:** The docs say the impulse applies only "when the named ball is resting inside the plunger zone", but `ballInZone` checks position only. A ball falling back down the chute after a weak launch at several m/s still gets the impulse added to its current velocity, so the launch power no longer matches the meter (D-10 meter honesty).
**Fix:** Also require `Math.hypot(b.vx, b.vy) < PLUNGER_REST_SPEED_EPS`, or correct the doc to say "inside the zone".

### IN-02: Edges latched in the same drain window are applied press-first, which can drop a new press

**File:** `src/sandbox/main.ts:132-136`, `src/input/plunger-input.ts:93-101`
**Issue:** Two cases go wrong. (a) Release then re-press inside one 8.3 ms window: the press is ignored (still charging), the release launches, the controller goes idle, and the key is now held with no further press edge, so the new hold never charges. (b) Blur then keydown inside one window has the same effect through cancel. Both are unlikely at 120 Hz but deterministic.
**Fix:** Apply release/cancel before press in the consumer (`release → cancel → press`), which matches the order the latch recorded them in when a press follows.

### IN-03: Stale and contradictory documentation after the table switch

**File:** `src/physics/types.ts:61-64, 157`; `src/physics/constants.ts:105-111, 178-183`; `src/sandbox/main.ts:84-89`; `src/table/spec.ts:190-193`
**Issue:**
- `FlipperState` still says "No real flippers exist yet (Phase 2); the accessor returns an empty pooled array today".
- `getFlippers` says "a max-speed test flipper this phase".
- `FLIPPER_LENGTH_M` says "Sized for the 2×3 m test rig".
- `FLIPPER_UPPER_ANGLE` is called "the rest/droop stop", but that is only true for the left bat (the mirrored right bat droops to `FLIPPER_LOWER_ANGLE`).
- The `main.ts` comment says both bats rest "LEVEL", but the TABLE_SPEC mounts use `restPose` (droop).
- `DRAIN_Y` says a ball drains when its "center crosses" the line, but the sensor fires on rim overlap, 0.2 m earlier.
**Fix:** Update these comments to match the current behavior.

### IN-04: The real-table soak only sweeps flipper 0, so the right bat is never driven

**File:** `src/harness/soak.ts:327-331, 535-551`
**Issue:** On TABLE_SPEC only the left bat (index 0) is swept and aimed at. The right bat sits at motor 0 for the whole real-table gate, so its rotational anti-tunnel behavior on this geometry is never exercised. The FLIP-04 two-flipper proof still exists on PROOF_BOX_SPEC.
**Fix:** Pick the aimed and swept flipper per case from the seed stream when `config.table` is set, or note explicitly in the gate docstring that rotational coverage comes from the proof-box gate.

### IN-05: `drainEvents()` exposes the adapter's internal reused array as mutable

**File:** `src/physics/types.ts:195`, `src/physics/planck-world.ts:865-879`
**Issue:** The return type `CollisionEvent[]` lets a consumer `push`/`splice` the adapter's private `drainedEvents` view. The next drain overwrites indices `< eventCount` and truncates the array, so a consumer's mutation would silently corrupt or vanish.
**Fix:** Return `readonly CollisionEvent[]` from the interface and the adapter. `CollisionRouter.dispatch` only reads it.

---

_Reviewed: 2026-11-19T22:39:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
