---
phase: 02-flippers-feel
plan: 04
subsystem: physics
tags: [planck, box2d, sub-stepping, rotational-ccd, anti-tunnel, determinism, flipper]

# Dependency graph
requires:
  - phase: 02-flippers-feel
    plan: 01
    provides: Two mirrored capsule feel flippers on motorized revolute joints, the flipperJoints registry (joint.getJointSpeed), FLIPPER_UP_SPEED/RETURN_SPEED, the reference-anchored constants block, the grow-only post-solve event pool + drainEvents accumulation seam
  - phase: 01-physics-core-spike
    provides: PhysicsWorld interface, PlanckWorld.step(), the ball setBullet translational CCD, the seeded swept-containment soak + flipperSweptTunnel invariant
provides:
  - Adaptive angular sub-stepping inside PlanckWorld.step() (D-01) — the primary FLIP-04 rotational anti-tunnel mechanism, behind the unchanged PhysicsWorld interface
  - N = ceil(omega * FLIPPER_LENGTH_M * FIXED_DT / (0.5 * BALL_RADIUS_M)) derived from live joint speed (deterministic; never wall-clock)
  - FLIPPER_MAX_ANGULAR_SPEED secondary cap constant bounding N <= 4 (D-02)
  - PlanckWorldOptions.subStepping off-switch (false forces N=1) — the 02-05 negative-control hook
  - lastSubStepCount concrete-class diagnostic for unit assertion (not on the interface)
affects: [02-flippers-feel plan 02-05 (FLIP-04 seeded green/red gate uses subStepping:false as the teeth control), 03-table-layout, 04-reactive-scoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Adaptive angular sub-stepping: split a fixed step into N deterministic Planck sub-steps sized from live peak flipper joint speed so the fastest bat's per-sub-step tip arc stays below ~half a ball radius (Planck TOI sweeps translation via setBullet but can miss a large rotation; Erin Catto GDC 2013)"
    - "Cross-sub-step event accumulation for free: the grow-only post-solve pool is only reset by drainEvents(), so calling world.step(subDt) N times WITHOUT draining accumulates events; ball/flipper pools + contacts sync ONCE after the last sub-step"
    - "Sub-step dts sum EXACTLY to the frame dt (last sub-step takes the remainder), so N=1 is bit-identical to a single full step and float drift can't accumulate"
    - "Secondary cap is a BOUND only (T-02-07 frame-budget DoS), derived once at module load from FLIPPER_MAX_ANGULAR_SPEED; never the non-penetration mechanism"

key-files:
  created:
    - src/physics/substep.test.ts
    - .planning/phases/02-flippers-feel/02-04-SUMMARY.md
  modified:
    - src/physics/planck-world.ts
    - src/physics/constants.ts

key-decisions:
  - "N is derived from the LIVE peak joint speed via joint.getJointSpeed() across all flippers, never wall-clock (Date.now/performance.now) — replay determinism (T-02-09)"
  - "Sub-step dts sum exactly to dtSeconds via a last-sub-step remainder scheme, so N=1 reproduces the prior single-step behavior bit-for-bit and existing determinism proofs stay green"
  - "FLIPPER_MAX_ANGULAR_SPEED = 96 rad/s -> SUB_STEP_N_MAX = 4; at the feel FLIPPER_UP_SPEED (30) N = 2, so the cap never engages in normal play (pathological-omega backstop only)"
  - "subStepping is independent of bullet: it toggles the ROTATIONAL guarantee only; the ball's translational setBullet CCD is left untouched"
  - "lastSubStepCount is a concrete-class field, deliberately NOT on the PhysicsWorld interface, so engine internals never leak into the contract"

patterns-established:
  - "Adaptive sub-stepping + cross-sub-step event accumulation (see tech-stack patterns)"
  - "A separate boolean world option (subStepping) as a teeth-bearing negative-control hook for a downstream seeded gate"

requirements-completed: [FLIP-04]

# Metrics
duration: 15min
completed: 2026-07-15
---

# Phase 2 Plan 04: Adaptive Angular Sub-Stepping Summary

**`PlanckWorld.step()` now splits the fixed step into `N` deterministic Planck sub-steps sized from the live flipper joint speed (`N = ceil(ω·L·dt / (0.5·r))`, N=1 at rest, N=2 at feel up-speed), bounded to N≤4 by a secondary cap and forceable off via `subStepping:false` — the primary FLIP-04 rotational anti-tunnel mechanism, entirely behind the unchanged `PhysicsWorld` interface.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-15T17:04Z
- **Completed:** 2026-07-15T17:15Z
- **Tasks:** 2 (both green first pass; the sub-step law was numerically pre-verified with a throwaway probe before the real test was written)
- **Files:** 1 created (test), 2 modified (adapter + constants)

## Accomplishments
- Rewrote `PlanckWorld.step(dtSeconds)` into an adaptive N-sub-step loop (D-01): it reads the peak `|joint.getJointSpeed()|` across `flipperJoints`, computes `N = ceil(ω·FLIPPER_LENGTH_M·FIXED_DT / (0.5·BALL_RADIUS_M))`, clamps to the D-02 cap, and calls `world.step(subDt)` N times. All scalar — zero per-step allocation (T-02-07).
- Events **accumulate across sub-steps for free**: the loop never drains/resets the grow-only post-solve pool between sub-steps; the ball pool, flipper pool, and `syncContactPoints()` refresh **once, after the last sub-step** (T-02-08). Sub-step dts sum exactly to `dtSeconds` (last takes the remainder), so `N=1` is bit-identical to the old single step.
- Added `FLIPPER_MAX_ANGULAR_SPEED = 96` (rad/s) to `constants.ts` with a doc block stating it is the **secondary** bound (N≤4), explicitly NOT the non-penetration guarantee (D-02). `SUB_STEP_N_MAX` is derived once at module load.
- Added `PlanckWorldOptions.subStepping` (default `true`); `false` forces `N=1` regardless of ω — the teeth-bearing negative-control hook plan 02-05 uses. `bullet`/CCD left untouched by this toggle.
- Exposed `lastSubStepCount` as a concrete-class diagnostic (not on the interface) so the unit test can assert the law without leaking engine internals.
- New `src/physics/substep.test.ts` (6 tests) proves: N=1 at rest, N=2 at `FLIPPER_UP_SPEED` (matches the formula numerically), N≤N_MAX under a hard two-flipper drive, N=1 when `subStepping:false`, and ≥1 collision event drained on a genuinely sub-stepped (N≥2) contacting step.
- Full suite green **63/63** (+6), `npx eslint .` + `npx tsc --noEmit` clean, and the headless `npm run soak` tunnel-proof gate stays green with sub-stepping active. Engine isolation preserved (no `planck` import in the test).

## Task Commits

1. **Task 1: sub-stepping in step() + secondary cap + off-switch** - `0ea479b` (feat) — `src/physics/planck-world.ts`, `src/physics/constants.ts`
2. **Task 2: unit-prove the sub-step law, cap, off-switch, event accumulation** - `b898a4e` (test) — `src/physics/substep.test.ts`

## Files Created/Modified
- `src/physics/constants.ts` - Added `FLIPPER_MAX_ANGULAR_SPEED` (secondary N-cap, D-02) with a doc block that it bounds N≤4 and is NOT the primary guarantee.
- `src/physics/planck-world.ts` - `step()` rewritten as the adaptive N-sub-step loop (D-01); added `subSteppingEnabled` field + `PlanckWorldOptions.subStepping`; `lastSubStepCount` diagnostic; module-level `subStepsFor()` helper + `SUB_STEP_N_MAX`. Interface, harness, and the ball's `setBullet` CCD untouched.
- `src/physics/substep.test.ts` - New unit proof of the sub-step law, the cap bound, the off-switch, and cross-sub-step event accumulation (constructs the adapter only; no `planck` symbol).

## Decisions Made
- **N from live joint speed, not wall-clock.** `omega = max |joint.getJointSpeed()|` over `flipperJoints` (0 when every bat is at rest → N=1). This is the D-01/T-02-09 determinism requirement: replay depends on N being a pure function of physics state. Acceptance greps confirm no `Date.now`/`performance.now` in `step()`.
- **Exact-sum remainder scheme.** `subDt = dtSeconds/N`; the last sub-step takes `dtSeconds − subDt·(N−1)`. This guarantees the N sub-step dts sum to `dtSeconds` exactly and makes `N=1` reproduce the previous single-step call bit-for-bit — so `loop.determinism`, `stability`, and `smoke` proofs stay green.
- **Cap sizing.** `FLIPPER_MAX_ANGULAR_SPEED = 96` because `N=4 ↔ ω = 4·0.5·BALL_RADIUS_M/(FLIPPER_LENGTH_M·FIXED_DT) = 96 rad/s`. At the feel up-speed (30) N=2; the cap is a pure pathological-ω backstop that never engages in play.
- **subStepping ⟂ bullet.** Kept the two switches orthogonal per the plan: the 02-05 positive gate needs `subStepping` ON, its teeth control needs it OFF, and neither touches translational CCD.

## Deviations from Plan
None — the plan executed exactly as written. No auto-fixes were required: the sub-stepping change kept the entire existing suite green on the first run (including the `bullet:false` soak negative controls, which run with sub-stepping ON by default and still tunnel as intended), and the `npm run soak` gate stayed green. No files outside the plan's `files_modified` list were touched.

## Authentication Gates
None.

## Issues Encountered
- **Soak negative-control interference risk (investigated, no action needed).** The existing `soak.test.ts` `bullet:false` flipper/boundary negative controls run through `new PlanckWorld({ bullet })` with `subStepping` defaulting ON, and `runCase` drives the left flipper at feel speed (ω≈30 → N=2). Sub-stepping halves the ball's per-sub-step travel, which could in principle prevent a tunnel the control needs to stay RED. Verified empirically: at the retuned 105 m/s launch each sub-step chord (~0.44 m) still clears the bat's ~0.27 m clearance band, so ≥1 case per control still tunnels and both controls (and their deterministic replays) stay RED. The soak harness was left untouched, as required.
- **TDD ordering.** The plan structures the two `tdd="true"` tasks as implementation-first (Task 1) then unit-proof (Task 2), so this is not a RED→GREEN commit pair. To de-risk the fiddly N-value and event-accumulation assertions, the sub-step counts (1/2/4) and a working contact scenario were confirmed with a throwaway probe test (created, observed, deleted — never committed) before writing the real `substep.test.ts`.

## Known Stubs
None. This plan is a physics-step control-flow change plus its unit proof on in-memory state; no placeholder data flows to any UI, and no feature was deferred behind a stub.

## Next Phase Readiness
- The FLIP-04 **mechanism** is in place and unit-proven: a deterministic, bounded N-sub-step `step()` that shrinks the fast bat's per-sub-step arc below the ball radius, accumulates events across sub-steps, syncs once, and can be forced off.
- **Ready for 02-05 (the seeded FLIP-04 gate):** it should assert the swept non-penetration soak is **green with sub-stepping ON at peak ω** and **RED with `subStepping:false`** at the same ω — the off-switch and `lastSubStepCount` diagnostic added here are exactly that gate's controls. Per PATTERNS.md the `flipperSweptTunnel` invariant may want a `tipRadius`-aware clearance in that gate.
- No interface, harness, or CCD surface changed, so 02-05 builds on this without rework.

---
*Phase: 02-flippers-feel*
*Completed: 2026-07-15*

## Self-Check: PASSED
