---
phase: "5"
slug: "rendering-audio"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
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
| 05-01-T1 | 05-01 | 1 | AUD-01 | T-05-01, T-05-03 | Registered bumper kick -> cue -> master-routed voice; empty, clamped and suspended edges create nothing | integration (real table + fake ctx) | `npx vitest run src/sandbox/cue-pipeline.test.ts` | ✅ | ✅ green |
| 05-01-T2 | 05-01 | 1 | AUD-01 | T-05-04, T-05-05 | No AudioContext before a trusted gesture; untrusted and Escape create nothing (gesture cases g-i) | integration (real table + fake ctx) | `npx vitest run src/sandbox/cue-pipeline.test.ts` | ✅ | ✅ green |
| 05-08-T1 | 05-08 | 1 | RND-02 | T-05-09 | Drawn bat angle advances every 144 Hz frame of a swing | integration (real table) | `npx vitest run src/sim/loop.flippers.test.ts` | ✅ | ✅ green |
| 05-08-T2 | 05-08 | 1 | RND-02 | T-05-09 | Snapshots read-only; determinism unchanged | unit | `npx vitest run src/sim/loop.flippers.test.ts src/render/interpolate.test.ts` | ✅ | ✅ green |
| 05-08-T3 | 05-08 | 1 | RND-01 | T-05-22 | No image, audio or font assets in `src/` or `index.html` | unit (fs scan) | `npx vitest run src/render/asset-free.test.ts` | ✅ | ✅ green |
| 05-02-T1 | 05-02 | 2 | RND-02 | T-05-06 | Backing store sized from the display | unit | `npx vitest run src/render/view-transform.test.ts` | ✅ | ✅ green |
| 05-02-T2 | 05-02 | 2 | RND-01 | — | N/A | unit (recording ctx) | `npx vitest run src/render/static-layer.test.ts` | ✅ | ✅ green |
| 05-02-T2 | 05-02 | 2 | RND-02 | T-05-08 | N/A | unit (recording ctx) | `npx vitest run src/render/table-renderer.test.ts` | ✅ | ✅ green |
| 05-07-T1 | 05-07 | 2 | AUD-01 | T-05-02 | A throwing presentation sink leaves the real-table sim bit-identical | integration (real table) | `npx vitest run src/sandbox/cue-pipeline.test.ts` | ✅ | ✅ green |
| 05-07-T2 | 05-07 | 2 | RND-03, AUD-01 | T-05-01, T-05-02, T-05-21 | Feedback fires only for counted hits, after award; ring never grows | unit | `npx vitest run src/game/reactive-elements.test.ts src/app/cue-queue.test.ts` | ✅ | ✅ green |
| 05-07-T3 | 05-07 | 2 | AUD-01 | T-05-04, T-05-05 | Unlock rules; context creation failure logs once; A5 type guard | unit | `npx vitest run src/audio/audio-unlock.test.ts` | ✅ | ✅ green |
| 05-03-T1 | 05-03 | 2 | AUD-01 | — | N/A | unit | `npx vitest run src/audio/mapping.test.ts src/audio/audio-engine.test.ts` | ✅ | ✅ green |
| 05-03-T2 | 05-03 | 2 | AUD-01 | T-05-11, T-05-12 | Every node stopped and disconnected (no leak) | unit (fake ctx) | `npx vitest run src/audio/envelope.test.ts src/audio/recipes.test.ts` | ✅ | ✅ green |
| 05-03-T3 | 05-03 | 2 | AUD-01 | T-05-10 | Voice caps bound concurrent nodes under spam | unit | `npx vitest run src/audio/voice-pool.test.ts src/audio/audio-engine.test.ts` | ✅ | ✅ green |
| 05-04-T1 | 05-04 | 3 | RND-03 | T-05-14 | N/A | unit | `npx vitest run src/render/flash.test.ts` | ✅ | ✅ green |
| 05-04-T2 | 05-04 | 3 | RND-03 | T-05-13, T-05-15 | Walls flash, never cue (D-03) | unit | `npx vitest run src/render/contact-flash.test.ts src/render/table-renderer.test.ts` | ✅ | ✅ green |
| 05-05-T1 | 05-05 | 4 | AUD-01 | T-05-16, T-05-17 | N/A | unit | `npx vitest run src/sandbox/presentation-observer.test.ts src/control/plunger-controller.test.ts` | ✅ | ✅ green |
| 05-05-T2 | 05-05 | 4 | AUD-01 | T-05-16 | Counters change no behavior | unit | `npx vitest run src/control/flipper-controller.test.ts src/sandbox/presentation-observer.test.ts` | ✅ | ✅ green |
| 05-06-T1 | 05-06 | 5 | AUD-01 | T-05-19 | KeyM never swallows another control | unit | `npx vitest run src/input/game-input.test.ts src/ui/key-labels.test.ts` | ✅ | ✅ green |
| 05-06-T2 | 05-06 | 5 | RND-02 | T-05-18 | Presentation layer is read-only: sim bit-identical with it attached | integration | `npx vitest run src/sandbox/presentation.determinism.test.ts` | ✅ | ✅ green |
| 05-06-T3 | 05-06 | 5 | RND-01 | T-05-20 | HUD restyle is CSS-only, textContent-only | phase gate | `npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak && npm run build` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest.config.ts` — `testTimeout: 30000` (05-01, wave 1; baseline has 3 timeouts). The pending load-flake todo is closed by 05-07 after two back-to-back clean full runs
- [x] `src/render/test/recording-context.ts` — Proxy-based `CanvasRenderingContext2D` recorder (method calls + property sets) (05-02, wave 2)
- [x] `src/audio/test/fake-audio-context.ts` — implements `AudioContextLike`; records nodes, param automation, start/stop, connections; manual `fireEnded()` (05-01, wave 1)
- [x] `src/render/asset-free.test.ts` — the RND-01 grep gate (05-08, wave 1)
- [x] A5 proof that the real `AudioContext` is assignable to `AudioContextLike` — proven at the composition root by main.ts's cast-free factory (05-01), guarded by a type-level case in `src/audio/audio-unlock.test.ts` (05-07)

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-21 (validate-phase audit: 21/21 tasks COVERED, full suite 52 files / 738 tests green)

## Validation Audit 2026-11-21

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
