---
phase: 04-reactive-elements-game-rules
plan: 01
subsystem: game-rules
tags: [planck, collision-bus, bumpers, scoring, dom-hud, vitest]

requires:
  - phase: 03-table-plunger-event-bus
    provides: "CollisionRouter at the onPostStep seam, normalized CollisionEvent, PhysicsWorld.applyImpulse, TABLE_SPEC bumpers 200-202, BallFeed record-then-service idiom"
provides:
  - "ReactiveElements: bus listener records bumper hits, service() applies the kick via applyImpulse"
  - "RulesGate { isLive(), award() } and ReactiveWorld slice: the surface later Phase-4 rules build on"
  - "GameSession: exact, non-negative, saturating integer score behind the gate"
  - "HudView/formatScore/TextSink/HudSource: write-on-change DOM score HUD"
  - "src/game/tuning.ts: BUMPER_KICK_SPEED, KICKER_REARM_STEPS, BUMPER_POINTS"
  - "BALL_DENSITY and ballMass(radius) in physics constants"
affects: [04-02, 04-03, 04-04, 04-05, 04-06, 04-07, 04-08, phase-05-renderer, phase-05-audio]

plan_head_before: 8871026ceebd254d5fe404a134bee97596613063
plan_head_after: 74e4592edbf3544b2ac3a1b9e7ca349cdae5a3b3
actuals:
  tokens: 9600
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Record-in-listener, mutate-in-service(): rules listeners only record and award; world mutation happens in service() right after router.dispatch()"
    - "Per-element cooldown counted in fixed steps (service() is the only clock)"
    - "Injected TextSink for DOM writes so UI modules test in Vitest's node environment"

key-files:
  created:
    - src/game/tuning.ts
    - src/game/reactive-elements.ts
    - src/game/game-session.ts
    - src/ui/hud.ts
    - src/game/reactive-table.test.ts
    - src/game/reactive-elements.test.ts
    - src/game/game-session.test.ts
    - src/ui/hud.test.ts
  modified:
    - src/physics/constants.ts
    - index.html
    - src/sandbox/main.ts

key-decisions:
  - "Bumper kick raises the outward normal speed to BUMPER_KICK_SPEED 5.5 m/s via applyImpulse in service(); tangential velocity kept, a faster-leaving ball is not slowed (R1)"
  - "KICKER_REARM_STEPS = 6 fixed steps per bumper collapses the post-solve burst and the TOI duplicate into one trigger; a not-live contact arms nothing"
  - "GameSession.isLive() is always true in 04-01; the 3-ball FSM in 04-05 adds start/game-over behind the same isLive()/award() surface"
  - "Score HUD is a DOM overlay written only on change (textContent, never markup); the canvas HUD stays as the diagnosis readout"

patterns-established:
  - "RulesGate: every Phase-4 rules module reports points through award() and checks isLive() before any kick, award or cooldown"
  - "Rules listeners register on the bus before the ball feed; onPostStep order is dispatch -> rules service -> feed service"

requirements-completed: [ELEM-01, GAME-01]

coverage:
  - id: D1
    description: "A bumper contact on the real table kicks the ball away at the kick speed and scores BUMPER_POINTS exactly once per touch"
    requirement: ELEM-01
    verification:
      - kind: integration
        ref: "src/game/reactive-table.test.ts#the first touch on bumper 202 scores BUMPER_POINTS exactly once, despite the duplicate event"
        status: pass
      - kind: integration
        ref: "src/game/reactive-table.test.ts#one step after the trigger the ball leaves along the outward normal at the kick speed"
        status: pass
      - kind: integration
        ref: "src/game/reactive-table.test.ts#control: without the rules, restitution alone is a weak bounce"
        status: pass
      - kind: integration
        ref: "src/game/reactive-table.test.ts#over 4 s the score equals BUMPER_POINTS times the cooldown-predicted trigger count"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bumper rule contract: burst collapse, cooldown count, kick law, liveness gate, no world access during dispatch, vanished ball, non-bumper kinds, per-element cooldowns"
    requirement: ELEM-01
    verification:
      - kind: unit
        ref: "src/game/reactive-elements.test.ts (10 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GameSession keeps an exact, non-negative, saturating integer score"
    requirement: GAME-01
    verification:
      - kind: unit
        ref: "src/game/game-session.test.ts (4 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Score formatting at the GAME-01 boundary (0, 999, 1,000, 1,234,567, MAX_SAFE_INTEGER) and write-on-change HUD"
    requirement: GAME-01
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts (8 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live sandbox: bumpers visibly pop the ball and the top-left SCORE panel climbs 1,000 per touch, sharp at any window size, not overlapping the plunger meter, smooth frame rate"
    requirement: GAME-01
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak && npm run build"
        status: pass
    human_judgment: true
    rationale: "Perceived pop strength, HUD legibility and placement are visual judgments (Task 3 human-check, harvested at end of phase)"

duration: 10min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 01: Bumpers React and Score Summary

**Bumpers on the real table now kick the ball out at 5.5 m/s along the outward normal and add 1,000 points once per touch. The kick goes bus listener → `service()` → `applyImpulse`, and a write-on-change DOM HUD shows the score with comma grouping.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-20T15:13:29Z
- **Completed:** 2026-11-20T15:23:56Z
- **Tasks:** 3
- **Files modified:** 11 (8 created, 3 modified)

## Accomplishments

- `ReactiveElements`:
  - Builds a fixed bumper kicker array once, plus a Map lookup.
  - Its listener only records the hit and awards points.
  - `service()` applies the queued kick through `applyImpulse`, right after `router.dispatch()`.
  - It allocates nothing in steady state.
- The real-table tracer proves the whole path:
  - The first touch scores exactly 1,000.
  - One step after the trigger, the ball's outward speed is at least 5.25 m/s.
  - The no-rules control bounces at under 2.75 m/s.
  - Over 4 s, the score matches what the cooldown rule predicts from the recorded events.
- The `RulesGate` surface and `GameSession` are in place. The score is an exact integer: invalid points are rejected and the sum saturates at `MAX_SAFE_INTEGER`.
- The DOM score HUD (`#hud-score`) uses en-US grouping and writes only when the score changes. The canvas now has `role="img"` and an `aria-label`. The sandbox `onPostStep` order is dispatch → `reactive.service()` → `feed.service()`.
- `BALL_DENSITY` and `ballMass()` are now the one density source for both the kick math and the KE readout. No existing constant changed.

## Task Commits

1. **Task 1: Tracer, real-table bumper kick and score:** `0b49026` (feat)
2. **Task 2: Bumper rule contract and GameSession (TDD)**
   - RED: `9fcbc53` (test)
   - GREEN: `3ef2d0a` (feat)
3. **Task 3: Sandbox wiring and DOM score HUD:** `74e4592` (feat)

**Plan metadata:** see the final docs commit, `docs(04-01): complete ...`.

## Files Created/Modified

- `src/physics/constants.ts`: appended `BALL_DENSITY = 1` and `ballMass(radius)`.
- `src/game/tuning.ts`: `BUMPER_KICK_SPEED` 5.5, `KICKER_REARM_STEPS` 6, `BUMPER_POINTS` 1000, each with its derivation.
- `src/game/reactive-elements.ts`: `ReactiveElements`, `RulesGate`, `ReactiveWorld`.
- `src/game/game-session.ts`: `GameSession` (`award`, `isLive`, `getScore`).
- `src/ui/hud.ts`: `formatScore`, `HudView`, `TextSink`, `HudSource`.
- `index.html`: `#hud` overlay, `.hud`/`.hud-label`/`.hud-score` styles (no `#ef476f`), canvas `role="img"` and `aria-label`.
- `src/sandbox/main.ts`:
  - Builds the session and the reactive elements, and calls `reactive.service()` in `onPostStep`.
  - Builds `hudView` through `requireTextSink`.
  - The KE readout uses `ballMass`, and the private density duplicate is removed.
  - Corrected the IN-03 idle comment (the bats rest drooped, not level) and updated the file header.
- Tests: `src/game/reactive-table.test.ts`, `src/game/reactive-elements.test.ts`, `src/game/game-session.test.ts`, `src/ui/hud.test.ts`.

## Decisions Made

I followed the plan's R1/R3/R4/R5 defaults (see `key-decisions`). On top of those, I registered the rules listener before the ball feed on the bus. That way a kick is queued and applied before a drained ball is removed in the same step.

## TDD Gate Compliance

- **RED** (`9fcbc53`):
  - Command: `npx vitest run src/game/game-session.test.ts --reporter=tap-flat`, exit 1. The classifier returned `RED_EVIDENCE_OK` (`target_test_failed`).
  - Target: `award(1000) twice gives 2000`. It expected 2000 and got 0.
  - Semantic assessment: the target ran and failed on its planned assertion. All 4 session tests failed on assertions; none failed on load, syntax or fixture errors.
  - To get there, I committed a surface-only `GameSession` skeleton with the tests (see Deviation 2).
- **GREEN** (`3ef2d0a`): all 18 `src/game` tests pass.
- **REFACTOR:** none needed.
- `reactive-elements.test.ts` passed on its first run, which is expected: the Task-1 tracer had already built the module. To show the tests can fail, I ran four mutations and each one failed exactly one test:
  - removing the cooldown;
  - removing the liveness check;
  - removing the "only if `vn < target`" guard;
  - removing the `normalImpulse > 0` filter.

  The source was restored after each mutation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The tracer's duplicate-event check was moved to the step after the trigger**
- **Found during:** Task 1
- **Issue:** 04-RESEARCH says the zero-impulse TOI duplicate arrives in the same step as the first positive bumper event. A probe on the current table showed it arrives one step later (step 62 at 0.3666, then step 63 at 0.0000). An assertion of "two events in the trigger step" was therefore wrong.
- **Fix:** The test now checks for exactly one award at the end of the trigger step. It then confirms the zero-impulse duplicate is delivered on the next step and that the score is still exactly `BUMPER_POINTS`.
- **Files modified:** `src/game/reactive-table.test.ts`
- **Verification:** 4/4 tracer cases pass.
- **Committed in:** `0b49026`

**2. [Rule 3 - Blocking] Committed a surface-only `GameSession` skeleton with the RED tests**
- **Found during:** Task 2
- **Issue:** The plan said to run the tests while the module did not exist. Under the canonical TDD rule (`tdd.md` #3770), a module-load failure counts as `INVALID_RED` and cannot authorize GREEN.
- **Fix:** I committed a skeleton with the same surface (`isLive()` returns false, `award()` does nothing, `getScore()` returns 0) together with the tests. RED then failed on assertions, and the classifier returned `RED_EVIDENCE_OK`.
- **Files modified:** `src/game/game-session.ts`
- **Committed in:** `9fcbc53`, implemented in `3ef2d0a`

---

**Total deviations:** 2 auto-fixed (1 test-correctness, 1 TDD-gate blocker).
**Impact on plan:** Neither changes scope. Both keep the proofs honest.

## Issues Encountered

None.

## Verification

- `npx tsc --noEmit`: 0 errors.
- `npx eslint src`: clean.
- `npx vitest run`: 28 files, 194 tests passed.
- `npm run soak`: 3 gate files, 3/3 passed, no `ESCAPE[` lines.
- `npm run build`: bundles cleanly.
- Only `src/physics/planck-world.ts` imports `planck`.
- `git diff 011c060 -- src/physics/constants.ts` removes no `export const` line.
- `innerHTML` appears 0 times in `src`.

## Pending Human Check (end of phase)

Task 3 human-check:
1. Run `npm run dev` and launch several balls with Space.
2. Each bumper touch should visibly pop the ball away harder than it arrived.
3. The SCORE panel at the top left should climb by 1,000 per touch, with comma grouping.
4. The panel should stay sharp at any window size and never overlap the plunger meter, and the frame rate should stay smooth.

## User Setup Required

None.

## Next Phase Readiness

- Later Phase-4 plans can use `RulesGate`, `ReactiveElements.service()` and `GameSession`. That covers slings and sensors (04-02/03), the adapter density switch to `ballMass` (04-04), the 3-ball FSM behind `isLive()` (04-05), and tilt.
- Open review item, multiball (v2): if two balls touch the same bumper in one step, the later ball replaces the earlier one's queued kick.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*

## Self-Check: PASSED

- All 8 created files exist on disk.
- Commits `0b49026`, `9fcbc53`, `3ef2d0a` and `74e4592` are all ancestors of HEAD.
