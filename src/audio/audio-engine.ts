/**
 * Audio engine (Phase 5, AUD-01): turns the frame's cues into runtime-
 * synthesized one-shot voices. No audio files; every sound is oscillators,
 * a shared noise buffer, filters and gain envelopes.
 *
 * Lifecycle (research Pattern 5):
 * - no context exists until `unlock()` runs inside the player's first trusted
 *   gesture (`AudioUnlock`); a context created there is allowed to start, but
 *   it reports "suspended" until the audio device is up (tens of ms on some
 *   engines), so `unlock()` calls `resume()` and the context counts as starting
 *   until that settles;
 * - a later gesture while the context is not running calls `resume()`;
 * - a creation failure is reported once and never retried; a rejected
 *   `resume()` is reported and the game keeps running (T-05-04).
 *
 * Pull-then-play, the collision-router split: the step path only records cues
 * into the `CueQueue`; `flush()` runs once per render frame and is the only
 * place audio nodes are created. A starting context (suspended with a resume in
 * flight) is playable: nodes scheduled on it at the frozen `currentTime` sound
 * as soon as it runs, so the first "start" figure is not lost. Otherwise,
 * without a running context, `flush()` drops the queued cues: a stale cue is
 * never replayed after a resume.
 *
 * Every voice goes through the master chain (master gain, then a dynamics
 * compressor, then the destination), so no sound can bypass the limiter.
 * Envelopes are anchored with `setValueAtTime` and ramp exponentially between
 * strictly positive values (Pitfall 5); every source is started and stopped
 * once and its voice disconnects itself on `onended` (Pattern 6).
 *
 * Voices are data: `flush()` looks up `RECIPES[cue.kind]` and builds one
 * source (plus an optional filter and its own envelope gain) per layer. The
 * level follows the hit through `strengthToGain` and the pitch through
 * `semitoneRatio(idSemitones + playbackSemitones(...))`, with the jitter drawn
 * from the constructor's `rng` (never a sim stream). Every source stops at its
 * own layer end and the latest-ending one tears the whole voice down.
 *
 * Every voice is admitted through a `VoicePool` first (16 voices, per-kind
 * recipe caps, oldest stolen with a 5 ms fade anchored at the voice's live
 * level), so bumper spam cannot flood the mix. `setMuted` / `toggleMute` ramp
 * the master gain from its live level (D-02); while muted
 * `flush()` drops cues, so nothing bursts out on unmute.
 */

import type { Cue, CueKind, CueQueue } from "../app/cue-queue";
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  GainNodeLike,
  ScheduledSourceLike,
} from "./audio-context-like";
import { applyEnvelope, envelopePoints, type EnvPoint, type EnvelopeSpec } from "./envelope";
import { dbToGain, playbackSemitones, semitoneRatio, strengthToGain } from "./mapping";
import { RECIPES, type LayerSpec } from "./recipes";
import { VoicePool, type VoiceHandle } from "./voice-pool";

export { ENV_FLOOR } from "./envelope";

/** Master bus level before the compressor. */
export const MASTER_GAIN = 0.6;

/** Voices start this far after `currentTime` so their anchors are never late. */
export const SCHEDULE_AHEAD_S = 0.005;

/** Master gain ramp for mute and unmute (s, D-02). Linear, so 0 is a legal target. */
export const MUTE_RAMP_S = 0.05;

/** A source keeps running this long after its envelope reaches the floor (s). */
export const SOURCE_TAIL_S = 0.01;

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

/** Default error report: one line, keep the game running. */
function report(message: string, error: unknown): void {
  console.error(`[audio] ${message}`, error);
}

/** Release a context that will not be used; a failure to close is ignored. */
function closeQuietly(ctx: AudioContextLike): void {
  try {
    ctx.close?.().catch(() => {});
  } catch {
    // nothing more can be done
  }
}

export class AudioEngine {
  private readonly createContext: () => AudioContextLike;
  private readonly rng: () => number;

  private ctx: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  private noise: AudioBufferLike | null = null;
  /** Set when creation threw; later gestures do not retry. */
  private failed = false;
  /** A `resume()` is in flight: a suspended context is about to run. */
  private resumePending = false;
  /** Set once a closed context has been reported; later gestures stay quiet. */
  private closedReported = false;
  private muted = false;
  /**
   * The master gain's latest linear segment (audio clock), tracked so a mute
   * toggle can anchor its ramp at the live level: a ramp starts at the
   * previous automation event, never at "now" (WR-01).
   */
  private masterFromT = 0;
  private masterFromV = 0;
  private masterToT = 0;
  private masterToV = 0;
  private readonly pool = new VoicePool();

  constructor(createContext: () => AudioContextLike, rng: () => number = Math.random) {
    this.createContext = createContext;
    this.rng = rng;
  }

  /**
   * Mute or unmute the master bus (D-02): a linear ramp to 0, or back to
   * MASTER_GAIN, over MUTE_RAMP_S from now. Before unlock it only sets the
   * flag, and the master is then built at 0. While muted, `flush()` drops cues.
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const now = ctx.currentTime;
    const level = this.masterLevelAt(now);
    const target = muted ? 0 : MASTER_GAIN;
    // `now` is the context's current time, so cancelling from it drops only
    // automation that has not rendered yet; the set anchors the ramp at the
    // level actually sounding, so the fade really lasts MUTE_RAMP_S.
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(level, now);
    master.gain.linearRampToValueAtTime(target, now + MUTE_RAMP_S);
    this.masterFromT = now;
    this.masterFromV = level;
    this.masterToT = now + MUTE_RAMP_S;
    this.masterToV = target;
  }

  /** The master gain's level at audio time `t`, from the tracked segment. */
  private masterLevelAt(t: number): number {
    if (t >= this.masterToT) return this.masterToV;
    if (t <= this.masterFromT) return this.masterFromV;
    const u = (t - this.masterFromT) / (this.masterToT - this.masterFromT);
    return this.masterFromV + (this.masterToV - this.masterFromV) * u;
  }

  /** Flip the mute flag; returns the new state (true = muted). */
  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Voices the pool still counts as sounding, of one kind or in total. */
  activeVoices(kind?: CueKind): number {
    return this.pool.activeCount(kind);
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
      let created: AudioContextLike | null = null;
      try {
        created = this.createContext();
        this.build(created);
        this.ctx = created;
      } catch (error) {
        this.failed = true;
        this.master = null;
        this.noise = null;
        // A context that was created but could not be built still holds an
        // audio device and counts against the browser's context limit.
        if (created !== null) closeQuietly(created);
        report("could not create the AudioContext; the game stays silent", error);
        return;
      }
    }
    const ctx = this.ctx;
    if (ctx === null || ctx.state === "running") return;
    if (ctx.state === "closed") {
      // resume() always rejects on a closed context: report it once instead
      // of logging on every later gesture (each flipper keydown).
      if (!this.closedReported) {
        this.closedReported = true;
        report("the AudioContext is closed; the game stays silent", ctx.state);
      }
      return;
    }
    try {
      this.resumePending = true;
      ctx.resume().then(
        () => {
          this.resumePending = false;
        },
        (error: unknown) => {
          this.resumePending = false;
          report("resume() was rejected", error);
        },
      );
    } catch (error) {
      this.resumePending = false;
      report("resume() threw", error);
    }
  }

  /** Build the master chain and the shared noise buffer on a new context. */
  private build(ctx: AudioContextLike): void {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    const level = this.muted ? 0 : MASTER_GAIN;
    master.gain.setValueAtTime(level, now);
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
    this.masterFromT = now;
    this.masterToT = now;
    this.masterFromV = level;
    this.masterToV = level;
  }

  /**
   * Play every queued cue in FIFO order, all at the same t0, then empty the
   * queue. Returns the number of voices started. Muted or without a playable
   * context (running, or suspended with a resume in flight) it creates
   * nothing, empties the queue and returns 0 (a cue is never replayed later).
   * Call once per render frame.
   */
  flush(cues: CueQueue): number {
    const ctx = this.ctx;
    const master = this.master;
    const playable =
      ctx !== null &&
      (ctx.state === "running" || (this.resumePending && ctx.state === "suspended"));
    if (this.muted || ctx === null || master === null || !playable) {
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

  /** Build one cue's voice from its recipe. Returns true when it started. */
  private play(ctx: AudioContextLike, master: AudioNodeLike, cue: Cue, t0: number): boolean {
    const recipe = RECIPES[cue.kind];
    const s = cue.strength;
    const idSt = recipe.idSemitones?.[cue.elementId] ?? 0;
    const ratio = semitoneRatio(
      idSt + playbackSemitones(s, this.rng, recipe.maxSemitones, recipe.jitterCents),
    );
    const level = recipe.peak * (recipe.levelFromStrength ? strengthToGain(s) : 1);
    this.pool.admit(cue.kind, recipe.cap, t0);
    const nodes: AudioNodeLike[] = [];
    const envs: { gain: GainNodeLike["gain"]; points: readonly EnvPoint[] }[] = [];
    const sources: ScheduledSourceLike[] = [];
    try {
      let last: ScheduledSourceLike | null = null;
      let lastStop = -Infinity;
      for (let i = 0; i < recipe.layers.length; i++) {
        const layer = recipe.layers[i];
        if (!layer) continue;
        const built = this.buildLayer(ctx, master, layer, s, ratio, level, t0, nodes);
        envs.push({ gain: built.env.gain, points: built.points });
        sources.push(built.source);
        if (built.stop > lastStop) {
          lastStop = built.stop;
          last = built.source;
        }
      }
      if (last === null) return false;
      const handle: VoiceHandle = {
        kind: cue.kind,
        startedAt: t0,
        endsAt: lastStop,
        envs,
        sources,
      };
      this.pool.add(handle);
      // The latest-ending source tears down the whole voice.
      last.onended = () => {
        this.pool.release(handle);
        for (let i = 0; i < nodes.length; i++) nodes[i]?.disconnect();
      };
      return true;
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

  /**
   * One layer: envelope gain into master, optional filter, then the source,
   * started at t0 + offset and stopped just after its envelope reaches the
   * floor. Every node created is pushed onto `nodes`.
   */
  private buildLayer(
    ctx: AudioContextLike,
    master: AudioNodeLike,
    layer: LayerSpec,
    strength: number,
    ratio: number,
    level: number,
    t0: number,
    nodes: AudioNodeLike[],
  ): {
    env: GainNodeLike;
    points: readonly EnvPoint[];
    source: ScheduledSourceLike;
    stop: number;
  } {
    const lt = t0 + layer.offset;
    const envelope: EnvelopeSpec =
      layer.decayPerStrength === undefined
        ? layer.envelope
        : { ...layer.envelope, decay: layer.envelope.decay + layer.decayPerStrength * strength };

    const env = ctx.createGain();
    nodes.push(env);
    const peak = level * dbToGain(layer.gainDb);
    const end = applyEnvelope(env.gain, lt, envelope, peak);
    const points = envelopePoints(lt, envelope, peak);
    env.connect(master);
    const stop = end + SOURCE_TAIL_S;

    let input: AudioNodeLike = env;
    const f = layer.filter;
    if (f) {
      const bq = ctx.createBiquadFilter();
      nodes.push(bq);
      bq.type = f.type;
      bq.frequency.setValueAtTime(f.f0, lt);
      if (f.f1 !== undefined) {
        bq.frequency.exponentialRampToValueAtTime(f.f1 + (f.f1PerStrength ?? 0) * strength, end);
      }
      bq.Q.setValueAtTime(f.q, lt);
      bq.connect(env);
      input = bq;
    }

    if (layer.source === "noise") {
      const src = ctx.createBufferSource();
      nodes.push(src);
      src.buffer = this.noise;
      src.connect(input);
      const room = Math.max(0, NOISE_SECONDS - (stop - lt));
      src.start(lt, this.rng() * room);
      src.stop(stop);
      return { env, points, source: src, stop };
    }

    const osc = ctx.createOscillator();
    nodes.push(osc);
    osc.type = layer.wave ?? "sine";
    osc.frequency.setValueAtTime(layer.f0 * ratio, lt);
    if (layer.sweep > 0 && layer.f1 !== layer.f0) {
      osc.frequency.exponentialRampToValueAtTime(layer.f1 * ratio, lt + layer.sweep);
    }
    osc.connect(input);
    osc.start(lt);
    osc.stop(stop);
    return { env, points, source: osc, stop };
  }
}
