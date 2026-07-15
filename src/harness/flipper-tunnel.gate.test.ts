import { describe, it, expect } from "vitest";

import { describeFailure, runSoak } from "./soak";
import type { SoakConfig } from "./soak";

/**
 * THE FLIP-04 rotational-anti-tunnel pass/fail gate (D-03) — the phase's headline
 * proof, the flipper analogue of Phase-1's boundary soak gate.
 *
 * It extends the seeded swept-containment soak into a FLIPPER-PRIMARY, two-flipper
 * non-penetration gate: every case drops the ball straight through a flipper's
 * horizontal reach at ~10× the ball's real max velocity while the bat sweeps at
 * the feel-tuned PEAK ω (FLIPPER_UP_SPEED), spreading the seeded per-case flipper
 * PHASE OFFSET densely so some case has the ball arriving mid-sweep at peak
 * angular speed. With the SHIPPING configuration — CCD on (`bullet: true`) AND
 * adaptive angular sub-stepping on (`subStepping: true`, D-01/plan 02-04) — the
 * fast bat can never be swept through the ball: `flipperSweptTunnel` (checked over
 * ALL `getFlippers()` each step) never trips across the whole dense sweep.
 *
 * `flipperNegativeControl` here is the flipper-primary DRIVE MODE (drop straight
 * through the peak-ω bat, boundary-escape check suppressed to isolate the
 * flipper); its name is historical — with the mechanisms ON it is the GREEN gate,
 * asserting `passed === true`. Boundary containment is proven separately by
 * `soak.gate.test.ts`; this gate isolates the FLIP-04 flipper property.
 *
 * Excluded from `npm test` (vitest.config.ts) — runs ONLY via `npm run soak`
 * (vitest.gate.config.ts) so day-to-day tests stay fast. Duration is SIMULATED
 * (headless 120 Hz stepping), so the >=600s floor completes in seconds of real
 * time; density is env-tunable for CI, defaults ARE the full gate.
 */

const DEFAULT_DURATION_SECONDS = 3;
const DEFAULT_CASES = 210; // 210 × 3s = 630s simulated (>= the 600s / 10-min floor)
// ~10× the ball's real max velocity (~6 m/s). At this fling the ball would punch
// straight through the peak-ω bat in a single 120 Hz step WITHOUT the mechanisms
// (see flipper-tunnel.test.ts's sub-stepping teeth control); the gate proves the
// shipping config holds it anyway.
const DEFAULT_MAX_LAUNCH_SPEED = 105;
const DEFAULT_SEED = 0x5eed;

const MIN_SIMULATED_SECONDS = 600; // D-03/D-04 floor: the 10-minute minimum.

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

describe("FLIP-04 gate — >=10-minute flipper-primary peak-ω soak (sub-stepping ON)", () => {
  it(
    "runs >=600s of simulated peak-ω sweep and the fast bat never passes through the ball",
    () => {
      const durationSeconds = envNumber("FLIP04_DURATION", DEFAULT_DURATION_SECONDS);
      const cases = envNumber("FLIP04_CASES", DEFAULT_CASES);
      const maxLaunchSpeed = envNumber("FLIP04_MAXSPEED", DEFAULT_MAX_LAUNCH_SPEED);
      const seed = envNumber("FLIP04_SEED", DEFAULT_SEED);

      // The configured sweep must cover at least the 10-minute simulated floor.
      expect(cases * durationSeconds).toBeGreaterThanOrEqual(MIN_SIMULATED_SECONDS);

      const config: SoakConfig = {
        seed,
        durationSeconds,
        maxLaunchSpeed,
        cases,
        bullet: true, // CCD on — the shipping configuration
        subStepping: true, // adaptive angular sub-stepping on (D-01) — the gate's star
        flipperNegativeControl: true, // flipper-primary drive at peak ω (boundary isolated)
      };

      const result = runSoak(config);

      // Print replayable seeds on any escape so CI logs are actionable.
      for (const failure of result.failures) {
        console.error(describeFailure(failure));
      }

      expect(result.simulatedSeconds).toBeGreaterThanOrEqual(MIN_SIMULATED_SECONDS);
      expect(result.failures).toEqual([]);
      expect(result.passed).toBe(true);
      // Non-vacuous: the full dense sweep actually ran.
      expect(result.casesRun).toBe(cases);
    },
    900_000,
  );
});
