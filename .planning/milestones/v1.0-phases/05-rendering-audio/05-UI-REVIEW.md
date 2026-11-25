---
phase: "5"
slug: "rendering-audio"
audited: "2026-11-21"
baseline: abstract 6-pillar standards (no UI-SPEC)
screenshots: not captured (code-only audit; playwright screenshot failed)
overall: 16/24
---

# Phase 5 — UI Review

**Auditor:** gsd-ui-auditor (sonnet), code-only. The dev server at localhost:5173 answered 200, but the Playwright screenshot capture failed at every size, so no layout finding has been confirmed by a screenshot.

## Scores

| Pillar | Score | Key finding |
|--------|-------|-------------|
| 1 Copywriting | 3/4 | HUD strings are clear and consistent; there's no text for the mute state, and the Windows note reads like jargon |
| 2 Visuals | 3/4 | The procedural neon table has clear hierarchy and one meaning per colour; the fixed HUD panel can cover the table |
| 3 Color | 3/4 | The palette is disciplined, but about 12 CSS values are copied by hand from `palette.ts` |
| 4 Typography | 3/4 | System monospace on a clean 4-size, 2-weight scale; several muted lines are only 11–12px |
| 5 Spacing | 2/4 | There are no media queries, so the fixed HUD and diag panels will collide with the canvas on narrow viewports |
| 6 Experience Design | 2/4 | Mute shows no state, the dev diag readout ships in the production UI, and there's no reduced-motion handling |

**Overall: 16/24**

## Priority Fixes

1. **WARNING: the HUD has no responsive handling.**
   - `.hud` is `position: fixed; top/left 16px` and carries a 6-row controls list plus a note, about 220px wide. `index.html` has no `@media` rule.
   - At 375px or 768px the panel would sit on top of the centred, fit-to-viewport table. Those are the sizes where the table is smallest.
   - Fix: add a `@media (max-width: ~900px)` rule that collapses the controls and note, or docks the HUD to a top strip.
   - Not confirmed by screenshot.
2. **WARNING: mute has no visible state.**
   - The Mute · M row exists (`index.html:174-175`), but nothing in the UI reflects `isMuted`. Pressing M gives silence and no indicator.
   - Fix: add a `data-muted` attribute or a "MUTED" tag driven from the `toggleMute` edge.
3. **WARNING: the developer diagnosis readout is visible to players.**
   - `#hud-diag` (`index.html:134-149`) shows FPS, physics Hz and KE, and is always on.
   - Fix: gate it behind `?debug=1`, which already selects `DebugRenderer`, or behind a key.

## Minor Recommendations

4. There's no `prefers-reduced-motion` handling for the additive "lighter" flash halos. Risk is low, since flashes are short and capped.
5. The CSS custom properties (`index.html:12-25`) copy `palette.ts` values by hand: `--frame` = `WALL` `#4cc9f0`, and `--status` = `BUMPER_CAP` `#f72585`. Tuning the palette at UAT would silently leave the DOM behind. Add a cross-check test or a comment.
6. `.hud-controls-note` and `.hud-label` are 11px. `--text-muted` #8892b0 is about 6:1 on the panel, which passes AA, but the text is small. The note "Shift can stick" is dev-speak; reword it to something like "Left/Right arrows are most reliable on Windows".
7. The canvas `role="img"` has a static `aria-label`, so it gives no state. That's acceptable, because the status line carries `role="status" aria-live="polite"`.

## Detail by Pillar

- **Copywriting 3/4.**
  - Specific strings: "PRESS ENTER TO START", "GAME OVER · PRESS ENTER", "BALL n / 3", "TILT" (`src/ui/hud.ts:58-73`).
  - Control labels name actions; there are no generic labels.
  - Gaps: no mute-state copy, and no first-run hint beyond the status line.
- **Visuals 3/4.**
  - The canvas is procedural and asset-free, enforced by `asset-free.test.ts`.
  - Strong hierarchy: the score is 32px bold with a glow, the status line is magenta, and the ball line is secondary.
  - One colour per meaning: the drain is the only red, bumpers are magenta and walls are cyan.
  - The canvas paints no text (D-01).
  - Deductions: the HUD can cover the table, and nothing was confirmed by screenshot.
- **Color 3/4.**
  - `palette.ts` holds 34 literals in one place. The other renderer files have no hardcoded colours, except `sprites.ts`, which has 3.
  - The 60/30/10 split holds: dark space, cyan structure, magenta and amber accents.
  - Deductions: the literals in `sprites.ts`, the CSS duplication, and a high but on-theme accent count.
- **Typography 3/4.**
  - Sizes 11, 12, 16 and 32px; weights 700 and normal.
  - `tabular-nums` on the score and diag readouts.
  - Deduction: the 11–12px muted text.
- **Spacing 2/4.**
  - Internal HUD spacing is consistent: 4, 8, 10, 12 and 16px.
  - There's no responsive layer, and the fixed panel offsets are hardcoded. `computeView` handles dpr and fit well inside the canvas.
- **Experience Design 2/4.**
  - Strengths:
    - interpolated rendering at 144 Hz
    - 50 ms mute ramp
    - audio unlock on a trusted gesture
    - layers baked once per resize
    - proof that the presentation layer is read-only
    - polite live region
  - Weaknesses:
    - no mute indicator
    - debug readout shown to players
    - no reduced-motion handling
    - no responsive HUD
    - no hint when audio fails to unlock

## Files Audited

- `index.html`
- `src/render/palette.ts`
- `src/render/table-renderer.ts`, `src/render/view-transform.ts`, `src/render/static-layer.ts` (grep only)
- `src/ui/hud.ts`
- 05-01..05-08 SUMMARY files and `deferred-items.md`

The PLAN files were not read in full, so the audit judged intent from the SUMMARYs.
