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
 *
 * CONFIRMED (plan 01-07): these values are held unchanged — the headless
 * stability/energy proof (`src/harness/stability.test.ts`) shows a ball driven by
 * them settles to rest with no jitter/corner-sticking and never spontaneously
 * gains kinetic energy, and the tunnel-proof soak (`npm run soak`, plan 01-06)
 * stays green with them. Phase-1 "done" for feel = reference-anchored constants +
 * a visibly weighty fall/settle; the FINAL by-feel "heavy" verdict is deferred to
 * Phase 2, judged through flipper catch/return on the real table incline (D-09).
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

/* ------------------------------------------------------------------------- *
 * FEEL flipper (Phase 2). The canonical Box2D pinball flipper: a DYNAMIC body
 * on a MOTORIZED REVOLUTE JOINT (CLAUDE.md § "What NOT to Use": kinematic
 * flippers transfer momentum wrong and interact badly with CCD). Phase 1's
 * single thin STRESS bat is productized here into two mirrored, feel-tuned
 * CAPSULE bats (Box core + rounded tip Circle, D-07). These values are the
 * single HMR-tunable source of truth for flipper feel; every value below is
 * Claude's discretion within the D-06/D-07 ballpark (cited per const).
 * ------------------------------------------------------------------------- */

/**
 * Flipper bat length (meters) from pivot to the tip of the capsule. Sized for
 * the 2×3 m test rig; long enough that the tip carries real linear speed at the
 * raise rate below (tip speed = FLIPPER_UP_SPEED · FLIPPER_LENGTH_M ≈ 15 m/s),
 * which is what makes the `v = ω × r` tip-vs-base difference read (FLIP-02).
 */
export const FLIPPER_LENGTH_M = 0.5;

/**
 * Flipper capsule core half-thickness (meters) — feel-tuned (D-07). Retuned up
 * from the Phase-1 stress value (0.04, deliberately razor-thin) to match the
 * rounded tip radius so the bat is a symmetric "stadium": the huge 0.2 m ball
 * now rides a real 14 cm-wide face instead of a sliver, giving a clean, jitter-
 * free catch/cradle (FLIP-03). Equal to FLIPPER_TIP_RADIUS_M by construction.
 */
export const FLIPPER_HALF_WIDTH_M = 0.07;

/**
 * Capsule tip-circle radius (meters) — the D-07 rounded tip. Removes the sharp
 * corner that would snag the ball, so the catch is consistent and the ball rolls
 * smoothly to the tip; the fat convex tip also sits on the fastest, most tunnel-
 * prone point (a good CCD target for the D-01 sub-stepping in plan 02-04). Equal
 * to the core half-thickness → the bat renders as a symmetric stadium.
 */
export const FLIPPER_TIP_RADIUS_M = 0.07;

/**
 * Raise motor speed (rad/s) — snappy but bounded (D-04/D-05). +1 through the
 * `setFlipperMotor` hook maps to +FLIPPER_UP_SPEED. Chosen so the D-01 anti-
 * tunnel sub-step count stays tiny at this ω: N = ceil(ω · L · FIXED_DT /
 * (0.5 · r)) = ceil(30 · 0.5 · (1/120) / (0.5 · 0.2)) = 2 (plan 02-04). The
 * high maxMotorTorque below saturates the bat to this speed within ~1 fixed
 * step → sub-frame snap (FLIP-01) falls out for free.
 */
export const FLIPPER_UP_SPEED = 30;

/**
 * Return motor speed (rad/s) — deliberately SOFTER than the raise (20 < 30). −1
 * through `setFlipperMotor` maps to −FLIPPER_RETURN_SPEED. A gentler return reads
 * as a weighted bat settling back, not a violent snap-down, and keeps the return
 * sweep's ω (hence its sub-step count) below the raise's.
 */
export const FLIPPER_RETURN_SPEED = 20;

/**
 * Maximum motor torque (N·m) — feel-tuned (D-06(2)). Retuned down from the
 * Phase-1 stress value (10000) to a still-firm 500. Two requirements, both met
 * with a large margin:
 *   1. Never yields at the limit: it must exceed the ball's gravity torque at the
 *      tip τ_g = m · g_inplane · FLIPPER_LENGTH_M, where m = BALL_DENSITY · π ·
 *      BALL_RADIUS_M² = 1 · π · 0.2² ≈ 0.126 kg and g_inplane = IN_PLANE_GRAVITY
 *      ≈ 4.61 m/s² → τ_g ≈ 0.126 · 4.61 · 0.5 ≈ 0.29 N·m. 500 N·m exceeds this by
 *      ~1700× → the held cradle (D-06(1)) is rock-solid, the bat never sags off
 *      the upper limit under the ball's weight.
 *   2. Saturates FLIPPER_UP_SPEED within ~1 fixed step: with the capsule bat's
 *      inertia about the pivot ≈ 7·10⁻³ kg·m², α = τ/I ≈ 500 / 0.007 ≈ 7·10⁴
 *      rad/s² reaches 30 rad/s in ~4·10⁻⁴ s ≪ FIXED_DT (8.3·10⁻³ s) → sub-frame
 *      snap (FLIP-01).
 */
export const FLIPPER_MAX_MOTOR_TORQUE = 500;

/**
 * Lower revolute-joint angle limit (radians) — feel-tuned (D-07 discretion). The
 * left bat sweeps a symmetric ~45° arc [FLIPPER_LOWER_ANGLE, FLIPPER_UPPER_ANGLE]
 * = [−π/8, π/8] straddling the horizontal (angle 0). Keeping level MID-arc (not
 * at a limit) matters: the bat crosses horizontal at full angular speed, which is
 * both the feel-relevant flick and what lets the swept-tunnel proof drive a fast
 * MOVING bat through the drop path (the soak flipper negative control). The
 * mirrored right bat reflects this arc about the vertical (θ → π − θ), so the pair
 * sweeps in opposite angular senses. Retuned from ±π/4 (a 90° stress arc).
 */
export const FLIPPER_LOWER_ANGLE = -Math.PI / 8;

/**
 * Upper revolute-joint angle limit (radians) — the rest/droop stop. At +π/8 (tip
 * slightly below level) the bat rests here under gravity + the default motor.
 * Raise sweep = FLIPPER_UPPER_ANGLE − FLIPPER_LOWER_ANGLE = π/4 ≈ 45° (D-07).
 */
export const FLIPPER_UPPER_ANGLE = Math.PI / 8;

/**
 * Secondary angular-speed cap (rad/s) bounding the D-01 adaptive sub-step count
 * `N` in `PlanckWorld.step()` (D-02). This is a **secondary BOUND only** — it is
 * explicitly NOT the mechanism that guarantees the fast bat can never sweep
 * through the ball. That guarantee is the sub-stepping itself: splitting a fixed
 * step into `N = ceil(ω · FLIPPER_LENGTH_M · FIXED_DT / (0.5 · BALL_RADIUS_M))`
 * Planck sub-steps so the fastest bat's per-sub-step tip arc stays below ~half a
 * ball radius. A cap low enough to serve as the primary guarantee would sand down
 * flip snappiness (the Core Value this phase exists to nail), so the cap only
 * exists to keep `N` bounded against a *pathological* ω that would otherwise blow
 * the 16.6 ms frame budget (threat T-02-07 — availability/feel DoS).
 *
 * Sized so `N ≤ ~4` at any ω: N = 4 corresponds to
 *   ω ≈ 4 · 0.5 · BALL_RADIUS_M / (FLIPPER_LENGTH_M · FIXED_DT)
 *     = 4 · 0.5 · 0.2 / (0.5 · 1/120) = 96 rad/s.
 * At the feel-tuned FLIPPER_UP_SPEED (30 rad/s) N = 2, far under this bound — the
 * cap never engages in normal play; it is purely the pathological-ω backstop.
 */
export const FLIPPER_MAX_ANGULAR_SPEED = 96;

/* ------------------------------------------------------------------------- *
 * PLUNGER (Phase 3, D-07/D-08). Our design is IMPULSE-ON-RELEASE: holding the
 * launch key accumulates a scalar charge once per fixed 120 Hz step, and the
 * release applies ONE linear impulse along the chute axis to the ball resting
 * on the plunger. There is no spring body and no moving plunger body, so the
 * launch power is directly readable from the charge, the launch is
 * deterministic, and the ball's existing setBullet CCD against the static chute
 * covers it with no extra anti-tunnel work.
 *
 * Impulse -> speed: the ball mass is m = BALL_DENSITY · π · BALL_RADIUS_M² =
 * 1 · π · 0.04 ≈ 0.126 kg, so the launch speed is v = impulse / m. Climb height
 * under linear damping k = BALL_LINEAR_DAMPING and in-plane gravity
 * g = IN_PLANE_GRAVITY is h(v) = v/k − (g/k²) · ln(1 + k·v/g). The chute is
 * ≈ 4.3 m from PLUNGER_REST (y 6.2) to its top (y 1.9), so clearing it needs
 * v ≳ 8 m/s. Every launch stays far below the 60 m/s soak ceiling.
 * ------------------------------------------------------------------------- */

/**
 * Charge rate (normalized charge per second while the key is held). At 1.5/s a
 * full charge takes 1 / 1.5 ≈ 0.67 s (80 fixed steps): long enough to read the
 * meter and pick a power, short enough that a full plunge never feels sluggish.
 * The charge advances by PLUNGER_CHARGE_RATE · FIXED_DT per step, never by
 * wall-clock, so the same hold always yields the same charge.
 */
export const PLUNGER_CHARGE_RATE = 1.5;

/** Charge cap. Holding past it clamps; the normalized meter reads exactly 1. */
export const PLUNGER_MAX_CHARGE = 1;

/**
 * Impulse (kg·m/s) of an immediate release at zero charge: v ≈ 0.4 / 0.126 ≈
 * 3.2 m/s, a ≈ 0.9 m dribble that falls back onto the plunger. A tap always
 * moves the ball, so a press is never a silent no-op.
 */
export const PLUNGER_MIN_IMPULSE = 0.4;

/**
 * Impulse (kg·m/s) of a full-charge release: v ≈ 1.5 / 0.126 ≈ 12 m/s, a
 * ≈ 9 m damped climb, so a full plunge clears the 4.3 m chute with margin and
 * rides the top-right arc onto the playfield. Charge maps linearly between
 * PLUNGER_MIN_IMPULSE and this cap (threat T-03-10: the impulse is bounded).
 */
export const PLUNGER_MAX_IMPULSE = 1.5;

/**
 * Launch direction: the unit vector up the vertical chute (world −y is up the
 * table). The impulse is purely along this axis, so a launch adds no sideways
 * velocity and no spin.
 */
export const PLUNGER_AXIS = { x: 0, y: -1 } as const;

/* ------------------------------------------------------------------------- *
 * BALL MASS (Phase 4). One density source for every consumer that turns a
 * velocity change into an impulse: the rules' bumper/sling kick math, the
 * sandbox kinetic-energy readout and (switched over in 04-04) the adapter.
 * ------------------------------------------------------------------------- */

/**
 * Ball solver density (kg/m²). The 2D solver integrates mass over the circle's
 * area, so this is an areal density; 1 is the value the adapter already builds
 * the ball fixture with.
 */
export const BALL_DENSITY = 1;

/**
 * Ball mass (kg) for a given radius: m = BALL_DENSITY · π · r². At
 * `BALL_RADIUS_M` (0.2 m) that is π · 0.04 ≈ 0.1257 kg. This is the single
 * density source shared by the adapter (switched over in 04-04), the sandbox KE
 * readout and the rules' kick math, so an impulse j = m · Δv lands exactly the
 * velocity change it was computed for.
 */
export function ballMass(radius: number): number {
  return BALL_DENSITY * Math.PI * radius * radius;
}
