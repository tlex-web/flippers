import { describe, it, expect, vi } from "vitest";

import { mulberry32 } from "./prng";

/**
 * The soak gate replays failing seeds deterministically (D-04), so the PRNG
 * MUST be seeded and reproducible and MUST NOT touch the platform's unseeded
 * global RNG (`Math`'s `random`), which is non-reproducible. These are
 * numeric/deterministic assertions.
 */
describe("mulberry32 seeded PRNG", () => {
  it("yields an identical sequence for identical seeds", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("is reproducible across fresh generators (deterministic replay)", () => {
    const first = mulberry32(999)();
    const again = mulberry32(999)();
    expect(again).toBe(first);
  });

  it("diverges for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("produces outputs in [0, 1)", () => {
    const rng = mulberry32(0xc0ffee);
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("never calls the platform's unseeded global RNG", () => {
    const spy = vi.spyOn(Math, "random");
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) rng();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
