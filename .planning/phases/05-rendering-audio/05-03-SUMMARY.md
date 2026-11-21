---
phase: 05-rendering-audio
plan: 03
subsystem: audio
tags: [web-audio, synthesis, envelopes, voice-pool, mute, vitest, tdd]

requires:
  - phase: 05-rendering-audio
    provides: "05-01 cue pipeline (CueQueue, CUE_KINDS), AudioEngine tracer, AudioContextLike seam, FakeAudioContext"
provides:
  - "mapping.ts: GAIN_FLOOR_DB, strengthToGain, playbackSemitones, semitoneRatio, dbToGain"
  - "envelope.ts: ENV_FLOOR, MIN_ATTACK_S, EnvelopeSpec, EnvPoint, envelopePoints, envelopeEnd, applyEnvelope"
  - "recipes.ts: FilterSpec, LayerSpec, CueRecipe, RECIPES (one per CueKind, no wall/chute)"
  - "voice-pool.ts: MAX_VOICES 16, STEAL_FADE_S 5 ms, VoiceHandle, VoicePool, holdAt"
  - "AudioEngine: recipe-driven voices for all 13 cue kinds, pool admission, setMuted/toggleMute/isMuted, MUTE_RAMP_S, activeVoices, ENV_FLOOR re-export"
  - "FakeAudioContext.log(): comparable node + automation record for determinism tests"
affects: [05-05 cue producers, 05-06 KeyM mute binding, 05 UAT listening pass]

actuals:
  tokens: 19600
  tasks: 3
  commits: 5
plan_head_before: d63bd236f75dfbb101555dc19ef56b054d7a33a2
plan_head_after: 245e1560f412c3ba4210ea3d8ebb2a38eaef8129

tech-stack:
  added: []
  patterns:
    - "Voices as data: RECIPES (Record<CueKind, CueRecipe>) read by one generic layer builder"
    - "Envelope point math is pure; applyEnvelope is the only Web Audio writer (cancel, anchor, positive exp ramps)"
    - "Per-voice handles in a bounded pool; steal = hold + 5 ms linear fade + stop"

key-files:
  created:
    - src/audio/mapping.ts
    - src/audio/mapping.test.ts
    - src/audio/envelope.ts
    - src/audio/envelope.test.ts
    - src/audio/recipes.ts
    - src/audio/recipes.test.ts
    - src/audio/voice-pool.ts
    - src/audio/voice-pool.test.ts
    - src/audio/audio-engine.test.ts
  modified:
    - src/audio/audio-engine.ts
    - src/audio/test/fake-audio-context.ts
    - src/sandbox/cue-pipeline.test.ts

key-decisions:
  - "05-03: every cue kind is a RECIPES entry (one osc/noise source + optional biquad + own envelope gain per layer); level = peak * dB(gainDb) * strengthToGain when levelFromStrength; pitch = semitoneRatio(idSemitones + playbackSemitones) on oscillators only; the latest-ending source disconnects the voice"
  - "05-03: a filter with f1 ramps to f1 + f1PerStrength*strength over the layer's whole envelope, so launch's sweep and ring both lengthen with charge"
  - "05-03: VoicePool caps 16 global + recipe caps (bumper 4, flippers 4, sling/rollover/lane 2, rest 1); steal = earliest start then admission order, hold + 5 ms linear fade, sources stopped 0.5 ms after"
  - "05-03: holdAt() uses cancelAndHoldAtTime where present and cancelScheduledValues otherwise (Firefox lacks cancelAndHoldAtTime)"
  - "05-03: mute is a 50 ms linear master ramp; a muted flush drops its cues (no burst on unmute); engine exposes activeVoices() for tests and diagnostics"

patterns-established:
  - "Recipe data file in the tuning.ts style: documented plain consts, HMR-tunable by ear"
  - "RED stubs: signature-only modules so new tests load and fail on assertions (valid TAP RED evidence)"

requirements-completed: [AUD-01]

coverage:
  - id: D1
    description: "Bumper (and every voice) loudness follows hit strength on a -18..0 dB curve and pitch rises with strength plus bounded seeded jitter"
    requirement: AUD-01
    verification:
      - kind: unit
        ref: "src/audio/mapping.test.ts"
        status: pass
      - kind: unit
        ref: "src/audio/audio-engine.test.ts#bumper velocity and pitch (AUD-01 tracer, plan 05-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 13 cue kinds build distinct, click-free, fully cleaned-up voices from recipe data; no wall/chute recipe; launch scales with charge; per-element pitch offsets"
    requirement: AUD-01
    verification:
      - kind: unit
        ref: "src/audio/envelope.test.ts"
        status: pass
      - kind: unit
        ref: "src/audio/recipes.test.ts"
        status: pass
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Voice pool bounds the mix under bumper spam (16 global, per-kind caps, 5 ms steal fade) with deterministic stealing order"
    requirement: AUD-01
    verification:
      - kind: unit
        ref: "src/audio/voice-pool.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Master mute ramps 50 ms to 0 and back (D-02 engine side); pre-unlock mute starts silent; muted flush creates nothing"
    verification:
      - kind: unit
        ref: "src/audio/audio-engine.test.ts#master mute (D-02 engine side)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The voices sound good, distinct per element, and original (not imitating any commercial machine)"
    requirement: AUD-01
    verification: []
    human_judgment: true
    rationale: "Recipe values are research starting points (A2) and originality is a values constraint; only a listening pass at UAT can judge timbre, balance and originality."

duration: 12min
completed: 2026-11-21
status: complete
---

# Phase 5 Plan 03: Per-Element Synthesized Voices Summary

**Recipe-driven Web Audio synth: all 13 cue kinds get distinct enveloped oscillator/noise/filter voices with strength-scaled level and pitch, seeded jitter, a 16-voice pool with 5 ms steal fades, and a 50 ms ramped master mute**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-21T14:16:12Z
- **Completed:** 2026-11-21T14:28:33Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- `mapping.ts`: perceptual gain curve (-18 dB at strength 0, 0 dB at 1), pitch rise and bounded jitter drawn only from the engine's injected rng.
- `envelope.ts`: pure envelope points (anchor at 1e-4, peak clamped to [1e-4, 1], hold, 1 ms attack floor) plus `applyEnvelope` (cancel, then the points). No exponential target can reach 0.
- `recipes.ts`: one documented recipe per cue kind from the research sketch: bumper pop, slingshot snap, flipper up/down thunks (left and right a semitone apart), launch noise sweep that scales with charge, drain fall, beating tilt buzzer, warning beeps, rollover/lane bells, and the bank/start/game-over figures.
- The engine builds every voice from `RECIPES[kind]`. Every source is started once and stopped at its layer end, and the latest-ending source disconnects the whole voice.
- `VoicePool`: at most 16 voices; per-kind caps (bumper 4). Over a cap, the oldest voice is faded out over 5 ms and stopped. Voices that ended without `onended` firing are pruned at the next admission.
- Master mute: `setMuted`/`toggleMute`/`isMuted` ramp the master gain linearly to 0 and back to 0.6 over 50 ms. A mute set before unlock builds the master at 0. A muted flush drops its cues.

## Task Commits

1. **Task 1 (tracer): strength-scaled bumper level and pitch with seeded jitter** - `4549599` (feat)
2. **Task 2: enveloped per-kind recipes**: RED `2c03a8b` (test), GREEN `b7f7f0b` (feat)
3. **Task 3: voice pool and master mute**: RED `7f2c1ef` (test), GREEN `245e156` (feat)

## TDD Gate Compliance

Both tdd tasks have RED before GREEN in commit order. No REFACTOR commits were needed.

| Task | RED target (classifier verdict) | Semantic assessment |
|------|---------------------------------|---------------------|
| 2 | `envelope.test.ts > ... > ends with an exp to ENV_FLOOR at envelopeEnd = t0 + attack + hold + decay`: RED_EVIDENCE_OK | Failed on `toBeCloseTo(1.142)` because the stub `envelopeEnd` returned t0. The module loaded, so this is the planned missing behavior. |
| 2 | `recipes.test.ts > ... > launch at strength 1 ends later and sweeps its filter higher than at strength 0`: RED_EVIDENCE_OK | Failed on `toBeGreaterThan` because the engine only voiced the bumper, so no launch voice existed. |
| 3 | `voice-pool.test.ts > ... > a stolen voice fades every envelope gain over STEAL_FADE_S and stops every source`: RED_EVIDENCE_OK | Failed on `activeCount toBe(0)` because the stub pool never steals. |
| 3 | `audio-engine.test.ts > master mute ... > toggleMute returns true then false ...`: RED_EVIDENCE_OK | Failed on `toBe(true)` against the stub `toggleMute`. |

Vitest's `tap-flat` reporter writes multi-line `expected:` diagnostics for object and Set assertions, and the classifier rejects those as malformed TAP. Each RED record was therefore captured with `-t` on a target whose assertion prints on one line. The full RED runs also failed: 27 of 32 for Task 2 and 12 of 56 for Task 3.

## Files Created/Modified
- `src/audio/mapping.ts`: strength-to-gain, pitch semitones, semitone ratio, dB-to-gain
- `src/audio/envelope.ts`: ENV_FLOOR (moved here) and the envelope math and applier
- `src/audio/recipes.ts`: RECIPES data and the recipe types
- `src/audio/voice-pool.ts`: VoicePool, holdAt, MAX_VOICES, STEAL_FADE_S
- `src/audio/audio-engine.ts`: recipe-driven layer builder, pool admission, mute API, `ENV_FLOOR` re-export; the inline `BUMPER_VOICE` was removed
- `src/audio/test/fake-audio-context.ts`: `log()` for determinism comparisons
- `src/sandbox/cue-pipeline.test.ts`: case (b) now reads the first gain event that is not a cancel
- Tests: `mapping.test.ts`, `envelope.test.ts`, `recipes.test.ts`, `voice-pool.test.ts`, `audio-engine.test.ts`

## Decisions Made
- A filter `f1` ramp runs over the layer's whole envelope, so a harder launch both sweeps higher and rings longer.
- Noise layers carry `f0 = f1 = 0`; the filter sets their colour. Pitch ratio applies to oscillators only.
- Recipe values not fixed by the plan were chosen by Claude: slingshot click highpass 3 kHz, drain thud sine 60 to 40 Hz, launch and figure jitter 0, warning beep envelope 2/60/18 ms. All of these are A2 values to tune by ear.
- `activeVoices(kind?)` was added to the engine, so tests (and later diagnostics) can read the pool without reaching into private state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 05-01 tracer assertion conflicted with the cancel-first envelope**
- **Found during:** Task 2 GREEN
- **Issue:** `cue-pipeline.test.ts` (b) required each voice gain's first event to be `set`. The plan requires `applyEnvelope` to call `cancelScheduledValues(t0)` first, so the first event became `cancel`.
- **Fix:** Case (b) now checks the first event that is not a cancel. It is still a `set` at ENV_FLOOR, so the test protects the same invariant.
- **Files modified:** src/sandbox/cue-pipeline.test.ts
- **Committed in:** b7f7f0b

**2. [Rule 2 - Missing critical] Firefox has no `AudioParam.cancelAndHoldAtTime`**
- **Found during:** Task 3
- **Issue:** Steal fades and mute ramps called `cancelAndHoldAtTime`, which Firefox does not implement. There, a steal would throw inside flush (that voice would be lost) and mute would throw.
- **Fix:** `holdAt()` in voice-pool.ts calls `cancelAndHoldAtTime` when the function exists and `cancelScheduledValues` otherwise. The fake context has both methods, so the tests still see `cancelAndHold`.
- **Files modified:** src/audio/voice-pool.ts, src/audio/audio-engine.ts
- **Committed in:** 245e156

**3. [Rule 3 - Blocking] Test infrastructure for log comparisons**
- **Found during:** Task 1
- **Issue:** The determinism tests ("identical node and automation logs") had no way to serialize the fake graph.
- **Fix:** Added `FakeAudioContext.log()` (test-only file).
- **Files modified:** src/audio/test/fake-audio-context.ts
- **Committed in:** 4549599

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking)
**Impact on plan:** Needed for correctness and to keep the 05-01 tracer green. No scope creep.

## Issues Encountered
- The classifier rejected the first Task 2 RED record as malformed TAP (multi-line Vitest diagnostics). It was re-captured with `-t` on targets whose assertions print on one line; see TDD Gate Compliance.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- 05-05 can push any of the 13 cue kinds, and each one is voiced.
- 05-06 can bind KeyM to `engine.toggleMute()`.
- The listening pass at UAT should tune recipe values (A2) and caps (A3), and confirm the voices are original.
- Verification: `npx vitest run` 46 files / 632 tests passed; `npx tsc --noEmit` and `npx eslint .` are clean.

---
*Phase: 05-rendering-audio*
*Completed: 2026-11-21*

## Self-Check: PASSED
