# Phase 4 — UI Review (re-audit after 04-09 / 04-10)

**Audited:** 2026-11-20
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md)
**Screenshots:** not captured. The dev-server probe was blocked by the sandbox and never ran, so this is a code-only audit.
**Interaction captures:** off (workflow.ui_interaction_capture is false); interaction findings are code-derived
**Previous review:** 16/24 (after 04-01..04-08)

Scope: `index.html`, `src/ui/hud.ts`, `src/sandbox/debug-draw.ts` (grep), `src/sandbox/main.ts` (grep). Plan 04-09 was physics only and has no UI surface.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | The hint is now a labelled key/action list (slash ambiguity fixed). WARNING/TILT still give no cause or consequence. |
| 2. Visuals | 3/4 | The canvas paints no text and the diagnostics are crisp DOM. The two fixed panels still float over the table with no layout awareness. |
| 3. Color | 2/4 | Unchanged. Hardcoded hex, `#ef476f` still has three meanings, and every status shares one amber. |
| 4. Typography | 3/4 | The 11px hint and 14px canvas text are gone (hint 12px, diag 12px). The 11px `.hud-label` remains, and there are four DOM sizes (11/12/16/32). |
| 5. Spacing | 3/4 | The hint can no longer wrap mid-phrase (nowrap grid). There are still no media queries, and the 4/10/12/16 values are off-grid. |
| 6. Experience Design | 2/4 | Unchanged. No touch path, no pause or blur message, no tilt emphasis. |

**Overall: 16/24** (unchanged in total. Typography and copy improved internally but are capped by the remaining defects below.)

---

## Resolved since the last review

| Earlier finding | Status |
|-----------------|--------|
| #9 Canvas debug HUD at about 3.4px (`debug-draw.ts:494`) | Resolved. `debug-draw.ts` has no `fillText` or `font`. FPS/PHYS/KE are in `#hud-diag` (`index.html:95-109, 135`; `hud.ts:131-182`), 12px DOM text, `aria-hidden`, write-on-change. |
| #6 Controls hint run-on, `/` ambiguous as key and separator | Resolved. `index.html:122-133` is a five-row `dl` with `kbd` key caps. `/` is rendered as a cap, not a separator. |
| Pillar 4: 11px hint below the 12px floor | Resolved for the hint (`.hud-controls` 12px). |
| Pillar 5: hint wraps to 5+ lines, making the panel about 200px tall | Substantially resolved. Rows are `white-space: nowrap`, and the panel is now a compact five-row grid. |

## Still open

| Finding | Status |
|---------|--------|
| #1 TILT, WARNING, start and game-over prompts share one amber (`index.html:54-60`) | Open. `statusText` has no modifier class. |
| #2 No touch or pointer path, and the hint says keys only | Open. `main.ts` is keyboard-driven only (a grep for touch/pointer finds nothing). |
| #3 Fixed top-left HUD overlaps the table at narrow or short viewports | Open, and slightly worse. `#hud-diag` is a second fixed panel at bottom-left (`index.html:96-99`), and there is still no `@media`. The hint panel is wider (grid of `kbd` caps). |
| #4 `#ef476f` is the drain, the velocity arrow and the full meter (`debug-draw.ts:56, 61, 101`) | Open |
| #5 Lit rollover `#d9ff66` w6 vs unlit `#8ac926` (`debug-draw.ts:64-66, 105, 256`) is weak for low vision | Open |
| #7 Game-over drops the ball line and has no final-score emphasis | Open |
| #8 Canvas `role="img"` has a static label with no state | Open |

---

## Top Priority Fixes

1. **WARNING: status states are undifferentiated** (`index.html:59`, `hud.ts:70-79`). Tilt (flippers dead) looks the same as "PRESS ENTER TO START". Fix: add `.is-tilt`, `.is-warning` and `.is-prompt` classes, toggled in `HudView.update()` inside the existing write-on-change branch. Copy: "TILT · FLIPPERS OFF", "WARNING · EASE UP".
2. **WARNING: no touch or pointer input** (`main.ts`). The page is unplayable on a phone and the hint doesn't say so. Fix: add on-screen controls in Phase 5, or add a "keyboard required" line to the hint now.
3. **WARNING: fixed panels overlap the playfield on small viewports** (`index.html:25-36, 95-109`). Fix: a media query that hides `#hud-controls` below about 900px width or 700px height, and docks the HUD beside the canvas in the flex row. Hide `#hud-diag` outside dev builds.
4. **WARNING: `#ef476f` carries three meanings** (`debug-draw.ts:56, 61, 101`). Give the drain, the velocity arrow and the meter-full state distinct hues.
5. **WARNING: lit/unlit rollover contrast** (`debug-draw.ts:64-66`). Add a fill or glow for the lit state, not only stroke width and a roughly 20 degree hue shift.
6. **WARNING: move colors into CSS custom properties.** `#05060d`, `#e8eefc`, `#8892b0`, `#c3cbe6`, `#ffd166` and `rgba(138,160,255,.25)` repeat across the sheet. `#ffd166` is also the ball core color.
7. **WARNING: `.hud-label` is 11px** (`index.html:38`). Raise it to 12px so all DOM text meets the same floor.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- The prompts are unchanged and fine: "PRESS ENTER TO START", "GAME OVER · PRESS ENTER", "TILT", "WARNING" (`hud.ts:70-79`).
- The new hint copy is clear. "Start / Launch / Left flipper / Right flipper / Nudge" with caps is scannable. "Space hold, release" (`index.html:126`) is slightly terse but unambiguous.
- Defect: "WARNING" and "TILT" still state neither the cause nor the consequence.
- Defect: the controls list includes `.` and `/` as key caps without naming them. They are visually distinct now, but a screen-reader user would hear "period" or "slash" with no context. That is acceptable, because the hint is a static aid.
- There are no generic OK/Submit/Cancel strings.

### Pillar 2: Visuals (3/4)
- Hierarchy is intact: the score is 32px/700 tabular-nums, the ball and status lines are 16px, and the hint and diag are muted 12px.
- The diag panel is visually subordinate to the HUD (6px/10px padding, muted color, 6px radius against the HUD's 8px). The two radii are a small inconsistency.
- Both panels are `position: fixed` and ignore the canvas rect. On a viewport narrower than the fitted table the HUD covers the upper-left lanes and the diag panel covers the lower-left outlane region.
- The canvas now paints no text, which removes the earlier tiny-text artifact.
- The lit-rollover cue is unchanged and relies on width.

### Pillar 3: Color (2/4)
- Nothing here changed in 04-10. There are no custom properties. The hex values are hardcoded across `index.html`, and the `COL_*` constants in `debug-draw.ts` are separate.
- The status line has one color for four meanings (`index.html:59`).
- `#ef476f` is at `debug-draw.ts:56, 61, 101` (three meanings).
- The new `kbd` styling (`rgba(138,160,255,.35)` border and `.08` fill, `#c3cbe6` text) reuses the existing palette. It adds no new hues, which is good.
- Contrast: `#8892b0` on the near-black panel is about 6:1 (passes AA at 12px). `#ffd166` far exceeds AA.

### Pillar 4: Typography (3/4)
- DOM sizes: 11px (`.hud-label`), 12px (hint, diag), 16px (ball, status), 32px (score). That is four sizes, with one under the 12px floor.
- Weights: 700 and normal only.
- The mono stack `ui-monospace, Menlo, Consolas, monospace` is used consistently, including in `kbd` via `font: inherit`.
- `font-variant-numeric: tabular-nums` is applied on the score and diag, so the numbers don't jitter.
- The canvas now has no text at all, so the prior 14px canvas size is gone.

### Pillar 5: Spacing (3/4)
- The hint grid uses a 12px column gap and a 4px row gap, and the `kbd` padding is `0 4px`. The 4px values are on-grid. The HUD's 12px and 10px, and the diag's 6px, are not.
- The nowrap rows make the hint panel's width equal its longest row ("Right flipper" plus three caps), which is about 260px or more. That is wider than the previous 220px cap, so the horizontal footprint over the playfield grew while the height shrank.
- No `@media`, no safe-area insets. The fixed offsets of 16px are consistent between the two panels.

### Pillar 6: Experience Design (2/4)
- Covered (code-derived): attract, playing, tilt, game-over, the warning window, focus-loss and visibility handling (`main.ts` registers keydown, keyup, blur and visibilitychange listeners), and write-on-change on both HUD and diag (`hud.ts:103-128, 167-181`).
- The diag panel is correctly `aria-hidden`, and the status line is the only live region.
- Missing: touch or pointer input, a pause or blur message, tilt consequence emphasis, a way to hide the HUD or hint during play, and a final-score emphasis in game-over.
- No loading or error states exist (a sandbox, so this is not expected). No destructive actions exist.
- Registry audit: skipped, no `components.json`.

---

## Files Audited
- `C:/Users/aster/projects-source/flippers/index.html`
- `C:/Users/aster/projects-source/flippers/src/ui/hud.ts`
- `C:/Users/aster/projects-source/flippers/src/sandbox/debug-draw.ts` (grep: text calls, color constants)
- `C:/Users/aster/projects-source/flippers/src/sandbox/main.ts` (grep: input listeners, DiagView wiring)

Not read: the 04-01..04-10 PLAN and SUMMARY files, and 04-UAT.md. Findings come from the previous review plus the current code.
