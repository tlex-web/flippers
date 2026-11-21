import { describe, it, expect } from "vitest";

import { CueQueue, type CueKind } from "../app/cue-queue";
import { mulberry32 } from "../harness/prng";
import { AudioEngine } from "./audio-engine";
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
