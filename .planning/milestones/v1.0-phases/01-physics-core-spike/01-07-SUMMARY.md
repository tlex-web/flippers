---
phase: 01-physics-core-spike
plan: 07
subsystem: testing
tags: [planck, physics, stability, energy, engine-decision, vitest, ccd, feel-constants]

# Dependency graph
requires:
  - phase: 01-02
    provides: PlanckWorld adapter, PhysicsWorld interface, reference-anchored feel constants, max-speed test flipper
  - phase: 01-03
    provides: throwaway Canvas debug sandbox (npm run dev) + kinetic-energy HUD
  - phase: 01-06
    provides: headless swept-containment soak gate (npm run soak) — the SOLE tunnel-proof pass/fail gate + CCD-off negative control
provides:
  - Headless resting-ball stillness proof (settles, no jitter, no corner-sticking) via the engine-agnostic interface + FixedStepLoop
  - Kinetic-energy monotonic-non-increasing proof (never spontaneously gains speed) with a teeth-proving synthetic-speed-up rejection
  - Confirmed (unchanged) reference-anchored feel constants, now backed by a passing stability/energy proof
  - ENGINE-DECISION.md — the LOCKED, evidence-backed engine decision (Planck confirmed by the passing soak + stability proof; custom-swept-solver fallback NOT triggered)
  - Operator-approved visibly-weighty fall/settle (D-09 Phase-1 target); final heavy verdict deferred to Phase 2
affects: [phase-2 flipper feel, phase-2 rotational CCD, phase-3 table geometry, any future engine revisit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Engine-agnostic stability/energy proof (drives PhysicsWorld + FixedStepLoop, never Planck) so it survives an engine swap
    - Floor-resting horizontal-launch scenario to isolate a monotonically-decaying kinetic-energy series (no gravity energy input)
    - Teeth-proven assertion — the monotonic detector rejects a synthetic speed-up (a green run means "no spontaneous gain", not "check never fires")

key-files:
  created:
    - src/harness/stability.test.ts
    - .planning/phases/01-physics-core-spike/ENGINE-DECISION.md
  modified:
    - src/physics/constants.ts
    - .planning/phases/01-physics-core-spike/SKELETON.md

key-decisions:
  - "Engine LOCKED: Planck.js 1.5.0 (setBullet + world continuousPhysics, behind the PhysicsWorld interface), confirmed by the passing npm run soak tunnel-proof gate + the green stability/energy proof; the D-01 custom-swept-solver fallback is documented but NOT triggered"
  - "Kinetic-energy monotonicity is proven on a floor-resting, horizontally-launched ball so in-plane gravity is carried by the normal force and cannot pump energy in — a free-falling ball legitimately gains kinetic energy, which is expected physics, not the defect under test"
  - "Rest is detected as speed < 0.02 m/s held continuously for 0.5 s (past any last micro-bounce and into Box2D body-sleep); relying on Box2D's mature resting-contact + sleeping is NOT an ad-hoc sleep hack (it is read through the interface)"
  - "Feel constants held UNCHANGED — they pass the stability/energy proof and the soak; per D-09 the final by-feel heavy verdict is deferred to Phase 2 (judged through flipper catch/return on the real incline)"

patterns-established:
  - "Stability/energy proofs consume only the PhysicsWorld interface + the production FixedStepLoop (engine-agnostic, D-05)"
  - "A locked architectural decision is written down with cited empirical evidence (ENGINE-DECISION.md) + grep-enforced citations, so no later phase re-derives it"

requirements-completed: [PHYS-01, PHYS-02]

# Metrics
duration: 14min
completed: 2026-07-15
---

# Phase 1 Plan 07: Resting-Ball Stability, Energy Proof & Locked Engine Decision Summary

**A headless resting-ball stillness + kinetic-energy-monotonic proof (driven through the engine-agnostic interface, never Planck), the reference-anchored feel constants confirmed unchanged, and the Planck engine decision LOCKED on the passing soak + stability evidence — with an operator-approved visibly-weighty fall/settle (D-09 Phase-1 target).**

## Performance

- **Duration:** ~14 min (incl. the human weighty-feel checkpoint round-trip)
- **Started:** 2026-07-15T14:06:00Z (approx)
- **Completed:** 2026-07-15T14:12:00Z (approx)
- **Tasks:** 3 (2 code/docs + 1 human-verify sign-off)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- **Stability proof (PHYS-01 criterion #3):** `src/harness/stability.test.ts` proves headlessly, through `PhysicsWorld` + the production `FixedStepLoop`, that a dropped ball settles to rest with no post-settle jitter, a corner-seeded ball settles (no corner-sticking), and total kinetic energy is monotonically non-increasing once undisturbed (never spontaneously gains speed). The monotonic detector is shown to have teeth (rejects a synthetic speed-up). 4 new tests → the default suite is now **26 green (was 22)**.
- **Feel constants confirmed (PHYS-01 criterion #1, D-08):** the reference-anchored constants (`INCLINE_DEG=28` → `IN_PLANE_GRAVITY≈4.6 m/s²`, `BALL_LINEAR_DAMPING=0.4`, `BALL_RESTITUTION=0.35`, …) are held UNCHANGED — they pass this stability/energy proof and the tunnel-proof soak — with a provenance note added to `constants.ts`.
- **Engine LOCKED (criterion #5, D-01/D-02):** `ENGINE-DECISION.md` records the evidence-backed lock of Planck.js 1.5.0 (`setBullet` + `continuousPhysics`, behind the interface), confirmed by the passing `npm run soak` gate (630 s simulated at ~10× the ball's real max velocity vs the thin wall + max-speed flipper; commits `1197173` / `8c5fa1e`) and the green stability proof. The custom-swept-solver fallback is documented but NOT triggered. `SKELETON.md`'s engine status is updated pending → CONFIRMED.
- **Operator sign-off (D-09 Phase-1 target):** a human viewed the sandbox (`npm run dev`, `http://localhost:5173/`) and approved that the fall/settle reads as visibly weighty (not floaty) and the resting ball sits perfectly still. The final by-feel "heavy" verdict remains explicitly deferred to Phase 2.

## Task Commits

Each task was committed atomically:

1. **Task 1: Resting-ball stillness + energy-monotonic proof; confirm feel constants** - `aaedd8a` (test)
2. **Task 2: Lock and document the engine decision** - `40aeddb` (docs)
3. **Task 3: Confirm visibly weighty fall/settle in the sandbox** - human-verify checkpoint, **operator APPROVED** (verification only, no code commit)

**Plan metadata:** see the final `docs(01-07)` commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS).

_Note: Task 1 is tdd-tagged, but the RED/GREEN split does not apply — the physics predates its proving tests by plan design (same rationale as plan 01-06 Task 2). It is a single `test` commit._

## Files Created/Modified
- `src/harness/stability.test.ts` (created) - Engine-agnostic stability/energy proof: settles-to-rest + no-jitter, no corner-sticking, kinetic-energy monotonic-non-increasing, and a monotonic-detector teeth proof (synthetic-speed-up rejection).
- `.planning/phases/01-physics-core-spike/ENGINE-DECISION.md` (created) - The LOCKED engine decision with cited evidence (passing soak + stability proof), the un-triggered D-01 fallback, and the Box2D CCD subtlety (world `continuousPhysics` vs per-body `setBullet`).
- `src/physics/constants.ts` (modified) - Added a "CONFIRMED (plan 01-07)" provenance note; **values unchanged**.
- `.planning/phases/01-physics-core-spike/SKELETON.md` (modified) - Engine-decision status updated pending → CONFIRMED/LOCKED, citing the soak + ENGINE-DECISION.md.

## Decisions Made
- **Energy monotonicity is proven on a floor-resting, horizontally-launched ball** so in-plane gravity is fully carried by the floor's normal force and cannot pump kinetic energy in. A free-falling ball legitimately *gains* kinetic energy as gravity does work — that is expected physics, not the solver defect under test — so the monotonic claim is scoped to a scenario with no energy source, where damping + inelastic contacts can only bleed energy.
- **Rest = speed < 0.02 m/s held continuously for 0.5 s** (past any last micro-bounce and into Box2D body-sleep). Relying on Box2D's mature resting-contact + sleeping is deliberate (CLAUDE.md) and read through the interface — not an ad-hoc `setAwake` hack.
- **Feel constants held unchanged.** No tuning was needed: the constants already produce a settling, jitter-free, energy-decaying ball that passes the soak, and the operator confirmed a visibly weighty fall/settle. The final heavy verdict is a Phase-2 concern (D-09).

## Deviations from Plan

None - plan executed exactly as written. (Task 1's `files_modified` listed `constants.ts`; it was confirmed with a provenance note rather than tuned, because the values already pass the proof and the soak — no numeric change was warranted.)

## Issues Encountered
None. Both the stability/energy proof and the re-run soak gate were green on the first attempt, consistent with Box2D's mature resting-contact + sleeping and the already-passing tunnel-proof gate from plan 01-06.

## Known Stubs
None — the stability proof, the locked decision doc, and the confirmed constants are fully wired and green.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Phase 1 is functionally complete (7/7 plans).** All five success criteria are met: heavy-not-floaty reference-anchored constants (operator-confirmed weighty), a proven tunnel-proof gate (01-06), a still resting ball with energy trending down (this plan), frame-rate independence + tab-blur survival (01-04), and an empirically LOCKED, interface-isolated, N-ball-ready engine (this plan).
- **For Phase 2 (Flippers & Feel):** the engine boundary (planck only in `planck-world.ts`), the motorized-revolute test flipper, `getFlippers()`/`setFlipperMotor`, and the interface-level soak are all in place. Real flippers are judged by the same `npm run soak`.
- **Carry-forward blocker (not blocking this lock):** rotational CCD (angular sub-stepping / speculative contacts) for fast real flippers warrants a focused Phase-2 research pass (per STATE.md); if it ever regresses, the swept invariant goes RED with a replayable seed and a custom solver can be dropped behind the interface without touching downstream code.

---
*Phase: 01-physics-core-spike*
*Completed: 2026-07-15*

## Self-Check: PASSED
- Files verified present: `src/harness/stability.test.ts`, `.planning/phases/01-physics-core-spike/ENGINE-DECISION.md`, `.planning/phases/01-physics-core-spike/01-07-SUMMARY.md`.
- Commits verified: `aaedd8a` (Task 1, test), `40aeddb` (Task 2, docs).
- Gates green: `npx tsc --noEmit` exit 0; `npx eslint .` exit 0; `npx vitest run` = 26 passed (was 22); `npm run soak` exit 0 (630 s simulated, re-verified while locking the engine); dev server HTTP 200 at http://localhost:5173/.
- Operator sign-off recorded: weighty-feel APPROVED (D-09 Phase-1 target); final heavy verdict deferred to Phase 2.
