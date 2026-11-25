---
phase: 03-table-plunger-event-bus
plan: 05
subsystem: control
tags: [plunger, planck, impulse, input, fsm, canvas, typescript, vitest]

requires:
  - phase: 03-table-plunger-event-bus
    provides: "03-01/03-02 TABLE_SPEC chute, PLUNGER_REST, PLUNGER_ZONE; 03-04 TABLE_SPEC as the default world and FlipperController narrowed to its FlipperWorld slice"
provides:
  - "PhysicsWorld.applyImpulse(ballId, ix, iy): generic linear impulse at the center of mass; no-op for unknown id or non-finite input (D-09; Phase 4 nudge reuses it)"
  - "Plunger constants: PLUNGER_CHARGE_RATE 1.5/s, PLUNGER_MAX_CHARGE 1, PLUNGER_MIN_IMPULSE 0.4, PLUNGER_MAX_IMPULSE 1.5, PLUNGER_AXIS (0,-1)"
  - "PlungerController (idle/charging FSM, PlungerWorld = Pick<PhysicsWorld, applyImpulse | getBalls>, getCharge()/getPhase())"
  - "PlungerInput: Space press/release/cancel latch with a reused drainEdges() view"
  - "Sandbox: every ball spawns at PLUNGER_REST and is launched with Space; charge meter + pullback in debug-draw"
affects: [03-06, phase-04-rules, phase-05-render-audio]

actuals:
  tokens: 12700
  tasks: 3
  commits: 4
plan_head_before: e331b1ae10408124e629f6a0800c6befb0bfc106
plan_head_after: 8844ae1ee800ccab1a516cca6ec7e31d86ba0af3

tech-stack:
  added: []
  patterns:
    - "Charge from an integer step count times rate * FIXED_DT, never a running float sum (exact cap, no drift)"
    - "Focus loss latches a distinct cancel edge and clears the held flag, so the post-refocus keyup is inert"
    - "Debug overlays that must not cover play live outside the cabinet; the renderer widens its bounds for them"

key-files:
  created:
    - src/control/plunger-controller.ts
    - src/control/plunger-controller.test.ts
    - src/input/plunger-input.ts
    - src/input/plunger-input.test.ts
    - src/sandbox/plunger-e2e.test.ts
  modified:
    - src/physics/constants.ts
    - src/physics/types.ts
    - src/physics/planck-world.ts
    - src/sandbox/main.ts
    - src/sandbox/debug-draw.ts

key-decisions:
  - "Plunger tuning: 1.5 charge/s (full in 80 steps, 0.67 s); impulse 0.4 to 1.5 kg*m/s, about 3.1 to 11.9 m/s. Measured: full climbs 6.0 m and exits the chute, half 4.3 m and falls back, tap 0.9 m"
  - "PlungerController charge = heldSteps * PLUNGER_CHARGE_RATE * FIXED_DT, clamped. A running sum reached 0.9999999999999984 after 80 steps and missed the cap"
  - "PlungerInput preventDefaults every Space keydown/keyup, repeats included, so a held Space never scrolls the page. Repeats still latch nothing"
  - "Meter sits outside the cabinet right of the chute and the pullback below the floor line; DebugRenderer.resize widens bounds by 0.26 m right and 0.25 m down"
  - "onFixedStep processes plunger edges in press, release, cancel order after the flipper edges, so a sub-step tap still launches at PLUNGER_MIN_IMPULSE"

patterns-established:
  - "Plunger slice: PlungerWorld = Pick<PhysicsWorld, applyImpulse | getBalls>, mirroring FlipperWorld"

requirements-completed: [LNCH-01, LNCH-02]

coverage:
  - id: D1
    description: "A full-charge release fires the ball straight up the real chute (vx 0, vy -11.86) and onto the playfield; half charge climbs less; an immediate release dribbles 0.92 m and falls back into PLUNGER_ZONE; swept containment holds every step"
    requirement: LNCH-01
    verification:
      - kind: integration
        ref: "src/sandbox/plunger-e2e.test.ts (plunger end-to-end: charge -> release -> applyImpulse -> real chute, 4 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Space keyboard -> PlungerInput -> controller launches the ball out of the chute; a blur mid-hold launches nothing and the ball stays in PLUNGER_ZONE"
    requirement: LNCH-01
    verification:
      - kind: integration
        ref: "src/sandbox/plunger-e2e.test.ts (Space keyboard -> latch -> controller -> launch, 2 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Space latch: one press per genuine keydown, repeats and duplicates ignored, one release per keyup, blur/hidden latch cancel and never release, reused drain view, Space-only preventDefault"
    requirement: LNCH-01
    verification:
      - kind: unit
        ref: "src/input/plunger-input.test.ts (12 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Controller: per-step charge, exact cap at 1, monotone impulse with the MIN floor at k=0, zone/unknown-id/idle/cancel guards, deterministic call lists, meter honesty within 1e-12"
    requirement: LNCH-02
    verification:
      - kind: unit
        ref: "src/control/plunger-controller.test.ts (10 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "applyImpulse added to the engine-agnostic contract; only planck-world.ts imports planck; constants.ts is append-only vs 80869ae; soak gates still green"
    verification:
      - kind: other
        ref: "grep -rl 'from \"planck\"' src = 1; git diff --numstat 80869ae -- src/physics/constants.ts = 51 0; npm run soak 3/3"
        status: pass
    human_judgment: false
  - id: D6
    description: "Sandbox: the meter fills smoothly and reads clearly before release, the pullback tracks it, a tap dribbles, a full hold fires around the top arc, longer holds launch harder, alt-tab mid-hold launches nothing"
    requirement: LNCH-02
    verification: []
    human_judgment: true
    rationale: "Meter readability and launch feel are perceptual (LNCH-02 / SC#3). This is the Task 3 human-check via npm run dev, collected at end of phase"

duration: 14min
completed: 2026-11-19
status: complete
---

# Phase 3 Plan 05: Hold-to-Charge Plunger Summary

**Hold Space and the charge rises once per 120 Hz step. On release, one linear impulse along the chute axis fires the resting ball up the real chute: about 12 m/s at full charge, 3.1 m/s on a tap. The debug meter and pullback read the same `getCharge()` value the impulse uses.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-19T21:56:44Z
- **Completed:** 2026-11-19T22:11:17Z
- **Tasks:** 3 (tracer, TDD auto, auto)
- **Files modified:** 10 (5 created, 5 modified)

## Accomplishments

- **`applyImpulse(ballId, ix, iy)`** is on `PhysicsWorld`. Planck calls `applyLinearImpulse` at `getWorldCenter()` with wake true. It rejects non-finite input and unknown ids. It is generic, so the Phase 4 nudge can reuse it.
- **Constants (append-only, 51 lines added, 0 deleted vs 80869ae):**
  - charge rate 1.5/s;
  - cap 1;
  - impulse 0.4 to 1.5 kg*m/s;
  - axis (0, -1).
  Each one documents the impulse-to-speed mapping and the damped-climb formula.
- **Measured on the real table (no-mock e2e):**

  | Release | Launch vy (m/s) | Climb (m) | Outcome |
  |---------|-----------------|-----------|---------|
  | Full charge | -11.86 | 5.99 | Clears the chute top at step 50 and is on the playfield at step 77 |
  | Half charge | -7.50 | 4.35 | Peaks 0.05 m above the chute top, then falls back |
  | Tap | -3.13 | 0.92 | Back on the plunger |

  These match the plan's analytic h(v) to within 0.1 m.
- **`PlungerController`** has an idle/charging FSM and a zone-guarded release.
  - Cancel never launches.
  - It never reads wall-clock or RNG.
  - The ball lookup walks the pooled snapshot.
- **`PlungerInput`** is `FlipperInput` reduced to Space:
  - It latches press, release and cancel edges.
  - Blur or a hidden tab latch cancel and clear the held flag, so the keyup after refocus does nothing.
  - It allocates nothing per event or drain.
- **Sandbox:**
  - Every ball spawns at `PLUNGER_REST`.
  - `onFixedStep` drains Space edges after the flipper edges.
  - The meter gets `plunger.getCharge()` every frame.
  - The meter is an outlined bar right of the chute spanning `PLUNGER_ZONE`. It has quarter ticks, fills orange from the bottom and turns red at full.
  - The plunger tip sits under the resting ball and moves down by charge * 0.15 m.

## Task Commits

1. **Task 1 (tracer): full-charge release launches up the real chute** - `c8e10f8` (feat)
2. **Task 2 RED: failing latch and controller edge-case tests** - `b629c4d` (test)
3. **Task 2 GREEN: Space latch and exact-cap charge** - `29bcfd1` (feat)
4. **Task 3: sandbox wiring, charge meter and pullback** - `8844ae1` (feat)

**Tracer gate:** the run was interactive with end-of-phase verification and an automated-only `<verify>`. I re-ran it (tsc, eslint, 4/4 e2e) and it was green, so I continued to Task 2.

## TDD Gate Compliance (Task 2)

- **RED** (`b629c4d`): 9 of 28 tests failed. `plunger-input.ts` was a shape-only skeleton, so the failures are assertions, not import errors. I checked two targets with `gsd-tools check tdd-red-evidence` using vitest `tap-flat`, and both returned `RED_EVIDENCE_OK`:
  - `plunger-input.test.ts > a Space keydown latches exactly one press edge`: expected `press` true, received false. The skeleton latches nothing, which is the intended reason.
  - `plunger-controller.test.ts > reaches exactly 1 at the cap and never exceeds it`: expected 1, received 0.9999999999999984. This is a real gap in the Task 1 controller (float-sum drift), not a harness fault.

  A run of the whole file set gave malformed TAP: vitest prints a multiline `toBe` message without indentation. So I re-ran each target alone.
- **GREEN** (`29bcfd1`): `PlungerInput` implemented, and the controller now uses the integer step count. 28/28 pass.
- **REFACTOR:** none needed.
- **Controller tests that passed at RED:** 9 of the 10 controller cases already passed against the Task 1 code. They pin its behavior rather than drive new code. The plan expects this: "adjust plunger-controller.ts only where a behavior line exposes a gap".
- **Mutation check (reverted):** I made `cancelHeld()` latch release instead of cancel. Three tests went red: both input focus-loss cases and the e2e blur-mid-hold case.

## Files Created/Modified

- `src/physics/constants.ts` - plunger block (append-only)
- `src/physics/types.ts` - `PhysicsWorld.applyImpulse` with doc
- `src/physics/planck-world.ts` - `applyImpulse` implementation
- `src/control/plunger-controller.ts` - `PlungerController`, `PlungerWorld`, `PlungerPhase`, `PlungerZone`
- `src/control/plunger-controller.test.ts` - spy-world unit proofs (10)
- `src/input/plunger-input.ts` - `PlungerInput`, `PlungerEdges`
- `src/input/plunger-input.test.ts` - synthetic-event unit proofs (12)
- `src/sandbox/plunger-e2e.test.ts` - no-mock launch proofs on TABLE_SPEC (6)
- `src/sandbox/main.ts` - plunger stack wiring, spawn at `PLUNGER_REST`, charge into `draw`
- `src/sandbox/debug-draw.ts` - `draw(..., plungerCharge)`, `drawChargeMeter`, widened bounds

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Charge missed the cap at its nominal step count**
- **Found during:** Task 2 RED
- **Issue:** the Task 1 controller summed 0.0125 per step. After 80 steps the sum was 0.9999999999999984, so the meter read just under full for one extra step and a release on step 80 was not at full power.
- **Fix:** charge = `heldSteps * PLUNGER_CHARGE_RATE * FIXED_DT`, clamped at the cap. The public shape is unchanged.
- **Files modified:** src/control/plunger-controller.ts
- **Verification:** the exact-cap and per-step-rise cases pass, as does meter honesty within 1e-12.
- **Committed in:** `29bcfd1`

**2. [Rule 2 - Missing critical] The meter and pullback needed canvas room outside the playfield**
- **Found during:** Task 3
- **Issue:** the canvas bounds ended 24 px past the cabinet. A meter beside the chute would have been clipped or would have covered the outlane, and the pullback would have been clipped below the floor.
- **Fix:** `resize()` widens the bounds by 0.26 m right and 0.25 m down. Both overlays sit outside the cabinet, so they never cover the ball.
- **Files modified:** src/sandbox/debug-draw.ts
- **Verification:** tsc, eslint and `vite build` are clean. How it looks is the end-of-phase human-check.
- **Committed in:** `8844ae1`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing-critical).
**Impact on plan:** both were needed for the meter-honesty and readability goals. No scope creep.

## Issues Encountered

- `planck-world.ts` and `debug-draw.ts` were already out of Prettier style before this plan. I kept the new code formatted and reverted Prettier's rewrap of the untouched lines, so the diff stays scoped.

## Flagged Assumptions (from the plan)

- **EDGE-LNCH-01:** if Space is held across a drain and refeed, the new ball spawns at `PLUNGER_REST` while charging, and the release launches it with the charge built up so far. This is the plan's assumed behavior. It is not unit-tested and still needs a manual review at the end-of-phase check.
- **EDGE-LNCH-02:** machine-checked in `plunger-controller.test.ts`. The meter reads 0 when idle, exactly 1 at the cap and never above 1, and returns to 0 on release or cancel.

## Known Stubs

None.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- 03-06 (event bus) can consume plunger launches. The Phase 4 nudge can call `applyImpulse` directly.
- Pending the Task 3 human-check via `npm run dev`, collected at end of phase:
  - meter readability;
  - launch feel: a tap dribbles, a full hold fires around the top arc, longer holds launch harder;
  - alt-tab mid-hold launches nothing.

## Self-Check: PASSED

- **Files:** all 5 created files are present.
- **Commits:** `c8e10f8`, `b629c4d`, `29bcfd1` and `8844ae1` are ancestors of HEAD. `git rev-list --count e331b1a..HEAD` = 4 before this docs commit.
- **Acceptance criteria:**
  - Task 1: `PLUNGER_MAX_IMPULSE` appears 1 time in constants.ts; `applyImpulse` 1 time in types.ts; `applyLinearImpulse` 1 time in planck-world.ts. There are 0 planck imports and 0 wall-clock or RNG tokens in the controller. The constants.ts numstat is `51 0`, and the e2e passes.
  - Task 2: `export class PlungerInput` appears 1 time and there are 0 planck imports in plunger-input.ts. `grep -rl 'from "planck"' src | wc -l` = 1. Every behavior line is a passing case.
  - Task 3: `PlungerController` appears 2 times in main.ts, `getCharge()` 1 time and `PLUNGER_REST` 3 times. `drawChargeMeter` appears 2 times in debug-draw.ts.
- **Plan verification:**
  - `npm run typecheck`: exit 0.
  - `npx eslint src`: clean.
  - `npm test`: 19 files and 137 tests passed.
  - `npm run soak`: 3/3 passed in 7.0 s.
  - Only `src/physics/planck-world.ts` imports planck.

---
*Phase: 03-table-plunger-event-bus*
*Completed: 2026-11-19*
