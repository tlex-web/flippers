---
phase: 03-table-plunger-event-bus
plan: 03
subsystem: testing
tags: [planck, soak, swept-containment, ccd, table-spec, vitest]

requires:
  - phase: 03-table-plunger-event-bus
    provides: "03-01 PROOF_BOX_SPEC/TABLE_SPEC + getElements(); 03-02 full TABLE_SPEC layout and OPEN_FIELD_REGION"
provides:
  - "SoakConfig.table (default PROOF_BOX_SPEC) and SoakConfig.originRegion on the swept-containment soak"
  - "Deterministic origin clearance filter (MAX_ORIGIN_DRAWS = 64, throws with the case seed on exhaustion)"
  - "Real-table soak suite (bounded green, CCD-off RED, replay, filter exhaustion) and a >=600 s real-table gate in npm run soak"
  - "Five Phase-1/2 primitive proofs construct PlanckWorld with an explicit { table: PROOF_BOX_SPEC }"
affects: [03-04, 03-05, 03-06]

actuals:
  tokens: 3556
  tasks: 2
  commits: 2
plan_head_before: ef44c4e6e206ec64703f2cea8e80d204e4b9f3c5
plan_head_after: 04df26b98a5c687a0a5491e717a7b3605bfe3b38

tech-stack:
  added: []
  patterns:
    - "Soak geometry is a config input: the default factory names its fixture, so calibrated gates never depend on the adapter default"
    - "Spawn filters redraw from the same case stream and fail loud with the seed; a first-draw accept consumes no extra rng values"

key-files:
  created:
    - src/harness/table-soak.test.ts
    - src/harness/table-soak.gate.test.ts
  modified:
    - src/harness/soak.ts
    - src/harness/stability.test.ts
    - src/harness/flipper-feel.test.ts
    - src/physics/planck-world.smoke.test.ts
    - src/sim/loop.tabblur.test.ts
    - src/sim/loop.determinism.test.ts

key-decisions:
  - "Origin clearance filter rejects all circle elements (bumpers), not only solid boundary segments, because circles are not in getBoundarySegments()"
  - "TABLE_SPEC needed no geometry fix: the real-table gate went green on the first run"

patterns-established:
  - "Every new soak gate ships with a CCD-off RED control on the same geometry and asserts casesRun == cases"

requirements-completed: [TBL-01]

coverage:
  - id: D1
    description: "Bounded real-table soak: with CCD on, 8 seeded cases at 60 m/s never escape a wall or pass through either bat"
    requirement: TBL-01
    verification:
      - kind: unit
        ref: "src/harness/table-soak.test.ts#(1) bounded green: with CCD on the ball never escapes the real table"
        status: pass
    human_judgment: false
  - id: D2
    description: "The harness has teeth on TABLE_SPEC: CCD off goes RED with a replayable boundary failure"
    requirement: TBL-01
    verification:
      - kind: unit
        ref: "src/harness/table-soak.test.ts#(2) CCD-off RED control: a max-velocity launch tunnels a real-table wall"
        status: pass
      - kind: unit
        ref: "src/harness/table-soak.test.ts#(3) deterministic replay: the logged seed reproduces the identical failure"
        status: pass
    human_judgment: false
  - id: D3
    description: "The origin filter cannot make the gate vacuous: an impossible spawn region throws with the seed"
    verification:
      - kind: unit
        ref: "src/harness/table-soak.test.ts#(4) filter exhaustion: a spawn region inside bumper 202 throws with the case seed"
        status: pass
    human_judgment: false
  - id: D4
    description: ">=600 s real-table tunnel-proof gate (210 x 3 s at 60 m/s), with all cases run"
    requirement: TBL-01
    verification:
      - kind: integration
        ref: "npm run soak (src/harness/table-soak.gate.test.ts; 3/3 gates green)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Proof-box gates and the five pinned primitive proofs are unchanged in behaviour; containment.ts and constants.ts byte-identical to 80869ae"
    verification:
      - kind: integration
        ref: "npm test (16 files, 108 tests) + npm run soak + git diff --exit-code 80869ae -- src/harness/containment.ts src/physics/constants.ts src/harness/soak.test.ts src/harness/soak.gate.test.ts src/harness/flipper-tunnel*.ts"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-19
status: complete
---

# Phase 3 Plan 03: Real-Table Soak and Proof Pinning Summary

**The swept-containment soak now runs on the real TABLE_SPEC. A 630 s seeded gate at 60 m/s never lets the ball escape, and the same harness goes RED with CCD off on this geometry. The soak default and five Phase-1/2 primitive proofs now name PROOF_BOX_SPEC explicitly, so 03-04 can flip the adapter default without moving any of them.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-19T21:40:43Z
- **Completed:** 2026-11-19T21:45:59Z
- **Tasks:** 2 (tracer + auto)
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- **`soak.ts`:**
  - `SoakConfig.table` defaults to `PROOF_BOX_SPEC` and is passed to the default `PlanckWorld` factory alongside `bullet` and `subStepping`.
  - `SoakConfig.originRegion` replaces the derived spawn AABB when set.
  - The clearance filter rejects an origin closer than 0.25 m to a solid segment or closer than `r + 0.25` to a circle's center. It redraws from the same case stream up to `MAX_ORIGIN_DRAWS = 64` times and throws with `seed=` if every draw fails.
- **Proof box unchanged:** its derived origins (x, y in [0.25, 1.75]) always pass on the first draw, so the rng stream is the same as before. The existing soak, FLIP-04 and negative-control tests all pass unedited.
- **Real-table RED control:** `thinWallTarget` picks wall 100's top-left arc chord (0.196 m). The control fails at seed 3329640017, step 5, with a boundary escape at about 58 m/s.
- **Filter rejection rate:** about 55% of points in `OPEN_FIELD_REGION` are rejected (bumpers plus the orbit and lane guides). The chance of 64 rejections in a row is negligible, and the gate asserts `casesRun == cases`.
- **`npm run soak`:** now 3 gates (proof box, FLIP-04, real table), all green. Vitest reports 7.2 s; wall clock is about 10 s.
- **Five pinned proofs:** stability, flipper-feel, planck-world smoke, tab-blur and determinism. They now use `{ table: PROOF_BOX_SPEC }` (12 constructors), and each file gets one import line.

## Task Commits

1. **Task 1 (tracer): real-table soak, RED control, 600 s gate** - `81def0a` (feat)
2. **Task 2: pin five primitive proofs to PROOF_BOX_SPEC** - `04df26b` (test)

**Tracer gate:** the run was interactive with end-of-phase verification and an automated-only `<verify>`. I re-ran `<verify>` (tsc, eslint src/harness, 36/36 harness tests, soak 3/3) and it was green, so I continued to Task 2.

## Files Created/Modified

- `src/harness/soak.ts` - `OriginRegion`, `SoakConfig.table`/`originRegion`, `MAX_ORIGIN_DRAWS`, clearance filter, explicit default table
- `src/harness/table-soak.test.ts` - real-table bounded green, CCD-off RED, replay, filter exhaustion
- `src/harness/table-soak.gate.test.ts` - >=600 s real-table gate (`TABLE_SOAK_DURATION/CASES/MAXSPEED/SEED`)
- `src/harness/stability.test.ts`, `src/harness/flipper-feel.test.ts`, `src/physics/planck-world.smoke.test.ts`, `src/sim/loop.tabblur.test.ts`, `src/sim/loop.determinism.test.ts` - constructors pinned to `PROOF_BOX_SPEC`

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

**1. [Acceptance wording] One `expect(` line changed in planck-world.smoke.test.ts**
- **Found during:** Task 2
- **Issue:** `expect(() => new PlanckWorld().setFlipperMotor(9999, 1)).not.toThrow()` builds the adapter inside the `expect(` call. Two criteria conflict here: "zero `new PlanckWorld()`" and "no `expect(` line added or removed".
- **Fix:** changed only the constructor argument on that line. The assertion itself (`not.toThrow`) is unchanged, which keeps to the criterion's intent of "only constructor arguments change".
- **Committed in:** `04df26b`

**Total deviations:** 1 (a wording conflict in the acceptance criteria; no behaviour change).

## Issues Encountered

None. The real-table gate passed on the first run, so `src/table/spec.ts` needed no geometry fix.

## Known Stubs

None.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- 03-04 can pin `substep.test.ts`, flip the `PlanckWorldOptions.table` default to `TABLE_SPEC` and narrow FlipperController. The soak and the five pinned proofs no longer depend on the adapter default.
- Still using the adapter default: `src/physics/substep.test.ts` (owned by 03-04) and `src/sandbox/flipper-e2e.test.ts` (the end-to-end test 03-04 moves to the real table).

## Self-Check: PASSED

- **Files:** all 8 present. Commits `81def0a` and `04df26b` are ancestors of HEAD (`git rev-list --count ef44c4e..HEAD` = 2).
- **Acceptance criteria:**
  - `originRegion` appears 2 times and `PROOF_BOX_SPEC` 5 times in soak.ts.
  - Running `git diff --exit-code 80869ae` on containment.ts, constants.ts, soak.test.ts, soak.gate.test.ts and flipper-tunnel(.gate).test.ts exits 0.
  - Each of the five proof files has 0 `new PlanckWorld()` calls left, and stability.test.ts has 4 `PROOF_BOX_SPEC` references.
- **Plan verification:**
  - `npm run typecheck`: exit 0.
  - `npx eslint src`: clean.
  - `npm test`: 16 files and 108 tests passed.
  - `npm run soak`: 3/3 passed (the 600 s real-table gate included) in 7.2 s Vitest time, about 10 s wall clock.

---
*Phase: 03-table-plunger-event-bus*
*Completed: 2026-11-19*
