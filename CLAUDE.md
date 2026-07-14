<!-- GSD:project-start source:PROJECT.md -->
## Project

**Space Cadet Pinball — Browser Edition**

A browser-based recreation of Windows XP's *3D Pinball for Windows – Space Cadet*. It rebuilds the classic space-themed pinball table as an HTML5 game rendered entirely in code — no ripped or hand-painted art, with sound synthesized at runtime. Built as a portfolio/demo piece: a faithful, polished pinball game anyone can play in their browser with no install.

**Core Value:** The moment-to-moment pinball loop — plunger, flippers, ball physics, and bumpers — feels satisfying and faithful to the original. If the physics and flipper feel are wrong, nothing else matters.

### Constraints

- **Platform**: Browser (HTML5) — must run in modern browsers with no install.
- **Assets**: Procedural rendering and synthesized audio only — no ripped or redistributed original art/sound (copyright + simplicity).
- **Fidelity**: Faithful gameplay and table layout, but an original clean visual style — not a pixel-perfect copy.
- **Performance**: Stable 60fps physics/rendering — non-negotiable for feel.
- **Quality bar**: Portfolio-grade polish — shareable and impressive.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## TL;DR Recommendation
| Concern | Pick | One-line why |
|---------|------|--------------|
| **Physics** | **Planck.js 1.5** | Only mainstream JS engine with native continuous collision detection (`setBullet`) — directly kills the #1 project risk (ball tunneling through thin flippers/walls). |
| **Rendering** | **Canvas 2D** (raw `CanvasRenderingContext2D`) | A single table = a static playfield + ~5 moving objects. Canvas 2D hits 60fps easily, its gradient/path API *is* the procedural vector aesthetic, and it adds zero dependencies. |
| **Language** | **TypeScript 7.0** | Physics code is vector/state-heavy; types catch config errors that would otherwise feel like "bad physics." |
| **Bundler** | **Vite 8** | Instant HMR is a force-multiplier when tuning flipper torque / restitution by feel. |
| **Audio** | **Raw Web Audio API** | Pinball SFX are short one-shots (osc + noise + filter + ADSR). Raw API = lowest latency, zero deps, and best demonstrates the "synthesized at runtime" skill. |
| **Framework** | **None (vanilla)** | Phaser/other frameworks fight a physics-driven single-table game and would just wrap Planck anyway. |
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Planck.js** | `1.5.0` | 2D rigid-body physics (ball, flippers, walls, bumpers, collisions) | JS/TS rewrite of Box2D 2.4. **Native continuous collision detection** via `body.setBullet(true)` — the single most important feature for this project, because a small fast ball vs. thin fast-rotating flippers is the textbook "bullet-through-paper" tunneling case. Ships a canonical **Pinball** example and **BulletTest**. Deterministic under a fixed timestep. Pure JS, zero runtime deps, ESM + bundled `.d.ts` types → tree-shakes cleanly in Vite. Actively maintained (1.x stable line, latest April 2026). |
| **Canvas 2D API** | Browser-native | Procedural rendering of the playfield, ball, flippers, effects | Built into every modern browser — no dependency, no WebGL boilerplate. `createLinearGradient` / `createRadialGradient` / path fills/strokes map 1:1 onto the "geometry + gradients, clean vector style" mandate. For a scene with one static playfield and a handful of dynamic objects it comfortably holds 60fps. Glow/juice is achievable via `shadowBlur`, additive compositing (`globalCompositeOperation='lighter'`), and radial gradients. |
| **TypeScript** | `7.0.2` | Application language | This codebase is dense with 2D vectors, body/fixture configs, joint parameters, and a game-state FSM. Static types turn "why does the ball behave wrong?" bugs into compile-time errors. Planck ships first-class types, so the physics API is fully typed. (7.0 is the new native/Go compiler line — GA on npm as `latest`.) |
| **Vite** | `8.1.4` | Dev server + production bundler | Sub-second HMR is the killer feature here: tuning flipper `maxMotorTorque`, ball `restitution`, and gravity is an iterative "change a number, feel it" loop, and Vite makes that loop instant. Uses esbuild for transpile + Rollup for build; ships a tiny, dependency-free static bundle ideal for a portfolio deploy (GitHub Pages / Netlify). |
| **Web Audio API** | Browser-native | Runtime-synthesized SFX (bumper ping, flipper thwack, plunger, drain, bells, tilt) | The constraint is "no audio files." Web Audio's `OscillatorNode` + a noise buffer + `BiquadFilterNode` + a `GainNode` ADSR envelope produce punchy retro pinball one-shots with sub-frame latency and no assets. Idiomatic, zero-dependency, and it *is* the skill being demonstrated. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Tone.js** | `15.1.22` | Higher-level Web Audio (synths, ADSR, transport/scheduling) | Only if v-next adds **sequenced music** or you want prebuilt synth voices rather than hand-wiring nodes. Overkill for one-shot SFX; adds a sizeable dependency. Not needed for v1. |
| **PixiJS** | `8.19.0` | WebGL/WebGPU 2D renderer with GPU filters | Only if you later want **heavy GPU glow/bloom/particle juice** or many hundreds of simultaneous particles. Note its `Graphics` objects are meant for static/semi-static geometry (don't `clear()`+redraw every frame) — you'd bake the playfield to a `RenderTexture` and animate sprites on top. Not needed to hit v1's quality bar. |
| **poly-decomp** | `0.3.0` | Convex decomposition of concave polygons | Only if you model table walls as one big **concave** polygon. Recommended instead: build walls from Planck **chain/edge shapes** and bumpers from circles/convex polys, which sidesteps decomposition entirely. Keep as a fallback. |
| **stats.js** *(dev)* | `0.17.x` | On-screen FPS/frame-time meter | During development, to prove the "stable 60fps" bar and catch GC/perf regressions. Strip from production. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **Vite** | Dev server, HMR, build | `npm create vite@latest -- --template vanilla-ts`. |
| **vite-plugin-checker** or `tsc --noEmit` | Type-checking in CI/dev | Vite transpiles with esbuild and does **not** type-check on its own — run `tsc --noEmit` (or the plugin) so TypeScript actually gates you. |
| **ESLint + Prettier** | Lint/format | Standard portfolio hygiene; optional but expected for a shareable repo. |
| **stats.js / Chrome DevTools Performance** | Frame budgeting | Confirm physics-step + render fit inside 16.6 ms; watch for GC spikes from per-frame allocations (reuse vectors). |
## Installation
# Scaffold (vanilla TypeScript, no framework)
# Core physics
# (Rendering = Canvas 2D, Audio = Web Audio API — both browser-native, nothing to install)
# Dev dependencies
# Optional, only if scope grows:
# npm install tone@^15        # sequenced music / prebuilt synths
# npm install pixi.js@^8      # GPU glow/particle juice
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Planck.js** | **Custom physics loop** (swept circle-vs-segment + impulse solver, fixed timestep) | If you want zero physics deps, total determinism, and full control of flipper feel — and you accept implementing continuous collision (swept circle vs line segments/arcs) and a contact solver yourself. Highest control, **highest risk on the make-or-break feature**. Reasonable as a *learning* path or a later optimization; risky as the v1 foundation. |
| **Planck.js** | **box2d-wasm / Box2D.js** (WASM) | If you need exact upstream Box2D parity or maximum solver throughput. Downsides: WASM load + manual memory management, heavier integration/debugging, and `box2d-wasm` is stale (7.0.0, 2022). Planck's pure-JS API is easier to wire, inspect, and ship. |
| **Planck.js** | **Rapier2d** (`@dimforge/rapier2d` 0.19.x, Rust→WASM) | If you want a very fast, cross-platform-deterministic modern engine and are comfortable with WASM init. Excellent engine, but heavier integration than a pure-JS lib and overkill for a single table. |
| **Canvas 2D** | **PixiJS 8** (WebGL/WebGPU) | If "portfolio juice" escalates to GPU bloom, shader effects, or 500+ particles. Buys GPU filters at the cost of a scene-graph mental model and the "don't redraw Graphics every frame" caveat. |
| **Raw Web Audio** | **Tone.js 15** | If you add background music, sequencing, or want prebuilt synth/effect voices instead of hand-wiring nodes. |
| **Vanilla TS** | **Phaser 4** | If you wanted an all-in-one game framework (scene manager, loader, input, tweens) and were willing to run physics through its plugins. For *this* project it's a net negative (see below). |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Matter.js** (`0.20.0`) | **No native continuous collision detection.** Its own issue tracker documents fast objects tunneling through thin walls (the exact pinball failure mode), and workarounds are hacks: thicken walls, raycast-and-teleport, or crank sub-steps (perf cost, still not robust). Also ~40% of Box2D's perf and last published mid-2024. Using it means fighting the project's crux from day one. | **Planck.js** (native `setBullet` CCD). |
| **Phaser 4** as the core engine | A full framework built around *its* game loop and *its* physics (Arcade = AABB-only, no CCD; Matter = the engine above). You'd wrap Planck inside Phaser's loop, inheriting indirection and weight while losing direct control of the fixed-timestep step order that flipper feel depends on. | **Vanilla TS** owning its own `requestAnimationFrame` + fixed-timestep loop, calling `world.step()` directly. |
| **Kinematic-body flippers driven by `setAngularVelocity`** | Kinematic bodies ignore forces, so they don't transfer momentum through the solver correctly — the ball can be shoved through or launched unrealistically, and CCD interaction is worse. | **Dynamic** flipper body on a **revolute joint** with `enableMotor`, `motorSpeed`, and a high `maxMotorTorque` + `lowerAngle`/`upperAngle` limits — the canonical Box2D pinball-flipper setup; momentum transfers through the solver naturally. |
| **A UI framework (React/Vue/Svelte) for the game itself** | The game is one `<canvas>` + a fixed loop. A component framework adds re-render/reconciliation overhead and complexity with no payoff. | Plain DOM (or a canvas overlay) for menus/score; the game renders itself. |
| **XState / a state-machine library** for game states | Attract → Ready → Ball-in-play → Drained → Game-over is ~5 states; a library is overkill. | A hand-rolled `switch`/enum FSM (a few dozen lines). |
| **Loading audio sample files** | Violates the "synthesized at runtime, no files" constraint and adds an asset pipeline. | **Web Audio** oscillator + noise + filter + ADSR synthesis. |
## Stack Patterns by Variant
- Fixed-timestep accumulator loop (Gaffer "Fix Your Timestep"): accumulate real elapsed time, call `world.step(dt)` at a **fixed** `dt` (recommend **1/120 s**, i.e. step physics at 120 Hz even while rendering at 60 fps). A higher physics rate shrinks per-step ball travel → less tunneling and crisper flipper response. Keep Planck's `velocityIterations`/`positionIterations` at solid defaults (~8/3) and tune up if bounces feel mushy.
- Render on `requestAnimationFrame`, **interpolate** the ball's drawn position between the last two physics states for smoothness.
- Reuse vector objects; avoid per-frame allocations to prevent GC hitches that break the 60fps bar.
- Walls/lanes/ramps → Planck **chain/edge** shapes (static bodies). Ball → small **dynamic circle** with `setBullet(true)`, tuned `restitution` (~0.3–0.5) and low `friction`. Bumpers → static circles with high restitution + a collision callback for score/flash/sound.
- Add **PixiJS 8** for a GPU-composited effects layer (glow/bloom/particles) over the same physics; keep the static playfield as a baked texture. Don't start here — start on Canvas 2D and escalate only if a specific effect demands it.
- Introduce **Tone.js** for a music/transport layer; keep hand-written Web Audio for tight gameplay SFX (lower latency, full control).
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `planck@1.5.0` | `vite@8`, `typescript@7` | Ships ESM (`dist/planck.mjs`) + CJS + bundled `index.d.ts`, **zero runtime deps** → tree-shakes and types out-of-the-box in a Vite/TS project. |
| `vite@8.1.4` | `typescript@7.0.2` | Vite transpiles via esbuild and does **not** type-check — pair with `tsc --noEmit` or `vite-plugin-checker` so TS actually enforces types. |
| `typescript@7.0.x` | Editor/tooling | 7.0 is the native (Go) compiler line, GA as npm `latest`. If any tool assumes the old JS `tsc` API, pin to `typescript@5.x` — but for `--noEmit` type-checking in this project, 7.0 is fine. |
| Web Audio `AudioContext` | All modern browsers | Must be created/`resume()`d **after a user gesture** (autoplay policy). Resume the context on first keypress/click or all SFX are silent. |
| Canvas 2D | All modern browsers | No compatibility concerns; use `ctx.setTransform` + `devicePixelRatio` scaling for crisp rendering on HiDPI displays. |
## Sources
- npm registry (`npm view`) — **HIGH**: verified live latest versions — planck 1.5.0 (mod. 2026-04-07, ESM+types, 0 deps), pixi.js 8.19.0, tone 15.1.22, typescript 7.0.2 (`latest`), vite 8.1.4 (`latest`), phaser 4.2.1, matter-js 0.20.0 (mod. 2024-06), box2d-wasm 7.0.0 (2022, stale), @dimforge/rapier2d 0.19.3.
- Planck.js docs (piqnt.com/planck.js) — **HIGH**: revolute-joint motors (`enableMotor`, `motorSpeed`, `maxMotorTorque`, limits), Body CCD (`setBullet`), kinematic-vs-dynamic semantics; ships Pinball + BulletTest examples.
- Box2D official docs (box2d.org, Dynamics/Simulation) + iforce2d & Emanuele Feronato tutorials — **HIGH/MEDIUM**: canonical pinball flipper = dynamic body + motorized revolute joint with sufficient max torque; testbed pinball uses fast motorized flippers; bullets do CCD vs static + dynamic.
- matter-js issue #5 "Prevent object passing through walls (implement CCD)" + comparison writeups (daily.dev "Top 9 2D Physics Engines", abratabia) — **MEDIUM**: Matter.js lacks native CCD, tunneling is a documented pinball failure; Planck offers proper iterative solver + CCD; Matter ≈ 40% of Box2D perf.
- PixiJS 8 docs (pixijs.com — Graphics, Performance Tips, v8 launch) — **MEDIUM**: v8 adds linear-gradient fills + Canvas-like Graphics API; `Graphics` intended for static/semi-static geometry (avoid per-frame clear+redraw); WebGL/WebGPU shines at 1000+ sprites (i.e. overkill for a single table).
- MDN Web Audio (Advanced techniques) + Tone.js docs + retro-sound.js — **HIGH/MEDIUM**: oscillator/noise/filter/ADSR one-shots for retro SFX; Tone.js is a higher-level layer best for sequencing/music.
- Gaffer on Games "Fix Your Timestep" (fixed-timestep accumulator + render interpolation), shuntksh.com "Building a 2D Physics Engine: From Newton to Pinball" — **MEDIUM**: fixed timestep → determinism; custom swept-circle collision is feasible but non-trivial.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
