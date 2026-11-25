# Phase 5: Rendering & Audio - Research

**Researched:** 2026-11-21
**Domain:** Canvas 2D procedural rendering with render interpolation, plus Web Audio runtime SFX synthesis, as a read-only presentation layer over an existing fixed-step pinball sim
**Confidence:** HIGH for codebase seams and the browser API contracts. MEDIUM for synthesis recipes and flash timing, which are tuned by feel.

<user_constraints>
## User Constraints

No CONTEXT.md exists for this phase. The user skipped discuss-phase. Planning works from REQUIREMENTS.md, ROADMAP.md, CLAUDE.md and this research.

### Locked Decisions (from CLAUDE.md, STATE.md and earlier phases; equivalent authority)
- Rendering is raw Canvas 2D. Audio is the raw Web Audio API. No framework. No PixiJS or Tone.js for v1 (CLAUDE.md TL;DR).
- Procedural rendering and synthesized audio only. No image, audio or font assets, and no loaded sample files (PROJECT constraint, REQUIREMENTS Out of Scope).
- A stable 60fps is non-negotiable. Physics stays a fixed 120 Hz with render interpolation (CLAUDE.md "Stack Patterns", PHYS-03).
- Planck is imported only in `src/physics/planck-world.ts`. Every other module talks to the `PhysicsWorld` interface (Phase 1 D-05).
- The collision bus is one-way. Listeners must not allocate per event and must not call back into the world (`src/app/collision-router.ts:15,18`).
- The steady-state rAF and fixed-step paths do no per-frame heap allocation (T-02-05, T-03-01).
- The HUD is DOM text written only on change, and the canvas paints no text (Phase 4 decisions 04-10 and G-04-6).
- The Phase 6 items are out of scope here: screen shake, particles, ball drop shadow and vignette, glowing lit/unlit insert choreography, skill shot, count-up, ball save and high score (PLSH-01..08).
- Dependencies: the user wants to confirm any dependency they did not ask for. **This research recommends no new dependency.**

### Claude's Discretion
- Module layout, the visual palette and space-theme art direction (a UI-SPEC may lock these, since the UI hint is yes), flash timing, synthesis recipes, voice limits, and the test seams.

### Deferred Ideas (OUT OF SCOPE)
- Everything in PLSH-01..08 (Phase 6). Sequenced music and Tone.js. A WebGL or PixiJS escalation. Touch controls. A settings UI.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RND-01 | The entire table is rendered procedurally in code (Canvas) with no image assets | Static-layer bake plus dynamic layer (Patterns 2-3). The renderer reads `getElements()` so drawn equals hit. An asset-free grep gate (Validation). HUD interpretation in Open Question 1. |
| RND-02 | The game holds a stable 60fps via render interpolation | Ball interpolation exists. **Flipper interpolation is missing** (Finding 2). The **backing store is about 17x oversized** (Finding 1). Avoid shadowBlur and per-frame rgba strings (Pitfalls). |
| RND-03 | Elements flash on contact to confirm the hit registered | `FlashTracker` on the step clock (Pattern 4). Flashes for kicks and sensors come from a new `ReactiveElements` feedback hook (Finding 3). Walls and flippers flash from raw bus contacts above an impulse threshold. |
| AUD-01 | Each element produces a distinct runtime-synthesized sound (bumper, flipper, slingshot, drain, launch) with velocity/pitch variation and no audio files | `AudioEngine` with a context created on the first gesture, a master gain plus compressor, a voice pool and a pure envelope and mapping module (Patterns 5-7). Cue sources in Finding 3. Tilt is also required (ROADMAP SC4). |
</phase_requirements>

## Summary

Phases 1-4 left a working throwaway renderer (`src/sandbox/debug-draw.ts`), a fixed-step loop that interpolates **balls only**, a one-way collision bus, and game state that can be read through `GameSession`, `FlipperController`, `PlungerController` and `ReactiveElements`. Phase 5 replaces the debug renderer with a real procedural one in a new `src/render/`, adds a `src/audio/` engine, and wires both into `src/sandbox/main.ts`, which stays the composition root. Keep `DebugRenderer` behind `?debug` for diagnosis.

The codebase has three concrete gaps:
1. **The canvas backing store is about 17x larger than what is displayed.** It is sized at `PIXELS_PER_METER = 400` times dpr, then CSS-shrunk to about 0.24x. At 1280x684 and dpr 1.5 that is about 9.2 Mpx filled per frame to show about 0.54 Mpx. This is the biggest threat to 60fps on integrated GPUs, and the fix is cheap.
2. **Flipper angles are not interpolated.** The renderer reads the current-step angle, so at 144 Hz the bats judder while the ball is smooth.
3. **Nothing tells the presentation layer that a kick or rollover registered.** `ReactiveElements` decides triggers privately. That is cooldown, the slingshot face test, the impulse threshold and `isLive()`. Flashing on raw bus contacts would flash passive faces, tilted tables and rolling contacts.

Everything else (start, serve, drain, tilt, warning, flipper coil on/off, plunger release) can be derived by diffing existing read-only getters once per fixed step.

Audio follows the standard fire-and-forget pattern. One `AudioContext` is created inside the first trusted `keydown` or `pointerdown`, so it starts `running`. Each SFX gets new oscillator and noise-buffer source nodes, enveloped with `setValueAtTime` plus exponential ramps to 0.0001, with `stop()` scheduled at the envelope end. All voices feed a master `GainNode` and a `DynamicsCompressorNode`. The 120 Hz step path only records cues into a fixed ring buffer. The rAF frame flushes that buffer into audio nodes, which keeps the bus contract (no per-event allocation on the step path) and keeps the sim deterministic.

**Primary recommendation:** Build `src/render/` and `src/audio/` as pure-core modules with injected canvas and AudioContext seams. Fix the backing-store sizing first. Add flipper snapshots to `FixedStepLoop`. Add one optional feedback hook to `ReactiveElements`. Prove read-only-ness with a determinism test that runs the Phase 4 script with the whole presentation layer attached and gets bit-identical results.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Physics state and interpolation snapshots | Sim (`src/sim/loop.ts`) | — | The loop already owns previous/current/alpha for balls. Flipper angles belong beside them. |
| Hit and trigger facts (kick, sensor) | Game rules (`src/game/reactive-elements.ts`) | — | Only the rules know whether a contact registered (cooldown, face, live). Expose it, do not duplicate it. |
| State-transition cues (drain, tilt, start, flipper coil, launch) | Composition root (`main.ts`) plus `PresentationObserver` | Game modules (read-only getters) | They can be derived by diffing getters, so Phase 4 modules need no change. |
| Flash decay and lit state | Presentation (`src/render/flash.ts`) | Rules (`isLit`) | Presentation-only timing on the step clock. |
| Drawing (static bake and dynamic frame) | Browser / client Canvas 2D (`src/render/`) | — | A read-only consumer of `PhysicsWorld` getters and the interpolated snapshot. |
| Score / ball / status HUD | Browser DOM (`src/ui/hud.ts`) | — | Phase 4 decision: DOM text, aria-live status. See Open Question 1. |
| SFX synthesis and voice management | Browser Web Audio (`src/audio/`) | — | Fed only by the cue queue and never touches sim state. |

## Standard Stack

### Core (all present, nothing to install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Canvas 2D API | browser-native | Procedural table rendering | Locked by CLAUDE.md. A gradient and path API is enough for one table at 60fps. |
| Web Audio API | browser-native | Runtime SFX synthesis | Locked by CLAUDE.md. Oscillator, noise buffer, biquad and gain envelope one-shots. |
| TypeScript | 5.9.3 (installed, exact pin) [VERIFIED: node_modules/typescript/package.json] | Language | Pinned in Phase 1 because @typescript-eslint 8 needs TS < 6.1. Do not bump in this phase. |
| Vite | 8.1.4 (installed) [VERIFIED: node_modules/vite/package.json] | Dev server and bundle | Existing. |
| Vitest | 4.1.10 (installed) [VERIFIED: node_modules/vitest/package.json] | Tests, `environment: "node"` | Existing. No DOM, canvas or audio in tests: inject fakes. |
| planck | 1.5.0 (installed) [VERIFIED: node_modules/planck/package.json] | Physics (untouched) | Not imported by any Phase 5 module. |

### Supporting
None. Do not add `canvas` (node-canvas), `jsdom`, `standardized-audio-context`, `web-audio-test-api`, Tone.js or PixiJS. Hand-rolled fakes for the narrow interfaces this phase uses are a few dozen lines each and add no install risk.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled AudioContext fake | `standardized-audio-context` or a mock package | Adds a dependency the user must approve, and is heavier than needed for about 6 node types. Rejected. |
| Offscreen `<canvas>` via `document.createElement` | `OffscreenCanvas` | Either works on the main thread. `createElement` is universally supported and the canvas factory is injected anyway. Use `createElement`. |
| Pre-baked glow sprites with `'lighter'` | Per-frame `shadowBlur` | MDN: "Avoid the `shadowBlur` property whenever possible." Allowed only at bake time. |

**Installation:** none.

## Package Legitimacy Audit

This phase installs no external packages. The legitimacy gate is not applicable.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Key Codebase Findings (the seams)

### Finding 1: The backing store is oversized about 17x (RND-02 perf risk)
`src/sandbox/debug-draw.ts:189-191` [VERIFIED: read this session]:
```ts
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.boxWpx * this.dpr);
    this.canvas.height = Math.round(this.boxHpx * this.dpr);
```
`boxWpx` and `boxHpx` are world bounds × `PIXELS_PER_METER` (`src/physics/constants.ts:77`: `export const PIXELS_PER_METER = 400;`) plus padding. The canvas is then CSS-fit with `const fit = Math.min(...)` (line 194). The Phase 4 UAT root cause recorded "logical 1512x2708, backing 2268x4062 at dpr 1.5 ... CSS-fit to 367x657 (~0.24x)" [VERIFIED: 04-UAT.md G-04-6]. The real renderer must **compute the CSS fit first, then size the backing to `round(cssW·dpr) × round(cssH·dpr)`**, and draw with a world-to-device scale of `fit · PIXELS_PER_METER · dpr`. MDN: "The best case is to not scale the canvas, or have a smaller canvas and scale up rather than a bigger canvas and scale down." [CITED: developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas]

### Finding 2: Flipper angles are not interpolated (RND-02, high-refresh judder)
`src/sim/loop.ts:38-39` snapshots balls only [VERIFIED: read this session]:
```ts
  private readonly previousStates: BallSnapshot[] = [];
  private readonly currentStates: BallSnapshot[] = [];
```
`DebugRenderer.drawFlippers(world.getFlippers())` reads the current-step angle. Add `previousFlipperAngles` and `currentFlipperAngles` (pooled `number[]`, index-paired with `getFlippers()` mount order) to `FixedStepLoop`, refreshed in the same places as the ball snapshots (constructor seed, `copyStates` before step, `snapshotInto` after step). This is read-only on the world, so `loop.determinism.test.ts` and `game.determinism.test.ts` are unaffected. `FlipperState.angle` comes from `body.getAngle()` (`planck-world.ts:786,795`), which Planck does not normalize, so a plain lerp is safe. Use a shortest-arc lerp anyway as cheap insurance. Ball `angle` is copied uninterpolated (`main.ts:286`: `out.angle = c.angle;`). That is fine, because the ball highlight is light-fixed and needs no spin.

### Finding 3: Cue and flash sources. Exactly one hook is needed.
State that can be read by diffing [VERIFIED: read this session]:
- `GameState` (`src/game/game-session.ts:77`): `export type GameState = "game-over" | "playing" | "tilted";`, plus `getBall()`, `isWarning()`, `hasPlayed()`, and `onStart(): boolean`.
- `FlipperPhase` (`src/control/flipper-controller.ts:56`): `export type FlipperPhase = "resting" | "flipping-up" | "held-up" | "returning";` via `getPhase(id)`.
- `PlungerPhase` (`src/control/plunger-controller.ts:61`): `export type PlungerPhase = "idle" | "charging";` via `getPhase()` and `getCharge()`.
- `ReactiveElements.isLit(elementId)`, for rollovers only.

Not readable: **whether a bumper or sling kick or a sensor pass registered.** `ReactiveElements.onEvent` gates on cooldown (`KICKER_REARM_STEPS = 6`, `tuning.ts:34`), the impulse threshold (`SLING_MIN_IMPULSE = 0.02`, `tuning.ts:57`), the face distance and `isLive()`. **Add an optional 4th constructor parameter** `feedback?: ReactiveFeedback`, defaulting to a no-op:
```ts
export interface ReactiveFeedback {
  /** A kick registered (after every gate). normalImpulse is the raw event value. */
  onKick(kind: "bumper" | "slingshot", elementId: number, normalImpulse: number): void;
  /** A sensor pass registered. bank = this pass completed the rollover bank. */
  onSensor(kind: "rollover" | "lane", elementId: number, bank: boolean): void;
}
```
Call it as the **last statement** of each registered branch, after `award` and after the cooldown and pending state are set. Then a throwing sink, which the router catches per listener, can never leave rule state half-updated. Existing callers and tests keep working with the default.

Cue derivation table, used by the `PresentationObserver` in `main.ts`:

| Cue | Source | Strength |
|-----|--------|----------|
| bumper (200/201/202) | `ReactiveFeedback.onKick("bumper")` | `normalImpulse` normalized (Pattern 7) |
| slingshot (300/301) | `onKick("slingshot")` | same |
| rollover (400-402), lane (500/501), bank | `onSensor` | 1 (bank plays a 3-note figure) |
| flipper up / down (0/1) | diff: phase entered `flipping-up` = coil on; left `flipping-up`/`held-up` for `returning` = coil off, which includes the tilt drop | constant with jitter (down quieter) |
| launch | in `onFixedStep`: read `getPhase()==="charging"` and `getCharge()` **before** `applyEdges`. If `pe.release && wasCharging`, cue with the pre-release charge. Cancel (blur) gives no cue. | charge 0..1 |
| drain | in `onPostStep`: `getBall()` or `getState()` before and after `session.service()`. A ball increment, or a change to `game-over`, means a drain. | 1 |
| tilt / warning | diff `getState()` to `tilted`, and the rising edge of `isWarning()` | 1 |
| start / game over | `onStart()` returned true; state changed to `game-over` | 1 |
| wall / chute / flipper contact flash (visual only) | a raw bus listener: `elementKind` in {wall, chute, flipper} and `normalImpulse >= SLING_MIN_IMPULSE` (reuse the constant: it already separates rolling (0.0015) from real hits (0.0393), per `tuning.ts` doc) | impulse |

Element ids [VERIFIED: src/table/spec.ts:321-399]: walls `100, 120, 121, 130, 131, 141, 142, 150, 151`, chute `110`, bumpers `200, 201, 202`, slingshots `300, 301`, rollovers `400, 401, 402`, lanes `500, 501`, drain `600`, flipper mounts `0, 1`. `ElementKind` (`spec.ts:25-26`): `"wall" | "chute" | "drain" | "bumper" | "slingshot" | "lane" | "rollover" | "flipper"`. The max id is 600, so a `Float64Array(601)` indexed by id is an allocation-free flash table.

### Finding 4: Determinism constraints the presentation layer must respect
- `game.determinism.test.ts` replays the full `main.ts` composition at 60, 120 and 144 Hz and asserts bit-identical score, balls and flipper angles. Presentation code must never call `PhysicsWorld` mutators (`step`, `addBall`, `removeBall`, `setFlipperMotor`, `applyImpulse`), never consume a seeded sim PRNG stream, and never change listener behavior. New router listeners (contact flash) are additive. Existing listeners only record, so registration order is not load-bearing (`main.ts` comment).
- Audio pitch jitter needs randomness. Inject an `rng: () => number` (production `Math.random`, tests a fixed `mulberry32` from `src/harness/prng.ts`). It must never be shared with a sim stream.
- Time sources: flash decay runs on the **fixed-step clock** (a `FlashTracker.tick()` in `onPostStep`), rendered at `step + alpha`. It pauses with the sim on tab blur and is unit-testable. Audio scheduling uses `ctx.currentTime` only.

### Finding 5: Test baseline
`npx vitest run` gave 518 passed and 3 failed, all `Test timed out in 5000ms` (reactive-soak, table-soak, flipper-e2e quick-tap) [VERIFIED: run this session]. This is the known load flake in pending todo `2026-11-21-give-heavy-simulation-tests-an-explicit-timeout...`. Fix it in Wave 0 (`testTimeout` in `vitest.config.ts`), or the Phase 5 gate stays red for reasons unrelated to Phase 5.

## Architecture Patterns

### System Architecture Diagram

```
 keyboard / pointer ──► Input latches ──┐            AudioUnlock (first trusted keydown/pointerdown)
                                        │                 │ creates AudioContext (running), resume() on later gestures
 rAF(now) ──► FixedStepLoop.advance ────┤                 ▼
              │  per 120 Hz step:       │            ┌──────────────┐
              │  onFixedStep ──► controllers, session ─► Observer.noteLaunch / noteStart
              │  world.step()           │            │ Presentation │
              │  snapshot balls+flippers│            │  Observer    │── diff getters (state, ball, warning,
              │  onPostStep ─► router.dispatch ──┬──►│  (main.ts)   │    flipper phases) once per step
              │                 │                │   └──────┬───────┘
              │                 ├─► ReactiveElements ──feedback(onKick/onSensor)──┐
              │                 ├─► GameSession                                   │
              │                 └─► ContactFlash (wall/chute/flipper ≥ threshold) │
              │               reactive.service, session.service, flash.tick       ▼
              │                                              CueQueue (fixed ring buffer, no alloc)
              ▼                                                  │            │
   previous/current/alpha ──► interpolate (ball xy, flipper θ)   │            │
              │                                                  ▼            ▼
              └────────────► TableRenderer.draw(frame) ◄── FlashTracker   AudioEngine.flush()
                               │ drawImage(static layer)        (step+α)     │ voice pool → recipe →
                               │ lit inserts, flash sprites ('lighter')      │ osc/noise → filter → env gain
                               │ flippers, ball, plunger + meter             ▼
                               ▼                                   master gain → compressor → destination
                          <canvas> (backing = CSS size × dpr)
   HudView / DiagView (DOM, write-on-change) — unchanged
```

### Recommended Project Structure
```
src/
├── render/
│   ├── view-transform.ts      # pure: fit bounds into viewport → css size, backing size, world→device scale/offset
│   ├── interpolate.ts         # pure: lerp ball xy, shortest-arc lerp flipper angle, id-mismatch rule
│   ├── flash.ts               # FlashTracker (Float64Array by id, step clock) + pure flashLevel()
│   ├── palette.ts             # module-level colors/styles (one meaning per color; fixes #ef476f triple use)
│   ├── static-layer.ts        # bake playfield once per resize into an offscreen canvas (+ seeded starfield)
│   ├── sprites.ts             # bake glow halos per color/radius once per resize
│   ├── table-renderer.ts      # per-frame composition: blit static, inserts, flashes, flippers, ball, plunger/meter
│   └── canvas-factory.ts      # injected seam: create offscreen layer (DOM in prod, recorder in tests)
├── audio/
│   ├── audio-context-like.ts  # narrow structural interfaces the engine uses (real AudioContext satisfies them)
│   ├── envelope.ts            # pure: ADSR → automation point list; exp floor 1e-4
│   ├── mapping.ts             # pure: impulse/charge → strength → gain dB / semitones; bounded jitter
│   ├── recipes.ts             # data: per-cue synthesis recipe (osc types, freqs, sweeps, filter, noise, envelope)
│   ├── voice-pool.ts          # caps (global + per cue), oldest-steal, onended bookkeeping
│   ├── audio-engine.ts        # owns ctx + master chain + noise buffer; enqueue (no alloc) / flush (per frame)
│   └── audio-unlock.ts        # gesture listeners: lazy create + resume
├── app/
│   └── cue-queue.ts           # fixed-capacity ring of {cue, elementId, strength}; shared by audio + flash
└── sandbox/
    ├── main.ts                # composition root (stays here); PresentationObserver wiring
    └── debug-draw.ts          # kept, selected with ?debug
```

### Pattern 1: View transform computed from the display, not from PIXELS_PER_METER
**What:** A pure function from world bounds, margins, viewport CSS size and dpr to `{cssW, cssH, backingW, backingH, scale, offX, offY}`, where `scale = fit · PIXELS_PER_METER · dpr` maps meters to device px.
**When:** On init, on `resize`, and on a dpr change. Listen with `matchMedia(\`(resolution: ${dpr}dppx)\`)` `change` and re-arm after each fire, because moving a window between monitors changes dpr without a `resize` event on some platforms [ASSUMED].
**Notes:** Setting `canvas.width` clears the canvas and resets all context state (transform, styles). Re-bake the static layer and sprites, and invalidate the cached ball gradient (keyed by device-px radius) every time.

### Pattern 2: Static layer baked once, blitted every frame
**What:** Draw everything that never changes into an offscreen canvas of the same backing size: background gradient, nebula radial gradients, a seeded starfield (`mulberry32` with a fixed seed, so it is identical every load), wall and guide neon strokes (two passes, wide low-alpha then thin bright: a glow with no blur), unlit rollover and lane inserts, bumper bases, sling bodies, chute and drain apron. Each frame does `ctx.drawImage(staticLayer, 0, 0)` once, at integer 0,0 and unscaled, so it stays crisp.
**Source:** MDN: "If you find yourself repeating some of the same drawing operations on each animation frame, consider offloading them to an offscreen canvas." [CITED: MDN Optimizing canvas]. `shadowBlur` is acceptable **at bake time only**.
```ts
// Source: MDN Optimizing canvas (pattern), adapted
const layer = factory.create(view.backingW, view.backingH); // document.createElement("canvas") in prod
bakeStatic(layer.ctx, elements, view);                      // once per resize
// per frame:
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.drawImage(layer.canvas, 0, 0);
ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY); // world meters from here
```
Use `canvas.getContext("2d", { alpha: false })` for the visible canvas, because the background is opaque [CITED: MDN Optimizing canvas, "Turn off transparency"].

### Pattern 3: Dynamic frame, allocation-free
Per frame, in order: blit static; lit rollovers (`isLit`); flash sprites; flippers (interpolated θ, stadium from `FlipperState` so drawn equals hit); ball (interpolated, cached radial gradient plus fixed specular); plunger rod and charge meter. No velocity arrow and no contact squares (debug only). Rules:
- Flash intensity goes through `ctx.globalAlpha`, never through building `rgba(...)` strings per frame.
- Glow goes through `globalCompositeOperation = "lighter"` plus a pre-baked halo sprite `drawImage`. Reset to `"source-over"` and `globalAlpha = 1` after the pass.
- Iterate with index loops over pooled arrays. Keep no closures in `draw()`.

### Pattern 4: FlashTracker on the step clock (RND-03)
```ts
export function flashLevel(ageSteps: number, decaySteps: number, holdSteps: number): number {
  if (!(ageSteps >= 0)) return 0;                // NaN/never-hit guard
  if (ageSteps <= holdSteps) return 1;
  const t = ageSteps - holdSteps;
  if (t >= decaySteps * 4) return 0;            // hard cutoff, ~e^-4
  return Math.exp(-t / decaySteps);
}
export class FlashTracker {
  private readonly hitAt: Float64Array;          // by element id, -Infinity = never
  private readonly peak: Float64Array;           // strength 0..1 at hit
  private step = 0;
  constructor(maxId: number) { this.hitAt = new Float64Array(maxId + 1).fill(-Infinity); this.peak = new Float64Array(maxId + 1); }
  record(id: number, strength: number): void { if (id >= 0 && id < this.hitAt.length) { this.hitAt[id] = this.step; this.peak[id] = strength; } }
  tick(): void { this.step++; }                  // onPostStep, after dispatch/services
  level(id: number, alpha: number, decaySteps: number, holdSteps: number): number { /* peak * flashLevel(step+alpha-hitAt) */ }
}
```
Recommended starting values, tuned by feel [ASSUMED]: bumpers hold 2 steps and decay τ 10 steps (about 80 ms, visible about 0.35 s). Slingshots hold 1 and τ 7. Rollover and lane pass τ 14. Walls and flippers peak at 0.35 strength and τ 5. Drain τ 20. Use a strength floor of 0.5 for kicks, so a soft registered hit still visibly confirms.

### Pattern 5: AudioContext lifecycle (gesture unlock)
- Create the context **inside** the first trusted `keydown` or `pointerdown`. Use window listeners with `{ capture: true }`, attached once at boot. MDN: "if you create the audio context from inside a `click` event the state should automatically be set to `running`" and "If however, you create the context outside of a user gesture, its state will be set to `suspended`" [CITED: developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices].
- `keydown` counts: an activation-triggering input event is a trusted "keydown, provided the key is neither the Esc key nor a shortcut key reserved by the user agent", or mousedown, pointerdown (mouse), pointerup (non-mouse) or touchend [CITED: html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event]. The first real key a player presses is Enter (start), so start and every later cue are audible.
- On every later gesture: `if (ctx.state !== "running") void ctx.resume();` (cheap, and heals a suspended or interrupted context).
- Before a context exists, `enqueue` and `flush` drop cues. Never queue stale sounds for later.

### Pattern 6: One-shot voice graph and cleanup
```ts
// Source: MDN AudioScheduledSourceNode.start (one start per node) + Web Audio spec "fire-and-forget"
function playVoice(ctx: AudioContextLike, master: AudioNodeLike, r: VoiceSpec, t0: number): number /*end time*/ {
  const env = ctx.createGain();
  const g = env.gain;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);                         // anchor; never assign .value
  g.exponentialRampToValueAtTime(r.peak, t0 + r.attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + r.attack + r.decay); // >0: exp ramp target must be positive
  const end = t0 + r.attack + r.decay + 0.01;
  const osc = ctx.createOscillator();
  osc.type = r.wave;
  osc.frequency.setValueAtTime(r.f0, t0);
  osc.frequency.exponentialRampToValueAtTime(r.f1, t0 + r.sweep);
  osc.connect(env); env.connect(master);
  osc.start(t0); osc.stop(end);
  osc.onended = () => { osc.disconnect(); env.disconnect(); /* voicePool.release */ };
  return end;
}
```
- Source nodes can be started once only. MDN `start()` throws `InvalidStateError` "if the node has already been started ... even if the node is no longer running" [CITED: MDN AudioScheduledSourceNode/start]. Create new nodes per hit. The spec calls this the fire-and-forget model [CITED: webaudio.github.io/web-audio-api §1.1.6].
- Create **one** white-noise `AudioBuffer` (about 1 s, mono) at context creation. Each noise hit makes a new `AudioBufferSourceNode` over it, with a random `offset` into the buffer.
- Master chain: `master GainNode (≈0.6) → DynamicsCompressorNode (threshold ≈ -12 dB, ratio ≈ 12, attack ≈ 0.003, release ≈ 0.15) → destination`. It keeps bumper-cluster spam from clipping [ASSUMED values, tune by ear].
- The `onended` closure is allocated per sound. That is acceptable because sounds are event-rate (a few per second), not per frame or per step. Node creation happens only in `flush()` on the rAF frame, never in a bus listener.

### Pattern 7: Velocity and pitch variation (pure, testable)
```ts
export const clamp01 = (x: number) => (x <= 0 || !(x === x) ? 0 : x >= 1 ? 1 : x);
/** Kick strength from the raw post-solve impulse: Δv ≈ J/m, normalized to a reference speed. */
export function impulseStrength(normalImpulse: number, ballMassKg: number, refSpeed = 8): number {
  return clamp01(normalImpulse / (ballMassKg * refSpeed));
}
/** Perceptual loudness: map strength to [-18 dB, 0 dB]. */
export function strengthToGain(s: number, floorDb = -18): number { return Math.pow(10, (floorDb * (1 - clamp01(s))) / 20); }
/** Pitch: harder = slightly higher (0..+3 st) plus bounded random jitter (±25 cents). */
export function playbackSemitones(s: number, rng: () => number, maxSt = 3, jitterCents = 25): number {
  return clamp01(s) * maxSt + ((rng() * 2 - 1) * jitterCents) / 100;
}
export const semitoneRatio = (st: number) => Math.pow(2, st / 12);
```
Ball mass comes from `ballMass(BALL_RADIUS_M)` in `src/physics/constants.ts` (about 0.1257 kg). Do not hardcode it.

### Recipe sketch (distinct per element; values are starting points [ASSUMED], tuned by ear)
| Cue | Voice(s) | Envelope | Variation |
|-----|----------|----------|-----------|
| bumper | triangle 620→300 Hz sweep 60 ms, plus band-passed noise 2.2 kHz for 25 ms | A 2 ms / D 140 ms | per-bumper base offset 0 / +2 / -3 st; strength → gain and +0..3 st; ±25 c jitter |
| slingshot | square 190→140 Hz for 45 ms through a lowpass at 1.8 kHz, plus a high-passed noise click 15 ms | A 1 ms / D 70 ms | strength → gain; ±30 c |
| flipper up | sine 95→55 Hz for 70 ms plus lowpass noise 350 Hz for 35 ms (coil thunk) | A 1 ms / D 90 ms | ±40 c, left and right differ by 1 st |
| flipper down | sine 70→50 Hz, quieter (-8 dB) | A 2 ms / D 60 ms | ±40 c |
| launch | noise through a bandpass swept 400→(1200+1800·charge) Hz plus triangle twang 320→150 Hz | A 3 ms / D 150+250·charge ms | charge → gain and sweep length |
| drain | sawtooth 220→70 Hz over 650 ms through a lowpass 900→150 Hz, plus a low thud | A 5 ms / D 700 ms | ±20 c |
| tilt | two squares 110 and 116.5 Hz (beating buzzer) through a lowpass at 1.2 kHz | A 5 ms / hold 500 ms / D 150 ms | none (an alarm should be consistent) |
| warning | two 880 Hz square beeps, 80 ms each, 70 ms apart | short | none |
| rollover / lane | sine bell 1320 Hz plus 2.76× partial (rollover); 990 Hz (lane) | A 2 ms / D 320 ms | ±15 c; bank = 3-note rising figure |
| start / game over | 3-note rising / falling triangle figure | short | none |

### Anti-Patterns to Avoid
- **Flashing on raw bus contacts for kickers and sensors:** this flashes passive sling faces, rolling contacts and tilted tables. Use the `ReactiveFeedback` hook.
- **Creating audio nodes inside a bus listener or `onFixedStep`:** this breaks the router's "do not allocate per event" contract and puts allocation on the 120 Hz path. Record into the `CueQueue` and flush per rAF frame.
- **Constructing the `AudioContext` at module load or in `main()`:** it starts suspended, and Chrome logs an autoplay warning [ASSUMED Chrome console behavior].
- **Reading `world.getFlippers()` angles directly in the renderer:** use the loop's interpolated pair.
- **Wall-clock flash timers (`performance.now()`):** they are not testable and drift from the sim on tab blur. Use step + alpha.
- **Re-baking the static layer per frame, or rebuilding gradients per frame.**
- **Moving `main.ts` or renaming `src/sandbox/`:** e2e tests mirror the composition. Leave the path alone and refactor later if wanted.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Envelope / click avoidance | manual `gain.value` writes or setTimeout fades | `AudioParam.setValueAtTime` plus `exponentialRampToValueAtTime` to 1e-4 | Sample-accurate on the audio thread; direct writes click |
| Mix limiting | custom peak detection | `DynamicsCompressorNode` on the master bus | Native, cheap, and handles burst stacking |
| Sound scheduling clock | `performance.now()` / setTimeout | `ctx.currentTime` | The audio clock is the only accurate timeline |
| Glow | per-frame `shadowBlur` or `ctx.filter = "blur()"` | radial-gradient halo sprites baked once, drawn with `'lighter'` | MDN: avoid shadowBlur. `ctx.filter` browser support varies [ASSUMED] |
| Deterministic starfield randomness | a new PRNG | existing `mulberry32` in `src/harness/prng.ts` | Already tested. A fixed seed gives the same sky every load |
| Interpolation state | a second snapshot system in the renderer | extend `FixedStepLoop` (it owns previous/current/alpha) | One owner, already determinism-tested |
| Test doubles for canvas/audio | jsdom, node-canvas or mock packages | narrow structural interfaces plus small hand-rolled recorders | No new deps (user confirmation rule). The real APIs satisfy the interfaces structurally |

**Key insight:** Every hard part here is already solved by a browser primitive (audio-thread automation, compositing, offscreen bitmaps) or by an existing project module (loop snapshots, PRNG, bus). This phase is wiring and taste, not new infrastructure.

## Common Pitfalls

### Pitfall 1: Oversized backing store
**What goes wrong:** Frames drop on integrated GPUs and HiDPI displays even with a trivial scene. **Why:** A 400 px/m backing at dpr gives about 9 Mpx per frame (Finding 1). **Avoid:** Pattern 1. **Warning signs:** `canvas.width` is much larger than `canvas.clientWidth * devicePixelRatio`. Add an assertion test on `view-transform`.

### Pitfall 2: Flipper judder at 120/144 Hz
**What goes wrong:** The ball is smooth but the bats step. **Why:** Angles are not interpolated (Finding 2). **Avoid:** Loop flipper snapshots plus lerp. **Warning signs:** The bats look "stuttery" on a 144 Hz display only.

### Pitfall 3: Per-frame string and gradient allocation
**What goes wrong:** Periodic GC hitches. **Why:** `` `rgba(255,200,0,${a})` `` per frame, or `createRadialGradient` per frame. **Avoid:** Fixed color constants plus `globalAlpha`, and gradients cached per resize.

### Pitfall 4: Composite and alpha state leaks
**What goes wrong:** After a flash pass the whole table renders additive or faded. **Avoid:** Reset `globalCompositeOperation = "source-over"` and `globalAlpha = 1` after each pass, or use `save()`/`restore()` around the pass. `save`/`restore` is not free, so prefer explicit resets in the hot path.

### Pitfall 5: Exponential ramp to zero, or no anchor
**What goes wrong:** A thrown error, or a click. **Why:** "an invalid or illegal string error is thrown if 0 is used — the value needs to be positive" [CITED: MDN exponentialRampToValueAtTime], and a ramp starts "at the time specified for the previous event", so it needs a `setValueAtTime` anchor. **Avoid:** The envelope module emits anchor-then-ramps to 1e-4. Unit-test that no exponential target is ≤ 0.

### Pitfall 6: Silent first sound or a suspended context
**What goes wrong:** No audio until the second interaction. **Avoid:** Pattern 5, which creates the context inside the gesture. Shift-only keydowns may or may not count as activation in a given browser [ASSUMED]. Enter always does.

### Pitfall 7: Voice flood in the bumper cluster
**What goes wrong:** Distortion and latency. The bumper rearm is 6 steps (50 ms), so 3 bumpers can fire about 60 cues/s. **Avoid:** A global cap (about 16 voices), per-cue caps (bumper 4, flipper 2 per side, sling 2, others 1-2), and steal-oldest with a 5 ms fade. Plus the master compressor.

### Pitfall 8: A sink throw corrupting rules
**What goes wrong:** A feedback call in the middle of `ReactiveElements.onEvent` throws, the router swallows it, and the cooldown or pending kick was never set. **Avoid:** Call the hook as the last statement. The hub's implementations must be total (index writes into typed arrays, no throw).

### Pitfall 9: Canvas resize resets context state
**What goes wrong:** After a resize, transforms, line caps and the cached ball gradient are stale or wrong. **Avoid:** Re-apply state each frame (the per-frame `setTransform`), re-bake on resize, and key caches on `view.scale`.

### Pitfall 10: Load-flaky test gate
**What goes wrong:** Phase 5 verification goes red on the 3 known timeouts. **Avoid:** Wave 0 sets `testTimeout: 30000` in `vitest.config.ts` (or per-file timeouts on the heavy simulation files), per the pending todo.

## Code Examples

### Interpolation (pure)
```ts
// Source: Gaffer "Fix Your Timestep" render interpolation; project loop contract (alpha in [0,1))
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
```

### Narrow AudioContext seam (real AudioContext satisfies it structurally)
```ts
export interface AudioParamLike {
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
  cancelScheduledValues(t: number): unknown;
}
export interface AudioNodeLike { connect(dest: AudioNodeLike): unknown; disconnect(): void; }
export interface ScheduledSourceLike extends AudioNodeLike {
  start(when?: number, offset?: number): void; stop(when?: number): void; onended: (() => void) | null;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;               // "suspended" | "running" | "closed" (+ "interrupted" on Safari)
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  createGain(): AudioNodeLike & { gain: AudioParamLike };
  createOscillator(): ScheduledSourceLike & { type: OscillatorType; frequency: AudioParamLike; detune: AudioParamLike };
  createBiquadFilter(): AudioNodeLike & { type: BiquadFilterType; frequency: AudioParamLike; Q: AudioParamLike };
  createBufferSource(): ScheduledSourceLike & { buffer: unknown; playbackRate: AudioParamLike };
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(c: number): Float32Array };
  createDynamicsCompressor(): AudioNodeLike & { threshold: AudioParamLike; ratio: AudioParamLike; attack: AudioParamLike; release: AudioParamLike; knee: AudioParamLike };
}
```
The engine takes `createContext: () => AudioContextLike` (production: `() => new AudioContext({ latencyHint: "interactive" })`). If `tsc` rejects structural assignment of DOM node types (for example `connect` overloads, or the `onended` event-parameter signature), widen the seam types and do not cast in production code. Verify during Wave 0 with a one-line typecheck fixture: `const _c: AudioContextLike = new AudioContext();` [ASSUMED compatibility, verify with tsc].

### Read-only proof (the key determinism test)
```ts
// src/sandbox/presentation.determinism.test.ts — reuse game.determinism's SCRIPT/play() shape
// Run the scripted game twice at 144 Hz: (a) bare composition, (b) composition + FlashTracker
// + ContactFlash listener + ReactiveFeedback hub + PresentationObserver + AudioEngine(fake ctx)
// + TableRenderer.draw(recording ctx) every frame. Assert identical steps, score, ball, state,
// every ball (id,x,y,vx,vy,angle) and both flipper angles; and assert cues were actually produced
// (bumper/flipper/launch/tilt > 0) so the run is not vacuous.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AudioContext created at load and playing immediately | Context created or resumed inside a user gesture (autoplay policy) | Chrome 66+ era; now in all majors | Audio code must have an unlock path [CITED: MDN Best practices] |
| Canvas sized in "game px", then CSS-scaled | Backing = CSS size × dpr, scale in the transform | long-standing MDN guidance | Crisp HiDPI with no wasted fill |
| `shadowBlur` glow per frame | Baked sprites plus `'lighter'` | long-standing | Avoids frame-time spikes |

**Deprecated/outdated:** `ScriptProcessorNode` (replaced by AudioWorklet, which is not needed here: no custom DSP). Do not use `webkitAudioContext` fallbacks; modern browsers only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Flash timings (hold, τ, cutoff, strength floor) | Pattern 4 | Cosmetic. Tune by eye at UAT |
| A2 | Synthesis recipe values and the master compressor settings | Recipe sketch, Pattern 6 | Cosmetic. Tune by ear at UAT |
| A3 | Voice caps (16 global, per-cue caps) | Pitfall 7 | Low. Too low drops hits, too high distorts (the compressor mitigates) |
| A4 | `impulseStrength` reference speed 8 m/s | Pattern 7 | Low. Strength may saturate or barely vary. Adjust the constant |
| A5 | Real `AudioContext` structurally satisfies `AudioContextLike` under TS 5.9 with `exactOptionalPropertyTypes` | Code Examples | Medium. May need wider seam types. Verify in Wave 0 |
| A6 | A dpr change needs a `matchMedia` resolution listener in addition to `resize` | Pattern 1 | Low. Blurry canvas after moving monitors until the next resize |
| A7 | Modifier-only (Shift) keydown may not count as user activation in every browser | Pitfall 6 | Low. Enter starts every game and does count |
| A8 | Chrome logs an autoplay warning for a context constructed before a gesture | Anti-patterns | None. Advisory only |
| A9 | `ctx.filter` blur has uneven browser support | Don't Hand-Roll | None. It is avoided anyway |
| A10 | Interpreting SC1's "HUD ... on Canvas" as satisfied by the procedural DOM HUD | Open Question 1 | Medium. If the user wants the HUD on the canvas, add a canvas score panel plan |

## Open Questions

1. **The HUD on canvas vs DOM (ROADMAP SC1 says "playfield, ball, flippers, lanes, and HUD ... on Canvas").**
   - What we know: Phase 4 moved the score, ball, status and diagnosis to DOM on purpose (legibility, aria-live status, layout-relabelled key caps), and decided "the canvas paints no text". The 3.4 px canvas text bug was caused by Finding 1 and goes away once the backing is sized correctly.
   - Recommendation: **A: keep the DOM HUD**, restyle it to the space theme, and record that SC1's intent ("procedural, zero image assets") is met. B (also draw the score on canvas) duplicates the HUD and loses accessibility. Planner: confirm A with the user (one character) before execution.
2. **Mute toggle.** REQUIREMENTS lists "maybe a mute toggle" under out-of-scope settings. Recommendation: add an `M` key mute (one controls-list row, master gain to 0 with a short ramp). It is cheap and expected for a portfolio piece. Needs user confirmation because it adds a binding.
3. **Wall contact sound.** AUD-01 does not list walls. Recommendation: no wall sound in v1 (it adds noise). Walls only flash visually.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tests, build | ✓ | v26.13.1 | — |
| npm | scripts | ✓ | 11.10.0 | — |
| Vitest | tests | ✓ | 4.1.10 | — |
| Chrome (real browser for 60fps, 144 Hz and audio UAT) | manual verification | ✓ (Chrome 157, per 04-UAT notes) | 157 | — |
| A 120/144 Hz display | SC2 high-refresh check | unknown | — | Chrome DevTools rendering FPS meter on 60 Hz, plus the headless 144 Hz determinism test. The STATE.md concern that the plunger re-feed was never watched at 144 Hz carries forward |
| Firefox / Safari | cross-browser audio check | ✗ Firefox not installed (04-UAT test 20) | — | Chrome only; note as residual |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** a high-refresh display (headless cadence tests plus DevTools); Firefox (Chrome-only UAT).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10, `environment: "node"` |
| Config file | `vitest.config.ts` (excludes `**/*.gate.test.ts`); `vitest.gate.config.ts` for soak gates |
| Quick run command | `npx vitest run src/render src/audio src/app/cue-queue.test.ts` |
| Full suite command | `npm run typecheck && npm run lint && npm test` |
| Phase gate extra | `npm run soak` (ReactiveElements is touched, so re-prove the reactive soak gates) and `npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RND-01 | No image, audio or font assets anywhere in `src/` or `index.html`: no `new Image(`, `<img`, `url(`, `.png/.jpg/.svg/.webp/.gif/.mp3/.wav/.ogg` imports, `decodeAudioData`, `new Audio(`, `fetch(` | unit (fs grep) | `npx vitest run src/render/asset-free.test.ts` | ❌ Wave 0 |
| RND-01 | The static bake draws every non-mount `ResolvedElement` of `TABLE_SPEC` (recorder sees path ops for each id or kind) | unit (recording ctx) | `npx vitest run src/render/static-layer.test.ts` | ❌ |
| RND-02 | `view-transform`: backing = round(css×dpr), never larger than css×dpr+1; aspect preserved; fits viewport | unit | `npx vitest run src/render/view-transform.test.ts` | ❌ |
| RND-02 | Loop snapshots flipper angles: previous = before-step, current = after-step, seeded in the constructor; ball snapshots and step counts unchanged | unit | `npx vitest run src/sim/loop.flippers.test.ts` | ❌ |
| RND-02 | `lerp`/`lerpAngle`/ball id-mismatch rule | unit | `npx vitest run src/render/interpolate.test.ts` | ❌ |
| RND-02 | Frame path: `shadowBlur` never set > 0 during `draw()`; static layer baked once across N frames (bake count 1, then `drawImage` per frame); composite and alpha restored at frame end | unit (recording ctx) | `npx vitest run src/render/table-renderer.test.ts` | ❌ |
| RND-02 | Presentation attached ⇒ sim bit-identical at 144 Hz (read-only proof) | integration | `npx vitest run src/sandbox/presentation.determinism.test.ts` | ❌ |
| RND-02 | Holds 60fps at 60 Hz and smooth at 144 Hz (diag FPS readout, DevTools Performance trace with no long frames over 2 min of play) | manual | UAT | — |
| RND-03 | `flashLevel`: 1 within hold, monotonic decay, 0 after cutoff, NaN/-Infinity safe; `FlashTracker` step clock plus alpha | unit | `npx vitest run src/render/flash.test.ts` | ❌ |
| RND-03 | `ReactiveFeedback` fires once per registered kick or sensor; never while tilted, never on a passive sling face, never inside the cooldown; called after award (spy order) | unit | `npx vitest run src/game/reactive-elements.test.ts` | ✅ extend |
| RND-03 | Contact-flash listener: wall/chute/flipper flash only at `normalImpulse >= SLING_MIN_IMPULSE`; sensors and kickers are ignored by it | unit | `npx vitest run src/render/contact-flash.test.ts` | ❌ |
| AUD-01 | Envelope points: anchor first, exp targets > 0, end ≥ attack+decay; `strengthToGain` monotonic in [10^(-18/20), 1]; jitter bounded with a seeded rng | unit | `npx vitest run src/audio/envelope.test.ts src/audio/mapping.test.ts` | ❌ |
| AUD-01 | Each cue (bumper, flipper up/down, slingshot, drain, launch, tilt, rollover, lane) builds a graph that ends at master, with every source `start`ed and `stop`ped and disconnected on `onended`; recipes pairwise distinct (wave/frequency signature) | unit (fake ctx) | `npx vitest run src/audio/audio-engine.test.ts src/audio/recipes.test.ts` | ❌ |
| AUD-01 | Voice caps hold under 200 cues in one flush; stealing fades the oldest | unit | `npx vitest run src/audio/voice-pool.test.ts` | ❌ |
| AUD-01 | Unlock: no context before a gesture; a trusted keydown creates exactly one; later gestures call `resume()` when not running; cues before unlock are dropped, not replayed | unit | `npx vitest run src/audio/audio-unlock.test.ts` | ❌ |
| AUD-01 | Cue derivation: launch cue only on release-while-charging (not cancel) with the pre-release charge; drain cue on ball increment or game-over; tilt on state change; flipper up/down on coil edges, including the tilt drop | unit | `npx vitest run src/sandbox/presentation-observer.test.ts` | ❌ |
| AUD-01 | Sounds distinct, enveloped (no clicks), audible on the first Enter, no distortion in bumper spam | manual | UAT (listen) | — |

### Sampling Rate
- **Per task commit:** the quick run command plus `npm run typecheck`
- **Per wave merge:** `npm run typecheck && npm run lint && npm test`
- **Phase gate:** full suite green, plus `npm run soak` and `npm run build`, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts`: `testTimeout: 30000` (closes pending todo; baseline has 3 load timeouts)
- [ ] `src/render/test/recording-context.ts`: a Proxy-based `CanvasRenderingContext2D` recorder (logs method calls and property sets)
- [ ] `src/audio/test/fake-audio-context.ts`: implements `AudioContextLike`, records nodes, param automation, start/stop and connections, with manual `fireEnded()`
- [ ] `src/render/asset-free.test.ts`: the RND-01 grep gate
- [ ] A typecheck fixture proving `AudioContext` is assignable to `AudioContextLike` (A5)

## Security Domain

`security_enforcement` is not set to false, so this section applies. The surface is minimal: no network, no storage, no user-supplied content.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (minimal) | `?debug` read with `new URLSearchParams(location.search).get("debug") === "1"` (exact compare, no eval). The HUD stays `textContent`-only (T-04-20) |
| V6 Cryptography | no | `Math.random` for audio jitter is not security-relevant |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Audio voice flood from rapid contacts (availability) | DoS | Voice pool caps, per-cue caps, master compressor, cue ring buffer with fixed capacity (drop on overflow) |
| Render-path GC hitches and fill-rate (availability of the 60fps bar) | DoS | Allocation-free frame, correctly sized backing, static bake |
| Presentation code mutating the sim (integrity of determinism) | Tampering | Type-only `Pick<PhysicsWorld, getters>` slices for render/audio, and the presentation determinism test |
| A sink exception breaking rule state | Tampering | Hook called last, total sink implementations, router fault isolation (existing) |

## Sources

### Primary (HIGH confidence)
- Codebase, read this session: `src/sandbox/main.ts`, `src/sandbox/debug-draw.ts`, `src/sim/loop.ts`, `src/physics/types.ts`, `src/physics/constants.ts`, `src/app/collision-router.ts`, `src/game/reactive-elements.ts`, `src/game/game-session.ts`, `src/game/tuning.ts`, `src/control/plunger-controller.ts`, `src/control/flipper-controller.ts`, `src/table/spec.ts`, `src/table/resolve.ts`, `src/ui/hud.ts`, `index.html`, `vitest.config.ts`, `src/sandbox/game.determinism.test.ts`
- Planning: `.planning/STATE.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `04-UAT.md`, `04-UI-REVIEW.md`, `.planning/research/PITFALLS.md` and `ARCHITECTURE.md`
- Test baseline run: `npx vitest run` gave 518 passed and 3 timeouts

### Secondary (MEDIUM, official docs fetched this session)
- MDN Web Audio Best practices (autoplay / gesture): https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- WHATWG HTML activation-triggering input event: https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event
- MDN Optimizing canvas: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- MDN exponentialRampToValueAtTime: https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/exponentialRampToValueAtTime
- MDN AudioScheduledSourceNode.start: https://developer.mozilla.org/en-US/docs/Web/API/AudioScheduledSourceNode/start
- MDN requestAnimationFrame (refresh-rate matching, background pause): https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- W3C Web Audio API spec, §1.1.6 fire-and-forget: https://webaudio.github.io/web-audio-api/

### Tertiary (LOW)
- Recipe and flash numbers: training knowledge, marked [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No changes; installed versions verified.
- Architecture and seams: HIGH. Every seam was read in source this session.
- Pitfalls: HIGH for API contracts (cited). MEDIUM for perf magnitudes (the fill-rate math is from the measured UAT numbers).
- Recipes and timing: MEDIUM-LOW. Taste, tuned at UAT.

**Suggested plan slicing (MVP, two parallel tracks after Wave 0):**
- Wave 0: test infra (timeout, recorder, fake ctx, asset gate, A5 fixture)
- Render track: view-transform plus HiDPI fix, then loop flipper snapshots plus interpolate, then static layer plus table renderer plus `?debug` switch, then FlashTracker plus contact-flash plus `ReactiveFeedback` hook
- Audio track: envelope/mapping/voice-pool, then engine plus unlock, then recipes, then PresentationObserver cue wiring
- Join: presentation determinism test, then human UAT (60/144 Hz look, listening pass, HUD restyle per Open Question 1)

**Research date:** 2026-11-21
**Valid until:** 2026-12-21 (stable browser APIs; the codebase seams are valid until Phase 5 code lands)
