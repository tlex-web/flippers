---
phase: 02-flippers-feel
gap: 01
subsystem: physics
tags: [planck, flipper, mirror, raise-direction, D-05, gap-closure]
closes: "02-VERIFICATION.md gap SC1/FLIP-01 (BLOCKER): mirrored raise-direction inversion"

requires:
  - 02-05-SUMMARY.md (phase implementation) + 02-VERIFICATION.md (bug diagnosis)
provides:
  - "Per-flipper physical raise sign in PlanckWorld.setFlipperMotor so +1 raises BOTH bats (world tip UP)"
  - "setFlipperMotor contract redefined: +1 = RAISE toward up limit, -1 = RETURN toward rest/down limit (raise-relative, not angle-relative)"
  - "World-direction assertions (tip world-Y) for both left AND right flippers in the smoke + e2e proofs"
affects: [02-06 (human by-feel checkpoint, now unblocked), 03-table-layout]

key-files:
  modified:
    - src/physics/planck-world.ts
    - src/physics/types.ts
    - src/harness/soak.ts
    - src/physics/planck-world.smoke.test.ts
    - src/sandbox/flipper-e2e.test.ts
    - src/harness/flipper-feel.test.ts
    - src/harness/flipper-tunnel.test.ts

approach: "(a) per-flipper raise sign captured at build time; symmetric limits already make the correct (opposite) limit the raised one for each bat"
completed: 2026-07-15
---

# Phase 2 Gap 01: Mirrored Flipper Raise-Direction Inversion — Fix

**One-liner:** Corrected the confirmed BLOCKER where `setFlipperMotor(id, +1)` (the FSM's "raise" command) raised the right flipper but DROOPED the left, by folding a per-flipper physical raise sign into `PlanckWorld.setFlipperMotor` (D-05) so `+1` raises BOTH mirror-image bats toward their up limit — then re-validated raise direction against TRUE world tip-Y for both sides.

## Root Cause

The right flipper is built mirrored via a **body-angle-π rotation** with reference-relative joint limits (02-01). A body-angle-π rotation **preserves rotational handedness rather than reflecting it**, so a POSITIVE joint speed (increasing angle) sweeps the un-mirrored left tip toward +y (DOWN/droop) but the mirrored right tip toward −y (UP/raise). The two mirror-image bats therefore **counter-rotate** and require **opposite** motor signs to both raise. `setFlipperMotor` applied the SAME sign to both. 02-01-SUMMARY anticipated this ("the controller will map each side's raise input to the appropriate sign") but the compensation was never implemented anywhere.

Confirmed empirically (matches 02-VERIFICATION probe): pre-fix `setFlipperMotor(id, +1)` gave left tip world-Y **+0.207 m** (down) and right **−0.207 m** (up). Post-fix both give **−0.414 m** (up).

## The Fix — Approach (a): per-flipper raise sign in the adapter

- `buildFlipper` now stores `raiseSign = mirror ? +1 : -1` per flipper (the engine-specific bit, kept in the adapter per D-05).
- `setFlipperMotor(id, direction)` multiplies the mapped feel speed by that bat's `raiseSign`:
  - LEFT (raiseSign −1): `+1` → `−FLIPPER_UP_SPEED` → sweeps to the LOWER limit = its raised/up position; `−1` → `+FLIPPER_RETURN_SPEED` → UPPER limit = its rest/down position.
  - RIGHT (raiseSign +1): `+1` → `+FLIPPER_UP_SPEED` → UPPER limit = raised; `−1` → LOWER limit = rest.
- Because the limits are **symmetric `[−π/8, +π/8]`** and each bat's raised position IS the opposite limit from the other, flipping the sign drives each bat toward the CORRECT limit — `+1` = up/held-up cradle, `−1` = rest/down — for BOTH bats. No naive-flip-toward-the-wrong-limit case (the objective's failure mode is avoided precisely because the symmetric limits make "the other limit" the physically correct raised stop).
- `FlipperController` is unchanged: it still drives `+1 = raise` engine-agnostically and imports no planck (engine isolation intact). The `setFlipperMotor` interface doc (`types.ts`) was updated from angle-relative ("+1 toward the upper limit") to raise-relative ("+1 RAISES toward the up limit; the adapter applies each flipper's physical raise sign").

### Rig geometry deviation (Rule 3 — blocking, D-11 throwaway scaffold)

Correcting the sign made BOTH bats raise UP; at the old right pivot `(1.15, 2.35)` the right bat's leftward reach then overlapped the left bat's now-UP raised arc — they collided, and the left bat's tip ball sat inside the right bat (breaking the e2e one-sided and feel launch proofs). Moved the right pivot **`1.15 → 1.55`** so its leftmost reach (≈ x 1.02) clears the left bat's raised tip (≈ x 0.88), keeping the arc left of the fall column and clear of the Phase-1 resting balls. This is throwaway-rig geometry (D-11); stability/soak leave the right bat at its construction-default position and are unaffected.

## Validation — all green

- **Raise direction (the crux), true world tip-Y, BOTH sides:**
  - `planck-world.smoke.test.ts`: rewrote the motor test to assert `+1` lifts the tip (world −y) and `−1` drops it, at the feel speeds, for BOTH mirrored flippers (fresh world per flipper). No longer asserts "toward the constant named FLIPPER_UPPER_ANGLE".
  - `flipper-e2e.test.ts`: rewrote raise/release to assert the TIP world-Y goes UP on a press edge and DOWN on release, parametrized over LEFT (`KeyZ`) AND RIGHT (`Slash`) — the mirrored side is now exercised. One-sided isolation kept.
- **v = ω·r feel (`flipper-feel.test.ts`):** raise now uses the CORRECT sign `+1` (removed the `−1` workaround). Because `+1` raises at `FLIPPER_UP_SPEED`(30) the bat's Box2D limit-release burst inflates the raw-max launch equally for tip and base (collapsing the ratio); switched to a SUSTAINED-launch measure (max speed held ≥3 steps) against the TRUE contact radius. Result: tip 5.88 vs base 2.98 (ratio 1.97) matches the true contact-radius ratio 1.67 within tolerance — a clean v = ω·r.
- **FLIP-04 gate + teeth (`flipper-tunnel.test.ts`, `npm run soak`):** the aimed-bat soak sweep was rewritten to reverse just BEFORE a limit from the OBSERVED motion direction vs the named limits (sign-agnostic; no jam), avoiding a limit-release burst that would defeat the sub-stepping. The CCD-off teeth speed was re-tuned `96 → 92` (the corrected fast leg now sweeps down-slope, shifting the N=2 onset) — measured clean window 89–95 (ON 0/32, OFF 32/32), an even stronger teeth proof.
- `npx tsc --noEmit` → 0 · `npx eslint .` → 0 · `npx vitest run` → **71/71** · `npm run soak` → **2/2 gates** (FLIP-04 peak-ω 630s simulated + boundary).
- Engine isolation preserved: `planck` still imported only in `planck-world.ts`; zero per-frame/per-step allocation, D-01 sub-stepping + off-switch, debug renderer reading true angles all untouched.

## Deviations from the fix brief

- Chose approach (a) (per-flipper sign) over (b) (geometric mirror): approach (b) ("same motor sign raises both") is **physically impossible** for two mirror-image flippers — they counter-rotate under Planck's shared CCW-positive joint-angle convention, so opposite motor signs are intrinsic; the correct place for that per-flipper sign is the adapter (D-05).
- Extra files beyond the brief's fix site: `flipper-tunnel.test.ts` (teeth re-calibration) and the right-flipper pivot in `planck-world.ts` — both direct, documented consequences of the corrected raise direction, not scope creep.

## Self-Check: PASSED
- All modified files present; changes compile, lint, and test green (71/71 + 2/2 gates).
- Post-fix probe confirms `+1` raises BOTH flippers (left & right tip world-Y −0.414 m).
- `.planning/config.json` left untouched.
