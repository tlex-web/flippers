import { describe, it, expect } from "vitest";

import { CollisionRouter } from "./collision-router";
import { FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import type { CollisionEvent, PhysicsWorld } from "../physics/types";
import { FixedStepLoop } from "../sim/loop";
import { PROOF_BOX_SPEC } from "../table/spec";

/**
 * CollisionRouter contract (plan 03-06 Task 2, D-11): fixed registration order,
 * zero-copy pass-through of the pooled records, one drain per dispatch, and a
 * strictly one-way relationship with its source.
 */

function record(i: number): CollisionEvent {
  return {
    type: "ball-wall",
    ballId: 0,
    elementKind: "bumper",
    elementId: 200 + i,
    point: { x: i, y: i },
    normalImpulse: i,
  };
}

/**
 * A spy source that hands back the SAME array instance on every drain and logs
 * every property read on it, so the test can prove the router only ever drains.
 */
function spySource(batch: CollisionEvent[]): {
  source: Pick<PhysicsWorld, "drainEvents">;
  accessed: (string | symbol)[];
  drains(): number;
} {
  const accessed: (string | symbol)[] = [];
  let drains = 0;
  const target = {
    drainEvents(): CollisionEvent[] {
      drains++;
      return batch;
    },
  };
  const source = new Proxy(target, {
    get(t, prop, receiver) {
      accessed.push(prop);
      return Reflect.get(t, prop, receiver) as unknown;
    },
  });
  return { source, accessed, drains: () => drains };
}

describe("CollisionRouter (D-11)", () => {
  it("N listeners x M records = N*M calls, listeners in registration order, same record (no copy)", () => {
    const M = 4;
    const N = 3;
    const batch = Array.from({ length: M }, (_, i) => record(i));
    const spy = spySource(batch);
    const router = new CollisionRouter(spy.source);
    const calls: { listener: number; event: CollisionEvent }[] = [];
    for (let j = 0; j < N; j++) router.register((e) => calls.push({ listener: j, event: e }));

    const size = router.dispatch();

    expect(size).toBe(M);
    expect(calls).toHaveLength(N * M);
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < N; j++) {
        const call = calls[i * N + j];
        expect(call?.listener).toBe(j);
        expect(call?.event).toBe(batch[i]);
      }
    }
  });

  it("a listener registered after earlier dispatches is appended at the tail", () => {
    const batch = [record(0), record(1)];
    const router = new CollisionRouter(spySource(batch).source);
    const order: string[] = [];
    router.register(() => order.push("a"));
    router.dispatch();
    expect(order).toEqual(["a", "a"]);

    order.length = 0;
    router.register(() => order.push("b"));
    router.dispatch();
    expect(order).toEqual(["a", "b", "a", "b"]);
  });

  it("an empty batch makes zero listener calls", () => {
    const router = new CollisionRouter(spySource([]).source);
    let calls = 0;
    router.register(() => calls++);
    router.register(() => calls++);
    expect(router.dispatch()).toBe(0);
    expect(calls).toBe(0);
  });

  it("is one-way: the source sees only drainEvents, exactly once per dispatch", () => {
    const spy = spySource([record(0), record(1), record(2)]);
    const router = new CollisionRouter(spy.source);
    router.register(() => {});
    router.dispatch();
    router.dispatch();
    router.dispatch();
    expect(spy.drains()).toBe(3);
    expect(spy.accessed).toEqual(["drainEvents", "drainEvents", "drainEvents"]);
  });

  it("driven by a real FixedStepLoop: 5 fixed steps = 5 dispatches over one reused drained view", () => {
    const world = new PlanckWorld({ table: PROOF_BOX_SPEC });
    world.addBall({ x: 0.5, y: 1.79 }); // resting on the thin wall: contacts every step
    const views: CollisionEvent[][] = [];
    const source: Pick<PhysicsWorld, "drainEvents"> = {
      drainEvents: () => {
        const view = world.drainEvents();
        views.push(view);
        return view;
      },
    };
    const router = new CollisionRouter(source);
    let delivered = 0;
    router.register(() => delivered++);
    const loop = new FixedStepLoop(world);
    let dispatches = 0;
    const onPostStep = (): void => {
      dispatches++;
      router.dispatch();
    };

    let steps = 0;
    for (let i = 0; i < 5; i++) steps += loop.advance(FIXED_DT * 1000, undefined, onPostStep);

    expect(steps).toBe(5);
    expect(dispatches).toBe(5);
    expect(views).toHaveLength(5);
    const first = views[0];
    for (const v of views) expect(v).toBe(first);
    expect(delivered).toBeGreaterThan(0);
  });
});

describe("CollisionRouter fault isolation (03-REVIEW WR-04)", () => {
  it("a throwing listener is reported, and every other listener still gets the whole batch", () => {
    const batch = [record(0), record(1), record(2)];
    const errors: { error: unknown; event: CollisionEvent }[] = [];
    const router = new CollisionRouter(spySource(batch).source, (error, event) => {
      errors.push({ error, event });
    });
    const before: number[] = [];
    const after: number[] = [];
    const boom = new Error("consumer failed");
    router.register((e) => before.push(e.elementId));
    router.register((e) => {
      if (e.elementId === 201) throw boom;
    });
    router.register((e) => after.push(e.elementId));

    expect(() => router.dispatch()).not.toThrow();
    expect(before).toEqual([200, 201, 202]);
    expect(after).toEqual([200, 201, 202]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).toBe(boom);
    expect(errors[0]?.event).toBe(batch[1]);
  });
});
