---
phase: 01-physics-core-spike
plan: 05
subsystem: testing
tags: [planck, revolute-joint, ccd, prng, mulberry32, swept-containment, physics]

# Dependency graph
requires:
  - phase: 01-physics-core-spike (plan 01-02)
    provides: PlanckWorld adapter + engine-agnostic PhysicsWorld interface (ball/flipper/event, bounded box with a thin interior wall)
provides:
  - Max-speed motorized TEST flipper (dynamic body on a motorized revolute joint) exposed via getFlippers()
  - Engine-agnostic setFlipperMotor drive hook on the PhysicsWorld interface (for phase sweeping)
  - Planck #167 CCD-arming guard (ball gets a first contact on addBall)
  - Deterministic seeded PRNG (mulberry32) — never the unseeded global RNG
  - Swept containment invariant (sweptEscaped) that catches punch-out/re-enter tunneling a naive endpoint check misses
affects: [01-06 soak gate, Phase 2 real flippers, any future custom swept solver]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical Box2D pinball flipper: DYNAMIC body + motorized revolute joint (enableMotor/maxMotorTorque/angle limits), never kinematic"
    - "CCD priming: force a first contact on body creation to work around Planck #167"
    - "Engine-agnostic swept containment invariant: radius-inflated segment-vs-wall crossing test, reads only the interface (no planck)"

key-files:
  created:
    - src/harness/prng.ts
    - src/harness/prng.test.ts
    - src/harness/containment.ts
    - src/harness/containment.test.ts
  modified:
    - src/physics/planck-world.ts
    - src/physics/constants.ts
    - src/physics/types.ts

key-decisions:
  - "Flipper placed lower-left (pivot 0.35, 2.6) with a bounded ±45° arc, clear of the ball's fall column (x≈1.5) and the thin wall (y=2.0) so the stress flipper never disturbs the baseline smoke run"
  - "sweptEscaped uses an EXCLUSIVE radius boundary (escape iff distance < radius), so a graze at exactly radius is contact, not escape — a resting ball touching a wall does not false-trip"
  - "CCD #167 guard implemented as a temporary overlapping primer body stepped once, then removed with the ball restored to its exact requested transform+velocity (priming is invisible to callers)"
  - "Added setFlipperMotor(id, direction) to the PhysicsWorld interface so the soak sweeps flipper phase through the interface (D-05), not via planck"

patterns-established:
  - "Pattern: mutable pooled snapshots (flipperPool) mirror the ballPool no-per-frame-allocation read path"
  - "Pattern: harness modules (prng, containment) are engine-agnostic — import only from ../physics/types, never planck"

requirements-completed: [PHYS-02]

# Metrics
duration: 12min
completed: 2026-07-15
---

# Phase 01 Plan 05: Tunnel-Proof Primitives Summary

**The dynamic max-speed motorized test flipper plus a deterministic seeded PRNG and an engine-agnostic swept containment invariant that provably catches punch-out-and-re-enter tunneling — the correctness core of the no-tunneling gate.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-15T01:35:58Z
- **Completed:** 2026-07-15T01:48:04Z
- **Tasks:** 2 completed
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- Added the canonical Box2D pinball flipper — a **DYNAMIC** thin bat on a **motorized revolute joint** (`enableMotor`, high `maxMotorTorque`, ±45° angle limits) run at max speed for stress — the dynamic fast-thin-mover the ball must never tunnel through. Exposed live via `getFlippers()`.
- Guarded Planck issue #167 by arming the ball's CCD with a forced first contact on `addBall`, with the ball restored to its exact spawn state so priming is invisible.
- Implemented `mulberry32`, a deterministic seeded PRNG that reproduces an identical stream per seed and never touches the unseeded global RNG (runtime-proven via a spy).
- Implemented `sweptEscaped`, a radius-inflated segment-vs-wall crossing invariant that flags a straight path tunneling through a thin interior wall between two *inside* endpoints, and a disk bulging through the outer boundary and returning — both cases a naive "center inside the box" check misses.

## Task Commits

Each task was committed atomically:

1. **Task 1: Max-speed motorized test flipper + CCD arm (Planck #167)** - `75d2577` (feat)
2. **Task 2 (TDD RED): failing PRNG + containment tests** - `1e7c96e` (test)
3. **Task 2 (TDD GREEN): seeded PRNG + swept containment invariant** - `db82def` (feat)

_TDD task 2 followed RED → GREEN; no refactor commit was needed (implementation passed clean)._

## Files Created/Modified
- `src/physics/constants.ts` - Added stress-tuned flipper constants (length, half-width, motor speed, max torque, lower/upper angle limits).
- `src/physics/planck-world.ts` - Built the dynamic motorized-revolute test flipper + drive hook; pooled flipper snapshots; `primeBallCcd` #167 guard on `addBall`.
- `src/physics/types.ts` - Added `setFlipperMotor(id, direction)` to the `PhysicsWorld` interface (engine-agnostic flipper drive for phase sweeping).
- `src/harness/prng.ts` - `mulberry32(seed)` deterministic generator.
- `src/harness/prng.test.ts` - Determinism, seed divergence, `[0,1)` range, never-calls-global-RNG.
- `src/harness/containment.ts` - `sweptEscaped`, `sweptEscapedForBall` (BallState adapter), `wallSegmentsFrom` (interface enumeration), and segment geometry helpers.
- `src/harness/containment.test.ts` - Contained path, thin-wall tunnel, boundary poke-out/re-enter, outside-region net, exclusive grazing boundary.

## Decisions Made
- **Flipper placement (lower-left, bounded arc):** keeps the max-speed bat sweeping real play area while staying clear of the falling ball and the thin wall, so the pre-existing smoke test remains stable.
- **Exclusive radius boundary in `sweptEscaped`:** escape iff `distance < radius`, so a tangent graze (== radius) is contact, not escape — resting contact does not false-trip. Documented in the function and asserted in a dedicated test.
- **CCD priming via temporary primer body:** position-independent and robust; the single priming sub-step generates no spurious collision event (primer has no `BodyTag`) and the ball is restored to its exact requested transform+velocity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added `setFlipperMotor` to the `PhysicsWorld` interface**
- **Found during:** Task 1 (test flipper)
- **Issue:** The plan calls for "a way to drive the flipper's motor direction (for phase sweeping later)", and D-05 requires the soak harness to steer the flipper through the *interface*, not planck. `types.ts` was not listed in `files_modified`, but without an interface method the drive hook would leak planck to the harness.
- **Fix:** Added an engine-agnostic `setFlipperMotor(id, direction)` method to the `PhysicsWorld` interface and implemented it in `PlanckWorld` (the only implementer; `tsc` enforces completeness). Additive/backward-compatible.
- **Files modified:** `src/physics/types.ts`, `src/physics/planck-world.ts`
- **Verification:** `npx tsc --noEmit` clean; `npx eslint .` clean; full suite green.
- **Committed in:** `75d2577` (part of Task 1 commit)

**2. [Rule 3 - Blocking clarity] Reworded PRNG doc comments so the unseeded-RNG token never appears in `src/harness`**
- **Found during:** Task 2 (PRNG)
- **Issue:** Acceptance criterion greps `src/harness` for the literal unseeded-RNG token and expects nothing; documentation comments and a test name mentioned it literally, which would mechanically false-flag despite the PRNG never calling it.
- **Fix:** Reworded three doc/test-name references to "the platform's unseeded global RNG" while keeping the meaning; the runtime spy test (`vi.spyOn(Math, "random")`, which does not contain the contiguous token) still enforces the real property.
- **Files modified:** `src/harness/prng.ts`, `src/harness/prng.test.ts`
- **Verification:** `grep -rn "Math.random" src/harness` returns nothing; the spy test asserts zero calls.
- **Committed in:** `db82def` (part of Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1× Rule 2, 1× Rule 3)
**Impact on plan:** Both necessary — one keeps the flipper drive engine-agnostic per D-05, the other satisfies the acceptance grep without weakening the runtime proof. No scope creep.

## Issues Encountered
None — both tasks executed cleanly. The pre-existing 8-test suite stayed green throughout (now 19 tests).

## Known Stubs
None. `getFlippers()` returns a populated, live flipper snapshot (no longer the empty placeholder from plan 01-02).

## Verification Evidence
- `npx vitest run` → **19 passed** (5 files): includes the swept invariant CATCHING the thin-wall tunnel and boundary poke-out/re-enter cases, and passing a contained case.
- `npx tsc --noEmit` → clean.
- `npx eslint .` → clean.
- Flipper is dynamic + motorized: `grep` confirms `createDynamicBody`, `enableMotor`, `maxMotorTorque`, `RevoluteJoint`; no `KINEMATIC`/`setKinematic` on the flipper.
- planck import confined: only `src/physics/planck-world.ts` imports `planck`; `src/harness/*` is engine-agnostic.

## Self-Check: PASSED
All created files exist on disk (`src/harness/prng.ts`, `prng.test.ts`, `containment.ts`, `containment.test.ts`, and this SUMMARY). All task commits present in git history (`75d2577`, `1e7c96e`, `db82def`).
