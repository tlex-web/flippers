---
phase: "4"
slug: "reactive-elements-game-rules"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-20"
updated: "2026-11-21"
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
| **Estimated runtime** | ~5-11 s fast suite (34 files, 482 tests after the 04-12/04-13 gap closure; heavy simulation tests can hit the 5 s default timeout under host CPU load — pre-existing, tracked as a pending todo); ~4 s at 33 files, 416 tests after the 04-11 gap closure; 392 after 04-09/04-10; 32 files, 338 tests at 04-08); soak gate ~5 s wall for 4 gate files (>= 630 s simulated) |

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
| 04-09-01 | 09 | G1 ² | FLIP-01, GAME-03 | T-04-22/23 | release, press and TILT move the bat within 2 fixed steps after any hold (10/60/200) or rest (30/240) on every binding; the reset uses only the public `RevoluteJoint.enableLimit` toggle (no internal impulse field written); indexed lookup, no hot-path allocation; FLIP-02 tip-vs-base on OPEN_PROOF_BOX inside the unchanged 35% band | tracer (e2e + adapter unit) | `npx vitest run src/sandbox/flipper-e2e.test.ts src/physics/flipper-response.test.ts src/harness/flipper-feel.test.ts && npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` | ✅ | ✅ green |
| 04-09-02 | 09 | G1 ² | FLIP-01 | T-04-21 | the FSM enters resting (motor 0) only after 2 settled updates within REST_ANGLE_TOL of `restLimitAngle`; a bat drifting short of rest keeps motor -1 (both mirrors); 0 of 192 quick taps stuck on the six bindings, with the resting invariant checked on every step | unit (TDD) + e2e | `npx vitest run src/control/flipper-controller.test.ts src/sandbox/flipper-e2e.test.ts src/sandbox/game-e2e.test.ts src/sandbox/game.determinism.test.ts && npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` | ✅ | ✅ green |
| 04-10-01 | 10 | G1 ² | GAME-01 | T-04-24/25/26 | the FPS / PHYS / KE readout is DOM text written through `textContent` only when one of its three throttled numbers changes; the canvas paints no text; `#hud-diag` is aria-hidden | tracer (unit) + build | `npx vitest run src/ui/hud.test.ts && npx tsc --noEmit && npx eslint src && npx vitest run && npm run build` | ✅ | ✅ green |
| 04-10-02 | 10 | G1 ² | GAME-01 | — | the controls hint is a five-row `dl` with 11 `kbd` key caps, Slash as its own cap, no stray slash or middle-dot separators, each row nowrap | structural grep + build + human-check | `npm run build && npx vitest run` (plus the plan's index.html structure greps: 5 dt, 11 kbd, `<kbd>/</kbd>`, 0 stray separators) | ✅ | ✅ green |
| 04-11-01 | 11 | G2 ³ | FLIP-01 | T-04-27 | a window focus regain clears the held set: a keydown whose keyup an OS dialog took (focus-ordering race) lets the bat fall within 2 fixed steps, and the same key raises it again afterwards; blur/visibility clears unchanged | tracer (unit + keyboard-to-Planck e2e) | `npx vitest run src/input/flipper-input.test.ts src/sandbox/flipper-e2e.test.ts && npx tsc --noEmit && npx eslint src && npx vitest run` | ✅ | ✅ green |
| 04-11-02 | 11 | G2 ³ | FLIP-01, GAME-02 | T-04-27/28/30 | a non-Shift key event with `shiftKey === false` drops a stale ShiftLeft/ShiftRight (Z, arrows, Space, Enter); Shift-key events and events without the field never reconcile (both-Shift cradle safe); net per-side edges, so Z over a stale Shift latches nothing; the serve no longer re-raises a stale bat; preventDefault scope unchanged | unit (TDD) + e2e + game e2e | `npx vitest run src/input/flipper-input.test.ts src/sandbox/flipper-e2e.test.ts src/sandbox/game-e2e.test.ts src/sandbox/game.determinism.test.ts && npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

¹ The plan's original verify also named `src/sandbox/ball-feed.test.ts`, which 04-05 deleted after porting its CR-01 cases into `src/sandbox/game-e2e.test.ts`; the command above is the current equivalent.

² G1 = gap-closure run, wave 1 (04-09 closes UAT gap G-04-10, 04-10 closes G-04-6). Both plans ran in parallel after 04-08.

³ G2 = second gap-closure run, wave 1 (04-11 closes UAT gap G-04-11, a lost Shift keyup pinning a bat).

⁴ G3 = third gap-closure run (04-12 wave 1, 04-13 wave 2) closing UAT gap G-04-17: 04-12 heals the Windows both-Shift merge and WR-01, 04-13 adds layout-correct key caps and the Windows reliability note.

### Requirement Coverage

| Requirement | Status | Automated evidence |
|-------------|--------|--------------------|
| ELEM-01 | COVERED | `reactive-elements.test.ts` bumper rule (10), `reactive-table.test.ts` bumper tracer + energy bound, `reactive-soak.test.ts` (3), `reactive-table-soak.gate.test.ts` |
| ELEM-02 | COVERED | `reactive-elements.test.ts` sling face + filter (6), `reactive-table.test.ts` sling 300/301 strikes, rules-live soak + CCD-off RED |
| ELEM-03 | COVERED | `reactive-elements.test.ts` rollovers and inlanes (6), `reactive-table.test.ts` rollover 401 scores and lights |
| GAME-01 | COVERED | `game-session.test.ts` score cases, `hud.test.ts` (34, incl. `diagText` and `DiagView` write-on-change, G-04-6), `game-e2e.test.ts` HUD walk-through |
| GAME-02 | COVERED | `game-session.test.ts` 3-ball FSM, `game-input.test.ts` start latch, `game-e2e.test.ts` full game + ported CR-01 cases + stale-Shift serve case (G-04-11), `plunger-controller.test.ts` rest gate / applyEdges |
| GAME-03 | COVERED | `tilt-meter.test.ts` (7), `game-session.test.ts` nudge/tilt + flipper relay, `game-input.test.ts` nudge latch, `flipper-controller.test.ts` enable gate, `game-e2e.test.ts` nudge + tilt-drops-bats, `game.determinism.test.ts`, `flipper-e2e.test.ts` TILT drop within 2 steps (G-04-10) |
| (carry IN-01) | COVERED | `plunger-controller.test.ts` rest gate (3), `plunger-e2e.test.ts` falling-back release |
| (carry FLIP-01, G-04-10) | COVERED | `flipper-response.test.ts` adapter pin (TABLE_SPEC + PROOF_BOX_SPEC, both ids: release, press, held cradle), `flipper-e2e.test.ts` G-04-10 block (release/press latency, 192-tap sweep with per-step resting invariant), `flipper-controller.test.ts` rest-limit guard (4), `flipper-feel.test.ts` FLIP-02 on OPEN_PROOF_BOX |
| (carry FLIP-01, G-04-11) | COVERED | `flipper-input.test.ts` "focus regain (G-04-11)" block + stale-Shift B1-B7, `flipper-e2e.test.ts` "a lost keyup never strands a bat (G-04-11)" block (focus-regain release per binding, stale-Shift release per side) + both-Shift cradle guard, `game-e2e.test.ts` serve does not re-raise a stale bat |
| (carry FLIP-01, G-04-17) | COVERED | `flipper-input.test.ts` "Windows both-Shift merge (G-04-17)" block (unit matrix, non-Windows guard, `isWindowsPlatform` 8 cases) + "same-window release and press (WR-01)" W1-W6, `flipper-e2e.test.ts` "Windows both-Shift hold (G-04-17)" (orders A, B, D, D', E, F, tap, cradle) + WR-01 block, `key-labels.test.ts` (27: layout relabel, API-absent fallback, one-code-point guard, markup data-code and note) |

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
- [x] Gap closure: `src/physics/flipper-response.test.ts` (new) — FLIP-01 adapter pin for the planck@1.5.0 joint reset (04-09)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live score visible and legible while playing; HUD panels do not overlap the plunger meter | GAME-01 | Perceptual (legibility, placement) | `npm run dev`, play a ball, confirm the HUD score updates on every scoring hit and the ball/status/controls lines read clearly at any window size |
| Diagnostics readout and controls list legible (G-04-6) | GAME-01 | Perceptual layout (UAT test 6); structure is machine-checked | 1280x684 window at 150% scaling: the bottom-left FPS / PHYS / KE line reads clearly; the controls list shows five non-wrapping rows, Slash is visibly a key cap; neither panel overlaps the table or plunger meter |
| Flippers feel instant after long cradles; no tap leaves a bat raised; TILT drop has no pause (G-04-10) | FLIP-01, GAME-03 | Core-value feel verdict (UAT tests 10 and 5); latencies are machine-proven | `npm run dev`, Enter; on all six bindings make quick taps of varied length, hold a long cradle and release, over-nudge once while holding a bat up |
| Each bat answers its key on all six bindings after the Windows Sticky Keys prompt (G-04-11) | FLIP-01, GAME-02 | The real OS Sticky Keys dialog cannot be raised by synthetic events (UAT test 11); the self-heal logic is machine-proven. Residual T-04-29 (Sticky Keys turned ON) is accepted | On Windows, `npm run dev`, Enter; tap Left Shift five times to raise the Sticky Keys prompt, dismiss it, then confirm Z and Left Arrow raise and drop the left bat, no bat stays raised, and the next serve leaves both bats down |
| Both Shift keys work in every both-Shift order on the real Windows keyboard (G-04-17, UAT 17) | FLIP-01, GAME-02 | The heal is proven on captured SendInput sequences; whether physical keys produce identical sequences needs the user's real keyboard. Residual T-04-35 is accepted | On Windows with Sticky Keys OFF, `npm run dev`, Enter; try all four both-Shift orders, single Shift taps, and Left Shift held while tapping the KeyZ/KeyX keys. Both bats rise while both Shifts are held and drop on the second release; accepted residual: the first-released bat stays up until the other Shift is released |
| Key caps and Windows note match the player's keyboard (G-04-17, UAT 18) | FLIP-01, GAME-01 | Perceptual layout plus a real Keyboard Map API on the user's German QWERTZ layout | Chrome, German keyboard, 1280x684 at 150%: rows read Y ← Left Shift and - → Right Shift; the note reads "On Windows, ← → Y - are the most reliable flipper keys. Shift can stick."; the panel is no wider than before; Y and - raise the bats; optionally Firefox shows the arrow-only note |
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

## Validation Audit 2026-11-20

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Tasks audited (gap closure 04-09/04-10) | 4 |

## Validation Audit 2026-11-20

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Tasks audited (gap closure 04-11) | 2 |

## Validation Audit 2026-11-21

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Tasks audited (gap closure 04-12/04-13) | 5 |
