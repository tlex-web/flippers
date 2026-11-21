import { describe, it, expect } from "vitest";

import {
  ENV_FLOOR,
  applyEnvelope,
  envelopeEnd,
  envelopePoints,
  type EnvelopeSpec,
} from "./envelope";
import { FakeParam } from "./test/fake-audio-context";

const ENV: EnvelopeSpec = { attack: 0.002, hold: 0, decay: 0.14 };
const HELD: EnvelopeSpec = { attack: 0.005, hold: 0.5, decay: 0.15 };

describe("envelopePoints (click-free one-shot envelope, Pitfall 5)", () => {
  it("starts with a set at ENV_FLOOR at t0", () => {
    const p = envelopePoints(1.5, ENV, 0.8);
    expect(p[0]).toEqual({ kind: "set", value: ENV_FLOOR, time: 1.5 });
  });

  it("keeps every exponential target positive for peak 0, a negative peak and NaN", () => {
    for (const peak of [0, -0.5, Number.NaN, 0.8, 7]) {
      const p = envelopePoints(0, HELD, peak);
      expect(p.length).toBeGreaterThan(1);
      for (const e of p) {
        if (e.kind === "exp") {
          expect(e.value).toBeGreaterThan(0);
          expect(e.value).toBeGreaterThanOrEqual(ENV_FLOOR);
          expect(e.value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("has strictly increasing point times", () => {
    for (const env of [ENV, HELD, { attack: 0, hold: 0, decay: 0.05 }]) {
      const p = envelopePoints(2, env, 0.5);
      expect(p.length).toBeGreaterThan(1);
      for (let i = 1; i < p.length; i++) {
        expect((p[i]?.time ?? -1) > (p[i - 1]?.time ?? Infinity)).toBe(true);
      }
    }
  });

  it("ends with an exp to ENV_FLOOR at envelopeEnd = t0 + attack + hold + decay", () => {
    expect(envelopeEnd(1, ENV)).toBeCloseTo(1 + 0.002 + 0 + 0.14, 12);
    expect(envelopeEnd(1, HELD)).toBeCloseTo(1 + 0.005 + 0.5 + 0.15, 12);
    for (const env of [ENV, HELD]) {
      const p = envelopePoints(1, env, 0.6);
      const last = p[p.length - 1];
      expect(last?.kind).toBe("exp");
      expect(last?.value).toBe(ENV_FLOOR);
      expect(last?.time).toBeCloseTo(envelopeEnd(1, env), 12);
    }
  });

  it("a hold inserts a set at the peak at t0 + attack + hold", () => {
    const p = envelopePoints(0, HELD, 0.4);
    expect(p).toContainEqual({ kind: "set", value: 0.4, time: 0.005 + 0.5 });
    const noHold = envelopePoints(0, ENV, 0.4);
    expect(noHold.filter((e) => e.kind === "set").length).toBe(1);
  });

  it("raises an attack below 1 ms to 1 ms", () => {
    const p = envelopePoints(0, { attack: 0, hold: 0, decay: 0.05 }, 0.5);
    expect(p[1]).toEqual({ kind: "exp", value: 0.5, time: 0.001 });
    expect(envelopeEnd(0, { attack: 0.0002, hold: 0, decay: 0.05 })).toBeCloseTo(0.051, 12);
  });
});

describe("applyEnvelope", () => {
  it("cancels at t0 first, then records exactly the envelope points, and returns the end", () => {
    const param = new FakeParam("gain");
    const end = applyEnvelope(param, 0.25, HELD, 0.7);
    expect(end).toBeCloseTo(envelopeEnd(0.25, HELD), 12);
    expect(param.events[0]).toEqual({ type: "cancel", value: Number.NaN, time: 0.25 });
    const expected = envelopePoints(0.25, HELD, 0.7).map((e) => ({
      type: e.kind,
      value: e.value,
      time: e.time,
    }));
    expect(param.events.slice(1)).toEqual(expected);
  });
});
