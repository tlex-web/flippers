/**
 * Presentation effects (06-09, D-17, D-23/D-24): the one tracker the step path
 * writes and the renderer reads.
 *
 * Inputs, all step-path scalar writes:
 * - `FxSink` (from `CueFeedback`): registered bumper and slingshot kicks add
 *   trauma at TRAUMA_BUMPER / TRAUMA_SLING times the kick strength and burst
 *   into particles at the contact point (06-12, PLSH-02, D-19): a bumper emits
 *   one shockwave ring at its center and round(12 + 4 * strength) sparks from
 *   its rim, a slingshot round(6 + 4 * strength) sparks along its kick-face
 *   normal; a rollover or inlane pass adds no shake (D-17: the bank bonus gets
 *   lights only) but sparkles (06-13, D-19): one reward glint and 3 or 4 motes
 *   at the sensor's path midpoint, in the rollover kinds for "rollover" (a
 *   bank pass is a rollover pass) and the inlane kinds for "lane";
 * - `ObserverFx` (from `PresentationObserver`): an accepted nudge kicks the view,
 *   a tilt adds TRAUMA_TILT, a drain adds TRAUMA_DRAIN; a skill-shot award
 *   plays the reward glint and motes in the skill kinds at the awarded lane, and
 *   a kickback save throws SAVE_SPARK_COUNT save sparks from the top of the post
 *   within SAVE_SPARK_SPREAD_RAD of straight up (06-13); a backstop save throws
 *   none (it already shakes as a drain).
 * `tick()` runs once per fixed step in `onPostStep` (after `lamps.update()`,
 * before `flash.tick()`) and advances every effect clock.
 *
 * Read-only by construction: it holds the resolved table geometry (emitter
 * geometry is precomputed from it per element id) and no world or rules
 * handle, so nothing here can write the simulation. Allocation-free after
 * construction. Particles stay on under reduced motion (D-18).
 */

import type { FxSink, ObserverFx } from "../app/cue-queue";
import { deriveKickFace } from "../game/reactive-elements";
import type { SaveKind } from "../game/game-session";
import type { NudgeDir } from "../game/tuning";
import { FIXED_DT } from "../physics/constants";
import { pathMidpoint, type ResolvedElement } from "../table/resolve";
import { maxElementId } from "./flash";
import {
  GLINT_INLANE,
  GLINT_ROLLOVER,
  GLINT_SKILL,
  MOTE_INLANE,
  MOTE_ROLLOVER,
  MOTE_SKILL,
  ParticlePool,
  SPARK_BUMPER,
  SPARK_SAVE,
  SPARK_SLING,
} from "./particles";
import { ShakeTracker, TRAUMA_BUMPER, TRAUMA_DRAIN, TRAUMA_SLING, TRAUMA_TILT } from "./shake";

const DEG = Math.PI / 180;

/** Bumper shockwave ring life: 24 fixed steps (UI-SPEC). */
export const RING_LIFE_S = 24 * FIXED_DT;
/** Bumper sparks: count round(BASE + PER_STRENGTH * s), spread, speed and life (D-19). */
export const BUMPER_SPARK_BASE = 12;
export const BUMPER_SPARK_PER_STRENGTH = 4;
export const BUMPER_SPARK_SPREAD_RAD = 80 * DEG;
export const BUMPER_SPARK_SPEED_MIN = 1.5;
export const BUMPER_SPARK_SPEED_MAX = 3.0;
export const BUMPER_SPARK_LIFE_MIN = 0.3;
export const BUMPER_SPARK_LIFE_MAX = 0.45;
/** Slingshot sparks (UI-SPEC: round(6 + 4s), +/- 35 degrees of the face normal). */
export const SLING_SPARK_BASE = 6;
export const SLING_SPARK_PER_STRENGTH = 4;
export const SLING_SPARK_SPREAD_RAD = 35 * DEG;
export const SLING_SPARK_SPEED_MIN = 1.2;
export const SLING_SPARK_SPEED_MAX = 2.4;
export const SLING_SPARK_LIFE_MIN = 0.2;
export const SLING_SPARK_LIFE_MAX = 0.32;

/** Motes per reward: REWARD_MOTES_MIN or one more, drawn from the pool's stream (UI-SPEC: 3-4). */
export const REWARD_MOTES_MIN = 3;
/**
 * Kickback save sparks (UI-SPEC post flourish): this many, within +/- the
 * spread of straight up (0, -1) from the post's top rim, on the bumper
 * (impact) speed and life ranges.
 */
export const SAVE_SPARK_COUNT = 10;
export const SAVE_SPARK_SPREAD_RAD = 80 * DEG;

/** Spark count for a kick strength, with the strength clamped to [0, 1]. */
function sparkCount(base: number, perStrength: number, strength: number): number {
  const s = strength > 0 ? (strength < 1 ? strength : 1) : 0;
  return Math.round(base + perStrength * s);
}

export class EffectsTracker implements FxSink, ObserverFx {
  /** The whole-view shake (kick and trauma). */
  readonly shake: ShakeTracker = new ShakeTracker();
  /** The particles (bumper rings and sparks, sling sparks, reward glints and motes). */
  readonly particles: ParticlePool = new ParticlePool();
  /** The resolved table, for the emitter geometry. */
  readonly elements: readonly ResolvedElement[];
  /** Per element id: a bumper's center and radius (radius 0 when not a bumper). */
  private readonly bumperX: Float64Array;
  private readonly bumperY: Float64Array;
  private readonly bumperR: Float64Array;
  /** Per element id: a slingshot's unit kick-face normal (0, 0 when none). */
  private readonly slingNx: Float64Array;
  private readonly slingNy: Float64Array;
  /** Per element id: a rollover or inlane sensor's path midpoint, and whether it is one. */
  private readonly sensorX: Float64Array;
  private readonly sensorY: Float64Array;
  private readonly sensorOk: Uint8Array;
  /** The ball-save post's center and radius (radius 0 when the table has none). */
  private postX = 0;
  private postY = 0;
  private postR = 0;
  private readonly maxId: number;

  constructor(elements: readonly ResolvedElement[]) {
    this.elements = elements;
    const m = maxElementId(elements);
    this.maxId = m;
    this.bumperX = new Float64Array(m + 1);
    this.bumperY = new Float64Array(m + 1);
    this.bumperR = new Float64Array(m + 1);
    this.slingNx = new Float64Array(m + 1);
    this.slingNy = new Float64Array(m + 1);
    this.sensorX = new Float64Array(m + 1);
    this.sensorY = new Float64Array(m + 1);
    this.sensorOk = new Uint8Array(m + 1);
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el || !(el.id >= 0)) continue;
      if (el.kind === "bumper" && el.circle) {
        this.bumperX[el.id] = el.circle.center.x;
        this.bumperY[el.id] = el.circle.center.y;
        this.bumperR[el.id] = el.circle.radius;
      } else if (el.kind === "slingshot") {
        const face = deriveKickFace(el);
        if (face) {
          this.slingNx[el.id] = face.nx;
          this.slingNy[el.id] = face.ny;
        }
      } else if ((el.kind === "rollover" || el.kind === "lane") && el.vertices.length > 0) {
        const mid = pathMidpoint(el);
        this.sensorX[el.id] = mid.x;
        this.sensorY[el.id] = mid.y;
        this.sensorOk[el.id] = 1;
      } else if (el.kind === "post" && el.circle) {
        this.postX = el.circle.center.x;
        this.postY = el.circle.center.y;
        this.postR = el.circle.radius;
      }
    }
  }

  /**
   * A registered kick at contact point (px, py): trauma scaled by the kick
   * strength, then the particle burst for the element (none for an unknown id).
   */
  onKick(
    kind: "bumper" | "slingshot",
    elementId: number,
    strength: number,
    px: number,
    py: number,
  ): void {
    this.shake.addTrauma((kind === "bumper" ? TRAUMA_BUMPER : TRAUMA_SLING) * strength);
    if (!Number.isInteger(elementId) || elementId < 0 || elementId > this.maxId) return;
    if (kind === "bumper") this.burstBumper(elementId, strength, px, py);
    else this.burstSling(elementId, strength, px, py);
  }

  /** One ring at the bumper center and the sparks from the rim point toward the contact. */
  private burstBumper(id: number, strength: number, px: number, py: number): void {
    const r = this.bumperR[id] ?? 0;
    if (!(r > 0)) return;
    const cx = this.bumperX[id] ?? 0;
    const cy = this.bumperY[id] ?? 0;
    let nx = px - cx;
    let ny = py - cy;
    const len = Math.hypot(nx, ny);
    if (len > 1e-9 && Number.isFinite(len)) {
      nx /= len;
      ny /= len;
    } else {
      nx = 0;
      ny = -1;
    }
    const pool = this.particles;
    pool.emitRing(cx, cy, r, RING_LIFE_S);
    const sx = cx + r * nx;
    const sy = cy + r * ny;
    const n = sparkCount(BUMPER_SPARK_BASE, BUMPER_SPARK_PER_STRENGTH, strength);
    for (let k = 0; k < n; k++) {
      pool.emitSpark(
        SPARK_BUMPER,
        sx,
        sy,
        nx,
        ny,
        BUMPER_SPARK_SPREAD_RAD,
        BUMPER_SPARK_SPEED_MIN,
        BUMPER_SPARK_SPEED_MAX,
        BUMPER_SPARK_LIFE_MIN,
        BUMPER_SPARK_LIFE_MAX,
      );
    }
  }

  /** Sparks from the contact point along the sling's kick-face normal. */
  private burstSling(id: number, strength: number, px: number, py: number): void {
    const nx = this.slingNx[id] ?? 0;
    const ny = this.slingNy[id] ?? 0;
    if (nx === 0 && ny === 0) return;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const pool = this.particles;
    const n = sparkCount(SLING_SPARK_BASE, SLING_SPARK_PER_STRENGTH, strength);
    for (let k = 0; k < n; k++) {
      pool.emitSpark(
        SPARK_SLING,
        px,
        py,
        nx,
        ny,
        SLING_SPARK_SPREAD_RAD,
        SLING_SPARK_SPEED_MIN,
        SLING_SPARK_SPEED_MAX,
        SLING_SPARK_LIFE_MIN,
        SLING_SPARK_LIFE_MAX,
      );
    }
  }

  /**
   * A rollover or inlane pass (a bank completion is a rollover pass): no shake
   * (D-17: the bank gets lights only), one reward glint and its motes at the
   * sensor's midpoint (06-13, D-19). An unknown or non-sensor id emits nothing.
   */
  onSensor(kind: "rollover" | "lane", elementId: number): void {
    if (kind === "lane") this.reward(GLINT_INLANE, MOTE_INLANE, elementId);
    else this.reward(GLINT_ROLLOVER, MOTE_ROLLOVER, elementId);
  }

  /** One glint of `glintKind` and 3 or 4 motes of `moteKind` at sensor `id`'s midpoint. */
  private reward(glintKind: number, moteKind: number, id: number): void {
    if (!Number.isInteger(id) || id < 0 || id > this.maxId) return;
    if (this.sensorOk[id] !== 1) return;
    const x = this.sensorX[id] ?? 0;
    const y = this.sensorY[id] ?? 0;
    const pool = this.particles;
    pool.emitGlint(glintKind, x, y);
    const n = REWARD_MOTES_MIN + (pool.draw() < 0.5 ? 0 : 1);
    for (let k = 0; k < n; k++) pool.emitMote(moteKind, x, y);
  }

  /**
   * A skill-shot award through lane `laneId`: the reward glint and motes in the
   * skill kinds at that rollover's midpoint (an unknown or non-sensor id, such
   * as -1 before any award, emits nothing).
   */
  onSkillShot(laneId: number): void {
    this.reward(GLINT_SKILL, MOTE_SKILL, laneId);
  }

  /**
   * A ball save: a kickback throws SAVE_SPARK_COUNT save sparks from the post's
   * top rim point, spread around straight up; a backstop (or "none") emits
   * nothing.
   */
  onSave(kind: SaveKind | "none"): void {
    if (kind !== "kickback") return;
    const r = this.postR;
    if (!(r > 0)) return;
    const pool = this.particles;
    const sx = this.postX;
    const sy = this.postY - r;
    for (let k = 0; k < SAVE_SPARK_COUNT; k++) {
      pool.emitSpark(
        SPARK_SAVE,
        sx,
        sy,
        0,
        -1,
        SAVE_SPARK_SPREAD_RAD,
        BUMPER_SPARK_SPEED_MIN,
        BUMPER_SPARK_SPEED_MAX,
        BUMPER_SPARK_LIFE_MIN,
        BUMPER_SPARK_LIFE_MAX,
      );
    }
  }

  /** An accepted nudge: the view kicks opposite the ball's impulse. */
  onNudge(dir: NudgeDir): void {
    this.shake.kick(dir);
  }

  /** The game tilted. */
  onTilt(): void {
    this.shake.addTrauma(TRAUMA_TILT);
  }

  /** A drain (one per drain-count increment). */
  onDrain(): void {
    this.shake.addTrauma(TRAUMA_DRAIN);
  }

  /** Advance every effect one fixed step. */
  tick(): void {
    this.shake.tick();
    this.particles.tick();
  }
}

/** The renderer's read side of the effects. */
export type EffectsReader = Pick<EffectsTracker, "shake" | "particles">;
