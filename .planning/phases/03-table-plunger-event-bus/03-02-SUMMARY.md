---
phase: 03-table-plunger-event-bus
plan: 02
subsystem: physics
tags: [planck, table-spec, layout, flippers, ball-flow, typescript]

requires:
  - phase: 03-table-plunger-event-bus
    provides: "03-01 table spec + one resolve(), getElements(), spec-driven PlanckWorld, element-driven debug renderer"
provides:
  - "Complete original TABLE_SPEC layout: bumpers 200-202, lane guides 141/142, orbit guides 150/151, slingshots 300/301, rollover sensors 400-402, inlane sensors 500/501 (plus the 03-01 outer loop, chute, funnel, troughs, drain, mounts)"
  - "BUMPER_RADIUS_M (1.1 * BALL_RADIUS_M), OPEN_FIELD_REGION, mirrorPath (Vec2 and ArcNode)"
  - "MountSpec.restPose / ResolvedElement.mount.restPose; buildFlipper droop-limit rest pose with zero construction motor"
  - "Headless proofs on TABLE_SPEC: bumper rim contact (inert), inventory, inverted-V, sweep-clear, seeded drain flow + swept containment"
affects: [03-03, 03-04, 03-06, phase-04-rules, phase-05-render-audio]

actuals:
  tokens: 6300
  tasks: 2
  commits: 2
plan_head_before: cdae16eafd5dd9f7d071f01a5cf2eddc04186836
plan_head_after: 27174982c60ce11bb1dc3e136221c1e42fce89de

tech-stack:
  added: []
  patterns:
    - "Right-hand twins via mirrorPath (arc angles a -> PI - a), never hand-mirrored coordinates"
    - "Rest pose is a per-mount opt-in, so the proof-box calibration path stays byte-identical"
    - "Seeded single-stream drop sampling with replayable seed + ball index in the failure message"

key-files:
  created: []
  modified:
    - src/table/spec.ts
    - src/table/resolve.ts
    - src/table/resolve.test.ts
    - src/physics/planck-world.ts
    - src/table/table-world.test.ts

key-decisions:
  - "TABLE_SPEC flippers are built at their droop limit (left +PI/8, right body angle 7PI/8) with construction motor 0; joint referenceAngle and limits unchanged (bat still created level, then setTransform)"
  - "Element id bands: 0/1 mounts, 1xx walls, 2xx bumpers, 3xx slingshots, 4xx rollovers, 5xx lanes, 600 drain"
  - "Flow proof draws all 8 drops from one mulberry32(0x0302) stream; failures report seed, ball index and drop point"

patterns-established:
  - "Wedge rule documented on TABLE_SPEC: any two supports are >= 0.45 m apart or fully closed"

requirements-completed: [TBL-01]

coverage:
  - id: D1
    description: "Inert three-bumper cluster: a dropped ball's first contact lands on bumper 202's rim, deflects sideways, gains no speed"
    requirement: TBL-01
    verification:
      - kind: unit
        ref: "src/table/table-world.test.ts#deflects a dropped ball off bumper 202's rim without adding energy"
        status: pass
      - kind: unit
        ref: "src/table/table-world.test.ts#has exactly three bumper circles of radius BUMPER_RADIUS_M"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full original layout inventory with unique ids; sensors excluded from the containment boundary; mirrorPath reflects arcs"
    requirement: TBL-01
    verification:
      - kind: unit
        ref: "src/table/table-world.test.ts#(a) has the standard element inventory with unique ids; sensors are not boundary"
        status: pass
      - kind: unit
        ref: "src/table/table-world.test.ts#derives right-hand twins with mirrorPath, arcs included"
        status: pass
    human_judgment: false
  - id: D3
    description: "Flippers rest at construction as a symmetric inverted-V (tip gap wider than the ball) and hold that pose at motor 0"
    requirement: TBL-01
    verification:
      - kind: unit
        ref: "src/table/table-world.test.ts#(b) rests the flippers at construction as a symmetric inverted-V wider than the ball"
        status: pass
    human_judgment: false
  - id: D4
    description: "Each bat's full raise and return sweep is unobstructed"
    verification:
      - kind: unit
        ref: "src/table/table-world.test.ts#(c) sweeps each bat through its full raise and return with nothing in the way"
        status: pass
    human_judgment: false
  - id: D5
    description: "Seeded open-field drops all reach the drain within 30 s with no swept escape"
    requirement: TBL-01
    verification:
      - kind: unit
        ref: "src/table/table-world.test.ts#(d) drains seeded open-field drops within 30 s with no trap and no escape"
        status: pass
    human_judgment: false
  - id: D6
    description: "Proof-box gates unaffected by the rest-pose change; constants.ts and flipper-controller.ts byte-identical to 80869ae"
    verification:
      - kind: integration
        ref: "npx vitest run (104/104) + npm run soak (2/2) + git diff --exit-code 80869ae -- src/physics/constants.ts src/control/flipper-controller.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Layout reads clearly by eye and balls weave through bumpers into inlanes and flippers; flipped shots reach bumpers and orbits"
    requirement: TBL-01
    verification: []
    human_judgment: true
    rationale: "Ball flow and readability are by-eye judgments (D-03); Task 2 human-check via npm run dev, collected at end of phase"

duration: 11min
completed: 2026-11-19
status: complete
---

# Phase 3 Plan 02: Original Table Layout and Flow Proofs Summary

**The original playfield is complete as inert, id-tagged spec data. That covers the three-bumper cluster, three rollover lanes, two orbit lanes, slingshots, inlanes and the drain funnel. The real flippers rest at their droop limits as a symmetric inverted-V, and headless proofs show the bats sweep freely and seeded balls always drain without escaping.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-19T21:25:27Z
- **Completed:** 2026-11-19T21:36:36Z
- **Tasks:** 2 (tracer + auto)
- **Files modified:** 5

## Accomplishments

- **Bumpers:** `BUMPER_RADIUS_M = 1.1 * BALL_RADIUS_M`. Bumpers 200, 201 and 202 sit at (0.95,2.55), its mirror, and (1.45,3.30). They are solid circles on wall material, so they add no kick and award no score.
- **Tracer:** a ball's first contact lands on 202's rim at distance 0.218 from the center. It slows from 2.15 to 0.78 m/s, and vx is 0.27 afterwards.
- **Rest of the layout:** lane guides 141/142, orbit guides 150/151, slingshot triangles 300/301, rollover sensors 400-402 and inlane sensors 500/501, laid out per the starting layout. Every right-hand twin comes from the new `mirrorPath` helper, which maps arcs as `a -> PI - a`.
- **`OPEN_FIELD_REGION`** is exported for the 03-03 soak and the flow proof.
- **Rest pose:** both `TABLE_SPEC` mounts set `restPose: true`, and `resolve()` carries the flag through (default false). With the flag set, `buildFlipper` uses construction motor 0 and calls `setTransform` to put the bat at its droop limit right after the joint is created; the pool angle is read after posing. `PROOF_BOX_SPEC` mounts take the untouched path.
- **Proofs on `TABLE_SPEC`:**
  - inventory of element kinds and counts;
  - the inverted-V, with equal tip y, a tip gap greater than 0.4 m, and the pose holding for 1 s;
  - the sweep test, with each bat's tip-y range at least 0.344 m;
  - 8 seeded drops that all drain within 30 s and pass the swept containment check.

## Task Commits

1. **Task 1 (tracer): inert bumper cluster + rim-contact tracer** - `ead7816` (feat)
2. **Task 2: full layout, rest pose, flow/clearance/containment proofs** - `2717498` (feat)

**Tracer gate:** the run was interactive with end-of-phase verification and an automated-only `<verify>`. I re-ran `<verify>` (11/11 table-world tests, tsc and eslint all green) and then expanded the plan.

## Test Teeth (mutation-checked, reverted)

- **Trap pocket:** moving bumper 202 to y=2.8 closes the gaps to 200 and 201 down to 0.12 m. Proof (d) then fails with `seed 770 ball 5, drop (1.3493, 2.2312): still in play after 30 s at (1.340, 2.398)`.
- **Sweep obstruction:** moving the sling's lower vertex to (1.05,5.3) blocks the bat. Proof (c) then fails with a range of 0.313, below the 0.344 threshold.
- **Margin:** the same flow check passes on 200 seeded drops with a worst drain time of 4.99 s.

## Files Created/Modified

- `src/table/spec.ts` - BUMPER_RADIUS_M, mirrorPath, OPEN_FIELD_REGION, MountSpec.restPose, all new elements, wedge-rule doc
- `src/table/resolve.ts` - `ResolvedElement.mount.restPose` (default false)
- `src/table/resolve.test.ts` - mount equality includes `restPose: false`; new restPose carry-through case
- `src/physics/planck-world.ts` - `buildFlipper(..., restPose)`: motor 0 + droop `setTransform`; docs updated
- `src/table/table-world.test.ts` - bumper tracer, inventory, mirrorPath, inverted-V, sweep-clear, seeded flow cases

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] resolve.test.ts mount assertion broke on the new `restPose` field**
- **Found during:** Task 2
- **Issue:** `expect(el?.mount).toEqual({ pivot, mirror })` fails once the resolver always emits `restPose: false`.
- **Fix:** added `restPose: false` to the expected value, plus one case proving `restPose: true` is carried through. `resolve.test.ts` was not in the plan's file list.
- **Files modified:** src/table/resolve.test.ts
- **Verification:** `npx vitest run` 104/104
- **Committed in:** `2717498`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** None; this was a test expectation update forced by the planned type change.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- 03-03 can draw table-soak drops from `OPEN_FIELD_REGION`. Element ids are stable for 03-06 event identity and for Phase 4 and 5.
- Pending a by-eye check of layout readability and flow via `npm run dev` (the Task 2 human-check, collected at end of phase).

## Self-Check: PASSED

- **Files:** all 5 modified files are present.
- **Commits:** `ead7816` and `2717498` are both ancestors of HEAD (`git rev-list --count cdae16e..HEAD` = 2).
- **Acceptance criteria:** all pass.
  - `BUMPER_RADIUS_M` appears 4 times in spec.ts.
  - aId/bId appears 0 times in table-world.test.ts.
  - `OPEN_FIELD_REGION` appears 1 time in spec.ts.
  - `restPose` appears 7 times in planck-world.ts.
  - constants.ts and flipper-controller.ts are unchanged vs 80869ae.
- **Plan verification:**
  - `npm run typecheck`: exit 0.
  - `npm test`: 15 files and 104 tests passed.
  - `npx eslint src`: clean.
  - `npm run soak`: 2/2 passed.
  - `npm run build`: ok.

---
*Phase: 03-table-plunger-event-bus*
*Completed: 2026-11-19*
