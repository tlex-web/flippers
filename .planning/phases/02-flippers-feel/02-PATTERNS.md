# Phase 2: Flippers & Feel - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 8 source targets (2 create, 6 modify) + 3–4 new/extended test files
**Analogs found:** 8 / 8 source targets have an in-repo analog (5 are self-analogs; 2 new files map to structural analogs; 1 has a partial analog for its novel DOM slice)

> Engine-isolation rule (CLAUDE.md + CONTEXT D-05/D-10): **only `src/physics/planck-world.ts` imports `planck`.** The new `src/input/` module and `FlipperController` are pure TypeScript over the `PhysicsWorld` interface. Every hot path (rAF frame, `step()`, input latch drain) is **zero per-frame allocation** — copy the pooled/grow-only patterns below, never allocate in a loop body.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/input/*.ts` (NEW — keyboard held-set + latched edges) | utility / input adapter | event-driven → request-response (latch, drained per fixed step) | `src/physics/planck-world.ts` drain/pool (`nextEventSlot`/`drainEvents`) + `src/sim/loop.ts` engine-agnostic class | partial (novel DOM slice; no window-listener analog exists) |
| `src/**/flipper-controller.ts` (NEW — FSM) | controller / state machine (pure TS) | event-driven → state transform | `src/sim/loop.ts` `FixedStepLoop` (engine-agnostic class over `PhysicsWorld`); FSM-like drive loop in `soak.ts` `runCase` | role-match (structure exact; FSM logic is new) |
| `src/physics/planck-world.ts` (MODIFY — 2 capsule flippers + sub-stepping in `step()`) | service / engine adapter | transform / request-response | itself — `buildTestFlipper()`, `step()`, `primeBallCcd()`, `nextEventSlot()` event accumulation | exact (self) |
| `src/physics/types.ts` (MODIFY — add `tipRadius`) | model / interface contract | data model | itself — `FlipperState` interface | exact (self) |
| `src/physics/constants.ts` (MODIFY — feel constants) | config | static config | itself — `FLIPPER_*` reference-anchored block | exact (self) |
| `src/sandbox/main.ts` (MODIFY — wire input + controller + 2nd flipper + ball feed) | composition root / entry | event-driven + request-response (rAF) | itself — composition root + rAF `frame()` + `loop.advance` step count | exact (self) |
| `src/sandbox/debug-draw.ts` (MODIFY — draw capsule) | component / view (throwaway renderer) | request-response (read → render) | itself — `drawFlippers()` | exact (self) |
| `src/harness/soak.ts` (EXTEND — FLIP-04 gate) + reuse `containment.ts` `flipperSweptTunnel` | test / headless harness | batch / seeded sweep | itself — `runCase()` sweep loop + `flipperSweptTunnel` invariant | exact (self) |

**New test files** (classification + analogs in the "Test Patterns" shared section): FlipperController unit test, input-module unit test, FLIP-04 `*.gate.test.ts`, and (optionally) a flipper feel/energy `*.test.ts`.

---

## Pattern Assignments

### `src/input/*.ts` — NEW keyboard held-set + latched edges (utility, event-driven → request-response)

**Analogs:** `src/physics/planck-world.ts` (drain/latch + grow-only pool), `src/sim/loop.ts` (engine-agnostic class shape). **No in-repo analog exists for window `keydown`/`keyup` listeners, `event.code`, `event.repeat`, or `blur`/`visibilitychange` — this is the first keyboard input in the codebase (D-10).** Use the MDN/javascript.info refs in CONTEXT `<canonical_refs>` for the DOM specifics; copy the *structure* (module header, pooling, drain) from the analogs below.

**Module-header + engine-isolation comment pattern** to mirror (from `src/sim/loop.ts` lines 1–15): every module opens with a doc block stating what it is, that it imports NO engine, and which threat/decision it honors. The input module header must state it imports no `planck` (D-10) and does zero per-frame allocation.

**Latch → drain pattern** (the input latch must NOT allocate per event/frame). Copy the reused-view + reset-count shape from `drainEvents()` (`src/physics/planck-world.ts` lines 526–540):
```typescript
drainEvents(): CollisionEvent[] {
  const view = this.drainedEvents;              // reused output array
  for (let i = 0; i < this.eventCount; i++) {
    const slot = this.eventPool[i];
    if (slot) view[i] = slot;
  }
  view.length = this.eventCount;
  this.eventCount = 0;                           // reset so the pool recycles (bounded)
  return view;
}
```
For input, the "held set" is a `Set<string>` of `event.code`s; press/release **edges** should latch into a small reused structure that `main.ts` drains at the top of each fixed step (D-10). Keep the held `Set` long-lived; do not recreate it per frame.

**Tab-blur / visibility lifecycle** — behavioral precedent is `src/sim/loop.tabblur.test.ts` (blur survival is already a proven concern) and the `MAX_FRAME_MS` clamp (`constants.ts` lines 87–93). D-10 requires: on window `blur` and `document` `visibilitychange` (hidden), **force-clear the held set and emit release edges**. There is no code analog for attaching these listeners — implement fresh, but keep the "clear + emit release" idempotent and allocation-free.

**Edge-trigger per SIDE (OR across a side's codes):** the multi-binding map (D-09: left = `KeyZ`/`ShiftLeft`/`ArrowLeft`; right = `Slash`/`ShiftRight`/`ArrowRight`) means a side is "held" iff ANY of its codes is in the set, and "releases" only when ALL are up. Ignore `event.repeat === true` and de-dupe against the set so OS auto-repeat never re-fires. `preventDefault()` on bound codes only (`/` = Firefox quick-find, arrows = scroll) — do NOT swallow reserved `Space`/`X`/`.`/`ArrowUp`.

---

### `src/**/flipper-controller.ts` — NEW FSM (controller, event-driven → state transform)

**Analog:** `src/sim/loop.ts` `FixedStepLoop` — the canonical **engine-agnostic pure-TS class that takes a `PhysicsWorld` in its constructor and never imports `planck`**. Copy this shape exactly (D-05: unit-testable against a fake/spy `PhysicsWorld`).

**Engine-agnostic class-over-interface shape** (`src/sim/loop.ts` lines 14–16, 30–47):
```typescript
import { FIXED_DT, MAX_FRAME_MS } from "../physics/constants";
import type { BallState, PhysicsWorld } from "../physics/types";

export class FixedStepLoop {
  private readonly world: PhysicsWorld;
  // ...
  constructor(world: PhysicsWorld) {
    this.world = world;
    // ...
  }
}
```
The `FlipperController` should likewise `import type { PhysicsWorld } from "../physics/types"` (type-only, no engine) and drive the world **only** through `setFlipperMotor(id, direction)`.

**The `setFlipperMotor(id, direction)` contract the FSM talks to** (`src/physics/types.ts` lines 106–115; adapter impl `planck-world.ts` lines 484–496): direction is **sign-only** — `+1` toward the upper limit, `−1` toward the lower, `0` holds. The FSM (`resting → flipping-up → held-up → returning`, D-05) maps: press → `+1`; **hold `+1` continuously during `held-up`** (D-06(1): never release to `0` or the bat sags off the limit); release → `−1`; settled at rest → `0` (or continue `−1` into the lower limit, per your FSM design). Magnitudes live in the adapter's constants, not the FSM.

**Behavioral precedent for the drive loop** — `soak.ts` `runCase` already implements an FSM-like "reverse the motor at the joint limits" driver (`src/harness/soak.ts` lines 387–405):
```typescript
if (flipperDir > 0 && flPre.angle >= FLIPPER_UPPER_ANGLE - FLIPPER_LIMIT_EPS) {
  flipperDir = -1;
} else if (flipperDir < 0 && flPre.angle <= FLIPPER_LOWER_ANGLE + FLIPPER_LIMIT_EPS) {
  flipperDir = 1;
}
world.setFlipperMotor(flPre.id, flipperDir);
```
The FSM is the *input-driven* analogue of this: transitions are triggered by input edges (drained from the input latch), not by angle-limit auto-reversal. Read the live angle via `getFlippers()` if the FSM needs to detect "reached held-up".

---

### `src/physics/planck-world.ts` — MODIFY (service / engine adapter, exact self-analog)

**Analog:** itself. This is the ONLY file that imports `planck`.

**1. Productize `buildTestFlipper()` → two mirrored capsule flippers** (current single-flipper build, lines 291–346). The multi-fixture capsule (D-07) reuses the same dynamic-body + motorized-`RevoluteJoint` skeleton; add a tip `Circle` (and optional base `Circle`) fixture, and generalize the single-flipper registry pushes into a per-flipper build called twice (mirrored). Current pattern to copy/generalize:
```typescript
private buildTestFlipper(): void {
  const px = FLIPPER_PIVOT.x;
  const py = FLIPPER_PIVOT.y;
  const pivot = this.world.createBody({ position: Vec2(px, py) });          // static hinge
  const bat = this.world.createDynamicBody({ position: Vec2(px, py) });     // dynamic bat
  bat.createFixture(
    new Box(FLIPPER_LENGTH_M / 2, FLIPPER_HALF_WIDTH_M, Vec2(FLIPPER_LENGTH_M / 2, 0)),
    { density: FLIPPER_DENSITY, friction: WALL_FRICTION },
  );
  const tag: BodyTag = { kind: "flipper", id: FLIPPER_ID };
  bat.setUserData(tag);
  const joint = new RevoluteJoint(
    { enableMotor: true, motorSpeed: FLIPPER_MOTOR_SPEED, maxMotorTorque: FLIPPER_MAX_MOTOR_TORQUE,
      enableLimit: true, lowerAngle: FLIPPER_LOWER_ANGLE, upperAngle: FLIPPER_UPPER_ANGLE },
    pivot, bat, Vec2(px, py),
  );
  this.world.createJoint(joint);
  this.flipperJoints.push({ id: FLIPPER_ID, body: bat, joint });
  this.flipperPool.push({ id: FLIPPER_ID, pivotX: px, pivotY: py, angle: bat.getAngle(),
    length: FLIPPER_LENGTH_M, halfWidth: FLIPPER_HALF_WIDTH_M });               // add tipRadius here (D-08)
}
```
Concrete D-07 build (pivot stays at local x=0, bat extends +x, NO joint/pivot change): `Box(halfLen 0.18, halfWidth 0.07, center Vec2(0.25,0))` + tip `Circle(0.07)` at `Vec2(0.43,0)` + optional base `Circle(0.07)` at `Vec2(0.07,0)`. Add **`restitution: 0`** to the flipper fixtures (D-06(3): kill ball micro-bounce on catch — Box2D takes the max of the pair). Both flippers push into `flipperJoints` + `flipperPool` (each gets a distinct `FLIPPER_ID`); the pools are already arrays iterated by index in `step()` (lines 442–447), so N flippers is additive. Import `Circle` is **already imported** (line 17). Placement/mirroring is test-rig scaffold (D-11) — keep it a replaceable const like the existing `FLIPPER_PIVOT` (lines 81–83).

**2. Insert adaptive angular sub-stepping in `step()`** (current, lines 422–450). D-01: split `FIXED_DT` into `N = ceil(ω · FLIPPER_LENGTH_M · FIXED_DT / (0.5·r))` Planck sub-steps, derived from **live joint speed** (`joint.getJointSpeed()` / `body.getAngularVelocity()`), not wall-clock (determinism). Current single-`world.step` call to wrap:
```typescript
step(dtSeconds: number): void {
  this.world.step(dtSeconds, VELOCITY_ITERATIONS, POSITION_ITERATIONS);   // <-- becomes an N-sub-step loop
  // ... refresh ball pool (426-438), flipper pool (442-447), syncContactPoints() (449)
}
```
Constraints from CONTEXT `<code_context>`: **accumulate `post-solve` events across sub-steps** (do NOT drain/reset between them), and **`syncContactPoints()` only after the LAST sub-step**. The `post-solve` handler (lines 239–258) already appends into the grow-only `eventPool` via `nextEventSlot()` and only `drainEvents()` resets `eventCount` — so accumulation across sub-steps falls out for free as long as you call `this.world.step(subDt, ...)` N times without draining. Sum sub-step dt to exactly `dtSeconds`. Zero-alloc: the sub-step count is a scalar; do not build arrays.

**3. Reuse `primeBallCcd()` for new bodies** (lines 396–420) — unchanged; call it for any newly-added ball as `addBall` already does (lines 379–381). The capsule flipper bodies are dynamic but motor-driven, not bullets; CCD arming is a **ball** concern (issue #167). The anti-tunnel guarantee for the bat is D-01 sub-stepping, not `setBullet` on the bat.

**4. `setFlipperMotor` sign→speed map** (lines 484–496) — re-map to the new feel speeds: `+1 → FLIPPER_UP_SPEED`, `−1 → FLIPPER_RETURN_SPEED`, `0 → 0` (D-05), replacing the single `FLIPPER_MOTOR_SPEED`:
```typescript
setFlipperMotor(id: number, direction: number): void {
  const entry = this.flipperJoints.find((f) => f.id === id);
  if (!entry) return;
  const speed = direction > 0 ? FLIPPER_MOTOR_SPEED : direction < 0 ? -FLIPPER_MOTOR_SPEED : 0;
  entry.joint.setMotorSpeed(speed);
  entry.body.setAwake(true);
}
```
Note the mirrored right flipper sweeps in the opposite angular sense — confirm the sign convention per flipper (mirroring may invert which limit "up" means).

---

### `src/physics/types.ts` — MODIFY (model / interface, exact self-analog)

**Analog:** itself, `FlipperState` (lines 63–70):
```typescript
export interface FlipperState {
  readonly id: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly angle: number;
  readonly length: number;
  readonly halfWidth: number;
}
```
D-08: **add `readonly tipRadius: number;`** (capsule renders as a stadium; `tipRadius = halfWidth` for the symmetric capsule). Keep the pooled-snapshot doc-comment convention (lines 58–62: "read out of a pooled array … treat every field as read-only"). The adapter's `MutableFlipperState` (`planck-world.ts` lines 111–119) must gain the matching field, and the pool push (line 338–345) must set it. The interface is otherwise stable — no other surface change (CONTEXT: "no new interface surface needed except `tipRadius`").

---

### `src/physics/constants.ts` — MODIFY (config, exact self-analog)

**Analog:** itself — the `FLIPPER_*` block (lines 95–143). Existing constants are **stress-tuned; re-tune for feel this phase** (CONTEXT `<canonical_refs>`). Reference-anchored doc-comment style to mirror (each const has a "why/anchor" block, e.g. lines 105–110, 119–125). Add per D-06/D-08 + Claude's discretion:
- `FLIPPER_UP_SPEED`, `FLIPPER_RETURN_SPEED` (replace the single `FLIPPER_MOTOR_SPEED = 40`, line 125).
- `FLIPPER_TIP_RADIUS_M` (the D-07 tip circle radius, ~0.07).
- Re-tune `FLIPPER_MAX_MOTOR_TORQUE` (line 132) so it **exceeds ball gravity torque at the tip** `m · g_inplane · FLIPPER_LENGTH_M` (D-06(2)) — motor never yields at the limit.
- Re-tune angle limits (`FLIPPER_LOWER_ANGLE`/`FLIPPER_UPPER_ANGLE`, lines 139–142) for feel.
- Keep `FLIPPER_DENSITY = 1` (lives in `planck-world.ts` line 83; D-07 says added tip mass is within budget).
- Do **NOT** add angular damping to the bat (D-06(4): blunts the snap).
These are the single source of truth (HMR-tunable). `IN_PLANE_GRAVITY` (line 41) and `BALL_RADIUS_M = 0.2` (line 48) feed the torque + sub-step derivations.

---

### `src/sandbox/main.ts` — MODIFY (composition root / entry, exact self-analog)

**Analog:** itself — the composition root + rAF `frame()` loop (lines 43–158). The **one engine-specific line is `new PlanckWorld()`** (line 51); everything else is interface-only (D-05). Add here (D-10, D-11): construct the input module (attach window listeners), construct the `FlipperController(world)`, feed the second flipper, and add a ball-feed test rig.

**`loop.advance` returns the fixed-step count — latch input edges onto these steps** (lines 77 + the fixed-step structure). Per D-10, drain the input latch and step the FSM **at the top of each fixed step, before `world.step()`**. Today `main.ts` calls `loop.advance(deltaMs)` and gets a step count back (line 77); to interleave input at the fixed-step granularity you either (a) drive the FSM once per `advance()` call against the drained edges (coarser), or (b) if sub-frame per-step latching is needed, iterate steps via the loop. The loop exposes `advance()` returning `steps` (`src/sim/loop.ts` lines 54–72) and `totalSteps` — the FSM/input drain must run before the physics it affects. Follow CONTEXT D-10: "drains the latch at the top of each fixed step (before `world.step()`)."

**Zero per-frame allocation pattern to preserve** (lines 60–70, 151–156): pre-allocate buffers outside `frame()`, mutate scalars in place, grow pools only on growth:
```typescript
const interpolated: InterpolatedBall[] = [];
const hud: HudData = { fps: 0, physicsHz: 120, kineticEnergy: 0 };
// ...
function growTo(pool: InterpolatedBall[], n: number): void {
  while (pool.length < n) pool.push({ id: 0, x: 0, y: 0, vx: 0, vy: 0, radius: 0, angle: 0 });
}
```
The input held-`Set` and FSM instances must be constructed once in `main()`, never inside `frame()`. `world.drainEvents()` is already called each frame (line 84) to keep the event pool bounded — keep that.

---

### `src/sandbox/debug-draw.ts` — MODIFY (component / view, exact self-analog)

**Analog:** itself — `drawFlippers()` (lines 185–200):
```typescript
private drawFlippers(flippers: readonly FlipperState[]): void {
  const ctx = this.ctx;
  ctx.fillStyle = COL_FLIPPER;
  for (const f of flippers) {
    const hw = f.halfWidth * PIXELS_PER_METER;
    ctx.save();
    ctx.translate(f.pivotX * PIXELS_PER_METER, f.pivotY * PIXELS_PER_METER);
    ctx.rotate(f.angle);
    ctx.fillRect(0, -hw, f.length * PIXELS_PER_METER, hw * 2);   // bat body
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);                            // pivot dot
    ctx.fill();
    ctx.restore();
  }
}
```
D-08: **read the new `tipRadius`** and draw a **stadium** (capsule): the rectangular core plus a filled `arc` of radius `tipRadius * PIXELS_PER_METER` at the tip (`x = f.length * PIXELS_PER_METER`), and optionally at the base. The loop already iterates all flippers, so the second flipper draws for free once it's in the pool. Keep the reused-buffer / cached-gradient discipline (lines 96–104) — no new per-frame allocation on the render path (threat T-03-01). `FlipperState` import is already present (line 20).

---

### `src/harness/soak.ts` (+ `containment.ts` `flipperSweptTunnel`) — EXTEND (test / harness, exact self-analog)

**Analog:** itself — `runCase()` (lines 345–486) and the `flipperSweptTunnel` invariant (`containment.ts` lines 178–210). D-03: **extend the existing soak into a flipper-primary swept non-penetration gate**; do NOT rewrite — the invariant already sub-samples the bat's intra-step sector from the pre/post angles read off `getFlippers()`, so it catches a pass-through regardless of how many Planck sub-steps ran underneath.

**Per-step swept check the FLIP-04 gate reuses** (`src/harness/soak.ts` lines 433–449):
```typescript
const fl = world.getFlippers()[0];
const escapedBoundary = ignoreBoundary ? false : sweptEscaped(prev, next, effRadius, boundary);
let escapedFlipper = false;
if (fl && flPreAngle !== null) {
  escapedFlipper = flipperSweptTunnel(
    prev, next, BALL_RADIUS_M,
    { x: fl.pivotX, y: fl.pivotY }, fl.length, fl.halfWidth,
    flPreAngle, fl.angle,
  );
}
```
**Note the pre-angle capture** (lines 407–411): `flPre.angle` is a **live pooled reference** that reads the POST-step value after `world.step()`, so it must be **copied out before the step** (`const flPreAngle = flPre ? flPre.angle : null;`). Preserve this when extending.

D-03 gate additions: drive the flipper at the **feel-tuned peak ω** (not the stress `FLIPPER_MOTOR_SPEED`) across a **dense seeded phase-offset sweep + aim jitter** so some seeded case has the ball arriving mid-sweep at peak angular speed; assert **green with sub-stepping ON**. **Negative control with teeth:** same peak ω with sub-stepping forced OFF must go **RED**. The existing `flipperNegativeControl` (lines 43–50 of `soak.test.ts`, and `flipperThroughLaunch` lines 247–263) is the template for the teeth control — but the NEW control toggles **sub-stepping OFF** (the D-01 mechanism), proving the mechanism, not just CCD. Seeded/replayable via the existing `{ seeds }` + `describeFailure` path (lines 495–537).

**`flipperSweptTunnel` may need a `tipRadius`-aware clearance** (`containment.ts` lines 178–210): today it treats the bat as a thin segment with `halfWidth` clearance (`clearance = radius + halfWidth`). With the capsule (D-07/D-08), consider passing/using `tipRadius` so the swept sector reflects the fat tip — but keep the invariant engine-agnostic (interface scalars only, never `planck`).

---

## Shared Patterns

### Engine isolation (only `planck-world.ts` imports `planck`)
**Source:** `src/physics/planck-world.ts` lines 1–12 (header) + `src/sim/loop.ts` lines 1–7 + `src/harness/containment.ts` lines 15–17.
**Apply to:** the NEW `src/input/` module and `FlipperController`, and every harness/sandbox file.
Each engine-free module opens with a header comment asserting it imports no engine and talks only through `PhysicsWorld`. Type-only imports use `import type { PhysicsWorld } from "../physics/types"`. This is the D-05/D-10 contract and is enforceable by grep (no `from "planck"` outside `planck-world.ts`).

### Zero per-frame allocation (pooled / grow-only / reused views)
**Source:** `src/physics/planck-world.ts` — grow-only event pool `nextEventSlot()` (lines 510–524), reused drain view `drainEvents()` (lines 526–540), in-place pool refresh in `step()` (lines 426–447), `syncContactPoints()` truncate-and-reuse (lines 453–474); `src/sim/loop.ts` `snapshotInto`/`copyStates` (lines 99–146); `src/sandbox/main.ts` `growTo` (lines 152–156).
**Apply to:** input latch (reused edge buffer + long-lived held `Set`), FSM (no per-step object creation), sub-stepping (scalar sub-step count, no arrays), debug-draw capsule (no new gradients/objects per frame).
Pattern: pre-allocate outside the hot loop; grow pools only when count grows (`while (pool.length < n) pool.push(...)`); truncate with `arr.length = n` and reuse slots `< n`; reset a count field rather than reallocating.

### Reference-anchored, HMR-tunable constants
**Source:** `src/physics/constants.ts` (whole file; `FLIPPER_*` block lines 95–143).
**Apply to:** all new flipper feel constants — put them in `constants.ts` with a "why/anchor" doc comment, NOT inline in the adapter. Placement/geometry that is test-rig scaffold (D-11) stays as a local const in `planck-world.ts` (like `FLIPPER_PIVOT`, lines 81–83); *feel magnitudes* go in `constants.ts`.

### Seeded determinism + replayable failure
**Source:** `src/harness/prng.ts` `mulberry32` (lines 21–33); `src/harness/soak.ts` `deriveSeeds` (268–275), `makeCaseParams` fixed draw order (281–321), `describeFailure` (527–537).
**Apply to:** the FLIP-04 gate — never `Math.random`; draw per-case seeds from a master seed; keep draw order fixed for deterministic replay; log a replayable seed on failure via `describeFailure`.

### Test conventions (Vitest)
**Source:** every `*.test.ts` — `import { describe, it, expect } from "vitest";` (e.g. `soak.test.ts` line 1, `containment.test.ts` line 1). Assertions target the **engine-agnostic interface**, and `PlanckWorld` is only *constructed*, never imported as a `planck` symbol (`loop.determinism.test.ts` lines 21–23 documents the single-import invariant).
**Apply to:**
- **FlipperController unit test** — analog `loop.determinism.test.ts` / `containment.test.ts`: drive the FSM against a **fake/spy `PhysicsWorld`** (D-05 — a hand-rolled object implementing the interface, recording `setFlipperMotor` calls), asserting the observable state sequence `resting → flipping-up → held-up → returning` and the `+1` continuous-hold during `held-up` (D-06(1)).
- **Input-module unit test** — analog same: feed synthetic `KeyboardEvent`-like objects, assert `event.repeat` ignored, per-side OR edges, blur clears + emits release.
- **FLIP-04 gate** — analog `src/harness/soak.gate.test.ts` (lines 1–75): name it `*.gate.test.ts` so it runs ONLY via `npm run soak` (`vitest.gate.config.ts` includes `src/**/*.gate.test.ts`; default `vitest.config.ts` **excludes** it, lines 16). The fast bounded green + teeth negative control go in a plain `*.test.ts` (analog `soak.test.ts`) so they run in `npm test`.
- **Feel proof (optional)** — analog `src/harness/stability.test.ts`: the "heavy, not floaty" catch/cradle/return verdict (D-09) can be pinned as a numeric settle/energy proof driven through `FixedStepLoop` + the interface, mirroring the resting-ball stillness + monotonic-energy structure (lines 148–181, 185–278). The `firstMonotonicIncrease` "proof of teeth" idiom (lines 170–181, 280–294) is the template for showing a feel/no-jitter detector actually fires.

### FixedStepLoop step-count latching
**Source:** `src/sim/loop.ts` `advance()` returns the fixed-step count (lines 54–72); `src/sandbox/main.ts` consumes it (line 77, 116). `soak.ts` / `stability.test.ts` show the `advance(FIXED_DT * 1000) === 1` single-step idiom (`stability.test.ts` lines 124–130).
**Apply to:** wiring input edges onto fixed steps in `main.ts` (D-10) and any per-step FSM stepping in tests.

---

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/input/*.ts` — window `keydown`/`keyup`/`blur`/`visibilitychange` listeners, `event.code`, `event.repeat` handling | utility / DOM adapter | event-driven | First keyboard/DOM-event code in the repo. Structure (module header, latch/drain, pooling) copies from analogs above; the **DOM specifics have no in-repo precedent** — use CONTEXT `<canonical_refs>` MDN/javascript.info `KeyboardEvent` refs. |
| `FlipperController` FSM transition logic (`resting → flipping-up → held-up → returning`) | controller / FSM | state transform | No state machine exists yet (CLAUDE.md prescribes a hand-rolled `switch`/enum FSM, not a library). Class *shape* copies `FixedStepLoop`; the transition table itself is new (D-05, Claude's discretion on enum-vs-object). |
| Adaptive angular sub-stepping loop inside `step()` (D-01) | service / transform | transform | The `step()` wrapper is a self-analog, but the **sub-step derivation `N = ceil(ω·L·dt/(0.5r))` and cross-sub-step event accumulation** is a new mechanism with no prior instance. CONTEXT D-01 + Erin Catto GDC-2013 ref are the spec. |

---

## Metadata

**Analog search scope:** `src/physics/`, `src/sim/`, `src/sandbox/`, `src/harness/`, project root (`package.json`, `vitest*.config.ts`).
**Files scanned (read in full):** `types.ts`, `planck-world.ts`, `constants.ts`, `loop.ts`, `main.ts`, `debug-draw.ts`, `soak.ts`, `containment.ts`, `prng.ts`, `soak.gate.test.ts`, `soak.test.ts`, `loop.determinism.test.ts`, `loop.tabblur.test.ts`, `planck-world.smoke.test.ts`, `containment.test.ts`, `stability.test.ts`, `vitest.config.ts`, `vitest.gate.config.ts`, `package.json` (18 files).
**Pattern extraction date:** 2026-07-15
