---
phase: 05-rendering-audio
plan: 06
subsystem: presentation
tags: [mute, game-input, determinism, hud, css, space-theme, rnd-01, rnd-02, aud-01]

requires:
  - phase: 05-03
    provides: AudioEngine.toggleMute / isMuted with the 50 ms master ramp (D-02)
  - phase: 05-05
    provides: PresentationObserver game-event and flipper-coil cues
  - phase: 05-07
    provides: element flashes (FlashTracker, ContactFlash) wired in main.ts
  - phase: 05-08
    provides: interpolateBalls / interpolateAngles render helpers
provides:
  - GameEdges.mute and the KeyM press-only binding in GameInput
  - main.ts onFixedStep calls audio.toggleMute() on the mute edge
  - The sixth controls row (Mute, kbd data-code="KeyM", layout-relabelled)
  - src/sandbox/presentation.determinism.test.ts proving the whole presentation layer read-only at 144 and 60 Hz
  - Space-theme DOM HUD (CSS only) and the D-01 / SC1 note in index.html; page titled Flippers
affects: [phase 05 verification and UAT, phase 06]

actuals:
  tokens: 7457
  tasks: 3
  commits: 3
plan_head_before: c7d2e086960fc5b75ce78859a1d472ba093be6c8
plan_head_after: e046b27400e1817efe0bfd15123889af654fbfa3

tech-stack:
  added: []
  patterns:
    - "Presentation-attached replay: the bare composition and the full presentation stack run the same scripted timeline; equality of every sim observable plus non-vacuity tallies proves read-only"
    - "HUD colors as CSS custom properties on :root echoing palette.ts meanings"

key-files:
  created:
    - src/sandbox/presentation.determinism.test.ts
  modified:
    - src/input/game-input.ts
    - src/input/game-input.test.ts
    - index.html
    - src/ui/key-labels.test.ts
    - src/sandbox/main.ts

key-decisions:
  - "HUD colors moved into CSS custom properties (04-UI-REVIEW #8) while restyling; values follow the plan's palette (cyan frames, magenta status, #e8f7ff text)"
  - "The determinism proof computes the three runs once in beforeAll and shares them between the equality and the non-vacuity cases"
  - "Static-layer blits are counted per frame as drawImage calls whose source is the recording factory's first layer (the static bake), and the log is cleared every frame"

patterns-established:
  - "Bare-vs-presented replay as the read-only gate for any new presentation module"

requirements-completed: [RND-01, RND-02, AUD-01]

coverage:
  - id: D1
    description: "KeyM is one press-only mute edge (auto-repeat and duplicate keydowns ignored, preventDefault for KeyM only, blur re-arms, foreign codes never latch) and main.ts toggles the ramped master mute on it"
    requirement: AUD-01
    verification:
      - kind: unit
        ref: "src/input/game-input.test.ts"
        status: pass
      - kind: other
        ref: "grep -c \"toggleMute()\" src/sandbox/main.ts (1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The controls list has exactly six rows, the sixth Mute with a kbd data-code KeyM that the layout relabel applies to"
    requirement: AUD-01
    verification:
      - kind: unit
        ref: "src/ui/key-labels.test.ts#index.html markup"
        status: pass
    human_judgment: false
  - id: D3
    description: "The full presentation layer (CueQueue, FlashTracker, CueFeedback, ContactFlash, PresentationObserver, AudioEngine, TableRenderer) leaves the scripted game bit-identical at 144 and 60 Hz, and the presented runs are non-vacuous"
    requirement: RND-02
    verification:
      - kind: integration
        ref: "src/sandbox/presentation.determinism.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The DOM HUD wears the space theme with CSS only, no assets; the asset gate passes over the restyled index.html"
    requirement: RND-01
    verification:
      - kind: unit
        ref: "src/render/asset-free.test.ts"
        status: pass
    human_judgment: true
    rationale: "Whether the HUD reads as part of the space theme and stays legible is a visual judgment (phase UAT)"
  - id: D5
    description: "Mute fade is click-free and sound returns on unmute"
    requirement: AUD-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 human-verify checkpoint (user: approved)"
        status: pass
    human_judgment: true
    rationale: "The fade and absence of clicks are judged by ear; the user approved it at the Task 1 checkpoint"

duration: 15min
completed: 2026-11-21
status: complete
---

# Phase 5 Plan 06: Mute, Space HUD and Read-Only Proof Summary

**M toggles a ramped master mute through one press-only KeyM edge and a sixth controls row, a bare-vs-presented replay proves the renderer, flashes, observer, cue ring and audio engine leave the simulation bit-identical at 144 and 60 Hz, and the DOM HUD is restyled to the space theme with CSS only.**

## Performance

- **Duration:** about 15 min of active execution (wall clock 16:21 to 21:05 local, mostly the Task 1 human-verify wait)
- **Started:** 2026-11-21T15:21:46Z
- **Completed:** 2026-11-21T20:05:43Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- D-02: KeyM latches a press-only `mute` edge in `GameInput`. `main.ts` calls `audio.toggleMute()` on it, the master gain ramps over 50 ms, and the controls list shows `Mute · M` with a layout-relabelled key cap. The user approved this by ear in the browser.
- RND-02 integrity (T-05-18): `presentation.determinism.test.ts` runs the scripted Phase-4 game three ways: bare at 144 Hz, then with the full presentation stack at 144 Hz and at 60 Hz. All three agree exactly on steps, totalSteps, score, ball, state, hasPlayed, every ball's (id, x, y, vx, vy, angle) and both flipper angles. The presented runs tallied start, launch, warning, tilt and drain cues plus at least 2 flipperUp and 2 flipperDown cues. They started voices, blitted the static layer once per frame, dropped no cues and ended muted.
- D-01: the HUD stays DOM text, restyled with CSS only. It has a dark radial space background, a cyan-framed glowing stage and panels, a glowing score, a magenta status line and cyan key caps, all on system monospace with no font file and no `url()`. The page is titled "Flippers", and the stale sandbox comment is now the D-01 / SC1 note.
- Phase gate green: tsc, eslint, 52 files / 738 tests, soak (4/4), build.

## Task Commits

1. **Task 1: Tracer. M mutes and unmutes the game, controls list shows it (D-02)** - `70e6475` (feat)
2. **Task 2: The full presentation layer attached leaves the scripted game bit-identical** - `552c900` (test)
3. **Task 3: The DOM HUD wears the space theme (D-01) and the phase gate is green** - `e046b27` (feat)

## Files Created/Modified

- `src/input/game-input.ts`: `GameEdges.mute`, the `KeyM -> "mute"` binding, drained and reset like the nudges
- `src/input/game-input.test.ts`: KeyM latch, repeat, duplicate, preventDefault, blur, independence and foreign-code cases
- `src/sandbox/main.ts`: `if (ge.mute) audio.toggleMute();` in onFixedStep
- `src/ui/key-labels.test.ts`: KeyM in the markup CODES list; exactly six controls rows
- `src/sandbox/presentation.determinism.test.ts`: the bare-vs-presented replay proof (new)
- `index.html`: the Mute row, the space-theme CSS (custom properties), the D-01 note, the title

## Decisions Made

- I moved the HUD colors into CSS custom properties during the restyle (04-UI-REVIEW warning #8). The values are the plan's palette, and contrast stays AA on the panel: label #7f8bd6 about 6.2:1, muted #8892b0 about 6:1, status #f72585 about 5.2:1.
- The three replay runs are computed once in `beforeAll` and shared by the equality case and the non-vacuity case.

## Deviations from Plan

None. The plan was executed as written; the CSS custom properties are an implementation detail inside the CSS-only restyle.

## Issues Encountered

- The first draft of the restyle comment contained the literal text "url()". The asset gate's CSS url() pattern would have flagged it, so I reworded the comment before running the gate. No gate failure happened.

## Known Stubs

None.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- All 8 plans of phase 5 have SUMMARYs. The phase is ready for verification and the end-of-phase UAT batch: the VALIDATION manual table, the Task 3 human-check, a 60/144 Hz frame-pacing trace, HiDPI crispness, the HUD theme and legibility, a headphone listening pass, M mute, and a Network tab check for zero assets.
- Carried forward: the STATE.md concern about the plunger re-feed at 144 Hz.

---
*Phase: 05-rendering-audio*
*Completed: 2026-11-21*

## Self-Check: PASSED

- FOUND: src/sandbox/presentation.determinism.test.ts, .planning/phases/05-rendering-audio/05-06-SUMMARY.md
- FOUND commits on HEAD: 70e6475, 552c900, e046b27 (3 = `git rev-list --count c7d2e08..HEAD`)
- Acceptance greps re-run: KeyM in game-input.ts, data-code KeyM and Mute row in index.html, KeyM in key-labels.test.ts, toggleMute() in main.ts and in the determinism test, title Flippers, no "Physics Sandbox" / "Throwaway diagnosis sandbox", D-01 present, "76, 201, 240" x6, aria-live polite x1, innerHTML in src x0
- Plan verification: tsc --noEmit OK, eslint src OK, vitest 52 files / 738 tests passed, soak 4/4 passed, build OK
