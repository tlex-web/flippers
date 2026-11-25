# Phase 4 — UI Review (re-audit after 04-12 / 04-13)

**Audited:** 2026-11-21
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md)
**Screenshots:** not captured. No dev-server probe was run, so this is a code-only audit.
**Interaction captures:** off (workflow.ui_interaction_capture is false); interaction findings are code-derived
**Previous review:** 16/24 (after 04-09/04-10)

Scope: `index.html:76-153`, `src/ui/key-labels.ts`, and `src/sandbox/main.ts:62,228` (grep). Other files are carried forward from the prior review. 04-12 is input-only and has no visual surface.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Key caps now follow the player's layout, which fixes the QWERTZ mislabel. The new note is clear but is shown to every OS and gives no reason for "Shift can stick". WARNING/TILT copy is unchanged. |
| 2. Visuals | 3/4 | Hierarchy is intact. The new note adds a second text block under the keys, and both fixed panels still ignore the canvas rect. |
| 3. Color | 2/4 | Unchanged. Hardcoded hex, `#ef476f` has three meanings, and one amber is shared by every status. The new rule reuses the existing hardcoded values and adds no tokens. |
| 4. Typography | 2/4 | Regression. The new `.hud-controls-note` is 11px (`index.html:100`) and sits next to the 11px `.hud-label`. The DOM text floor is broken in two places, and the sizes are now 11/12/16/32. |
| 5. Spacing | 3/4 | `contain: inline-size` keeps the note from widening the panel. There is still no `@media`, and the 8px note margin adds another off-grid value. |
| 6. Experience Design | 2/4 | Unchanged. The Keyboard Map relabel degrades safely, but there is still no touch path, no pause message and no tilt emphasis. |

**Overall: 15/24** (down 1 from 16. The cause is the new 11px note, which breaks the 12px floor the last review had mostly restored.)

---

## Resolved or improved by 04-13

| Item | Status |
|------|--------|
| Key caps printed a literal Z or / that is wrong on QWERTZ and other layouts | Resolved for Chromium (`data-code` plus `getLayoutMap()`). The label is filtered to one code point and written with `textContent` (`key-labels.ts:60-64, 85`). |
| Layout-dependent text is shown without being checked | Resolved. `[data-layout-only]` stays `hidden` unless every cap resolved (`key-labels.ts:88-90`), so the page does not name keys it cannot vouch for. |
| Windows users have no guidance on flipper keys | Addressed by the note at `index.html:145-151`. Arrow keys are always shown, which is the safe default. |

## New findings from 04-13

| Finding | Class | Location |
|---------|-------|----------|
| The note is 11px, below the 12px floor, and it is on the primary hint panel. | WARNING | `index.html:100` |
| The note is shown on every OS ("On Windows, ..."), including macOS and Linux players, where it is noise. | WARNING | `index.html:146` |
| "Shift can stick" gives no cause or remedy, and it is the only mention that Shift is a poor choice. The Left Shift and Right Shift caps are still listed in the rows above it as primary bindings, which is a mixed message. | WARNING | `index.html:139, 141, 150` |
| In the revealed state the note reads "<-  ->  Z  /  are the most reliable". The `/` cap is again adjacent to plain text and spaces, so it is ambiguous as a separator, which is the problem the earlier hint fix removed. On QWERTZ it would show `-`, which reads as a hyphen. | WARNING | `index.html:147-148` |
| Non-Chromium browsers (Firefox, Safari) keep the US labels with no cue that they may be wrong on their layout. The page cannot detect that, but the note could say "labels assume a US layout". | minor | `key-labels.ts:12-19` |
| The relabel runs asynchronously at boot, so on QWERTZ the first paint shows the US label and then swaps it. This is a small flash, not a defect. | minor | `main.ts:228` |
| The note's markup uses `</kbd\n><span` to suppress whitespace. It is fragile under Prettier and likely to be reflowed. | minor | `index.html:146-148` |

## Still open (carried forward, all still hold)

| Finding | Status |
|---------|--------|
| TILT, WARNING, start and game-over prompts share one amber | Open |
| No touch or pointer path, and the hint says keys only | Open |
| Fixed top-left HUD (now taller with the note) and bottom-left diag overlap the table at narrow or short viewports; no `@media` | Open, slightly worse (the note adds roughly 2-3 lines of height) |
| `#ef476f` is the drain, the velocity arrow and the full meter | Open |
| Lit rollover contrast is weak for low vision | Open |
| Game-over drops the ball line and has no final-score emphasis | Open |
| Canvas `role="img"` label is static | Open |
| `.hud-label` is 11px | Open, and now joined by the note |

---

## Top Priority Fixes

1. **WARNING: status states are undifferentiated** (`index.html:59`, `hud.ts:70-79`). Tilt looks the same as "PRESS ENTER TO START". Add `.is-tilt`, `.is-warning` and `.is-prompt` classes in the write-on-change branch of `HudView.update()`.
2. **WARNING: no touch or pointer input** (`main.ts`). The page is unplayable on a phone, and the hint does not say so. Add a "keyboard required" line now, and on-screen controls in Phase 5.
3. **WARNING: fixed panels overlap the playfield on small viewports** (`index.html:25-36, 95-109`). Hide `#hud-controls` and the note below about 900px wide or 700px tall, dock the HUD beside the canvas, and hide `#hud-diag` outside dev.
4. **WARNING: 11px text** (`index.html:38, 100`). Raise `.hud-label` and `.hud-controls-note` to 12px. This regresses Typography and is a two-line fix.
5. **WARNING: the Windows note is shown on all platforms and mixes messages** (`index.html:145-151`). Gate it on `navigator.userAgent` or `userAgentData.platform`, or drop it to a `title` on the Shift caps. Reword, for example: "Shift keys can stick on Windows. Arrows are most reliable." Put the Shift caps last in each row, or remove them from the primary rows.
6. **WARNING: `#ef476f` carries three meanings** (`debug-draw.ts:56, 61, 101`). Give each a distinct hue.
7. **WARNING: lit/unlit rollover contrast** (`debug-draw.ts:64-66`). Add a fill or glow for the lit state.
8. **WARNING: move colors into CSS custom properties.** `#05060d`, `#e8eefc`, `#8892b0`, `#c3cbe6`, `#ffd166` and the `rgba(138,160,255,...)` values repeat across the sheet.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- The layout-relabelled caps are a real improvement: a German player now sees the printed character, not a wrong "Z" or "/".
- The note copy is short and understandable. Defects: it is shown to non-Windows players, "Shift can stick" has no cause or remedy, and it contradicts the Shift caps listed as bindings above.
- WARNING and TILT still state neither the cause nor the consequence (`hud.ts:70-79`). There are no generic OK/Submit/Cancel strings.

### Pillar 2: Visuals (3/4)
- The score stays the focal point at 32px/700. The note is muted `#8892b0` at 11px, so it is visually subordinate, which is correct.
- The HUD panel is now the tallest element on screen: score, ball, status, five rows, then the note. It covers more of the upper-left lanes than before.
- The `kbd` caps are shared by the list and the note, which gives consistent visual language.
- Fixed panels ignore the canvas rect. The lit-rollover cue is unchanged.

### Pillar 3: Color (2/4)
- No custom properties. The new `.hud-controls-note` hardcodes `#8892b0`, a fourth copy of that value.
- The `kbd` rule is reused and adds no new hues, which is good.
- The status line has one color for four meanings, and `#ef476f` has three meanings. Contrast passes AA at the muted values (about 6:1).

### Pillar 4: Typography (2/4)
- DOM sizes are 11px (`.hud-label`, `.hud-controls-note`), 12px (hint, diag), 16px and 32px. Four sizes, and two elements sit below the 12px floor. The prior review had declared the floor a goal and fixed the hint, so the note is a fresh regression.
- Weights are 700 and normal only. The mono stack is consistent. Tabular-nums is on the score and diag.
- `line-height: 1.6` on the note is comfortable, but it does not offset the small size.

### Pillar 5: Spacing (3/4)
- `contain: inline-size` (`index.html:97-98`) is a deliberate, well-commented choice that keeps the panel width set by the rows. This is the strongest part of the delta.
- The note adds an 8px top margin (on-grid), but the HUD's 10/12px and the diag's 6px remain off-grid.
- There is no `@media` and no safe-area inset. The 16px offsets are consistent.

### Pillar 6: Experience Design (2/4)
- The relabel feature degrades safely. `readLayoutMap` never rejects (`key-labels.ts:104-118`), a missing API leaves the markup labels, and layout-only content stays hidden. The text-only write avoids injection. It runs once at boot, so it adds no per-frame cost.
- Missing, unchanged: touch or pointer input, a pause or blur message, tilt emphasis, a way to hide the HUD or hint during play, and final-score emphasis in game-over.
- The note is static and cannot be dismissed. It persists during play, over the table.
- Code-derived only: no interaction was captured. Registry audit skipped (no `components.json`).

---

## Files Audited
- `C:/Users/aster/projects-source/flippers/index.html` (lines 76-155)
- `C:/Users/aster/projects-source/flippers/src/ui/key-labels.ts`
- `C:/Users/aster/projects-source/flippers/src/sandbox/main.ts` (grep: `initKeyLabels` wiring)
- Carried forward from the prior review: `hud.ts`, `debug-draw.ts`

Not read: the 04-01..04-13 PLAN and SUMMARY files. Findings come from the prior review plus the current code.
