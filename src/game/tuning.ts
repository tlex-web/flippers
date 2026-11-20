/**
 * HMR-tunable game-rule numbers (Phase 4).
 *
 * The rules twin of `src/physics/constants.ts`: every value that decides how the
 * table reacts and scores lives here, as a plain exported const, so Vite HMR
 * re-applies an edit instantly during the by-feel pass ("change a number, feel
 * it"). Engine-agnostic: plain numbers only, no engine import. Every value is
 * documented with where it came from.
 */

/**
 * Bumper kick target (m/s): on the trigger step the ball's outward speed along
 * bumper-center -> ball-center is raised to this value; the tangential velocity
 * is kept, and a ball already leaving faster is not slowed (R1).
 *
 * Probe-bounded on the real table (04-RESEARCH R1): 5.5 / 4.5 m/s kicks kept
 * every seeded ball draining with dead flippers and peaked at 7.47 m/s, while
 * 7 / 6 m/s trapped 3 of 12 balls in the bumper cluster. Restitution alone
 * cannot add energy (Planck mixes restitution by max, with a 1 m/s velocity
 * threshold), so the pop has to be an applied impulse.
 */
export const BUMPER_KICK_SPEED = 5.5;

/**
 * Per-element re-arm cooldown, in FIXED steps (6 steps = 50 ms at 120 Hz),
 * never wall-clock. One touch produces a post-solve event every step it
 * persists, a zero-impulse TOI duplicate on the first step and up to 4 sub-step
 * repeats while a flipper moves; the cooldown collapses that burst into one
 * trigger, like a real coil recycling (R3). A ball resting on a bumper is
 * re-kicked every cooldown, which throws it clear.
 */
export const KICKER_REARM_STEPS = 6;

/**
 * Points per distinct bumper touch. An original, conventional magnitude (not
 * copied from any table; assumption A1, cosmetic).
 */
export const BUMPER_POINTS = 1000;

/**
 * Slingshot kick target (m/s): on a face hit the ball's speed along the kick
 * face's outward normal is raised to this value; the tangential velocity is
 * kept and a ball already leaving faster is not slowed (R2, same law as the
 * bumper). Probe-bounded together with BUMPER_KICK_SPEED (04-RESEARCH
 * Pitfall 4): 5.5 / 4.5 m/s kept all 12 seeded drops draining, peak 7.47 m/s.
 */
export const SLING_KICK_SPEED = 4.5;

/**
 * Minimum solver normal impulse (kg·m/s) for a slingshot contact to fire.
 * Above the probed rolling contact on the face (0.0015 per step) and a ball
 * resting on a bumper (0.0048), below a 1 m/s-class hit (0.0393), so only a
 * real strike kicks (04-RESEARCH Pitfall 2).
 */
export const SLING_MIN_IMPULSE = 0.02;

/**
 * Maximum distance (m) from the contact point to the kick-face segment for a
 * slingshot contact to fire. Planck's circle-vs-chain manifold point sits about
 * 0.01 m off the face line (probe: hit at (0.963, 4.479)), so 0.05 m accepts a
 * face hit while the passive faces stay well outside it (R2).
 */
export const SLING_FACE_TOL = 0.05;

/**
 * Points per slingshot kick. An original, conventional magnitude (assumption
 * A1, cosmetic).
 */
export const SLING_POINTS = 500;
