# Flippers — Browser Pinball

## What This Is

A browser-based pinball game with an original space-themed table, built as an HTML5 game rendered entirely in code — no hand-painted or copied art, with sound synthesized at runtime. Built as a portfolio/demo piece: a polished pinball game anyone can play in their browser with no install.

## Core Value

The moment-to-moment pinball loop — plunger, flippers, ball physics, and bumpers — feels satisfying, weighty, and true to real pinball. If the physics and flipper feel are wrong, nothing else matters.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Stable 2D ball physics — gravity, momentum, realistic bounce, no tunneling through thin walls/flippers at speed, frame-rate-independent (fixed 120Hz timestep) — **Validated in Phase 1 (Physics Core Spike):** headless swept-containment soak gate is green with a proven-red CCD-off negative control (incl. the fast test-flipper intra-step case); ball feel is bit-identical at 60/120/144Hz and survives tab-blur; physics is isolated behind an N-ball-ready ball/flipper/event interface; engine chosen and locked on evidence (Planck.js 1.5 `setBullet` + `continuousPhysics`). The by-feel "heavy" verdict was deferred to Phase 2 and is now **settled** (see below).
- [x] Two keyboard-controlled flippers with correct rotational physics and ball interaction — **Validated in Phase 2 (Flippers & Feel):** two mirrored, keyboard-driven capsule flippers on motorized revolute joints respond sub-frame (per-fixed-step input drain at 120Hz; `event.code` multi-binding, auto-repeat/blur-safe), transfer real rotational momentum (a tip hit out-launches a base hit, `v = ω × r`), hold a jitter-free cradle via an explicit `resting → flipping-up → held-up → returning` FSM, and can **never** be swept through the ball (adaptive angular sub-stepping, proven by a seeded green gate with a proven-red sub-stepping-OFF negative control). Input + FSM are engine-agnostic (only `planck-world.ts` imports `planck`). The Phase-1-deferred "heavy, not floaty" verdict is **operator-accepted on the live rig** — this is the project's stated Core Value, proven and tuned.

### Active

<!-- Current scope. Building toward these. All hypotheses until shipped. -->

- [ ] Ball launches via a plunger with variable power (hold to charge, release to fire)
- [ ] Original space-themed table layout built from standard pinball elements: right-side launch chute, upper bumper cluster, lanes/rollovers, guide walls/ramps, and center-bottom drain funnel, positioned for good ball flow
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
- Copying any existing table's art, layout, names, or sounds — this is an original table in a clean procedural style (avoids copyright and an art pipeline)
- Extracting or redistributing any third-party game assets (art, audio) — copyright risk; procedural approach sidesteps it
- Windows native `.exe` — browser-first for reach and simplicity
- Mobile / touch controls — desktop keyboard first; may revisit
- Multiplayer, online leaderboards, accounts — not core to v1 value
- Level editor / multiple tables — single original table for v1

## Context

- **Genre:** Original space-themed pinball — a broad, well-established pinball theme; the table layout, names, and rules are our own design.
- **Rendering approach:** Everything drawn in code (procedural geometry + gradients), so there is no asset pipeline. Sound is synthesized via the Web Audio API rather than shipped as files.
- **Technical crux:** Pinball demands fast, stable 2D physics with continuous collision detection — the make-or-break risk is the ball tunneling through thin flippers/walls at high speed. This is the area to prove out first.

## Constraints

- **Platform**: Browser (HTML5) — must run in modern browsers with no install.
- **Assets**: Procedural rendering and synthesized audio only — no ripped or redistributed third-party art/sound (copyright + simplicity).
- **Fidelity**: Original table design built on standard pinball conventions; authentic-feeling physics; clean procedural visual style.
- **Performance**: Stable 60fps physics/rendering — non-negotiable for feel.
- **Quality bar**: Portfolio-grade polish — shareable and impressive.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browser (HTML5) over Windows native | Simplest to build and share; no install; portfolio-friendly | — Pending |
| Procedural runtime rendering over baked/ripped art | Near-zero assets; avoids copyright; enables an own clean style | — Pending |
| Original table design (not a recreation of any existing table) | Avoids copying another game's layout, names, or signature mechanics; standard pinball elements arranged for good ball flow | ✓ Decided 2026-11-19 |
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
*Last updated: 2026-11-19 after re-scope to an original table (quick task 261119-sbr)*
