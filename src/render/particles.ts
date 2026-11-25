/**
 * Impact particles (PLSH-02, D-19): one struct-of-arrays pool on the fixed-step
 * clock.
 *
 * - Every field is a typed array preallocated at `capacity` (Float32Array for
 *   the scalars, Uint8Array for the kind code); nothing is allocated after
 *   construction (T-6-27).
 * - Emission writes the slot at the ring head and advances it, so a full pool
 *   overwrites its oldest particle and never grows.
 * - The pool owns its own seeded `mulberry32` stream; the global random source
 *   is never used, so the same emits on the same steps give the same particles
 *   at every render cadence (T-6-26, D-23).
 * - Emission happens on the step path (the `FxSink` calls inside a fixed step)
 *   and `tick()` runs once per fixed step in `onPostStep`, so a particle pauses
 *   with the simulation and never reads a wall clock.
 * - The renderer reads the arrays at `alpha` (between `px/py` and `x/y`) and
 *   never writes them.
 *
 * A slot is live while `age < life`; a fresh pool has every slot dead (both 0).
 * Sparks (bumper, sling and save) feel drag PARTICLE_DRAG_PER_S and gravity
 * PARTICLE_GRAVITY along +y; motes drift at constant velocity (no drag, no
 * gravity); rings and glints never move, they only age (the renderer grows a
 * ring from `size` and scales a glint's baked star with its age).
 * A spark's life is capped at emit so it never travels farther than
 * PARTICLE_MAX_TRAVEL_M from its spawn point (photosensitive footprint, T-6-25).
 *
 * Reward particles (06-13, D-19): a rollover, inlane or skill-shot award is one
 * static glint (GLINT_LIFE_STEPS fixed steps) plus a few motes drifting up-table
 * (-y), each kind code carrying the reward's color for the renderer.
 *
 * DOM-free and engine-free.
 */

import { mulberry32 } from "../harness/prng";
import { FIXED_DT } from "../physics/constants";

/** Pool slots (UI-SPEC: 160). */
export const PARTICLE_CAPACITY = 160;
/** Seed of the pool's own random stream. */
export const PARTICLE_SEED = 0x5eed0612;
/** Linear velocity drag per second (v *= 1 - drag * dt each step). */
export const PARTICLE_DRAG_PER_S = 4;
/** Downward (+y) acceleration on sparks, m/s^2. */
export const PARTICLE_GRAVITY = 2;

/** Kind code of a dead or never-used slot. */
export const KIND_NONE = 0;
/** A spark off a pop bumper (FLASH_BUMPER). */
export const SPARK_BUMPER = 1;
/** A spark off a slingshot rubber (SLING_RUBBER). */
export const SPARK_SLING = 2;
/** A bumper shockwave ring (FLASH_BUMPER). */
export const RING = 3;
/** Reward glints: one baked star at the sensor (06-13, D-19). */
export const GLINT_ROLLOVER = 4;
export const GLINT_INLANE = 5;
export const GLINT_SKILL = 6;
/** Reward motes: small discs drifting up-table. */
export const MOTE_ROLLOVER = 7;
export const MOTE_INLANE = 8;
export const MOTE_SKILL = 9;
/** A spark off the ball-save post on a kickback save (SAVE_LIT). */
export const SPARK_SAVE = 10;

/** A glint lives this many fixed steps (UI-SPEC: 42 steps, 0.35 s). */
export const GLINT_LIFE_STEPS = 42;
/** Mote speed range (m/s), up-table. */
export const MOTE_SPEED_MIN = 0.15;
export const MOTE_SPEED_MAX = 0.3;
/** Mote heading: within +/- this angle of straight up (-y), the horizontal jitter. */
export const MOTE_JITTER_RAD = (15 * Math.PI) / 180;
/** Mote life range (s). */
export const MOTE_LIFE_MIN = 0.6;
export const MOTE_LIFE_MAX = 0.8;
/** Drawn mote radius (m, UI-SPEC). */
export const MOTE_RADIUS_M = 0.018;

/**
 * Farthest a spark may travel from its spawn point before it dies, m
 * (photosensitive footprint, T-6-25: the bound is about 0.63 m; 0.6 leaves
 * headroom for float32 storage).
 */
export const PARTICLE_MAX_TRAVEL_M = 0.6;

/** Velocity factor applied every step. */
const DAMP = 1 - PARTICLE_DRAG_PER_S * FIXED_DT;
/** Gravity velocity gain per step. */
const GRAVITY_STEP = PARTICLE_GRAVITY * FIXED_DT;

/**
 * Upper bound on how far a spark launched at `speed` gets from its spawn point
 * in `steps` ticks of `tick()`. The tick law integrates exactly to a launch
 * part `speed * DAMP * (1 - DAMP^n) / drag` along the launch direction plus a
 * gravity part `(g / drag) * (n * dt - DAMP * (1 - DAMP^n) / drag)` along +y;
 * their sum bounds the distance for every direction (triangle inequality) and
 * grows with `steps`, so it also bounds every earlier step.
 */
export function sparkTravelBound(speed: number, steps: number): number {
  const k = PARTICLE_DRAG_PER_S;
  const decay = DAMP * (1 - Math.pow(DAMP, steps));
  return (speed * decay) / k + (PARTICLE_GRAVITY / k) * (steps * FIXED_DT - decay / k);
}

/**
 * `life` shortened, when needed, so a spark of `speed` stays within
 * PARTICLE_MAX_TRAVEL_M. The step count is taken one high to cover float32
 * rounding of the stored age and life; a capped life is a whole number of
 * steps one below the largest count the bound allows.
 */
function capSparkLife(speed: number, life: number): number {
  let steps = Math.ceil(life / FIXED_DT) + 1;
  if (sparkTravelBound(speed, steps) <= PARTICLE_MAX_TRAVEL_M) return life;
  while (steps > 1 && sparkTravelBound(speed, steps) > PARTICLE_MAX_TRAVEL_M) steps--;
  return (steps - 1) * FIXED_DT;
}

export class ParticlePool {
  readonly capacity: number;
  /** Position now (m). */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Position one step ago (m), for interpolation at `alpha`. */
  readonly px: Float32Array;
  readonly py: Float32Array;
  /** Velocity (m/s). */
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** Age and life (s); live while `age < life`. */
  readonly age: Float32Array;
  readonly life: Float32Array;
  /** Kind-specific size (a ring's start radius, m). */
  readonly size: Float32Array;
  /** Kind code per slot. */
  readonly kind: Uint8Array;
  private readonly random: () => number;
  private head = 0;

  constructor(capacity: number = PARTICLE_CAPACITY, seed: number = PARTICLE_SEED) {
    const cap = Number.isFinite(capacity) && capacity >= 1 ? Math.floor(capacity) : 1;
    this.capacity = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.random = mulberry32(seed);
  }

  /**
   * One spark at (x, y): its direction lies within +/- `spreadRad` of the
   * (nx, ny) direction, its speed in [speedMin, speedMax] and its life in
   * [lifeMin, lifeMax], each drawn from the pool's stream (angle, speed, life).
   * The life is then capped so the spark's travel stays within
   * PARTICLE_MAX_TRAVEL_M (T-6-25); the draws are unchanged, so the stream
   * stays in step. Overwrites the oldest slot.
   */
  emitSpark(
    kind: number,
    x: number,
    y: number,
    nx: number,
    ny: number,
    spreadRad: number,
    speedMin: number,
    speedMax: number,
    lifeMin: number,
    lifeMax: number,
  ): void {
    const rnd = this.random;
    const angle = Math.atan2(ny, nx) + (2 * rnd() - 1) * spreadRad;
    const speed = speedMin + (speedMax - speedMin) * rnd();
    const life = capSparkLife(speed, lifeMin + (lifeMax - lifeMin) * rnd());
    this.place(kind, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 0);
  }

  /** One shockwave ring centered at (x, y), starting at `radius`, for `lifeSeconds`. */
  emitRing(x: number, y: number, radius: number, lifeSeconds: number): void {
    this.place(RING, x, y, 0, 0, lifeSeconds, radius);
  }

  /**
   * One reward glint of `kind` at (x, y): static, GLINT_LIFE_STEPS fixed steps
   * long. Draws nothing from the stream. Overwrites the oldest slot.
   */
  emitGlint(kind: number, x: number, y: number): void {
    this.place(kind, x, y, 0, 0, GLINT_LIFE_STEPS * FIXED_DT, 0);
  }

  /**
   * One reward mote of `kind` at (x, y), drifting up-table: its speed in
   * [MOTE_SPEED_MIN, MOTE_SPEED_MAX], its heading within +/- MOTE_JITTER_RAD of
   * straight up and its life in [MOTE_LIFE_MIN, MOTE_LIFE_MAX], each drawn from
   * the pool's stream (speed, heading, life). Overwrites the oldest slot.
   */
  emitMote(kind: number, x: number, y: number): void {
    const rnd = this.random;
    const speed = MOTE_SPEED_MIN + (MOTE_SPEED_MAX - MOTE_SPEED_MIN) * rnd();
    const heading = (2 * rnd() - 1) * MOTE_JITTER_RAD;
    const life = MOTE_LIFE_MIN + (MOTE_LIFE_MAX - MOTE_LIFE_MIN) * rnd();
    this.place(
      kind,
      x,
      y,
      Math.sin(heading) * speed,
      -Math.cos(heading) * speed,
      life,
      MOTE_RADIUS_M,
    );
  }

  /** One draw in [0, 1) from the pool's own stream (emitter counts). */
  draw(): number {
    return this.random();
  }

  /** Write one particle at the ring head and advance it. */
  private place(
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
  ): void {
    const i = this.head;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.head = i + 1 < this.capacity ? i + 1 : 0;
  }

  /** Advance every live slot one fixed step. */
  tick(): void {
    const n = this.capacity;
    const x = this.x;
    const y = this.y;
    const vx = this.vx;
    const vy = this.vy;
    const age = this.age;
    const life = this.life;
    for (let i = 0; i < n; i++) {
      const a = age[i] ?? 0;
      if (!(a < (life[i] ?? 0))) continue;
      const cx = x[i] ?? 0;
      const cy = y[i] ?? 0;
      this.px[i] = cx;
      this.py[i] = cy;
      const k = this.kind[i];
      if (k === SPARK_BUMPER || k === SPARK_SLING || k === SPARK_SAVE) {
        const nvx = (vx[i] ?? 0) * DAMP;
        const nvy = (vy[i] ?? 0) * DAMP + GRAVITY_STEP;
        vx[i] = nvx;
        vy[i] = nvy;
        x[i] = cx + nvx * FIXED_DT;
        y[i] = cy + nvy * FIXED_DT;
      } else if (k === MOTE_ROLLOVER || k === MOTE_INLANE || k === MOTE_SKILL) {
        x[i] = cx + (vx[i] ?? 0) * FIXED_DT;
        y[i] = cy + (vy[i] ?? 0) * FIXED_DT;
      }
      age[i] = a + FIXED_DT;
    }
  }

  /** Live slots (age < life). */
  aliveCount(): number {
    let c = 0;
    for (let i = 0; i < this.capacity; i++) {
      if ((this.age[i] ?? 0) < (this.life[i] ?? 0)) c++;
    }
    return c;
  }
}
