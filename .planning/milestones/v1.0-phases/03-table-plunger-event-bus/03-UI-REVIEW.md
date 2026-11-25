---
phase: 03-table-plunger-event-bus
audited: 2026-11-20
baseline: abstract 6-pillar standards (no UI-SPEC)
scope: throwaway Canvas 2D diagnosis sandbox (index.html -> src/sandbox/main.ts, src/sandbox/debug-draw.ts)
overall_score: 15/24
screenshots: none (code-only audit; visual facts from the 03-UAT Chrome run)
interaction_capture: false
---

# Phase 3 UI Review

This review grades the sandbox as a debug and diagnosis view, not as a product UI. The real renderer arrives in Phase 5, so every priority fix below is a carry-forward item for that phase, not a Phase 3 blocker.

## Pillar Scores

| Pillar | Score | Key finding |
|--------|-------|-------------|
| Copywriting | 3/4 | There is no user-facing copy. The HUD labels (`FPS`, `Physics N Hz`, `Kinetic E x J`) are clear for diagnosis. |
| Visuals | 3/4 | Hierarchy is clear: the ball and velocity arrow stand out against muted walls, and the meter and plunger sit outside the playfield. |
| Color | 3/4 | The palette is semantic (`KIND_STYLE` covers 8 kinds) with named constants, but one color carries three meanings. |
| Typography | 2/4 | The HUD is a single fixed 14px mono font that is unreadable at the fit scale. |
| Spacing | 3/4 | Spacing is consistent: `PAD` is 24 and the meter and plunger margins are derived in meters. The HUD offsets are hardcoded. |
| Experience Design | 2/4 | The core loop states are covered, but there are no canvas semantics, no touch input and no visible key hints. |

## Priority Fixes (carry into Phase 5)

1. **WARNING: the HUD size ignores the display fit** (`src/sandbox/debug-draw.ts:469-478`).
   - The font is 14 CSS px, drawn into the backing store and then CSS-scaled by the fit (367 / 1512 ≈ 0.24), so it shows at about 3.4 px.
   - Fix: draw the HUD in a DOM overlay, or keep the `fit` value from `resize()` and scale the font and box by 1/fit.
2. **WARNING: `#ef476f` means three different things.**
   - It is the drain stroke (`KIND_STYLE.drain`), the velocity arrow (`COL_VEL`, line 57) and the full meter (`COL_METER_FULL`, line 63).
   - As a result, "full charge" uses the same color as the drain and the velocity arrow.
   - Fix: give the full-meter state its own hue, or add a glow or outline.
3. **WARNING: no controls hint, canvas semantics or touch path** (`index.html:30`).
   - The `<canvas>` has no `aria-label`.
   - The screen gives no hint for the plunger (Space) or the flipper keys.
   - There is no pointer or touch input.

## Minor Recommendations

- **Resize cost:** `resize()` sets `canvas.width` and `canvas.height` on every window resize, which reallocates the 2268×4062 bitmap each time. Debounce it.
- **Plunger art:** the plunger tip is a flat bar and the rod a 6 px line. Both read fine for diagnosis but need real art in Phase 5.
- **Flipper contrast:** the flipper color `#8e7dbe` has low contrast against the walls (`#3d5a80`) on the `#05060d` background. Tune it in Phase 5.
- **Drain visibility:** the drain is drawn only as a dashed stroke, so it is easy to miss.
- **HUD box:** `fillRect(8, 8, 196, 68)` is sized for exactly three lines and would clip if a line grows.
- **No feedback beyond physics:** there is no drain feedback and no ball-count readout. The `[bus]` console log is the only signal.

## Strengths

- The charge meter has quarter ticks and changes state at full charge.
- The pullback is drawn in world space.
- Focus loss cancels the plunger (on `blur` and `visibilitychange`).
- Window resize is handled.
- Steady-state drawing allocates nothing: the gradient, HUD strings and dash arrays are cached.
- The renderer's JavaScript draw time was 0.2 ms median in the UAT run.

## Notes

- **Registry audit:** skipped, since there is no `components.json`.
- **Files audited:** `index.html`, `src/sandbox/debug-draw.ts`, and `src/sandbox/main.ts` (grep only).
- **Verification:** the color reuse, HUD font and box, and canvas markup findings were re-checked against the source after the audit.
