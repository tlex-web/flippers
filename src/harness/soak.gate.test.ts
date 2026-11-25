import { describe, it, expect } from "vitest";

import { describeFailure, runSoak } from "./soak";
import type { SoakConfig } from "./soak";

/**
 * THE tunnel-proof pass/fail gate (D-03) — the phase's headline artifact.
 *
 * Runs the seeded swept-containment soak for >=10 MINUTES of SIMULATED
 * fixed-step (120 Hz) time, sweeping launch angle × speed × flipper phase with
 * speeds PAST the ball's real max velocity, flinging the ball at the thin wall
 * and the max-speed test flipper. With CCD on the ball must NEVER escape; any
 * escape fails the gate and prints the replayable seed(s). This file is
 * EXCLUDED from the default `npm test` (vitest.config.ts) and runs only via
 * `npm run soak` (vitest.gate.config.ts) so day-to-day tests stay fast.
 *
 * Duration is SIMULATED, not wall-clock — headless stepping is fast, so >=600
 * simulated seconds completes in seconds of real time. Density is overridable
 * via env vars for CI tuning; the defaults ARE the full gate (>=600s simulated).
 */

const DEFAULT_DURATION_SECONDS = 3;
const DEFAULT_CASES = 210; // 210 x 3s = 630s simulated (>= the 600s / 10-min floor)
const DEFAULT_MAX_LAUNCH_SPEED = 60; // ~10x the ball's real max velocity (~6 m/s)
const DEFAULT_SEED = 0x5eed;

const MIN_SIMULATED_SECONDS = 600; // D-04 floor: the 10-minute minimum.

/** Minimal `process.env` shape — read without depending on `@types/node`. */
interface ProcessEnvLike {
  readonly env?: Record<string, string | undefined>;
}

function envNumber(name: string, fallback: number): number {
  const proc = (globalThis as { process?: ProcessEnvLike }).process;
  const raw = proc?.env?.[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

describe("soak gate — >=10-minute tunnel-proof soak (CCD on)", () => {
  it("runs >=600s of simulated fixed-step sweep and the ball never escapes", () => {
    const durationSeconds = envNumber("SOAK_DURATION", DEFAULT_DURATION_SECONDS);
    const cases = envNumber("SOAK_CASES", DEFAULT_CASES);
    const maxLaunchSpeed = envNumber("SOAK_MAXSPEED", DEFAULT_MAX_LAUNCH_SPEED);
    const seed = envNumber("SOAK_SEED", DEFAULT_SEED);

    // The configured sweep must cover at least the 10-minute simulated floor.
    expect(cases * durationSeconds).toBeGreaterThanOrEqual(MIN_SIMULATED_SECONDS);

    const config: SoakConfig = {
      seed,
      durationSeconds,
      maxLaunchSpeed,
      cases,
      bullet: true,
    };

    const result = runSoak(config);

    // Print replayable seeds on any escape so CI logs are actionable.
    for (const failure of result.failures) {
      console.error(describeFailure(failure));
    }

    expect(result.simulatedSeconds).toBeGreaterThanOrEqual(MIN_SIMULATED_SECONDS);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
  }, 900_000);
});
