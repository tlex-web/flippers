---
phase: 01-physics-core-spike
reviewed: 2026-07-15T00:00:00Z
depth: deep
files_reviewed: 17
files_reviewed_list:
  - src/physics/types.ts
  - src/physics/constants.ts
  - src/physics/planck-world.ts
  - src/sim/loop.ts
  - src/sandbox/main.ts
  - src/sandbox/debug-draw.ts
  - src/harness/prng.ts
  - src/harness/containment.ts
  - src/harness/soak.ts
  - src/physics/planck-world.smoke.test.ts
  - src/sim/loop.determinism.test.ts
  - src/sim/loop.tabblur.test.ts
  - src/harness/containment.test.ts
  - src/harness/prng.test.ts
  - src/harness/soak.gate.test.ts
  - src/harness/soak.test.ts
  - src/harness/stability.test.ts
findings:
  blocker: 0
  high: 0
  medium: 2
  low: 4
  total: 6
  high_resolved: 3
status: issues
resolution:
  highs_fixed: 3
  commits: [9ce80ef, cc171ca, 0b19e16]
  remaining: "2 medium + 4 low tracked for follow-up (M-02 ball-radius deferred; flipper-related M-01 folds into Phase 2)"
---

# Phase 1: Code Review Report — Physics Core Spike

> **Resolution (2026-07-15):** All 3 HIGH findings fixed and verified before phase completion —
> **H-01** reusable `WorldManifold` + pooled events (zero steady-state alloc on `world.step()`),
> **H-02** `drainEvents()` called each sandbox frame (event buffer bounded <50 over 2000 frames),
> **H-03** new engine-agnostic `flipperSweptTunnel` sub-samples the bat's intra-step swept sector +
> a CCD-off flipper negative control that goes RED — the dynamic-flipper tunnel case is now proven
> by the harness, not by trusting Planck (closes the D-03/D-05 gap). Commits `9ce80ef`, `cc171ca`,
> `0b19e16`. Post-fix gates: 32/32 tests, `npm run soak` exit 0, tsc/eslint clean, single-Planck-import
> invariant holds. The 2 medium + 4 low findings below remain tracked (feel constants left untouched).

**Reviewed:** 2026-07-15
**Depth:** deep (cross-file + Planck-internals verification)
**Files Reviewed:** 17 (9 source, 8 test)
**Status:** issues (advisory / non-blocking gate)

## Summary

The spike is well-structured and the core deliverables hold up under scrutiny:

- **Single-Planck-import boundary holds.** Grep confirms `import ... from "planck"` appears in exactly one file (`planck-world.ts:14`). Every other module, test, sandbox, and the harness talk to physics only through `PhysicsWorld`. D-01/D-05/D-07 respected.
- **Determinism is real.** `mulberry32` never touches `Math.random`/`Date.now` (verified by grep and the PRNG test's spy). The loop's step-draining is a pure function of accumulated ms and `FIXED_DT`; the cross-cadence test parks at `(K+0.5)` steps so the float margin dwarfs summation error — an honest bit-identical proof.
- **The swept containment invariant is sound.** The endpoint-AABB net (#1) plus the radius-inflated segment-vs-segment distance (#2) genuinely catch a straight tunnel through the thin interior wall between two inside endpoints and a disk that pokes the outer boundary and returns. Corners and endpoints are covered because `pointSegmentDistance` clamps `t∈[0,1]`. The exclusive `< radius` rule and the negative control give it teeth.
- **Read-path snapshots are allocation-free.** Verified against Planck internals: `Body.getPosition()`/`getLinearVelocity()` return live references (no alloc), and the ball/flipper pools are mutated in place. `loop.ts`, `debug-draw.ts`, and `main.ts` reuse pooled buffers and grow only on ball-count growth.

That said, the review surfaced defects the green tests do not catch — most importantly, **per-step heap allocations inside `world.step()`** (the exact GC-hitch pattern CONTEXT forbids), an **unbounded event-queue leak** in the only continuously-running consumer, and a **flipper-tunnel detector in the gate that can produce false negatives** on the phase's make-or-break dynamic case. No blocker-level (shipping-incorrect / security / data-loss) defects were found; the phase gate is legitimately green.

## High

### H-01: Per-step heap allocations inside the physics step hot path (violates the non-negotiable 60fps / no-per-frame-alloc mandate)

**File:** `src/physics/planck-world.ts:199-216` (post-solve) and `:411-432` (`syncContactPoints`)

`world.step()` is on the 60fps path (the loop runs it 1–3×/rendered frame). Both the `post-solve` handler and `syncContactPoints` allocate every step for any contacting ball:

- `contact.getWorldManifold(null)` is called per touching contact in **both** `syncContactPoints` (`:415`) and post-solve (`:207`). Verified in `node_modules/planck/dist/planck.js:4862`: `wm = wm || new WorldManifold();` — passing `null` **allocates a fresh `WorldManifold` (with internal arrays) on every call**.
- `classifyContact` (`:123-132`, called at `:203`) does `const kinds = new Set([a, b]);` — a **new `Set` + array literal per contact per step**.
- Post-solve `this.events.push({ ..., point: { x, y }, ... })` (`:209-215`) allocates **an event object and a nested point object per classified contact per step**.

A resting/bouncing ball produces ≥1 contact every step, so this is steady-state garbage generation in exactly the loop CLAUDE.md and CONTEXT (carry-forward: "Reuse vector objects / avoid per-frame allocations to prevent GC hitches that break 60 fps") call out as non-negotiable. Tests pass because they assert numeric outcomes, not allocation counts.

**Fix:**
```ts
// Reuse one WorldManifold (planck is already imported here — allowed).
import { WorldManifold } from "planck";
private readonly scratchWm = new WorldManifold();
// ...both call sites:
const wm = contact.getWorldManifold(this.scratchWm);

// classifyContact without a Set/array:
function classifyContact(a, b) {
  if ((a === "ball" && b === "wall") || (a === "wall" && b === "ball")) return "ball-wall";
  if ((a === "ball" && b === "flipper") || (a === "flipper" && b === "ball")) return "ball-flipper";
  if (a === "ball" && b === "ball") return "ball-ball";
  return null;
}
```
For events, prefer a pooled ring/free-list of pre-allocated `{type,aId,bId,point:{x,y},normalImpulse}` records that `drainEvents()` recycles, so the push path reuses objects instead of allocating (see H-02).

### H-02: Collision events are never drained → unbounded memory growth in the sandbox loop

**File:** `src/physics/planck-world.ts:184,199-216,464-468`; consumer gap in `src/sandbox/main.ts` (whole `frame()`)

`drainEvents()` is defined and part of the interface but has **no caller anywhere** in the codebase (grep: only the definition + docs). Meanwhile `post-solve` pushes an event into `this.events` every contacting step. In `main.ts` the `requestAnimationFrame` loop runs `loop.advance()` (hence `world.step()`) forever and never drains, so `this.events` **grows without bound** for the life of the tab — a steady leak on top of the per-object churn in H-01. In a "stable 60fps, portfolio-grade" demo this eventually forces GC pauses.

The adapter itself is contract-correct (it assumes a consumer drains), but the *only* continuously-running consumer never does, so the wiring leaks in the one place it actually runs long.

**Fix:** Either drain-and-ignore each frame in the sandbox, or cap the queue in the adapter so an undrained producer cannot grow unbounded:
```ts
// sandbox/main.ts, inside frame(), after loop.advance():
world.drainEvents(); // discard this phase (no event consumers yet)

// or, defensively in planck-world.ts post-solve:
if (this.events.length < MAX_PENDING_EVENTS) this.events.push(evt);
```

### H-03: Gate's flipper-tunnel detector ignores the bat's intra-step sweep → false-negative surface on the make-or-break dynamic case

**File:** `src/harness/soak.ts:388-403`

The boundary segments returned by `getBoundarySegments()` do **not** include the flipper, so the *only* independent check that the ball never tunnels the dynamic bat is this block. It tests the ball's straight chord `prev→next` against the flipper's **post-step** centerline only:
```ts
const fl = world.getFlippers()[0]; // post-step angle
const batB = { x: fl.pivotX + Math.cos(fl.angle)*fl.length, ... };
if (segmentsIntersect(prev, next, pivot, batB)) { ... }
```
The bat rotates up to `FLIPPER_MOTOR_SPEED·FIXED_DT = 40/120 ≈ 0.33 rad (~19°)` per step, moving the tip ~0.17 m. A ball that passes through where the bat *was* mid-step but the bat has rotated away by step-end will not intersect the post-step centerline, so `escapedFlipper` stays `false` and the tunnel is **missed**. Because there is no other flipper check, a green gate does **not** independently prove the ball-vs-moving-bat no-tunnel property (D-03/D-04/D-05) — it silently leans on Planck's CCD being correct, which is exactly the "anecdotal, engine-specific" proof D-03 rejects. This is a latent false-green risk on the phase's headline artifact for its textbook "bullet-through-paper" case.

**Fix:** Sweep the bat too. Read the flipper angle *before* and *after* the step and test the ball's chord against the swept quad (or against several interpolated centerlines between pre/post angle), or better, run a segment-vs-segment TOI between the ball chord and the linearly-interpolated bat centerline over the step. At minimum, capture `flPre.angle` (already read at `:351`) and test crossing against both the pre- and post-step centerlines.

## Medium

### M-01: `addBall` steps the entire world as a side effect — a determinism/correctness hazard against the N-ball-ready contract

**File:** `src/physics/planck-world.ts:354-378` (`primeBallCcd`, called from `addBall` at `:338`)

CCD priming calls `this.world.step(FIXED_DT, ...)` to force a first contact (issue #167 guard). That step advances **every** body — the flipper and any already-present balls — by one extra `FIXED_DT` that the `FixedStepLoop` neither requested nor counts. In the single-ball spike this is a one-time, pre-loop perturbation (harmless, and identical across all rigs so determinism tests still pass). But `addBall` is a public interface method on an explicitly **N-ball-ready** contract (types.ts:10-12,101): calling it to introduce a ball into a *live* multi-ball world would silently jog every other ball and the flipper forward a step and desync the loop's accumulator, breaking the deterministic-replay contract for existing bodies. It also makes priming with-CCD asymmetric to the without-CCD path (negative control skips it), so the two worlds diverge by one flipper step.

**Fix:** Prime without a global step — e.g., overlap the primer and run a *broad/narrow-phase-only* contact update, or seed the ball's `m_islandFlag`/contact via a mechanism that doesn't integrate the whole world; or gate priming so it is only ever performed on an otherwise-empty world (assert `this.balls.length === 0`) and document that mid-simulation ball insertion is unsupported until a per-body prime exists.

### M-02: Ball radius (0.2 m) is below the D-08 solver/CCD well-conditioning floor, and the constant's comment misquotes D-08

**File:** `src/physics/constants.ts:43-48`

D-08 (and CLAUDE.md) locks "size the ball ~0.3–0.5 m so Planck's solver + CCD stay well-conditioned." The code uses `BALL_RADIUS_M = 0.2`, and its own comment even restates the guidance as "~0.3–0.5 m of scale" while shipping 0.2 — a self-contradiction and a deviation from a locked decision that exists specifically to protect the phase's make-or-break CCD conditioning. The soak passing at 0.2 m mitigates the practical risk but does not retroactively satisfy the decision, and a smaller ball shrinks the CCD/contact margin the whole spike is meant to keep robust.

**Fix:** Either raise `BALL_RADIUS_M` into the 0.3–0.5 m band (and re-tune `PIXELS_PER_METER` so the drawn ball still reads as a pinball), or, if 0.2 m is a deliberate, tested override of D-08, record that as an explicit decision (ENGINE-DECISION.md) and correct the comment so it no longer claims to follow the 0.3–0.5 m rule it violates.

## Low

### L-01: `advance()` has no lower clamp on `realDeltaMs` → `alpha` can leave [0,1)

**File:** `src/sim/loop.ts:54-71`

`const clamped = Math.min(realDeltaMs, MAX_FRAME_MS);` bounds only the upper side. A negative `realDeltaMs` (non-monotonic clock edge, or a misfed delta) makes `accumulator` negative, runs zero steps, and yields `alphaValue = accumulator / FIXED_DT_MS < 0`, so `main.ts` interpolation extrapolates backward (`p + (c-p)·alpha` with `alpha<0`). `performance.now()` is monotonic so this is defensive, but the guard is one character.

**Fix:** `const clamped = Math.max(0, Math.min(realDeltaMs, MAX_FRAME_MS));`

### L-02: `sweptEscaped` models motion as a straight chord — a documented bound, not a defect

**File:** `src/harness/containment.ts:136-152`

The invariant tests the straight segment `prevCenter→nextCenter`. A mid-step *curved* excursion (ball darts to a wall and bounces back within one `FIXED_DT`, both endpoints inside and the chord staying clear) is not modeled. This is not a real escape path for the outer boundary (open space outside gives nothing to push the ball back in one 8.3 ms step) nor for the interior wall (a through-and-back needs a reversal the far side cannot supply), and the endpoint-AABB net plus interior-wall crossing cover the realistic single-step tunnels — so the proof is adequate. Worth stating explicitly as a known limit of the containment guarantee so a future faster ball / thicker interior geometry re-triggers analysis.

**Fix:** Add a one-line note to the docstring bounding the guarantee to straight inter-step motion, and consider sub-sampling the chord if per-step ball travel ever approaches the smallest interior feature size.

### L-03: Offline soak hot loop allocates per step (`boundsOf` + array-in-loop)

**File:** `src/harness/soak.ts:173-187` and `src/harness/containment.ts:33-47`

`sweptEscaped` recomputes `boundsOf(walls)` every step (`containment.ts:142`), and every `boundsOf` allocates a `{minX,...}` object plus a `[w.a, w.b]` array per wall per call. In the soak this runs ~75,600×/gate. This is the offline gate, not the 60fps path, so it does not threaten the frame budget — but it is the same avoidable-allocation pattern and slows the gate.

**Fix:** Hoist bounds out of the per-step call (compute once per case and pass into `sweptEscaped`), and iterate `w.a`/`w.b` directly instead of `for (const p of [w.a, w.b])`.

### L-04: Minor quality/doc nits

**Files:** `src/physics/constants.ts:77`, `src/physics/planck-world.ts:319-321,111-121`

- `constants.ts:77` — comment "a 0.2 m ball draws as an 80 px sphere" conflates radius and diameter: `0.2 m × 400 px/m = 80 px radius` = **160 px diameter**. `debug-draw.ts:205` uses it as the arc radius (80 px), so the drawn ball is 160 px across.
- `planck-world.ts:319-321` — `bullet: this.bulletEnabled` in the create options and the immediately-following `body.setBullet(this.bulletEnabled)` are redundant; keep one (the explicit call, with a comment) to avoid the impression they do different things.
- `planck-world.ts:111-121` — `asTag` validates that `"kind"`/`"id"` keys exist but not their value types before `return userData as BodyTag`. Internal-only userData makes this safe today; a value check (`typeof (userData as any).id === "number"`) would harden it against future tag reuse.

---

_Reviewed: 2026-07-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
