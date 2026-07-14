# Architecture Research

**Domain:** Browser real-time physics game (procedurally-rendered 2D pinball, Space Cadet clone)
**Researched:** 2026-07-15
**Confidence:** HIGH (loop/physics/rendering); MEDIUM (table-coordinate authoring, build-order sequencing)

## Standard Architecture

A pinball game is a **soft real-time simulation** with one hard rule: the simulation must be
deterministic and frame-rate-independent, while rendering runs at whatever rate the display
allows. Every mature browser game (and the original Space Cadet itself) separates into five
concerns with a strictly one-directional data flow.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATION (Game Loop)                       │
│   requestAnimationFrame → fixed-timestep accumulator → update/render   │
│   owns: DT, accumulator, alpha, prev/current state snapshots           │
└───────────────┬───────────────────────────────────┬──────────────────┘
                │ sample()                            │ interpolate(prev,cur,alpha)
                ▼                                     ▼
┌───────────────────────────┐          ┌─────────────────────────────────┐
│   INPUT (intent)          │          │   RENDER (read-only)            │
│  keys → {leftFlipper,     │          │  static playfield (offscreen)   │
│  rightFlipper, plunger,   │          │  + lights + dynamic layer       │
│  nudgeL/R} intent struct  │          │  + particles/effects            │
└───────────┬───────────────┘          └─────────────────────────────────┘
            │ intent                                   ▲ read interpolated
            ▼                                          │ snapshot + game state
┌───────────────────────────────────────────┐         │
│        PHYSICS / SIMULATION CORE           │         │
│  fixed-step @ high rate (120–240 Hz)       │         │
│  • ball: single circle body                │         │
│  • flippers: kinematic swept segments      │         │
│  • static colliders: line segments + arcs  │         │
│  • swept (continuous) collision → no tunnel │        │
│  emits: CollisionEvent[] each step ─────────┼──┐      │
└───────────────────────┬────────────────────┘  │ events (observer/bus)
                         │ ball/flipper state      │
                         ▼                         ▼
┌───────────────────────────────────┐   ┌──────────────────────────────┐
│   GAME STATE / RULES              │   │   AUDIO (Web Audio synth)    │
│  score, current ball, balls left, │   │  subscribe: bumperHit, wall, │
│  tilt/nudge budget, plunger FSM,  │   │  drain, flipper, tilt, launch│
│  bumper/target scoring, game-over │   │  → oscillators/noise/env     │
│  consumes CollisionEvents ────────┼──▶│  (no read of physics internals)│
└───────────────────────────────────┘   └──────────────────────────────┘
```

**The golden rule:** data flows Input → Physics → Rules → (Render, Audio). Render and Audio
**never** write back into the simulation. Rules never reach into physics internals — they react
to emitted events and read a small state surface. This is exactly how the original decompilation
is organized: a physics/collision layer (`TEdgeManager`, `TEdgeSegment`, `TLine`, `TCircle`,
`TBall`) is separate from component behavior (`TBumper`, `TFlipper`, `TSink`, `TKickout`) and
from lights/sound (`TLight`, `TSound`).

### Component Responsibilities

| Component | Responsibility (what it owns) | Typical Implementation |
|-----------|-------------------------------|------------------------|
| **Game Loop / Orchestrator** | The accumulator, DT, `prev`/`current` snapshots, alpha; calls `update(DT)` N times then `render(alpha)` once | `requestAnimationFrame` driver with fixed-timestep accumulator (Gaffer "Fix Your Timestep") |
| **Input** | Translate raw keyboard/gamepad events into a frame-stable **intent** struct; debounce; no game logic | Event listeners writing a booleans/scalars struct sampled once per step |
| **Physics/Sim Core** | The authoritative world: ball kinematics, flipper kinematics, static colliders, **continuous** collision + response; emits collision events | Custom specialized solver (recommended) or Planck.js/Box2D with bullet ball |
| **Game State / Rules** | Score, current ball index, balls remaining, tilt budget, plunger state machine, mode/game-over; mutated only in `update()` | Plain state object + reducer-style handlers reacting to collision events |
| **Render** | Draw an interpolated snapshot + HUD; owns no simulation truth | Layered Canvas2D (static offscreen + dynamic + effects); WebGL only if needed |
| **Audio** | Synthesize SFX in response to events | Web Audio graph: oscillators, noise buffers, envelopes, filters |
| **Table Definition (data)** | Source-of-truth geometry: collider primitives + feature placements + render model | Static data module in table-space coordinates, consumed by both physics and render |

## Recommended Project Structure

```
src/
├── main.ts                  # bootstrap: create canvas, wire modules, start loop
├── loop/
│   ├── GameLoop.ts          # fixed-timestep accumulator, prev/current snapshots, alpha
│   └── constants.ts         # DT (e.g. 1/240 s), MAX_FRAME clamp, table dimensions
├── input/
│   ├── InputState.ts        # the intent struct (flipper L/R, plunger, nudge L/R)
│   └── KeyboardController.ts # raw events → InputState
├── physics/
│   ├── World.ts             # steps the sim, holds ball + flippers + colliders, emits events
│   ├── Ball.ts              # single circle body: pos, vel, radius
│   ├── Flipper.ts           # kinematic swept segment: pivot, angle, angularVel, limits
│   ├── colliders.ts         # LineSegment, Arc/Circle primitives
│   ├── sweep.ts             # swept circle-vs-segment / circle-vs-arc time-of-impact
│   └── events.ts            # CollisionEvent types (wall, bumper, flipper, drain, target)
├── table/
│   ├── spec.ts              # THE table: coordinates for walls/lanes/bumpers/drain/plunger
│   ├── collisionModel.ts    # derive segment+arc colliders from spec
│   └── renderModel.ts       # derive draw instructions from spec
├── rules/
│   ├── GameState.ts         # score, ball, ballsLeft, tilt, mode, plunger FSM
│   └── scoring.ts           # event → score/state transitions
├── render/
│   ├── Renderer.ts          # composes layers each frame from interpolated snapshot
│   ├── PlayfieldLayer.ts    # static: draw once to offscreen canvas
│   ├── DynamicLayer.ts      # ball + flippers + moving targets (interpolated)
│   ├── LightLayer.ts        # lamps/indicators, redraw on state change
│   ├── particles.ts         # pooled particle system for juice
│   └── camera.ts            # table-space → screen-space transform (single scale)
├── audio/
│   ├── AudioEngine.ts       # subscribes to events, owns AudioContext
│   └── synths.ts            # bumper, ding, drain, flipper, launch, tilt voices
└── events/
    └── EventBus.ts          # tiny pub/sub connecting physics/rules → audio/render
```

### Structure Rationale

- **`physics/` is engine-agnostic and self-contained:** it knows nothing about canvas, DOM, or
  score. This is what lets you prove the make-or-break risk (no tunneling) in isolation, and swap
  a custom solver for Planck.js later without touching rules/render.
- **`table/` splits `collisionModel` from `renderModel` but shares one `spec`:** the physics
  world consumes lightweight segments/arcs; the renderer consumes shapes/gradients; both derive
  from one coordinate source so geometry can never drift out of sync between what you see and what
  you hit.
- **`rules/` and `audio/` only see `events/` + a read-only state surface:** enforces the
  one-directional flow and keeps scoring/tilt logic testable without a running renderer.
- **`loop/` owns time:** nobody else calls `performance.now()` or reads frame deltas.

## Architectural Patterns

### Pattern 1: Fixed-Timestep Accumulator with Render Interpolation

**What:** Advance the simulation in fixed `DT` chunks regardless of frame rate; render interpolates
between the last two simulation states using leftover accumulator time. This is the single most
important pattern in the whole project.

**When to use:** Always, for any physics that must feel identical on a 30 Hz laptop and a 144 Hz
monitor. Pinball especially — bounce behavior is chaotic and any variable-`dt` integration makes it
nondeterministic and unstable.

**Trade-offs:** Costs almost nothing; the only pitfalls are the "spiral of death" (clamp frame time)
and needing to keep a copy of the previous state for interpolation.

**Example:**
```typescript
const DT = 1 / 240;          // physics at 240 Hz (see "run physics fast" below)
const MAX_FRAME = 0.25;      // clamp to avoid spiral of death
let accumulator = 0, last = performance.now() / 1000;

function frame(nowMs: number) {
  const now = nowMs / 1000;
  accumulator += Math.min(now - last, MAX_FRAME);
  last = now;

  input.sample();                       // one intent snapshot for this frame
  while (accumulator >= DT) {
    world.savePrevState();              // for interpolation
    world.update(DT, input.state);      // physics + rules, deterministic
    accumulator -= DT;
  }
  const alpha = accumulator / DT;       // [0,1) blend factor
  renderer.render(world.interpolated(alpha), gameState);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

**Run physics faster than 60 Hz.** A pinball can cross the table in a few frames. Even with swept
collision, a high step rate (120–240 Hz) sharpens flipper "feel," reduces input latency to a few ms,
and stabilizes stacked contacts. Rendering stays at display refresh via interpolation.

### Pattern 2: Ball-as-Circle vs. Segment/Arc Colliders with Swept (Continuous) Collision

**What:** Model the only dynamic body — the ball — as a single circle. Model the entire table as
static **line segments** and **circular arcs**. Each step, instead of "move then check overlap,"
compute the **time of first impact** of the moving circle against every nearby segment/arc, advance
to that time, reflect the velocity (with restitution + a little damping), and repeat for the
remaining time in the step. This is precisely the original game's model (`TEdgeManager` testing a
`TBall` circle against `TEdgeSegment`/`TLine`/`TCircle` edges over a spatial grid) and the approach
in Matthias Müller's "How to write a pinball simulation."

**When to use:** This is the recommended core for this project. It **structurally cannot tunnel**
(the documented make-or-break risk), and because there's exactly one dynamic body the cost is
trivial and fully controllable.

**Trade-offs:** You write the collision math yourself (swept circle-vs-segment, circle-vs-circle).
That's ~a few hundred lines, but it buys total control over feel and guarantees no tunneling — the
opposite of reaching for a general engine and fighting its solver.

**Example:**
```typescript
// Move the ball through one step, resolving earliest impacts (continuous).
function stepBall(ball: Ball, colliders: Collider[], dt: number) {
  let remaining = dt;
  for (let i = 0; i < 4 && remaining > 0; i++) {          // cap sub-iterations
    const hit = earliestImpact(ball, colliders, remaining); // TOI over segments+arcs
    if (!hit) { ball.pos.addScaled(ball.vel, remaining); break; }
    ball.pos.addScaled(ball.vel, hit.t);                  // advance to contact
    reflect(ball.vel, hit.normal, RESTITUTION);           // bounce
    world.emit(hit.event);                                 // wall/bumper/flipper
    remaining -= hit.t;
  }
}
```

**Gravity is a projected constant.** A real table tilts ~6.5°, so in the 2D plane apply a constant
downward acceleration `g·sin(tilt)` plus mild velocity damping (rolling friction) so the ball settles
rather than bouncing forever. No z-axis needed.

### Pattern 3: Flipper as Input-Driven Kinematic Body with Velocity Transfer

**What:** A flipper is **not** a free dynamic body pushed by forces. It is **kinematic**: it pivots
about a fixed point, snapping between a rest angle and an active angle at a prescribed angular
velocity while the key is held (and reversing on release). It has infinite effective mass. When the
ball's swept path contacts the flipper segment, you compute the surface velocity at the contact point
`v_surface = ω × r` (r = contact point minus pivot) and add it into the collision response — that is
what makes the flipper *kick* the ball rather than merely block it.

**When to use:** Recommended for the custom core. It gives crisp, tunable feel and is immune to the
"mushy/overshooting motor" problem. Sample input at the start of each fixed step and apply
immediately so input-to-flipper latency is one physics step (~4 ms at 240 Hz).

**Trade-offs:** You control the flip curve manually (angular speed, limits) instead of letting a
solver find it. That control *is* the point for portfolio-grade feel.

**Example (custom):**
```typescript
class Flipper {
  angle: number; angularVel = 0;
  constructor(readonly pivot: Vec2, readonly len: number,
              readonly rest: number, readonly active: number,
              readonly speed = 30 /* rad/s */) { this.angle = rest; }

  update(dt: number, held: boolean) {
    const target = held ? this.active : this.rest;
    const dir = Math.sign(target - this.angle);
    this.angularVel = dir * this.speed;
    this.angle += this.angularVel * dt;
    // clamp to [rest, active]; zero angularVel at the stop
  }
  surfaceVelocityAt(point: Vec2): Vec2 {   // ω × r, used in ball response
    const r = point.sub(this.pivot);
    return new Vec2(-this.angularVel * r.y, this.angularVel * r.x);
  }
}
```

**Alternative (engine path):** In Planck.js/Box2D, a flipper is a dynamic body on a **revolute
joint** with `enableLimit` (upper/lower angle), `enableMotor`, and a **high `maxMotorTorque`**; set
motor speed positive while held, negative on release. The ball must be a **bullet** body for CCD. This
is less code to stand up but harder to tune to a satisfying feel and heavier at runtime.

### Pattern 4: One-Way Event Bus for Scoring, Lights, and Audio

**What:** The physics core emits typed `CollisionEvent`s (`bumperHit(id)`, `wallHit`, `drain`,
`flipperHit`, `targetDown(id)`, `launch`). Rules subscribe to update score/state; audio subscribes to
synthesize; lights subscribe to flash. No polling of physics internals from other layers.

**When to use:** From the moment there is more than one reactive element. Defining this interface
early is what unblocks parallel work on rules, audio, and rendering.

**Trade-offs:** A tiny indirection; in return, scoring/audio/lights are independently testable and the
data-flow rule stays intact.

## Data Flow

### Per-Frame Flow

```
requestAnimationFrame(now)
    │
    ├─ input.sample() ──────────────► intent { LFlip, RFlip, plunger, nudge }
    │
    ├─ while accumulator ≥ DT:                     (0..N times per frame)
    │     savePrevState()
    │     ┌─────────────────────────────────────────────────────┐
    │     │ PHYSICS.update(DT, intent)                           │
    │     │   flippers.update() → ball swept-collide → emit ─────┼─► EventBus
    │     └─────────────────────────────────────────────────────┘         │
    │                                                    ┌────────────────┤
    │                              RULES.on(event) ◄─────┘                │
    │                              (score, ballsLeft, tilt, plunger FSM)  │
    │                                                    AUDIO.on(event) ◄─┘
    │                                                    LIGHTS.on(event) ◄─
    │
    └─ alpha = accumulator / DT
       RENDER(interpolate(prev, current, alpha), gameState)   // read-only
```

### State Management

```
GameState (mutated ONLY inside update)
   score, currentBall, ballsLeft, tilt{budget, tilted}, mode, plungerFSM
        ▲ writes                        │ reads (no writes)
        │ (rules handlers)              ▼
   EventBus ◄── physics emits      Renderer (HUD/score)  Audio  Lights
```

- **Interpolation applies to *visual* physics quantities only** — ball position, flipper angle. The
  HUD (score, ball count, tilt indicator) reads current `GameState` directly; it changes at discrete
  events, so no interpolation needed.
- **The plunger is a small state machine in rules** (`idle → charging(power) → released`), driven by
  the intent struct; on release it sets the ball's initial velocity in the launch chute.
- **Tilt/nudge:** a nudge applies a one-time impulse to the ball and spends from a tilt budget that
  regenerates over time; exceeding it sets `tilted`, which rules use to disable flippers/scoring
  until the ball drains.

### Key Data Flows

1. **Launch:** hold plunger key → rules accumulates power → release → rules writes ball velocity →
   physics carries ball up the chute into play; audio plays a rising launch sound.
2. **Bumper hit:** physics swept-collision detects ball vs. bumper arc → reflects with extra
   restitution + `emit(bumperHit)` → rules adds score, lights flash, audio dings, particles spawn.
3. **Drain:** ball crosses the drain segment → `emit(drain)` → rules decrements `ballsLeft`, resets
   ball to plunger lane or triggers game-over.

## Scaling Considerations

This is a single-player, single-table browser game — "scale" means **performance headroom across
devices**, not user count. Targets are framed by hardware.

| Target | Architecture posture |
|--------|----------------------|
| Low-end laptop / integrated GPU (60 Hz) | Canvas2D, static playfield prebaked to an offscreen canvas; cap particles; physics 120 Hz. Must hold 60fps — this is the floor. |
| Mainstream desktop (60 Hz) | Full effects/juice, physics 240 Hz, layered canvases; comfortable headroom. |
| High-refresh display (120/144 Hz) | Interpolation already handles it — render runs at refresh, physics stays at fixed rate; ensure `render()` is cheap and allocation-free. |

### Performance Priorities (what breaks first)

1. **Per-frame allocations / GC pauses** are the #1 cause of jank in JS games. Pool vectors and
   particles; never allocate in `update()`/`render()` hot paths. A single GC hitch shows as a dropped
   frame.
2. **Redrawing the static playfield every frame.** Prebake walls/ramps/decoration to an offscreen
   canvas once (redraw only on resize); blit it, then draw only the dynamic layer + effects. MDN cites
   this as the primary Canvas optimization; it can cut per-frame draw work dramatically.
3. **Broadphase only if needed.** With one ball, testing against all colliders is usually fine; if
   the collider count is large, add the original's trick — a coarse **spatial grid** (`TEdgeManager`
   grid) so the ball only tests nearby edges.
4. **Reach for WebGL only if Canvas2D misses budget** with full effects. Start Canvas2D (simpler,
   procedural gradients are easy); it is almost certainly enough for one ball + particles at 60fps.

## Anti-Patterns

### Anti-Pattern 1: Using a Physics Engine Without Continuous Collision (e.g. Matter.js) for a Fast Ball

**What people do:** Grab Matter.js because it's the most popular 2D JS engine and model the ball as a
normal dynamic body.
**Why it's wrong:** Matter.js has **no CCD** (its own tracking issue #5, still open). A fast ball
tunnels straight through thin flippers and walls — the exact make-or-break failure called out for
this project. Workarounds (sub-stepping, invisible "brick" bodies) are hacks that fight the engine.
**Do this instead:** Use swept/continuous collision. Either a custom circle-vs-segment solver
(recommended) or Planck.js/Box2D with the ball flagged as a **bullet**. Treat "the ball is
continuous" as a non-negotiable architectural constraint.

### Anti-Pattern 2: Variable-`dt` Physics (Multiplying Velocity by Frame Time)

**What people do:** `pos += vel * frameDelta` straight off `requestAnimationFrame`.
**Why it's wrong:** Bounce behavior becomes frame-rate-dependent and nondeterministic; at low FPS the
ball tunnels and collisions destabilize. The feel differs on every machine.
**Do this instead:** Fixed-timestep accumulator with render interpolation (Pattern 1).

### Anti-Pattern 3: Force/Impulse-Driven Flippers

**What people do:** Apply a torque/impulse to a dynamic flipper and hope it feels right.
**Why it's wrong:** Motors ramp up (mushy start), overshoot limits, and couple flipper strength to
ball mass — hard to tune, inconsistent kicks.
**Do this instead:** Kinematic flipper with prescribed angular velocity + explicit angle limits, and
transfer contact-point surface velocity (`ω × r`) into the ball on collision (Pattern 3).

### Anti-Pattern 4: One "God Object" Mixing Physics, Rules, and Rendering

**What people do:** A single `Ball` class that also draws itself, plays sounds, and updates the score.
**Why it's wrong:** Breaks the one-directional flow; you can't test physics headless, can't swap the
renderer, and interpolation becomes impossible because draw is welded to update.
**Do this instead:** Keep the five layers separate; connect them only via the intent struct, a
read-only interpolated snapshot, and the event bus.

### Anti-Pattern 5: Inferring Collision Geometry from the Art (or vice-versa)

**What people do:** Draw the table, then try to derive colliders from rendered pixels — or author one
blob used for both.
**Why it's wrong:** Visual polish and physics accuracy have different needs; coupling them makes both
brittle and geometry drifts out of sync.
**Do this instead:** One coordinate `spec` → separate `collisionModel` (segments/arcs) and
`renderModel` (shapes/gradients). Recreate Space Cadet by **transcribing coordinates** from the
open-source decompilation's geometry/behavior — reading positions, not copying art or audio assets.

## Integration Points

### External (Browser APIs)

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `requestAnimationFrame` | Drives the game loop; provides frame timestamp | Pauses in background tabs — clamp frame time (`MAX_FRAME`) on resume to avoid a spiral of death. |
| Canvas 2D (`OffscreenCanvas` for static layer) | Layered rendering; prebake static playfield once | Default choice; procedural gradients are trivial. `OffscreenCanvas` support is good in modern browsers. |
| WebGL / WebGL2 | Optional escalation if Canvas2D misses 60fps with heavy effects | Only if measured need; adds complexity. |
| Web Audio API | `AudioContext` graph; oscillators + noise + envelopes per SFX | Must be created/resumed after a user gesture (autoplay policy) — resume on first keypress. |
| Keyboard events (`Gamepad API` optional) | Raw events → intent struct | Prevent default on game keys; handle key-repeat by tracking held state, not repeat events. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Input ↔ Physics | Intent struct sampled once per step | Physics reads intent, never raw DOM events |
| Physics ↔ Rules | Emitted `CollisionEvent`s + read-only state surface | Rules never mutate physics bodies directly (except setting ball velocity on launch/reset via a narrow API) |
| Physics/Rules ↔ Render | Read-only interpolated snapshot + `GameState` | Render is a pure function of state; no writes back |
| Events ↔ Audio/Lights | Pub/sub bus | Additive, order-independent subscribers |
| `table/spec` ↔ Physics & Render | Two derived models from one source | Guarantees see/hit parity |

## Suggested Build Order (feeds phase structure)

Order is dictated by risk and dependency: **prove the make-or-break physics first**, then feel, then
the real table, then reactivity/rules, then polish. Each step produces something playable/observable.

```
1. LOOP + PHYSICS CORE (crux) ──► retires the tunneling risk
        │  fixed-timestep accumulator + interpolation
        │  one ball (circle) + a few static segment/arc walls
        │  swept collision, gravity, damping
        │  GOAL: drop a ball into a box, watch it bounce/settle at 60fps,
        │        fling it at a thin wall — it must NOT pass through
        ▼
2. FLIPPERS (core feel) ──► the project's core value
        │  one kinematic flipper, input-driven, velocity transfer
        │  then second flipper + input mapping (intent struct)
        │  GOAL: a key flips the ball convincingly and consistently
        ▼
3. PLUNGER + LAUNCH (entry) 
        │  plunger FSM (charge/release variable power) in rules
        │  launch chute geometry; ball enters the play area
        ▼
4. EVENT BUS + TABLE DATA (the real game shape)   ◄── define EventBus here;
        │  table/spec coordinates for full Space Cadet layout            it unblocks
        │  collisionModel (all walls/lanes/drain/bumper arcs)            parallel work
        │  ball navigates the actual layout                              below
        ▼
5. REACTIVE ELEMENTS + RULES ──► scoring loop
        │  bumpers/targets: bounce + emit events + award points
        │  GameState: score, 3-ball game loop, drain → next ball / game over
        │  tilt / nudge mechanic
        ▼
6. RENDERING MODEL (procedural)         ── can start in parallel after step 1
        │  layered canvas: static playfield (offscreen) + dynamic + lights
        │  camera transform, HUD/score display, renderModel from spec
        ▼
7. AUDIO SYNTH (Web Audio)              ── can start in parallel after step 4 (events exist)
        │  subscribe to events: bumper, wall, drain, flipper, launch, tilt
        ▼
8. JUICE / POLISH ──► portfolio bar
           particles, flashes, screen shake, light choreography, audio layering
```

**Hard dependencies (what must exist before what):**
- Everything depends on **step 1** (loop + physics core). Nothing meaningful can be built or felt
  without it, and it carries the make-or-break risk — build it first, alone.
- **Interpolated-state read API** must exist before rendering can be smooth (comes free with step 1).
- **EventBus + `table/spec`** (step 4) must exist before rules (step 5) and audio (step 7); defining
  these interfaces early is the single biggest unblocker for parallel work.
- **Rendering (6)** can proceed in parallel with 3–5 once physics exposes an interpolated snapshot;
  it only *reads* state, so it never blocks simulation work.
- **Audio (7)** depends only on the event bus, not on rendering — fully parallelizable.
- **Table data (4)** must precede reactive elements (5): you can't award points for a bumper that
  isn't placed yet.

**v1 = core loop only** maps cleanly to steps 1–5 (playable: launch, flip, hit bumpers, score,
3-ball game, tilt) with a functional-but-plain render (6) and basic audio (7). Step 8 (juice) is the
polish pass that meets the portfolio bar.

## Sources

- Glenn Fiedler, "Fix Your Timestep!" — fixed-timestep accumulator + interpolation, spiral-of-death. https://gafferongames.com/post/fix_your_timestep/ (HIGH — authoritative, the canonical reference)
- Matthias Müller, "Ten Minute Physics" ep. 04 "How to write a pinball simulation" + ep. 03 2D ball collision — custom swept collision, flipper handling. https://matthias-research.github.io/pages/tenMinutePhysics/ (HIGH — authoritative practitioner reference)
- Matter.js issue #5 "Prevent object passing through walls / tunneling (implement CCD)" — confirms Matter.js has no CCD; sub-stepping/speculative-contacts workarounds. https://github.com/liabru/matter-js/issues/5 (HIGH — official project tracker)
- Planck.js (Box2D port) — revolute joint motor + limits, bullet/CCD; flipper setup. https://piqnt.com/planck.js/ and Box2D revolute joint docs https://box2d.org/documentation/group__revolute__joint.html (HIGH — official docs)
- k4zmu2a/SpaceCadetPinball decompilation — component architecture (`TEdgeManager`, `TEdgeSegment`, `TLine`, `TCircle`, `TBall`, `TFlipper`, `TBumper`, `TSink`, `TKickout`, `TLight`, `TSound`), spatial-grid broadphase (`TestGridBox`); geometry/behavior reference only. https://github.com/k4zmu2a/SpaceCadetPinball (HIGH — source available; MEDIUM for exact coordinate transcription effort)
- MDN "Optimizing canvas" — offscreen static layer, layered redraw, avoid full redraws. https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas (HIGH — official)
- daily.dev "Top 9 Open Source 2D Physics Engines Compared"; olegkikin JS physics benchmark — Matter.js vs Planck.js positioning/perf. https://daily.dev/blog/top-9-open-source-2d-physics-engines-compared/ , http://olegkikin.com/js-physics-engines-benchmark/ (MEDIUM — community, cross-checked)

---
*Architecture research for: browser procedural 2D pinball (Space Cadet clone)*
*Researched: 2026-07-15*
</content>
</invoke>
