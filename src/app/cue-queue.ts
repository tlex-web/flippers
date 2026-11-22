/**
 * Presentation cues (Phase 5, AUD-01/RND-03): the vocabulary of things the
 * player should hear or see, a fixed ring that carries them from the 120 Hz
 * step path to the render frame, and the adapter that turns the rules'
 * registered hits (`ReactiveFeedback`) into cues and flashes.
 *
 * Step-path writes, render-frame reads (the collision-router contract):
 * - producers call `push()` on the fixed step; it writes scalars into one of
 *   `capacity` records preallocated at construction, so a push never allocates;
 * - the render frame reads `at(i)` for `i < size`, plays each cue, then calls
 *   `clear()`;
 * - records are pooled and rewritten after `clear()`, so a reader copies out
 *   anything it keeps and never retains the record itself;
 * - on overflow the NEWEST cue is dropped and counted (`dropped`); the ring
 *   never grows (T-05-01).
 *
 * There is no wall or chute cue kind: walls flash but stay silent by
 * construction (D-03).
 *
 * Engine-agnostic and DOM-free: the only import from the rules is a type.
 */

import type { ReactiveFeedback } from "../game/reactive-elements";
import { BALL_RADIUS_M, ballMass } from "../physics/constants";

/** Every presentation cue the game can emit. */
export type CueKind =
  | "bumper"
  | "slingshot"
  | "rollover"
  | "lane"
  | "bank"
  | "flipperUp"
  | "flipperDown"
  | "launch"
  | "drain"
  | "tilt"
  | "warning"
  | "start"
  | "gameOver"
  | "nudge"
  | "skillShot"
  | "ballSave"
  | "highScore"
  | "bonusTick";

/** All 18 cue kinds, for exhaustive tests. */
export const CUE_KINDS: readonly CueKind[] = Object.freeze([
  "bumper",
  "slingshot",
  "rollover",
  "lane",
  "bank",
  "flipperUp",
  "flipperDown",
  "launch",
  "drain",
  "tilt",
  "warning",
  "start",
  "gameOver",
  "nudge",
  "skillShot",
  "ballSave",
  "highScore",
  "bonusTick",
]);

/** One recorded cue, as the render frame reads it. */
export interface Cue {
  readonly kind: CueKind;
  readonly elementId: number;
  /** In [0, 1]; clamped on push. */
  readonly strength: number;
}

/** Ring capacity: far above a frame's worth of cues (bumper rearm caps ~60/s). */
export const CUE_QUEUE_CAPACITY = 64;

/** Ball speed change (m/s) that counts as a full-strength kick (research A4). */
export const KICK_REF_SPEED = 8;

/** A soft registered kick still flashes at least this strong. */
export const KICK_FLASH_FLOOR = 0.5;

/** Clamp to [0, 1]; NaN and anything <= 0 become 0. */
export function clamp01(x: number): number {
  if (!(x > 0)) return 0;
  return x >= 1 ? 1 : x;
}

/**
 * Kick strength from a raw post-solve impulse: the ball's speed change J / m
 * normalized to `refSpeed`, clamped to [0, 1].
 */
export function impulseStrength(
  normalImpulse: number,
  ballMassKg: number,
  refSpeed: number = KICK_REF_SPEED,
): number {
  return clamp01(normalImpulse / (ballMassKg * refSpeed));
}

/** Where element flashes are recorded (the render side implements it). */
export interface FlashSink {
  record(elementId: number, strength: number): void;
}

/**
 * Where registered hits reach the presentation effects (06-09: the screen
 * shake; the particle plans extend it). Step-path writes of scalars only; the
 * render side implements it and never holds a world or rules handle.
 */
export interface FxSink {
  onKick(kind: "bumper" | "slingshot", elementId: number, strength: number): void;
  onSensor(kind: "rollover" | "lane", elementId: number, bank: boolean): void;
}

/** A pooled, mutable cue record. */
interface CueRecord {
  kind: CueKind;
  elementId: number;
  strength: number;
}

/** Fixed-capacity FIFO of cues; drop-newest on overflow, never grows. */
export class CueQueue {
  private readonly records: CueRecord[];
  private readonly capacity: number;
  private count = 0;
  private droppedCount = 0;

  constructor(capacity: number = CUE_QUEUE_CAPACITY) {
    const cap = Math.max(1, Math.floor(capacity));
    this.capacity = cap;
    this.records = new Array<CueRecord>(cap);
    for (let i = 0; i < cap; i++) {
      this.records[i] = { kind: "bumper", elementId: -1, strength: 0 };
    }
  }

  /**
   * Record a cue. Strength is clamped to [0, 1] (NaN as 0). Returns false and
   * counts a drop when the ring is full.
   */
  push(kind: CueKind, elementId: number, strength: number): boolean {
    if (this.count >= this.capacity) {
      this.droppedCount++;
      return false;
    }
    const r = this.records[this.count];
    if (!r) return false;
    r.kind = kind;
    r.elementId = elementId;
    r.strength = clamp01(strength);
    this.count++;
    return true;
  }

  /** Cues recorded since the last `clear()`. */
  get size(): number {
    return this.count;
  }

  /** The i-th oldest cue, or undefined out of range. Do not retain it. */
  at(i: number): Cue | undefined {
    if (!(i >= 0 && i < this.count)) return undefined;
    return this.records[i];
  }

  /** Forget every recorded cue (the records are reused). */
  clear(): void {
    this.count = 0;
  }

  /** Cues dropped on overflow since construction. */
  get dropped(): number {
    return this.droppedCount;
  }
}

/** Mass of the game ball, computed once (never hardcoded). */
const BALL_MASS = ballMass(BALL_RADIUS_M);

/**
 * Turns the rules' registered hits into cues, flashes and effects (the optional
 * `FxSink`, forwarded after the cue and flash writes). Total: scalar writes
 * only, no allocation, no world or rules handle (T-05-03).
 */
export class CueFeedback implements ReactiveFeedback {
  private readonly cues: CueQueue;
  private readonly flash: FlashSink | null;
  private readonly fx: FxSink | null;

  constructor(cues: CueQueue, flash: FlashSink | null = null, fx: FxSink | null = null) {
    this.cues = cues;
    this.flash = flash;
    this.fx = fx;
  }

  onKick(kind: "bumper" | "slingshot", elementId: number, normalImpulse: number): void {
    const s = impulseStrength(normalImpulse, BALL_MASS);
    this.cues.push(kind, elementId, s);
    if (this.flash) this.flash.record(elementId, Math.max(KICK_FLASH_FLOOR, s));
    if (this.fx) this.fx.onKick(kind, elementId, s);
  }

  onSensor(kind: "rollover" | "lane", elementId: number, bank: boolean): void {
    this.cues.push(bank ? "bank" : kind, elementId, 1);
    if (this.flash) this.flash.record(elementId, 1);
    if (this.fx) this.fx.onSensor(kind, elementId, bank);
  }
}
