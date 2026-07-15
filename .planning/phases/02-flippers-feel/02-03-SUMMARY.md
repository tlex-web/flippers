---
phase: 02-flippers-feel
plan: 03
subsystem: input
tags: [keyboard, flipper, fsm, fixed-step-loop, onstep-hook, composition-root, sandbox, ball-feed, integration-test, engine-agnostic]

# Dependency graph
requires:
  - phase: 01-physics-core-spike
    provides: PhysicsWorld interface (getFlippers/setFlipperMotor/addBall/getBalls), FixedStepLoop 120 Hz accumulator, zero-per-frame-allocation sandbox composition root
  - phase: 02-flippers-feel (plan 02-01)
    provides: two mirrored capsule flippers with distinct ids, feel-speed setFlipperMotor remap (+1 UP / -1 RETURN / 0 hold)
  - phase: 02-flippers-feel (plan 02-02)
    provides: FlipperInput (held-set + per-side OR latched edges, drainEdges/attach), FlipperController FSM (onPressEdge/onReleaseEdge/update)
provides:
  - End-to-end keyboard-playable two-flipper rig - a real key press raises the matching capsule flipper on the sandbox, drained per fixed step (D-10)
  - Optional onStep pre-step hook on FixedStepLoop.advance() - drives control logic at the top of each 120 Hz step (sub-frame response), loop stays engine-agnostic
  - Drain-triggered ball-feed rig (D-11) that re-drops a ball once the tracked one falls below the flipper zone
  - Headless end-to-end integration test guarding the full keyboard -> FSM -> setFlipperMotor -> Planck path (no module mocks)
affects: [02-04-substepping, 02-05-flip-proofs, 02-06-feel-checkpoint, phase-3-table-layout, plunger, nudge]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-fixed-step control hook: FixedStepLoop.advance(delta, onStep?) invokes a stable caller callback immediately before each internal world.step() (D-10), keeping input->physics latency sub-frame with zero per-frame allocation"
    - "Composition-root wiring builds input+controller+mapping+onStep callback ONCE outside frame(); the rAF body passes the callback by reference (threat T-02-05)"
    - "Side->flipper-id mapping derived from getFlippers() by pivot x (smaller = left) - no hard-coded ids"
    - "Headless end-to-end integration test drives the real modules (synthetic KeyboardEvent -> real input/FSM/adapter/loop), single-stepping the loop to prove sub-frame response"

key-files:
  created:
    - src/sandbox/flipper-e2e.test.ts
  modified:
    - src/sim/loop.ts
    - src/sandbox/main.ts
    - src/control/flipper-controller.ts

key-decisions:
  - "FixedStepLoop.advance() gained an optional onStep pre-step hook (invoked before each internal world.step) so the input latch drains + FSM ticks at the top of each fixed 120 Hz step (D-10 literally), NOT once per render frame. Backward compatible (existing single-arg callers unaffected); loop imports no engine."
  - "main.ts builds ONE stable onFixedStep closure before the rAF loop and passes it by reference each frame - zero per-frame allocation (T-02-05)."
  - "Ball-feed rig is drain-triggered (re-addBall when the tracked ball's center passes FEED_DRAIN_Y=2.72, below the flipper hinges) rather than a fixed cadence - bounded by drain rate, matches the interface's no-removeBall reality. Throwaway scaffold (D-11)."
  - "RULE-1 FIX (found by the E2E test): FlipperController now commands setFlipperMotor(id,0) per flipper in its constructor, enforcing its documented 'resting == motor 0' invariant. Without it a never-pressed bat keeps running the adapter's construction-default motor into a joint limit, where the high maxMotorTorque overshoots and Box2D locks the joint (a startup 'limit jam' that swallowed the first press/release)."

patterns-established:
  - "Per-fixed-step control-drain hook on the fixed-step loop (engine-agnostic callback)"
  - "End-to-end integration test that mocks no intermediate module (complements the per-module spy/synthetic unit tests)"

requirements-completed: [FLIP-01, FLIP-03]

# Metrics
duration: 32min
completed: 2026-07-15
---

# Phase 2 Plan 03: End-to-End Flipper Wiring + Ball-Feed Rig Summary

**The whole flipper stack now runs together on the throwaway two-flipper rig: a real keyboard press raises the matching capsule flipper end-to-end, drained + FSM-ticked at the top of each 120 Hz step (D-10) via a new FixedStepLoop `onStep` hook so it applies sub-frame, a ball feed keeps something to catch, and a headless integration test guards the full keyboard -> FSM -> setFlipperMotor -> Planck path.**

## Performance

- **Duration:** ~32 min
- **Started:** 2026-07-15T18:25:00Z
- **Completed:** 2026-07-15T18:57:00Z
- **Tasks:** 2 (Task 1 was TDD: RED -> GREEN)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- **First keyboard-playable slice:** `main.ts` constructs `FlipperInput` (with `attach()`) + `FlipperController(world)` ONCE, maps side -> flipper id from `getFlippers()` (smaller pivot x = left), and drains the input latch + ticks the FSM at the TOP OF EACH FIXED STEP via the new loop hook — so a press applies on the very next 120 Hz step (<= ~8.3 ms, sub-frame vs a 60 fps render). Empirically the left bat moves 0 -> 0.22 rad in a single fixed step on press.
- **Engine-agnostic per-step hook:** `FixedStepLoop.advance(realDeltaMs, onStep?)` invokes `onStep` immediately before each internal `world.step(FIXED_DT)`. Pure pre-step callback (zero calls on a frame that drains no whole step); return value, previous/current snapshot copy-out, `alpha`, and the `MAX_FRAME_MS` clamp are untouched; the loop still imports no engine.
- **Zero per-frame allocation preserved (T-02-05):** input, controller, side->id mapping, and the `onFixedStep` closure are all built once in `main()`; the rAF body passes the same callback reference each frame and reuses drained views. `npx eslint .` + `tsc --noEmit` clean; grep confirms `main.ts`/`loop.ts` import no `planck`.
- **Ball-feed rig (D-11):** a drain-triggered feeder re-drops a ball once the tracked one falls below the flipper zone, so the flippers always have something to catch — a replaceable scaffold const, not table geometry.
- **Headless end-to-end guard:** `flipper-e2e.test.ts` drives the REAL modules (synthetic keydown -> `drainEdges` -> `onPressEdge`/`update` -> `setFlipperMotor` -> `advance` -> `getFlippers().angle`) with NO intermediate mocks, proving: press raises the bat toward its upper limit within 1 fixed step, keyup returns it to the lower limit, `event.repeat` never re-flips (input-level AND end-to-end), and a one-sided press leaves the other flipper untouched. Full suite green (10 files / 57 tests).

## Task Commits

1. **Task 1 (RED): failing end-to-end keyboard->flipper test** — `3095314` (test)
2. **Task 1 (GREEN): brake-hold flipper motors at rest on controller construction** — `d845ef6` (fix — the deviation below)
3. **Task 2: wire input + controller + ball feed + loop onStep hook** — `f7ee222` (feat)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `src/sandbox/flipper-e2e.test.ts` (created) — headless E2E integration test; a small `makeRig()` wires the real world/input/controller/loop exactly like `main.ts` and single-steps the loop with a drain+feed+tick before each step.
- `src/sim/loop.ts` (modified) — `advance()` gained the optional `onStep` pre-step hook (invoked before each internal `world.step()`); doc updated. No other behavior changed.
- `src/sandbox/main.ts` (modified) — composition-root wiring: construct + `attach()` input, construct controller, side->id mapping, the stable `onFixedStep` drain-and-tick closure passed to `advance()`, and the drain-triggered ball feed (`FEED_DRAIN_Y`, `findBall`).
- `src/control/flipper-controller.ts` (modified) — Rule-1 fix: assert `setFlipperMotor(id, 0)` per flipper in the constructor to enforce the resting invariant (see Deviations).

## Decisions Made
- **`onStep` as a pre-step hook on the loop (D-10 literally).** Draining once per render frame would delay a press by up to a whole frame; draining at the top of each fixed step keeps it sub-frame. Exposing a hook (rather than iterating steps in `main.ts`) keeps the accumulator/interpolation/clamp logic encapsulated in the loop and the callback engine-agnostic.
- **Drain-triggered feed over fixed cadence.** The `PhysicsWorld` interface has no `removeBall`/`setPosition`, so any feeder accumulates settled balls. A drain trigger (feed only when the tracked ball leaves the flipper zone) bounds new balls by actual drain rate — better than a wall-clock cadence — and the settled balls roll to the tilted bottom-right corner, clear of the flippers.
- **Left = smaller pivot x.** The side->id map is derived from the world, not hard-coded, so it survives any rig re-placement (D-11) and Phase-3 table layout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FlipperController did not enforce its documented "resting == motor 0" invariant, causing a startup limit-jam**
- **Found during:** Task 1 (the E2E integration test — this is exactly the class of bug an integration test exists to catch; the 02-02 unit tests used a spy world with scripted angles and never exercised the real motor/limit interaction).
- **Issue:** The Planck adapter builds each revolute joint with its motor already running at the construction-default speed. `FlipperController` seeds every FSM in `resting` and documents "resting == motor 0", but never actually commanded 0 — so a never-pressed bat kept driving hard into a joint limit, where the high `maxMotorTorque` (500) overshoots the limit and Box2D locks the joint (the "limit jam" the 02-01 summary flagged as a known quirk). On startup both idle flippers entered that jam, and the jam then swallowed the first press/release. The E2E "a one-sided (left) press leaves the right flipper unaffected" case failed RED because the untouched right flipper drifted ~0.44 rad into its jammed limit.
- **Fix:** In the `FlipperController` constructor, command `setFlipperMotor(f.id, 0)` for each flipper after seeding its FSM, making the world actually start at the invariant the FSM assumes (a motor-speed-0 revolute motor brake-holds the bat at its rest angle).
- **Files modified:** `src/control/flipper-controller.ts`
- **Verification:** E2E test goes GREEN (6/6); full suite 57/57; all four 02-02 controller unit tests still pass (a construction-time motor-0 call does not affect their post-`clearMotorCalls` assertions); `tsc --noEmit` + `eslint` clean.
- **Committed in:** `d845ef6` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug). No architectural changes, no new dependencies, no feel-constant retuning.
**Impact on plan:** The fix is required for the plan's headline deliverable (a real press raising a real flipper) to work at all and for the E2E test to pass. It is minimal, lives in the correct owner (the controller owns motor state per D-05), enforces an invariant the code already documented, and breaks no existing test. `.planning/config.json` left untouched as instructed.

## Issues Encountered
- **Box2D revolute limit-jam characterization (diagnostic).** A throwaway diagnostic driving the real path confirmed: the high-torque motor overshoots the joint limit by ~0.035 rad and Box2D locks the joint; reversing the motor frees it after ~6 steps (short tap) to ~15 steps (~125 ms after a 1 s cradle hold). This makes the RELEASE feel slightly laggy after a long hold. It is NOT a functional blocker (the flipper always returns) and does NOT violate the stated sub-frame requirement (which is about the press applying on the next step — it does). Left for the 02-06 feel checkpoint rather than retuning 02-01's carefully-justified feel constants unprompted (see Flags).

## Flags for the 02-06 feel checkpoint (surfaced, intentionally not fixed here)
These are feel/physics observations from wiring the real path. They are out of scope for this wiring plan and, per the phase design, the "heavy, not floaty" catch/cradle/return verdict is the named 02-06 human backstop. Raising them for review rather than changing 02-01's tuned constants:
1. **Release jam-lag:** after a sustained cradle hold, the bat stays pinned ~15 steps (~125 ms) before the return sweep begins (root cause: `maxMotorTorque=500` overshoots the joint limit; Box2D locks it). A fix would likely be an adapter-side limit-eps guard or a torque/limit retune — 02-01/02-04 territory.
2. **Rest-position vs. motor sign semantics:** empirically `setFlipperMotor(+1)` drives the bat toward the numerically-upper limit (`+pi/8`), which the constants comment labels the "rest/droop" stop; the controller/plan treat `+1`/upper as "raise". Whether upper is physically "raised" or "drooped" on the real tilted table is a feel/orientation call for 02-06 + Phase-3 table layout, not this rig.
3. **Mirrored right-flipper slow creep at rest:** under the motor-0 brake the left bat holds perfectly, but the mirrored right bat crept ~0.16 rad over ~25 idle steps in a no-ball diagnostic. Harmless over the short windows the E2E test asserts, but worth a look when the real table load is present (02-05/02-06).

## Known Stubs
- **Ball-feed rig (`FEED_DRAIN_Y`, `BALL_SPAWN` reuse) — INTENTIONAL scaffold (D-11), not a blocking stub.** It is deliberately a replaceable throwaway feeder, not real Space Cadet table geometry (that is Phase 3). It fulfills the plan's requirement ("something to catch") and is expected to be replaced by the real table drain/feed in Phase 3. Because the interface has no `removeBall`, drained balls accumulate slowly at the tilted bottom corner (clear of the flippers); acceptable for a short-lived rig and documented for Phase 3.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- The rig is live and keyboard-playable end-to-end; the FLIP-01 loop (near-instant press response, no auto-repeat artifacts) is guarded by a headless integration test before any human plays it. This stands up the rig where the D-09 "heavy, not floaty" feel and the FLIP-03 cradle are judged at the 02-06 feel checkpoint.
- Ready for 02-04 (adaptive angular sub-stepping in `PlanckWorld.step()`): note the release jam-lag flag — 02-04's limit/sub-step work may naturally soften it, or an adapter-side limit-eps guard can be considered there.
- Ready for 02-05 (FLIP-02/03/04 proofs). No blockers. `.planning/config.json` left untouched throughout.

---
*Phase: 02-flippers-feel*
*Completed: 2026-07-15*

## Self-Check: PASSED
- All 4 source/test files + the SUMMARY exist on disk (`flipper-e2e.test.ts`, `loop.ts`, `main.ts`, `flipper-controller.ts`).
- All 3 task commits present in git history: `3095314` (test RED), `d845ef6` (fix GREEN), `f7ee222` (feat).
- Full suite green: 10 files / 57 tests; `tsc --noEmit` + `eslint .` exit 0; grep confirms no `planck` import in `main.ts`/`loop.ts`.
