---
phase: "6"
slug: "juice-polish"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-22"
validated: "2026-11-23"
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

Seeded from `06-RESEARCH.md` § Validation Architecture; plan/wave columns filled from plan frontmatter after execution (all 14 plans complete). Every row re-run green on 2026-11-23 (22 files, 585 tests); full suite 1264/1264; `npm run soak` green in 06-14.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| PLSH-01 | 06-09, 06-14 | 5, 9 | PLSH-01 | — | N/A | unit | `npx vitest run src/render/shake.test.ts` | ✅ | ✅ green |
| PLSH-01 | 06-09, 06-14 | 5, 9 | PLSH-01 | — | N/A | unit (recorder) | `npx vitest run src/render/table-renderer.test.ts` | ✅ | ✅ green |
| PLSH-01 | 06-09, 06-14 | 5, 9 | PLSH-01 | — | N/A | unit | `npx vitest run src/sandbox/presentation-observer.test.ts src/game/game-session.test.ts` | ✅ | ✅ green |
| PLSH-02 | 06-12, 06-13, 06-14 | 7, 8, 9 | PLSH-02 | — | N/A | unit | `npx vitest run src/render/particles.test.ts` | ✅ | ✅ green |
| PLSH-02 | 06-12, 06-13, 06-14 | 7, 8, 9 | PLSH-02 | — | N/A | integration | `npx vitest run src/sandbox/cue-pipeline.test.ts` | ✅ | ✅ green |
| PLSH-03 | 06-02, 06-14 | 1, 9 | PLSH-03 | — | N/A | unit (recorder) | `npx vitest run src/render/static-layer.test.ts src/render/table-renderer.test.ts` | ✅ | ✅ green |
| PLSH-04 | 06-03, 06-14 | 2, 9 | PLSH-04 | — | N/A | unit | `npx vitest run src/render/lamps.test.ts` | ✅ | ✅ green |
| PLSH-05 | 06-01, 06-03, 06-04, 06-14 | 1, 2, 9 | PLSH-05 | — | N/A | unit | `npx vitest run src/game/skill-shot.test.ts` | ✅ | ✅ green |
| PLSH-05 | 06-01, 06-03, 06-04, 06-14 | 1, 2, 9 | PLSH-05 | — | N/A | integration | `npx vitest run src/sandbox/skill-shot-e2e.test.ts` | ✅ | ✅ green |
| PLSH-06 | 06-05, 06-06, 06-14 | 3, 4, 9 | PLSH-06 | — | N/A | unit | `npx vitest run src/game/game-session.test.ts src/game/bonus.test.ts` | ✅ | ✅ green |
| PLSH-06 | 06-05, 06-06, 06-14 | 3, 4, 9 | PLSH-06 | — | N/A | unit | `npx vitest run src/ui/hud.test.ts` | ✅ | ✅ green |
| PLSH-07 | 06-07, 06-08, 06-10, 06-14 | 4, 5, 6, 9 | PLSH-07 | — | N/A | unit | `npx vitest run src/game/ball-save.test.ts src/game/reactive-elements.test.ts` | ✅ | ✅ green |
| PLSH-07 | 06-07, 06-08, 06-10, 06-14 | 4, 5, 6, 9 | PLSH-07 | — | N/A | integration | `npx vitest run src/game/reactive-table.test.ts` | ✅ | ✅ green |
| PLSH-07 | 06-07, 06-08, 06-10, 06-14 | 4, 5, 6, 9 | PLSH-07 | — | N/A | soak | `npx vitest run src/harness/reactive-soak.test.ts` · `npm run soak` | ✅ | ✅ green |
| PLSH-08 | 06-11, 06-14 | 7, 9 | PLSH-08 | T-6-* | Corrupt/hostile `localStorage` values parse to 0; storage throws never crash the game | unit | `npx vitest run src/game/high-score.test.ts` | ✅ | ✅ green |
| PLSH-08 | 06-11, 06-14 | 7, 9 | PLSH-08 | — | N/A | unit | `npx vitest run src/ui/hud.test.ts` | ✅ | ✅ green |
| D-23 | 06-14 | 9 | D-23 | — | N/A | integration | `npx vitest run src/sandbox/game.determinism.test.ts src/sandbox/presentation.determinism.test.ts` | ✅ | ✅ green |
| D-24 | 06-02, 06-14 | 1, 9 | D-24 | — | N/A | static/unit | `npx vitest run src/render/asset-free.test.ts src/render/table-renderer.test.ts` | ✅ | ✅ green |
| D-25 | 06-04 | 2 | D-25 | — | N/A | unit | `npx vitest run src/audio/recipes.test.ts src/app/cue-queue.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/render/shake.test.ts` — PLSH-01
- [x] `src/render/particles.test.ts` — PLSH-02
- [x] `src/render/lamps.test.ts` — PLSH-04
- [x] `src/game/skill-shot.test.ts`, `src/sandbox/skill-shot-e2e.test.ts` — PLSH-05 + D-05 anchor
- [x] `src/game/bonus.test.ts` — PLSH-06 tally schedule
- [x] `src/game/ball-save.test.ts` — PLSH-07 rule
- [x] `src/game/high-score.test.ts` — PLSH-08
- [x] `game-session.test.ts` helper `finishBonus(rig)` + session options fixture (`ballSaveSteps: 0`) for legacy FSM cases
- [x] `ReactiveSoakWorld` option for always-armed `RuleHooks` (PLSH-07 soak stress)

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-23 — all PLSH-01..08 and D-23/24/25 rows automated and green; perceptual items remain manual-only (above) for `/gsd-verify-work 06`.

## Validation Audit 2026-11-23

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
