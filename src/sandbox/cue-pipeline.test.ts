import { describe, it, expect, vi } from "vitest";

import { CollisionRouter } from "../app/collision-router";
import {
  CueFeedback,
  CueQueue,
  KICK_FLASH_FLOOR,
  type CueKind,
  type FlashSink,
} from "../app/cue-queue";
import { AudioEngine, ENV_FLOOR } from "../audio/audio-engine";
import { AudioUnlock } from "../audio/audio-unlock";
import {
  FakeAudioContext,
  FakeGain,
  reaches,
  type FakeNode,
} from "../audio/test/fake-audio-context";
import { FlipperController } from "../control/flipper-controller";
import {
  ReactiveElements,
  type ReactiveFeedback,
  type RulesGate,
} from "../game/reactive-elements";
import { mulberry32 } from "../harness/prng";
import { FIXED_DT } from "../physics/constants";
import { PlanckWorld } from "../physics/planck-world";
import { FixedStepLoop } from "../sim/loop";

// Heavy simulation suite: the 5 s default timeout is too tight under load, so
// this file alone gets 30 s (05-REVIEW IN-07; the fast suites keep the default).
vi.setConfig({ testTimeout: 30_000 });

/**
 * Phase-5 tracer (plan 05-01, AUD-01) on the REAL table: a registered bumper
 * kick travels solver -> CollisionRouter -> ReactiveElements (gates) ->
 * ReactiveFeedback -> CueFeedback -> CueQueue, and the render-frame
 * AudioEngine.flush() turns the cue into a started, enveloped voice routed
 * through the master gain and compressor to the destination.
 *
 * Composition mirrors main.ts: FlipperController before the first ball, the
 * rules listener on the router, service() right after dispatch() in onPostStep.
 * The world is PlanckWorld with no options (TABLE_SPEC); no engine import here.
 */

/** Always-live (or never-live) test gate that sums its awards. */
class TestGate implements RulesGate {
  score = 0;
  constructor(private readonly live: boolean) {}
  isLive(): boolean {
    return this.live;
  }
  award(points: number): void {
    this.score += points;
  }
}

/** Copies every flash record out. */
class SpyFlash implements FlashSink {
  readonly records: { elementId: number; strength: number }[] = [];
  record(elementId: number, strength: number): void {
    this.records.push({ elementId, strength });
  }
}

interface Rig {
  readonly world: PlanckWorld;
  readonly gate: TestGate;
  readonly cues: CueQueue;
  readonly flash: SpyFlash;
  run(n: number): void;
}

/**
 * The main.ts composition. `feedback` replaces the CueFeedback sink when given
 * (case j); `cues` and `flash` then stay empty because nothing writes to them.
 */
function makeRig(live: boolean, feedbackOverride?: ReactiveFeedback): Rig {
  const world = new PlanckWorld();
  new FlipperController(world);
  const router = new CollisionRouter(world);
  const gate = new TestGate(live);
  const cues = new CueQueue();
  const flash = new SpyFlash();
  const feedback = feedbackOverride ?? new CueFeedback(cues, flash);
  const reactive = new ReactiveElements(world, router, gate, feedback);
  const loop = new FixedStepLoop(world);
  const onPostStep = (): void => {
    router.dispatch();
    reactive.service();
  };
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) loop.advance(FIXED_DT * 1000, undefined, onPostStep);
  };
  return { world, gate, cues, flash, run };
}

const TWO_SECONDS = Math.round(2 / FIXED_DT);

/** Drop a ball onto bumper 202 from 1 m above, slightly right of center. */
function dropOnBumper202(rig: Rig): void {
  const c = rig.world.getElements().find((el) => el.id === 202)?.circle;
  if (!c) throw new Error("bumper 202 missing");
  rig.world.addBall({ x: c.center.x + 0.05, y: c.center.y - 1.0 });
}

function hasCue(cues: CueQueue, kind: CueKind, elementId: number): boolean {
  for (let i = 0; i < cues.size; i++) {
    const c = cues.at(i);
    if (c && c.kind === kind && c.elementId === elementId) return true;
  }
  return false;
}

/** Step (without flushing) until a bumper-202 cue is queued; false on timeout. */
function runToBumperCue(rig: Rig): boolean {
  for (let i = 0; i < TWO_SECONDS; i++) {
    rig.run(1);
    if (hasCue(rig.cues, "bumper", 202)) return true;
  }
  return false;
}

/** A rig with a queued bumper-202 cue and an unlocked engine over a fake context. */
function rigWithCue(): { rig: Rig; fake: FakeAudioContext; engine: AudioEngine } {
  const rig = makeRig(true);
  dropOnBumper202(rig);
  if (!runToBumperCue(rig)) throw new Error("no bumper-202 cue within 2 s");
  const fake = new FakeAudioContext();
  const engine = new AudioEngine(() => fake, mulberry32(0x0501));
  engine.unlock();
  return { rig, fake, engine };
}

describe("cue pipeline on the real table (AUD-01 tracer)", () => {
  it("(a) a registered kick on bumper 202 queues a bumper cue and a floored flash", () => {
    const rig = makeRig(true);
    dropOnBumper202(rig);
    expect(runToBumperCue(rig)).toBe(true);
    let strength = -1;
    for (let i = 0; i < rig.cues.size; i++) {
      const c = rig.cues.at(i);
      if (c && c.kind === "bumper" && c.elementId === 202) strength = c.strength;
    }
    expect(strength).toBeGreaterThan(0);
    expect(strength).toBeLessThanOrEqual(1);
    const flash202 = rig.flash.records.filter((r) => r.elementId === 202);
    expect(flash202.length).toBeGreaterThan(0);
    for (const r of flash202) expect(r.strength).toBeGreaterThanOrEqual(KICK_FLASH_FLOOR);
  });

  it("(b) flush starts an enveloped voice that reaches the destination through master and compressor", () => {
    const { rig, fake, engine } = rigWithCue();
    const before = fake.nodes.length;
    const chain = fake.nodes.slice(0, before);
    const master = chain.find((n) => n.kind === "gain");
    const comp = chain.find((n) => n.kind === "compressor");
    if (!master || !comp) throw new Error("master chain missing");
    expect(master.connections).toContain(comp);
    expect(comp.connections).toContain(fake.destination);

    fake.currentTime = 1.25;
    const started = engine.flush(rig.cues);
    expect(started).toBeGreaterThanOrEqual(1);
    expect(rig.cues.size).toBe(0);

    const voice = fake.nodes.slice(before);
    const sources = fake.sources();
    expect(sources.length).toBeGreaterThanOrEqual(2);
    for (const s of sources) {
      expect(s.startTime).not.toBeNull();
      expect(s.startTime ?? -1).toBeGreaterThanOrEqual(fake.currentTime);
      expect(s.stopTime ?? -1).toBeGreaterThan(s.startTime ?? Infinity);
      expect(reaches(s, master)).toBe(true);
      expect(fake.reachesDestination(s)).toBe(true);
    }
    const gains = voice.filter((n): n is FakeGain => n instanceof FakeGain);
    expect(gains.length).toBeGreaterThan(0);
    for (const g of gains) {
      // applyEnvelope clears pending automation first (05-03); the first
      // scheduled value is still the ENV_FLOOR anchor.
      const first = g.gain.events.find((e) => e.type !== "cancel");
      expect(first?.type).toBe("set");
      expect(first?.value).toBe(ENV_FLOOR);
    }
    for (const n of voice) {
      for (const p of Object.values(n)) {
        if (p && typeof p === "object" && "events" in p) {
          for (const e of (p as { events: { type: string; value: number }[] }).events) {
            if (e.type === "exp") expect(e.value).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("(c) onended disconnects every voice node; the master chain stays connected", () => {
    const { rig, fake, engine } = rigWithCue();
    const before = fake.nodes.length;
    const chain = fake.nodes.slice(0, before);
    engine.flush(rig.cues);
    const voice: FakeNode[] = fake.nodes.slice(before);
    expect(voice.length).toBeGreaterThan(0);
    fake.fireAllEnded();
    for (const n of voice) expect(n.disconnected).toBe(true);
    for (const n of chain) {
      expect(n.disconnected).toBe(false);
      expect(n.connections.length).toBeGreaterThan(0);
    }
    expect(fake.reachesDestination(chain[0] as FakeNode)).toBe(true);
  });

  it("(d) the same drop under a not-live gate yields zero cues and zero flashes", () => {
    const rig = makeRig(false);
    dropOnBumper202(rig);
    rig.run(TWO_SECONDS);
    expect(rig.cues.size).toBe(0);
    expect(rig.flash.records.length).toBe(0);
  });

  it("(e) empty edge: empty and pre-unlock flushes create nothing; strengths are clamped", () => {
    const fake = new FakeAudioContext();
    const engine = new AudioEngine(() => fake, mulberry32(1));
    engine.unlock();
    const before = fake.nodes.length;
    const empty = new CueQueue();
    expect(engine.flush(empty)).toBe(0);
    expect(fake.nodes.length).toBe(before);

    let calls = 0;
    const lockedFake = new FakeAudioContext();
    const locked = new AudioEngine(() => {
      calls++;
      return lockedFake;
    });
    const q = new CueQueue();
    q.push("bumper", 202, 0.7);
    expect(locked.flush(q)).toBe(0);
    expect(calls).toBe(0);
    expect(locked.context).toBeNull();
    expect(lockedFake.nodes.length).toBe(0);
    expect(q.size).toBe(0);

    const c = new CueQueue();
    c.push("bumper", 1, Number.NaN);
    c.push("bumper", 2, -1);
    c.push("bumper", 3, 2);
    expect(c.at(0)?.strength).toBe(0);
    expect(c.at(1)?.strength).toBe(0);
    expect(c.at(2)?.strength).toBe(1);
  });

  it("(f) concurrency edge: a suspended flush drops the cues, unlock resumes, nothing replays", () => {
    const { rig, fake, engine } = rigWithCue();
    const before = fake.nodes.length;
    expect(rig.cues.size).toBeGreaterThan(0);
    fake.state = "suspended";
    expect(engine.flush(rig.cues)).toBe(0);
    expect(rig.cues.size).toBe(0);
    expect(fake.nodes.length).toBe(before);

    engine.unlock();
    expect(fake.resumeCalls).toBe(1);
    fake.state = "running";
    expect(engine.flush(rig.cues)).toBe(0);
    expect(fake.nodes.length).toBe(before);
  });
});

/** A real engine behind AudioUnlock, over a fake context factory that counts calls. */
function gestureRig(): {
  fake: FakeAudioContext;
  engine: AudioEngine;
  unlock: AudioUnlock;
  factoryCalls: () => number;
} {
  const fake = new FakeAudioContext();
  let calls = 0;
  const engine = new AudioEngine(() => {
    calls++;
    return fake;
  }, mulberry32(0x0502));
  return { fake, engine, unlock: new AudioUnlock(engine), factoryCalls: () => calls };
}

/** Drop on bumper 202 and step until its cue is queued. */
function bumperCues(): CueQueue {
  const rig = makeRig(true);
  dropOnBumper202(rig);
  if (!runToBumperCue(rig)) throw new Error("no bumper-202 cue within 2 s");
  return rig.cues;
}

describe("gesture gate on the real table (AUD-01, Pattern 5)", () => {
  it("(g) no context before a gesture; a trusted Enter creates exactly one and the drop is voiced", () => {
    const g = gestureRig();
    expect(g.engine.context).toBeNull();
    expect(g.factoryCalls()).toBe(0);
    g.unlock.handleGesture({ isTrusted: true, type: "keydown", key: "Enter" });
    expect(g.factoryCalls()).toBe(1);
    expect(g.engine.context).toBe(g.fake);
    const before = g.fake.nodes.length;
    expect(g.engine.flush(bumperCues())).toBeGreaterThanOrEqual(1);
    const started = g.fake.sources().filter((s) => s.startTime !== null);
    expect(started.length).toBeGreaterThan(0);
    expect(g.fake.nodes.length).toBeGreaterThan(before);
  });

  it("(h) an untrusted keydown and a trusted Escape never create a context; cues are dropped", () => {
    const g = gestureRig();
    g.unlock.handleGesture({ isTrusted: false, type: "keydown", key: "Enter" });
    g.unlock.handleGesture({ isTrusted: true, type: "keydown", key: "Escape" });
    expect(g.factoryCalls()).toBe(0);
    expect(g.engine.context).toBeNull();
    const cues = bumperCues();
    expect(cues.size).toBeGreaterThan(0);
    expect(g.engine.flush(cues)).toBe(0);
    expect(cues.size).toBe(0);
    expect(g.fake.nodes.length).toBe(0);
  });

  it("(i) after unlock, a trusted pointerdown on a suspended context resumes it once", () => {
    const g = gestureRig();
    g.unlock.handleGesture({ isTrusted: true, type: "keydown", key: "Enter" });
    expect(g.factoryCalls()).toBe(1);
    g.fake.state = "suspended";
    g.unlock.handleGesture({ isTrusted: true, type: "pointerdown" });
    expect(g.fake.resumeCalls).toBe(1);
    expect(g.factoryCalls()).toBe(1);
  });
});

/** A presentation sink that throws on every call. */
const THROWING_FEEDBACK: ReactiveFeedback = {
  onKick(): void {
    throw new Error("presentation sink failed (onKick)");
  },
  onSensor(): void {
    throw new Error("presentation sink failed (onSensor)");
  },
};

/** Every fixed step: each ball's (x, y, vx, vy), then the gate's running total. */
function traceBumperDrop(rig: Rig): number[][] {
  dropOnBumper202(rig);
  const trace: number[][] = [];
  for (let i = 0; i < TWO_SECONDS; i++) {
    rig.run(1);
    const row: number[] = [];
    for (const b of rig.world.getBalls()) row.push(b.x, b.y, b.vx, b.vy);
    row.push(rig.gate.score);
    trace.push(row);
  }
  return trace;
}

describe("presentation sink fault isolation on the real table (T-05-21, Pitfall 8)", () => {
  it("(j) a throwing feedback sink leaves the simulation bit-identical and is reported by the router", () => {
    const cueRig = makeRig(true);
    const cueTrace = traceBumperDrop(cueRig);

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let throwTrace: number[][];
    let throwRig: Rig;
    let reports: unknown[][];
    try {
      throwRig = makeRig(true, THROWING_FEEDBACK);
      throwTrace = traceBumperDrop(throwRig);
      reports = errors.mock.calls.slice();
    } finally {
      errors.mockRestore();
    }

    // Not vacuous: the drop registered at least one scored hit in both runs.
    expect(cueRig.gate.score).toBeGreaterThan(0);
    expect(throwTrace).toHaveLength(TWO_SECONDS);
    // Bit-identical: fixed step, no wall clock, no PRNG draw from presentation.
    expect(throwTrace).toEqual(cueTrace);

    // The router caught and reported each throw instead of breaking the step.
    const busReports = reports.filter((c) => c[0] === "[bus] collision listener threw");
    expect(busReports.length).toBeGreaterThanOrEqual(1);
    for (const c of busReports) expect(c[1]).toBeInstanceOf(Error);

    // Only the CueFeedback run queued a bumper cue for 202.
    expect(hasCue(cueRig.cues, "bumper", 202)).toBe(true);
    expect(throwRig.cues.size).toBe(0);
    expect(throwRig.flash.records.length).toBe(0);
  });
});
