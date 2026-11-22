import { describe, it, expect } from "vitest";

import { BALL_RADIUS_M } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallState } from "../physics/types";
import { TABLE_SPEC } from "../table/spec";
import {
  CONTACT_FLASH_PEAK,
  FLASH_BUMPER as BUMPER_TIMING,
  FLASH_CUTOFF_TAUS,
  FLASH_EPS,
  FlashTracker,
  maxElementId,
} from "./flash";
import {
  buildLampShapes,
  LAMP_COUNT,
  LAMP_ROLLOVER_401,
  LAMP_SKILL_402,
  type LampReader,
  type LampShape,
} from "./lamps";
import {
  FLASH_FLIPPER,
  FLASH_WALL,
  LAMP_HOTSPOT,
  ROLLOVER_LIT,
  RUBBER_LINE_M,
  SKILL_LIT,
} from "./palette";
import {
  HALO_SCALE,
  SENSOR_HALO_M,
  SHADOW_OFFSET_X_M,
  SHADOW_OFFSET_Y_M,
  SHADOW_RADIUS_M,
} from "./sprites";
import { TableRenderer, type CanvasTarget, type RenderFrame } from "./table-renderer";
import {
  createRecordingContext,
  RecordingLayerFactory,
  type CallEntry,
  type Recorder,
} from "./test/recording-context";
import { computeView, tableBounds, type ViewTransform } from "./view-transform";

/**
 * RND-02 frame contract (plan 05-02 Task 2, research Pitfalls 3-4, T-05-08):
 * the static layer is baked once per resize and blitted with one drawImage at
 * identity; draw() creates no gradient, never raises shadowBlur, paints no text
 * (D-01) and leaves globalAlpha 1 and source-over behind it. Driven over a real
 * PlanckWorld on TABLE_SPEC so the drawn geometry is the collider geometry.
 *
 * Re-pinned by plan 06-02 (PLSH-03): resize also bakes one ball-shadow sprite,
 * and each frame stamps it once per ball between the bats and the balls.
 *
 * Re-pinned by plan 06-03 (PLSH-04): resize also bakes one lamp halo per
 * distinct lit color in the lamp shape table (after the shadow), and the lamp
 * pass replaces the Phase-5 lit-rollover stroke as the first live pass.
 */

/** Halo sprites baked per resize: one bumper halo and one sensor halo (05-04). */
const HALO_LAYERS = 2;

/** Ball-shadow sprites baked per resize (06-02, D-20). */
const SHADOW_LAYERS = 1;

/** The lamp shape table for TABLE_SPEC, and its distinct lit colors in table order (06-03). */
const LAMP_SHAPES: readonly LampShape[] = buildLampShapes(
  new PlanckWorld({ table: TABLE_SPEC }).getElements(),
);
const LAMP_COLORS: readonly string[] = [...new Set(LAMP_SHAPES.map((s) => s.lit))];

/** Lamp halo sprites baked per resize: one per distinct lit color (06-03, D-21). */
const LAMP_HALO_LAYERS = LAMP_COLORS.length;

/** Every layer one resize creates: the static layer, the halos, the shadow and the lamp halos. */
const LAYERS_PER_RESIZE = 1 + HALO_LAYERS + SHADOW_LAYERS + LAMP_HALO_LAYERS;

/** Index of the ball-shadow sprite among one resize's layers (baked after the halos). */
const SHADOW_LAYER_INDEX = 1 + HALO_LAYERS;

interface Rig {
  readonly world: PlanckWorld;
  readonly canvas: CanvasTarget;
  readonly rec: Recorder;
  readonly layers: RecordingLayerFactory;
  readonly renderer: TableRenderer;
  readonly view: ViewTransform;
}

function makeRig(): Rig {
  const world = new PlanckWorld({ table: TABLE_SPEC });
  const canvas: CanvasTarget = { width: 0, height: 0, style: { width: "", height: "" } };
  const rec = createRecordingContext();
  const layers = new RecordingLayerFactory();
  const renderer = new TableRenderer(canvas, rec.ctx, layers, world);
  const view = computeView(tableBounds(world.getElements()), 1280, 684, 1.5);
  renderer.resize(view);
  rec.clear();
  return { world, canvas, rec, layers, renderer, view };
}

function ball(x: number, y: number): BallState {
  return { id: 1, x, y, vx: 0, vy: 0, radius: BALL_RADIUS_M, angle: 0 };
}

function frameOf(world: PlanckWorld, extra?: Partial<RenderFrame>): RenderFrame {
  return {
    balls: [ball(1.2, 3.4)],
    flipperAngles: world.getFlippers().map((f) => f.angle),
    plungerCharge: 0.5,
    flash: null,
    alpha: 0,
    ...extra,
  };
}

function callsOf(rec: Recorder): CallEntry[] {
  return rec.log.filter((e): e is CallEntry => e.kind === "call");
}

function isWorldTransform(c: CallEntry, view: ViewTransform): boolean {
  return (
    c.name === "setTransform" &&
    c.args[0] === view.scale &&
    c.args[1] === 0 &&
    c.args[2] === 0 &&
    c.args[3] === view.scale &&
    c.args[4] === view.offX &&
    c.args[5] === view.offY
  );
}

/** Run `n` draws, returning each frame's log on its own (the log is cleared between frames). */
function drawFrames(rig: Rig, n: number, frame: RenderFrame): CallEntry[][] {
  const out: CallEntry[][] = [];
  for (let i = 0; i < n; i++) {
    rig.rec.clear();
    rig.renderer.draw(frame);
    out.push(callsOf(rig.rec));
  }
  return out;
}

describe("TableRenderer frame contract (RND-02)", () => {
  it("bakes once across ten draws: bakeCount 1 and no layer created by draw()", () => {
    const rig = makeRig();
    // One static layer plus the halo and shadow sprites, all created by resize().
    const atResize = rig.layers.createCount;
    expect(atResize).toBe(LAYERS_PER_RESIZE);
    drawFrames(rig, 10, frameOf(rig.world));
    expect(rig.renderer.bakeCount).toBe(1);
    expect(rig.layers.createCount).toBe(atResize);
  });

  it("starts every frame with an identity setTransform then exactly one drawImage of the static layer at (0, 0)", () => {
    const rig = makeRig();
    const layer = rig.layers.layers[0];
    expect(layer).toBeDefined();
    for (let i = 0; i < 10; i++) {
      rig.rec.clear();
      rig.renderer.draw(frameOf(rig.world));
      const first = rig.rec.log[0];
      expect(first).toEqual({ kind: "call", name: "setTransform", args: [1, 0, 0, 1, 0, 0] });
      const calls = callsOf(rig.rec);
      expect(calls[1]?.name).toBe("drawImage");
      expect(calls[1]?.args[0]).toBe(layer?.canvas);
      expect(calls[1]?.args.slice(1)).toEqual([0, 0]);
      // The static blit is the only drawImage of the static layer; the frame's
      // one ball adds exactly one shadow stamp.
      const draws = calls.filter((c) => c.name === "drawImage");
      expect(draws.filter((c) => c.args[0] === layer?.canvas)).toHaveLength(1);
      expect(draws).toHaveLength(1 + 1);
    }
  });

  it("creates no linear or radial gradient during ten draws", () => {
    const rig = makeRig();
    const frames = drawFrames(rig, 10, frameOf(rig.world));
    for (const calls of frames) {
      expect(calls.filter((c) => c.name === "createLinearGradient")).toHaveLength(0);
      expect(calls.filter((c) => c.name === "createRadialGradient")).toHaveLength(0);
    }
  });

  it("never sets shadowBlur above 0 during ten draws", () => {
    const rig = makeRig();
    for (let i = 0; i < 10; i++) {
      rig.rec.clear();
      rig.renderer.draw(frameOf(rig.world));
      const raised = rig.rec
        .sets("shadowBlur")
        .filter((s) => typeof s.value !== "number" || s.value > 0);
      expect(raised).toHaveLength(0);
    }
  });

  it("never calls fillText or strokeText (D-01: the canvas paints no text)", () => {
    const rig = makeRig();
    const frames = drawFrames(rig, 10, frameOf(rig.world));
    for (const calls of frames) {
      expect(calls.filter((c) => c.name === "fillText" || c.name === "strokeText")).toHaveLength(0);
    }
  });

  it("leaves globalAlpha 1 and globalCompositeOperation source-over after each draw", () => {
    const rig = makeRig();
    for (let i = 0; i < 10; i++) {
      // Stain the state as a leaking pass would, so the reset is what is proven.
      rig.rec.ctx.globalAlpha = 0.3;
      rig.rec.ctx.globalCompositeOperation = "lighter";
      rig.renderer.draw(frameOf(rig.world));
      expect(rig.rec.ctx.globalAlpha).toBe(1);
      expect(rig.rec.ctx.globalCompositeOperation).toBe("source-over");
    }
  });

  it("translates a ball at (1.2, 3.4) to (1.2, 3.4) in world meters after the world setTransform", () => {
    const rig = makeRig();
    rig.renderer.draw(frameOf(rig.world, { balls: [ball(1.2, 3.4)] }));
    const calls = callsOf(rig.rec);
    const at = calls.findIndex(
      (c) => c.name === "translate" && c.args[0] === 1.2 && c.args[1] === 3.4,
    );
    expect(at).toBeGreaterThan(0);
    let lastTransform: CallEntry | undefined;
    for (let i = at - 1; i >= 0; i--) {
      const c = calls[i];
      if (
        c &&
        (c.name === "setTransform" ||
          c.name === "translate" ||
          c.name === "rotate" ||
          c.name === "scale")
      ) {
        lastTransform = c;
        break;
      }
    }
    expect(lastTransform).toBeDefined();
    expect(lastTransform && isWorldTransform(lastTransform, rig.view)).toBe(true);
  });

  it("a second resize sets the canvas to the new backing size and bakes again", () => {
    const rig = makeRig();
    expect(rig.canvas.width).toBe(rig.view.backingW);
    expect(rig.canvas.height).toBe(rig.view.backingH);
    const next = computeView(tableBounds(rig.world.getElements()), 1920, 1080, 2);
    expect(next.backingW).not.toBe(rig.view.backingW);
    rig.renderer.resize(next);
    expect(rig.canvas.width).toBe(next.backingW);
    expect(rig.canvas.height).toBe(next.backingH);
    expect(rig.canvas.style.width).toBe(`${next.cssW}px`);
    expect(rig.canvas.style.height).toBe(`${next.cssH}px`);
    expect(rig.renderer.bakeCount).toBe(2);
    expect(rig.layers.createCount).toBe(2 * LAYERS_PER_RESIZE);
  });

  it("a resize then two draws do not re-bake: bakeCount and createCount unchanged by draw()", () => {
    const rig = makeRig();
    const next = computeView(tableBounds(rig.world.getElements()), 1920, 1080, 2);
    rig.renderer.resize(next);
    const bakes = rig.renderer.bakeCount;
    const created = rig.layers.createCount;
    expect(bakes).toBe(2);
    rig.renderer.draw(frameOf(rig.world));
    rig.renderer.draw(frameOf(rig.world, { balls: [ball(1.2, 3.4), ball(2, 5)] }));
    expect(rig.renderer.bakeCount).toBe(bakes);
    expect(rig.layers.createCount).toBe(created);
  });
});

/** The ball-shadow sprite's canvas from the rig's first resize. */
function shadowCanvas(rig: Rig): unknown {
  return rig.layers.layers[SHADOW_LAYER_INDEX]?.canvas;
}

/** drawImage calls that stamp the ball-shadow sprite. */
function shadowDraws(rig: Rig): CallEntry[] {
  const shadow = shadowCanvas(rig);
  return rig.rec.calls("drawImage").filter((c) => c.args[0] === shadow);
}

describe("TableRenderer ball shadows (PLSH-03, D-20)", () => {
  it("bakes the shadow sprite at resize at 2 * SHADOW_RADIUS_M * scale device px", () => {
    const rig = makeRig();
    const layer = rig.layers.layers[SHADOW_LAYER_INDEX];
    expect(layer).toBeDefined();
    const n = Math.max(2, Math.round(2 * SHADOW_RADIUS_M * rig.view.scale));
    expect(layer?.width).toBe(n);
    expect(layer?.height).toBe(n);
    expect(SHADOW_RADIUS_M).toBeCloseTo(1.25 * BALL_RADIUS_M, 12);
  });

  it("a frame with N balls has the static blit plus N shadow stamps, each at ball + offset, sized 2 * SHADOW_RADIUS_M", () => {
    const rig = makeRig();
    const staticCanvas = rig.layers.layers[0]?.canvas;
    const cases: BallState[][] = [
      [],
      [ball(1.2, 3.4)],
      [ball(1.2, 3.4), ball(2.1, 5.3), ball(0.7, 1.9)],
    ];
    for (const balls of cases) {
      rig.rec.clear();
      rig.renderer.draw(frameOf(rig.world, { balls }));
      const draws = rig.rec.calls("drawImage");
      expect(draws.filter((c) => c.args[0] === staticCanvas)).toHaveLength(1);
      const shadows = shadowDraws(rig);
      expect(shadows).toHaveLength(balls.length);
      expect(draws).toHaveLength(1 + balls.length);
      const d = 2 * SHADOW_RADIUS_M;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        const [x, y, w, h] = (shadows[i]?.args.slice(1) ?? []) as number[];
        expect(w).toBeCloseTo(d, 12);
        expect(h).toBeCloseTo(d, 12);
        expect((x ?? 0) + (w ?? 0) / 2).toBeCloseTo((b?.x ?? 0) + SHADOW_OFFSET_X_M, 12);
        expect((y ?? 0) + (h ?? 0) / 2).toBeCloseTo((b?.y ?? 0) + SHADOW_OFFSET_Y_M, 12);
      }
    }
  });

  it("stamps every shadow after the last bat fill and before the first ball fill, source-over at alpha 1", () => {
    const rig = makeRig();
    const balls = [ball(1.2, 3.4), ball(2.1, 5.3)];
    rig.renderer.draw(frameOf(rig.world, { balls }));
    const log = rig.rec.log;
    const shadow = shadowCanvas(rig);
    const shadowAt: number[] = [];
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (e?.kind === "call" && e.name === "drawImage" && e.args[0] === shadow) shadowAt.push(i);
    }
    expect(shadowAt).toHaveLength(2);

    // The first ball fill: the first fill after the translate to the first ball's center.
    const ballTranslate = log.findIndex(
      (e) => e.kind === "call" && e.name === "translate" && e.args[0] === 1.2 && e.args[1] === 3.4,
    );
    expect(ballTranslate).toBeGreaterThan(0);
    const firstBallFill = log.findIndex(
      (e, i) => i > ballTranslate && e.kind === "call" && e.name === "fill",
    );
    expect(firstBallFill).toBeGreaterThan(ballTranslate);

    // The last bat fill: every bat rotates once, then fills, then resets to the world transform.
    const flipperCount = rig.world.getFlippers().length;
    expect(flipperCount).toBeGreaterThan(0);
    let rotates = 0;
    let lastBatFill = -1;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (e?.kind !== "call") continue;
      if (e.name === "rotate") rotates++;
      if (rotates === flipperCount && e.name === "fill") lastBatFill = i;
      if (rotates === flipperCount && e.name === "setTransform") break;
    }
    expect(lastBatFill).toBeGreaterThan(0);
    for (const at of shadowAt) {
      expect(at).toBeGreaterThan(lastBatFill);
      expect(at).toBeLessThan(firstBallFill);
    }

    // State in force at each shadow stamp: source-over, alpha 1.
    for (const at of shadowAt) {
      let op: unknown = "source-over";
      let alpha: unknown = 1;
      for (let i = 0; i < at; i++) {
        const e = log[i];
        if (e?.kind === "set" && e.name === "globalCompositeOperation") op = e.value;
        if (e?.kind === "set" && e.name === "globalAlpha") alpha = e.value;
      }
      expect(op).toBe("source-over");
      expect(alpha).toBe(1);
    }
  });

  it("the shadow does not scale with speed: a fast ball stamps the same size as a resting one", () => {
    const rig = makeRig();
    const fast: BallState = { ...ball(1.2, 3.4), vx: 30, vy: -40 };
    rig.renderer.draw(frameOf(rig.world, { balls: [fast] }));
    const [, , w, h] = (shadowDraws(rig)[0]?.args.slice(1) ?? []) as number[];
    expect(w).toBeCloseTo(2 * SHADOW_RADIUS_M, 12);
    expect(h).toBeCloseTo(2 * SHADOW_RADIUS_M, 12);
  });
});

/** A FlashTracker sized for the rig's table. */
function trackerFor(world: PlanckWorld): FlashTracker {
  return new FlashTracker(maxElementId(world.getElements()));
}

/** drawImage calls that are neither the static-layer blit nor a ball-shadow stamp. */
function haloDraws(rig: Rig): CallEntry[] {
  const staticCanvas = rig.layers.layers[0]?.canvas;
  const shadow = shadowCanvas(rig);
  return rig.rec
    .calls("drawImage")
    .filter((c) => c.args[0] !== staticCanvas && c.args[0] !== shadow);
}

function setsLighter(rec: Recorder): boolean {
  return rec.sets("globalCompositeOperation").some((s) => s.value === "lighter");
}

/** How many `name` = `value` sets are followed by a `call` call before the next `name` set. */
function styledCalls(rec: Recorder, name: string, value: string, call: string): number {
  let n = 0;
  const log = rec.log;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (!e || e.kind !== "set" || e.name !== name || e.value !== value) continue;
    for (let j = i + 1; j < log.length; j++) {
      const f = log[j];
      if (f && f.kind === "call" && f.name === call) {
        n++;
        break;
      }
      if (f && f.kind === "set" && f.name === name) break;
    }
  }
  return n;
}

describe("TableRenderer flash pass (RND-03, T-05-15)", () => {
  it("a recorded bumper 202 issues exactly one halo drawImage centered on it at 2 * HALO_SCALE * radius, under lighter, and ends clean", () => {
    const rig = makeRig();
    const flash = trackerFor(rig.world);
    const circle = rig.world.getElements().find((el) => el.id === 202)?.circle;
    expect(circle).toBeTruthy();
    const cx = circle?.center.x ?? Number.NaN;
    const cy = circle?.center.y ?? Number.NaN;
    const r = circle?.radius ?? Number.NaN;

    flash.record(202, 1);
    rig.renderer.draw(frameOf(rig.world, { flash, alpha: 0 }));

    const halos = haloDraws(rig);
    expect(halos).toHaveLength(1);
    const halo = halos[0];
    expect(halo?.args[0]).toBe(rig.layers.layers[1]?.canvas);
    const [x, y, w, h] = (halo?.args.slice(1) ?? []) as number[];
    const size = 2 * HALO_SCALE * r;
    expect(w).toBeCloseTo(size, 12);
    expect(h).toBeCloseTo(size, 12);
    expect((x ?? 0) + (w ?? 0) / 2).toBeCloseTo(cx, 12);
    expect((y ?? 0) + (h ?? 0) / 2).toBeCloseTo(cy, 12);

    // "lighter" is switched on before the halo is drawn, and the frame ends clean.
    const lighterAt = rig.rec.log.findIndex(
      (e) => e.kind === "set" && e.name === "globalCompositeOperation" && e.value === "lighter",
    );
    const haloAt = halo ? rig.rec.log.indexOf(halo) : -1;
    expect(lighterAt).toBeGreaterThanOrEqual(0);
    expect(lighterAt).toBeLessThan(haloAt);
    expect(rig.rec.ctx.globalCompositeOperation).toBe("source-over");
    expect(rig.rec.ctx.globalAlpha).toBe(1);
  });

  it("with no flash recorded, or frame.flash null, never sets lighter and draws no halo (static blit plus one ball shadow)", () => {
    const rig = makeRig();
    const flash = trackerFor(rig.world);

    rig.renderer.draw(frameOf(rig.world, { flash }));
    expect(setsLighter(rig.rec)).toBe(false);
    expect(haloDraws(rig)).toHaveLength(0);
    expect(rig.rec.calls("drawImage")).toHaveLength(1 + 1);

    rig.rec.clear();
    flash.record(202, 1);
    rig.renderer.draw(frameOf(rig.world, { flash: null }));
    expect(setsLighter(rig.rec)).toBe(false);
    expect(haloDraws(rig)).toHaveLength(0);
    expect(rig.rec.calls("drawImage")).toHaveLength(1 + 1);
  });

  it("with every flashable id lit: no blur, no gradient, no new layer, and only element-local static and halo sprites", () => {
    const rig = makeRig();
    const flash = trackerFor(rig.world);
    const elements = rig.world.getElements();
    for (const el of elements) flash.record(el.id, 1);
    for (const f of rig.world.getFlippers()) flash.record(f.id, 1);

    let maxR = 0;
    for (const el of elements) if (el.circle && el.circle.radius > maxR) maxR = el.circle.radius;
    const maxHalo = 2 * HALO_SCALE * maxR;
    const allowed = new Set<unknown>(rig.layers.layers.map((l) => l.canvas));
    const atResize = rig.layers.createCount;
    expect(atResize).toBe(LAYERS_PER_RESIZE);

    for (let i = 0; i < 10; i++) {
      rig.rec.clear();
      rig.renderer.draw(frameOf(rig.world, { flash, alpha: 0.5 }));
      expect(setsLighter(rig.rec)).toBe(true);
      const raised = rig.rec
        .sets("shadowBlur")
        .filter((s) => typeof s.value !== "number" || s.value > 0);
      expect(raised).toHaveLength(0);
      expect(rig.rec.calls("createLinearGradient")).toHaveLength(0);
      expect(rig.rec.calls("createRadialGradient")).toHaveLength(0);
      for (const d of rig.rec.calls("drawImage")) expect(allowed.has(d.args[0])).toBe(true);
      const halos = haloDraws(rig);
      expect(halos.length).toBeGreaterThan(0);
      for (const d of halos) {
        expect(d.args[3]).toBeLessThanOrEqual(maxHalo + 1e-12);
        expect(d.args[4]).toBeLessThanOrEqual(maxHalo + 1e-12);
      }
      expect(rig.rec.ctx.globalCompositeOperation).toBe("source-over");
      expect(rig.rec.ctx.globalAlpha).toBe(1);
    }
    expect(rig.layers.createCount).toBe(atResize);
  });

  it("a level at or below FLASH_EPS draws nothing for that element", () => {
    const rig = makeRig();
    const flash = trackerFor(rig.world);

    // Decayed past the hard cutoff.
    flash.record(202, 1);
    // One tick for the recording step itself, then hold + cutoff.
    const steps = 1 + BUMPER_TIMING.holdSteps + FLASH_CUTOFF_TAUS * BUMPER_TIMING.decaySteps;
    for (let i = 0; i < steps; i++) flash.tick();
    expect(flash.level(202, 0, BUMPER_TIMING)).toBeLessThanOrEqual(FLASH_EPS);
    rig.renderer.draw(frameOf(rig.world, { flash }));
    expect(haloDraws(rig)).toHaveLength(0);
    expect(setsLighter(rig.rec)).toBe(false);

    // Freshly hit, but too faint to show.
    rig.rec.clear();
    flash.record(202, FLASH_EPS / 2);
    rig.renderer.draw(frameOf(rig.world, { flash }));
    expect(haloDraws(rig)).toHaveLength(0);
    expect(setsLighter(rig.rec)).toBe(false);
  });

  it("a recorded wall (100) adds one FLASH_WALL stroke an unflashed frame lacks", () => {
    const rig = makeRig();
    const flash = trackerFor(rig.world);
    rig.renderer.draw(frameOf(rig.world, { flash }));
    const before = styledCalls(rig.rec, "strokeStyle", FLASH_WALL, "stroke");
    expect(before).toBe(0);

    rig.rec.clear();
    flash.record(100, CONTACT_FLASH_PEAK);
    rig.renderer.draw(frameOf(rig.world, { flash }));
    expect(styledCalls(rig.rec, "strokeStyle", FLASH_WALL, "stroke")).toBe(before + 1);
  });

  it("a recorded flipper (0) adds one FLASH_FLIPPER fill an unflashed frame lacks", () => {
    const rig = makeRig();
    const flash = trackerFor(rig.world);
    rig.renderer.draw(frameOf(rig.world, { flash }));
    const before = styledCalls(rig.rec, "fillStyle", FLASH_FLIPPER, "fill");

    rig.rec.clear();
    flash.record(0, CONTACT_FLASH_PEAK);
    rig.renderer.draw(frameOf(rig.world, { flash }));
    expect(styledCalls(rig.rec, "fillStyle", FLASH_FLIPPER, "fill")).toBe(before + 1);
  });
});

/** A lamp reader with fixed levels (absent lamps read 0). */
function lampsAt(levels: Readonly<Record<number, number>>): LampReader {
  return { level: (lamp: number) => levels[lamp] ?? 0 };
}

/** Every lamp at `level`. */
function allLampsAt(level: number): LampReader {
  return { level: (lamp: number) => (lamp >= 0 && lamp < LAMP_COUNT ? level : 0) };
}

function shapeOf(lamp: number): LampShape {
  const s = LAMP_SHAPES.find((x) => x.lamp === lamp);
  if (!s) throw new Error(`no lamp shape ${lamp}`);
  return s;
}

/** The lamp halo sprite canvases from the rig's first resize (baked after the shadow). */
function lampHaloCanvases(rig: Rig): unknown[] {
  return rig.layers.layers.slice(SHADOW_LAYER_INDEX + 1, LAYERS_PER_RESIZE).map((l) => l.canvas);
}

/** The lamp halo canvas baked for `color`. */
function lampHaloCanvas(rig: Rig, color: string): unknown {
  return rig.layers.layers[SHADOW_LAYER_INDEX + 1 + LAMP_COLORS.indexOf(color)]?.canvas;
}

function lampHaloDraws(rig: Rig): CallEntry[] {
  const canvases = new Set(lampHaloCanvases(rig));
  return rig.rec.calls("drawImage").filter((c) => canvases.has(c.args[0]));
}

/** The value of property `name` in force at log index `at` (`dflt` when never set before it). */
function stateAt(rec: Recorder, at: number, name: string, dflt: unknown): unknown {
  let v = dflt;
  for (let i = 0; i < at; i++) {
    const e = rec.log[i];
    if (e?.kind === "set" && e.name === name) v = e.value;
  }
  return v;
}

/** Log index of the first `call` after the first `name` = `value` set, or -1. */
function callAfterSet(rec: Recorder, name: string, value: unknown, call: string): number {
  const log = rec.log;
  const at = log.findIndex((e) => e.kind === "set" && e.name === name && e.value === value);
  if (at < 0) return -1;
  return log.findIndex((e, i) => i > at && e.kind === "call" && e.name === call);
}

/** Log index of the last call named `name` before log index `at`, or -1. */
function lastCallIndexBefore(rec: Recorder, at: number, name: string): number {
  for (let i = at - 1; i >= 0; i--) {
    const e = rec.log[i];
    if (e?.kind === "call" && e.name === name) return i;
  }
  return -1;
}

/** The last call named `name` before log index `at`. */
function lastCallBefore(rec: Recorder, at: number, name: string): CallEntry | undefined {
  const e = rec.log[lastCallIndexBefore(rec, at, name)];
  return e?.kind === "call" ? e : undefined;
}

describe("TableRenderer lamp pass (PLSH-04, D-21, D-24)", () => {
  it("bakes one lamp halo per distinct lit color at resize, sized from that color's largest halo radius", () => {
    const rig = makeRig();
    expect(LAMP_COLORS).toContain(ROLLOVER_LIT);
    expect(LAMP_COLORS).toContain(SKILL_LIT);
    for (const color of LAMP_COLORS) {
      let maxR = 0;
      for (const s of LAMP_SHAPES) if (s.lit === color && s.haloRadius > maxR) maxR = s.haloRadius;
      const layer = rig.layers.layers[SHADOW_LAYER_INDEX + 1 + LAMP_COLORS.indexOf(color)];
      const n = Math.max(2, Math.round(2 * maxR * rig.view.scale));
      expect(layer?.width).toBe(n);
      expect(layer?.height).toBe(n);
    }
  });

  it("a rollover lamp at level 1: ROLLOVER_LIT lens stroke at alpha 1, one halo under lighter, a LAMP_HOTSPOT stroke at 0.8 over the middle half", () => {
    const rig = makeRig();
    const s = shapeOf(LAMP_ROLLOVER_401);
    rig.renderer.draw(frameOf(rig.world, { lamps: lampsAt({ [LAMP_ROLLOVER_401]: 1 }) }));

    // 1. The lens: the sensor path stroked in its lit color at the shape's width, round-capped.
    expect(styledCalls(rig.rec, "strokeStyle", ROLLOVER_LIT, "stroke")).toBe(1);
    const lens = callAfterSet(rig.rec, "strokeStyle", ROLLOVER_LIT, "stroke");
    expect(stateAt(rig.rec, lens, "globalAlpha", 1)).toBe(1);
    expect(stateAt(rig.rec, lens, "globalCompositeOperation", "source-over")).toBe("source-over");
    expect(stateAt(rig.rec, lens, "lineWidth", 0)).toBe(RUBBER_LINE_M);
    expect(stateAt(rig.rec, lens, "lineCap", "butt")).toBe("round");

    // 2. The halo: one drawImage of the ROLLOVER_LIT sprite, centered on the lens, under lighter.
    const halos = lampHaloDraws(rig);
    expect(halos).toHaveLength(1);
    const halo = halos[0];
    expect(halo?.args[0]).toBe(lampHaloCanvas(rig, ROLLOVER_LIT));
    const [x, y, w, h] = (halo?.args.slice(1) ?? []) as number[];
    expect(w).toBeCloseTo(2 * SENSOR_HALO_M, 12);
    expect(h).toBeCloseTo(2 * SENSOR_HALO_M, 12);
    expect((x ?? 0) + (w ?? 0) / 2).toBeCloseTo(s.cx, 12);
    expect((y ?? 0) + (h ?? 0) / 2).toBeCloseTo(s.cy, 12);
    const haloAt = halo ? rig.rec.log.indexOf(halo) : -1;
    expect(stateAt(rig.rec, haloAt, "globalCompositeOperation", "source-over")).toBe("lighter");
    expect(stateAt(rig.rec, haloAt, "globalAlpha", 1)).toBe(1);

    // 3. The hot-spot: a 0.01 m white stroke from 25 to 75 percent of the segment, at 0.8.
    expect(styledCalls(rig.rec, "strokeStyle", LAMP_HOTSPOT, "stroke")).toBe(1);
    const hot = callAfterSet(rig.rec, "strokeStyle", LAMP_HOTSPOT, "stroke");
    expect(stateAt(rig.rec, hot, "globalAlpha", 1)).toBeCloseTo(0.8, 12);
    expect(stateAt(rig.rec, hot, "lineWidth", 0)).toBe(0.01);
    const ax = s.xs[0] ?? 0;
    const ay = s.ys[0] ?? 0;
    const bx = s.xs[s.xs.length - 1] ?? 0;
    const by = s.ys[s.ys.length - 1] ?? 0;
    const move = lastCallBefore(rig.rec, hot, "moveTo");
    const line = lastCallBefore(rig.rec, hot, "lineTo");
    expect(move?.args[0]).toBeCloseTo(ax + 0.25 * (bx - ax), 12);
    expect(move?.args[1]).toBeCloseTo(ay + 0.25 * (by - ay), 12);
    expect(line?.args[0]).toBeCloseTo(ax + 0.75 * (bx - ax), 12);
    expect(line?.args[1]).toBeCloseTo(ay + 0.75 * (by - ay), 12);

    // Order: lens, then halo, then hot-spot; the frame ends clean.
    expect(lens).toBeLessThan(haloAt);
    expect(haloAt).toBeLessThan(hot);
    expect(rig.rec.ctx.globalAlpha).toBe(1);
    expect(rig.rec.ctx.globalCompositeOperation).toBe("source-over");
  });

  it("a chevron lamp at level 1: SKILL_LIT lens fill at alpha 1, one halo of radius 0.16 under lighter, a LAMP_HOTSPOT disc at 0.8", () => {
    const rig = makeRig();
    const s = shapeOf(LAMP_SKILL_402);
    rig.renderer.draw(frameOf(rig.world, { lamps: lampsAt({ [LAMP_SKILL_402]: 1 }) }));

    expect(styledCalls(rig.rec, "fillStyle", SKILL_LIT, "fill")).toBe(1);
    const lens = callAfterSet(rig.rec, "fillStyle", SKILL_LIT, "fill");
    expect(stateAt(rig.rec, lens, "globalAlpha", 1)).toBe(1);
    expect(stateAt(rig.rec, lens, "globalCompositeOperation", "source-over")).toBe("source-over");
    // The polygon: one moveTo and one lineTo per further vertex, closed.
    const begin = lastCallIndexBefore(rig.rec, lens, "beginPath");
    const path = rig.rec.log.slice(begin, lens).filter((e): e is CallEntry => e.kind === "call");
    expect(path.filter((c) => c.name === "moveTo")).toHaveLength(1);
    expect(path.filter((c) => c.name === "lineTo")).toHaveLength(s.xs.length - 1);
    expect(path.filter((c) => c.name === "closePath")).toHaveLength(1);
    expect(path.find((c) => c.name === "moveTo")?.args).toEqual([s.xs[0], s.ys[0]]);

    const halos = lampHaloDraws(rig);
    expect(halos).toHaveLength(1);
    expect(halos[0]?.args[0]).toBe(lampHaloCanvas(rig, SKILL_LIT));
    const [x, y, w, h] = (halos[0]?.args.slice(1) ?? []) as number[];
    expect(w).toBeCloseTo(0.32, 12);
    expect(h).toBeCloseTo(0.32, 12);
    expect((x ?? 0) + (w ?? 0) / 2).toBeCloseTo(s.cx, 12);
    expect((y ?? 0) + (h ?? 0) / 2).toBeCloseTo(s.cy, 12);
    const haloAt = halos[0] ? rig.rec.log.indexOf(halos[0]) : -1;
    expect(stateAt(rig.rec, haloAt, "globalCompositeOperation", "source-over")).toBe("lighter");

    expect(styledCalls(rig.rec, "fillStyle", LAMP_HOTSPOT, "fill")).toBe(1);
    const hot = callAfterSet(rig.rec, "fillStyle", LAMP_HOTSPOT, "fill");
    expect(stateAt(rig.rec, hot, "globalAlpha", 1)).toBeCloseTo(0.8, 12);
    const arc = lastCallBefore(rig.rec, hot, "arc");
    const r = s.lensRadius;
    expect(arc?.args[0]).toBeCloseTo(s.cx - 0.2 * r, 12);
    expect(arc?.args[1]).toBeCloseTo(s.cy - 0.2 * r, 12);
    expect(arc?.args[2]).toBeCloseTo(0.35 * r, 12);
    expect(rig.rec.ctx.globalAlpha).toBe(1);
    expect(rig.rec.ctx.globalCompositeOperation).toBe("source-over");
  });

  it("a lamp at level 0.5 draws its lens and halo at alpha 0.5 and its hot-spot at 0.4", () => {
    const rig = makeRig();
    rig.renderer.draw(frameOf(rig.world, { lamps: lampsAt({ [LAMP_SKILL_402]: 0.5 }) }));
    const lens = callAfterSet(rig.rec, "fillStyle", SKILL_LIT, "fill");
    expect(stateAt(rig.rec, lens, "globalAlpha", 1)).toBeCloseTo(0.5, 12);
    const halo = lampHaloDraws(rig)[0];
    const haloAt = halo ? rig.rec.log.indexOf(halo) : -1;
    expect(stateAt(rig.rec, haloAt, "globalAlpha", 1)).toBeCloseTo(0.5, 12);
    const hot = callAfterSet(rig.rec, "fillStyle", LAMP_HOTSPOT, "fill");
    expect(stateAt(rig.rec, hot, "globalAlpha", 1)).toBeCloseTo(0.4, 12);
  });

  it("a lamp at level 0 or at FLASH_EPS draws nothing: no lit color, no lamp halo, no lighter", () => {
    const rig = makeRig();
    for (const level of [0, FLASH_EPS]) {
      rig.rec.clear();
      rig.renderer.draw(frameOf(rig.world, { lamps: allLampsAt(level) }));
      for (const color of LAMP_COLORS) {
        expect(rig.rec.sets("strokeStyle").filter((e) => e.value === color)).toHaveLength(0);
        expect(rig.rec.sets("fillStyle").filter((e) => e.value === color)).toHaveLength(0);
      }
      expect(rig.rec.sets("strokeStyle").filter((e) => e.value === LAMP_HOTSPOT)).toHaveLength(0);
      expect(rig.rec.sets("fillStyle").filter((e) => e.value === LAMP_HOTSPOT)).toHaveLength(0);
      expect(lampHaloDraws(rig)).toHaveLength(0);
      expect(setsLighter(rig.rec)).toBe(false);
      expect(rig.rec.calls("drawImage")).toHaveLength(1 + 1);
    }
  });

  it("a frame with no lamps (absent or null) draws no lamp marks", () => {
    const rig = makeRig();
    for (const frame of [frameOf(rig.world), frameOf(rig.world, { lamps: null })]) {
      rig.rec.clear();
      rig.renderer.draw(frame);
      expect(lampHaloDraws(rig)).toHaveLength(0);
      expect(setsLighter(rig.rec)).toBe(false);
      expect(rig.rec.sets("strokeStyle").filter((e) => e.value === ROLLOVER_LIT)).toHaveLength(0);
      expect(rig.rec.sets("fillStyle").filter((e) => e.value === SKILL_LIT)).toHaveLength(0);
    }
  });

  it("every lamp at 1: one halo per shape, all before the bats; no gradient, blur, text or new layer; ends clean", () => {
    const rig = makeRig();
    const atResize = rig.layers.createCount;
    const allowed = new Set<unknown>(rig.layers.layers.map((l) => l.canvas));
    for (let f = 0; f < 10; f++) {
      rig.rec.clear();
      rig.rec.ctx.globalAlpha = 0.3;
      rig.rec.ctx.globalCompositeOperation = "lighter";
      rig.renderer.draw(frameOf(rig.world, { lamps: allLampsAt(1), alpha: 0.5 }));
      const halos = lampHaloDraws(rig);
      expect(halos).toHaveLength(LAMP_SHAPES.length);
      const firstRotate = rig.rec.log.findIndex((e) => e.kind === "call" && e.name === "rotate");
      expect(firstRotate).toBeGreaterThan(0);
      for (const d of halos) expect(rig.rec.log.indexOf(d)).toBeLessThan(firstRotate);
      expect(rig.rec.calls("createLinearGradient")).toHaveLength(0);
      expect(rig.rec.calls("createRadialGradient")).toHaveLength(0);
      expect(
        rig.rec.sets("shadowBlur").filter((s) => typeof s.value !== "number" || s.value > 0),
      ).toHaveLength(0);
      expect(rig.rec.calls("fillText")).toHaveLength(0);
      expect(rig.rec.calls("strokeText")).toHaveLength(0);
      for (const d of rig.rec.calls("drawImage")) expect(allowed.has(d.args[0])).toBe(true);
      expect(rig.rec.ctx.globalAlpha).toBe(1);
      expect(rig.rec.ctx.globalCompositeOperation).toBe("source-over");
    }
    expect(rig.layers.createCount).toBe(atResize);
  });
});
