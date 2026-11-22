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
import { FLASH_FLIPPER, FLASH_WALL, ROLLOVER_LIT } from "./palette";
import { HALO_SCALE, SHADOW_OFFSET_X_M, SHADOW_OFFSET_Y_M, SHADOW_RADIUS_M } from "./sprites";
import {
  TableRenderer,
  type CanvasTarget,
  type LightState,
  type RenderFrame,
} from "./table-renderer";
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
 */

/** Halo sprites baked per resize: one bumper halo and one sensor halo (05-04). */
const HALO_LAYERS = 2;

/** Ball-shadow sprites baked per resize (06-02, D-20). */
const SHADOW_LAYERS = 1;

/** Every layer one resize creates: the static layer, the halos and the shadow. */
const LAYERS_PER_RESIZE = 1 + HALO_LAYERS + SHADOW_LAYERS;

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
    lights: null,
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

  it("adds one ROLLOVER_LIT stroke for a lit rollover that an unlit frame lacks", () => {
    const rig = makeRig();
    const rollover = rig.world.getElements().find((el) => el.kind === "rollover" && !el.mount);
    expect(rollover).toBeDefined();
    const litId = rollover?.id ?? -1;

    const unlit: LightState = { isLit: () => false };
    rig.renderer.draw(frameOf(rig.world, { lights: unlit }));
    expect(rig.rec.sets("strokeStyle").filter((s) => s.value === ROLLOVER_LIT)).toHaveLength(0);

    rig.rec.clear();
    rig.renderer.draw(frameOf(rig.world, { lights: null }));
    expect(rig.rec.sets("strokeStyle").filter((s) => s.value === ROLLOVER_LIT)).toHaveLength(0);

    rig.rec.clear();
    const lit: LightState = { isLit: (id) => id === litId };
    rig.renderer.draw(frameOf(rig.world, { lights: lit }));
    const log = rig.rec.log;
    const litSets = log
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.kind === "set" && e.name === "strokeStyle" && e.value === ROLLOVER_LIT);
    expect(litSets).toHaveLength(1);
    const after = log.slice((litSets[0]?.i ?? 0) + 1);
    const nextStroke = after.find((e) => e.kind === "call" && e.name === "stroke");
    expect(nextStroke).toBeDefined();
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
