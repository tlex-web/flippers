/**
 * Table palette (RND-01, A1 art direction). One meaning per color: the drain
 * apron is the only red element, the full charge meter has its own color and
 * there is no velocity arrow. Every value is a fixed string built once at module
 * load; intensity changes go through `globalAlpha`, never through new color
 * strings (Pitfall 3). Tuned at UAT, here only.
 */

/** Top of the space background gradient. */
export const BG_TOP = "#05061a";
/** Bottom of the space background gradient. */
export const BG_BOTTOM = "#0b0420";
/** Violet nebula cloud (center stop). */
export const NEBULA_VIOLET = "rgba(123, 44, 191, 0.22)";
/** Violet nebula cloud fade-out (outer stop, same hue at zero alpha). */
export const NEBULA_VIOLET_FADE = "rgba(123, 44, 191, 0)";
/** Teal nebula cloud (center stop). */
export const NEBULA_TEAL = "rgba(0, 180, 216, 0.14)";
/** Teal nebula cloud fade-out (outer stop, same hue at zero alpha). */
export const NEBULA_TEAL_FADE = "rgba(0, 180, 216, 0)";
/** Background stars. */
export const STAR = "#e8eefc";
/** Solid guide walls (the bright neon line). */
export const WALL = "#4cc9f0";
/** Soft halo behind the solid guide walls. */
export const WALL_GLOW = "rgba(76, 201, 240, 0.18)";
/** The launch chute walls. */
export const CHUTE = "#7b8cde";
/** The drain apron, the only red element on the table. */
export const DRAIN = "#ff4d6d";
/** Pop bumper body (outer gradient stop). */
export const BUMPER_BODY = "#3a0ca3";
/** Pop bumper cap (inner gradient stop and bake-time glow). */
export const BUMPER_CAP = "#f72585";
/** Pop bumper rubber ring. */
export const BUMPER_RING = "#ff9ecf";
/** Slingshot body fill. */
export const SLING_BODY = "#2b2d42";
/** Slingshot rubber on the kicking face. */
export const SLING_RUBBER = "#ffb703";
/** Top rollover insert, unlit. */
export const ROLLOVER_UNLIT = "#2d4a14";
/** Top rollover insert, lit. */
export const ROLLOVER_LIT = "#b5ff3b";
/** Inlane guide insert. */
export const LANE = "#2ec4b6";
/** Flipper bat body (center of its cross-section gradient). */
export const FLIPPER_BODY = "#d0d6f9";
/** Flipper bat edge (sides of its cross-section gradient). */
export const FLIPPER_EDGE = "#8e7dbe";
/** Ball core (light side of its gradient). */
export const BALL_CORE = "#ffffff";
/** Ball edge (shadow side of its gradient). */
export const BALL_EDGE = "#8d99ae";
/** Fixed specular glint on the ball. */
export const BALL_GLINT = "rgba(255, 255, 255, 0.85)";
/** Charge meter frame and quarter ticks. */
export const METER_FRAME = "#9fb3c8";
/** Charge meter fill while charging. */
export const METER_FILL = "#ffd166";
/** Charge meter fill at full charge. */
export const METER_FULL = "#fff3b0";
/** Plunger tip and rod. */
export const PLUNGER = "#c9d6e3";

/** Flash colors used by 05-04, one per hit family. */
/** Bumper hit flash. */
export const FLASH_BUMPER = "#ff9ecf";
/** Slingshot hit flash. */
export const FLASH_SLING = "#ffd166";
/** Rollover or lane pass flash. */
export const FLASH_SENSOR = "#d9ff66";
/** Wall hit flash. */
export const FLASH_WALL = "#a5f3ff";
/** Flipper hit flash. */
export const FLASH_FLIPPER = "#ffffff";
/** Drain flash. */
export const FLASH_DRAIN = "#ff4d6d";

/** Line widths (meters; drawn after the world transform). */
/** Bright wall and chute line. */
export const WALL_LINE_M = 0.014;
/** Wide low-alpha glow pass under walls, chute and drain. */
export const WALL_GLOW_LINE_M = 0.05;
/** Sensor inserts (lanes, drain apron) and the meter frame. */
export const SENSOR_LINE_M = 0.012;
/** Rubber: bumper rings, sling faces, rollover inserts. */
export const RUBBER_LINE_M = 0.03;
