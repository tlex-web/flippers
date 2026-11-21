---
phase: "5"
slug: "rendering-audio"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-21"
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10, `environment: "node"` |
| **Config file** | `vitest.config.ts` (excludes `**/*.gate.test.ts`); `vitest.gate.config.ts` for soak gates |
| **Quick run command** | `npx vitest run src/render src/audio src/app/cue-queue.test.ts && npm run typecheck` |
| **Full suite command** | `npm run typecheck && npm run lint && npm test` |
| **Phase gate extra** | `npm run soak && npm run build` (ReactiveElements is touched, so the reactive soak gates are re-proven) |
| **Estimated runtime** | ~90 seconds full suite (baseline: 518 passed, 3 load timeouts; Wave 0 raises `testTimeout`) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run `npm run typecheck && npm run lint && npm test`
- **Before `/gsd-verify-work`:** Full suite green, plus `npm run soak` and `npm run build`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

Seeded from 05-RESEARCH.md § Validation Architecture. Task IDs are filled in by the planner.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | RND-01 | — | No image, audio or font assets in `src/` or `index.html` | unit (fs grep) | `npx vitest run src/render/asset-free.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RND-01 | — | N/A | unit (recording ctx) | `npx vitest run src/render/static-layer.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RND-02 | — | N/A | unit | `npx vitest run src/render/view-transform.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RND-02 | — | N/A | unit | `npx vitest run src/sim/loop.flippers.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RND-02 | — | N/A | unit | `npx vitest run src/render/interpolate.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RND-02 | — | N/A | unit (recording ctx) | `npx vitest run src/render/table-renderer.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RND-02 | — | Presentation layer is read-only: sim bit-identical with it attached | integration | `npx vitest run src/sandbox/presentation.determinism.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RND-03 | — | N/A | unit | `npx vitest run src/render/flash.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RND-03 | — | Feedback fires only for counted hits | unit | `npx vitest run src/game/reactive-elements.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | RND-03 | — | N/A | unit | `npx vitest run src/render/contact-flash.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUD-01 | — | N/A | unit | `npx vitest run src/audio/envelope.test.ts src/audio/mapping.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUD-01 | — | Every node stopped and disconnected (no leak) | unit (fake ctx) | `npx vitest run src/audio/audio-engine.test.ts src/audio/recipes.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUD-01 | — | Voice caps bound concurrent nodes under spam | unit | `npx vitest run src/audio/voice-pool.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUD-01 | — | No AudioContext before a trusted gesture | unit | `npx vitest run src/audio/audio-unlock.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUD-01 | — | N/A | unit | `npx vitest run src/sandbox/presentation-observer.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — `testTimeout: 30000` (closes the pending load-flake todo; baseline has 3 timeouts)
- [ ] `src/render/test/recording-context.ts` — Proxy-based `CanvasRenderingContext2D` recorder (method calls + property sets)
- [ ] `src/audio/test/fake-audio-context.ts` — implements `AudioContextLike`; records nodes, param automation, start/stop, connections; manual `fireEnded()`
- [ ] `src/render/asset-free.test.ts` — the RND-01 grep gate
- [ ] Typecheck fixture proving the real `AudioContext` is assignable to `AudioContextLike` (research assumption A5)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Holds 60fps at 60 Hz; ball and bats smooth at 144 Hz | RND-02 | Real frame pacing and display refresh can't be measured headless | Play 2 min in Chrome; diag FPS readout steady at 60; DevTools Performance trace shows no long frames; repeat on a 120/144 Hz display (or DevTools FPS meter if none) |
| Table reads as a polished, procedural space-themed table | RND-01 | Visual quality is perceptual | Inspect playfield, lanes, ball, flippers, HUD at 1x and HiDPI; nothing blurry; no image assets loaded (Network tab) |
| Every element flash is visible and confirms the hit | RND-03 | Perceptual timing | Hit each bumper, sling, rollover, wall and flipper; each flashes and decays cleanly |
| Sounds are distinct, enveloped (no clicks), audible on the first Enter, no distortion under bumper spam | AUD-01 | Audio quality is perceptual | Listening pass with headphones: each cue (bumper, flipper up/down, sling, drain, launch, tilt, rollover) distinct; strength varies with impact; first Enter press makes sound |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
