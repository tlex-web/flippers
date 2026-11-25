---
phase: 05-rendering-audio
plan: 01
subsystem: audio
tags: [web-audio, cue-queue, reactive-feedback, gesture-unlock, vitest]

requires:
  - phase: 04
    provides: ReactiveElements (kick/sensor rules behind RulesGate), CollisionRouter, GameSession, FixedStepLoop composition in main.ts
provides:
  - ReactiveFeedback hook (optional 4th ReactiveElements ctor arg, frozen no-op default), called last in each registered branch
  - CueKind/CUE_KINDS vocabulary, CueQueue (64 preallocated records, drop-newest), CueFeedback adapter, impulseStrength/clamp01, FlashSink
  - AudioContextLike structural seam (DOM AudioContext assigns with no cast, A5 proven)
  - AudioEngine (lazy context, master gain 0.6 -> compressor -> destination, shared 1 s noise buffer, bumper voice, flush per frame)
  - AudioUnlock (trusted keydown/pointerdown capture listeners; ignores untrusted and Escape)
  - FakeAudioContext test recorder (nodes, connections, param events, start/stop, fireAllEnded)
  - vitest testTimeout 30000
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07]

actuals:
  tokens: 10840
  tasks: 2
  commits: 2
plan_head_before: 9c208502ff30fb3014390446eb9f55fae6f5ba74
plan_head_after: d60bd1a111c4a9a2938c6f0019312ef1530754d8

tech-stack:
  added: []
  patterns:
    - "Record on step, flush on frame: step path writes scalar cues into a fixed ring; AudioEngine.flush() (once per rAF frame) is the only place audio nodes are created"
    - "Narrow structural browser seams (AudioContextLike) with hand-rolled recorders for node-env tests; no casts in production"
    - "Presentation hooks are called as the last statement of a registered rules branch (Pitfall 8)"

key-files:
  created:
    - src/app/cue-queue.ts
    - src/audio/audio-context-like.ts
    - src/audio/audio-engine.ts
    - src/audio/audio-unlock.ts
    - src/audio/test/fake-audio-context.ts
    - src/sandbox/cue-pipeline.test.ts
  modified:
    - src/game/reactive-elements.ts
    - src/sandbox/main.ts
    - vitest.config.ts

key-decisions:
  - "Bumper noise click gets its own gain envelope (25 ms) under the main voice envelope, so every source can start(t0)/stop(end) at the common end while the click still lasts 25 ms"
  - "unlock() also calls resume() right after creating a context whose state is not running (defensive for browsers that create suspended even inside a gesture)"
  - "A voice that throws mid-build disconnects the nodes it already created before the error is reported, so no half-built voice stays attached to master"

patterns-established:
  - "CueFeedback: kicks push impulseStrength(J, ballMass(BALL_RADIUS_M)) and flash max(KICK_FLASH_FLOOR, s); sensors push 'bank' or the sensor kind at strength 1"
  - "Master chain built once per context; voices tear themselves down from the first source's onended"

requirements-completed: [AUD-01]

coverage:
  - id: D1
    description: "A registered bumper kick on the real table becomes a bumper cue (strength in (0,1]) and a flash >= KICK_FLASH_FLOOR; a not-live gate yields zero cues and flashes"
    requirement: AUD-01
    verification:
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts#(a) a registered kick on bumper 202 queues a bumper cue and a floored flash"
        status: pass
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts#(d) the same drop under a not-live gate yields zero cues and zero flashes"
        status: pass
    human_judgment: false
  - id: D2
    description: "flush() turns the cue into a started, enveloped voice that reaches the destination through master gain and compressor, and onended disconnects every voice node while the master chain stays connected"
    requirement: AUD-01
    verification:
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts#(b) flush starts an enveloped voice that reaches the destination through master and compressor"
        status: pass
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts#(c) onended disconnects every voice node; the master chain stays connected"
        status: pass
    human_judgment: false
  - id: D3
    description: "Empty, pre-unlock, clamped-strength and suspended-context edges create no node and never replay stale cues"
    requirement: AUD-01
    verification:
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts#(e) empty edge: empty and pre-unlock flushes create nothing; strengths are clamped"
        status: pass
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts#(f) concurrency edge: a suspended flush drops the cues, unlock resumes, nothing replays"
        status: pass
    human_judgment: false
  - id: D4
    description: "Gesture gate: no context before a gesture; trusted Enter creates exactly one; untrusted and Escape create none; trusted pointerdown resumes a suspended context once"
    requirement: AUD-01
    verification:
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts#(g) (h) (i) gesture gate on the real table"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live wiring compiles with the DOM AudioContext factory and no cast (A5), the full suite passes with testTimeout 30000, and the soak gates stay green"
    requirement: AUD-01
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npx eslint src && npx vitest run (530/530) && npm run soak (4/4)"
        status: pass
    human_judgment: false
  - id: D6
    description: "In the browser, after the first Enter each bumper hit is heard as a short synthesized ping, click-free, with no sound before Enter and no audio file requested"
    requirement: AUD-01
    verification: []
    human_judgment: true
    rationale: "Audibility, click-free envelopes and real-browser autoplay behavior can only be judged by ear (plan Task 2 human-check, deferred to end-of-phase UAT)"

duration: 7min
completed: 2026-11-21
status: complete
---

# Phase 5 Plan 01: Cue Pipeline Tracer Summary

**Registered bumper kicks now reach the speaker as a runtime-synthesized triangle sweep plus band-passed noise click. The path runs ReactiveFeedback -> fixed 64-record CueQueue -> per-frame AudioEngine.flush() -> master gain and compressor, on an AudioContext created inside the first trusted gesture.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-21T13:38:23Z
- **Completed:** 2026-11-21T13:45:24Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- `ReactiveElements` reports registered kicks and sensor passes through an optional 4th-argument `ReactiveFeedback`, called after the award, cooldown and pending kick are set. Every existing 3-argument caller is unchanged.
- `CueQueue` gives the step path a record-only channel with no allocation. `CueFeedback` turns rules facts into cues and flashes. There is no wall or chute cue kind, so D-03's silent walls hold by construction.
- `AudioEngine` builds the master chain once and plays the bumper voice. It drops cues when there is no context or the context is not running.
- `AudioUnlock` is attached in main.ts and `audio.flush(cues)` runs every frame. The DOM factory compiles against `() => AudioContextLike` with no cast, which proves A5.
- `testTimeout: 30000` landed. The full suite passed 530/530 with no timeouts and the soak passed 4/4.

## Task Commits

1. **Task 1: Tracer, from a registered bumper kick to a started, master-routed voice:** `47859a2` (feat)
2. **Task 2: Gesture unlock plus live wiring, so bumper hits are heard:** `d60bd1a` (feat)

## Files Created/Modified
- `src/game/reactive-elements.ts`: `ReactiveFeedback`, `NO_FEEDBACK`, the 4th ctor param, and hook calls at the end of the kick, lane and rollover/bank branches
- `src/app/cue-queue.ts`: cue vocabulary, ring, strength helpers, `FlashSink`, `CueFeedback`
- `src/audio/audio-context-like.ts`: the structural Web Audio seam
- `src/audio/audio-engine.ts`: `AudioEngine`, master and compressor constants, `BUMPER_VOICE` recipe
- `src/audio/audio-unlock.ts`: gesture unlock
- `src/audio/test/fake-audio-context.ts`: recorder fake (throws on an exponential ramp to <= 0 and on a double `start()`)
- `src/sandbox/cue-pipeline.test.ts`: real-table cases (a)-(i)
- `src/sandbox/main.ts`: cue and audio composition, flush in `frame()`
- `vitest.config.ts`: `testTimeout: 30000`

## Decisions Made
- The noise click has its own 25 ms gain envelope under the main envelope. Every source can then stop at the common voice end and the click still lasts 25 ms.
- `unlock()` resumes a newly created context if its state is not `running`. This is a defensive step for Safari-style suspended creation.
- A voice whose build throws partway disconnects the nodes it already created, then reports `[audio] voice failed`.

## Deviations from Plan

None. The plan was executed as written. The mutation check for Task 1 removed the `feedback.onKick` call: cases (a), (b), (c) and (f) went red, and the call was restored.

## Issues Encountered
None

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- 05-07 can add the exhaustive hook, ring and unlock contracts on top of these seams. 05-03 can replace the fixed bumper voice with `recipes.ts` and `mapping.ts`.
- The ear check is still open and belongs to end-of-phase UAT: run `npm run dev`, press Enter, then Space, and listen for bumper pings.
- The 2026-11-21 timeout todo stays in pending as the plan specifies. 05-07 closes it after back-to-back full runs.

---
*Phase: 05-rendering-audio*
*Completed: 2026-11-21*

## Self-Check: PASSED
