# Phase 4: Reactive Elements & Game Rules - Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 24 (new + modified)
**Analogs found:** 23 / 24

Note: the composition root and ball feed live in `src/sandbox/` (`src/sandbox/main.ts`, `src/sandbox/ball-feed.ts`), not `src/main.ts` / `src/control/ball-feed.ts`. All analog paths below are verified git-tracked.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/game/tuning.ts` (new) | config | static | `src/physics/constants.ts` (per-const doc blocks) | role-match |
| `src/physics/constants.ts` (mod: export `BALL_DENSITY`, `ballMass`) | config | static | itself; private const at `src/physics/planck-world.ts:69` | exact |
| `src/physics/planck-world.ts` (mod: import `BALL_DENSITY`) | adapter | - | itself line 69, 637 | exact |
| `src/physics/types.ts` (mod: `drainEvents(): readonly CollisionEvent[]`) | model/interface | - | itself line 200 | exact |
| `src/game/reactive-elements.ts` | service (bus consumer) | event-driven, record-then-service | `src/sandbox/ball-feed.ts` | exact |
| `src/game/game-session.ts` | service + FSM | event-driven | `src/sandbox/ball-feed.ts` (supersedes it) + `src/control/flipper-controller.ts` FSM switch | exact |
| `src/game/tilt-meter.ts` | utility (pure state) | transform | `src/control/flipper-controller.ts` (step-counted state, no clock) | partial |
| `src/input/game-input.ts` | input latch | event-driven | `src/input/plunger-input.ts` | exact |
| `src/control/flipper-controller.ts` (mod: `setEnabled`) | controller | step-driven | itself `onPressEdge`/`update` (lines 85-140) | exact |
| `src/control/plunger-controller.ts` (mod: IN-01 rest-speed gate) | controller | step-driven | itself zone check (~line 131) | exact |
| `src/ui/hud.ts` | component (DOM view) | write-on-change | `src/sandbox/debug-draw.ts` `HudData` + `PlungerInput` "handle* testable without DOM" | partial |
| `src/harness/reactive-world.ts` | test harness decorator | - | `SoakConfig.makeWorld` in `src/harness/soak.ts:123-127` | role-match |
| `src/sandbox/main.ts` (mod) | composition root | wiring | itself lines 100-176 | exact |
| `src/sandbox/debug-draw.ts` (mod: lit lights) | renderer | render | itself | exact |
| `index.html` (mod: HUD markup) | config/markup | - | itself | exact |
| `src/sandbox/ball-feed.ts` + test (delete) | - | - | superseded by GameSession | - |
| `src/game/reactive-elements.test.ts` | test (spy world) | - | `src/app/collision-router.test.ts` + `src/control/flipper-controller.test.ts` | role-match |
| `src/game/reactive-table.test.ts` | test (real PlanckWorld) | - | `src/sandbox/launch-and-route.test.ts` | role-match |
| `src/game/game-session.test.ts` | test | - | `src/sandbox/ball-feed.test.ts` (port CR-01 cases) | exact |
| `src/game/tilt-meter.test.ts` | test (pure) | - | `src/harness/prng.test.ts` | partial |
| `src/input/game-input.test.ts` | test | - | `src/input/plunger-input.test.ts` | exact |
| `src/ui/hud.test.ts` | test (fake sinks) | - | `src/input/plunger-input.test.ts` (synthetic, no DOM) | partial |
| `src/sandbox/game-e2e.test.ts` | e2e test | - | `src/sandbox/launch-and-route.test.ts` / `ball-feed.test.ts` `makeSandbox` | exact |
| `src/sandbox/game.determinism.test.ts` | test | - | `src/sim/loop.determinism.test.ts` | exact |
| `src/harness/reactive-table-soak.gate.test.ts` | soak gate | batch | `src/harness/table-soak.gate.test.ts` | exact |
| `src/harness/reactive-soak.test.ts` | fast soak | batch | `src/harness/table-soak.test.ts` | exact |

## Pattern Assignments

### `src/game/reactive-elements.ts` and `src/game/game-session.ts` (event-driven, record-then-service)

**Analog:** `src/sandbox/ball-feed.ts` (whole file, 61 lines)

Header doc (lines 1-18) states the wiring contract; copy its shape: "construct once after controllers; call `service()` from `onPostStep` right AFTER `router.dispatch()`; listener only records; engine-agnostic; steady state allocates nothing".

Imports + world slice (lines 20-24):
```ts
import type { CollisionRouter } from "../app/collision-router";
import type { BallId, BallSpec, CollisionEvent, PhysicsWorld } from "../physics/types";

/** The world slice the feed needs. */
export type BallFeedWorld = Pick<PhysicsWorld, "addBall" | "removeBall">;
```
ReactiveElements: `Pick<PhysicsWorld, "applyImpulse" | "getBalls">` (or whatever velocity read it needs). GameSession: `addBall | removeBall`.

Core (lines 34-60):
```ts
constructor(world: BallFeedWorld, router: CollisionRouter, spawn: BallSpec) {
  this.world = world;
  this.spawn = spawn;
  this.active = world.addBall(spawn);
  router.register(this.onEvent);
}
service(): void {
  if (this.drained === null) return;
  this.world.removeBall(this.drained);
  this.drained = null;
  this.active = this.world.addBall(this.spawn);
}
/** Bus listener, bound once: record the drain, never touch the world here. */
private readonly onEvent = (e: CollisionEvent): void => {
  if (e.elementKind === "drain" && e.ballId === this.active) this.drained = e.ballId;
};
```
Rules: drain is bus-driven only (never positional, CR-01: `PLUNGER_REST.y 6.2 > DRAIN_Y 6.05`). Pending kicks go into preallocated pooled slots; copy scalars out of the pooled `CollisionEvent` (router contract, `src/app/collision-router.ts:14-18`). GameSession FSM: hand-rolled `switch` on a string-union phase, like `FlipperController.update()` (`src/control/flipper-controller.ts:126-140`). Expose `activeBallId` getter (plunger needs it, `main.ts:141`).

### `src/game/tilt-meter.ts` (pure state)
No world, no clock; step-counted decay. Mirror FlipperController's "state mutated in place, advanced once per fixed step by `update()`" (file header line 13). Constants from `./tuning`.

### `src/game/tuning.ts`, `src/physics/constants.ts`
Copy per-constant JSDoc derivation style from `src/physics/constants.ts:214-254` (e.g. "Impulse -> speed: the ball mass is m = BALL_DENSITY · π · BALL_RADIUS_M² ..."). Additive: `export const BALL_DENSITY = 1; export function ballMass(r: number)`; replace `src/physics/planck-world.ts:69 const BALL_DENSITY = 1;` with an import (line 637 uses it). Value identical so soak stays byte-identical.

### `src/input/game-input.ts`
**Analog:** `src/input/plunger-input.ts` (lines 1-80+)
```ts
import type { KeyEventLike } from "./flipper-input";
const PLUNGER_CODE = "Space";
export interface PlungerEdges { readonly press: boolean; readonly release: boolean; readonly cancel: boolean; }
interface MutableEdges { press: boolean; release: boolean; cancel: boolean; }
export class PlungerInput {
  private held = false;
  private readonly pending: MutableEdges = { press: false, release: false, cancel: false };
  private readonly view: MutableEdges = { press: false, release: false, cancel: false };
  private readonly onWindowKeyDown = (e: KeyboardEvent): void => this.handleKeyDown(e);
  ...
  handleKeyDown(e: KeyEventLike): void {
    if (e.code !== PLUNGER_CODE) return; // other codes: untouched
    e.preventDefault();
    if (e.repeat) return;
    if (this.held) return;
    this.held = true;
    this.pending.press = true;
  }
```
Bound codes: `KeyX`, `Period`, `ArrowUp` (nudge), `Enter`/`NumpadEnter` (start). Press edges only; `preventDefault` only on bound codes; blur/visibility clears held; `drainEdges()` returns the reused view; `attach()/detach()` wire window/document.

### `src/control/flipper-controller.ts` — add `setEnabled(enabled)`
Gate `onPressEdge` (lines 92-102) when disabled; on disable, force every FSM in `flipping-up`/`held-up` to `returning` with `setFlipperMotor(id, -1)` exactly as `onReleaseEdge` (lines 108-117). Keep zero-allocation. Extend `src/control/flipper-controller.test.ts`.

### `src/control/plunger-controller.ts` — IN-01
Add a ball-speed check beside the existing zone test (~line 131, `const z = this.zone;`). Extend `plunger-controller.test.ts`.

### `src/ui/hud.ts`
Element-like injection (`TextSink { textContent: string }`) so vitest node env needs no DOM — same idea as `PlungerInput`'s `handle*` methods + `KeyEventLike`. Write `textContent` only when the cached value changed.

### `src/sandbox/main.ts` (composition)
Current wiring (lines 100-109, 173-176):
```ts
const plungerInput = new PlungerInput();
const plunger = new PlungerController(world);
const router = new CollisionRouter(world);
const feed = new BallFeed(world, router, BALL_SPAWN);
const loop = new FixedStepLoop(world);
...
function onPostStep(): void {
  router.dispatch();
  feed.service();
}
```
Replace `feed` with `session` (and `plunger.onReleaseEdge(session.activeBallId)` at line 141); add `reactive.service()` / `session.service()` after `router.dispatch()`; drain `GameInput` edges inside `onFixedStep` (top of step, line ~135-143). Remove or slim the demo bus logger (lines 150-166). Keep `onFixedStep`/`onPostStep` built once and passed by reference.

### `src/sandbox/game-e2e.test.ts`, `src/game/game-session.test.ts`
**Analog:** `src/sandbox/ball-feed.test.ts` lines 1-60 (`makeSandbox`): real `PlanckWorld`, `new FlipperController(world)` before first ball, `PlungerInput`, `CollisionRouter`, `FixedStepLoop`, a spy listener `router.register((e) => { if (e.elementKind === "drain") drainedIds.push(e.ballId); })`, and `frame(deltaMs)` driving `loop.advance`. Synthetic key: `{ code: "Space", repeat: false, preventDefault: () => {} }`. Port CR-01 cases (lines 98-152): parked ball never respawned; full-charge launch at multiple Hz; drain removes and feeds exactly one fresh ball. `STEPS_TO_CAP = Math.ceil(PLUNGER_MAX_CHARGE / (PLUNGER_CHARGE_RATE * FIXED_DT))`.

### `src/game/reactive-table.test.ts`
Copy `src/sandbox/launch-and-route.test.ts` header composition (lines 1-40): construct `PlanckWorld` only (no `planck` import), `SPEC_KINDS`, `WATCH_STEPS = Math.round(4 / FIXED_DT)`. Seeds via `mulberry32` from `src/harness/prng.ts`.

### `src/sandbox/game.determinism.test.ts`
Copy `src/sim/loop.determinism.test.ts`: `FRAME_60_HZ/120/144`, total parked at `(K + 0.5)·STEP_MS`, assert identical step count and bit-identical state; add score/ball/state equality and a scripted key timeline keyed by step index.

### Soak: `src/harness/reactive-world.ts`, `reactive-table-soak.gate.test.ts`, `reactive-soak.test.ts`
Copy `src/harness/table-soak.gate.test.ts` (lines 1-40: `DEFAULT_*` consts, `MIN_SIMULATED_SECONDS = 600`, `envNumber`, `runSoak`/`describeFailure`). Inject rules via `SoakConfig.makeWorld` (`src/harness/soak.ts:123-127`):
```ts
readonly makeWorld?: (options: { readonly bullet: boolean }) => PhysicsWorld;
```
`reactive-world.ts` = `PhysicsWorld` decorator that wraps `PlanckWorld`, owns a router + ReactiveElements, and runs dispatch/service after `step()`. Must NOT modify `soak.ts`/`containment.ts`. Include CCD-off RED control.

## Shared Patterns
- **Engine isolation:** only `src/physics/planck-world.ts` imports `planck`; everything in `src/game/` imports `PhysicsWorld` as `import type`.
- **Bus contract** (`src/app/collision-router.ts:14-18`): no per-event allocation, never retain pooled records, never call world from a listener. Mutations only in `service()` after `dispatch()` (between steps; `applyImpulse` contract `src/physics/types.ts:183`).
- **Zero steady-state allocation:** preallocated views/pools, bound handler arrow fields (`ball-feed.ts:58`, `plunger-input.ts:55-58`).
- **Determinism:** step-counted cooldowns/decay, no wall clock, `FIXED_DT`.
- **Tests:** vitest, node env, synthetic `KeyEventLike`, spy worlds via `Pick<PhysicsWorld, ...>`.

## No Analog Found
| File | Reason |
|---|---|
| `src/ui/hud.ts` | No DOM overlay exists yet; use RESEARCH.md `TextSink` sketch (line ~281) |

## Metadata
**Search scope:** `src/` (all git-tracked)
**Date:** 2026-11-20
