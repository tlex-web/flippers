import { describe, it, expect, vi } from "vitest";

import { CueQueue, type CueKind } from "../app/cue-queue";
import { mulberry32 } from "../harness/prng";
import { AudioEngine, MASTER_GAIN, MUTE_RAMP_S, SCHEDULE_AHEAD_S } from "./audio-engine";
import { semitoneRatio } from "./mapping";
import { FakeAudioContext, FakeGain, FakeOscillator } from "./test/fake-audio-context";

/** An unlocked engine over a fresh fake context. */
function rig(rng: () => number): { fake: FakeAudioContext; engine: AudioEngine; chain: number } {
  const fake = new FakeAudioContext();
  const engine = new AudioEngine(() => fake, rng);
  engine.unlock();
  return { fake, engine, chain: fake.nodes.length };
}

/** Flush one cue and return the nodes its voice created. */
function voiceFor(
  rng: () => number,
  kind: CueKind,
  elementId: number,
  strength: number,
): { fake: FakeAudioContext; nodes: FakeAudioContext["nodes"] } {
  const r = rig(rng);
  const q = new CueQueue();
  q.push(kind, elementId, strength);
  r.engine.flush(q);
  return { fake: r.fake, nodes: r.fake.nodes.slice(r.chain) };
}

/** Largest exponential target on any voice gain (the envelope peak). */
function peakOf(nodes: FakeAudioContext["nodes"]): number {
  let peak = 0;
  for (const n of nodes) {
    if (!(n instanceof FakeGain)) continue;
    for (const e of n.gain.events) if (e.type === "exp") peak = Math.max(peak, e.value);
  }
  return peak;
}

/** The first oscillator's start frequency. */
function startFreq(nodes: FakeAudioContext["nodes"]): number {
  const osc = nodes.find((n): n is FakeOscillator => n instanceof FakeOscillator);
  const first = osc?.frequency.events.find((e) => e.type === "set");
  if (!first) throw new Error("no oscillator start frequency");
  return first.value;
}

describe("bumper velocity and pitch (AUD-01 tracer, plan 05-03)", () => {
  it("a harder hit is louder and higher by exactly the strength semitones", () => {
    const hard = voiceFor(() => 0.5, "bumper", 202, 1);
    const soft = voiceFor(() => 0.5, "bumper", 202, 0.1);
    expect(peakOf(hard.nodes)).toBeGreaterThan(peakOf(soft.nodes));
    expect(startFreq(hard.nodes) / startFreq(soft.nodes)).toBeCloseTo(semitoneRatio(3 * 0.9), 9);
  });

  it("the same cues and rng seed produce identical node and automation logs", () => {
    const run = (): unknown[] => {
      const r = rig(mulberry32(7));
      const q = new CueQueue();
      q.push("bumper", 200, 0.3);
      q.push("bumper", 201, 0.8);
      q.push("bumper", 202, 1);
      r.fake.currentTime = 0.75;
      r.engine.flush(q);
      return r.fake.log();
    };
    expect(run()).toEqual(run());
  });

  it("the jitter moves the start frequency by at most a quarter semitone either way", () => {
    const center = startFreq(voiceFor(() => 0.5, "bumper", 202, 0.6).nodes);
    const low = startFreq(voiceFor(() => 0, "bumper", 202, 0.6).nodes);
    const high = startFreq(voiceFor(() => 0.999999, "bumper", 202, 0.6).nodes);
    const bound = semitoneRatio(0.25) + 1e-12;
    expect(center / low).toBeLessThanOrEqual(bound);
    expect(high / center).toBeLessThanOrEqual(bound);
    expect(low).toBeLessThan(center);
    expect(high).toBeGreaterThan(center);
  });
});

describe("master mute (D-02 engine side)", () => {
  /** The master gain is the first gain the engine creates. */
  function masterOf(fake: FakeAudioContext): FakeGain {
    const m = fake.nodes.find((n): n is FakeGain => n instanceof FakeGain);
    if (!m) throw new Error("no master gain");
    return m;
  }

  it("toggleMute returns true then false and isMuted reports the flag", () => {
    const { engine } = rig(() => 0.5);
    expect(engine.isMuted()).toBe(false);
    expect(engine.toggleMute()).toBe(true);
    expect(engine.isMuted()).toBe(true);
    expect(engine.toggleMute()).toBe(false);
    expect(engine.isMuted()).toBe(false);
  });

  it("muting ramps the master linearly to 0 over MUTE_RAMP_S; unmuting ramps back", () => {
    const { fake, engine } = rig(() => 0.5);
    const master = masterOf(fake);
    expect(MUTE_RAMP_S).toBe(0.05);
    fake.currentTime = 2;
    engine.setMuted(true);
    let ev = master.gain.events;
    expect(ev.slice(-3)).toEqual([
      { type: "cancel", value: Number.NaN, time: 2 },
      { type: "set", value: MASTER_GAIN, time: 2 },
      { type: "linear", value: 0, time: 2 + MUTE_RAMP_S },
    ]);
    fake.currentTime = 3;
    engine.setMuted(false);
    ev = master.gain.events;
    expect(ev.slice(-3)).toEqual([
      { type: "cancel", value: Number.NaN, time: 3 },
      { type: "set", value: 0, time: 3 },
      { type: "linear", value: MASTER_GAIN, time: 3 + MUTE_RAMP_S },
    ]);
  });

  it("the mute fade starts at the live level after a minute of play (WR-01)", () => {
    const { fake, engine } = rig(() => 0.5);
    const g = masterOf(fake).gain;
    fake.currentTime = 60;
    engine.setMuted(true);
    expect(g.valueAt(60)).toBeCloseTo(MASTER_GAIN, 9);
    expect(g.valueAt(60 + MUTE_RAMP_S / 2)).toBeCloseTo(MASTER_GAIN / 2, 9);
    expect(g.valueAt(60 + MUTE_RAMP_S)).toBe(0);
    // A toggle mid-ramp reverses from where the fade has got to, with no jump.
    fake.currentTime = 60 + MUTE_RAMP_S / 2;
    engine.setMuted(false);
    expect(g.valueAt(fake.currentTime)).toBeCloseTo(MASTER_GAIN / 2, 9);
    expect(g.valueAt(fake.currentTime + MUTE_RAMP_S / 2)).toBeCloseTo((MASTER_GAIN * 3) / 4, 9);
    expect(g.valueAt(fake.currentTime + MUTE_RAMP_S)).toBe(MASTER_GAIN);
    // A later toggle ramps from now, not from the end of the previous ramp.
    fake.currentTime = 120;
    engine.setMuted(true);
    expect(g.valueAt(120 + MUTE_RAMP_S / 2)).toBeCloseTo(MASTER_GAIN / 2, 9);
  });

  it("a mute set before unlock starts the master at 0", () => {
    const fake = new FakeAudioContext();
    const engine = new AudioEngine(
      () => fake,
      () => 0.5,
    );
    engine.setMuted(true);
    engine.unlock();
    const first = masterOf(fake).gain.events[0];
    expect(first?.type).toBe("set");
    expect(first?.value).toBe(0);
  });

  it("a flush while muted returns 0, creates no node and empties the queue", () => {
    const { fake, engine, chain } = rig(() => 0.5);
    engine.setMuted(true);
    const q = new CueQueue();
    q.push("bumper", 200, 1);
    q.push("tilt", -1, 1);
    expect(engine.flush(q)).toBe(0);
    expect(fake.nodes.length).toBe(chain);
    expect(q.size).toBe(0);
  });
});

describe("a starting context is playable (WR-02)", () => {
  /** An engine over a fake that, like a browser, reports "suspended" when new. */
  function startingRig(): { fake: FakeAudioContext; engine: AudioEngine } {
    const fake = new FakeAudioContext();
    fake.state = "suspended";
    return {
      fake,
      engine: new AudioEngine(
        () => fake,
        () => 0.5,
      ),
    };
  }

  it("a 'start' cue flushed right after unlock, before the context runs, is scheduled", () => {
    const { fake, engine } = startingRig();
    engine.unlock();
    expect(fake.resumeCalls).toBe(1);
    expect(fake.state).toBe("suspended");
    const q = new CueQueue();
    q.push("start", 0, 1);
    expect(engine.flush(q)).toBe(1);
    expect(q.size).toBe(0);
    const started = fake.sources().filter((s) => s.startTime !== null);
    expect(started.length).toBeGreaterThan(0);
    for (const s of started) expect(s.startTime ?? -1).toBeGreaterThanOrEqual(SCHEDULE_AHEAD_S);
  });

  it("once the resume has settled, a context still suspended drops cues again", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { fake, engine } = startingRig();
      fake.resume = () => {
        fake.resumeCalls++;
        return Promise.reject(new Error("device unavailable"));
      };
      engine.unlock();
      await Promise.resolve();
      await Promise.resolve();
      expect(errors).toHaveBeenCalledTimes(1);
      const chain = fake.nodes.length;
      const q = new CueQueue();
      q.push("bumper", 200, 1);
      expect(engine.flush(q)).toBe(0);
      expect(q.size).toBe(0);
      expect(fake.nodes.length).toBe(chain);
    } finally {
      errors.mockRestore();
    }
  });

  it("a suspended context with no resume in flight drops cues", async () => {
    const { fake, engine } = startingRig();
    engine.unlock();
    await Promise.resolve();
    fake.state = "running";
    fake.state = "suspended"; // an OS-level suspend after the start
    const chain = fake.nodes.length;
    const q = new CueQueue();
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(0);
    expect(fake.nodes.length).toBe(chain);
  });
});

describe("unlock edge cases (05-REVIEW IN-06)", () => {
  it("a context whose master chain fails to build is closed, reported once and never retried", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fake = new FakeAudioContext();
      fake.createDynamicsCompressor = () => {
        throw new Error("no compressor");
      };
      let calls = 0;
      const engine = new AudioEngine(
        () => {
          calls++;
          return fake;
        },
        () => 0.5,
      );
      engine.unlock();
      expect(fake.closeCalls).toBe(1);
      expect(engine.context).toBeNull();
      expect(errors).toHaveBeenCalledTimes(1);
      engine.unlock();
      expect(calls).toBe(1);
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
    }
  });

  it("a closed context is reported once and never resumed on later gestures", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { fake, engine } = rig(() => 0.5);
      fake.state = "closed";
      for (let i = 0; i < 5; i++) engine.unlock();
      expect(fake.resumeCalls).toBe(0);
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
    }
  });
});
