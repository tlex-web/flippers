import { describe, it, expect } from "vitest";

import { OPEN_FIELD_REGION } from "../table/spec";
import { ReactiveSoakWorld } from "./reactive-world";
import { describeFailure, runSoak } from "./soak";
import type { SoakConfig } from "./soak";

/**
 * The RULES-LIVE real-table tunnel-proof gate (ELEM-01/ELEM-02, T-04-09): the
 * same seeded swept-containment soak as `table-soak.gate.test.ts`, on
 * TABLE_SPEC with origins drawn from OPEN_FIELD_REGION, but every world is a
 * `ReactiveSoakWorld`, so every bumper and slingshot contact kicks the ball.
 * The rules join through `SoakConfig.makeWorld`; soak.ts stays unchanged.
 * With CCD on the ball must never escape a wall, enter a bumper, or pass
 * through a bat over >= 600 SIMULATED seconds at ~10x its real max speed, and
 * the kicks must actually fire (summed kicks > 0), so the green is never
 * vacuous. The ball save is armed on every post overlap (the
 * `ReactiveSoakWorld` default, plan 06-14, D-10), so center-post kickbacks
 * join the stress, and they must fire too (summed postKicks > 0). Excluded
 * from `npm test`; runs under `npm run soak`. Env vars override density for
 * CI tuning; the defaults ARE the full gate.
 *
 * A red run means a kick or the table geometry lets the ball tunnel: fix the
 * rules or the spec, never the invariant or the speeds.
 *
 * Like the table gate, only flipper 0 is swept here. Rotational coverage of
 * both bats comes from the PROOF_BOX_SPEC FLIP-04 gate. 03-REVIEW IN-04 is
 * deferred because sweeping per-seed bats would mean editing soak.ts, which
 * stays untouched.
 */

const DEFAULT_DURATION_SECONDS = 3;
const DEFAULT_CASES = 210; // 210 x 3s = 630s simulated (>= the 600s floor)
const DEFAULT_MAX_LAUNCH_SPEED = 60; // ~10x the ball's real max velocity
const DEFAULT_SEED = 0x5eed04;

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

describe("reactive table soak gate — >=10-minute tunnel-proof soak with kicks live (CCD on)", () => {
  it(
    "runs >=600s of simulated sweep with every kick live and the ball never escapes",
    () => {
      const durationSeconds = envNumber("REACTIVE_SOAK_DURATION", DEFAULT_DURATION_SECONDS);
      const cases = envNumber("REACTIVE_SOAK_CASES", DEFAULT_CASES);
      const maxLaunchSpeed = envNumber("REACTIVE_SOAK_MAXSPEED", DEFAULT_MAX_LAUNCH_SPEED);
      const seed = envNumber("REACTIVE_SOAK_SEED", DEFAULT_SEED);

      expect(cases * durationSeconds).toBeGreaterThanOrEqual(MIN_SIMULATED_SECONDS);

      const worlds: ReactiveSoakWorld[] = [];
      const config: SoakConfig = {
        originRegion: OPEN_FIELD_REGION,
        makeWorld: (options) => {
          const world = new ReactiveSoakWorld(options);
          worlds.push(world);
          return world;
        },
        seed,
        durationSeconds,
        maxLaunchSpeed,
        cases,
        bullet: true,
      };

      const result = runSoak(config);
      const kicks = worlds.reduce((sum, w) => sum + w.kicks, 0);
      const postKicks = worlds.reduce((sum, w) => sum + w.postKicks, 0);

      for (const failure of result.failures) {
        console.error(describeFailure(failure));
      }

      expect(result.simulatedSeconds).toBeGreaterThanOrEqual(MIN_SIMULATED_SECONDS);
      expect(result.failures).toEqual([]);
      expect(result.passed).toBe(true);
      expect(result.casesRun).toBe(cases);
      expect(kicks).toBeGreaterThan(0);
      // The always-armed ball save kicked off the center post (D-10).
      expect(postKicks).toBeGreaterThan(0);
    },
    900_000,
  );
});
