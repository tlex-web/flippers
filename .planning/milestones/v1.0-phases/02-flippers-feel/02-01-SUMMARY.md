---
phase: 02-flippers-feel
plan: 01
subsystem: physics
tags: [planck, box2d, revolute-joint, capsule, flipper, canvas2d, feel-tuning]

# Dependency graph
requires:
  - phase: 01-physics-core-spike
    provides: PhysicsWorld interface (getFlippers/setFlipperMotor/FlipperState), the motorized-revolute test flipper, the seeded swept-containment soak + flipperSweptTunnel invariant, the reference-anchored constants block, the throwaway Canvas 2D debug renderer
provides:
  - Two mirrored, capsule-shaped feel flippers (Box core + rounded tip/hinge Circles) returned by getFlippers() with distinct ids
  - FlipperState.tipRadius on the engine-agnostic contract (D-08)
  - Feel constants FLIPPER_UP_SPEED / FLIPPER_RETURN_SPEED / FLIPPER_TIP_RADIUS_M, retuned torque/half-width/angle limits
  - setFlipperMotor remapped to feel speeds (+1 -> UP_SPEED, -1 -> RETURN_SPEED, 0 -> hold), replacing the single stress speed
  - Debug renderer draws each bat as a stadium (rounded tip) from FlipperState.tipRadius
affects: [02-flippers-feel plans 02-02 (FlipperController FSM), 02-03 (input), 02-04 (angular sub-stepping), 02-05 (FLIP-02/03/04 proofs), 03-table-layout, 05-render-audio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-fixture capsule bat = Box core + offset tip/hinge Circles (Planck 1.5 has no native capsule; polygon radius is only a CCD skin)"
    - "Mirror a revolute flipper by constructing the bat at body angle pi; planck derives referenceAngle from it so the SAME reference-relative joint limits describe the reflected sweep, and bat.getAngle() reports the true orientation for renderer/harness"
    - "setFlipperMotor is the single sign-only feel hook; magnitudes (UP/RETURN speeds) live in adapter constants (D-05)"

key-files:
  created:
    - .planning/phases/02-flippers-feel/02-01-SUMMARY.md
  modified:
    - src/physics/types.ts
    - src/physics/constants.ts
    - src/physics/planck-world.ts
    - src/physics/planck-world.smoke.test.ts
    - src/sandbox/debug-draw.ts
    - src/harness/soak.test.ts

key-decisions:
  - "Angle limits are symmetric [-pi/8, pi/8] (45 deg sweep) straddling the horizontal, so the bat crosses level MID-arc at full angular speed (feel + keeps the swept-tunnel proof's moving-bat crossing alive)"
  - "FLIPPER_MAX_MOTOR_TORQUE retuned 10000 -> 500 (exceeds the ball's tip gravity torque ~0.29 N.m by ~1700x; saturates UP_SPEED within ~1 fixed step)"
  - "Right flipper is a mirrored throwaway-rig scaffold at (1.15, 2.35); its swept sector is held clear of every Phase-1 resting-ball position, the fall column, and the thin wall"
  - "Flipper fixture restitution set to 0 in source (D-06(3)); not interface-observable because Box2D takes the MAX restitution of the contacting pair, so the ball's 0.35 governs the contact"

patterns-established:
  - "Capsule bat composition + reference-angle mirroring (see tech-stack patterns)"
  - "Feel constants as the single HMR-tunable source of truth; test-rig placement stays a replaceable local const in the adapter (D-11)"

requirements-completed: [FLIP-02, FLIP-03]

# Metrics
duration: 50min
completed: 2026-07-15
---

# Phase 2 Plan 01: Two Mirrored Capsule Flippers Summary

**Two mirrored capsule flippers (Box core + rounded tip/hinge Circles) on a motorized revolute joint, driven at distinct feel speeds through the unchanged `setFlipperMotor` hook, with `tipRadius` on the engine-agnostic contract and a stadium debug render.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-07-15T15:17:15Z
- **Completed:** 2026-07-15T16:07:43Z
- **Tasks:** 3 (Task 2 was TDD: RED -> GREEN)
- **Files modified:** 6

## Accomplishments
- Added `readonly tipRadius` to `FlipperState` (D-08) and the matching field through the adapter's pooled view, so every downstream file can describe a capsule.
- Productized the Phase-1 single stress flipper into TWO mirrored, feel-shaped capsule flippers (D-07): a `Box(0.18, 0.07)@(0.25,0)` core + a `Circle(0.07)` tip at `(0.43,0)` + a `Circle(0.07)` hinge at `(0.07,0)`, each with `restitution: 0` (D-06(3)).
- Remapped `setFlipperMotor` to the feel speeds (`+1 -> FLIPPER_UP_SPEED=30`, `-1 -> -FLIPPER_RETURN_SPEED=20`, `0 -> hold`), replacing and deleting the single stress `FLIPPER_MOTOR_SPEED`.
- Retuned the feel constants: half-width `0.04 -> 0.07` (capsule core), torque `10000 -> 500` (documented gravity-torque budget), angle limits `+/-pi/4 -> +/-pi/8` (~45 deg raise sweep).
- Debug renderer now draws each bat as a stadium (core rect + rounded tip/hinge arcs) read from `FlipperState.tipRadius`, zero per-frame allocation (T-02-01).
- Full Phase-1 + Phase-2 suite green (34 tests, stable across repeated runs); engine isolation preserved (planck imported only in `planck-world.ts`).

## Task Commits

1. **Task 1: tipRadius contract + feel constants** - `4b3ccb2` (feat)
2. **Task 2 (RED): failing smoke tests for two capsule flippers** - `714f396` (test)
3. **Task 2 (GREEN): capsule/mirror build + feel-speed motor remap** - `eb04782` (feat)
4. **Task 3: stadium debug render** - `071e724` (feat)

_Task 2 followed the TDD RED -> GREEN gate; no refactor commit was needed._

## Files Created/Modified
- `src/physics/types.ts` - Added `readonly tipRadius` to `FlipperState` (D-08).
- `src/physics/constants.ts` - Added `FLIPPER_TIP_RADIUS_M`, `FLIPPER_UP_SPEED`, `FLIPPER_RETURN_SPEED`; retuned half-width/torque/angle limits; removed the stale `FLIPPER_MOTOR_SPEED`.
- `src/physics/planck-world.ts` - `buildTestFlipper` -> `buildFlipper(id, pivot, mirror)` called twice; multi-fixture capsule; mirror via body angle pi; `setFlipperMotor` feel-speed remap; `tipRadius` in the pooled view.
- `src/physics/planck-world.smoke.test.ts` - New assertions: two flippers, distinct ids, finite `tipRadius`, and the feel-speed motor remap measured mid-arc.
- `src/sandbox/debug-draw.ts` - `drawFlippers` draws a stadium from `tipRadius`.
- `src/harness/soak.test.ts` - Retuned the flipper negative-control launch speed (deviation, below).

## Decisions Made
- **Symmetric angle limits `[-pi/8, pi/8]`** (rather than an asymmetric `[0, pi/4]`): the bat must cross the horizontal MID-arc (moving at full speed), both for feel and because a bat that stops AT the horizontal (a limit) no longer presents a moving-bat crossing to the swept-tunnel proof. Rest/droop is the upper limit (+pi/8); raise is the lower limit.
- **Torque 500 N.m** documented against the ball tip gravity torque `m * g_inplane * L ~= 0.29 N.m` (exceeds it ~1700x) and the ~1-step saturation of `FLIPPER_UP_SPEED`.
- **Right-flipper placement `(1.15, 2.35)`** is throwaway-rig scaffold (D-11), chosen so its swept sector clears the left flipper, the ball fall column (x~1.5), the thin wall (y=2.0), and the Phase-1 stability harness's resting balls (all settle in the bottom-right corner ~(1.79, 2.79)).
- **Mirror via reference angle:** constructing the right bat at body angle pi makes planck set the joint `referenceAngle = pi`, so the same reference-relative limits `[FLIPPER_LOWER_ANGLE, FLIPPER_UPPER_ANGLE]` describe the reflected sweep with no per-flipper limit math, and `bat.getAngle()` (~pi) drives the renderer/harness correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired `tipRadius` through the adapter in Task 1 to keep the commit compiling**
- **Found during:** Task 1 (constants + interface)
- **Issue:** Adding the required `FlipperState.tipRadius` makes the adapter's `MutableFlipperState[]` no longer assignable to `readonly FlipperState[]`, so `tsc --noEmit` (a Task 1 acceptance gate) fails until the adapter carries the field.
- **Fix:** Added `tipRadius` to `MutableFlipperState` and set it in the (still single-flipper) pool push during Task 1; the full capsule/mirror refactor landed in Task 2. `FLIPPER_MOTOR_SPEED` was kept as a deprecated export in Task 1 and deleted in Task 2 so each commit compiles.
- **Files modified:** src/physics/planck-world.ts
- **Verification:** `npx tsc --noEmit` + `npx eslint` exit 0 at the Task 1 commit.
- **Committed in:** `4b3ccb2` (Task 1 commit)

**2. [Rule 1 - Bug] Retuned the flipper negative-control launch speed (80 -> 105) so the Phase-1 swept-check teeth proof stays green**
- **Found during:** Task 2 (setFlipperMotor feel-remap)
- **Issue:** The Phase-1 flipper negative control (`soak.test.ts`) drops a ball straight through the bat with CCD off and expects a tunnel, to prove `flipperSweptTunnel` fires on a real pass-through. It relied on the stress drive speed (~40 rad/s): at 80 m/s the ball's per-step chord straddles the bat, and only a fast-sweeping bat could sweep OUT of the ball's path in one case to leave a clean intra-step tunnel. The D-05 feel-remap slows `setFlipperMotor` (30/20 rad/s), so no case tunnels and the control (and its replay) went RED. (Confirmed by isolation: box-vs-capsule and single-vs-two-flipper had no effect; only the drive speed did.)
- **Fix:** Retuned the `FLIPPER_NEGATIVE_CONTROL` launch to 105 m/s, so the ball clears the bat in a SINGLE 120 Hz step with both endpoints clear of the `(radius + halfWidth)` band — a genuine straight-through tunnel that is robust to bat speed (clean window ~100-115 m/s). This preserves (and arguably strengthens) the proof's intent: the swept check must still fire on a real tunnel.
- **Files modified:** src/harness/soak.test.ts
- **Verification:** `npx vitest run` green (34/34), stable across 3 runs; both the negative-control and deterministic-replay tests pass.
- **Committed in:** `eb04782` (Task 2 GREEN commit)

**3. [Rule 1 - Test correctness] Refined the smoke test's motor-speed measurement to avoid a Box2D limit-jam**
- **Found during:** Task 2 (GREEN)
- **Issue:** The RED test parked the bat AT a joint limit before measuring. Planck briefly JAMS a body driven past a joint limit (`jointSpeed` stays 0 even with the motor set and the body awake), so the measurement read ~0 for a fully correct motor — an invalid measurement, not a real RED.
- **Fix:** Rewrote the measurement to sample the peak per-step angular speed MID-arc (never parking on a limit). The soak (reverses before the limit via an eps guard) and stability (holds flipper 0) proofs already sidestep this quirk, so nothing else needed changing.
- **Files modified:** src/physics/planck-world.smoke.test.ts
- **Verification:** Smoke test asserts raise ~= FLIPPER_UP_SPEED, return ~= -FLIPPER_RETURN_SPEED, |return| < raise, and a stable 0-hold.
- **Committed in:** `eb04782` (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bug/correctness).
**Impact on plan:** All three keep the plan's mandated design (tipRadius contract, capsule geometry, D-05 feel-remap, exact feel values) intact while keeping the full Phase-1 + Phase-2 suite green. The only change outside the plan's file list is a one-value config bump to a Phase-1 negative-control test — a direct, documented consequence of the D-05 feel-remap. No scope creep; no product behavior weakened.

## Issues Encountered
- **Box2D limit + motor jam:** a body driven past a revolute joint limit briefly locks (motor can't pull it back for a few steps). Reproduced in pure planck. It only ever bites code that parks a bat on a limit; the soak reverses before limits and the stability proof holds the bat, so the fix was confined to the smoke test's measurement (deviation 3).
- **Rig congestion:** the 2x3 m test box is tightly packed (left flipper, fall column, thin wall, and the stability harness's resting balls). The right flipper's placement was chosen by verifying its swept sector clears every one of those; the Phase-1 balls all settle in the bottom-right corner, which freed the lower-center-left for the mirrored bat.

## Known Stubs
None. This plan is geometry constants + fixture composition + a throwaway canvas draw on in-memory state; no placeholder data flows to any UI.

## Next Phase Readiness
- The physical Core-Value flipper (two mirrored capsule bats, feel speeds, zero restitution, rounded tip) is in place and drivable through the unchanged `setFlipperMotor` hook.
- Ready for 02-02 (`FlipperController` FSM above the interface) and 02-03 (keyboard input). The controller drives `setFlipperMotor(id, +/-1/0)`; note the mirror means `+1` raises the right bat but lowers the left (uniform sign, reference-mirrored geometry) — the controller will map each side's "raise" input to the appropriate sign.
- 02-04 (angular sub-stepping) and 02-05 (FLIP-02/03/04 proofs) will revisit the soak/harness; per PATTERNS.md the swept check may want a `tipRadius`-aware clearance there. The negative-control launch retune here is a compatibility bridge, not that gate work.

---
*Phase: 02-flippers-feel*
*Completed: 2026-07-15*

## Self-Check: PASSED
- All modified files present (types.ts, constants.ts, planck-world.ts, debug-draw.ts, planck-world.smoke.test.ts) + SUMMARY.md.
- All task commits present: `4b3ccb2`, `714f396`, `eb04782`, `071e724`.
- Full suite green (34/34, stable); `npx eslint .` + `npx tsc --noEmit` clean; grep confirms `FLIPPER_MOTOR_SPEED` removed and planck imported only in `planck-world.ts`.
