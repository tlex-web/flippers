import { describe, it, expect, vi } from "vitest";

import { runSoak } from "./soak";
import type { SoakConfig, SoakFailure } from "./soak";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * FLIP-04 honesty tests — the fast, bounded counterparts of the full
 * `npm run soak` FLIP-04 gate, that DO run in the default `npm test`:
 *
 *   1. Bounded GREEN — the shipping config (CCD on + sub-stepping on) drives the
 *      flipper at PEAK ω and flings the ball straight through it; no bat ever
 *      sweeps through the ball across a short seeded sweep.
 *   2. SUB-STEPPING TEETH — the adaptive angular sub-stepping mechanism (D-01) is
 *      shown to actually HOLD the flipper non-penetration property: with it OFF a
 *      seeded case tunnels a FLIPPER; with it ON (same config) none do. A green
 *      gate therefore means "the mechanism holds it", not "the check never fires".
 *   3. Deterministic REPLAY — re-running the logged flipper seed reproduces the
 *      identical failure (same step, byte-identical ball + flipper state).
 *
 * ── Why the teeth control turns CCD OFF (bullet:false) to isolate sub-stepping ──
 *
 * The plan's first design toggled sub-stepping with `bullet` LEFT ON. Calibration
 * proved that is VACUOUS in this rig: `flipperSweptTunnel` only registers a
 * pass-through when the ball's per-step chord spans both sides of the (radius +
 * tipRadius ≈ 0.27 m) capsule band — i.e. a ball moving faster than ~96 m/s — and
 * Planck's translational CCD (`bullet:true`) catches EVERY such ball regardless of
 * sub-stepping (measured: 0 flipper tunnels at every speed 60–160 m/s, both
 * sub-stepping ON and OFF). At the feel-tuned peak ω=30 the bat tip travels only
 * ω·L·dt = 30·0.5/120 ≈ 0.125 m per 120 Hz step — it physically CANNOT skip the
 * huge 0.2 m ball rotationally — so no `bullet:true` case ever tunnels, and a
 * `bullet:true` "teeth" control would be a false green (it proves CCD, not the
 * sub-stepping mechanism the gate exists to validate).
 *
 * To isolate the SUB-STEPPING mechanism we therefore hold CCD OFF in BOTH arms of
 * the control and vary ONLY `subStepping`. With CCD off the ball's translation is
 * unprotected, so the D-01 sub-step count N = ceil(ω·L·dt / (0.5·r)) = 2 at peak
 * ω becomes load-bearing: N=2 adds a mid-step narrow-phase sample that catches the
 * ball straddling the bat, whereas N=1 (sub-stepping OFF) lets the full chord clear
 * both sides of the bat in one uninterrupted step → a genuine rotational-era
 * pass-through. Because CCD is off in BOTH runs, the ONLY differentiator is
 * sub-stepping — a STRICTER proof of its teeth than the original design (which we
 * now know CCD would have masked). This is a documented deviation from the plan's
 * "bullet left true" wording, made to satisfy its explicit intent: "prove the
 * mechanism has teeth" (threat T-02-10).
 *
 * The launch speed (92 m/s) sits in the tunnel window so N=2's extra sample cleanly
 * closes it (0 tunnels) while N=1 opens it (deterministic tunnels). It was retuned
 * 96 → 92 (gap 01): correcting the mirror raise sign made the aimed bat's FAST leg
 * (FLIPPER_UP_SPEED) sweep DOWN-slope instead of up, shifting the N=2 onset down to
 * ~96; 92 sits safely inside the clean 89–95 window (measured ON=0, OFF=32/32).
 */

const TEETH_SEED = 0xf11;
const TEETH_SPEED = 92; // in the tunnel window: N=2 closes it, N=1 opens it
const TEETH_CASES = 32; // pinned: OFF yields 32/32 flipper tunnels, ON yields 0

/**
 * The shared sub-stepping teeth base: flipper-primary drive (drop the ball
 * straight through the peak-ω bat, boundary check suppressed to isolate the
 * flipper) with CCD OFF. Only `subStepping` differs between the two arms.
 */
const TEETH_BASE: SoakConfig = {
  seed: TEETH_SEED,
  durationSeconds: 1,
  maxLaunchSpeed: TEETH_SPEED,
  cases: TEETH_CASES,
  bullet: false, // CCD off in BOTH arms → sub-stepping is the sole differentiator
  flipperNegativeControl: true, // flipper-primary straight-through drive at peak ω
};

const SUBSTEP_ON: SoakConfig = { ...TEETH_BASE, subStepping: true };
const SUBSTEP_OFF: SoakConfig = { ...TEETH_BASE, subStepping: false };

function flipperFailures(failures: readonly SoakFailure[]): SoakFailure[] {
  return failures.filter((f) => f.kind === "flipper");
}

function firstFlipperFailure(failures: readonly SoakFailure[]): SoakFailure {
  const f = failures.find((x) => x.kind === "flipper");
  if (!f) throw new Error("expected at least one flipper escape record");
  return f;
}

describe("FLIP-04 bounded green — shipping config holds the peak-ω fling", () => {
  it("CCD + sub-stepping ON: the fast bat never passes through the ball (short sweep)", () => {
    const result = runSoak({
      seed: 0xb0a7,
      durationSeconds: 1,
      maxLaunchSpeed: 105, // same ~10× fling as the full gate
      cases: 12,
      bullet: true,
      subStepping: true,
      flipperNegativeControl: true,
    });

    expect(result.bullet).toBe(true);
    expect(result.passed).toBe(true);
    expect(flipperFailures(result.failures)).toEqual([]);
    // Non-vacuous: the sweep actually ran.
    expect(result.casesRun).toBe(12);
    expect(result.simulatedSeconds).toBeGreaterThan(0);
  });
});

describe("FLIP-04 sub-stepping teeth — the mechanism holds it, RED when forced OFF", () => {
  it("sub-stepping ON (CCD off) holds the flipper: no case tunnels", () => {
    const result = runSoak(SUBSTEP_ON);

    // With CCD off, sub-stepping ALONE (N=2 at peak ω) closes the tunnel.
    expect(result.passed).toBe(true);
    expect(flipperFailures(result.failures)).toEqual([]);
    expect(result.casesRun).toBe(TEETH_CASES);
  });

  it("sub-stepping OFF (CCD off) tunnels the moving bat with a replayable seed + full state (gate goes RED)", () => {
    const result = runSoak(SUBSTEP_OFF);

    expect(result.bullet).toBe(false);
    expect(result.passed).toBe(false);
    // At least one case tunnelled a FLIPPER specifically (not a wall — the
    // boundary check is suppressed in this flipper-primary drive).
    expect(result.failures.some((f) => f.kind === "flipper")).toBe(true);

    const failure = firstFlipperFailure(result.failures);
    expect(failure.kind).toBe("flipper");

    // A numeric, finite, replayable seed.
    expect(typeof failure.seed).toBe("number");
    expect(Number.isFinite(failure.seed)).toBe(true);

    // Full ball state captured (every field a finite number).
    const b = failure.ballState;
    for (const value of [b.id, b.x, b.y, b.vx, b.vy, b.radius, b.angle]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    // It really passed THROUGH the bat fast (past the ball's real max ~6 m/s).
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(10);

    // Full flipper state captured — the bat the ball tunnelled.
    expect(failure.flipperState).not.toBeNull();
    expect(Number.isFinite(failure.flipperState?.angle ?? NaN)).toBe(true);
    for (const value of [
      failure.flipperState?.pivotX ?? NaN,
      failure.flipperState?.pivotY ?? NaN,
      failure.flipperState?.length ?? NaN,
      failure.flipperState?.halfWidth ?? NaN,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("isolation: only sub-stepping flips the outcome — CCD is off in BOTH arms, and with CCD ON the same fling stays green", () => {
    // The two arms differ ONLY in `subStepping` (CCD off in both), yet ON holds
    // it and OFF tunnels — so sub-stepping, not CCD or luck, is the mechanism.
    const on = runSoak(SUBSTEP_ON);
    const off = runSoak(SUBSTEP_OFF);
    expect(on.passed).toBe(true);
    expect(off.passed).toBe(false);
    expect(flipperFailures(off.failures).length).toBeGreaterThan(
      flipperFailures(on.failures).length,
    );

    // And the reason the control must turn CCD OFF to see this: with CCD ON,
    // Planck's translational CCD catches the fling regardless of sub-stepping, so
    // even sub-stepping OFF stays green (a bullet:true "teeth" control would be a
    // false green — it would prove CCD, not the sub-stepping mechanism).
    const ccdOnSubstepOff = runSoak({
      ...TEETH_BASE,
      bullet: true,
      subStepping: false,
    });
    expect(ccdOnSubstepOff.passed).toBe(true);
    expect(flipperFailures(ccdOnSubstepOff.failures)).toEqual([]);
  });

  it("deterministic replay: re-running the logged flipper seed reproduces the identical tunnel", () => {
    const original = firstFlipperFailure(runSoak(SUBSTEP_OFF).failures);

    // Replay the exact failing case by feeding its logged seed back in.
    const replayed = runSoak({ ...SUBSTEP_OFF, seeds: [original.seed] });

    expect(replayed.passed).toBe(false);
    const again = firstFlipperFailure(replayed.failures);

    expect(again.seed).toBe(original.seed);
    expect(again.step).toBe(original.step);
    expect(again.kind).toBe("flipper");
    // Byte-identical ball + flipper state at the escape (deterministic loop/PRNG).
    expect(again.ballState).toEqual(original.ballState);
    expect(again.flipperState).toEqual(original.flipperState);
  });
});
