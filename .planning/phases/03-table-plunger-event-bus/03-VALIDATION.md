---
phase: 03
slug: table-plunger-event-bus
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-16
updated: 2026-07-16
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
| 03-01-01 | 01 | 1 | TBL-01 | T-03-01 | resolve() rejects NaN/Infinity/degenerate descriptors | unit (RED) | `npx vitest run src/table/resolve.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | TBL-01 | T-03-01 | spec is engine-agnostic, finite, scale-anchored | static | `npx tsc --noEmit && npx eslint src/table/spec.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | TBL-01 | T-03-01 | one-resolve identity + chord-error bound + finite guard | unit (GREEN) | `npx vitest run src/table/resolve.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | TBL-01 | T-03-04 | fixtures+segments from one resolve; feel constants untouched | integration | `npx tsc --noEmit && npx vitest run src/physics/planck-world.smoke.test.ts` | ✅ (smoke) | ⬜ pending |
| 03-02-02 | 02 | 2 | TBL-01 | T-03-04 | rig proofs re-anchored, feel byte-identical | unit | `npx vitest run src/harness/stability.test.ts src/harness/flipper-feel.test.ts src/harness/flipper-tunnel.test.ts src/sandbox/flipper-e2e.test.ts` | ✅ (re-anchor) | ⬜ pending |
| 03-02-03 | 02 | 2 | TBL-01 | T-03-03 | ball never escapes the real closed table | soak/gate | `npm run soak` | ✅ (re-point) | ⬜ pending |
| 03-03-01 | 03 | 3 | LNCH-01/02 | T-03-05/06/08 | latch/charge/launch pinned (RED) | unit+e2e (RED) | `npx vitest run src/input/plunger-input.test.ts src/control/plunger-controller.test.ts src/sandbox/plunger-e2e.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 3 | LNCH-01 | T-03-07 | applyImpulse no-ops unknown id; impulse clamped | static | `npx tsc --noEmit && npx eslint src/physics` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 3 | LNCH-01/02 | T-03-06/08 | monotonic+clamped+deterministic charge; ball climbs | unit+e2e (GREEN) | `npx vitest run src/input/plunger-input.test.ts src/control/plunger-controller.test.ts src/sandbox/plunger-e2e.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 4 | TBL-01 (SC#4) | T-03-09/10/11 | fan-out order, normalization, sensor emit pinned (RED) | unit+integration (RED) | `npx vitest run src/app/collision-router.test.ts src/physics/collision-event.test.ts src/physics/sensor-event.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 4 | TBL-01 (SC#4) | T-03-11 | normalized identity + sensor begin-contact (impulse 0) | integration (GREEN) | `npx vitest run src/physics/collision-event.test.ts src/physics/sensor-event.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-03 | 04 | 4 | TBL-01 (SC#4) | T-03-09/10 | one batch/step, fixed order, zero-copy reuse | unit (GREEN) | `npx vitest run src/app/collision-router.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 5 | LNCH-01, TBL-01 | T-03-12/13 | wired launch + one routed batch/step to stub consumer | integration | `npx vitest run src/sandbox/launch-and-route.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-02 | 05 | 5 | LNCH-02 | — | table drawn from getElements(); charge meter from getCharge() | static+suite | `npx tsc --noEmit && npx vitest run` | ❌ W0 | ⬜ pending |
| 03-05-03 | 05 | 5 | LNCH-02, TBL-01 (SC#1) | — | layout fidelity + readable meter + routed lane events | manual | human-verify checkpoint (see plan) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/table/resolve.test.ts` — chord-error bound, closed-loop closure, unique ids, one-resolve identity, finite/degenerate rejection (TBL-01/SC#4). [03-01]
- [ ] `src/input/plunger-input.test.ts` — Space edge latch, `event.repeat` suppression, blur clear (copy `flipper-input.test.ts`). [03-03]
- [ ] `src/control/plunger-controller.test.ts` — charge FSM, monotonic charge->impulse, `getCharge()` clamp/reset, determinism (spy world). [03-03]
- [ ] `src/sandbox/plunger-e2e.test.ts` — keyboard->charge->impulse->launch, no mocks (copy `flipper-e2e.test.ts`). [03-03]
- [ ] `src/app/collision-router.test.ts` — fixed-order fan-out, one-batch-per-step (FixedStepLoop + onPostStep), one-way, zero-copy reuse. [03-04]
- [ ] `src/physics/collision-event.test.ts` — normalization (ballId regardless of fixture A/B order). [03-04]
- [ ] `src/physics/sensor-event.test.ts` — begin-contact sensor path, impulse 0. [03-04]
- [ ] `src/sandbox/launch-and-route.test.ts` — wired composition: launch + one routed batch/step to a stub consumer. [03-05]
- [ ] **Re-point the existing soak/containment at real geometry** — `soak.ts`/`containment.ts` read `getBoundarySegments()` (kept as shim); the swept-invariant code stays UNTOUCHED; verify green on the real table. [03-02]
- [ ] **Re-anchor rig-coupled tests** — `stability.test.ts`, `flipper-feel.test.ts`, `flipper-tunnel.test.ts`, `flipper-e2e.test.ts` to spec mounts + real bounds without changing any feel constant (FLIP-04 calibration byte-identical). [03-02]

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Layout reads as Space Cadet in original relative positions | TBL-01 / SC#1 | Anchored-approximate fidelity is a by-eye judgment (D-03) — no verifiable constant | 03-05 Task 3 checkpoint: `npm run dev`, confirm chute/bumper cluster/lanes/walls/drain funnel + inverted-V flippers by eye |
| Charge meter is READABLE before release | LNCH-02 / SC#3 | Visual readability of the throwaway meter is a perception judgment | 03-05 Task 3 checkpoint: hold Space, confirm the meter fills smoothly and longer holds visibly read as more charge |

*The DATA behind both (resolve identity, getCharge clamp/monotonic) is automated; only the visual read is manual.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are a documented manual checkpoint (03-05-03)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (03-05-03 manual is preceded by two automated tasks)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (quick suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-16
