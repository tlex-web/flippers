import { describe, it, expect } from "vitest";

import { mulberry32 } from "../harness/prng";
import {
  GAIN_FLOOR_DB,
  playbackSemitones,
  semitoneRatio,
  strengthToGain,
} from "./mapping";

describe("strengthToGain (perceptual loudness, AUD-01)", () => {
  it("maps strength 0 to the -18 dB floor and strength 1 to unity", () => {
    expect(GAIN_FLOOR_DB).toBe(-18);
    expect(strengthToGain(0)).toBeCloseTo(Math.pow(10, -18 / 20), 12);
    expect(strengthToGain(1)).toBeCloseTo(1, 12);
  });

  it("is non-decreasing over 101 evenly spaced strengths", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const g = strengthToGain(i / 100);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });

  it("clamps out-of-range input: NaN and -1 give the floor, 2 gives 1", () => {
    const floor = Math.pow(10, -18 / 20);
    expect(strengthToGain(Number.NaN)).toBeCloseTo(floor, 12);
    expect(strengthToGain(-1)).toBeCloseTo(floor, 12);
    expect(strengthToGain(2)).toBeCloseTo(1, 12);
  });
});

describe("playbackSemitones (pitch rise plus bounded jitter, AUD-01)", () => {
  it("with rng 0.5 returns exactly s * maxSt", () => {
    expect(playbackSemitones(0.6, () => 0.5, 3, 25)).toBe(0.6 * 3);
    expect(playbackSemitones(1, () => 0.5, 3, 25)).toBe(3);
  });

  it("with rng 0 returns s * maxSt - jitterCents / 100", () => {
    expect(playbackSemitones(0.6, () => 0, 3, 25)).toBeCloseTo(0.6 * 3 - 0.25, 12);
  });

  it("1000 seeded draws all lie within s * maxSt plus or minus jitterCents / 100", () => {
    const rng = mulberry32(0x0503);
    const s = 0.4;
    const center = s * 3;
    for (let i = 0; i < 1000; i++) {
      const st = playbackSemitones(s, rng, 3, 25);
      expect(st).toBeGreaterThanOrEqual(center - 0.25);
      expect(st).toBeLessThanOrEqual(center + 0.25);
    }
  });
});

describe("semitoneRatio", () => {
  it("is 2 at +12, 1 at 0 and 0.5 at -12", () => {
    expect(semitoneRatio(12)).toBe(2);
    expect(semitoneRatio(0)).toBe(1);
    expect(semitoneRatio(-12)).toBe(0.5);
  });
});
