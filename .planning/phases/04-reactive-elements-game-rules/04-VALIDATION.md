---
phase: "4"
slug: "reactive-elements-game-rules"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-20"
updated: "2026-11-20"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10, `environment: "node"` (no DOM; synthetic `KeyEventLike` objects; `{ textContent }` fakes) |
| **Config file** | `vitest.config.ts` (excludes `**/*.gate.test.ts`), `vitest.gate.config.ts` (soak gates) |
| **Quick run command** | `npx vitest run src/game src/input src/control src/ui` |
| **Full suite command** | `npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` |
| **Estimated runtime** | ~4 s fast suite (32 files, 338 tests); soak gate ~5 s wall for 4 gate files (>= 630 s simulated) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit && npx eslint src && npx vitest run`
- **After every plan wave:** Run `npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak`
- **Before `/gsd-verify-work`:** Full suite + soak must be green, then human UAT by feel (kick liveliness, nudge size, tilt fairness, HUD legibility)
- **Max feedback latency:** ~5 seconds (fast suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | ELEM-01 | T-04-01/02 | a real bumper kicks the ball along the outward normal at BUMPER_KICK_SPEED and scores once per touch despite the duplicate event | tracer (integration) | `npx vitest run src/game/reactive-table.test.ts && npx tsc --noEmit && npx eslint src/game src/physics` | ✅ | ✅ green |
| 04-01-02 | 01 | 1 | ELEM-01, GAME-01 | T-04-01/02 | burst collapse, cooldown count, kick law, liveness gate, no world access mid-dispatch; exact non-negative saturating integer score | unit (TDD) | `npx vitest run src/game && npx tsc --noEmit && npx eslint src/game` | ✅ | ✅ green |
| 04-01-03 | 01 | 1 | GAME-01 | T-04-03 | DOM score HUD written only on change; formatScore boundaries (0 … MAX_SAFE_INTEGER) | suite + soak + human-check | `npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` | ✅ | ✅ green |
| 04-02-01 | 02 | 1 | GAME-02 | T-04-04 | rest gate (IN-01): a release on a ball falling back into the lane launches nothing; a release from rest still launches | tracer (unit + e2e) | `npx vitest run src/control/plunger-controller.test.ts src/sandbox/plunger-e2e.test.ts src/sandbox/game-e2e.test.ts` ¹ | ✅ | ✅ green |
| 04-02-02 | 02 | 1 | GAME-02, GAME-03 | T-04-05 | same-window edges applied in their real order (IN-02); `isHeld()` tracks keydown, repeat, keyup, blur, hidden tab | unit (TDD) + e2e | `npx vitest run src/input/plunger-input.test.ts src/control/plunger-controller.test.ts src/sandbox/plunger-e2e.test.ts` | ✅ | ✅ green |
| 04-03-01 | 03 | 2 | ELEM-02 | T-04-07 | both slings kick a face strike out along the derived, mirror-correct normal and score SLING_POINTS | tracer (integration) | `npx vitest run src/game && npx tsc --noEmit && npx eslint src/game` | ✅ | ✅ green |
| 04-03-02 | 03 | 2 | ELEM-03, ELEM-02 | T-04-07/08 | rollovers/inlanes score once per pass with a 30-step re-arm, top rollovers light and pay the bank bonus; passive and rolling sling contacts never kick | unit (TDD) + integration | `npx vitest run src/game && npx tsc --noEmit && npx eslint src/game` | ✅ | ✅ green |
| 04-03-03 | 03 | 2 | ELEM-01/02/03 | T-04-06 | 12 seeded dead-flipper drops all drain within 60 s, max speed <= 15 m/s, kicks fire; lit rollovers drawn in the sandbox | integration + human-check | `npx tsc --noEmit && npx eslint src && npx vitest run` | ✅ | ✅ green |
| 04-04-01 | 04 | 3 | ELEM-01/02 | T-04-09 | rules-live real-table soak green with CCD on and non-vacuous (kicks > 0); CCD-off RED control; seed replay; soak.ts/containment.ts untouched | tracer (soak) | `npx vitest run src/harness/reactive-soak.test.ts && npx tsc --noEmit && npx eslint src/harness && git diff --exit-code 011c060 -- src/harness/soak.ts src/harness/containment.ts` | ✅ | ✅ green |
| 04-04-02 | 04 | 3 | ELEM-01/02 | T-04-10 | `drainEvents()` read-only everywhere (IN-05); single BALL_DENSITY source; 630 s rules-live gate | suite + soak | `npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` | ✅ | ✅ green |
| 04-05-01 | 05 | 3 | GAME-02 | T-04-11 | full 3-ball game on the real table: attract, Enter, three launches and drains, game over with score kept, restart at 0 with lights off | tracer (e2e) | `npx vitest run src/sandbox/game-e2e.test.ts src/game && npx tsc --noEmit && npx eslint src/game src/input src/sandbox` | ✅ | ✅ green |
| 04-05-02 | 05 | 3 | GAME-02 | T-04-11/12/13 | FSM: double start refused, remove-before-serve, non-active drain ignored, duplicate drain serves once; start latch repeat-safe, preventDefault only on bound codes | unit (TDD) | `npx vitest run src/game/game-session.test.ts src/input/game-input.test.ts && npx tsc --noEmit && npx eslint src/game src/input` | ✅ | ✅ green |
| 04-05-03 | 05 | 3 | GAME-02 | T-04-11 | BallFeed retired with its CR-01 cases ported; IN-02 same-window re-press proven in the live composition | integration | `test ! -e src/sandbox/ball-feed.ts && test ! -e src/sandbox/ball-feed.test.ts && npx tsc --noEmit && npx eslint src && npx vitest run` | ✅ | ✅ green |
| 04-06-01 | 06 | 4 | GAME-03 | T-04-14/15 | nudge is a velocity impulse (NUDGE_IMPULSE / m), position changes only by integration; cooldown; inert before Enter | tracer (e2e) | `npx vitest run src/sandbox/game-e2e.test.ts src/game src/input && npx tsc --noEmit && npx eslint src/game src/input src/sandbox` | ✅ | ✅ green |
| 04-06-02 | 06 | 4 | GAME-03, GAME-02 | T-04-14/16 | TiltMeter accumulates and decays per fixed step, rising-edge warning, tilt kills the ball (`isLive()` false, awards ignored), last-ball tilt ends the game | unit (TDD) + e2e | `npx vitest run src/game src/sandbox/game-e2e.test.ts && npx tsc --noEmit && npx eslint src/game` | ✅ | ✅ green |
| 04-06-03 | 06 | 4 | GAME-03 | T-04-12 | nudge keys latch one edge per press and never preventDefault or latch a flipper key or Space | unit (TDD) | `npx vitest run src/input/game-input.test.ts && npx tsc --noEmit && npx eslint src && npx vitest run` | ✅ | ✅ green |
| 04-07-01 | 07 | 5 | GAME-01/02/03 | T-04-19 | the HUD follows a real game: start prompt, ball number, WARNING, TILT, next ball, GAME OVER with score kept | tracer (e2e) | `npx vitest run src/sandbox/game-e2e.test.ts src/ui && npx tsc --noEmit && npx eslint src/ui src/sandbox` | ✅ | ✅ green |
| 04-07-02 | 07 | 5 | GAME-01/02/03 | T-04-19/20 | every HUD mapping and the per-line write-on-change rule pinned; text written via textContent, never markup | unit + suite + soak + human-check | `npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` | ✅ | ✅ green |
| 04-08-01 | 08 | 6 | GAME-03, GAME-02 | T-04-17 | TILT drops both bats and locks them until the next ball; flippers dead before Enter and after game over; a held key re-raises its bat on serve | tracer (e2e) | `npx vitest run src/sandbox/game-e2e.test.ts src/control src/sandbox/flipper-e2e.test.ts && npx tsc --noEmit && npx eslint src/control src/input src/game src/sandbox` | ✅ | ✅ green |
| 04-08-02 | 08 | 6 | GAME-03 | T-04-17 | disable contract pinned in the flipper FSM (`setEnabled`), the input (`isHeld`) and the session's FlipperGate | unit (TDD) | `npx vitest run src/control/flipper-controller.test.ts src/input/flipper-input.test.ts src/game/game-session.test.ts && npx tsc --noEmit && npx eslint src/control src/input src/game` | ✅ | ✅ green |
| 04-08-03 | 08 | 6 | GAME-01..03 | T-04-18 | a scripted full game replays identically at 60/120/144 Hz (steps, score, ball, state, flipper angles, tilt observed) | integration + soak + human-check | `npx vitest run src/sandbox/game.determinism.test.ts && npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

¹ The plan's original verify also named `src/sandbox/ball-feed.test.ts`, which 04-05 deleted after porting its CR-01 cases into `src/sandbox/game-e2e.test.ts`; the command above is the current equivalent.

### Requirement Coverage

| Requirement | Status | Automated evidence |
|-------------|--------|--------------------|
| ELEM-01 | COVERED | `reactive-elements.test.ts` bumper rule (10), `reactive-table.test.ts` bumper tracer + energy bound, `reactive-soak.test.ts` (3), `reactive-table-soak.gate.test.ts` |
| ELEM-02 | COVERED | `reactive-elements.test.ts` sling face + filter (6), `reactive-table.test.ts` sling 300/301 strikes, rules-live soak + CCD-off RED |
| ELEM-03 | COVERED | `reactive-elements.test.ts` rollovers and inlanes (6), `reactive-table.test.ts` rollover 401 scores and lights |
| GAME-01 | COVERED | `game-session.test.ts` score cases, `hud.test.ts` (15), `game-e2e.test.ts` HUD walk-through |
| GAME-02 | COVERED | `game-session.test.ts` 3-ball FSM, `game-input.test.ts` start latch, `game-e2e.test.ts` full game + ported CR-01 cases, `plunger-controller.test.ts` rest gate / applyEdges |
| GAME-03 | COVERED | `tilt-meter.test.ts` (7), `game-session.test.ts` nudge/tilt + flipper relay, `game-input.test.ts` nudge latch, `flipper-controller.test.ts` enable gate, `game-e2e.test.ts` nudge + tilt-drops-bats, `game.determinism.test.ts` |
| (carry IN-01) | COVERED | `plunger-controller.test.ts` rest gate (3), `plunger-e2e.test.ts` falling-back release |

---

## Wave 0 Requirements

- [x] `src/game/tilt-meter.test.ts` — GAME-03
- [x] `src/input/game-input.test.ts` — GAME-02/03
- [x] `src/game/reactive-elements.test.ts` — ELEM-01/02/03 (spy world)
- [x] `src/game/reactive-table.test.ts` — ELEM-01/02/03 (real PlanckWorld, seeded)
- [x] `src/game/game-session.test.ts` — GAME-02/03 (port `ball-feed.test.ts` CR-01 cases)
- [x] `src/ui/hud.test.ts` — GAME-01
- [x] `src/sandbox/game-e2e.test.ts` — GAME-01..03
- [x] `src/sandbox/game.determinism.test.ts` — replay determinism
- [x] `src/harness/reactive-world.ts` + `reactive-table-soak.gate.test.ts` + `reactive-soak.test.ts` — containment with kicks
- [x] Extend `flipper-controller.test.ts` (`setEnabled`) and `plunger-controller.test.ts` (IN-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live score visible and legible while playing; HUD panels do not overlap the plunger meter | GAME-01 | Perceptual (legibility, placement) | `npm run dev`, play a ball, confirm the HUD score updates on every scoring hit and the ball/status/controls lines read clearly at any window size |
| Kick liveliness, nudge size, tilt fairness | ELEM-01/02, GAME-03 | Tuning is by feel (research A2–A5) | `npm run dev`, play a full 3-ball game, nudge to WARNING and to TILT |
| Lit rollovers read clearly on the table | ELEM-03 | Visual (light readability; drawing is not asserted) | `npm run dev`, roll through each top rollover, confirm it lights and the bank of three clears after the bonus |
| TILT drops both bats visibly; flippers dead before Enter and after GAME OVER; a held flipper rises on the next serve | GAME-03 | By-feel confirmation of behavior already pinned headlessly in `game-e2e.test.ts` | `npm run dev`, press Z before Enter, over-nudge while holding Z, hold through the drain, finish the game and press Z again |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-20

## Validation Audit 2026-11-20

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
