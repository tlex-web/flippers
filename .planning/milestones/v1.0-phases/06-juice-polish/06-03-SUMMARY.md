---
phase: 06-juice-polish
plan: 03
subsystem: render
tags: [canvas-2d, lamps, inserts, skill-shot, attract, bake, fixed-step, vitest]

requires:
  - phase: 06-juice-polish
    provides: "06-01 skill-shot getters on GameSession (getSkillPhase, getSkillLitLane, getSkillShotCount, getLastSkillLane); 06-02 lamp palette tokens (ROLLOVER/SKILL/INLANE lit and unlit, LAMP_HOTSPOT, LAMP_RIM) and the depth bake order"
  - phase: 05-procedural-rendering
    provides: "TableRenderer frame contract, bakeHalo sprites, FlashTracker step-clock pattern, recording context"
provides:
  - "src/render/lamps.ts: LampTracker (update, level), LampReader, LampLights, LampRules, LampShape, buildLampShapes, LAMP_* indices (8 lamps), fade/blink/hold/chase constants"
  - "TableRenderer lamp pass (drawLamps) replacing the Phase-5 lit-rollover stroke; RenderFrame.lamps; per-colour lamp halos derived from the shape table"
  - "static-layer drawUnlitLenses: unlit lens and LAMP_RIM specular rim bake, generic over buildLampShapes"
  - "GameSession.isInlaneScored(id): per-ball inlane flags, cleared on every serve"
  - "main.ts wiring: one LampTracker, lamps.update() per fixed step after observer.observe() and before flash.tick(), renderFrame.lamps"
affects: [06-07 backstop re-serve (must not clear inlane flags), 06-10 ball-save ring lamp (one more shape-table row, no renderer or bake edit), 06-14 presentation determinism (attaches the tracker)]

actuals:
  tokens: 22075
  tasks: 3
  commits: 6
plan_head_before: e45685c275a9806e73af773aa7b1b1f021d4c392
plan_head_after: 72ae1b567adaf6c2371a66d79f34f2fdca067787

tech-stack:
  added: []
  patterns:
    - "Lamp shape table: one buildLampShapes row per lamp drives the live lamp pass, the per-colour halo bake and the unlit lens bake, so a new lamp needs no renderer or static-layer edit"
    - "Lamp levels on the fixed-step clock: Float32Array prev/cur moved toward a Uint8Array target by 1/4 up and 1/15 down per update(), read at render alpha; phase origins (blink, chase) are latched on the entry edge, never a global modulo"

key-files:
  created:
    - src/render/lamps.ts
    - src/render/lamps.test.ts
  modified:
    - src/render/table-renderer.ts
    - src/render/table-renderer.test.ts
    - src/render/static-layer.ts
    - src/render/static-layer.test.ts
    - src/game/game-session.ts
    - src/game/game-session.test.ts
    - src/sandbox/main.ts

key-decisions:
  - "The frozen-lane blink and the attract chase count from their own entry step (blinkStart on the freeze edge, attractStart on the game-over edge), not a global lampStep modulo, so every blink cycle is exactly 60 steps and neither ever opens with a short flash"
  - "The skill-shot award hold applies only while playing: a tilt or game over cancels it"
  - "Inlane flags are set only by a lane switch while the session is playing, and serveBall() clears them; a backstop re-serve (06-07) must not route through serveBall()"
  - "Fill-lens rims keep only edges in the upper-left half whose outward normal faces up-left, so the rim lands on the top-left outer edge of each chevron and arrow (not on their undersides)"
  - "Lamp halo layers derive from the shape table colours in table order, baked after the ball shadow; the INLANE_LIT halo arrived with the arrow rows and no renderer edit"

patterns-established:
  - "Presentation reads rule state through Pick<> getter slices (LampLights, LampRules) and never writes it; the tracker is the only stateful layer between rules and renderer"

requirements-completed: [PLSH-04, PLSH-05]

coverage:
  - id: D1
    description: "Lamp levels fade in over 4 steps and out over 15 on the fixed-step clock, read at alpha; idempotent at the rails; frozen with the sim when no step runs"
    requirement: PLSH-04
    verification:
      - kind: unit
        ref: "src/render/lamps.test.ts#a lamp whose target turns 1 reaches exactly 1 after 4 updates, 0.25 per step"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#a lamp whose target turns 0 reaches exactly 0 after 15 updates and not before"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#idempotency: 100 updates with unchanged state keep a saturated lamp at exactly 1 and an idle lamp at exactly 0"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#concurrency: frames with no update() leave every level and the blink phase unchanged"
        status: pass
    human_judgment: false
  - id: D2
    description: "Skill chevrons show the skill-shot rule: steady on the rotating lit lane, 2 Hz blink when frozen (every cycle exactly 60 steps), 60-step award hold, unlit when off, tilted or in attract"
    requirement: PLSH-05
    verification:
      - kind: unit
        ref: "src/render/lamps.test.ts#rotating lights only the chevron under getSkillLitLane(), steady"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#frozen blinks the lit chevron: on for 30 updates, off for 30, from the freeze"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#blink limit: across 600 frozen updates every on/off cycle of the blinking chevron is exactly 60 updates"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#a getSkillShotCount() increment lights the getLastSkillLane() chevron steady for 60 updates whatever the phase"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#tilted: chevrons go out with the disarm, rollover and arrow lamps keep their rule state"
        status: pass
      - kind: manual_procedural
        ref: "Task 1 tracer human-verify checkpoint (npm run dev, watch the top lanes, hold and release Space) - user response: approved"
        status: pass
    human_judgment: false
  - id: D3
    description: "Inlane arrows light once their inlane scores on this ball and clear on every serve and new game"
    requirement: PLSH-04
    verification:
      - kind: unit
        ref: "src/game/game-session.test.ts#while playing, a lane switch on 500 scores 500 only; a second call changes nothing"
        status: pass
      - kind: unit
        ref: "src/game/game-session.test.ts#a drain followed by the next serve clears both"
        status: pass
      - kind: unit
        ref: "src/game/game-session.test.ts#onStart clears both (a new game after game over)"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#arrow 500 follows isInlaneScored(500) and arrow 501 follows 501 while playing"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#builds the two inlane arrows: a 0.16 x 0.12 head plus a 0.05 x 0.08 stem at (0.585, 4.72) and its mirror"
        status: pass
    human_judgment: false
  - id: D4
    description: "Lit lamps render as lens + lighter halo + hot-spot at their level, inside the frame contract (no gradient, blur, text or allocation in draw())"
    requirement: PLSH-04
    verification:
      - kind: unit
        ref: "src/render/table-renderer.test.ts#a rollover lamp at level 1: ROLLOVER_LIT lens stroke at alpha 1, one halo under lighter, a LAMP_HOTSPOT stroke at 0.8 over the middle half"
        status: pass
      - kind: unit
        ref: "src/render/table-renderer.test.ts#a chevron lamp at level 1: SKILL_LIT lens fill at alpha 1, one halo of radius 0.16 under lighter, a LAMP_HOTSPOT disc at 0.8"
        status: pass
      - kind: unit
        ref: "src/render/table-renderer.test.ts#every lamp at 1: one halo per shape, all before the bats; no gradient, blur, text or new layer; ends clean"
        status: pass
    human_judgment: false
  - id: D5
    description: "Unlit chevron, arrow and rollover lenses are baked with a faint LAMP_RIM specular rim; lit vs unlit contrast and the plastic look read correctly"
    requirement: PLSH-04
    verification:
      - kind: unit
        ref: "src/render/static-layer.test.ts#fills every fill lens (3 chevrons, 2 arrows) with its UNLIT color after the element loop, before the vignette"
        status: pass
      - kind: unit
        ref: "src/render/static-layer.test.ts#rims every fill lens with one 0.008 m LAMP_RIM stroke along its upper-left outer edge"
        status: pass
      - kind: unit
        ref: "src/render/static-layer.test.ts#rims every rollover with a 0.008 m LAMP_RIM line 0.012 m up-table, and strokes no second unlit lens"
        status: pass
    human_judgment: true
    rationale: "Task 3 human-check (lens plastic look, lit-vs-unlit contrast) is perceptual and was not yet seen by the user; deferred to end-of-phase verification"
  - id: D6
    description: "Attract (game over) runs a single-lamp ping-pong chase 500 400 401 402 501 402 401 400 with an 18-step dwell; chevrons unlit"
    requirement: PLSH-04
    verification:
      - kind: unit
        ref: "src/render/lamps.test.ts#game over runs the 500 400 401 402 501 402 401 400 ping-pong, one lamp per 18-update dwell"
        status: pass
      - kind: unit
        ref: "src/render/lamps.test.ts#the chase stops when a game starts: the lamps follow rule state again"
        status: pass
    human_judgment: true
    rationale: "How the chase reads in the live attract screen (about 0.15 s per lamp) is perceptual; deferred to end-of-phase verification"

duration: 35min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 03: Insert Lamps Summary

**Fixed-step LampTracker drives eight glowing insert lamps (rollovers, skill chevrons, inlane arrows): incandescent fades, a 2 Hz frozen-lane blink, an attract ping-pong chase, and a baked unlit lens with a specular rim, all built from one shape table.**

## Performance

- **Duration:** 35 min (two executors, split by the Task 1 tracer checkpoint)
- **Started:** 2026-11-22T20:30:45Z
- **Completed:** 2026-11-22T21:05:48Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- The skill shot is now visible: the lit lane's chevron chases across the top lanes, blinks at 2 Hz once the plunger freezes it, and holds steady for 60 steps on an award (SC3, PLSH-05)
- Rollovers, chevrons and inlane arrows glow like playfield inserts (lens, lighter halo, white hot-spot) with a 4-step fade in and a 15-step incandescent tail, inside the draw() frame contract
- Every unlit lens is baked as dim tinted plastic with a faint top-left rim, so lit vs unlit reads as two distinct states (SC2 second half, PLSH-04)
- Attract (game over) walks a single light back and forth across the inlane arrows and rollovers on the step clock
- One shape table feeds the live pass, the halo bake and the unlit bake: the 06-10 save ring is one more row

## Task Commits

1. **Task 1: Tracer. The lit skill-shot lane and lit rollovers glow and fade** - `719d182` (test), `cbe09e6` (feat). Tracer feedback gate: human-verify checkpoint, user response "approved"
2. **Task 2: The inlane arrows light once their inlane scores on this ball** - `c504c65` (test), `66f93d7` (feat)
3. **Task 3: Unlit lenses baked with a specular rim, attract lamp chase** - `a4d180d` (test), `72ae1b5` (feat)

**Plan metadata:** recorded in the docs commit that adds this file

## TDD Gate Compliance

RED then GREEN commits for every task, in ancestry order. RED evidence was classified `RED_EVIDENCE_OK` by `gsd-tools check tdd-red-evidence` (records under the ignored `.gsd/tdd-evidence/06-03/`):
- Task 2 lamps: `buildLampShapes > builds the two inlane arrows ...` failed on `expected undefined to be defined` (no arrow row yet). Correct reason.
- Task 2 session: `GameSession inlane flags > a drain followed by the next serve clears both` failed with `isInlaneScored is not a function`. The method did not exist yet, so this is a missing API failure on the target call, not a fixture fault.
- Task 3 lamps: `attract chase > game over runs the ... ping-pong` failed on `expected undefined to be 18` (LAMP_CHASE_DWELL_STEPS not defined). Correct reason.
- Task 3 bake: `unlit lenses > fills every fill lens ...` failed on `lamp 3: expected +0 to be 1` (no lens fill). Correct reason.
- Three Task 3 lamp cases passed at RED (expected): blink limit, tilted and chase-stops. Task 1 already latched the blink origin, Tasks 1 and 2 already made tilt keep rule state, and the chase-stops case only asserts behaviour after attract ends. They pin existing behaviour rather than drive new code.

## Files Created/Modified
- `src/render/lamps.ts` - LampTracker, the lamp shape table (rollover strokes, chevron and arrow polygons) and the target rules, including the attract chase
- `src/render/lamps.test.ts` - fade, target, idempotency/concurrency, arrow, chase, tilt, blink-limit and shape-table cases
- `src/render/table-renderer.ts` - drawLamps pass (replaces the lit-rollover stroke), RenderFrame.lamps, per-colour lamp halo sprites
- `src/render/table-renderer.test.ts` - lamp pass and frame-contract cases
- `src/render/static-layer.ts` - drawUnlitLenses (unlit lens and rim bake) called after the element loop, before the vignette
- `src/render/static-layer.test.ts` - unlit lens, fill rim, rollover rim and synthetic stroke-lens cases
- `src/game/game-session.ts` - isInlaneScored and the per-ball scored-lane record
- `src/game/game-session.test.ts` - inlane flag cases
- `src/sandbox/main.ts` - LampTracker construction, lamps.update() in onPostStep, renderFrame.lamps

## Decisions Made
- Blink and chase origins are latched on their entry edge (planned deviation from the plan text's `lampStep % 60`, see below)
- The award hold applies only while playing, so a tilt or game over cancels it
- `SKILL_LIT` equals `METER_FILL` by design. Renderer tests that assert SKILL_LIT never appears use `plungerCharge: 0`
- Lamp halo layers are baked after the ball shadow, one per distinct lit colour in shape-table order. Existing layer indices 0-3 are unchanged
- Fill-lens rims add an outward-normal filter to the plan's midpoint rule (see deviations)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Blink phase counts from the freeze, not a global `lampStep % 60`**
- **Found during:** Task 1
- **Issue:** A global modulo makes the first blink after a freeze anywhere from 1 to 30 steps long, a short flash. Task 3's blink-limit case (every cycle exactly 60) cannot hold under it.
- **Fix:** `blinkStart` is latched on the freeze edge, and the phase is `(lampStep - blinkStart) % 60`. The attract chase uses the same idea (`attractStart` on the game-over edge).
- **Files modified:** src/render/lamps.ts
- **Verification:** `blink limit: across 600 frozen updates ...` asserts every on and off interval is exactly 60 and the first off edge falls at 30
- **Committed in:** cbe09e6 (blink), 72ae1b5 (chase)

**2. [Rule 1 - Visual bug] Fill-lens rims keep only up-left facing edges**
- **Found during:** Task 3
- **Issue:** The plan's rule ("edges whose midpoint lies above-left of the lens center") also catches the underside of the arrow's left head and the bottom of the chevron's left foot. A specular rim there would read as wrong lighting.
- **Fix:** An edge must also have an outward normal facing up-left (the orientation comes from the polygon's signed area). Each chevron and arrow now gets one rim, along its top-left outer edge up to the apex.
- **Files modified:** src/render/static-layer.ts
- **Verification:** `rims every fill lens with one 0.008 m LAMP_RIM stroke along its upper-left outer edge`
- **Committed in:** 72ae1b5

**3. [Rule 3 - Blocking] Session tests call `onSwitch(kind, id)` with two arguments**
- **Found during:** Task 2
- **Issue:** The plan's interface lists `onSwitch(kind, id, bank)`, but `GameSession.onSwitch` takes two parameters. Three-argument calls failed `tsc` (TS2554).
- **Fix:** The test calls pass `(kind, id)`. The `RuleHooks` interface keeps its three-parameter shape.
- **Files modified:** src/game/game-session.test.ts
- **Committed in:** 66f93d7

---

**Total deviations:** 3 auto-fixed (2 bug, 1 blocking)
**Impact on plan:** No scope change. Deviation 1 is what makes the photosensitive-safety prohibition (no cycle shorter than 60 steps) hold. Deviation 2 is a visual-correctness refinement within the UI-SPEC "upper-left half" wording.

## Issues Encountered
- Prettier reports pre-existing formatting drift in unrelated files (e.g. reactive-elements.ts, flash.ts, view-transform.test.ts). Only the files this plan touched were formatted. Prettier is not a build or test gate.

## User Setup Required

None - no external service configuration required.

## Verification
- `npx tsc --noEmit`: pass
- `npx eslint src`: pass
- `npx vitest run`: 55 files, 973 tests pass (presentation and game determinism suites unchanged and passing)
- `npm run build`: pass

## Next Phase Readiness
- Still needs human sign-off (end-of-phase, Task 3 human-check): in attract, one light walks across the inlane arrows and rollovers about every 0.15 s; unlit chevrons and arrows read as dim tinted plastic with a faint top-left highlight; lit lamps are clearly brighter.
- 06-10 adds the ball-save ring as one `buildLampShapes` row plus a target rule. `drawUnlitLenses` already bakes a non-element stroke lens with a quarter rim.
- 06-07 backstop re-serve must not call `serveBall()`, or it would clear the inlane flags.

---
*Phase: 06-juice-polish*
*Completed: 2026-11-22*

## Self-Check: PASSED
- Files: src/render/lamps.ts, src/render/lamps.test.ts, src/render/static-layer.ts, src/game/game-session.ts all present
- Commits: 719d182, cbe09e6, c504c65, 66f93d7, a4d180d, 72ae1b5 all ancestors of HEAD
- Evaluation scope (plan-subjects) resolves the plan's commits on this branch
- All task acceptance greps pass (LampTracker, drawLamps, new LampTracker(, lamps.update(), isInlaneScored, LAMP_INLANE_500, buildLampShapes in static-layer, LAMP_CHASE_DWELL_STEPS)
