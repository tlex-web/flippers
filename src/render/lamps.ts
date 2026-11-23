/**
 * Insert lamps (PLSH-04, D-21, D-22): the lamp levels on the fixed-step clock
 * and the one lamp shape table.
 *
 * `LampTracker` reads the rules' boolean light state (`LampLights`, the
 * `ReactiveElements.isLit` shape) and the session's read-only skill-shot
 * getters (`LampRules`) and extends them into a per-lamp level in [0, 1]. Each
 * `update()` (one per fixed step, in `onPostStep` after `observer.observe()`
 * and before `flash.tick()`) computes every lamp's target and moves its level
 * toward it by 1 / LAMP_FADE_IN_STEPS up or 1 / LAMP_FADE_OUT_STEPS down, an
 * incandescent fade. The renderer reads `level(lamp, alpha)` between the last
 * two steps, so the lamps freeze with the sim on a hidden tab and replay
 * identically. Presentation never writes the rules.
 *
 * Targets:
 * - Rollovers 400/401/402: `isLit(id)` (bank progress), steady.
 * - Skill chevrons (only while playing): the lane under `getSkillLitLane()`
 *   steady while rotating; blinking while frozen, LAMP_BLINK_PERIOD_STEPS long
 *   (on for the first half, off for the second) counted from the freeze, so
 *   every on/off cycle is exactly one period (2 Hz, WCAG 2.3.1); after a
 *   `getSkillShotCount()` increment the `getLastSkillLane()` chevron is steady
 *   for LAMP_AWARD_HOLD_STEPS whatever the phase. Off, tilted and game over:
 *   unlit.
 * - Inlane arrows 500/501 (playing and tilted): `isInlaneScored(id)`, steady
 *   once that inlane scored on this ball; the session clears it on every serve.
 * - Attract (game over): rule light state is ignored and a ping-pong chase runs
 *   over 500 -> 400 -> 401 -> 402 -> 501 -> 402 -> 401 -> 400, one lamp lit per
 *   LAMP_CHASE_DWELL_STEPS, counted from the step game over began. The
 *   chevrons stay unlit.
 * - Tilted: the session disarms the skill shot, so the chevrons go out; the
 *   rollover and arrow lamps keep their rule state.
 * - Ball-save ring (06-10, D-10): `getSaveLampPhase()` "steady" lit, "blink"
 *   on the same LAMP_BLINK_PERIOD_STEPS blink counted from the blink edge, "off"
 *   unlit (the session reads "off" when spent, timed out, tilted or not
 *   playing); unlit in attract whatever it reads.
 *
 * Post flourish (06-10, D-07): a `getSaveCount()` increment whose
 * `getLastSaveKind()` is "kickback" starts the flourish clock on the update
 * that sees it, so the first frame after the kick step reads age `alpha`, like
 * a flash. `postAge(alpha)` is -1 when no flourish is showing (before any
 * kickback, and from rise + hold + sink steps on); the pure `postPose(age,
 * out)` turns an age into the drawn scale, alpha and flash level. A backstop
 * save shows no post.
 *
 * `buildLampShapes(elements)` is the shape table the renderer's lamp pass (and
 * the unlit bake) iterate: vertex lists in preallocated Float64Arrays, built
 * once. A later lamp is one more row here, with no renderer edit.
 *
 * Allocation-free after construction; DOM-free and engine-free.
 */

import type { GameSession } from "../game/game-session";
import { SKILL_SHOT_LANES } from "../game/tuning";
import { pathMidpoint, type ResolvedElement } from "../table/resolve";
import { FLASH_TIMING, flashLevel } from "./flash";
import {
  INLANE_LIT,
  INLANE_UNLIT,
  ROLLOVER_LIT,
  ROLLOVER_UNLIT,
  RUBBER_LINE_M,
  SAVE_LIT,
  SAVE_UNLIT,
  SKILL_LIT,
  SKILL_UNLIT,
} from "./palette";
import { SENSOR_HALO_M } from "./sprites";

/** The rules' boolean light state (`ReactiveElements`). */
export interface LampLights {
  isLit(elementId: number): boolean;
}

/** The read-only session getters the lamps show. */
export type LampRules = Pick<
  GameSession,
  | "getState"
  | "getSkillPhase"
  | "getSkillLitLane"
  | "getSkillShotCount"
  | "getLastSkillLane"
  | "isInlaneScored"
  | "getSaveLampPhase"
  | "getSaveCount"
  | "getLastSaveKind"
>;

/** Lamp indices into the level arrays. */
export const LAMP_ROLLOVER_400 = 0;
export const LAMP_ROLLOVER_401 = 1;
export const LAMP_ROLLOVER_402 = 2;
export const LAMP_SKILL_400 = 3;
export const LAMP_SKILL_401 = 4;
export const LAMP_SKILL_402 = 5;
export const LAMP_INLANE_500 = 6;
export const LAMP_INLANE_501 = 7;
export const LAMP_SAVE = 8;
/** Number of lamps. */
export const LAMP_COUNT = 9;

/** Fixed steps from unlit to fully lit. */
export const LAMP_FADE_IN_STEPS = 4;
/** Fixed steps from fully lit to unlit (the incandescent tail). */
export const LAMP_FADE_OUT_STEPS = 15;
/** One blink cycle: on for the first half, off for the second (2 Hz at 120 Hz). */
export const LAMP_BLINK_PERIOD_STEPS = 60;
/** Steps a skill-shot award holds its chevron steady. */
export const LAMP_AWARD_HOLD_STEPS = 60;
/** Steps each attract-chase lamp stays the lit one (0.15 s at 120 Hz). */
export const LAMP_CHASE_DWELL_STEPS = 18;

/** Skill chevron: an upward chevron this wide and tall, with this arm thickness (m). */
const CHEVRON_W_M = 0.2;
const CHEVRON_H_M = 0.12;
const CHEVRON_ARM_M = 0.05;
/**
 * Chevron center offset (m): this far down-table of its skill lane's rollover
 * midpoint (0.95 + 0.37 = 1.32 on the current table). Derived from the
 * element, so a moved lane carries its chevron (06-REVIEW WR-03).
 */
const CHEVRON_DROP_M = 0.37;
/** Chevron halo radius (m). */
const CHEVRON_HALO_M = 0.16;

/** Inlane arrow: a head this wide and tall over a stem this wide and tall (m). */
const ARROW_HEAD_W_M = 0.16;
const ARROW_HEAD_H_M = 0.12;
const ARROW_STEM_W_M = 0.05;
const ARROW_STEM_H_M = 0.08;
/**
 * Inlane arrow center offset (m): this far up-table of its inlane sensor's
 * midpoint (4.95 - 0.23 = 4.72 on the current table), on the same x.
 */
const ARROW_RISE_M = 0.23;
/** Arrow halo radius (m). */
const ARROW_HALO_M = 0.14;

/** Ball-save ring: inner edge this far outside the post collider, this wide (m). */
const SAVE_RING_GAP_M = 0.02;
const SAVE_RING_WIDTH_M = 0.035;
/** Ball-save ring halo radius (m). */
const SAVE_RING_HALO_M = 0.22;
/** Points on the ring's closed polyline. */
const SAVE_RING_POINTS = 48;

/** Post flourish (UI-SPEC): rise, hold and sink lengths in fixed steps. */
export const POST_RISE_STEPS = 3;
export const POST_HOLD_STEPS = 48;
export const POST_SINK_STEPS = 24;
/** Steps from the kick to the post hiding. */
const POST_TOTAL_STEPS = POST_RISE_STEPS + POST_HOLD_STEPS + POST_SINK_STEPS;
/** The post's drawn scale at the start of the rise and the end of the sink. */
const POST_LOW_SCALE = 0.7;

/** A fade step that lands within this of its target snaps to it (Float32 drift). */
const SNAP_EPS = 1e-4;

const UP = 1 / LAMP_FADE_IN_STEPS;
const DOWN = 1 / LAMP_FADE_OUT_STEPS;

/** One lamp's lens: geometry, style and colors, built once. */
export interface LampShape {
  /** Index into the tracker's levels. */
  readonly lamp: number;
  /** "stroke": an open path stroked at `lineWidth`; "fill": a closed polygon. */
  readonly style: "stroke" | "fill";
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly closed: boolean;
  readonly lineWidth: number;
  /** The element bake already draws this unlit lens (the rollover inserts). */
  readonly elementDrawn: boolean;
  readonly lit: string;
  readonly unlit: string;
  /** Halo radius (m), centered on (cx, cy). */
  readonly haloRadius: number;
  /** Lens center (m). */
  readonly cx: number;
  readonly cy: number;
  /** Lens radius (m): the hot-spot's scale. */
  readonly lensRadius: number;
}

/** The rollover lamp for each rollover id, in lane order. */
const ROLLOVER_LAMPS: readonly (readonly [number, number])[] = [
  [400, LAMP_ROLLOVER_400],
  [401, LAMP_ROLLOVER_401],
  [402, LAMP_ROLLOVER_402],
];

/**
 * Skill chevron lamps, in `SKILL_SHOT_LANES` order: one per lane (the lamp
 * tests pin the lengths equal, so a lane added without a chevron fails loudly).
 */
export const SKILL_LAMPS: readonly number[] = [LAMP_SKILL_400, LAMP_SKILL_401, LAMP_SKILL_402];

/** The inlane arrow lamp for each inlane (lane sensor) id. */
const INLANE_LAMPS: readonly (readonly [number, number])[] = [
  [500, LAMP_INLANE_500],
  [501, LAMP_INLANE_501],
];

/** The attract ping-pong, as lamp indices: 500 400 401 402 501 402 401 400. */
const CHASE_ORDER: readonly number[] = [
  LAMP_INLANE_500,
  LAMP_ROLLOVER_400,
  LAMP_ROLLOVER_401,
  LAMP_ROLLOVER_402,
  LAMP_INLANE_501,
  LAMP_ROLLOVER_402,
  LAMP_ROLLOVER_401,
  LAMP_ROLLOVER_400,
];

/** The chevron lamp under a skill lane (by its `SKILL_SHOT_LANES` slot), or -1. */
function skillLampOf(laneId: number): number {
  const i = SKILL_SHOT_LANES.indexOf(laneId);
  return i < 0 ? -1 : (SKILL_LAMPS[i] ?? -1);
}

/** A rollover lens: the sensor path as a round-capped stroke. */
function rolloverShape(el: ResolvedElement, lamp: number): LampShape | null {
  const v = el.vertices;
  const first = v[0];
  const last = v[v.length - 1];
  if (!first || !last || v.length < 2) return null;
  const xs = new Float64Array(v.length);
  const ys = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) {
    xs[i] = v[i]?.x ?? 0;
    ys[i] = v[i]?.y ?? 0;
  }
  return {
    lamp,
    style: "stroke",
    xs,
    ys,
    closed: false,
    lineWidth: RUBBER_LINE_M,
    elementDrawn: true,
    lit: ROLLOVER_LIT,
    unlit: ROLLOVER_UNLIT,
    haloRadius: SENSOR_HALO_M,
    cx: (first.x + last.x) / 2,
    cy: (first.y + last.y) / 2,
    lensRadius: Math.hypot(last.x - first.x, last.y - first.y) / 2,
  };
}

/**
 * An upward chevron centered on (cx, cy): outer left foot, apex, outer right
 * foot, inner right foot, inner notch, inner left foot. The inner edges are the
 * outer ones moved CHEVRON_ARM_M along their normal.
 */
function chevronShape(cx: number, cy: number, lamp: number): LampShape {
  const hw = CHEVRON_W_M / 2;
  const hh = CHEVRON_H_M / 2;
  const len = Math.hypot(hw, CHEVRON_H_M);
  const notchDrop = (CHEVRON_ARM_M * len) / hw; // vertical shift of an arm edge
  const footInset = (CHEVRON_ARM_M * len) / CHEVRON_H_M; // horizontal shift at the feet
  const top = cy - hh;
  const foot = cy + hh;
  const xs = new Float64Array([cx - hw, cx, cx + hw, cx + hw - footInset, cx, cx - hw + footInset]);
  const ys = new Float64Array([foot, top, foot, foot, top + notchDrop, foot]);
  return {
    lamp,
    style: "fill",
    xs,
    ys,
    closed: true,
    lineWidth: 0,
    elementDrawn: false,
    lit: SKILL_LIT,
    unlit: SKILL_UNLIT,
    haloRadius: CHEVRON_HALO_M,
    cx,
    cy,
    lensRadius: hw,
  };
}

/**
 * An upward arrow (head over stem) centered on (cx, cy), the whole arrow
 * ARROW_HEAD_H_M + ARROW_STEM_H_M tall: apex, right head corner, right stem
 * top, right stem foot, left stem foot, left stem top, left head corner.
 */
function arrowShape(cx: number, cy: number, lamp: number): LampShape {
  const hw = ARROW_HEAD_W_M / 2;
  const sw = ARROW_STEM_W_M / 2;
  const top = cy - (ARROW_HEAD_H_M + ARROW_STEM_H_M) / 2;
  const base = top + ARROW_HEAD_H_M;
  const foot = base + ARROW_STEM_H_M;
  const xs = new Float64Array([cx, cx + hw, cx + sw, cx + sw, cx - sw, cx - sw, cx - hw]);
  const ys = new Float64Array([top, base, base, foot, foot, base, base]);
  return {
    lamp,
    style: "fill",
    xs,
    ys,
    closed: true,
    lineWidth: 0,
    elementDrawn: false,
    lit: INLANE_LIT,
    unlit: INLANE_UNLIT,
    haloRadius: ARROW_HALO_M,
    cx,
    cy,
    lensRadius: hw,
  };
}

/**
 * The ball-save ring around a post circle: a closed polyline of
 * SAVE_RING_POINTS on the centerline R + gap + width / 2, stroked at the ring
 * width, so its inner edge sits SAVE_RING_GAP_M outside the collider (D-07).
 */
function ringShape(el: ResolvedElement): LampShape | null {
  const c = el.circle;
  if (!c) return null;
  const rc = c.radius + SAVE_RING_GAP_M + SAVE_RING_WIDTH_M / 2;
  const xs = new Float64Array(SAVE_RING_POINTS);
  const ys = new Float64Array(SAVE_RING_POINTS);
  for (let i = 0; i < SAVE_RING_POINTS; i++) {
    const t = (2 * Math.PI * i) / SAVE_RING_POINTS;
    xs[i] = c.center.x + rc * Math.cos(t);
    ys[i] = c.center.y + rc * Math.sin(t);
  }
  return {
    lamp: LAMP_SAVE,
    style: "stroke",
    xs,
    ys,
    closed: true,
    lineWidth: SAVE_RING_WIDTH_M,
    elementDrawn: false,
    lit: SAVE_LIT,
    unlit: SAVE_UNLIT,
    haloRadius: SAVE_RING_HALO_M,
    cx: c.center.x,
    cy: c.center.y,
    lensRadius: rc,
  };
}

/**
 * The lamp shape table: the three rollover strokes from elements 400-402 (a
 * missing element has no shape), then the three skill chevrons (each
 * CHEVRON_DROP_M below its `SKILL_SHOT_LANES` rollover's midpoint), then the
 * two inlane arrows (each ARROW_RISE_M above its lane sensor's midpoint), then
 * the ball-save ring around the "post" element (none without one). Every lens
 * is placed from its resolved element, never a copied coordinate (06-REVIEW
 * WR-03), so a missing element has no lens.
 */
export function buildLampShapes(elements: readonly ResolvedElement[]): readonly LampShape[] {
  const out: LampShape[] = [];
  for (const [id, lamp] of ROLLOVER_LAMPS) {
    const el = elements.find((e) => e.id === id && e.kind === "rollover");
    const s = el ? rolloverShape(el, lamp) : null;
    if (s) out.push(s);
  }
  for (let i = 0; i < SKILL_SHOT_LANES.length; i++) {
    const id = SKILL_SHOT_LANES[i];
    const lamp = SKILL_LAMPS[i];
    if (lamp === undefined) continue; // a lane with no chevron lamp has no lens
    const el = elements.find((e) => e.id === id && e.kind === "rollover");
    if (!el) continue;
    const m = pathMidpoint(el);
    out.push(chevronShape(m.x, m.y + CHEVRON_DROP_M, lamp));
  }
  for (const [id, lamp] of INLANE_LAMPS) {
    const el = elements.find((e) => e.id === id && e.kind === "lane");
    if (!el) continue;
    const m = pathMidpoint(el);
    out.push(arrowShape(m.x, m.y - ARROW_RISE_M, lamp));
  }
  const post = elements.find((e) => e.kind === "post" && e.circle !== null);
  const ring = post ? ringShape(post) : null;
  if (ring) out.push(ring);
  return out;
}

/** The drawn post at one flourish age (a caller-owned, reused object). */
export interface PostPose {
  /** Drawn radius as a fraction of the collider radius R. */
  scale: number;
  /** Disc and rim alpha. */
  alpha: number;
  /** Flash halo level (FLASH_TIMING.post). */
  flash: number;
  visible: boolean;
}

/**
 * Write the post pose at `age` fixed steps after the kick into `out` (no
 * allocation): rise 0.7R to R over POST_RISE_STEPS, hold R for
 * POST_HOLD_STEPS, sink R to 0.7R with alpha 1 to 0 over POST_SINK_STEPS, then
 * hidden; the flash is `flashLevel` at the post kind's timing (FLASH_BUMPER).
 * A negative, non-finite or spent age is invisible.
 */
export function postPose(age: number, out: PostPose): void {
  if (!Number.isFinite(age) || age < 0 || age >= POST_TOTAL_STEPS) {
    out.visible = false;
    out.scale = 0;
    out.alpha = 0;
    out.flash = 0;
    return;
  }
  out.visible = true;
  out.flash = flashLevel(age, FLASH_TIMING.post.decaySteps, FLASH_TIMING.post.holdSteps);
  if (age < POST_RISE_STEPS) {
    out.scale = POST_LOW_SCALE + ((1 - POST_LOW_SCALE) * age) / POST_RISE_STEPS;
    out.alpha = 1;
  } else if (age <= POST_RISE_STEPS + POST_HOLD_STEPS) {
    out.scale = 1;
    out.alpha = 1;
  } else {
    const u = (age - POST_RISE_STEPS - POST_HOLD_STEPS) / POST_SINK_STEPS;
    out.scale = 1 - (1 - POST_LOW_SCALE) * u;
    out.alpha = 1 - u;
  }
}

/** Per-lamp levels on the fixed-step clock. */
export class LampTracker {
  private readonly lights: LampLights;
  private readonly rules: LampRules;
  private readonly prev = new Float32Array(LAMP_COUNT);
  private readonly cur = new Float32Array(LAMP_COUNT);
  private readonly target = new Uint8Array(LAMP_COUNT);
  /** Updates so far. */
  private lampStep = 0;
  /** `lampStep` when the skill shot last froze (the blink phase origin). */
  private blinkStart = 0;
  /** Whether the previous update saw the skill shot frozen. */
  private wasFrozen = false;
  /** `lampStep` when game over (attract) last began (the chase origin). */
  private attractStart = 0;
  /** Whether the previous update saw game over. */
  private wasAttract = false;
  /** `getSkillShotCount()` as last seen (snapshot at construction). */
  private shots: number;
  /** Chevron held lit by an award, and the updates left on the hold. */
  private holdLamp = -1;
  private holdLeft = 0;
  /** `getSaveCount()` as last seen (snapshot at construction). */
  private saves: number;
  /** `lampStep` when the save lamp last began blinking (its blink origin). */
  private saveBlinkStart = 0;
  /** Whether the previous update saw the save lamp blinking. */
  private wasSaveBlink = false;
  /** `lampStep` of the update that saw the last kickback, or -1. */
  private postStart = -1;

  constructor(lights: LampLights, rules: LampRules) {
    this.lights = lights;
    this.rules = rules;
    this.shots = rules.getSkillShotCount();
    this.saves = rules.getSaveCount();
  }

  /** One fixed step: compute every target, then fade every level toward it. */
  update(): void {
    this.lampStep++;
    const prev = this.prev;
    const cur = this.cur;
    const target = this.target;
    prev.set(cur);
    target.fill(0);

    const attract = this.rules.getState() === "game-over";
    if (attract) {
      if (!this.wasAttract) this.attractStart = this.lampStep;
      this.wasAttract = true;
      const k =
        Math.floor((this.lampStep - this.attractStart) / LAMP_CHASE_DWELL_STEPS) %
        CHASE_ORDER.length;
      target[CHASE_ORDER[k] ?? 0] = 1;
    } else {
      this.wasAttract = false;
      const lights = this.lights;
      for (let i = 0; i < ROLLOVER_LAMPS.length; i++) {
        const r = ROLLOVER_LAMPS[i];
        if (r && lights.isLit(r[0])) target[r[1]] = 1;
      }
      this.updateInlanes(target);
    }

    // Always run: they track the shot and save counts and the blink edges in every state.
    this.updateSkill(target);
    this.updateSave(target, attract);

    for (let i = 0; i < LAMP_COUNT; i++) {
      const c = cur[i] ?? 0;
      const t = target[i] ?? 0;
      if (t > c) {
        const n = c + UP;
        cur[i] = n >= t - SNAP_EPS ? t : n;
      } else if (t < c) {
        const n = c - DOWN;
        cur[i] = n <= t + SNAP_EPS ? t : n;
      }
    }
  }

  /** Inlane arrow targets: the session's per-ball flags (playing and tilted). */
  private updateInlanes(target: Uint8Array): void {
    const rules = this.rules;
    for (let i = 0; i < INLANE_LAMPS.length; i++) {
      const e = INLANE_LAMPS[i];
      if (e && rules.isInlaneScored(e[0])) target[e[1]] = 1;
    }
  }

  /** Chevron targets from the skill-shot getters (only while playing). */
  private updateSkill(target: Uint8Array): void {
    const rules = this.rules;
    const shots = rules.getSkillShotCount();
    if (shots !== this.shots) {
      if (shots > this.shots) {
        this.holdLamp = skillLampOf(rules.getLastSkillLane());
        this.holdLeft = this.holdLamp >= 0 ? LAMP_AWARD_HOLD_STEPS : 0;
      }
      this.shots = shots;
    }

    const phase = rules.getSkillPhase();
    const frozen = phase === "frozen";
    if (frozen && !this.wasFrozen) this.blinkStart = this.lampStep;
    this.wasFrozen = frozen;

    if (rules.getState() !== "playing") {
      this.holdLeft = 0;
      return;
    }
    if (this.holdLeft > 0) {
      this.holdLeft--;
      target[this.holdLamp] = 1;
      return;
    }
    const lamp = skillLampOf(rules.getSkillLitLane());
    if (lamp < 0) return;
    if (phase === "rotating") target[lamp] = 1;
    else if (frozen) {
      const t = (this.lampStep - this.blinkStart) % LAMP_BLINK_PERIOD_STEPS;
      if (t < LAMP_BLINK_PERIOD_STEPS / 2) target[lamp] = 1;
    }
  }

  /**
   * The save ring target and the post flourish clock: a kickback save-count
   * increment starts the flourish on this update; the ring follows the save
   * lamp phase (never in attract).
   */
  private updateSave(target: Uint8Array, attract: boolean): void {
    const rules = this.rules;
    const saves = rules.getSaveCount();
    if (saves !== this.saves) {
      if (saves > this.saves && rules.getLastSaveKind() === "kickback") {
        this.postStart = this.lampStep;
      }
      this.saves = saves;
    }

    const phase = rules.getSaveLampPhase();
    const blink = phase === "blink";
    if (blink && !this.wasSaveBlink) this.saveBlinkStart = this.lampStep;
    this.wasSaveBlink = blink;

    if (attract) return;
    if (phase === "steady") target[LAMP_SAVE] = 1;
    else if (blink) {
      const t = (this.lampStep - this.saveBlinkStart) % LAMP_BLINK_PERIOD_STEPS;
      if (t < LAMP_BLINK_PERIOD_STEPS / 2) target[LAMP_SAVE] = 1;
    }
  }

  /**
   * Post flourish age at the render point (fixed steps since the kickback,
   * plus `alpha` clamped to [0, 1]), or -1 when no flourish is showing.
   */
  postAge(alpha: number): number {
    if (this.postStart < 0) return -1;
    const n = this.lampStep - this.postStart;
    if (n >= POST_TOTAL_STEPS) return -1;
    const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
    return n + a;
  }

  /**
   * Level of `lamp` at the render point between the last two steps:
   * prev + (cur - prev) * alpha, alpha clamped to [0, 1]. 0 out of range.
   */
  level(lamp: number, alpha: number): number {
    if (!Number.isInteger(lamp) || lamp < 0 || lamp >= LAMP_COUNT) return 0;
    const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
    const p = this.prev[lamp] ?? 0;
    const c = this.cur[lamp] ?? 0;
    return p + (c - p) * a;
  }
}

/** The read side of the lamp clock (a `LampTracker` in production): levels and the post flourish. */
export type LampReader = Pick<LampTracker, "level" | "postAge">;
