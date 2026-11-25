# Engine Decision — LOCKED: Planck.js

**Phase:** 1 (Physics Core Spike)
**Status:** ✅ LOCKED — Planck-first CONFIRMED empirically (D-01/D-02)
**Decided:** 2026-07-15
**Requirements:** PHYS-01, PHYS-02, PHYS-03

## Decision

The physics engine is **Planck.js 1.5.0**, driven with continuous collision
detection (per-body `body.setBullet(true)` **plus** world-level
`continuousPhysics: true`), and reachable ONLY through the engine-agnostic
`PhysicsWorld` interface (`src/physics/types.ts`). Planck is imported in exactly
one file — `src/physics/planck-world.ts` — the composition root; nothing else in
the codebase imports `planck` (D-05).

The D-01/D-02 fallback — a hand-rolled **custom swept circle-vs-segment/arc
solver** — is **NOT triggered**. Its trigger condition (Planck failing the
tunnel-proof or the Phase-1 feel bar) did not occur.

## Empirical Basis (why it is locked, not asserted)

The decision was made deliberately empirical (D-01/D-02/D-05): the physics lives
behind the interface, so any engine is judged by the same headless proofs. Both
gates are GREEN against Planck.

### 1. Tunnel-proof — the SOLE pass/fail gate (PHYS-02, D-03)

`npm run soak` → `src/harness/soak.gate.test.ts` (soak engine `src/harness/soak.ts`):

- **630 s of SIMULATED** fixed-step (120 Hz) time — **>= the 600 s / 10-minute
  floor** (D-04) — over **210 seeded cases** sweeping launch **angle × speed ×
  flipper phase**, with launch speeds up to **~58–60 m/s (~10× the ball's real
  max ~6 m/s)**, flung at the **thinnest (zero-width) static wall** AND the
  **dynamic max-speed motorized test flipper** — the textbook
  "bullet-through-paper" case.
- A **swept containment invariant** (`sweptEscaped`, plan 01-05) is asserted every
  step via the interface — it catches a ball that punches out and re-enters
  between two 120 Hz steps, which a naive "center inside box" check misses.
- Result: **the ball never escaped. Exit 0** (green in ~6–11 s wall-clock;
  headless stepping runs far faster than real time). Re-verified green on
  2026-07-15 while locking this decision.
- Evidence commits: **`1197173`** (soak engine + full gate, CCD-on green) and
  **`8c5fa1e`** (bounded green + CCD-off negative control). Reproduce with
  `npm run soak`.

Planck's `setBullet` + `continuousPhysics` therefore **empirically HOLDS** the
#1 project risk (ball tunneling through thin/fast geometry) at ~10× the ball's
real max velocity, against both the thinnest static wall and the dynamic
max-speed flipper.

### 2. The gate has TEETH — proven by a negative control (T-06-01)

A green gate is only trustworthy if a real fault turns it RED. The CCD-off
negative control (`src/harness/soak.test.ts`, `{ bullet: false }`, max-velocity
thin-wall launch) reports `passed === false` with a **numeric replayable seed +
full ball/flipper state** that reproduces byte-identically. So "green" means "no
tunneling", not "the check never ran".

**Recorded subtlety (Box2D CCD semantics):** disabling CCD for the control
required turning off the **world-level `continuousPhysics` (the TOI solver)**, not
just clearing the per-body `setBullet` flag — because Box2D/Planck run continuous
collision against STATIC bodies for every dynamic body regardless of `setBullet`
(that flag only ADDS dynamic-vs-dynamic CCD). Merely clearing `setBullet` still
stopped the ball at the static thin wall (a false-green control) until
`continuousPhysics: false` was also set. This is captured in
`PlanckWorldOptions.bullet` and its doc comment.

### 3. Stability / feel bar (PHYS-01, criterion #3; D-09 Phase-1 target)

`src/harness/stability.test.ts` (plan 01-07) proves headlessly, through the
interface, that a ball driven by the reference-anchored constants:

- **settles to rest** with **no post-settle jitter** and **no corner-sticking**, and
- has **monotonically non-increasing kinetic energy once undisturbed** (it never
  spontaneously gains speed) — with the monotonic detector shown to have teeth (it
  rejects a synthetic speed-up).

Box2D's mature resting-contact + body-sleeping delivers "resting ball still,
energy trending down" as designed (CLAUDE.md). The concrete Phase-1 feel target
(reference-anchored constants + a visibly weighty fall/settle) is met; the FINAL
by-feel "heavy" verdict is explicitly deferred to Phase 2, judged through flipper
catch/return on the real table incline (D-09).

## Fallback (documented, NOT triggered)

Per **D-01**: build a **custom swept circle-vs-segment/arc solver** ONLY if Planck
empirically fails the tunnel-proof or the feel bar in this phase's stress run.
Neither failed, so the fallback is not built. Should a future phase ever regress
(e.g., rotational CCD for real flippers in Phase 2 exposes a tunnel), the swept
invariant would go RED with a replayable seed, and — because the engine sits
behind `PhysicsWorld` (D-02/D-05) — a custom solver could be dropped in and judged
by the **identical `npm run soak`** without touching any downstream code. The
decision is thus locked but cheap to revisit.

## Consequences (carry-forward — do not re-litigate)

- **Engine boundary is a hard rule:** `planck` is imported only in
  `src/physics/planck-world.ts`. Every other module (loop, sandbox, harness,
  future phases) consumes `PhysicsWorld` only.
- **Ball** = small dynamic circle, `setBullet(true)`, restitution ~0.35, low
  friction, velocity-proportional `linearDamping` (reference-anchored constants).
- **Flippers** (Phase 2) = dynamic bodies on motorized revolute joints — NOT
  kinematic (CLAUDE.md "What NOT to Use").
- **Walls** = Planck chain/edge static shapes.
- Data structures stay **N-ball-ready** so deferred multiball is additive.
- Open Phase-2 item (not a blocker to this lock): **rotational CCD** (angular
  sub-stepping / speculative contacts) for fast-swinging real flippers warrants a
  focused research pass; it is judged by the same interface-level soak.

---

*Phase: 01-physics-core-spike — plan 01-07*
*Basis: `npm run soak` (green, commits 1197173 / 8c5fa1e) + `src/harness/stability.test.ts`*
