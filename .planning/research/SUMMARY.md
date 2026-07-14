# Project Research Summary

**Project:** Space Cadet Pinball — Browser Edition
**Domain:** Browser-based 2D pinball game (procedural rendering, synthesized audio, physics-critical)
**Researched:** 2026-07-15
**Confidence:** HIGH

## Executive Summary

This is a physics-critical arcade game, not a content-heavy one. Every research pass — stack, features, architecture, pitfalls — converges on the same conclusion: the entire risk profile of this project lives in one place, the ball-vs-thin-geometry collision model, and everything else (table layout, scoring, rendering, audio, even the deferred mission/rank system) is comparatively routine engineering sitting on top of it. Experts build this class of game the same way the original Space Cadet decompilation is structured: a fixed-timestep simulation core that is deterministic and frame-rate-independent, cleanly separated from rendering and rules, with all reactive behavior (scoring, lights, sound) driven off collision events rather than polling physics internals.

The recommended approach is to prove the make-or-break risk — a fast ball tunneling through a thin flipper or wall — before writing a single line of table layout or art. Research surfaced two credible paths to continuous collision detection: adopt **Planck.js** (a Box2D port with native `setBullet` CCD) for a proven, well-documented solver, or hand-roll a **custom swept circle-vs-segment/arc solver** matching the original game's own architecture, trading implementation effort for total control over feel and a guaranteed structural fix for tunneling. Both approaches agree on the non-negotiables underneath them: a fixed-timestep accumulator loop with render interpolation (not raw `requestAnimationFrame` deltas), a physics rate well above 60Hz (120–240Hz), and kinematic (not force-driven) flippers that transfer contact-point velocity into the ball. Neither approach alone fully solves flipper collision — sweep-based CCD only covers *linear* motion, so a fast-rotating flipper needs its own treatment (angular sub-stepping + capsule/speculative contacts) regardless of which engine is chosen. This means flippers are architecturally distinct from "the ball vs. static geometry" problem and deserve their own dedicated phase with explicit feel-tuning time, since flipper feel is the project's stated Core Value.

The secondary risk is scope: Space Cadet's full progression layer (9 ranks, ~20 missions, hyperspace lights, gravity well, wormholes, multiball) is well documented and faithfully reconstructable, but it is pure state-machine/scoring logic layered on collision events the core loop already emits — it carries almost no physics risk. Deferring it (as already decided in PROJECT.md) defers *content*, not *risk*, and is the correct move. The one exception is multiball, which requires ball-ball collision and CCD across multiple bodies — the only deferred feature with real physics risk — so the v1 physics architecture should stay data-structure-ready for N balls even while shipping exactly one.

## Key Findings

### Recommended Stack

Two viable stacks emerged, both anchored on the same non-negotiables (fixed-timestep loop, kinematic flippers, no discrete collision for the ball). **Path A (engine-assisted):** Planck.js 1.5 for physics — the only mainstream JS 2D engine with native continuous collision detection (`body.setBullet(true)`), ships a canonical Pinball example, pure JS/TS with zero deps. **Path B (hand-rolled):** a custom swept circle-vs-segment/arc solver mirroring the original game's own `TEdgeManager`/`TBall` model — more code, but structurally cannot tunnel and gives total control over feel. Around either physics choice, the rest of the stack is uncontested: Canvas 2D for rendering (a single static playfield + ~5 moving objects easily holds 60fps; its gradient/path API *is* the procedural vector aesthetic the project wants), TypeScript for the vector/state-heavy physics code, Vite for instant-HMR iteration on feel-tuning, and the raw Web Audio API for runtime-synthesized SFX (no audio files, per constraint). No game framework (Phaser, etc.) — a single-table physics-driven game gains nothing from one and loses direct control of the fixed-timestep step order that flipper feel depends on.

**Core technologies:**
- **Physics — Planck.js 1.5 *or* custom swept solver** (decision deferred to a Phase 1 spike, see below): either way, CCD for the ball plus a bespoke rotational-CCD treatment for flippers.
- **Canvas 2D (browser-native):** procedural playfield/ball/flipper rendering — zero deps, gradient/path API maps directly onto the "geometry + gradients" visual mandate.
- **TypeScript:** catches vector/config errors that would otherwise present as "bad physics."
- **Vite:** sub-second HMR is a force-multiplier for tuning restitution/torque/gravity by feel.
- **Web Audio API (raw, not Tone.js):** oscillator + noise + filter + ADSR one-shots — lowest latency, zero deps, matches "synthesized at runtime, no files" exactly.
- **Explicitly avoid:** Matter.js (no native CCD — the exact tunneling failure mode this project must prevent) and any UI framework or state-machine library for the game itself (total overkill for ~5 game states and one canvas).

### Expected Features

Pinball's feature set splits cleanly along the v1/deferred line already drawn in PROJECT.md: the physical table + core loop is 100% table-stakes (missing any piece reads as "not pinball"), while Space Cadet's rank/mission/multiball layer is pure post-physics content. Full detail — including exact rank names, mission list, and hyperspace/gravity-well/wormhole mechanics for a faithful v2 rebuild — is preserved in FEATURES.md.

**Must have (table stakes / v1):**
- Stable 2D ball physics with continuous collision detection (no tunneling) — HIGH complexity, THE crux
- Plunger with hold-to-charge variable power
- Two flippers with correct rotational physics and snappy, tunable feel
- Space Cadet table layout: launch chute, bumper cluster, ramps, lanes, drain
- Bumpers, slingshots/kickers, lanes/rollovers reacting with bounce + flash + sound + points
- Drain + 3-ball game loop, live score/HUD, tilt/nudge with over-nudge penalty
- Synthesized SFX + visual flash feedback, stable 60fps

**Should have (differentiators — the "portfolio juice" that separates good from cheap pinball):**
- Excellent flipper feel: instant response, EOS snap, ball cradle/trap — the single biggest quality differentiator in the genre
- Ball-drop shadow, playfield shading/GI lighting, screen shake, particle bursts, layered velocity-scaled synth audio
- Skill shot on launch (cheap — reuses plunger + lane lights already built for v1)
- Score-count/bonus-tally animation, simple ball-save flourish

**Defer (v2+ — Space Cadet progression milestone):**
- Full rank/promotion system (9 ranks) and ~20-mission engine — near-zero physics risk, pure state machine/content
- Hyperspace lights → center post / extra ball / gravity well cascade, wormholes, bonus/multiplier, extra ball
- **Multiball** — the one deferred feature with real physics risk (ball-ball collision + multi-body CCD); keep v1 physics architecture N-ball-ready (data structures, broad-phase) so this is additive later, not a rewrite

### Architecture Approach

A pinball game is a soft real-time simulation with one hard rule: the physics must be deterministic and frame-rate-independent while rendering runs at display refresh. The architecture is five strictly one-directional layers — **Input → Physics/Simulation → Rules/Game State → (Render, Audio)** — connected only through an intent struct (input→physics), a read-only interpolated snapshot (physics→render), and a typed collision-event bus (physics→rules/audio/lights). This mirrors the original Space Cadet decompilation's own separation of collision (`TEdgeManager`/`TBall`/`TLine`/`TCircle`) from component behavior (`TBumper`, `TFlipper`, `TSink`) from lights/sound. A single `table/spec` coordinate source drives both the physics collision model and the render model, so what's drawn and what's hit can never drift apart.

**On the one cross-document point of divergence:** STACK.md recommends Planck.js with a "bullet" ball; ARCHITECTURE.md leans toward a custom swept circle-vs-segment/arc solver matching the original's own model. Both are legitimate, well-supported paths, and both researchers agree on the binding constraint (the ball must use true continuous collision — no tunneling, non-negotiable) and on the flipper caveat (linear sweep CCD does not cover rotation regardless of engine choice, so flippers need their own angular sub-stepping / capsule-contact treatment either way). **This is a decision for Phase 1, not an unresolved conflict:** spike both a Planck.js `setBullet` ball and, if time allows, a minimal custom swept solver against one thin wall and one flipper, and lock in whichever proves easier to make tunnel-proof and to tune for feel. If Planck.js is chosen, the physics module stays isolated behind the same interfaces the custom-solver path would use (ball state, flipper state, collision events) — the rest of the architecture (event bus, table spec, rules, render, audio) is identical either way.

**Major components:**
1. **Game Loop / Orchestrator** — owns time: fixed-timestep accumulator, prev/current snapshots, interpolation alpha
2. **Physics/Simulation Core** — the ball (circle body with CCD), flippers (kinematic, angularly sub-stepped), static colliders (segments/arcs); emits typed `CollisionEvent`s and nothing else leaves this layer
3. **Rules/Game State** — score, ball count, tilt budget, plunger FSM; mutated only by reacting to events
4. **Render / Audio** — read-only consumers of an interpolated snapshot and the event bus; never write back into the simulation
5. **Table Definition (`table/spec`)** — one coordinate source deriving both the collision model and the render model, so geometry never drifts between "what you see" and "what you hit"

### Critical Pitfalls

1. **Ball tunnels through thin walls/flippers at speed (THE #1 risk)** — a plunged/flipped ball can move 20–50+ px per frame against 2–6px-thick geometry; discrete per-frame overlap checks never see the intersection. Avoid with true swept/continuous collision (time-of-impact, advance-reflect-repeat), a high fixed sub-step rate (120–240+Hz), real thickness/capsule geometry, and a derived speed cap tied to the thinnest wall. Prove this first, in isolation, before any table or art exists.
2. **Framerate-dependent / variable-timestep physics** — feeding raw `requestAnimationFrame` deltas into the integrator makes the game run ~2x fast on 120/144Hz displays and explode after tab-blur hitches (spiral of death). Fix with a fixed-timestep accumulator, clamped frame delta, and render interpolation — foundational, must exist before flippers or table geometry, not retrofitted later (retrofitting invalidates every feel-tuning constant found under the old loop).
3. **A fast-rotating flipper passes through the ball (rotational CCD gap)** — linear swept CCD does not represent rotation; a flipper sweeping ~1000–1500°/s can "teleport" past a ball between physics steps even with perfect *ball* CCD. This is a documented limitation of sweep-based CCD generally (Unity, Box2D), not a defect of any one engine choice. Fix with angular sub-stepping in lockstep with the ball, capsule (not thin-line) flipper geometry, and/or speculative contacts.
4. **Flipper feel is dead, weak, or unpredictable** — treating the flipper as a static reflector or applying a fixed impulse produces lifeless flips; no explicit state machine means a "cradled" ball buzzes instead of resting. Fix by imparting the flipper's contact-point velocity (`v = ω × r`, so tip hits launch faster than base hits) into the collision response, and building an explicit `resting → flipping-up → held-up (cradle) → returning` state machine. This is the Core Value — budget dedicated feel-tuning time, don't bolt it on.
5. **Physics instability — jitter, corner-sticking, energy gain** — gravity and collision resolution fighting each frame causes a resting ball to vibrate or slowly gain speed forever. Fix by separating positional correction from velocity response (never turn overlap into extra speed), keeping restitution < 1 with measured energy trending down, adding a rest/sleep threshold, and rounding interior corners / using capsule-arc geometry so the ball can't lodge in acute pockets.

## Implications for Roadmap

Based on combined research, the build order is dictated almost entirely by risk and dependency, not by feature convenience: prove the physics crux, then feel, then the real table, then reactivity/rules, then presentation, then polish. Every phase below produces something playable or observably testable.

### Phase 1: Physics Core Spike
**Rationale:** This is the make-or-break risk called out identically across all four research files. Nothing else can be meaningfully built, tested, or felt until it's retired. This is also where the Planck.js-vs-custom-solver decision gets resolved empirically rather than debated on paper.
**Delivers:** A fixed-timestep accumulator loop with render interpolation; one ball (circle) against a few static segment/arc walls including at least one intentionally thin wall; gravity + damping; one kinematic flipper. Locks in the physics engine decision (Planck.js `setBullet` vs. custom swept solver) based on which proves easier to make provably tunnel-proof and to tune. GOAL: fling the ball at the thin wall and the fastest flip at max speed for a 10-minute stress run — it must never escape, never jitter at rest, and must run identically at 60Hz and 120/144Hz and survive an alt-tab.
**Addresses:** "Stable 2D ball physics — no tunneling" (FEATURES.md table stakes, P1)
**Avoids:** Pitfall 1 (tunneling), Pitfall 2 (framerate-dependent instability), Pitfall 7 (rAF blur/spiral)

### Phase 2: Flippers & Feel
**Rationale:** Flippers are architecturally distinct from "ball vs. static geometry" — linear CCD doesn't cover rotation, so this is its own hard subproblem requiring angular sub-stepping regardless of which physics path Phase 1 chose. This is also the project's stated Core Value, so it earns dedicated tuning time rather than being folded into general table-building.
**Delivers:** Both flippers with input-driven kinematic motion, angular sub-stepping matched to the ball's sub-step rate, capsule contact geometry, contact-point velocity transfer (`v = ω × r`), and an explicit resting/flipping-up/held-up-cradle/returning state machine. A key flips the ball convincingly and consistently; a ball can be trapped and held on a raised flipper without jitter; the fastest possible flip never slips through.
**Addresses:** "Two keyboard-controlled flippers with correct rotational physics" (PROJECT.md Active requirement); "Excellent flipper feel" (FEATURES.md top differentiator)
**Avoids:** Pitfall 3 (rotational CCD gap), Pitfall 4 (dead/unpredictable flipper feel), Pitfall 8 (input auto-repeat/stuck keys — input layer belongs here)

### Phase 3: Table, Plunger & Event Bus
**Rationale:** With the physics core and flipper feel proven in isolation, the real Space Cadet table geometry can be built without risking a rewrite. Defining the typed `CollisionEvent` bus and the single `table/spec` coordinate source here (rather than earlier or later) is the single biggest unblocker for the parallel rules/render/audio work in the next phases.
**Delivers:** Full Space Cadet layout (launch chute, bumper cluster, ramps, lanes, drain) transcribed from the open-source decompilation's geometry (behavior/coordinates only, never assets); plunger charge/release FSM and launch chute physics; the `table/spec` → `collisionModel` + `renderModel` split; the `CollisionEvent` bus wired but not yet consumed.
**Uses:** Planck chain/edge shapes or custom segment/arc colliders per the Phase 1 decision (STACK.md); `table/spec` pattern (ARCHITECTURE.md)
**Implements:** Table Definition component; one-way event bus pattern

### Phase 4: Reactive Elements & Game Rules
**Rationale:** Scoring, drain, tilt, and reactive elements are all downstream of collision events the previous phases already emit — this is the "turn the table into a game" phase, and per FEATURES.md it carries essentially zero physics risk once the event bus exists.
**Delivers:** Bumpers/slingshots/kickers/lanes reacting with bounce + score events; drain detection and 3-ball game loop with game-over; live score/HUD; tilt/nudge with an accumulating-and-decaying tilt meter (impulse-based nudge, never a teleport) that disables flippers on tilt.
**Addresses:** Remaining v1 table-stakes features (FEATURES.md P1 list): bumpers, slingshots, lanes/rollovers, drain+3-ball loop, score/HUD, tilt/nudge
**Avoids:** Pitfall 5 (jitter/corner-stick, relevant to pocket/lane geometry), Pitfall 6 (nudge/tilt implemented as a hack)

### Phase 5: Rendering & Audio (Presentation Layer)
**Rationale:** Both are read-only consumers of state that already exists by this point (interpolated physics snapshot for render, collision events for audio) — low risk, well-documented patterns, and safely parallelizable against each other since neither depends on the other.
**Delivers:** Layered Canvas 2D rendering (static playfield pre-baked to an offscreen canvas, dynamic ball/flipper layer, light/insert layer) with camera transform and HUD; synthesized Web Audio SFX (oscillator+noise+filter+ADSR one-shots) for bumper/flipper/drain/launch/tilt, wired through the shared-context, envelope-everything, resume-on-first-gesture pattern.
**Uses:** Canvas 2D, Web Audio API (STACK.md); layered-canvas + event-driven audio patterns (ARCHITECTURE.md)
**Avoids:** Pitfall 9 (Web Audio clicks/leaks/blocked context); rendering performance traps (redraw-every-frame, unbounded `shadowBlur`, uncapped `devicePixelRatio`)

### Phase 6: Juice & Polish
**Rationale:** This is the portfolio bar — the layer that separates "correctly functioning pinball" from "impressive pinball" — and per FEATURES.md it is cheap to add once the core loop and presentation layer are proven, so it belongs last.
**Delivers:** Screen shake, particle bursts, ball-drop shadow, insert/GI lighting glow, skill shot on launch, score-count/bonus-tally animation, simple ball-save flourish, local high-score in `localStorage`.
**Addresses:** FEATURES.md P2 differentiators (v1.x polish list)

### Phase Ordering Rationale

- **Risk-first ordering:** Phases 1–2 exist purely to retire the two things every research file independently flagged as the project's real risk (tunneling, rotational flipper CCD / feel) before any effort is sunk into table geometry that would need to be re-tuned if the physics model changes.
- **Dependency-driven grouping:** Phase 3's event bus and table-spec are deliberately placed before Phase 4 (rules can't score a bumper that doesn't exist yet) but as early as possible so Phases 5–6 can proceed against a stable interface.
- **Content deferred, not risk deferred:** The Space Cadet progression system (ranks/missions/hyperspace/multiball) is not a phase in this v1 roadmap at all — per FEATURES.md it is near-zero-risk content that sits entirely on top of events v1 already emits, and PROJECT.md already places it out of scope. The one exception, multiball, needs ball-ball collision; keep the Phase 1–2 physics data structures N-ball-ready even though only one ball ships.
- **Pitfall coverage:** Every critical/moderate pitfall in PITFALLS.md maps to exactly one phase above (see its own Pitfall-to-Phase Mapping table), confirming no phase is missing a known failure mode.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Physics Core Spike):** The Planck.js-vs-custom-solver decision is explicitly unresolved and should be spiked, not assumed; also warrants a closer look at Planck.js's `setBullet` behavior against thin static edges under this project's specific speed/geometry ratios before committing.
- **Phase 2 (Flippers & Feel):** Rotational CCD (angular sub-stepping + capsule/speculative contacts) is a narrower, less-documented subproblem than linear CCD — worth a focused research pass on implementation technique before building.
- **Phase 3 (Table, Plunger & Event Bus):** ARCHITECTURE.md itself flags MEDIUM confidence on "table-coordinate authoring" — extracting faithful Space Cadet geometry from the SpaceCadetPinball decompilation is more of a data-transcription research task than a design one; budget research time for it.

Phases with standard patterns (skip research-phase):
- **Phase 4 (Reactive Elements & Game Rules):** Bumpers/scoring/tilt are conventional event-driven state-machine work; PITFALLS.md and ARCHITECTURE.md give complete, uncontested recipes.
- **Phase 5 (Rendering & Audio):** Canvas 2D layering and Web Audio one-shot synthesis are both HIGH-confidence, thoroughly documented patterns (MDN, Gaffer, alemangui) with no open questions.
- **Phase 6 (Juice & Polish):** Well-understood game-feel techniques (screen shake, particle pooling, envelope-driven audio layering) with no novel risk.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified live against npm registry; recommendations cross-checked against official docs (Planck.js, Box2D, MDN) and multiple independent sources |
| Features | HIGH | Core mechanics and Space Cadet-specific features cross-verified across StrategyWiki, GameFAQs, and Neoseeker rule sheets; MEDIUM only on exact point values / mission nuances within the deferred v2 layer |
| Architecture | HIGH for loop/physics/rendering patterns (Gaffer, Erin Catto/Box2D, MDN); MEDIUM for table-coordinate authoring and build-order sequencing, per the researcher's own stated confidence |
| Pitfalls | HIGH | Physics/loop pitfalls corroborated by canonical authoritative sources (Gaffer On Games, Erin Catto's Box2D CCD GDC talk, Unity's CCD docs, MDN); flipper-feel and Web Audio pitfalls corroborated by multiple domain sources |

**Overall confidence:** HIGH

### Gaps to Address

- **Physics engine choice (Planck.js vs. custom solver):** Not a research gap so much as a decision deliberately deferred to empirical validation — resolve it in Phase 1 via a head-to-head spike against the same thin-wall/flipper test, per the reconciliation above, rather than picking on paper now.
- **Exact Space Cadet table coordinates/dimensions:** ARCHITECTURE.md flags MEDIUM confidence on transcription effort from the SpaceCadetPinball decompilation. Treat Phase 3 as needing a dedicated pass through the decompilation's geometry data before layout work begins.
- **Space Cadet mission/point values (deferred v2 layer):** FEATURES.md notes some exact values (hyperspace light rewards, mission point totals) vary between the Windows "demo" ruleset and the full *Full Tilt! Pinball* ruleset — MEDIUM confidence. Irrelevant to v1; flag for whoever plans the v2 progression milestone.
- **Multiball's physics requirements:** Deliberately not detailed in this research round (out of v1 scope), but FEATURES.md and ARCHITECTURE.md both flag it as the one deferred feature with real physics risk (ball-ball collision, multi-body CCD, perf headroom). No action needed for v1 beyond keeping data structures N-ball-ready; revisit when scoping the v2 milestone.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`) — live-verified package versions (Planck 1.5.0, Vite 8.1.4, TypeScript 7.0.2, PixiJS 8.19.0, Tone 15.1.22, Matter.js 0.20.0, box2d-wasm 7.0.0)
- Planck.js official docs (piqnt.com/planck.js) and Box2D official docs (box2d.org) — revolute joint motors, bullet/CCD semantics
- Glenn Fiedler, "Fix Your Timestep!" (gafferongames.com) — fixed-timestep accumulator + interpolation, spiral of death
- Erin Catto (Box2D), "Continuous Collision" GDC 2013 talk — time-of-impact, swept collision, speculative contacts
- Unity Manual, Continuous/Sweep-based CCD — documents that sweep CCD is linear-only, not rotational
- MDN Web Docs — `requestAnimationFrame`, `AudioParam.linearRampToValueAtTime`, Canvas optimization guide
- Matter.js issue #5 (GitHub, official tracker) — confirms no native CCD, documents tunneling as a known failure mode
- k4zmu2a/SpaceCadetPinball decompilation (GitHub) — original component architecture and table geometry/behavior reference
- StrategyWiki, GameFAQs, Neoseeker rule sheets — Space Cadet rank order, mission structure, tilt/nudge behavior

### Secondary (MEDIUM confidence)
- Matthias Müller, "Ten Minute Physics" — custom swept collision and flipper handling technique
- daily.dev / olegkikin.com physics engine comparisons — Matter.js vs. Planck.js performance positioning
- GameDev.net "Flipper Physics" forum thread; MIT 6.005 Pingball spec; Voxagon Blog "Pinball physics" — contact-point velocity transfer (`v = ω × r`) technique
- alemangui, "Web Audio: the ugly click and the human ear" — gain-ramp click-avoidance technique
- 3dpinball-spacecadet.net "So Many Rules!" — Windows vs. Full Tilt! ruleset differences, wormhole/multiball nuance

### Tertiary (LOW confidence)
- The Pinball Spot, "The Physics of Pinball" — general nudge/spin/momentum intuition, not load-bearing for any decision above

---
*Research completed: 2026-07-15*
*Ready for roadmap: yes*
