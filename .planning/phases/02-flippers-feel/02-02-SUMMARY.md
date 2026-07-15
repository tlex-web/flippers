---
phase: 02-flippers-feel
plan: 02
subsystem: input
tags: [keyboard, event.code, fsm, state-machine, flipper, engine-agnostic, typescript]

# Dependency graph
requires:
  - phase: 01-physics-core-spike
    provides: PhysicsWorld interface (setFlipperMotor, getFlippers), FixedStepLoop engine-agnostic class shape
  - phase: 02-flippers-feel (plan 02-01)
    provides: two mirrored capsule flippers, feel constants, setFlipperMotor +1/-1/0 feel-speed remap
provides:
  - Engine-agnostic keyboard input module (held Set of event.code, per-side OR latched edges)
  - Engine-agnostic FlipperController FSM (resting -> flipping-up -> held-up -> returning)
  - Motion-settling limit detector that is mirror-safe (no hard-coded angle limits)
affects: [02-03-wiring, 02-04-substepping, phase-3-table-layout, plunger, nudge]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "src/input/ and src/control/ are pure-TS, import no physics engine (grep-enforced, D-05/D-10)"
    - "Keyboard held-set + per-side OR edge detection on event.code (not event.key)"
    - "Latch/drain edge buffer mirroring drainEvents() reused-view + reset shape (zero per-drain alloc)"
    - "Hand-rolled enum-string FSM (not XState), unit-tested against a spy PhysicsWorld"
    - "Geometry/mirror-independent limit detection via angular settling"

key-files:
  created:
    - src/input/flipper-input.ts
    - src/input/flipper-input.test.ts
    - src/control/flipper-controller.ts
    - src/control/flipper-controller.test.ts
  modified: []

key-decisions:
  - "Limit detection is by angular settling (|delta| < 1e-3 rad after moving), not by comparing to FLIPPER_UPPER/LOWER_ANGLE — the referenceAngle-mirrored right flipper reports absolute angles around pi, so a hard-coded limit compare would be wrong for it. Under motor +1 the absolute getFlippers() angle rises for BOTH flippers, so 'stopped while driven' == 'at the limit'."
  - "Input exposes directly-callable handleKeyDown/Up/Blur/VisibilityChange handlers taking a minimal { code, repeat, preventDefault } shape; attach()/detach() only wire them to window/document in the browser — tests never touch a real DOM."
  - "preventDefault fires on keydown for bound codes only; keyup does not preventDefault (browser default behaviors trigger on keydown)."
  - "Edge latch uses two long-lived objects (pending + reused view): drainEdges copies pending->view, resets pending, returns the same view every call (zero per-drain allocation)."

patterns-established:
  - "Engine isolation extended to src/input/ and src/control/ (only planck-world.ts imports planck)"
  - "Spy-PhysicsWorld unit testing for control-layer code (no planck, no browser globals)"

requirements-completed: [FLIP-01, FLIP-03]

# Metrics
duration: 6min
completed: 2026-07-15
---

# Phase 2 Plan 2: Flipper Control Layer (Input + Controller FSM) Summary

**Engine-agnostic keyboard input (held Set of event.code with per-side OR latched edges, auto-repeat suppression, bound-only preventDefault, blur/visibility force-clear) plus a pure-TS FlipperController FSM (resting -> flipping-up -> held-up -> returning) that holds +1 continuously through the cradle and detects limits by mirror-safe angular settling — both unit-proven with no physics-engine import.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-15T16:18:21Z
- **Completed:** 2026-07-15T16:24:20Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments
- First keyboard input in the codebase: `FlipperInput` — a long-lived `Set<string>` of `event.code`s with per-side OR edge detection (a side is HELD iff ANY bound code is down; RELEASES only when ALL are up), `event.repeat` auto-repeat suppression + held-code de-dupe, `preventDefault` on bound codes only (Space/X/./ArrowUp never swallowed), and window-blur / `visibilitychange`-hidden force-clear that emits release edges for every held side (threat T-02-03 / T-02-04 mitigated).
- Explicit `FlipperController` FSM (criterion #3): per-flipper `resting -> flipping-up -> held-up -> returning`, driving the world solely through the sign-only `setFlipperMotor(id, +1/-1/0)` hook. Asserts `+1` on every update through both flipping-up and held-up (D-06(1) cradle hold), `-1` on release, and `0` exactly when it settles into resting.
- Mirror-safe limit detection: instead of comparing the live angle to a hard-coded `FLIPPER_UPPER_ANGLE` (wrong for the referenceAngle-mirrored right flipper, whose absolute angle orbits pi), the FSM detects "reached the limit" when the angle stops advancing after having moved. Proven in a dedicated test that sweeps a right flipper around +pi and gets the identical phase sequence.
- Both modules import NO physics engine; `FlipperController` imports `PhysicsWorld` as a type only. Zero per-frame/per-drain allocation (reused held Set, latch + view objects, per-flipper FSM records all built once).

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Keyboard input module** — `6441993` (test, RED) → `ac6015d` (feat, GREEN)
2. **Task 2: FlipperController FSM** — `4e2fe13` (test, RED) → `6ee384f` (feat, GREEN)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `src/input/flipper-input.ts` — `FlipperInput`: held-set + per-side OR latched edges, repeat suppression, bound-only preventDefault, blur/visibility force-clear, latch/drain (D-09/D-10).
- `src/input/flipper-input.test.ts` — 10 tests covering every behavior bullet with synthetic events (no DOM).
- `src/control/flipper-controller.ts` — `FlipperController`: engine-agnostic FSM over `PhysicsWorld`, continuous +1 hold, settling-based mirror-safe limit detection (D-04/D-05/D-06).
- `src/control/flipper-controller.test.ts` — 7 tests against a hand-rolled spy `PhysicsWorld` (records motor calls, scripts angles); asserts the full state sequence, continuous-+1 cradle, release/rest, mid-return re-flip, mirror-safety, multi-flipper independence.

## Decisions Made
- **Angular-settling limit detection over hard-coded limit compare.** Rationale: the right flipper is mirrored via `referenceAngle` (body angle pi), so `bat.getAngle()` reports absolute angles around pi, not around 0. A `>= FLIPPER_UPPER_ANGLE - eps` compare would only work for the left flipper. Settling (`|delta| < ANGLE_SETTLE_EPS` after moving) is geometry-independent and works for both, and needs no engine/constants coupling. The flipping-up -> held-up transition is purely observational (motor stays +1 either way), and returning -> resting only decides when to issue motor 0 — so slight timing tolerance is harmless.
- **`ANGLE_SETTLE_EPS = 1e-3 rad` lives in the controller, not constants.ts.** It is a numerical detection threshold (a driven bat sweeps ~0.25 rad/step vs. ~0 pinned), not a tunable feel magnitude, so it stays with the FSM to keep the controller self-contained and engine-agnostic.
- **preventDefault on keydown only, for bound codes only.** The browser behaviors we guard against (`/` Firefox quick-find, arrow scroll) fire on keydown; reserved keys (Space/X/./ArrowUp) are left fully intact for later phases.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the specified TDD RED→GREEN flow; no bugs, missing functionality, or blocking issues were encountered (Rules 1–4 not triggered).

## Issues Encountered
- Two minor test-only type/lint frictions during the GREEN phase, both resolved immediately (not plan deviations):
  - The input test's `preventDefault` spy over-constrained the synthetic event type (Mock intersection vs. `() => void`); fixed by letting TypeScript infer the helper's return type.
  - The controller test's spy stubs tripped `@typescript-eslint/no-unused-vars` on underscore-prefixed params (the recommended ruleset has no `argsIgnorePattern`); fixed by omitting the unused parameter names (TS allows implementing interface methods with fewer params).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Ready for plan 02-03 (end-to-end wiring in `main.ts`): construct `FlipperInput` + `attach()`, construct `FlipperController(world)`, and at the top of each fixed step drain `input.drainEdges()` -> feed `onPressEdge`/`onReleaseEdge` per side -> `controller.update()` before `world.step()`.
- The input module maps sides ("left"/"right") to flipper IDs implicitly via the consumer; 02-03 must bind side -> flipper id (left flipper id, right flipper id) when translating drained edges into `onPressEdge(id)` calls.
- No blockers. Existing full suite stays green (9 files / 51 tests); engine-isolation grep is clean for both new directories.

## Self-Check: PASSED

- All 4 created source/test files exist on disk.
- All 4 task commits (`6441993`, `ac6015d`, `4e2fe13`, `6ee384f`) exist in git history.
- Engine-isolation grep clean: no `from "planck"` in `src/input` or `src/control`.
- Full suite green: 9 files / 51 tests; `tsc --noEmit` and `eslint .` exit 0.

---
*Phase: 02-flippers-feel*
*Completed: 2026-07-15*
