# Flippers — Browser Pinball

## What This Is

A browser-based pinball game with an original space-themed table, built as an HTML5 game rendered entirely in code — no hand-painted or copied art, with sound synthesized at runtime. Built as a portfolio/demo piece: a polished pinball game anyone can play in their browser with no install.

v1.0 ships one complete table: plunger, two flippers, a three-bumper cluster, slingshots, rollover lanes and inlanes, a 3-ball game with nudge/tilt, a skill shot, a ball save with a center-post kickback, an end-of-ball bonus and a local high score, all on tunnel-proof fixed-step physics.

## Core Value

The moment-to-moment pinball loop — plunger, flippers, ball physics, and bumpers — feels satisfying, weighty, and true to real pinball. If the physics and flipper feel are wrong, nothing else matters.

(Re-checked at v1.0: still the right priority. The open v1.0 limit that matters most, root-strip flips meeting the slingshot, is a feel problem.)

## Current State

**Shipped:** v1.0 MVP on 2026-11-25 (12 phases, 84 plans, 195 tasks; 2026-07-15 → 2026-11-25).

- **Code:** about 15,750 lines of TypeScript source in `src/` plus about 28,400 lines of tests (69 test files, 1,523 tests, a 630 s seeded soak gate). The production build is about 311 kB (79 kB gzip), with zero image, font or audio assets.
- **Stack:** Planck.js 1.5.0, Canvas 2D, Web Audio, Vite 8.1.4, TypeScript 5.9.3 (strict), Vitest 4, ESLint 9 + Prettier, jsdom 31.0.1 (dev only, favicon gate).
- **Audit:** v1.0 audit at e6ab1a5: requirements 28/28, integration 36/36, flows 8/8, status `tech_debt` (no gaps).
- **Known issues and tech debt:** see `.planning/milestones/v1.0-MILESTONE-AUDIT.md`. The main items:
  - Root-strip flips (d < 0.25 m) still meet the sling's inlane corner (10/139 clear). Fixing it needs a bat-to-ball rescale (pending todo).
  - Open info-level review rows in the 06.2, 06.3, 06.4, 06.4.1 and 06.4.1.1 disposition ledgers.
  - TypeScript is pinned to 5.9.3, not 7.0.2, until typescript-eslint supports TS 7.
  - Phases 1 and 2 have no VALIDATION.md.
  - Pre-existing moderate/high `npm audit` advisories in dev tooling.
  - 8 phase VERIFICATION reports went stale under later tech-debt phases; the milestone audit at HEAD covers them.

## Requirements

### Validated

- ✓ Stable 2D ball physics: no tunneling at speed, frame-rate independent (fixed 120 Hz step, bit-identical at 60/120/144 Hz), with a swept-containment soak and a proven-red CCD-off control. Engine locked: Planck.js 1.5 `setBullet` + `continuousPhysics`. — v1.0 (Phase 1)
- ✓ Two keyboard flippers with real rotational momentum transfer, a jitter-free cradle FSM and adaptive angular sub-stepping, so a bat can never be swept through the ball. The "heavy, not floaty" feel was operator-accepted. — v1.0 (Phase 2)
- ✓ Variable-power plunger: hold Space to charge over about 0.67 s, launch speed linear in charge, and focus loss cancels the charge. — v1.0 (Phase 3)
- ✓ Original table built from standard pinball elements, all from one parametric `table/spec`, so colliders and drawing cannot drift. Seeded drops drain with no traps. — v1.0 (Phase 3)
- ✓ Reactive elements kick and score: bumpers 5.5 m/s (+1,000), slingshots 4.5 m/s (+500), rollovers and inlanes, with bounded kick energy. — v1.0 (Phase 4)
- ✓ Live DOM score display, nudge/tilt, and a 3-ball game loop that replays bit-identically. Flipper input is hardened against Windows Shift quirks. — v1.0 (Phase 4)
- ✓ Every element flashes and sounds on hit, from the collision bus. — v1.0 (Phase 5)
- ✓ All graphics procedural at a stable 60 fps (baked static layer plus interpolated moving parts), enforced by an asset-free test gate. — v1.0 (Phase 5)
- ✓ Sound synthesized at runtime with Web Audio (a distinct voice per element, a 16-voice pool, click-free mute), silent until the first gesture. — v1.0 (Phase 5)
- ✓ Portfolio-grade juice: screen shake, particles, lighting and lamps, skill shot, end-of-ball bonus, ball save with kickback, persisted high score; reduced motion is honored. — v1.0 (Phase 6)
- ✓ Flips from mid-bat to the tip clear their own slingshot: 61 → 0 of 94 own-sling failures. — v1.0 (Phase 6.3)
- ✓ The HUD never covers the playfield (a measured side/bar switch), and the sling passive faces are visible. — v1.0 (Phase 6.4)
- ✓ A shared link works in a narrow window and boots with a clean console (bar-mode control hint, a procedural SVG favicon). — v1.0 (Phase 6.4.1)
- ✓ The bar hint shows only while the ball has settled on the plunger, and no HUD text is below 12 px. — v1.0 (Phase 6.4.1.1)

### Active

<!-- Next-milestone scope is set by /gsd-new-milestone. Candidates carried from v1.0: -->

- [ ] (candidate) Progression layer: original ranks/missions, a lock-and-jackpot, multiball (deferred at roadmap creation)
- [ ] (candidate) Bat-to-ball rescale so root-strip flips clear the slingshot (todo `2026-11-24-rescale-bat-to-ball-for-root-shots`)
- [ ] (candidate) Triage the open v1.0 review rows and gate-robustness gaps (see the milestone audit)
- [ ] (candidate) A ball-search coil cue through the cue queue (`getBallSearchCount()` has no consumer yet)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Copying any existing table's art, layout, names, or sounds — this is an original table in a clean procedural style (avoids copyright and an art pipeline)
- Extracting or redistributing any third-party game assets (art, audio) — copyright risk; the procedural approach sidesteps it
- Windows native `.exe` — browser-first for reach and simplicity; v1.0 confirmed the browser build carries the full feel
- Mobile / touch controls — desktop keyboard first. The HUD already fits phone-sized windows (06.4), but touch flipper input is its own UX problem; may revisit
- Multiplayer, online leaderboards, accounts — not core to the feel; a localStorage high score covers v1
- Level editor / multiple tables — a single original table; each table is a full physics and layout effort

(Mission/rank progression and multiball moved from Out of Scope to Active candidates at v1.0: the core loop they were waiting on has shipped.)

## Context

- **Genre:** Original space-themed pinball — a broad, well-established pinball theme; the table layout, names, and rules are our own design.
- **Rendering approach:** Everything drawn in code (procedural geometry + gradients), so there is no asset pipeline. Sound is synthesized via the Web Audio API rather than shipped as files.
- **Technical crux (retired in v1.0):** Fast, stable 2D physics with continuous collision detection. Planck.js CCD on the ball, adaptive angular sub-stepping on the flippers, and seeded swept-containment soak gates with proven-red controls keep the ball from tunneling.
- **Feel themes from UAT:** Flipper response and Windows keyboard quirks drew the most UAT rounds (Phase 4). The slingshot geometry against flipper shots drew the most tech-debt phases (06.1, 06.3, 06.4). Feel checks were approved by eye and by hand on real 60/144 Hz displays.

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
| Browser (HTML5) over Windows native | Simplest to build and share; no install; portfolio-friendly | ✓ Good (v1.0: full feel at 60/144 Hz in Chrome and Firefox) |
| Planck.js 1.5 (`setBullet` + `continuousPhysics`), dynamic flippers on motorized revolute joints, fixed 120 Hz step | The only mainstream JS engine with native CCD; dynamic bats transfer momentum through the solver | ✓ Good (Phase 1 lock; soak gates green through v1.0) |
| Adaptive angular sub-stepping sized from the live flipper speed (N ≤ 4) | Planck CCD does not cover a fast-rotating bat sweeping the ball | ✓ Good (Phase 2; proven-red control) |
| TypeScript pinned to 5.9.3 instead of 7.0.2 | `@typescript-eslint` 8 peer range is < 6.1.0 | ⚠️ Revisit when typescript-eslint supports TS 7 |
| Procedural runtime rendering over baked/ripped art | Near-zero assets; avoids copyright; enables an own clean style | ✓ Good (Phase 5: Canvas 2D, asset-free gate) |
| Original table design (not a recreation of any existing table) | Avoids copying another game's layout, names, or signature mechanics; standard pinball elements arranged for good ball flow | ✓ Good (decided 2026-11-19) |
| Core pinball loop first; missions/ranks/multiball deferred | De-risk the physics and feel before layering progression systems | ✓ Good (v1.0 shipped the loop; progression is the lead v1.1 candidate) |
| Synthesized audio (Web Audio) over sound files | Keeps asset load at zero; retro pinball sfx synthesize convincingly | ✓ Good (Phase 5: headphone pass in Chrome and Firefox) |
| One `table/spec` → `resolve()` drives both the colliders and the drawing | What's hit and what's drawn cannot drift (WR-03 confirmed the flipper drawing matches its collider) | ✓ Good (Phase 3) |
| Typed one-way collision bus, drained once per fixed step at the `onPostStep` seam | Scoring, rendering and audio (Phases 4–5) consume contacts without touching the world; the drain is read off the bus, not by position (CR-01) | ✓ Good (Phase 3) |
| Reactive kicks applied by one `ReactiveElements.service()` step via `applyImpulse`; bus listeners only record and award | Keeps the world write path single and ordered, so kicks stay deterministic and energy-bounded | ✓ Good (Phase 4) |
| HUD and diagnosis readout are DOM text, not canvas text | Canvas text shrank to ~3.4 px under the fit-to-viewport scale; DOM text stays legible and is screen-reader reachable | ✓ Good (Phase 4) |
| Audio unlock is a "starting episode": at most two bounded start windows until the context is seen running; a failed resume() opens nothing and is logged once | Three review rounds of per-finding flags each opened a new corner; one model with an invariant test table bounds the audio graph however resume() behaves and keeps the start figure on Shift-first unlocks (b04d725, UAT 9) | ✓ Good (Phase 5; one documented dropped-start residual) |
| Left/Right Shift stay default flipper bindings, with a Windows reliability note naming the arrow keys | Keeps Phase 2 D-09; Windows-only Shift heals cover the VK_SHIFT merge, and the OS Sticky Keys case is an accepted residual (UAT 18 decision A) | ✓ Good (Phase 4) |
| One ball save per ball; a center-post kickback spends it but keeps the kicked ball protected until the save window would have ended (at least 2 s) | A kick can only improve on the guaranteed save, never cost a ball the plain backstop would have saved; the first fix (a fixed 2 s grace) still lost balls 2–7 s after a kick and was caught on re-review (edd8db7) | ✓ Good (Phase 6) |
| One skill shot per ball; a backstop re-serve disarms it | The re-served ball is the same ball, so it gets no second attempt (40295c0, UAT 8) | ✓ Good (Phase 6) |
| High score lives only in localStorage (`flippers.hiscore.v1`, canonical decimal string), every access silently guarded | No accounts or server in v1; blocked storage must never break play | ✓ Good (Phase 6) |
| Slings and inlane sensors move together 0.35 m up-table through one shared `INLANE_Y` (WR-03); no other offset without a new decision | Base and mid-bat inlane flips were firing the ball at up to 2.64× the no-sling speed. The ratio is 1.00 after the move and the bat clears the sling by 0.45 m. At 0.40 a ball gets trapped. The look and feel were approved at D-01. The wall-side inlane gap (review WR-01) was closed in 06.2-03 by moving the inlane line to the funnel wall | ✓ Good (Phase 6.1) |
| Prettier is scoped to source by `.prettierignore` | `npm run format` was also rewriting 233 planning, agent and CLAUDE.md files; review ledgers must not be reformatted by tooling | ✓ Good (Phase 6.1) |
| The dead-flipper hinge-pocket soft-lock is backlogged, not fixed in v1.0 (D-02) | It is reachable only with dead flippers (TILT) and a ball resting in a narrow pocket, and a page reload recovers. A pending todo carries the reproduction | ✗ Superseded in Phase 6.2 by the tilted-only ball search below |
| Ball search runs only while tilted: 2 s still outside the plunger zone → a silent horizontal nudge toward centre, forfeit after 2 kicks via the tilted drain path; no cue sound in v1.0 | Fixes the hinge-pocket soft-lock without touching live play; `ballSearchSteps: 0` disables it and is the permanent RED control; `getBallSearchCount()` is the hook for a later coil sound | ✓ Good (Phase 6.2; WR-01 give-up cue mismatch open) |
| Each slingshot names its kick face in `TABLE_SPEC` (`kickFace` segment index → `resolve()` → `deriveKickFace`); `resolve()` throws on a missing or invalid index; the longest-segment rule is removed (D-09) | Trimming the sling shrinks the hypotenuse below the inlane edge, so the longest rule would have moved the kick, rubber, flash and sparks onto the inlane wall | ✓ Good (Phase 6.3) |
| Slings trimmed to t = 0.28 along the old hypotenuse, corner (0.944, 4.102), mirrored; own-sling contact is classified by the first sling touched (D-13/D-14, ruling A); the root strip stays a reported limit for a later bat-to-ball rescale (D-03) | Clears every mid-bat-to-tip flip off its own sling (61 → 0 of 94) without touching kick speed, direction, rule (1) clearance or the pinch proof; t = 0.30 still grazes once. Under a literal never-touches rule no bracketed corner passes, so the user chose first-contact at D-12 | ⚠️ Revisit (root strip 10/139; needs the bat-to-ball rescale) |
| The HUD side/bar choice is measured (`sideHudClears` on the fitted canvas vs the side panel's measured right edge, `heightUnderBar` for the fit), never a width media query; bar mode hides the controls list except Mute, the Windows note and the dev readout | A breakpoint guesses where the panel collides; measuring keeps 1024x768 on the side panel and puts 1080x1080 on the bar, and a fixed bar height means M/Enter never move the table | ✓ Good (Phase 6.4) |
| Slings get a SLING_RIM stroke on every non-kick segment, drawn between the body fill and the amber rubber | Root-strip shots bounce off the lower face, so it must be visible; the kick face stays the brightest sling edge and the change is render-only | ✓ Good (Phase 6.4) |
| The bar-mode control hint is static markup after `#hud-status`, sharing its grid cell and hidden by `visibility` whenever any status shows; it shows whenever the status is empty (A1 = A), not only before the first launch | CSS-only keeps the change render/DOM-only and the bar height constant; the UI review notes "Hold Space to launch" is stale during play, and a launch-scoped hint needs a JS change | ✗ Superseded in Phase 6.4.1.1 by the ready-only hint below |
| The side panel reserves the widest status in CSS (`min-width: calc(23 * (1ch + 0.12em))`) so `applyView` measures its final width at boot; bar mode resets it | Fixes 06.4 WR-02 without a re-measure in the frame loop; the cost is that the side/bar threshold at 900 px tall moves up to about 1109–1148 px | ✓ Good (Phase 6.4.1) |
| The favicon is one inline SVG data URI in `<head>` drawn from palette.ts colours; the RND-01 gate admits exactly that one link after validating its decoded SVG with jsdom parsers, and keeps the icon-link and data-URI patterns for everything else | No icon file and no `public/` keeps the build asset-free and scanned; a narrow carve-out is safer than loosening the gate | ✓ Good (Phase 6.4.1 + quick 261125-0es) |
| The bar hint shows only while `GameSession.isBallOnPlunger()` is true and no status shows; HudView writes a constant `data-ready` attribute on change and CSS keys `visibility` on it (D-01..D-05) | Fixes the stale "Hold Space to launch" during play with a read-only getter the sim never reads, so the change stays add-only in game-session.ts and the replays stay bit-identical | ✓ Good (Phase 6.4.1.1) |
| `isBallOnPlunger()` reports ready only after 12 consecutive resting fixed steps (`PLUNGER_HINT_SETTLE_STEPS`, 100 ms), counted in `tick()` and reset on re-serve (D-10) | A single-step rest test was true for 2–3 steps at every bounce apex, so the hint blinked on each fall-back (CR-01); an apex rests at most ~2.6 steps, well under the window | ✓ Good (Phase 6.4.1.1) |

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
*Last updated: 2026-11-25 after v1.0 milestone*
