---
phase: 04-reactive-elements-game-rules
plan: 03
subsystem: game-rules
tags: [planck, slingshot, rollover, inlane, scoring, canvas2d, vitest]

requires:
  - phase: 04-01
    provides: ReactiveElements record-then-service bumper rule, RulesGate, tuning.ts, ballMass
provides:
  - Slingshot kickers built from deriveKickFace (longest loop segment, normal away from the centroid)
  - Rollover and inlane sensor rules with SENSOR_REARM_STEPS, rollover lights and a bank bonus
  - ReactiveElements.isLit(elementId) and resetLights() (04-05 calls resetLights on a new game)
  - LightState input to DebugRenderer.draw; lit rollovers drawn solid and bright
  - Seeded 12-drop dead-flipper energy-bound proof (all drain, max speed <= 15 m/s, kicks > 0)
affects: [04-05 game FSM (resetLights on start), 04-08 phase UAT, phase 05 renderer, phase 06 polish (glow)]

actuals:
  tokens: 10266
  tasks: 3
  commits: 4
plan_head_before: 318424443c94e51139ce598b48651e748a20b129
plan_head_after: 53f8257a333c1ff36f6cbf1714e01aa98f50702e

tech-stack:
  added: []
  patterns:
    - "One kicker array for bumpers and slings: kind, fixed face normal or center-derived normal, target speed, points"
    - "Sensor rules (rollover/lane) built once from getElements() in an id Map; lights are rule state, renderer only reads them"
    - "Test gate attributes each award to the bus event being dispatched (rules listener registered before the recorder)"

key-files:
  created: []
  modified:
    - src/game/tuning.ts
    - src/game/reactive-elements.ts
    - src/game/reactive-elements.test.ts
    - src/game/reactive-table.test.ts
    - src/sandbox/debug-draw.ts
    - src/sandbox/main.ts

key-decisions:
  - "Slingshot kick face = longest segment of the resolved loop, normal oriented away from the vertex centroid; trigger needs normalImpulse >= 0.02 and contact within 0.05 m of the clamped face segment; kick raises vn to 4.5 m/s (R2)"
  - "Rollovers and inlanes re-arm after SENSOR_REARM_STEPS 30; rollover 1,000 and lights, all three lit pays 10,000 and clears them; inlane 2,000, never lit (R3/R4/R12)"
  - "The 04-01 4 s bumper replay now attributes each award to its triggering event, because the dropped ball also reaches an inlane once lanes score"

patterns-established:
  - "Kick law shared by every kicker: raise the outward normal speed to the target, keep the tangential velocity, never slow a ball"
  - "Energy-bound proof: seeded clearance-filtered drops, dead flippers, counting world wrapper so the proof cannot pass vacuously"

requirements-completed: [ELEM-01, ELEM-02, ELEM-03]

coverage:
  - id: D1
    description: "Both slingshots kick a face hit out along the derived, mirror-correct normal and score 500 on the real table"
    requirement: ELEM-02
    verification:
      - kind: integration
        ref: "src/game/reactive-table.test.ts#a strike on sling 300 scores SLING_POINTS and kicks out along the face normal"
        status: pass
      - kind: integration
        ref: "src/game/reactive-table.test.ts#a strike on sling 301 (the mirror) scores SLING_POINTS and kicks out to the left"
        status: pass
      - kind: unit
        ref: "src/game/reactive-elements.test.ts#slingshot kick face (ELEM-02 geometry)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Passive sling faces and rolling contacts never kick or score"
    requirement: ELEM-02
    verification:
      - kind: unit
        ref: "src/game/reactive-elements.test.ts#ReactiveElements slingshot filter (ELEM-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Rollovers and inlanes score once per pass with a 30-step re-arm; the top rollovers light, pay a 10,000 bank and reset; nothing scores or lights while not live; resetLights clears all"
    requirement: ELEM-03
    verification:
      - kind: unit
        ref: "src/game/reactive-elements.test.ts#ReactiveElements rollovers and inlanes (ELEM-03)"
        status: pass
      - kind: integration
        ref: "src/game/reactive-table.test.ts#a ball falling through rollover 401 scores ROLLOVER_POINTS on the delivering step and lights it"
        status: pass
    human_judgment: false
  - id: D4
    description: "With dead flippers and every kick live, 12 seeded drops all drain within 60 s, max speed <= 15 m/s, and kicks fire"
    requirement: ELEM-01
    verification:
      - kind: integration
        ref: "src/game/reactive-table.test.ts#12 seeded dead-flipper drops all drain within 60 s, never exceed 15 m/s, and kicks fire"
        status: pass
    human_judgment: false
  - id: D5
    description: "Lit rollovers drawn solid and bright in the live sandbox; kick liveliness feels right"
    requirement: ELEM-03
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npx eslint src (renderer compiles and lints; drawing not asserted)"
        status: pass
    human_judgment: true
    rationale: "Light readability and kick liveliness (assumption A5) are visual and by-feel judgments; the Task 3 human-check is harvested for end-of-phase UAT."

duration: 14min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 03: Slingshots, Rollovers and Inlanes Summary

**Slingshots kick off their rubber face along a normal derived from the resolved geometry, top rollovers and inlanes score as the ball passes (rollovers light and pay a 10,000 bank bonus), the sandbox draws lit lanes, and a seeded dead-flipper proof shows the added energy stays bounded (12/12 drain, peak 6.74 m/s).**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-20T15:34:48Z
- **Completed:** 2026-11-20T15:48:51Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `deriveKickFace(el)` picks the longest segment of each slingshot loop and orients its normal away from the vertex centroid. The left sling gets (0.9487, -0.3162) and its mirror (-0.9487, -0.3162). Nothing is hard-coded.
- One kicker array now holds bumpers and slings. A sling fires only when `normalImpulse >= 0.02` and the contact is within 0.05 m of the clamped face segment. It awards 500 and raises vn to 4.5 m/s in `service()`.
- Rollover and inlane sensor rules re-arm after 30 steps. A rollover scores 1,000 and lights; when all three are lit the bank pays 10,000 and the lights clear. An inlane scores 2,000 and never lights. `isLit()` and `resetLights()` are exposed.
- The renderer takes an optional `LightState`, and `main.ts` passes `reactive`. A lit rollover is drawn solid in `#d9ff66` at width 6.
- Energy bound: 12 seeded drops (mulberry32 0x0403) with dead flippers all drain within 60 s. Peak speed was 6.74 m/s and 12 kicks fired. As a mutation check, 20 m/s kicks turn the case red at 26.6 m/s.

## Task Commits

1. **Task 1: Tracer, both slingshots kick and score on the real table** - `0b75628` (feat)
2. **Task 2: Rollovers/inlanes score, lights and bank, sling filter pinned** - `9c16ec3` (test, RED), `1fe9110` (feat, GREEN)
3. **Task 3: Lit rollovers in the sandbox and the seeded energy-bound proof** - `53f8257` (feat)

## TDD (Task 2)

- **RED:** `9c16ec3` added spy cases (sling filter, rollover re-arm, bank, inlane, not-live, resetLights, drain) and a real-table rollover-401 crossing. Evidence: `NO_COLOR=1 npx vitest run src/game/reactive-table.test.ts --reporter=tap-flat`, exit 1. The classifier returned `RED_EVIDENCE_OK` for target "rollover rule on the real table (ELEM-03) > a ball falling through rollover 401 ...".
  - **Semantic assessment:** the target executed and the ball did cross rollover 401 (`found` passed). The test then failed on the score-delta assertion (actual 0) because no rollover rule existed. The expected value showed `undefined` only because `ROLLOVER_POINTS` was not defined yet. That is the planned behavior missing, not a load or fixture fault.
  - A first full-suite TAP capture was rejected as `invalid_record`. Vitest's tap-flat output printed a multi-line array diff without indentation. The capture was rerun on the single real-table file.
  - The sling-filter and kick-face spy cases pass in RED by design: they pin the Task 1 behavior.
- **GREEN:** `1fe9110` added the sensor rules and the tuning block. All 34 `src/game` cases pass.
- **REFACTOR:** none needed.

## Files Created/Modified

- `src/game/tuning.ts`: the sling block (SLING_KICK_SPEED, SLING_MIN_IMPULSE, SLING_FACE_TOL, SLING_POINTS) and the sensor block (SENSOR_REARM_STEPS, ROLLOVER_POINTS, ROLLOVER_BANK_BONUS, INLANE_POINTS).
- `src/game/reactive-elements.ts`: `KickFace`, `deriveKickFace`, the generalized kicker, sensor rules, `isLit`, `resetLights`.
- `src/game/reactive-elements.test.ts`: the spy world now takes a spec. Adds kick-face geometry, the sling filter, and the rollover/inlane/bank/not-live/reset/drain cases.
- `src/game/reactive-table.test.ts`: sling strike cases for 300/301, the rollover-401 crossing, the energy-bound proof, and award attribution in the gate.
- `src/sandbox/debug-draw.ts`: `LightState`, `COL_ROLLOVER_LIT`, `LIT_ROLLOVER_WIDTH`, and the `draw(..., lights?)` lit-rollover branch.
- `src/sandbox/main.ts`: `renderer.draw(..., plunger.getCharge(), reactive)`.

## Decisions Made

- The face test measures distance to the clamped segment, not the infinite line. A corner hit within 0.05 m of the face end still kicks (EDGE-ELEM-02, left for review by feel).
- The bank check loops over the rollover rules only, so it needs no hard-coded ids. The lights persist across balls; 04-05 calls `resetLights()` on game start.
- The lit width is a named module const (`LIT_ROLLOVER_WIDTH = 6`) rather than a bare literal, in line with the color consts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 04-01 bumper replay assumed bumpers were the only scorers**
- **Found during:** Task 2 (GREEN)
- **Issue:** "over 4 s the score equals BUMPER_POINTS times the cooldown-predicted trigger count" asserted that the total score was bumper-only. Once lanes scored, the dropped ball also crossed an inlane (+2,000), so the test read 10,000 against 8,000.
- **Fix:** `SumGate` records each award with the index of the bus event being dispatched. That works because the rules listener registers before the recorder. The test now sums only the awards attributed to bumper events, against the same cooldown replay. The bumper accounting stays exact: 8,000, as before.
- **Files modified:** src/game/reactive-table.test.ts
- **Verification:** all `src/game` cases pass; the bumper score matches the replay.
- **Committed in:** `1fe9110`

**2. [Rule 1 - Test bug] Kick-face endpoint order**
- **Found during:** Task 2 (RED)
- **Issue:** the geometry spy case asserted the endpoints in path order, but the loop closes the hypotenuse as (1.16, 5.1) to (0.86, 4.2).
- **Fix:** compare the endpoint set without regard to order. The behavior asks only for "the hypotenuse".
- **Committed in:** `9c16ec3`

---

**Total deviations:** 2 auto-fixed (both Rule 1, test-side)
**Impact on plan:** none on production behavior; no scope creep.

## Issues Encountered

- The Bash tool rejected heredocs that contained an apostrophe, so multi-line edits were scripted through scratchpad Python files instead.

## Known Stubs

None.

## Threat Flags

None. No new network, auth, file or schema surface. T-04-06/07/08 are mitigated as planned (target-speed law plus cooldowns plus the seeded bound; impulse and face filter; begin-contact plus the re-arm).

## User Setup Required

None.

## Next Phase Readiness

- 04-05 can call `reactive.resetLights()` on game start. `GameSession.isLive()` already gates every new rule.
- Task 3 human-check, harvested for end-of-phase UAT: in `npm run dev`, confirm that the slings snap the ball out, the inlane side never kicks, lit lanes are readable, and the 10,000 bank works.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*

## Self-Check: PASSED

- All 6 modified files are present on disk.
- Commits 0b75628, 9c16ec3, 1fe9110 and 53f8257 are all ancestors of HEAD.
- `npx tsc --noEmit`, `npx eslint src` and `npx vitest run` exit 0 (28 files, 228 tests).
- Exactly one engine import (`src/physics/planck-world.ts`), and no element id or normal is hard-coded in reactive-elements.ts.
