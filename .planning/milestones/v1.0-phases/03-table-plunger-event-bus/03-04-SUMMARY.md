---
phase: 03-table-plunger-event-bus
plan: 04
subsystem: physics
tags: [planck, table-spec, default-world, flipper-fsm, typescript, vitest]

requires:
  - phase: 03-table-plunger-event-bus
    provides: "03-01 PlanckWorldOptions.table + PROOF_BOX_SPEC/TABLE_SPEC; 03-02 restPose mounts; 03-03 soak default and five proofs pinned to PROOF_BOX_SPEC"
provides:
  - "PlanckWorldOptions.table defaults to TABLE_SPEC: a no-options PlanckWorld is the original table with its two spec-placed flippers (D-05)"
  - "substep.test.ts pinned to PROOF_BOX_SPEC; every Phase-1/2 primitive proof now names its fixture"
  - "Default-world case in table-world.test.ts"
  - "FlipperWorld = Pick<PhysicsWorld, getFlippers | setFlipperMotor>; FlipperController and its SpyWorld depend only on that slice"
affects: [03-05, 03-06, phase-04-rules, phase-05-render-audio]

actuals:
  tokens: 2193
  tasks: 2
  commits: 2
plan_head_before: 375684280d44ac5c271b395f5c3c6a8bea39aec9
plan_head_after: 5e79dd757886674cc01d59d50c93905549538466

tech-stack:
  added: []
  patterns:
    - "Consumers type against the narrowest Pick of PhysicsWorld they use, so interface growth never touches their spies"
    - "Pin every calibrated proof to its fixture by name before changing a shared default"

key-files:
  created: []
  modified:
    - src/physics/substep.test.ts
    - src/physics/planck-world.ts
    - src/table/table-world.test.ts
    - src/control/flipper-controller.ts
    - src/control/flipper-controller.test.ts

key-decisions:
  - "PlanckWorldOptions.table default flipped from PROOF_BOX_SPEC to TABLE_SPEC; the adapter no longer imports the proof fixture (D-05)"
  - "FlipperController takes FlipperWorld = Pick<PhysicsWorld, getFlippers | setFlipperMotor>, so 03-05's applyImpulse growth never reaches its spy"

patterns-established:
  - "Interface slices: a module that uses two methods of PhysicsWorld declares a Pick type and its test spy implements only that"

requirements-completed: [TBL-01]

coverage:
  - id: D1
    description: "A no-options PlanckWorld is TABLE_SPEC: it has a chute element and exactly two flippers at the TABLE_SPEC mount pivots"
    requirement: TBL-01
    verification:
      - kind: unit
        ref: "src/table/table-world.test.ts#a no-options PlanckWorld is TABLE_SPEC with its two spec-placed flippers"
        status: pass
    human_judgment: false
  - id: D2
    description: "The unmodified keyboard flipper e2e drives the real table's bats through the new default (6/6 cases)"
    requirement: TBL-01
    verification:
      - kind: integration
        ref: "src/sandbox/flipper-e2e.test.ts (byte-identical to 80869ae)"
        status: pass
    human_judgment: false
  - id: D3
    description: "substep proofs pinned to PROOF_BOX_SPEC; proof-box, FLIP-04 and real-table soak gates replay green after the flip"
    verification:
      - kind: unit
        ref: "src/physics/substep.test.ts (6/6)"
        status: pass
      - kind: integration
        ref: "npm run soak (3/3 gates)"
        status: pass
    human_judgment: false
  - id: D4
    description: "FlipperController depends only on the FlipperWorld slice; no controller assertion changed"
    verification:
      - kind: unit
        ref: "src/control/flipper-controller.test.ts (7/7) + expect( diff guard vs 80869ae = 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "containment.ts, constants.ts and flipper-e2e.test.ts byte-identical to 80869ae"
    verification:
      - kind: other
        ref: "git diff --exit-code 80869ae -- src/harness/containment.ts src/physics/constants.ts src/sandbox/flipper-e2e.test.ts"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-11-19
status: complete
---

# Phase 3 Plan 04: Real Table as the Default World Summary

**A `PlanckWorld` built with no options is now our original `TABLE_SPEC` table with its two spec-placed flippers. The last primitive proof (substep) names `PROOF_BOX_SPEC`, the unmodified keyboard e2e passes on the real bats, and `FlipperController` depends only on a two-method `FlipperWorld` slice.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-19T21:49:10Z
- **Completed:** 2026-11-19T21:53:23Z
- **Tasks:** 2 (tracer + auto)
- **Files modified:** 5

## Accomplishments

- **substep.test.ts:** all five constructions now pass `table: PROOF_BOX_SPEC`, merged into `{ subStepping: false }` on the off-switch case. No assertion changed. This was pinned before the flip.
- **Default flip:** `resolve(options?.table ?? TABLE_SPEC)`. The option's doc now says the default is the original playfield and harness proofs pass `PROOF_BOX_SPEC` by name. The fixture import is gone from the adapter.
- **Default-world case:** a no-options world has a `chute` element and exactly two flippers whose pivots equal the `TABLE_SPEC` mounts.
- **E2E on the real bats:** `src/sandbox/flipper-e2e.test.ts` still calls `new PlanckWorld()`. It now builds the real table and passes all 6 cases unmodified, with no fix needed against the 03-02 rest pose.
- **FlipperWorld:** `export type FlipperWorld = Pick<PhysicsWorld, "getFlippers" | "setFlipperMotor">` types the constructor and field. `SpyWorld` implements it, which dropped 8 unused stubs and 6 type imports. `main.ts` compiles unchanged.

The only remaining no-argument constructions are the e2e (meant to move) and the new default-world case.

## Task Commits

1. **Task 1 (tracer): default PlanckWorld is the original table** - `ddc0e4e` (feat)
2. **Task 2: narrow FlipperController to its FlipperWorld slice** - `5e79dd7` (refactor)

**Tracer gate:** the run was interactive with end-of-phase verification and an automated-only `<verify>`. I re-ran `<verify>` (tsc, eslint src, 109/109 tests, soak 3/3) and it was green, so I continued to Task 2.

## Files Created/Modified

- `src/physics/substep.test.ts` - `PROOF_BOX_SPEC` import; 5 constructors pinned
- `src/physics/planck-world.ts` - `table` default `TABLE_SPEC`; doc updated; `PROOF_BOX_SPEC` import removed
- `src/table/table-world.test.ts` - `default world` describe block
- `src/control/flipper-controller.ts` - `FlipperWorld` type; doc on the interface slice
- `src/control/flipper-controller.test.ts` - `SpyWorld implements FlipperWorld`; stubs and imports removed

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

None. The plan was executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- 03-05 can add `applyImpulse` to `PhysicsWorld` without touching the controller or its spy.
- Every caller that needs the proof rig names it, so later `TABLE_SPEC` edits only move real-table tests.

## Self-Check: PASSED

- **Files:** all 5 modified files are present.
- **Commits:** `ddc0e4e` and `5e79dd7` are ancestors of HEAD (`git rev-list --count 3756842..HEAD` = 2).
- **Acceptance criteria:**
  - Task 1: `new PlanckWorld()` appears 0 times in substep.test.ts, and `PROOF_BOX_SPEC` appears 6 times.
  - Task 1: 2 non-comment lines in planck-world.ts name `TABLE_SPEC`.
  - Task 1: e2e, constants.ts and containment.ts are unchanged vs 80869ae.
  - Task 1: the default-world case passes.
  - Task 2: `FlipperWorld` appears 4 times in flipper-controller.ts, and `implements PhysicsWorld` appears 0 times in the test.
  - Task 2: the `expect(` diff guard prints 0.
- **Plan verification:**
  - `npm run typecheck`: exit 0.
  - `npx eslint src`: clean.
  - `npm test`: 16 files and 109 tests passed.
  - `npm run soak`: 3/3 passed in 7.5 s.

---
*Phase: 03-table-plunger-event-bus*
*Completed: 2026-11-19*
