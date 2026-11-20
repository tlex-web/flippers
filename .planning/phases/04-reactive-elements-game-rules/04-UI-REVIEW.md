# Phase 4 — UI Review

**Audited:** 2026-11-20
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md), calibrated to the Phase 3 review
**Screenshots:** not captured (no dev server on 3000, 5173 or 8080; code-only audit)
**Interaction captures:** off (workflow.ui_interaction_capture is false); interaction findings are code-derived

Scope: the throwaway sandbox plus the new DOM HUD. Files: `src/ui/hud.ts`, `index.html`, `src/sandbox/debug-draw.ts`, `src/sandbox/main.ts` (grep).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Status copy is terse and clear. The ball line is dropped in game-over, and the controls hint is dense and hard to scan. |
| 2. Visuals | 3/4 | The HUD is a clear panel (32px score vs 16px lines). The panel is fixed top-left and can overlap the table. The lit rollover is distinct only by width and color. |
| 3. Color | 2/4 | Hardcoded hex everywhere with no tokens. `#ef476f` still carries three meanings, and the new lit-rollover green sits next to the unlit rollover green. |
| 4. Typography | 3/4 | The HUD is real DOM text in a mono stack with a clear scale. Two 11px muted lines are small; 3 CSS sizes (11/16/32px) plus the 14px canvas HUD. This fixes the 3.4px canvas HUD. |
| 5. Spacing | 3/4 | HUD spacing is consistent px values. `min-height` stops the panel jumping. There are no breakpoints, and the 220px hint wraps across 4 or more lines. |
| 6. Experience Design | 2/4 | Start, warning, tilt and game-over are covered. The HUD is keyboard-only with no touch, there is no pause or blur messaging, and the status colors are not differentiated. |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **WARNING: TILT and WARNING share one amber style with start and game-over prompts** (`index.html:54-60`). A tilt is a punishing state and reads the same as "PRESS ENTER TO START". Fix: add modifier classes. Use a red or magenta `.is-tilt`, amber `.is-warning`, and a neutral or cyan prompt color. Toggle them from `HudView.update()`, still write-on-change.
2. **WARNING: there is no touch or pointer path, and the HUD blocks nothing but tells touch users nothing** (`index.html:81-84`, `main.ts` keydown only). The game is unplayable on mobile and the hint lists keys only. Fix: add an on-screen Start/Launch/Flipper affordance in Phase 5, or state "keyboard required" in the hint.
3. **WARNING: the fixed HUD panel overlaps the table at narrow or short viewports** (`index.html:25-36`). The panel is `position: fixed` top-left at roughly 250px by 200px. The canvas is centered and fitted to the viewport, so on a 768px-wide window the panel covers the playfield's upper-left (the rollover lanes). Fix: collapse the controls hint under a width/height media query, or place the HUD beside the canvas in the flex row.

Further issues (non-top-3, all WARNING):

4. `#ef476f` is still the drain stroke, velocity arrow and full meter (`debug-draw.ts:59,65`). This is carried forward from Phase 3 fix #2 and is unresolved.
5. The lit rollover `#d9ff66` at width 6 against the unlit rollover `#8ac926` at width 3 (`debug-draw.ts:75,115,274-278`) relies on a hue shift of about 20 degrees plus dash vs solid. Low-vision users get weak lit/unlit contrast. Fix: add a fill or an outline, or glow in Phase 6.
6. The controls hint is one 11px run-on sentence with `·` separators, using `/` as both a key and a separator ("Z / ← / Left Shift left flipper · / / → / Right Shift"). The slash key is ambiguous, and this is a copy defect. Fix: a 3-row key/action list.
7. The ball line is blank in game-over, so the final ball count is lost and the final score is the only readout. Acceptable, but "GAME OVER" gives no final-score emphasis.
8. `aria-live="polite"` on status only. Tilt and warning are time-critical but polite is correct. Score is never announced, which is a deliberate and good choice. The `role="img"` canvas has no description of state.
9. The canvas debug HUD (`debug-draw.ts:494`, 14px, about 3.4px at fit) is still present. It was a Phase 3 carry-forward and is now documented as the diagnosis readout, not fixed.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- `hud.ts:72-76` strings: "PRESS ENTER TO START", "GAME OVER · PRESS ENTER", "TILT", "WARNING". All are uppercase, action-first, concise and correct for the arcade genre.
- "WARNING" and "TILT" give no cause or consequence ("WARNING: STOP NUDGING"). Players who don't know pinball will not know what triggered them.
- The key hint `index.html:82-83` is the weakest copy. Slash-as-key ambiguity, wrapped mid-phrase, and the "nudge" keys (X . ↑) clash with the ↑ arrow being a nudge rather than a launch.
- "BALL n / 3" uses spaced slash (`hud.ts:57`), whereas the summaries described "BALL n of 3". Minor inconsistency with the scope description only.
- No generic "OK/Submit/Cancel" strings.

### Pillar 2: Visuals (3/4)
- Hierarchy is good: SCORE label 11px muted, score 32px/700 tabular-nums (no jitter), ball 16px, status 16px/700 in amber.
- The panel (`rgba(5,6,13,.72)`, 1px border, 8px radius) is legible over the canvas but is not integrated with the table. Fixed positioning means it floats over the playfield rather than beside it.
- The lit rollover is the only reactive-state cue drawn in the canvas. Solid and double width is a clear cue at desktop scale, but the stroke width shrinks with the fit scale so it may be about 1.5px on a small display.
- The status line has a reserved `min-height: 1.2em`, so there is no layout jump. Good.
- Canvas has `role="img"` plus `aria-label` (Phase 3 fix #3 partly resolved).

### Pillar 3: Color (2/4)
- No CSS custom properties. Hex values are hardcoded across `index.html` (`#05060d`, `#e8eefc`, `#8892b0`, `#c3cbe6`, `#ffd166`) and as `COL_*` constants in `debug-draw.ts` (12 or more).
- `#ffd166` (status) equals `COL_BALL_CORE` in the canvas, so the status color is also the ball color. This is cosmetic but ties UI prompts to a game object.
- All four status states use a single color (`index.html:59`). See fix 1.
- `#ef476f` triple meaning is unresolved from Phase 3.
- Contrast: `#8892b0` on the panel over `#05060d` is about 6:1, which passes AA. `#ffd166` is far above AA.
- Not a 60/30/10 problem: the sandbox is dark, and the amber accent is limited to the status line.

### Pillar 4: Typography (3/4)
- Sizes in `index.html`: 11px (x2), 16px (x2), 32px. That is 3 CSS sizes, plus 14px in the canvas HUD. The weights are 700 only, plus normal. Both are within sensible limits.
- A letter-spaced uppercase label and a status line at 0.12em are a consistent treatment.
- 11px on the label and hint is below the typical 12px floor, and the hint is the longest text on screen. Raise it to 12px.
- The font stack `ui-monospace, Menlo, Consolas, monospace` is fine and falls back correctly on Windows.
- Phase 3 fix #1 (3.4px HUD) is resolved for the game HUD by moving to DOM text. The canvas HUD is unchanged.

### Pillar 5: Spacing (3/4)
- Panel padding 12/16, offsets 16/16, margin-top 4 and 10. Values are not on a single scale (4, 10, 12, 16), so 10 and 12 are off a 4/8 grid. Minor.
- `max-width: 220px` on the hint, but the panel width is set by the content (the 32px score), so the hint wraps to 5 lines or more at 11px and makes the panel tall (about 200px).
- No `@media` rules (grep). No safe-area or small viewport handling.
- Canvas `LIT_ROLLOVER_WIDTH = 6` vs 3 are named constants. Good.

### Pillar 6: Experience Design (2/4)
State coverage (code-derived, not run):
- Covered: attract, playing, tilted, game-over (`hud.ts:53-78`). Warning window. Enter-to-start gated to game-over. Focus-loss handling from Phase 3 remains.
- Efficient: write-on-change per line, text-only `textContent`, `pointer-events: none`, `aria-live` on the status only.
- Missing or weak:
  - No touch/pointer input (Phase 3 carry-forward, unresolved).
  - No pause, no message when the tab loses focus.
  - No emphasis on tilt consequence (flippers dead). The HUD says only "TILT".
  - The HUD cannot be hidden, and the hint stays on screen during play.
  - No high-score or final-score emphasis in game-over.
  - No visual flash for score events, deferred to Phase 6.
- Registry audit: skipped, no `components.json`.

---

## Phase 3 Carry-forward Status

| Phase 3 finding | Phase 4 status |
|-----------------|----------------|
| HUD font unreadable at fit scale | Resolved for the game HUD (DOM overlay). The canvas diagnosis HUD is unchanged. |
| `#ef476f` used for three meanings | Unresolved |
| No controls hint / canvas semantics / touch | Hint and `aria-label` resolved. Touch unresolved. |
| No drain / ball-count feedback | Ball count resolved. Drain feedback not added. |
| Flipper contrast, drain visibility, resize reallocation | Not addressed (deferred to Phase 5 or 6) |

---

## Files Audited
- `C:/Users/aster/projects-source/flippers/index.html`
- `C:/Users/aster/projects-source/flippers/src/ui/hud.ts`
- `C:/Users/aster/projects-source/flippers/src/sandbox/debug-draw.ts` (grep, lines 55-80, 265-290, 494)
- `C:/Users/aster/projects-source/flippers/src/sandbox/main.ts` (grep)
