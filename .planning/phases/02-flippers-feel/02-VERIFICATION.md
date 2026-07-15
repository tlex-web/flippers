---
phase: 02-flippers-feel
verified: 2026-07-15T19:30:00Z
status: passed
score: 4/4 ROADMAP success criteria verified (SC1 fixed via 02-GAP-01; SC2/SC3/SC4 confirmed unaffected by the fix and its re-tunes)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/4 (SC2/SC4 verified; SC1 failed; SC3 mechanism-verified but tainted)
  gaps_closed:
    - "Pressing a flipper key raises the corresponding flipper (ROADMAP SC1 / FLIP-01) — the left-flipper raise-direction inversion is fixed"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "By-feel acceptance of the flippers on the live sandbox (D-09, blocking 02-06 checkpoint)"
    expected: "Both flippers visibly raise on their own key press and drop on release; response reads near-instant with no stuck-key/auto-repeat artifacts; a caught ball cradles dead steady with no jitter; the feel reads heavy, not floaty; a tip hit visibly out-launches a base hit."
    result: approved
    resolved: 2026-07-16
    note: "APPROVED by the operator on the live rig (02-06-SUMMARY.md). Two rounds of live-rig feedback were fixed before acceptance: the left-flipper raise-direction inversion (02-GAP-01, commit 6c52beb) and the unusable rig geometry/ball-feed (commit 51536af, symmetric level flippers + single catchable centre-fed ball). D-09 heavy-not-floaty verdict settled."
  - test: "Release jam-lag after a sustained cradle hold"
    expected: "No perceptible stall before the flipper starts returning on release."
    result: accepted
    resolved: 2026-07-16
    note: "~125ms Box2D motor+limit overshoot/jam before the return sweep begins (present since 02-03). Operator accepted it as non-blocking at the 02-06 checkpoint. Functional (the flipper does return); deferred to Phase 6 polish if it ever reads laggy in play."
---

# Phase 2: Flippers & Feel Verification Report

**Phase Goal:** Two keyboard-controlled flippers respond instantly (sub-frame), transfer real rotational momentum (tip hit launches faster than base hit, v = ω × r), hold a jitter-free cradle via an explicit resting → flipping-up → held-up → returning state machine, and can never be passed through — proven and tuned.
**Verified:** 2026-07-15T19:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (commit `6c52beb` "fix(02-01): correct mirrored flipper raise-direction inversion", documented in `02-GAP-01-SUMMARY.md`)

## What Changed Since the Prior Verification

The prior run (`gaps_found`, 2/4) found ONE blocker: `setFlipperMotor(id, +1)` — the exact call `FlipperController.onPressEdge()` issues on every press — raised the right (mirrored) flipper but DROOPED the left, because a body-angle-π mirror preserves rotational handedness rather than reflecting it, so the two mirror-image bats counter-rotate under a uniform motor sign.

The gap-closure fix (`src/physics/planck-world.ts`) adds a per-flipper `raiseSign` captured at `buildFlipper()` time (LEFT id 0 → `-1`, RIGHT id 1 → `+1`) and multiplies it into `setFlipperMotor`'s mapped feel speed. Because the joint's symmetric limits `[-π/8, +π/8]` put each bat's raised position at the *opposite* limit from the other, flipping the sign drives each bat toward its own correct up limit — `+1` now raises BOTH bats, `-1` returns BOTH toward rest. `FlipperController` was **not** touched — it still drives `+1 = raise` uniformly and imports no `planck`, so the fix stays confined to the adapter (D-05), exactly as the gap brief specified. Downstream of the sign fix: the right pivot moved `1.15 → 1.55` (both bats now correctly sweep UP and would otherwise collide — throwaway rig geometry, D-11) and the CCD-off sub-stepping teeth-control speed was re-tuned `96 → 92` (the corrected fast leg now sweeps down-slope, shifting the N=2 tunnel onset).

This re-verification independently re-checked the fix against the live codebase (not the SUMMARY's narrative): read the adapter, controller, and every touched test file; ran the full automated suite fresh; and drove a fresh, verifier-authored runtime probe directly against the real `PlanckWorld` (bypassing all phase-authored tests) to confirm both flippers' true world tip-Y motion under `+1`/`-1` from first principles.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1: Pressing a flipper key raises the corresponding flipper, sub-frame response, no stuck-key/auto-repeat | ✓ **VERIFIED** | **Independent runtime probe** (verifier-authored, `src/physics/_reverify-probe.test.ts`, deleted after use): constructed the real `PlanckWorld` directly, drove each flipper in isolation with `setFlipperMotor(id, -1)` to settle at droop, then `+1` to raise, then `-1` again. LEFT (id 0): tipY 2.8073 (droop) → **2.3937** (raised, Δ −0.4136 m = UP) → 2.8073 (returned). RIGHT (id 1): tipY 2.5573 → **2.1437** (Δ −0.4136 m = UP) → 2.5573. Both flippers now raise on `+1` and return on `-1`, matching the gap-closure summary's claimed measurement (−0.414 m both sides). **Strengthened test suite** (`src/sandbox/flipper-e2e.test.ts`, parametrized over LEFT `KeyZ` and RIGHT `Slash`) independently asserts true world tip-Y direction end-to-end through `FlipperInput → FlipperController → PlanckWorld`, for both sides — passes (`npx vitest run`, both parametrized cases green). `planck-world.smoke.test.ts` asserts the same at the adapter level for both mirrored flippers — passes. Sub-frame response and no-stuck-key/auto-repeat were already verified and remain green (unaffected by this fix; re-confirmed in this run's `npx vitest run`). |
| 2 | ROADMAP SC2: A tip hit launches the ball noticeably faster than a base hit, v=ω·r | ✓ **VERIFIED** (no longer tainted) | `src/harness/flipper-feel.test.ts` now raises with the CORRECT `+1` sign (the same sign the real press issues) instead of the pre-fix `-1` workaround. Re-tuned to a sustained-launch measure (filters the Box2D limit-release burst): tip 5.88 m/s vs base 2.98 m/s, ratio 1.97 vs true contact-radius ratio 1.67 (within the documented 35% tolerance). Passes (`npx vitest run` green, confirmed in this run). |
| 3 | ROADMAP SC3: Catch/cradle a ball on a raised flipper, hold jitter-free, explicit FSM | ✓ **VERIFIED** (no longer tainted) | `flipper-feel.test.ts`'s cradle test holds the flipper UP with the CORRECT `+1` (now genuinely the raised/held-up limit, confirmed by the probe above): settled speed 0, drift 0 (< 1e-3 m), kinetic energy monotonically non-increasing, detector proven to have teeth. Because SC1 is fixed, "catch the ball on a RAISED flipper" now holds as stated for both sides, not just mechanically. Passes (confirmed in this run). |
| 4 | ROADMAP SC4: The fastest possible flip never passes through the ball (rotational CCD) | ✓ **VERIFIED** (holds after re-tune) | `npm run soak` (re-run directly in this verification): 2/2 gates green, including `flipper-tunnel.gate.test.ts` — shipping config (CCD+subStepping ON), seed `0x5eed`, 210 cases × 3s = 630s simulated, `casesRun===210` (non-vacuous), `passed===true`. `npm test` (re-run): the re-tuned CCD-off teeth control (`flipper-tunnel.test.ts`, speed `96→92`) still shows `subStepping:true` → 0 tunnels, `subStepping:false` → tunnels with a replayable seed — the mechanism, not luck, still holds the property after the pivot move and speed re-tune. |
| 5 | PLAN 02-01: Two mirrored capsule flippers, distinct ids, `tipRadius`, restitution 0, feel-speed motor remap, per-flipper raise sign | ✓ VERIFIED | `buildFlipper()` (`src/physics/planck-world.ts` lines 410-486) builds the capsule per flipper and now stores `raiseSign` (LEFT −1, RIGHT +1) in `flipperJoints`; `setFlipperMotor` (lines 660-678) multiplies the mapped feel speed by `entry.raiseSign`. `planck-world.smoke.test.ts` passes with rewritten world-tip-Y assertions for both sides. |
| 6 | PLAN 02-02: Engine-agnostic input module + FlipperController FSM, no planck import | ✓ VERIFIED | `grep -rn 'from "planck"' src/input src/control src/sandbox/main.ts src/sim/loop.ts` returns nothing (re-run in this verification). `grep -rln 'from "planck"' src` returns only `src/physics/planck-world.ts` — engine isolation intact after the fix. `FlipperController` source (read in full) drives `+1 = raise` uniformly with zero knowledge of per-flipper sign, confirming D-05 was honored: the fix lives entirely in the adapter. |
| 7 | PLAN 02-03: End-to-end wiring, onStep hook, ball-feed rig | ✓ VERIFIED | `src/sim/loop.ts` / `src/sandbox/main.ts` unchanged by the fix (not in the gap's `key-files`); `flipper-e2e.test.ts` (re-validated with strengthened world-tip-Y assertions) passes 6/6, now genuinely proving "raises" rather than "moves toward a constant's name". |
| 8 | PLAN 02-04: Adaptive angular sub-stepping | ✓ VERIFIED | `src/physics/substep.test.ts` (6 tests) unaffected and passes; `grep -n 'performance.now\|Date.now'` inside `step()` — none. |
| 9 | PLAN 02-05: FLIP-04 seeded gate + tip-vs-base + jitter-free cradle proofs | ✓ VERIFIED | See truths #2, #3, #4 above — all re-validated against the corrected sign and re-tuned constants. |

**Score:** 4/4 ROADMAP success criteria verified. The phase's stated Core Value — "pressing a flipper key raises the corresponding flipper" — now holds for BOTH flippers, confirmed by an independent runtime probe, the strengthened committed test suite, and a full fresh test run in this verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/physics/types.ts` | `FlipperState.tipRadius`; `setFlipperMotor` doc updated to raise-relative semantics | ✓ VERIFIED | `tipRadius` at line 78; interface doc (lines 116-124) now says "+1 RAISES... applies each flipper's physical raise sign" |
| `src/physics/constants.ts` | Feel constants unchanged in value except re-tune context noted in comments | ✓ VERIFIED | `FLIPPER_UP_SPEED=30`, `FLIPPER_RETURN_SPEED=20`, limits `±π/8` — all as before; the 96→92 re-tune lives in the test file, not here |
| `src/physics/planck-world.ts` | Per-flipper `raiseSign`, symmetric limits, corrected `setFlipperMotor` | ✓ **VERIFIED — bug fixed** | `raiseSign` field on `flipperJoints` (line 287), computed in `buildFlipper` (line 422: `mirror ? 1 : -1`), applied in `setFlipperMotor` (line 676: `speed * entry.raiseSign`). Read in full; matches the gap summary's described approach (a). |
| `src/input/flipper-input.ts` | Engine-agnostic keyboard held-set + edges | ✓ VERIFIED | Untouched by the fix; all unit tests still pass |
| `src/control/flipper-controller.ts` | Explicit FSM, engine-agnostic, uniform `+1=raise` | ✓ **VERIFIED — no longer tainted** | Read in full: unchanged by the fix, still drives `+1`/`-1` uniformly with zero planck import; now correctly reaches the intended physical outcome for both sides because the adapter compensates |
| `src/sandbox/main.ts`, `src/sim/loop.ts` | End-to-end wiring, onStep hook | ✓ VERIFIED | Unchanged by the fix; zero-allocation wiring confirmed unaffected |
| `src/harness/flipper-tunnel.gate.test.ts` | FLIP-04 seeded green gate | ✓ VERIFIED | Ran via `npm run soak` in this verification: 2/2 gates pass |
| `src/harness/flipper-tunnel.test.ts` | Teeth negative control (re-tuned 96→92) + bounded green + replay | ✓ VERIFIED | Ran via `npm test` in this verification: all pass, including the re-tuned isolation test |
| `src/harness/flipper-feel.test.ts` | Tip-vs-base + jitter-free cradle proofs, now using the correct `+1` raise sign | ✓ VERIFIED | Ran via `npm test` in this verification: passes with the sustained-launch measure |
| `src/sandbox/flipper-e2e.test.ts` | Raise/release assertions strengthened to TRUE world tip-Y for both sides | ✓ **VERIFIED — the strengthening requested is present** | Read in full: parametrized over `SIDES = [left/KeyZ, right/Slash]`, asserts `tipY()` (`pivotY + length·sin(angle)`) direction, not "toward the constant named `FLIPPER_UPPER_ANGLE`" — the exact fix the prior verification demanded |
| `src/physics/planck-world.smoke.test.ts` | Motor test rewritten to assert true tip-Y for both mirrored flippers | ✓ **VERIFIED** | Read in full: `"setFlipperMotor: +1 RAISES the tip (world up), -1 returns it down... BOTH mirrored flippers"` iterates both ids with fresh worlds and asserts `tipY()` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `FlipperController.onPressEdge` | `PlanckWorld.setFlipperMotor` | uniform `+1` regardless of flipper id | ✓ **WIRED CORRECTLY (fixed)** | The link still sends a uniform `+1`, but the adapter now applies the correct per-flipper `raiseSign` before reaching the motor, so the physical outcome is correct for both flippers. Confirmed by the independent probe and the strengthened e2e test. |
| `flipper-controller.ts` | `physics/types.ts` | `setFlipperMotor(id, direction)` sign-only | ✓ WIRED | Unchanged; type-only import confirmed |
| `flipper-input.ts` | consumer (`main.ts`) | `drainEdges()` at top of fixed step | ✓ WIRED | Unchanged and unaffected |
| `soak.ts` | `planck-world.ts` | `SoakConfig.subStepping → new PlanckWorld({ subStepping })` | ✓ WIRED | Confirmed via re-run of `npm run soak` |
| `soak.ts` aimed-bat sweep reversal | observed motion direction (not motor sign) | sign-agnostic limit detection | ✓ **VERIFIED sign-agnostic** | Read `soak.ts` lines 403-447: reversal is driven by comparing the OBSERVED `angleDelta` against the named world-angle limits, explicitly documented as independent of the adapter's per-flipper raise sign — confirms the harness did not need to change its aiming logic despite the sign fix |

### Data-Flow Trace (Level 4)

N/A — this is a physics/game-engine phase with no data-fetching UI components; "data flow" here is the physics adapter → FSM → renderer pipeline, which is covered by the Key Link Verification and the independent runtime probe above.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full fast suite | `npx vitest run` | 13 files / 71 tests passed | ✓ PASS |
| FLIP-04 soak gate | `npm run soak` (verbose) | 2/2 gate tests passed (`flipper-tunnel.gate.test.ts`, `soak.gate.test.ts`), each confirmed running (not skipped) | ✓ PASS |
| Type-check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Lint | `npx eslint .` | exit 0 | ✓ PASS |
| Engine isolation | `grep -rn 'from "planck"' src/input src/control src/sandbox/main.ts src/sim/loop.ts` → no matches; `grep -rln 'from "planck"' src` → only `src/physics/planck-world.ts` | confirmed | ✓ PASS |
| **Independent probe: LEFT flipper `+1`/`-1` direction** | verifier-authored runtime probe against the real `PlanckWorld` (not a phase-authored test), deleted after use | droop tipY 2.8073 → raised tipY **2.3937** (Δ −0.414 m, UP) → returned tipY 2.8073 | ✓ **PASS — bug confirmed fixed** |
| **Independent probe: RIGHT flipper `+1`/`-1` direction** | same methodology, id 1 | droop tipY 2.5573 → raised tipY **2.1437** (Δ −0.414 m, UP) → returned tipY 2.5573 | ✓ **PASS — bug confirmed fixed, symmetric with left** |

(Probe test file `src/physics/_reverify-probe.test.ts` was written, run via `npx vitest run`, and deleted immediately after — not part of the committed suite. An earlier draft of the probe produced a spurious "no movement" result due to a bug in the probe's own loop structure, not the codebase; a corrected, simpler version — shown above — reproduced clean, consistent motion in both directions for both flippers.)

### Probe Execution

No `probe-*.sh` scripts exist in this repository/phase (not a migration/tooling phase). N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| FLIP-01 | 02-02, 02-03, 02-GAP-01 | Keyboard control, sub-frame response, no stuck-key/repeat, raises the corresponding flipper | ✓ **SATISFIED** | Sign-inversion bug fixed and independently re-confirmed (probe + strengthened tests); sub-frame response and repeat-suppression unaffected and still green |
| FLIP-02 | 02-01, 02-05 | Correct rotational momentum transfer, tip > base | ✓ **SATISFIED** | Now reachable via the real `+1` press path (not a workaround); tip/base ratio proof passes |
| FLIP-03 | 02-02, 02-05 | Catch/cradle steady, no jitter, explicit FSM | ✓ **SATISFIED** | "Raised flipper" semantic now correct for both sides; jitter-free hold-into-limit mechanism unaffected |
| FLIP-04 | 02-04, 02-05 | Fast flipper never passes through the ball | ✓ **SATISFIED** | Green shipping-config gate + re-tuned teeth negative control, both re-run in this verification |

REQUIREMENTS.md marks all four `[x] Complete` for Phase 2 (lines 18-21, 103-106), consistent with this verification. No orphaned requirements.

### Anti-Patterns Found

None. `grep` for `TBD|FIXME|XXX|HACK|PLACEHOLDER|not yet implemented|coming soon` across `src/physics src/input src/control src/sandbox src/harness src/sim` (re-run in this verification) returns no real debt markers in the touched files. No stub returns, no empty handlers, no hardcoded empty data flowing to render paths. The gap-closure diff is scoped exactly to what the fix brief and its documented, justified deviations describe (right pivot move + teeth speed re-tune, both explained and re-validated).

---

## Assessment: SC1 Blocker — RESOLVED

The prior BLOCKER (`setFlipperMotor(id, +1)` raising the right flipper but drooping the left) is confirmed fixed by three independent lines of evidence gathered in THIS verification, not by trusting `02-GAP-01-SUMMARY.md`'s narrative:

1. **A fresh, verifier-authored runtime probe** constructed against the real `PlanckWorld` (bypassing every phase-authored test file) shows both flippers moving their tip UP (smaller world-Y) under `+1` and DOWN under `-1`, by a symmetric ~0.414 m sweep matching the gap summary's own claimed measurement.
2. **The strengthened committed tests** (`flipper-e2e.test.ts`, `planck-world.smoke.test.ts`) assert true world tip-Y direction — not "toward the constant named `FLIPPER_UPPER_ANGLE`" (the exact assertion weakness the prior verification flagged) — for BOTH the left and right flipper, and all pass in a fresh run.
3. **Source inspection** of `planck-world.ts` confirms the fix mechanism matches its documentation: a per-flipper `raiseSign` captured at build time, multiplied into the motor speed, with `FlipperController` left completely untouched (still uniform `+1=raise`, zero `planck` import) — honoring the engine-isolation principle (D-05) the fix brief required.

FLIP-04 was re-validated after its knock-on re-tunes (pivot move, 96→92 speed change): both the shipping-config gate and the CCD-off teeth control still pass/fail correctly in a direct re-run, confirming the re-tune did not silently weaken the anti-tunnel proof.

## Gaps Summary

None remaining. All four ROADMAP success criteria are now verified against the live codebase via independent evidence (not SUMMARY claims): a fresh runtime probe, a full re-run of the automated suite (`npx vitest run` 71/71, `npm run soak` 2/2, `tsc --noEmit` clean, `eslint .` clean), and direct reading of every file the gap-closure fix touched.

The only remaining step is the phase's designed, always-required human by-feel acceptance checkpoint (`02-06-PLAN.md`, `checkpoint:human-verify`, `gate: blocking`, D-09) — this was never an automated gap; it is the planned capstone verification for a phase whose Core Value is felt, not just measured. No `02-06-SUMMARY.md` exists yet, so this checkpoint has not run. Per this re-verification's explicit scope, status is set to `passed` because all four automated success criteria now verify and the by-feel checkpoint is the only remaining item — listed under Human Verification Required below, alongside the pre-existing, non-blocking release jam-lag feel item carried over from the initial verification (unaffected by this fix's scope).

---

## Human Verification Required

### 1. By-feel acceptance of the flippers on the live sandbox (D-09, blocking 02-06 checkpoint)

**Test:** Run `npm run dev`, play the live sandbox, and walk through `02-06-PLAN.md`'s five acceptance criteria: response (FLIP-01), no stuck-key/auto-repeat (FLIP-01), steady cradle (FLIP-03), heavy-not-floaty weight (D-09), and tip-out-launches-base by eye (FLIP-02).
**Expected:** Both flippers visibly raise on their own key press and drop on release; response reads near-instant; a caught ball cradles dead steady with no jitter; the feel reads heavy, not floaty; a tip hit visibly out-launches a base hit.
**Why human:** This is a designed blocking human-verify checkpoint (visual/feel judgment cannot be automated) that Phase 1 explicitly deferred here (D-09). All four automated success criteria are now verified in the codebase — this is the intended final step to close the phase, not a defect.

### 2. Release jam-lag after a sustained cradle hold

**Test:** Hold a flipper key for several seconds (full cradle hold), then release, and judge whether the return feels laggy.
**Expected:** No perceptible stall before the flipper begins returning.
**Why human:** Carried over from the initial verification — a probed ~125ms Box2D motor+limit overshoot/jam flagged since 02-03. Not part of the SC1 fix's scope (the fix did not touch return-side torque/limit tuning) and not re-measured in this re-verification. Functional but a feel/timing judgment call for the 02-06 checkpoint.

---

*Verified: 2026-07-15T19:30:00Z*
*Verifier: Claude (gsd-verifier)*
