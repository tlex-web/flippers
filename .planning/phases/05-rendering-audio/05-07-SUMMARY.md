---
phase: 05-rendering-audio
plan: 07
subsystem: testing
tags: [vitest, contract-tests, web-audio, collision-router, cue-queue, mutation-check]

requires:
  - phase: 05-rendering-audio
    provides: "05-01 ReactiveFeedback hook, CueQueue/CueFeedback, AudioEngine, AudioUnlock, FakeAudioContext, cue-pipeline real-table rig; 05-03 recipes and voice pool"
provides:
  - "Real-table proof that a throwing presentation sink leaves the simulation bit-identical (cue-pipeline case j)"
  - "Hook firing-rule contract: award then report, every rejected path silent, throwing sink leaves rule state intact"
  - "Cue ring contract: FIFO, drop-newest at 65, record reuse, clamp, impulseStrength, CueFeedback flash floor, 13 kinds with no wall or chute"
  - "Audio unlock rule contract plus a cast-free A5 type-level guard"
  - "Load-timeout todo closed on two clean back-to-back full runs"
affects: [05-04, 05-05, 05-06, phase-05-verification]

actuals:
  tokens: 12363
  tasks: 3
  commits: 3
plan_head_before: c88cb27465dd3b8f01b52ad70d0e4f0b1789a98d
plan_head_after: e0f1f6584c63570e087201a1fa948514a57069d6

tech-stack:
  added: []
  patterns:
    - "Shared gate + feedback log: ordering assertions are one toEqual over a single array"
    - "Bit-identity trace comparison (per-step ball x/y/vx/vy + gate total) to prove a sink is read-only"
    - "Mutation check of production code to show contract cases have teeth when behavior already exists"
    - "Type-level seam guard inside a test file (tsc --noEmit covers src, tests included)"

key-files:
  created:
    - src/app/cue-queue.test.ts
    - src/audio/audio-unlock.test.ts
    - .planning/todos/completed/2026-11-21-give-heavy-simulation-tests-an-explicit-timeout-so-the-suite.md
  modified:
    - src/sandbox/cue-pipeline.test.ts
    - src/game/reactive-elements.test.ts

key-decisions:
  - "No production change needed: every behavior line already held from 05-01; teeth shown by mutating production (hook order, face guard, clamp, flash floor, rollover hook order) and confirming a case goes red"
  - "makeRig in both rule tests uses the literal three-argument ReactiveElements constructor when no feedback is given, so all Phase-4 cases keep proving the default no-op path"

patterns-established:
  - "Contract suite for pre-built seams: write cases, confirm green, then prove teeth by mutation rather than by a synthetic RED"

requirements-completed: [AUD-01, RND-03]

coverage:
  - id: D1
    description: "A presentation sink that throws on every call leaves the real-table bumper-202 drop bit-identical; the router reports each throw; only the CueFeedback run queues a cue"
    requirement: AUD-01
    verification:
      - kind: integration
        ref: "src/sandbox/cue-pipeline.test.ts#(j) a throwing feedback sink leaves the simulation bit-identical and is reported by the router"
        status: pass
    human_judgment: false
  - id: D2
    description: "ReactiveFeedback fires only for registered hits, after the award, and a throwing sink leaves the cooldown and pending kick set"
    requirement: RND-03
    verification:
      - kind: unit
        ref: "src/game/reactive-elements.test.ts#ReactiveElements presentation feedback (Phase 5, AUD-01/RND-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cue ring is fixed-size and clamped; impulseStrength saturates; CueFeedback floors kick flashes; CUE_KINDS has 13 kinds and no wall or chute (D-03)"
    requirement: AUD-01
    verification:
      - kind: unit
        ref: "src/app/cue-queue.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Audio unlock follows the gesture rules over a real AudioEngine; A5 guarded by a cast-free type-level case"
    requirement: AUD-01
    verification:
      - kind: unit
        ref: "src/audio/audio-unlock.test.ts"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D5
    description: "Load-timeout todo closed on evidence"
    verification:
      - kind: other
        ref: "npx vitest run (x2 back to back, 668/668, no 'Test timed out'); npm run soak (4/4)"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-21
status: complete
---

# Phase 5 Plan 07: Presentation Seam Contract Suite Summary

**Contract cases for the 05-01 presentation seams. A sink that throws on every call leaves the real-table drop bit-identical. The feedback hook reports exactly the registered hits, after the award. The 64-record cue ring never grows and clamps every strength. The audio unlock follows the browser gesture rules, and a cast-free type check guards A5. The load-timeout todo is closed after two clean full runs.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-21T14:31:27Z
- **Completed:** 2026-11-21T14:38:38Z
- **Tasks:** 3
- **Files modified:** 5 (2 new tests, 2 extended tests, 1 todo moved)

## Accomplishments

- **Case (j), cue pipeline, real table:** the bumper-202 drop runs twice for 240 fixed steps, once with CueFeedback and once with a sink that throws. Each step records every ball's (x, y, vx, vy) plus the gate total. The two traces match with `toEqual`. The router logs `[bus] collision listener threw` with an Error, and only the CueFeedback run queues a cue.
- **Hook firing rules (11 cases):** award then kick for a bumper and a slingshot. Nothing reaches the hook for a zero impulse, a hit inside the cooldown, a not-live gate, a sub-threshold sling hit or an off-face sling hit. A lane pass reports `false`. Rollovers report false, false, then true; the bank report comes after the bonus award, with all three lights already off. When onKick throws through the real router, the kick still applies and the cooldown still holds. The three-argument constructor gives one award and one impulse per burst.
- **Cue ring and adapter (15 cases):**
  - The ring is FIFO and keeps 64 entries; the 65th push returns false, counts a drop and keeps the oldest 64.
  - `clear()` resets the size but keeps the drop count, and the same 64 record objects are reused across clear cycles.
  - Every stored strength is clamped to [0, 1]; impulseStrength handles 0, NaN, negative and past-saturation values.
  - CueFeedback floors kick flashes at KICK_FLASH_FLOOR, a bank pass queues a `bank` cue, and with no flash sink nothing throws.
  - CUE_KINDS holds 13 distinct kinds and none is wall or chute (D-03).
- **Unlock rules (9 cases):**
  - Only a trusted keydown or pointerdown reaches unlock; an untrusted event or Escape does not.
  - A trusted keydown creates exactly one context, and a later gesture on a running context never calls resume().
  - On a suspended context, the next trusted pointerdown calls resume() once.
  - If the factory throws, the context stays null, one error is logged and the factory is never called again.
  - Cues flushed before the first gesture are dropped and never replayed after the unlock.
- **A5 guard:** `toSeam(ctx: AudioContext): AudioContextLike { return ctx; }`, with no cast. Adding a member to AudioContextLike that the DOM type lacks makes tsc fail at this line (checked).
- **Todo closed:** two back-to-back full runs (48 files, 668/668, 5.5 s and 5.9 s) printed no `Test timed out` line; `npm run soak` passed 4/4.

## Task Commits

1. **Task 1: Tracer, a throwing sink on the real table** - `a8a2f75` (test)
2. **Task 2: Hook firing rules and the fixed cue ring** - `c76ab3c` (test)
3. **Task 3: Unlock rules, A5 guard, todo closed** - `e0f1f65` (test)

## Files Created/Modified

- `src/sandbox/cue-pipeline.test.ts`: `makeRig` takes an optional feedback override and exposes the gate; adds case (j).
- `src/game/reactive-elements.test.ts`: SpyGate logs to a shared log; SpyFeedback with a state probe; `makeRig(spec, feedback?, log?)` uses the 3-argument constructor when no feedback is given; 11 hook cases.
- `src/app/cue-queue.test.ts` (new): covers the ring, the clamp, impulseStrength, CueFeedback and CUE_KINDS.
- `src/audio/audio-unlock.test.ts` (new): the unlock rules and the A5 type-level case.
- `.planning/todos/completed/2026-11-21-give-heavy-simulation-tests-an-explicit-timeout-so-the-suite.md`: moved from pending, with a resolution note.

## Decisions Made

- No production file changed. Every behavior line already held from 05-01, so T-05-21 (fixes may only move the hook later or tighten a guard) never came into play.
- Contract strength was shown by mutating production and confirming a case goes red, rather than by writing a synthetic RED first (see TDD Gate Compliance).

## TDD Gate Compliance

Task 2 is `tdd="true"` inside a `type: execute` plan, and `workflow.tdd_mode` is false.

- **RED:** not obtainable, because the first run was unexpectedly green. Per the fail-fast rule, the cause was investigated: the behavior shipped in 05-01 (`b1df856` era), and this plan is its contract suite ("change production code only to fix a gap a case exposes"). Because the run was green, no failing-test record was produced for the RED evidence checker.
- **Semantic assessment:** the cases are not vacuous. Five production mutants were each killed by the intended case, and every mutant was reverted with `git checkout -- <file>`:
  - M1, rollover hook moved before the bank award: the rollover-bank case failed.
  - M2, sling face guard removed: the off-face sling case and the passive-face case failed.
  - M3, clamp removed from `push`: the clamp case failed.
  - M4, flash floor removed: the weak-kick case failed.
  - M5, onKick moved before the state writes: the bumper order, sling order and throwing-sink cases failed (and so did cue-pipeline case (j) in Task 1).
- **GREEN:** no `feat(05-07)` commit, because no production change was needed. GREEN is the existing 05-01 implementation.
- **Gate status:** a RED commit exists (`c76ab3c`, `test(05-07)`), with no GREEN commit after it. This is expected for a contract suite over existing code and is flagged here for the end-of-phase TDD review.

## Deviations from Plan

None. The plan ran as written. (The acceptance grep ` as AudioContextLike` first matched a test title, `"...returns as AudioContextLike..."`, which was not a cast. The title was reworded before commit so the guard grep stays meaningful.)

## Issues Encountered

None.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- The presentation seams are contract-proven, so 05-04, 05-05 and 05-06 can build on CueQueue, CueFeedback and AudioUnlock.
- The full suite is load-stable at testTimeout 30000, and no pending todos remain.

---
*Phase: 05-rendering-audio*
*Completed: 2026-11-21*

## Self-Check: PASSED

- All 5 key files exist on disk; pending todo absent.
- Commits a8a2f75, c76ab3c, e0f1f65 are ancestors of HEAD; 3 commits since plan_head_before.
- Acceptance re-run: tsc 0 errors, eslint src clean, 2x full suite 668/668 no timeouts, soak 4/4, `grep -c " as AudioContextLike"` = 0, `grep -c onSensor` = 3.
