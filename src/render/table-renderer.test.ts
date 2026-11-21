import { describe, it, expect } from "vitest";

import { BALL_RADIUS_M } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallState } from "../physics/types";
import { TABLE_SPEC } from "../table/spec";
import { ROLLOVER_LIT } from "./palette";
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
 */

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
  it("bakes once across ten draws: bakeCount 1 and one layer created", () => {
    const rig = makeRig();
    drawFrames(rig, 10, frameOf(rig.world));
    expect(rig.renderer.bakeCount).toBe(1);
    expect(rig.layers.createCount).toBe(1);
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
      expect(calls.filter((c) => c.name === "drawImage")).toHaveLength(1);
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
    expect(rig.layers.createCount).toBe(2);
  });
});
