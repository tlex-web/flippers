# Phase 6: Juice & Polish - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 27 (11 new, 16 modified)
**Analogs found:** 26 / 27 (all analogs are git-tracked `src/` files)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/game/skill-shot.ts` (NEW) | rule module | step-driven state | `src/game/tilt-meter.ts` | exact |
| `src/game/ball-save.ts` (NEW) | rule module | step-driven state | `src/game/tilt-meter.ts` | exact |
| `src/game/bonus.ts` (NEW) | rule module + pure fns | transform | `src/game/tilt-meter.ts` + `flashLevel` in `src/render/flash.ts` | role-match |
| `src/game/high-score.ts` (NEW) | domain module, injected I/O | file-I/O (storage) | `src/ui/hud.ts` (`TextSink` injection) | partial (no storage analog) |
| `src/game/game-session.ts` (MOD) | FSM / rules gate | event-driven + step | itself (lines 97-286) | self |
| `src/game/reactive-elements.ts` (MOD) | rules / kicker | event-driven (record-then-service) | itself (bumper branch, lines 296-394) | self |
| `src/game/tuning.ts` (MOD) | config | — | itself | self |
| `src/table/spec.ts` (MOD) | config / geometry | — | element 600 drain sensor in same file | self |
| `src/control/plunger-controller.ts` (MOD: export `isRestingInZone`) | controller | read | `ballRestingInZone` lines 208-218 | self |
| `src/render/shake.ts` (NEW) | presentation tracker | step-clock | `src/render/flash.ts` `FlashTracker` | exact |
| `src/render/particles.ts` (NEW) | presentation pool | step-clock, SoA | `src/render/flash.ts` (typed arrays) + `src/harness/prng.ts` | role-match |
| `src/render/lamps.ts` (NEW) | presentation tracker | step-clock | `src/render/flash.ts` `FlashTracker` | exact |
| `src/render/effects.ts` (NEW) | sink / router | event-driven | `src/app/cue-queue.ts` `CueFeedback` (160-188) | exact |
| `src/render/table-renderer.ts` (MOD) | renderer | per-frame draw | itself (draw 313-333, drawBalls 532-554) | self |
| `src/render/static-layer.ts` (MOD) | bake | resize-time | itself (bakeStatic switch 200-256) | self |
| `src/render/sprites.ts` (MOD: bakeShadow, bakeStar) | bake | resize-time | `bakeHalo` lines 44-60 | exact |
| `src/render/flash.ts` (MOD: `post` timing) | config | — | `FLASH_TIMING` lines 47-56 | self |
| `src/render/palette.ts` (MOD) | config | — | itself | self |
| `src/app/cue-queue.ts` (MOD) | event queue | pub-sub | itself (`CueKind` 27-57, `CueFeedback` 169-188) | self |
| `src/audio/recipes.ts` (MOD) | config | — | `start`/`bank`/`warning` recipes (360-402) | self |
| `src/sandbox/presentation-observer.ts` (MOD) | observer | diff counters → cues | itself (`releases` counter diff 120-124) | self |
| `src/sandbox/debug-draw.ts` (MOD: `KIND_STYLE.post`) | config | — | `KIND_STYLE` lines 96-107 | self |
| `src/sandbox/main.ts` (MOD) | composition root | wiring | itself (dpr matchMedia 330-343, onFixedStep 250-276, onPostStep 282-292) | self |
| `src/ui/hud.ts` (MOD + `BonusView`) | DOM view | write-on-change | `HudView` 82-130, `MuteView` 205-227 | exact |
| `index.html` (MOD) | markup/CSS | — | existing `.hud-ball`, `:root` | self |
| `src/harness/reactive-table-soak.gate.test.ts` (MOD / sibling gate) | test gate | batch soak | itself | self |
| Tests: `skill-shot.test.ts`, `ball-save.test.ts`, `bonus.test.ts`, `high-score.test.ts`, `shake.test.ts`, `particles.test.ts`, `lamps.test.ts` | test | unit | `src/game/tilt-meter.test.ts`, `src/render/flash.test.ts`, `src/ui/hud.test.ts` | exact |

## Pattern Assignments

### `src/game/skill-shot.ts`, `src/game/ball-save.ts`, `src/game/bonus.ts` (pure rule modules)

**Analog:** `src/game/tilt-meter.ts` (whole file, 88 lines)

Copy: module doc block stating "pure: no world, no clock, no random source; time is the number of `update()` calls" (lines 1-20); constants imported from `./tuning` (line 23); string-union outcome type (line 26); optional config with `?? TUNING_CONST` defaults (lines 34-59); `update()` once per fixed step; `reset()`; read-only getters.

```ts
import { FIXED_DT } from "../physics/constants";
import { TILT_DECAY_PER_S, TILT_LEVEL, TILT_NUDGE_COST, TILT_WARNING_LEVEL } from "./tuning";
export type NudgeOutcome = "ok" | "warning" | "tilt";
export class TiltMeter {
  private level = 0;
  private warned = false;
  constructor(config: TiltMeterConfig = {}) {
    this.cost = config.cost ?? TILT_NUDGE_COST;
    this.decayPerStep = (config.decayPerS ?? TILT_DECAY_PER_S) * FIXED_DT;
  }
  update(): void { this.level = Math.max(0, this.level - this.decayPerStep); ... }
  reset(): void { this.level = 0; this.warned = false; }
  getLevel(): number { return this.level; }
}
```

- `SkillShot`: `arm()`, `disarm()`, `update(plungerPhase)` (rotate every 72 steps 400→401→402; freeze when phase `"charging"`), `resolve(kind, id): number` (returns value or 0), getters `getLitLane()`, `getPhase()`, `getCount()`.
- `BallSave`: `arm()`, `disarm()`, `update(ballX)` (start timer when `x + BALL_RADIUS_M < CHUTE_X`), `consume(kind)`, `lampPhase(): "off"|"steady"|"blink"` (blink when remaining ≤ 240).
- `bonus.ts`: counters + pure `rowRevealed(i, elapsed)` / `rowValue(i, elapsed)` in the style of `flashLevel` (`src/render/flash.ts` 72-79: guard non-finite, clamp, closed form).

---

### `src/game/high-score.ts` (domain module, injected storage)

**Analog:** injection style from `src/ui/hud.ts` lines 25-35 (no DOM globals at module scope; structural interface an `HTMLElement` satisfies). Validation copied from `GameSession.award` (`src/game/game-session.ts` 264-270: `Number.isSafeInteger(points) || points < 0`).

```ts
/** Where the HUD writes text. An `HTMLElement` satisfies it. */
export interface TextSink { textContent: string | null; }
```

Use RESEARCH.md Pattern 10 verbatim for the body (`StorageLike`, `HISCORE_KEY = "flippers.hiscore.v1"`, `parseBest`, try/catch on every access). `main.ts` must wrap the `window.localStorage` read itself in try/catch and pass `null` on throw.

---

### `src/game/game-session.ts` (FSM, modified)

**Analog:** itself.

- `GameState` union line 77 → add `"bonus"`; exhaustive `switch` in `onStart()` (142-161) forces a case.
- Counter-getter pattern for presentation (nudge count/dir, drain count, skill/save counts + last step): copy `PlungerController.getReleaseCount()` / `getLastReleaseCharge()` (`src/control/plunger-controller.ts` 182-199) — incremented inside the existing transition, "changes no behavior".
- Private `credit(points)` = copy of `award()` (264-270) minus the `isLive()` line.
- Composition: private readonly field like `private readonly tilt = new TiltMeter();` (line 121); `tick()` (217-220) gains `skill.update(...)`, `save.update(...)`, bonus countdown.
- Optional constructor args (plunger phase reader, `HighScore`) appended with defaults so existing `game-session.test.ts` constructors compile.
- `service()` (167-184) is where backstop / bonus entry / bonus end → serve-or-game-over branch.
- Bus listener stays record-only (282-285):
```ts
private readonly onEvent = (e: CollisionEvent): void => {
  if (e.elementKind === "drain" && e.ballId === this.active) this.drained = e.ballId;
};
```
- Implement `RuleHooks` (`onSwitch`, `trySave`) on `GameSession`, as it already implements `RulesGate` (line 97).

---

### `src/game/reactive-elements.ts` (modified)

**Analog:** itself.

- `RuleHooks` interface + frozen no-op default: copy `NO_FEEDBACK` (lines 82-85):
```ts
const NO_FEEDBACK: ReactiveFeedback = Object.freeze({
  onKick(): void {},
  onSensor(): void {},
});
```
  Add as a 5th optional ctor arg after `feedback: ReactiveFeedback = NO_FEEDBACK` (line 223).
- `onKick` signature (76-79) gains scalar `px, py`; pass `e.point.x, e.point.y` at line 392.
- Hook call placement: after `this.gate.award(...)`, before `this.feedback.on*` — lines 347-348, 351/365, 391-392.
- Post kicker: reuse bumper kick law in `kick()` (316-337) unchanged — normal from center to ball, raise `vn` to `targetSpeed`, `applyImpulse`. Add a `"post"` branch in `onEvent` (369-393) before the bumper/sling filter: `gate.isLive()` → `e.point.y < post.cy` → `hooks.trySave(e.ballId)` → `pendingBall = e.ballId`.

---

### `src/table/spec.ts` (modified)

**Analog:** drain sensor element `id: 600` (line ~390) and `ElementKind` union (lines 25-26).
- Add `"post"` to the union (only definition site, per doc comment lines 20-24).
- Add `{ id: 610, kind: "post", center: { x: PLAYFIELD_CENTER_X, y: 5.8 }, radius: 0.09, sensor: true }` after 600.
- Export `CHUTE_X` (currently `const CHUTE_X = 2.9;` line 185, not exported).
- Compile-forced follow-ups: `FLASH_TIMING` (`src/render/flash.ts` 47-56), `KIND_STYLE` (`src/sandbox/debug-draw.ts` 96-107), `bakeStatic` `never` default (`src/render/static-layer.ts` 244-248 → add `case "post": continue;`).

---

### `src/control/plunger-controller.ts` (modified)

Extract `ballRestingInZone` (208-218) body into exported pure `isRestingInZone(ball, zone)` using the same `PLUNGER_REST_SPEED_EPS`; private method delegates to it.
```ts
const inZone = b.x >= z.minX && b.x <= z.maxX && b.y >= z.minY && b.y <= z.maxY;
return inZone && Math.hypot(b.vx, b.vy) < PLUNGER_REST_SPEED_EPS;
```

---

### `src/render/shake.ts`, `src/render/lamps.ts` (step-clock trackers)

**Analog:** `src/render/flash.ts` `FlashTracker` (lines 91-139).

Copy: doc block explaining step-clock + `alpha` read (1-23); preallocated typed arrays in the ctor (99-104); `tick()` as the last `onPostStep` call (116-119); alpha clamp idiom (129):
```ts
const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
```
and guard idiom `if (!Number.isInteger(id) || id < 0 || id > this.maxId) return;` (111).

- `LampTracker`: `Float32Array prev/cur`, copy `cur→prev` then step toward target (+1/4, −1/15); read `prev + (cur-prev)*a`.
- `ShakeTracker`: scalar fields only; `sample(step, alpha, dpr, reducedMotion)` writes into `this.x/this.y` (no returned object). Closed-form kick replaces prior kick.

---

### `src/render/particles.ts` (SoA pool)

**Analog:** typed-array allocation in `FlashTracker` ctor (`src/render/flash.ts` 99-104) + `mulberry32` (`src/harness/prng.ts` 20-33; precedent: `static-layer.ts` line 13 already imports it into render tier).
- 160-slot `Float32Array` per field + `Uint8Array type`, ring `head`; `tick()` copies x→px, integrates drag/gravity.
- Own stream: `private readonly rnd = mulberry32(PARTICLE_SEED);` never `Math.random`.

---

### `src/render/effects.ts` (FxSink)

**Analog:** `CueFeedback` (`src/app/cue-queue.ts` 169-188):
```ts
export class CueFeedback implements ReactiveFeedback {
  constructor(cues: CueQueue, flash: FlashSink | null = null) { ... }
  onKick(kind, elementId, normalImpulse): void {
    const s = impulseStrength(normalImpulse, BALL_MASS);
    this.cues.push(kind, elementId, s);
    if (this.flash) this.flash.record(elementId, Math.max(KICK_FLASH_FLOOR, s));
  }
}
```
Add `fx: FxSink | null = null` as a 3rd optional ctor arg to `CueFeedback`, mirroring `flash`. `EffectsTracker` precomputes bumper centers / sling `deriveKickFace` normals from `getElements()` at construction (like `maxElementId` scan, flash.ts 82-89).

---

### `src/render/sprites.ts` (bakeShadow, bakeStar)

**Analog:** `bakeHalo` (lines 44-60) — `layers.create(n, n)`, radial gradient, stop strings built at bake time only, reset transform/alpha/composite before fill. Import colors from `palette.ts` (`SHADOW_CORE`, `SHADOW_FADE`) instead of literals.

---

### `src/render/table-renderer.ts` (modified)

**Analog:** itself.
- `draw()` (313-333): currently
```ts
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.drawImage(layer.canvas, 0, 0);
ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
...
this.drawLitRollovers(frame.lights);
if (frame.flash) this.drawFlashes(...);
this.drawFlippers(...); this.drawPlunger(...); this.drawBalls(frame.balls, view);
ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
```
  → insert `fillRect(BG_BOTTOM)` before blit, blit at `(shakeX, shakeY)`, then UI-SPEC order (lamps, flash, post, bats, plunger, shadows, balls, particles).
- Replace the 4 `setTransform(view.scale, …, view.offX, view.offY)` sites (lines 321, 433, 486, 551) with a private `resetWorld()` using cached `this.tx/this.ty`.
- `drawLitRollovers` (335-347) is replaced by the lamp pass; keep `traceElement` + `RUBBER_LINE_M` stroke idiom.
- Halo sprite bake at resize (300-308) — add lamp halos, shadow, star sprites there.
- `LightState` (line 68) extended; `RenderFrame.lights` stays optional/nullable (line 91).

---

### `src/render/static-layer.ts` (modified)

**Analog:** `bakeStatic` (200-256). Per-element switch; add drop-shadow before each case's draw, light pool after `drawBackground` (203), unlit lenses after the loop, vignette last at identity. Keep final reset:
```ts
ctx.shadowBlur = 0;
ctx.globalAlpha = 1;
return drawn;
```
Rollover unlit idiom (229-233) is the lens template.

---

### `src/app/cue-queue.ts` (modified)

Add `nudge`, `skillShot`, `ballSave`, `highScore`, `bonusTick` to `CueKind` (27-40) **and** `CUE_KINDS` (43-57; update "All 13" comment → 18). Nudge direction travels as `elementId` or `strength` scalar (the `push(kind, elementId, strength)` signature, line 126, has no payload slot).

### `src/audio/recipes.ts` (modified)

`RECIPES: Record<CueKind, CueRecipe>` (line 109) is compile-forced. Copy the `start` recipe shape (376-388):
```ts
start: {
  peak: 0.5,
  layers: [note("triangle", 523, 0, FIGURE_ENV), note("triangle", 659, 0.1, FIGURE_ENV), note("triangle", 784, 0.2, FIGURE_ENV)],
  maxSemitones: 0, jitterCents: 0, cap: 1, levelFromStrength: false,
},
```
`highScore` = ascending 3-note figure; `skillShot` = 2-note; `bonusTick` = short `CHIME_ENV`-style single note (see `lane`, 188-196).

---

### `src/sandbox/presentation-observer.ts` (modified)

**Analog:** release-counter diff (lines 120-124):
```ts
if (releases > this.prevReleases) {
  const charge = this.plunger.getLastReleaseCharge();
  for (let n = this.prevReleases; n < releases; n++) this.cues.push("launch", NO_ELEMENT, charge);
}
```
Apply to new session counters (drain, nudge, skillShot, ballSave, highScore, bonus row reveals). Replace drain inference at 130-134 (`ball > this.prevBall`) with the drain counter — breaks under `"bonus"` delay and backstop re-serve. Widen `ObserverSession` `Pick<>` (line 39).

---

### `src/sandbox/main.ts` (modified)

- Reduced motion: copy dpr `matchMedia(...).addEventListener("change", ...)` (lines 333-342) → a `let reducedMotion` boolean read by renderer/HUD.
- Flipper-press skip latch: in `onFixedStep` near the flipper edge drain, call `session.onFlipperPress()` (same spot style as `ge.start && session.onStart()`, line ~268).
- `onPostStep` (282-292): order becomes `dispatch → reactive.service → session.service → observer.observe → lamps.update → effects.tick → flash.tick`.
- `new ReactiveElements(..., feedback, session)` — session passed twice (gate + hooks).

---

### `src/ui/hud.ts` (modified + `BonusView`)

**Analog:** `HudView` (82-130) per-line cache-and-compare; `MuteView` (205-227) for a single-line view with optional second sink.
```ts
if (first || score !== this.lastScore) {
  this.score.textContent = formatScore(score);
}
```
- `ballText` (55-63) / `statusText` (71-80) exhaustive switches must add `"bonus"`; `statusText` becomes `(code, arg)`.
- Count-up: `update(src, dtSeconds, reducedMotion)`; write only when `Math.round(shown)` changes.
- New `AttrSink { setAttribute(n: string, v: string): void; removeAttribute(n: string): void }` mirroring `TextSink` (33-35).
- `BonusView` follows `DiagView` (152-183) structure: cached last values, early return when unchanged.

---

### `src/harness/reactive-table-soak.gate.test.ts` (armed-save gate + RED control)

**Analog:** itself (whole file). Copy `envNumber` helper, `SoakConfig.makeWorld` injection, and the "kicks actually fired" non-vacuous assertion (`expect(kicks).toBeGreaterThan(0)`). The armed-save variant needs `ReactiveSoakWorld` (`src/harness/reactive-world.ts`) to accept an always-armed `RuleHooks`; RED control = `KICKBACK_SPEED` 20 must exceed `ENERGY_MAX_SPEED = 15`.

## Shared Patterns

### Step clock, never wall clock
**Source:** `src/render/flash.ts` 1-23, 116-119; `src/game/tilt-meter.ts` 1-20. **Apply to:** all new rule modules and trackers. Time = count of `tick()/update()` calls; render reads at `step + alpha`.

### Record-then-service (single world-write path)
**Source:** `src/game/reactive-elements.ts` 302-311 (`service()`) and 367-393 (listener only records). **Apply to:** post kickback, backstop, bonus credit. Listeners never touch the world.

### Optional trailing ctor args with frozen no-op defaults
**Source:** `reactive-elements.ts` 82-85, 223; `CueFeedback` ctor `flash: FlashSink | null = null`. **Apply to:** `RuleHooks`, `FxSink`, plunger-phase reader, `HighScore` injection — keeps every existing test constructor compiling.

### Read-only counters for presentation
**Source:** `src/control/plunger-controller.ts` 182-199. **Apply to:** every new `GameSession` getter the observer/lamps/HUD diff.

### Integer score guard
**Source:** `game-session.ts` 264-270. **Apply to:** `credit()`, `HighScore.submit`, `parseBest`.

### Bake at resize, `"lighter"` + `globalAlpha` live
**Source:** `sprites.ts` 44-60; `table-renderer.ts` 300-308. **Apply to:** lamp halos, shadow, star glint. No string building or `shadowBlur` in `draw()`.

### Injected DOM sinks
**Source:** `src/ui/hud.ts` 25-35. **Apply to:** `AttrSink`, `StorageLike`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/game/high-score.ts` storage I/O | domain | storage I/O | No `localStorage` use in repo; use RESEARCH.md Pattern 10 directly (injection style from `hud.ts`). |

## Metadata

**Analog search scope:** `src/game`, `src/render`, `src/app`, `src/audio`, `src/ui`, `src/sandbox`, `src/control`, `src/table`, `src/harness`
**Files scanned:** ~20 read directly (of 104 tracked under `src/`)
**Pattern extraction date:** 2026-11-22
