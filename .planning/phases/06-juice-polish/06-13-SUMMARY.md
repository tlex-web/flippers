---
phase: 06-juice-polish
plan: 13
subsystem: render
tags: [particles, canvas2d, sprites, reward-glint, ball-save, juice, photosensitive-safety]

requires:
  - phase: 06-juice-polish
    provides: "06-12 ParticlePool (seeded stream, fixed-step tick, spark travel cap), EffectsTracker emitters, drawParticles pass"
  - phase: 06-juice-polish
    provides: "06-11 PresentationObserver fx seam (ObserverFx) and skill/save counters"
  - phase: 06-juice-polish
    provides: "06-10 ball-save post element 610 and getSaveCount; 06-07 getLastSaveKind"
provides:
  - "bakeStar(layers, hexColor, sizePx) and STAR_GLINT_M = 0.24: one baked 4-point star per glint color at resize"
  - "Particle kinds GLINT_ROLLOVER/INLANE/SKILL, MOTE_ROLLOVER/INLANE/SKILL, SPARK_SAVE; GLINT_LIFE_STEPS = 42; emitGlint, emitMote, draw()"
  - "Rollover/inlane passes: one glint + 3-4 up-table motes at the sensor midpoint (FLASH_SENSOR / INLANE_LIT)"
  - "Skill-shot award: same reward look in SKILL_LIT at the awarded lane (EffectsTracker.onSkillShot)"
  - "Kickback save: 10 SAVE_LIT sparks off the post top rim within +/-80 degrees of up (EffectsTracker.onSave); backstop emits none"
  - "ObserverFx.onSkillShot / onSave and ObserverSession.getLastSaveKind, called once per counter increment"
affects: [06-14 presentation determinism (bare-vs-presented replay), phase verification of PLSH-02]

actuals:
  tokens: 12833
  tasks: 2
  commits: 3
plan_head_before: 3d0205cbd47ba73418a83bf0e678dc607add720f
plan_head_after: 241eeb2656cafb8b66d3e951bb43ea88426c8bca

tech-stack:
  added: []
  patterns:
    - "Reward vs impact particle vocabulary on one pool: static baked-sprite glint + constant-velocity motes vs dragged, gravity-pulled streak sparks"
    - "Per-color sprite baked once at resize, stamped with drawImage under lighter in the live pass"

key-files:
  created: []
  modified:
    - src/render/particles.ts
    - src/render/effects.ts
    - src/render/sprites.ts
    - src/render/table-renderer.ts
    - src/sandbox/presentation-observer.ts
    - src/render/particles.test.ts
    - src/render/table-renderer.test.ts
    - src/sandbox/presentation-observer.test.ts

key-decisions:
  - "Kickback save sparks spread +/-80 degrees around straight up (0, -1) from post center + R*(0, -1) on the bumper (impact) speed 1.5-3.0 m/s and life 0.30-0.45 s; the post kick normal is not reported, and probe normals sit within ~12 degrees of up"
  - "Motes move at constant velocity (no drag, no gravity) with a +/-15 degree heading jitter, so they drift up for their whole 0.6-0.8 s life; the 3-or-4 count is one draw from the pool's own stream"
  - "A bank-completing rollover pass still glints as a rollover pass (D-17's lights-only rule applies to the shake); the skill glint sits at the awarded rollover's midpoint"

patterns-established:
  - "Observer fx hooks read the 'last X' getter once per step and call the sink once per counter increment, right after the matching cue push"

requirements-completed: [PLSH-02]

coverage:
  - id: D1
    description: "Rollover and inlane passes emit one static 42-step glint and 3-4 up-table motes (0.15-0.30 m/s, constant speed) at the sensor midpoint in their own kinds"
    requirement: PLSH-02
    verification:
      - kind: unit
        ref: "src/render/particles.test.ts#EffectsTracker reward and save emitters (06-13, D-19)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Skill-shot award plays the reward glint and motes in the skill kinds at the awarded lane; unknown lane emits nothing"
    requirement: PLSH-02
    verification:
      - kind: unit
        ref: "src/render/particles.test.ts#onSkillShot(402) emits one GLINT_SKILL and 3 or 4 MOTE_SKILL at rollover 402's midpoint; an unknown or non-sensor lane emits nothing"
        status: pass
    human_judgment: false
  - id: D3
    description: "Kickback save throws exactly 10 SPARK_SAVE sparks from the post top rim within 80 degrees of up; backstop and none emit nothing"
    requirement: PLSH-02
    verification:
      - kind: unit
        ref: "src/render/particles.test.ts#onSave(kickback) emits exactly 10 SPARK_SAVE sparks from the post's top rim point, each within 80 degrees of straight up, with the impact speed and life"
        status: pass
      - kind: unit
        ref: "src/render/particles.test.ts#onSave(backstop) and onSave(none) emit nothing"
        status: pass
    human_judgment: false
  - id: D4
    description: "Observer calls fx.onSkillShot(getLastSkillLane()) and fx.onSave(getLastSaveKind()) once per counter increment, never without one"
    requirement: PLSH-02
    verification:
      - kind: unit
        ref: "src/sandbox/presentation-observer.test.ts#PresentationObserver: skill-shot and save effects (06-13, D-19)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Renderer stamps baked stars (side 0.24*(0.6+0.4t), alpha (1-t)^2, lighter), 0.018 m mote discs per color and SAVE_LIT streaks with no gradient/blur/text/allocation; glint never exceeds 0.24 m"
    requirement: PLSH-02
    verification:
      - kind: unit
        ref: "src/render/table-renderer.test.ts#TableRenderer reward particles (plan 06-13, D-19, D-24)"
        status: pass
      - kind: unit
        ref: "src/render/asset-free.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Reward look reads as distinct from impact sparks, and the skill star / kickback fan read well in play"
    requirement: PLSH-02
    verification: []
    human_judgment: true
    rationale: "Perceptual read; the Task 1 rollover/inlane glint was human-approved at the tracer gate, the skill-shot and kickback flourishes have not yet been eyeballed in the live game"

duration: 20min
completed: 2026-11-23
status: complete
---

# Phase 6 Plan 13: Reward Glints and Save Sparks Summary

**Baked 4-point star glints with rising motes on rollover, inlane and skill-shot awards, and a 10-spark SAVE_LIT fan off the post on a kickback save, all on the 06-12 seeded particle pool**

## Performance

- **Duration:** 20 min (excluding the Task 1 checkpoint wait)
- **Started:** 2026-11-23T00:29:16Z
- **Completed:** 2026-11-23T00:49:42Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Rollover and inlane passes sparkle: one star glint 0.24 m across that scales 0.6 to 1.0 over 42 steps and fades at (1 - age/life)^2, plus 3-4 motes of 0.018 m drifting up-table at 0.15-0.30 m/s (FLASH_SENSOR / INLANE_LIT)
- A skill-shot award plays the same reward look in SKILL_LIT at the awarded lane
- A kickback save throws 10 violet SAVE_LIT sparks up off the post (within +/-80 degrees of straight up, impact speed and life, travel-capped); a backstop save throws none
- Star sprite baked once per glint color at resize; the live pass only stamps it with drawImage under "lighter" (no gradient, blur, text or allocation)
- Observer reaches the effects with scalars only: fx.onSkillShot(lane) and fx.onSave(kind) once per counter increment, so presentation never writes the sim

## Task Commits

1. **Task 1: Tracer. A rollover pass sparkles with a star glint and rising motes** - `6999725` (feat). The tracer feedback gate was a human-verify checkpoint; the user approved the live rollover/inlane read ("approved").
2. **Task 2: Skill shot glints, kickback throws save sparks, every reward particle pinned** - `0f2cb0c` (test, RED), `241eeb2` (feat, GREEN). No refactor commit was needed.

**Plan metadata:** recorded in the docs commit that adds this SUMMARY

## TDD Gate Compliance (Task 2)

- **RED** `0f2cb0c`: 6 target cases failed: 3 in particles.test.ts (`fx.onSkillShot` / `fx.onSave` not a function) and 3 in presentation-observer.test.ts (assertion: `fx.calls` lacked `skill:402`, `save:kickback`, `save:backstop`). Evidence came from Vitest JUnit runs, and both records returned `RED_EVIDENCE_OK` (`target_test_failed`). Targets: "PresentationObserver: skill-shot and save effects (06-13, D-19) > a skill-count increment calls fx.onSkillShot(getLastSkillLane()) once, after its cue" and "EffectsTracker reward and save emitters (06-13, D-19) > onSave(backstop) and onSave(none) emit nothing". **Semantic assessment:** the observer target ran and failed on its planned assertion, because the observer never calls the hook. The effects targets failed because the planned method did not exist yet, which is the missing behavior itself. There were no load, import or collection faults. The renderer pins and sensor-emitter pins already passed at RED, because Task 1 had shipped that behavior. They are pinning cases, not RED targets.
- **GREEN** `241eeb2`: all 246 tests in src/render and the observer pass; the full suite has 1262 passing.

## Files Created/Modified
- `src/render/particles.ts` - glint/mote/save-spark kinds, GLINT_LIFE_STEPS, emitGlint, emitMote, draw(); per-kind tick motion (Task 1)
- `src/render/sprites.ts` - STAR_GLINT_M, bakeStar (Task 1)
- `src/render/table-renderer.ts` - three star bakes at resize; glint, mote and SAVE_LIT spark loops in drawParticles (Task 1)
- `src/render/effects.ts` - sensor midpoint cache and reward emission in onSensor (Task 1); pathMidpoint export; onSkillShot, onSave, post geometry, SAVE_SPARK_COUNT / SAVE_SPARK_SPREAD_RAD (Task 2)
- `src/sandbox/presentation-observer.ts` - ObserverFx.onSkillShot/onSave, ObserverSession.getLastSaveKind, calls beside the skillShot and ballSave pushes (Task 2)
- `src/render/particles.test.ts`, `src/render/table-renderer.test.ts`, `src/sandbox/presentation-observer.test.ts` - reward/save pins (Task 1: layer count; Task 2: all behavior lines)

## Decisions Made
- Save sparks spread around straight up from the post's top rim, on the bumper spark speed/life ranges. The emit-time travel cap from 06-12 holds the 0.63 m footprint.
- Motes move at constant velocity with a small heading jitter, and the mote count is one draw from the pool stream.
- A bank-completing pass glints as a rollover pass. The skill glint sits at the awarded rollover's midpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renderer layer-count pin re-based for the star sprites**
- **Found during:** Task 1
- **Issue:** the new star bakes changed the layers one resize creates, so the existing `LAYERS_PER_RESIZE` pin in table-renderer.test.ts failed
- **Fix:** added `STAR_LAYERS = 3` to `LAYERS_PER_RESIZE`. The stars are baked after the lamp halos, so the shadow layer index is unchanged.
- **Files modified:** src/render/table-renderer.test.ts
- **Verification:** the full renderer suite passes
- **Committed in:** 6999725

**2. [Rule 3 - Blocking] pathMidpoint moved into effects.ts**
- **Found during:** Task 1
- **Issue:** the glint needs the same sensor midpoint that the renderer's sensor halo uses
- **Fix:** moved `pathMidpoint` from table-renderer.ts into effects.ts as an export, so the glint and the halo share one midpoint
- **Files modified:** src/render/effects.ts, src/render/table-renderer.ts
- **Verification:** sensor halo and glint placement tests pass
- **Committed in:** 6999725

**3. [Rule 2 - Missing Critical] `ParticlePool.draw()` added**
- **Found during:** Task 1
- **Issue:** the 3-or-4 mote count must come from the pool's seeded stream (D-23 determinism), and the plan named no accessor for it
- **Fix:** added a public `draw()` that takes one value from the pool's own stream
- **Files modified:** src/render/particles.ts
- **Committed in:** 6999725

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical)
**Impact on plan:** no scope creep. All three changes were small and needed to keep the existing pins and determinism intact.

## Issues Encountered
- presentation-observer.test.ts uses CRLF and already fails `prettier --check` at HEAD. That is pre-existing and was left alone (an EOL-aware edit kept CRLF). Other pre-existing prettier failures listed by the prior executor were not touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PLSH-02 now covers both halves (impact and reward). 06-14 can run the bare-vs-presented determinism replay over the full particle vocabulary.
- The skill-shot star and kickback fan still need a perceptual check in the live game (D6, human_judgment).

---
*Phase: 06-juice-polish*
*Completed: 2026-11-23*

## Self-Check: PASSED
- All 8 modified files are present on disk
- Commits 6999725, 0f2cb0c and 241eeb2 are ancestors of HEAD; evaluation-scope resolves 3 plan commits
- Acceptance criteria: `fx.onSkillShot(` x2, `onSave` in effects.ts x1, `export function bakeStar` x1, `GLINT_` x7, `bakeStar(` in the renderer x3
- `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (1262 passed) and `npm run build` all exit 0
