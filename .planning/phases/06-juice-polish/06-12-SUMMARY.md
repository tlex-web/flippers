---
phase: 06-juice-polish
plan: 12
subsystem: render
tags: [particles, canvas2d, typed-arrays, mulberry32, juice, photosensitive-safety]

requires:
  - phase: 06-juice-polish
    provides: "06-09 effects seam (CueFeedback -> FxSink -> EffectsTracker -> renderer), shake, reduced motion at the renderer"
  - phase: 06-juice-polish
    provides: "06-10 renderer draw order and RenderFrame.effects"
provides:
  - "ParticlePool: 160-slot struct-of-arrays pool, overwrite-oldest, own seeded mulberry32 stream, fixed-step tick (drag 4/s, gravity +2 m/s^2)"
  - "Bumper burst (one shockwave ring 1.0R -> 2.0R over 24 steps + round(12 + 4s) rim sparks) and sling sparks (round(6 + 4s) along the kick-face normal)"
  - "Contact point on the feedback path: ReactiveFeedback.onKick / CueFeedback / FxSink.onKick carry (px, py)"
  - "drawParticles: last pass under lighter, streaks and ring arcs, alpha (1 - age/life)^2"
  - "Spark life cap at emit (PARTICLE_MAX_TRAVEL_M = 0.6, sparkTravelBound) holding the 0.63 m footprint"
affects: [06-13 reward glints and save sparks on the same pool, 06-14 presentation determinism]

actuals:
  tokens: 14150
  tasks: 2
  commits: 3
plan_head_before: 7455aa289ce96ba1e15ebcc598fdd810764a79a4
plan_head_after: f5b7aa097c74f290f9b84c32f33116f66ccbc1ee

tech-stack:
  added: []
  patterns:
    - "Struct-of-arrays particle pool with a ring head (no allocation after construction)"
    - "Presentation randomness from a dedicated seeded stream, drawn only on the step path"
    - "Safety bound enforced at emit by capping life against a closed-form travel bound"

key-files:
  created:
    - src/render/particles.ts
    - src/render/particles.test.ts
  modified:
    - src/render/effects.ts
    - src/game/reactive-elements.ts
    - src/app/cue-queue.ts
    - src/render/table-renderer.ts
    - src/sandbox/cue-pipeline.test.ts
    - src/render/table-renderer.test.ts
    - src/app/cue-queue.test.ts
    - src/render/shake.test.ts

key-decisions:
  - "Spark travel is held under the 0.63 m footprint by capping a spark's life at emit (PARTICLE_MAX_TRAVEL_M = 0.6 against the exact discrete launch + gravity bound), not by lowering speeds; the stream draws stay unchanged and bumper lives stay inside 0.30-0.45 s"
  - "The ring's alpha is 0.9 x (1 - age/life)^2 and a bumper spark spawns on the rim at center + R * n facing the contact (Claude's discretion per plan)"

patterns-established:
  - "Per-element emitter geometry precomputed into Float64Arrays indexed by element id"
  - "Particle pass drawn last under lighter, one index loop per kind with its color set once"

requirements-completed: [PLSH-02]

coverage:
  - id: D1
    description: "Allocation-free 160-slot particle pool on the step clock with its own seeded stream (overwrite-oldest, same-seed identity, tick law)"
    requirement: PLSH-02
    verification:
      - kind: unit
        ref: "src/render/particles.test.ts#ParticlePool storage (T-6-27)"
        status: pass
      - kind: unit
        ref: "src/render/particles.test.ts#ParticlePool tick (step clock)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bumper hits emit one ring + 12-16 rim sparks within 80 degrees; sling kicks emit 6-10 sparks within 35 degrees of the face normal; speeds and lives in range"
    requirement: PLSH-02
    verification:
      - kind: unit
        ref: "src/render/particles.test.ts#EffectsTracker emitters (PLSH-02, D-19)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Photosensitive footprint: no spark travels farther than 0.63 m and no ring exceeds 2.0R across 1,000 seeded bursts"
    requirement: PLSH-02
    verification:
      - kind: unit
        ref: "src/render/particles.test.ts#particle footprint (T-6-25, photosensitive safety)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real-table contact-point path: a registered bumper-202 kick reaches the EffectsTracker with the event's own point and sparks spawn on the rim; a not-live gate emits nothing"
    requirement: PLSH-02
    verification:
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts#(k) and (l) impact particles on the real table"
        status: pass
    human_judgment: false
  - id: D5
    description: "Particle pass: last under lighter, one streak per live spark in its element color, one arc per live ring, no gradient/blur/text, ends clean, nothing drawn when empty, still drawn under reduced motion"
    requirement: PLSH-02
    verification:
      - kind: unit
        ref: "src/render/table-renderer.test.ts#TableRenderer particle pass (PLSH-02, D-19, D-24)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Bursts read as a satisfying impact in the live game (feel and readability)"
    requirement: PLSH-02
    verification:
      - kind: manual_procedural
        ref: "Task 1 tracer human-verify checkpoint (npm run dev, ball into bumpers): approved"
        status: pass
    human_judgment: true
    rationale: "Spark feel and readability are perceptual; the user approved the live burst at the Task 1 tracer gate"

duration: 16min
completed: 2026-11-23
status: complete
---

# Phase 6 Plan 12: Impact Particles Summary

**Bumper hits burst into a pink shockwave ring plus 12-16 rim sparks and sling kicks throw 6-10 amber sparks, all from one seeded 160-slot typed-array pool on the step clock, with spark life capped at emit so nothing travels beyond the 0.63 m photosensitive footprint**

## Performance

- **Duration:** about 16 min of execution (plus the Task 1 tracer checkpoint wait)
- **Started:** 2026-11-23T00:08:33Z
- **Completed:** 2026-11-23T00:24:14Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- `ParticlePool` (src/render/particles.ts): 160 slots of Float32Array fields plus a Uint8Array kind, overwrite-oldest ring head, its own `mulberry32(PARTICLE_SEED)` stream, fixed-step tick with drag 4/s and gravity +2 m/s^2. Nothing is allocated after construction.
- Emitters in `EffectsTracker.onKick`. A bumper gets one ring (1.0R to 2.0R over 24 steps) and round(12 + 4s) sparks from the rim point facing the contact, at ±80°, 1.5-3.0 m/s, life 0.30-0.45 s. A slingshot gets round(6 + 4s) sparks along its kick-face normal, at ±35°, 1.2-2.4 m/s, life 0.20-0.32 s.
- The contact point now travels the whole step path: `e.normalImpulse, e.point.x, e.point.y` -> ReactiveFeedback -> CueFeedback -> FxSink. A contact that is rejected or not live emits nothing.
- `drawParticles` is the last pass, drawn under "lighter": 0.012 m streaks and ring arcs with alpha (1 - age/life)^2 (the ring at 0.9×). It creates no gradient, uses no blur, draws no text and leaves the canvas at alpha 1 / source-over.
- The footprint gap is closed: a spark's life is capped at emit using an exact bound on how far it can travel, so the 0.63 m footprint always holds.

## Task Commits

1. **Task 1: Tracer. A bumper hit in the live game bursts into a shockwave ring and sparks from the rim** - `25622c0` (feat). The tracer human-verify gate (gate=blocking) was approved by the user.
2. **Task 2: The pool, the emitters, the contact-point path and the particle pass are pinned** (TDD)
   - RED: `7bc9ee0` (test)
   - GREEN: `f5b7aa0` (feat)

**Plan metadata:** see the docs(06-12) commit

## TDD Gate Compliance

- **RED** (`7bc9ee0`): the target was `src/render/particles.test.ts#particle footprint (T-6-25, photosensitive safety) > across 1,000 seeded bumper bursts no spark travels farther than 0.63 m from its spawn and no ring radius exceeds 2.0R`. Evidence came from a Vitest JUnit report checked with `gsd-tools check tdd-red-evidence`, which returned `RED_EVIDENCE_OK` (`target_test_failed`, 12 tests, 1 failure). Semantic check: the target ran and failed on the planned assertion, `expected 0.7251041118116673 to be less than or equal to 0.63`. This is the known gap: a fast, long-lived spark aimed down picks up extra travel from gravity. There were no load, syntax or fixture faults. The other new cases pin Task 1 behaviour and passed as expected.
- **GREEN** (`f5b7aa0`): `capSparkLife` in `emitSpark`. All 1245 tests pass.
- **REFACTOR:** none needed.

## Files Created/Modified

- `src/render/particles.ts` - the pool, kind codes, `PARTICLE_MAX_TRAVEL_M`, `sparkTravelBound` and the life cap
- `src/render/particles.test.ts` - storage, tick law, emitter, and footprint cases (new)
- `src/render/effects.ts` - per-id bumper and sling emitter geometry, ring and spark emission, `particles` ownership, wider `EffectsReader`
- `src/game/reactive-elements.ts` - `ReactiveFeedback.onKick(kind, id, impulse, px, py)`
- `src/app/cue-queue.ts` - `CueFeedback` / `FxSink.onKick` forward (px, py)
- `src/render/table-renderer.ts` - `drawParticles`, `drawRings` and `drawSparks` as the last pass
- `src/sandbox/cue-pipeline.test.ts` - real-table cases (k) contact point and rim spawn, (l) not-live emits nothing
- `src/render/table-renderer.test.ts` - particle pass cases (live, reduced motion, empty/dead)
- `src/app/cue-queue.test.ts`, `src/render/shake.test.ts` - Task 1 call-site updates for the new signature

## Decisions Made

- The travel bound is enforced by capping life, not speed. The bound adds the exact discrete launch term to the gravity term, so it holds in every direction. It uses one extra step as headroom for float32 rounding of stored age and life. Bumper lives stay at 0.30 s or more (at 3 m/s the cap bottoms out at about 0.31 s), and sling sparks never reach the cap.
- `PARTICLE_MAX_TRAVEL_M = 0.6` sits below the 0.63 m test bound to leave margin.

## Deviations from Plan

None. The plan expected the travel fix ("clamping spark speed or life so the 0.63 m travel bound always holds") and the life cap is that fix.

## Issues Encountered

- The project-root pin guard failed once because it was run from the scratchpad directory, which is not a git checkout. Rerun from the project root, it passed, and every write and commit came after a passing run.
- Pre-existing prettier drift in the `src/sandbox/cue-pipeline.test.ts` import block (lines 21-25) was left alone because it is out of scope. All new code is prettier-clean.

## Known Stubs

None. `EffectsTracker.onSensor` is still a deliberate no-op; 06-13 adds the sensor glints there.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- 06-13 can add the GLINT_*, MOTE_* and SPARK_SAVE kinds to the same pool and draw pass. Any spark kind it adds gets the travel cap automatically.
- presentation.determinism.test.ts and game.determinism.test.ts pass unchanged; 06-14 attaches the full EffectsTracker.
- `npm run build`, `npx tsc --noEmit`, `npx eslint src` and `npx vitest run` (1245 tests) all pass.

---
*Phase: 06-juice-polish*
*Completed: 2026-11-23*

## Self-Check: PASSED
