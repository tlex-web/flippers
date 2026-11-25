# Phase 5: Rendering & Audio - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** 34 (22 new source/test-support, 12 modified/extended)
**Analogs found:** 31 / 34

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/render/view-transform.ts` | utility (pure) | transform | `src/sandbox/debug-draw.ts` resize (~L180-200) | role-match (fix the sizing bug) |
| `src/render/interpolate.ts` | utility (pure) | transform | `src/sandbox/main.ts` ball interpolation + `src/sim/loop.ts` snapshots | role-match |
| `src/render/flash.ts` | store (presentation) | event-driven, step clock | `src/game/reactive-elements.ts` (step counter, cooldown by id) | partial |
| `src/render/palette.ts` | config | static | `src/sandbox/debug-draw.ts` `COL_*` constants | exact |
| `src/render/static-layer.ts` | component (canvas) | batch (bake once) | `src/sandbox/debug-draw.ts` `drawElements` | role-match |
| `src/render/sprites.ts` | component (canvas) | batch (bake once) | `src/sandbox/debug-draw.ts` | partial |
| `src/render/table-renderer.ts` | component (canvas) | request-response (per frame) | `src/sandbox/debug-draw.ts` `DebugRenderer.draw` | exact |
| `src/render/canvas-factory.ts` | provider (injected seam) | request-response | `src/ui/hud.ts` `TextSink` injected interface | partial |
| `src/render/contact-flash.ts` | middleware (bus listener) | event-driven | `src/game/reactive-elements.ts` `onEvent` | exact |
| `src/audio/audio-context-like.ts` | model (structural types) | n/a | `src/ui/hud.ts` `TextSink`/`HudSource`; `src/physics/types.ts` | role-match |
| `src/audio/envelope.ts` | utility (pure) | transform | `src/ui/hud.ts` pure `formatScore`/`statusText` | partial |
| `src/audio/mapping.ts` | utility (pure) | transform | same as above | partial |
| `src/audio/recipes.ts` | config (data) | static | `src/game/tuning.ts` | role-match |
| `src/audio/voice-pool.ts` | service | pooled, event-driven | `src/sim/loop.ts` pooled snapshots | partial |
| `src/audio/audio-engine.ts` | service | event-driven (enqueue/flush) | `src/app/collision-router.ts` (pull-then-dispatch) | partial |
| `src/audio/audio-unlock.ts` | middleware (DOM input) | event-driven | `src/input/game-input.ts` (`handle*` + `attach/detach`) | exact |
| `src/app/cue-queue.ts` | utility (ring buffer) | pub-sub, no-alloc | `src/app/collision-router.ts` + pooled event drain | role-match |
| `src/sandbox/presentation-observer.ts` (or inside main.ts) | service | event-driven (edge detection) | `src/sandbox/main.ts` onFixedStep / onPostStep | role-match |
| `src/sim/loop.ts` (MODIFY: flipper snapshots) | service | transform | itself, `snapshotInto`/`copyStates` | exact |
| `src/game/reactive-elements.ts` (MODIFY: optional `ReactiveFeedback` hook) | service | event-driven | itself, `kick`/`onSensor` | exact |
| `src/sandbox/main.ts` (MODIFY: wiring, `?debug`, resize/dpr) | composition root | request-response | itself | exact |
| `src/input/game-input.ts` (MODIFY: `KeyM` mute edge) | middleware | event-driven | itself | exact |
| `index.html` (MODIFY: space-theme CSS, `M` mute controls row) | config/markup | static | itself L63-152 | exact |
| `src/ui/hud.ts` (MODIFY: restyle only if class hooks needed) | component (DOM) | write-on-change | itself | exact |
| `vitest.config.ts` (MODIFY: `testTimeout: 30000`) | config | n/a | itself | exact |
| `src/render/test/recording-context.ts` | test support | n/a | `src/ui/hud.test.ts` `CountingSink` fake | partial |
| `src/audio/test/fake-audio-context.ts` | test support | n/a | `src/ui/hud.test.ts` `CountingSink` fake | partial |
| `src/render/*.test.ts`, `src/audio/*.test.ts`, `src/app/cue-queue.test.ts` | test | unit | `src/ui/hud.test.ts`, `src/harness/prng.test.ts` | role-match |
| `src/render/asset-free.test.ts` | test | file-I/O (fs grep) | none | no analog |
| `src/sim/loop.flippers.test.ts` | test | unit | `src/sim/loop.determinism.test.ts`, `loop.tabblur.test.ts` | exact |
| `src/game/reactive-elements.test.ts` (EXTEND) | test | unit | itself | exact |
| `src/sandbox/presentation.determinism.test.ts` | test | integration | `src/sandbox/game.determinism.test.ts` | exact |
| `src/sandbox/presentation-observer.test.ts` | test | unit | `src/sandbox/game-e2e.test.ts` (makeGame composition) | role-match |

## Pattern Assignments

### `src/render/table-renderer.ts` (component, per-frame)
**Analog:** `src/sandbox/debug-draw.ts` `draw()` (~L200-235)
Keep the read-only signature shape: takes `PhysicsWorld` getters, interpolated balls, plunger charge, optional `LightState` (rules' `isLit`). Replace the per-frame clear with one blit:
```ts
// analog (debug-draw.ts draw):
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.fillStyle = COL_BG;
ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.translate(this.offX, this.offY);
this.drawElements(world.getElements(), lights);
```
New: `ctx.drawImage(staticLayer.canvas, 0, 0)` at identity, then `ctx.setTransform(view.scale,0,0,view.scale,view.offX,view.offY)`. Never set `shadowBlur > 0` here (test-enforced); reset `globalCompositeOperation`/`globalAlpha` at frame end. Use `getContext("2d", { alpha: false })`.

### `src/render/view-transform.ts` (pure)
**Analog:** `src/sandbox/debug-draw.ts` resize (L180-200) — copy `boundsOf(world.getElements())` + `METER_MARGIN_X_M` / `PULLBACK_MARGIN_Y_M` margins, but invert the order (the G-04-6 bug):
```ts
// analog (WRONG order, do not copy as-is):
this.canvas.width = Math.round(this.boxWpx * this.dpr);
const fit = Math.min((window.innerWidth * 0.96) / this.boxWpx, (window.innerHeight * 0.96) / this.boxHpx, 1);
this.canvas.style.width = `${this.boxWpx * fit}px`;
```
New: compute `fit` first; `backingW = Math.round(cssW*dpr)`; `scale = fit * PIXELS_PER_METER * dpr` (`src/physics/constants.ts:77`). No `window` access in the module: pass viewport + dpr as args.

### `src/render/palette.ts`
**Analog:** `COL_*` module constants in `src/sandbox/debug-draw.ts` header. One meaning per color (RESEARCH notes `#ef476f` triple use to fix).

### `src/render/static-layer.ts` / `sprites.ts`
**Analog:** `DebugRenderer.drawElements` (switch on `ElementKind` from `src/table/spec.ts:25-26`). Starfield via `mulberry32` (`src/harness/prng.ts:21`, `export function mulberry32(seed: number): () => number`) with a fixed seed. `shadowBlur` allowed at bake only. Re-bake on every resize/dpr change.

### `src/render/contact-flash.ts` and `src/render/flash.ts`
**Analog:** `src/game/reactive-elements.ts` bus listener (L329+) and step-counter cooldowns:
```ts
/** Bus listener, bound once: record and award, never touch the world here. */
private readonly onEvent = (e: CollisionEvent): void => {
  const kind = e.elementKind;
  if (kind === "rollover" || kind === "lane") { this.onSensor(e); return; }
  if (kind !== "bumper" && kind !== "slingshot") return;
```
Copy: bound-once arrow listener, filter by `elementKind`, register via `router.on(...)`-style registration in constructor (see `reactive-elements.ts:193` `constructor(world, router, gate)`). Contact-flash handles only wall/chute/flipper at `normalImpulse >= SLING_MIN_IMPULSE` (from `src/game/tuning.ts`). Flash table = `Float64Array(601)` indexed by element id, step clock incremented on postStep.

### `src/game/reactive-elements.ts` (MODIFY)
Add optional `feedback?: ReactiveFeedback` ctor arg; call it after `gate.award(...)` in `onSensor` (L308-327) and at the kick registration point — never when `!this.gate.isLive()` or inside cooldown (those early returns already exist):
```ts
if (this.step < rule.armedAtStep) return;
if (!this.gate.isLive()) return;
rule.armedAtStep = this.step + SENSOR_REARM_STEPS;
...
this.gate.award(ROLLOVER_POINTS);   // feedback goes AFTER award (spy-order test)
```

### `src/sim/loop.ts` (MODIFY)
Mirror ball snapshot pair for flipper angles. Pattern (L36-46):
```ts
private readonly previousStates: BallSnapshot[] = [];
private readonly currentStates: BallSnapshot[] = [];
constructor(world: PhysicsWorld) {
  this.world = world;
  this.snapshotInto(this.currentStates);
  this.copyStates(this.currentStates, this.previousStates);
}
```
In `advance()`, copy current->previous before `world.step()` and snapshot after, exactly where balls are done. Pooled, no per-frame alloc; header comment style with threat refs.

### `src/app/cue-queue.ts`
**Analog:** `src/app/collision-router.ts` contract header (L1-24): no per-event alloc, pooled records mutated in place, fault isolation. Fixed-capacity ring of preallocated `{cue, elementId, strength}`; overflow drops (no growth).

### `src/audio/audio-engine.ts`, `voice-pool.ts`
**Analog:** `CollisionRouter` pull-then-dispatch: `enqueue` on step path (no alloc), `flush()` once per render frame. Error isolation like `reportListenerError` (`collision-router.ts` ~L34-37): catch, `console.error("[audio] ...")`, keep running. Inject `AudioContextLike` and `rng` (prod `Math.random`, tests `mulberry32`).

### `src/audio/audio-unlock.ts` and `src/input/game-input.ts` (MODIFY: `KeyM`)
**Analog:** `src/input/game-input.ts` header contract: logic in directly callable `handle*` methods, `attach()/detach()` only wire `window`/`document`; ignore `event.repeat`; `preventDefault()` only for bound codes; blur clears held. Add `mute` as another press-only edge (KeyM) next to `nudgeLeft/Right/Up`. Unlock: check `event.isTrusted`, create ctx lazily once, `resume()` later if not running.

### `src/audio/audio-context-like.ts`, `canvas-factory.ts`
**Analog:** `src/ui/hud.ts` structural seam:
```ts
/** Where the HUD writes text. An `HTMLElement` satisfies it. */
export interface TextSink { textContent: string | null; }
```
Same rule: no DOM globals at module scope; real browser objects satisfy the interface structurally.

### `src/audio/recipes.ts`
**Analog:** `src/game/tuning.ts` — exported named constants with doc comments; one recipe per cue (bumper, flipperUp/Down, sling, drain, launch, tilt, rollover, lane).

### `src/sandbox/main.ts` (MODIFY)
Keep as composition root. Existing seams: `loop.advance(dt, onFixedStep, onPostStep)`; `onPostStep` does `router.dispatch()` (L211) — add flash step tick + presentation observer edges there. Replace `new DebugRenderer(canvas)` (L216) with `new TableRenderer(...)` unless `?debug`. Resize listener at L235 (`window.addEventListener("resize", () => renderer.resize(world))`) plus matchMedia dpr re-arm. `hudView.update(session)` at L330 stays. Pass `feedback` into `new ReactiveElements(world, router, session)` (L161).

### `index.html` (MODIFY)
Controls list `<dl id="hud-controls">` L133-144: add
```html
<dt>Mute</dt>
<dd><kbd data-code="KeyM">M</kbd></dd>
```
(`data-code` lets `src/ui/key-labels.ts` relabel for layout). Restyle `.hud-*` CSS L40-120 to space theme; no `url(`/fonts (asset-free gate).

### Tests
- `src/sandbox/presentation.determinism.test.ts` — copy `src/sandbox/game.determinism.test.ts` wholesale (imports L1-15, SCRIPT/play() at 60/120/144 Hz, TOTAL_MS mid-step), attach the full presentation layer (with recording ctx + fake audio ctx) to one run, assert bit-identical.
- `src/sim/loop.flippers.test.ts` — follow `src/sim/loop.determinism.test.ts`.
- Fakes (`recording-context.ts`, `fake-audio-context.ts`) — follow `CountingSink implements TextSink` in `src/ui/hud.test.ts` L24+: tiny class implementing the narrow interface and counting calls.
- Test header style: `import { describe, it, expect } from "vitest";` then a doc block naming plan/requirement IDs.

## Shared Patterns
- **Engine isolation:** only `src/physics/planck-world.ts` imports Planck; all new modules use `PhysicsWorld`/`Pick<PhysicsWorld, ...>` (`reactive-elements.ts:63`).
- **No per-step allocation / pooled mutation:** `sim/loop.ts`, `collision-router.ts` contract.
- **Bus is one-way:** listeners never call back into world.
- **Injected seams, node-testable:** `hud.ts` TextSink; Vitest `environment: "node"`.
- **Header doc comments** citing requirement IDs and threats (every existing module).

## No Analog Found
| File | Role | Reason |
|---|---|---|
| `src/render/asset-free.test.ts` | test (fs grep) | No fs-scanning tests exist; use RESEARCH RND-01 pattern list with `node:fs` readdir recursion. |
| `src/audio/envelope.ts` / Web Audio graph | utility | No audio code exists; use RESEARCH Code Examples. |
| `src/render/sprites.ts` glow baking | component | No offscreen-canvas code exists; use RESEARCH Pattern 2. |

## Metadata
**Search scope:** `src/**`, `index.html`, `vitest.config.ts` (all git-tracked)
**Files scanned:** ~15
