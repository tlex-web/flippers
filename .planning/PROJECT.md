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
- [x] Bumpers, slings and rollovers flash and sound on hit: **Validated in Phase 5 (Rendering & Audio).** Every element flashes and decays cleanly from the contact bus; walls and the chute flash silently (RND-03, UAT 5).
- [x] All graphics rendered procedurally at a stable 60fps: **Validated in Phase 5.** Canvas 2D table with a baked static layer and interpolated moving parts holds 60 fps and steps every frame at 144 Hz; zero image, font or audio assets, enforced by the asset-free test (RND-01, RND-02, UAT 1–3). The HUD stays DOM text (D-01, accepted override).
- [x] Sound effects synthesized at runtime (Web Audio), no audio files: **Validated in Phase 5.** Distinct voice per element with velocity and pitch variation, a 16-voice pool with click-free stealing, a click-free mute fade, and nothing before the first gesture (AUD-01, UAT 6–9).
- [x] Portfolio-grade "juice": visual/audio feedback that makes play feel responsive and polished: **Validated in Phase 6 (Juice & Polish).**
  - Feel: subtle decaying screen shake (HUD never shakes; reduced motion removes it) and seeded impact particles kept under the photosensitive footprint.
  - Depth and light: ball drop shadow, light pool, vignette, lit/unlit inserts and rollover lenses, attract-mode chase.
  - Rewards: a rotating skill shot (5k–25k, one attempt per ball), count-up score and end-of-ball bonus tally, a 7 s ball save with a center-post kickback, and a localStorage high score with a NEW HIGH SCORE fanfare.
  - PLSH-01..08 verified 5/5; UAT 11/11 passed; two code-review fix rounds closed (CR-01 kickback grace) with 0 critical and 0 warning findings left.
- [x] Flips from mid-bat to the tip clear their own slingshot: **Validated in Phase 6.3.** Both slings trimmed to t = 0.28 (corner (0.944, 4.102)) with the kick face named explicitly; own-sling failures for 0.25 m ≤ d ≤ 0.45 m went from 61 to 0 of 94 on a seeded gate with RED, no-sling and walled-off controls; cross-shot grazes capped at 30 (2 knocked down); look and feel approved at D-12 ("approved A"). Known limit: the root strip (d < 0.25 m) clears 10/139 (118/139 with no slings), deferred to the bat-to-ball rescale backlog todo.
- [x] The HUD never covers the playfield and the sling's passive faces are visible: **Validated in Phase 6.4.** A measured switch keeps the top-left side panel where it clears the fitted table and otherwise turns the HUD into a constant-height 3-row bar above it (768x1024, 375x812, square windows), with the table fitted under the bar. Both slings carry a slate rim (#7d82a8, 0.015 m) on their passive faces under the amber kick face (lower face 1.48:1 → 5.35:1). Render-only: table, physics and game byte-identical to 41275c6. D-13 and the root-shot titles now state the first-contact gate. Approved at a three-viewport UAT ("approved"); verification 9/9; UI review 21/24.
- [x] A shared link works in a narrow window and boots with a clean console: **Validated in Phase 6.4.1.** In bar mode the status row shows "Hold Space to launch · ← → flip" whenever no status shows, hidden by `visibility` so the bar keeps one height (102.2 px in every state, measured). The side panel reserves the widest status (`calc(23 * (1ch + 0.12em))`), so it is 280.5 px from boot through GAME OVER and keeps its 16 px clearance (06.4 WR-02); at 900 px tall, windows about 1084–1148 px wide now take the bar. A procedural inline SVG favicon (bumper cap in a wall ring) removes the `/favicon.ico` 404, and the RND-01 gate admits exactly that one validated icon. Render/DOM-only: table, physics, game, input and the lockfile byte-identical to 4a8b8cb. Approved at a six-viewport UAT ("approved", A1 = A, icon = bumper); verification 17/17; UI review 20/24. Review WR-01/WR-02 (the icon validator missed HTML entities and SMIL colours) were fixed by `/gsd-code-review --fix` (7ccaad6, bdd0a4c) and re-verified 17/17. Known gaps: the re-review's new WR-01/WR-02 (a raw tab/LF/CR in the href splits tokens past the checks; attributes are still a denylist, so `filter=` can recolour) stay open for milestone-close triage. Both are test-gate gaps; the shipped icon is clean.
- [x] The bar hint is honest and no HUD text is below 12 px: **Validated in Phase 6.4.1.1.** "Hold Space to launch · ← → flip" shows only while the ball in play has rested on the plunger for 12 fixed steps (100 ms, `PLUNGER_HINT_SETTLE_STEPS`) and no status shows, including while Space is held, on every serve. A read-only `GameSession.isBallOnPlunger()` drives a `data-ready` attribute HudView writes on change; the `:empty` coupling is gone and the bar keeps one height. The settle window closed a re-verification gap (CR-01: the hint flashed at each bounce apex of a weak-plunge fall-back). The three 11 px labels are 12 px, with a test-guarded 12 px floor. Phase 6.4.1's VERIFICATION, SECURITY and VALIDATION were re-run at HEAD and name jsdom 31.0.1 and the current favicon gate. Physics, table, control and the lockfile byte-identical to 9a26577; both determinism replays bit-identical. Verification 7/7; UI review 22/24; re-review 0 critical, 0 warning, 6 info (open for milestone-close triage). Pending: the 100 ms settle feel at 375x812 rides end-of-phase UAT as a non-blocking check.

### Active

<!-- Current scope. Building toward these. All hypotheses until shipped. -->

- (no open requirements — every v1.0 requirement is validated)

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
| Procedural runtime rendering over baked/ripped art | Near-zero assets; avoids copyright; enables an own clean style | ✓ Phase 5 (Canvas 2D, asset-free gate) |
| Original table design (not a recreation of any existing table) | Avoids copying another game's layout, names, or signature mechanics; standard pinball elements arranged for good ball flow | ✓ Decided 2026-11-19 |
| Core pinball loop first; missions/ranks/multiball deferred | De-risk the physics and feel before layering progression systems | — Pending |
| Synthesized audio (Web Audio) over sound files | Keeps asset load at zero; retro pinball sfx synthesize convincingly | ✓ Phase 5 (headphone pass in Chrome and Firefox) |
| One `table/spec` → `resolve()` drives both the colliders and the drawing | What's hit and what's drawn cannot drift (WR-03 confirmed the flipper drawing matches its collider) | ✓ Phase 3 |
| Typed one-way collision bus, drained once per fixed step at the `onPostStep` seam | Scoring, rendering and audio (Phases 4–5) consume contacts without touching the world; the drain is read off the bus, not by position (CR-01) | ✓ Phase 3 |
| Reactive kicks applied by one `ReactiveElements.service()` step via `applyImpulse`; bus listeners only record and award | Keeps the world write path single and ordered, so kicks stay deterministic and energy-bounded | ✓ Phase 4 |
| HUD and diagnosis readout are DOM text, not canvas text | Canvas text shrank to ~3.4 px under the fit-to-viewport scale; DOM text stays legible and is screen-reader reachable | ✓ Phase 4 |
| Audio unlock is a "starting episode": at most two bounded start windows until the context is seen running; a failed resume() opens nothing and is logged once | Three review rounds of per-finding flags each opened a new corner; one model with an invariant test table bounds the audio graph however resume() behaves and keeps the start figure on Shift-first unlocks (b04d725, UAT 9) | ✓ Phase 5 |
| Left/Right Shift stay default flipper bindings, with a Windows reliability note naming the arrow keys | Keeps Phase 2 D-09; Windows-only Shift heals cover the VK_SHIFT merge, and the OS Sticky Keys case is an accepted residual (UAT 18 decision A) | ✓ Phase 4 |
| One ball save per ball; a center-post kickback spends it but keeps the kicked ball protected until the save window would have ended (at least 2 s) | A kick can only improve on the guaranteed save, never cost a ball the plain backstop would have saved; the first fix (a fixed 2 s grace) still lost balls 2–7 s after a kick and was caught on re-review (edd8db7) | ✓ Phase 6 |
| One skill shot per ball; a backstop re-serve disarms it | The re-served ball is the same ball, so it gets no second attempt (40295c0, UAT 8) | ✓ Phase 6 |
| High score lives only in localStorage (`flippers.hiscore.v1`, canonical decimal string), every access silently guarded | No accounts or server in v1; blocked storage must never break play | ✓ Phase 6 |
| Slings and inlane sensors move together 0.35 m up-table through one shared `INLANE_Y` (WR-03); no other offset without a new decision | Base and mid-bat inlane flips were firing the ball at up to 2.64× the no-sling speed. The ratio is 1.00 after the move and the bat clears the sling by 0.45 m. At 0.40 a ball gets trapped. The look and feel were approved at D-01. The wall-side inlane gap (review WR-01) was closed in 06.2-03 by moving the inlane line to the funnel wall | ✓ Phase 6.1 |
| Prettier is scoped to source by `.prettierignore` | `npm run format` was also rewriting 233 planning, agent and CLAUDE.md files; review ledgers must not be reformatted by tooling | ✓ Phase 6.1 |
| The dead-flipper hinge-pocket soft-lock is backlogged, not fixed in v1.0 (D-02) | It is reachable only with dead flippers (TILT) and a ball resting in a narrow pocket, and a page reload recovers. A pending todo carries the reproduction | ✗ Superseded in Phase 6.2 by the tilted-only ball search below |
| Ball search runs only while tilted: 2 s still outside the plunger zone → a silent horizontal nudge toward centre, forfeit after 2 kicks via the tilted drain path; no cue sound in v1.0 | Fixes the hinge-pocket soft-lock without touching live play; `ballSearchSteps: 0` disables it and is the permanent RED control; `getBallSearchCount()` is the hook for a later coil sound | ✓ Phase 6.2 (UAT: kick and give-up read acceptably) |
| Each slingshot names its kick face in `TABLE_SPEC` (`kickFace` segment index → `resolve()` → `deriveKickFace`); `resolve()` throws on a missing or invalid index; the longest-segment rule is removed (D-09) | Trimming the sling shrinks the hypotenuse below the inlane edge, so the longest rule would have moved the kick, rubber, flash and sparks onto the inlane wall | ✓ Phase 6.3 |
| Slings trimmed to t = 0.28 along the old hypotenuse, corner (0.944, 4.102), mirrored; own-sling contact is classified by the first sling touched (D-13/D-14, ruling A); the root strip stays a reported limit for a later bat-to-ball rescale (D-03) | Clears every mid-bat-to-tip flip off its own sling (61 → 0 of 94) without touching kick speed, direction, rule (1) clearance or the pinch proof; t = 0.30 still grazes once. Under a literal never-touches rule no bracketed corner passes, so the user chose first-contact at D-12 | ✓ Phase 6.3 (D-12 "approved A") |
| The HUD side/bar choice is measured (`sideHudClears` on the fitted canvas vs the side panel's measured right edge, `heightUnderBar` for the fit), never a width media query; bar mode hides the controls list except Mute, the Windows note and the dev readout | A breakpoint guesses where the panel collides; measuring keeps 1024x768 on the side panel and puts 1080x1080 on the bar, and a fixed bar height means M/Enter never move the table | ✓ Phase 6.4 (UAT "approved") |
| Slings get a SLING_RIM stroke on every non-kick segment, drawn between the body fill and the amber rubber | Root-strip shots bounce off the lower face, so it must be visible; the kick face stays the brightest sling edge and the change is render-only | ✓ Phase 6.4 (UAT "approved") |
| The bar-mode control hint is static markup after `#hud-status`, sharing its grid cell and hidden by `visibility` whenever any status shows; it shows whenever the status is empty (A1 = A), not only before the first launch | CSS-only keeps the change render/DOM-only and the bar height constant; the UI review notes "Hold Space to launch" is stale during play, and a launch-scoped hint needs a JS change | ✗ Superseded in Phase 6.4.1.1 by the ready-only hint below |
| The side panel reserves the widest status in CSS (`min-width: calc(23 * (1ch + 0.12em))`) so `applyView` measures its final width at boot; bar mode resets it | Fixes 06.4 WR-02 without a re-measure in the frame loop; the cost is that the side/bar threshold at 900 px tall moves up to about 1109–1148 px | ✓ Phase 6.4.1 |
| The favicon is one inline SVG data URI in `<head>` drawn from palette.ts colours; the RND-01 gate admits exactly that one link after validating its decoded SVG, and keeps the icon-link and data-URI patterns for everything else | No icon file and no `public/` keeps the build asset-free and scanned; a narrow carve-out is safer than loosening the gate | ✓ Phase 6.4.1 (UAT "approved", icon = bumper) |
| The bar hint shows only while `GameSession.isBallOnPlunger()` is true and no status shows; HudView writes a constant `data-ready` attribute on change and CSS keys `visibility` on it (D-01..D-05) | Fixes the stale "Hold Space to launch" during play with a read-only getter the sim never reads, so the change stays add-only in game-session.ts and the replays stay bit-identical | ✓ Phase 6.4.1.1 (UAT "approved") |
| `isBallOnPlunger()` reports ready only after 12 consecutive resting fixed steps (`PLUNGER_HINT_SETTLE_STEPS`, 100 ms), counted in `tick()` and reset on re-serve (D-10) | A single-step rest test was true for 2–3 steps at every bounce apex, so the hint blinked on each fall-back (CR-01); an apex rests at most ~2.6 steps, well under the window | ✓ Phase 6.4.1.1 (verification 7/7; feel check pending UAT) |

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
*Last updated: 2026-11-25 after Phase 6.4.1.1*
