---
phase: 04-reactive-elements-game-rules
plan: 04
subsystem: testing
tags: [planck, soak, ccd, containment, event-bus, vitest]

requires:
  - phase: 04-reactive-elements-game-rules
    provides: "ReactiveElements (bumper/sling kicks, rollovers, inlanes) and RulesGate from 04-01/04-03"
  - phase: 03-table-plunger-event-bus
    provides: "CollisionRouter, TABLE_SPEC, SoakConfig.makeWorld, the real-table soak gate"
provides:
  - "ReactiveSoakWorld: a PhysicsWorld decorator that runs router.dispatch() + ReactiveElements.service() after every step and counts kicks"
  - "Rules-live real-table soak gate (>= 630 s simulated, 60 m/s, CCD on) with kick tally > 0, under npm run soak"
  - "Fast rules-live bounded green, CCD-off RED control and seed replay in npm test"
  - "PhysicsWorld.drainEvents(): readonly CollisionEvent[] (IN-05)"
  - "planck-world.ts ball fixture density from the exported BALL_DENSITY"
  - "IN-03 stale docs corrected (FlipperState, getFlippers, FLIPPER_LENGTH_M, FLIPPER_UPPER_ANGLE, DRAIN_Y)"
affects: [04-05, 04-08, phase-05-renderer, phase-06]

actuals:
  tokens: 5000
  tasks: 2
  commits: 2
plan_head_before: c2fffbeafe1f16040df863108bbc5ec48c1f220c
plan_head_after: 3d7ba8610e97363bab6e4570505dd91c4486b968

tech-stack:
  added: []
  patterns:
    - "Rules join the unchanged soak engine through SoakConfig.makeWorld (a decorator world), never by editing soak.ts"
    - "Tallying makeWorld factory: keep every built world and sum a counter to prove a green gate is non-vacuous"

key-files:
  created:
    - src/harness/reactive-world.ts
    - src/harness/reactive-soak.test.ts
    - src/harness/reactive-table-soak.gate.test.ts
  modified:
    - src/physics/types.ts
    - src/physics/planck-world.ts
    - src/physics/constants.ts
    - src/table/spec.ts
    - src/app/collision-router.test.ts

key-decisions:
  - "Rules-live soak = ReactiveSoakWorld decorator over PlanckWorld(TABLE_SPEC) through SoakConfig.makeWorld; soak.ts/containment.ts byte-identical to 011c060"
  - "Kicks never break containment: 630 s rules-live real-table gate green at 60 m/s with CCD on, kick tally > 0; CCD-off control goes RED on a real-table wall and replays from its seed"
  - "drainEvents() returns readonly CollisionEvent[] everywhere (IN-05); the adapter's private reused view stays mutable internally"
  - "IN-04 stays deferred (only flipper 0 swept on the real table); reason recorded in the new gate's docstring"

patterns-established:
  - "Decorator world for harness composition: delegate every PhysicsWorld member, hook only step()"

requirements-completed: [ELEM-01, ELEM-02]

coverage:
  - id: D1
    description: "Rules-live real-table soak (kicks live) stays green with CCD on and is non-vacuous (kicks > 0)"
    requirement: ELEM-01
    verification:
      - kind: integration
        ref: "src/harness/reactive-soak.test.ts#(1) bounded green: with CCD on, kicks never break containment and do fire"
        status: pass
      - kind: integration
        ref: "src/harness/reactive-table-soak.gate.test.ts (npm run soak)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The rules-live gate can fail: CCD-off RED control on a real-table wall, replayable from its seed"
    requirement: ELEM-02
    verification:
      - kind: integration
        ref: "src/harness/reactive-soak.test.ts#(2) CCD-off RED control: the rules-wrapped world tunnels a real-table wall"
        status: pass
      - kind: integration
        ref: "src/harness/reactive-soak.test.ts#(3) deterministic replay: the logged seed reproduces the identical failure"
        status: pass
    human_judgment: false
  - id: D3
    description: "drainEvents() is read-only in the interface and every implementation"
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Single ball-density source; every pre-existing soak gate and proof stays green"
    verification:
      - kind: integration
        ref: "npx vitest run (231 tests) && npm run soak (4 gate files)"
        status: pass
    human_judgment: false
  - id: D5
    description: "IN-03 stale docs corrected with no exported value changed"
    verification:
      - kind: other
        ref: "git diff 011c060 -- src/physics/constants.ts | grep -c '^-export const' == 0"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 04: Rules-Live Tunnel-Proof Soak and Bus Hardening Summary

**A 630 s real-table soak with every bumper and slingshot kick live stays tunnel-proof at 60 m/s with CCD on (kick tally > 0, CCD-off RED control replays from its seed); drainEvents() is now readonly, the adapter reads BALL_DENSITY from constants, and the stale Phase-3 docs are fixed.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-20T17:19:20Z
- **Completed:** 2026-11-20T17:22:34Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `ReactiveSoakWorld` wraps `PlanckWorld(TABLE_SPEC)` with a `CollisionRouter` and an always-live `ReactiveElements`. `step()` runs inner step, then dispatch, then service, so kicks land between steps as they do in the game. Every kick is counted.
- The rules-live gate `reactive-table-soak.gate.test.ts` runs 210 x 3 s = 630 s at 60 m/s with CCD on, using seed 0x5eed04. It is green and asserts summed kicks > 0. `npm run soak` now reports 4 green gate files.
- In `npm test`: a bounded green with kicks > 0 (seed 0x0404, 8 cases), a CCD-off RED control with a boundary escape and a finite seed, and a replay with identical kind, step and ball state.
- IN-05: `drainEvents(): readonly CollisionEvent[]` in `types.ts`, `planck-world.ts` and `ReactiveSoakWorld`.
- The ball fixture density now comes from the exported `BALL_DENSITY` (value unchanged at 1). All 231 tests and all 4 soak gates are still green.
- IN-03: corrected the stale docs for FlipperState, getFlippers, FLIPPER_LENGTH_M (2.5 x BALL_RADIUS_M, inverted-V bats), FLIPPER_UPPER_ANGLE (the left bat's droop limit; the right bat droops to the opposite limit through restPose) and DRAIN_Y (fires on rim overlap, about 0.2 m early). No exported value changed.

## Task Commits

1. **Task 1: Tracer, rules-live real-table soak with RED control** - `08655ce` (test)
2. **Task 2: Read-only drain, one density source, corrected docs, full gate run** - `3d7ba86` (fix)

## Files Created/Modified
- `src/harness/reactive-world.ts` - ReactiveSoakWorld decorator with an always-live rules gate and a kick counter
- `src/harness/reactive-soak.test.ts` - fast bounded green, CCD-off RED control and replay
- `src/harness/reactive-table-soak.gate.test.ts` - the 600 s or longer rules-live gate (REACTIVE_SOAK_* env overrides)
- `src/physics/types.ts` - readonly drainEvents(); FlipperState and getFlippers docs
- `src/physics/planck-world.ts` - imports BALL_DENSITY; readonly drainEvents() signature
- `src/physics/constants.ts` - docs for FLIPPER_LENGTH_M, FLIPPER_UPPER_ANGLE and the BALL_DENSITY block
- `src/table/spec.ts` - DRAIN_Y doc
- `src/app/collision-router.test.ts` - test buffer typed `(readonly CollisionEvent[])[]`

## Decisions Made
- Kept the previous executor's draft `reactive-world.ts`. A review against the Task 1 spec found it compliant: slice built once, ALWAYS_LIVE at module level, a module-level empty drain array and a `kicks` getter. Task 2 only removed its `as CollisionEvent[]` cast once the interface became readonly.
- Task 1 committed as `test` (harness and gates only, no production behavior).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] collision-router.test.ts typed its captured drain views as mutable arrays**
- **Found during:** Task 2 (readonly drainEvents)
- **Issue:** `const views: CollisionEvent[][]` stored `world.drainEvents()` results. Under the new readonly return type this is error TS2345, so tsc failed. The plan assumed only spies returning plain arrays existed. This test also *stores* the real adapter's view.
- **Fix:** Typed the buffer `(readonly CollisionEvent[])[]`. The test logic is unchanged.
- **Files modified:** src/app/collision-router.test.ts (outside the plan's files_modified)
- **Verification:** tsc 0 errors; all 231 tests pass.
- **Committed in:** 3d7ba86

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** This one-line type annotation follows directly from the IN-05 change. No scope creep.

## Issues Encountered
None. The previous run left an uncommitted draft. I reviewed it and kept it, and none of its work was redone.

## Threat Mitigations
- T-04-09: the fast suite and the gate both assert kicks > 0. The CCD-off RED control and seed replay run on the same decorator.
- T-04-10: drainEvents() is readonly in the interface and in all implementations, and tsc enforces it.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Containment with kicks live is proven, so 04-05 (game FSM) and 04-08 (review disposition) can build on it. 04-08 should record IN-03/IN-05 as fixed and IN-04 as deferred (the reason is in the gate docstring).
- The 03-REVIEW IN-03 `main.ts` "LEVEL" comment was already gone before this plan.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*

## Self-Check: PASSED
