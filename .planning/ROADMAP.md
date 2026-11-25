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
- [x] **Phase 4: Reactive Elements & Game Rules** - Bumpers/slingshots/lanes score, a 3-ball loop runs, and nudge/tilt works (completed 2026-11-21)
- [x] **Phase 5: Rendering & Audio** - Procedural Canvas rendering at stable 60fps and runtime-synthesized SFX (completed 2026-11-22)
- [x] **Phase 6: Juice & Polish** - Screen shake, particles, lighting, skill shot, ball-save, and persisted high score (completed 2026-11-23)
- [x] **Phase 06.1: Address tech debt: bat/sling pinch (WR-03) + review hygiene** (completed 2026-11-23)
- [x] **Phase 06.2: Address tech debt: ball-search soft-lock + 06.1 review triage** (completed 2026-11-23)
- [x] **Phase 06.3: Fix slingshot deflection on flipper-root shots** (completed 2026-11-24)
- [x] **Phase 06.4: Address tech debt: narrow-viewport HUD, sling face rim, D-13 wording** (completed 2026-11-24)
- [x] **Phase 06.4.1: Address tech debt: bar-mode control hints, HUD status min-width, favicon** (completed 2026-11-24)
- [ ] **Phase 06.4.1.1: Address tech debt: ready-only bar hint, 11px type, 06.4.1 re-verify**

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

**Plans**: 15/15 plans complete (6 waves) + 7 gap-closure plans from UAT (G-04-10, G-04-6, G-04-11, G-04-17, G-04-21, G-04-21 cradle)
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

**Gap closure** *(UAT 04 diagnosis; both plans run in parallel)*
- [x] 04-09-PLAN.md — Flipper dead time and stuck-up taps (G-04-10): limit-impulse reset on every motor direction change (public enableLimit), FSM rests only at the rest limit, latency + six-binding quick-tap regression tests [wave 1]
- [x] 04-10-PLAN.md — HUD legibility (G-04-6): diagnostics readout moved from canvas to DOM, controls hint as a key-cap action list [wave 1]

**Gap closure 2** *(UAT 04 test 11 diagnosis)*
- [x] 04-11-PLAN.md — Lost Shift keyup pins a bat (G-04-11): FlipperInput clears its held set on window focus regain and drops a stale Shift on any non-Shift key with Shift up; bindings unchanged; unit, keyboard-to-Planck and serve regressions [wave 1]

**Gap closure 3** *(UAT 04 tests 17-18 diagnosis; 04-13 waits for 04-12 because both edit main.ts)*
- [x] 04-12-PLAN.md — Windows both-Shift merge (G-04-17): the repeat-flagged second Shift press counts, the final Shift keyup drops both Shifts (Windows only, via isWindowsPlatform), and a same-window release is superseded for a held side (WR-01); matrix built from the captured sequences [wave 1]
- [x] 04-13-PLAN.md — Controls hint (G-04-17, UAT 18 decision A): key caps relabelled from navigator.keyboard.getLayoutMap(); a Windows note names ← → and, when the layout resolves, the Z/Slash keys under their printed labels; Shift stays bound and listed [wave 2]

**Gap closure 4** *(UAT 04 test 21, decision A: fix review findings WR-01/WR-02)*
- [x] 04-14-PLAN.md — Windows Shift heal follow-ups (G-04-21): after a blur/focus/hidden-tab clear, the other Shift's repeat-flagged press counts once the held Shift has auto-repeated (WR-01); a Shift keydown reporting Shift up never drops the other held Shift (WR-02); IN-01 gate comment; residual documented and pinned [wave 1]

**Gap closure 5** *(04-VERIFICATION re-verify after 04-14: G-04-21 cradle case; user decision: option A, timing)*
- [x] 04-15-PLAN.md — Cradle held across a force-clear (G-04-21): KeyEventLike gains an optional timeStamp, and a repeat-flagged re-press of the auto-repeating Shift counts once it lands more than SHIFT_REPEAT_GAP_MS (450 ms) after that Shift's last ignored auto-repeat; untimed events fall back to 04-14 behavior; IN-01 marker reset in dropStaleShift; IN-02/IN-03 docs; faster-re-press residual documented and pinned [wave 2]

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

**Plans**: 8/8 plans complete (5 waves)
Plans:
**Wave 1** *(both plans run in parallel)*
- [x] 05-01-PLAN.md — Tracer: a bumper hit is heard in the live game. ReactiveFeedback hook, CueQueue/CueFeedback, Web Audio seam, AudioEngine (bumper voice), fake AudioContext, gesture unlock + live wiring (A5 at the composition root), testTimeout fix [wave 1]
- [x] 05-08-PLAN.md — Smooth-motion groundwork: loop flipper-angle snapshots and interpolation helpers (real-table 144 Hz proof), RND-01 asset gate [wave 1]

**Wave 2** *(blocked on Wave 1 completion; three plans run in parallel)*
- [x] 05-02-PLAN.md — The real table on screen: display-sized backing store, static bake, TableRenderer wired with interpolated balls and bats, ?debug=1 escape hatch, canvas recorder + bake/frame contract tests (D-01 interpretation recorded) [wave 2]
- [x] 05-03-PLAN.md — Every element's voice: velocity/pitch mapping, envelopes, 13 distinct recipes, voice pool, ramped master mute (D-02 engine, D-03 no wall voice) [wave 2]
- [x] 05-07-PLAN.md — Presentation seams hold every edge: throwing-sink real-table proof, hook/ring contract cases, unlock rules + A5 guard, closes the load-timeout todo [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 05-04-PLAN.md — Every hit flashes: FlashTracker on the step clock, baked halo sprites, flash pass, silent wall/chute/flipper ContactFlash (D-03) [wave 3]

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 05-05-PLAN.md — Every element speaks live: PresentationObserver (launch, drain, start, tilt, warning, game over, flipper coils) with read-only controller counters [wave 4]

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 05-06-PLAN.md — M mutes (D-02), space-theme DOM HUD (D-01), presentation-attached replay proof, full phase gate [wave 5]

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

**Plans**: 14/14 plans complete (9 waves)
Plans:
**Wave 1** *(both plans run in parallel)*
- [x] 06-01-PLAN.md — Tracer: skill shot rule live. SkillShot rotate/freeze/resolve, RuleHooks.onSwitch seam, GameSession composition, D-05 anchor on the real table, isRestingInZone, main.ts wiring [wave 1]
- [x] 06-02-PLAN.md — Depth: baked ball shadow, light pool, drop shadows, vignette; the Phase-6 palette token set; renderer frame-contract re-pins [wave 1]

**Wave 2** *(blocked on Wave 1; both plans run in parallel)*
- [x] 06-03-PLAN.md — Lamps: LampTracker fade/blink, skill chevrons and rollover lenses lit, inlane arrows, baked unlit lenses and rims, attract chase [wave 2]
- [x] 06-04-PLAN.md — Skill shot heard and announced: the five Phase-6 stings (D-25), skillShot cue, status-line priority resolver with SKILL SHOT [wave 2]

**Wave 3** *(blocked on Wave 2)*
- [x] 06-05-PLAN.md — Bonus rules: "bonus" FSM state (D-12, costly), itemized counters, credit(), flipper skip, tilt forfeit, drain/nudge counters, HUD bonus rows [wave 3]

**Wave 4** *(blocked on Wave 3; both plans run in parallel)*
- [x] 06-06-PLAN.md — Bonus presentation: tally overlay, live skip latch, score count-up, reduced-motion read, drain cue from the drain counter, bonusTick [wave 4]
- [x] 06-07-PLAN.md — Ball save rules: chute-exit timer, backstop re-serve, one save per ball, trySave, same-step kickback-drain [wave 4]

**Wave 5** *(blocked on Wave 4; both plans run in parallel)*
- [x] 06-08-PLAN.md — Center-post kickback: "post" element 610, post kicker on the bumper law, armed energy bound + RED control, trough exclusion [wave 5]
- [x] 06-09-PLAN.md — Screen shake: trauma shake and nudge kick on the step clock, FxSink/EffectsTracker seam, nudge cue, resetWorld, zero under reduced motion [wave 5]

**Wave 6** *(blocked on Wave 5)*
- [x] 06-10-PLAN.md — Save flourish: post rise/flash/hold/sink, ball-save ring lamp, ballSave sting, BALL SAVED status [wave 6]

**Wave 7** *(blocked on Wave 6; both plans run in parallel)*
- [x] 06-11-PLAN.md — High score: guarded localStorage HighScore (flippers.hiscore.v1), submit at game over, HIGH SCORE line, NEW HIGH SCORE, fanfare [wave 7]
- [x] 06-12-PLAN.md — Impact particles: seeded 160-slot pool, bumper ring + sparks, sling sparks, contact point on the feedback path, particle pass [wave 7]

**Wave 8** *(blocked on Wave 7)*
- [x] 06-13-PLAN.md — Reward particles: star glints and motes on rollovers/inlanes and the skill shot, kickback save sparks [wave 8]

**Wave 9** *(blocked on Wave 8)*
- [x] 06-14-PLAN.md — Phase gates: rules replay at 60/120/144 Hz with every new rule exercised, full presentation read-only proof, armed save in the soak gate, build [wave 9]

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Physics Core Spike | 7/7 | Complete    | 2026-07-15 |
| 2. Flippers & Feel | 6/6 | Complete    | 2026-07-16 |
| 3. Table, Plunger & Event Bus | 6/6 | Complete    | 2026-11-20 |
| 4. Reactive Elements & Game Rules | 15/15 | Complete    | 2026-11-21 |
| 5. Rendering & Audio | 8/8 | Complete    | 2026-11-22 |
| 6. Juice & Polish | 14/14 | Complete    | 2026-11-23 |

### Phase 06.1: Address tech debt: bat/sling pinch (WR-03) + review hygiene (INSERTED)

**Goal:** A raised bat can no longer pinch the ball against a slingshot (WR-03: both slings and their inlane sensors move 0.35 m up-table, proven by a seeded every-step sweep with a RED control and approved by eye and feel), and the open Phase 4-6 review and format debt is fixed or explicitly dispositioned.
**Requirements**: TBD
**Depends on:** Phase 6
**Plans:** 5/5 plans complete (4 waves)

Plans:
**Wave 1**
- [x] 06.1-01-PLAN.md — Format hygiene: .prettierignore scopes Prettier to source, one formatting-only commit over src/ and index.html, 05 deferred rows closed [wave 1]

**Wave 2** *(blocked on Wave 1; both plans run in parallel)*
- [x] 06.1-02-PLAN.md — WR-03 fix (D-01): sling-pinch sweep RED then GREEN with an old-geometry RED control, slings and inlanes moved 0.35 m up-table, rule (1) clearance case, translated pins, kickback e2e re-authored, user look-and-feel checkpoint [wave 2]
- [x] 06.1-03-PLAN.md — 04 review hygiene: keyLabel rejects blank/control/mark labels (IN-04), flipper-input docs and C4b/C5b pins (IN-01..IN-03), FSM dead stores and wording (IN-07, IN-08; IN-06 untouched per D-03) [wave 2]

**Wave 3** *(blocked on Wave 2)*
- [x] 06.1-04-PLAN.md — 06 review hygiene: SaveKind moved to game-session.ts (IN-02), HUD skill-step test pins its guard with a recorded mutation (IN-01) [wave 3]

**Wave 4** *(blocked on Wave 3)*
- [x] 06.1-05-PLAN.md — Phase gate plus records: 04 and 06 ledgers to open 0, IN-06 deferred (D-03), lost soft-lock finding noted plus backlog todo (D-02), 02 jam-lag doc note (D-04) [wave 4]

### Phase 06.2: Address tech debt: ball-search soft-lock + 06.1 review triage (INSERTED)

**Goal:** A tilted ball that comes to rest outside the plunger lane can no longer hang the game. A tilted-only ball search kicks it toward the playfield centre and, if it stays stuck, forfeits it so play continues (proven RED-then-GREEN on both real hinge pockets). All eight open 06.1 review findings are fixed (WR-01 subject to the user's look check), and the 06.1 ledger, the 04 lost-finding note and the soft-lock todo are closed before v1.0 closes.
**Requirements**: TBD
**Depends on:** Phase 06.1
**Success Criteria** (what must be TRUE):

  1. A tilted ball resting in either dead-flipper hinge pocket is searched free (a horizontal kick toward the centre) and drains as a tilt forfeit, then the next ball is served. With `ballSearchSteps: 0` the same ball stays stuck (RED control). The search never runs while playing, never touches the nudge count or tilt meter, never fires on a ball in the plunger lane, and never drains by position.
  2. The inlane sensors reach the funnel walls again and the inlane arrows sit centred in their lanes, judged by the user on the live build (06.1 WR-01).
  3. The sling-pinch proof can no longer pass blind (liveness check plus a walled-off RED control), and the kickback e2e asserts the unaided live outcome instead of a brute-forced cradle (06.1 WR-02, WR-03).
  4. A plain `npx prettier --check .` passes on this Windows checkout through `.gitattributes` (`* text=auto eol=lf`), with no uncommitted user edit touched. The keyLabel guard, the test literals, segToSegDist and the limit wording are cleaned up (06.1 WR-04, IN-01..IN-04).
  5. `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run soak` and `npm run build` are green, the 06.1 review ledger reads `open: 0`, and the soft-lock todo sits in `todos/completed/` with a resolution.

**Plans:** 6/6 plans complete (3 waves)

Plans:
**Wave 1**
- [x] 06.2-01-PLAN.md — Line endings (IN-04): `.gitattributes` `* text=auto eol=lf`, guarded LF refresh of clean CRLF files in this checkout and the user's main tree (uncommitted edits untouched), plain prettier check green [wave 1]

**Wave 2** *(blocked on Wave 1; four plans run in parallel)*
- [x] 06.2-02-PLAN.md — Tilted soft-lock: real-table hinge-pocket RED, then a tilted-only ball search in GameSession (240 still steps, kick toward the centre, forfeit after 2 kicks, `ballSearchSteps` off-switch), a `ballSearchSteps: 0` RED control, and spy-rig rules with mutation teeth [wave 2]
- [x] 06.2-03-PLAN.md — WR-01 inlane sensor end derived from the funnel line (case (f) RED first, arrow pins), IN-01 segToSegDist crossing fix, user look check (blocking) [wave 2]
- [x] 06.2-04-PLAN.md — WR-02 pinch sweep liveness plus walled-off inlane RED control; WR-03 kickback e2e asserts the unaided grace re-serve, then bonus [wave 2]
- [x] 06.2-05-PLAN.md — WR-04 single keyLabel guard, IN-02 escaped test literals, IN-03 raise/rest limit wording [wave 2]

**Wave 3** *(blocked on Wave 2)*
- [x] 06.2-06-PLAN.md — Phase gate plus records: full gate on the merged tree, main-tree LF re-check, 06.1 ledger to open 0, soft-lock todo completed, 04 lost-finding note resolved, STATE.md [wave 3]

### Phase 06.3: Fix slingshot deflection on flipper-root shots (INSERTED)

**Goal:** Both slingshots are trimmed (lower-right corner slid up along the kick face, kick speed and direction unchanged, kick face named explicitly) so flips from mid-bat to the tip (0.25 m ≤ d ≤ 0.45 m from the hinge) reach the upper field without first touching their own bat's sling, on both bats at every flip timing. Today 61 such flips hit their own sling first. The corner is t = 0.28, at (0.944, 4.102). Cross shots that graze the opposite sling are reported as a metric, capped at the measured 30 contacts with at most 2 knocked back down (D-13/D-14). The root strip (d < 0.25 m) stays blocked by the sling's inlane corner. That is a measured, reported known limit, deferred to a bat-to-ball rescale. The fix keeps rule (1) bat clearance over the full sweep, keeps the sling lift at or below 0.35 m, and keeps the sling-pinch proof GREEN. Source: `.planning/todos/pending/2026-11-23-root-shot-deflects-off-slingshot.md`; decisions in `06.3-CONTEXT.md`.
**Requirements**: TBD
**Depends on:** Phase 06.2
**Plans:** 3/3 plans complete (3 waves)

Plans:
**Wave 1**
- [x] 06.3-01-PLAN.md — Explicit sling kick face (D-09): `kickFace` carried TABLE_SPEC → resolve() → deriveKickFace, longest rule deleted, trimmed-fixture guard RED first, fail-loud resolve validation [wave 1]

**Wave 2** *(blocked on Wave 1)*
- [x] 06.3-02-PLAN.md — Trim both slings to t = 0.28 (D-14): own-sling root-shot gate RED then GREEN with opposite-sling cap, corner bracket check, pre-trim RED, no-sling and walled-off controls, root-strip metric, face pins re-pinned [wave 2]

**Wave 3** *(blocked on Wave 2)*
- [x] 06.3-03-PLAN.md — Phase gate on the merged tree, D-12 look-and-feel checkpoint (blocking), root-shot todo completed, backlog and D-05 notes corrected [wave 3]

### Phase 06.4: Address tech debt: narrow-viewport HUD, sling face rim, D-13 wording (INSERTED)

**Goal:** The HUD never covers the playfield. Wide windows keep today's top-left panel. Wherever that panel would reach the fitted table (768x1024, 375x812, square windows), a measured switch turns it into a constant-height 3-row bar above the table, and the table is fitted under it. Both slingshots show a visible slate rim on their passive faces under the amber kick face. The change is render-only: geometry, physics and feel are untouched. 06.3's D-13 text, the root-shot test titles and the ledgers state the own-sling gate by first sling contact (user ruling A). Source: `.planning/v1.0-MILESTONE-AUDIT.md` tech debt items 1-3.
**Requirements**: TBD
**Depends on:** Phase 06.3
**Plans:** 4/4 plans complete (2 waves)

Plans:
**Wave 1**
- [x] 06.4-01-PLAN.md — Narrow-viewport HUD: measured side/bar switch (`sideHudClears`, `heightUnderBar`), `data-hud` on #sandbox, compact 3-row bar CSS, table fitted under the bar [wave 1]
- [x] 06.4-02-PLAN.md — Sling face rim: `SLING_RIM` #7d82a8 at 0.015 m on every non-kick face, under the rubber; contrast and uniqueness tests; render-only proof [wave 1]
- [x] 06.4-03-PLAN.md — D-13 wording: first-contact text in 06.3-CONTEXT, root-shot header, FlipResult doc and titles; IN-01 fixed, CR-01 follow-up closed [wave 1]

**Wave 2** *(blocked on Wave 1)*
- [x] 06.4-04-PLAN.md — Phase gate on the merged tree plus a blocking human UAT at 1440x900, 768x1024 and 375x812 [wave 2]

### Phase 06.4.1: Address tech debt: bar-mode control hints, HUD status min-width, favicon (INSERTED)

**Goal:** A shared link works on a narrow window. In the narrow-viewport HUD bar, the player sees how to launch and flip (Space, ← →) whenever no status is showing, without changing the bar's constant height. The side panel keeps its 16 px clearance from the table in every HUD state, including GAME OVER (06.4 WR-02). The tab shows a procedural SVG favicon and the clean-boot `/favicon.ico` 404 is gone, with the RND-01 asset gate amended to admit exactly that one inline icon. Render/DOM-only: `src/table`, `src/physics`, `src/game` and the lockfile stay byte-identical. Source: `.planning/v1.0-MILESTONE-AUDIT.md` tech debt items 1-3.
**Requirements**: TBD
**Depends on:** Phase 06.4
**Plans:** 3/3 plans complete (3 waves)

Plans:
**Wave 1**
- [x] 06.4.1-01-PLAN.md — Bar-mode control hint (static `.hud-hint` sharing the status cell, shown only while the status is empty, bar height unchanged), 06.4 WR-02 status reserve tied to statusText, 06.4 IN-03 Mute row by class [wave 1]

**Wave 2** *(blocked on Wave 1: shares index.html)*
- [x] 06.4.1-02-PLAN.md — Procedural SVG data-URI favicon in head; RND-01 gate carve-out for exactly one validated, palette-only icon, with negative tests [wave 2]

**Wave 3** *(blocked on Wave 2)*
- [x] 06.4.1-03-PLAN.md — Phase gate on the merged tree, blocking human UAT at six viewports with the A1 (hint scope) and icon-motif questions, then close 06.4 WR-02 and IN-03 [wave 3]

### Phase 06.4.1.1: Address tech debt: ready-only bar hint, 11px type, 06.4.1 re-verify (INSERTED)

**Goal:** On a narrow window the bar hint "Hold Space to launch · ← → flip" shows only while the ball in play rests on the plunger (including while Space is held) and no status shows, on every serve. A read-only `GameSession.isBallOnPlunger()` getter drives a `data-ready` attribute that HudView writes on change; the `:empty` coupling is gone and the bar keeps one height. No font-size below 12 px remains in `index.html`, guarded by a test. Phase 06.4.1's VERIFICATION, SECURITY and VALIDATION are re-run at HEAD and name jsdom 31.0.1 and the current favicon gate, with the user-approved overrides. `src/physics`, `src/table`, `src/control`, package.json and the lockfile stay byte-identical; determinism replays stay bit-identical. Source: `.planning/v1.0-MILESTONE-AUDIT.md` tech debt items 1-3; decisions in `06.4.1.1-CONTEXT.md`.
**Requirements**: TBD
**Depends on:** Phase 06.4.1
**Plans:** 1/4 plans executed (4 waves)

Plans:
**Wave 1**
- [x] 06.4.1.1-01-PLAN.md — Ready-only bar hint end to end: `isBallOnPlunger()` getter, HudView `data-ready` sink wired in main.ts, attribute CSS replacing the `:empty` rule; ready x status matrix, serve sequence, spy-rig and real-table charge/fall-back tests [wave 1]

**Wave 2** *(blocked on Wave 1: shares index.html and hud-layout.test.ts)*
- [ ] 06.4.1.1-02-PLAN.md — 12 px type floor: the three 11 px labels to 12 px with a floor guard test, and a test that the side panel width stays set by the status reserve (D-07) [wave 2]

**Wave 3** *(blocked on Wave 2)*
- [ ] 06.4.1.1-03-PLAN.md — Phase gate and boundary on the merged tree, then one blocking-human UAT at 375x812, 1440x900 and the switch point that also approves the eight 06.4.1 overrides [wave 3]

**Wave 4** *(blocked on Wave 3)*
- [ ] 06.4.1.1-04-PLAN.md — 06.4.1 records to HEAD: stale SECURITY/VALIDATION rows rewritten and approved overrides seeded, the user runs `/gsd-execute-phase 06.4.1`, then verification passed is confirmed and new review findings are deferred under D-09 [wave 4]
