import { describe, it, expect } from "vitest";

import type { SaveKind, SaveLampPhase } from "../game/ball-save";
import type { GameState } from "../game/game-session";
import type { SkillPhase } from "../game/skill-shot";
import { SKILL_SHOT_LANES } from "../game/tuning";
import { PlanckWorld } from "../physics/planck-world";
import { pathMidpoint } from "../table/resolve";
import { TABLE_SPEC } from "../table/spec";
import { flashLevel } from "./flash";
import {
  buildLampShapes,
  LAMP_SAVE,
  POST_HOLD_STEPS,
  POST_RISE_STEPS,
  POST_SINK_STEPS,
  postPose,
  type PostPose,
  LAMP_AWARD_HOLD_STEPS,
  LAMP_BLINK_PERIOD_STEPS,
  LAMP_CHASE_DWELL_STEPS,
  LAMP_COUNT,
  LAMP_FADE_IN_STEPS,
  LAMP_FADE_OUT_STEPS,
  LAMP_INLANE_500,
  LAMP_INLANE_501,
  LAMP_ROLLOVER_400,
  LAMP_ROLLOVER_401,
  LAMP_ROLLOVER_402,
  LAMP_SKILL_400,
  LAMP_SKILL_401,
  LAMP_SKILL_402,
  LampTracker,
  SKILL_LAMPS,
  type LampLights,
  type LampRules,
} from "./lamps";
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

/**
 * Insert lamps (plan 06-03, PLSH-04, D-21, D-22): the LampTracker extends the
 * rules' boolean light state into per-lamp levels on the fixed-step clock, and
 * buildLampShapes is the one shape table the renderer and the bake read.
 */

/** Mutable fake rules: every getter reads a field the test sets. */
class FakeRules implements LampRules {
  state: GameState = "playing";
  phase: SkillPhase = "off";
  litLane = -1;
  shots = 0;
  lastLane = -1;
  getState(): GameState {
    return this.state;
  }
  getSkillPhase(): SkillPhase {
    return this.phase;
  }
  getSkillLitLane(): number {
    return this.litLane;
  }
  getSkillShotCount(): number {
    return this.shots;
  }
  getLastSkillLane(): number {
    return this.lastLane;
  }
  readonly inlanes = new Set<number>();
  isInlaneScored(elementId: number): boolean {
    return this.inlanes.has(elementId);
  }
  saveLamp: SaveLampPhase = "off";
  saves = 0;
  lastSaveKind: SaveKind | "none" = "none";
  getSaveLampPhase(): SaveLampPhase {
    return this.saveLamp;
  }
  getSaveCount(): number {
    return this.saves;
  }
  getLastSaveKind(): SaveKind | "none" {
    return this.lastSaveKind;
  }
}

/** Mutable fake lights: the lit set is edited by the test. */
class FakeLights implements LampLights {
  readonly lit = new Set<number>();
  isLit(elementId: number): boolean {
    return this.lit.has(elementId);
  }
}

interface Rig {
  readonly rules: FakeRules;
  readonly lights: FakeLights;
  readonly lamps: LampTracker;
}

function makeRig(): Rig {
  const rules = new FakeRules();
  const lights = new FakeLights();
  return { rules, lights, lamps: new LampTracker(lights, rules) };
}

function run(lamps: LampTracker, n: number): void {
  for (let i = 0; i < n; i++) lamps.update();
}

/** Every lamp level at alpha 1 (the current step). */
function levels(lamps: LampTracker): number[] {
  const out: number[] = [];
  for (let i = 0; i < LAMP_COUNT; i++) out.push(lamps.level(i, 1));
  return out;
}

describe("LampTracker fade (D-21)", () => {
  it("a lamp whose target turns 1 reaches exactly 1 after 4 updates, 0.25 per step", () => {
    const { lights, lamps } = makeRig();
    lights.lit.add(400);
    for (let k = 1; k <= LAMP_FADE_IN_STEPS; k++) {
      lamps.update();
      expect(lamps.level(LAMP_ROLLOVER_400, 1)).toBeCloseTo(k / LAMP_FADE_IN_STEPS, 6);
    }
    expect(lamps.level(LAMP_ROLLOVER_400, 1)).toBe(1);
    expect(LAMP_FADE_IN_STEPS).toBe(4);
  });

  it("a lamp whose target turns 0 reaches exactly 0 after 15 updates and not before", () => {
    const { lights, lamps } = makeRig();
    lights.lit.add(400);
    run(lamps, LAMP_FADE_IN_STEPS);
    lights.lit.clear();
    for (let k = 1; k < LAMP_FADE_OUT_STEPS; k++) {
      lamps.update();
      expect(lamps.level(LAMP_ROLLOVER_400, 1)).toBeGreaterThan(0);
    }
    lamps.update();
    expect(lamps.level(LAMP_ROLLOVER_400, 1)).toBe(0);
    expect(LAMP_FADE_OUT_STEPS).toBe(15);
  });

  it("level(i, alpha) is prev + (cur - prev) * alpha, with alpha clamped to [0, 1]", () => {
    const { lights, lamps } = makeRig();
    lights.lit.add(401);
    lamps.update(); // 0 -> 0.25
    lamps.update(); // 0.25 -> 0.5
    expect(lamps.level(LAMP_ROLLOVER_401, 0)).toBeCloseTo(0.25, 6);
    expect(lamps.level(LAMP_ROLLOVER_401, 0.5)).toBeCloseTo(0.375, 6);
    expect(lamps.level(LAMP_ROLLOVER_401, 1)).toBeCloseTo(0.5, 6);
    expect(lamps.level(LAMP_ROLLOVER_401, -3)).toBeCloseTo(0.25, 6);
    expect(lamps.level(LAMP_ROLLOVER_401, 7)).toBeCloseTo(0.5, 6);
    expect(lamps.level(LAMP_ROLLOVER_401, Number.NaN)).toBeCloseTo(0.25, 6);
  });

  it("an out-of-range lamp index reads 0", () => {
    const { lights, lamps } = makeRig();
    lights.lit.add(400);
    run(lamps, 10);
    for (const i of [-1, LAMP_COUNT, LAMP_COUNT + 5, 1.5, Number.NaN]) {
      expect(lamps.level(i, 1)).toBe(0);
    }
  });
});

describe("LampTracker targets (D-21, D-22)", () => {
  it("rollover lamps follow LampLights.isLit(400/401/402)", () => {
    const { lights, lamps } = makeRig();
    lights.lit.add(400);
    lights.lit.add(402);
    run(lamps, LAMP_FADE_IN_STEPS);
    expect(lamps.level(LAMP_ROLLOVER_400, 1)).toBe(1);
    expect(lamps.level(LAMP_ROLLOVER_401, 1)).toBe(0);
    expect(lamps.level(LAMP_ROLLOVER_402, 1)).toBe(1);
  });

  it("rotating lights only the chevron under getSkillLitLane(), steady", () => {
    const { rules, lamps } = makeRig();
    rules.phase = "rotating";
    rules.litLane = 401;
    for (let i = 0; i < 200; i++) {
      lamps.update();
      if (i >= LAMP_FADE_IN_STEPS - 1) expect(lamps.level(LAMP_SKILL_401, 1)).toBe(1);
      expect(lamps.level(LAMP_SKILL_400, 1)).toBe(0);
      expect(lamps.level(LAMP_SKILL_402, 1)).toBe(0);
    }
    // The lane moves on: the old chevron fades out, the new one fades in.
    rules.litLane = 402;
    run(lamps, LAMP_FADE_OUT_STEPS);
    expect(lamps.level(LAMP_SKILL_401, 1)).toBe(0);
    expect(lamps.level(LAMP_SKILL_402, 1)).toBe(1);
  });

  it("frozen blinks the lit chevron: on for 30 updates, off for 30, from the freeze", () => {
    const { rules, lamps } = makeRig();
    rules.phase = "rotating";
    rules.litLane = 400;
    run(lamps, 37); // freeze mid-way through any step-counter cycle
    rules.phase = "frozen";
    const half = LAMP_BLINK_PERIOD_STEPS / 2;
    // On half: stays saturated (it was already lit while rotating).
    for (let i = 0; i < half; i++) {
      lamps.update();
      expect(lamps.level(LAMP_SKILL_400, 1)).toBe(1);
    }
    // Off half: fades out to exactly 0 after 15 updates and stays dark.
    for (let i = 0; i < half; i++) {
      lamps.update();
      if (i >= LAMP_FADE_OUT_STEPS - 1) expect(lamps.level(LAMP_SKILL_400, 1)).toBe(0);
      else expect(lamps.level(LAMP_SKILL_400, 1)).toBeGreaterThan(0);
    }
    // Next on half: back to 1 within 4 updates.
    run(lamps, LAMP_FADE_IN_STEPS);
    expect(lamps.level(LAMP_SKILL_400, 1)).toBe(1);
    expect(lamps.level(LAMP_SKILL_401, 1)).toBe(0);
    expect(lamps.level(LAMP_SKILL_402, 1)).toBe(0);
  });

  it("a getSkillShotCount() increment lights the getLastSkillLane() chevron steady for 60 updates whatever the phase", () => {
    const { rules, lamps } = makeRig();
    rules.phase = "rotating";
    rules.litLane = 400;
    run(lamps, 10);
    // The shot resolves on lane 402: disarmed, count up.
    rules.phase = "off";
    rules.litLane = -1;
    rules.shots = 1;
    rules.lastLane = 402;
    for (let i = 0; i < LAMP_AWARD_HOLD_STEPS; i++) {
      lamps.update();
      if (i >= LAMP_FADE_IN_STEPS - 1) expect(lamps.level(LAMP_SKILL_402, 1)).toBe(1);
      expect(lamps.level(LAMP_SKILL_401, 1)).toBe(0);
    }
    // The hold is over: it fades out.
    run(lamps, LAMP_FADE_OUT_STEPS);
    expect(lamps.level(LAMP_SKILL_402, 1)).toBe(0);
    expect(LAMP_AWARD_HOLD_STEPS).toBe(60);
  });

  it("the award hold also shows over a re-armed rotating lane, counted from the construction snapshot", () => {
    const rules = new FakeRules();
    rules.shots = 2;
    rules.lastLane = 401;
    const tracker = new LampTracker(new FakeLights(), rules); // snapshot: 2 shots
    rules.phase = "rotating";
    rules.litLane = 400;
    rules.shots = 3;
    rules.lastLane = 402;
    run(tracker, LAMP_FADE_IN_STEPS);
    expect(tracker.level(LAMP_SKILL_402, 1)).toBe(1);
    expect(tracker.level(LAMP_SKILL_400, 1)).toBe(0);
    // A tracker built after the third shot sees no increment, so no hold: the rotating lane shows.
    const late = new LampTracker(new FakeLights(), rules);
    run(late, LAMP_FADE_IN_STEPS);
    expect(late.level(LAMP_SKILL_402, 1)).toBe(0);
    expect(late.level(LAMP_SKILL_400, 1)).toBe(1);
  });

  it("a new game (the count dropping to 0) starts no hold", () => {
    const rules = new FakeRules();
    rules.shots = 4;
    rules.lastLane = 401;
    const tracker = new LampTracker(new FakeLights(), rules);
    rules.shots = 0;
    rules.lastLane = -1;
    rules.phase = "rotating";
    rules.litLane = 400;
    run(tracker, LAMP_FADE_IN_STEPS);
    expect(tracker.level(LAMP_SKILL_400, 1)).toBe(1);
    expect(tracker.level(LAMP_SKILL_401, 1)).toBe(0);
  });

  it("phase off with no hold leaves every chevron at 0", () => {
    const { rules, lamps } = makeRig();
    rules.phase = "rotating";
    rules.litLane = 402;
    run(lamps, 10);
    rules.phase = "off";
    rules.litLane = -1;
    run(lamps, LAMP_FADE_OUT_STEPS);
    expect(lamps.level(LAMP_SKILL_400, 1)).toBe(0);
    expect(lamps.level(LAMP_SKILL_401, 1)).toBe(0);
    expect(lamps.level(LAMP_SKILL_402, 1)).toBe(0);
  });

  it("idempotency: 100 updates with unchanged state keep a saturated lamp at exactly 1 and an idle lamp at exactly 0", () => {
    const { rules, lights, lamps } = makeRig();
    lights.lit.add(401);
    rules.phase = "rotating";
    rules.litLane = 400;
    run(lamps, LAMP_FADE_IN_STEPS);
    for (let i = 0; i < 100; i++) {
      lamps.update();
      expect(lamps.level(LAMP_ROLLOVER_401, 1)).toBe(1);
      expect(lamps.level(LAMP_ROLLOVER_401, 0)).toBe(1);
      expect(lamps.level(LAMP_SKILL_400, 1)).toBe(1);
      expect(lamps.level(LAMP_ROLLOVER_400, 1)).toBe(0);
      expect(lamps.level(LAMP_ROLLOVER_400, 0)).toBe(0);
      expect(lamps.level(LAMP_SKILL_402, 1)).toBe(0);
    }
  });

  it("concurrency: frames with no update() leave every level and the blink phase unchanged", () => {
    const { rules, lights, lamps } = makeRig();
    const twin = new LampTracker(lights, rules);
    lights.lit.add(400);
    rules.phase = "rotating";
    rules.litLane = 401;
    run(lamps, 2);
    run(twin, 2);
    rules.phase = "frozen";
    run(lamps, 20);
    run(twin, 20);
    const before = levels(lamps);
    const alphaHalf: number[] = [];
    for (let i = 0; i < LAMP_COUNT; i++) alphaHalf.push(lamps.level(i, 0.5));
    // A hidden tab: many frames read the tracker, none steps it.
    for (let f = 0; f < 500; f++) {
      for (let i = 0; i < LAMP_COUNT; i++) {
        lamps.level(i, f / 500);
      }
    }
    expect(levels(lamps)).toEqual(before);
    for (let i = 0; i < LAMP_COUNT; i++) expect(lamps.level(i, 0.5)).toBe(alphaHalf[i]);
    // The blink phase froze too: resuming replays exactly what the twin does.
    for (let s = 0; s < 120; s++) {
      lamps.update();
      twin.update();
      expect(levels(lamps)).toEqual(levels(twin));
    }
  });
});

describe("LampTracker inlane arrows (plan 06-03 Task 2, D-21)", () => {
  it("arrow 500 follows isInlaneScored(500) and arrow 501 follows 501 while playing", () => {
    const { rules, lamps } = makeRig();
    rules.inlanes.add(500);
    run(lamps, LAMP_FADE_IN_STEPS);
    expect(lamps.level(LAMP_INLANE_500, 1)).toBe(1);
    expect(lamps.level(LAMP_INLANE_501, 1)).toBe(0);
    rules.inlanes.add(501);
    run(lamps, LAMP_FADE_IN_STEPS);
    expect(lamps.level(LAMP_INLANE_501, 1)).toBe(1);
    // The next serve clears both: they fade out.
    rules.inlanes.clear();
    run(lamps, LAMP_FADE_OUT_STEPS);
    expect(lamps.level(LAMP_INLANE_500, 1)).toBe(0);
    expect(lamps.level(LAMP_INLANE_501, 1)).toBe(0);
  });

  it("a tilt leaves the arrows as they were (rule state)", () => {
    const { rules, lamps } = makeRig();
    rules.inlanes.add(501);
    run(lamps, LAMP_FADE_IN_STEPS);
    rules.state = "tilted";
    for (let i = 0; i < 100; i++) {
      lamps.update();
      expect(lamps.level(LAMP_INLANE_501, 1)).toBe(1);
      expect(lamps.level(LAMP_INLANE_500, 1)).toBe(0);
    }
  });
});

/** The attract ping-pong order, as lamp indices (500 400 401 402 501 402 401 400). */
const CHASE = [
  LAMP_INLANE_500,
  LAMP_ROLLOVER_400,
  LAMP_ROLLOVER_401,
  LAMP_ROLLOVER_402,
  LAMP_INLANE_501,
  LAMP_ROLLOVER_402,
  LAMP_ROLLOVER_401,
  LAMP_ROLLOVER_400,
] as const;
const CHASE_LAMPS = [
  LAMP_INLANE_500,
  LAMP_ROLLOVER_400,
  LAMP_ROLLOVER_401,
  LAMP_ROLLOVER_402,
  LAMP_INLANE_501,
] as const;
const CHEVRONS = [LAMP_SKILL_400, LAMP_SKILL_401, LAMP_SKILL_402] as const;

describe("LampTracker attract chase (plan 06-03 Task 3, D-22)", () => {
  it("game over runs the 500 400 401 402 501 402 401 400 ping-pong, one lamp per 18-update dwell", () => {
    const { rules, lights, lamps } = makeRig();
    rules.state = "game-over";
    // Rule light state and stale inlane flags are ignored in attract.
    lights.lit.add(401);
    rules.inlanes.add(501);
    expect(LAMP_CHASE_DWELL_STEPS).toBe(18);
    const dwell = LAMP_CHASE_DWELL_STEPS;
    for (let d = 0; d < CHASE.length * 2; d++) {
      const lamp = CHASE[d % CHASE.length] ?? -1;
      const next = CHASE[(d + 1) % CHASE.length] ?? -1;
      for (let i = 0; i < dwell; i++) {
        lamps.update();
        // The dwell lamp rises from its first update.
        expect(lamps.level(lamp, 1), `dwell ${d} update ${i}`).toBeGreaterThan(0);
      }
      // End of the dwell: only that lamp is lit, the previous one has faded out.
      for (const l of CHASE_LAMPS) {
        expect(lamps.level(l, 1), `dwell ${d} lamp ${l}`).toBe(l === lamp ? 1 : 0);
      }
      expect(lamps.level(next, 1)).toBe(0);
      for (const c of CHEVRONS) expect(lamps.level(c, 1)).toBe(0);
    }
  });

  it("the chase stops when a game starts: the lamps follow rule state again", () => {
    const { rules, lights, lamps } = makeRig();
    rules.state = "game-over";
    run(lamps, LAMP_CHASE_DWELL_STEPS * 3);
    rules.state = "playing";
    lights.lit.add(402);
    run(lamps, LAMP_FADE_OUT_STEPS);
    for (const l of CHASE_LAMPS) {
      expect(lamps.level(l, 1)).toBe(l === LAMP_ROLLOVER_402 ? 1 : 0);
    }
  });

  it("tilted: chevrons go out with the disarm, rollover and arrow lamps keep their rule state", () => {
    const { rules, lights, lamps } = makeRig();
    rules.phase = "rotating";
    rules.litLane = 400;
    lights.lit.add(401);
    rules.inlanes.add(500);
    run(lamps, LAMP_FADE_IN_STEPS);
    expect(lamps.level(LAMP_SKILL_400, 1)).toBe(1);
    rules.state = "tilted";
    rules.phase = "off";
    rules.litLane = -1;
    run(lamps, LAMP_FADE_OUT_STEPS);
    for (const c of CHEVRONS) expect(lamps.level(c, 1)).toBe(0);
    expect(lamps.level(LAMP_ROLLOVER_401, 1)).toBe(1);
    expect(lamps.level(LAMP_INLANE_500, 1)).toBe(1);
    expect(lamps.level(LAMP_ROLLOVER_400, 1)).toBe(0);
    expect(lamps.level(LAMP_INLANE_501, 1)).toBe(0);
  });

  it("blink limit: across 600 frozen updates every on/off cycle of the blinking chevron is exactly 60 updates", () => {
    const { rules, lamps } = makeRig();
    rules.phase = "rotating";
    rules.litLane = 402;
    run(lamps, 37);
    rules.phase = "frozen";
    const onEdges: number[] = [];
    const offEdges: number[] = [];
    let last = lamps.level(LAMP_SKILL_402, 1);
    let lastDelta = 0;
    for (let n = 0; n < 600; n++) {
      lamps.update();
      const lv = lamps.level(LAMP_SKILL_402, 1);
      const delta = lv - last;
      if (delta > 0 && lastDelta <= 0) onEdges.push(n);
      if (delta < 0 && lastDelta >= 0) offEdges.push(n);
      if (delta !== 0) lastDelta = delta;
      last = lv;
    }
    expect(onEdges.length).toBeGreaterThanOrEqual(9);
    expect(offEdges.length).toBeGreaterThanOrEqual(9);
    for (const edges of [onEdges, offEdges]) {
      for (let i = 1; i < edges.length; i++) {
        expect((edges[i] ?? 0) - (edges[i - 1] ?? 0)).toBe(LAMP_BLINK_PERIOD_STEPS);
      }
    }
    // The first blink is a full on half, never a short flash.
    expect(offEdges[0]).toBe(LAMP_BLINK_PERIOD_STEPS / 2);
  });
});

describe("buildLampShapes (D-21 lamp table)", () => {
  const elements = new PlanckWorld({ table: TABLE_SPEC }).getElements();
  const shapes = buildLampShapes(elements);

  it("builds the three rollover strokes from elements 400, 401 and 402", () => {
    for (const [lamp, id] of [
      [LAMP_ROLLOVER_400, 400],
      [LAMP_ROLLOVER_401, 401],
      [LAMP_ROLLOVER_402, 402],
    ] as const) {
      const s = shapes.find((x) => x.lamp === lamp);
      const el = elements.find((e) => e.id === id);
      expect(s).toBeDefined();
      expect(el).toBeDefined();
      if (!s || !el) continue;
      expect(s.style).toBe("stroke");
      expect(s.closed).toBe(false);
      expect(s.elementDrawn).toBe(true);
      expect(s.lineWidth).toBe(RUBBER_LINE_M);
      expect(s.haloRadius).toBe(SENSOR_HALO_M);
      expect(s.lit).toBe(ROLLOVER_LIT);
      expect(s.unlit).toBe(ROLLOVER_UNLIT);
      expect(s.xs).toBeInstanceOf(Float64Array);
      expect(s.ys).toBeInstanceOf(Float64Array);
      expect(Array.from(s.xs)).toEqual(el.vertices.map((v) => v.x));
      expect(Array.from(s.ys)).toEqual(el.vertices.map((v) => v.y));
      const a = el.vertices[0];
      const b = el.vertices[el.vertices.length - 1];
      expect(s.cx).toBeCloseTo(((a?.x ?? 0) + (b?.x ?? 0)) / 2, 12);
      expect(s.cy).toBeCloseTo(((a?.y ?? 0) + (b?.y ?? 0)) / 2, 12);
    }
  });

  it("builds the three skill chevrons as 0.20 x 0.12 fill polygons at (0.95|1.45|1.95, 1.32)", () => {
    for (const [lamp, cx] of [
      [LAMP_SKILL_400, 0.95],
      [LAMP_SKILL_401, 1.45],
      [LAMP_SKILL_402, 1.95],
    ] as const) {
      const s = shapes.find((x) => x.lamp === lamp);
      expect(s).toBeDefined();
      if (!s) continue;
      expect(s.style).toBe("fill");
      expect(s.closed).toBe(true);
      expect(s.elementDrawn).toBe(false);
      expect(s.lit).toBe(SKILL_LIT);
      expect(s.unlit).toBe(SKILL_UNLIT);
      expect(s.haloRadius).toBe(0.16);
      expect(s.lensRadius).toBeCloseTo(0.1, 12);
      expect(s.cx).toBeCloseTo(cx, 12);
      expect(s.cy).toBeCloseTo(1.32, 12);
      const xs = Array.from(s.xs);
      const ys = Array.from(s.ys);
      expect(xs.length).toBe(6);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 12);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.12, 12);
      // Upward: the apex is the top-most (smallest y) vertex, on the center line.
      const apex = ys.indexOf(Math.min(...ys));
      expect(xs[apex]).toBeCloseTo(cx, 12);
      // Arm thickness: the inner notch sits one arm (0.05 m, normal to the arm) below the outer edge.
      const dx = 0.1;
      const dy = 0.12;
      const len = Math.hypot(dx, dy);
      const innerApex =
        ys.filter((_, i) => Math.abs((xs[i] ?? 0) - cx) < 1e-9).sort((p, q) => p - q)[1] ?? 0;
      expect(innerApex - (ys[apex] ?? 0)).toBeCloseTo((0.05 * len) / dx, 9);
    }
  });

  it("builds the two inlane arrows: a 0.16 x 0.12 head plus a 0.05 x 0.08 stem at (0.585, 4.72) and its mirror", () => {
    for (const [lamp, cx] of [
      [LAMP_INLANE_500, 0.585],
      [LAMP_INLANE_501, 2.315],
    ] as const) {
      const s = shapes.find((x) => x.lamp === lamp);
      expect(s).toBeDefined();
      if (!s) continue;
      expect(s.style).toBe("fill");
      expect(s.closed).toBe(true);
      expect(s.elementDrawn).toBe(false);
      expect(s.lit).toBe(INLANE_LIT);
      expect(s.unlit).toBe(INLANE_UNLIT);
      expect(s.haloRadius).toBe(0.14);
      expect(s.lensRadius).toBeCloseTo(0.08, 12);
      expect(s.cx).toBeCloseTo(cx, 12);
      expect(s.cy).toBeCloseTo(4.72, 12);
      const xs = Array.from(s.xs);
      const ys = Array.from(s.ys);
      expect(xs.length).toBe(7);
      // Head: 0.16 wide; whole arrow 0.12 + 0.08 tall, centered on (cx, 4.72).
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.16, 12);
      expect(Math.min(...ys)).toBeCloseTo(4.72 - 0.1, 12);
      expect(Math.max(...ys)).toBeCloseTo(4.72 + 0.1, 12);
      // Upward: the apex is the single top-most vertex, on the center line.
      const top = Math.min(...ys);
      expect(ys.filter((y) => Math.abs(y - top) < 1e-9).length).toBe(1);
      expect(xs[ys.indexOf(top)]).toBeCloseTo(cx, 12);
      // Stem: 0.05 wide over the bottom 0.08.
      const bottom = Math.max(...ys);
      const stemXs = xs.filter((_, i) => Math.abs((ys[i] ?? 0) - bottom) < 1e-9);
      expect(stemXs.length).toBe(2);
      expect(Math.abs((stemXs[0] ?? 0) - (stemXs[1] ?? 0))).toBeCloseTo(0.05, 12);
      const headBase = ys.filter((y) => Math.abs(y - (top + 0.12)) < 1e-9);
      expect(headBase.length).toBe(4);
    }
    // Mirror images about x = 1.45.
    const l = shapes.find((x) => x.lamp === LAMP_INLANE_500);
    const r = shapes.find((x) => x.lamp === LAMP_INLANE_501);
    if (l && r) {
      const lx = Array.from(l.xs)
        .map((x) => 2.9 - x)
        .sort((p, q) => p - q);
      const rx = Array.from(r.xs).sort((p, q) => p - q);
      for (let i = 0; i < lx.length; i++) expect(rx[i]).toBeCloseTo(lx[i] ?? 0, 12);
    }
  });

  it("every skill lane is a top rollover in TABLE_SPEC, left to right, and its chevron sits under its midpoint (06-REVIEW WR-03)", () => {
    // One chevron lamp per skill lane: a lane added without one fails here,
    // not by a geometry coincidence (06-REVIEW IN-05).
    expect(SKILL_SHOT_LANES.length).toBe(SKILL_LAMPS.length);
    const xs: number[] = [];
    SKILL_SHOT_LANES.forEach((id, i) => {
      const el = elements.find((e) => e.id === id);
      expect(el?.kind).toBe("rollover");
      if (!el) return;
      const m = pathMidpoint(el);
      xs.push(m.x);
      const s = shapes.find((x) => x.lamp === SKILL_LAMPS[i]);
      expect(s).toBeDefined();
      expect(s?.cx).toBeCloseTo(m.x, 12);
      expect(s?.cy ?? 0).toBeGreaterThan(m.y);
    });
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
  });

  it("each inlane arrow sits on its lane sensor's midpoint x, above it (06-REVIEW WR-03)", () => {
    for (const [lamp, id] of [
      [LAMP_INLANE_500, 500],
      [LAMP_INLANE_501, 501],
    ] as const) {
      const el = elements.find((e) => e.id === id);
      expect(el?.kind).toBe("lane");
      if (!el) continue;
      const m = pathMidpoint(el);
      const s = shapes.find((x) => x.lamp === lamp);
      expect(s?.cx).toBeCloseTo(m.x, 12);
      expect(s?.cy ?? Infinity).toBeLessThan(m.y);
    }
  });

  it("returns no shape for a missing rollover element", () => {
    const only = buildLampShapes(elements.filter((e) => e.id !== 401));
    expect(only.find((s) => s.lamp === LAMP_ROLLOVER_401)).toBeUndefined();
    expect(only.find((s) => s.lamp === LAMP_ROLLOVER_400)).toBeDefined();
  });
});

/**
 * Ball-save ring lamp and post flourish (plan 06-10, PLSH-07, D-07, D-10,
 * D-22): the ring is one more row in the lamp table, concentric with the
 * "post" element's circle; the post flourish clock lives in the tracker and
 * starts on a kickback save-count increment.
 */
describe("Ball-save ring shape (plan 06-10, D-07, D-10)", () => {
  const elements = new PlanckWorld({ table: TABLE_SPEC }).getElements();
  const post = elements.find((e) => e.kind === "post");

  it("LAMP_SAVE is lamp 8 of 9", () => {
    expect(LAMP_SAVE).toBe(8);
    expect(LAMP_COUNT).toBe(9);
  });

  it("buildLampShapes adds one closed 48-point SAVE_LIT / SAVE_UNLIT stroke around the post circle: centerline R + 0.02 + 0.035 / 2, width 0.035, halo 0.22", () => {
    const shapes = buildLampShapes(elements);
    const rings = shapes.filter((s) => s.lamp === LAMP_SAVE);
    expect(rings).toHaveLength(1);
    const s = rings[0];
    const c = post?.circle;
    expect(c).toBeTruthy();
    if (!s || !c) return;
    const R = c.radius;
    const rc = R + 0.02 + 0.035 / 2;
    expect(s.style).toBe("stroke");
    expect(s.closed).toBe(true);
    expect(s.elementDrawn).toBe(false);
    expect(s.lineWidth).toBe(0.035);
    expect(s.lit).toBe(SAVE_LIT);
    expect(s.unlit).toBe(SAVE_UNLIT);
    expect(s.haloRadius).toBe(0.22);
    expect(s.cx).toBe(c.center.x);
    expect(s.cy).toBe(c.center.y);
    expect(s.lensRadius).toBeCloseTo(rc, 12);
    expect(s.xs).toBeInstanceOf(Float64Array);
    expect(s.ys).toBeInstanceOf(Float64Array);
    expect(s.xs.length).toBe(48);
    expect(s.ys.length).toBe(48);
    for (let i = 0; i < s.xs.length; i++) {
      const d = Math.hypot((s.xs[i] ?? 0) - c.center.x, (s.ys[i] ?? 0) - c.center.y);
      expect(d).toBeCloseTo(rc, 12);
    }
    // Inner edge of the stroke sits 0.02 m outside the collider.
    expect(rc - s.lineWidth / 2).toBeCloseTo(R + 0.02, 12);
  });

  it("a table without a post element yields no ring", () => {
    const shapes = buildLampShapes(elements.filter((e) => e.kind !== "post"));
    expect(shapes.find((s) => s.lamp === LAMP_SAVE)).toBeUndefined();
    expect(shapes.length).toBe(buildLampShapes(elements).length - 1);
  });
});

describe("LampTracker ball-save ring (plan 06-10, D-10, D-22)", () => {
  it("steady lights the ring to exactly 1 and holds it; off fades it to exactly 0", () => {
    const { rules, lamps } = makeRig();
    rules.saveLamp = "steady";
    for (let i = 0; i < 200; i++) {
      lamps.update();
      if (i >= LAMP_FADE_IN_STEPS - 1) expect(lamps.level(LAMP_SAVE, 1)).toBe(1);
    }
    rules.saveLamp = "off";
    run(lamps, LAMP_FADE_OUT_STEPS);
    expect(lamps.level(LAMP_SAVE, 1)).toBe(0);
  });

  it("blink follows the 60-step blink from the blink edge: on for 30 updates, off for 30", () => {
    const { rules, lamps } = makeRig();
    rules.saveLamp = "steady";
    run(lamps, 41);
    rules.saveLamp = "blink";
    const half = LAMP_BLINK_PERIOD_STEPS / 2;
    for (let i = 0; i < half; i++) {
      lamps.update();
      expect(lamps.level(LAMP_SAVE, 1)).toBe(1);
    }
    for (let i = 0; i < half; i++) {
      lamps.update();
      if (i >= LAMP_FADE_OUT_STEPS - 1) expect(lamps.level(LAMP_SAVE, 1)).toBe(0);
      else expect(lamps.level(LAMP_SAVE, 1)).toBeGreaterThan(0);
    }
    run(lamps, LAMP_FADE_IN_STEPS);
    expect(lamps.level(LAMP_SAVE, 1)).toBe(1);
  });

  it("blink limit: every on/off cycle of the blinking ring is exactly 60 updates (2 Hz)", () => {
    const { rules, lamps } = makeRig();
    rules.saveLamp = "blink";
    const onEdges: number[] = [];
    let last = 0;
    for (let n = 0; n < 600; n++) {
      lamps.update();
      const lv = lamps.level(LAMP_SAVE, 1);
      if (lv > 0 && last === 0) onEdges.push(n);
      last = lv;
    }
    expect(onEdges.length).toBeGreaterThanOrEqual(9);
    for (let i = 1; i < onEdges.length; i++) {
      expect((onEdges[i] ?? 0) - (onEdges[i - 1] ?? 0)).toBe(LAMP_BLINK_PERIOD_STEPS);
    }
  });

  it("game over (attract) keeps the ring at 0 whatever the save phase reads", () => {
    const { rules, lamps } = makeRig();
    rules.state = "game-over";
    rules.saveLamp = "steady";
    for (let i = 0; i < 300; i++) {
      lamps.update();
      expect(lamps.level(LAMP_SAVE, 1)).toBe(0);
    }
  });
});

describe("LampTracker post flourish clock (plan 06-10, D-07)", () => {
  const TOTAL = POST_RISE_STEPS + POST_HOLD_STEPS + POST_SINK_STEPS;

  it("the flourish constants are rise 3, hold 48, sink 24", () => {
    expect(POST_RISE_STEPS).toBe(3);
    expect(POST_HOLD_STEPS).toBe(48);
    expect(POST_SINK_STEPS).toBe(24);
  });

  it("postAge is -1 before any kickback", () => {
    const { lamps } = makeRig();
    expect(lamps.postAge(0)).toBe(-1);
    run(lamps, 50);
    expect(lamps.postAge(0.5)).toBe(-1);
  });

  it("a kickback save-count increment starts the flourish: the update that sees it reads age 0 at alpha 0, then one step per update", () => {
    const { rules, lamps } = makeRig();
    run(lamps, 10);
    rules.saves = 1;
    rules.lastSaveKind = "kickback";
    lamps.update();
    expect(lamps.postAge(0)).toBe(0);
    expect(lamps.postAge(0.5)).toBeCloseTo(0.5, 12);
    expect(lamps.postAge(7)).toBeCloseTo(1, 12);
    expect(lamps.postAge(-2)).toBe(0);
    for (let k = 1; k < TOTAL; k++) {
      lamps.update();
      expect(lamps.postAge(0)).toBe(k);
    }
    // Past rise + hold + sink: no flourish showing.
    lamps.update();
    expect(lamps.postAge(0)).toBe(-1);
    expect(lamps.postAge(1)).toBe(-1);
  });

  it("a backstop save-count increment never starts it", () => {
    const { rules, lamps } = makeRig();
    rules.saves = 1;
    rules.lastSaveKind = "backstop";
    for (let i = 0; i < 100; i++) {
      lamps.update();
      expect(lamps.postAge(0)).toBe(-1);
    }
  });

  it("a kickback seen at construction (the snapshot) starts nothing", () => {
    const rules = new FakeRules();
    rules.saves = 2;
    rules.lastSaveKind = "kickback";
    const tracker = new LampTracker(new FakeLights(), rules);
    run(tracker, 5);
    expect(tracker.postAge(0)).toBe(-1);
  });

  it("a second kickback restarts the flourish at age 0", () => {
    const { rules, lamps } = makeRig();
    rules.saves = 1;
    rules.lastSaveKind = "kickback";
    lamps.update();
    run(lamps, 20);
    expect(lamps.postAge(0)).toBe(20);
    rules.saves = 2;
    lamps.update();
    expect(lamps.postAge(0)).toBe(0);
  });

  it("frames with no update() leave the flourish age unchanged (it freezes with the sim)", () => {
    const { rules, lamps } = makeRig();
    rules.saves = 1;
    rules.lastSaveKind = "kickback";
    lamps.update();
    run(lamps, 4);
    for (let f = 0; f < 200; f++) lamps.postAge(f / 200);
    expect(lamps.postAge(0.25)).toBeCloseTo(4.25, 12);
  });
});

describe("postPose (plan 06-10, UI-SPEC post flourish)", () => {
  function pose(age: number): PostPose {
    const out: PostPose = { scale: -1, alpha: -1, flash: -1, visible: true };
    postPose(age, out);
    return out;
  }

  it("rises from 0.7R at age 0 to R at age 3", () => {
    expect(pose(0).visible).toBe(true);
    expect(pose(0).scale).toBeCloseTo(0.7, 12);
    expect(pose(1.5).scale).toBeCloseTo(0.85, 12);
    expect(pose(3).scale).toBeCloseTo(1, 12);
    expect(pose(0).alpha).toBe(1);
  });

  it("holds scale 1 and alpha 1 from age 3 through 51", () => {
    for (const age of [3, 10, 25.5, 40, 51]) {
      const p = pose(age);
      expect(p.visible).toBe(true);
      expect(p.scale).toBeCloseTo(1, 12);
      expect(p.alpha).toBeCloseTo(1, 12);
    }
  });

  it("sinks from R to 0.7R with alpha 1 to 0 over 24 steps: age 63 gives scale 0.85 and alpha 0.5", () => {
    const p = pose(63);
    expect(p.visible).toBe(true);
    expect(p.scale).toBeCloseTo(0.85, 12);
    expect(p.alpha).toBeCloseTo(0.5, 12);
    expect(pose(74.9).scale).toBeGreaterThan(0.7);
  });

  it("is invisible at age 75 and beyond, and for a negative or non-finite age", () => {
    for (const age of [75, 76, 500, -0.001, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = pose(age);
      expect(p.visible).toBe(false);
      expect(p.alpha).toBe(0);
      expect(p.flash).toBe(0);
    }
  });

  it("flash equals flashLevel(age, 10, 2): 1 through age 2, then decaying", () => {
    for (const age of [0, 1, 2, 2.5, 3, 5, 10, 20, 30, 41, 42, 50, 63, 74]) {
      expect(pose(age).flash).toBeCloseTo(flashLevel(age, 10, 2), 12);
    }
    expect(pose(2).flash).toBe(1);
    expect(pose(5).flash).toBeLessThan(1);
    expect(pose(5).flash).toBeGreaterThan(0);
  });

  it("writes into the caller-owned pose (no new object)", () => {
    const out: PostPose = { scale: 0, alpha: 0, flash: 0, visible: false };
    const ref = out;
    postPose(10, out);
    expect(out).toBe(ref);
    expect(out.visible).toBe(true);
  });
});

/**
 * Lamp state map backstop (06-UI-SPEC E5): every lamp's target in every FSM
 * state the rules can show, driven through the tracker's read-only getters.
 */
describe("LampTracker state map (06-UI-SPEC E5 backstop)", () => {
  type Scene = {
    readonly name: string;
    readonly set: (r: FakeRules, l: FakeLights) => void;
    readonly lit: readonly number[];
  };
  const SCENES: readonly Scene[] = [
    {
      name: "serve: ball in the chute, skill rotating on 400, save armed (steady)",
      set: (r) => {
        r.phase = "rotating";
        r.litLane = 400;
        r.saveLamp = "steady";
      },
      lit: [LAMP_SKILL_400, LAMP_SAVE],
    },
    {
      name: "armed play with rollover 401 lit and inlane 501 scored, save steady",
      set: (r, l) => {
        l.lit.add(401);
        r.inlanes.add(501);
        r.saveLamp = "steady";
      },
      lit: [LAMP_ROLLOVER_401, LAMP_INLANE_501, LAMP_SAVE],
    },
    {
      name: "save spent: every save-ring level is 0",
      set: (r) => {
        r.saveLamp = "off";
      },
      lit: [],
    },
    {
      name: "tilted: skill and save out, rollover 400 and inlane 500 keep rule state",
      set: (r, l) => {
        r.state = "tilted";
        r.saveLamp = "off";
        l.lit.add(400);
        r.inlanes.add(500);
      },
      lit: [LAMP_ROLLOVER_400, LAMP_INLANE_500],
    },
  ];

  for (const scene of SCENES) {
    it(`${scene.name}`, () => {
      const { rules, lights, lamps } = makeRig();
      scene.set(rules, lights);
      run(lamps, LAMP_FADE_OUT_STEPS + 1);
      for (let i = 0; i < LAMP_COUNT; i++) {
        expect(lamps.level(i, 1)).toBe(scene.lit.includes(i) ? 1 : 0);
      }
    });
  }

  it("frozen skill and the last 2 s of the save both blink at 2 Hz, each from its own edge", () => {
    const { rules, lamps } = makeRig();
    rules.phase = "rotating";
    rules.litLane = 402;
    rules.saveLamp = "steady";
    run(lamps, 17);
    rules.phase = "frozen";
    run(lamps, LAMP_FADE_OUT_STEPS);
    rules.saveLamp = "blink";
    // Skill froze 15 updates before the save began blinking: when the skill
    // chevron has faded out its off half, the ring is still in its on half.
    const half = LAMP_BLINK_PERIOD_STEPS / 2;
    run(lamps, half);
    expect(lamps.level(LAMP_SKILL_402, 1)).toBe(0);
    expect(lamps.level(LAMP_SAVE, 1)).toBe(1);
    run(lamps, 1);
    expect(lamps.level(LAMP_SAVE, 1)).toBeLessThan(1);
  });

  it("attract: only the chase lamps light; chevrons and the ring stay unlit", () => {
    const { rules, lamps } = makeRig();
    rules.state = "game-over";
    rules.phase = "rotating";
    rules.litLane = 401;
    rules.saveLamp = "steady";
    for (let n = 0; n < 400; n++) {
      lamps.update();
      for (const c of CHEVRONS) expect(lamps.level(c, 1)).toBe(0);
      expect(lamps.level(LAMP_SAVE, 1)).toBe(0);
    }
  });
});
