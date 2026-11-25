---
phase: 04-reactive-elements-game-rules
plan: 09
subsystem: physics
tags: [planck, revolute-joint, flipper, fsm, latency, gap-closure]

requires:
  - phase: 02
    provides: motorized revolute flipper joints, FlipperController FSM, raiseSign mirror fix
  - phase: 04
    provides: setEnabled(false) TILT drop path (04-0x), UAT gap G-04-10
provides:
  - setFlipperMotor limit-impulse reset (public RevoluteJoint.enableLimit toggle) on every commanded direction change
  - FlipperState.restLimitAngle (engine-agnostic, static)
  - FSM returning -> resting guard (REST_ANGLE_TOL 0.1, REST_SETTLE_UPDATES 2)
  - adapter-level planck@1.5.0 joint-behavior pin (flipper-response.test.ts)
  - keyboard-path latency, TILT and six-binding quick-tap regression tests
affects: [04-10, flipper feel, renderer, any future PhysicsWorld implementation]

actuals:
  tokens: 5730
  tasks: 2
  commits: 4
plan_head_before: 2cd8dbf91a8edac7dc1338923dc9d462ad9bfb0c
plan_head_after: bd17ba99b266695d9e88a1db38a95e9054df55f2

tech-stack:
  added: []
  patterns:
    - "Engine-specific warm-start handling lives behind the PhysicsWorld seam (setFlipperMotor), never in the FSM"
    - "Rest detection by position + settle, not settle alone"

key-files:
  created:
    - src/physics/flipper-response.test.ts
  modified:
    - src/physics/planck-world.ts
    - src/physics/types.ts
    - src/control/flipper-controller.ts
    - src/control/flipper-controller.test.ts
    - src/sandbox/flipper-e2e.test.ts
    - src/harness/flipper-feel.test.ts

key-decisions:
  - "G-04-10 dead time fixed via public RevoluteJoint.enableLimit(false)/(true) on each commanded sign change; internal impulse fields never written; torque and feel constants unchanged"
  - "FSM enters resting only after 2 consecutive settled updates within 0.1 rad of FlipperState.restLimitAngle; a bat stopping short keeps motor -1"
  - "FLIP-02 launch proof runs on OPEN_PROOF_BOX (PROOF_BOX_SPEC minus wall id 3); secondary floor 1.5x -> 1.3x per user sign-off; VR_RATIO_TOL 0.35 unchanged"

patterns-established:
  - "Direction-change-only joint reset: same-sign repeats (held cradle +1, resting 0) keep the warm start"

requirements-completed: [FLIP-01, GAME-03]

coverage:
  - id: D1
    description: "Released bat starts falling within 2 fixed steps after any hold (10/60/200), on KeyZ, Slash, ArrowLeft, ArrowRight"
    requirement: FLIP-01
    verification:
      - kind: e2e
        ref: "src/sandbox/flipper-e2e.test.ts#flipper response after any hold or rest (G-04-10) release cases"
        status: pass
      - kind: unit
        ref: "src/physics/flipper-response.test.ts#-1 after a N-step +1 hold moves within 2 steps"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pressed bat starts rising within 2 fixed steps after any rest (30/240)"
    requirement: FLIP-01
    verification:
      - kind: e2e
        ref: "src/sandbox/flipper-e2e.test.ts#a press after a N-step rest starts the bat rising within 2 steps"
        status: pass
      - kind: unit
        ref: "src/physics/flipper-response.test.ts#+1 after a 240-step rest (motor 0) moves within 2 steps"
        status: pass
    human_judgment: false
  - id: D3
    description: "TILT (setEnabled(false)) starts a held-up bat falling within 2 fixed steps"
    requirement: GAME-03
    verification:
      - kind: e2e
        ref: "src/sandbox/flipper-e2e.test.ts#TILT (setEnabled(false)) starts a held-up bat falling within 2 steps"
        status: pass
    human_judgment: false
  - id: D4
    description: "No quick tap (3-10 steps, 4 rest lengths, all six bindings) leaves a bat raised; FSM resting only within 0.1 rad of the rest limit at every step"
    requirement: FLIP-01
    verification:
      - kind: e2e
        ref: "src/sandbox/flipper-e2e.test.ts#no quick tap (3-10 steps, any rest, all six bindings) leaves a bat raised"
        status: pass
      - kind: unit
        ref: "src/control/flipper-controller.test.ts#FlipperController enters resting only at the rest limit (G-04-10)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Held cradle stays pinned; all pre-existing gates green (FLIP-01..04, cradle, game e2e, determinism, soak)"
    verification:
      - kind: unit
        ref: "src/physics/flipper-response.test.ts#a 120-step +1 hold stays pinned at the up limit"
        status: pass
      - kind: integration
        ref: "npx vitest run (385 tests, 33 files)"
        status: pass
      - kind: other
        ref: "npm run soak (4 gate files)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Flippers feel instant on press and release after long cradles, and TILT drop has no visible pause"
    requirement: FLIP-01
    verification: []
    human_judgment: true
    rationale: "Core-value feel verdict (UAT test 10 and test 5 note); latencies are machine-proven but 'feels instant' is the user's call per the plan's human-check"

duration: 9min
completed: 2026-11-20
status: complete
---

# Phase 04 Plan 09: Flipper Response Latency and Stuck-Tap Fix Summary

**Flippers now answer press and release in 1 fixed step after any hold or rest: setFlipperMotor clears the warm-started RevoluteJoint limit impulse via the public enableLimit toggle on each direction change (release 16 -> 1 step), and the FSM only enters resting at the bat's real rest limit (48/192 stuck taps -> 0).**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-11-20T19:46:09Z
- **Completed:** 2026-11-20T19:55:05Z
- **Tasks:** 2 (both complete)
- **Files modified:** 7 (1 created)

## Accomplishments

- G-04-10 dead time gone. Release after a 60-step hold now takes 1 step (it was 16). TILT now takes 1 step (it was 16). An adapter-level press after a 240-step rest now takes 1 step (it was 11).
- Stuck-up taps gone. HEAD left a bat raised in 48 of 192 quick taps (holds 5-6 on all six bindings). Now 0 of 192. The FSM guard holds on its own: with the adapter reset temporarily disabled, the sweep still passed with 0 of 192 stuck.
- The FLIP-02 proof was corrected so it measures the physics, not the rig. On OPEN_PROOF_BOX, measured tip 11.478 vs base 7.717 m/s, a 1.487 ratio against a 1.537 contact-radius ratio (3.3% mismatch). peakOmega is 26.8 rad/s.
- Engine-agnostic `FlipperState.restLimitAngle` on the PhysicsWorld contract. FlipperController still imports no engine.

## HEAD vs Fixed Measurements

| Case (TABLE_SPEC unless noted) | HEAD | Fixed |
|---|---|---|
| Release after 10-step hold (e2e, 4 bindings) | 13 steps | 1-2 (pass) |
| Release after 60 / 200-step hold (e2e, 4 bindings) | 16 steps | 1 (measured) |
| TILT drop after 60-step hold (left/right) | 16 steps | 1-2 (pass) |
| Adapter -1 after +1 hold (10 / 60+, both specs, both ids) | 13 / 16 | 1-2 (pass) |
| Adapter +1 after 240-step motor-0 rest (both specs, both ids) | 11 steps | 1-2 (pass) |
| e2e press after 30 / 240-step rest through the FSM | already 1-2 at HEAD (pass) | 1 (measured) |
| Quick-tap sweep, 192 taps | 48 stuck | 0 |
| FLIP-02 on walled PROOF_BOX_SPEC, after reset | n/a | tip 16.35 / base 2.98 (256% mismatch, the reason for the rig fix) |
| FLIP-02 on OPEN_PROOF_BOX | n/a | tip 11.48 / base 7.72, ratio 1.487 vs 1.537 |

## Task Commits

1. **Task 1 (tracer): adapter reset, RED first**
   - `4c382d5` test(04-09): failing response-latency and quick-tap tests (RED)
   - `bc93f54` fix(04-09): clear the warm-started joint limit impulse on direction change, plus the FLIP-02 rig correction (GREEN)
2. **Task 2 (TDD): FSM rest-limit guard**
   - `0d44000` test(04-09): failing FSM rest-limit guard cases (RED)
   - `bd17ba9` feat(04-09): FSM enters resting only at the bat's rest limit (GREEN)

No refactor commits were needed.

## TDD Gate Compliance

- **Task 1 RED:** 31 of 49 new or affected cases failed at HEAD on their latency and stuck-tap assertions, with the numbers in the table above. The 8 e2e press-after-rest cases and the 4 adapter "held cradle stays pinned" cases passed at HEAD. They are intentional regression guards: the press path through the FSM was not slow at HEAD, and the cradle must stay pinned after the fix.
- **Task 2 RED:** `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK`. Target: "a bat that drifts and stops short of rest keeps being driven down (-1, never 0)" (TAP via `--reporter=tap-flat`, 3 of 19 failing). Semantic assessment: the target ran and failed on the planned assertion (`expected 'resting' to be 'returning'`), because HEAD entered resting with motor 0 after the drift settled. The mirrored-drift case and the never-moved tap case also failed on their planned assertions. The never-moved case stayed returning with -1 forever. The "first observation after a release" case passed at HEAD, which the plan expected, because HEAD's `moved` flag already blocked it.
- **GREEN:** every target passes. The suite has 385 tests in 33 files (338 at the start of the phase, the rest new cases only). tsc and eslint are clean. The soak run has 4 of 4 gate files green with no ESCAPE lines.

## Files Created/Modified

- `src/physics/planck-world.ts` - setFlipperMotor now finds the flipper with an indexed loop, so it allocates nothing. A new `lastDirection` per joint (NaN at build) triggers an `enableLimit(false)` then `enableLimit(true)` reset on every sign change. The droop expression is hoisted so it is computed once, and the pool carries `restLimitAngle`.
- `src/physics/types.ts` - adds `FlipperState.restLimitAngle`.
- `src/control/flipper-controller.ts` - adds `REST_ANGLE_TOL` and `REST_SETTLE_UPDATES` and a `restSettled` counter. `returning` no longer consults `moved`. The class doc is corrected: the detector is sign-agnostic since the raiseSign fix.
- `src/physics/flipper-response.test.ts` (new) - adapter-level pin for the planck@1.5.0 joint behavior, on TABLE_SPEC and PROOF_BOX_SPEC for both ids.
- `src/sandbox/flipper-e2e.test.ts` - release, press and TILT latency cases, the six-binding quick-tap sweep with a resting invariant checked on every step, and `restLimitAngleOf` on the rig.
- `src/control/flipper-controller.test.ts` - SpyWorld records carry `restLimitAngle`, plus 4 rest-limit spy cases.
- `src/harness/flipper-feel.test.ts` - adds `OPEN_PROOF_BOX` and the 1.3x floor with the measured numbers. The comments that described the jam-release burst as current behavior are updated.

## Decisions Made

- I used the public-API reset (`enableLimit` toggle) as planned and never wrote a Planck-internal impulse field. The comment-filtered grep confirms 0 matches.
- The torque and every feel constant are unchanged. `src/physics/constants.ts` was not touched.
- The FLIP-02 1.3x floor follows the user sign-off recorded in the plan.

## Deviations from Plan

None. The plan was executed as written. One documentation-only addition: the `VR_RATIO_TOL` doc comment said "measured mismatch ~13%". It now gives the new ~3% measurement and notes where the old figure came from. The constant is unchanged.

## Issues Encountered

- A Bash heredoc that held template-literal backticks failed to parse before writing anything. I switched to the Edit and Write tools, and no partial writes happened.
- Planning recorded "press after 240-step rest: 5 steps" through the FSM. My e2e press cases passed at HEAD, so that dead time only reproduced at adapter level (11 steps). The e2e press cases stay as regression guards.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- G-04-10 is closed by machine proof. The feel check (D6, `npm run dev`: quick taps, long cradle then release, TILT while holding, on all six bindings) is left for end-of-phase UAT.
- Ready for 04-10 (G-04-6).

## Self-Check: PASSED

- All 7 key files exist on disk.
- All 4 task commits (4c382d5, bc93f54, 0d44000, bd17ba9) are ancestors of HEAD.
- Task 1 and Task 2 acceptance greps all pass: enableLimit(false)=1, find(=0, internal-field writes=0, torque 500 present, VR_RATIO_TOL 0.35 present, `base.launch * 1.3` present, OPEN_PROOF_BOX=5, planck importers outside the adapter=0, restLimitAngle in types/world/controller, REST_ANGLE_TOL=4, no engine import or kinematic/velocity write in src/control.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*
