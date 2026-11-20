---
phase: "4"
slug: "reactive-elements-game-rules"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-20"
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
| **Estimated runtime** | ~2 s fast suite; soak gate adds its 600 s-simulated run |

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
| TBD (planner fills) | — | — | ELEM-01 | — | N/A | unit | `npx vitest run src/game/reactive-elements.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ELEM-01 | — | N/A | integration | `npx vitest run src/game/reactive-table.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ELEM-02 | — | N/A | unit + integration | `npx vitest run src/game/reactive-elements.test.ts src/game/reactive-table.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ELEM-03 | — | N/A | unit + integration | `npx vitest run src/game/reactive-elements.test.ts src/game/reactive-table.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ELEM-01/02 | — | N/A | soak gate | `npm run soak` (`src/harness/reactive-table-soak.gate.test.ts`) + `npx vitest run src/harness/reactive-soak.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | GAME-01 | — | N/A | unit | `npx vitest run src/ui/hud.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | GAME-02 | — | N/A | unit | `npx vitest run src/game/game-session.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | GAME-02 | — | N/A | e2e | `npx vitest run src/sandbox/game-e2e.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | GAME-03 | — | N/A | unit | `npx vitest run src/game/tilt-meter.test.ts src/input/game-input.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | GAME-03 | — | N/A | unit + e2e | `npx vitest run src/control/flipper-controller.test.ts src/game/game-session.test.ts src/sandbox/game-e2e.test.ts` | ⚠️ extend + ❌ W0 | ⬜ pending |
| TBD | — | — | GAME-01..03 | — | N/A | integration | `npx vitest run src/sandbox/game.determinism.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | (carry IN-01) | — | N/A | unit | `npx vitest run src/control/plunger-controller.test.ts` | ⚠️ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/game/tilt-meter.test.ts` — GAME-03
- [ ] `src/input/game-input.test.ts` — GAME-02/03
- [ ] `src/game/reactive-elements.test.ts` — ELEM-01/02/03 (spy world)
- [ ] `src/game/reactive-table.test.ts` — ELEM-01/02/03 (real PlanckWorld, seeded)
- [ ] `src/game/game-session.test.ts` — GAME-02/03 (port `ball-feed.test.ts` CR-01 cases)
- [ ] `src/ui/hud.test.ts` — GAME-01
- [ ] `src/sandbox/game-e2e.test.ts` — GAME-01..03
- [ ] `src/sandbox/game.determinism.test.ts` — replay determinism
- [ ] `src/harness/reactive-world.ts` + `reactive-table-soak.gate.test.ts` + `reactive-soak.test.ts` — containment with kicks
- [ ] Extend `flipper-controller.test.ts` (`setEnabled`) and `plunger-controller.test.ts` (IN-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live score visible and legible while playing | GAME-01 | Perceptual (legibility, placement) | `npm run dev`, play a ball, confirm the HUD score updates on every scoring hit |
| Kick liveliness, nudge size, tilt fairness | ELEM-01/02, GAME-03 | Tuning is by feel (research A3/A4) | `npm run dev`, play a full 3-ball game, nudge to warning and to tilt |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
