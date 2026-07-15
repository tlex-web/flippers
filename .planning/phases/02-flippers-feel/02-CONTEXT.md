# Phase 2: Flippers & Feel - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Two keyboard-controlled flippers that respond instantly (sub-frame), transfer real
rotational momentum (a tip hit launches the ball noticeably faster than a base hit,
`v = ω × r`), hold a jitter-free cradle via an **explicit** resting → flipping-up →
held-up → returning state machine, and can **never** be swept through the ball. This
is the project's stated **Core Value**, proven and tuned.

**In scope:** productizing the Phase-1 dynamic + motorized-revolute *test* flipper into
**two** real, mirrored, keyboard-driven flippers; the flipper state machine; feel-tuning
the flipper constants (currently stress-tuned, not feel-tuned); rotational continuous
collision + its headless proof gate; the first keyboard-input handling in the codebase.
Feel is tuned **in isolation on a throwaway two-flipper test rig** (same discipline Phase 1
used with its bounded test box).

**Out of scope (own later phases):** the real Space Cadet table layout / flipper placement
+ plunger + event-bus wiring (Phase 3); reactive elements, scoring, nudge/tilt, 3-ball loop
(Phase 4); the shipping procedural renderer + synthesized flipper/collision audio (Phase 5);
juice/polish (Phase 6). Keybind/settings UI is explicitly out of scope for the whole project
(fixed defaults in code).

</domain>

<decisions>
## Implementation Decisions

### Rotational anti-tunnel — the never-pass-through guarantee (FLIP-04)
- **D-01:** **Adaptive angular sub-stepping is the primary, hard guarantee.** Inside
  `PlanckWorld.step()`, when a flipper's live angular speed is high, split the `FIXED_DT`
  step into `N` Planck sub-steps so per-sub-step tip travel stays below ~½ `BALL_RADIUS_M`.
  Derive `N = ceil(ω · FLIPPER_LENGTH_M · FIXED_DT / (0.5 · r))` from the live joint speed
  (`joint.getJointSpeed()` / `body.getAngularVelocity()`) — **not** wall-clock, so it stays
  deterministic. Rationale: Planck/Box2D TOI sweeps *translation* (the ball's `setBullet`
  already handles that) but "can miss rotational collisions" for a large/fast rotation —
  exactly a whipping thin bat (Erin Catto, Continuous Collision, GDC 2013). Sub-stepping
  shrinks the bat's per-sub-step arc below what the discrete narrow phase can miss. At the
  current ω≈40 rad/s, `N≈2` — trivial inside the 60fps budget. Lives entirely behind the
  `PhysicsWorld` interface, so the interface and the soak harness are untouched.
- **D-02:** **A small angular-velocity / tip-speed cap is a *secondary* bound only** — sized
  to keep `N` bounded (≤ ~4), **never** the sole mechanism. It must NOT be used to guarantee
  non-penetration on its own, because a cap low enough to matter would sand down flip
  snappiness — the Core Value this phase exists to nail. Capsule thickness (see D-06) and a
  manual swept-TOI resolver are held as a hardener / last-resort fallback respectively; the
  manual TOI path is CLAUDE.md's flagged *highest-risk* custom-physics route and is NOT taken
  unless D-01+cap+geometry ever fail the gate at a required feel speed.
- **D-03:** **FLIP-04 proof gate = extend `src/harness/soak.ts` into a flipper-primary swept
  non-penetration gate**, reusing the existing `flipperSweptTunnel` invariant in
  `src/harness/containment.ts` (it already sub-samples the bat's intra-step sector between the
  pre/post angles read off `getFlippers()`, so it catches a pass-through regardless of how many
  Planck sub-steps ran underneath). Drive the flipper at the **feel-tuned peak ω** across a
  **dense seeded phase-offset sweep** (+ aim jitter) so some seeded case has the ball arriving
  mid-sweep at peak angular speed; assert green with sub-stepping ON. Keep a **negative control
  with teeth**: the same peak ω with sub-stepping forced OFF must go **RED** — proving the
  mechanism, not luck, holds it. Seeded / replayable via the existing `{ seeds }` +
  `describeFailure` path. Carries forward Phase-1 D-03/D-04: "I flung it and it held" is rejected.

### Flipper actuation & cradle (FLIP-01 sub-frame snap, FLIP-03 jitter-free cradle)
- **D-04:** **Motor-speed bang-bang, hold-into-limit.** On press, drive the motor toward the
  upper angle limit (`motorSpeed = +UP_SPEED`); high `maxMotorTorque` + high speed saturates
  the bat to the limit within 1–2 of the 120 Hz sub-steps → sub-frame snap falls out for free.
  On release, drive back (`motorSpeed = −RETURN_SPEED`) to the lower limit. The **cradle is the
  hard revolute *limit constraint itself*** — a solver-pinned hard stop, not a compliant spring
  — so the ball sits dead-steady with zero extra machinery. Chosen over PD/torque control
  (spring hold sags/jitters, leaks control policy into the adapter) and the sweep-then-hold
  hybrid (redundant — the limit already holds; adopt later only if the full-speed hold reads
  twitchy in playtest).
- **D-05:** **The explicit state machine lives in a NEW engine-agnostic `FlipperController`
  ABOVE the `PhysicsWorld` interface.** Keep the existing thin `setFlipperMotor(id, direction)`
  hook exactly as-is; the adapter simply re-maps the sign to feel speeds (`+1 → FLIPPER_UP_SPEED`,
  `−1 → FLIPPER_RETURN_SPEED`, `0 → 0`), replacing the single stress `FLIPPER_MOTOR_SPEED`. This
  keeps the FSM pure TypeScript — unit-testable against a fake/spy `PhysicsWorld` with zero
  `planck` imports (D-05 engine-agnosticism), reusable unchanged by a future custom solver, and
  keeps criterion #3's "explicit state machine" observable in application code, not buried in the
  adapter. Speed *magnitudes* stay in the adapter's tuned constants (engine-specific tuning, same
  class as restitution/torque).
- **D-06 (cradle-jitter mitigations, concrete):** (1) During `held-up`, the FSM keeps asserting
  `direction = +1` so the motor drives continuously into the upper limit — do **not** release to
  `0`, or gravity + ball weight sags the bat off the limit. (2) Re-tune `FLIPPER_MAX_MOTOR_TORQUE`
  so it exceeds the ball's gravity torque at the tip (`m · g_inplane · FLIPPER_LENGTH_M`) — the
  motor never yields at the limit. (3) Kill ball micro-bounce on catch on the *ball/contact* side:
  flipper fixture `restitution = 0` (Box2D takes the max of the pair) plus the existing
  `BALL_LINEAR_DAMPING = 0.4`. (4) Do **NOT** add angular damping to the bat to quiet jitter — it
  blunts the snap and reintroduces the "floaty" feel the D-08/D-09 anchor forbids.

### Flipper contact geometry (FLIP-02 tip-vs-base, FLIP-03 clean catch)
- **D-07:** **Multi-fixture "capsule" bat** — a `Box` core plus a `Circle` at the tip (Planck 1.5
  = Box2D 2.4 line has **no native capsule**, and polygon `radius` is only a tiny fixed CCD skin,
  not settable rounding — rounded polygons are a Box2D *v3* feature; a fat rounded bat must be a
  composite of fixtures). The rounded tip removes sharp-corner snag → clean, consistent catch and
  a smooth roll to the tip, making the `v = ω × r` tip-vs-base difference read cleanly; the tip
  circle sits on the fastest, most tunnel-prone point → a fat convex CCD target that pairs well
  with D-01, and its mass makes the launch punchy. The ball is *huge* (0.2 m radius) vs today's
  0.04 m half-width — it rides a sliver; thickening gives it a real face.
  **Concrete build (pivot stays at local x=0, bat extends +x, tip at x≈0.5 — NO joint/pivot change):**
  - `Box(halfLen 0.18, halfWidth 0.07, center Vec2(0.25, 0))` — the core face.
  - `Circle(0.07)` at `Vec2(0.43, 0)` — rounded tip reaching x≈0.50.
  - Optional `Circle(0.07)` at `Vec2(0.07, 0)` — rounds the hinge end so the ball can't catch the
    pivot corner while cradling.
  - Keep `FLIPPER_DENSITY = 1`; added tip mass is well within the motor-torque budget.
- **D-08 (interface change required):** `FlipperState` (`src/physics/types.ts`) currently exposes
  `{ length, halfWidth }` — a box assumption that can't describe a capsule. **Add `tipRadius`**
  (capsule: `tipRadius = halfWidth`; renderer draws a stadium). If the tapered variant is ever
  adopted, also split `halfWidth` into `baseHalfWidth` + `tipHalfWidth`. Debug-draw
  (`src/sandbox/debug-draw.ts`) must read the new field.

### Control scheme & input handling (FLIP-01, "no stuck-key or auto-repeat artifacts")
- **D-09:** **Multi-binding key set (fixed defaults, no keybind UI):** Left flipper =
  `KeyZ` **or** `ShiftLeft` **or** `ArrowLeft`; Right flipper = `Slash` **or** `ShiftRight`
  **or** `ArrowRight`. Keeps the **original Space Cadet** `Z` + `/` for fidelity while adding
  the far-edge Shift keys for the constant both-flipper cradle press. Reserve `Space` (plunger,
  Phase 3) and `X`/`.`/`ArrowUp` (nudge, Phase 4) — do **not** bind them now, and do not swallow
  them.
- **D-10 (input architecture — settled best-practice, not a fork):** A standalone
  **engine-agnostic `src/input/` module** (no `planck` import, mirroring the `PhysicsWorld`
  decoupling in `main.ts`) owns a held `Set` of `event.code`s, updated on window
  `keydown`/`keyup`. Key on **`event.code`** (physical, layout-independent, and the *only* way
  to distinguish `ShiftLeft` from `ShiftRight` — `event.key` collapses both to `"Shift"`).
  **Ignore `KeyboardEvent.repeat === true`** (and de-dupe against the set) so OS auto-repeat never
  re-triggers a flip; edge-trigger the controller only on genuine per-*side* not-held→held /
  held→not-held transitions (OR across that side's codes; a side "releases" only when *all* its
  keys are up). `event.preventDefault()` on bound codes (critical for `/` = Firefox quick-find,
  and arrows = page scroll). Force-clear the held set and emit release edges on window `blur` and
  `document` `visibilitychange` when hidden (aligns with Phase-1 tab-blur survival). For sub-frame
  response against the 120 Hz loop: handlers **latch** press/release edges immediately; `main.ts`
  drains the latch at the **top of each fixed step** (before `world.step()`), so a press applies on
  the very next 120 Hz step (≤ ~8.3 ms → sub-frame vs 60 fps render). No per-frame allocation.

### Test-rig scope
- **D-11:** Phase 2 builds **two mirrored flippers on a throwaway test rig** (a feed that drops
  the ball onto them, like Phase 1's bounded box) — feel is judged in isolation. Real flipper
  **placement/angles/gap** on the actual playfield is Phase 3 (table layout). Do not hardcode
  real-table geometry here; keep the two-flipper setup a clean, replaceable scaffold.

### Claude's Discretion
- Exact feel-tuned values for `FLIPPER_UP_SPEED`, `FLIPPER_RETURN_SPEED`, re-tuned
  `FLIPPER_MAX_MOTOR_TORQUE`, angle limits, capsule dimensions within the D-07 ballpark, and the
  secondary speed-cap value (sized so `N` ≤ ~4).
- The empirical safe tip-speed ceiling (optionally recorded via a soak calibration sweep that ramps
  peak ω until the ON-gate first fails).
- Test-rig placement of the two flippers, the ball-feed mechanism, module/file naming, and whether
  the base-end rounding circle (D-07) is included.
- FSM implementation details (enum vs object states) and how input edges are latched, provided the
  observable state sequence and the interface contract (D-05) hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (internal)
- `.planning/ROADMAP.md` § "Phase 2: Flippers & Feel" — goal + the 4 success criteria that
  define done (sub-frame response; tip-vs-base `v=ω×r`; explicit cradle state machine; rotational
  CCD).
- `.planning/REQUIREMENTS.md` — FLIP-01 (keyboard, sub-frame), FLIP-02 (rotational momentum
  transfer), FLIP-03 (catch/cradle steady), FLIP-04 (fast flipper never passes through the ball).
- `.planning/PROJECT.md` § Core Value / Constraints — the flipper loop is the make-or-break feel;
  desktop keyboard only; no keybind/settings UI.

### Carry-forward from Phase 1 (internal — locked upstream, do not re-derive)
- `.planning/phases/01-physics-core-spike/01-CONTEXT.md` — D-01 (Planck-first behind the
  interface), D-05 (harness targets the engine-agnostic interface, not Planck), D-08/D-09 (the
  "heavy, not floaty" reference anchor whose FINAL by-feel verdict was **deferred to THIS phase**,
  judged through flipper catch/return), and the fixed-120Hz + vector-reuse carry-forward.

### Tech-stack & physics patterns (internal — authoritative, no ADRs exist yet)
- `CLAUDE.md` § Technology Stack — canonical flipper = **dynamic body on a motorized revolute
  joint** (`enableMotor` / `motorSpeed` / high `maxMotorTorque` / angle limits), **NEVER kinematic**;
  Planck `setBullet` CCD; fixed-timestep accumulator @120 Hz + render interpolation; reuse
  vectors / no per-frame allocation.

### Code this phase builds on (in-repo)
- `src/physics/types.ts` — the `PhysicsWorld` interface: `getFlippers()`, `setFlipperMotor(id,
  direction)` (sign-only today), `FlipperState` (`{length, halfWidth}` → add `tipRadius`, D-08),
  and the `ball-flipper` `CollisionEvent` with `normalImpulse` (hit-strength proxy for feel/tuning
  + later audio).
- `src/physics/planck-world.ts` — `buildTestFlipper()` (dynamic Box + `RevoluteJoint` w/ motor +
  limits — the pattern to productize into two capsule flippers), `setFlipperMotor` (sign→speed map,
  D-05), `primeBallCcd` (Planck issue #167 CCD-arming workaround — reuse for new bodies), `step()`
  (where D-01 sub-stepping is inserted; must accumulate `post-solve` events across sub-steps and
  sync contacts only after the last).
- `src/physics/constants.ts` — `FIXED_DT=1/120`, `FLIPPER_LENGTH_M=0.5`, `FLIPPER_HALF_WIDTH_M=0.04`
  (thin, stress-only), `FLIPPER_MOTOR_SPEED=40`, `FLIPPER_MAX_MOTOR_TORQUE=10000`, angle limits
  ±π/4, `BALL_RADIUS_M=0.2` — **stress-tuned; re-tune for feel this phase** and add
  `FLIPPER_UP_SPEED` / `FLIPPER_RETURN_SPEED` / `FLIPPER_TIP_RADIUS_M`.
- `src/sim/loop.ts` — `FixedStepLoop.advance(deltaMs)` returns the number of fixed steps; input
  edges latch onto these steps (D-10).
- `src/sandbox/main.ts` — the composition root + rAF loop (zero per-frame allocation). Add the
  input module wiring + the second flipper + the ball-feed here.
- `src/sandbox/debug-draw.ts` — reads `FlipperState`; update for the capsule (`tipRadius`).
- `src/harness/soak.ts`, `src/harness/containment.ts` (`flipperSweptTunnel`), `src/harness/prng.ts`
  — the Phase-1 headless swept-containment soak + seeded PRNG; the FLIP-04 gate (D-03) extends these.

### External references (behavior/values only — NEVER copy assets)
- `k4zmu2a/SpaceCadetPinball` decomp — `TFlipper` (flipper geometry/behavior anchor). Behavior/values
  only. https://github.com/k4zmu2a/SpaceCadetPinball
- Erin Catto, "Continuous Collision" (GDC 2013) — the TOI rotation limitation that motivates D-01.
  https://box2d.org/files/ErinCatto_ContinuousCollision_GDC2013.pdf
- Box2D 2.4 Simulation docs — TOI "captures all translational collisions… may miss" large rotations.
  https://box2d.org/documentation/md_simulation.html
- Planck.js docs — `RevoluteJoint` (`enableMotor`/`motorSpeed`/`maxMotorTorque`/`setMotorSpeed`/
  `getJointSpeed`/`getJointAngle`), Shape/Polygon (`radius` = CCD skin only; multi-fixture compound
  bodies). https://piqnt.com/planck.js/docs
- iforce2d Box2D tutorials — revolute-joint motors + pinball flipper setup / collision anatomy.
  https://www.iforce2d.net/b2dtut/
- MDN `KeyboardEvent` + javascript.info Keyboard events — `event.code` vs `event.key` (`"Shift"`
  collapse), `event.repeat`, held-set pattern. https://developer.mozilla.org/docs/Web/API/KeyboardEvent
- StrategyWiki — 3D Pinball Space Cadet controls (Left = Z, Right = /, Space = plunger, X/./Up =
  nudge). https://strategywiki.org/wiki/3D_Pinball_for_Windows:_Space_Cadet/Controls

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`buildTestFlipper()` in `src/physics/planck-world.ts`** — a complete dynamic + motorized-
  revolute flipper (the canonical Box2D setup). Phase 2 generalizes this into two mirrored,
  feel-tuned, capsule-shaped flippers rather than writing flippers from scratch.
- **`setFlipperMotor(id, direction)` + `getFlippers()` + `ball-flipper` `CollisionEvent`** already
  on the `PhysicsWorld` interface — the actuation hook (D-04/D-05) and the hit-strength signal are
  in place; no new interface surface needed except adding `tipRadius` to `FlipperState` (D-08).
- **`primeBallCcd()`** — the Planck issue-#167 CCD-arming workaround; reuse for any newly-added body.
- **`src/harness/{soak,containment,prng}.ts`** — the seeded swept-containment soak gate + the
  `flipperSweptTunnel` intra-step invariant; the FLIP-04 gate (D-03) is an extension, not a rewrite.
- **`FixedStepLoop` (`src/sim/loop.ts`)** — the 120 Hz accumulator; input latches onto its steps.

### Established Patterns
- **Engine isolation:** only `src/physics/planck-world.ts` may import `planck`; everything else
  (input module, FlipperController, harness, sandbox) talks through `PhysicsWorld`. The new
  `FlipperController` and `src/input/` module MUST honor this (D-05/D-10).
- **Zero per-frame allocation** on the render/step hot path (pooled snapshots, reused event/contact
  views). New input latching and any sub-stepping must preserve this (threat T-03-01 lineage).
- **Reference-anchored, HMR-tunable constants** in `constants.ts` as the single source of truth for
  feel — add the new flipper feel constants there, not inline.

### Integration Points
- **Sub-stepping (D-01)** hooks inside `PlanckWorld.step()` — the *only* place that changes for the
  anti-tunnel guarantee; the interface and harness are untouched.
- **`FlipperController` (D-05)** sits between the input module and `setFlipperMotor` — new seam.
- **Input module (D-10)** attaches window listeners and feeds the controller; wired in `main.ts`.
- **`FlipperState.tipRadius` (D-08)** flows from adapter → `types.ts` → `debug-draw.ts`.

</code_context>

<specifics>
## Specific Ideas

- Feel is judged the way Phase 1 explicitly deferred it (D-09): the "heavy, not floaty" verdict is
  settled **here**, through real flipper **catch → cradle → return** on the tilted playfield — not a
  vibe, but observed against the reference-anchored constants.
- The anti-tunnel property must be **proven, not demonstrated** — a seeded green/red gate with a
  teeth-bearing negative control (sub-stepping OFF at peak ω goes RED), mirroring Phase 1's headline
  artifact. This is the phase's second proof after feel.
- Fidelity nod: the original `Z` + `/` keys are preserved inside the multi-binding set even though
  Shift is the ergonomic default for the both-flipper cradle.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Related notes (already scoped elsewhere, not deferrals):
the manual swept-TOI resolver is an **in-phase last-resort fallback** (D-02), not a deferred idea;
real flipper placement/table geometry is Phase 3; slingshots/kickers near the flippers are Phase 4;
flipper *sound* and *rendering* are Phase 5; the sweep-then-hold hold-mode tweak (D-04) is an in-phase
playtest option, not a separate feature.

</deferred>

---

*Phase: 2-Flippers & Feel*
*Context gathered: 2026-07-15*
