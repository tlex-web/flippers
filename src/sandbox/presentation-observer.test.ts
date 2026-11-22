import { describe, it, expect } from "vitest";

import { CueQueue, type CueKind, type FlashSink } from "../app/cue-queue";
import { BonusCounters, BonusTally } from "../game/bonus";
import { SKILL_SHOT_MAX_POINTS } from "../game/tuning";
import type { GameState } from "../game/game-session";
import {
  PresentationObserver,
  type ObserverFlippers,
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
  skillShots = 0;
  lastSkillValue = 0;
  lastSkillLane = -1;
  drains = 0;
  elapsed = 0;
  readonly tally = new BonusTally();
  getState(): GameState {
    return this.state;
  }
  getBall(): number {
    return this.ball;
  }
  isWarning(): boolean {
    return this.warning;
  }
  getSkillShotCount(): number {
    return this.skillShots;
  }
  getLastSkillValue(): number {
    return this.lastSkillValue;
  }
  getLastSkillLane(): number {
    return this.lastSkillLane;
  }
  getDrainCount(): number {
    return this.drains;
  }
  getBonusTally(): Readonly<BonusTally> {
    return this.tally;
  }
  getBonusElapsed(): number {
    return this.elapsed;
  }
  /**
   * Drain the ball as the session does: the drain counter rises and the state
   * enters "bonus" at elapsed 0 with a tally of these counters (a forfeit when
   * `forfeit`); the ball number is unchanged.
   */
  drain(rollovers = 0, inlanes = 0, banks = 0, forfeit = false): void {
    const c = new BonusCounters();
    c.rollovers = rollovers;
    c.inlanes = inlanes;
    c.banks = banks;
    this.tally.snapshot(c);
    if (forfeit) this.tally.markForfeit();
    this.drains++;
    this.state = "bonus";
    this.elapsed = 0;
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

class FakeFlippers implements ObserverFlippers {
  readonly on: number[] = [0, 0];
  readonly off: number[] = [0, 0];
  getCoilOnCount(id: number): number {
    return this.on[id] ?? 0;
  }
  getCoilOffCount(id: number): number {
    return this.off[id] ?? 0;
  }
}

/** Flipper ids the observer watches (left 0, right 1). */
const FLIPPER_IDS: readonly number[] = [0, 1];

class SpyFlash implements FlashSink {
  readonly records: { id: number; strength: number }[] = [];
  record(elementId: number, strength: number): void {
    this.records.push({ id: elementId, strength });
  }
}

interface Rig {
  session: FakeSession;
  plunger: FakePlunger;
  flippers: FakeFlippers;
  cues: CueQueue;
  flash: SpyFlash;
  observer: PresentationObserver;
}

function rig(state: GameState = "game-over", ball = 0): Rig {
  const session = new FakeSession();
  session.state = state;
  session.ball = ball;
  const plunger = new FakePlunger();
  const flippers = new FakeFlippers();
  const cues = new CueQueue();
  const flash = new SpyFlash();
  const observer = new PresentationObserver(
    cues,
    flash,
    session,
    plunger,
    DRAIN,
    flippers,
    FLIPPER_IDS,
  );
  return { session, plunger, flippers, cues, flash, observer };
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
    const observer = new PresentationObserver(
      cues,
      new SpyFlash(),
      session,
      plunger,
      DRAIN,
      new FakeFlippers(),
      FLIPPER_IDS,
    );
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

  it("a drain-count increment (ball unchanged, bonus) pushes drain on element 600 and flashes the drain apron", () => {
    const r = rig("playing", 1);
    r.session.drain();
    expect(r.session.ball).toBe(1);
    expect(step(r)).toEqual(["drain"]);
    const c = r.cues.at(0);
    expect(c?.elementId).toBe(DRAIN);
    expect(c?.strength).toBe(1);
    expect(r.flash.records).toEqual([{ id: DRAIN, strength: 1 }]);
  });

  it("the later serve (ball increment after the tally) pushes no second drain", () => {
    const r = rig("playing", 1);
    r.session.drain();
    step(r);
    r.session.elapsed = 60;
    step(r);
    r.session.state = "playing";
    r.session.ball = 2;
    r.session.elapsed = 0;
    expect(step(r)).toEqual([]);
    expect(r.flash.records).toEqual([{ id: DRAIN, strength: 1 }]);
  });

  it("a ball increment with no drain-count increment pushes nothing (the drain is never inferred)", () => {
    const r = rig("playing", 1);
    r.session.ball = 2;
    expect(step(r)).toEqual([]);
    expect(r.flash.records).toEqual([]);
  });

  it("a tilted drain (forfeit tally) pushes only drain", () => {
    const r = rig("tilted", 2);
    r.session.drain(3, 1, 1, true);
    expect(step(r)).toEqual(["drain"]);
  });

  it("drain on the last ball, then bonus -> game-over pushes gameOver only (its drain was already pushed)", () => {
    const r = rig("playing", 3);
    r.session.drain();
    expect(step(r)).toEqual(["drain"]);
    r.session.elapsed = 60;
    expect(step(r)).toEqual([]);
    r.session.state = "game-over";
    r.session.elapsed = 0;
    expect(step(r)).toEqual(["gameOver"]);
    expect(r.flash.records).toEqual([{ id: DRAIN, strength: 1 }]);
  });

  it("a tilt on the last ball: forfeit drain, then game-over pushes drain, then gameOver", () => {
    const r = rig("tilted", 3);
    r.session.drain(0, 0, 0, true);
    expect(step(r)).toEqual(["drain"]);
    r.session.state = "game-over";
    expect(step(r)).toEqual(["gameOver"]);
  });

  it("construction snapshots a non-zero drain count, so the first observe pushes no drain", () => {
    const session = new FakeSession();
    session.state = "playing";
    session.ball = 2;
    session.drains = 4;
    const cues = new CueQueue();
    const observer = new PresentationObserver(
      cues,
      new SpyFlash(),
      session,
      new FakePlunger(),
      DRAIN,
      new FakeFlippers(),
      FLIPPER_IDS,
    );
    observer.observe();
    expect(cues.size).toBe(0);
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

/** Kinds and element ids of one step, as one flat string ("kind@id,..."). */
function stepTagged(r: Rig): string {
  r.cues.clear();
  r.observer.observe();
  const out: string[] = [];
  for (let i = 0; i < r.cues.size; i++) {
    const c = r.cues.at(i);
    if (c) out.push(`${c.kind}@${String(c.elementId)}`);
  }
  return out.join(",");
}

describe("PresentationObserver: flipper coil cues (05-05 Task 2)", () => {
  it("an on-count increment for flipper 0 pushes flipperUp on element 0", () => {
    const r = rig("playing", 1);
    r.flippers.on[0] = 1;
    expect(stepTagged(r)).toBe("flipperUp@0");
    expect(stepTagged(r)).toBe("");
  });

  it("an off-count increment for flipper 1 pushes flipperDown on element 1", () => {
    const r = rig("playing", 1);
    r.flippers.off[1] = 1;
    expect(stepTagged(r)).toBe("flipperDown@1");
  });

  it("a same-step tap (both counts up by 1) pushes flipperUp then flipperDown", () => {
    const r = rig("playing", 1);
    r.flippers.on[0] = 1;
    r.flippers.off[0] = 1;
    expect(stepTagged(r)).toBe("flipperUp@0,flipperDown@0");
  });

  it("a tilt that drops both bats pushes flipperDown, flipperDown, tilt in that order", () => {
    const r = rig("playing", 1);
    r.session.state = "tilted";
    r.flippers.off[0] = 1;
    r.flippers.off[1] = 1;
    expect(stepTagged(r)).toBe("flipperDown@0,flipperDown@1,tilt@-1");
  });

  it("flipper cues sit after start and before launch", () => {
    const r = rig("game-over", 0);
    r.session.state = "playing";
    r.session.ball = 1;
    r.flippers.on[1] = 1;
    r.flippers.off[0] = 1;
    r.plunger.releases = 1;
    r.plunger.lastCharge = 0.5;
    expect(stepTagged(r)).toBe("start@-1,flipperUp@1,flipperDown@0,launch@-1");
  });

  it("construction snapshots the coil counts, so the first observe pushes nothing", () => {
    const session = new FakeSession();
    const flippers = new FakeFlippers();
    flippers.on[0] = 3;
    flippers.off[0] = 2;
    flippers.on[1] = 7;
    flippers.off[1] = 7;
    const cues = new CueQueue();
    const observer = new PresentationObserver(
      cues,
      new SpyFlash(),
      session,
      new FakePlunger(),
      DRAIN,
      flippers,
      FLIPPER_IDS,
    );
    observer.observe();
    expect(cues.size).toBe(0);
  });
});

describe("PresentationObserver: skill-shot sting (06-04, D-25)", () => {
  it("a playing step with no skill-shot increment pushes nothing", () => {
    const r = rig("playing", 1);
    r.session.lastSkillValue = 5000;
    r.session.lastSkillLane = 401;
    expect(step(r)).toEqual([]);
  });

  it("an increment with value 5000 on lane 401 pushes one skillShot on 401 at strength 0.2", () => {
    const r = rig("playing", 1);
    r.session.skillShots = 1;
    r.session.lastSkillValue = 5000;
    r.session.lastSkillLane = 401;
    r.cues.clear();
    r.observer.observe();
    expect(r.cues.size).toBe(1);
    const c = r.cues.at(0);
    expect(c?.kind).toBe("skillShot");
    expect(c?.elementId).toBe(401);
    expect(c?.strength).toBeCloseTo(0.2, 12);
    expect(SKILL_SHOT_MAX_POINTS).toBe(25000);
    expect(step(r)).toEqual([]);
  });

  it("a warning edge, a skill increment and a drain in one step push warning, skillShot, drain", () => {
    const r = rig("playing", 1);
    r.session.warning = true;
    r.session.skillShots = 1;
    r.session.lastSkillValue = 10000;
    r.session.lastSkillLane = 400;
    r.session.drains = 1;
    expect(step(r)).toEqual(["warning", "skillShot", "drain"]);
  });

  it("construction with count 3 pushes nothing on the first observe", () => {
    const session = new FakeSession();
    session.state = "playing";
    session.ball = 2;
    session.skillShots = 3;
    session.lastSkillValue = 15000;
    session.lastSkillLane = 402;
    const cues = new CueQueue();
    const observer = new PresentationObserver(
      cues,
      new SpyFlash(),
      session,
      new FakePlunger(),
      DRAIN,
      new FakeFlippers(),
      FLIPPER_IDS,
    );
    observer.observe();
    expect(cues.size).toBe(0);
  });

  it("a new game resetting the count to 0 pushes no skillShot", () => {
    const r = rig("game-over", 3);
    r.session.skillShots = 2;
    r.cues.clear();
    r.observer.observe();
    r.session.state = "playing";
    r.session.ball = 1;
    r.session.skillShots = 0;
    expect(step(r)).toEqual(["start"]);
  });
});

describe("PresentationObserver: bonus row ticks (06-06, D-25)", () => {
  it("a 3-row tally pushes one bonusTick on the drain step after the drain cue, then one at 48 and one at 96", () => {
    const r = rig("playing", 1);
    r.session.drain(3, 2, 1);
    expect(stepTagged(r)).toBe(`drain@${String(DRAIN)},bonusTick@-1`);
    expect(r.cues.size).toBe(2);
    expect(r.cues.at(1)?.strength).toBe(1);
    const ticks: number[] = [];
    for (let e = 1; e <= 264; e++) {
      r.session.elapsed = e;
      const kinds = step(r);
      if (kinds.length > 0) {
        expect(kinds).toEqual(["bonusTick"]);
        ticks.push(e);
      }
    }
    // TOTAL (elapsed 144) and every counted step in between push nothing.
    expect(ticks).toEqual([48, 96]);
  });

  it("an all-zero tally pushes no bonusTick", () => {
    const r = rig("playing", 1);
    r.session.drain(0, 0, 0);
    expect(step(r)).toEqual(["drain"]);
    for (let e = 1; e <= 60; e++) {
      r.session.elapsed = e;
      expect(step(r)).toEqual([]);
    }
  });

  it("a forfeit pushes no bonusTick", () => {
    const r = rig("tilted", 1);
    r.session.drain(3, 2, 1, true);
    expect(step(r)).toEqual(["drain"]);
    for (let e = 1; e <= 200; e++) {
      r.session.elapsed = e;
      expect(step(r)).toEqual([]);
    }
  });

  it("a skipped tally pushes no further tick, and the next ball's tally ticks again from row 0", () => {
    const r = rig("playing", 1);
    r.session.drain(3, 0, 1);
    expect(step(r)).toEqual(["drain", "bonusTick"]);
    r.session.elapsed = 10;
    expect(step(r)).toEqual([]);
    // A flipper press skips: the next ball is served.
    r.session.state = "playing";
    r.session.ball = 2;
    r.session.elapsed = 0;
    expect(step(r)).toEqual([]);
    r.session.drain(1, 0, 0);
    expect(step(r)).toEqual(["drain", "bonusTick"]);
  });

  it("construction mid-tally snapshots the revealed rows, so the first observe pushes nothing", () => {
    const session = new FakeSession();
    session.drain(3, 2, 1);
    session.elapsed = 50;
    const cues = new CueQueue();
    const observer = new PresentationObserver(
      cues,
      new SpyFlash(),
      session,
      new FakePlunger(),
      DRAIN,
      new FakeFlippers(),
      FLIPPER_IDS,
    );
    observer.observe();
    expect(cues.size).toBe(0);
    session.elapsed = 96;
    observer.observe();
    expect(cues.size).toBe(1);
    expect(cues.at(0)?.kind).toBe("bonusTick");
  });
});
