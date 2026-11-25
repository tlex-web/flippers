---
phase: 01-physics-core-spike
plan: 06
subsystem: testing
tags: [planck, ccd, soak, tunnel-proof, prng, vitest, physics, swept-containment]

# Dependency graph
requires:
  - phase: 01-02
    provides: PlanckWorld adapter, PhysicsWorld interface, max-speed motorized test flipper, CCD priming (issue #167)
  - phase: 01-04
    provides: FIXED_DT deterministic fixed-step loop
  - phase: 01-05
    provides: mulberry32 seeded PRNG + sweptEscaped swept containment invariant
provides:
  - Headless deterministic swept-containment SOAK — the SOLE PHYS-02 pass/fail gate (D-03)
  - Seeded (mulberry32) sweep of launch angle x speed(past real max) x flipper phase, aimed at the thin wall + max-speed flipper
  - Per-step swept containment via sweptEscaped(boundary) + a fast-tunnel crossing test for the moving flipper bat
  - Replayable failure records (seed + full ball/flipper state); deterministic seed replay
  - CCD-off negative control proving the gate goes RED on real tunneling
  - bullet/ccd construction option on PlanckWorld (world-level continuousPhysics toggle)
  - npm run soak gate (dedicated vitest.gate.config.ts; excluded from the fast default run)
affects: [01-07 engine decision, phase-2 flipper feel, phase-3 table geometry]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Seeded sweep-matrix soak driving the engine-agnostic interface (never Planck directly)
    - CCD-off negative control (world-level continuousPhysics off) as a false-green guard
    - Dedicated *.gate.test.ts + vitest.gate.config.ts split so the >=10-min gate is out of the fast default run

key-files:
  created:
    - src/harness/soak.ts
    - src/harness/soak.gate.test.ts
    - src/harness/soak.test.ts
    - vitest.gate.config.ts
  modified:
    - src/physics/planck-world.ts
    - src/harness/containment.ts
    - vitest.config.ts
    - package.json
    - tsconfig.json

key-decisions:
  - "Soak measures SIMULATED fixed-step time (630s default >= the 600s/10-min floor), not wall-clock; full gate runs in ~11s wall-clock"
  - "Flipper tunnel detection = swept-path crossing of the bat centerline AND ball ends clear on the far side, so the over-powered stress flipper crushing a resting ball is not a false escape"
  - "bullet:false disables world-level continuousPhysics (TOI solver), not just the per-body setBullet flag, because Box2D runs CCD vs static bodies for every dynamic body regardless of the bullet flag"
  - "sweptEscaped is applied with a slop-aware effective radius (radius - 0.05) so resting/bouncing solver penetration is not mistaken for an escape while a full tunnel (distance ~0) still trips"
  - "Gate split into *.gate.test.ts (npm run soak, dedicated config) vs *.test.ts (fast default) instead of an inline env toggle, for cross-platform (Windows) reliability with no new deps"

patterns-established:
  - "Negative-control-proven gate: a green CI line is only trustworthy alongside a demonstrated RED on a real fault"
  - "Deterministic replay: log the case seed + full state; re-feed the seed to reproduce byte-identically"

requirements-completed: [PHYS-02]

# Metrics
duration: 20min
completed: 2026-07-15
---

# Phase 1 Plan 06: Headless Swept-Containment Soak Gate Summary

**A seeded, deterministic >=600s-simulated soak that flings the ball past its real max velocity at the thin wall and the max-speed flipper, asserts swept containment every 120 Hz step, stays GREEN with CCD on, and is proven honest by a CCD-off negative control that goes RED with a replayable seed.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-15T11:26:00Z (approx)
- **Completed:** 2026-07-15T11:46:10Z
- **Tasks:** 2
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments
- `npm run soak` is the SOLE PHYS-02 pass/fail gate (D-03): 630s of SIMULATED 120 Hz stepping across 210 seeded sweep cases (launch angle x speed up to ~58 m/s x flipper phase), ball never escapes, exit 0 — in ~11s wall-clock.
- The soak drives only the `PhysicsWorld` interface (D-05): it seeds from `mulberry32` (never `Math.random`), calls `sweptEscaped` against `getBoundarySegments()` every step, and reads ball/flipper state via `getBalls()`/`getFlippers()` — the identical proof would judge any solver.
- Proven honest: the CCD-off negative control (`bullet:false` + max-velocity thin-wall launch) reports `passed === false` with a failure record carrying a numeric seed + full ball/flipper state, and re-running that seed reproduces the identical step + byte-identical state.
- Planck's CCD empirically HOLDS the tunnel-proof bar in this stress: no escapes through the thinnest (zero-width) static wall or the dynamic max-speed flipper at ~10x the ball's real max velocity — direct evidence for the plan 01-07 engine decision.

## Task Commits

1. **Task 1: Soak engine + the >=10-minute full gate** - `1197173` (feat)
2. **Task 2: Bounded-green soak + CCD-off negative control** - `8c5fa1e` (test; includes a Rule 1 fix to planck-world.ts)

_Note: Task 2 is tdd-tagged; because Task 1 already built `runSoak`, Task 2 is a single test commit (the RED/GREEN split does not apply — the engine predates the proving tests by plan design)._

## Files Created/Modified
- `src/harness/soak.ts` - Seeded sweep-matrix soak engine: `runSoak(config)`, per-step swept containment + flipper crossing check, seed+state logging, `describeFailure` for replayable CI logs.
- `src/harness/soak.gate.test.ts` - The >=600s-simulated full gate (env-overridable density; excluded from the default run).
- `src/harness/soak.test.ts` - Fast bounded-green soak + CCD-off negative control + deterministic replay.
- `vitest.gate.config.ts` - Dedicated runner including only `*.gate.test.ts` (for `npm run soak`).
- `src/physics/planck-world.ts` - Added `PlanckWorldOptions.bullet` (default true); toggles world `continuousPhysics` + per-body `setBullet` and skips CCD priming when off.
- `src/harness/containment.ts` - Exported `segmentsIntersect` for the flipper crossing check (no behavior change).
- `vitest.config.ts` - Default run now excludes `**/*.gate.test.ts`.
- `package.json` - `soak` script points at `vitest.gate.config.ts`.
- `tsconfig.json` - Includes `vitest.gate.config.ts` for type-checking parity.

## CI / Gate invocation (per duration guidance)
- **Command:** `npm run soak` -> `vitest run --config vitest.gate.config.ts --testTimeout=900000`.
- **Default density (the full gate):** `durationSeconds=3`, `cases=210` => **630s SIMULATED** fixed-step time (>= the D-04 600s/10-min floor), `maxLaunchSpeed=60` m/s (~10x the ball's real max ~6 m/s), master `seed=0x5eed`. The gate asserts `cases*durationSeconds >= 600` AND `result.simulatedSeconds >= 600` AND `passed === true`.
- **Overridable via env** for CI tuning (defaults ARE the full gate): `SOAK_DURATION`, `SOAK_CASES`, `SOAK_MAXSPEED`, `SOAK_SEED`. Increase `SOAK_CASES`/`SOAK_MAXSPEED` for a denser/harsher nightly run.
- **Measured wall-clock:** ~11s for the full 630s-simulated run (headless stepping is far faster than real time). The acceptance run used the exact default density — not a shrunken gate.
- **Negative control (proof of teeth):** `runSoak({ bullet:false, forceMode:"thin-wall", maxLaunchSpeed:80, ... })` -> `passed===false`, `ESCAPE[boundary]` at the thin wall (~59 m/s), replay reproduces identically.

## Decisions Made
- **Flipper tunnel test uses crossing + far-side-clear, not proximity.** A resting/bouncing ball stays `radius+halfWidth` clear of the bat centerline and never crosses it; a genuine tunnel crosses AND ends clear on the far side (which requires ~2*(radius+halfWidth) of travel in one step, i.e. a real fast pass-through). This removed two classes of false green->red: endpoint-proximity trips near the inset bat ends, and the over-powered stress flipper crushing a resting ball into the bottom wall.
- **Slop-aware effective radius (`radius - 0.05`).** Matches the resting-contact epsilon already used by the smoke test; contains Box2D's linear slop so legitimate contact is not read as escape, while a full tunnel (distance ~0) still trips well clear of the band.
- **Gate split via a second vitest config** rather than an inline env toggle in the npm script — avoids Windows/cmd env-var-in-script issues and adds no dependency (respects "ask before new deps").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Negative control needed world-level `continuousPhysics` off, not just `setBullet(false)`**
- **Found during:** Task 2 (writing the CCD-off negative control)
- **Issue:** With only the per-body `setBullet(false)` cleared, the ball still did NOT tunnel the static thin wall (`passed` stayed `true`) — a FALSE GREEN for the control. Root cause: Box2D/Planck run continuous collision against STATIC bodies for every dynamic body regardless of the `bullet` flag; that flag only ADDS dynamic-vs-dynamic CCD.
- **Fix:** The `bullet:false` path now also constructs the world with `continuousPhysics: false` (disables the TOI solver entirely), so a fast ball genuinely tunnels the static wall. Default (`bullet:true`) is unchanged (continuousPhysics true + setBullet true).
- **Files modified:** src/physics/planck-world.ts
- **Verification:** Negative control now `passed===false` with `ESCAPE[boundary]` at ~59 m/s; full gate still green; default suite (22 tests) green.
- **Committed in:** `8c5fa1e` (Task 2 commit)

**2. [Rule 1 - Bug] Flipper tunnel check false-positived on resting/crushed balls**
- **Found during:** Task 1 (first full gate run went RED)
- **Issue:** Modelling the flipper as a wall segment and using `sweptEscaped` proximity flagged a ball resting against the inset bat ends, and the max-torque stress flipper crushing a resting ball into the bottom wall — neither is a CCD tunnel.
- **Fix:** Replaced the flipper proximity check with a swept-path CROSSING of the bat centerline gated on the ball ending CLEAR on the far side (real fast pass-through only). Exported `segmentsIntersect` from containment for this.
- **Files modified:** src/harness/soak.ts, src/harness/containment.ts
- **Verification:** Full gate green with zero escapes; negative control (thin-wall boundary tunnel) still RED.
- **Committed in:** `1197173` (Task 1 commit)

**3. [Rule 3 - Blocking] `process.env` needs `@types/node` (not installed)**
- **Found during:** Task 1 (gate test env overrides)
- **Issue:** `tsc` failed on `process` — no `@types/node`. Installing a dependency is out of scope (and package installs are not auto-fixable).
- **Fix:** Read env via a locally-typed `globalThis.process` access — no `process` global, no new dependency.
- **Files modified:** src/harness/soak.gate.test.ts
- **Verification:** `tsc --noEmit` clean.
- **Committed in:** `1197173` (Task 1 commit)

**4. [Rule 3 - Blocking] Cross-platform gate include/exclude**
- **Found during:** Task 1 (vitest exclude + `npm run soak`)
- **Issue:** Excluding `**/*.gate.test.ts` from the default config also filters it from an explicit positional path, and an inline env toggle in the npm script is unreliable on Windows/cmd.
- **Fix:** Added a dedicated `vitest.gate.config.ts` for `npm run soak`; default `vitest.config.ts` excludes gate files. No new dependency.
- **Files modified:** vitest.config.ts, vitest.gate.config.ts, package.json, tsconfig.json
- **Verification:** `npm test` = 22 tests (gate excluded); `npm run soak` runs only the gate and exits 0.
- **Committed in:** `1197173` (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 bug, 2 blocking)
**Impact on plan:** All auto-fixes were correctness/robustness requirements for an honest, cross-platform, false-green-free gate. No scope creep — the gate contract (seeded sweep, swept invariant, replayable seeds, negative control) is delivered exactly as specified.

## Issues Encountered
- First full gate run went RED on flipper false-positives (resting + crush), then the negative control initially gave a false green — both diagnosed to Box2D CCD semantics and the stress flipper's pathological torque, and fixed as documented above.

## Known Stubs
None — the soak, gate, negative control, and replay are fully wired and green/red as designed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01-07 (engine decision) has its empirical basis: Planck + `setBullet`/`continuousPhysics` passes the sole tunnel-proof gate at ~10x the ball's real max velocity against both the thinnest static wall and the dynamic max-speed flipper. The negative control confirms the gate has teeth.
- The gate is interface-targeted (D-05), so a custom swept solver could be dropped behind `PhysicsWorld` and judged by the identical `npm run soak`.
- No blockers. (Carry-forward note: rotational CCD for real flippers remains a Phase-2 research item per STATE.md.)

---
*Phase: 01-physics-core-spike*
*Completed: 2026-07-15*

## Self-Check: PASSED
- Files verified present: src/harness/soak.ts, src/harness/soak.gate.test.ts, src/harness/soak.test.ts, vitest.gate.config.ts, 01-06-SUMMARY.md
- Commits verified: 1197173 (Task 1), 8c5fa1e (Task 2)
- Gates green: `npx tsc --noEmit` clean, `npx eslint .` clean, `npx vitest run` = 22 passed (gate excluded), `npm run soak` exit 0 (630s simulated, ~11s wall-clock), negative control RED with replayable seed, planck import confined to planck-world.ts.
