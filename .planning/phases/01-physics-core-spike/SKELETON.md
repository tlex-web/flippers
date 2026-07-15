# Walking Skeleton — Space Cadet Pinball (Browser Edition)

**Phase:** 1 (Physics Core Spike)
**Generated:** 2026-07-15

## Capability Proven End-to-End

A single dynamic ball, created and driven only through an engine-agnostic ball/flipper/event interface, falls under tilted-playfield gravity inside a bounded box — stepped by a fixed-timestep accumulator loop (~120Hz, decoupled from render) — and is observable on BOTH output paths: (a) a **headless deterministic soak** that is the SOLE tunnel-proof pass/fail gate, and (b) a **throwaway Canvas 2D debug sandbox** that renders the live interpolated ball for diagnosis only.

There is NO database, NO routing, NO auth, NO backend, and NO deployment target in this project. The "full stack" analog for this headless browser physics spike is: **physics interface → fixed-timestep loop → {headless soak gate + throwaway debug sandbox}**, run locally via documented commands. The skeleton exercises every layer of that stack with one real ball.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Physics engine | **Planck.js 1.5.0**, first (D-01) | Only mainstream JS engine with native continuous collision detection (`body.setBullet(true)`) — kills the #1 risk (ball tunneling through thin/fast geometry). Accessed ONLY through the interface. |
| Engine fallback trigger | Custom swept circle-vs-segment/arc solver, ONLY if Planck empirically fails | Escalate to a hand-rolled swept solver ONLY if the interface-level soak gate fails the tunnel-proof or feel bar (D-01/D-02). Not a default bake-off. Cheap to swap because the interface is the contract. |
| Engine boundary | Planck imported ONLY in `src/physics/planck-world.ts` | Everything else (loop, sandbox, harness) talks to `PhysicsWorld` — the identical soak proof runs against Planck or any future solver (D-05). |
| Rendering (debug) | Canvas 2D, throwaway (D-06/D-07) | Minimal debug-draw for diagnosis only. NOT the Phase-5 renderer; do NOT adopt Planck's `Testbed`. The real procedural renderer is Phase 5. |
| Language / build | TypeScript 7.0.2 (strict) + Vite 8.1.4; `tsc --noEmit` gate | Vector/state-heavy physics — types catch config errors; Vite HMR makes feel-tuning instant. Vite does not type-check, so `tsc --noEmit` gates separately. |
| Test runner | **Vitest** (Claude's discretion per CONTEXT) | Headless deterministic gate + unit tests. `npm test` = fast tests; `*.gate.test.ts` (the >=10-min soak) excluded from the default run and invoked via `npm run soak`. |
| Determinism source | Fixed dt (1/120s) + seeded PRNG (`mulberry32`), never `Math.random` | Deterministic loop + seeded sweep => any escape replays identically from its logged seed (D-04). |

## Fixed-Timestep Loop Contract (carry-forward — do not renegotiate)

- Accumulate real elapsed time; step physics at a **fixed `FIXED_DT = 1/120s`** (120Hz) regardless of render rate (Gaffer "Fix Your Timestep").
- **Clamp** each real frame delta to `MAX_FRAME_MS = 250` before accumulation (spiral-of-death / tab-blur guard).
- Keep `previous` + `current` physics snapshots and an `alpha`; **render interpolates** between them (smooth on 60/120/144Hz displays).
- Physics outcome is a pure function of accumulated time + `FIXED_DT` — render cadence changes nothing (proven in plan 01-04).
- **Reuse vector/snapshot objects**; no per-frame allocation (GC hitches break 60fps).

## Ball / Flipper / Event Interface Shape (N-ball-ready — the project contract)

Defined in `src/physics/types.ts`. Everything downstream (Phases 2-6) builds on this; keep it clean and engine-agnostic.

- `PhysicsWorld`: `step(dt)`, `addBall(spec) -> BallId`, `getBalls(): readonly BallState[]`, `getFlippers(): readonly FlipperState[]`, `getBoundarySegments(): readonly Segment[]`, `getContactPoints(): readonly Vec2[]`, `drainEvents(): CollisionEvent[]`.
- `BallState`: `{ id, x, y, vx, vy, radius, angle }` (SI units: meters, m/s).
- `FlipperState`: `{ id, pivotX, pivotY, angle, length, halfWidth }`.
- `CollisionEvent`: `{ type, aId, bId, point, normalImpulse }` — typed, one-way (drained, never pushed back). The full typed collision-event BUS is wired in Phase 3; the shape is reserved here.
- All collections are **id-keyed arrays** (never a single hard-coded ball) so multiball (v2, `MBALL-01`) is additive, not a rewrite.
- Snapshots read from **pre-allocated pooled** arrays/objects that `step()` mutates.

## Physical Scale & Feel Constants (reference-anchored, D-08 — behavior/values only, never assets)

Named, exported, HMR-tunable in `src/physics/constants.ts`, anchored to `k4zmu2a/SpaceCadetPinball` (`TTableLayer.cpp` incline/gravity/velocity-damping; `TBall.cpp`):

- `PIXELS_PER_METER = 400` — honest scale; ball radius `BALL_RADIUS_M = 0.2` (~0.3–0.5m diameter) keeps the solver + CCD well-conditioned.
- `INCLINE_DEG = 28`; `IN_PLANE_GRAVITY = sin(28deg) * 9.81 ≈ 4.6 m/s²` — tilted-playfield gravity projection (weight comes from this + damping, NOT full vertical g).
- `BALL_LINEAR_DAMPING = 0.4` — velocity-proportional drag (weighty settle). `BALL_RESTITUTION = 0.35`, `BALL_FRICTION = 0.05`.
- `FIXED_DT = 1/120`, `MAX_FRAME_MS = 250`. Flipper: `FLIPPER_MOTOR_SPEED`, `FLIPPER_MAX_MOTOR_TORQUE`, `FLIPPER_LOWER_ANGLE`/`FLIPPER_UPPER_ANGLE` (dynamic body on a motorized revolute joint — NOT kinematic).

Values are starting points, tunable by feel; final "heavy" verdict is a Phase-2 concern (D-09).

## Directory Layout

```
flippers/
  index.html                 # sandbox entry (dev only)
  package.json               # scripts: dev, build, typecheck, lint, test, soak
  tsconfig.json / vite.config.ts / vitest.config.ts
  eslint.config.js / .prettierrc.json
  src/
    physics/
      types.ts               # ball/flipper/event interface (the contract) — N-ball-ready
      constants.ts           # reference-anchored, named, HMR-tunable feel constants
      planck-world.ts        # Planck adapter (ONLY file that imports planck)
    sim/
      loop.ts                # fixed-timestep accumulator + interpolation snapshots + dt clamp
    sandbox/
      main.ts                # rAF -> loop.advance -> interpolated debug-draw
      debug-draw.ts          # throwaway Canvas 2D renderer + HUD (diagnosis only)
    harness/
      prng.ts                # mulberry32 seeded PRNG (never Math.random)
      containment.ts         # swept containment invariant (segment-vs-wall crossing)
      soak.ts                # sweep-matrix soak engine (the gate logic)
      soak.gate.test.ts      # the >=10-min tunnel-proof gate (npm run soak)
      soak.test.ts           # bounded-green + CCD-off negative control
      stability.test.ts      # resting-ball stillness + energy-monotonic proof
```

## Local Full-Stack Run Commands ("deployment" analog)

- `npm run dev` — Vite dev server; the throwaway Canvas sandbox renders the live interpolated ball + HUD (diagnosis).
- `npm test` — fast Vitest suite (smoke, determinism, tab-blur, containment, prng, stability, soak negative control).
- `npm run soak` — **the SOLE pass/fail gate**: >=10-minute fixed-step swept-containment soak past max velocity; exits 0 = tunnel-proof, non-zero = escape (logs a replayable seed).
- `npm run typecheck` (`tsc --noEmit`) and `npm run lint` (`eslint .`) gate type/style.

## Stack Touched in Phase 1

- [x] Project scaffold (Vite + TypeScript, ESLint/Prettier, Vitest) — plan 01-01
- [x] "Routing" analog: N/A (single canvas, no routes) — deliberately none
- [x] "Data" analog: one real dynamic ball body simulated through the interface (not a stub) — plan 01-02
- [x] UI: interactive debug sandbox rendering the live interpolated ball wired to the loop — plan 01-03
- [x] "Deployment" analog: documented `npm run dev` + `npm run soak` full-stack local commands — plans 01-01/01-03/01-06

## Out of Scope (Deferred to Later Slices)

- Real keyboard flippers, cradle, sub-frame input, rotational CCD — Phase 2 (`FLIP-*`).
- The real Space Cadet table layout, hold-to-charge plunger, typed collision-event BUS wiring — Phase 3 (`LNCH-*`, `TBL-01`).
- Bumpers/slingshots/lanes scoring, 3-ball loop, nudge/tilt — Phase 4 (`ELEM-*`, `GAME-*`).
- The real procedural Canvas renderer + synthesized audio (the throwaway sandbox is replaced) — Phase 5 (`RND-*`, `AUD-01`).
- Screen shake, particles, lighting, skill shot, ball-save, persisted high score — Phase 6 (`PLSH-*`).
- Multiball / ball-ball CCD — v2 (`MBALL-01`); the interface stays N-ball-ready so it is additive.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions (fixed-timestep loop, the interface, the engine boundary):

- Phase 2 — Flippers & Feel: real keyboard flippers with rotational CCD, momentum transfer (`v = ω × r`), and a cradle state machine, built on `getFlippers()` and the loop.
- Phase 3 — Table, Plunger & Event Bus: the real layout from a single `table/spec` source, a hold-to-charge plunger, and the typed `CollisionEvent` bus wired for downstream consumers.
- Phase 4 — Reactive Elements & Game Rules: bumpers/slingshots/lanes score off the event bus; a 3-ball loop; nudge/tilt.
- Phase 5 — Rendering & Audio: the real procedural Canvas renderer (replaces the throwaway sandbox) + runtime-synthesized SFX, over state that already exists.
- Phase 6 — Juice & Polish: screen shake, particles, lighting, skill shot, ball-save, `localStorage` high score.
