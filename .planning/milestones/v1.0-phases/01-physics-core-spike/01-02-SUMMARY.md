---
phase: 01-physics-core-spike
plan: 02
subsystem: physics
tags: [planck, box2d, ccd, setBullet, fixed-timestep, accumulator, physics-interface, tdd, vitest]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Vite 8 + strict-TS shell, planck@1.5.0 installed, node-env Vitest runner"
provides:
  - "Engine-agnostic, N-ball-ready physics interface (PhysicsWorld / BallState / FlipperState / CollisionEvent / Segment / Vec2) — the contract all downstream code touches physics through"
  - "Reference-anchored, HMR-tunable feel constants (incline, in-plane gravity, damping, restitution, ball radius, pixels-per-meter, fixed dt, max-frame clamp)"
  - "PlanckWorld adapter: one dynamic setBullet(true) ball under tilted-playfield gravity inside a chain/edge bounded box (incl. one thin interior wall); pooled snapshots, drained collision events"
  - "FixedStepLoop: 120Hz accumulator decoupled from render, MAX_FRAME_MS spiral-of-death clamp, previous/current/alpha interpolation snapshots"
  - "Headless smoke proof (3 behaviors): ball falls, stays contained over 5s, accumulator drains deterministically"
affects: [01-03, 01-04, 01-05, 01-06, 01-07, all-downstream-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Physics behind an engine-agnostic interface — planck imported in exactly ONE file (planck-world.ts); everything else depends only on ./types"
    - "Pooled snapshot arrays mutated in place by step() — zero per-frame allocation on the render read path (getBalls / getContactPoints / getBoundarySegments)"
    - "Fix-Your-Timestep fixed accumulator @120Hz with previous/current/alpha for render interpolation"
    - "Feel constants are reference-anchored (SpaceCadetPinball behavior/values only) and derived, not magic literals (IN_PLANE_GRAVITY = sin(incline)·g)"
    - "TDD RED→GREEN: failing headless smoke test committed before the adapter/loop implementation"

key-files:
  created:
    - src/physics/types.ts
    - src/physics/constants.ts
    - src/physics/planck-world.ts
    - src/sim/loop.ts
    - src/physics/planck-world.smoke.test.ts
  modified: []

key-decisions:
  - "Bounded test box is a 2m×3m chain-loop with one thin interior edge, off the ball's fall column so the thin wall exists as a future tunneling target without affecting the containment proof. Real table geometry is Phase 3."
  - "Ball radius 0.2m, density 1 (solver param, not a feel constant); bullet enabled both via BodyDef.bullet and explicit setBullet(true)."
  - "drainEvents() transfers ownership of a fresh event list (allocates per-drain, not per-frame); the no-per-frame-allocation invariant is enforced on the hot render read path (balls/contacts/segments), which use grow-only pools."
  - "Collision events are recorded on post-solve (where normalImpulse is available) and classified via body userData tags."

patterns-established:
  - "Single Planck import boundary: `grep -rn \"from 'planck'\" src | grep -v planck-world` returns nothing"
  - "Internal Mutable* view types back the read-only public snapshot interfaces"

requirements-completed: [PHYS-01, PHYS-02, PHYS-03]

# Metrics
duration: 18min
completed: 2026-07-15
---

# Phase 1 Plan 02: Physics Core — Interface, Constants, Planck Adapter & Fixed-Step Loop Summary

**Engine-agnostic N-ball-ready physics interface + reference-anchored feel constants, a Planck.js adapter (one `setBullet(true)` ball under tilted in-plane gravity inside a chain/edge box with a thin wall), and a 120Hz fixed-step accumulator loop — proven by a green headless smoke test (ball falls, stays contained, accumulator drains deterministically).**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-15T02:55:00Z (approx)
- **Completed:** 2026-07-15T03:12:04Z
- **Tasks:** 2 (Task 2 was TDD: RED → GREEN)
- **Files created:** 5

## Accomplishments

- **The contract exists.** `src/physics/types.ts` defines `PhysicsWorld`, `BallState`, `FlipperState`, `CollisionEvent`, `Segment`, `Vec2` — all id-keyed and N-ball-ready, with snapshots read out of pooled objects. This is the interface every later plan and downstream phase (2–6) builds on.
- **Feel is reference-anchored, not guessed.** `src/physics/constants.ts` derives `IN_PLANE_GRAVITY = sin(28°)·9.81 ≈ 4.6 m/s²` from `INCLINE_DEG` (not a magic literal), plus damping/restitution/friction/radius/ppm/`FIXED_DT`/`MAX_FRAME_MS`, each commented with its SpaceCadetPinball behavior basis (values only, never assets — D-08).
- **First real physics behind the interface.** `PlanckWorld` creates a Planck `World` at in-plane gravity, one dynamic circle ball with `setBullet(true)` CCD + `linearDamping` for weight, inside a chain-loop box with one deliberately thin interior edge wall. Ball/contact snapshots are pooled and mutated in place — no per-frame allocation.
- **Frame-rate-independent stepping.** `FixedStepLoop` runs a 120Hz accumulator decoupled from render, clamps huge deltas at `MAX_FRAME_MS` (spiral-of-death guard, threat T-01-02), and keeps previous/current/alpha for later interpolation.
- **Green headless proof.** Three smoke behaviors pass: (1) ball falls (+y) and gains speed after 0.5s; (2) ball stays inside the boundary-derived box on every step across a 5s run; (3) the accumulator drains to an exact integer step count, clamps a 100s delta to a bounded burst, and is deterministic across identical input sequences.
- **Physics is fully isolated:** `planck` is imported in `planck-world.ts` only; `tsc --noEmit` and `eslint .` are clean.

## Task Commits

Each task was committed atomically (Task 2 followed TDD RED → GREEN):

1. **Task 1: Author engine-agnostic interface + reference-anchored constants** — `618819e` (feat)
2. **Task 2 (RED): Failing headless smoke test** — `b1a1d02` (test)
3. **Task 2 (GREEN): Planck adapter + fixed-step loop** — `3cfc628` (feat)

**Plan metadata:** final docs commit — this SUMMARY + STATE + ROADMAP + REQUIREMENTS.

_No REFACTOR commit was needed — the GREEN implementation was already clean._

## Files Created/Modified

- `src/physics/types.ts` — the engine-agnostic, N-ball-ready physics contract (interfaces + value shapes).
- `src/physics/constants.ts` — reference-anchored, HMR-tunable feel constants (incline/gravity/damping/restitution/radius/ppm/FIXED_DT/MAX_FRAME_MS).
- `src/physics/planck-world.ts` — the ONLY planck-importing file; `PlanckWorld` adapter (bullet ball + chain/edge box + pooled snapshots + drained events).
- `src/sim/loop.ts` — `FixedStepLoop` 120Hz accumulator with clamp + interpolation snapshots (engine-agnostic; imports only the interface).
- `src/physics/planck-world.smoke.test.ts` — headless smoke proof of fall / containment / deterministic drain.

## Decisions Made

- **Bounded test box = 2m×3m chain loop + one thin interior edge**, placed off the ball's fall column so the thin wall is a standing future-tunneling target without perturbing the containment proof. Real Space Cadet geometry is Phase 3.
- **`drainEvents()` allocates a fresh list per drain** (game-logic path), while the per-frame render read path (`getBalls`/`getContactPoints`/`getBoundarySegments`) uses grow-only pools — honoring the no-per-frame-allocation mandate where it matters.
- **CCD enabled twice** (BodyDef `bullet: true` + explicit `setBullet(true)`) — belt-and-braces for the make-or-break anti-tunneling flag and to satisfy the acceptance grep.
- **Test bounds are derived from `getBoundarySegments()`**, so the containment proof targets the interface, not hard-coded numbers (keeps it engine-agnostic).

## Deviations from Plan

None — plan executed exactly as written. (One trivial in-test type fix during GREEN: the determinism sequence was refactored from `[frameMsSeq()]` to `frameMsSeq()` to satisfy `noUncheckedIndexedAccess`; committed within the GREEN commit `3cfc628`. This is a test-authoring correction, not a scope or behavior deviation.)

## Known Stubs

- **`PlanckWorld.getFlippers()` returns an empty pooled array `[]`.** This is intentional and plan-sanctioned: the interface is fixed now (N-ball-ready, flipper-ready) but no real flippers exist until Phase 2 (a stress *test* flipper arrives in this phase's later plans; the real controllable flipper is Phase 2). Not a blocking stub — the plan's goal (one ball falling + contained behind the interface) is fully met.

## Issues Encountered

- `noUncheckedIndexedAccess` flagged `seq[0]` as possibly undefined in the smoke test's determinism block — resolved by iterating the sequence array directly. No runtime impact.

## User Setup Required

None — no external service configuration required. This is a client-side, offline physics module (no network, auth, or data at rest).

## Next Phase Readiness

- **Ready for plan 01-03 (debug sandbox):** `getBalls()`, `getBoundarySegments()`, `getContactPoints()`, and the loop's `previous`/`current`/`alpha` are all in place for interpolated Canvas 2D debug-draw + HUD.
- **Ready for plans 01-04/01-05/01-06 (stress flipper + soak gate):** the interface is N-ball-ready and engine-agnostic, so the tunnel-proof soak harness targets `PhysicsWorld` directly (D-05); the `MAX_FRAME_MS` clamp is in place to be stress-proven in 01-04.
- **No blockers.** Threat T-01-02 (large-dt spiral) is mitigated by the clamp; its stress proof is deferred to plan 01-04 as designed.

## Self-Check: PASSED

All 5 created files exist on disk (types.ts, constants.ts, planck-world.ts, loop.ts, planck-world.smoke.test.ts); commits `618819e`, `b1a1d02`, `3cfc628` are present in git history. `npx tsc --noEmit`, `npx eslint .`, and `npx vitest run` all exit 0; the single-planck-import invariant holds.

---
*Phase: 01-physics-core-spike*
*Completed: 2026-07-15*
