/**
 * Reference-anchored, HMR-tunable feel constants (D-08).
 *
 * Values are derived by BEHAVIOR from the open-source SpaceCadetPinball
 * decompilation (k4zmu2a/SpaceCadetPinball) — `TTableLayer.cpp` (playfield
 * incline, gravity projection, velocity-proportional damping) and `TBall.cpp`
 * (ball motion). We copy VALUES/BEHAVIOR ONLY, never assets. Because Box2D/Planck
 * works in real SI units, the original's screen-space constants are translated by
 * ratio/behavior rather than transcribed literally (see each note below).
 *
 * These are the single source of truth for the adapter and every later plan;
 * they are plain exported consts so Vite HMR re-applies edits instantly during
 * feel tuning ("change a number, feel it").
 */

/**
 * Playfield incline in degrees. The original table is a tilted plane (~28° in
 * TTableLayer.cpp's geometry); the ball is pulled DOWN the slope, not straight
 * toward the screen. This is the root of the "heavy, not floaty" feel.
 */
export const INCLINE_DEG = 28;

/** Full gravitational acceleration (m/s²) — Earth standard, before projection. */
export const G_FULL = 9.81;

/**
 * Effective in-plane gravity (m/s²): the component of full gravity along the
 * tilted playfield = sin(incline) · g_full ≈ 4.6 m/s² (D-08). Computed from
 * `INCLINE_DEG`, never a magic literal, so re-tilting the table stays a one-line
 * change. Using the projection (not full vertical g) is what makes the fall read
 * as a weighty roll rather than a free drop.
 */
export const IN_PLANE_GRAVITY = Math.sin((INCLINE_DEG * Math.PI) / 180) * G_FULL;

/**
 * Ball radius (meters). Sized ~0.2 m (D-08 guidance: keep the ball ~0.3–0.5 m of
 * scale so Planck's solver + CCD stay well-conditioned; small enough to feel like
 * a pinball at `PIXELS_PER_METER`). Behavior anchor: TBall.cpp ball dimensions.
 */
export const BALL_RADIUS_M = 0.2;

/**
 * Ball restitution (bounciness). ~0.35 sits in the CLAUDE.md-prescribed 0.3–0.5
 * band — lively off bumpers/walls but not rubbery. Behavior anchor: TBall.cpp
 * collision response feels bouncy-but-controlled, not elastic.
 */
export const BALL_RESTITUTION = 0.35;

/**
 * Ball friction (low). A steel ball on a lacquered playfield barely grips; low
 * friction keeps it rolling/sliding freely (CLAUDE.md "low friction"). Behavior
 * anchor: TBall.cpp surface interaction.
 */
export const BALL_FRICTION = 0.05;

/**
 * Linear damping (1/s): velocity-proportional drag. This is the Planck
 * translation of TTableLayer.cpp's per-frame velocity-damping term — it bleeds
 * speed continuously so the ball settles and reads as HEAVY rather than
 * frictionlessly floaty (D-08).
 */
export const BALL_LINEAR_DAMPING = 0.4;

/**
 * Rendering scale: pixels per simulation meter. An honest scale (D-08) so the
 * physics stays in well-conditioned SI meters while the debug/real renderer maps
 * to screen. At 400 px/m a 0.2 m ball draws as an 80 px sphere.
 */
export const PIXELS_PER_METER = 400;

/**
 * Fixed physics timestep (seconds) = 1/120. The simulation steps at 120 Hz even
 * while rendering at 60 fps (CLAUDE.md "Fix Your Timestep"): a higher physics
 * rate shrinks per-step ball travel → less tunneling and crisper response. The
 * render loop interpolates between the last two 120 Hz states.
 */
export const FIXED_DT = 1 / 120;

/**
 * Max real frame time (ms) fed into the accumulator per `advance()`. On tab-blur
 * the browser can deliver an arbitrarily huge delta; clamping it here is the
 * spiral-of-death / physics-explosion guard (threat T-01-02). 250 ms caps a
 * stalled frame at ~30 catch-up steps instead of thousands.
 */
export const MAX_FRAME_MS = 250;
