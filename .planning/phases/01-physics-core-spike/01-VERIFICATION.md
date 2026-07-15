---
phase: 01-physics-core-spike
verified: 2026-07-15T14:30:00Z
status: passed
score: 5/5 roadmap success criteria verified; 3/3 requirements (PHYS-01/02/03) verified
overrides_applied: 0
overrides:
  - must_have: "Pinned deps (planck 1.5.0, vite 8.1.4, typescript 7.0.2, vitest) are installed and the lockfile is committed"
    reason: "typescript pinned to 5.9.3 instead of 7.0.2 — @typescript-eslint 8's peer range is <6.1.0 and crashes at import under TS 7.0's native-compiler API. CLAUDE.md § Version Compatibility explicitly prescribes this exact fallback ('If any tool assumes the old JS tsc API, pin to typescript@5.x — but for --noEmit type-checking in this project, 7.0 is fine.'). tsc --noEmit / eslint / build / test all pass clean under 5.9.3; the exact-pin + committed-lockfile supply-chain control is preserved unchanged."
    accepted_by: "verifier (pre-authorized by CLAUDE.md's own documented escape hatch; flagged in 01-01-SUMMARY.md as 'open item to ratify')"
    accepted_at: "2026-07-15T14:30:00Z"
---

# Phase 1: Physics Core Spike Verification Report

**Phase Goal:** A single ball obeys stable, heavy, tunnel-proof, frame-rate-independent 2D physics — provable in isolation before any table geometry or art exists.
**Verified:** 2026-07-15T14:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

All verification commands were re-run independently in this session (not taken from SUMMARY claims). Results below are from actual command execution against the current working tree.

### Observable Truths — ROADMAP Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Ball moves under gravity/momentum/restitution/friction and feels heavy, not floaty (Phase-1 target only; final heavy verdict deferred to Phase 2 per D-09) | ✓ VERIFIED | `src/physics/constants.ts` derives `IN_PLANE_GRAVITY = sin(28°)·9.81 ≈ 4.6 m/s²` from `INCLINE_DEG` (not a magic literal), with `BALL_LINEAR_DAMPING=0.4`, `BALL_RESTITUTION=0.35`, `BALL_FRICTION=0.05` — each constant carries a comment citing its `TTableLayer.cpp`/`TBall.cpp` behavior basis. `src/harness/stability.test.ts` (4 tests, part of the 26 passing) headlessly proves a dropped ball settles, sits still, and never spontaneously gains energy — the concrete, regression-testable D-09 target. The blocking human-verify checkpoint (01-07 Task 3, gate="blocking") required a typed "approved" before the phase could complete; SUMMARY records operator approval and subsequent commits (`40aeddb`, `c08fec2`) confirm the workflow proceeded past this gate. |
| 2 | Flung at the thinnest wall + fastest test flipper at max speed for a 10-min stress run, ball never escapes (no tunneling) — provable by the headless soak, not anecdote | ✓ VERIFIED | Ran `npm run soak` myself: exit 0, `Test Files 1 passed (1)`, `Tests 1 passed (1)`, ~6-7s wall-clock. Inspected `src/harness/soak.gate.test.ts`: asserts `cases*durationSeconds >= 600` (default 210×3=630s) AND `result.simulatedSeconds >= 600` AND `passed === true`. Inspected `src/harness/soak.ts`: seeds sweep from `mulberry32`, launches speeds in `[0.6,1.0]×maxLaunchSpeed` (default 60 m/s, ~10× the ball's real ~6 m/s max) aimed at the thinnest wall and the max-speed flipper, applies `sweptEscaped` (radius-inflated segment-vs-wall crossing, catches punch-out-and-re-enter) every 120Hz step against both the static boundary and the moving flipper centerline. |
| 3 | Resting ball sits perfectly still (no jitter/corner-sticking); total energy trends downward, never gaining speed — provable headlessly | ✓ VERIFIED | Ran `npx vitest run` myself: 26/26 pass, including `src/harness/stability.test.ts`'s 4 tests: settle+no-jitter, corner-seeded settle (no corner-sticking), kinetic-energy monotonic-non-increasing (`firstMonotonicIncrease` detector), and a teeth-proof that the detector rejects a synthetic speed-up. Energy scenario is floor-resting + horizontal launch specifically so gravity cannot pump energy in (documented rationale), isolating the "never spontaneously gains speed" claim from legitimate free-fall gain. |
| 4 | Ball feel identical at 60/120/144Hz and survives tab-blur without exploding — provable by determinism + tabblur tests | ✓ VERIFIED | Read `src/sim/loop.determinism.test.ts`: drives 3 fresh worlds at emulated 60/120/144Hz frame deltas for the same total simulated time, asserts identical executed step count (1200) AND bit-identical final ball state (`toEqual`, epsilon 0 — justified because identical step counts + no RNG ⇒ bit-for-bit equal). Read `src/sim/loop.tabblur.test.ts`: asserts a single `advance(5000)` executes a bounded catch-up burst (≤ `MAX_FRAME_MS`/step+1, not the unclamped ~600), ball stays finite and inside the box, and normal frames after the spike resume clean stepping. Both files are part of the 26 passing tests I ran. `src/sim/loop.ts` clamps `realDeltaMs` to `MAX_FRAME_MS` (grep-confirmed, line 56: `Math.min(realDeltaMs, MAX_FRAME_MS)`). |
| 5 | Engine chosen and locked empirically (Planck setBullet vs custom solver); physics isolated behind ball/flipper/event interface; data structures N-ball-ready | ✓ VERIFIED | `ENGINE-DECISION.md` exists, states Planck.js 1.5.0 LOCKED with cited empirical basis (passing `npm run soak` + stability proof), documents the un-triggered custom-solver fallback. Grep-verified single-import invariant: `grep -rn "from ['\"]planck['\"]" src \| grep -v planck-world.ts` returns nothing; only `src/physics/planck-world.ts` imports `planck`. `src/physics/types.ts`'s `PhysicsWorld.getBalls(): readonly BallState[]` returns an id-keyed array (N-ball-ready), not a single hard-coded ball; `BallId` is a stable per-ball identifier. `SKELETON.md` engine-decision row updated pending → CONFIRMED. |

**Score:** 5/5 roadmap success criteria verified.

### Requirements Coverage (PHYS-01/02/03)

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| PHYS-01 | 01-02, 01-03, 01-07 | Ball moves under stable 2D physics (gravity/momentum/restitution/friction) and feels heavy, not floaty | ✓ SATISFIED | Reference-anchored constants (`constants.ts`) + stability/energy proof (`stability.test.ts`) + human-verify sign-off (01-07 Task 3, blocking gate). |
| PHYS-02 | 01-02, 01-05, 01-06, 01-07 | Ball never tunnels through thin walls or flippers, even at max speed (CCD) | ✓ SATISFIED | `npm run soak` exit 0 (630s simulated, ~10× real max velocity, thin wall + max-speed flipper) + CCD-off negative control independently re-run (`npx vitest run src/harness/soak.test.ts`, 3/3 pass) proving the gate goes RED (`passed===false`) on a real tunnel with a replayable seed. |
| PHYS-03 | 01-02, 01-04 | Fixed timestep decoupled from rendering; identical feel at 60/120/144Hz; survives tab-blur | ✓ SATISFIED | `loop.determinism.test.ts` (bit-identical state across cadences) + `loop.tabblur.test.ts` (bounded clamp, finite state, recovery), both independently read and confirmed part of the green 26-test suite. |

No orphaned requirements: all three IDs from REQUIREMENTS.md § Physics are claimed by at least one plan's frontmatter `requirements:` field, and REQUIREMENTS.md's traceability table already marks all three "Complete" — consistent with the codebase evidence above, not merely aspirational.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/physics/types.ts` | Engine-agnostic, N-ball-ready `PhysicsWorld` interface | ✓ VERIFIED | Exports `PhysicsWorld`, `BallState`, `FlipperState`, `CollisionEvent`, `Segment`, `Vec2`, `BallId`. `getBalls()`/`getFlippers()` return `readonly [...]State[]` arrays keyed by id — confirmed by direct read. |
| `src/physics/constants.ts` | Reference-anchored, HMR-tunable feel constants | ✓ VERIFIED | `INCLINE_DEG`, `IN_PLANE_GRAVITY` (derived, not literal), `BALL_RESTITUTION`, `BALL_FRICTION`, `BALL_LINEAR_DAMPING`, `PIXELS_PER_METER`, `FIXED_DT`, `MAX_FRAME_MS`, plus flipper constants — each with a comment citing SpaceCadetPinball behavior basis. |
| `src/physics/planck-world.ts` | Planck adapter: bullet ball + chain/edge walls + motorized test flipper | ✓ VERIFIED | Only file importing `planck` (grep-confirmed). Ball created with `setBullet(true)`; flipper created via `createDynamicBody` + `RevoluteJoint` with `enableMotor: true`, `maxMotorTorque: FLIPPER_MAX_MOTOR_TORQUE` — no `KINEMATIC`/`setKinematic` anywhere (grep-confirmed empty). |
| `src/sim/loop.ts` | Fixed-timestep accumulator, MAX_FRAME_MS clamp, previous/current/alpha | ✓ VERIFIED | `advance()` clamps via `Math.min(realDeltaMs, MAX_FRAME_MS)`, exposes `previous`/`current`/`alpha`/`totalSteps`/`accumulatorMs`. |
| `src/harness/prng.ts` | Deterministic seeded PRNG (mulberry32), never Math.random | ✓ VERIFIED | `mulberry32` exported; `grep -rn "Math.random" src/harness` returns nothing (checked). |
| `src/harness/containment.ts` | Swept containment invariant `sweptEscaped` | ✓ VERIFIED | Radius-inflated segment-vs-wall crossing test; unit-tested (containment.test.ts, part of 26 green). |
| `src/harness/soak.ts` + `soak.gate.test.ts` + `soak.test.ts` | The SOLE tunnel-proof gate + honesty negative control | ✓ VERIFIED | `npm run soak` run directly: exit 0. `soak.test.ts` run directly: 3/3 pass including the CCD-off negative control asserting `passed===false` with replayable seed + deterministic replay. |
| `src/harness/stability.test.ts` | Resting-ball stillness + energy-monotonic proof | ✓ VERIFIED | 4 tests, all green, substantive (not a stub) — read in full. |
| `ENGINE-DECISION.md` | Locked, evidence-backed engine decision | ✓ VERIFIED | Exists; cites Planck + the passing soak gate + stability proof; documents the un-triggered fallback. |
| `src/sandbox/debug-draw.ts` + `main.ts` | Throwaway Canvas 2D debug sandbox (diagnosis only) | ✓ VERIFIED | Both files present; neither imports `planck` (grep-confirmed — only imports `PlanckWorld` from the adapter, `FixedStepLoop`, and interface types). `npm run build` succeeds (bundles sandbox entry). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `planck-world.ts` | `types.ts` | implements `PhysicsWorld` | ✓ WIRED | Class implements the full interface; `tsc --noEmit` enforces completeness. |
| `loop.ts` | `types.ts` | steps a `PhysicsWorld` at `FIXED_DT` | ✓ WIRED | `world.step(FIXED_DT)` called inside the accumulator loop. |
| `soak.ts` | `containment.ts` | applies `sweptEscaped` every fixed step | ✓ WIRED | Confirmed in `runCase()`: `sweptEscaped(prev, next, effRadius, boundary)` called per step. |
| `soak.ts` | `prng.ts` | seeds the sweep matrix from `mulberry32` | ✓ WIRED | `deriveSeeds()` uses `mulberry32(masterSeed)`. |
| `soak.ts` | `types.ts` | drives `PhysicsWorld`, never Planck directly | ✓ WIRED | No `planck` import in `soak.ts`; only `PlanckWorld` (the adapter) is constructed as the default `makeWorld`. |
| `stability.test.ts` | `planck-world.ts` | drops a ball via the interface, samples KE | ✓ WIRED | Constructs `PlanckWorld`, drives via the real production `FixedStepLoop` (not a private shortcut), reads `getBalls()`. |
| `ENGINE-DECISION.md` | `soak.gate.test.ts` | cites the passing soak gate as evidence | ✓ WIRED | Document text cites commits `1197173`/`8c5fa1e` and `npm run soak`; both commits verified present in git history. |
| `index.html` | `src/sandbox/main.ts` | module script entry | ✓ WIRED | `npm run build` succeeds, bundling the sandbox entry; `npm run dev` boot was not re-run live in this session (no server started per verification constraints) but `main.ts` constructs `PlanckWorld` + `FixedStepLoop` and drives a `requestAnimationFrame` loop calling `advance()`/`draw()` — confirmed by direct source read. |

### Behavioral Spot-Checks (commands run directly in this session)

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full test suite green (26 tests) | `npx vitest run` | `Test Files 7 passed (7)` / `Tests 26 passed (26)` | ✓ PASS |
| Tunnel-proof soak gate exits 0 | `npm run soak` | `Test Files 1 passed (1)` / `Tests 1 passed (1)`, exit 0 | ✓ PASS |
| CCD-off negative control has teeth | `npx vitest run src/harness/soak.test.ts` | `Test Files 1 passed (1)` / `Tests 3 passed (3)` — includes the negative-control assertion `passed===false` | ✓ PASS |
| Typecheck clean | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Lint clean | `npx eslint .` | exit 0, no output | ✓ PASS |
| Production build succeeds | `npm run build` | `tsc --noEmit && vite build` → `✓ built in 389ms`, exit 0 | ✓ PASS |
| Single-Planck-import invariant | `grep -rn "from ['"'"']planck['"'"']" src \| grep -v planck-world.ts` | no output (only `planck-world.ts` matches the positive grep) | ✓ PASS |
| Flipper is dynamic + motorized, not kinematic | `grep -n "KINEMATIC\|setKinematic" src/physics/planck-world.ts` | no output; `enableMotor`/`maxMotorTorque`/`RevoluteJoint`/`createDynamicBody` all present | ✓ PASS |
| All claimed commits exist | `git cat-file -e <hash>` for all 14 hashes cited across the 7 SUMMARYs | all 14 present | ✓ PASS |

### Anti-Patterns Found

None blocking. Scanned all non-test `src/**/*.ts` files for `TODO|FIXME|XXX|TBD|HACK|PLACEHOLDER` (case-insensitive) — zero matches. Scanned for `return null|return {}|return []|=> {}` — two matches in `planck-world.ts` (`asTag()` and `classifyContact()`), both are legitimate type-guard/classifier functions returning `null` for a non-matching case, not stubs (confirmed by reading surrounding code). No `console.log`-only stub implementations found.

One documentation-level deviation (not a code defect): `01-01-SUMMARY.md` flags TypeScript pinned to `5.9.3` instead of the plan's literal `7.0.2`, with a clear justification citing CLAUDE.md's own documented version-compatibility escape hatch, and explicitly requests ratification ("Open item to ratify"). This verification applies that ratification as a formal override (see frontmatter) rather than treating it as a functional gap, because: (1) CLAUDE.md itself anticipates and sanctions this exact substitution, (2) all downstream gates (`tsc --noEmit`, `eslint`, `vitest`, `build`) pass clean under 5.9.3, and (3) the supply-chain control (exact-pin + committed lockfile) is preserved unchanged, just at a different pinned version.

### Human Verification Required

None outstanding for this verification pass. Two blocking human-verify checkpoints existed in the phase's own plans (01-03 Task 2: sandbox renders/moves/settles; 01-07 Task 3: visibly-weighty fall/settle, D-09 Phase-1 target) — both are `gate="blocking"` tasks that require a typed "approved" before the workflow can proceed to the next task. Both SUMMARYs record operator approval, and the git history shows uninterrupted, atomic commits through all 7 plans culminating in phase completion — consistent with those gates having actually passed (a blocking gate cannot be silently skipped by the execute-phase workflow). No new human-testable claims were introduced beyond what those checkpoints already covered. The final "heavy" verdict is explicitly and correctly deferred to Phase 2 per D-09 (not a Phase-1 gap).

### Gaps Summary

No gaps. All 5 ROADMAP success criteria are independently verified against the actual codebase (source read + commands executed directly, not taken from SUMMARY narrative). All 3 requirement IDs (PHYS-01/02/03) are satisfied with concrete artifact + test evidence. The one documented deviation (TypeScript 5.9.3 vs the plan's 7.0.2) is resolved via a formal override rather than left as an unratified gap, per CLAUDE.md's own precedent.

---

*Verified: 2026-07-15T14:30:00Z*
*Verifier: Claude (gsd-verifier)*
