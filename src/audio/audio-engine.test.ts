import { describe, it, expect, vi } from "vitest";

import { CUE_KINDS, CueQueue, type CueKind } from "../app/cue-queue";
import { mulberry32 } from "../harness/prng";
import {
  AudioEngine,
  MASTER_GAIN,
  MUTE_RAMP_S,
  SCHEDULE_AHEAD_S,
  STARTING_WINDOW_MS,
} from "./audio-engine";
import { semitoneRatio } from "./mapping";
import { RECIPES } from "./recipes";
import { FakeAudioContext, FakeGain, FakeOscillator } from "./test/fake-audio-context";
import { MAX_VOICES } from "./voice-pool";

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
        () => 0,
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

describe("the starting window is bounded (05-REVIEW WR-01)", () => {
  /**
   * A browser-like new context whose `resume()` never settles (no output
   * device, or a gesture that is not activation), on a fake wall clock. Its
   * `currentTime` stays frozen at 0 and `onended` never fires.
   */
  function stuckRig(): {
    fake: FakeAudioContext;
    engine: AudioEngine;
    clock: { ms: number };
    activation: { active: boolean };
    chain: number;
  } {
    const fake = new FakeAudioContext();
    fake.state = "suspended";
    fake.resume = () => {
      fake.resumeCalls++;
      return new Promise<void>(() => {});
    };
    const clock = { ms: 1000 };
    // Re-gestures default to non-activating (a modifier-only keydown).
    const activation = { active: false };
    const engine = new AudioEngine(
      () => fake,
      () => 0.5,
      () => clock.ms,
      () => activation.active,
    );
    engine.unlock();
    return { fake, engine, clock, activation, chain: fake.nodes.length };
  }

  /** Voice nodes (after the master chain) still connected. */
  function connected(fake: FakeAudioContext, chain: number): number {
    return fake.nodes.slice(chain).filter((n) => !n.disconnected).length;
  }

  /** Most nodes one voice can create: per layer an envelope gain, a source and maybe a filter. */
  const MAX_NODES_PER_VOICE = Math.max(
    ...CUE_KINDS.map((k) =>
      RECIPES[k].layers.reduce((n, layer) => n + 2 + (layer.filter ? 1 : 0), 0),
    ),
  );

  it("cues stop being built after the window; stolen and leftover voices are torn down without onended", async () => {
    const { fake, engine, clock, chain } = stuckRig();
    await Promise.resolve();
    const graphBound = MAX_VOICES * MAX_NODES_PER_VOICE;
    const frameMs = 1000 / 60;
    const q = new CueQueue();
    let builtFrames = 0;
    for (let f = 0; f < 120; f++) {
      clock.ms = 1000 + f * frameMs;
      const inWindow = f * frameMs < STARTING_WINDOW_MS;
      for (const k of CUE_KINDS) q.push(k, 200 + (f % 3), 0.8);
      q.push("bumper", 201, 1);
      q.push("bumper", 202, 1);
      if (f === 60) engine.unlock(); // a non-activating re-gesture while the resume is still pending
      const before = fake.nodes.length;
      const started = engine.flush(q);
      expect(q.size).toBe(0);
      if (inWindow) {
        // (b) the pool's bound holds for the graph: every stolen voice was
        // disconnected by the pool, since onended never fires here.
        expect(started).toBe(CUE_KINDS.length + 2);
        expect(engine.activeVoices()).toBeLessThanOrEqual(MAX_VOICES);
        expect(connected(fake, chain)).toBeLessThanOrEqual(graphBound);
        builtFrames++;
      } else {
        // (a) the window expired: nothing is built, and every voice from the
        // window was discarded so it cannot burst out on a late start.
        expect(started).toBe(0);
        expect(fake.nodes.length).toBe(before);
        expect(engine.activeVoices()).toBe(0);
        expect(connected(fake, chain)).toBe(0);
      }
    }
    expect(builtFrames).toBe(Math.ceil(STARTING_WINDOW_MS / frameMs));
    expect(fake.resumeCalls).toBe(2);
    expect(fake.currentTime).toBe(0);
    // Far more nodes were built than the graph ever held at once, and
    // fireAllEnded() was never called: every disconnection came from the pool.
    expect(fake.nodes.length - chain).toBeGreaterThan(3 * graphBound);

    // When the context finally starts, only fresh cues play.
    fake.state = "running";
    q.push("start", 0, 1);
    expect(engine.flush(q)).toBe(1);
    expect(engine.activeVoices()).toBe(1);
  });

  it("a re-gesture with activation after the window expired reopens it, so the 'start' cue plays (WR-01)", () => {
    // Shift first: the context is created, its resume stays pending, and the
    // window expires. Then Enter (real activation) while still pending.
    const { fake, engine, clock, activation, chain } = stuckRig();
    const q = new CueQueue();
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(1); // inside the first window
    clock.ms = 3000;
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(0); // expired: dropped, held voice discarded
    expect(connected(fake, chain)).toBe(0);

    // A non-activating re-gesture (held Shift auto-repeat) does not reopen it.
    engine.unlock();
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(0);

    activation.active = true;
    engine.unlock();
    expect(fake.resumeCalls).toBe(3);
    clock.ms += 16; // the "start" cue lands on the next frame, context still suspended
    expect(fake.state).toBe("suspended");
    q.push("start", 0, 1);
    expect(engine.flush(q)).toBe(1);
    expect(engine.activeVoices()).toBe(1);

    // The reopened window is bounded too.
    clock.ms += STARTING_WINDOW_MS;
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(0);
    expect(engine.activeVoices()).toBe(0);
    expect(connected(fake, chain)).toBe(0);
  });

  it("a re-gesture with activation inside a live window does not extend it", () => {
    const { engine, clock, activation } = stuckRig();
    const q = new CueQueue();
    clock.ms += STARTING_WINDOW_MS - 10;
    activation.active = true;
    engine.unlock();
    clock.ms += 20;
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(0);
  });

  it("a context that starts inside the window keeps the voices scheduled while starting", () => {
    const { fake, engine, clock, chain } = stuckRig();
    const q = new CueQueue();
    q.push("start", 0, 1);
    expect(engine.flush(q)).toBe(1);
    const firstVoice = fake.nodes.length - chain;
    clock.ms += 40; // normal start-up: tens of ms
    fake.state = "running";
    fake.currentTime = 0.04;
    q.push("bumper", 200, 0.5);
    expect(engine.flush(q)).toBe(1);
    expect(engine.activeVoices()).toBe(2);
    expect(fake.nodes.slice(chain, chain + firstVoice).every((n) => !n.disconnected)).toBe(true);
  });

  it("on a running context a stolen voice stays connected until its onended (the fade plays)", () => {
    const { fake, engine, chain } = rig(() => 0.5);
    const q = new CueQueue();
    for (let i = 0; i < RECIPES.bumper.cap + 1; i++) q.push("bumper", 200, 0.5);
    engine.flush(q);
    expect(engine.activeVoices("bumper")).toBe(RECIPES.bumper.cap);
    expect(connected(fake, chain)).toBe(fake.nodes.length - chain);
    fake.fireAllEnded();
    expect(connected(fake, chain)).toBe(0);
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
