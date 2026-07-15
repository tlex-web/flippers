---
phase: 01-physics-core-spike
plan: 04
subsystem: physics
tags: [fixed-timestep, accumulator, determinism, frame-rate-independence, tab-blur, spiral-of-death, PHYS-03, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-02
    provides: "FixedStepLoop (120Hz accumulator + MAX_FRAME_MS clamp + previous/current/alpha) and the engine-agnostic PhysicsWorld interface + PlanckWorld adapter"
provides:
  - "Headless proof that physics is frame-rate-independent: 60/120/144Hz render cadences run an identical fixed-step count and reach a bit-identical final ball state"
  - "Headless proof (regression guard) that a huge tab-blur delta is clamped to a bounded catch-up burst — no spiral of death, finite bounded state, clean recovery (threat T-01-02)"
  - "PHYS-03 satisfied and regression-guarded by two headless tests targeting the PhysicsWorld/FixedStepLoop interface (D-05)"
affects: [01-05, 01-06, 01-07, all-downstream-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Determinism proof drives the loop through the engine-agnostic interface (never planck) — survives an engine swap unchanged (D-05)"
    - "Total simulated time parked mid-fixed-step so floor(total/step) is robust to float-summation differences between cadences — step counts are equal by construction, not luck"
    - "Identical fixed-step count ⇒ bit-identical Planck state (no RNG, constant dt) → final-state assertion is exact equality (epsilon 0), not a fudge tolerance"
    - "Tab-blur clamp proven by contrasting the bounded clamped burst against the un-clamped ~600-step spiral it prevents"

key-files:
  created:
    - src/sim/loop.determinism.test.ts
    - src/sim/loop.tabblur.test.ts
  modified: []

key-decisions:
  - "No loop.ts hardening was required: the MAX_FRAME_MS clamp (Math.min(realDeltaMs, MAX_FRAME_MS)) from plan 01-02 already passes both proofs — the tests exposed no gap, so per the plan (`harden only if the tests expose a real gap`) loop.ts was left unchanged."
  - "Determinism total is (EXPECTED_STEPS + 0.5)·FIXED_DT to land mid-step; ~4.17ms boundary margin dwarfs ~1e-12ms accumulated float error, so 60/120/144Hz report identical step counts deterministically."
  - "Final-state equality asserted with exact toEqual (epsilon 0): identical step counts mean identical step() call sequences, and Planck is RNG-free, so states are bit-for-bit equal; any drift would be real nondeterminism, not float slop."

patterns-established:
  - "Regression-proof plan: characterization tests that lock in already-correct behavior from an earlier plan (RED collapses because the implementation exists and is correct)"

requirements-completed: [PHYS-03]

# Metrics
duration: 7min
completed: 2026-07-15
---

# Phase 1 Plan 04: Fixed-Timestep Determinism & Tab-Blur Survival Proof Summary

**Two headless proofs that lock in PHYS-03: the physics is frame-rate-independent (60/120/144Hz render cadences run the identical number of 120Hz fixed steps and reach a bit-identical final ball state) and tab-blur-proof (a 5s `advance()` is clamped to a bounded catch-up burst instead of a ~600-step spiral, stays finite and inside the box, and recovers cleanly). Both target the engine-agnostic interface (D-05); `loop.ts` needed no change — the existing `MAX_FRAME_MS` clamp already passes.**

## Performance

- **Duration:** ~7 min
- **Tasks:** 2 (both `tdd="true"` — see TDD Gate Compliance)
- **Files created:** 2 (both test files)
- **Files modified:** 0

## Accomplishments

- **Frame-rate independence is now a green test, not a hope.** `src/sim/loop.determinism.test.ts` drives three fresh identical worlds for the same total wall-clock via emulated 60Hz (16.67ms), 120Hz (8.33ms) and 144Hz (6.94ms) render deltas, and asserts (a) an identical executed fixed-step count (1200) across all three, and (b) a **bit-identical** final ball state (`toEqual`, epsilon 0). The total is parked mid-fixed-step so tiny float-summation differences between cadences cannot flip the step count.
- **Tab-blur / spiral-of-death is regression-guarded.** `src/sim/loop.tabblur.test.ts` warms up, then feeds a single `advance(5000)`; it asserts the call runs a bounded catch-up burst (≤ `MAX_FRAME_MS/step + 1`, far below the un-clamped 600), that the ball is finite (no NaN/Inf) and still inside the box (no teleport/tunnel-out), and that ordinary frames after the stall resume clean, bounded stepping (recovery).
- **Proven at the interface, not the engine.** Both tests construct `PlanckWorld` but assert exclusively through `PhysicsWorld` + `FixedStepLoop` (`advance`, `totalSteps`, `accumulatorMs`, `getBalls`, `getBoundarySegments`). No `planck` symbol is imported into either test — the single-import invariant (`grep "from \"planck\"" src | grep -v planck-world.ts` → empty) still holds, so the proofs survive a future engine swap (D-05).
- **No implementation change needed.** The `MAX_FRAME_MS` clamp and 120Hz accumulator built in 01-02 already satisfy both proofs; `loop.ts` was left untouched per the plan's "harden only if the tests expose a real gap."
- **Full gate green:** `npx vitest run` → 3 files / 8 tests pass (3 prior smoke + 2 determinism + 3 tab-blur); `npx tsc --noEmit` exit 0; `npx eslint .` exit 0.

## Task Commits

1. **Task 1 — determinism proof** — `e84f52e` (test): `test(01-04): prove frame-rate-independent simulation at 60/120/144Hz`
2. **Task 2 — tab-blur clamp proof** — `89b80fb` (test): `test(01-04): prove tab-blur large-dt clamp (spiral-of-death guard)`

**Plan metadata:** final docs commit — this SUMMARY + STATE + ROADMAP + REQUIREMENTS.

## Files Created/Modified

- `src/sim/loop.determinism.test.ts` — proof that 60/120/144Hz render cadences yield an identical fixed-step count and a bit-identical final ball state (targets `contains: "144"`).
- `src/sim/loop.tabblur.test.ts` — proof that a huge delta is clamped to a bounded catch-up burst, stays finite and inside the box, and recovers (targets `contains: "MAX_FRAME_MS"`).

## Decisions Made

- **Left `loop.ts` unchanged.** The plan authorized hardening the clamp only if the tests exposed a real gap; they did not — the existing `Math.min(realDeltaMs, MAX_FRAME_MS)` clamp bounds a 5s spike to ~30 steps and recovers. Modifying a passing guard would have been unwarranted churn.
- **Mid-step total for robust step-count equality.** `TOTAL_MS = (EXPECTED_STEPS + 0.5)·FIXED_DT·1000` parks the accumulator mid-step; the ~4.17ms margin to the nearest fixed-step boundary is ~12 orders of magnitude larger than the accumulated float error, so 60/120/144Hz report identical counts deterministically (documented in-test).
- **Exact final-state equality (epsilon 0).** Because identical step counts imply identical `world.step(FIXED_DT)` call sequences and Planck is RNG-free, the three worlds are bit-for-bit equal; `toEqual` is the honest assertion and any drift would flag real nondeterminism rather than be papered over by a tolerance.
- **Wall-bouncing determinism start.** The determinism ball is launched with a velocity so the proof exercises collision determinism, not just free-fall; the tab-blur ball is a plain drop (the clamp, not the trajectory, is under test).

## TDD Gate Compliance

Both tasks are marked `tdd="true"`, but plan 01-04 is a **regression-proof plan**: the behavior under test (the 120Hz accumulator's frame-rate independence and its `MAX_FRAME_MS` clamp) was implemented and shipped green in plan 01-02. Writing the proofs therefore did **not** produce a failing RED → passing GREEN transition — the tests pass immediately against the already-correct implementation (a legitimate "test passes during RED" per the fail-fast investigation: the feature genuinely already exists). Consequently there is no separate `feat`/GREEN commit for this plan; both commits are `test(...)` characterization/regression commits, and `loop.ts` was intentionally not modified. This is expected for a proof plan and is not a skipped gate.

## Deviations from Plan

None. Plan executed exactly as written. Task 2 lists `src/sim/loop.ts` in its `<files>` as a conditional target ("ADD the clamp if it does not already clamp"); the clamp was already present from 01-02, so no edit was made — this is the plan's own contingency, not a deviation.

## Known Stubs

None introduced. (The pre-existing `PlanckWorld.getFlippers()` empty-array stub from 01-02 is untouched and out of this plan's scope — real flippers arrive in later plans / Phase 2.)

## Threat Flags

None. This plan adds only headless tests; it introduces no new network, auth, file-access, or schema surface. It directly mitigates and regression-guards the one in-scope threat (T-01-02, tab-blur spiral) already registered in the plan's threat model.

## Issues Encountered

None. Both test files passed `tsc --noEmit` and `eslint .` on first run after authoring; the determinism `toEqual` bit-identical assertion passed without needing a tolerance.

## Next Phase Readiness

- **PHYS-03 is now fully proven and regression-guarded** (frame-rate independence + tab-blur survival), alongside PHYS-01/PHYS-02 from 01-02. The fixed-step loop is trustworthy for every downstream plan that drives it.
- **Ready for 01-05/01-06 (soak gate + stress flipper):** the soak harness can rely on the loop being deterministic and clamp-safe, so seeded soak runs are reproducible.
- **No blockers.**

## Self-Check: PASSED

All 2 created files exist on disk; commits `e84f52e` and `89b80fb` are present in git history; `npx vitest run` (8 tests), `npx tsc --noEmit`, and `npx eslint .` all exit 0; the single-planck-import invariant holds and the artifact `contains` tokens ("144", "MAX_FRAME_MS") are present.

---
*Phase: 01-physics-core-spike*
*Completed: 2026-07-15*
