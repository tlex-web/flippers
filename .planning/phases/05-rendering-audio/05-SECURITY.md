---
phase: "5"
slug: "rendering-audio"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-21"
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| rules listener -> feedback hook -> cue ring | In-process step path; the only way rules facts reach the presentation layer | Scalars (kind, id, strength); no world handle |
| cue ring -> Web Audio graph | Render frame; node creation happens only here | Cue records; no user data |
| browser input events -> AudioUnlock | Untrusted page events could try to start audio | Event `isTrusted`, type, key |
| URL query string -> renderer selection | `?debug` is page input | One exact-match flag; not otherwise read |
| sim state (read-only getters) -> canvas / loop snapshots | Renderer and interpolation read world and loop state every frame | Positions, angles; read-only |
| keyboard -> GameInput -> mute | A new bound key on the shared window listeners | `KeyboardEvent.code` |
| game state -> DOM HUD text | Write-on-change `textContent` path; CSS-only restyle | Score, ball number, status strings |
| repository files -> shipped bundle | An asset or remote reference added to src or index.html would ship | Source files only (no binary assets) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Denial of Service | CueQueue under a contact burst | medium | mitigate | `CUE_QUEUE_CAPACITY = 64` ring drops newest and counts `dropped` (src/app/cue-queue.ts:68,128); overflow case in src/app/cue-queue.test.ts | closed |
| T-05-02 | Tampering (rule integrity) | A throwing feedback sink mid-branch | medium | mitigate | Hook is last statement of each branch; throwing-sink bit-identity case in src/sandbox/cue-pipeline.test.ts | closed |
| T-05-03 | Tampering (determinism) | Presentation code mutating the sim | medium | mitigate | `onKick` passes scalars (src/game/reactive-elements.ts); full proof in src/sandbox/presentation.determinism.test.ts | closed |
| T-05-04 | Denial of Service | AudioContext creation failure or rejected resume() | low | mitigate | try/catch + single `console.error` report, `resume().catch` (src/audio/audio-engine.ts:79,145-157); factory-failure case in src/audio/audio-unlock.test.ts | closed |
| T-05-05 | Spoofing | Synthetic (untrusted) events starting audio | low | mitigate | `if (e.isTrusted !== true) return;` (src/audio/audio-unlock.ts:42); untrusted case (h) in src/sandbox/cue-pipeline.test.ts | closed |
| T-05-06 | Denial of Service (frame budget) | Oversized backing store fill rate | medium | mitigate | `computeView` sizes the backing from css×dpr (src/render/view-transform.ts); invariants in src/render/view-transform.test.ts | closed |
| T-05-07 | Tampering | `?debug` query parameter | low | mitigate | `URLSearchParams(...).get("debug") === "1"` exact compare, no eval (src/sandbox/main.ts:297) | closed |
| T-05-08 | Denial of Service (GC hitches) | Per-frame gradient/string/closure allocation | medium | mitigate | Gradients cached at resize; zero create*Gradient calls across ten draws in src/render/table-renderer.test.ts | closed |
| T-05-09 | Tampering (determinism) | Loop flipper snapshots | low | mitigate | Read-only `getFlippers()` (src/sim/loop.ts); loop/game determinism tests rerun green | closed |
| T-05-10 | Denial of Service (audio thread, distortion) | Voice flood from the bumper cluster | medium | mitigate | `MAX_VOICES = 16`, per-kind caps, oldest-steal (src/audio/voice-pool.ts:23,69); master compressor; spam cases in src/audio/voice-pool.test.ts | closed |
| T-05-11 | Denial of Service | Exponential ramp to 0 throwing inside flush | low | mitigate | `ENV_FLOOR = 1e-4` clamp on every target (src/audio/envelope.ts:23,51); fake param throws on <= 0 | closed |
| T-05-12 | Denial of Service (resource leak) | Nodes never disconnected after a voice ends | low | mitigate | Last source's `onended` disconnects every voice node (src/audio/audio-engine.ts:250-259); `fireAllEnded` asserts in src/audio/recipes.test.ts:89-91 | closed |
| T-05-13 | Tampering (bus integrity, determinism) | ContactFlash listener | medium | mitigate | Holds only a `FlashSink`, copies scalars (src/render/contact-flash.ts); D-03 cases in src/render/contact-flash.test.ts | closed |
| T-05-14 | Denial of Service | FlashTracker indexed by an out-of-range id | low | mitigate | `Number.isInteger`, range and NaN guards in `record()` (src/render/flash.ts:105); out-of-range cases in src/render/flash.test.ts | closed |
| T-05-15 | Denial of Service (frame budget) | Per-frame gradients, blur or composite leaks in flash pass | medium | mitigate | Halos baked at resize, `globalAlpha` intensity with explicit resets (src/render/table-renderer.ts); flash-pass cases in src/render/table-renderer.test.ts | closed |
| T-05-16 | Tampering (determinism) | Observer or counters changing sim behavior | medium | mitigate | Observer holds `Pick<>` getter slices (src/sandbox/presentation-observer.ts); determinism + soak rerun green | closed |
| T-05-17 | Denial of Service | Cue spam from per-step state diffs | low | mitigate | Edge-only derivation against previous state (src/sandbox/presentation-observer.ts); steady-state case pushes nothing | closed |
| T-05-18 | Tampering (determinism) | Any presentation module mutating the sim | high | mitigate | Presentation-attached replay equals the bare run at 144 and 60 Hz with non-vacuous cue tallies (src/sandbox/presentation.determinism.test.ts) | closed |
| T-05-19 | Denial of Service (controls) | KeyM swallowing a flipper, plunger or game key | low | mitigate | `preventDefault` only for bound codes (src/input/game-input.ts:100,110); `FOREIGN_CODES` never latch mute in src/input/game-input.test.ts | closed |
| T-05-20 | Tampering (HUD injection) | HUD restyle introducing markup writes | low | mitigate | CSS-only change; HudView `textContent`-only (src/ui/hud.ts); 0 `innerHTML` in non-test src | closed |
| T-05-21 | Tampering (rule integrity) | Gap fixes to reactive-elements / cue-queue during contract cases | medium | mitigate | Throwing-sink bit-identity case, full suite twice and `npm run soak` rerun green (05-07 SUMMARY) | closed |
| T-05-22 | Tampering (IP and supply) | Image/audio/font file or network fetch entering src or index.html | medium | mitigate | Asset gate src/render/asset-free.test.ts with per-pattern positive samples; green in every full suite incl. after the 05-06 HUD restyle | closed |
| T-05-SC | Tampering | npm/pip/cargo installs | low | accept | No packages installed this phase; no install surface (see Accepted Risks Log) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-SC | Phase 5 installs no packages (RESEARCH Package Legitimacy Audit: none); rendering is Canvas 2D and audio is Web Audio, both browser-native. No new supply-chain surface. | plan-time threat model (05-01..05-08) | 2026-11-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-21 | 23 | 23 | 0 | secure-phase (L1 grep-depth, orchestrator; short-circuit: register authored at plan time, ASVS 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-21
