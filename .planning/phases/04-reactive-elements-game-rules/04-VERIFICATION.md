---
phase: 04-reactive-elements-game-rules
verified: 2026-11-20T19:45:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/04-reactive-elements-game-rules/04-01-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-01-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-02-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-02-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-03-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-03-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-04-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-04-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-05-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-05-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-06-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-06-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-07-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-07-SUMMARY.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-08-PLAN.md"
  - ".planning/phases/04-reactive-elements-game-rules/04-08-SUMMARY.md"
  - "src/control/flipper-controller.ts"
  - "src/control/plunger-controller.ts"
  - "src/game/game-session.ts"
  - "src/game/reactive-elements.ts"
  - "src/game/tilt-meter.ts"
  - "src/game/tuning.ts"
  - "src/harness/reactive-world.ts"
  - "src/input/game-input.ts"
  - "src/sandbox/game-e2e.test.ts"
  - "src/sandbox/main.ts"
  - "src/ui/hud.ts"
covered_digest: "v4:sha256:7a1945a7ae8253829666fbf21a93dd5c7f554f7e997ea5255467554305d7812d"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Bumper pop visibility. Launch a ball into the bumper cluster (200/201/202) with the sandbox open."
    expected: "The ball visibly pops away from each bumper with added speed (about 5.5 m/s outward), the score jumps by 1,000 per touch, and the ball does not stick or ping-pong forever."
    why_human: "Kick strength and readability are by-feel; the automated proofs assert the kick law and energy bound, not whether the pop reads as satisfying."
  - test: "Slingshot snap. Roll or drop a ball onto the left and right sling faces near the flippers."
    expected: "The ball is snapped out along the face (about 4.5 m/s), +500 per hit, left and right behave as mirrors, and a ball rolling along the passive faces is not kicked."
    why_human: "Sling snap timing and fairness are feel judgments (R2)."
  - test: "Nudge direction and size. In a game, tap X, Period and ArrowUp once each, spaced about 2 s apart."
    expected: "X pushes the ball right, Period pushes it left, ArrowUp pushes it up-table; each is a small shove (about 1.2 m/s), never a jump, and none triggers WARNING."
    why_human: "Direction convention (assumption A2) and size (A3) are tuning-by-feel. NUDGE_DIRS says to flip a sign if it feels backwards."
  - test: "Tilt fairness. Tap nudge keys rapidly (3 times, then a 4th) and then nudge once every 2 s."
    expected: "Third rapid nudge shows WARNING, the fourth shows TILT. Slow nudging never warns. A tilt costs only the current ball: score is kept and the next ball serves normally."
    why_human: "Whether the tilt thresholds (warn 2.0, tilt 3.0, decay 0.5/s, cooldown 0.25 s) feel fair is subjective (A4). This also carries the judgment-tier prohibition about tilt costing more than the current ball."
  - test: "TILT flipper drop (visual). Hold a flipper key, then trigger TILT."
    expected: "The raised bat visibly falls, further presses do nothing until the next ball is served, and a key still held at the serve raises its bat at once."
    why_human: "Visual and motion behavior; the automated proof asserts FSM phases, not how the drop looks or feels."
  - test: "HUD legibility and layout. Open the page at a typical window size, then charge the plunger."
    expected: "Score, BALL n / 3, status and the controls hint are readable and do not overlap or hide the plunger charge meter or the table. The controls hint reads clearly (04-REVIEW IN-05 notes the ambiguous slash separator)."
    why_human: "Visual layout and legibility. 04-UI-REVIEW scored 16/24 and flagged these areas."
  - test: "Attract behavior. Load the page and do nothing, then press flipper keys and Space before Enter."
    expected: "No ball is on the table, the status line reads PRESS ENTER TO START, and flipper and plunger keys do nothing until Enter. After game over it reads GAME OVER · PRESS ENTER."
    why_human: "End-to-end browser behavior of the real main.ts boot path. The tests exercise a hand-mirrored copy of main.ts (04-REVIEW WR-01), not the module itself."
  - test: "Tilt on the final drain in the same step (unclassified edge). Tilt on ball 3 as the ball is draining."
    expected: "The game ends cleanly with GAME OVER, the score is kept, both bats are down, and no stray ball remains. Verifier trace of the code: onNudge runs at the top of a step and service() at post-step, so the order is sequential and ends in game-over with flippers disabled either way. A test covers a tilt on ball 3 followed by its drain."
    why_human: "Listed for a confirming glance only. No defect was found, but the exact same-step ordering is not directly pinned by a test."
  - test: "Judgment-tier prohibitions (unverified-prohibition, human review recommended). Confirm the four prohibitions below in the sandbox."
    expected: "(1) Kicks do not trap or add unbounded energy. (2) Rules and strings are original. (3) A nudge never moves the ball by a position write. (4) A tilt costs only the current ball."
    why_human: "Judgment-tier items. The verifier's own non-authoritative verdict is SATISFIED on all four (see Prohibitions below), but the autonomous verdict is never authoritative."
---

# Phase 4: Reactive Elements & Game Rules Verification Report

**Phase Goal:** The table becomes a game: reactive elements bounce and score off the event bus, a 3-ball loop runs to game-over, and nudge/tilt behaves like a real table.
**Verified:** 2026-11-20T19:45:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

Automated evidence supports every roadmap criterion. The status is `human_needed` because the phase explicitly leaves by-feel and visual checks (kick feel, nudge direction, tilt fairness, HUD layout, attract behavior) to a human, and four judgment-tier prohibitions are flagged. No gaps were found.

## Goal Achievement

### Observable Truths (roadmap success criteria, the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bumpers pop the ball back with added energy and award points on every contact | VERIFIED | `src/game/reactive-elements.ts` `onEvent` records a bumper contact, awards `BUMPER_POINTS` through the gate, and queues a kick. `service()` raises outward speed to `BUMPER_KICK_SPEED` through `applyImpulse` with mass from `ballMass()`. A 6-step re-arm collapses the post-solve burst into one trigger per touch. Bumpers 200, 201 and 202 exist in `TABLE_SPEC`. Real-table tests in `reactive-table.test.ts` pass: first touch scores exactly once, the ball leaves at kick speed, and the no-rules control gives a weak bounce. |
| 2 | Slingshots kick on contact; lanes and rollovers register and award points | VERIFIED | `deriveKickFace` takes the longest segment of each sling (300, 301) with an outward normal. The kick is filtered by `SLING_MIN_IMPULSE` and `SLING_FACE_TOL` so passive faces do not fire. Rollovers 400-402 and inlanes 500 and 501 score, rollovers light, and the bank bonus pays and resets the lights. Tests for both slings (mirror), the rollover crossing and the 12-seed energy bound (all drain within 60 s, peak at most 15 m/s, kicks > 0) pass. |
| 3 | A live running score updates on-screen | VERIFIED | `GameSession.award()` accumulates a safe-integer score. `HudView.update(session)` is called every frame in `main.ts` and writes the formatted score only on change. `index.html` has `#hud-score`, `#hud-ball` and `#hud-status`. `hud.test.ts` and the e2e HUD walk-through pass. |
| 4 | 3-ball loop serves the next ball on drain and ends after the last drain | VERIFIED | `GameSession` FSM: Enter starts a game (score 0, ball 1, ball served to `PLUNGER_REST`). A bus drain event for the active ball is recorded and `service()` removes it, then serves the next ball or enters game-over (flippers off, no ball, score kept). The drain is read from the bus, not from a y-position test. The no-mock e2e plays three real drains on the real table, then game over, then a restart with the score reset and the lights cleared. `ball-feed.ts` is deleted. |
| 5 | Nudge applies a small impulse (never a teleport); over-nudging trips an accumulating-and-decaying TILT that kills elements and drops the flippers | VERIFIED | `onNudge` uses only `applyImpulse` (a grep for position writes in `src/game`, `src/ui`, `src/control` and `src/input` finds none). A 30-step cooldown applies. `TiltMeter` accumulates and decays per fixed step. Hand-checked: 1.0, 1.875, 2.75 (warn), 3.625 (tilt). Tilt sets `state = "tilted"`, so `isLive()` is false, which silences kicks, points and lights. `setEnabled(false)` drives the bats down through the motor-FSM `drop()` without any body or joint change. e2e tests check velocity-only change against an un-nudged twin and that a tilt drops and locks a held-up bat. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

Behavior-dependent invariants (cooldown and decay in fixed steps, remove-before-serve, flipper drop on tilt, 60/120/144 Hz determinism) each have a named test that passes in the suite run; none rests on symbol presence alone.

### Plan-level must-haves checked (selected, beyond the roadmap)

| Truth | Status | Evidence |
|-------|--------|----------|
| Plunger rest-speed gate and held-state edge ordering (04-02) | VERIFIED | `PLUNGER_REST_SPEED_EPS = 0.05` with a strict `<` check (`plunger-controller.ts:188`). `applyEdges(..., heldNow, ballId)` is present and wired in `main.ts:179`. `PlungerInput.isHeld()` and `FlipperInput.isHeld(side)` exist. |
| `soak.ts` and `containment.ts` unchanged; rules join via `makeWorld` (04-04) | VERIFIED | `git diff 011c060 HEAD -- src/harness/soak.ts src/harness/containment.ts` is empty. `ReactiveSoakWorld` wraps `PlanckWorld`, runs `router.dispatch()` and then `rules.service()` per step, and tallies kicks. |
| `drainEvents()` returns `readonly CollisionEvent[]`; one density source (04-04) | VERIFIED | `types.ts:208` and `planck-world.ts:894` both return the readonly type. `BALL_DENSITY` is exported once and imported by `planck-world.ts:29`. `ballMass` is the only mass formula. |
| Only `planck-world.ts` imports the engine (04-01) | VERIFIED | No `from "planck"` import outside `planck-world.ts`. Test files import `PlanckWorld`, not the engine. |
| Replay determinism at 60/120/144 Hz (04-08) | VERIFIED | `game.determinism.test.ts` "the same key timeline gives the same game at 60, 120 and 144 Hz" passes. |
| Flippers dead outside a game, re-enabled on every serve with held-key re-press (04-08) | VERIFIED | `GameSession` constructor and final drain call `setEnabled(false)`. `main.ts` gate adapter re-presses held sides on enable. Session spy tests and an e2e relay test pass. |
| Phase-3 review disposition updated (04-08) | VERIFIED | `03-REVIEW-DISPOSITION.md` records CR-01..WR-05 and IN-01 as fixed. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/game/reactive-elements.ts` | bumper, sling, sensor rules | VERIFIED | 354 lines, substantive, wired in `main.ts` and `reactive-world.ts` |
| `src/game/game-session.ts` | 3-ball FSM, nudge, tilt, flipper gate | VERIFIED | Substantive, wired in `main.ts` and consumed by `HudView` |
| `src/game/tilt-meter.ts` | accumulate and decay meter | VERIFIED | Pure module, used by `GameSession` |
| `src/game/tuning.ts` | HMR-tunable constants | VERIFIED | All plan-named constants present |
| `src/ui/hud.ts` and `index.html` | three-line HUD, `role=status` on the status line | VERIFIED | Write-on-change per line, text only; elements present |
| `src/input/game-input.ts` | Enter and nudge latch | VERIFIED | Bound codes only; `preventDefault` only for bound codes |
| `src/control/flipper-controller.ts` | `setEnabled`, `isEnabled` | VERIFIED | Drops via the motor FSM only |
| `src/control/plunger-controller.ts` | rest gate and `applyEdges` | VERIFIED | Present and wired |
| `src/harness/reactive-world.ts` and the soak tests | rules-live soak, CCD-off RED | VERIFIED | Gate (210 x 3 s = 630 s, kicks > 0) passes in `npm run soak` |
| `src/sandbox/debug-draw.ts` | lit rollover drawn | VERIFIED | `LightState` and `isLit` used at line 274; `main.ts` passes `reactive` to `draw` |
| `src/sandbox/ball-feed.ts` | deleted | VERIFIED | Absent |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `reactive-elements.ts` | collision router | `router.register(this.onEvent)` | WIRED | line 243 |
| `reactive-elements.ts` | world | `applyImpulse` in `service()` | WIRED | line 300 |
| `main.ts` | reactive and session service | `onPostStep`: dispatch, `reactive.service()`, `session.service()` | WIRED | lines 201-205 |
| `main.ts` | `session.onStart`, `onNudge`, `tick` | `onFixedStep` | WIRED | lines 187-192; a started game resets the lights |
| `main.ts` | `plunger.applyEdges` with `isHeld` and `activeBallId` | `onFixedStep` | WIRED | line 179 |
| `main.ts` | `HudView.update(session)` | `frame()` | WIRED | line 311 |
| `game-session.ts` | `FlipperGate` to `controller.setEnabled` | `main.ts` adapter | WIRED | lines 139-146 |
| `game-session.ts` | `TiltMeter.addNudge` and `update` | `onNudge` and `tick` | WIRED | lines 205 and 219 |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Real data | Status |
|----------|---------------|--------|-----------|--------|
| HUD score | `getScore()` | `award()` from bus events via `ReactiveElements` | Yes | FLOWING |
| HUD ball and status | `getBall()`, `getState()`, `isWarning()` | FSM driven by bus drain and nudge edges | Yes | FLOWING |
| Lit rollovers | `reactive.isLit()` | rollover sensor events on the bus | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `npm test` | 32 files, 338 tests pass | PASS |
| Typecheck | `npx tsc --noEmit` | exit 0, no output | PASS |
| Lint | `npx eslint .` | no output | PASS |
| Rules-live tunnel gate | `npm run soak` | 4 of 4 pass, includes the 630 s simulated reactive gate | PASS |
| `npm run build` | not re-run by me (the orchestrator reported exit 0; `tsc --noEmit` passes, which is its first stage) | n/a | SKIP |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist and no plan declares one. Not applicable.

### Requirements Coverage

| Requirement | Source plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| ELEM-01 | 04-01, 04-03, 04-04 | Bumpers pop with added energy and score | SATISFIED | Truth 1 |
| ELEM-02 | 04-03, 04-04 | Slingshots kick on contact | SATISFIED | Truth 2 |
| ELEM-03 | 04-03 | Lanes and rollovers light and score | SATISFIED | Truth 2 |
| GAME-01 | 04-01, 04-07 | Live score HUD | SATISFIED | Truth 3 |
| GAME-02 | 04-02, 04-05, 04-06, 04-07, 04-08 | 3-ball loop to game-over | SATISFIED | Truth 4 |
| GAME-03 | 04-02, 04-06, 04-07, 04-08 | Nudge, tilt, flippers drop | SATISFIED | Truth 5 |

All six requirement IDs from the phase scope appear in at least one plan's `requirements` frontmatter and are marked Complete in `REQUIREMENTS.md`. No orphaned Phase 4 requirements.

### Prohibitions (judgment tier, non-authoritative verifier verdict)

Flagged `unverified-prohibition: human review recommended`. None is a silent pass.

| Prohibition | Verifier verdict | Basis |
|-------------|------------------|-------|
| Kicks must not inject unbounded energy or trap the ball | SATISFIED (non-authoritative) | The kick law only raises normal speed to a fixed target. The seeded 12-drop test shows every ball drains with a peak at most 15 m/s. The rules-live soak shows no containment breach. |
| No reuse of commercial table rule names, callouts or score tables | SATISFIED (non-authoritative) | A grep finds only generic terms (bumper, sling, rollover, lane, bank bonus). Point values are generic magnitudes. |
| A nudge must not write the ball position | SATISFIED (non-authoritative) | The grep finds no position writes. A test compares the nudged ball with an un-nudged twin. |
| A tilt must not cost more than the current ball | SATISFIED (non-authoritative) | Session tests check that a tilt then drain serves the next ball with the score kept, the meter reset and the warning cleared. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase files) | - | TBD, FIXME, XXX, TODO, HACK, Math.random, Date.now | None | None found in `src/game`, `src/ui`, `src/input`, `src/control`, `src/sandbox`, `src/harness`. `performance.now()` appears only in the `main.ts` render loop; the rules are step-counted. |

Advisory, from `04-REVIEW.md` (0 critical, 2 warning, 5 info, all recorded open). None blocks the goal:
- WR-01: the e2e and determinism tests exercise a hand-copied composition rather than `main.ts`. I read `main.ts` against the test copy and the order and bodies match today. The attract-behavior human item above covers the residual drift risk.
- WR-02: auto-repeat keydowns on flipper keys are not `preventDefault`ed. This is a browser quirk (possible Firefox quick-find on a held `/`), outside the Phase 4 goal.
- IN-04: a ball that never reaches the drain sensor soft-locks the game. This is an edge case outside the roadmap criteria.
- `04-UI-REVIEW.md` scored 16/24; the HUD legibility human item covers it. Phase 5 owns the real rendering and UI.

### Human Verification Required

See the `human_verification` list in the frontmatter (9 items): bumper pop, sling snap, nudge direction and size, tilt fairness, TILT flipper drop, HUD legibility and plunger-meter overlap, attract behavior, the tilt-on-final-drain edge (confirming glance), and the four judgment-tier prohibitions.

### Gaps Summary

No gaps. All five roadmap success criteria and the plan-level must-haves are backed by code I read and by passing tests that I ran: 338 tests, `tsc`, ESLint and the 630-simulated-second rules-live soak. The remaining items are subjective or visual and are routed to human verification, which sets the status to `human_needed`.

---

_Verified: 2026-11-20T19:45:00Z_
_Verifier: Claude (gsd-verifier)_
