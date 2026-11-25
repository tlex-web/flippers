# Phase 1: Physics Core Spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 1-Physics Core Spike
**Mode:** advisor (research-backed comparison tables; calibration tier = standard)
**Areas discussed:** Engine decision path, Tunnel-proof verification, Debug view scope, "Heavy, not floaty" feel acceptance

---

## Engine decision path

| Option | Description | Selected |
|--------|-------------|----------|
| Planck-first | Integrate Planck 1.5 + `setBullet` behind the common interface; build custom only if Planck fails the tunnel/feel bar | ✓ |
| Parallel bake-off | Implement both Planck and a minimal custom solver behind one interface and compare empirically | |
| Custom swept solver first | Hand-roll swept circle-vs-segment/arc CCD + impulse resolver from day one | |

**User's choice:** Planck-first (recommended)
**Notes:** `setBullet` does swept CCD against both static walls and the dynamic test flipper — the make-or-break case. Integration is cheap/reversible because the ball/flipper/event interface is already the contract, so the 10-min stress run makes the empirical call. Bake-off escalated to only if Planck-first fails. Custom solver's risk is concentrated on swept circle-vs-*rotating-arc* TOI — the exact thing Box2D already hardened.

---

## Tunnel-proof verification (criterion #2)

| Option | Description | Selected |
|--------|-------------|----------|
| Both, layered | Headless seeded soak = CI pass/fail gate; visual sandbox replays failing seeds in slow-mo | ✓ |
| Headless soak only | Automated deterministic soak with containment assertions, no visual | |
| Interactive sandbox only | Human flings the ball and watches — anecdotal, can't prove absence | |

**User's choice:** Both, layered (recommended)
**Notes:** Headless soak is the SOLE pass/fail gate; sandbox is diagnosis only. Own the RNG (seeded, never `Math.random`); use a swept containment invariant so a ball that exits and re-enters between 120 Hz steps still trips failure. Harness targets the ball/flipper interface, not Planck, so the same proof runs against either engine.

---

## Debug view scope

| Option | Description | Selected |
|--------|-------------|----------|
| Throwaway debug-draw + numeric gate | Minimal Canvas debug view behind the physics interface + numeric assertions; discarded at Phase 5 | ✓ |
| Headless numbers only | No canvas during the spike; pure numeric assertions + logs | |
| Carry-forward overlay | Build the debug overlay to deliberately survive into Phase 5 | |

**User's choice:** Throwaway debug-draw + numeric gate (recommended)
**Notes:** Same toolset as the no-tunnel pick (sandbox = debug-draw, gate = numeric assertions). Drawn from the interpolated fixed-state pair. Rejected: Planck's engine-specific `Testbed` (violates engine-agnostic interface + fixed-timestep loop) and engineering for carry-forward (couples spike to unknown Phase 5 rendering).

---

## "Heavy, not floaty" feel acceptance (criterion #1)

| Option | Description | Selected |
|--------|-------------|----------|
| Reference-anchored, sign-off deferred | Derive constants from SpaceCadetPinball decomp (incline/gravity/damping), HMR-tunable; final feel verdict deferred to Phase 2 | ✓ |
| Free-tune by feel | Hand-pick values, no external anchor | |
| Defer heaviness entirely to Phase 2 | Ship defaults now, prove only stability + tunnel-proofness | |

**User's choice:** Reference-anchored, sign-off deferred (recommended)
**Notes:** `TTableLayer.cpp` exposes the real recipe — a tilted-table gravity projection (~28° incline) + velocity-proportional damping, which *is* pinball heaviness. Translate to Planck by ratio (effective in-plane g ≈ sin(incline)·g_full; drag → `linearDamping`) at an honest px-per-meter scale (ball ~0.3–0.5 m). Phase-1 "done" = reference-derived + visibly weighty in the sandbox; final by-feel verdict deferred to Phase 2 where flippers/incline exist.

---

## Claude's Discretion

- Exact PRNG algorithm; soak parameter ranges and duration beyond the 10-min minimum; debug HUD layout; module/file naming.
- Exact pixels-per-meter scale and initial constant values within the reference-anchored ballpark.
- Test runner choice for the headless gate.

## Deferred Ideas

None — discussion stayed within phase scope. The "custom swept solver" is an in-phase fallback (not deferred). Real flippers/cradle → Phase 2, table incline/geometry → Phase 3, shipping renderer → Phase 5 (already roadmapped).
