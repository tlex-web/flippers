# Roadmap: Flippers — Browser Pinball

## Overview

This roadmap is ordered by risk and dependency, not feature convenience. The entire risk profile lives in one place — a fast ball tunneling through thin geometry — so the physics core (Phase 1) is proven in isolation before any table exists, and the flippers (Phase 2, the project's Core Value) are their own phase because rotational collision is a distinct hard problem. Only once feel is retired does an original table get built (Phase 3), turned into a game with scoring and rules (Phase 4), dressed in procedural rendering and synthesized audio (Phase 5), and finally raised to portfolio-grade with juice and polish (Phase 6). Every phase yields something playable or observably testable.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Physics Core Spike** - Tunnel-proof, frame-rate-independent ball physics proven in isolation; engine decision locked (completed 2026-07-15)
- [x] **Phase 2: Flippers & Feel** - Two keyboard flippers with rotational CCD, momentum transfer, and cradle — the Core Value (completed 2026-07-16)
- [x] **Phase 3: Table, Plunger & Event Bus** - An original space-themed table layout, a hold-to-charge plunger, and a typed collision-event bus (completed 2026-11-20)
- [ ] **Phase 4: Reactive Elements & Game Rules** - Bumpers/slingshots/lanes score, a 3-ball loop runs, and nudge/tilt works
- [ ] **Phase 5: Rendering & Audio** - Procedural Canvas rendering at stable 60fps and runtime-synthesized SFX
- [ ] **Phase 6: Juice & Polish** - Screen shake, particles, lighting, skill shot, ball-save, and persisted high score

## Phase Details

### Phase 1: Physics Core Spike

**Goal**: A single ball obeys stable, heavy, tunnel-proof, frame-rate-independent 2D physics — provable in isolation before any table geometry or art exists.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PHYS-01, PHYS-02, PHYS-03
**Success Criteria** (what must be TRUE):

  1. The ball moves under gravity, momentum, restitution, and friction and feels heavy and weighty, not floaty.
  2. Flung at the thinnest wall and the fastest-moving test flipper at maximum speed for a 10-minute stress run, the ball never escapes the play area (no tunneling).
  3. A resting ball sits perfectly still — no jitter, no corner-sticking — and total energy trends downward over time, never gaining speed.
  4. Ball feel is identical at 60Hz, 120Hz, and 144Hz, and survives an alt-tab / tab-blur without the physics exploding.
  5. The physics engine is chosen and locked (Planck.js `setBullet` vs. custom swept circle-vs-segment/arc solver), decided empirically by whichever proves easier to make provably tunnel-proof and to tune, with the physics module isolated behind ball/flipper/event interfaces and data structures kept N-ball-ready.

**Plans**: 7 plans (5 waves)
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Project scaffold (Vite/TS/ESLint/Vitest, pinned + supply-chain-gated install) + sandbox entry stub [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Engine-agnostic ball/flipper/event interface + reference-anchored constants + Planck adapter (bullet ball, tilted gravity, chain/edge walls) + fixed-120Hz loop + smoke test [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Throwaway Canvas 2D debug sandbox rendering the live interpolated ball + HUD (diagnosis only) [wave 3]
- [x] 01-04-PLAN.md — Frame-rate independence (identical sim at 60/120/144Hz) + tab-blur / large-dt survival (PHYS-03) [wave 3]
- [x] 01-05-PLAN.md — Max-speed motorized test flipper + seeded PRNG + swept containment invariant (unit-tested) [wave 3]

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-06-PLAN.md — Headless ≥10-min swept-containment soak (the SOLE tunnel-proof gate) + CCD-off negative control (PHYS-02) [wave 4]

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-07-PLAN.md — Resting-ball stability + energy proof, reference-anchored feel constants, and the locked engine decision (PHYS-01, criterion #5) [wave 5]

### Phase 2: Flippers & Feel

**Goal**: Two keyboard-controlled flippers respond instantly, transfer real rotational momentum, hold a steady cradle, and can never be passed through — the project's stated Core Value, proven and tuned.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: FLIP-01, FLIP-02, FLIP-03, FLIP-04
**Success Criteria** (what must be TRUE):

  1. Pressing a flipper key raises the corresponding flipper with near-instant (sub-frame) response; releasing drops it, with no stuck-key or auto-repeat artifacts.
  2. A tip hit launches the ball noticeably faster than a base hit (contact-point velocity `v = ω × r` transfers correctly into the ball).
  3. The player can catch the ball on a raised flipper and hold it cradled steady, with no jitter, via an explicit resting → flipping-up → held-up → returning state machine.
  4. The fastest possible flip never passes through the ball (rotational continuous collision via angular sub-stepping / capsule contact geometry).

**Plans**: 6/6 plans complete, plus gap fix 02-GAP-01 (4 waves)
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Two mirrored capsule flippers + `tipRadius` interface + feel constants + debug-draw stadium [wave 1]
- [x] 02-02-PLAN.md — Engine-agnostic keyboard input module (event.code, repeat-safe, blur-clear) + FlipperController FSM [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — Wire keyboard → FSM → flippers end-to-end on the test rig + ball feed (+ headless E2E test) [wave 2]
- [x] 02-04-PLAN.md — Rotational anti-tunnel: adaptive angular sub-stepping in `step()` + secondary cap + off-switch [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-05-PLAN.md — FLIP-04 seeded proof gate (green ON / RED OFF) + tip-vs-base + jitter-free cradle feel proofs [wave 3]

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-06-PLAN.md — By-feel acceptance checkpoint: heavy-not-floaty verdict on the live rig (D-09) [wave 4]

### Phase 3: Table, Plunger & Event Bus

**Goal**: An original space-themed playfield exists and a ball can be charged and launched into it, with a single table/spec coordinate source and a typed collision-event bus wired and ready for downstream rules, rendering, and audio.
**Mode:** mvp
**Depends on**: Phase 1, Phase 2
**Requirements**: LNCH-01, LNCH-02, TBL-01
**Success Criteria** (what must be TRUE):

  1. The playfield is an original layout built from standard pinball elements — launch chute (right side), upper bumper cluster, ramps/guide walls, lanes, outer walls, and center-bottom drain funnel, with two lower flippers in an inverted-V — positioned for good ball flow (procedural geometry only; no layout, names, or assets copied from any existing table).
  2. The player holds to charge and releases the plunger to fire a proportional impulse that sends the ball up the launch chute onto the playfield.
  3. Plunger charge is visualized (pullback and/or charge meter) so a launch feels deliberate and its power is readable before release.
  4. Every ball-vs-element contact emits a typed collision event on a one-way bus, with the collision model and render model both derived from one `table/spec` source so what's hit and what's drawn cannot drift apart.

**Plans**: 6/6 plans complete (6 waves)
Plans:
**Wave 1**
- [x] 03-01-PLAN.md — One table spec drives the world: spec + resolve() (arcs, validation), spec-driven adapter (proof box byte-identical), getElements() + element-driven debug draw, original table outline in the sandbox [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 03-02-PLAN.md — Complete our original layout (bumper cluster, rollover lanes, orbits, inlanes, slingshots, drain) as inert id-tagged elements; inverted-V rest pose; flow/clearance/containment proofs [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 03-03-PLAN.md — Real-table swept-containment soak (fast suite + 600 s gate); soak harness and five Phase-1/2 proofs pinned to PROOF_BOX_SPEC [wave 3]

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 03-04-PLAN.md — Default world flipped to TABLE_SPEC (substep pinned, keyboard flipper e2e on the real bats); FlipperController narrowed to its interface slice [wave 4]

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 03-05-PLAN.md — Hold-to-charge plunger: generic applyImpulse hook, PlungerController + Space latch (repeat-safe, focus-loss cancel), chute launch e2e, sandbox charge meter + pullback [wave 5]

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 03-06-PLAN.md — Typed one-way collision bus: normalized event identity, sensor begin-contact path, onPostStep seam, CollisionRouter, sandbox demo consumer + composition proof [wave 6]

### Phase 4: Reactive Elements & Game Rules

**Goal**: The table becomes a game — reactive elements bounce and score off the event bus, a 3-ball loop runs to game-over, and nudge/tilt behaves like a real table.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: ELEM-01, ELEM-02, ELEM-03, GAME-01, GAME-02, GAME-03
**Success Criteria** (what must be TRUE):

  1. Bumpers pop the ball back with added energy and award points on every contact.
  2. Slingshots/kickers near the flippers kick the ball on contact to keep play lively, and lanes/rollovers register the ball passing over and award points.
  3. A live running score updates on-screen as the player scores.
  4. A 3-ball game loop serves the next ball to the plunger on drain and ends the game after the last ball drains.
  5. Nudging applies a small impulse to the ball (never a teleport); over-nudging trips an accumulating-and-decaying TILT that goes dead — elements stop scoring and the flippers drop.

**Plans**: 8/8 plans executed (6 waves)
Plans:
**Wave 1**
- [x] 04-01-PLAN.md — Tracer: bumpers kick and score through the bus (record-then-service), GameSession score, DOM score HUD, BALL_DENSITY/ballMass [wave 1]
- [x] 04-02-PLAN.md — Plunger honesty: rest-speed launch gate (IN-01) and held-state edge ordering applyEdges/isHeld (IN-02) [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 04-03-PLAN.md — Slingshot face kicks, rollover/inlane scoring with lights and bank bonus, lit lanes drawn, seeded energy-bound proof [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 04-04-PLAN.md — Rules-live real-table soak gate (green CCD-on / RED CCD-off), readonly drainEvents (IN-05), one density source, IN-03 docs [wave 3]
- [x] 04-05-PLAN.md — 3-ball game loop: GameSession FSM, Enter start, serve on drain, game over; BallFeed retired; applyEdges live [wave 3]

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 04-06-PLAN.md — Nudge (impulse-only, cooldown), TiltMeter WARNING/TILT, dead-while-tilted, nudge-key latch contract [wave 4]

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 04-07-PLAN.md — Full HUD: ball counter, start/game-over prompts, WARNING/TILT (aria-live status), controls hint, real-game HUD walk-through, nudge/tilt by-feel check [wave 5]

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 04-08-PLAN.md — Tilt and game-over drop the flippers (setEnabled, held-key re-press), replay determinism at 60/120/144 Hz, Phase-3 disposition, by-feel UAT [wave 6]

### Phase 5: Rendering & Audio

**Goal**: The whole table is drawn procedurally at a stable 60fps and every element speaks through distinct runtime-synthesized sound — a read-only presentation layer over state that already exists.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: RND-01, RND-02, RND-03, AUD-01
**Success Criteria** (what must be TRUE):

  1. The entire table — playfield, ball, flippers, lanes, and HUD — is rendered procedurally in code on Canvas with zero image assets.
  2. The game holds a stable 60fps via render interpolation, with ball motion smooth even on high-refresh displays.
  3. Every element flashes on contact to confirm the hit registered.
  4. Each element (bumper, flipper, slingshot, drain, launch, tilt) produces a distinct runtime-synthesized sound with velocity/pitch variation and no audio files, played through a shared, gesture-resumed audio context with enveloped one-shots.

**Plans**: TBD
**UI hint**: yes

### Phase 6: Juice & Polish

**Goal**: The game crosses from correctly functioning to portfolio-grade — responsive feedback, depth, glowing lights, and rewarding flourishes that make play feel alive and shareable.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: PLSH-01, PLSH-02, PLSH-03, PLSH-04, PLSH-05, PLSH-06, PLSH-07, PLSH-08
**Success Criteria** (what must be TRUE):

  1. Big hits and nudges produce a subtle, decaying screen shake / camera kick, and bumper/target hits emit particle bursts and light flares.
  2. Depth reads clearly — a soft ball-drop shadow plus playfield shading/vignette imply 2.5D depth — and insert/lane lights glow with a distinct lit-vs-unlit playfield state.
  3. A precise plunger charge over a lit lane earns a skill-shot bonus on launch.
  4. Scores count up with animation and an end-of-ball bonus tally, and a near-drain can trigger a simple center-post ball-save flourish.
  5. The local high score persists across browser sessions via `localStorage`.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Physics Core Spike | 7/7 | Complete    | 2026-07-15 |
| 2. Flippers & Feel | 6/6 | Complete    | 2026-07-16 |
| 3. Table, Plunger & Event Bus | 6/6 | Complete    | 2026-11-20 |
| 4. Reactive Elements & Game Rules | 8/8 | In Progress | - |
| 5. Rendering & Audio | 0/TBD | Not started | - |
| 6. Juice & Polish | 0/TBD | Not started | - |
