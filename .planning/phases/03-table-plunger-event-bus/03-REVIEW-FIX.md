---
phase: 03-table-plunger-event-bus
fixed_at: 2026-11-19T23:30:00Z
review_path: .planning/phases/03-table-plunger-event-bus/03-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-11-19T23:30:00Z
**Source review:** .planning/phases/03-table-plunger-event-bus/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, CR-02, WR-01..WR-05; fix_scope `critical_warning`)
- Fixed: 7
- Skipped: 0
- Out of scope, untouched: IN-01..IN-05

## Verification

The gates ran in the **main checkout** on branch `gsd/phase-03-table-plunger-event-bus` at HEAD `97a4d9e`. No worktree was used: the orchestrator said to commit directly on the current branch and create no branches. These numbers can be reproduced from this tree.

| Gate | Result |
|------|--------|
| `npm run typecheck` | exit 0, no errors |
| `npx eslint src` | exit 0, no output |
| `npm test` | 24 files, 168 tests passed (baseline before fixes: 23 files, 154 tests) |
| `npm run soak` | 3 files, 3 gates passed (proof-box soak, FLIP-04 tunnel gate, real-table 630 s gate; the last now includes bumpers) |

Invariants checked at HEAD:
- `src/harness/containment.ts`, `src/physics/constants.ts` and the PROOF_BOX_SPEC proof tests have zero diff since `7cedcc6`.
- Only `src/physics/planck-world.ts` imports planck.
- The event hot path allocates nothing new per step. It adds a boolean guard, `contact.getManifold()` (which returns the contact's existing manifold), and a try/catch that allocates only when a listener throws.

## Fixed Issues

### CR-01: The plunger rest position is below the drain line, so the parked ball respawns every frame and launches are lost

**Files modified:** `src/sandbox/ball-feed.ts` (new), `src/sandbox/ball-feed.test.ts` (new), `src/sandbox/main.ts`
**Commit:** e0f475c
**Status:** fixed: requires human verification (logic fix; regression-tested headlessly; confirm in a browser playtest)
**Applied fix:** Moved the feed into a testable `BallFeed`. It registers a bus listener that records only a drain-sensor event for the active ball. `service()` then runs from `onPostStep` right after `router.dispatch()` and does the remove/add at the fixed-step seam. The positional `y > DRAIN_Y` check and `findBall` were removed from `main.ts`. The new test drives the same stack `main.ts` builds: idle at 120 Hz with no respawn over 600 frames, full-charge launches clearing the chute top at 60, 120 and 144 Hz, a minimum tap at 60 Hz that keeps the same ball, and a real drain that feeds exactly one fresh ball. I confirmed it red first (5/6 failing) against a temporary copy of the old positional logic, then green.

### CR-02: Sensor events (lane/rollover/drain) report a stale point from an unrelated contact

**Files modified:** `src/physics/planck-world.ts`, `src/physics/sensor-event.test.ts`
**Commit:** 670d4b9
**Status:** fixed: requires human verification (logic fix; regression-tested)
**Applied fix:** `emitContact` now checks `contact.getManifold().pointCount` before trusting the reused `scratchWm`. A 0-point contact falls back to the ball center. `syncContactPoints` now skips sensor contacts and 0-point manifolds. Two new tests use two balls, with one parked on the plunger to keep a solid contact live:
- the rollover event's point lies within one step of the falling ball's center (it was 5.9 m away pre-fix);
- an overlapping sensor no longer adds a phantom point to `getContactPoints()` (it was 2 vs 1 pre-fix).

### WR-01: `addBall` steps the entire world outside the loop

**Files modified:** `src/physics/planck-world.ts`, `src/physics/collision-event.test.ts`
**Commit:** 19bfc44
**Status:** fixed: requires human verification (partial by design; see note)
**Applied fix:** A `priming` flag suppresses post-solve (solid) events during `primeBallCcd`'s hidden step. Those reports carried a fake priming impulse, or duplicated contacts that the next real step reports anyway. Sensor begin-contacts are kept: a begin fires only once per overlap and the contact outlives the prime step, so dropping it would lose the overlap for good. CR-01 already moved the runtime `addBall` to the post-step seam, so a respawn now lands at a deterministic step boundary. The new test feeds a ball between steps while another is parked: the pool is empty afterwards (2 leaked events pre-fix, confirmed by disabling the guard).
**Note:** The prime step still runs the whole world for one extra 1/120 s. I did not change that, because the FLIP-04 calibration reads flipper[0]'s post-prime angle on PROOF_BOX_SPEC, and deactivating other bodies would move that calibration. A human should decide whether the remaining extra step needs a deeper fix, such as a throwaway priming world.

### WR-02: Render interpolation pairs balls by array index

**Files modified:** `src/sandbox/main.ts`
**Commit:** e888375
**Status:** fixed: requires human verification (render-path logic; no headless test, the sandbox frame needs a DOM)
**Applied fix:** The interpolation loop lerps only when `previous[i].id === current[i].id`. Otherwise it draws the current state, so a respawn or a swap-remove no longer paints a ghost streak.

### WR-03: The flipper is drawn 0.07 m longer than its collider at both ends

**Files modified:** `src/sandbox/debug-draw.ts`, `src/physics/types.ts`
**Commit:** 5fe65e4
**Status:** fixed: requires human verification (visual; confirm in the sandbox)
**Applied fix:** The tip circle is now centred at `length - tipRadius` and the hinge circle at `tipRadius`, with the core between them. Each bat now draws over local x in [0, 0.50], exactly the collider (core [0.07, 0.43] plus two r = 0.07 circles). On screen, each bat loses 0.07 m at the tip and no longer pokes behind the hinge, and the droop tip-to-tip gap widens back to the physical ~0.46 m, wider than the 0.40 m ball. `FlipperState.length` is now documented as pivot to tip extreme.

### WR-04: A throwing bus listener permanently freezes the game loop and desyncs the accumulator

**Files modified:** `src/sim/loop.ts`, `src/sim/loop.tabblur.test.ts`, `src/app/collision-router.ts`, `src/app/collision-router.test.ts`, `src/sandbox/main.ts`
**Commit:** 5b1d674
**Status:** fixed
**Applied fix:**
- `FixedStepLoop.advance` subtracts the accumulator and counts the step (`steps`, `totalStepsRun`, `alpha`) before calling `onPostStep`.
- `CollisionRouter.dispatch` wraps each listener call in try/catch and reports through an injectable `ListenerErrorHandler` (default `console.error`). Every other listener still receives the whole batch.
- `main.ts` re-arms `requestAnimationFrame` at the top of `frame()`.

Two new tests (router isolation; loop accumulator after a throwing post-step hook) were red against the pre-fix `loop.ts` and router, and are green now.

### WR-05: The real-table containment gate cannot see bumpers

**Files modified:** `src/harness/soak.ts`, `src/harness/table-soak.test.ts`, `src/harness/table-soak.gate.test.ts`
**Commit:** 97a4d9e
**Status:** fixed: requires human verification (gate-invariant logic)
**Applied fix:** Added an exported `circleSweptEscaped` to `soak.ts`. It trips when the chord `prev -> next` comes strictly within `c.radius + effRadius` of a solid circle's center, which covers both penetration and pass-through. It is the circle analogue of `sweptEscaped`. A legitimate bounce off a convex disk stays in the tangent half-plane, so its chord never enters the band. It runs per step in `runCase` under a new `"circle"` `EscapeKind`, and is suppressed together with the boundary check under the flipper negative control. A new `aimTarget` config (for negative controls only) lets a launch aim at bumper 202.

New tests:
- (5a) a CCD-off launch at bumper 202 goes red as a `circle` escape;
- (5b) the same launches with CCD on stay green;
- (5c) unit checks on the helper.

PROOF_BOX_SPEC has no circles, so the calibrated gates are unchanged. `containment.ts` is untouched.
**Test adjustment:** The existing CCD-off wall control (2) in `table-soak.test.ts` is a Phase-3 TABLE_SPEC test, not a PROOF_BOX_SPEC proof. Its first failure is now a real bumper penetration: on seed 3329640017 the ball center is about 0.02 m from bumper 201's center, which the old gate could not see. The control now runs all 4 cases and asserts on its boundary failure, which keeps its "boundary invariant has teeth" intent. The full real-table soak gate (630 s) stays green with the new check.

---

_Fixed: 2026-11-19T23:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
