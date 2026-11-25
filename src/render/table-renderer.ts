/**
 * Procedural table renderer (RND-01/RND-02, research Patterns 1-3).
 *
 * `resize(view)` sizes the visible canvas from the display (the backing follows
 * the CSS fit, Finding 1), bakes the static playfield once into an offscreen
 * layer and rebuilds the cached gradients. `draw(frame)` fills the backing with
 * BG_BOTTOM at identity, blits that layer with one `drawImage` at the shake
 * offset, sets the shaken world transform and draws only what moves, in this
 * order: insert lamps, element flashes, the ball-save post flourish, both bats
 * at their interpolated angles, the plunger and its charge meter, one baked soft shadow
 * per ball (PLSH-03, D-20), every ball at its interpolated position and, last,
 * the impact particles.
 *
 * Lamp pass (PLSH-04, D-21): every shape in the lamp table (`buildLampShapes`,
 * built once in the constructor) reads its level from the frame's `LampReader`
 * at `frame.alpha`. A lamp above FLASH_EPS draws three layers at its level L:
 * the lens in its lit color at globalAlpha L (a round-capped stroke or a filled
 * polygon over the precomputed vertices), its baked halo under "lighter" at L,
 * and a LAMP_HOTSPOT mark at 0.8 * L (a short stroke over the middle half of an
 * open stroke lens, an arc over the upper-left quarter of a closed stroke lens
 * such as the ball-save ring, a small disc up-left of a fill lens's center). One halo
 * sprite is baked per distinct lit color in the table, after the ball shadow,
 * so a new lamp color needs no renderer edit. Unlit lenses live in the static
 * layer.
 *
 * Flash pass (RND-03): every flashable element reads its level from the frame's
 * `FlashReader` at `frame.alpha` with its kind's timing. A lit element draws only
 * element-local marks under "lighter" with its level as `globalAlpha`: a baked
 * halo sprite (bumpers, rollover and lane passes), a bright stroke of its own
 * outline (sling rubber, sensor, drain apron, wall, chute) or a glowing rim
 * around a bat. Nothing larger than the element is ever drawn (photosensitive
 * safety). Halos are baked once per resize (`bakeHalo`).
 *
 * Post flourish (PLSH-07, D-07, D-10, 06-10): the frame's `LampReader` gives
 * the post age; the pure `postPose` turns it into scale, alpha and flash, and
 * the disc, its SAVE_LIT rim and the flash halo (the ring's SAVE_LIT sprite,
 * no extra bake) are drawn at the "post" element's own circle, after the
 * flash pass and before the bats.
 *
 * Ball shadows (PLSH-03, D-20): one radial sprite baked per resize
 * (`bakeShadow`), stamped source-over at globalAlpha 1 with one `drawImage` per
 * ball at ball center + (SHADOW_OFFSET_X_M, SHADOW_OFFSET_Y_M), a fixed size
 * that never scales with speed.
 *
 * Particle pass (PLSH-02, D-19, 06-12): drawn last, over the balls, under
 * "lighter" from `frame.effects.particles` at `frame.alpha`. One index loop per
 * particle kind with its color assigned once (rings and bumper sparks
 * FLASH_BUMPER, sling sparks SLING_RUBBER); dead slots are skipped. A spark is a
 * streak of length max(PARTICLE_STREAK_MIN_M, speed * PARTICLE_STREAK_S) back
 * along its velocity from its interpolated position, PARTICLE_STREAK_WIDTH_M
 * wide, at globalAlpha (1 - age/life)^2; a ring is an arc of radius
 * size * (1 + age/life) (1.0R to 2.0R, under HALO_SCALE) whose width goes
 * RING_WIDTH_START_M to RING_WIDTH_END_M at 0.9 * (1 - age/life)^2. Save sparks
 * (06-13) are SAVE_LIT streaks on the same model. Reward particles (06-13,
 * D-19): a glint stamps its color's baked star (`bakeStar`, one per glint color
 * per resize: FLASH_SENSOR rollover, INLANE_LIT inlane, SKILL_LIT skill shot)
 * centered on it with side STAR_GLINT_M * (0.6 + 0.4 * age/life), never more
 * than STAR_GLINT_M; a mote is one disc of radius MOTE_RADIUS_M in the same
 * color; both at globalAlpha (1 - age/life)^2. Particles stay on under reduced
 * motion (D-18).
 *
 * Screen shake (PLSH-01, D-17, D-18, research Pitfall 8): `frame.effects.shake`
 * is sampled once per `draw()` at `frame.alpha` into a renderer-owned
 * preallocated pair (whole device pixels, exactly 0 with no effects and under
 * `frame.reducedMotion`, where draw() skips the sample, so no effects source can
 * move the view against the preference). The BG_BOTTOM fill comes first so a
 * shaken blit never uncovers an edge strip, the static blit lands at
 * (shakeX, shakeY), and every world transform in the frame (the frame start, the
 * flipper flash, the bats and the balls) goes through one `resetWorld()` with
 * offX + shakeX and offY + shakeY, so no layer swims against the table. The
 * renderer never writes the tracker's state. The DOM HUD never shakes.
 *
 * Frame rules (Pitfalls 3-4): no string building, no gradient creation, no
 * closures, no shadowBlur or filter and no save()/restore() in `draw()`; index
 * loops only; every frame ends with
 * `globalAlpha` 1 and `globalCompositeOperation` "source-over". The canvas paints
 * no text (D-01: the HUD is DOM). No DOM globals: the canvas, its context and the
 * layer factory are injected, and the world is read only through `PhysicsWorld`.
 */

import { BALL_RADIUS_M } from "../physics/constants";
import type { BallState, FlipperState, PhysicsWorld } from "../physics/types";
import { deriveKickFace } from "../game/reactive-elements";
import { pathMidpoint, type ResolvedElement } from "../table/resolve";
import { PLUNGER_REST, PLUNGER_ZONE, type ElementKind } from "../table/spec";
import type { EffectsReader } from "./effects";
import { FLASH_EPS, FLASH_TIMING, type FlashTracker } from "./flash";
import { buildLampShapes, postPose, type LampReader, type LampShape, type PostPose } from "./lamps";
import {
  BALL_CORE,
  BALL_EDGE,
  BALL_GLINT,
  BG_BOTTOM,
  FLASH_BUMPER,
  FLASH_DRAIN,
  FLASH_FLIPPER,
  FLASH_SENSOR,
  FLASH_SLING,
  FLASH_WALL,
  FLIPPER_BODY,
  INLANE_LIT,
  FLIPPER_EDGE,
  LAMP_HOTSPOT,
  METER_FILL,
  METER_FRAME,
  METER_FULL,
  PLUNGER,
  POST_BODY,
  RUBBER_LINE_M,
  SAVE_LIT,
  SENSOR_LINE_M,
  SKILL_LIT,
  SLING_RUBBER,
} from "./palette";
import {
  GLINT_INLANE,
  GLINT_ROLLOVER,
  GLINT_SKILL,
  MOTE_INLANE,
  MOTE_RADIUS_M,
  MOTE_ROLLOVER,
  MOTE_SKILL,
  RING,
  SPARK_BUMPER,
  SPARK_SAVE,
  SPARK_SLING,
  type ParticlePool,
} from "./particles";
import {
  bakeHalo,
  bakeShadow,
  bakeStar,
  HALO_SCALE,
  SENSOR_HALO_M,
  SHADOW_OFFSET_X_M,
  SHADOW_OFFSET_Y_M,
  SHADOW_RADIUS_M,
  STAR_GLINT_M,
} from "./sprites";
import type { ShakeOut } from "./shake";
import { bakeStatic, traceElement, type Layer, type LayerFactory } from "./static-layer";
import {
  METER_GAP_M,
  METER_WIDTH_M,
  PLUNGER_TIP_INSET_M,
  PLUNGER_TIP_THICK_M,
  PULLBACK_M,
  PULLBACK_MARGIN_Y_M,
  type ViewTransform,
} from "./view-transform";

/** The read-only world surface the renderer needs. */
export type RenderWorld = Pick<PhysicsWorld, "getElements" | "getFlippers">;

/** The visible canvas surface the renderer sizes. */
export interface CanvasTarget {
  width: number;
  height: number;
  readonly style: { width: string; height: string };
}

/** The read side of the flash clock (a `FlashTracker` in production). */
export type FlashReader = Pick<FlashTracker, "level">;

/** Everything one frame draws beyond the static layer. */
export interface RenderFrame {
  /** Balls at their drawn (interpolated) positions. */
  readonly balls: readonly BallState[];
  /** Interpolated bat angles (rad), in `getFlippers()` order. */
  readonly flipperAngles: readonly number[];
  /** Plunger charge in [0, 1]. */
  readonly plungerCharge: number;
  /** Insert lamp levels, or absent / null to draw every lamp unlit (06-03). */
  readonly lamps?: LampReader | null;
  /** Element flash levels, or null to draw no flashes. */
  readonly flash: FlashReader | null;
  /** Render point between the last two fixed steps, in [0, 1] (`loop.alpha`). */
  readonly alpha: number;
  /** Presentation effects (the screen shake), or absent / null for no shake (06-09). */
  readonly effects?: EffectsReader | null;
  /** `prefers-reduced-motion: reduce`: the shake offset is exactly 0 (D-18). */
  readonly reducedMotion?: boolean;
}

/** A flashable circle element (bumper): drawn as a halo. */
interface FlashCircle {
  readonly id: number;
  readonly kind: ElementKind;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** A slingshot's rubber face: drawn as a bright stroke. */
interface FlashFace {
  readonly id: number;
  readonly kind: ElementKind;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

/** A rollover or inlane: a halo at its path midpoint plus a bright stroke. */
interface FlashSensor {
  readonly el: ResolvedElement;
  readonly mx: number;
  readonly my: number;
}

/** A drain, wall or chute path: drawn as a bright stroke of its outline. */
interface FlashPath {
  readonly el: ResolvedElement;
  readonly color: string;
  readonly lineWidth: number;
}

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/** Spark streak: length speed * PARTICLE_STREAK_S, at least PARTICLE_STREAK_MIN_M (UI-SPEC). */
export const PARTICLE_STREAK_S = 0.025;
export const PARTICLE_STREAK_MIN_M = 0.02;
/** Spark streak width (photosensitive cap, T-6-25). */
export const PARTICLE_STREAK_WIDTH_M = 0.012;
/** Shockwave ring line width over its life, and its peak alpha factor. */
export const RING_WIDTH_START_M = 0.02;
export const RING_WIDTH_END_M = 0.006;
export const RING_ALPHA = 0.9;
/** A reward glint's star starts at this fraction of STAR_GLINT_M and grows to 1 (UI-SPEC). */
export const GLINT_SCALE_START = 0.6;

/** Meter quarter-tick alpha (fixed color, intensity through globalAlpha). */
const METER_TICK_ALPHA = 0.45;

/** Plunger rod width (m). */
const PLUNGER_ROD_M = 0.015;

/** Ball glint: offset and radius as fractions of the ball radius. */
const GLINT_OFFSET = 0.35;
const GLINT_RADIUS = 0.22;

/**
 * A flipper flash is a rim this much wider than the bat (m): the bat is drawn
 * opaque on top of the flash pass, so only the rim shows.
 */
const FLIPPER_FLASH_RIM_M = 0.02;

/** Lamp hot-spot: its alpha as a fraction of the lamp level. */
const LAMP_HOTSPOT_ALPHA = 0.8;
/** Stroke-lens hot-spot: line width (m) and the span along the segment it covers. */
const LAMP_HOTSPOT_LINE_M = 0.01;
const LAMP_HOTSPOT_FROM = 0.25;
const LAMP_HOTSPOT_TO = 0.75;
/** Fill-lens hot-spot disc: radius and up-left offset, as fractions of the lens radius. */
const LAMP_HOTSPOT_DISC = 0.35;
const LAMP_HOTSPOT_OFFSET = 0.2;
/** Closed-stroke (ring) hot-spot: an arc on the centerline over the upper-left quarter. */
const RING_HOTSPOT_FROM = Math.PI;
const RING_HOTSPOT_TO = 1.5 * Math.PI;

/** Ball-save post rim stroke width (m, UI-SPEC post flourish). */
const POST_RIM_M = 0.02;

export class TableRenderer {
  private readonly canvas: CanvasTarget;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layers: LayerFactory;
  private readonly elements: readonly ResolvedElement[];
  private readonly lampShapes: readonly LampShape[];
  /** Distinct lit colors in the lamp table, and each one's largest halo radius (m). */
  private readonly lampColors: readonly string[];
  private readonly lampColorHaloR: readonly number[];
  /** Per lamp shape, its index into `lampColors` / `lampHalos`. */
  private readonly lampHaloSlot: Int32Array;
  private readonly flippers: readonly FlipperState[];
  private readonly flashCircles: readonly FlashCircle[];
  private readonly flashFaces: readonly FlashFace[];
  private readonly flashSensors: readonly FlashSensor[];
  private readonly flashPaths: readonly FlashPath[];
  private readonly maxBumperRadius: number;
  /** The "post" element's circle (radius 0 without one): the sensor's own field (D-07). */
  private readonly postX: number;
  private readonly postY: number;
  private readonly postR: number;
  /** Index of SAVE_LIT in `lampColors` / `lampHalos` (-1 without the ring). */
  private readonly postHaloSlot: number;
  /** This frame's post pose (renderer-owned, preallocated). */
  private readonly postPose: PostPose = { scale: 0, alpha: 0, flash: 0, visible: false };

  private view: ViewTransform | null = null;
  private layer: Layer | null = null;
  private bumperHalo: Layer | null = null;
  private sensorHalo: Layer | null = null;
  private ballShadow: Layer | null = null;
  /** One baked star per glint color: rollover, inlane, skill shot (06-13). */
  private starRollover: Layer | null = null;
  private starInlane: Layer | null = null;
  private starSkill: Layer | null = null;
  private lampHalos: (Layer | null)[] = [];
  private flashLit = false;
  private ballGradient: CanvasGradient | null = null;
  private flipperGradients: CanvasGradient[] = [];
  private bakes = 0;
  /** This frame's shake offset in whole device px (renderer-owned, preallocated). */
  private readonly shakeOut: ShakeOut = { x: 0, y: 0 };
  /** This frame's world translation: view offset plus shake offset (device px). */
  private tx = 0;
  private ty = 0;

  constructor(
    canvas: CanvasTarget,
    ctx: CanvasRenderingContext2D,
    layers: LayerFactory,
    world: RenderWorld,
  ) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.layers = layers;
    this.elements = world.getElements();
    // The lamp shape table, built once, and one halo slot per distinct lit color.
    this.lampShapes = buildLampShapes(this.elements);
    const colors: string[] = [];
    const colorR: number[] = [];
    this.lampHaloSlot = new Int32Array(this.lampShapes.length);
    for (let i = 0; i < this.lampShapes.length; i++) {
      const s = this.lampShapes[i];
      if (!s) continue;
      let slot = colors.indexOf(s.lit);
      if (slot < 0) {
        slot = colors.length;
        colors.push(s.lit);
        colorR.push(0);
      }
      if (s.haloRadius > (colorR[slot] ?? 0)) colorR[slot] = s.haloRadius;
      this.lampHaloSlot[i] = slot;
    }
    this.lampColors = colors;
    this.lampColorHaloR = colorR;
    // The ball-save post: center and radius read from the resolved element's
    // circle, the same field its sensor uses, and the ring's SAVE_LIT halo slot.
    const post = this.elements.find((e) => e.kind === "post" && e.circle !== null)?.circle;
    this.postX = post ? post.center.x : 0;
    this.postY = post ? post.center.y : 0;
    this.postR = post ? post.radius : 0;
    this.postHaloSlot = colors.indexOf(SAVE_LIT);
    // The pooled flipper snapshots: geometry is constant, and `angle` is the
    // live fallback when a frame's angle array is short.
    this.flippers = world.getFlippers();

    // Flashable elements by kind, precomputed once (geometry never changes).
    const circles: FlashCircle[] = [];
    const faces: FlashFace[] = [];
    const sensors: FlashSensor[] = [];
    const paths: FlashPath[] = [];
    let maxR = 0;
    for (const el of this.elements) {
      if (el.mount) continue;
      switch (el.kind) {
        case "bumper":
          if (el.circle) {
            const c = el.circle;
            circles.push({ id: el.id, kind: el.kind, cx: c.center.x, cy: c.center.y, r: c.radius });
            if (c.radius > maxR) maxR = c.radius;
          }
          break;
        case "slingshot": {
          const f = deriveKickFace(el);
          if (f) faces.push({ id: el.id, kind: el.kind, ax: f.ax, ay: f.ay, bx: f.bx, by: f.by });
          break;
        }
        case "rollover":
        case "lane": {
          const m = pathMidpoint(el);
          sensors.push({ el, mx: m.x, my: m.y });
          break;
        }
        case "drain":
          paths.push({ el, color: FLASH_DRAIN, lineWidth: RUBBER_LINE_M });
          break;
        case "wall":
        case "chute":
          paths.push({ el, color: FLASH_WALL, lineWidth: RUBBER_LINE_M });
          break;
        default:
          break;
      }
    }
    this.flashCircles = circles;
    this.flashFaces = faces;
    this.flashSensors = sensors;
    this.flashPaths = paths;
    this.maxBumperRadius = maxR;
  }

  /** Static-layer bakes so far (one per resize). */
  get bakeCount(): number {
    return this.bakes;
  }

  /**
   * Size the canvas for `view`, bake the static layer and rebuild the cached
   * gradients. Setting the canvas size resets its context state (Pitfall 9),
   * so everything cached on it is rebuilt here.
   */
  resize(view: ViewTransform): void {
    this.canvas.width = view.backingW;
    this.canvas.height = view.backingH;
    this.canvas.style.width = `${view.cssW}px`;
    this.canvas.style.height = `${view.cssH}px`;

    const layer = this.layers.create(view.backingW, view.backingH);
    bakeStatic(layer.ctx, this.elements, view, this.lampShapes);
    this.layer = layer;
    this.view = view;

    const ctx = this.ctx;
    // Ball gradient in ball-local meters at BALL_RADIUS_M (scaled per ball).
    const r = BALL_RADIUS_M;
    const ball = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    ball.addColorStop(0, BALL_CORE);
    ball.addColorStop(1, BALL_EDGE);
    this.ballGradient = ball;

    // One cross-section gradient per bat, in flipper-local meters.
    const grads: CanvasGradient[] = [];
    for (let i = 0; i < this.flippers.length; i++) {
      const f = this.flippers[i];
      const t = f ? f.tipRadius : BALL_RADIUS_M * 0.5;
      const g = ctx.createLinearGradient(0, -t, 0, t);
      g.addColorStop(0, FLIPPER_EDGE);
      g.addColorStop(0.5, FLIPPER_BODY);
      g.addColorStop(1, FLIPPER_EDGE);
      grads.push(g);
    }
    this.flipperGradients = grads;

    // One halo sprite per halo color, sized to its on-screen device pixels.
    this.bumperHalo =
      this.maxBumperRadius > 0
        ? bakeHalo(this.layers, FLASH_BUMPER, 2 * HALO_SCALE * this.maxBumperRadius * view.scale)
        : null;
    this.sensorHalo =
      this.flashSensors.length > 0
        ? bakeHalo(this.layers, FLASH_SENSOR, 2 * SENSOR_HALO_M * view.scale)
        : null;
    // One ball-shadow sprite at its on-screen device-pixel size.
    this.ballShadow = bakeShadow(this.layers, 2 * SHADOW_RADIUS_M * view.scale);
    // One lamp halo per distinct lit color, sized from that color's largest radius.
    const lampHalos: (Layer | null)[] = [];
    for (let i = 0; i < this.lampColors.length; i++) {
      const color = this.lampColors[i];
      const hr = this.lampColorHaloR[i] ?? 0;
      lampHalos.push(color && hr > 0 ? bakeHalo(this.layers, color, 2 * hr * view.scale) : null);
    }
    this.lampHalos = lampHalos;
    // One reward star per glint color, at its full on-screen size.
    const starPx = STAR_GLINT_M * view.scale;
    this.starRollover = bakeStar(this.layers, FLASH_SENSOR, starPx);
    this.starInlane = bakeStar(this.layers, INLANE_LIT, starPx);
    this.starSkill = bakeStar(this.layers, SKILL_LIT, starPx);
    this.bakes++;
  }

  /** Draw one frame. A no-op before the first `resize`. */
  draw(frame: RenderFrame): void {
    const view = this.view;
    const layer = this.layer;
    if (!view || !layer) return;
    const ctx = this.ctx;

    // Identity first: fill the whole backing so a shaken blit never uncovers an
    // edge strip, then sample the shake once and blit the static layer there.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG_BOTTOM;
    ctx.fillRect(0, 0, view.backingW, view.backingH);
    const shake = this.shakeOut;
    const effects = frame.effects;
    // Reduced motion zeroes the whole-view offset here as well as in the
    // tracker, so no effects source can move the view against the preference.
    const reduced = frame.reducedMotion === true;
    if (effects && !reduced) {
      effects.shake.sample(frame.alpha, view.dpr, false, shake);
    } else {
      shake.x = 0;
      shake.y = 0;
    }
    ctx.drawImage(layer.canvas, shake.x, shake.y);
    this.tx = view.offX + shake.x;
    this.ty = view.offY + shake.y;
    this.resetWorld();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (frame.lamps) this.drawLamps(frame.lamps, frame.alpha);
    if (frame.flash) this.drawFlashes(frame.flash, frame.alpha, frame.flipperAngles);
    if (frame.lamps) this.drawPost(frame.lamps, frame.alpha);
    this.drawFlippers(frame.flipperAngles);
    this.drawPlunger(frame.plungerCharge);
    this.drawBallShadows(frame.balls);
    this.drawBalls(frame.balls);
    if (effects) this.drawParticles(effects.particles, frame.alpha);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * The world transform with this frame's shake offset: the one place a world
   * `setTransform` is issued, so every layer stays registered (Pitfall 8).
   */
  private resetWorld(): void {
    const view = this.view;
    if (!view) return;
    this.ctx.setTransform(view.scale, 0, 0, view.scale, this.tx, this.ty);
  }

  /**
   * The lamp pass (D-21): for every lamp shape above FLASH_EPS, its lens in the
   * lit color at globalAlpha L, its baked halo under "lighter" at L, then the
   * hot-spot at 0.8 * L, each source-over except the halo. Index loops over the
   * precomputed vertex arrays; nothing allocated. Ends source-over at alpha 1.
   */
  private drawLamps(lamps: LampReader, alpha: number): void {
    const ctx = this.ctx;
    const shapes = this.lampShapes;
    let drew = false;
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      if (!s) continue;
      const level = lamps.level(s.lamp, alpha);
      if (!(level > FLASH_EPS)) continue;
      const l = level < 1 ? level : 1;
      drew = true;

      // 1. The lens.
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = l;
      this.traceLamp(s);
      if (s.style === "stroke") {
        ctx.strokeStyle = s.lit;
        ctx.lineWidth = s.lineWidth;
        ctx.lineCap = "round";
        ctx.stroke();
      } else {
        ctx.fillStyle = s.lit;
        ctx.fill();
      }

      // 2. The halo, centered on the lens.
      const halo = this.lampHalos[this.lampHaloSlot[i] ?? -1];
      if (halo) {
        const hr = s.haloRadius;
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(halo.canvas, s.cx - hr, s.cy - hr, 2 * hr, 2 * hr);
        ctx.globalCompositeOperation = "source-over";
      }

      // 3. The hot-spot.
      ctx.globalAlpha = LAMP_HOTSPOT_ALPHA * l;
      if (s.style === "stroke" && s.closed) {
        // A ring: an arc on its centerline over the upper-left quarter.
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.lensRadius, RING_HOTSPOT_FROM, RING_HOTSPOT_TO);
        ctx.strokeStyle = LAMP_HOTSPOT;
        ctx.lineWidth = LAMP_HOTSPOT_LINE_M;
        ctx.stroke();
      } else if (s.style === "stroke") {
        const n = s.xs.length - 1;
        const ax = s.xs[0] ?? 0;
        const ay = s.ys[0] ?? 0;
        const dx = (s.xs[n] ?? ax) - ax;
        const dy = (s.ys[n] ?? ay) - ay;
        ctx.beginPath();
        ctx.moveTo(ax + LAMP_HOTSPOT_FROM * dx, ay + LAMP_HOTSPOT_FROM * dy);
        ctx.lineTo(ax + LAMP_HOTSPOT_TO * dx, ay + LAMP_HOTSPOT_TO * dy);
        ctx.strokeStyle = LAMP_HOTSPOT;
        ctx.lineWidth = LAMP_HOTSPOT_LINE_M;
        ctx.stroke();
      } else {
        const r = s.lensRadius;
        ctx.beginPath();
        ctx.arc(
          s.cx - LAMP_HOTSPOT_OFFSET * r,
          s.cy - LAMP_HOTSPOT_OFFSET * r,
          LAMP_HOTSPOT_DISC * r,
          0,
          TAU,
        );
        ctx.fillStyle = LAMP_HOTSPOT;
        ctx.fill();
      }
    }
    if (drew) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  /**
   * The ball-save post flourish (D-07, D-10): at the lamp clock's post age, a
   * POST_BODY disc of radius R * scale at the post center with a SAVE_LIT rim
   * POST_RIM_M wide, both at the pose alpha, then, while the flash is above
   * FLASH_EPS, the ring's SAVE_LIT halo sprite at HALO_SCALE * R under
   * "lighter". R is the element's circle radius (collision always happens at
   * R). Drawn between the flash pass and the bats; nothing without a flourish.
   * Ends source-over at alpha 1.
   */
  private drawPost(lamps: LampReader, alpha: number): void {
    const r0 = this.postR;
    if (!(r0 > 0)) return;
    const age = lamps.postAge(alpha);
    if (!(age >= 0)) return;
    const pose = this.postPose;
    postPose(age, pose);
    if (!pose.visible || !(pose.alpha > 0)) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = pose.alpha < 1 ? pose.alpha : 1;
    ctx.beginPath();
    ctx.arc(this.postX, this.postY, r0 * pose.scale, 0, TAU);
    ctx.fillStyle = POST_BODY;
    ctx.fill();
    ctx.strokeStyle = SAVE_LIT;
    ctx.lineWidth = POST_RIM_M;
    ctx.stroke();
    const halo = this.lampHalos[this.postHaloSlot];
    if (halo && pose.flash > FLASH_EPS) {
      const hr = HALO_SCALE * r0;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = pose.flash < 1 ? pose.flash : 1;
      ctx.drawImage(halo.canvas, this.postX - hr, this.postY - hr, 2 * hr, 2 * hr);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /** Path of a lamp lens from its precomputed vertices. */
  private traceLamp(s: LampShape): void {
    const ctx = this.ctx;
    const xs = s.xs;
    const ys = s.ys;
    ctx.beginPath();
    ctx.moveTo(xs[0] ?? 0, ys[0] ?? 0);
    for (let k = 1; k < xs.length; k++) ctx.lineTo(xs[k] ?? 0, ys[k] ?? 0);
    if (s.closed) ctx.closePath();
  }

  /**
   * The flash pass: element-local marks for every element whose level is above
   * FLASH_EPS, under "lighter" with the level as globalAlpha. Composite and
   * alpha are switched only when something is drawn, and reset after the pass.
   */
  private drawFlashes(flash: FlashReader, alpha: number, angles: readonly number[]): void {
    const ctx = this.ctx;
    const view = this.view;
    if (!view) return;
    this.flashLit = false;

    const halo = this.bumperHalo;
    const circles = this.flashCircles;
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      if (!c || !halo) continue;
      if (!this.flashOn(flash.level(c.id, alpha, FLASH_TIMING[c.kind]))) continue;
      const hr = HALO_SCALE * c.r;
      ctx.drawImage(halo.canvas, c.cx - hr, c.cy - hr, 2 * hr, 2 * hr);
    }

    const faces = this.flashFaces;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (!f) continue;
      if (!this.flashOn(flash.level(f.id, alpha, FLASH_TIMING[f.kind]))) continue;
      ctx.beginPath();
      ctx.moveTo(f.ax, f.ay);
      ctx.lineTo(f.bx, f.by);
      ctx.strokeStyle = FLASH_SLING;
      ctx.lineWidth = RUBBER_LINE_M;
      ctx.stroke();
    }

    const sensorHalo = this.sensorHalo;
    const sensors = this.flashSensors;
    for (let i = 0; i < sensors.length; i++) {
      const s = sensors[i];
      if (!s) continue;
      if (!this.flashOn(flash.level(s.el.id, alpha, FLASH_TIMING[s.el.kind]))) continue;
      if (sensorHalo) {
        const hr = SENSOR_HALO_M;
        ctx.drawImage(sensorHalo.canvas, s.mx - hr, s.my - hr, 2 * hr, 2 * hr);
      }
      traceElement(ctx, s.el);
      ctx.strokeStyle = FLASH_SENSOR;
      ctx.lineWidth = RUBBER_LINE_M;
      ctx.stroke();
    }

    const paths = this.flashPaths;
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (!p) continue;
      if (!this.flashOn(flash.level(p.el.id, alpha, FLASH_TIMING[p.el.kind]))) continue;
      traceElement(ctx, p.el);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.lineWidth;
      ctx.stroke();
    }

    // A flipper flash: one stadium contour a rim wider than the bat, at the
    // bat's interpolated angle; the opaque bat drawn next covers its core.
    const flippers = this.flippers;
    for (let i = 0; i < flippers.length; i++) {
      const f = flippers[i];
      if (!f) continue;
      if (!this.flashOn(flash.level(f.id, alpha, FLASH_TIMING.flipper))) continue;
      const a = angles[i];
      const angle = a === undefined ? f.angle : a;
      const tr = f.tipRadius;
      const tipC = f.length - tr;
      const rr = tr + FLIPPER_FLASH_RIM_M;
      ctx.translate(f.pivotX, f.pivotY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(tr, -rr);
      ctx.lineTo(tipC, -rr);
      ctx.arc(tipC, 0, rr, -HALF_PI, HALF_PI);
      ctx.lineTo(tr, rr);
      ctx.arc(tr, 0, rr, HALF_PI, 3 * HALF_PI);
      ctx.closePath();
      ctx.fillStyle = FLASH_FLIPPER;
      ctx.fill();
      this.resetWorld();
    }

    if (this.flashLit) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      this.flashLit = false;
    }
  }

  /**
   * Prepare to draw one flash at `level`: false (draw nothing) at or below
   * FLASH_EPS; else switch to "lighter" once per pass and set globalAlpha.
   */
  private flashOn(level: number): boolean {
    if (!(level > FLASH_EPS)) return false;
    const ctx = this.ctx;
    if (!this.flashLit) {
      ctx.globalCompositeOperation = "lighter";
      this.flashLit = true;
    }
    ctx.globalAlpha = level < 1 ? level : 1;
    return true;
  }

  /**
   * Each bat as the stadium of its collider (drawn equals hit, 03-REVIEW WR-03):
   * a core between the hinge and tip circle centres, half-thickness tipRadius,
   * spanning local x in [0, length], rotated to its interpolated angle.
   */
  private drawFlippers(angles: readonly number[]): void {
    const ctx = this.ctx;
    const view = this.view;
    if (!view) return;
    const flippers = this.flippers;
    for (let i = 0; i < flippers.length; i++) {
      const f = flippers[i];
      const grad = this.flipperGradients[i];
      if (!f || !grad) continue;
      const a = angles[i];
      const angle = a === undefined ? f.angle : a;
      const tr = f.tipRadius;
      const tipC = f.length - tr;
      ctx.translate(f.pivotX, f.pivotY);
      ctx.rotate(angle);
      ctx.fillStyle = grad;
      ctx.fillRect(tr, -tr, tipC - tr, tr * 2);
      ctx.beginPath();
      ctx.arc(tipC, 0, tr, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tr, 0, tr, 0, TAU);
      ctx.fill();
      this.resetWorld();
    }
  }

  /** The charge meter beside the chute and the plunger tip and rod under the resting ball. */
  private drawPlunger(charge: number): void {
    const ctx = this.ctx;
    const c = Math.min(Math.max(Number.isFinite(charge) ? charge : 0, 0), 1);
    const z = PLUNGER_ZONE;

    const x = z.maxX + METER_GAP_M;
    const w = METER_WIDTH_M;
    const top = z.minY;
    const h = z.maxY - z.minY;
    if (c > 0) {
      ctx.fillStyle = c >= 1 ? METER_FULL : METER_FILL;
      ctx.fillRect(x, top + h * (1 - c), w, h * c);
    }
    ctx.globalAlpha = METER_TICK_ALPHA;
    ctx.strokeStyle = METER_FRAME;
    ctx.lineWidth = SENSOR_LINE_M * 0.5;
    ctx.beginPath();
    for (let q = 1; q < 4; q++) {
      const ty = top + (h * q) / 4;
      ctx.moveTo(x, ty);
      ctx.lineTo(x + w, ty);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = SENSOR_LINE_M;
    ctx.strokeRect(x, top, w, h);

    const tipY = PLUNGER_REST.y + BALL_RADIUS_M + c * PULLBACK_M;
    const tipX0 = z.minX + PLUNGER_TIP_INSET_M;
    const tipX1 = z.maxX - PLUNGER_TIP_INSET_M;
    ctx.fillStyle = PLUNGER;
    ctx.fillRect(tipX0, tipY, tipX1 - tipX0, PLUNGER_TIP_THICK_M);
    ctx.strokeStyle = PLUNGER;
    ctx.lineWidth = PLUNGER_ROD_M;
    ctx.beginPath();
    ctx.moveTo(PLUNGER_REST.x, tipY + PLUNGER_TIP_THICK_M);
    ctx.lineTo(PLUNGER_REST.x, z.maxY + PULLBACK_MARGIN_Y_M);
    ctx.stroke();
  }

  /**
   * One baked soft shadow per ball, source-over at full alpha, offset
   * down-right of its drawn center at a fixed size (D-20). Drawn after the bats
   * and plunger and before the balls.
   */
  private drawBallShadows(balls: readonly BallState[]): void {
    const shadow = this.ballShadow;
    if (!shadow || balls.length === 0) return;
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const d = 2 * SHADOW_RADIUS_M;
    const dx = SHADOW_OFFSET_X_M - SHADOW_RADIUS_M;
    const dy = SHADOW_OFFSET_Y_M - SHADOW_RADIUS_M;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b) continue;
      ctx.drawImage(shadow.canvas, b.x + dx, b.y + dy, d, d);
    }
  }

  /**
   * The particle pass (D-19): under "lighter", rings then bumper, sling and
   * save sparks, then the reward glints and motes, each kind's color assigned
   * once. Index loops over the pool's typed arrays; no allocation, gradient,
   * blur or text. Ends source-over at alpha 1.
   */
  private drawParticles(particles: ParticlePool, alpha: number): void {
    const ctx = this.ctx;
    const a = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = FLASH_BUMPER;
    this.drawRings(particles, a);
    this.drawSparks(particles, a, SPARK_BUMPER);
    ctx.strokeStyle = SLING_RUBBER;
    this.drawSparks(particles, a, SPARK_SLING);
    ctx.strokeStyle = SAVE_LIT;
    this.drawSparks(particles, a, SPARK_SAVE);
    this.drawGlints(particles, a, GLINT_ROLLOVER, this.starRollover);
    this.drawGlints(particles, a, GLINT_INLANE, this.starInlane);
    this.drawGlints(particles, a, GLINT_SKILL, this.starSkill);
    this.drawMotes(particles, a, MOTE_ROLLOVER, FLASH_SENSOR);
    this.drawMotes(particles, a, MOTE_INLANE, INLANE_LIT);
    this.drawMotes(particles, a, MOTE_SKILL, SKILL_LIT);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * Every live glint of `kind`: its baked star centered on it, side
   * STAR_GLINT_M * (0.6 + 0.4 * age/life), at (1 - age/life)^2.
   */
  private drawGlints(p: ParticlePool, a: number, kind: number, star: Layer | null): void {
    if (!star) return;
    const ctx = this.ctx;
    const n = p.capacity;
    for (let i = 0; i < n; i++) {
      if (p.kind[i] !== kind) continue;
      const life = p.life[i] ?? 0;
      const age = p.age[i] ?? 0;
      if (!(age < life)) continue;
      const t = age / life;
      const f = 1 - t;
      const x0 = p.px[i] ?? 0;
      const y0 = p.py[i] ?? 0;
      const x = x0 + ((p.x[i] ?? 0) - x0) * a;
      const y = y0 + ((p.y[i] ?? 0) - y0) * a;
      const side = STAR_GLINT_M * (GLINT_SCALE_START + (1 - GLINT_SCALE_START) * t);
      ctx.globalAlpha = f * f;
      ctx.drawImage(star.canvas, x - side / 2, y - side / 2, side, side);
    }
  }

  /** Every live mote of `kind`: one disc of radius MOTE_RADIUS_M in `color`, fading. */
  private drawMotes(p: ParticlePool, a: number, kind: number, color: string): void {
    const ctx = this.ctx;
    const n = p.capacity;
    let colored = false;
    for (let i = 0; i < n; i++) {
      if (p.kind[i] !== kind) continue;
      const life = p.life[i] ?? 0;
      const age = p.age[i] ?? 0;
      if (!(age < life)) continue;
      if (!colored) {
        ctx.fillStyle = color;
        colored = true;
      }
      const f = 1 - age / life;
      const x0 = p.px[i] ?? 0;
      const y0 = p.py[i] ?? 0;
      const x = x0 + ((p.x[i] ?? 0) - x0) * a;
      const y = y0 + ((p.y[i] ?? 0) - y0) * a;
      ctx.globalAlpha = f * f;
      ctx.beginPath();
      ctx.arc(x, y, MOTE_RADIUS_M, 0, TAU);
      ctx.fill();
    }
  }

  /** Every live ring: an arc growing 1.0R to 2.0R, thinning and fading. */
  private drawRings(p: ParticlePool, a: number): void {
    const ctx = this.ctx;
    const n = p.capacity;
    for (let i = 0; i < n; i++) {
      if (p.kind[i] !== RING) continue;
      const life = p.life[i] ?? 0;
      const age = p.age[i] ?? 0;
      if (!(age < life)) continue;
      const t = age / life;
      const f = 1 - t;
      const x0 = p.px[i] ?? 0;
      const y0 = p.py[i] ?? 0;
      const x = x0 + ((p.x[i] ?? 0) - x0) * a;
      const y = y0 + ((p.y[i] ?? 0) - y0) * a;
      ctx.globalAlpha = RING_ALPHA * f * f;
      ctx.lineWidth = RING_WIDTH_START_M + (RING_WIDTH_END_M - RING_WIDTH_START_M) * t;
      ctx.beginPath();
      ctx.arc(x, y, (p.size[i] ?? 0) * (1 + t), 0, TAU);
      ctx.stroke();
    }
  }

  /** Every live spark of `kind`: a streak back along its velocity, fading. */
  private drawSparks(p: ParticlePool, a: number, kind: number): void {
    const ctx = this.ctx;
    const n = p.capacity;
    ctx.lineWidth = PARTICLE_STREAK_WIDTH_M;
    for (let i = 0; i < n; i++) {
      if (p.kind[i] !== kind) continue;
      const life = p.life[i] ?? 0;
      const age = p.age[i] ?? 0;
      if (!(age < life)) continue;
      const vx = p.vx[i] ?? 0;
      const vy = p.vy[i] ?? 0;
      const speed = Math.hypot(vx, vy);
      if (!(speed > 0)) continue;
      const f = 1 - age / life;
      const x0 = p.px[i] ?? 0;
      const y0 = p.py[i] ?? 0;
      const x = x0 + ((p.x[i] ?? 0) - x0) * a;
      const y = y0 + ((p.y[i] ?? 0) - y0) * a;
      const len = Math.max(PARTICLE_STREAK_MIN_M, speed * PARTICLE_STREAK_S) / speed;
      ctx.globalAlpha = f * f;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - vx * len, y - vy * len);
      ctx.stroke();
    }
  }

  /** Each ball with the cached gradient plus a fixed glint, at its drawn position. */
  private drawBalls(balls: readonly BallState[]): void {
    const ctx = this.ctx;
    const grad = this.ballGradient;
    if (!grad) return;
    const r = BALL_RADIUS_M;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b) continue;
      ctx.translate(b.x, b.y);
      const k = b.radius / r;
      if (k !== 1 && Number.isFinite(k) && k > 0) ctx.scale(k, k);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = BALL_GLINT;
      ctx.beginPath();
      ctx.arc(-r * GLINT_OFFSET, -r * GLINT_OFFSET, r * GLINT_RADIUS, 0, TAU);
      ctx.fill();
      this.resetWorld();
    }
  }
}
