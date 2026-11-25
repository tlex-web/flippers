---
phase: 03-table-plunger-event-bus
verified: 2026-11-22T11:30:00Z
status: passed
score: 4/4 must-haves verified
covered_files:
  - ".planning/phases/03-table-plunger-event-bus/03-01-PLAN.md"
  - ".planning/phases/03-table-plunger-event-bus/03-01-SUMMARY.md"
  - ".planning/phases/03-table-plunger-event-bus/03-02-PLAN.md"
  - ".planning/phases/03-table-plunger-event-bus/03-02-SUMMARY.md"
  - ".planning/phases/03-table-plunger-event-bus/03-03-PLAN.md"
  - ".planning/phases/03-table-plunger-event-bus/03-03-SUMMARY.md"
  - ".planning/phases/03-table-plunger-event-bus/03-04-PLAN.md"
  - ".planning/phases/03-table-plunger-event-bus/03-04-SUMMARY.md"
  - ".planning/phases/03-table-plunger-event-bus/03-05-PLAN.md"
  - ".planning/phases/03-table-plunger-event-bus/03-05-SUMMARY.md"
  - ".planning/phases/03-table-plunger-event-bus/03-06-PLAN.md"
  - ".planning/phases/03-table-plunger-event-bus/03-06-SUMMARY.md"
  - "src/app/collision-router.ts"
  - "src/control/plunger-controller.ts"
  - "src/harness/soak.ts"
  - "src/input/plunger-input.ts"
  - "src/physics/constants.ts"
  - "src/physics/planck-world.ts"
  - "src/physics/types.ts"
  - "src/render/table-renderer.ts"
  - "src/sandbox/debug-draw.ts"
  - "src/sandbox/main.ts"
  - "src/sim/loop.ts"
  - "src/table/resolve.ts"
  - "src/table/spec.ts"
covered_digest: "v4:sha256:cd0785fbccb5a31488a36a6203fbd51ad91f628b3f554d7e565470ff52071f9e"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 3: Table, Plunger & Event Bus Verification Report

**Phase Goal:** An original space-themed playfield exists and a ball can be charged and launched into it, with a single table/spec coordinate source and a typed collision-event bus wired and ready for downstream rules, rendering, and audio.
**Verified:** 2026-11-22
**Status:** passed
**Re-verification:** Yes. The prior report (passed, 2026-11-21T22:50Z) went stale because `src/sandbox/main.ts` changed afterwards. I re-checked every must-have against the current code.

## What changed since the prior report

| Covered file | Commits since 2026-11-21T22:50Z | Effect |
|---|---|---|
| `src/sandbox/main.ts` | 4 Phase-5 review fixes (56df7b0, ad83a46, ca0496d, b04d725); net +6/-3 lines | Two doc-comment edits on the audio starting window, plus `new MuteView(requireTextSink("hud-mute"), requireTextSink("hud-mute-live"))` (a hidden live region announcing mute and unmute). No change to the plunger, router, loop or world wiring. |
| All 12 other covered source files | 0 | Unchanged (`git log --since` returns nothing for each). |

I read the `main.ts` diff directly. It adds no Phase-3 behavior and removes none.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Original layout from standard elements (right chute, upper bumper cluster, guide walls/lanes, outer walls, center-bottom drain funnel, two lower flippers in an inverted-V), procedural only | VERIFIED | `TABLE_SPEC` in `src/table/spec.ts` (unchanged). `table-world.test.ts` (inventory, inverted-V gap wider than the ball, sweep-clear, seeded drops draining) passes in this run. `git ls-files` finds no png/jpg/svg/gif/webp/mp3/wav/ogg files. The asset-free gate passes. |
| 2 | Hold to charge, release fires a proportional impulse up the chute onto the playfield | VERIFIED | `plunger-controller.ts:113` computes `PLUNGER_MIN_IMPULSE + (MAX - MIN) * getCharge()`. `planck-world.ts:908` applies it with `applyLinearImpulse`. `main.ts` calls `plunger.applyEdges(...)` (line 255) and `plunger.update()` (line 262) in `onFixedStep`. The plunger controller, input and e2e tests pass in this run. The cancel-never-launches and auto-repeat invariants are exercised by named tests (`plunger-input`, `plunger-controller`, e2e blur). |
| 3 | Plunger charge is visualized so power is readable before release | VERIFIED | `TableRenderer.drawPlunger(charge)` (`table-renderer.ts:491`) draws the meter and the tip pullback `c * PULLBACK_M`. `main.ts:460` sets `renderFrame.plungerCharge = plunger.getCharge()`. `main.ts:466` passes the same value to the debug renderer. The meter and the release impulse read the same `getCharge()`. 03-UAT test 7 (by-eye check on the default procedural renderer) passed, and the code path is unchanged. |
| 4 | Every ball-vs-element contact emits a typed event on a one-way bus; collision and render models derive from one table/spec | VERIFIED | `planck-world.ts:374` is `this.elements = resolve(options?.table ?? TABLE_SPEC)`. `main.ts:123` is `new PlanckWorld({ table: TABLE_SPEC })`. `main.ts:286` runs `router.dispatch()` from `onPostStep`, and `loop.advance(deltaMs, onFixedStep, onPostStep)` is at line 408. Planck is imported only by `planck-world.ts:26` in non-test code. The router, collision-event, sensor-event and launch-and-route suites pass. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Plan-level must-haves (spot-checked against current code)

| Must-have | Status | Evidence |
|-----------|--------|----------|
| `planck-world.ts` holds no table geometry; default world is `TABLE_SPEC` | VERIFIED | `planck-world.ts:374`. |
| Planck imported only by `planck-world.ts` | VERIFIED | The only non-test `from "planck"` match is `planck-world.ts:26`. |
| Plunger meter and impulse read the same `getCharge()` | VERIFIED | `plunger-controller.ts:109` and `:113`; `main.ts:460` and `:466`. |
| Focus loss or auto-repeat never launches or re-charges | VERIFIED | `plunger-input.test.ts` and `plunger-controller.test.ts` pass. |
| Prohibition: no copied layout or assets (judgment tier) | VERIFIED, non-authoritative | Parametric spec data and no asset files. By-eye layout originality was accepted in 03-UAT test 1. |
| Prohibition: meter must not differ from launch charge (judgment tier) | VERIFIED, non-authoritative | Single `getCharge()` source with the meter-honesty test in `plunger-controller.test.ts`. |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/table/spec.ts`, `src/table/resolve.ts` | VERIFIED | Unchanged. Used by the world, renderers and harness. |
| `src/physics/planck-world.ts`, `types.ts`, `constants.ts` | VERIFIED | Unchanged. `resolve`, `applyLinearImpulse` and the plunger constants are present. |
| `src/control/plunger-controller.ts`, `src/input/plunger-input.ts` | VERIFIED | Unchanged. Instantiated in `main.ts`. |
| `src/app/collision-router.ts` | VERIFIED | Unchanged. `router.dispatch()` is called from `onPostStep`. |
| `src/sim/loop.ts` | VERIFIED | Unchanged. `loop.advance` is called from `frame()`. |
| `src/render/table-renderer.ts`, `src/sandbox/debug-draw.ts` | VERIFIED | Unchanged. Both read the spec geometry and the charge. |
| `src/harness/soak.ts` | VERIFIED | Unchanged. The soak gate passes (orchestrator-reported 4/4). |
| `src/sandbox/main.ts` | VERIFIED | Changed only by the Phase-5 doc comments and `MuteView` live region. All Phase-3 wiring is intact. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `planck-world.ts` | `table/resolve.ts` | `resolve(options?.table ?? TABLE_SPEC)` (line 374) | WIRED |
| `sandbox/main.ts` | `table/spec.ts` | `new PlanckWorld({ table: TABLE_SPEC })` (line 123) | WIRED |
| `sandbox/main.ts` | `plunger-controller.ts` | `applyEdges` (255), `update` (262), `getCharge` (460, 466) | WIRED |
| `sandbox/main.ts` | `sim/loop.ts` and router | `loop.advance(...)` (408); `router.dispatch()` in `onPostStep` (286) | WIRED |
| `table-renderer.ts` | plunger charge | `drawPlunger(frame.plungerCharge)` (line 328) | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Charge meter | `plungerCharge` | `PlungerController.getCharge()` from the step-counted charge | Yes | FLOWING |
| Table drawing | `getElements()` | The same `resolve()` output as the colliders | Yes | FLOWING |
| Bus consumers | `CollisionEvent` | Planck contacts via `normalizeContact`, drained once per post-step | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type check | `npx tsc --noEmit` | exit 0 | PASS |
| Phase 3 area suites | `npx vitest run src/table src/control src/input/plunger-input.test.ts src/app src/render src/physics` | 19 files, 243 tests passed | PASS |
| Full suite, lint, soak | I did not re-run these. The orchestrator reported: 52 files / 891 tests passed, eslint clean, `npm run soak` 4/4. | n/a | Accepted as reported |

### Probe Execution

Step 7c: SKIPPED. The phase declares no `probe-*.sh` scripts.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TBL-01 | 03-01, 03-02, 03-03, 03-04, 03-06 | Original layout from standard pinball elements, positioned for good flow | SATISFIED | Truths 1 and 4. By-eye flow was accepted in 03-UAT test 1 (pass). |
| LNCH-01 | 03-05 | Hold-to-charge plunger with a proportional impulse up the chute | SATISFIED | Truth 2. |
| LNCH-02 | 03-05 | Plunger charge visualized | SATISFIED | Truth 3. 03-UAT tests 2 and 7 pass. |

The union of the plans' `requirements` fields is LNCH-01, LNCH-02 and TBL-01. REQUIREMENTS.md maps exactly these three IDs to Phase 3 (all `[x]`, Complete). Every ID is accounted for and none is ORPHANED.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/**` (non-test) | `TBD/FIXME/XXX` scan | none | No matches. |
| `planck-world.ts` `primeBallCcd` | An extra hidden world step per `addBall` | Info | Known and unchanged. Solid events are suppressed, so the bus contract holds. |

### Deferred Items

None.

### Human Verification

None outstanding. The one item the prior report listed (the charge meter and pullback in the default procedural renderer) is recorded as pass in `03-UAT.md` test 7 (status complete, 7 passed, 0 issues). The code it depends on is unchanged: `table-renderer.ts` and `plunger-controller.ts` have no commits since the prior report, and the `main.ts` change only touches the mute view and doc comments. Status is therefore `passed`.

### Gaps Summary

No gaps. All four roadmap success criteria and all three requirement IDs are backed by code that exists, is wired and passes tests at HEAD. The only change since the last verification (four Phase-5 review-fix commits to `main.ts`) is unrelated to Phase 3 behavior.

---

_Verified: 2026-11-22_
_Verifier: Claude (gsd-verifier)_
