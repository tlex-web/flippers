import { describe, it, expect } from "vitest";

import { runSoak } from "./soak";
import type { SoakConfig, SoakFailure } from "./soak";

/**
 * Proves the tunnel-proof gate is HONEST (D-03/D-04), not a false green. These
 * are the fast, bounded counterparts of the full `npm run soak` gate and DO run
 * in the default `npm test`:
 *
 *   1. Bounded green — with CCD on the ball never escapes a short sweep.
 *   2. Negative control — with CCD OFF (`bullet: false`) a max-velocity launch
 *      at the thin wall DOES tunnel, so `runSoak` reports `passed === false`
 *      with a failure record carrying a numeric seed + full ball/flipper state.
 *   3. Deterministic replay — re-running that logged seed reproduces the exact
 *      same failure (same step, same state), so any escape is diagnosable.
 *
 * (2) is what gives the gate teeth: it demonstrates the swept invariant fires on
 * a REAL tunnel, so a green gate means "no tunneling", not "check never runs".
 */

/** CCD-off negative control: fling past max velocity straight at the thin wall. */
const NEGATIVE_CONTROL: SoakConfig = {
  seed: 0xdead,
  durationSeconds: 4,
  maxLaunchSpeed: 80, // well past the ball's real max (~6 m/s)
  cases: 4,
  bullet: false, // CCD OFF — the whole point of the control
  forceMode: "thin-wall", // aim every case straight at the thin wall
  stopOnFirstFailure: true, // first tunnel is enough; keep the test fast
};

/**
 * CCD-off FLIPPER negative control: drop the ball straight through the fast
 * moving bat at max velocity, sweeping the flipper phase across cases so some
 * case meets a near-horizontal bat and cleanly tunnels it. `flipperNegativeControl`
 * isolates the flipper-swept invariant (it suppresses the boundary check, which a
 * CCD-off ball also trips). This proves the ENHANCED intra-step flipper-swept
 * check has TEETH: it fires on a real dynamic-bat pass-through (D-03), rather than
 * the make-or-break flipper tunnel case leaning on Planck's CCD. The seed/cases
 * are pinned so ≥1 case deterministically produces a flipper tunnel.
 */
const FLIPPER_NEGATIVE_CONTROL: SoakConfig = {
  seed: 0xcafe,
  durationSeconds: 1,
  // Well past the ball's real max (~6 m/s). Retuned 80 -> 105 for the Phase-2
  // FEEL flipper (plan 02-01): the Phase-1 stress bat swept at ~40 rad/s, fast
  // enough that a case's bat could sweep OUT of a straight-down ball's path and
  // leave a clean intra-step tunnel at 80 m/s. The feel bat sweeps slower
  // (setFlipperMotor now maps to FLIPPER_UP_SPEED/RETURN_SPEED, D-05), so instead
  // the control relies on a launch fast enough that the ball clears the bat in a
  // SINGLE 120 Hz step with both endpoints clear of the (radius + halfWidth)
  // band — a genuine straight-through tunnel, robust to bat speed. 105 m/s sits in
  // the clean window (~100–115): slower straddles the bat at the far endpoint,
  // faster at the near one. Still isolates the flipper-swept invariant.
  maxLaunchSpeed: 105,
  cases: 48, // sweeps flipper phase/x so many cases cleanly tunnel the bat
  bullet: false, // CCD OFF — the whole point of the control
  flipperNegativeControl: true, // straight-through-the-bat launch; boundary isolated
};

function firstFailure(failures: readonly SoakFailure[]): SoakFailure {
  const f = failures[0];
  if (!f) throw new Error("expected at least one failure record");
  return f;
}

function firstFlipperFailure(failures: readonly SoakFailure[]): SoakFailure {
  const f = failures.find((x) => x.kind === "flipper");
  if (!f) throw new Error("expected at least one flipper escape record");
  return f;
}

describe("soak gate honesty — bounded green + CCD-off negative control", () => {
  it("bounded green: with CCD on the ball never escapes a short sweep", () => {
    const result = runSoak({
      seed: 0xb0a7,
      durationSeconds: 4,
      maxLaunchSpeed: 60,
      cases: 8,
      bullet: true,
    });

    expect(result.bullet).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    // The sweep actually ran (not a vacuous pass).
    expect(result.casesRun).toBe(8);
    expect(result.simulatedSeconds).toBeGreaterThan(0);
  });

  it("negative control: CCD off + max-velocity launch at the thin wall tunnels (gate goes RED)", () => {
    const result = runSoak(NEGATIVE_CONTROL);

    expect(result.bullet).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);

    const failure = firstFailure(result.failures);

    // A numeric, finite, replayable seed.
    expect(typeof failure.seed).toBe("number");
    expect(Number.isFinite(failure.seed)).toBe(true);

    // Full ball state captured (every field a finite number).
    const b = failure.ballState;
    for (const value of [b.id, b.x, b.y, b.vx, b.vy, b.radius, b.angle]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    // It really tunnelled fast (past the ball's real max velocity).
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(10);

    // Full flipper state captured too (the flipper exists this phase).
    expect(failure.flipperState).not.toBeNull();
    expect(Number.isFinite(failure.flipperState?.angle ?? NaN)).toBe(true);

    // The breach was the (thin) boundary wall it was aimed at.
    expect(failure.kind).toBe("boundary");
  });

  it("deterministic replay: re-running the logged seed reproduces the identical failure", () => {
    const original = firstFailure(runSoak(NEGATIVE_CONTROL).failures);

    // Replay the exact failing case by feeding its logged seed back in.
    const replayed = runSoak({ ...NEGATIVE_CONTROL, seeds: [original.seed] });

    expect(replayed.passed).toBe(false);
    const again = firstFailure(replayed.failures);

    expect(again.seed).toBe(original.seed);
    expect(again.step).toBe(original.step);
    expect(again.kind).toBe(original.kind);
    // Byte-identical ball state at the escape — the loop + PRNG are deterministic.
    expect(again.ballState).toEqual(original.ballState);
    expect(again.flipperState).toEqual(original.flipperState);
  });
});

/**
 * FLIPPER negative control — proves the ENHANCED intra-step flipper-swept check
 * has teeth. The bat rotates ~19°/step, so a naive check against only the bat's
 * POST-step centerline would MISS a ball that passes through where the bat was
 * mid-sweep; the phase gate would then silently lean on Planck's CCD for its
 * headline dynamic-flipper tunnel case (rejected by D-03). With CCD OFF a fast
 * ball dropped straight through the moving bat DOES tunnel it, and the swept
 * check must report `passed === false` with a replayable seed + full state — the
 * flipper analogue of the wall control above.
 */
describe("flipper-swept check honesty — CCD-off flipper negative control", () => {
  it("negative control: CCD off + straight-through launch tunnels the moving bat (enhanced check goes RED)", () => {
    const result = runSoak(FLIPPER_NEGATIVE_CONTROL);

    expect(result.bullet).toBe(false);
    expect(result.passed).toBe(false);
    // At least one case tunnelled the BAT specifically (not a wall).
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
    // It really passed THROUGH the bat fast (past the ball's real max velocity).
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(10);

    // Full flipper state captured — the bat the ball tunnelled.
    expect(failure.flipperState).not.toBeNull();
    expect(Number.isFinite(failure.flipperState?.angle ?? NaN)).toBe(true);
  });

  it("deterministic replay: re-running the logged flipper seed reproduces the identical tunnel", () => {
    const original = firstFlipperFailure(runSoak(FLIPPER_NEGATIVE_CONTROL).failures);

    // Replay the exact failing case by feeding its logged seed back in.
    const replayed = runSoak({ ...FLIPPER_NEGATIVE_CONTROL, seeds: [original.seed] });

    expect(replayed.passed).toBe(false);
    const again = firstFailure(replayed.failures);

    expect(again.seed).toBe(original.seed);
    expect(again.step).toBe(original.step);
    expect(again.kind).toBe("flipper");
    // Byte-identical ball + flipper state at the escape (deterministic loop/PRNG).
    expect(again.ballState).toEqual(original.ballState);
    expect(again.flipperState).toEqual(original.flipperState);
  });
});
