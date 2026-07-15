# Phase 3: Table, Plunger & Event Bus - Pattern Map

**Mapped:** 2026-07-16
**Files analyzed:** 11 (5 new, 6 modified) + 6 Wave-0 test files
**Analogs found:** 11 / 11 (every file has a strong in-repo analog — this is a refactor-plus-extension of an established codebase)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/table/spec.ts` (NEW) | config / model | transform (data descriptors) | `src/physics/constants.ts` (HMR const pattern) + `src/physics/types.ts` (engine-agnostic types) | role-match (split analog) |
| `src/table/resolve.ts` (NEW) | utility | transform (curve→vertex tessellation) | `src/harness/containment.ts` (pure engine-agnostic geometry helpers) | role-match |
| `src/control/plunger-controller.ts` (NEW) | controller (FSM) | event-driven | `src/control/flipper-controller.ts` | exact |
| `src/input/plunger-input.ts` (NEW) | input | event-driven (edge-latched) | `src/input/flipper-input.ts` | exact |
| `src/app/collision-router.ts` (NEW) | service (dispatcher) | pub-sub / event-driven | `drainEvents()` pool in `planck-world.ts` + drain seam in `sandbox/main.ts` | role-match (composed analog) |
| `src/physics/types.ts` (MOD) | model / interface | request-response (contract) | itself (in-place evolution, D-12/D-09/D-02) | exact (self) |
| `src/physics/planck-world.ts` (MOD) | adapter / service | CRUD + event-driven | itself (`buildBoundary`/`buildFlipper`/post-solve/`setFlipperMotor`) | exact (self) |
| `src/physics/constants.ts` (MOD) | config | transform | itself (append plunger consts) | exact (self) |
| `src/sandbox/main.ts` (MOD) | composition root / wiring | event-driven | itself (`onFixedStep` drain seam) | exact (self) |
| `src/sandbox/debug-draw.ts` (MOD) | renderer / view | request-response (read-only) | itself (`drawWalls`/`drawFlippers`/`resize`) | exact (self) |
| `src/harness/{soak,containment}.ts` (MOD) | test / harness | batch | itself (`getBoundarySegments()` readers) | exact (self) |

**Note on `src/app/`:** the directory does not exist yet. RESEARCH proposes `src/app/collision-router.ts`; CONTEXT calls it "app-level `CollisionRouter`". Either `src/app/` (new) or `src/sandbox/` is acceptable per D-11/Claude's discretion — the analog patterns below are identical regardless of directory.

---

## Pattern Assignments

### `src/table/spec.ts` (NEW — config/model, engine-agnostic data)

**Analog A (const/doc discipline):** `src/physics/constants.ts`
**Analog B (engine-agnostic value types):** `src/physics/types.ts`

**Reference-anchored, HMR-tunable module docblock to mirror** (`constants.ts:1-22`) — the spec is "the geometric sibling of `constants.ts`" (D-01). Copy this exact framing: plain exported consts, "single source of truth," behavior-only anchoring, HMR "change a number, feel it."

**Derived-const pattern to copy** (`constants.ts:34-41`) — the spec must derive the right flipper cluster from the left and size drains/lanes from `BALL_RADIUS_M` the way `IN_PLANE_GRAVITY` derives from `INCLINE_DEG`:
```typescript
export const IN_PLANE_GRAVITY = Math.sin((INCLINE_DEG * Math.PI) / 180) * G_FULL;
```
So `spec.ts` may `import { BALL_RADIUS_M, FLIPPER_LENGTH_M } from "../physics/constants"` — but **NEVER** `planck` (engine-isolation rule; `types.ts:5-8`, `planck-world.ts:1-3`).

**Engine-agnostic value types to reuse verbatim** (`types.ts:16-26`) — do not redefine; import these:
```typescript
export interface Vec2 { readonly x: number; readonly y: number; }
export interface Segment { readonly a: Vec2; readonly b: Vec2; }
```

**Discriminated-union descriptor shape** (from RESEARCH Pattern 1, Claude's discretion on exact types) — `ElementKind = "wall"|"chute"|"drain"|"bumper"|"slingshot"|"lane"|"rollover"|"flipper"`; each `ElementSpec` carries `{ readonly id, readonly kind }` + kind-specific geometry. `WIDTH_M`/`HEIGHT_M` (currently `planck-world.ts:66-67`) and `FLIPPER_PIVOT_L/R` (currently `planck-world.ts:101-105`) move here (D-02).

**How this file follows the analog:** it is `constants.ts`'s doc/HMR/derivation discipline applied to *geometry* instead of scalars, expressed in `types.ts`'s engine-free `Vec2`/`Segment` vocabulary.

---

### `src/table/resolve.ts` (NEW — utility, pure transform)

**Analog:** `src/harness/containment.ts` (pure, engine-agnostic geometry module)

**Pure-function-module style to mirror** (`containment.ts:49-113`) — top-level pure helpers over `Vec2`/`Segment`, no class, no engine import, no allocation on the hot path:
```typescript
function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
export function segmentsIntersect(p1, p2, q1, q2): boolean { /* ... */ }
```
`resolve.ts` exposes `resolve(spec): readonly ResolvedElement[]` and an `arcSegments(...)` tessellator in this same shape (RESEARCH Pattern 2: chord-error `Δθ = 2·acos(1 − ε/r)`, ε≈0.02 tied to `BALL_RADIUS_M`).

**Sub-sampling / chord-resolution precedent already in-repo** (`containment.ts:199-201`) — the harness already derives a sample count from a travel bound; the resolver's chord-count derivation mirrors it:
```typescript
const sampleRes = radius * 0.25;
const subSteps = Math.max(1, Math.ceil(tipTravel / sampleRes));
```

**How this file follows the analog:** same pure-geometry-over-`Vec2` module shape as `containment.ts`, producing the ONE `ResolvedElement[]` that fixtures, debug-draw, and containment all read (SC#4 structural guarantee).

---

### `src/input/plunger-input.ts` (NEW — input, edge-latched, event-driven)

**Analog:** `src/input/flipper-input.ts` (near 1:1 copy target — D-08)

**Module docblock + no-engine/zero-alloc contract** (`flipper-input.ts:1-27`) — copy wholesale; keys on `event.code`, latch-and-drain, force-clear on blur.

**`event.code` keying + repeat suppression + bound-only preventDefault** (`flipper-input.ts:119-128`) — the exact edge logic to replicate for `Space` (RESEARCH Pitfall 6):
```typescript
handleKeyDown(e: KeyEventLike): void {
  if (e.repeat) return;                       // OS auto-repeat never re-charges
  const side = CODE_TO_SIDE.get(e.code);
  if (!side) return;                          // unbound: no preventDefault
  e.preventDefault();                         // bound codes only (Space = page scroll)
  if (this.held.has(e.code)) return;          // de-dupe already-down
  const wasHeld = this.isSideHeld(side);
  this.held.add(e.code);
  if (!wasHeld) this.latchPress(side);        // one press edge on not-held→held
}
```

**`KeyEventLike` synthetic-friendly interface** (`flipper-input.ts:37-41`) — reuse this exact shape so headless tests feed plain objects (no DOM).

**Reused-view drain (zero alloc)** (`flipper-input.ts:159-166`) — the plunger latch drains the same way (single press/release pair instead of per-side):
```typescript
drainEdges(): InputEdges {
  this.view.leftPress = this.pending.leftPress; /* ...copy... */
  resetEdges(this.pending);
  return this.view;                            // SAME object every call
}
```

**Blur/visibility force-clear** (`flipper-input.ts:144-151, 208-212`) — a tab-blur mid-charge must emit a release edge (so charge does not strand); copy `handleBlur`/`handleVisibilityChange`/`forceClear`.

**How this file follows the analog:** it is `FlipperInput` reduced to a single control (`Space`) — same held-set/latch/drain/attach-detach skeleton, same `KeyEventLike`, same repeat/blur discipline.

---

### `src/control/plunger-controller.ts` (NEW — controller/FSM, event-driven)

**Analog:** `src/control/flipper-controller.ts` (mirror the input→FSM→thin-hook 1:1 — D-08)

**Engine-agnostic FSM docblock + type-only world import** (`flipper-controller.ts:1-27`):
```typescript
import type { PhysicsWorld } from "../physics/types";   // TYPE only — no planck
```
The controller drives the world SOLELY through the thin hook (`setFlipperMotor` there → `applyImpulse` here), so a future custom solver reuses it unchanged.

**Edge-handler shape to copy** (`flipper-controller.ts:87-111`) — `onPressEdge`/`onReleaseEdge` guard on phase, mutate FSM in place, call the hook. Plunger version (RESEARCH Pattern 3):
```typescript
onReleaseEdge(ballId: number): void {
  if (this.phase !== "charging") return;
  const mag = PLUNGER_MIN_IMPULSE + (PLUNGER_MAX_IMPULSE - PLUNGER_MIN_IMPULSE) * this.charge;
  this.world.applyImpulse(ballId, PLUNGER_AXIS.x * mag, PLUNGER_AXIS.y * mag);
  this.charge = 0; this.phase = "idle";
}
```

**Per-fixed-step `update()` — accumulate on the fixed step, never wall-clock** (`flipper-controller.ts:118-153`) — the FSM advances once per fixed step; the plunger accumulates `charge += PLUNGER_CHARGE_RATE * FIXED_DT` (clamped to `PLUNGER_MAX_CHARGE`) here (RESEARCH Pitfall 6 / determinism).

**Read-only normalized accessor pattern** (mirror `getPhase`, `flipper-controller.ts:77-80`) — expose `getCharge(): number` in `[0,1]` for the debug meter (D-10), the read-only-accessor twin of `getFlippers()`.

**How this file follows the analog:** identical `FlipperController` skeleton — type-only `PhysicsWorld`, edge handlers guarded by phase, `update()` advanced per fixed step, a read-only accessor — with a scalar charge instead of a settle-detector and `applyImpulse` instead of `setFlipperMotor`.

---

### `src/app/collision-router.ts` (NEW — service/dispatcher, pub-sub)

**Analog A (the pooled source it drains):** `planck-world.ts` `drainEvents()` / `nextEventSlot()`
**Analog B (the drain seam it replaces):** `sandbox/main.ts` `onFixedStep` + `world.drainEvents()`

**Zero-alloc reused-view contract it must preserve** (`planck-world.ts:742-756`) — the router drains this and fans it out WITHOUT copying:
```typescript
drainEvents(): CollisionEvent[] {
  const view = this.drainedEvents;
  for (let i = 0; i < this.eventCount; i++) { const slot = this.eventPool[i]; if (slot) view[i] = slot; }
  view.length = this.eventCount;
  this.eventCount = 0;
  return view;                                 // pooled + mutated next step — copy out if retained
}
```

**Current drain-and-discard seam to grow into the router** (`main.ts:140-145`) — today `main.ts` drains and throws away; the router slots in exactly here:
```typescript
world.drainEvents();   // ← replace with: router.dispatch() at the fixed-step seam
```

**Fan-out shape** (RESEARCH Pattern 4 — index loops, listeners registered once at startup, no per-event alloc):
```typescript
export class CollisionRouter {
  private readonly listeners: CollisionListener[] = [];
  constructor(private readonly world: Pick<PhysicsWorld, "drainEvents">) {}
  register(l: CollisionListener): void { this.listeners.push(l); }  // fixed = insertion order
  dispatch(): void {
    const batch = this.world.drainEvents();
    for (let i = 0; i < batch.length; i++)
      for (let j = 0; j < this.listeners.length; j++) this.listeners[j]!(batch[i]!);
  }
}
```

**Seam placement (load-bearing — RESEARCH Open Q2 / A5):** events are produced BY `world.step()`, but the existing `onStep` hook runs BEFORE it (`loop.ts:64-85`). Preferred: add a symmetric `onPostStep` callback to `FixedStepLoop.advance()` (called right after `this.world.step(FIXED_DT)` at `loop.ts:76`) and dispatch there → zero latency, one batch/step. `loop.ts` is engine-agnostic, so this respects D-11 ("planck-world/interface/soak untouched"). Fallback: drain previous batch at top of next `onStep` (zero loop change).

**How this file follows the analog:** it is a thin index-loop dispatcher above the existing pooled `drainEvents()` — reusing that view (no new alloc), wired at the fixed-step seam where `main.ts` already drains, adding only multi-listener fan-out in fixed registration order.

---

### `src/physics/types.ts` (MOD — interface/model contract, in-place evolution)

**Self-analog — extend, don't rewrite.** Three additive edits (all verified low blast-radius, RESEARCH Runtime State Inventory):

**1. Evolve `CollisionEvent`** (`types.ts:81-96`) — add `elementKind`/`elementId`/`ballId`, keep `type` coarse (D-12). `.aId`/`.bId` are read by ZERO consumers, so this is additive:
```typescript
export type ElementKind = "wall"|"chute"|"drain"|"bumper"|"slingshot"|"lane"|"rollover"|"flipper";
export interface CollisionEvent {
  readonly type: CollisionEventType;   // keep coarse — do NOT explode to per-pair enum
  readonly ballId: BallId;             // NEW: always the ball side
  readonly elementKind: ElementKind;   // NEW: spec-sourced
  readonly elementId: number;          // NEW
  readonly point: Vec2;
  readonly normalImpulse: number;
}
```

**2. Add the generic impulse hook** — mirror the `setFlipperMotor` sign-only hook doc/shape (`types.ts:122-131`):
```typescript
/** Apply a world impulse (kg·m/s) to a ball's center of mass. No-op for unknown id.
 *  Generic (Phase-4 nudge reuses it) — NOT plunger-specific (D-09). */
applyImpulse(ballId: BallId, ix: number, iy: number): void;
```

**3. Generalize the boundary accessor** — keep `getBoundarySegments()` as a back-compat shim (`types.ts:132-133`) and add `getElements()` (D-02) so the 10 existing call sites stay green.

**How this file follows the analog:** every edit mirrors an existing member's doc voice (SI units, "no-op for unknown id", "pooled — copy out if retained") and stays additive so downstream wiring never breaks.

---

### `src/physics/planck-world.ts` (MOD — adapter, the ONLY planck importer)

**Self-analog — the crux file.** Five edits:

**1. Replace `buildBoundary()` two-copies with a spec builder** (`planck-world.ts:359-386`) — the current code builds a `Chain` from `corners` (`:367-368`) AND separately returns a hand-authored `segment()` list (`:379-385`) — the latent drift D-01 kills. Replace with `resolve(TABLE_SPEC)` iterated once (RESEARCH "Building fixtures from the resolved spec"): for each element build `Chain`/`Circle`, set `isSensor` from `.sensor`, stamp `body.setUserData({ kind, id })`, and push the SAME `segments` into the returned list.

**2. Real spec-driven flipper placement** — `buildFlipper()` (`:415-497`) is already per-id + mirror-aware and stays UNCHANGED; only feed it pivots from the spec instead of `FLIPPER_PIVOT_L/R` (`:101-105`). Preserve every feel constant byte-identical (D-04/D-05); only positions move.

**3. Extend `BodyTag` + `classifyContact` to spec-sourced `ElementKind`** (`:184-218`) — broaden `kind: "ball"|"wall"|"flipper"` to the full `ElementKind` taxonomy; `classifyContact` still returns the coarse `type`.

**4. Normalize the emit path** (`:336-355`) — in post-solve, set `evt.ballId`/`evt.elementKind`/`evt.elementId` (RESEARCH Pattern 5) via a pooled record; keep the reused `scratchWm` (`:315`) and `nextEventSlot()` (`:726-740`) — zero new alloc.

**5. Add a begin-contact handler for sensors (RESEARCH Pitfall 1 — the non-obvious trap):** sensors NEVER fire `post-solve`, so lane/rollover events silently vanish. Add alongside the existing post-solve registration (`:336`):
```typescript
this.world.on("begin-contact", (contact) => {
  const fa = contact.getFixtureA(), fb = contact.getFixtureB();
  if (fa.isSensor() || fb.isSensor()) this.emitContact(contact, 0); // no impulse for a sensor
});
```

**6. Implement `applyImpulse` — mirror `setFlipperMotor`** (`:694-712`: find-by-id, no-op unknown, `setAwake(true)`):
```typescript
applyImpulse(ballId: BallId, ix: number, iy: number): void {
  const entry = this.balls.find((b) => b.id === ballId);
  if (!entry) return;                                   // tolerate unknown id (Pitfall 5)
  entry.body.applyLinearImpulse(Vec2(ix, iy), entry.body.getWorldCenter(), true);
}
```

**How this file follows the analog:** each edit reuses an existing mechanism in place — `buildFlipper` untouched, the pooled `nextEventSlot`/`scratchWm`/reused-view discipline preserved, `applyImpulse` a structural copy of `setFlipperMotor`, engine isolation intact.

---

### `src/physics/constants.ts` (MOD — config)

**Self-analog — append only.** Add a new HMR-tunable block mirroring the per-const doc voice (`constants.ts:105-129`). Add plunger charge/impulse/chute-axis consts (RESEARCH Pattern 3): `PLUNGER_CHARGE_RATE`, `PLUNGER_MAX_CHARGE`, `PLUNGER_MIN_IMPULSE`, `PLUNGER_MAX_IMPULSE`, `PLUNGER_AXIS`. Move `WIDTH_M`/`HEIGHT_M` OUT to the spec (D-02). Keep `BALL_RADIUS_M`/`FLIPPER_LENGTH_M`/`INCLINE_DEG`/`PIXELS_PER_METER` byte-identical (scale anchors, D-04).

**How this file follows the analog:** identical per-const documented-derivation style; the plunger block reads like the existing flipper block.

---

### `src/sandbox/main.ts` (MOD — composition root/wiring)

**Self-analog — extend the `onFixedStep` seam.** The current hook (`main.ts:105-112`) drains input, feeds the FSM, ticks it. Add the plunger to the SAME seam and replace the drain-discard (`:145`) with router dispatch:
```typescript
function onFixedStep(): void {
  const edges = input.drainEdges();
  /* ...existing flipper edge feed... */
  const p = plungerInput.drainEdges();          // NEW: plunger latch
  if (p.press) plunger.onPressEdge();
  if (p.release) plunger.onReleaseEdge(activeBallId);
  plunger.update();                              // charge += RATE·FIXED_DT
  controller.update();
}
// dispatch collision events at the fixed-step seam (replaces bare world.drainEvents())
```
Track the chute ball via the existing `activeBallId` pattern (`:85, :153-157`, RESEARCH Pitfall 5). Register the stub demo listener once at startup (D-11): `router.register((e) => { /* log e.elementKind + e.point */ })`.

**How this file follows the analog:** the plunger tick joins the flipper tick at the same by-reference `onFixedStep` (no per-frame alloc, `:98-104`); the router replaces the existing drain call at the same seam.

---

### `src/sandbox/debug-draw.ts` (MOD — throwaway renderer, read-only consumer)

**Self-analog.** Swap the `getBoundarySegments()` reads (`resize:119`, `drawWalls:161,172-183`, `boundsOf:66-80`) to `getElements()` and iterate the resolved list (walls/chute/drain as polylines, bumpers as circles). Add a charge meter reading `plunger.getCharge()` (D-10), following the same "read interface state, reuse buffers, no per-frame alloc" discipline as `drawFlippers` (`:185-209`).

**How this file follows the analog:** stays a pure interface consumer that never imports `planck` (`:1-24`); the element loop mirrors the existing `drawWalls`/`drawFlippers` iterate-and-stroke shape.

---

### `src/harness/{soak.ts,containment.ts}` (MOD — test harness, must stay UNTOUCHED in logic)

**Self-analog — data re-point only (D-01/D-02).** `containment.ts:243-245` (`wallSegmentsFrom`) and `soak.ts:368` (`world.getBoundarySegments()`) keep calling `getBoundarySegments()` (kept as a shim over `resolve(spec)`). The swept-invariant code (`sweptEscaped:136-152`, `flipperSweptTunnel:186-218`) stays byte-identical — it now runs on the REAL geometry. This is the key regression catcher: the real layout must be as tunnel-proof as the throwaway box (RESEARCH Pitfall 2 winding, Sampling Rate).

**How this file follows the analog:** zero logic change — the shim keeps the interface stable so the harness reads geometry the same way for any engine.

---

## Shared Patterns

### Engine isolation (only `planck-world.ts` imports `planck`)
**Source:** `planck-world.ts:1-3, 14-23` (doc: "the ONLY file allowed to import `planck`") + `types.ts:5-8`.
**Apply to:** `spec.ts`, `resolve.ts`, `plunger-input.ts`, `plunger-controller.ts`, `collision-router.ts` — ALL must be `planck`-free. `spec.ts`/`resolve.ts` may import scalars from `constants.ts` and value types from `types.ts`; controllers import `PhysicsWorld` as a TYPE only (`flipper-controller.ts:27`).

### Zero-alloc pooled drain / reused view
**Source:** `planck-world.ts:726-756` (`nextEventSlot` grow-only pool + `drainEvents` reused-view + count-reset) and `flipper-input.ts:159-166` (drain view).
**Apply to:** `collision-router.dispatch()` (fan out the reused view, never copy), the evolved `CollisionEvent` fields (mutate pooled records in place), `plunger-input.drainEdges()`, and `plunger.getCharge()` (scalar read). No per-frame/per-event/per-drain allocation on step/render/drain hot paths.

### Input → FSM → thin engine-hook template
**Source:** `flipper-input.ts` (edge latch) → `flipper-controller.ts` (FSM, `update()` per fixed step) → `PhysicsWorld.setFlipperMotor` (`planck-world.ts:694-712`), wired at `main.ts:105-112` (`onFixedStep`).
**Apply to:** the entire plunger stack — `plunger-input.ts` → `plunger-controller.ts` → `PhysicsWorld.applyImpulse` — wired at the same `onFixedStep` seam. `Space` is already reserved (D-08).

### Reference-anchored HMR constants
**Source:** `constants.ts:1-22` (module doc) + per-const derivation, e.g. `IN_PLANE_GRAVITY` (`:34-41`).
**Apply to:** `spec.ts` (geometry descriptors, mirror-derived clusters, `BALL_RADIUS_M`-scaled features) and the new plunger block in `constants.ts`.

### Fixed-step determinism (no wall-clock, one batch per step)
**Source:** `loop.ts:64-85` (`advance` + `onStep` hook), `flipper-controller.ts:118` (`update()` per fixed step).
**Apply to:** plunger charge accumulation (`charge += RATE·FIXED_DT`, never `performance.now`), router dispatch (one batch per fixed step in fixed registration order). Seeded `mulberry32` (`src/harness/prng.ts`) if any launch jitter is ever added — never `Math.random` (RESEARCH Pattern 3 determinism note).

### Read-only normalized accessor for the throwaway renderer
**Source:** `flipper-controller.ts:77-80` (`getPhase`) + `planck-world.ts:690-692` (`getFlippers`).
**Apply to:** `plunger.getCharge(): number` in `[0,1]` (D-10), consumed only by `debug-draw.ts`.

---

## Test Analogs (Wave 0 — RESEARCH Validation Architecture)

| New test file | Analog | Pattern to copy |
|---------------|--------|-----------------|
| `src/input/plunger-input.test.ts` | `src/input/flipper-input.test.ts:1-55` | synthetic `{ code, repeat, preventDefault: vi.fn() }` events, `repeat` suppression, blur-clear assertions |
| `src/control/plunger-controller.test.ts` | `src/control/flipper-controller.test.ts` | spy `PhysicsWorld`; assert monotonic charge→impulse, `getCharge()` clamp/reset, replay determinism |
| `src/sandbox/plunger-e2e.test.ts` | `src/sandbox/flipper-e2e.test.ts:1-70` | real stack, no mocks: synthetic key → `drainEdges()` → controller → `applyImpulse` → `FixedStepLoop.advance()` → ball climbs chute |
| `src/table/resolve.test.ts` | (new) — structural, uses `containment.ts` geometry idioms | chord-error bound, closed-loop closure, unique ids, one-resolve identity (SC#4) |
| `src/app/collision-router.test.ts` | `drainEvents()` reuse tests + spy world | fixed-order fan-out, one-batch-per-step, one-way, same-array-ref (zero-alloc) |
| `src/physics/collision-event.test.ts` + `sensor-event.test.ts` | `planck-world.smoke.test.ts` | normalization (ballId regardless of fixture A/B order); begin-contact sensor path, impulse 0 |

**Re-anchor (not new):** `stability.test.ts`, `flipper-feel.test.ts`, `flipper-e2e.test.ts` hard-assume the 2×3 box (`x=1.0`) + pivots (`y=2.6`); re-anchor to spec mounts WITHOUT touching any feel constant (RESEARCH Open Q3 / Pitfall 4).

---

## No Analog Found

None. Every file has a strong in-repo analog. The two "role-match (composed)" entries — `resolve.ts` (pure-geometry style from `containment.ts`, but tessellation logic is new) and `collision-router.ts` (composed from the `drainEvents()` pool + the `main.ts` drain seam) — are the only files whose *core logic* is genuinely new; both still copy their structural discipline (zero-alloc, engine-agnostic, fixed-step) directly from the analogs above.

---

## Metadata

**Analog search scope:** `src/physics/`, `src/control/`, `src/input/`, `src/sandbox/`, `src/sim/`, `src/harness/` (entire `src/` tree — 26 files).
**Files scanned:** 26 (fully read: `types.ts`, `planck-world.ts`, `constants.ts`, `flipper-input.ts`, `flipper-controller.ts`, `main.ts`, `debug-draw.ts`, `loop.ts`, `containment.ts`; partial: `soak.ts`, `flipper-e2e.test.ts`, `flipper-input.test.ts`).
**Directories not yet present:** `src/app/`, `src/table/` (both created this phase).
**Pattern extraction date:** 2026-07-16
