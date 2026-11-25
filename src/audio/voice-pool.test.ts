import { describe, it, expect } from "vitest";

import { CUE_KINDS, CueQueue, type CueKind } from "../app/cue-queue";
import { mulberry32 } from "../harness/prng";
import { AudioEngine } from "./audio-engine";
import { applyEnvelope, envelopePoints, envelopeValueAt, type EnvelopeSpec } from "./envelope";
import { RECIPES } from "./recipes";
import {
  FakeAudioContext,
  FakeGain,
  FakeOscillator,
  FakeParam,
  type FakeNode,
} from "./test/fake-audio-context";
import { MAX_VOICES, STEAL_FADE_S, VoicePool, holdAt, type VoiceHandle } from "./voice-pool";

/** A pool-level handle: two envelope gains and two started sources. */
interface TestHandle extends VoiceHandle {
  readonly envs: readonly {
    readonly gain: FakeParam;
    readonly points: ReturnType<typeof envelopePoints>;
  }[];
  readonly sources: readonly FakeOscillator[];
  /** How many times the pool called `teardown`. */
  readonly torn: { count: number };
}

function handle(kind: CueKind, startedAt: number, endsAt: number = startedAt + 1): TestHandle {
  const sources = [new FakeOscillator(), new FakeOscillator()];
  for (const s of sources) {
    s.start(startedAt);
    s.stop(endsAt);
  }
  const torn = { count: 0 };
  return {
    kind,
    startedAt,
    endsAt,
    envs: [
      { gain: new FakeParam("gain", 1), points: [] },
      { gain: new FakeParam("gain", 1), points: [] },
    ],
    sources,
    teardown: () => {
      torn.count++;
    },
    torn,
  };
}

function wasStolen(h: TestHandle): boolean {
  return h.envs.some((e) => e.gain.events.some((x) => x.type === "cancelAndHold"));
}

describe("VoicePool caps (Pitfall 7, T-05-10)", () => {
  it("200 bumper admissions never hold more than 4 bumpers or MAX_VOICES in total", () => {
    const pool = new VoicePool();
    expect(MAX_VOICES).toBe(16);
    for (let i = 0; i < 200; i++) {
      const now = i * 0.001;
      pool.admit("bumper", RECIPES.bumper.cap, now, true);
      pool.add(handle("bumper", now), true);
      expect(pool.activeCount("bumper")).toBeLessThanOrEqual(4);
      expect(pool.activeCount()).toBeLessThanOrEqual(MAX_VOICES);
    }
    expect(pool.activeCount("bumper")).toBe(4);
  });

  it("200 admissions cycling all 13 kinds never exceed 16 total or any kind's cap", () => {
    const pool = new VoicePool();
    for (let i = 0; i < 200; i++) {
      const kind = CUE_KINDS[i % CUE_KINDS.length] as CueKind;
      const now = i * 0.001;
      pool.admit(kind, RECIPES[kind].cap, now, true);
      pool.add(handle(kind, now, now + 10), true);
      expect(pool.activeCount()).toBeLessThanOrEqual(MAX_VOICES);
      for (const k of CUE_KINDS) expect(pool.activeCount(k)).toBeLessThanOrEqual(RECIPES[k].cap);
    }
  });

  it("a stolen voice fades every envelope gain over STEAL_FADE_S and stops every source", () => {
    const pool = new VoicePool();
    const first = handle("bumper", 0.5);
    pool.add(first, true);
    const now = 0.7;
    pool.admit("bumper", 1, now, true);
    expect(pool.activeCount("bumper")).toBe(0);
    for (const e of first.envs) {
      const ev = e.gain.events;
      expect(ev[ev.length - 3]).toEqual({ type: "cancelAndHold", value: Number.NaN, time: now });
      expect(ev[ev.length - 2]?.type).toBe("set");
      expect(ev[ev.length - 2]?.time).toBe(now);
      expect(ev[ev.length - 1]).toEqual({ type: "linear", value: 0, time: now + STEAL_FADE_S });
    }
    for (const s of first.sources) {
      expect(s.stopTime ?? Infinity).toBeLessThanOrEqual(now + STEAL_FADE_S + 0.001);
      expect(s.stopTime ?? -Infinity).toBeGreaterThanOrEqual(now + STEAL_FADE_S);
    }
  });

  it("steals the earliest start, ties broken by admission order", () => {
    const pool = new VoicePool();
    const a = handle("bumper", 1, 10);
    const b = handle("bumper", 1, 10);
    const c = handle("bumper", 0.5, 10);
    pool.add(a, true);
    pool.add(b, true);
    pool.add(c, true);
    pool.admit("bumper", 3, 2, true);
    expect(wasStolen(c)).toBe(true);
    pool.admit("bumper", 2, 2, true);
    expect(wasStolen(a)).toBe(true);
    expect(wasStolen(b)).toBe(false);
  });

  it("prunes voices whose endsAt has passed at the next admission, without fading them", () => {
    const pool = new VoicePool();
    const done = handle("drain", 0, 1);
    pool.add(done, true);
    pool.admit("drain", 1, 1, true);
    expect(pool.activeCount()).toBe(0);
    expect(wasStolen(done)).toBe(false);
  });

  it("a steal on a rendering context leaves teardown to onended (the fade must play)", () => {
    const pool = new VoicePool();
    const first = handle("bumper", 0.5);
    pool.add(first, true);
    pool.admit("bumper", 1, 0.7, true);
    expect(wasStolen(first)).toBe(true);
    expect(first.torn.count).toBe(0);
  });

  it("a steal on a context that is not rendering tears the voice down at once (05-REVIEW WR-01)", () => {
    const pool = new VoicePool();
    const first = handle("bumper", 0.5);
    pool.add(first, false);
    pool.admit("bumper", 1, 0.5, false);
    expect(wasStolen(first)).toBe(true);
    expect(first.torn.count).toBe(1);
    // add() steals the oldest when full; a 1-voice pool exercises that path.
    const tiny = new VoicePool(1);
    const a = handle("lane", 0.5);
    const b = handle("lane", 0.5);
    tiny.add(a, false);
    tiny.add(b, false);
    expect(a.torn.count).toBe(1);
    expect(b.torn.count).toBe(0);
  });

  it("discardAll fades, stops, tears down and forgets every voice", () => {
    const pool = new VoicePool();
    const hs = [handle("bumper", 0.5), handle("lane", 0.6), handle("drain", 0.7)];
    for (const h of hs) pool.add(h, true);
    pool.discardAll(0.8);
    expect(pool.activeCount()).toBe(0);
    for (const h of hs) {
      expect(wasStolen(h)).toBe(true);
      expect(h.torn.count).toBe(1);
      for (const s of h.sources) {
        expect(s.stopTime ?? Infinity).toBeLessThan(0.8 + 2 * STEAL_FADE_S);
      }
    }
    pool.discardAll(0.9); // empty pool: a no-op
    for (const h of hs) expect(h.torn.count).toBe(1);
  });

  it("release removes a handle once; releasing again is a no-op", () => {
    const pool = new VoicePool();
    const h = handle("lane", 0);
    pool.add(h, true);
    pool.release(h);
    pool.release(h);
    expect(pool.activeCount()).toBe(0);
  });
});

/** A voice whose single envelope gain carries a scheduled envelope. */
function envelopedHandle(
  kind: CueKind,
  t0: number,
  env: EnvelopeSpec,
  peak: number,
  firefox: boolean,
): TestHandle {
  const gain = new FakeParam("gain", 1);
  if (firefox) Object.defineProperty(gain, "cancelAndHoldAtTime", { value: undefined });
  const end = applyEnvelope(gain, t0, env, peak);
  const src = new FakeOscillator();
  src.start(t0);
  src.stop(end);
  const torn = { count: 0 };
  return {
    kind,
    startedAt: t0,
    endsAt: end,
    envs: [{ gain, points: envelopePoints(t0, env, peak) }],
    sources: [src],
    teardown: () => {
      torn.count++;
    },
    torn,
  };
}

describe("steal fade starts at the live level (WR-01)", () => {
  const HOLD_ENV: EnvelopeSpec = { attack: 0.005, hold: 0.5, decay: 0.15 };
  const DECAY_ENV: EnvelopeSpec = { attack: 0.002, hold: 0, decay: 0.3 };

  it("a steal during a hold segment fades from the held peak, not from a stale event", () => {
    const pool = new VoicePool();
    const v = envelopedHandle("tilt", 0, HOLD_ENV, 0.8, false);
    pool.add(v, true);
    const now = 0.3;
    pool.admit("tilt", 1, now, true);
    const g = v.envs[0]?.gain;
    if (!g) throw new Error("no gain");
    expect(g.valueAt(now)).toBeCloseTo(0.8, 9);
    expect(g.valueAt(now + STEAL_FADE_S / 2)).toBeCloseTo(0.4, 9);
    expect(g.valueAt(now + STEAL_FADE_S)).toBe(0);
  });

  it("without cancelAndHoldAtTime (Firefox) a steal mid-decay keeps the decay curve up to now", () => {
    const pool = new VoicePool();
    const v = envelopedHandle("bumper", 0, DECAY_ENV, 0.8, true);
    const g = v.envs[0]?.gain;
    if (!g) throw new Error("no gain");
    const points = v.envs[0]?.points ?? [];
    const before = g.valueAt(0.05);
    pool.add(v, true);
    const now = 0.1;
    pool.admit("bumper", 1, now, true);
    expect(g.events.some((e) => e.type === "cancel")).toBe(true);
    // Between the render point and `now` the level still follows the decay.
    expect(g.valueAt(0.05)).toBeCloseTo(before, 9);
    expect(g.valueAt(now)).toBeCloseTo(envelopeValueAt(points, now), 9);
    expect(g.valueAt(now + STEAL_FADE_S / 2)).toBeCloseTo(envelopeValueAt(points, now) / 2, 9);
    expect(g.valueAt(now + STEAL_FADE_S)).toBe(0);
  });

  it("holdAt with a zero level anchors with a set (an exponential ramp to 0 is illegal)", () => {
    const g = new FakeParam("gain", 1);
    Object.defineProperty(g, "cancelAndHoldAtTime", { value: undefined });
    g.setValueAtTime(0, 0);
    holdAt(g, 1, 0);
    expect(g.events.slice(-2)).toEqual([
      { type: "cancel", value: Number.NaN, time: 1 },
      { type: "set", value: 0, time: 1 },
    ]);
  });
});

/** An unlocked engine over a fresh fake context. */
function rig(rng: () => number = () => 0.5): { fake: FakeAudioContext; engine: AudioEngine } {
  const fake = new FakeAudioContext();
  const engine = new AudioEngine(() => fake, rng);
  engine.unlock();
  return { fake, engine };
}

/** Voices as groups of their envelope gains, in creation order (one group per flushed cue). */
function voiceGains(fake: FakeAudioContext, chain: number, perVoice: number): FakeGain[][] {
  const gains = fake.nodes.slice(chain).filter((n): n is FakeGain => n instanceof FakeGain);
  const out: FakeGain[][] = [];
  for (let i = 0; i < gains.length; i += perVoice) out.push(gains.slice(i, i + perVoice));
  return out;
}

function faded(gains: readonly FakeGain[]): boolean {
  return gains.some((g) => g.gain.events.some((e) => e.type === "cancelAndHold"));
}

describe("engine voice pool (AUD-01 edges)", () => {
  it("200 bumper cues in one flush leave at most 4 sounding bumper voices", () => {
    const { fake, engine } = rig();
    const chain = fake.nodes.length;
    const q = new CueQueue(200);
    for (let i = 0; i < 200; i++) q.push("bumper", 200 + (i % 3), 0.8);
    expect(engine.flush(q)).toBe(200);
    expect(engine.activeVoices("bumper")).toBe(4);
    const voices = voiceGains(fake, chain, RECIPES.bumper.layers.length);
    expect(voices.length).toBe(200);
    expect(voices.filter((v) => !faded(v)).length).toBe(4);
  });

  it("two bumper cues for element 200 both start; the fifth steals the first admitted", () => {
    const two = rig();
    const c2 = two.fake.nodes.length;
    const q2 = new CueQueue();
    q2.push("bumper", 200, 0.5);
    q2.push("bumper", 200, 0.5);
    expect(two.engine.flush(q2)).toBe(2);
    const v2 = voiceGains(two.fake, c2, 2);
    expect(v2.map(faded)).toEqual([false, false]);

    const five = rig();
    const c5 = five.fake.nodes.length;
    const q5 = new CueQueue();
    for (let i = 0; i < 5; i++) q5.push("bumper", 200, 0.5);
    expect(five.engine.flush(q5)).toBe(5);
    expect(voiceGains(five.fake, c5, 2).map(faded)).toEqual([true, false, false, false, false]);
  });

  it("voices are built in push order and the same cues and seed give identical logs", () => {
    const run = (): { fake: FakeAudioContext; chain: number } => {
      const r = rig(mulberry32(0x0503));
      const chain = r.fake.nodes.length;
      const q = new CueQueue();
      q.push("slingshot", 300, 0.6);
      q.push("bumper", 201, 0.9);
      q.push("rollover", 400, 1);
      for (let i = 0; i < 6; i++) q.push("bumper", 200, 0.4);
      r.fake.currentTime = 0.5;
      r.engine.flush(q);
      return { fake: r.fake, chain };
    };
    const a = run();
    const waves = a.fake.nodes
      .slice(a.chain)
      .filter((n: FakeNode): n is FakeOscillator => n instanceof FakeOscillator)
      .map((o) => o.type);
    expect(waves.slice(0, 3)).toEqual(["square", "triangle", "sine"]);
    expect(a.fake.log()).toEqual(run().fake.log());
  });

  it("after every voice ends the pool is empty", () => {
    const { fake, engine } = rig();
    const q = new CueQueue();
    for (const k of CUE_KINDS) q.push(k, 0, 0.5);
    engine.flush(q);
    expect(engine.activeVoices()).toBeGreaterThan(0);
    fake.fireAllEnded();
    expect(engine.activeVoices()).toBe(0);
  });
});
