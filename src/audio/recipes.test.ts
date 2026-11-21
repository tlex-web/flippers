import { describe, it, expect } from "vitest";

import { CUE_KINDS, CueQueue, type CueKind } from "../app/cue-queue";
import { TABLE_SPEC } from "../table/spec";
import { AudioEngine } from "./audio-engine";
import { semitoneRatio } from "./mapping";
import { RECIPES } from "./recipes";
import {
  FakeAudioContext,
  FakeBiquad,
  FakeOscillator,
  reaches,
  type FakeNode,
} from "./test/fake-audio-context";

/** The element id each cue kind carries in play. */
const ELEMENT_ID: Readonly<Record<CueKind, number>> = {
  bumper: 200,
  slingshot: 300,
  rollover: 400,
  lane: 500,
  bank: -1,
  flipperUp: 0,
  flipperDown: 0,
  launch: -1,
  drain: 600,
  tilt: -1,
  warning: -1,
  start: -1,
  gameOver: -1,
};

interface Voiced {
  readonly fake: FakeAudioContext;
  readonly chain: readonly FakeNode[];
  readonly voice: readonly FakeNode[];
  readonly started: number;
}

/** One cue through a fresh unlocked engine over a fresh fake context. */
function voice(
  kind: CueKind,
  strength: number,
  elementId: number = ELEMENT_ID[kind],
  rng: () => number = () => 0.5,
): Voiced {
  const fake = new FakeAudioContext();
  const engine = new AudioEngine(() => fake, rng);
  engine.unlock();
  const chain = fake.nodes.slice();
  const q = new CueQueue();
  q.push(kind, elementId, strength);
  const started = engine.flush(q);
  return { fake, chain, voice: fake.nodes.slice(chain.length), started };
}

function oscillators(v: Voiced): FakeOscillator[] {
  return v.voice.filter((n): n is FakeOscillator => n instanceof FakeOscillator);
}

function firstFreq(o: FakeOscillator | undefined): number {
  const e = o?.frequency.events.find((x) => x.type === "set");
  if (!e) throw new Error("oscillator has no start frequency");
  return e.value;
}

/** Latest stop time over the voice's sources. */
function voiceEnd(v: Voiced): number {
  let end = -Infinity;
  for (const s of v.fake.sources()) end = Math.max(end, s.stopTime ?? -Infinity);
  return end;
}

describe("every cue kind builds a complete voice (AUD-01, Pattern 6)", () => {
  for (const kind of CUE_KINDS) {
    it(`${kind}: starts, stops, reaches the destination through master, cleans up`, () => {
      const v = voice(kind, 0.7);
      const master = v.chain.find((n) => n.kind === "gain");
      const comp = v.chain.find((n) => n.kind === "compressor");
      if (!master || !comp) throw new Error("master chain missing");
      expect(v.started).toBe(1);
      const sources = v.fake.sources();
      expect(sources.length).toBeGreaterThanOrEqual(1);
      for (const s of sources) {
        expect(s.startTime).not.toBeNull();
        expect(s.stopTime ?? -Infinity).toBeGreaterThan(s.startTime ?? Infinity);
        expect(reaches(s, master)).toBe(true);
        expect(v.fake.reachesDestination(s)).toBe(true);
      }
      v.fake.fireAllEnded();
      for (const n of v.voice) expect(n.disconnected).toBe(true);
      expect(master.disconnected).toBe(false);
      expect(comp.disconnected).toBe(false);
    });
  }
});

describe("recipes are distinct data over exactly the cue kinds (AUD-01, D-03)", () => {
  it("has one recipe per cue kind and no wall or chute recipe", () => {
    expect(new Set(Object.keys(RECIPES))).toEqual(new Set(CUE_KINDS));
    expect(Object.keys(RECIPES)).not.toContain("wall");
    expect(Object.keys(RECIPES)).not.toContain("chute");
  });

  it("the 13 oscillator/noise/filter signatures are pairwise distinct", () => {
    const signatures = CUE_KINDS.map((k) =>
      JSON.stringify(
        RECIPES[k].layers.map((l) => [
          l.source,
          l.wave ?? "",
          Math.round(l.f0),
          Math.round(l.f1),
          l.filter?.type ?? "",
        ]),
      ),
    );
    expect(new Set(signatures).size).toBe(CUE_KINDS.length);
  });

  it("tilt is two beating squares at 110 and 116.5 Hz held at least 0.4 s", () => {
    const layers = RECIPES.tilt.layers;
    expect(layers.length).toBe(2);
    expect(layers.map((l) => l.wave)).toEqual(["square", "square"]);
    expect(layers.map((l) => l.f0)).toEqual([110, 116.5]);
    for (const l of layers) expect(l.envelope.hold).toBeGreaterThanOrEqual(0.4);
  });

  it("bank and start rise and gameOver falls over three layers at increasing offsets", () => {
    for (const [kind, rising] of [
      ["bank", true],
      ["start", true],
      ["gameOver", false],
    ] as const) {
      const layers = RECIPES[kind].layers;
      expect(layers.length).toBe(3);
      for (let i = 1; i < 3; i++) {
        const prev = layers[i - 1];
        const cur = layers[i];
        if (!prev || !cur) throw new Error("missing layer");
        expect(cur.offset).toBeGreaterThan(prev.offset);
        if (rising) expect(cur.f0).toBeGreaterThan(prev.f0);
        else expect(cur.f0).toBeLessThan(prev.f0);
      }
    }
  });

  it("warning is two beeps 0.15 s apart", () => {
    const layers = RECIPES.warning.layers;
    expect(layers.length).toBe(2);
    expect((layers[1]?.offset ?? 0) - (layers[0]?.offset ?? 0)).toBeCloseTo(0.15, 12);
  });
});

describe("strength and element shape the voice", () => {
  it("launch at strength 1 ends later and sweeps its filter higher than at strength 0", () => {
    const hard = voice("launch", 1);
    const soft = voice("launch", 0);
    expect(voiceEnd(hard)).toBeGreaterThan(voiceEnd(soft));
    const sweepTop = (v: Voiced): number => {
      let top = 0;
      for (const n of v.voice) {
        if (!(n instanceof FakeBiquad)) continue;
        for (const e of n.frequency.events) if (e.type === "exp") top = Math.max(top, e.value);
      }
      return top;
    };
    expect(sweepTop(hard)).toBeGreaterThan(sweepTop(soft));
  });

  for (const kind of ["tilt", "warning", "start", "gameOver"] as const) {
    it(`${kind} ignores strength (identical logs at 0.2 and 0.9)`, () => {
      expect(voice(kind, 0.2).fake.log()).toEqual(voice(kind, 0.9).fake.log());
    });
  }

  it("bumpers 200, 201 and 202 start at different oscillator frequencies", () => {
    const freqs = [200, 201, 202].map((id) => firstFreq(oscillators(voice("bumper", 0.7, id))[0]));
    expect(new Set(freqs).size).toBe(3);
    expect((freqs[1] ?? 0) / (freqs[0] ?? 1)).toBeCloseTo(semitoneRatio(2), 9);
    expect((freqs[2] ?? 0) / (freqs[0] ?? 1)).toBeCloseTo(semitoneRatio(-3), 9);
  });

  it("flipperUp for id 0 and id 1 differ by one semitone", () => {
    const left = firstFreq(oscillators(voice("flipperUp", 0.7, 0))[0]);
    const right = firstFreq(oscillators(voice("flipperUp", 0.7, 1))[0]);
    expect(right / left).toBeCloseTo(semitoneRatio(1), 9);
  });
});

describe("per-element pitch maps cover TABLE_SPEC (05-REVIEW IN-05)", () => {
  /** Every TABLE_SPEC id of one element kind. */
  const idsOf = (kind: "bumper" | "flipper"): number[] =>
    TABLE_SPEC.filter((el) => el.kind === kind).map((el) => el.id);

  it("every bumper id has its own, distinct pitch offset", () => {
    const map = RECIPES.bumper.idSemitones ?? {};
    const bumpers = idsOf("bumper");
    expect(bumpers.length).toBeGreaterThan(1);
    for (const id of bumpers) expect(map[id], `bumper ${id}`).toBeTypeOf("number");
    expect(new Set(bumpers.map((id) => map[id])).size).toBe(bumpers.length);
  });

  it("every flipper id has a distinct offset for both flipper cues", () => {
    const flippers = idsOf("flipper");
    expect(flippers.length).toBe(2);
    for (const kind of ["flipperUp", "flipperDown"] as const) {
      const map = RECIPES[kind].idSemitones ?? {};
      for (const id of flippers) expect(map[id], `${kind} ${id}`).toBeTypeOf("number");
      expect(new Set(flippers.map((id) => map[id])).size).toBe(flippers.length);
    }
  });
});
