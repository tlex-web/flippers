---
phase: 04-reactive-elements-game-rules
plan: 13
subsystem: ui
tags: [keyboard-map-api, hud, controls-list, layout, qwertz, vitest-raw-import]

requires:
  - phase: 04-reactive-elements-game-rules
    provides: "04-10 five-row controls list (UAT 13); 04-12 Windows Shift heal and the documented both-Shift residual"
provides:
  - "src/ui/key-labels.ts: keyLabel, applyKeyLabels, readLayoutMap, initKeyLabels (layout-derived key-cap labels with a no-API fallback and a layout-only reveal)"
  - "index.html: data-code on the KeyZ, Slash, KeyX and Period caps; the Windows reliability note with a hidden data-layout-only span"
  - "main.ts: one void initKeyLabels(...) boot call after the HUD views"
affects: [phase-05-renderer, hud, controls-hint, uat-18]

actuals:
  tokens: 3900
  tasks: 2
  commits: 2
plan_head_before: 92991bc7626d29b026323e82be803893c7701069
plan_head_after: d52c52e8ba3ebb27e0b5c01391caf6ae000c56b7

tech-stack:
  added: []
  patterns:
    - "Layout-dependent key caps carry their KeyboardEvent.code in data-code with the US label as markup fallback; labels come from navigator.keyboard.getLayoutMap() at boot"
    - "Layout-only content ([data-layout-only] hidden) is revealed only when every coded cap resolved, so the page never names a key the layout cannot vouch for"
    - "Markup facts tested through a `?raw` import of index.html under vite/client types (no node:fs)"

key-files:
  created:
    - src/ui/key-labels.ts
    - src/ui/key-labels.test.ts
  modified:
    - index.html
    - src/sandbox/main.ts

key-decisions:
  - "04-13: key caps for KeyZ/Slash/KeyX/Period are relabelled from the Keyboard Map API at boot (text-only, one code point); without the API they keep their US markup labels"
  - "04-13: Windows reliability note always names the arrow keys; the KeyZ/Slash caps sit in a data-layout-only span revealed only when every coded cap resolved; note uses contain: inline-size so the panel keeps the width the five rows set"
  - "04-13: Left/Right Shift stay bound and listed (UAT 18 decision A); no binding or input-layer change"

patterns-established:
  - "Engine-free src/ui module with injected structural sinks (KeyCap, Revealable) and a navigator taken as unknown and narrowed at runtime"

requirements-completed: [FLIP-01, GAME-01]

coverage:
  - id: D1
    description: "Key caps for KeyZ, Slash, KeyX and Period show the character the player's layout prints (German map gives Y, -, X, .), filtered to one code point and written via textContent"
    requirement: FLIP-01
    verification:
      - kind: unit
        ref: "src/ui/key-labels.test.ts#applyKeyLabels relabels every cap from the German map and reveals the layout-only element"
        status: pass
      - kind: unit
        ref: "src/ui/key-labels.test.ts#keyLabel (4 cases)"
        status: pass
      - kind: unit
        ref: "src/ui/key-labels.test.ts#initKeyLabels relabels the caps from the layout and reveals the layout-only element"
        status: pass
    human_judgment: false
  - id: D2
    description: "Without the Keyboard Map API (missing, throwing, rejecting, non-map result) the page boots, caps keep markup labels and layout-only content stays hidden"
    requirement: GAME-01
    verification:
      - kind: unit
        ref: "src/ui/key-labels.test.ts#readLayoutMap (7 cases)"
        status: pass
      - kind: unit
        ref: "src/ui/key-labels.test.ts#initKeyLabels keeps the markup labels and the layout-only element hidden without the API"
        status: pass
    human_judgment: false
  - id: D3
    description: "index.html markup: 6 data-code caps on the four layout-dependent codes, Shift and arrow caps uncoded, five rows, one note whose hidden-span text reads 'On Windows, ← → are the most reliable flipper keys. Shift can stick.', contain: inline-size rule"
    requirement: GAME-01
    verification:
      - kind: unit
        ref: "src/ui/key-labels.test.ts#index.html markup (9 cases)"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: false
  - id: D4
    description: "On the user's Chrome with German QWERTZ at 1280x684 / 150%: rows read Y ← Left Shift and - → Right Shift, note reads 'On Windows, ← → Y - are the most reliable flipper keys. Shift can stick.', wraps inside the panel, panel covers neither table nor plunger meter; Firefox shows the arrow-only note"
    requirement: FLIP-01
    verification: []
    human_judgment: true
    rationale: "Real layout labels come from the OS layout through Chrome's Keyboard Map API, which Vitest's node environment lacks; panel fit at 150% scaling is a visual judgement (Task 2 human-check, end-of-phase UAT)"

duration: 5min
completed: 2026-11-21
status: complete
---

# Phase 4 Plan 13: Layout-Correct Key Caps and Windows Reliability Note Summary

**Keyboard Map API key-cap relabelling (KeyZ/Slash/KeyX/Period read Y/-/X/. on German QWERTZ) plus a Windows note that always names ← → and reveals the layout-labelled Z/Slash caps only when the layout resolved**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-20T23:52:19Z
- **Completed:** 2026-11-20T23:57:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `src/ui/key-labels.ts`: `keyLabel` (one code point, uppercase when that stays one code point), `applyKeyLabels` (textContent only, reveal on full resolution), `readLayoutMap` (runtime narrowing, try around call and await, never rejects), `initKeyLabels` (boot entry).
- `index.html`: data-code on the four layout-dependent row caps; the `hud-controls-note` paragraph with the arrows outside and the KeyZ/Slash caps inside a hidden `data-layout-only` span; `.hud-controls-note` CSS with `contain: inline-size`; note caps share the list's key-cap style.
- `main.ts`: one `void initKeyLabels(document.querySelectorAll("kbd[data-code]"), document.querySelectorAll("[data-layout-only]"), navigator)` after the HUD views. Fires once, no per-frame cost, first frame never waits.
- Shift stays bound and listed; five rows unchanged; no dependency added; src/input, src/physics, src/control untouched.

## Task Commits

1. **Task 1: Tracer, layout-derived key caps (RED first)** - `b1fae0d` (feat)
2. **Task 2: Windows reliability note** - `d52c52e` (feat)

**Plan metadata:** see the docs(04-13) commit

## RED evidence (Task 1)

- At the 04-12 head (92991bc) `npx vitest run src/ui/key-labels.test.ts` failed with "Test Files 1 failed, Tests no tests": the import `./key-labels` did not resolve (module missing).
- With the module in place but index.html unchanged, 2 failed / 20 passed:
  - `index.html markup > marks each layout-dependent cap with its code and US fallback label`
  - `index.html markup > uses only the four layout-dependent codes`
- After the data-code markup: 21/21 pass. After Task 2: 27/27 in the file.

## Files Created/Modified

- `src/ui/key-labels.ts` - layout-derived key-cap labels, no-API fallback, layout-only reveal
- `src/ui/key-labels.test.ts` - 27 cases: keyLabel, applyKeyLabels (incl. six-cap reveal), readLayoutMap (7 fake navigators), initKeyLabels, index.html raw-import markup checks
- `index.html` - data-code caps, Windows note markup and CSS
- `src/sandbox/main.ts` - import plus one boot call (8 lines incl. comment)

## Verification

- `npx tsc --noEmit` 0, `npx eslint src` 0, `npx vitest run` 34 files / 482 tests pass (was 33 / 455 after 04-12; one new file), `npm run build` OK.
- Task 1 criteria: getLayoutMap 5 (>=1), data-code 4, initKeyLabels( code lines 1, main.ts diff guard vs f481932 0, innerHTML 0, dt 5, Left/Right Shift 1/1, planck imports in src/ui 0.
- Task 2 criteria: note 1, data-layout-only 1, data-code 6, contain: inline-size 1, Shift can stick 1, dt 5, package files unchanged vs f481932 (0), 04-13 commits in src/input|physics|control 0.
- Tracer gate: interactive run, end-of-phase mode, automated-only verify; re-run green, expanded to Task 2.

## Decisions Made

- Followed the plan's flagged assumptions (existing caps relabelled, note shown on all platforms, Firefox/Safari keep US row labels).
- `codePoints` walks the string with `codePointAt` (surrogate pair counts as one) instead of a `for...of` with an unused binding, which ESLint's no-unused-vars rejects. Same semantics as the planned iteration.
- Accepted Prettier's wrapping of the note markup (`</kbd\n><span ...>`); whitespace collapses to the same rendered text, pinned by the fallback-text test.

## Deviations from Plan

None - plan executed exactly as written. (The six-cap applyKeyLabels case was drafted with Task 1's tests and moved into the Task 2 commit to keep task scope as planned.)

## Issues Encountered

- One full-suite run during Task 1 reported 4 failed / 472 passed with test time 70 s (vs about 22 s normally), i.e. the machine was under load. Three immediate re-runs were 34/34 files, 476/476 tests green with no code change; the failures did not involve key-labels.test.ts. Treated as load-induced timeouts in pre-existing long tests, not a regression.
- `src/sandbox/main.ts` has a pre-existing Prettier warning (the long `plunger.applyEdges(...)` line from an earlier plan). Out of scope and left as is, since reformatting it would also trip this plan's main.ts diff guard.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-04-17 hint half closed in code. The Task 2 human-check (Chrome, German QWERTZ, 1280x684 at 150%: Y/- rows, revealed note, panel fit, Y and - keys raise the bats; optional Firefox arrow-only note) rolls into end-of-phase UAT.
- Phase 4 plans 13/13 have summaries.

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-21*

## Self-Check: PASSED
