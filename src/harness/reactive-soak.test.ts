import { describe, it, expect, vi } from "vitest";

import { OPEN_FIELD_REGION } from "../table/spec";
import { ReactiveSoakWorld } from "./reactive-world";
import { runSoak } from "./soak";
import type { SoakConfig, SoakFailure } from "./soak";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * The swept-containment soak on the real table with the Phase-4 rules LIVE
 * (every bumper and slingshot contact kicks). Fast, bounded counterparts of
 * the rules-live gate (`reactive-table-soak.gate.test.ts`, `npm run soak`);
 * these run in the default `npm test`:
 *
 *   1. Bounded green: with CCD on, kicks never let the ball escape a wall,
 *      enter a bumper or pass through a bat, and the run is non-vacuous
 *      (kicks > 0).
 *   2. CCD-off RED control: the same rules-wrapped world goes red on a
 *      real-table wall, so a green rules-live gate can fail.
 *   3. Deterministic replay of that failure from its logged seed.
 *
 * The rules join the soak only through `SoakConfig.makeWorld`; soak.ts is
 * unchanged.
 */

/** A `makeWorld` that keeps every world it builds so a run's kicks can be summed. */
function tallyingFactory(): {
  readonly makeWorld: (options: { readonly bullet: boolean }) => ReactiveSoakWorld;
  kicks(): number;
} {
  const worlds: ReactiveSoakWorld[] = [];
  return {
    makeWorld: (options) => {
      const world = new ReactiveSoakWorld(options);
      worlds.push(world);
      return world;
    },
    kicks: () => worlds.reduce((sum, w) => sum + w.kicks, 0),
  };
}

/** CCD-off control: max-velocity launches at the shortest solid segment. */
const NEGATIVE_CONTROL: Omit<SoakConfig, "makeWorld"> = {
  originRegion: OPEN_FIELD_REGION,
  seed: 0xdead,
  durationSeconds: 4,
  maxLaunchSpeed: 80,
  cases: 4,
  bullet: false,
  forceMode: "thin-wall",
  stopOnFirstFailure: false,
};

function firstBoundaryFailure(failures: readonly SoakFailure[]): SoakFailure {
  const f = failures.find((x) => x.kind === "boundary");
  if (!f) throw new Error("expected at least one boundary failure record");
  return f;
}

describe("reactive soak — swept containment on TABLE_SPEC with every kick live", () => {
  it("(1) bounded green: with CCD on, kicks never break containment and do fire", () => {
    const tally = tallyingFactory();
    const result = runSoak({
      originRegion: OPEN_FIELD_REGION,
      makeWorld: tally.makeWorld,
      seed: 0x0404,
      durationSeconds: 4,
      maxLaunchSpeed: 60,
      cases: 8,
      bullet: true,
    });

    expect(result.bullet).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.casesRun).toBe(8);
    expect(tally.kicks()).toBeGreaterThan(0);
  });

  it("(2) CCD-off RED control: the rules-wrapped world tunnels a real-table wall", () => {
    const tally = tallyingFactory();
    const result = runSoak({ ...NEGATIVE_CONTROL, makeWorld: tally.makeWorld });

    expect(result.bullet).toBe(false);
    expect(result.passed).toBe(false);

    const failure = firstBoundaryFailure(result.failures);
    expect(failure.kind).toBe("boundary");
    expect(typeof failure.seed).toBe("number");
    expect(Number.isFinite(failure.seed)).toBe(true);
  });

  it("(3) deterministic replay: the logged seed reproduces the identical failure", () => {
    const original = firstBoundaryFailure(
      runSoak({ ...NEGATIVE_CONTROL, makeWorld: tallyingFactory().makeWorld }).failures,
    );
    const replayed = runSoak({
      ...NEGATIVE_CONTROL,
      makeWorld: tallyingFactory().makeWorld,
      seeds: [original.seed],
    });

    expect(replayed.passed).toBe(false);
    const again = replayed.failures[0];
    if (!again) throw new Error("replay produced no failure");
    expect(again.seed).toBe(original.seed);
    expect(again.kind).toBe(original.kind);
    expect(again.step).toBe(original.step);
    expect(again.ballState).toEqual(original.ballState);
  });
});
