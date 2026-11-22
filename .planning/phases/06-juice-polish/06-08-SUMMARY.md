---
phase: 06-juice-polish
plan: 08
subsystem: game-rules
tags: [ball-save, kickback, center-post, reactive-elements, planck, vitest]

requires:
  - phase: 06-juice-polish
    provides: "06-07 GameSession.trySave(ballId) and the backstop re-serve; 06-01 RuleHooks and the six-argument-ready ReactiveElements; 06-03 the reactive table rig"
provides:
  - "src/table/spec.ts: ElementKind \"post\", element 610 (circle sensor r 0.09 at (PLAYFIELD_CENTER_X, 5.80))"
  - "src/game/tuning.ts: KICKBACK_SPEED = 5.5"
  - "src/game/reactive-elements.ts: RuleHooks.trySave, ReactiveConfig { kickbackSpeed }, sixth constructor parameter, kicker kind \"post\", onPost gate (live, above center, trySave)"
  - "src/render/flash.ts FLASH_TIMING.post, src/sandbox/debug-draw.ts KIND_STYLE.post, src/render/static-layer.ts case \"post\" (not baked; drawn live in 06-10)"
  - "Tests: kickback tracer, gating units, armed energy bound, RED control at 20 m/s, trough exclusion with a positive control"
affects: [06-10 post drawing and save flourish (reads the same radius and the session save counter), 06-13 save sparks, 06-14 always-armed soak gate (ReactiveSoakWorld hooks option)]

actuals:
  tokens: 7000
  tasks: 2
  commits: 2
plan_head_before: 64e3382035fada82f7e6b8d566496c78d16a757b
plan_head_after: 07a1c1a976d824f6b6f96c12bf19766239fd58a1

tech-stack:
  added: []
  patterns:
    - "A points-free kicker kind reusing the bumper kick law; the rule decision (trySave) is a hook, the world write stays in service()"
    - "Real-table rules tests take a hooksFor/config seam instead of changing production defaults"
    - "Mutation check (scratch script) to prove characterization tests bite when the behavior shipped in a tracer"

key-files:
  created: []
  modified:
    - src/table/spec.ts
    - src/game/tuning.ts
    - src/game/reactive-elements.ts
    - src/render/flash.ts
    - src/sandbox/debug-draw.ts
    - src/render/static-layer.ts
    - src/game/reactive-elements.test.ts
    - src/game/reactive-table.test.ts
    - src/render/static-layer.test.ts
    - src/render/flash.test.ts
    - src/sandbox/game-e2e.test.ts

key-decisions:
  - "Center post is element 610, a 0.09 m circle sensor at (1.45, 5.80); collider and drawing share the one radius field (D-06/D-07)"
  - "KICKBACK_SPEED 5.5 m/s via the bumper law; armed peak measured 7.66 m/s against the 15 m/s bound, 20 m/s control peaks 19.99 m/s"
  - "Post kick is gated live -> ball center above post center -> trySave; it awards nothing and reports no switch or feedback (flourish reads the session save counter)"
  - "Trough-exclusion releases placed 0.47-0.62 m down each trough wall, 0.22-0.28 m inside it: the drooped bat covers the wall above 0.47 m, so the plan's 'near its top' placement is not physically possible"

patterns-established:
  - "Post kicker: a sensor-driven kicker whose trigger is a rule hook, not an impulse threshold"

requirements-completed: [PLSH-07]

coverage:
  - id: D1
    description: "Virtual center post (element 610, kind post) in the table spec, inert to every existing table, flow, determinism and soak test"
    requirement: PLSH-07
    verification:
      - kind: integration
        ref: "npx vitest run src/table src/sandbox/game.determinism.test.ts src/sandbox/skill-shot-e2e.test.ts"
        status: pass
      - kind: integration
        ref: "npm run soak"
        status: pass
    human_judgment: false
  - id: D2
    description: "An armed center drain on the real table is kicked back up off the post (bumper law at KICKBACK_SPEED, one kick)"
    requirement: PLSH-07
    verification:
      - kind: integration
        ref: "src/game/reactive-table.test.ts#tracer: an armed center drain on the real table is kicked back up off the virtual post"
        status: pass
      - kind: e2e
        ref: "src/sandbox/game-e2e.test.ts (live composition kickback: one save of kind kickback, ball heading up, next drain enters bonus)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Kick gating: only live, above-center, trySave-granted overlaps kick; no award, switch or feedback; config speed honored"
    requirement: PLSH-07
    verification:
      - kind: unit
        ref: "src/game/reactive-elements.test.ts#ReactiveElements center-post kickback gating (06-08, PLSH-07)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Armed energy bound (12 drops, all drain, <= 15 m/s, post kicks fire) with a RED control at kickbackSpeed 20"
    requirement: PLSH-07
    verification:
      - kind: integration
        ref: "src/game/reactive-table.test.ts#energy bound with the save armed (PLSH-07, D-10)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Outlane trough runners never reach the post"
    requirement: PLSH-07
    verification:
      - kind: integration
        ref: "src/game/reactive-table.test.ts#trough exclusion: the post never reaches the outlane trough runners (PLSH-07, research A1)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The kickback reads as a real pop-up post bounce in play"
    requirement: PLSH-07
    verification:
      - kind: manual_procedural
        ref: "Task 1 tracer human-verify checkpoint (npm run dev, dead-flipper center drain)"
        status: pass
    human_judgment: true
    rationale: "Perceptual feel; approved by the user at the Task 1 checkpoint, re-check at phase UAT once 06-10 draws the post"

duration: 17min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 08: Center-Post Kickback Summary

**Virtual center post (sensor element 610) that, while the ball save is armed, kicks a center drain back up the table with the bumper kick law at 5.5 m/s, gated on live play, ball-above-post and `trySave`, bounded at a 7.66 m/s peak with a 20 m/s RED control, and never reached from the outlane troughs.**

## Performance

- **Duration:** 17 min of execution (wall-clock across the Task 1 checkpoint)
- **Started:** 2026-11-22T22:11:09Z
- **Completed:** 2026-11-22T22:27:49Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- `"post"` element kind and element 610 in `TABLE_SPEC`; the compile-forced flash, debug-draw and bake sites updated (the post is never baked; 06-10 draws it live)
- `ReactiveElements` post kicker: `onPost` queues a kick only when live, the ball center is above the post center, and `RuleHooks.trySave` grants it; `service()` applies the bumper law; no points, switch or feedback
- `ReactiveConfig.kickbackSpeed` (sixth constructor parameter) with `KICKBACK_SPEED = 5.5` default
- Live game: `main.ts` already passes the session as rule hooks, so a center drain inside the save window bounces back (approved at the tracer checkpoint)
- Gating, energy, RED and trough tests; all five source mutants of the post branch are killed by them

## Task Commits

1. **Task 1: Tracer, an armed center drain on the real table is kicked back up by the virtual post** - `69d09e5` (feat)
2. **Task 2: The kick is gated, energy-bounded with a RED control, and never reaches the trough runners** - `07a1c1a` (test)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY

## Measured Results

| Check | Result |
|-------|--------|
| Armed energy bound, 12 drops (seed 0x0403) | 12/12 drained, peak 7.66 m/s (bound 15), 12 post kicks (one per drop) |
| RED control, `{ kickbackSpeed: 20 }` | peak 19.99 m/s > 15 (RED as required), 12 post kicks |
| Trough exclusion (seed 0x0608, 6 per wall, 130 and 131) | 12/12 drained, 0 post events, 0 kicks over a fixed 2 s each |
| Trough control (ball on the axis 0.45 m above the post) | post events > 0 |
| `npm run soak` | 4/4 files, 4/4 tests, exit 0, no `ESCAPE[` line |
| `npx vitest run` | 57 files, 1107 tests passed |
| `npx tsc --noEmit`, `npx eslint src`, `npm run build` | clean |
| Engine import | only `src/physics/planck-world.ts` imports planck |

## TDD Gate Compliance

Task 2 is `tdd="true"`, but the behavior it pins was built in the Task 1 tracer (the plan's tracer-first order), so its tests passed on first run: an expected "unexpected GREEN", not a missing feature. The plan says to change `reactive-elements.ts` only if a case found a gap, and none did, so Task 2 has a `test(06-08)` commit and no `feat` commit. Task 1's `feat(06-08)` commit (69d09e5) holds the implementation together with its tracer test.

**RED evidence, swapped for a mutation check:** a script (`0608-mutate.cjs`, in the scratchpad) applied five mutants to `src/game/reactive-elements.ts` one at a time, ran both test files, and restored the source:

| Mutant | Killed by |
|--------|-----------|
| drop the above-center gate | the level and below-center unit cases (2 failed) |
| drop the live gate on the post | the not-live unit case (1 failed) |
| ignore the `trySave` answer | trySave false, default hooks, both real-table energy bounds (4 failed) |
| post uses the slingshot normal | the main unit kick, config 4 m/s, already-faster, real-table tracer, RED control (5 failed) |
| post awards points | the no-award / no-switch / no-feedback case (1 failed) |

Semantic assessment: every mutant failed on assertions for the gate it removed, never on load or setup errors. The tests bite.

## Files Created/Modified
- `src/table/spec.ts` - `"post"` ElementKind and element 610
- `src/game/tuning.ts` - `KICKBACK_SPEED = 5.5`
- `src/game/reactive-elements.ts` - `RuleHooks.trySave`, `ReactiveConfig`, post kicker and `onPost`
- `src/render/flash.ts` - `FLASH_TIMING.post`
- `src/sandbox/debug-draw.ts` - `KIND_STYLE.post`
- `src/render/static-layer.ts` - `case "post"` (skipped, no shadow)
- `src/game/reactive-elements.test.ts` - SpyHooks.trySave spy, `dispatch`/config rig seam, 9 post gating cases
- `src/game/reactive-table.test.ts` - tracer, `makeArmedRig`, armed energy bound, RED control, trough exclusion and control
- `src/render/static-layer.test.ts`, `src/render/flash.test.ts` - `isBaked` excludes the post; post-never-baked case
- `src/sandbox/game-e2e.test.ts` - `hooksFor` seam, `noKickback` for the 06-07 backstop test, live-composition kickback e2e

## Decisions Made
See `key-decisions`. In short: 0.09 m post at (1.45, 5.80), the bumper law at 5.5 m/s, the gate order live → above center → trySave with no reporting, and a trough release window measured against the drooped bat.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SpyHooks needed `trySave` once it joined RuleHooks**
- **Found during:** Task 1
- **Issue:** Adding `trySave` to `RuleHooks` broke `tsc` on the 06-01 `SpyHooks` in `reactive-elements.test.ts`
- **Fix:** Task 1 added a stub returning false; Task 2 turned it into a real spy (`grant` flag, `asked` log, logged `["trySave", id]`)
- **Files modified:** src/game/reactive-elements.test.ts
- **Committed in:** 69d09e5 (stub), 07a1c1a (spy)

**2. [Rule 1 - Bug] Bake tests counted the post as a baked element**
- **Found during:** Task 1
- **Issue:** static-layer and flash tests assumed every element is baked; the post is drawn live (06-10)
- **Fix:** an `isBaked` predicate excludes the post, plus a new test that the post is never baked; `maxElementId` is now 610
- **Files modified:** src/render/static-layer.test.ts, src/render/flash.test.ts
- **Committed in:** 69d09e5

**3. [Rule 1 - Bug] 06-07 backstop e2e broke because a full plunge now hits the post**
- **Found during:** Task 1
- **Issue:** With the live session as hooks, the backstop scenario's ball was kicked back and drained at step 868, past the 840-step window
- **Fix:** `makeGame` takes a `hooksFor` parameter; the backstop test passes `noKickback` (forwards switches, denies trySave). A new live-composition e2e pins the kickback: one save of kind "kickback", the ball heading up one frame after the kick, and the next drain entering bonus
- **Files modified:** src/sandbox/game-e2e.test.ts
- **Committed in:** 69d09e5

**4. [Rule 3 - Blocking] Tracer loop cap raised from 4 s to 60 s**
- **Found during:** Task 1
- **Issue:** The first seeded center origin reaches the post at step 554, past `FOUR_SECONDS`
- **Fix:** The tracer loop is capped at `SIXTY_SECONDS` and stops at the first post kick or drain
- **Files modified:** src/game/reactive-table.test.ts
- **Committed in:** 69d09e5

**5. [Rule 1 - Physically impossible placement] Trough-release window moved down the wall**
- **Found during:** Task 2
- **Issue:** The plan placed releases "about 0.25 m inside the trough wall line near its top". The drooped left bat (pivot (0.69, 5.45), 0.3927 rad, length 0.5) covers the top of the 0.89 m trough wall, so a ball at that depth only clears the bat from about 0.47 m along it
- **Fix:** mulberry32 (seed 0x0608) releases at 0.47-0.62 m along walls 130 and 131 (geometry read from the resolve), 0.22-0.28 m inside toward the post side, with a 0-1 m/s push down the wall. Each runs a fixed 2 s past the drain event. A positive control ball on the axis does produce post events, so the zero is not vacuous. Research A1 holds: zero post events, so no placement decision was needed
- **Files modified:** src/game/reactive-table.test.ts
- **Committed in:** 07a1c1a

---

**Total deviations:** 5 auto-fixed (3 Rule 1, 2 Rule 3)
**Impact on plan:** Test seams and placement only; no production behavior beyond the plan. No scope creep.

## Checkpoints

- **Task 1 tracer feedback gate (human-verify, gate=blocking):** the user approved it ("approved") after the dev-server check. The center drain bounced back and the outlane ball was re-served.

## Issues Encountered
- Git Bash `sed -i` rewrote `reactive-table.test.ts` from CRLF to LF during probing. This has no effect on the commit: `core.autocrlf=true` and the index is LF.
- The armed energy bound uses the 12 `energyOrigins` drops as the plan specifies. Every drop reaches the post once, so the center-drop stream was not needed for non-vacuity.

## Known Stubs
None. The post has no drawing yet; 06-10 adds it, as the plan intends.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 06-10 can draw the post from element 610's radius and fire the save flourish from `getSaveCount()` / `getLastSaveKind()`
- 06-14 needs the always-armed soak hooks option and a post-kick non-vacuity check
- `KICKBACK_SPEED` is still open to feel tuning at UAT. The energy gate allows a lot of headroom: 7.66 m/s measured against the 15 m/s bound

---
*Phase: 06-juice-polish*
*Completed: 2026-11-22*

## Self-Check: PASSED
