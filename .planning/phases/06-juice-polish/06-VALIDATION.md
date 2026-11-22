---
phase: "6"
slug: "juice-polish"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-22"
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (node environment) |
| **Config file** | `vitest.config.ts` (excludes `**/*.gate.test.ts`), `vitest.gate.config.ts` (gates) |
| **Quick run command** | `npx vitest run <touched test files> && npx tsc --noEmit` |
| **Full suite command** | `npm run typecheck && npm run lint && npm test` |
| **Estimated runtime** | ~20 seconds (full suite); soak gate ≥ 600 s simulated |

---

## Sampling Rate

- **After every task commit:** Run the touched files' `npx vitest run <files>` plus `npx tsc --noEmit`
- **After every plan wave:** Run `npm run typecheck && npm run lint && npm test`
- **Before `/gsd-verify-work`:** Full suite + `npm run soak` + `npm run build` must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Seeded from `06-RESEARCH.md` § Validation Architecture; task IDs are filled in once plans exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PLSH-01 | — | N/A | unit | `npx vitest run src/render/shake.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLSH-01 | — | N/A | unit (recorder) | `npx vitest run src/render/table-renderer.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PLSH-01 | — | N/A | unit | `npx vitest run src/sandbox/presentation-observer.test.ts src/game/game-session.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PLSH-02 | — | N/A | unit | `npx vitest run src/render/particles.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLSH-02 | — | N/A | integration | `npx vitest run src/sandbox/cue-pipeline.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PLSH-03 | — | N/A | unit (recorder) | `npx vitest run src/render/static-layer.test.ts src/render/table-renderer.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PLSH-04 | — | N/A | unit | `npx vitest run src/render/lamps.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLSH-05 | — | N/A | unit | `npx vitest run src/game/skill-shot.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLSH-05 | — | N/A | integration | `npx vitest run src/sandbox/skill-shot-e2e.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLSH-06 | — | N/A | unit | `npx vitest run src/game/game-session.test.ts src/game/bonus.test.ts` | ✅ / ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLSH-06 | — | N/A | unit | `npx vitest run src/ui/hud.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PLSH-07 | — | N/A | unit | `npx vitest run src/game/ball-save.test.ts src/game/reactive-elements.test.ts` | ❌ W0 / ✅ | ⬜ pending |
| TBD | TBD | TBD | PLSH-07 | — | N/A | integration | `npx vitest run src/game/reactive-table.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PLSH-07 | — | N/A | soak | `npx vitest run src/harness/reactive-soak.test.ts` · `npm run soak` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PLSH-08 | T-6-* | Corrupt/hostile `localStorage` values parse to 0; storage throws never crash the game | unit | `npx vitest run src/game/high-score.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLSH-08 | — | N/A | unit | `npx vitest run src/ui/hud.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | D-23 | — | N/A | integration | `npx vitest run src/sandbox/game.determinism.test.ts src/sandbox/presentation.determinism.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | D-24 | — | N/A | static/unit | `npx vitest run src/render/asset-free.test.ts src/render/table-renderer.test.ts` | ✅ | ⬜ pending |
| TBD | TBD | TBD | D-25 | — | N/A | unit | `npx vitest run src/audio/recipes.test.ts src/app/cue-queue.test.ts` | ✅ re-pin | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/render/shake.test.ts` — PLSH-01
- [ ] `src/render/particles.test.ts` — PLSH-02
- [ ] `src/render/lamps.test.ts` — PLSH-04
- [ ] `src/game/skill-shot.test.ts`, `src/sandbox/skill-shot-e2e.test.ts` — PLSH-05 + D-05 anchor
- [ ] `src/game/bonus.test.ts` — PLSH-06 tally schedule
- [ ] `src/game/ball-save.test.ts` — PLSH-07 rule
- [ ] `src/game/high-score.test.ts` — PLSH-08
- [ ] `game-session.test.ts` helper `finishBonus(rig)` + session options fixture (`ballSaveSteps: 0`) for legacy FSM cases
- [ ] `ReactiveSoakWorld` option for always-armed `RuleHooks` (PLSH-07 soak stress)

Framework install: none (Vitest present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Shake reads as subtle, not nauseating | PLSH-01 | Perceptual | Play a ball; hit bumpers and nudge; shake should be felt, not distracting |
| Lit vs unlit lamps read distinctly; depth/vignette reads 2.5D | PLSH-03, PLSH-04 | Perceptual | Compare attract, play and tilt states against UI-SPEC |
| Skill-shot band feel | PLSH-05 | Perceptual (D-02) | Attempt skill shots at several charge levels |
| Post flourish reads as a save | PLSH-07 | Perceptual | Let a ball drain within save window; watch post flash and kick |
| 60 fps held at 144 Hz display | All | Hardware-dependent | DevTools Performance during busy play |
| High score survives reload | PLSH-08 | Real browser storage | Finish a game, reload, confirm `HIGH SCORE` shows |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
