---
phase: 03
slug: table-plunger-event-bus
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-16
updated: 2026-11-19
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (node env, no DOM; synthetic KeyboardEvent-shaped objects) |
| **Config file** | `vitest.config.ts` (fast, excludes `**/*.gate.test.ts`); `vitest.gate.config.ts` (soak) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run soak` |
| **Estimated runtime** | quick ~10-30s; soak ~11s wall-clock (>=630s simulated) per gate |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted `npx vitest run <file>` (see map), then `npm test`.
- **After every plan wave:** Run `npm test` + `npm run soak` (the soak on the REAL geometry is the key regression catcher from Wave 2 on).
- **Before `/gsd:verify-work`:** Full suite green + both soak gates green.
- **Max feedback latency:** < 30s for quick; soak reserved for wave merges.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | TBL-01 | T-03-02 | spec-driven adapter rebuilds the proof box byte-identically; real-table outline contained | tracer (suite + soak) | `npx tsc --noEmit && npx eslint src/table src/physics src/sandbox && npx vitest run && npm run soak` | ❌ W0 (table-world.test.ts) | ⬜ pending |
| 03-01-02 | 01 | 1 | TBL-01 | T-03-01 | resolve() arcs within chord bound; rejects NaN/degenerate/dup-id/self-intersecting | unit (TDD) | `npx vitest run src/table/resolve.test.ts src/table/table-world.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | TBL-01 (SC#4) | T-03-03 | getElements() identity; draw reads the one resolve; sensors excluded from boundary | suite | `npx tsc --noEmit && npx eslint src && npx vitest run` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | TBL-01 | — | bumper cluster inert; a solver contact lands on bumper 202's rim (event identity is proven in 03-06-01) | tracer (integration) | `npx vitest run src/table/table-world.test.ts` | ✅ (from 03-01) | ⬜ pending |
| 03-02-02 | 02 | 2 | TBL-01 | T-03-04/05/06 | inventory, inverted-V, sweep-clear, seeded drain flow + containment | integration + human-check | `npx tsc --noEmit && npx eslint src/table src/physics && npx vitest run` | ✅ (from 03-01) | ⬜ pending |
| 03-03-01 | 03 | 3 | TBL-01 | T-03-07/08 | ball never escapes the REAL table; CCD-off RED; filter never vacuous | tracer (soak/gate) | `npx tsc --noEmit && npx eslint src/harness && npx vitest run src/harness && npm run soak` | ❌ W0 (table-soak*.ts) | ⬜ pending |
| 03-03-02 | 03 | 3 | TBL-01 | T-03-09 | five primitive proofs pinned to PROOF_BOX_SPEC, assertions unchanged | unit | `npx vitest run src/harness/stability.test.ts src/harness/flipper-feel.test.ts src/physics/planck-world.smoke.test.ts src/sim/loop.tabblur.test.ts src/sim/loop.determinism.test.ts` | ✅ (pin) | ⬜ pending |
| 03-04-01 | 04 | 4 | TBL-01 | T-03-18 | substep pinned; default world = TABLE_SPEC; e2e flipper test green on real flippers | tracer (suite + soak) | `npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` | ✅ | ⬜ pending |
| 03-04-02 | 04 | 4 | TBL-01 | T-03-19 | FlipperController narrowed to its interface slice; assertions unchanged | unit | `npx vitest run src/control/flipper-controller.test.ts src/sandbox/flipper-e2e.test.ts` | ✅ | ⬜ pending |
| 03-05-01 | 05 | 5 | LNCH-01 | T-03-10/13 | full charge launches out of the real chute; proportional; min-impulse floor | tracer (e2e) | `npx vitest run src/sandbox/plunger-e2e.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-02 | 05 | 5 | LNCH-01/02 | T-03-11/12 | latch repeat-safe, focus-loss cancel, zone guard, determinism, meter honesty | unit + e2e (TDD) | `npx vitest run src/input/plunger-input.test.ts src/control/plunger-controller.test.ts src/sandbox/plunger-e2e.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-03 | 05 | 5 | LNCH-02 | — | sandbox charge meter + pullback from getCharge() | suite + human-check | `npx tsc --noEmit && npx eslint src && npx vitest run` | ✅ | ⬜ pending |
| 03-06-01 | 06 | 6 | TBL-01 (SC#4) | T-03-15/16 | normalized identity reaches a router listener; one dispatch per fixed step | tracer (integration) | `npx vitest run src/physics/collision-event.test.ts` | ❌ W0 | ⬜ pending |
| 03-06-02 | 06 | 6 | TBL-01 (SC#4) | T-03-14/16 | sensors emit via begin-contact (impulse 0); router order + zero-copy | unit + integration (TDD) | `npx vitest run src/physics/sensor-event.test.ts src/app/collision-router.test.ts src/physics/collision-event.test.ts` | ❌ W0 | ⬜ pending |
| 03-06-03 | 06 | 6 | LNCH-01, TBL-01 | T-03-17 | wired launch + routing composition; one demo consumer | integration + human-check | `npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` | ❌ W0 (launch-and-route.test.ts) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/table/table-world.test.ts` — real-table containment, mount placement, one-resolve identity, inventory, inverted-V, sweep-clear, seeded drain flow, default world (TBL-01/SC#1/SC#4). [03-01, 03-02, 03-04]
- [ ] `src/table/resolve.test.ts` — chord-error bound, loop closure, unique ids, self-intersection and vertex-spacing rejection, finite/degenerate rejection, purity (TBL-01/SC#4). [03-01]
- [ ] `src/harness/table-soak.test.ts` + `src/harness/table-soak.gate.test.ts` — swept-containment soak on the REAL table (bounded green, CCD-off RED, replay, filter exhaustion; ≥600 s gate). [03-03]
- [ ] `src/input/plunger-input.test.ts` — Space edge latch, `event.repeat` suppression, focus-loss cancel (copy `flipper-input.test.ts`). [03-05]
- [ ] `src/control/plunger-controller.test.ts` — charge FSM, monotonic charge->impulse, `getCharge()` clamp/reset, zone guard, determinism, meter honesty (spy world). [03-05]
- [ ] `src/sandbox/plunger-e2e.test.ts` — keyboard->charge->impulse->real-chute launch, no mocks (copy `flipper-e2e.test.ts`). [03-05]
- [ ] `src/physics/collision-event.test.ts` — normalized identity through the router, both fixture orders, one dispatch per step. [03-06]
- [ ] `src/physics/sensor-event.test.ts` — begin-contact sensor path (rollover, drain), impulse 0, not a barrier. [03-06]
- [ ] `src/app/collision-router.test.ts` — fixed-order fan-out, one-batch-per-step (FixedStepLoop + onPostStep), one-way, zero-copy reuse. [03-06]
- [ ] `src/sandbox/launch-and-route.test.ts` — wired composition: launch + one routed batch/step to a stub consumer. [03-06]
- [ ] **Proof isolation instead of re-anchoring** — Phase-1/2 primitive proofs (`stability`, `flipper-feel`, `planck-world.smoke`, `loop.tabblur`, `loop.determinism`, `substep`) pass `PROOF_BOX_SPEC` explicitly, with assertions unchanged; `soak.ts` defaults to `PROOF_BOX_SPEC` so the proof-box and FLIP-04 gates replay byte-identically; the swept invariant in `containment.ts` stays untouched. The real table gets its own gate (above). [03-03 pins five proofs and the soak default; 03-04 pins `substep` and then flips the adapter default]

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Layout reads clearly and plays with good flow | TBL-01 / SC#1 | Original-layout flow and readability is a by-eye judgment (D-03) — no verifiable constant | 03-02 Task 2 human-check: `npm run dev`, confirm chute/bumper cluster/lanes/orbits/inlanes/slingshots/drain funnel + inverted-V flippers read clearly and the ball flows well by eye |
| Charge meter is READABLE before release | LNCH-02 / SC#3 | Visual readability of the throwaway meter is a perception judgment | 03-05 Task 3 human-check: hold Space, confirm the meter fills smoothly and longer holds visibly read as more charge |
| Live contacts reach the bus in the browser | TBL-01 / SC#4 | End-to-end console confirmation in a real browser | 03-06 Task 3 human-check: rollover, lane and drain lines appear alongside solid contacts |

*The DATA behind both (resolve identity, getCharge clamp/monotonic) is automated; only the visual read is manual.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify; by-eye checks ride as `<human-check>` blocks on automated tasks (end-of-phase human-verify mode)
- [x] Sampling continuity: every task carries an automated verify (no manual-only task in the replanned set, 2026-11-19)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (quick suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-16
