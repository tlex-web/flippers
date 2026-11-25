---
phase: 06-juice-polish
plan: 01
subsystem: game-rules
tags: [skill-shot, rule-hooks, game-session, plunger, determinism, vitest]

requires:
  - phase: 04-reactive-table-game-rules
    provides: GameSession FSM, ReactiveElements record-then-service rules, TiltMeter pattern
  - phase: 03-table-plunger-event-bus
    provides: PlungerController phase and rest gate, collision bus, PLUNGER_ZONE
provides:
  - SkillShot pure step-driven rule (rotate, freeze, fall-back reopen, resolve, value ladder)
  - RuleHooks seam out of ReactiveElements (onSwitch after award, before feedback)
  - GameSessionOptions.plunger and GameSession skill-shot getters (presentation counters)
  - isRestingInZone shared rest test exported from plunger-controller
  - Live wiring in main.ts (session is gate and rule hooks)
affects: [06-03 lamps (lit lane), 06-04 sting and status line, 06-14 determinism parity, bonus counters (D-11 via onSwitch)]

actuals:
  tokens: 14100
  tasks: 3
  commits: 5
plan_head_before: fdca68c84dbf7eb0b8e1e09445cdf47882e9d2da
plan_head_after: d00976fb4b21ced2765602fa5c64a04750520821

tech-stack:
  added: []
  patterns:
    - "Rule hooks: optional fifth ReactiveElements argument with a frozen no-op default; rules run before presentation feedback"
    - "Options bag for optional GameSession collaborators (frozen always-idle plunger default)"
    - "Pre-impulse snapshot guard: a rest test is ignored on the step the plunger leaves charging"

key-files:
  created:
    - src/game/skill-shot.ts
    - src/game/skill-shot.test.ts
    - src/sandbox/skill-shot-e2e.test.ts
  modified:
    - src/game/tuning.ts
    - src/game/reactive-elements.ts
    - src/game/reactive-elements.test.ts
    - src/game/game-session.ts
    - src/control/plunger-controller.ts
    - src/sandbox/main.ts

key-decisions:
  - "Skill-shot rest test is ignored on the plunger release step: the ball snapshot predates the launch impulse, and counting it reopened the rotation under a leaving ball and broke the D-05 anchor"
  - "isRestingInZone takes the PlungerZone interface rather than typeof PLUNGER_ZONE so the controller's injected zone delegates to it unchanged"
  - "GameSession.onSwitch takes (kind, elementId) only; the bank flag is unused by the skill shot and will be added when the bonus counters need it"

patterns-established:
  - "RuleHooks.onSwitch(kind, id, bank): every registered scoring switch, same gates as ReactiveFeedback, after the award, before feedback; must not touch the world"
  - "Real-table rule e2e: makeGame mirror of main.ts plus preStep(stepIndex) key script for 60/120/144 Hz parity"

requirements-completed: [PLSH-05]

coverage:
  - id: D1
    description: "D-05 anchor: N=62 (0.775) with 401 lit hits rollover 401 first and awards ROLLOVER_POINTS + 5000 on that step; 400 lit awards nothing; a full plunge never awards"
    requirement: PLSH-05
    verification:
      - kind: e2e
        ref: "src/sandbox/skill-shot-e2e.test.ts#D-05 anchor: N=62 with 401 lit hits rollover 401 first and awards the skill shot"
        status: pass
      - kind: e2e
        ref: "src/sandbox/skill-shot-e2e.test.ts#the same N=62 shot with 400 lit hits 401 and awards nothing"
        status: pass
      - kind: e2e
        ref: "src/sandbox/skill-shot-e2e.test.ts#a full plunge is never a skill shot"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cadence independence: the anchor gives identical score, count, ball number and ball state at 60/120/144 Hz"
    requirement: PLSH-05
    verification:
      - kind: e2e
        ref: "src/sandbox/skill-shot-e2e.test.ts#the anchor gives the same score, count, ball and ball state at 60, 120 and 144 Hz"
        status: pass
    human_judgment: false
  - id: D3
    description: "Rotation, freeze, fall-back reopen, value ladder (5k..25k cap), disarm and reset rules; shared isRestingInZone threshold"
    requirement: PLSH-05
    verification:
      - kind: unit
        ref: "src/game/skill-shot.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Arming on the real table: weak N=40 plunge falls back and reopens, N=62 relaunch with 401 lit awards 5000; release step stays frozen; tilt before first switch awards nothing"
    requirement: PLSH-05
    verification:
      - kind: e2e
        ref: "src/sandbox/skill-shot-e2e.test.ts#skill shot arming on the real table (D-03)"
        status: pass
    human_judgment: false
  - id: D5
    description: "RuleHooks onSwitch contract: award -> switch -> feedback order, rejected contacts never reach the hook, no-hooks behavior unchanged"
    requirement: PLSH-05
    verification:
      - kind: unit
        ref: "src/game/reactive-elements.test.ts#ReactiveElements rule hooks: the onSwitch contract (06-01, PLSH-05)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Skill shot runs in the live browser game (main.ts wiring); the lit lane is not drawn until 06-03, so the feel of the 3-4 step charge bands is a UAT judgment (D-02)"
    requirement: PLSH-05
    verification:
      - kind: other
        ref: "npm run build (tsc --noEmit && vite build)"
        status: pass
    human_judgment: true
    rationale: "Whether the 25-33 ms charge bands feel like skill rather than luck is a by-feel UAT call (D-02); the lane is invisible until the 06-03 lamps"

duration: 13min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 01: Skill Shot Summary

**Rotating lit-lane skill shot (400/401/402 every 72 steps, frozen on the Space press) resolved by the first scoring switch through a new RuleHooks seam, proven on the real table by the D-05 anchor (N=62 -> rollover 401 -> +5,000) at 60/120/144 Hz.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-22T19:28:57Z
- **Completed:** 2026-11-22T19:41:26Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- `SkillShot` pure rule: arm on every serve, rotate on the fixed step, freeze while charging, reopen from the frozen lane after a weak plunge falls back, first switch decides, 5,000 + 5,000 per shot capped at 25,000, reset on a new game.
- `RuleHooks` seam: `ReactiveElements` reports every registered switch to `onSwitch(kind, id, bank)` after the award and before the feedback call. With no hooks it scores exactly as before.
- `GameSession` composes the rule (serveBall arms it, tilt and game over disarm it, onSwitch awards through `award()`), reads the plunger through `GameSessionOptions.plunger`, and exposes read-only presentation getters for 06-03/06-04.
- Live: `main.ts` passes `{ plunger }` and uses the session as the rule hooks.

## Task Commits

1. **Task 1: Tracer, D-05 anchor on the real table** - `f575982` (feat)
2. **Task 2: Fall-back reopen and rule edges** - `a7e9a6c` (test, RED), `59efd54` (feat, GREEN)
3. **Task 3: Live wiring and onSwitch contract** - `192d3fa` (test), `d00976f` (feat)

## Files Created/Modified
- `src/game/skill-shot.ts` - SkillShot rule and SkillPhase
- `src/game/skill-shot.test.ts` - unit cases for every rule edge and isRestingInZone
- `src/sandbox/skill-shot-e2e.test.ts` - real-table anchor, misses, arming, tilt, cadence parity
- `src/game/tuning.ts` - SKILL_SHOT_* constants (D-01/D-04)
- `src/game/reactive-elements.ts` - SwitchKind, RuleHooks, NO_HOOKS, fifth constructor argument, three onSwitch call sites
- `src/game/reactive-elements.test.ts` - onSwitch contract cases
- `src/game/game-session.ts` - SessionPlunger, GameSessionOptions, serveBall, onSwitch, skill getters, release-step rest guard
- `src/control/plunger-controller.ts` - exported isRestingInZone and PLUNGER_REST_SPEED_EPS; private rest test delegates
- `src/sandbox/main.ts` - `{ plunger }` option and session as rule hooks

## Decisions Made
- The skill shot's rest test is ignored on the step the plunger leaves charging (see deviation 1).
- `isRestingInZone(ball, zone: PlungerZone)`: takes the interface, not `typeof PLUNGER_ZONE`, so the controller's injected zone delegates to it unchanged.
- `GameSession.onSwitch(kind, elementId)` omits the unused `bank` parameter (structurally valid `RuleHooks`); add it when the bonus counters need it.
- Rotation starts at 400 on every arm; a fall-back resumes from the frozen lane with the 72-step counter restarted (plan discretion, research A6).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The fall-back reopen fired on the release step and broke the D-05 anchor**
- **Found during:** Task 2 (GREEN)
- **Issue:** World ball snapshots refresh only in `world.step()`. On the release step `tick()` sees the plunger idle and the pre-impulse snapshot (ball at rest), so the planned "idle and resting reopens" rule reopened the rotation under a ball that was leaving. With the naive rule the D-05 anchor, the cadence case and the weak-plunge case all failed (the lane rotated away before the ball reached 401).
- **Fix:** `GameSession.tick()` counts the rest test only when the plunger was already idle on the previous step (`prevPlungerPhase`). `SkillShot`'s unit contract stays exactly as planned. A new e2e case pins it: the phase stays frozen on 401 from the release step to the first switch.
- **Files modified:** src/game/game-session.ts, src/sandbox/skill-shot-e2e.test.ts
- **Verification:** naive version run first and confirmed failing (4 e2e failures), guarded version passes all.
- **Committed in:** 59efd54 (guard), a7e9a6c (test)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required for the anchor to hold. No scope creep.

## TDD Gate Compliance

- **Task 2:** RED `a7e9a6c` -> GREEN `59efd54`. RED evidence: `npx vitest run src/game/skill-shot.test.ts --reporter=tap-flat`, exit 1, target "frozen then idle-and-resting reopens with the same lane; the next change comes 72 updates later" failed with expected "rotating", actual "frozen". The classifier returned `RED_EVIDENCE_OK`. Semantic check: the target ran and failed on its planned assertion because the frozen branch had no reopen yet. It was not a load or import failure. The isRestingInZone cases also failed because the export did not exist yet.
- **Task 3:** no valid RED. The onSwitch contract tests (`192d3fa`) passed on first run because the plan's Task 1 tracer had already built the hook. This is unexpected GREEN by plan design, not a missing implementation. To show the tests are not vacuous, a mutation check removed the kicker `onSwitch` call: 3 tests failed, then the file was restored. The Task 3 feature commit (`d00976f`) is main.ts wiring, which has no unit seam. It is covered by `tsc` and the grep acceptance criteria.

## Issues Encountered
- Prettier `--write` on main.ts also reflowed one pre-existing, unrelated line (the `tr.resize(computeView(...))` call). It was restored by hand to keep the diff in scope.

## Known Stubs
None. The lit lane is not drawn yet. That is planned for 06-03 (lamps) and 06-04 (sting and status line), not a stub in this plan.

## User Setup Required
None. No external service configuration required.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (54 files, 924 tests) and `npm run build` all pass.
- Only `src/physics/planck-world.ts` imports the engine.
- `game.determinism.test.ts` and `presentation.determinism.test.ts` pass unchanged.

## Next Phase Readiness
- 06-03 can draw the lit lane from `getSkillLitLane()` / `getSkillPhase()`. 06-04 can diff `getSkillShotCount()` / `getLastSkillValue()` / `getLastSkillStep()` / `getLastSkillLane()` for the sting.
- 06-14 should give `game.determinism.test.ts` the `{ plunger }` option and the session hooks. Until then `skill-shot-e2e` case (d) is the cadence proof.
- D-02 (lane-guide retune) is still deferred pending UAT feel.

## Self-Check: PASSED
- All 9 key files found on disk. Commits f575982, a7e9a6c, 59efd54, 192d3fa and d00976f are all ancestors of HEAD, and evaluation-scope resolves the plan's commits.

---
*Phase: 06-juice-polish*
*Completed: 2026-11-22*
