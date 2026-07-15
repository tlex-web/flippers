# Phase 3: Table, Plunger & Event Bus - Research

**Researched:** 2026-07-16
**Domain:** 2D pinball table geometry (data-driven spec + curve resolver), Planck impulse-launch plunger, zero-alloc collision-event routing
**Confidence:** HIGH (all decisive facts verified against the installed `planck@1.5.0` types, the in-repo code, and the SpaceCadetPinball source)

## Summary

Every hard decision for this phase is already locked (D-01..D-12 in `03-CONTEXT.md`), and the two most consequential ones — anchored-approximate clean-room geometry (D-03) and a scalar-impulse plunger (D-07) — are *confirmed correct* by primary sources: the original's colliders live in the copyrighted `CADET.DAT` binary (not the decompiled source), and `TPlunger` applies a scalar `Boost·(1 + RandFloat()·0.1)` velocity modifier on release (`MaxPullback = 100` in 3D-Pinball mode). This research therefore answers *how to implement them well*, not *whether they are right*.

The phase is a **pure client-side TypeScript refactor-plus-extension** with **zero new dependencies** — Planck 1.5.0 is already locked, Canvas 2D / Web Audio are browser-native, and the test stack (Vitest 4) is in place. The technical spine is a single engine-agnostic `src/table/spec.ts` descriptor module + a `resolve()` tessellator whose one output feeds three consumers (Planck fixtures, debug-draw, containment harness) — making SC#4's "what's hit == what's drawn" a *structural* guarantee and retiring the latent two-copies drift already sitting in `buildBoundary()`.

**Primary recommendation:** Build the spec + resolver first (it is the single origin every other decision hangs off), keep `getBoundarySegments()` as a back-compat shim over the new `getElements()` to minimize the ~10-caller blast radius, model all walls as Planck **Chain** shapes (ghost-vertex smooth traversal), and — the one non-obvious trap — route **sensor** lanes/rollovers through a new `begin-contact` handler because **Planck sensors never fire `post-solve`**, which is the only path the current event pipeline listens on.

## Architectural Responsibility Map

This is a single-tier browser app; "tiers" here are the codebase's architectural layers (the engine-isolation boundary is the load-bearing seam). Every capability below is client-side.

| Capability | Primary Layer | Secondary Layer | Rationale |
|------------|---------------|-----------------|-----------|
| Table geometry definition | `src/table/spec.ts` (engine-agnostic data) | — | Single source of truth (D-01); must not import `planck` |
| Curve/arc tessellation | `src/table/resolve.ts` (engine-agnostic) | — | One resolve feeds fixtures + draw + containment (D-01) |
| Fixture construction (Chain/Edge/Circle, sensors, userData tags) | `planck-world.ts` (adapter) | spec (input) | Only file allowed to import `planck` (engine isolation) |
| Plunger charge accumulation + FSM | `src/control/plunger-controller.ts` (engine-agnostic) | `constants.ts` (tuning) | Mirrors FlipperController; must stay replayable, no wall-clock (D-08) |
| Space edge latching | `src/input/plunger-input.ts` (engine-agnostic) | — | Mirrors FlipperInput; DOM-only, no `planck` (D-08) |
| Impulse application | `PhysicsWorld.applyImpulse()` hook → `planck-world.ts` | — | Generic primitive reused by Phase-4 nudge (D-09) |
| Collision-event production | `planck-world.ts` post-solve **+ begin-contact** | — | Pooled, zero-alloc source (D-11); sensors need begin-contact |
| Event routing / fan-out | `src/app/collision-router.ts` (engine-agnostic) | `main.ts` (wiring) | Thin dispatcher above `drainEvents()`, fixed-step seam (D-11) |
| Charge/table visualization | `src/sandbox/debug-draw.ts` (throwaway) | — | Read-only consumer of interface state (D-10); real render is Phase 5 |
| Validation (containment/determinism) | `src/harness/*` + Vitest | — | Reads the interface only, engine-agnostic (D-05) |

## Standard Stack

No new packages. This phase adds only in-repo TypeScript modules on top of the already-locked stack.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| planck | 1.5.0 (locked) | Chain/Edge/Circle fixtures, `applyLinearImpulse`, sensors, contact events | Already the engine of record; `setBullet`+`continuousPhysics` CCD proven tunnel-proof to ~58 m/s by the Phase-1 soak `[VERIFIED: node_modules/planck/dist/planck.d.ts]` |
| TypeScript | 5.9.3 (pinned) | Discriminated-union descriptor types, engine-agnostic interfaces | Pinned in Phase 1 (TS 7 native compiler crashes `@typescript-eslint@8`); do NOT bump `[VERIFIED: package.json + STATE.md decision]` |
| Vite | 8.1.4 | HMR for "change a number, feel it" spec/plunger tuning | Locked; spec + plunger constants are plain exports so HMR re-applies instantly |
| Vitest | 4.1.10 | Headless unit + e2e + soak-gate proofs | Two configs already wired: `vitest.config.ts` (fast) / `vitest.gate.config.ts` (soak) `[VERIFIED: package.json]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Canvas 2D | browser-native | Debug charge meter + table stroke render | Throwaway debug-draw only this phase; real render is Phase 5 (D-10) |
| Web Audio | browser-native | — | NOT this phase — per-element audio is Phase 5 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Chain shapes for walls | Independent `Edge` fixtures | Edges cause ghost-collision snagging at joints unless you hand-wire `setPrevVertex`/`setNextVertex`; Chain does it for you (see Pitfall 1) |
| Hand-authored polylines | `poly-decomp` concave decomposition | CLAUDE.md explicitly rejects poly-decomp; Chain/Edge/Circle sidestep decomposition entirely |
| Scalar-impulse plunger | Prismatic-joint spring body | REJECTED (D-07): less faithful AND reintroduces the fast-thin-moving-body tunneling class |
| Hand-rolled router | RxJS / EventEmitter / mitt | Allocates per event + per subscription; breaks the zero-alloc + determinism contract |
| Hand-rolled plunger FSM | XState | CLAUDE.md forbids state-machine libs for ~4-state FSMs |

**Installation:** None. `npm install` unchanged; no new entries in `package.json`.

## Package Legitimacy Audit

**No external packages are installed by this phase.** All work is in-repo TypeScript against the already-locked `planck@1.5.0` (verified present in `node_modules`, pinned exact in `package.json`, 0 runtime deps). Browser-native APIs (Canvas 2D, Web Audio, KeyboardEvent) require no install. slopcheck/registry verification is therefore N/A — there is nothing new to vet.

| Package | Registry | Disposition |
|---------|----------|-------------|
| planck@1.5.0 | npm (already locked Phase 1) | Unchanged — no new install |

## Architecture Patterns

### System Architecture Diagram

```
                         src/table/spec.ts  (engine-agnostic DATA — no planck)
                         id-keyed descriptors:
                         wall(polyline) · arc(center/r/θ) · bumper(circle) ·
                         lane/rollover(sensor) · chute(+axis) · drain · flipperMount
                                    │
                                    ▼
                         src/table/resolve.ts   resolve(spec) ── called ONCE
                         tessellate arcs→segments (chord-error bound)
                         → ResolvedElement[] { id, kind, segments[], circle?, sensor }
                                    │
              ┌─────────────────────┼──────────────────────────┐
              ▼                     ▼                          ▼
   planck-world.ts          debug-draw.ts               containment.ts / soak.ts
   build fixtures:          stroke the SAME              swept invariant reads
   Chain/Edge (segments)    segments + circles           the SAME segment list
   Circle (bumpers)         + charge meter (D-10)        (getElements/BoundarySegments)
   sensor flag              [read-only consumer]         [UNTOUCHED invariant code]
   userData{kind,id}
        │  (SAME points → collider == drawn stroke: SC#4 structural)
        ▼
   ┌────────────────────────────────────────────────────────────────┐
   │  world.step(FIXED_DT)  @120Hz                                    │
   │    on "post-solve"  → solid contacts  (has normalImpulse)        │
   │    on "begin-contact"→ SENSOR overlaps (lanes/rollovers) *NEW*   │
   │       → nextEventSlot()  [pooled, mutated in place, zero-alloc]  │
   │       normalize: ballId = ball side; elementKind/elementId = other│
   └────────────────────────────────────────────────────────────────┘
                                    │  drainEvents() (reused view)
                                    ▼
   input(Space) → PlungerInput      CollisionRouter.dispatch()  ── at fixed-step seam
     edge-latch  → drainEdges()     drain ONCE, fan to N listeners
        │  (top of fixed step)      in FIXED registration order
        ▼                                    │
   PlungerController FSM                       ▼
   idle→charging→fired                 [ stub demo listener ]  (logs kind+point / flash)
     charge += RATE·dt (clamp)         Phase-4 rules & Phase-5 render/audio register here
     on release: world.applyImpulse(ballId, ix, iy)
        │
        ▼
   PhysicsWorld.applyImpulse(ballId,ix,iy) → body.applyLinearImpulse(Vec2(ix,iy), center, true)
     (same primitive Phase-4 nudge reuses — D-09)
```

Trace the primary use case: Space held → `PlungerController` accumulates `charge` each fixed step → release → `applyImpulse` gives the resting ball a chute-axis velocity → ball climbs the static chute (existing CCD covers it) → enters the playfield → each contact emits a normalized pooled event → router fans it to the stub consumer.

### Recommended Project Structure
```
src/
├── table/
│   ├── spec.ts          # engine-agnostic descriptors + ElementKind + anchors (NO planck)
│   └── resolve.ts       # arc tessellation + resolve(spec) → ResolvedElement[]
├── input/
│   └── plunger-input.ts # Space edge-latch (mirrors flipper-input.ts)
├── control/
│   └── plunger-controller.ts # charge FSM + getCharge() (mirrors flipper-controller.ts)
├── app/ (or sandbox/)
│   └── collision-router.ts   # pull-then-dispatch fan-out (engine-agnostic)
├── physics/
│   ├── types.ts         # +applyImpulse, +getElements, evolve CollisionEvent (D-09/D-02/D-12)
│   ├── planck-world.ts  # consume resolve() for fixtures; +begin-contact; +applyLinearImpulse
│   └── constants.ts     # +plunger charge/impulse/chute-axis consts (WIDTH_M/HEIGHT_M move to spec)
└── sandbox/
    ├── main.ts          # wire router + plunger tick at the fixed-step seam
    └── debug-draw.ts    # read getElements() + getCharge()
```

### Pattern 1: One-resolve id-keyed table spec (D-01/D-02)
**What:** A discriminated-union descriptor list in `spec.ts`; a pure `resolve()` in `resolve.ts` turns curves into vertex lists once; three consumers read that one output.
**When to use:** Always — it is the structural mechanism behind SC#4.
**Example:**
```typescript
// src/table/spec.ts — engine-agnostic; may import BALL_RADIUS_M etc. from constants, never planck
export type ElementKind =
  | "wall" | "chute" | "drain" | "bumper" | "slingshot" | "lane" | "rollover" | "flipper";

interface Base { readonly id: number; readonly kind: ElementKind; }
export type ElementSpec =
  | (Base & { kind: "wall" | "chute" | "drain"; points: readonly Vec2[]; loop?: boolean })
  | (Base & { kind: "wall" | "chute"; arc: { center: Vec2; radius: number; a0: number; a1: number } })
  | (Base & { kind: "bumper" | "slingshot"; center: Vec2; radius: number })
  | (Base & { kind: "lane" | "rollover"; points: readonly Vec2[]; sensor: true })
  | (Base & { kind: "flipper"; pivot: Vec2; mirror: boolean });

// src/table/resolve.ts — pure; tessellates arcs to segments ONCE
export interface ResolvedElement {
  readonly id: number;
  readonly kind: ElementKind;
  readonly segments: readonly Segment[];   // walls/chute/drain/lanes (arcs already flattened)
  readonly circle?: { center: Vec2; radius: number }; // bumpers/slingshots
  readonly sensor: boolean;                 // lanes/rollovers (and inert D-06 elements chosen as sensors)
  readonly mount?: { pivot: Vec2; mirror: boolean }; // flipper mounts
}
export function resolve(spec: readonly ElementSpec[]): readonly ResolvedElement[] { /* ... */ }
```
**Key:** `planck-world.ts` iterates `resolve(spec)`; for each element it builds `new Chain(verts, loop)` (or `Circle`), sets `isSensor` from `.sensor`, and stamps `body.setUserData({ kind, id })`. `getBoundarySegments()` / `getElements()` return the SAME `segments`. The collider and the drawn stroke are the same points *by construction*.

### Pattern 2: Chord-error arc tessellation (Claude's discretion — recommended)
**What:** Flatten an arc to N straight segments where N is derived from a max chord deviation ε, not a fixed segments-per-arc count.
**Why chord-error over fixed-N:** A fixed count over-tessellates small arcs and under-tessellates large ones. Chord-error guarantees the polyline never deviates from the true arc by more than ε regardless of radius.
**Example:**
```typescript
// max angular step so the sagitta (chord bulge) ≤ ε: Δθ = 2·acos(1 − ε/r)
const EPS = 0.02; // 2 cm ≈ 10% of BALL_RADIUS_M — smooth enough the ball won't catch on facets
function arcSegments(cx, cy, r, a0, a1): Vec2[] {
  const dTheta = 2 * Math.acos(Math.max(-1, 1 - EPS / r));
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / dTheta));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (a1 - a0) * (i / n);
    out.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return out; // append/prepend to the connecting polyline, then emit as one Chain
}
```
Tie ε to `BALL_RADIUS_M` (0.2 m) so tessellation resolution scales if the table scale changes. ε = 0.02 keeps arc segment counts modest (a 90° arc of r=1 m → ~10 segments) while staying well under the ball radius.

### Pattern 3: Scalar hold-to-charge → proportional impulse (D-07/D-08/D-09)
**What:** Faithful `TPlunger` model — accumulate a scalar while Space is held, apply a proportional impulse on release. `[CITED: k4zmu2a/SpaceCadetPinball TPlunger.cpp]` confirms: `Boost += PullbackIncrement` per tick, capped at `MaxPullback` (=100 in 3D mode), release applies `Boost·(1 + RandFloat()·0.1)` as a **velocity modifier**.
**Planck units:** `applyLinearImpulse(impulse, point, wake)` takes a world impulse in **kg·m/s = mass·Δv** `[VERIFIED: planck.d.ts:1786-1795]`. From rest, `Δv = impulse / mass`. Ball mass = `BALL_DENSITY · π · r² = 1 · π · 0.2² ≈ 0.1257 kg`. To launch at target speed `v`: `|impulse| = 0.1257 · v`. Apply at the ball's **center of mass** (`point = body.getWorldCenter()`) so it is pure linear — no spin.
**Example:**
```typescript
// constants.ts — HMR-tunable (D-08). Tune impulse magnitude directly in kg·m/s.
export const PLUNGER_CHARGE_RATE = 2.5;          // charge units/sec while held (→ full in ~0.4s)
export const PLUNGER_MAX_CHARGE = 1.0;           // normalized cap (mirrors MaxPullback)
export const PLUNGER_MIN_IMPULSE = 0.4;          // kg·m/s at zero charge (≈ 3.2 m/s launch)
export const PLUNGER_MAX_IMPULSE = 1.4;          // kg·m/s at full charge (≈ 11 m/s launch)
export const PLUNGER_AXIS = { x: 0, y: -1 } as const; // up the chute (−y = up-field); tune to chute tilt

// plunger-controller.ts — engine-agnostic FSM, drained at top of fixed step (D-08)
onReleaseEdge(ballId: number): void {
  if (this.phase !== "charging") return;
  const mag = PLUNGER_MIN_IMPULSE + (PLUNGER_MAX_IMPULSE - PLUNGER_MIN_IMPULSE) * this.charge; // charge∈[0,1]
  this.world.applyImpulse(ballId, PLUNGER_AXIS.x * mag, PLUNGER_AXIS.y * mag);
  this.charge = 0; this.phase = "idle";
}
```
**Determinism note:** the original's `RandFloat()·0.1` (0–10% jitter) breaks replay if backed by `Math.random`. Default to **no jitter** (deterministic, and better for the Phase-6 skill-shot which wants readable charge→power); if flavor jitter is later wanted, back it with the existing seeded `mulberry32`, never the global RNG.
**Adapter hook (D-09):**
```typescript
// planck-world.ts — generic, NOT plunger-specific (Phase-4 nudge reuses it)
applyImpulse(ballId: BallId, ix: number, iy: number): void {
  const entry = this.balls.find((b) => b.id === ballId);
  if (!entry) return;
  entry.body.applyLinearImpulse(Vec2(ix, iy), entry.body.getWorldCenter(), true); // wake=true
}
```

### Pattern 4: Pull-then-dispatch CollisionRouter at the fixed-step seam (D-11)
**What:** A thin dispatcher that drains the pooled source once per fixed step and fans the reused view to N listeners in fixed registration order.
**Where to wire — the load-bearing detail:** events are *produced by* `world.step()` (post-solve/begin-contact), but the existing `onFixedStep` hook runs *before* `world.step()`. Two options:
- **(Recommended) Add a symmetric `onPostStep` hook to `FixedStepLoop.advance()`** (called immediately after each internal `world.step()`), and dispatch there → zero latency, exactly one batch per fixed step. `loop.ts` is engine-agnostic, so this does not violate D-11's "planck-world/interface/soak untouched" (loop is none of those).
- **(Fallback, zero loop change)** Dispatch at the *top* of the next fixed step inside `onFixedStep`, draining the previous step's events → one-step (~8.3 ms) latency, still one deterministic batch per step.
**Example:**
```typescript
// collision-router.ts — engine-agnostic, zero per-frame allocation
export type CollisionListener = (e: CollisionEvent) => void;
export class CollisionRouter {
  private readonly listeners: CollisionListener[] = []; // registered once at startup
  constructor(private readonly world: Pick<PhysicsWorld, "drainEvents">) {}
  register(l: CollisionListener): void { this.listeners.push(l); } // fixed order = insertion order
  dispatch(): void {
    const batch = this.world.drainEvents();          // reused pooled view (no alloc)
    for (let i = 0; i < batch.length; i++) {
      const e = batch[i]!;
      for (let j = 0; j < this.listeners.length; j++) this.listeners[j]!(e);
    }
  }
}
```
**Contract to document:** listeners must not allocate per event and must copy out anything retained past the next step (records are pooled + mutated). This mirrors the existing `drainEvents()` contract.

### Pattern 5: Normalized, orthogonal event identity (D-12)
**What:** Add `elementKind: ElementKind`, `elementId: number`, `ballId: BallId` to `CollisionEvent`; the emit handler normalizes so `ballId` is always the ball side and `elementKind/elementId` the element side — fixing today's `aId`/`bId` order ambiguity. Keep `type` coarse; do NOT explode into a per-pair enum.
**Blast radius (verified):** `.aId`/`.bId` are written **only** inside `planck-world.ts` and read by **no** consumer — `main.ts` drains-and-discards `[VERIFIED: grep of src for .aId/.bId]`. So this evolution is additive and safe; extend `MutableCollisionEvent` with the three fields (still pooled, zero new alloc).
```typescript
// in post-solve / begin-contact, after asTag(a)/asTag(b):
const ballTag = a.kind === "ball" ? a : b.kind === "ball" ? b : null;
const elemTag = a.kind === "ball" ? b : a;              // (ball-ball → handle via coarse "ball-ball")
evt.ballId = ballTag ? ballTag.id : a.id;
evt.elementKind = elemTag.kind;                         // spec-sourced ElementKind
evt.elementId = elemTag.id;
```

### Anti-Patterns to Avoid
- **Two copies of geometry** — the current `buildBoundary()` builds a `Chain` from `corners` AND separately returns a `segment()` list. Resolve ONCE; both come from the same output.
- **Concave mega-polygon walls** needing decomposition — build from Chain/Edge/Circle instead (CLAUDE.md).
- **Independent `Edge` fixtures for a continuous wall** — causes ghost-collision snagging (Pitfall 1); use `Chain`.
- **Kinematic/moving plunger body** — the plunger is an impulse, not a body (D-07).
- **Draining events per rAF frame** — non-deterministic batching (variable steps/frame). Dispatch per fixed step.
- **Reading wall-clock in charge accumulation** — breaks replay. Accumulate per fixed step (`charge += RATE·FIXED_DT`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Smooth ball traversal across wall joints | Manual ghost-vertex bookkeeping on per-Edge fixtures | Planck `Chain(verts, loop)` | Chain stores prev/next ghost vertices internally → no ghost collisions `[VERIFIED: planck.d.ts:2608-2646]` |
| Concave table outline | poly-decomp convex decomposition | Chain loop + Circle bumpers | CLAUDE.md rejects poly-decomp; Chain handles concave boundaries natively |
| Launch impulse | Prismatic spring plunger body | `applyLinearImpulse` at center of mass | D-07: spring is less faithful AND re-adds a tunneling class |
| Event pub-sub | RxJS / EventEmitter / mitt | Pooled `drainEvents()` + thin router | Libraries allocate per event/subscription; break zero-alloc + determinism |
| Plunger state machine | XState | Hand-rolled ~4-state FSM (copy FlipperController) | CLAUDE.md forbids FSM libs for trivial FSMs |
| Continuous collision for the launch | Any new anti-tunnel machinery | Existing `setBullet`+`continuousPhysics` | Soak already proved tunnel-proof to ~58 m/s; max launch ~11 m/s is far under (D-07) |

**Key insight:** faithfulness points at *simplicity* here — the original's plunger and geometry are both simpler than the "physical" alternatives, so leaning on Planck's built-ins (Chain, applyLinearImpulse, existing CCD) is both less code and more faithful.

## Runtime State Inventory

This phase is an **in-repo code refactor** (getBoundarySegments→getElements, CollisionEvent field evolution, throwaway-rig→spec-driven flipper placement) of a browser app with **no persisted or external runtime state**. The "what still references the old surface after the change" question maps to *in-codebase call sites*, not external systems.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — no DB/localStorage/IndexedDB in the project yet (localStorage is Phase 6). Verified: no persistence imports in `src/`. | None |
| Live service config | **None** — no external services, no network. Pure client-side. | None |
| OS-registered state | **None** — browser app, no OS registration. | None |
| Secrets/env vars | **None** — the only env reads are `SOAK_*` tuning vars in `soak.gate.test.ts` (unchanged by this phase). | None |
| Build artifacts | **None new** — no codegen, no egg-info analog. `dist/` is Vite output, regenerated. | None |
| **In-repo API call sites (the real inventory)** | `getBoundarySegments()` read by **10 sites**: `containment.ts:244`, `debug-draw.ts:119,161`, `soak.ts:368`, `planck-world.smoke.test.ts:72`, `loop.tabblur.test.ts:106,125`, `stability.test.ts:101`, + the interface decl + spy in `flipper-controller.test.ts:90`. | **Keep `getBoundarySegments()` as a back-compat shim** returning the union of wall/collider segments from `resolve(spec)`; ADD `getElements()`. This keeps all 10 sites green. |
| `WIDTH_M`/`HEIGHT_M` | Local consts in `planck-world.ts:66-67`; bounds are otherwise derived from `getBoundarySegments()` (interface-only) everywhere else. | Move into spec (D-02); every bounds-derivation site auto-follows via the interface. |
| `FLIPPER_PIVOT_L/R` + throwaway rig | `planck-world.ts:101-105`; the 2×3 m box + symmetric pivots are hard-assumed by feel/stability/e2e tests. | **Highest test-churn risk** — replacing the rig with spec-driven placement changes bounds + pivots; `stability.test.ts`, `flipper-feel.test.ts`, `flipper-e2e.test.ts` that assume box centre x=1.0 / pivot y=2.6 will need re-anchoring. Feel *constants* stay unchanged (D-04); only positions move. |
| `CollisionEvent.aId/bId` | Written only in `planck-world.ts:350-351`; **read by zero consumers**. | Additive evolution — extend the pooled record; no consumer migration needed. |

**Nothing found in the first five categories** — verified by grepping `src/` for persistence, network, and env usage. The genuine migration surface is the in-repo API/rig churn in the last three rows.

## Common Pitfalls

### Pitfall 1: Sensors never fire `post-solve` — lane/rollover events silently vanish
**What goes wrong:** D-06 ships lanes/rollovers as **sensors**; D-12 expects them on the bus. But the entire current emit path is a single `world.on("post-solve", ...)` handler (`planck-world.ts:336`). Planck sensors detect overlap and fire `begin-contact`/`end-contact` but are **not solved**, so they produce **no `post-solve` and no `normalImpulse`** `[VERIFIED: planck.d.ts:2152 begin-contact + 1033 isSensor semantics; standard Box2D behavior]`. Sensor lanes would emit *nothing*.
**Why it happens:** post-solve exists to report solver impulses; a sensor has no solver interaction by definition.
**How to avoid:** Add a `world.on("begin-contact", ...)` handler that classifies + emits for sensor contacts (set `normalImpulse = 0`, since there is none), reusing the same `nextEventSlot()` pool and normalization. Solid contacts stay on post-solve (they carry the real impulse). Decide per-element in the spec whether an inert element is a solid circle (post-solve, has impulse) or a sensor (begin-contact, impulse 0) — D-06 permits either.
**Warning signs:** a ball rolls over a lane in the sandbox and the stub consumer logs nothing, while bumper hits log fine.

### Pitfall 2: Chain winding / one-sided collision
**What goes wrong:** Box2D Chain edges collide based on vertex winding; a mis-wound outer loop or a backwards ramp polyline lets the ball pass through from the "back" or stick.
**Why it happens:** the play area must be on the collidable side of each chain edge.
**How to avoid:** wind the outer boundary consistently (e.g. CCW in the y-down frame) so the interior is the collidable side; author ramp/lane polylines in a consistent direction. Verify with the swept-containment soak on the real geometry (it will trip if the ball escapes through a mis-wound wall).
**Warning signs:** the soak goes red on the new table with a boundary escape at a specific wall; ball leaks at one seam only.

### Pitfall 3: Curve tessellation too coarse (facet catch / shallow-arc tunnel)
**What goes wrong:** too few segments per arc → the ball catches on polyline facets, or a shallow fast chord tunnels a coarse arc between two inside points.
**How to avoid:** chord-error tessellation tied to `BALL_RADIUS_M` (Pattern 2, ε≈0.02 m). Never let a single chord exceed ~a ball radius.
**Warning signs:** ball stutters on curved walls; soak trips on a curved segment.

### Pitfall 4: Table rescale silently re-tunes Phase-2 feel
**What goes wrong:** deriving table size from real pinball dimensions (instead of from the proven flipper/ball constants) would change flipper-to-width proportion and force feel re-tuning — the exact risk D-04 avoids.
**How to avoid:** size `WIDTH_M` so `FLIPPER_LENGTH_M=0.5` stays ~1/6–1/7 of width (→ ~3–4 m wide × ~5–7 m tall). Move flipper *pivots* into the spec; leave every feel constant (length, half-width, tip radius, motor speeds, torque, angle limits, incline) **byte-identical**. Note: the ball will read proportionally chunkier than the original (~1/16 of width vs the original's ~1/40) — an accepted D-04 tradeoff, since re-tuning feel is the larger risk.
**Warning signs:** anyone edits `FLIPPER_*` or `INCLINE_DEG` "to fit the table" — that is the smell.

### Pitfall 5: Applying impulse to a removed/sleeping ball, or mid-step
**What goes wrong:** the sandbox feed removes/re-adds the ball on drain (`main.ts:154-157`); a release edge that targets a stale `ballId` would no-op or throw. Applying force during `world.step()` is locked in Box2D.
**How to avoid:** apply at the top of the fixed step (between steps), pass `wake=true`, and guard `applyImpulse` with an id lookup that no-ops on a missing ball (mirror `setFlipperMotor`/`removeBall` which already tolerate unknown ids). Track the "current chute ball" id the way `main.ts` tracks `activeBallId`.
**Warning signs:** launch does nothing after a drain/refeed; a Planck "locked during step" assertion.

### Pitfall 6: Space auto-repeat double-charges
**What goes wrong:** holding Space emits OS auto-repeat `keydown`s; if not filtered, they could re-enter "charging" or double-count.
**How to avoid:** ignore `event.repeat` (exactly as `flipper-input.ts:120`), and drive charge purely from the fixed-step accumulator, not from key events. Also `preventDefault()` Space (page scroll) — but only on Space, mirroring the "bound codes only" discipline.
**Warning signs:** charge meter jumps or resets while holding.

## Code Examples

Verified against the installed engine and in-repo patterns.

### Building fixtures from the resolved spec (replacing buildBoundary)
```typescript
// planck-world.ts — one resolve, both collider paths from the same vertices
private buildTable(): readonly Segment[] {
  const resolved = resolve(TABLE_SPEC);           // called ONCE (D-01)
  const all: Segment[] = [];
  for (const el of resolved) {
    if (el.circle) {
      const body = this.world.createBody({ position: Vec2(el.circle.center.x, el.circle.center.y) });
      body.createFixture(new Circle(el.circle.radius), { isSensor: el.sensor, friction: WALL_FRICTION });
      body.setUserData({ kind: el.kind, id: el.id });
    } else if (el.segments.length) {
      const body = this.world.createBody();       // static
      const verts = /* endpoints of el.segments */ toVertices(el.segments);
      const loop = el.kind === "wall" && /* closed */ isClosed(el.segments);
      body.createFixture(new Chain(verts.map((v) => Vec2(v.x, v.y)), loop), { isSensor: el.sensor });
      body.setUserData({ kind: el.kind, id: el.id });
      for (const s of el.segments) all.push(s);     // SAME points feed getBoundarySegments/getElements
    }
  }
  return all;
}
```

### Applying the launch impulse (verified signature)
```typescript
// impulse in kg·m/s at the center of mass → pure linear Δv = impulse/mass, no spin
entry.body.applyLinearImpulse(Vec2(ix, iy), entry.body.getWorldCenter(), true);
// Source: node_modules/planck/dist/planck.d.ts:1786-1795 (impulse in N·s = kg·m/s)
```

### Sensor + solid dual emit path
```typescript
this.world.on("post-solve", (contact, impulse) => this.emitContact(contact, sumImpulse(impulse)));
this.world.on("begin-contact", (contact) => {
  const fa = contact.getFixtureA(), fb = contact.getFixtureB();
  if (fa.isSensor() || fb.isSensor()) this.emitContact(contact, 0); // sensors: no post-solve, impulse 0
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-authored geometry duplicated (corners + segment list) | Single `resolve(spec)` feeding all consumers | This phase (D-01) | Retires latent drift; SC#4 becomes structural |
| `getBoundarySegments()` (walls only) | `getElements()` id-keyed + shim | This phase (D-02) | Richer identity; back-compat preserved |
| `CollisionEvent{aId,bId}` order-ambiguous | Normalized `ballId`+`elementKind`+`elementId` | This phase (D-12) | Fixes ambiguity; additive (no consumer reads old fields) |
| post-solve-only emit | post-solve (solid) + begin-contact (sensor) | This phase | Sensors now reach the bus |

**Deprecated/outdated:**
- Throwaway 2×3 m flipper rig (`FLIPPER_PIVOT_L/R`, Phase-2 D-11) — replaced by spec-driven placement (D-05). Feel constants survive unchanged.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Table scale ~3–4 m × ~5–7 m keeps every feature in Planck's 0.1–10 m band | Pitfall 4 / D-04 | Low — derived from proven constants; wide margin. Confirm final W/H by eye against reference (Claude's discretion). |
| A2 | Chord-error ε ≈ 0.02 m gives smooth-enough colliders without segment explosion | Pattern 2 | Low — tunable; the soak will catch facet-catch/tunnel if too coarse. |
| A3 | Starting impulse band 0.4–1.4 kg·m/s (≈3–11 m/s launch) clears the chute against 4.6 m/s² in-plane gravity | Pattern 3 | Low — tune by feel via HMR; well under the 58 m/s soak ceiling. |
| A4 | Anchor fractions read off the public GameFAQs/StrategyWiki diagrams are sufficient for "original relative positions" (SC#1) | D-03 | Medium — approximate by design; positions are Claude's discretion, judged by eye. This is the intended anchored-approximate path, not exact transcription. |
| A5 | Adding `onPostStep` to `FixedStepLoop` is the cleanest router seam | Pattern 4 | Low — fallback (pre-step drain of previous batch) needs zero loop change and is equally deterministic. |
| A6 | Inert D-06 elements are modeled as sensors (needing begin-contact) vs solid circles is a per-element choice | Pitfall 1 | Low — both are valid per D-06; the dual emit path supports either. |

**A4 is the one to surface for user confirmation** if fidelity of relative positions matters more than the phase assumes — but D-03 already locked "anchored-approximate, judged by eye" as the intended path.

## Open Questions

1. **Where exactly does the chute meet the playfield, and what is the chute axis vector?**
   - What we know: the plunger launches up-field (−y); the chute is a narrow lane on one side (right, per the original).
   - What's unclear: the precise entry point and any lateral tilt of the chute axis.
   - Recommendation: author the chute as a spec element with an explicit `axis` (or derive it from the chute polyline direction); tune `PLUNGER_AXIS` by feel. Claude's discretion (D-03).

2. **Router seam: `onPostStep` hook vs top-of-next-step drain?**
   - What we know: both are deterministic (one batch per fixed step).
   - What's unclear: whether the team wants the small `loop.ts` change.
   - Recommendation: add `onPostStep` (zero latency, symmetric with `onStep`); it does not touch planck-world/interface/soak, so it respects D-11.

3. **How much test re-anchoring does replacing the throwaway rig cause?**
   - What we know: `stability.test.ts`, `flipper-feel.test.ts`, `flipper-e2e.test.ts` hard-assume the 2×3 box + pivots.
   - Recommendation: budget a Wave-0 task to re-anchor these against the spec's flipper mounts *without* touching feel constants; keep the FLIP-04 soak/teeth calibration byte-identical by preserving the flipper fixture/feel exactly (only pivots move).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vitest headless proofs | ✓ (Phases 1–2 ran) | project toolchain | — |
| npm | install/scripts | ✓ | — | — |
| planck | fixtures/impulse/events | ✓ | 1.5.0 (in node_modules) | — |
| Vitest | test + soak gates | ✓ | 4.1.10 | — |
| Browser (Canvas 2D / KeyboardEvent) | debug-draw + input (manual only) | ✓ | modern | headless tests use synthetic events (no DOM) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None. This phase installs nothing.

## Validation Architecture

> nyquist_validation is **enabled** (`config.json workflow.nyquist_validation: true`). This section drives VALIDATION.md.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (node env, no DOM; synthetic KeyboardEvent-shaped objects) |
| Config file | `vitest.config.ts` (fast, excludes `**/*.gate.test.ts`); `vitest.gate.config.ts` (soak) |
| Quick run command | `npm test` |
| Full suite command | `npm test && npm run soak` |
| Determinism backbone | `src/harness/prng.ts` `mulberry32` (never `Math.random`); fixed `FIXED_DT` step |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TBL-01 / SC#1 | Ball never escapes the real table (layout is a closed, gap-free collider set) | soak/integration | `npm run soak` (re-pointed at real geometry via getElements) | ❌ Wave 0 (re-point existing soak) |
| TBL-01 / SC#4 | Collider segments and drawn segments come from ONE resolve (identity) | unit (structural) | `pytest`-equiv → `npx vitest run src/table/resolve.test.ts` | ❌ Wave 0 |
| TBL-01 | Arc tessellation respects chord-error bound; closed loops close; ids unique | unit | `npx vitest run src/table/resolve.test.ts` | ❌ Wave 0 |
| LNCH-01 | Longer hold → larger impulse → higher launch (monotonic), proportional | unit | `npx vitest run src/control/plunger-controller.test.ts` | ❌ Wave 0 |
| LNCH-01 | Same hold duration → identical impulse & trajectory (replay-determinism) | unit | `npx vitest run src/control/plunger-controller.test.ts` | ❌ Wave 0 |
| LNCH-01 | Space keydown→charge→release→impulse→ball climbs chute (no mocks) | e2e | `npx vitest run src/sandbox/plunger-e2e.test.ts` | ❌ Wave 0 |
| LNCH-01 | Space `event.repeat` ignored; blur clears charge | unit | `npx vitest run src/input/plunger-input.test.ts` | ❌ Wave 0 |
| LNCH-02 | `getCharge()` normalized [0,1] rises while held (clamped), resets on release | unit | `npx vitest run src/control/plunger-controller.test.ts` | ❌ Wave 0 |
| SC#4 | Router fans one batch/step to N listeners in fixed registration order, once each | unit | `npx vitest run src/app/collision-router.test.ts` | ❌ Wave 0 |
| SC#4 | Event normalization: ball-vs-bumper → ballId=ball, elementKind/Id=bumper regardless of fixture A/B order | unit | `npx vitest run src/physics/collision-event.test.ts` | ❌ Wave 0 |
| SC#4 | Sensor lane emits an event (begin-contact path), impulse 0 | integration | `npx vitest run src/physics/sensor-event.test.ts` | ❌ Wave 0 |
| SC#4 (zero-alloc) | `drainEvents()`/`router.dispatch()` reuse the same array ref; pool bounded across many steps | unit | `npx vitest run src/app/collision-router.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (fast unit + e2e, target < 30 s).
- **Per wave merge:** `npm test` + `npm run soak` — the soak, now on the **real table geometry**, is the key regression catcher: the real layout must be as tunnel-proof as the throwaway box was.
- **Phase gate:** full suite green + soak green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/table/resolve.test.ts` — tessellation chord-error bound, closed-loop closure, unique ids, one-resolve identity (SC#4 structural). Covers TBL-01.
- [ ] `src/input/plunger-input.test.ts` — Space edge latch, `repeat` suppression, blur clear (copy `flipper-input.test.ts`). Covers LNCH-01.
- [ ] `src/control/plunger-controller.test.ts` — charge FSM, monotonic charge→impulse, `getCharge()` clamp/reset, determinism (spy world). Covers LNCH-01/LNCH-02.
- [ ] `src/app/collision-router.test.ts` — fixed-order fan-out, one-batch-per-step, one-way, zero-alloc reuse. Covers SC#4.
- [ ] `src/physics/collision-event.test.ts` + `sensor-event.test.ts` — normalization + begin-contact sensor path. Covers SC#4.
- [ ] `src/sandbox/plunger-e2e.test.ts` — keyboard→charge→impulse→launch, no mocks (copy `flipper-e2e.test.ts`). Covers LNCH-01.
- [ ] **Re-point the existing soak/containment at real geometry** — `soak.ts`/`containment.ts` read `getBoundarySegments()` (kept as shim), so this is a wiring/data change; the swept-invariant code stays UNTOUCHED (D-01/D-02). Verify green on the real table.
- [ ] **Re-anchor rig-coupled tests** — `stability.test.ts`, `flipper-feel.test.ts`, `flipper-e2e.test.ts` assume the 2×3 box + pivots; re-anchor to spec mounts without changing any feel constant (preserve FLIP-04 calibration byte-identical).

## Security Domain

> `security_enforcement` is absent from `config.json` (= enabled). Assessed honestly below; this is an offline, client-side, no-auth, no-network, no-persistence phase, so most ASVS categories are N/A.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts/auth anywhere in v1 |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No server, no resources to gate |
| V5 Input Validation | yes (light) | Validate spec descriptors are finite & in-bounds at resolve time; ignore `event.repeat`; `preventDefault` bound keys only |
| V6 Cryptography | no | No secrets, no crypto |
| V11 Business Logic / Anti-automation | no | Single-player, local |
| V14 Configuration | no | Static bundle; no server config |

### Known Threat Patterns for {browser, client-side, offline}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed spec (NaN/Infinity vertex, degenerate arc) crashes the solver | Denial of Service | `resolve()` asserts finite, non-degenerate descriptors; unit-tested (Wave 0) |
| Pathological launch impulse / spam Space → physics blowup | Denial of Service (availability/feel) | Impulse clamped to `PLUNGER_MAX_IMPULSE`; charge clamped to `PLUNGER_MAX_CHARGE`; launch speed far under the proven 58 m/s soak ceiling; existing `MAX_FRAME_MS` spiral clamp holds |
| Non-determinism (wall-clock/`Math.random`) breaking replay proofs | Tampering (with test integrity) | Charge on fixed-step accumulator; seeded `mulberry32` if any jitter is ever added |

No network, no third-party runtime input, no data at rest → the classic web threat surface (injection, XSS, SSRF, auth bypass) does not apply this phase.

## Sources

### Primary (HIGH confidence)
- `node_modules/planck/dist/planck.d.ts` — `applyLinearImpulse(impulse, point, wake)` impulse in N·s = kg·m/s (1786-1795); `ChainShape(vertices, loop)` + ghost vertices (2608-2646); `EdgeShape.setPrevVertex/setNextVertex` (2449-2508); `isSensor`/`setSensor` (966,1033,1037); contact events `begin-contact`/`pre-solve`/`post-solve` (2152-2205). `[VERIFIED]`
- In-repo code read directly: `types.ts`, `planck-world.ts`, `constants.ts`, `flipper-input.ts`, `flipper-controller.ts`, `main.ts`, `debug-draw.ts`, `containment.ts`, `soak.ts`, `loop.ts`, `package.json`, `vitest*.config.ts`, and the e2e/smoke tests. Grep-verified `.aId/.bId` write-only, `getBoundarySegments` 10 call sites. `[VERIFIED]`
- `.planning/phases/03-table-plunger-event-bus/03-CONTEXT.md` — locked decisions D-01..D-12. `[CITED]`
- k4zmu2a/SpaceCadetPinball `TPlunger.cpp` — `Boost += PullbackIncrement` (cap `MaxPullback`=100 in 3D mode), release impulse `Boost·(1 + RandFloat()·0.1)`. `[CITED: github.com/k4zmu2a/SpaceCadetPinball]`

### Secondary (MEDIUM confidence)
- GameFAQs table-diagram + StrategyWiki Gameplay — anchor positions (chute, bumper cluster, flippers, drain) for the anchored-approximate transcription. Positions read by eye (Claude's discretion, D-03). `[CITED: gamefaqs.gamespot.com/pc/563047 · strategywiki.org/wiki/3D_Pinball_for_Windows:_Space_Cadet]`
- gameprogrammingpatterns.com Event Queue — dispatch-at-a-fixed-seam rationale for the router. `[CITED]`

### Tertiary (LOW confidence)
- None relied upon; all decisive claims verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every API verified against installed `planck@1.5.0` types.
- Architecture: HIGH — spec/resolve/router patterns verified against in-repo conventions and the exact call-site blast radius; the one non-obvious fact (sensors ≠ post-solve) is verified from the engine surface.
- Plunger model: HIGH — TPlunger behavior confirmed from source; Planck impulse units confirmed from types.
- Table transcription: MEDIUM — deliberately approximate (D-03); anchor precision is by-eye discretion, not a verifiable constant.
- Pitfalls: HIGH — each is grounded in either the engine surface or the existing codebase.

**Research date:** 2026-07-16
**Valid until:** ~2026-08-15 (stack is locked/stable; only the table anchors are judgment-based and won't "expire").
