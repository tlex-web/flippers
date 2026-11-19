import { describe, it, expect } from "vitest";

import { OPEN_FIELD_REGION, TABLE_SPEC, BUMPER_RADIUS_M } from "../table/spec";
import { runSoak } from "./soak";
import type { SoakConfig, SoakFailure } from "./soak";

/**
 * The swept-containment soak on the REAL table (D-01: the harness reads the
 * same resolve the fixtures come from). Fast, bounded counterparts of the
 * real-table gate (`table-soak.gate.test.ts`, `npm run soak`); these run in the
 * default `npm test`:
 *
 *   1. Bounded green: with CCD on, the ball never escapes a wall or passes
 *      through either bat on TABLE_SPEC.
 *   2. CCD-off RED control: the same harness goes red on this geometry, so a
 *      green real-table gate means "no tunneling", not "check never runs".
 *   3. Deterministic replay of that failure from its logged seed.
 *   4. Filter exhaustion: a spawn region with no valid origin throws with the
 *      case seed instead of silently skipping (the gate can never go vacuous).
 */

const REAL_TABLE = { table: TABLE_SPEC, originRegion: OPEN_FIELD_REGION } as const;

/** CCD-off control: max-velocity launches at the shortest solid segment. */
const NEGATIVE_CONTROL: SoakConfig = {
  ...REAL_TABLE,
  seed: 0xdead,
  durationSeconds: 4,
  maxLaunchSpeed: 80,
  cases: 4,
  bullet: false,
  forceMode: "thin-wall",
  stopOnFirstFailure: true,
};

function firstFailure(failures: readonly SoakFailure[]): SoakFailure {
  const f = failures[0];
  if (!f) throw new Error("expected at least one failure record");
  return f;
}

describe("table soak — swept containment on TABLE_SPEC", () => {
  it("(1) bounded green: with CCD on the ball never escapes the real table", () => {
    const result = runSoak({
      ...REAL_TABLE,
      seed: 0xb0a7,
      durationSeconds: 4,
      maxLaunchSpeed: 60,
      cases: 8,
      bullet: true,
    });

    expect(result.bullet).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.casesRun).toBe(8);
    expect(result.simulatedSeconds).toBeGreaterThan(0);
  });

  it("(2) CCD-off RED control: a max-velocity launch tunnels a real-table wall", () => {
    const result = runSoak(NEGATIVE_CONTROL);

    expect(result.bullet).toBe(false);
    expect(result.passed).toBe(false);

    const failure = firstFailure(result.failures);
    expect(failure.kind).toBe("boundary");
    expect(typeof failure.seed).toBe("number");
    expect(Number.isFinite(failure.seed)).toBe(true);

    const b = failure.ballState;
    for (const value of [b.id, b.x, b.y, b.vx, b.vy, b.radius, b.angle]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(10);
  });

  it("(3) deterministic replay: the logged seed reproduces the identical failure", () => {
    const original = firstFailure(runSoak(NEGATIVE_CONTROL).failures);
    const replayed = runSoak({ ...NEGATIVE_CONTROL, seeds: [original.seed] });

    expect(replayed.passed).toBe(false);
    const again = firstFailure(replayed.failures);
    expect(again.seed).toBe(original.seed);
    expect(again.step).toBe(original.step);
    expect(again.kind).toBe(original.kind);
    expect(again.ballState).toEqual(original.ballState);
  });

  it("(4) filter exhaustion: a spawn region inside bumper 202 throws with the case seed", () => {
    const bumper = TABLE_SPEC.find((el) => el.id === 202);
    if (!bumper || !("center" in bumper)) throw new Error("bumper 202 missing");
    const half = BUMPER_RADIUS_M / 4; // the whole box sits deep inside the disk
    const inside = {
      minX: bumper.center.x - half,
      maxX: bumper.center.x + half,
      minY: bumper.center.y - half,
      maxY: bumper.center.y + half,
    };

    expect(() =>
      runSoak({
        table: TABLE_SPEC,
        originRegion: inside,
        seed: 0x202,
        durationSeconds: 1,
        maxLaunchSpeed: 60,
        cases: 1,
        bullet: true,
      }),
    ).toThrow(/seed/);
  });
});
