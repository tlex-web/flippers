---
phase: 01-physics-core-spike
plan: 03
subsystem: rendering
tags: [canvas2d, requestanimationframe, interpolation, hud, debug-draw, devicepixelratio]

# Dependency graph
requires:
  - phase: 01-02
    provides: "PhysicsWorld interface (getBalls/getFlippers/getBoundarySegments/getContactPoints), PlanckWorld adapter (bullet ball, tilted gravity, chain/edge walls, test flipper), FixedStepLoop (previous/current/alpha interpolation)"
provides:
  - "Throwaway Canvas 2D debug sandbox: live interpolated ball + walls + test flipper + velocity vector + contact points + text HUD (FPS / physics Hz / kinetic energy)"
  - "Composition-root wiring (src/sandbox/main.ts): rAF loop → loop.advance → interpolated draw, reading state only through PhysicsWorld"
  - "Visible proof of fixed-timestep decoupling (PHYS-03) and a first read on weighty motion (PHYS-01) — diagnosis only, not a pass/fail gate"
affects: [01-06, 01-07, Phase-5-rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Interpolated render: draw ball at lerp(loop.previous, loop.current, loop.alpha) — smooth on high-refresh displays"
    - "Zero steady-state per-frame allocation: pre-allocated interpolation buffers, cached ball gradient (rebuilt only on radius change), cached HUD strings (reformatted only on value change)"
    - "meters→pixels via PIXELS_PER_METER with a devicePixelRatio-scaled backing store; on-screen bitmap CSS-fit to the viewport preserving aspect ratio"
    - "Engine-agnostic consumer: sandbox reads world state only through PhysicsWorld; the sole engine-specific line is new PlanckWorld() (composition root)"

key-files:
  created:
    - "src/sandbox/debug-draw.ts"
  modified:
    - "src/sandbox/main.ts"
    - "index.html"

key-decisions:
  - "Debug-draw is diagnosis-only (D-03/D-06) — it asserts nothing; the tunnel-proof pass/fail gate remains the headless soak (01-06)"
  - "Kept the renderer minimal and NOT engineered for Phase-5 carry-forward, and did NOT adopt Planck's Testbed (D-07)"
  - "HUD kinetic energy uses a documented diagnostic density (BALL_DENSITY=1, mirroring the adapter solver density) as a settle/energy TREND read, not a physics-authoritative quantity"

patterns-established:
  - "Interpolated Canvas render loop from a fixed-timestep previous/current/alpha snapshot pair"
  - "Allocation-free rAF render path (pooled buffers + cached gradient/strings) to protect the 60fps bar (threat T-03-01)"

requirements-completed: [PHYS-01]

# Metrics
duration: 15min
completed: 2026-07-15
---

# Phase 1 Plan 3: Throwaway Canvas 2D Debug Sandbox Summary

**Live, smoothly-interpolated ball falling and settling in a bounded box on Canvas 2D, with velocity vector, contact markers, a test flipper, and an FPS / physics-Hz / kinetic-energy HUD — all read through the engine-agnostic PhysicsWorld interface (no Planck import in the sandbox).**

## Performance

- **Duration:** ~15 min (excludes the human render-verify round-trip)
- **Started:** 2026-07-15 (Wave 3)
- **Completed:** 2026-07-15
- **Tasks:** 2 (1 code task committed; 1 human-verify render gate, operator-approved)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `npm run dev` renders the full Walking Skeleton end-to-end: `PhysicsWorld` interface → Planck adapter (one bullet ball, tilted in-plane gravity, live test flipper) → 120 Hz fixed-step loop → interpolated Canvas debug-draw → live HUD.
- The drawn ball is interpolated between the loop's previous and current fixed states via `loop.alpha`, so motion is smooth and independent of the render rate (visible PHYS-03 decoupling).
- The HUD shows FPS, physics-step Hz (tracks ~120 independent of FPS), and total kinetic energy that rises during the fall and trends toward ~0 as the ball settles.
- The render path performs no steady-state per-frame heap allocation: pre-allocated interpolation buffers, a cached ball gradient (rebuilt only on radius change), and cached HUD strings (reformatted only on value change) — mitigating GC-hitch threat T-03-01.
- The sandbox is a pure consumer of the engine-agnostic contract: it never imports `planck`; the only engine-specific line is `new PlanckWorld()` (the composition root), preserving D-05/D-07.

## Task Commits

Each code task was committed atomically:

1. **Task 1: Canvas 2D debug renderer wired to the interpolated loop** — `1368e7d` (feat)
2. **Task 2: Human-verify render checkpoint** — no code commit; operator ran `npm run dev` at http://localhost:5173/ and **approved**: the ball renders, falls under tilt, settles inside the box, motion is smooth, and the HUD shows Physics ~120 Hz.

**Plan metadata:** docs commit (this SUMMARY + STATE + ROADMAP).

## Files Created/Modified

- `src/sandbox/debug-draw.ts` (created) — Throwaway Canvas 2D `DebugRenderer`: sizes a dpr-scaled backing store from the world bounds at `PIXELS_PER_METER`, fits the bitmap to the viewport, and draws boundary walls, the test flipper, the interpolated ball (cached radial gradient), the velocity vector (lookahead arrow), contact markers, and a text HUD. Calls `canvas.getContext('2d')`; reads only `PhysicsWorld` types.
- `src/sandbox/main.ts` (modified) — Replaced the boot stub with the real sandbox entry: constructs `PlanckWorld`, adds one ball, drives `FixedStepLoop`, and runs a `requestAnimationFrame` loop that calls `loop.advance(realDeltaMs)`, interpolates ball positions with `loop.alpha` into pre-allocated buffers, computes FPS (EMA), windowed physics Hz, and total kinetic energy, and calls `renderer.draw(...)`.
- `index.html` (modified) — Added `<canvas id="stage">` and minimal viewport-centering styling on a dark background.

## Decisions Made

- Kept the debug view minimal and throwaway (D-07): no scene graph, no asset pipeline, no Planck `Testbed`. It is diagnosis-only (D-03/D-06) and decides nothing — the pass/fail gate is the headless soak (01-06).
- Rendered the max-speed test flipper in addition to the plan's enumerated ball/walls/velocity/contacts/HUD, because `getFlippers()` is a first-class interface accessor and drawing it makes the live world honest (the bat is a real moving body). Trivial and removable; not scope creep.
- HUD kinetic energy computed with a documented diagnostic density (`BALL_DENSITY = 1`, mirroring the adapter's solver density) — a settle/energy trend readout, not a physics-authoritative value.

## Deviations from Plan

None - plan executed exactly as written. (The test-flipper render is a minor faithful addition of existing interface state, noted under Decisions, not a deviation requiring an auto-fix rule.)

## Issues Encountered

None. All automated gates passed on the first run: `npx tsc --noEmit` (clean), `npx eslint .` (clean), `npx vitest run` (19/19, all prior tests still green), `npm run build` (succeeds), and the Vite dev server boots and serves the transpiled entry (HTTP 200).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Walking Skeleton is visibly complete: a ball, driven by the fixed-step loop through the interface, renders and moves in the browser.
- Wave 3 render slice done. The remaining Phase-1 pass/fail work is the headless swept-containment soak (01-06, the SOLE tunnel-proof gate) and resting-ball stability + energy proof + locked engine decision (01-07). Failing soak seeds can be replayed into this sandbox in slow-mo for diagnosis (D-05).
- No blockers introduced. The sandbox stays engine-agnostic, so it survives any future engine swap unchanged.

## Self-Check: PASSED

- Files verified present: `src/sandbox/debug-draw.ts`, `src/sandbox/main.ts`, `index.html`, `.planning/phases/01-physics-core-spike/01-03-SUMMARY.md`
- Commit verified in history: `1368e7d`

---
*Phase: 01-physics-core-spike*
*Completed: 2026-07-15*
