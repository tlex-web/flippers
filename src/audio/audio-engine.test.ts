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
    const unlockedAt = fake.currentTime;
    fake.currentTime = unlockedAt + 0.5; // it ran: its clock has advanced
    fake.state = "suspended"; // an OS-level suspend after the start
    const chain = fake.nodes.length;
    const q = new CueQueue();
    q.push("bumper", 200, 1);
    // A moved clock alone is not rendering without a resume in flight (IN-05,
    // 05-REVIEW IN-04): nothing is built and no voice is held.
    expect(engine.flush(q)).toBe(0);
    expect(engine.activeVoices()).toBe(0);
    expect(fake.nodes.length).toBe(chain);
  });
});

describe("the starting window is bounded (05-REVIEW WR-01)", () => {
  /**
   * A browser-like new context whose `resume()` never settles (no output
   * device, or a gesture that is not activation), on a fake wall clock. Its
   * `currentTime` stays frozen at 0 and `onended` never fires. `resume`
   * replaces that never-settling promise, from the first unlock on.
   */
  function stuckRig(resume: () => Promise<void> = () => new Promise<void>(() => {})): {
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
      return resume();
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

  it("cues stop being built after the window; stolen and leftover voices are torn down without onended", () => {
    const { fake, engine, clock, chain } = stuckRig();
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

    // When the context finally starts, the pool-torn-down voices' onended
    // fires (release misses, teardown repeats): harmless, nothing is revived.
    fake.state = "running";
    expect(() => fake.fireAllEnded()).not.toThrow();
    expect(engine.activeVoices()).toBe(0);
    expect(connected(fake, chain)).toBe(0);
    // Only fresh cues play.
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

  it("a held activating key on a resume that never settles spends the episode's two windows, so nodes stay bounded (WR-01)", () => {
    // A held flipper key (Z, an arrow): every keydown, auto-repeat included,
    // carries transient activation, but the resume stays stuck for 60 s. The
    // first repeat re-arms the window at once, so the episode's second window
    // is spent within the first frames.
    const { fake, engine, clock, activation, chain } = stuckRig();
    activation.active = true;
    const frameMs = 1000 / 60;
    const framesPerWindow = Math.ceil(STARTING_WINDOW_MS / frameMs) + 1;
    const q = new CueQueue();
    let started = 0;
    let lastBuiltFrame = -1;
    for (let f = 0; f < 60 * 60; f++) {
      clock.ms = 1000 + f * frameMs;
      if (f % 2 === 0) engine.unlock(); // key auto-repeat
      q.push("bumper", 200 + (f % 3), 1);
      const n = engine.flush(q);
      if (n > 0) lastBuiltFrame = f;
      started += n;
      expect(engine.activeVoices()).toBeLessThanOrEqual(MAX_VOICES);
    }
    // At least one full window, at most two, nothing after.
    expect(started).toBeGreaterThanOrEqual(Math.floor(STARTING_WINDOW_MS / frameMs));
    expect(started).toBeLessThanOrEqual(2 * framesPerWindow);
    expect(lastBuiltFrame).toBeLessThan(3 * framesPerWindow);
    expect(fake.nodes.length - chain).toBeLessThanOrEqual(
      2 * framesPerWindow * MAX_NODES_PER_VOICE,
    );
    expect(engine.activeVoices()).toBe(0);
    expect(connected(fake, chain)).toBe(0);
    expect(fake.resumeCalls).toBe(1 + 60 * 30);
  });

  it("a resume that settles on a still-suspended context opens no window; only a running context ends the episode (WR-02)", async () => {
    // Every resume's resolver, the rig's first unlock included (IN-01).
    const resolvers: (() => void)[] = [];
    const { fake, engine, clock, activation } = stuckRig(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const q = new CueQueue();
    activation.active = true;
    clock.ms += STARTING_WINDOW_MS;
    engine.unlock(); // the episode's second window
    clock.ms += STARTING_WINDOW_MS;
    engine.unlock(); // spent: opens nothing
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(0);
    // Every pending resume settles together, but the context stays suspended.
    expect(resolvers.length).toBe(3);
    expect(fake.resumeCalls).toBe(3);
    for (const settle of resolvers.splice(0)) settle();
    await Promise.resolve();
    await Promise.resolve();
    engine.unlock(); // settling is not running: the same, spent episode
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(0);
    // The context runs, then an OS interruption suspends it: a fresh episode.
    fake.state = "running";
    expect(engine.flush(q)).toBe(0); // an empty frame that observes "running"
    fake.state = "suspended";
    engine.unlock();
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(1);
    clock.ms += STARTING_WINDOW_MS;
    engine.unlock(); // its own second window
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(1);
  });

  it("an activating re-gesture inside a live window re-arms it once and keeps its voices (WR-01)", () => {
    // Shift, then Enter late in the first window: Enter's resume() is the one
    // that starts the device, so its "start" figure gets a full window.
    const { fake, engine, clock, activation, chain } = stuckRig();
    const q = new CueQueue();
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(1); // a voice of the first window
    const t0 = clock.ms;
    clock.ms = t0 + STARTING_WINDOW_MS - 20;
    activation.active = true;
    engine.unlock();
    expect(connected(fake, chain)).toBe(fake.nodes.length - chain); // nothing discarded
    const rearmedAt = clock.ms;
    clock.ms = rearmedAt + 10;
    const before = fake.nodes.length;
    q.push("start", 0, 1);
    expect(engine.flush(q)).toBe(1);
    const start = fake.nodes.slice(before);
    // Past the first deadline, the audio clock still frozen (the device is
    // still coming up): the window is live, nothing is cut.
    clock.ms = t0 + STARTING_WINDOW_MS + 20;
    q.push("bumper", 201, 1);
    expect(engine.flush(q)).toBe(1);
    expect(start.every((n) => !n.disconnected)).toBe(true);
    // A further activating gesture does not re-arm it again.
    engine.unlock();
    clock.ms = rearmedAt + STARTING_WINDOW_MS;
    q.push("bumper", 200, 1);
    expect(engine.flush(q)).toBe(0);
    expect(connected(fake, chain)).toBe(0);
  });

  it("a starting context whose clock already advances counts as rendering, before state flips (IN-05)", () => {
    const { fake, engine, clock, chain } = stuckRig();
    const q = new CueQueue();
    for (let i = 0; i < RECIPES.bumper.cap; i++) q.push("bumper", 200, 0.5);
    expect(engine.flush(q)).toBe(RECIPES.bumper.cap);
    // Rendering has begun (the clock moves) but `state` still reads
    // "suspended", and the wall-clock window has passed.
    fake.currentTime = 0.02;
    clock.ms += STARTING_WINDOW_MS + 10;
    expect(fake.state).toBe("suspended");
    q.push("bumper", 200, 0.5);
    expect(engine.flush(q)).toBe(1); // not dropped, nothing discarded
    expect(engine.activeVoices("bumper")).toBe(RECIPES.bumper.cap);
    // The stolen voice keeps its nodes until its onended: the fade plays.
    expect(connected(fake, chain)).toBe(fake.nodes.length - chain);
  });

  it("an activating gesture after the deadline on a context already rendering discards nothing (WR-02)", () => {
    const { fake, engine, clock, activation, chain } = stuckRig();
    const q = new CueQueue();
    for (let i = 0; i < RECIPES.bumper.cap; i++) q.push("bumper", 200, 0.5);
    expect(engine.flush(q)).toBe(RECIPES.bumper.cap);
    // The IN-05 interval: the clock moves, `state` still reads "suspended",
    // the resume is pending and the wall-clock window has passed.
    fake.currentTime = 0.02;
    clock.ms += STARTING_WINDOW_MS + 10;
    q.push("bumper", 200, 0.5);
    expect(engine.flush(q)).toBe(1);
    const nodes = connected(fake, chain);
    const voices = engine.activeVoices();
    expect(nodes).toBe(fake.nodes.length - chain);

    // A flipper press with activation lands in that interval.
    activation.active = true;
    engine.unlock();
    expect(fake.state).toBe("suspended");
    expect(engine.activeVoices()).toBe(voices);
    expect(connected(fake, chain)).toBe(nodes);

    // `startAudioT` was not re-anchored: before the clock moves again the
    // context still counts as rendering, so a steal keeps the fade.
    q.push("bumper", 200, 0.5);
    expect(engine.flush(q)).toBe(1);
    expect(connected(fake, chain)).toBe(fake.nodes.length - chain);

    // The clock keeps advancing: still nothing discarded.
    fake.currentTime = 0.04;
    clock.ms += 100;
    engine.unlock();
    q.push("bumper", 200, 0.5);
    expect(engine.flush(q)).toBe(1);
    expect(engine.activeVoices("bumper")).toBe(RECIPES.bumper.cap);
    expect(connected(fake, chain)).toBe(fake.nodes.length - chain);
  });

  it("a context that starts inside the window keeps the voices scheduled while starting", () => {
    const { fake, engine, clock, chain } = stuckRig();
    const q = new CueQueue();
    q.push("start", 0, 1);
    expect(engine.flush(q)).toBe(1);
    const firstVoice = fake.nodes.length - chain;
    clock.ms += 40; // normal start-up: tens of ms, still suspended
    expect(fake.state).toBe("suspended");
    q.push("bumper", 201, 0.5);
    expect(engine.flush(q)).toBe(1); // still inside the window: playable
    clock.ms += 10;
    fake.state = "running";
    fake.currentTime = 0.01;
    q.push("bumper", 200, 0.5);
    expect(engine.flush(q)).toBe(1);
    expect(engine.activeVoices()).toBe(3);
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

describe("starting episodes: invariants over gestures, resume outcomes and clocks (05-REVIEW WR-01..WR-03)", () => {
  const T0 = 1000;
  const FRAME_MS = 1000 / 60;
  /** Most frames one starting window can play (its frames plus one for rounding). */
  const FRAMES_PER_WINDOW = Math.ceil(STARTING_WINDOW_MS / FRAME_MS) + 1;
  /**
   * The device starts this long after the gesture whose resume starts it: the
   * first activating gesture ("runs") or the recovering one ("fails-then-runs").
   */
  const START_DELAY_MS = 60;
  /**
   * "fails-then-runs": the device recovers and an activating gesture (Enter)
   * arrives this long after the first gesture, after every second gesture.
   */
  const RECOVER_AT_MS = 1500;
  /**
   * On an advancing clock, `state` flips to "running" (and the resumes
   * resolve) this long after rendering starts: longer than a window, the
   * worst case of the IN-05 lag.
   */
  const STATE_LAG_MS = 300;
  const RUN_MS = 2000;

  /**
   * "runs": every resume stays pending until the device starts, then all
   * resolve. "fails-then-runs": the device start fails, so every resume
   * rejects (an activating gesture's included) until an activating gesture at
   * RECOVER_AT_MS, whose resume starts the device START_DELAY_MS later; from
   * then on it behaves as "runs". It is only paired with rows that have an
   * activating gesture before the recovery.
   */
  type Outcome = "runs" | "pending" | "rejects" | "fails-then-runs";
  /**
   * "frozen": `currentTime` never moves, and `state` flipping to "running" at
   * the device start is the only signal. "advancing": `currentTime` moves
   * from the device start, and `state` lags it by STATE_LAG_MS.
   */
  type ClockMode = "frozen" | "advancing";
  interface Gesture {
    /** ms after the first gesture. */
    readonly atMs: number;
    readonly activating: boolean;
  }
  interface Row {
    readonly first: boolean;
    readonly second: Gesture | null;
    readonly outcome: Outcome;
    readonly clock: ClockMode;
  }

  /** Let pending `resume()` callbacks run (the checkpoint after an event handler). */
  async function drain(): Promise<void> {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  }

  /** A browser-like context that starts suspended, with the given resume outcome. */
  function scenarioRig(outcome: Outcome): {
    fake: FakeAudioContext;
    engine: AudioEngine;
    clock: { ms: number };
    activation: { active: boolean };
    resolveAll: () => void;
    /** "fails-then-runs": the device has recovered, so resumes stop rejecting. */
    recover: () => void;
  } {
    const fake = new FakeAudioContext();
    fake.state = "suspended";
    const resolvers: (() => void)[] = [];
    let failing = outcome === "rejects" || outcome === "fails-then-runs";
    fake.resume = () => {
      fake.resumeCalls++;
      if (failing) return Promise.reject(new Error("device failed to start"));
      return new Promise<void>((resolve) => {
        if (outcome === "runs" || outcome === "fails-then-runs") resolvers.push(resolve);
      });
    };
    const recover = (): void => {
      if (outcome === "fails-then-runs") failing = false;
    };
    const clock = { ms: T0 };
    const activation = { active: false };
    const engine = new AudioEngine(
      () => fake,
      () => 0.5,
      () => clock.ms,
      () => activation.active,
    );
    const resolveAll = (): void => {
      for (const r of resolvers.splice(0)) r();
    };
    return { fake, engine, clock, activation, resolveAll, recover };
  }

  interface Trace {
    /**
     * The "start" flush's result, or null when no activating gesture occurred.
     * Under "fails-then-runs" it is the recovering gesture's "start".
     */
    readonly startFlushed: number | null;
    /** Nodes of the "start" voice disconnected by the end of the run. */
    readonly startCut: number;
    /** Gestures that landed while the audio clock was advancing. */
    readonly gesturesWhileRendering: number;
    /** Nodes disconnected by those gestures' `unlock()` calls. */
    readonly cutByGestureWhileRendering: number;
    /** `console.error` calls over the run (one episode). */
    readonly errors: number;
  }

  /**
   * Run one row for RUN_MS at 60 fps: a bumper cue every third frame, and a
   * "start" cue flushed on its own on the frame after the first activating
   * gesture (Enter starting the game), or under "fails-then-runs" after the
   * recovering gesture. Microtasks drain after each gesture, as after a real
   * event handler.
   */
  async function simulate(row: Row): Promise<Trace> {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { fake, engine, clock, activation, resolveAll, recover } = scenarioRig(row.outcome);
      const gestures: Gesture[] = [{ atMs: 0, activating: row.first }];
      if (row.second) gestures.push(row.second);
      const recovery: Gesture | null =
        row.outcome === "fails-then-runs" ? { atMs: RECOVER_AT_MS, activating: true } : null;
      if (recovery) gestures.push(recovery);
      const starter = recovery ?? gestures.find((g) => g.activating) ?? null;
      const deviceAt =
        (row.outcome === "runs" || row.outcome === "fails-then-runs") && starter
          ? starter.atMs + START_DELAY_MS
          : Number.POSITIVE_INFINITY;
      const runningAt = deviceAt + (row.clock === "advancing" ? STATE_LAG_MS : 0);
      let running = false;
      const advanceTo = async (t: number): Promise<void> => {
        clock.ms = T0 + t;
        if (row.clock === "advancing" && t >= deviceAt) fake.currentTime = (t - deviceAt) / 1000;
        if (!running && t >= runningAt) {
          running = true;
          fake.state = "running";
          resolveAll();
          await drain();
        }
      };
      const disconnected = (): number => fake.nodes.filter((n) => n.disconnected).length;

      const startQ = new CueQueue();
      const q = new CueQueue();
      let startDue = false;
      let startFlushed: number | null = null;
      let startNodes: FakeAudioContext["nodes"] = [];
      let gesturesWhileRendering = 0;
      let cutByGestureWhileRendering = 0;
      let next = 0;
      for (let f = 0; f * FRAME_MS <= RUN_MS; f++) {
        const frameAt = f * FRAME_MS;
        for (let g = gestures[next]; g !== undefined && g.atMs <= frameAt; g = gestures[next]) {
          next++;
          await advanceTo(g.atMs);
          const rendering = fake.currentTime > 0;
          if (g === recovery) recover();
          activation.active = g.activating;
          const before = disconnected();
          engine.unlock();
          if (rendering) {
            gesturesWhileRendering++;
            cutByGestureWhileRendering += disconnected() - before;
          }
          await drain();
          if (g === starter) startDue = true;
        }
        await advanceTo(frameAt);
        if (startDue) {
          startDue = false;
          startQ.push("start", 0, 1);
          const before = fake.nodes.length;
          startFlushed = engine.flush(startQ);
          startNodes = fake.nodes.slice(before);
        }
        if (f % 3 === 0) q.push("bumper", 200, 0.8);
        engine.flush(q);
      }
      return {
        startFlushed,
        startCut: startNodes.filter((n) => n.disconnected).length,
        gesturesWhileRendering,
        cutByGestureWhileRendering,
        errors: errors.mock.calls.length,
      };
    } finally {
      errors.mockRestore();
    }
  }

  const seconds: (Gesture | null)[] = [null];
  for (const atMs of [20, 230, 1000]) {
    for (const activating of [true, false]) seconds.push({ atMs, activating });
  }
  const rows: Row[] = [];
  for (const first of [true, false]) {
    for (const second of seconds) {
      const activatingBefore = first || second?.activating === true;
      for (const outcome of ["runs", "pending", "rejects", "fails-then-runs"] as const) {
        // "fails-then-runs" needs an activating gesture whose start fails.
        if (outcome === "fails-then-runs" && !activatingBefore) continue;
        for (const clock of ["frozen", "advancing"] as const) {
          rows.push({ first, second, outcome, clock });
        }
      }
    }
  }

  /**
   * "fails-then-runs": whether the recovering gesture still gets a window.
   * The opener takes the first window and the first activating re-gesture the
   * second, so the recovery gets one only when no activating second gesture
   * spent the episode before it.
   */
  const recoveryGetsWindow = (r: Row): boolean => r.second?.activating !== true;
  const act = (a: boolean): string => (a ? "activating" : "non-activating");
  const label = (r: Row): string =>
    `first ${act(r.first)}, second ${r.second ? `+${r.second.atMs} ms ${act(r.second.activating)}` : "none"}, ` +
    `resume ${r.outcome}, clock ${r.clock}`;

  it.each(rows.map((r) => [label(r), r] as const))("%s", async (_name, row) => {
    const t = await simulate(row);
    const starts =
      (row.outcome === "runs" && (row.first || row.second?.activating === true)) ||
      (row.outcome === "fails-then-runs" && recoveryGetsWindow(row));
    if (starts) {
      // 2. The device starts START_DELAY_MS (inside a window) after a gesture
      // that got a window, the opener or the first activating re-gesture: its
      // "start" figure is scheduled and never cut.
      expect(t.startFlushed).toBeGreaterThanOrEqual(1);
      expect(t.startCut).toBe(0);
    } else if (row.outcome === "fails-then-runs") {
      // 2, its documented limit: the recovering gesture comes after the
      // episode is spent, so it gets no window, even though its own resume
      // starts the device. Its "start" figure is dropped (the cost of the
      // two-window bound).
      expect(t.startFlushed).toBe(0);
    }
    // 3. No gesture hard-cuts sounding voices while the clock advances.
    expect(t.cutByGestureWhileRendering).toBe(0);
    // 4. One episode: a failed resume is reported once.
    const fails = row.outcome === "rejects" || row.outcome === "fails-then-runs";
    expect(t.errors).toBe(fails ? 1 : 0);
  });

  it("the table reaches the late re-arm, a gesture while rendering and a recovery after a spent episode", async () => {
    // The WR-01 sequence: Shift, then Enter at +230 ms, the device up 60 ms later.
    const late = await simulate({
      first: false,
      second: { atMs: 230, activating: true },
      outcome: "runs",
      clock: "frozen",
    });
    expect(late.startFlushed).toBe(1);
    expect(late.startCut).toBe(0);
    // An activating gesture in the IN-05 interval (rendering, `state` lagging).
    const lagging = await simulate({
      first: true,
      second: { atMs: 230, activating: true },
      outcome: "runs",
      clock: "advancing",
    });
    expect(lagging.gesturesWhileRendering).toBe(1);
    expect(lagging.cutByGestureWhileRendering).toBe(0);
    // 05-REVIEW WR-01's sequence: Shift, then Z whose device start fails,
    // then Enter once the device recovers. Z spent the episode, so Enter's
    // "start" figure is dropped although its resume starts the device.
    const spent = await simulate({
      first: false,
      second: { atMs: 100, activating: true },
      outcome: "fails-then-runs",
      clock: "frozen",
    });
    expect(spent.startFlushed).toBe(0);
    expect(spent.errors).toBe(1);
    // With the opener as the failing activating gesture, Enter is the first
    // activating re-gesture and still gets the episode's second window.
    const recovered = await simulate({
      first: true,
      second: null,
      outcome: "fails-then-runs",
      clock: "frozen",
    });
    expect(recovered.startFlushed).toBe(1);
    expect(recovered.startCut).toBe(0);
  });

  const heldRows: [boolean, "pending" | "rejects", "before" | "after"][] = [];
  for (const activating of [true, false]) {
    for (const outcome of ["pending", "rejects"] as const) {
      for (const drainAt of ["before", "after"] as const) {
        heldRows.push([activating, outcome, drainAt]);
      }
    }
  }

  it.each(heldRows)(
    "1. bounded: a key held 60 s (activation %s), resume %s, microtasks drained %s the flush",
    async (activating, outcome, drainAt) => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const { fake, engine, clock, activation } = scenarioRig(outcome);
        activation.active = activating;
        const q = new CueQueue();
        let chain = -1;
        let started = 0;
        for (let f = 0; f < 60 * 60; f++) {
          clock.ms = T0 + f * FRAME_MS;
          if (f % 2 === 0) {
            engine.unlock(); // key auto-repeat at 30 Hz
            if (chain < 0) chain = fake.nodes.length;
            if (drainAt === "before") await drain();
          }
          q.push("bumper", 200 + (f % 3), 1);
          started += engine.flush(q);
          expect(engine.activeVoices()).toBeLessThanOrEqual(MAX_VOICES);
          if (drainAt === "after") await drain();
        }
        expect(started).toBeLessThanOrEqual(2 * FRAMES_PER_WINDOW);
        expect(fake.nodes.length - chain).toBeLessThanOrEqual(
          2 * FRAMES_PER_WINDOW * MAX_NODES_PER_VOICE,
        );
        expect(engine.activeVoices()).toBe(0);
        expect(connected(fake, chain)).toBe(0);
        expect(fake.resumeCalls).toBe(60 * 30);
        // 4. A rejection is reported once, not on every keydown.
        expect(errors).toHaveBeenCalledTimes(outcome === "rejects" ? 1 : 0);
      } finally {
        errors.mockRestore();
      }
    },
  );

  it("4. a failed resume is reported once per episode, and again after running → suspended", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { fake, engine } = scenarioRig("rejects");
      const reject = fake.resume;
      for (let i = 0; i < 10; i++) {
        engine.unlock();
        await drain();
      }
      expect(errors).toHaveBeenCalledTimes(1);
      // A resume() that throws in the same episode is not reported again.
      fake.resume = () => {
        throw new Error("resume threw");
      };
      engine.unlock();
      expect(errors).toHaveBeenCalledTimes(1);
      // The context runs (the engine sees it), then is suspended again.
      fake.state = "running";
      engine.unlock();
      fake.state = "suspended";
      fake.resume = reject;
      for (let i = 0; i < 10; i++) {
        engine.unlock();
        await drain();
      }
      expect(errors).toHaveBeenCalledTimes(2);
    } finally {
      errors.mockRestore();
    }
  });

  it("5. after running → suspended, the next gesture opens a fresh window with its own second window", async () => {
    const { fake, engine, clock, activation, resolveAll } = scenarioRig("runs");
    const q = new CueQueue();
    const frame = (): number => {
      q.push("bumper", 200, 1);
      return engine.flush(q);
    };
    // Episode 1: both windows spent on a resume that has not settled yet.
    engine.unlock();
    expect(frame()).toBe(1);
    clock.ms += STARTING_WINDOW_MS + 50;
    activation.active = true;
    engine.unlock();
    expect(frame()).toBe(1);
    clock.ms += STARTING_WINDOW_MS + 50;
    engine.unlock();
    expect(frame()).toBe(0);
    // The device starts: every pending resume resolves and the clock moves.
    fake.state = "running";
    resolveAll();
    await drain();
    fake.currentTime = 1;
    expect(frame()).toBe(1);
    // An OS interruption: suspended again, the clock frozen, no resume in flight.
    fake.state = "suspended";
    activation.active = false;
    expect(frame()).toBe(0);
    // Episode 2: a fresh first window from a non-activating gesture...
    engine.unlock();
    expect(frame()).toBe(1);
    clock.ms += STARTING_WINDOW_MS + 50;
    expect(frame()).toBe(0);
    // ...and its own second window from the first activating one.
    activation.active = true;
    engine.unlock();
    expect(frame()).toBe(1);
    clock.ms += STARTING_WINDOW_MS + 50;
    engine.unlock();
    expect(frame()).toBe(0);
  });

  it("1. bounded: after a run the engine never observes, a stuck resume in the spent episode builds nothing (05-REVIEW IN-01)", async () => {
    const fake = new FakeAudioContext();
    fake.state = "suspended";
    let stuck = false;
    const resolvers: (() => void)[] = [];
    fake.resume = () => {
      fake.resumeCalls++;
      return new Promise<void>((resolve) => {
        if (!stuck) resolvers.push(resolve);
      });
    };
    const clock = { ms: T0 };
    const engine = new AudioEngine(
      () => fake,
      () => 0.5,
      () => clock.ms,
      () => true,
    );
    engine.unlock(); // the episode's first window
    engine.unlock(); // the activating re-arm: the episode is spent
    const chain = fake.nodes.length;
    // The device starts and the context renders, but no flush() or unlock()
    // runs (rAF paused) before it is suspended again: the run is never
    // observed, so the episode does not end.
    fake.state = "running";
    fake.currentTime = 5;
    for (const resolve of resolvers.splice(0)) resolve();
    await drain();
    fake.state = "suspended";
    clock.ms += 10_000;
    // A gesture in the spent episode opens no window, and its resume sticks.
    stuck = true;
    engine.unlock();
    const q = new CueQueue();
    let built = 0;
    for (let f = 0; f < 600; f++) {
      clock.ms += FRAME_MS;
      q.push("bumper", 200 + (f % 3), 1);
      built += engine.flush(q);
    }
    // The frozen clock must not read as rendering against a stale anchor.
    expect(built).toBe(0);
    expect(connected(fake, chain)).toBe(0);
    expect(engine.activeVoices()).toBe(0);
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
