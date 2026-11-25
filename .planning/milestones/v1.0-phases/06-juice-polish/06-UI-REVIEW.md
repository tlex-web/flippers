---
phase: "6"
slug: "juice-polish"
audited: "2026-11-23"
baseline: "06-UI-SPEC.md"
overall_score: 19
max_score: 24
mode: "code-only (screenshots unavailable — Playwright browser not installed)"
provisional: true
blockers: 0
---

# Phase 6 — UI Review

> Retroactive 6-pillar audit against the `06-UI-SPEC.md` design contract. Code-and-CSS only: the dev server answered on :5173 but `npx playwright screenshot` failed (browser install missing), so visual pillars are capped. The live look of every Phase-6 effect was approved by the user at the per-plan human-verify tracer checkpoints (ball shadow, lamps, skill-shot sting, bonus overlay, kickback, shake, save ring + post, high-score line, hit bursts, glints).

## Pillar Scores

| Pillar | Score | Key finding |
|--------|-------|-------------|
| Copywriting | 4/4 | `TILT · NO BONUS`, `SKILL SHOT n`, `BALL SAVED`, `NEW HIGH SCORE`, `HIGH SCORE` present in `src/ui/hud.ts` (~L168-174); status copy and glyphs match the contract |
| Visuals | 3/4 | Focal hierarchy, draw order and baked-only effects compliant; capped — no pixel verification possible |
| Color | 4/4 | `src/render/sprites.ts` builds `rgb()/rgba()` only from parsed palette constants; new CSS colors echo palette tokens; `--accent-glow` reused for bonus TOTAL and best-score pulse |
| Typography | 3/4 | Bonus overlay uses only 11/16/32 px at 400/700 with tabular-nums + nowrap as specced; accepted FLAG remains (11 px and 12 px both in use → 4 sizes); bonus heading sets no explicit `font-weight` |
| Spacing | 3/4 | Overlay uses 4/8/16/24/240 px as specced; frozen 10 px / 6 px exceptions untouched; `.hud-bonus-total` `margin-top: 8px` stacks on the grid `row-gap: 4px` → effective 12 px gap, off the declared scale |
| Experience Design | 3/4 | Reduced motion honored in `shake.ts` and at the renderer; status `aria-live`; overlay `aria-hidden` + `pointer-events: none`; rows pre-laid with `visibility: hidden` so the panel never resizes; score count-up snaps under reduced motion (06-06, hud.test.ts); 375 px layout unverified |

**Overall: 19/24 (provisional)** — no BLOCKERs.

## Top Fixes

1. **WARNING — visual pillars unverified at 1440 / 768 / 375 px.** Install a Playwright browser (`npx playwright install chromium`) and re-run `/gsd-ui-review 06`. Main thing to check: the fixed-center `.hud-bonus` (min-width 240 px + padding) against the `.hud` panel at 375 px.
2. **WARNING — bonus TOTAL gap is 12 px, contract says 8 px.** Either set `.hud-bonus-total { margin-top: 4px }` in `index.html` (~L270) so it sums to 8 px with the 4 px row-gap, or accept 12 px and amend the UI-SPEC.
3. **MINOR — bonus heading has no explicit `font-weight`.** Set it to the specced weight so it does not depend on the UA default.

## Verified Compliant

- No `shadowBlur` or `ctx.filter` in the live `draw()` path — `shadowBlur` confined to bake-time code in `static-layer.ts` (D-24 frame rule).
- No `Math.random` anywhere in `src/render`.
- High-score pulse stays on under reduced motion, as the spec requires.
- Registry audit skipped (no shadcn / `components.json`).

## Audit Scope

Read in full: `06-UI-SPEC.md`, `index.html`. Grep-level: `src/render/{sprites,static-layer,table-renderer,shake,palette}.ts`, `src/ui/hud.ts`. Lamp timing, particle counts and draw order were verified separately by the security audit (`06-SECURITY.md`: T-6-04, T-6-20, T-6-25, T-6-28) and by the phase test suite.
