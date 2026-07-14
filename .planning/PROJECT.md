# Space Cadet Pinball — Browser Edition

## What This Is

A browser-based recreation of Windows XP's *3D Pinball for Windows – Space Cadet*. It rebuilds the classic space-themed pinball table as an HTML5 game rendered entirely in code — no ripped or hand-painted art, with sound synthesized at runtime. Built as a portfolio/demo piece: a faithful, polished pinball game anyone can play in their browser with no install.

## Core Value

The moment-to-moment pinball loop — plunger, flippers, ball physics, and bumpers — feels satisfying and faithful to the original. If the physics and flipper feel are wrong, nothing else matters.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. All hypotheses until shipped. -->

- [ ] Ball launches via a plunger with variable power (hold to charge, release to fire)
- [ ] Two keyboard-controlled flippers with correct rotational physics and ball interaction
- [ ] Stable 2D ball physics — gravity, momentum, realistic bounce, no tunneling through thin walls/flippers at speed
- [ ] Space Cadet table layout recreated: launch chute, bumper cluster, ramps, lanes, and drain positioned like the original
- [ ] Bumpers and targets react (bounce + visual flash + sound) and award points
- [ ] Live score display
- [ ] Tilt / nudge mechanic (nudge the table, over-nudge triggers tilt)
- [ ] Ball-count game loop (e.g. 3 balls, drain ends a ball, game over after last)
- [ ] All graphics rendered procedurally (Canvas/WebGL) at a stable 60fps
- [ ] Sound effects synthesized at runtime (Web Audio) — no audio files
- [ ] Portfolio-grade "juice": visual/audio feedback that makes play feel responsive and polished

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Mission / rank / promotion progression system — deferred to a later milestone; de-risk the core loop first
- Multiball mode — deferred alongside the mission system
- Pixel-faithful replica of the original XP artwork — deliberately using a clean procedural style instead (avoids copyright and an art pipeline)
- Extracting or redistributing original Microsoft / Cinematronics assets (art, audio) — copyright risk; procedural approach sidesteps it
- Windows native `.exe` — browser-first for reach and simplicity
- Mobile / touch controls — desktop keyboard first; may revisit
- Multiplayer, online leaderboards, accounts — not core to v1 value
- Level editor / multiple tables — single faithful table for v1

## Context

- **Reference game:** *3D Pinball for Windows – Space Cadet* (Microsoft; bundled with Plus!/2000/XP). Originally the "Space Cadet" table from Cinematronics/Maxis *Full Tilt! Pinball*.
- **Rendering approach:** Everything drawn in code (procedural geometry + gradients), so there is no asset pipeline. Sound is synthesized via the Web Audio API rather than shipped as files.
- **Technical crux:** Pinball demands fast, stable 2D physics with continuous collision detection — the make-or-break risk is the ball tunneling through thin flippers/walls at high speed. This is the area to prove out first.
- **Useful reference:** An open-source decompilation of the original ("SpaceCadetPinball") documents the table geometry and mechanics, which can guide a faithful layout/behavior recreation without copying any assets.

## Constraints

- **Platform**: Browser (HTML5) — must run in modern browsers with no install.
- **Assets**: Procedural rendering and synthesized audio only — no ripped or redistributed original art/sound (copyright + simplicity).
- **Fidelity**: Faithful gameplay and table layout, but an original clean visual style — not a pixel-perfect copy.
- **Performance**: Stable 60fps physics/rendering — non-negotiable for feel.
- **Quality bar**: Portfolio-grade polish — shareable and impressive.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browser (HTML5) over Windows native | Simplest to build and share; no install; portfolio-friendly | — Pending |
| Procedural runtime rendering over baked/ripped art | Near-zero assets; avoids copyright; enables an own clean style | — Pending |
| Recreate Space Cadet's actual table layout | Faithfulness is the point; the layout is the game's identity | — Pending |
| Core pinball loop first; missions/ranks/multiball deferred | De-risk the physics and feel before layering progression systems | — Pending |
| Synthesized audio (Web Audio) over sound files | Keeps asset load at zero; retro pinball sfx synthesize convincingly | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-15 after initialization*
