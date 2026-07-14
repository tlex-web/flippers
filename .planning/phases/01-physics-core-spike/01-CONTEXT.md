# Phase 1: Physics Core Spike - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

A headless-capable physics sandbox that proves a **single ball** obeys stable, heavy, tunnel-proof, frame-rate-independent 2D physics **in isolation** — before any table geometry or art exists — and ends with the physics engine **empirically chosen and locked** behind a ball/flipper/event interface kept N-ball-ready.

**In scope:** the physics module + the verification harness (soak gate + debug sandbox) + reference-anchored feel constants + the empirical engine decision. Uses a bounded test area and a single max-speed *test* flipper purely for stress — **not** a real controllable flipper.

**Out of scope (own later phases):** real keyboard flippers / cradle (Phase 2), the Space Cadet table layout + plunger + event bus wiring (Phase 3), reactive elements + game rules (Phase 4), the real procedural renderer + synthesized audio (Phase 5), juice/polish (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Engine decision path
- **D-01:** **Planck-first.** Integrate Planck.js 1.5 with `body.setBullet(true)` behind the common physics interface. Build a custom swept circle-vs-segment/arc solver **only if** Planck empirically fails the tunnel-proof or feel bar in this phase's stress run. `setBullet` does swept CCD against both static walls and the dynamic motorized test flipper — the exact make-or-break case — and Box2D's mature resting-contact + sleeping largely satisfies "resting ball still, energy trending down" for free.
- **D-02:** The "engine locked" deliverable = Planck confirmed by passing the headless gate, **or** a documented fallback decision if it fails. Integration is deliberately cheap and reversible because the ball/flipper/event interface (see carry-forward) is already the contract — a bake-off is escalated to only if Planck-first actually fails, not by default.

### Tunnel-proof verification (criterion #2)
- **D-03:** Build **both** a headless deterministic soak harness and an interactive visual sandbox. The **headless soak is the SOLE pass/fail gate**; the sandbox is a diagnosis tool only. "I flung it and it held" is explicitly rejected as proof.
- **D-04:** The soak harness: owns a **seeded PRNG (never `Math.random`)**; sweeps launch angle/speed/flipper phase past the ball's real max velocity; runs the 10-min (minimum) fixed-step soak; asserts a **swept containment invariant** — a ball that punches out and re-enters between 120 Hz steps must still trip failure (naive per-step "center inside box" is insufficient). On any escape, log seed + full ball/flipper state for deterministic replay.
- **D-05:** The harness targets the **ball/flipper/event interface, not Planck directly**, so the identical proof runs unchanged against Planck's `setBullet` or any custom solver — this is what makes the engine decision (D-01) empirical. Failing seeds replay into the sandbox in slow-mo.

### Debug view scope
- **D-06:** Minimal **throwaway Canvas 2D debug-draw**: ball circle, wall segments, velocity vector, contact points, plus a text HUD (FPS, physics-step Hz, total kinetic energy). Drawn from the **interpolated fixed-state pair** (respects the locked accumulator loop) and read from the physics interface. Paired with numeric assertions as the automated gate. **This is the same toolset as D-03** — the sandbox *is* the debug-draw, the gate *is* the numeric assertions.
- **D-07:** Do **not** engineer the debug view for carry-forward into Phase 5, and do **not** adopt Planck's engine-specific `Testbed` (it violates the engine-agnostic interface and fights the locked fixed-timestep loop). A permanent overlay may emerge for free later without being a design goal now.

### "Heavy, not floaty" feel acceptance (criterion #1)
- **D-08:** **Reference-anchored.** Derive starting physics constants from the SpaceCadetPinball decompilation (`TTableLayer.cpp`: playfield incline ~28°, gravity vector, velocity-proportional damping; `TBall.cpp`: ball motion) — **behavior/values only, never assets**. Translate the non-Box2D constants into Planck by ratio/behavior: effective in-plane gravity ≈ `sin(incline)·g_full`, velocity drag → `linearDamping`, at an honest pixels-per-meter scale (size the ball ~0.3–0.5 m so Planck's solver + CCD stay well-conditioned). Expose all as named HMR-tunable constants.
- **D-09:** Phase-1 "done" for criterion #1 = **"constants derived from the stated reference + a visibly weighty fall/settle in the sandbox."** The **final by-feel "heavy" verdict is explicitly deferred to Phase 2**, where weight is actually judged through flipper catch/return and the real table incline. This is a rider on D-08, not a standalone deferral — criterion #1 gets a concrete, regression-testable target now, not a vibe.

### Carry-forward (locked upstream — restated so downstream agents don't re-derive)
- **Fixed-timestep accumulator at ~120 Hz**, decoupled from rendering; render interpolates between the last two physics states (criterion #3; CLAUDE.md "Fix Your Timestep" pattern).
- **Ball** = small dynamic circle, `setBullet(true)`, restitution ~0.3–0.5, low friction (CLAUDE.md).
- **Test flipper** = dynamic body on a motorized revolute joint (`enableMotor`, high `maxMotorTorque`, angle limits) run at max speed for stress — the canonical Box2D flipper setup — NOT a kinematic body (CLAUDE.md "What NOT to Use").
- Walls/boundary from Planck **chain/edge** static shapes (CLAUDE.md).
- Physics **isolated behind ball/flipper/event interfaces**; data structures kept **N-ball-ready** so deferred multiball is additive, not a rewrite (criterion #5; STATE.md).
- **Reuse vector objects / avoid per-frame allocations** to prevent GC hitches that break 60 fps (CLAUDE.md).

### Claude's Discretion
- Exact PRNG algorithm; soak parameter ranges and duration beyond the 10-min minimum; debug HUD layout; module/file naming.
- Exact pixels-per-meter scale and initial constant values within the reference-anchored ballpark.
- Test runner choice (e.g. Vitest/node) for the headless gate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (internal)
- `.planning/ROADMAP.md` § "Phase 1: Physics Core Spike" — goal + the 5 success criteria that define done (criterion #5 = engine chosen empirically).
- `.planning/REQUIREMENTS.md` — PHYS-01 (stable heavy physics), PHYS-02 (no tunneling / CCD), PHYS-03 (fixed timestep decoupled from render).
- `.planning/PROJECT.md` § Constraints / Context — procedural-only, no ripped assets; names the SpaceCadetPinball decompilation as the behavior reference.

### Tech stack & physics patterns (internal — authoritative, no ADRs exist yet)
- `CLAUDE.md` § Technology Stack — Planck.js 1.5 `setBullet` rationale; fixed-timestep accumulator @120 Hz + render interpolation; dynamic motorized-revolute-joint flipper (NOT kinematic); chain/edge walls; reuse-vectors/no-per-frame-alloc; "What NOT to Use" (Matter.js lacks CCD, kinematic flippers).

### Feel constants & CCD (external — behavior/values only, NEVER copy assets)
- `k4zmu2a/SpaceCadetPinball` decomp — `SpaceCadetPinball/TTableLayer.cpp` (incline/gravity/velocity-damping constants) and `SpaceCadetPinball/TBall.cpp` (ball motion). https://github.com/k4zmu2a/SpaceCadetPinball
- Planck.js Body docs — `bullet`/`setBullet` CCD semantics (static + dynamic). https://piqnt.com/planck.js/docs/body
- Box2D — Erin Catto, "Continuous Collision" (GDC 2013) — swept-TOI/containment reasoning behind the proof harness. https://box2d.org/files/ErinCatto_ContinuousCollision_GDC2013.pdf
- Planck issue #167 — CCD can no-op until a body's first contact (known edge case to guard for). https://github.com/piqnt/planck.js/issues/167

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None yet** — greenfield. The repo contains only `.planning/` docs and `CLAUDE.md`; there is no `src/`, `package.json`, or `node_modules`. This phase writes the first application code.

### Established Patterns
- No in-code patterns exist. The authoritative patterns live in `CLAUDE.md § Technology Stack` (Planck `setBullet`, fixed-timestep accumulator, motorized-revolute flipper, vector reuse) — treat these as the conventions this phase establishes.

### Integration Points
- This phase **establishes** the integration surface for everything downstream: the `ball` / `flipper` / `event` physics interface and the fixed-timestep loop. Phases 2–6 build on these interfaces, so keep them clean, engine-agnostic, and N-ball-ready.

</code_context>

<specifics>
## Specific Ideas

- The ball should feel like the original Space Cadet: heaviness comes from a **tilted-playfield gravity projection + velocity damping**, not full vertical gravity. Anchor to `k4zmu2a/SpaceCadetPinball` (`TTableLayer.cpp`) as the concrete recipe rather than guessing values.
- The no-tunneling proof must be **credible and repeatable** (a green/red CI line with a replayable seed), not anecdotal — this is the phase's headline artifact.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Note: the "custom swept solver" is an **in-phase fallback** (D-01), not a deferred idea. Real flipper feel/cradle, table incline/geometry, and the shipping renderer are already scoped to Phases 2/3/5 respectively in the roadmap.

</deferred>

---

*Phase: 1-Physics Core Spike*
*Context gathered: 2026-07-15*
