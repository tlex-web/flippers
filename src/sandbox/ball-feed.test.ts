import { describe, it, expect } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import { FlipperController } from "../control/flipper-controller";
import { PlungerController } from "../control/plunger-controller";
import type { KeyEventLike } from "../input/flipper-input";
import { PlungerInput } from "../input/plunger-input";
import { FIXED_DT, PLUNGER_CHARGE_RATE, PLUNGER_MAX_CHARGE } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { BallId, BallSpec, BallState } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PLUNGER_REST, PLUNGER_ZONE } from "../table/spec";
import { BallFeed } from "./ball-feed";

/**
 * Regression for 03-REVIEW CR-01: the sandbox ball feed, driven exactly as
 * `main.ts` drives it (controllers before the first ball, plunger edges at the
 * top of each fixed step, `router.dispatch()` then `feed.service()` at the
 * post-step seam), at real render rates. The old positional feed treated the
 * ball parked on the plunger (y ≈ 6.2) as past the drain line (DRAIN_Y = 6.05)
 * and respawned it every frame, so at one fixed step per frame no launch ever
 * left the chute.
 */

const STEPS_TO_CAP = Math.ceil(PLUNGER_MAX_CHARGE / (PLUNGER_CHARGE_RATE * FIXED_DT));
const SPACE: KeyEventLike = { code: "Space", repeat: false, preventDefault: () => {} };

interface Sandbox {
  readonly world: PlanckWorld;
  readonly feed: BallFeed;
  readonly input: PlungerInput;
  readonly chuteTopY: number;
  /** One render frame of `deltaMs`; returns the fixed steps it ran. */
  frame(deltaMs: number): number;
  ball(): BallState;
  readonly drainedIds: BallId[];
}

function makeSandbox(spawn: BallSpec): Sandbox {
  const world = new PlanckWorld();
  new FlipperController(world);
  const input = new PlungerInput();
  const plunger = new PlungerController(world);
  const router = new CollisionRouter(world);
  const feed = new BallFeed(world, router, spawn);
  const loop = new FixedStepLoop(world);

  const drainedIds: BallId[] = [];
  router.register((e) => {
    if (e.elementKind === "drain") drainedIds.push(e.ballId);
  });

  function onFixedStep(): void {
    const edges = input.drainEdges();
    if (edges.press) plunger.onPressEdge();
    if (edges.release) plunger.onReleaseEdge(feed.activeBallId);
    if (edges.cancel) plunger.onCancelEdge();
    plunger.update();
  }
  function onPostStep(): void {
    router.dispatch();
    feed.service();
  }

  const chute = world.getElements().find((el) => el.kind === "chute");
  if (!chute) throw new Error("table has no chute");
  const chuteTopY = Math.min(...chute.vertices.map((v) => v.y));

  return {
    world,
    feed,
    input,
    chuteTopY,
    drainedIds,
    frame: (deltaMs) => loop.advance(deltaMs, onFixedStep, onPostStep),
    ball: () => {
      const b = world.getBalls().find((x) => x.id === feed.activeBallId);
      if (!b) throw new Error(`active ball ${feed.activeBallId} missing`);
      return b;
    },
  };
}

/** Run render frames of `deltaMs` until `steps` fixed steps have elapsed. */
function runSteps(s: Sandbox, deltaMs: number, steps: number): void {
  let done = 0;
  while (done < steps) done += s.frame(deltaMs);
}

function inZone(b: { x: number; y: number }): boolean {
  const z = PLUNGER_ZONE;
  return b.x >= z.minX && b.x <= z.maxX && b.y >= z.minY && b.y <= z.maxY;
}

const PARKED = { x: PLUNGER_REST.x, y: PLUNGER_REST.y } as const;
const RATES_HZ = [60, 120, 144] as const;

describe("sandbox ball feed (CR-01): only a real drain respawns the ball", () => {
  it("a ball parked on the plunger is never respawned while idle (120 Hz, 1 step/frame)", () => {
    const s = makeSandbox(PARKED);
    const id = s.feed.activeBallId;
    for (let i = 0; i < 600; i++) {
      s.frame(1000 / 120);
      expect(s.feed.activeBallId).toBe(id);
      expect(s.world.getBalls()).toHaveLength(1);
    }
    expect(inZone(s.ball())).toBe(true);
  });

  for (const hz of RATES_HZ) {
    it(`a full-charge Space launch clears the chute top at ${hz} Hz`, () => {
      const s = makeSandbox(PARKED);
      const dt = 1000 / hz;
      runSteps(s, dt, 60); // settle
      const id = s.feed.activeBallId;

      s.input.handleKeyDown(SPACE);
      runSteps(s, dt, STEPS_TO_CAP + 10);
      s.input.handleKeyUp(SPACE);

      let cleared = false;
      let steps = 0;
      while (!cleared && steps < Math.round(3 / FIXED_DT)) {
        steps += s.frame(dt);
        expect(s.feed.activeBallId).toBe(id);
        if (s.ball().y < s.chuteTopY) cleared = true;
      }
      expect(cleared).toBe(true);
    });
  }

  it("a minimum-impulse tap at 60 Hz keeps the same ball: it climbs and falls back onto the plunger", () => {
    const s = makeSandbox(PARKED);
    runSteps(s, 1000 / 60, 60);
    const id = s.feed.activeBallId;
    const restY = s.ball().y;

    s.input.handleKeyDown(SPACE);
    s.frame(1000 / 60);
    s.input.handleKeyUp(SPACE);

    let minY = restY;
    for (let i = 0; i < 180; i++) {
      s.frame(1000 / 60);
      expect(s.feed.activeBallId).toBe(id);
      minY = Math.min(minY, s.ball().y);
    }
    expect(restY - minY).toBeGreaterThan(0.3);
    expect(inZone(s.ball())).toBe(true);
  });

  it("a ball that enters the drain is removed and exactly one fresh ball is fed at the spawn", () => {
    const spawn = { x: 1.45, y: 5.3 } as const;
    const s = makeSandbox(spawn);
    const first = s.feed.activeBallId;
    let steps = 0;
    while (s.feed.activeBallId === first) {
      steps += s.frame(1000 / 120);
      if (steps > Math.round(2 / FIXED_DT)) throw new Error("ball never drained");
    }
    expect(s.drainedIds).toContain(first);
    expect(s.world.getBalls()).toHaveLength(1);
    const fresh = s.ball();
    expect(fresh.x).toBe(spawn.x);
    expect(fresh.y).toBe(spawn.y);
  });
});
