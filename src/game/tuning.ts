/**
 * HMR-tunable game-rule numbers (Phase 4).
 *
 * The rules twin of `src/physics/constants.ts`: every value that decides how the
 * table reacts and scores lives here, as a plain exported const, so Vite HMR
 * re-applies an edit instantly during the by-feel pass ("change a number, feel
 * it"). Engine-agnostic: plain numbers only, no engine import. Every value is
 * documented with where it came from.
 */

import type { Vec2 } from "../physics/types";

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

/**
 * Per-sensor re-arm cooldown, in FIXED steps (30 steps = 0.25 s at 120 Hz),
 * for rollovers and inlanes (R3). Sensors already fire once per overlap begin,
 * so this only guards a ball rattling on the line from double-scoring.
 */
export const SENSOR_REARM_STEPS = 30;

/**
 * Points per top-rollover pass. An original, conventional magnitude
 * (assumption A1, cosmetic).
 */
export const ROLLOVER_POINTS = 1000;

/**
 * Bonus when all three top rollovers are lit; the three lights then reset
 * (R4/R12, assumption A1).
 */
export const ROLLOVER_BANK_BONUS = 10000;

/**
 * Points per inlane pass. Inlanes score but do not light (assumption A1/A7).
 */
export const INLANE_POINTS = 2000;

// ---------------------------------------------------------------------------
// Nudge (R9, GAME-03)
// ---------------------------------------------------------------------------

/** A nudge direction, one per nudge key (KeyX, Period, ArrowUp). */
export type NudgeDir = "left" | "right" | "up";

/**
 * Nudge impulse (kg·m/s) applied to every live ball on an accepted nudge,
 * through `applyImpulse` (velocity only, never a position write, so a nudge can
 * never teleport the ball or carry it through a wall). On the 0.1257 kg ball
 * that is a velocity change of about 1.19 m/s: enough to save an outlane drift,
 * small enough not to become free ball control (R9, assumption A3, by-feel).
 */
export const NUDGE_IMPULSE = 0.15;

/**
 * Minimum gap between accepted nudges, in FIXED steps (30 steps = 0.25 s at
 * 120 Hz), never wall-clock. A nudge inside the window does nothing (spam guard,
 * T-04-14); the accumulating tilt meter punishes sustained shaking.
 */
export const NUDGE_COOLDOWN_STEPS = 30;

/**
 * Unit direction of the impulse each nudge key gives the ball, in playfield
 * coordinates (+x right, +y down-table). Reaction model (assumption A2):
 * shoving the cabinet left throws the ball RIGHT relative to the playfield
 * (KeyX -> +x), shoving right throws it left (Period -> -x), and a forward shove
 * throws it up-table (ArrowUp -> -y). Flip a sign here if it feels backwards.
 */
export const NUDGE_DIRS: Readonly<Record<NudgeDir, Vec2>> = {
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
};

// ---------------------------------------------------------------------------
// Tilt (R10, R11, GAME-03)
// ---------------------------------------------------------------------------
//
// An accumulate-and-decay meter, counted in fixed steps (never a wall clock).
// Worked numbers with these defaults and the 30-step nudge cooldown (decay
// 0.5 * FIXED_DT per step, so 0.125 per 30 steps): nudges 30 steps apart give
// levels 1.0, 1.875, 2.75 (the 3rd WARNS), then 3.625 (the 4th TILTS). One
// nudge every 240 steps (2 s) decays fully between nudges and peaks at 1.0, so
// it never warns. Assumption A4, by-feel at the 04-07 human check.

/** Meter level each accepted nudge adds. */
export const TILT_NUDGE_COST = 1.0;

/** Meter decay per second, applied per fixed step as TILT_DECAY_PER_S * FIXED_DT. */
export const TILT_DECAY_PER_S = 0.5;

/**
 * WARNING fires on the rising edge of level >= this (inclusive). Three rapid
 * nudges warn, matching the factory "3 actuations" warning default (R10).
 */
export const TILT_WARNING_LEVEL = 2.0;

/** TILT fires at level >= this (inclusive): a fourth rapid nudge tilts. */
export const TILT_LEVEL = 3.0;

/**
 * How long, in FIXED steps, the HUD shows WARNING after a warning edge
 * (120 steps = 1 s at 120 Hz). Read through `GameSession.isWarning()` (04-07).
 */
export const WARNING_FLASH_STEPS = 120;

// ---------------------------------------------------------------------------
// Ball search (tilted soft-lock, 06.2)
// ---------------------------------------------------------------------------
//
// Runs only while tilted, when the flippers, nudges and kickers are all dead
// and nothing else can free a ball resting in a dead bat's hinge pocket or on
// a bumper apex (6590dce IN-04). Real-pinball ball-search convention: kick the
// ball, and if that fails, give it up and end the ball. Counted in fixed steps,
// never a wall clock.

/**
 * Consecutive still fixed steps (240 = 2 s at 120 Hz) outside PLUNGER_ZONE
 * before a tilted ball is searched. Probe: the longest still run of any ball
 * that went on to drain was 114 steps over 1,077 dead-bat drops, so this is
 * 2.1x the worst legitimate pause (research A1, HMR-tunable).
 */
export const BALL_SEARCH_STEPS = 240;

/**
 * "Still" speed (m/s): a ball below it counts toward BALL_SEARCH_STEPS. A
 * pocketed ball sleeps at 0. Same scale as PLUNGER_REST_SPEED_EPS.
 */
export const BALL_SEARCH_SPEED_EPS = 0.05;

/**
 * Search kick (kg·m/s), applied horizontally toward PLAYFIELD_CENTER_X through
 * `applyImpulse` (velocity only, never a position write). Equal to
 * NUDGE_IMPULSE. Probe: it frees both hinge pockets (drain in 101 steps) and
 * all three bumper apexes; kicks up, down or away from the centre re-trap the
 * hinge ball, 8 of 8.
 */
export const BALL_SEARCH_IMPULSE = NUDGE_IMPULSE;

/**
 * Search kicks before a still tilted ball is given up and recorded as drained
 * (the tilted ball is forfeit anyway).
 */
export const BALL_SEARCH_KICKS = 2;

// ---------------------------------------------------------------------------
// Skill shot (PLSH-05)
// ---------------------------------------------------------------------------
//
// The lit top rollover rotates while the served ball rests in the plunger lane
// and freezes on the Space press edge; the ball's first scoring switch after
// launch decides the shot (D-01, D-03). The table already maps the plunger
// charge to a lane (D-01 probe: N=62 charging steps, 0.775, goes to 401), so a
// learned hold length is the skill. There is no meter sweet-spot band and no
// random source.

/**
 * The skill-shot lanes in rotation order: the three top rollovers (spec ids
 * 400..402). Rotation starts at the first entry on every arm (D-01).
 */
export const SKILL_SHOT_LANES: readonly number[] = [400, 401, 402];

/**
 * Fixed steps each lane stays lit before the rotation moves on (72 steps =
 * 0.6 s at 120 Hz), counted from the serve (D-01, UI-SPEC rotation rate).
 */
export const SKILL_SHOT_ROTATE_STEPS = 72;

/** Value of the first skill shot of a game (D-04). */
export const SKILL_SHOT_BASE_POINTS = 5000;

/** Added to the value for each skill shot already made this game (D-04). */
export const SKILL_SHOT_STEP_POINTS = 5000;

/** Cap on one skill shot's value (D-04). */
export const SKILL_SHOT_MAX_POINTS = 25000;

// ---------------------------------------------------------------------------
// Bonus (PLSH-06)
// ---------------------------------------------------------------------------
//
// End-of-ball bonus (D-11, D-12, D-13). Per-ball counters advance only from
// live registered rollover, inlane and bank switches; on the drain the session
// holds the serve in a rule-level "bonus" state for a counted number of fixed
// steps while the tally is shown, then credits it. Tally timing (UI-SPEC): each
// included row is revealed BONUS_ROW_STEPS after the previous one and counts up
// over the same span, then TOTAL holds for BONUS_TOTAL_HOLD_STEPS. A tilted
// ball forfeits its bonus with a fixed TILT_FORFEIT_HOLD_STEPS hold. No
// multiplier (BONUS-01 stays v2).

/** Bonus value of one rollover pass this ball (D-11, research A5). */
export const BONUS_ROLLOVER_UNIT = 1000;

/** Bonus value of one inlane pass this ball (D-11, research A5). */
export const BONUS_INLANE_UNIT = 2000;

/** Bonus value of one completed bank of 3 rollovers this ball (D-11). */
export const BONUS_BANK_UNIT = 5000;

/**
 * Fixed steps per tally row (48 steps = 0.4 s at 120 Hz): row i is revealed at
 * elapsed 48 * i and counts up to its value over the next 48 steps (UI-SPEC).
 */
export const BONUS_ROW_STEPS = 48;

/** Fixed steps the TOTAL holds after the last row (120 steps = 1 s, UI-SPEC). */
export const BONUS_TOTAL_HOLD_STEPS = 120;

/** Fixed steps the tally holds when every row is zero (60 steps = 0.5 s). */
export const BONUS_EMPTY_HOLD_STEPS = 60;

/**
 * Fixed steps a tilted ball's forfeit holds TILT · NO BONUS (120 steps = 1 s,
 * D-13). Not shortened by a flipper press, so the message can be read.
 */
export const TILT_FORFEIT_HOLD_STEPS = 120;

// ---------------------------------------------------------------------------
// Ball save (PLSH-07)
// ---------------------------------------------------------------------------
//
// The timed ball save (D-08, D-09, D-10). The timer starts on the first fixed
// step the ball clears the launch chute (its center plus BALL_RADIUS_M left of
// CHUTE_X), not at the serve, so a held plunger never burns it and a weak
// plunge that falls straight back never starts it. While it runs, a drain costs
// no ball (the backstop re-serve) or the center-post kickback saves it (06-08).
// One save per ball; every serve re-arms it, the backstop re-serve does not.
// The kickback spends the save but does not always keep the ball in play (a
// dead-center kick can fall straight back through the bat gap, a kick-up can
// come back down seconds later), so a drain of the kicked ball is still
// backstopped through the rest of the original save window, and for at least
// KICKBACK_GRACE_STEPS after the kick: the kick can only improve on the
// guaranteed save, never make it worse (06-REVIEW CR-01).

/** Fixed steps the save runs once started (840 steps = 7 s at 120 Hz, D-09). */
export const BALL_SAVE_STEPS = 840;

/**
 * Remaining steps at or below which the save lamp blinks instead of glowing
 * steady (240 steps = 2 s at 120 Hz, D-10, UI-SPEC).
 */
export const BALL_SAVE_BLINK_STEPS = 240;

/**
 * Minimum fixed steps after a center-post kickback during which a drain of the
 * kicked ball is still a backstop re-serve, counted once as the kickback (240
 * steps = 2 s at 120 Hz, 06-REVIEW CR-01). The grace also runs through the rest
 * of the original save window when that is longer, so this floor only matters
 * for a kick late in the window. The headless probe saw kicked balls that fall
 * straight back drain 32 to 115 steps after the kick, so 2 s covers them with
 * margin.
 */
export const KICKBACK_GRACE_STEPS = 240;

/**
 * Center-post kickback target speed (m/s, D-07). The post kicker uses the
 * bumper kick law: the ball's speed along the post-center -> ball-center normal
 * is raised to this, its tangential velocity is kept. Probe bounds on 16 seeded
 * dead-flipper drops: 5.5 m/s peaks at 7.44 m/s and 4.0 m/s at 6.97 m/s, both
 * inside the 15 m/s energy bound; 20 m/s peaks at 19.96 m/s and breaks it (the
 * RED control). Starts at the bumper's 5.5 m/s; tune by feel within the bound.
 */
export const KICKBACK_SPEED = 5.5;

// ---------------------------------------------------------------------------
// Bar hint (06.4.1.1)
// ---------------------------------------------------------------------------
//
// Presentation timing that rides on the step clock, so it stays deterministic.
// Nothing in the sim reads it: only the bar hint's ready signal waits on it.

/**
 * Consecutive fixed steps (12 = 100 ms at 120 Hz) the ball in play must rest in
 * PLUNGER_ZONE before `GameSession.isBallOnPlunger()` reports true, so the bar
 * hint rides out the bounce apexes of a weak-plunge fall-back (rest windows of
 * at most 3 steps in the 06.4.1.1-REVIEW CR-01 trace). A served ball rests from
 * its first step, so a serve pays only this window (06.4.1.1 D-10).
 */
export const PLUNGER_HINT_SETTLE_STEPS = 12;
