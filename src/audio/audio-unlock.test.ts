import { describe, it, expect, vi } from "vitest";

import { CueQueue } from "../app/cue-queue";
import { mulberry32 } from "../harness/prng";
import type { AudioContextLike } from "./audio-context-like";
import { AudioEngine } from "./audio-engine";
import { AudioUnlock, type GestureEventLike } from "./audio-unlock";
import { FakeAudioContext } from "./test/fake-audio-context";

/**
 * Contract cases for the audio gesture unlock (plan 05-07, AUD-01, research
 * Pattern 5, T-05-05). Like the input tests, every case drives the directly
 * callable `handleGesture` with plain event objects: no DOM, no window.
 *
 * Two rigs: a counting engine spy (which gestures reach `unlock()` at all) and
 * a real AudioEngine over a FakeAudioContext factory that counts its calls
 * (what those unlocks do to the context).
 */

const TRUSTED_ENTER: GestureEventLike = { isTrusted: true, type: "keydown", key: "Enter" };
const TRUSTED_SPACE: GestureEventLike = { isTrusted: true, type: "keydown", key: " " };
const TRUSTED_POINTER: GestureEventLike = { isTrusted: true, type: "pointerdown" };
const UNTRUSTED_ENTER: GestureEventLike = { isTrusted: false, type: "keydown", key: "Enter" };
const TRUSTED_ESCAPE: GestureEventLike = { isTrusted: true, type: "keydown", key: "Escape" };

/** Counts unlock() calls. */
class SpyEngine {
  unlocks = 0;
  unlock(): void {
    this.unlocks++;
  }
}

interface EngineRig {
  readonly fake: FakeAudioContext;
  readonly engine: AudioEngine;
  readonly unlock: AudioUnlock;
  factoryCalls(): number;
}

function engineRig(factory?: () => FakeAudioContext): EngineRig {
  const fake = new FakeAudioContext();
  let calls = 0;
  const make = factory ?? ((): FakeAudioContext => fake);
  const engine = new AudioEngine(() => {
    calls++;
    return make();
  }, mulberry32(0x0507));
  return { fake, engine, unlock: new AudioUnlock(engine), factoryCalls: () => calls };
}

describe("AudioUnlock gesture filter (engine spy)", () => {
  it("trusted keydown and pointerdown reach unlock(); untrusted and Escape do not", () => {
    const spy = new SpyEngine();
    const u = new AudioUnlock(spy);
    u.handleGesture(UNTRUSTED_ENTER);
    u.handleGesture(TRUSTED_ESCAPE);
    u.handleGesture({ isTrusted: false, type: "pointerdown" });
    expect(spy.unlocks).toBe(0);
    u.handleGesture(TRUSTED_ENTER);
    u.handleGesture(TRUSTED_POINTER);
    expect(spy.unlocks).toBe(2);
  });
});

describe("AudioUnlock over a real AudioEngine (Pattern 5 rules)", () => {
  it("no context exists before any gesture", () => {
    const g = engineRig();
    expect(g.engine.context).toBeNull();
    expect(g.factoryCalls()).toBe(0);
  });

  it("a trusted keydown creates exactly one context", () => {
    const g = engineRig();
    g.unlock.handleGesture(TRUSTED_ENTER);
    expect(g.factoryCalls()).toBe(1);
    expect(g.engine.context).toBe(g.fake);
  });

  it("a second trusted gesture while running creates no second context and never resumes", () => {
    const g = engineRig();
    g.unlock.handleGesture(TRUSTED_ENTER);
    expect(g.fake.state).toBe("running");
    g.unlock.handleGesture(TRUSTED_SPACE);
    g.unlock.handleGesture(TRUSTED_POINTER);
    expect(g.factoryCalls()).toBe(1);
    expect(g.fake.resumeCalls).toBe(0);
  });

  it("with the context suspended, the next trusted pointerdown calls resume() exactly once", () => {
    const g = engineRig();
    g.unlock.handleGesture(TRUSTED_ENTER);
    g.fake.state = "suspended";
    g.unlock.handleGesture(TRUSTED_POINTER);
    expect(g.fake.resumeCalls).toBe(1);
    expect(g.factoryCalls()).toBe(1);
  });

  it("an untrusted keydown and a trusted Escape keydown create nothing", () => {
    const g = engineRig();
    g.unlock.handleGesture(UNTRUSTED_ENTER);
    g.unlock.handleGesture(TRUSTED_ESCAPE);
    expect(g.factoryCalls()).toBe(0);
    expect(g.engine.context).toBeNull();
    expect(g.fake.nodes).toHaveLength(0);
  });

  it("a throwing factory leaves context null, logs once, and is never called again", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const g = engineRig(() => {
        throw new Error("AudioContext unavailable");
      });
      g.unlock.handleGesture(TRUSTED_ENTER);
      expect(g.factoryCalls()).toBe(1);
      expect(g.engine.context).toBeNull();
      expect(errors).toHaveBeenCalledTimes(1);
      g.unlock.handleGesture(TRUSTED_POINTER);
      g.unlock.handleGesture(TRUSTED_SPACE);
      expect(g.factoryCalls()).toBe(1);
      expect(g.engine.context).toBeNull();
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
    }
  });

  it("cues flushed before the first gesture are dropped and never played after the unlock", () => {
    const g = engineRig();
    const cues = new CueQueue();
    cues.push("bumper", 202, 0.8);
    cues.push("start", 0, 1);
    expect(g.engine.flush(cues)).toBe(0);
    expect(cues.size).toBe(0);
    expect(g.fake.nodes).toHaveLength(0);

    g.unlock.handleGesture(TRUSTED_ENTER);
    const chain = g.fake.nodes.length; // master gain + compressor only
    expect(g.engine.flush(cues)).toBe(0);
    expect(g.fake.nodes).toHaveLength(chain);
    expect(g.fake.sources()).toHaveLength(0);
  });
});

/**
 * Research assumption A5, guarded at the type level. This case exists for
 * `tsc --noEmit` (tsconfig includes all of src, test files too): a DOM
 * AudioContext must be assignable to the AudioContextLike seam with NO cast.
 * The DOM type is used type-only; no AudioContext is ever constructed under the
 * node test environment. If this stops compiling, the seam has drifted from
 * the DOM: fix the seam, never add a type assertion here.
 */
describe("A5: the DOM AudioContext satisfies AudioContextLike (type-level)", () => {
  it("a DOM AudioContext is returned through an AudioContextLike return type with no cast", () => {
    function toSeam(ctx: AudioContext): AudioContextLike {
      return ctx;
    }
    expect(toSeam).toBeTypeOf("function");
  });
});
