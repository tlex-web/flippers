---
phase: 03-table-plunger-event-bus
plan: 01
subsystem: physics
tags: [planck, table-spec, resolver, canvas2d, tessellation, typescript]

requires:
  - phase: 02-flippers-feel
    provides: capsule flippers on motorized revolute joints, adaptive sub-stepping, PhysicsWorld interface, soak/FLIP-04 gates
provides:
  - src/table/spec.ts — ElementKind taxonomy (D-12 origin), polyline/arc/circle/mount descriptors, PROOF_BOX_SPEC, TABLE_SPEC skeleton, table anchors (WIDTH_M, HEIGHT_M, PLAYFIELD_CENTER_X, mirrorX, PLUNGER_REST, PLUNGER_ZONE, DRAIN_Y)
  - src/table/resolve.ts — pure resolve(spec) with arc tessellation (ARC_CHORD_EPS, BALL_RADIUS_M chord cap), MIN_VERTEX_SPACING, self-intersection and fail-loud validation
  - Spec-driven PlanckWorld (options.table, buildTable, fixture-level {kind,id} tags)
  - PhysicsWorld.getElements() — the one resolve; getBoundarySegments() is its solid-subset shim by reference
  - Element-driven debug renderer showing the original table outline
affects: [03-02, 03-03, 03-04, 03-06, phase-04-rules, phase-05-render-audio]

actuals:
  tokens: 15100
  tasks: 3
  commits: 4
plan_head_before: 3ccbc7194f4411bf2b34a30333f5c589c78e9464
plan_head_after: 3fa40194cd8edbdb5a265580c3eacce150ba8ca3

tech-stack:
  added: []
  patterns:
    - "One resolve, three readers: fixtures, containment boundary and debug drawing all read the same ResolvedElement objects"
    - "Harness geometry as data: PROOF_BOX_SPEC keeps calibrated proofs byte-identical while the playfield is a second spec"
    - "Fixture-level userData tags with body-tag fallback for event classification"

key-files:
  created:
    - src/table/spec.ts
    - src/table/resolve.ts
    - src/table/resolve.test.ts
    - src/table/table-world.test.ts
  modified:
    - src/physics/planck-world.ts
    - src/physics/types.ts
    - src/sandbox/main.ts
    - src/sandbox/debug-draw.ts
    - src/control/flipper-controller.test.ts

key-decisions:
  - "PlanckWorld defaults to PROOF_BOX_SPEC (harness fixture); only the sandbox passes TABLE_SPEC until 03-04 flips the default (D-05)"
  - "Static table fixtures carry their spec {kind,id} as fixture userData on ONE static body; wall events now report the element id (2/3 on the proof box) instead of the old shared -1"
  - "Arc step = min(2acos(1-ARC_CHORD_EPS/r), 2asin(BALL_RADIUS_M/2r)); radius-1.0 corners tessellate to 8 chords each (chord-length bound dominates for r >= 0.25)"
  - "Exactly-coincident joins (<= 1e-9) merge; anything closer than MIN_VERTEX_SPACING = 0.01 m throws (Planck linear-slop headroom)"
  - "Phase work moved onto branch gsd/phase-03-table-plunger-event-bus because the commit guard reports master as protected"

patterns-established:
  - "Element ids: 0/1 flipper mounts, 1xx static walls, 6xx sensors"
  - "Right-hand table elements derive from their left twin via mirrorX"

requirements-completed: [TBL-01]

coverage:
  - id: D1
    description: "Physics world builds every static collider and both flipper mounts from one resolve(table); planck-world.ts holds no table geometry"
    requirement: TBL-01
    verification:
      - kind: unit
        ref: "src/table/table-world.test.ts#mounts exactly two flippers at the spec pivots, right mirrored from left"
        status: pass
      - kind: other
        ref: "grep -c -E 'THIN_WALL|FLIPPER_PIVOT_L|FLIPPER_PIVOT_R|BOX_CENTER_X|FLIPPER_HALF_SEP|const (WIDTH_M|HEIGHT_M)' src/physics/planck-world.ts == 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "PROOF_BOX_SPEC rebuilds the exact Phase-1/2 world: full suite and every soak gate green with zero proof-file edits"
    verification:
      - kind: integration
        ref: "npx vitest run (96/96) + npm run soak (2/2) + git diff --exit-code 80869ae on constants/harness/sim/input/proof tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "Resolver contract: arc tessellation bounds, merge, eight rejection cases, purity"
    verification:
      - kind: unit
        ref: "src/table/resolve.test.ts (17 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "getBoundarySegments() is the solid subset of getElements() by reference; sensors excluded; stable array"
    verification:
      - kind: unit
        ref: "src/table/table-world.test.ts#getElements() / getBoundarySegments() identity"
        status: pass
    human_judgment: false
  - id: D5
    description: "Sandbox renders the original table outline (rounded top corners, chute lane, funnel walls, two level flippers, troughs, dashed drain) and a dropped ball stays inside"
    requirement: TBL-01
    verification:
      - kind: unit
        ref: "src/table/table-world.test.ts#keeps a ball dropped at the sandbox feed point inside the walls for 6 s"
        status: pass
    human_judgment: true
    rationale: "Visual read of the debug renderer (Task 3 human-check); geometry and containment are machine-checked, the look is not"

duration: 13min
completed: 2026-11-19
status: complete
---

# Phase 3 Plan 01: Table Spec and One-Resolve Origin Summary

**Engine-agnostic table spec with a pure arc-tessellating resolver as the single origin of Planck fixtures, the containment boundary and the debug drawing; the Phase-1/2 proof box is now plain data, and the sandbox shows the original table outline.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-19T21:08:23Z
- **Completed:** 2026-11-19T21:21:47Z
- **Tasks:** 3 (tracer + TDD + auto)
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- `src/table/spec.ts` defines `ElementKind` (the D-12 taxonomy origin) plus the polyline/arc/circle/mount descriptors. `PROOF_BOX_SPEC` re-expresses the Phase-1/2 rig, and `TABLE_SPEC` is the original layout: an outer loop with radius-1.0 rounded top corners, chute wall at x=2.9, mirrored funnel and trough walls, a drain sensor on y=6.05, and flipper mounts at (0.69,5.45) and its mirror.
- `resolve()` validates and flattens the spec once. It throws, naming the element id, on NaN or Infinity, a radius of zero or less, a duplicate id, too few vertices, vertices closer than `MIN_VERTEX_SPACING`, and self-intersecting chains. Arcs are tessellated so the sagitta is at most `ARC_CHORD_EPS` (0.02 m) and no chord is longer than `BALL_RADIUS_M`.
- `PlanckWorld.buildTable()` replaced `buildBoundary()`. It uses one static body, adds fixtures in spec order (Edge for two-vertex open polylines, Chain otherwise, Circle offset), then builds the flippers. Body and fixture creation order for the proof box is unchanged, so FLIP-04 teeth and the soak negative controls are untouched.
- `getElements()` returns the one resolve, and `getBoundarySegments()` returns its solid segments as the same objects. The debug renderer reads only `getElements()`.

## Task Commits

1. **Task 1 (tracer): spec → resolve → fixtures, original outline in the sandbox** - `fb65ef6` (feat)
2. **Task 2 RED: resolver contract suite** - `2bc79f6` (test)
3. **Task 2 GREEN: arcs, spacing, self-intersection, rounded corners** - `f35c118` (feat)
4. **Task 3: getElements() + element-driven renderer + identity proof** - `3fa4019` (feat)

The tracer gate ran in interactive mode with end-of-phase verification and an automated-only `<verify>`. `<verify>` was re-run green (tsc, eslint, 76/76 tests, 2/2 soak), and the plan then expanded.

## TDD Gate Compliance

- **RED** `2bc79f6`: target test "throws on a self-intersecting (bow-tie) loop" failed with `AssertionError: expected [Function] to throw an error`. Classifier verdict: `RED_EVIDENCE_OK` (target_test_failed). Semantic assessment: the target ran and failed on its planned assertion because the resolver had no self-intersection check yet. The sibling failures had the same cause: arc nodes were unsupported and there was no spacing check. None of the failures came from loading or syntax.
- **GREEN** `f35c118`: 17/17 resolver cases pass, along with the table-world suite.
- **REFACTOR**: none needed.

## Files Created/Modified

- `src/table/spec.ts` - taxonomy, descriptor types, PROOF_BOX_SPEC, TABLE_SPEC, table anchors
- `src/table/resolve.ts` - pure resolver, arc tessellation, validation, local orient-based self-intersection check
- `src/table/resolve.test.ts` - resolver contract built from inline fixtures
- `src/table/table-world.test.ts` - real-table smoke checks (mounts, containment, plunger park, sensor exclusion) and the one-resolve identity proof
- `src/physics/planck-world.ts` - `options.table`, `buildTable()`, `getElements()`, fixture tags, `BodyTag.kind` widened to `"ball" | ElementKind`, retired box-rig constants
- `src/physics/types.ts` - `PhysicsWorld.getElements()`; `getBoundarySegments()` documented as the shim
- `src/sandbox/main.ts` - builds from `TABLE_SPEC`; the feed uses `PLAYFIELD_CENTER_X` and `DRAIN_Y`
- `src/sandbox/debug-draw.ts` - module-level `KIND_STYLE` and dash arrays; strokes polylines, dashes sensors, fills circles
- `src/control/flipper-controller.test.ts` - unused `getElements()` stub on SpyWorld (no assertion changed)

## Decisions Made

See `key-decisions` in the frontmatter. In short: the proof box stays the adapter default until 03-04, wall events now carry spec element ids, and the arc step is the minimum of the sagitta step and the chord-length step.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Committed on a phase branch instead of `master`**
- **Found during:** Task 1, first commit
- **Issue:** The Step-0 commit guard (`git.base-branch --is-protected master`) returned `true`, so committing on `master` was refused. `git.allow_default_branch_commits` is not set in config.
- **Fix:** Ran `git checkout -b gsd/phase-03-table-plunger-event-bus` from `3ccbc71`, which follows the configured `phase_branch_template`. `master` was not touched, and the pre-existing uncommitted `.planning/` changes came along unstaged.
- **Impact:** All 03-01 commits are on that branch. Either fast-forward `master` to it, or set `git.allow_default_branch_commits: true` to keep the previous direct-to-master flow.

**2. [Rule 1 - Bug] The Task-1 drain-exclusion test read `drain.path` as `Vec2`**
- **Found during:** Task 2 GREEN
- **Issue:** Once `path` was widened to `PathNode` (Vec2 or ArcNode), reading `.x`/`.y` directly no longer type-checked.
- **Fix:** The check now asserts that no solid boundary segment lies along `DRAIN_Y`.
- **Committed in:** `f35c118`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** No scope change. The branch move needs an operator merge decision.

## Issues Encountered

None.

## Known Stubs

None. The `getElements()` stub in SpyWorld is an intentional unused test stub, which the plan specifies.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- 03-02 can fill in TABLE_SPEC (bumpers, slingshots, lanes) using the same descriptors. Circles and sensors already resolve, build fixtures and draw.
- 03-04 flips the `PlanckWorldOptions.table` default to `TABLE_SPEC`.
- Pending: a visual check of the sandbox outline via `npm run dev` (Task 3 human-check, collected at end of phase).

## Self-Check: PASSED

- FOUND: src/table/spec.ts, src/table/resolve.ts, src/table/resolve.test.ts, src/table/table-world.test.ts
- FOUND commits: fb65ef6, 2bc79f6, f35c118, 3fa4019 (all ancestors of HEAD; evaluation-scope resolves 03-01 commits on this branch)
- Acceptance criteria re-run: all PASS. Plan verification: `npm run typecheck` exit 0; `npm test` 15 files / 96 tests passed; `npx eslint src` clean; `npm run soak` 2/2 passed; `npm run build` ok; constants.ts and every proof file unchanged vs 80869ae; only planck-world.ts imports planck.

---
*Phase: 03-table-plunger-event-bus*
*Completed: 2026-11-19*
