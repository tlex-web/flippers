import { describe, it, expect } from "vitest";

import type { GameState } from "../game/game-session";
import type { SkillPhase } from "../game/skill-shot";
import { PlanckWorld } from "../physics/planck-world";
import { TABLE_SPEC } from "../table/spec";
import {
  buildLampShapes,
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
  type LampLights,
  type LampRules,
} from "./lamps";
import {
  INLANE_LIT,
  INLANE_UNLIT,
  ROLLOVER_LIT,
  ROLLOVER_UNLIT,
  RUBBER_LINE_M,
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

  it("returns no shape for a missing rollover element", () => {
    const only = buildLampShapes(elements.filter((e) => e.id !== 401));
    expect(only.find((s) => s.lamp === LAMP_ROLLOVER_401)).toBeUndefined();
    expect(only.find((s) => s.lamp === LAMP_ROLLOVER_400)).toBeDefined();
  });
});
