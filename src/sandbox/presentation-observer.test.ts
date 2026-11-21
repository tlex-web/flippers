import { describe, it, expect } from "vitest";

import { CueQueue, type CueKind, type FlashSink } from "../app/cue-queue";
import type { GameState } from "../game/game-session";
import {
  PresentationObserver,
  type ObserverPlunger,
  type ObserverSession,
} from "./presentation-observer";

/**
 * Unit proof for the presentation observer (plan 05-05, AUD-01): hand-rolled
 * mutable fakes for the session and plunger getters, a real CueQueue and a spy
 * FlashSink. Each case mutates the fakes between observe() calls, exactly as a
 * fixed step would, and reads back the cues that step pushed.
 */

const DRAIN = 600;

class FakeSession implements ObserverSession {
  state: GameState = "game-over";
  ball = 0;
  warning = false;
  getState(): GameState {
    return this.state;
  }
  getBall(): number {
    return this.ball;
  }
  isWarning(): boolean {
    return this.warning;
  }
}

class FakePlunger implements ObserverPlunger {
  releases = 0;
  lastCharge = 0;
  getReleaseCount(): number {
    return this.releases;
  }
  getLastReleaseCharge(): number {
    return this.lastCharge;
  }
}

class SpyFlash implements FlashSink {
  readonly records: { id: number; strength: number }[] = [];
  record(elementId: number, strength: number): void {
    this.records.push({ id: elementId, strength });
  }
}

interface Rig {
  session: FakeSession;
  plunger: FakePlunger;
  cues: CueQueue;
  flash: SpyFlash;
  observer: PresentationObserver;
}

function rig(state: GameState = "game-over", ball = 0): Rig {
  const session = new FakeSession();
  session.state = state;
  session.ball = ball;
  const plunger = new FakePlunger();
  const cues = new CueQueue();
  const flash = new SpyFlash();
  const observer = new PresentationObserver(cues, flash, session, plunger, DRAIN);
  return { session, plunger, cues, flash, observer };
}

/** Run one observe() and return the kinds it pushed (then clear the ring). */
function step(r: Rig): CueKind[] {
  r.cues.clear();
  r.observer.observe();
  const out: CueKind[] = [];
  for (let i = 0; i < r.cues.size; i++) {
    const c = r.cues.at(i);
    if (c) out.push(c.kind);
  }
  return out;
}

describe("PresentationObserver: game-event cues (05-05)", () => {
  it("construction then observe() with nothing changed pushes nothing", () => {
    const r = rig("playing", 2);
    r.session.warning = false;
    expect(step(r)).toEqual([]);
    expect(step(r)).toEqual([]);
    expect(r.flash.records).toEqual([]);
  });

  it("construction snapshots a non-zero release count, so the first observe pushes no launch", () => {
    const session = new FakeSession();
    const plunger = new FakePlunger();
    plunger.releases = 5;
    plunger.lastCharge = 0.4;
    const cues = new CueQueue();
    const observer = new PresentationObserver(cues, new SpyFlash(), session, plunger, DRAIN);
    observer.observe();
    expect(cues.size).toBe(0);
  });

  it("game-over/0 -> playing/1 pushes exactly start", () => {
    const r = rig("game-over", 0);
    r.session.state = "playing";
    r.session.ball = 1;
    expect(step(r)).toEqual(["start"]);
    const c = r.cues.at(0);
    expect(c?.elementId).toBe(-1);
    expect(c?.strength).toBe(1);
    expect(r.flash.records).toEqual([]);
  });

  it("a new game after game over (ball 3 -> 1) is a start, not a drain", () => {
    const r = rig("game-over", 3);
    r.session.state = "playing";
    r.session.ball = 1;
    expect(step(r)).toEqual(["start"]);
  });

  it("playing/1 -> playing/2 pushes drain on element 600 and flashes the drain apron", () => {
    const r = rig("playing", 1);
    r.session.ball = 2;
    expect(step(r)).toEqual(["drain"]);
    const c = r.cues.at(0);
    expect(c?.elementId).toBe(DRAIN);
    expect(c?.strength).toBe(1);
    expect(r.flash.records).toEqual([{ id: DRAIN, strength: 1 }]);
  });

  it("tilted/2 -> playing/3 pushes only drain", () => {
    const r = rig("tilted", 2);
    r.session.state = "playing";
    r.session.ball = 3;
    expect(step(r)).toEqual(["drain"]);
  });

  it("playing/3 -> game-over pushes drain then gameOver", () => {
    const r = rig("playing", 3);
    r.session.state = "game-over";
    expect(step(r)).toEqual(["drain", "gameOver"]);
    expect(r.flash.records).toEqual([{ id: DRAIN, strength: 1 }]);
  });

  it("tilted/3 -> game-over (a tilt on the last ball) pushes drain then gameOver", () => {
    const r = rig("tilted", 3);
    r.session.state = "game-over";
    expect(step(r)).toEqual(["drain", "gameOver"]);
  });

  it("playing -> tilted pushes tilt once; a second observe while still tilted pushes nothing", () => {
    const r = rig("playing", 1);
    r.session.state = "tilted";
    expect(step(r)).toEqual(["tilt"]);
    expect(step(r)).toEqual([]);
  });

  it("warning false -> true pushes warning; true -> true and true -> false push nothing", () => {
    const r = rig("playing", 1);
    r.session.warning = true;
    expect(step(r)).toEqual(["warning"]);
    expect(step(r)).toEqual([]);
    r.session.warning = false;
    expect(step(r)).toEqual([]);
  });

  it("a release-count increment with last charge 0.6 pushes launch at strength 0.6", () => {
    const r = rig("playing", 1);
    r.plunger.releases = 1;
    r.plunger.lastCharge = 0.6;
    expect(step(r)).toEqual(["launch"]);
    const c = r.cues.at(0);
    expect(c?.strength).toBeCloseTo(0.6, 12);
    expect(c?.elementId).toBe(-1);
    expect(step(r)).toEqual([]);
  });

  it("a sub-window tap (count up, last charge 0) pushes launch at strength 0", () => {
    const r = rig("playing", 1);
    r.plunger.releases = 1;
    r.plunger.lastCharge = 0;
    expect(step(r)).toEqual(["launch"]);
    expect(r.cues.at(0)?.strength).toBe(0);
  });

  it("game-over -> playing with a release in the same step pushes start then launch", () => {
    const r = rig("game-over", 0);
    r.session.state = "playing";
    r.session.ball = 1;
    r.plunger.releases = 1;
    r.plunger.lastCharge = 0.25;
    expect(step(r)).toEqual(["start", "launch"]);
  });
});
