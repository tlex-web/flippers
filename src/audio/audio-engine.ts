/**
 * Audio engine (Phase 5, AUD-01): turns the frame's cues into runtime-
 * synthesized one-shot voices. No audio files; every sound is oscillators,
 * a shared noise buffer, filters and gain envelopes.
 *
 * Lifecycle (research Pattern 5):
 * - no context exists until `unlock()` runs inside the player's first trusted
 *   gesture (`AudioUnlock`); a context created there starts running, one created
 *   at boot would start suspended;
 * - a later gesture while the context is not running calls `resume()`;
 * - a creation failure is reported once and never retried; a rejected
 *   `resume()` is reported and the game keeps running (T-05-04).
 *
 * Pull-then-play, the collision-router split: the step path only records cues
 * into the `CueQueue`; `flush()` runs once per render frame and is the only
 * place audio nodes are created. Without a running context `flush()` drops the
 * queued cues: a stale cue is never replayed after a resume.
 *
 * Every voice goes through the master chain (master gain, then a dynamics
 * compressor, then the destination), so no sound can bypass the limiter.
 * Envelopes are anchored with `setValueAtTime` and ramp exponentially between
 * strictly positive values (Pitfall 5); every source is started and stopped
 * once and its voice disconnects itself on `onended` (Pattern 6).
 *
 * This plan voices the bumper only, at its recipe peak and base pitch; the
 * other cue kinds are consumed without creating nodes. Velocity and pitch
 * variation and the other recipes arrive in plan 05-03.
 */

import type { Cue, CueQueue } from "../app/cue-queue";
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  GainNodeLike,
} from "./audio-context-like";

/** Master bus level before the compressor. */
export const MASTER_GAIN = 0.6;

/** Envelope floor: exponential ramps start and end here, never at 0. */
export const ENV_FLOOR = 1e-4;

/** Voices start this far after `currentTime` so their anchors are never late. */
export const SCHEDULE_AHEAD_S = 0.005;

/** Length of the shared mono white-noise buffer (s). */
export const NOISE_SECONDS = 1;

/** Master compressor settings (dB, ratio, seconds). Tuned by ear (A2). */
export const COMPRESSOR = {
  threshold: -12,
  knee: 6,
  ratio: 12,
  attack: 0.003,
  release: 0.15,
} as const;

/**
 * Bumper recipe (research recipe table, A2 starting values): a triangle sweep
 * plus a band-passed noise click, 2 ms attack and 140 ms decay.
 */
export const BUMPER_VOICE = {
  peak: 0.8,
  attack: 0.002,
  decay: 0.14,
  /** Tail after the envelope reaches the floor before the sources stop (s). */
  tail: 0.01,
  f0: 620,
  f1: 300,
  sweep: 0.06,
  noiseFreq: 2200,
  noiseQ: 1.2,
  noisePeak: 0.5,
  noiseAttack: 0.001,
  noiseLength: 0.025,
} as const;

/** Default error report: one line, keep the game running. */
function report(message: string, error: unknown): void {
  console.error(`[audio] ${message}`, error);
}

export class AudioEngine {
  private readonly createContext: () => AudioContextLike;
  private readonly rng: () => number;

  private ctx: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  private noise: AudioBufferLike | null = null;
  /** Set when creation threw; later gestures do not retry. */
  private failed = false;

  constructor(createContext: () => AudioContextLike, rng: () => number = Math.random) {
    this.createContext = createContext;
    this.rng = rng;
  }

  /** The live context, or null before the first successful unlock. */
  get context(): AudioContextLike | null {
    return this.ctx;
  }

  /**
   * Call from a trusted user gesture. Creates the context and master chain
   * once; afterwards resumes a context that is not running.
   */
  unlock(): void {
    if (this.ctx === null) {
      if (this.failed) return;
      try {
        const ctx = this.createContext();
        this.build(ctx);
        this.ctx = ctx;
      } catch (error) {
        this.failed = true;
        this.master = null;
        this.noise = null;
        report("could not create the AudioContext; the game stays silent", error);
        return;
      }
    }
    const ctx = this.ctx;
    if (ctx === null || ctx.state === "running") return;
    try {
      ctx.resume().catch((error: unknown) => report("resume() was rejected", error));
    } catch (error) {
      report("resume() threw", error);
    }
  }

  /** Build the master chain and the shared noise buffer on a new context. */
  private build(ctx: AudioContextLike): void {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(MASTER_GAIN, now);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(COMPRESSOR.threshold, now);
    comp.knee.setValueAtTime(COMPRESSOR.knee, now);
    comp.ratio.setValueAtTime(COMPRESSOR.ratio, now);
    comp.attack.setValueAtTime(COMPRESSOR.attack, now);
    comp.release.setValueAtTime(COMPRESSOR.release, now);
    master.connect(comp);
    comp.connect(ctx.destination);

    const length = Math.max(1, Math.round(NOISE_SECONDS * ctx.sampleRate));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = this.rng() * 2 - 1;

    this.master = master;
    this.noise = buffer;
  }

  /**
   * Play every queued cue in FIFO order, then empty the queue. Returns the
   * number of voices started. Without a running context it creates nothing,
   * empties the queue and returns 0. Call once per render frame.
   */
  flush(cues: CueQueue): number {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null || ctx.state !== "running") {
      cues.clear();
      return 0;
    }
    const t0 = ctx.currentTime + SCHEDULE_AHEAD_S;
    let started = 0;
    for (let i = 0; i < cues.size; i++) {
      const cue = cues.at(i);
      if (!cue) continue;
      try {
        if (this.play(ctx, master, cue, t0)) started++;
      } catch (error) {
        report("voice failed", error);
      }
    }
    cues.clear();
    return started;
  }

  /** Build one cue's voice. False when the kind has no voice yet. */
  private play(ctx: AudioContextLike, master: AudioNodeLike, cue: Cue, t0: number): boolean {
    switch (cue.kind) {
      case "bumper":
        this.playBumper(ctx, master, t0);
        return true;
      default:
        return false;
    }
  }

  /** Bumper: triangle 620 -> 300 Hz plus a 2.2 kHz noise click (A2 values). */
  private playBumper(ctx: AudioContextLike, master: AudioNodeLike, t0: number): void {
    const v = BUMPER_VOICE;
    const noise = this.noise;
    const end = t0 + v.attack + v.decay + v.tail;
    const nodes: AudioNodeLike[] = [];
    try {
      const env = ctx.createGain();
      nodes.push(env);
      env.gain.setValueAtTime(ENV_FLOOR, t0);
      env.gain.exponentialRampToValueAtTime(v.peak, t0 + v.attack);
      env.gain.exponentialRampToValueAtTime(ENV_FLOOR, t0 + v.attack + v.decay);
      env.connect(master);

      const osc = ctx.createOscillator();
      nodes.push(osc);
      osc.type = "triangle";
      osc.frequency.setValueAtTime(v.f0, t0);
      osc.frequency.exponentialRampToValueAtTime(v.f1, t0 + v.sweep);
      osc.connect(env);

      const noiseEnv = ctx.createGain();
      nodes.push(noiseEnv);
      noiseEnv.gain.setValueAtTime(ENV_FLOOR, t0);
      noiseEnv.gain.exponentialRampToValueAtTime(v.noisePeak, t0 + v.noiseAttack);
      noiseEnv.gain.exponentialRampToValueAtTime(ENV_FLOOR, t0 + v.noiseLength);
      noiseEnv.connect(env);

      const bp = ctx.createBiquadFilter();
      nodes.push(bp);
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(v.noiseFreq, t0);
      bp.Q.setValueAtTime(v.noiseQ, t0);
      bp.connect(noiseEnv);

      const src = ctx.createBufferSource();
      nodes.push(src);
      src.buffer = noise;
      src.connect(bp);

      // The first source's end tears down the whole voice.
      osc.onended = () => {
        for (let i = 0; i < nodes.length; i++) nodes[i]?.disconnect();
      };

      const room = Math.max(0, NOISE_SECONDS - (end - t0));
      osc.start(t0);
      src.start(t0, this.rng() * room);
      osc.stop(end);
      src.stop(end);
    } catch (error) {
      // Never leave a half-built voice attached to the master bus.
      for (let i = 0; i < nodes.length; i++) {
        try {
          nodes[i]?.disconnect();
        } catch {
          // already detached
        }
      }
      throw error;
    }
  }
}
