import { describe, it, expect } from "vitest";

import { OPEN_FIELD_REGION, TABLE_SPEC } from "../table/spec";
import { describeFailure, runSoak } from "./soak";
import type { SoakConfig } from "./soak";

/**
 * The REAL-TABLE tunnel-proof gate (D-01, T-03-07): the same seeded
 * swept-containment soak as `soak.gate.test.ts`, run on TABLE_SPEC's seams,
 * arcs and pockets with origins drawn from OPEN_FIELD_REGION. With CCD on the
 * ball must never escape a wall, enter a bumper, or pass through either bat over >= 600
 * SIMULATED seconds at ~10x its real max speed. Excluded from `npm test`; runs
 * under `npm run soak` (vitest.gate.config.ts). Env vars override density for
 * CI tuning; the defaults ARE the full gate.
 *
 * A red run means the spec has a seam gap, a narrow wedge or a coarse arc
 * chord: fix the geometry, never the invariant, CONTACT_SLOP or the speeds.
 */

const DEFAULT_DURATION_SECONDS = 3;
const DEFAULT_CASES = 210; // 210 x 3s = 630s simulated (>= the 600s floor)
const DEFAULT_MAX_LAUNCH_SPEED = 60; // ~10x the ball's real max velocity
const DEFAULT_SEED = 0x5eed;

const MIN_SIMULATED_SECONDS = 600;

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

describe("table soak gate — >=10-minute tunnel-proof soak on TABLE_SPEC (CCD on)", () => {
  it("runs >=600s of simulated sweep on the real table and the ball never escapes", () => {
    const durationSeconds = envNumber("TABLE_SOAK_DURATION", DEFAULT_DURATION_SECONDS);
    const cases = envNumber("TABLE_SOAK_CASES", DEFAULT_CASES);
    const maxLaunchSpeed = envNumber("TABLE_SOAK_MAXSPEED", DEFAULT_MAX_LAUNCH_SPEED);
    const seed = envNumber("TABLE_SOAK_SEED", DEFAULT_SEED);

    expect(cases * durationSeconds).toBeGreaterThanOrEqual(MIN_SIMULATED_SECONDS);

    const config: SoakConfig = {
      table: TABLE_SPEC,
      originRegion: OPEN_FIELD_REGION,
      seed,
      durationSeconds,
      maxLaunchSpeed,
      cases,
      bullet: true,
    };

    const result = runSoak(config);

    for (const failure of result.failures) {
      console.error(describeFailure(failure));
    }

    expect(result.simulatedSeconds).toBeGreaterThanOrEqual(MIN_SIMULATED_SECONDS);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.casesRun).toBe(cases);
  }, 900_000);
});
