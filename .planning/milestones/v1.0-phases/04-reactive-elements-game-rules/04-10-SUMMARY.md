---
phase: 04-reactive-elements-game-rules
plan: 10
subsystem: ui
tags: [hud, dom, accessibility, canvas, legibility, gap-closure]

requires:
  - phase: 04-reactive-elements-game-rules
    provides: "HudView / TextSink write-on-change DOM HUD (04-01, 04-07)"
provides:
  - "DiagData, diagText() and write-on-change DiagView in src/ui/hud.ts"
  - "#hud-diag: 12px bottom-left DOM panel for FPS / PHYS / KE, aria-hidden"
  - "Debug renderer paints no text; draw(world, balls, plungerCharge, lights?)"
  - "#hud-controls as a five-row dl key/action list with 11 kbd key caps"
affects: [05-procedural-renderer, hud, debug-draw]

actuals:
  tokens: 4100
  tasks: 2
  commits: 3
plan_head_before: 0a2d12c9d1b4ab48751cc082251d7fa6a21764a6
plan_head_after: d573d5bfff46c9caa938de42fdaaa1ff5dcbe11c

tech-stack:
  added: []
  patterns:
    - "Every on-screen text is DOM text written through an injected TextSink; the canvas paints none"
    - "Write-on-change views cache raw numbers, not strings, so a steady frame builds no string"

key-files:
  created: []
  modified:
    - src/ui/hud.ts
    - src/ui/hud.test.ts
    - src/sandbox/debug-draw.ts
    - src/sandbox/main.ts
    - index.html

key-decisions:
  - "Diagnosis readout moved to the DOM (#hud-diag, bottom-left), not scaled on the canvas: a 1/fit canvas font would make the box about 800 logical px wide"
  - "Readout is one line 'FPS 60 | PHYS 120 Hz | KE 0.012 J', visible in normal play, aria-hidden"
  - "Controls hint is a dl of five action/key-cap rows; NumpadEnter stays an unlisted alias of Enter"

patterns-established:
  - "DiagView: write-on-change DOM readout fed by the HUD_UPDATE_MS throttle"

requirements-completed: [GAME-01]

coverage:
  - id: D1
    description: "diagText formats the readout line; DiagView writes once, then only when one of its three numbers changes"
    requirement: GAME-01
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts#diagText (G-04-6)"
        status: pass
      - kind: unit
        ref: "src/ui/hud.test.ts#DiagView write-on-change (G-04-6, T-04-25)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Canvas renderer paints no text (no drawHud, fillText, COL_HUD, HudData); tsc, eslint, full vitest and vite build pass"
    requirement: GAME-01
    verification:
      - kind: other
        ref: "grep -c 'fillText|drawHud|COL_HUD' src/sandbox/debug-draw.ts == 0; npx tsc --noEmit; npx eslint src; npx vitest run (392 passed); npm run build"
        status: pass
    human_judgment: false
  - id: D3
    description: "Readout and controls hint are legible at the 1280x684 / dpr 1.5 reference viewport; five non-wrapping rows; Slash reads as a key cap; neither panel overlaps the table or plunger meter"
    requirement: GAME-01
    verification:
      - kind: other
        ref: "index.html structure greps: 5 dt, 11 kbd, <kbd>/</kbd>, 0 stray slashes, 0 middle dots, dd nowrap, no max-width 220px"
        status: pass
    human_judgment: true
    rationale: "Perceptual layout check of UAT test 6 (Task 2 human-check); structure is machine-checked, the visual read is the user's"

duration: 4min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 10: HUD Legibility (G-04-6) Summary

**FPS / PHYS / KE readout moved off the canvas into a 12px DOM panel (write-on-change DiagView), and the controls hint rewritten as a five-row key/action list with kbd key caps and an unambiguous Slash key.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-20T19:57:51Z
- **Completed:** 2026-11-20T20:01:19Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `DiagData`, `diagText()` and `DiagView` in `src/ui/hud.ts`: one DOM line, rewritten only when one of the three throttled numbers changes (numeric cache, no per-frame string), textContent only.
- `#hud-diag` panel, fixed bottom-left, 12px monospace, tabular numerals, `aria-hidden`.
- Debug renderer no longer paints text: `HudData`, `COL_HUD`, the cached HUD strings, `drawHud` and the trailing screen-space transform are gone; `draw(world, balls, plungerCharge, lights?)`.
- Controls hint is a `dl` of Start, Launch, Left flipper, Right flipper, Nudge with 11 key caps; no slash or middle-dot separators; each row nowrap; the 220px max-width that split groups is gone.

## Task Commits

1. **Task 1: Diagnostics readout leaves the canvas (tracer)** - `e34c705` (test, RED), `4388dfb` (feat)
2. **Task 2: Controls hint becomes a key/action list** - `d573d5b` (feat)

## Files Created/Modified
- `src/ui/hud.ts` - DiagData, diagText, DiagView; module doc updated
- `src/ui/hud.test.ts` - diagText format cases and DiagView write-count cases
- `src/sandbox/debug-draw.ts` - canvas text readout removed, `hud` parameter dropped
- `src/sandbox/main.ts` - `diag` object on the HUD_UPDATE_MS throttle, `diagView.update(diag)` after `hudView.update(session)`
- `index.html` - `#hud-diag` panel and CSS; `#hud-controls` as a dl with kbd key caps and grid CSS

## Decisions Made
Followed the plan's flagged assumptions as written: separate bottom-left readout panel, visible in normal play; "Left Shift" / "Right Shift" spelled out; one-line readout format.

## Verification
- RED: 7 new cases failed before step (2) (`diagText is not a function`, `DiagView is not a constructor`); all 34 HUD cases pass after.
- `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (33 files, 392 tests) and `npm run build` all exit 0.
- Task 1 criteria: drawHud 0, fillText 0, COL_HUD 0, HudData 0, DiagView 1, `diagView.update(diag)` 1, `id="hud-diag"` 1, innerHTML 0.
- Task 2 criteria: dl 1, dt 5, kbd 11, `<kbd>/</kbd>` 1, stray slashes 0, middle dots 0, dd nowrap 1, `max-width: 220px` 0.
- Binding tables checked: flipper (KeyZ, ShiftLeft, ArrowLeft / Slash, ShiftRight, ArrowRight), game (Enter, NumpadEnter, KeyX, Period, ArrowUp), plunger (Space). The list matches with no missing or extra key apart from the deliberate NumpadEnter alias.
- Tracer gate: auto mode off, `human_verify_mode` end-of-phase, automated-only verify re-run green before Task 2.
- Width estimate at 12px monospace: controls panel about 300px from the left edge, readout panel about 285px, both clear of the canvas starting at about x 456 at 1280px. Pending the human check below.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- G-04-6 closed in code. The Task 2 human-check (1280x684 window at 150% scaling: five non-wrapping rows, Slash visibly a key cap, legible readout, no overlap with table or plunger meter) rolls into end-of-phase UAT.
- Clears the STATE.md Phase 3 -> 5 carry-forward that the canvas HUD renders at about 3.4px.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*

## Self-Check: PASSED
