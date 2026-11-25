---
phase: 05-rendering-audio
plan: 08
subsystem: rendering
tags: [interpolation, fixed-timestep, flippers, asset-gate, vitest]

requires:
  - phase: 01-physics-foundation
    provides: FixedStepLoop previous/current ball snapshots and alpha
  - phase: 02-flippers
    provides: FlipperController and PhysicsWorld.getFlippers()
provides:
  - FixedStepLoop.previousFlipperAngles / currentFlipperAngles (pooled, getFlippers() order)
  - src/render/interpolate.ts (MutableBall, lerp, lerpAngle, interpolateBalls, interpolateAngles)
  - Real-table 144 Hz flipper smoothness tracer
  - RND-01 asset gate (src/render/asset-free.test.ts) that runs in every full suite
affects: [05-02, 05-04, 05-06]

actuals:
  tokens: 6258
  tasks: 3
  commits: 3
plan_head_before: 4aee82d919b9fb59e571d0304568aebcfe7ad55a
plan_head_after: ca068fc02cd4afdca38a75fa0f874b81849e76d1

tech-stack:
  added: []
  patterns:
    - "Flipper angles are snapshotted beside the balls at the same loop points and lerped shortest-arc at alpha"
    - "Asset gate reads sources through Vite raw imports (import.meta.glob ?raw), not node:fs"

key-files:
  created:
    - src/render/interpolate.ts
    - src/render/interpolate.test.ts
    - src/render/asset-free.test.ts
    - src/sim/loop.flippers.test.ts
  modified:
    - src/sim/loop.ts

key-decisions:
  - "The asset gate reads files with Vite raw imports (import.meta.glob + index.html?raw) because the project has no @types/node; no dependency added"
  - "The 144 Hz tracer phases the press so an idle (no-step) frame lands inside the 4-step swing; otherwise the raw-angle repeat only shows after the bat hits the stop"
  - "The gate also blocks new URL(..., import.meta.url) and new FontFace(, two extra ways an asset could get in"

patterns-established:
  - "Render interpolation helpers live in src/render/interpolate.ts and are pure; 05-02 swaps main.ts's inline ball lerp for interpolateBalls"

requirements-completed: [RND-01, RND-02]

coverage:
  - id: D1
    description: "On the real table at 144 Hz the drawn left-bat angle advances strictly on every frame of a swing and stays between the previous and current snapshots, while the raw angle repeats on a no-step frame"
    requirement: RND-02
    verification:
      - kind: integration
        ref: "src/sim/loop.flippers.test.ts#at 144 Hz the drawn left-bat angle advances on every frame of a swing, where the raw angle repeats"
        status: pass
    human_judgment: false
  - id: D2
    description: "Loop flipper-angle snapshots: constructor seed, before/after-step timing, zero-step no-op, pooled identity, read-only on the sim"
    requirement: RND-02
    verification:
      - kind: unit
        ref: "src/sim/loop.flippers.test.ts#FixedStepLoop flipper-angle snapshots (spy world)"
        status: pass
      - kind: integration
        ref: "npx vitest run src/sim src/sandbox/game.determinism.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pure lerp, shortest-arc lerpAngle, id-mismatch interpolateBalls and pooled interpolateAngles"
    requirement: RND-02
    verification:
      - kind: unit
        ref: "src/render/interpolate.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The tree is asset-free (src non-test .ts + index.html) and every gate pattern is proven against a positive sample"
    requirement: RND-01
    verification:
      - kind: unit
        ref: "src/render/asset-free.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Bats look smooth on a real 144 Hz display"
    verification: []
    human_judgment: true
    rationale: "The tracer simulates the 144 Hz cadence headlessly. How smooth it looks on real hardware is a UAT item, and the helpers are not wired into the live frame until 05-02"

duration: 7min
completed: 2026-11-21
status: complete
---

# Phase 05 Plan 08: Flipper Interpolation Groundwork and Asset Gate Summary

**FixedStepLoop now snapshots flipper angles beside the balls. A new pure module, src/render/interpolate.ts, lerps them shortest-arc at alpha, and on the real table at 144 Hz the drawn bat now moves on every frame of a swing. A non-vacuous RND-01 gate keeps image, audio and font assets out of src and index.html.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-21T13:47:45Z
- **Completed:** 2026-11-21T13:54:34Z
- **Tasks:** 3
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `FixedStepLoop` has a pooled `previousFlipperAngles` / `currentFlipperAngles` pair, in `getFlippers()` order. It is seeded in the constructor, copied to previous before each `world.step()` and refreshed after it. It only reads the world, so the 60/120/144 Hz determinism tests stay bit-identical.
- `src/render/interpolate.ts` provides `MutableBall`, `lerp`, `lerpAngle` (wraps to [-PI, PI]), `interpolateBalls` (the id-mismatch rule and pooled growth from main.ts) and `interpolateAngles`. They are pure and allocate only when a pool grows.
- Real-table tracer: the left swing on TABLE_SPEC at 144 Hz. The drawn angle moves strictly toward the up stop on every frame, including a frame that ran no step and where the raw angle repeats. Swapping interpolateAngles for the raw angle (mutation) fails the test.
- Asset gate: it checks 11 patterns, each proven against its own sample, and names the file and pattern on a hit. Planting `"./x.png"` in loop.ts and an `<img>` in index.html made it fail with exactly those hits.

## Task Commits

1. **Task 1: Tracer, real-table 144 Hz bat smoothness** - `bfa42a0` (feat)
2. **Task 2: Snapshot and lerp edge cases (tdd)** - `6eb5b0e` (test)
3. **Task 3: Asset gate** - `ca068fc` (test)

Tracer gate: interactive run, `end-of-phase` mode, `<verify>` automated only. The verify was re-run and passed, so expansion continued with no checkpoint.

## Files Created/Modified
- `src/sim/loop.ts`: flipper-angle snapshot pair, getters, and `snapshotAnglesInto` / `copyAngles`
- `src/render/interpolate.ts`: pure interpolation helpers
- `src/sim/loop.flippers.test.ts`: the real-table 144 Hz tracer plus six spy-world snapshot cases
- `src/render/interpolate.test.ts`: lerp, shortest-arc, id-mismatch and pooling cases (14)
- `src/render/asset-free.test.ts`: the RND-01 gate (scan coverage, clean scan, positive samples)

## Decisions Made
- Sources are read with Vite raw imports, not `node:fs`. See Deviations.
- The tracer waits at rest until the loop's accumulator puts a no-step frame right after the first swing frame. The swing on TABLE_SPEC lasts only 4 fixed steps, about 3 frames between the stops, so an unphased press never puts an idle frame mid-swing.
- The gate also blocks `new URL(..., import.meta.url)` (Vite's asset-URL idiom) and `new FontFace(`. The `url(` pattern is lowercase and must not follow a word character or a dot, so `new URL(` and `x.url(` do not trigger it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Asset gate reads files via Vite raw imports instead of node:fs**
- **Found during:** Task 3
- **Issue:** The plan says to read files with `node:fs`, but the project has no `@types/node`, so `tsc --noEmit` would reject the import. Adding the package means a new dependency, which needs your approval.
- **Fix:** `import.meta.glob(["/src/**/*.ts", "!/src/**/*.test.ts", "!/src/**/test/**"], { query: "?raw", eager: true })` plus `index.html?raw`, the same idiom `src/ui/key-labels.test.ts` already uses. A coverage case asserts more than 20 files, that known files are included, and that no test file or test/ path is scanned.
- **Files modified:** src/render/asset-free.test.ts
- **Verification:** tsc, eslint and vitest are green. The planted-asset mutation was caught.
- **Committed in:** ca068fc

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Same coverage and behavior as specified. No new dependency.

## TDD Gate Compliance

Task 2 (`tdd="true"`) has a `test(05-08)` commit (`6eb5b0e`) but no RED failure and no `feat` GREEN commit. By the plan's design, the Task 1 tracer already implemented the code Task 2 hardens, and Task 2's action says to "fix ... only where a behavior line exposes a gap". No behavior line exposed a gap, so every new case passed on first run (fail-fast rule 1: the feature already exists). No RED was fabricated. To show the cases are not vacuous, five mutations were run, and each failed at least one case:
- dropping the previous-angle copy fails the 3-step case
- dropping the current refresh fails 3 cases
- removing the +PI wrap fails the shortest-arc case
- dropping the id check fails the mismatch case
- treating a missing previous entry as 0 fails the prev-shorter case

The Task 1 `feat(05-08)` commit `bfa42a0` comes before the test commit.

## Issues Encountered
- The first tracer run failed its raw-repeat assertion, because the only idle frame came right after the bat reached the stop. Phasing the press fixed it (see Decisions).
- ESLint flagged unused `_`-prefixed parameters in the spy world. The parameters were dropped, since a method may implement an interface with fewer parameters.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- 05-02 can import `interpolateBalls` / `interpolateAngles` and read `loop.previousFlipperAngles` / `currentFlipperAngles` to draw bats at alpha. main.ts is untouched.
- The asset gate runs in every full suite, so the 05-06 HUD restyle and every renderer plan is held to zero assets. The full suite is green: 38 files, 554 tests.

---
*Phase: 05-rendering-audio*
*Completed: 2026-11-21*

## Self-Check: PASSED
