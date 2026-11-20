---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 04
current_phase_name: Reactive Elements & Game Rules
status: executing
stopped_at: Completed 04-01-PLAN.md
last_updated: "2026-11-20T15:25:28.151Z"
last_activity: 2026-11-20
last_activity_desc: Phase 04 execution started
state_head: 74e4592edbf3544b2ac3a1b9e7ca349cdae5a3b3
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 27
  completed_plans: 20
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-20)

**Core value:** The moment-to-moment pinball loop — plunger, flippers, ball physics, and bumpers — feels satisfying, weighty, and true to real pinball.
**Current focus:** Phase 04 — Reactive Elements & Game Rules

## Current Position

Phase: 04 (Reactive Elements & Game Rules) — EXECUTING
Plan: 2 of 8
Status: Ready to execute
Last activity: 2026-11-20 — Phase 04 execution started

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**

- Total plans completed: 20
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 7 | - | - |
| 2 | 7 | - | - |
| 3 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 10 | 2 tasks | 10 files |
| Phase 01 P02 | 18min | 2 tasks | 5 files |
| Phase 01 P04 | 7min | 2 tasks | 2 files |
| Phase 01 P05 | 12min | 2 tasks | 7 files |
| Phase 01 P03 | 15min | 2 tasks | 3 files |
| Phase 01 P06 | 20min | 2 tasks | 9 files |
| Phase 01 P07 | 14min | 3 tasks | 4 files |
| Phase 02 P01 | 50min | 3 tasks | 6 files |
| Phase 02 P02 | 6min | 2 tasks | 4 files |
| Phase 02 P03 | 32min | 2 tasks | 4 files |
| Phase 02 P04 | 15min | 2 tasks | 3 files |
| Phase 2 P5 | 31min | 3 tasks | 5 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 03 P01 | 13min | 3 tasks | 9 files |
| Phase 03 P02 | 11min | 2 tasks | 5 files |
| Phase 03 P03 | 5min | 2 tasks | 8 files |
| Phase 03 P04 | 4min | 2 tasks | 5 files |
| Phase 03 P05 | 14min | 3 tasks | 10 files |
| Phase 03 P06 | 10min | 3 tasks | 9 files |
| Phase 04 P01 | 10min | 3 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Physics engine (Planck.js `setBullet` vs. custom swept solver) deliberately deferred to an empirical spike inside Phase 1 — decide by which is provably tunnel-proof and easiest to tune, not on paper.
- [Roadmap]: Risk-first ordering — physics core and flipper feel retired before any table geometry is built.
- [Roadmap]: Keep v1 physics data structures N-ball-ready so deferred multiball is additive later, not a rewrite.
- [Phase 01]: TypeScript pinned to 5.9.3 (not plan 7.0.2) for 01-01 scaffold — @typescript-eslint 8 requires TS <6.1.0 and crashes under TS 7.0 native compiler; resolved per CLAUDE.md compat escape hatch. Exact-pin + lockfile control preserved. Ratify or revisit when typescript-eslint supports TS 7.
- [Phase 01]: Physics isolated behind an engine-agnostic PhysicsWorld interface — planck imported only in planck-world.ts; pooled snapshots avoid per-frame allocation; 120Hz fixed-step accumulator loop with MAX_FRAME_MS spiral-of-death clamp. PHYS-01/02/03 satisfied by a green headless smoke test.
- [Phase 01]: PHYS-03 proven and regression-guarded headlessly: 60/120/144Hz render cadences run identical fixed-step counts and reach bit-identical ball state; a 5s tab-blur delta is clamped to a bounded burst (no spiral, finite, recovers). No loop.ts change needed — the 01-02 MAX_FRAME_MS clamp already passes.
- [Phase 01]: Test flipper is the canonical Box2D pinball flipper — a DYNAMIC bat on a motorized revolute joint (enableMotor, high maxMotorTorque, plus/minus 45deg limits), never kinematic; exposed via getFlippers() with an engine-agnostic setFlipperMotor drive hook. Ball CCD armed on addBall (Planck #167 guard).
- [Phase 01]: Swept containment invariant (sweptEscaped) is engine-agnostic (reads the interface, not planck) with an EXCLUSIVE radius boundary (graze at exactly radius = contact, not escape); it catches thin-wall tunnel and boundary poke-out/re-enter that a naive center-in-box check misses. Deterministic mulberry32 PRNG (never the unseeded global RNG) backs seed replay.
- [Phase 01]: Throwaway Canvas 2D debug sandbox (D-06/D-07) renders the live interpolated ball + walls + test flipper + velocity + contacts + FPS/physics-Hz/KE HUD, reading state only through the PhysicsWorld interface (no planck import); allocation-free rAF path (pooled buffers, cached gradient/HUD strings). Diagnosis only — pass/fail stays the headless soak (01-06). Human render checkpoint operator-approved.
- [Phase 01]: Headless swept-containment soak (npm run soak) is the SOLE PHYS-02 tunnel-proof gate (D-03): seeded mulberry32 sweep of launch angle x speed (past real max, ~58 m/s) x flipper phase over >=630s SIMULATED 120Hz steps, sweptEscaped asserted every step against the interface; green with CCD on in ~11s wall-clock. Planck setBullet+continuousPhysics empirically HOLDS at ~10x the ball's real max velocity. — Turns PHYS-02 (the #1 risk) into a green/red CI line with replayable seeds and makes the plan 01-07 engine decision empirical (D-05).
- [Phase 01]: The soak gate is proven honest by a CCD-off negative control: bullet:false disables world-level continuousPhysics (Box2D runs CCD vs static bodies regardless of the per-body setBullet flag), so a max-velocity thin-wall launch tunnels and runSoak reports passed=false with a numeric replayable seed + full state that reproduces identically. Flipper tunnels use swept-path crossing + far-side-clear to exclude the stress-flipper crushing a resting ball. — A green gate is only trustworthy when a real fault is demonstrated to turn it RED (test integrity, T-06-01).
- [Phase 01]: Engine LOCKED — Planck.js 1.5.0 (setBullet + world continuousPhysics, behind the PhysicsWorld interface) confirmed by the passing npm run soak tunnel-proof gate + a green headless stability/energy proof (stability.test.ts: settles-to-rest, no jitter/corner-stick, kinetic energy monotonically non-increasing, teeth-proven). The D-01 custom-swept-solver fallback is documented but NOT triggered. Feel constants held unchanged; operator approved a visibly weighty fall/settle (D-09 Phase-1 target), final heavy verdict deferred to Phase 2.
- [Phase ?]: [Phase 02]: Two mirrored capsule feel flippers (Box core + rounded tip/hinge Circles, D-07) on motorized revolute joints; tipRadius on FlipperState (D-08); setFlipperMotor remapped to feel speeds +1->UP_SPEED 30 / -1->RETURN_SPEED 20 (D-05), replacing FLIPPER_MOTOR_SPEED; flipper restitution 0 (D-06(3)); torque 10000->500, limits +/-pi/8; mirror via body angle pi + planck reference-relative limits; right flipper is throwaway-rig scaffold (D-11) clear of every Phase-1 test ball. Phase-1 flipper neg-control launch retuned 80->105 to stay honest under the slower feel drive.
- [Phase 02]: Flipper control layer split into two engine-agnostic pure-TS modules (src/input/ keyboard held-set + per-side OR latched edges on event.code; src/control/ FlipperController FSM resting->flipping-up->held-up->returning) — neither imports planck (grep-enforced), FSM drives world only via setFlipperMotor(id,+1/-1/0) and holds +1 continuously through held-up (D-06(1)); unit-proven vs synthetic events and a spy PhysicsWorld.
- [Phase 02]: FSM limit detection is by angular settling (|delta|<1e-3 rad after moving), not a hard-coded FLIPPER_UPPER/LOWER_ANGLE compare — the referenceAngle-mirrored right flipper reports absolute angles around pi, so settling is the mirror-safe, geometry/engine-independent detector.
- [Phase ?]: [Phase 02]: FixedStepLoop.advance() gained an optional onStep pre-step hook invoked before each internal world.step (D-10); main.ts drains the input latch + ticks the FlipperController FSM at the top of each fixed 120 Hz step via one stable callback passed by reference (zero per-frame alloc, T-02-05), so a keypress applies sub-frame. Loop stays engine-agnostic. First keyboard-playable end-to-end flipper rig + drain-triggered ball feed (D-11), guarded by a no-mock E2E integration test.
- [Phase ?]: [Phase 02]: FlipperController now commands setFlipperMotor(id,0) per flipper in its constructor to enforce its documented resting==motor-0 invariant (Rule-1 fix surfaced by the E2E test) - otherwise a never-pressed bat runs the adapter construction-default motor into a joint limit and Box2D locks it (startup limit-jam). Release jam-lag (~15 steps after a long cradle hold) + physical rest/raise orientation deferred to the 02-06 feel checkpoint.
- [Phase 02]: Adaptive angular sub-stepping (D-01) lives inside PlanckWorld.step(): it splits FIXED_DT into N deterministic Planck sub-steps sized from the live peak flipper joint speed (N=ceil(omega*L*dt/(0.5*r)); 1 at rest, 2 at FLIPPER_UP_SPEED), bounded to N<=4 by a secondary cap FLIPPER_MAX_ANGULAR_SPEED=96 (D-02), with events accumulating across sub-steps and pools/contacts synced once after the last. PlanckWorldOptions.subStepping=false forces N=1 as the 02-05 negative-control hook. N is from joint speed never wall-clock; the ball setBullet CCD and the interface/harness are untouched. — FLIP-04 rotational anti-tunnel mechanism, unit-proven; 02-05 seeded gate proves non-penetration green ON / red OFF.
- [Phase ?]: FLIP-04 gate proven: seeded green flipper-primary peak-omega swept gate (CCD+sub-stepping ON, >=630s simulated) + replayable RED sub-stepping teeth control
- [Phase ?]: Sub-stepping teeth isolated with CCD off in both arms; bullet:true teeth is vacuous (CCD masks it, peak omega=30 cannot skip the 0.2m ball)
- [Phase ?]: Feel proven as numbers: tip out-launches base per v=omega*r (2.62 vs 3.0), caught ball cradles jitter-free with monotonic energy
- [Phase 02 GAP-01 rig fix]: 02-06 human-checkpoint feedback (live rig) — made the throwaway two-flipper TEST RIG playable WITHOUT touching the raiseSign fix or any feel constant (D-11 scaffold only). Symmetric same-height pivots mirrored about box centre (left keeps Phase-1 (0.35,2.6); right its mirror (1.65,2.6)) — the "not on the same height" report; HALF_SEP sized so tips never collide at any angle (min gap 0.31m through a full raise sweep). Idle made symmetric by constructing FlipperController (motor 0) BEFORE the first ball (adapter construction motor left unchanged so FLIP-04 soak/teeth calibration stays byte-identical). Centre feed drops ONE ball onto the pair (rests x≈1.0,y≈2.45; max x ever 1.10 — never off the right edge); new removeBall() on the interface removes the drained ball before re-feeding (no corner pile-up). stability.test.ts rebuilt around the centred pair (holdAllFlippers; energy ball r=0.1 to clear under raised bats); flipper-feel v=ω·r decoupled from the rig (droop far flipper) + strike the flat core (rFrac 0.8) not the whip-prone tip circle — clean match within the UNCHANGED 35% tol. All green: tsc/eslint 0, 71/71, 2/2 soak.
- [Phase 02 GAP-01]: Fixed the verifier's BLOCKER (SC1/FLIP-01) — setFlipperMotor(id,+1) raised the right bat but DROOPED the left (a body-angle-pi mirror preserves rotational handedness, so the two counter-rotating bats need OPPOSITE motor signs to both raise). Folded a per-flipper raiseSign (mirror?+1:-1) into PlanckWorld.setFlipperMotor (D-05); FlipperController still drives +1=raise engine-agnostically. Symmetric +/-pi/8 limits mean flipping the sign drives each bat to the CORRECT limit (+1=up cradle, -1=rest). Right pivot moved 1.15->1.55 (D-11 throwaway rig) so the now-UP raised left bat no longer collides with it. Raise direction re-proven against TRUE world tip-Y for BOTH sides; feel v=omega*r re-proven with the correct +1 sign via a sustained-launch measure; FLIP-04 teeth re-calibrated (soak sweep reverses before the limit, sign-agnostic; teeth speed 96->92). All green: tsc/eslint 0, 71/71 tests, 2/2 soak gates. 02-06 human by-feel checkpoint now unblocked.
- [Phase 03]: 03-01: TABLE_SPEC + PROOF_BOX_SPEC as data; one resolve() feeds Planck fixtures, getBoundarySegments() (solid subset by reference) and getElements(); PlanckWorld defaults to PROOF_BOX_SPEC until 03-04
- [Phase 03]: 03-01: static table fixtures carry spec {kind,id} fixture userData on one static body; wall events now report element ids instead of -1
- [Phase 03]: 03-01: arc step = min(2acos(1-ARC_CHORD_EPS/r), 2asin(BALL_RADIUS_M/2r)); ARC_CHORD_EPS=0.02 m, MIN_VERTEX_SPACING=0.01 m; self-intersecting chains rejected
- [Phase 03]: 03-01: phase commits moved to branch gsd/phase-03-table-plunger-event-bus because the commit guard flags master as protected (allow_default_branch_commits unset)
- [Phase 03]: 03-02: TABLE_SPEC flippers built at droop limit (left +PI/8, right 7PI/8) with construction motor 0 via MountSpec.restPose; referenceAngle/limits unchanged; PROOF_BOX_SPEC path untouched
- [Phase 03]: 03-02: element id bands 0/1 mounts, 1xx walls, 2xx bumpers, 3xx slingshots, 4xx rollovers, 5xx lanes, 600 drain; right twins via mirrorPath (arc a -> PI - a)
- [Phase 03]: 03-02: seeded flow proof draws 8 drops from one mulberry32(0x0302) stream over OPEN_FIELD_REGION; mutation-checked (trap pocket and sweep obstruction both go red)
- [Phase 03]: 03-03: soak harness takes SoakConfig.table (default PROOF_BOX_SPEC) + originRegion with a seeded clearance filter (MAX_ORIGIN_DRAWS 64, throws with seed); circles (bumpers) are rejected too since they are not boundary segments
- [Phase 03]: 03-03: real-table 630 s soak gate (TABLE_SPEC, OPEN_FIELD_REGION, 60 m/s) green first run with a CCD-off RED control on the same geometry; no spec fix needed; five primitive proofs pinned to PROOF_BOX_SPEC ahead of the 03-04 default flip
- [Phase 03]: 03-04: PlanckWorldOptions.table default flipped to TABLE_SPEC (D-05); every primitive proof names PROOF_BOX_SPEC; unmodified keyboard e2e passes on the real bats
- [Phase 03]: 03-04: FlipperController typed against FlipperWorld = Pick<PhysicsWorld, getFlippers | setFlipperMotor>, so 03-05's applyImpulse growth never reaches its spy
- [Phase 03]: 03-05: plunger is impulse-on-release via generic PhysicsWorld.applyImpulse (center of mass, rejects non-finite/unknown id); 1.5 charge/s, impulse 0.4-1.5 kg*m/s (3.1-11.9 m/s); full charge exits the chute, tap falls back
- [Phase 03]: 03-05: PlungerController charge = heldSteps * RATE * FIXED_DT (a running float sum missed the cap at 0.9999999999999984); meter and impulse read the same getCharge()
- [Phase 03]: 03-05: PlungerInput latches a distinct cancel edge on blur/hidden and clears held, so focus loss never launches; sandbox spawns every ball at PLUNGER_REST, meter/pullback drawn outside the cabinet
- [Phase 03]: 03-06: CollisionEvent is normalized (ballId + elementKind/elementId from TABLE_SPEC, CollisionPartnerKind = ElementKind | ball); raw pair removed; type stays coarse; exported pure normalizeContact
- [Phase 03]: 03-06: sensors emit on begin-contact only (impulse 0, point = ball center); solids stay on post-solve; shared zero-alloc emitContact reserves a slot only for ball pairs
- [Phase 03]: 03-06: CollisionRouter (src/app) drains once per fixed step at the new FixedStepLoop onPostStep seam, fans out in registration order, zero-copy, one-way; sandbox has one throttled logging listener
- [Phase 03]: UAT 6/6 passed on 2026-11-20. Tests 2–6 were driven in Chrome with recorded evidence; test 1 (layout readability) was passed by eye. Phase 2's roadmap entry was closed in the same session; it had been stuck at "5/6 In Progress" despite passing verification.
- [Phase 04]: Bumper kick raises outward normal speed to BUMPER_KICK_SPEED 5.5 m/s via applyImpulse in ReactiveElements.service(); listeners only record and award (R1, Pattern 1)
- [Phase 04]: KICKER_REARM_STEPS = 6 fixed steps per bumper collapses post-solve bursts and the next-step TOI duplicate; a not-live contact arms nothing
- [Phase 04]: GameSession implements RulesGate with an exact saturating integer score; isLive() always true until the 04-05 FSM
- [Phase 04]: Score HUD is a DOM overlay (#hud-score) written only on change via textContent; canvas HUD stays diagnosis-only

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 3]: Five info findings from the code review (IN-01..IN-05) are still `open` in 03-REVIEW-DISPOSITION.md, along with the WR-01 residual (an extra hidden priming step on every `addBall`). Triage them before Phase 4 builds on the plunger and the bus.
- [Phase 3 → 5]: The 03-UI-REVIEW carry-forwards apply to the real renderer:
  - The HUD ignores the display fit and renders at about 3.4 px.
  - `#ef476f` is used for the drain, the velocity arrow and the full meter.
  - There is no on-screen controls hint and no `aria-label` on the canvas.
- [Phase 3]: The plunger re-feed has not been watched on a real 120/144 Hz display. The headless ball-feed tests cover those rates.
- [Phase 2]: VALIDATION.md and SECURITY.md were never produced (the Nyquist validation and secure-phase audits did not run).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261119-sbr | Re-scope to an original table (Flippers) | 2026-11-19 | 1c0848f | [261119-sbr-re-scope-project-from-a-space-cadet-recr](./quick/261119-sbr-re-scope-project-from-a-space-cadet-recr/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Progression | Original rank/mission/lock-jackpot/multiball layer (v2) | Deferred | Roadmap creation |

## Session Continuity

Last session: 2026-11-20T15:25:26.664Z
Stopped at: Completed 04-01-PLAN.md
Resume file: None
