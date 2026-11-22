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
 *
 * `buildLampShapes(elements)` is the shape table the renderer's lamp pass (and
 * the unlit bake) iterate: vertex lists in preallocated Float64Arrays, built
 * once. A later lamp is one more row here, with no renderer edit.
 *
 * Allocation-free after construction; DOM-free and engine-free.
 */

import type { GameSession } from "../game/game-session";
import type { ResolvedElement } from "../table/resolve";
import { ROLLOVER_LIT, ROLLOVER_UNLIT, RUBBER_LINE_M, SKILL_LIT, SKILL_UNLIT } from "./palette";
import { SENSOR_HALO_M } from "./sprites";

/** The rules' boolean light state (`ReactiveElements`). */
export interface LampLights {
  isLit(elementId: number): boolean;
}

/** The read-only session getters the lamps show. */
export type LampRules = Pick<
  GameSession,
  "getState" | "getSkillPhase" | "getSkillLitLane" | "getSkillShotCount" | "getLastSkillLane"
>;

/** Lamp indices into the level arrays. */
export const LAMP_ROLLOVER_400 = 0;
export const LAMP_ROLLOVER_401 = 1;
export const LAMP_ROLLOVER_402 = 2;
export const LAMP_SKILL_400 = 3;
export const LAMP_SKILL_401 = 4;
export const LAMP_SKILL_402 = 5;
/** Number of lamps. */
export const LAMP_COUNT = 6;

/** Fixed steps from unlit to fully lit. */
export const LAMP_FADE_IN_STEPS = 4;
/** Fixed steps from fully lit to unlit (the incandescent tail). */
export const LAMP_FADE_OUT_STEPS = 15;
/** One blink cycle: on for the first half, off for the second (2 Hz at 120 Hz). */
export const LAMP_BLINK_PERIOD_STEPS = 60;
/** Steps a skill-shot award holds its chevron steady. */
export const LAMP_AWARD_HOLD_STEPS = 60;

/** Skill chevron: an upward chevron this wide and tall, with this arm thickness (m). */
const CHEVRON_W_M = 0.2;
const CHEVRON_H_M = 0.12;
const CHEVRON_ARM_M = 0.05;
/** Chevron centers (m), just below lanes 400, 401 and 402. */
const CHEVRON_Y_M = 1.32;
const CHEVRON_XS_M: readonly number[] = [0.95, 1.45, 1.95];
/** Chevron halo radius (m). */
const CHEVRON_HALO_M = 0.16;

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

/** The chevron lamp under a skill lane, or -1. */
function skillLampOf(laneId: number): number {
  switch (laneId) {
    case 400:
      return LAMP_SKILL_400;
    case 401:
      return LAMP_SKILL_401;
    case 402:
      return LAMP_SKILL_402;
    default:
      return -1;
  }
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
 * The lamp shape table: the three rollover strokes from elements 400-402 (a
 * missing element has no shape), then the three skill chevrons.
 */
export function buildLampShapes(elements: readonly ResolvedElement[]): readonly LampShape[] {
  const out: LampShape[] = [];
  for (const [id, lamp] of ROLLOVER_LAMPS) {
    const el = elements.find((e) => e.id === id && e.kind === "rollover");
    const s = el ? rolloverShape(el, lamp) : null;
    if (s) out.push(s);
  }
  for (let i = 0; i < CHEVRON_XS_M.length; i++) {
    out.push(chevronShape(CHEVRON_XS_M[i] ?? 0, CHEVRON_Y_M, LAMP_SKILL_400 + i));
  }
  return out;
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
  /** `getSkillShotCount()` as last seen (snapshot at construction). */
  private shots: number;
  /** Chevron held lit by an award, and the updates left on the hold. */
  private holdLamp = -1;
  private holdLeft = 0;

  constructor(lights: LampLights, rules: LampRules) {
    this.lights = lights;
    this.rules = rules;
    this.shots = rules.getSkillShotCount();
  }

  /** One fixed step: compute every target, then fade every level toward it. */
  update(): void {
    this.lampStep++;
    const prev = this.prev;
    const cur = this.cur;
    const target = this.target;
    prev.set(cur);
    target.fill(0);

    const lights = this.lights;
    for (let i = 0; i < ROLLOVER_LAMPS.length; i++) {
      const r = ROLLOVER_LAMPS[i];
      if (r && lights.isLit(r[0])) target[r[1]] = 1;
    }

    this.updateSkill(target);

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

/** The read side of the lamp clock (a `LampTracker` in production). */
export type LampReader = Pick<LampTracker, "level">;
