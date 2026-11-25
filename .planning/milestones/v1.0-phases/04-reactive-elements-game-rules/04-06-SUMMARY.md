---
phase: 04-reactive-elements-game-rules
plan: 06
subsystem: game-rules
tags: [nudge, tilt, game-session, input, planck-e2e, vitest, tdd]

requires:
  - phase: 04-05
    provides: "GameSession 3-ball FSM, GameInput start latch, main.ts composition mirrored by game-e2e makeGame"
  - phase: 03-05
    provides: "PhysicsWorld.applyImpulse (velocity-only, between steps, rejects non-finite / unknown id)"
provides:
  - "tuning.ts: NudgeDir, NUDGE_IMPULSE, NUDGE_COOLDOWN_STEPS, NUDGE_DIRS, TILT_NUDGE_COST, TILT_DECAY_PER_S, TILT_WARNING_LEVEL, TILT_LEVEL, WARNING_FLASH_STEPS"
  - "TiltMeter (addNudge -> ok | warning | tilt, update, reset, getLevel) and NudgeOutcome"
  - "GameSession: GameState \"tilted\", onNudge(dir), tick(), isWarning(), getTiltLevel(); GameSessionWorld widened with getBalls and applyImpulse"
  - "GameInput: GameEdges.nudgeLeft / nudgeRight / nudgeUp on KeyX / Period / ArrowUp"
  - "main.ts: nudge edges routed to session.onNudge(dir), then session.tick(), once per fixed step"
affects: [04-07 HUD (reads getState() tilted and isWarning()), 04-08 flipper setEnabled on tilt and the determinism replay]

plan_head_before: 9df7e3b7b35b202180c9209b56b6c5035b46edbd
plan_head_after: 6c426dfaac343e85db7ba61a25b234fb0f300759
actuals:
  tokens: 8869
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Step-counted session clock: tick() once per fixed step drives cooldowns, meter decay and the warning window; no wall clock"
    - "Twin-world e2e: two lockstep real-table games, one input differs, compare a free ball to isolate one effect"
    - "Input latch as a code -> edge map with one reused view, so adding a bound key is one map entry"

key-files:
  created:
    - src/game/tilt-meter.ts
    - src/game/tilt-meter.test.ts
  modified:
    - src/game/tuning.ts
    - src/game/game-session.ts
    - src/game/game-session.test.ts
    - src/input/game-input.ts
    - src/input/game-input.test.ts
    - src/sandbox/main.ts
    - src/sandbox/game-e2e.test.ts

key-decisions:
  - "Nudge is velocity-only through applyImpulse to every ball from getBalls(); accepted only while playing and >= NUDGE_COOLDOWN_STEPS (30) steps after the last; X +x, Period -x, ArrowUp -y (A2)"
  - "TiltMeter is pure and step-driven (cost 1, decay 0.5/s per fixed step, rising-edge warning at >= 2, tilt at >= 3); an optional config exists only so a test can reach a nudge at or above the warning level without tilting"
  - "Tilt kills the ball via isLive() === playing; every serve and onStart clear the meter and the WARNING window; a tilted drain serves the next ball playing and the last ball still ends the game with the score kept"
  - "GameSession.getTiltLevel() added as a read-only accessor so the tilted-nudge-does-not-move-the-meter case is observable"

patterns-established:
  - "game-e2e makeGame() keeps mirroring main.ts onFixedStep exactly, now including the nudge edges and session.tick()"
  - "Twin velocity checks must account for BALL_LINEAR_DAMPING (v *= 1 / (1 + dt * k) per step)"

requirements-completed: [GAME-03, GAME-02]

coverage:
  - id: D1
    description: "On the real table, KeyX changes a free ball's velocity by NUDGE_IMPULSE / m along +x (within 3%) and its position only by the integrated change (<= 1.05 * |dv| * dt), touching nothing"
    requirement: GAME-03
    verification:
      - kind: integration
        ref: "src/sandbox/game-e2e.test.ts#KeyX changes the free ball velocity by NUDGE_IMPULSE / m along +x, and its position only by the integrated change"
        status: pass
    human_judgment: false
  - id: D2
    description: "Nudge cooldown on the real table: edges at steps 10 and 29 after an accepted nudge leave only damping decay; one at step 30 adds another impulse; before Enter a nudge leaves the ball bit-identical to its twin"
    requirement: GAME-03
    verification:
      - kind: integration
        ref: "src/sandbox/game-e2e.test.ts#a second nudge inside NUDGE_COOLDOWN_STEPS does nothing; one at the cooldown adds another impulse"
        status: pass
      - kind: integration
        ref: "src/sandbox/game-e2e.test.ts#before Enter (attract), KeyX leaves the free ball bit-identical to its un-nudged twin"
        status: pass
    human_judgment: false
  - id: D3
    description: "TiltMeter worked numbers and edges: 1.875, 2.75 warning, 3.625 tilt; inclusive 2.0 / 3.0 boundaries; 240-step spacing never warns; floor at 0; reset re-arms; warning is a rising edge"
    requirement: GAME-03
    verification:
      - kind: unit
        ref: "src/game/tilt-meter.test.ts#TiltMeter (GAME-03, R10) (7 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Session tilt: direction table to every ball, nothing in game-over, WARNING for exactly WARNING_FLASH_STEPS, 4th rapid nudge tilts (not live, awards ignored), tilted nudge inert, tilt costs only the ball, last-ball tilt ends the game with score kept, onStart resets the meter"
    requirement: GAME-03
    verification:
      - kind: unit
        ref: "src/game/game-session.test.ts#GameSession nudge and tilt (GAME-03, R9-R11) (10 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Nudge keys latch one edge per genuine press and never preventDefault or latch a flipper key or Space"
    requirement: GAME-03
    verification:
      - kind: unit
        ref: "src/input/game-input.test.ts#GameInput: nudge latch (R9) (21 cases)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Nudge size, direction and tilt fairness feel right in play (assumptions A2, A3, A4)"
    requirement: GAME-03
    verification: []
    human_judgment: true
    rationale: "Feel judgment; the plan defers it to the 04-07 human check, where WARNING and TILT first become visible on the HUD."

duration: 18min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 06: Nudge and Tilt Summary

**KeyX, Period and ArrowUp now nudge every ball through `applyImpulse` (velocity only, with a 30-step cooldown). Each accepted nudge feeds a step-driven `TiltMeter`: the third rapid nudge opens a 1 s WARNING window, and the fourth tilts the ball dead until it drains. The tilt costs only that ball; the score and the remaining balls survive.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-11-20T17:40:20Z
- **Completed:** 2026-11-20T17:58:26Z
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- `GameSession.onNudge(dir)` applies `NUDGE_IMPULSE` along `NUDGE_DIRS[dir]` to every ball from `getBalls()`. It is accepted only while playing and outside the cooldown, and it never writes a position. `tick()` advances the session's step clock and decays the meter.
- `TiltMeter` is a pure accumulate-and-decay meter with no world and no clock, and it matches the RESEARCH worked numbers exactly.
- Tilt behavior:
  - `"tilted"` makes `isLive()` false, so kicks, points and lights all stop at once.
  - Nudges are ignored while tilted.
  - A drain serves the next ball `"playing"` with the meter and warning cleared.
  - A tilt on ball 3 ends the game with the score kept.
- `isWarning()` and `getState()` give 04-07's HUD what it needs.
- `GameInput` maps codes to edges, with KeyX, Period and ArrowUp added beside Enter. It keeps the same press-edge, repeat, de-dupe, blur and bound-codes-only `preventDefault` behavior, and allocates nothing per event.
- `main.ts` and the `game-e2e` mirror route nudge edges to `session.onNudge`, then call `session.tick()`, at the top of each fixed step.
- Full suite: 31 files, 293 tests green. `tsc` and `eslint src` are clean, and only `planck-world.ts` imports planck.

## Task Commits

1. **Task 1 (tracer): nudge keys, cooldown, real-table twin proof:** `4876763` (feat)
2. **Task 2 (tdd): tilt meter and tilted state:** RED `3fadc11` (test), GREEN `59235ae` (feat)
3. **Task 3 (tdd): nudge latch contract:** `6c426df` (test)

## Files Created/Modified

- `src/game/tilt-meter.ts` (new): `TiltMeter` and `NudgeOutcome`.
- `src/game/tilt-meter.test.ts` (new): 7 meter cases.
- `src/game/tuning.ts`: nudge and tilt blocks with their docs and worked numbers.
- `src/game/game-session.ts`: the tilted state, `onNudge`, `tick`, `isWarning`, `getTiltLevel`, and the widened world.
- `src/game/game-session.test.ts`: the spy rig now records impulses and reports balls; 10 nudge and tilt cases.
- `src/input/game-input.ts`: the nudge bindings and edges.
- `src/input/game-input.test.ts`: 21 nudge latch cases.
- `src/sandbox/main.ts`: the nudge routing and `session.tick()`.
- `src/sandbox/game-e2e.test.ts`: the nudge routing in `makeGame`, a `touchedIds` recorder, and the twin, cooldown and attract cases.

## Decisions Made

See `key-decisions`. The tracer verify re-ran green before expansion (interactive run, end-of-phase mode, automated-only verify), so no checkpoint was needed.

## TDD Gate Compliance

- **Task 2 RED (`3fadc11`):** I wrote the tilt-meter and session cases against interface stubs: the tilt constants, a `TiltMeter` that returns `"ok"` with level 0, `isWarning()` returning false, `getTiltLevel()` returning 0, and `"tilted"` in `GameState`. The stubs make the cases fail on assertions rather than on a missing module.
  - Result: 12 cases failed.
  - Classifier: `tdd-red-evidence` on a Vitest `tap-flat` report returned `RED_EVIDENCE_OK` for the target "boundaries are inclusive ..." (expected `warning`, actual `ok`, exit 1).
  - Semantic assessment: the target ran and failed on its planned assertion. There was no load, syntax or fixture fault.
  - Five cases passed against the stubs. The direction table and the game-over case were already true from Task 1. The 240-step-spacing and floor-at-0 cases hold trivially for a level-0 stub.
- **Task 2 GREEN (`59235ae`):** the real meter and the session wiring. It descends from the RED commit.
- **Mutation checks for Task 2:** four mutations, all killed:
  - serve without clearing the tilt;
  - a level-triggered warning;
  - `isLive` true while tilted;
  - `onStart` without clearing the tilt.
- **Task 3: unexpected GREEN (fail-fast rule 1, investigated).** The plan has the Task 1 tracer build the latch, and Task 3 says to fix code only where a case fails. All 21 new cases passed on the first run. I checked why: the feature exists and the tests do test it. I wrote no RED record, because none exists honestly. As substitute evidence, I made eight targeted mutations of `game-input.ts`, and all were killed:
  - Period latches nudgeLeft;
  - repeat not ignored;
  - `preventDefault` on every code;
  - Space bound to start;
  - blur keeps held;
  - drain does not reset nudgeUp;
  - drain returns a fresh view;
  - keyup does not clear held.
- **Task 1 mutation checks:** removing the cooldown guard fails the cooldown case. Removing the playing gate fails the attract case.
- **Gate ordering:** `4876763` is a `feat(04-06)` that precedes the RED commit, because the plan has a tracer first. GREEN `59235ae` descends from RED `3fadc11`, so the RED -> GREEN sequence holds.
- **REFACTOR:** none needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] The plan's free-ball point hit a bumper inside the cooldown window**
- **Found during:** Task 1
- **Issue:** At (1.45, 2.2), the nudged ball reached the upper-right bumper on step 20 after the nudge. The cooldown case then measured a bounce, not a refused nudge.
- **Fix:** I moved the point to (1.0, 3.8), below the bumper cluster, as the plan allowed ("adjust the point if it is not clear of every element"). A `touchedIds` recorder in `makeGame` now asserts that the free ball touches nothing in either world, so the point is proven clear.
- **Files modified:** src/sandbox/game-e2e.test.ts
- **Committed in:** `4876763`

**2. [Rule 1 - Test bug] "Velocity difference unchanged" ignored the ball's linear damping**
- **Found during:** Task 1
- **Issue:** `BALL_LINEAR_DAMPING` 0.4 scales the twin velocity difference by 1/(1 + dt * k) every step, which is about 0.33% per step. A literal "unchanged" check fails even when a nudge is correctly refused.
- **Fix:** A refused nudge must leave exactly the damped carry-over (within 1e-9). An accepted one must add one impulse on top of it (within 3%). Both are still sharp enough to catch a nudge leaking through: an extra impulse is about 1.19 m/s against a damping change of about 0.004 m/s.
- **Files modified:** src/sandbox/game-e2e.test.ts
- **Committed in:** `4876763`

**3. [Rule 2 - Testability] TiltMeter optional config and GameSession.getTiltLevel()**
- **Found during:** Task 2
- **Issue:** With cost 1 and tilt at 3, any nudge made at level 2 or above tilts. So "while the level stays >= 2.0 it never warns again" cannot be observed with the defaults. Also, "a tilted nudge does not move the meter" needs the meter level to be readable from the session.
- **Fix:** `new TiltMeter(config?)` takes optional overrides. The game uses the defaults, and a cost-0.5 meter exposes the rising edge. I added `GameSession.getTiltLevel()` as a read-only accessor.
- **Files modified:** src/game/tilt-meter.ts, src/game/game-session.ts
- **Committed in:** `3fadc11` (stubs), `59235ae`

**4. [Rule 1 - Test precision] Float residue at the exact full-decay boundary**
- **Found during:** Task 2 GREEN
- **Issue:** One nudge then 240 decay steps is exactly a full decay. The 240 float subtractions leave about 2e-15, so the next peak reads 1.0000000000000022.
- **Fix:** The "never exceeds 1.0" assertion now allows 1e-12, and a comment explains why. The meter logic is unchanged.
- **Files modified:** src/game/tilt-meter.test.ts
- **Committed in:** `59235ae`

---

**Total deviations:** 4 auto-fixed (3 Rule 1 test bugs, 1 Rule 2 testability)
**Impact on plan:** No production behavior beyond the plan. One read-only accessor and a defaulted config parameter were added. No scope creep.

## Issues Encountered

- Shell quoting broke two inline `node -e` edits that contained apostrophes. I moved those edits into scratchpad scripts. No file was left partly edited (checked with `git status` before retrying).

## Known Stubs

None. The RED-phase interface stubs were all replaced in `59235ae`.

## Threat Flags

None. T-04-14, T-04-15 and T-04-16 are mitigated as planned:
- The cooldown and the accumulating tilt stop nudge spam (T-04-14).
- Nudges change velocity only through `applyImpulse`. The twin case checks position continuity, and a grep for `setTransform|setPosition` in `src/game` returns 0 (T-04-15).
- Cooldown, decay and the warning window are all counted in steps. A grep for wall-clock and random calls in `src/game` returns 0 (T-04-16).

## User Setup Required

None.

## Next Phase Readiness

- 04-07 can show WARNING from `isWarning()`, TILT from `getState() === "tilted"`, and the ball number from `getBall()`. The nudge direction and size (A2, A3) and the tilt numbers (A4) are judged in its human check.
- 04-08 adds `FlipperController.setEnabled`. Until then, a tilted ball cannot score or be kicked, but the bats still respond.
- Not classified (EDGE-GAME-03): a nudge while the ball rests in the plunger lane moves it, and the 04-02 rest gate blocks a launch until it settles again. This needs a review by feel in UAT.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*

## Self-Check: PASSED

- All 9 created or modified files exist.
- Commits `4876763`, `3fadc11`, `59235ae` and `6c426df` are ancestors of HEAD, and `check evaluation-scope --plan 04-06 --commits-only` resolves all four.
- `npx tsc --noEmit`, `npx eslint src` and `npx vitest run` exit 0 (31 files, 293 tests).
- Only `src/physics/planck-world.ts` imports planck.
- The position-write grep and the wall-clock/random grep in `src/game` both return 0.
