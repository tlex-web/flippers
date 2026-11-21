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

- [x] Ball launches via a plunger with variable power (hold to charge, release to fire): **Validated in Phase 3 (Table, Plunger & Event Bus).**
  - A Space hold charges over about 0.67 s.
  - Release fires one impulse up the chute, scaled from the minimum to the maximum by the charge (launch speed is linear in charge).
  - A bottom-to-top meter and the plunger pullback read the same `getCharge()` value that sets the impulse.
  - Focus loss cancels the charge and never launches.
- [x] Original table layout built from standard pinball elements: **Validated in Phase 3.**
  - Elements: right-side launch chute, three-bumper cluster, rollover lanes, orbit guides, inlanes, slingshots, drain funnel and inverted-V flippers.
  - All of it comes from one parametric `table/spec`, so the colliders and the drawing cannot drift apart.
  - Seeded drops drain with no traps. A real-table swept-containment soak gate is green.
  - In the UAT Chrome run, 10 launches all drained with no stalls, and the layout was operator-accepted by eye.
- [x] Reactive elements kick and score: **Validated in Phase 4 (Reactive Elements & Game Rules).**
  - Bumpers raise outward speed to 5.5 m/s (+1,000), slingshots to 4.5 m/s (+500); rollovers light and pay, all three lit pays 10,000; inlanes pay 2,000.
  - Kick energy is bounded: seeded dead-flipper drops all drain, and a rules-live 630 s soak stays green with CCD on.
  - The visual flash and sound for each hit stay in Active (Phase 5).
- [x] Live score display: **Validated in Phase 4.** Score, BALL n / 3 and a status line are DOM text written only on change; the diagnosis readout and a five-row controls list are DOM panels too.
- [x] Tilt / nudge: **Validated in Phase 4.** X, Period and ArrowUp give a velocity-only shove; over-nudging warns, then TILTs. A tilt kills the elements, drops the bats and costs only the current ball.
- [x] 3-ball game loop: **Validated in Phase 4.** Attract with no ball until Enter, three serves, GAME OVER with the score kept; replays bit-identically at 60/120/144 Hz.
  - Flipper input was hardened during UAT: reversal dead time removed, no stuck bats on quick taps, and Windows Shift quirks (Sticky Keys, both-Shift VK merge, focus loss) healed. Arrow keys and Shift passed on a real Windows keyboard.

### Active

<!-- Current scope. Building toward these. All hypotheses until shipped. -->

- [ ] Bumpers, slings and rollovers flash and sound on hit (the kick and scoring shipped in Phase 4)
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
| One `table/spec` → `resolve()` drives both the colliders and the drawing | What's hit and what's drawn cannot drift (WR-03 confirmed the flipper drawing matches its collider) | ✓ Phase 3 |
| Typed one-way collision bus, drained once per fixed step at the `onPostStep` seam | Scoring, rendering and audio (Phases 4–5) consume contacts without touching the world; the drain is read off the bus, not by position (CR-01) | ✓ Phase 3 |
| Reactive kicks applied by one `ReactiveElements.service()` step via `applyImpulse`; bus listeners only record and award | Keeps the world write path single and ordered, so kicks stay deterministic and energy-bounded | ✓ Phase 4 |
| HUD and diagnosis readout are DOM text, not canvas text | Canvas text shrank to ~3.4 px under the fit-to-viewport scale; DOM text stays legible and is screen-reader reachable | ✓ Phase 4 |
| Left/Right Shift stay default flipper bindings, with a Windows reliability note naming the arrow keys | Keeps Phase 2 D-09; Windows-only Shift heals cover the VK_SHIFT merge, and the OS Sticky Keys case is an accepted residual (UAT 18 decision A) | ✓ Phase 4 |

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
*Last updated: 2026-11-21 after Phase 4*
