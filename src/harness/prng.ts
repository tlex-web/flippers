/**
 * Seeded, deterministic PRNG for the tunnel-proof soak gate (D-04).
 *
 * The soak sweeps launch angle/speed/flipper phase and, on any escape, logs the
 * SEED so the exact failing run can be replayed deterministically. That is only
 * possible if the randomness is seeded and reproducible — so this harness owns
 * its own generator and NEVER uses the platform's unseeded global RNG
 * (`Math`'s `random`), which is non-reproducible across runs.
 *
 * `mulberry32` is a tiny, fast, well-distributed 32-bit generator: given a seed
 * it always produces the identical stream, and different seeds diverge. It is
 * deterministic BY DESIGN for reproducibility — it is NOT cryptographically
 * secure and must never be used for secrets (threat T-05-02).
 */

/**
 * Create a deterministic PRNG from a 32-bit seed. Returns a function that yields
 * the next value in [0, 1) on each call. Two generators created with the same
 * seed produce byte-identical sequences; different seeds diverge.
 */
export function mulberry32(seed: number): () => number {
  // Fold the seed into the 32-bit unsigned domain the algorithm operates on.
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // (t ^ (t >>> 14)) >>> 0 is a full 32-bit unsigned int; divide by 2^32 to
    // land in [0, 1).
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
