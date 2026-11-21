---
phase: 03-table-plunger-event-bus
verified: 2026-11-21T22:50:00Z
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
covered_digest: "v4:sha256:0a8ab9fca00b7ebe5d64ac61c388fbdef2ad9a55e25e767c5709f1d92fc4b140"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Charge meter and plunger pullback in the procedural renderer. Run `npm run dev`, hold Space and release at several fill levels on the default (non-?debug=1) view."
    expected: "The meter beside the chute fills bottom to top over about 0.67 s, red at full; the plunger tip retracts in step; release launches proportionally."
    why_human: "Phase 3 UAT confirmed the meter on the debug renderer (03-UAT.md test 2, pass). Phase 5 moved the default view to TableRenderer.drawPlunger. It reads the same getCharge() value, but how it looks is a by-eye call. Phase 5's own UAT is still pending."
---

# Phase 3: Table, Plunger & Event Bus Verification Report

**Phase Goal:** An original space-themed playfield exists and a ball can be charged and launched into it, with a single table/spec coordinate source and a typed collision-event bus wired and ready for downstream rules, rendering, and audio.
**Verified:** 2026-11-21
**Status:** human_needed
**Re-verification:** Yes. The earlier report (status passed, 2026-11-20) went stale after Phases 4 and 5 and their review fixes changed covered files. I re-checked the goal against the current code.

## Evolution since the prior report

The Phase 3 scaffolding has legitimately evolved. None of it breaks a must-have.

| Phase 3 artifact | Current state | Effect on the must-have |
|---|---|---|
| 03-06 demo console consumer in `main.ts` | Removed by 04-05. Real consumers now register on the router: `GameSession`, `ReactiveElements`, `ContactFlash` (`router.register` in `game-session.ts:132`, `reactive-elements.ts:275`, `contact-flash.ts:33`). | SC#4 is stronger. The bus has live rules, render and audio-cue consumers, not a demo log. |
| Debug-draw as the default renderer | The default view is `TableRenderer` (`src/render/table-renderer.ts`). `DebugRenderer` stays behind `?debug=1`. Both read `world.getElements()` and `getCharge()`. | The single-spec geometry source and the meter still hold. |
| `PlungerController.onReleaseEdge` | Now gated on the ball resting in `PLUNGER_ZONE` (speed below 0.05 m/s, IN-01). `applyEdges` orders same-window edges (IN-02). It adds `getReleaseCount()` and `getLastReleaseCharge()` for audio cues. Main passes `session.activeBallId`. | The charge, proportional impulse, meter honesty and cancel-never-launches behaviour are unchanged. It is tighter. |
| `constants.ts` | Against 80869ae: 88 insertions, 7 deletions. All 7 deletions are doc-comment lines. The added code is the plunger block plus `BALL_DENSITY` and `ballMass`. No feel constant changed. `containment.ts` has no diff. | D-04 holds. |
| `spec.ts`, `resolve.ts` | `spec.ts` has one doc-comment change since the prior report. `resolve.ts` is unchanged. | Layout intact. |

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Original layout from standard elements (right chute, upper bumper cluster, guide walls/lanes, outer walls, center-bottom drain funnel, two lower flippers in an inverted-V), procedural only | VERIFIED | `TABLE_SPEC` in `src/table/spec.ts`: cabinet wall 100, chute 110, funnel and trough walls 120/121/130/131, lane guides 141/142, orbit guides 150/151, bumpers 200-202, slingshots 300/301, rollovers 400-402, inlane sensors 500/501, drain sensor 600, flipper mounts 0/1 with `restPose: true`. Right-hand twins come from `mirrorX`/`mirrorPath`. `table-world.test.ts` (inventory, inverted-V wider than the ball, sweep-clear, seeded drops draining within 30 s) passes. `git ls-files` returns no image or audio files. `asset-free.test.ts` passes. |
| 2 | Hold to charge, release fires a proportional impulse up the chute onto the playfield | VERIFIED | `PlungerController` accumulates the charge per fixed step and applies one impulse along `PLUNGER_AXIS` on release, scaled `PLUNGER_MIN_IMPULSE` + (`MAX` - `MIN`) x `getCharge()`. `PlanckWorld.applyImpulse` calls `applyLinearImpulse` and no-ops on a non-finite or unknown ball. Wiring is in `main.ts` `onFixedStep` (`plungerInput.drainEdges()`, `plunger.applyEdges(...)`, `plunger.update()`). `plunger-e2e.test.ts` runs the real world, loop and keyboard latch, and passes. The behaviour-dependent invariants (cancel never launches, auto-repeat never re-charges) are covered by `plunger-input.test.ts`, `plunger-controller.test.ts` and the e2e blur case, all passing. |
| 3 | Plunger charge is visualized so power is readable before release | VERIFIED (code path) | `TableRenderer.drawPlunger(charge)` draws the meter over `PLUNGER_ZONE` plus the tip displaced by `c * PULLBACK_M`. `main.ts` feeds `renderFrame.plungerCharge = plunger.getCharge()` every frame. The debug renderer does the same via `drawChargeMeter`. `getCharge()` is the same value the release impulse uses. By-eye readability on the new renderer is the one human item. |
| 4 | Every ball-vs-element contact emits a typed event on a one-way bus; collision and render models derive from one table/spec | VERIFIED | `PlanckWorld` constructor: `this.elements = resolve(options?.table ?? TABLE_SPEC)` (line 374). `getElements()` returns that output. Both renderers read `world.getElements()`, and `main.ts` takes `drainId` and bounds from it. `CollisionEvent` carries `ballId`, `elementKind` and `elementId`, normalized by `normalizeContact`. Sensors fire on begin-contact. `CollisionRouter.dispatch()` drains once per `onPostStep`, fans out in registration order, and isolates throwing listeners. `launch-and-route.test.ts`, `collision-router.test.ts`, `collision-event.test.ts` and `sensor-event.test.ts` pass. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Plan-level must-haves (spot-checked)

| Must-have | Status | Evidence |
|-----------|--------|----------|
| `planck-world.ts` holds no table geometry; default world is `TABLE_SPEC` | VERIFIED | Constructor resolves `options?.table ?? TABLE_SPEC`. |
| `PROOF_BOX_SPEC` kept; feel constants and `containment.ts` untouched | VERIFIED | `PROOF_BOX_SPEC` is still in `spec.ts`. The constants diff has only doc-comment changes and additions (see above). `containment.ts` has no diff against 80869ae. |
| `ElementKind` defined once, in `spec.ts` | VERIFIED | `types.ts` and `debug-draw.ts` import it from `../table/spec`. The `table-renderer.ts` import is `type ElementKind` from `../table/spec`. |
| Planck imported only by `planck-world.ts` (non-test) | VERIFIED | The only non-test `from "planck"` is `planck-world.ts:26`. |
| Plunger meter and impulse read the same `getCharge()` | VERIFIED | `onReleaseEdge` uses `this.getCharge()`. Main renders `plunger.getCharge()`. |
| Focus loss or auto-repeat never launches or re-charges | VERIFIED | `PlungerInput` ignores `e.repeat` and de-dupes while held. `cancelHeld()` latches cancel only, never release. `onCancelEdge()` resets with no impulse. |
| Prohibition: no copied layout or assets (judgment tier) | VERIFIED, non-authoritative | Parametric spec data with our own ids. No asset files. Flagged for human originality review, as before. |
| Prohibition: meter must not differ from launch charge (judgment tier) | VERIFIED, non-authoritative | A single `getCharge()` source, backed by the meter-honesty test in `plunger-controller.test.ts`. |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/table/spec.ts` | VERIFIED | 400 lines. Imported by the world, controller, renderers and harness. |
| `src/table/resolve.ts` | VERIFIED | 274 lines, unchanged. Called once in the `PlanckWorld` constructor. |
| `src/physics/planck-world.ts` | VERIFIED | `resolve`, `applyImpulse`, `getElements`, `normalizeContact` and the begin-contact sensor path are all present. |
| `src/control/plunger-controller.ts`, `src/input/plunger-input.ts` | VERIFIED | Both are instantiated in `main.ts` and exercised by the e2e tests. |
| `src/app/collision-router.ts` | VERIFIED | `main.ts` builds it and calls `router.dispatch()` first in `onPostStep`. |
| `src/sim/loop.ts` | VERIFIED | `loop.advance(deltaMs, onFixedStep, onPostStep)` is called in `frame()`. |
| `src/physics/constants.ts` | VERIFIED | The five `PLUNGER_*` constants are present and unchanged in value. |
| `src/sandbox/debug-draw.ts` | VERIFIED | Evolved into the `?debug=1` diagnosis renderer. It still reads `getElements()` and the charge. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `planck-world.ts` | `table/resolve.ts` | `resolve(options?.table ?? TABLE_SPEC)` | WIRED |
| `sandbox/main.ts` | `table/spec.ts` | `new PlanckWorld({ table: TABLE_SPEC })` | WIRED |
| `table-renderer.ts`, `debug-draw.ts` | `physics/types.ts` | `world.getElements()` | WIRED |
| `main.ts` | `plunger-controller.ts` | `plunger.applyEdges`, `plunger.update()` in `onFixedStep`; `getCharge()` goes to the renderer | WIRED |
| `main.ts` | `sim/loop.ts` and router | `loop.advance(deltaMs, onFixedStep, onPostStep)`; `onPostStep` runs `router.dispatch()` | WIRED |
| `planck-world.ts` | `table/spec.ts` | fixture `userData { kind, id }` read by `normalizeContact` into `elementKind` and `elementId` | WIRED |
| `router` | downstream consumers | `GameSession`, `ReactiveElements` and `ContactFlash` all register on it | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Charge meter | `plungerCharge` | `PlungerController.getCharge()` from the step-counted charge | Yes | FLOWING |
| Table drawing | `getElements()` | the same `resolve()` output as the colliders | Yes | FLOWING |
| Bus consumers | `CollisionEvent` | Planck post-solve and begin-contact via the pooled drain | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type check | `npm run typecheck` | exit 0 | PASS |
| Phase 3 suites (table, plunger controller and input, plunger e2e, launch-and-route, router, collision and sensor events, asset-free, table-renderer) | `npx vitest run` over those 11 files | 11 files, 126 tests passed | PASS |
| Full suite and soak | Not re-run by me. The orchestrator reported `npm test` 52 files / 758 tests and `npm run soak` 4/4 passing this run. | n/a | Accepted as reported |

### Probe Execution

Step 7c: SKIPPED. The phase declares no `probe-*.sh` scripts.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TBL-01 | 03-01, 03-02, 03-03, 03-04, 03-06 | Original layout from standard pinball elements, positioned for good flow | SATISFIED | `TABLE_SPEC` inventory, flow and containment proofs, real-table soak gate. By-eye layout flow was accepted in 03-UAT test 1 (pass). |
| LNCH-01 | 03-05 | Hold-to-charge plunger with a proportional impulse up the chute | SATISFIED | Controller, input latch and e2e proofs, as under truth 2. |
| LNCH-02 | 03-05 | Plunger charge visualized | SATISFIED (readability on the new renderer is the human item) | `TableRenderer.drawPlunger` and `DebugRenderer.drawChargeMeter`, both fed by `getCharge()`. |

REQUIREMENTS.md maps exactly LNCH-01, LNCH-02 and TBL-01 to Phase 3 (all marked Complete). That equals the union of the plans' `requirements` fields, so there are no ORPHANED requirements. SC#4 (the event bus) is carried under TBL-01 in plan 03-06.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/**` (non-test) | `TBD/FIXME/XXX` scan | none | No debt markers found. |
| `03-REVIEW.md` IN-01, IN-02 | The plunger launched any ball in the zone; edge order within one window | none | Both resolved in Phase 4 (rest gate, `applyEdges`). |
| `planck-world.ts` `primeBallCcd` | An extra hidden world step per `addBall` (WR-01 residual) | Info | Solid events are suppressed, so the bus contract holds. Unchanged from the prior report. |

### Deferred Items

None.

### Human Verification Required

One by-eye item (see frontmatter): the charge meter and pullback in the default procedural renderer. Phase 3's other by-eye and browser items (layout flow, live bus lines, CR-01, WR-02, WR-03) were all completed in `03-UAT.md` (status complete, 6 of 6 pass). That UAT ran on the debug renderer, so it does not cover how the procedural renderer's meter looks. It is not a gap, because the code path is verified and tested.

### Gaps Summary

No gaps. All four roadmap success criteria and all three requirement IDs are backed by code that exists, is wired, and passes tests at HEAD. Downstream phases evolved the Phase 3 scaffolding (a live rules, render and audio bus, the procedural renderer, the plunger rest gate) without breaking any Phase 3 must-have. Status is `human_needed` only for the one by-eye check of the meter on the new renderer.

---

_Verified: 2026-11-21_
_Verifier: Claude (gsd-verifier)_
