---
phase: 03-table-plunger-event-bus
plan: 06
subsystem: physics
tags: [planck, event-bus, collision, sensors, router, fixed-step, typescript, vitest]

requires:
  - phase: 03-table-plunger-event-bus
    provides: "03-01/03-02 spec-tagged fixture userData {kind,id} (bumpers 200-202, slings 300/301, rollovers 400-402, inlanes 500/501, drain 600, mounts 0/1); 03-05 plunger stack and sandbox wiring"
provides:
  - "CollisionEvent { type, ballId, elementKind, elementId, point, normalImpulse }; CollisionPartnerKind = ElementKind | \"ball\" (D-12)"
  - "Exported pure normalizeContact(out, a, b) + ContactIdentity; private zero-alloc emitContact shared by post-solve and begin-contact"
  - "begin-contact sensor path: lanes, rollovers, drain emit once on overlap begin with normalImpulse 0, point = ball center"
  - "FixedStepLoop.advance(realDeltaMs, onStep?, onPostStep?): post-step seam, exactly once per fixed step"
  - "CollisionRouter (register/dispatch) + CollisionListener in src/app: pull-then-dispatch, fixed registration order, zero-copy, one-way (D-11)"
  - "Sandbox: one router, one throttled logging listener, dispatched at onPostStep; per-frame drain-and-discard removed"
affects: [phase-04-rules, phase-05-render-audio]

actuals:
  tokens: 9800
  tasks: 3
  commits: 4
plan_head_before: 25ab8660adb771cb65364eeabdc8fd85a79f0ad8
plan_head_after: 1d6b11dc95e636af42d0085208541bb0be26e1d0

tech-stack:
  added: []
  patterns:
    - "Decide-then-reserve: classify a contact before taking a pooled slot, so non-ball pairs consume nothing"
    - "Sensors on begin-contact, solids on post-solve: each contact is reported by exactly one path"
    - "Bus consumers dispatch at the loop's post-step seam, never the render frame"

key-files:
  created:
    - src/app/collision-router.ts
    - src/app/collision-router.test.ts
    - src/physics/collision-event.test.ts
    - src/physics/sensor-event.test.ts
    - src/sandbox/launch-and-route.test.ts
  modified:
    - src/physics/types.ts
    - src/physics/planck-world.ts
    - src/sim/loop.ts
    - src/sandbox/main.ts

key-decisions:
  - "CollisionEvent drops the order-ambiguous raw pair for ballId + elementKind/elementId; type stays coarse (ball-wall covers every static element, sensors included); ball-ball uses elementKind \"ball\" with the smaller id as ballId"
  - "Sensor events fire on begin-contact only (once per overlap), normalImpulse 0, point = ball body center since sensor manifolds have no points"
  - "Router dispatches at a new FixedStepLoop onPostStep seam (zero latency, one batch per fixed step) rather than the pre-step fallback"
  - "Sandbox demo listener: sensors always log; solids log one line per 30 events; strings built only for logged lines"

patterns-established:
  - "Bus listener contract: no per-event allocation, copy out anything kept, never call back into the world"

requirements-completed: [TBL-01]

coverage:
  - id: D1
    description: "A real ball-vs-bumper-202 contact reaches a registered listener as type ball-wall, elementKind bumper, elementId 202, the dropped ball's id, impulse > 0; a left-inlane release yields ball-flipper on the left mount id; onPostStep count equals steps advanced"
    requirement: TBL-01
    verification:
      - kind: integration
        ref: "src/physics/collision-event.test.ts (typed collision bus on the real table, 3 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "normalizeContact is order-independent: (ball,bumper)=(bumper,ball), (ball,flipper)=(flipper,ball), (wall,flipper) returns false and writes nothing, (ball 3, ball 1) gives ballId 1 / ball / 3"
    verification:
      - kind: unit
        ref: "src/physics/collision-event.test.ts (normalizeContact, 4 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sensors reach the bus: rollover 401 emits exactly one impulse-0 event and does not reverse vy; drain 600 emits once past DRAIN_Y; a ball landing on the plunger produces only impulse > 0 ball-wall events, at most one per step (no begin-contact duplicates)"
    requirement: TBL-01
    verification:
      - kind: integration
        ref: "src/physics/sensor-event.test.ts (4 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Router contract: N*M calls in registration order with the very source records (toBe), late registration appends, empty batch makes no calls, source sees only drainEvents once per dispatch, 5 fixed steps = 5 dispatches over one reused view"
    verification:
      - kind: unit
        ref: "src/app/collision-router.test.ts (5 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Headless sandbox composition: full-charge Space launch climbs out of the chute; routed events carry the launched ball id and spec kinds (chute/wall included); one dispatch per fixed step"
    requirement: TBL-01
    verification:
      - kind: integration
        ref: "src/sandbox/launch-and-route.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Engine isolation and gates intact: only planck-world.ts imports planck; containment.ts unchanged vs 80869ae; constants.ts 0 deleted lines vs 80869ae; soak 3/3"
    verification:
      - kind: other
        ref: "grep -rl 'from \"planck\"' src = 1; git diff --exit-code 80869ae -- src/harness/containment.ts; numstat deleted = 0; npm run soak"
        status: pass
    human_judgment: false
  - id: D7
    description: "Live sandbox console prints kind/id lines for chute, walls, bumpers, slings, flippers, and rollover/lane/drain crossings; console stays legible and frame rate smooth"
    verification: []
    human_judgment: true
    rationale: "Task 3 human-check via npm run dev (console legibility and live feel), collected at end of phase"

duration: 10min
completed: 2026-11-19
status: complete
---

# Phase 3 Plan 06: Typed Collision Event Bus Summary

**Every ball contact, sensors included, now arrives as a normalized `CollisionEvent` (`ballId`, `elementKind`, `elementId` from TABLE_SPEC) and a `CollisionRouter` fans it to listeners once per fixed step at a new `onPostStep` loop seam. The sandbox logs through one demo listener.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-19T22:15:14Z
- **Completed:** 2026-11-19T22:25:11Z
- **Tasks:** 3 (tracer, TDD auto, auto)
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments

- **Event model (D-12):** `CollisionEvent` names the ball side and the element side whichever fixture Planck reports first. `type` stays coarse. Ball-ball uses `elementKind: "ball"`, with the smaller id as `ballId`.
- **Emit path:** `emitContact` is shared by post-solve and begin-contact. It classifies the pair before taking a pooled slot, fills the slot through the exported pure `normalizeContact`, and falls back to the ball's center when there are no manifold points. It allocates nothing per contact.
- **Sensors:** begin-contact emits only when either fixture is a sensor, with impulse 0. Solid contacts stay on post-solve. A mutation that dropped the sensor guard turned the no-duplicates test red (reverted).
- **Loop seam:** `advance(ms, onStep?, onPostStep?)` calls `onPostStep` right after each `world.step()` and its snapshot, exactly `steps` times.
- **Router:** `src/app/collision-router.ts` depends on the world only through a type-only `Pick<PhysicsWorld, "drainEvents">`. It runs event-major nested index loops and passes records by reference.
- **Sandbox:** one router and one listener. Sensor crossings always log. Solid contacts log one line per 30 events, and the string is built only for a line that logs. The per-frame `world.drainEvents()` is gone.

## Task Commits

1. **Task 1 (tracer): typed bus with normalized identity** - `8f3f0b0` (feat)
2. **Task 2 RED: failing sensor tests + router contract** - `3033748` (test)
3. **Task 2 GREEN: begin-contact sensor path** - `6a1e701` (feat)
4. **Task 3: sandbox routing + composition proof** - `1d6b11d` (feat)

**Tracer gate:** interactive run, end-of-phase verification, automated-only `<verify>`. Re-ran it (tsc, eslint, 7/7) green, then expanded.

## TDD Gate Compliance (Task 2)

- **RED** (`3033748`): 3 of 16 tests failed, all sensor assertions (`expected [] to have a length of 1`, and the rollover-crossed check). The cause is the intended one: there is no begin-contact path, so sensors emit nothing. `gsd-tools check tdd-red-evidence` (vitest `tap-flat`) returned `RED_EVIDENCE_OK` for the drain-600 and rollover-401 targets.
- **GREEN** (`6a1e701`): the begin-contact handler. 16/16 pass.
- **REFACTOR:** none needed.
- **Passed at RED by design:** the 5 router cases (the router shipped in Task 1; the plan says to adjust it only if a behavior line exposes a gap, and none did) and the solid-duplicates guard.

## Files Created/Modified

- `src/physics/types.ts` - `CollisionEvent` identity fields, `CollisionPartnerKind`, coarse-type and pooled-record docs
- `src/physics/planck-world.ts` - `ContactIdentity`, `normalizeContact`, `emitContact`, begin-contact sensor handler
- `src/sim/loop.ts` - `onPostStep` parameter
- `src/app/collision-router.ts` - `CollisionRouter`, `CollisionListener`
- `src/app/collision-router.test.ts` - router contract (5)
- `src/physics/collision-event.test.ts` - real-table identity + normalization (7)
- `src/physics/sensor-event.test.ts` - sensor bus proofs (4)
- `src/sandbox/main.ts` - router, demo listener, stable `onPostStep`
- `src/sandbox/launch-and-route.test.ts` - headless composition proof (1)

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

None. The plan ran as written. The tests used the plan's release points unchanged: left inlane (0.55, 4.6), rollover (1.45, 0.55), drain gap (1.45, 5.3).

## Issues Encountered

- The router's real-loop case first placed the ball near the proof box's right flipper pivot. I moved it to rest on the thin wall at (0.5, 1.79) before the RED commit.

## Known Stubs

None. The demo listener is the intentional single consumer D-11 calls for.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- Phase 4 rules and Phase 5 render/audio register listeners on the same router and switch on `elementKind` + `elementId`.
- Still pending is the Task 3 human-check via `npm run dev`, collected at end of phase. Expected: kind/id lines for chute, walls, bumpers, slings and flippers; rollover, lane and drain lines on crossings; a legible console and a smooth frame rate.

## Self-Check: PASSED

- **Files:** all 5 created files are present.
- **Commits:** `8f3f0b0`, `3033748`, `6a1e701` and `1d6b11d` are ancestors of HEAD. `git rev-list --count 25ab866..HEAD` = 4 before this docs commit.
- **Acceptance criteria:**
  - Task 1: `elementKind` appears 4 times in types.ts. The removed raw-pair names appear 0 times in types.ts, 0 in planck-world.ts and 0 files under src. `onPostStep` appears 3 times in loop.ts, and there are 0 planck imports in the router.
  - Task 2: `begin-contact` appears 1 time in planck-world.ts. Every behavior line is a passing case. Soak passes 3/3.
  - Task 3: `world.drainEvents()` appears 0 times in main.ts, `router.dispatch` 1 time and `router.register(` 1 time. `grep -rl 'from "planck"' src` = 1. containment.ts is unchanged vs 80869ae, and constants.ts has 0 deleted lines vs 80869ae.
- **Plan verification:**
  - `npm run typecheck`: exit 0.
  - `npx eslint src`: clean.
  - `npm test`: 23 files and 154 tests passed.
  - `npm run soak`: 3/3 passed in 7.6 s.
  - `vite build`: OK.

---
*Phase: 03-table-plunger-event-bus*
*Completed: 2026-11-19*
