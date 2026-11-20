---
phase: 03-table-plunger-event-bus
verified: 2026-11-20T00:10:00Z
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
  - "src/sandbox/ball-feed.ts"
  - "src/sandbox/debug-draw.ts"
  - "src/sandbox/main.ts"
  - "src/sim/loop.ts"
  - "src/table/resolve.ts"
  - "src/table/spec.ts"
covered_digest: "v4:sha256:3db100eb1cf959aee71415236c9f60c152dba62e4a4e4e947ed4003c841f57e4"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Layout readability and ball flow. Run `npm run dev`, open the sandbox, and watch the table: confirm the chute, three-bumper cluster, rollover lanes, orbit guides, inlanes, slingshots, drain funnel and the inverted-V flippers read clearly, and that a launched ball flows through the field to the flippers/drain."
    expected: "The layout reads as a coherent original pinball table and plays with good flow (no obvious dead zones)."
    why_human: "Layout flow and readability is a by-eye judgment (D-03). Headless proofs cover no-trap/containment/drain flow, not aesthetics."
  - test: "Charge meter readability. Hold Space and watch the meter and plunger pullback; release at several fill levels."
    expected: "The meter fills smoothly bottom to top over about 0.67 s; longer holds visibly read as more charge; the pullback tracks the meter; release launches proportionally."
    why_human: "Visual readability of the meter and pullback is a perception judgment."
  - test: "Live bus console lines. With devtools open, launch a ball and let it fall through a rollover lane, an inlane and the drain."
    expected: "`[bus] ball N rollover/lane/drain #id at (x, y)` lines appear for sensors, throttled solid-contact lines appear for walls/bumpers/flippers, and a fresh ball is parked on the plunger after a drain."
    why_human: "End-to-end console confirmation in a real browser; the headless tests drive the same stack without a DOM."
  - test: "CR-01 playtest. Leave the parked ball idle, then launch several balls, including a drain and re-feed."
    expected: "The parked ball is never respawned while idle; each Space launch fires the ball up the chute; a drained ball is replaced by exactly one fresh ball at the plunger."
    why_human: "The fixer marked this requires-human-verification; headless ball-feed tests cover it at 60/120/144 Hz but not the real browser frame loop."
  - test: "WR-02 render interpolation. Watch a drain-and-respawn in the browser."
    expected: "No one-frame streak is drawn from the drain to the plunger when the ball respawns."
    why_human: "The render-path fix in main.ts frame() has no headless test (needs a DOM)."
  - test: "WR-03 flipper drawing. Compare the drawn flipper against the ball contact point at the tip and hinge."
    expected: "The drawn bat matches the collider extent: the ball touches the visible tip, and the droop tip-to-tip gap looks wider than the ball."
    why_human: "Visual fidelity of debug-draw against the collider."
---

# Phase 3: Table, Plunger & Event Bus Verification Report

**Phase Goal:** An original space-themed playfield exists and a ball can be charged and launched into it, with a single table/spec coordinate source and a typed collision-event bus wired and ready for downstream rules, rendering, and audio.
**Verified:** 2026-11-20
**Status:** human_needed
**Re-verification:** No, initial verification. It was run against current HEAD (`ff4b96b`), which includes the post-review fixes e0f475c..97a4d9e.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Original layout from standard elements (right chute, upper bumper cluster, guide walls/lanes, outer walls, center-bottom drain funnel, two lower flippers in an inverted-V), procedural only, positioned for flow | VERIFIED | `src/table/spec.ts` `TABLE_SPEC` has the cabinet wall (id 100, rounded top corners, arcs), chute 110, funnel/trough walls 120/121/130/131, lane guides 141/142, orbit guides 150/151, three bumpers 200-202, slingshots 300/301, rollover sensors 400-402, inlane sensors 500/501, drain sensor 600, and two `restPose` flipper mounts 0/1. Right-hand twins come from `mirrorX`/`mirrorPath`. `table-world.test.ts` proves inventory, inverted-V wider than the ball, sweep-clear, and seeded open-field drops draining within 30 s with no trap and no escape. `git ls-files` has no image or audio files. Layout aesthetics go to human verification. |
| 2 | Hold to charge, release fires a proportional impulse up the chute onto the playfield | VERIFIED | `PlungerController` (`src/control/plunger-controller.ts`) charges per fixed step and applies one impulse along `PLUNGER_AXIS` on release, scaled from `PLUNGER_MIN_IMPULSE` to `PLUNGER_MAX_IMPULSE` by `getCharge()`. It is wired in `main.ts` `onFixedStep` through `PlungerInput`, and `PlanckWorld.applyImpulse` calls `applyLinearImpulse` (no-op on an unknown id or non-finite input). `plunger-e2e.test.ts` runs the real world, loop and keyboard latch: a full charge climbs above the chute top and crosses left of the chute wall; a half hold climbs strictly less; a tap still moves the ball and it falls back; a blur mid-hold launches nothing. `ball-feed.test.ts` checks launches at 60/120/144 Hz. |
| 3 | Plunger charge is visualized (pullback and/or meter) so power is readable before release | VERIFIED (code path) | `debug-draw.ts` `drawChargeMeter(charge)` draws a vertical bar spanning `PLUNGER_ZONE` plus a plunger tip displaced by `charge * PULLBACK_M`. `main.ts` passes `plunger.getCharge()` every frame, and the same value drives the impulse (the meter-honesty test is in `plunger-controller.test.ts`). The by-eye readability check is a human item. |
| 4 | Every ball-vs-element contact emits a typed event on a one-way bus; collision and render models both derive from one table/spec | VERIFIED | One `resolve(options.table ?? TABLE_SPEC)` in the `PlanckWorld` constructor feeds the fixtures, `getBoundarySegments()` (same object references) and `getElements()`. `debug-draw` iterates `world.getElements()`. `normalizeContact` yields `ballId`, `elementKind` and `elementId` independent of fixture order. Solid contacts emit via post-solve and sensors via begin-contact with impulse 0 (the ball center is used for the point, per the CR-02 fix). `CollisionRouter.dispatch()` drains once per fixed step at the `onPostStep` seam, fans out in registration order, and isolates throwing listeners (WR-04). `launch-and-route.test.ts` shows one dispatch per fixed step and routed events carrying the launched ball's id and a spec element kind. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Plan-level must-haves (spot-checked against the code)

| Must-have | Status | Evidence |
|-----------|--------|----------|
| `planck-world.ts` holds no table geometry of its own; default world is `TABLE_SPEC` | VERIFIED | `buildTable(this.elements)` reads only the resolve output. The `table?: TableSpec` option defaults to `TABLE_SPEC`. |
| `PROOF_BOX_SPEC` preserves the Phase-1/2 proofs; `containment.ts` and the feel constants are untouched | VERIFIED | `git diff 80869ae HEAD -- src/physics/constants.ts` shows 51 insertions and 0 deletions (the plunger block). The full suite passes with the proofs pinned to `PROOF_BOX_SPEC`. |
| `ElementKind` is defined once in `spec.ts` | VERIFIED | `spec.ts` exports it; `planck-world.ts` and `debug-draw.ts` import it (`KIND_STYLE` is `Record<ElementKind, ...>`). |
| Planck is imported only by `planck-world.ts` (outside tests) | VERIFIED | `grep 'from "planck"'` over non-test sources returns only `planck-world.ts`. |
| Plunger meter and impulse read the same `getCharge()` | VERIFIED | `onReleaseEdge` computes the magnitude from `this.getCharge()`; `main.ts` renders `plunger.getCharge()`. |
| Focus loss or auto-repeat never launches or re-charges | VERIFIED | `onCancelEdge` resets with no impulse; the blur e2e test passes; the press edge is ignored while charging. |
| Prohibition: no copied layout or assets (judgment tier) | VERIFIED, non-authoritative | The layout is parametric spec data with our own ids, and no asset files exist. Human review recommended for the originality claim. |
| Prohibition: meter must not differ from the launch charge (judgment tier) | VERIFIED, non-authoritative | The single shared `getCharge()` source and an automated meter-honesty test. |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/table/spec.ts` | VERIFIED | 399 lines, substantive, imported by the world, controller, renderer and harness. |
| `src/table/resolve.ts` | VERIFIED | 274 lines, called once in the `PlanckWorld` constructor. |
| `src/physics/planck-world.ts` | VERIFIED | Spec-driven `buildTable`, `applyImpulse`, `getElements`, sensor and solid emit paths. |
| `src/control/plunger-controller.ts` and `src/input/plunger-input.ts` | VERIFIED | Both are instantiated in `main.ts` and exercised by the e2e tests. |
| `src/app/collision-router.ts` | VERIFIED | Instantiated in `main.ts`; `dispatch()` is called from `onPostStep`. |
| `src/sim/loop.ts` | VERIFIED | `advance(ms, onStep?, onPostStep?)`; the accumulator is decremented before the hook (WR-04). |
| `src/sandbox/ball-feed.ts` | VERIFIED | Bus-driven respawn on the drain sensor (CR-01). |
| `src/sandbox/debug-draw.ts` | VERIFIED | Draws from `getElements()` and `getFlippers()`, plus the meter and pullback. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `planck-world.ts` | `table/resolve.ts` | `resolve(options?.table ?? TABLE_SPEC)` | WIRED |
| `sandbox/main.ts` | `table/spec.ts` | `new PlanckWorld({ table: TABLE_SPEC })` | WIRED |
| `sandbox/debug-draw.ts` | `physics/types.ts` | `world.getElements()` | WIRED |
| `main.ts` | `plunger-controller.ts` | `onFixedStep` drains `PlungerInput`; `getCharge()` goes to `renderer.draw` | WIRED |
| `main.ts` | `sim/loop.ts` | `loop.advance(deltaMs, onFixedStep, onPostStep)`; `onPostStep` runs `router.dispatch()` then `feed.service()` | WIRED |
| `planck-world.ts` | `table/spec.ts` | fixture `userData { kind, id }` stamped from the spec, read by `normalizeContact` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Charge meter | `charge` | `PlungerController.getCharge()` from the step-counted charge | Yes | FLOWING |
| Table drawing | `getElements()` | the same `resolve()` output as the colliders | Yes | FLOWING |
| Bus consumers | `CollisionEvent` | Planck post-solve and begin-contact via the pooled drain | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type check | `npm run typecheck` | exit 0 | PASS |
| Full suite (run once) | `npx vitest run` | 24 files, 168 tests passed | PASS |
| Soak gates, lint, build | not re-run by me; the orchestrator reported `npm run soak` 3/3, `eslint src` exit 0, `npm run build` ok at HEAD | n/a | Accepted as reported, not independently re-run |

### Probe Execution

Step 7c: SKIPPED. The phase declares no `probe-*.sh` scripts.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TBL-01 | 03-01, 03-02, 03-03, 03-04, 03-06 | Original layout from standard pinball elements, positioned for good flow | SATISFIED (flow by eye is human item 1) | `TABLE_SPEC` inventory, flow and containment proofs, real-table soak gate, and the bus built over the same spec. |
| LNCH-01 | 03-05 | Hold-to-charge plunger with a proportional impulse up the chute | SATISFIED | Controller plus e2e proofs, as under truth 2. |
| LNCH-02 | 03-05 | Plunger charge visualized | SATISFIED (readability is human item 2) | `drawChargeMeter` fed by `getCharge()`. |

REQUIREMENTS.md maps exactly LNCH-01, LNCH-02 and TBL-01 to Phase 3. They are the union of the plans' `requirements` fields, so no ORPHANED requirements. SC#4 (the event bus) is carried under TBL-01 in plan 03-06.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/**` | `TBD/FIXME/XXX` scan | none | No debt markers. |
| `03-REVIEW.md` IN-01..IN-05 | Open info findings: the plunger launches any ball in the zone; edge ordering when press and release land in one drain window; stale comments after the table switch (IN-03); the soak only sweeps flipper 0; `drainEvents()` exposes the reused array | Info | None blocks the goal. They are recorded as `open` in 03-REVIEW-DISPOSITION.md and should be triaged. |
| `planck-world.ts` `primeBallCcd` | An extra hidden world step per `addBall` (WR-01 residual) | Info | Solid events are suppressed, so the bus contract holds. The fixer flagged a deeper fix (a throwaway priming world) for a human decision. |

### Deferred Items

None. No gaps were identified, so none were deferred.

### Human Verification Required

See the `human_verification` frontmatter: six by-eye or browser items (layout flow, charge-meter readability, live console lines, and the CR-01, WR-02 and WR-03 browser checks). None of them is a gap, because the code paths exist, are wired, and are exercised headlessly where possible.

### Gaps Summary

No blocking gaps. All four roadmap success criteria and all three requirement IDs are backed by code that exists, is wired, and is exercised by passing tests at HEAD. I ran typecheck and the full 168-test suite myself. I took soak, lint and build from the orchestrator's report and did not re-run them. Status is `human_needed` only because the by-eye and browser checks listed above cannot be verified headlessly.

---

_Verified: 2026-11-20_
_Verifier: Claude (gsd-verifier)_
