/**
 * Audio engine (Phase 5, AUD-01): turns the frame's cues into runtime-
 * synthesized one-shot voices. No audio files; every sound is oscillators,
 * a shared noise buffer, filters and gain envelopes.
 *
 * Lifecycle (research Pattern 5):
 * - no context exists until `unlock()` runs inside the player's first trusted
 *   gesture (`AudioUnlock`); a context created there is allowed to start, but
 *   it reports "suspended" until the audio device is up (tens of ms on some
 *   engines), so `unlock()` calls `resume()`, and so does every later gesture
 *   while the context is not running;
 * - a creation failure is reported once and never retried; a rejected or
 *   throwing `resume()` is reported once per starting episode (below), and the
 *   game keeps running (T-05-04).
 *
 * Starting episodes (the one description of the starting window; 05-REVIEW
 * WR-01..WR-03). An episode runs from the moment the context exists and is
 * not running until the engine next observes `state === "running"` (in
 * `unlock()` or `flush()`). A context that later drops back to suspended (an
 * OS interruption) starts a fresh episode on the next gesture. An episode
 * opens at most two starting windows, each STARTING_WINDOW_MS of wall clock
 * (the injected `clock`) from the gesture that opens it:
 * - the episode's first gesture opens the first window;
 * - the first later gesture with transient user activation re-arms it,
 *   expired or not, unless the context is already rendering. Its `resume()`
 *   is the one that can start the device after a modifier-only first keydown,
 *   so the "start" figure it triggers gets a full window. The voices of an
 *   expired window are discarded first; a live window's are kept;
 * - nothing else opens a window: not a further gesture, and not a `resume()`
 *   settling or rejecting, which only clears the in-flight flag.
 * While a window is open and a resume is in flight, the suspended context is
 * playable: nodes scheduled at its frozen `currentTime` sound as soon as it
 * runs. A `resume()` can stay pending forever or reject on every call (no
 * output device, a gesture that is not activation, a device that fails to
 * start), and the two windows per episode are what bound node creation then.
 * A suspended context whose audio clock is already advancing, with a resume in
 * flight, counts as running with no time limit: it is rendering and `state`
 * only lags (IN-05). It is never re-armed, since that would discard audible
 * voices.
 *
 * Pull-then-play, the collision-router split: the step path only records cues
 * into the `CueQueue`; `flush()` runs once per render frame and is the only
 * place audio nodes are created. Without a playable context (running,
 * rendering, or starting as above), `flush()` drops the queued cues and
 * discards every voice still held (stopped and disconnected at once), so the
 * voices of an expired window never burst out on a late start. A stale cue
 * sounds less than two windows after it was recorded, or never.
 *
 * Every voice goes through the master chain (master gain, then a dynamics
 * compressor, then the destination), so no sound can bypass the limiter.
 * Envelopes are anchored with `setValueAtTime` and ramp exponentially between
 * strictly positive values (Pitfall 5); every source is started and stopped
 * once and its voice disconnects itself on `onended` (Pattern 6). A context
 * that is not rendering never fires `onended`, so there a voice is torn down
 * by the pool when it is stolen or discarded instead, and the audio graph
 * stays bounded by the pool's 16 voices.
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
import {
  envelopeEnd,
  envelopePoints,
  scheduleEnvelope,
  type EnvPoint,
  type EnvelopeSpec,
} from "./envelope";
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

/**
 * Length of one starting window (wall-clock ms from the gesture that opens or
 * re-arms it; see the starting-episode model in the file header). Normal
 * start-up takes tens of ms.
 */
export const STARTING_WINDOW_MS = 250;

/** Default wall clock for the starting window (ms). */
function wallClockMs(): number {
  return performance.now();
}

/**
 * Default activation probe: whether the page has transient user activation
 * now, i.e. whether a `resume()` issued from this gesture can start the
 * context. A modifier-only keydown (Shift) is not activation in Chromium, but
 * the non-modifier flipper keys (Z, /, the arrows) are, auto-repeat included,
 * and activation stays live for seconds after any such input. Engines without
 * `navigator.userActivation` count every gesture, so there a non-activating
 * key can spend the episode's second window early. That stays within the
 * two-window bound, so it is acceptable. The probe alone bounds nothing; the
 * episode model in the file header does.
 */
function hasTransientActivation(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Partial<Pick<Navigator, "userActivation">>;
  return nav.userActivation?.isActive ?? true;
}

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
  private readonly clock: () => number;
  private readonly isActivation: () => boolean;

  private ctx: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  private noise: AudioBufferLike | null = null;
  /** Set when creation threw; later gestures do not retry. */
  private failed = false;
  /**
   * A `resume()` is in flight: a suspended context may be about to run.
   * Settling or rejecting clears it and never touches `windowsOpened`.
   */
  private resumePending = false;
  /**
   * Starting windows opened in the current starting episode (the model in the
   * file header): 0 before its first gesture, 1 after it, 2 once an
   * activating gesture has re-armed the window, which spends the episode.
   * Reset to 0 only when `state === "running"` is observed.
   */
  private windowsOpened: 0 | 1 | 2 = 0;
  /**
   * Set once a rejected or throwing `resume()` has been reported in the
   * current episode; reset together with `windowsOpened`.
   */
  private rejectReported = false;
  /** Wall-clock deadline (ms, `clock`) of the current starting window. */
  private startingUntilMs = 0;
  /**
   * The audio clock (`currentTime`) when the starting window opened. Once it
   * has moved, the context is rendering even if `state` still reads
   * "suspended": the spec flips `state` in a task queued after rendering
   * starts (05-REVIEW IN-05).
   */
  private startAudioT = 0;
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

  /**
   * @param clock wall clock in ms bounding the starting window
   *   (`performance.now` by default; tests inject a fake one).
   * @param isActivation whether the current gesture carries transient user
   *   activation (`navigator.userActivation.isActive` by default; tests
   *   inject one). Only such a gesture re-arms the starting window (the
   *   episode model in the file header).
   */
  constructor(
    createContext: () => AudioContextLike,
    rng: () => number = Math.random,
    clock: () => number = wallClockMs,
    isActivation: () => boolean = hasTransientActivation,
  ) {
    this.createContext = createContext;
    this.rng = rng;
    this.clock = clock;
    this.isActivation = isActivation;
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
    if (ctx === null) return;
    if (ctx.state === "running") {
      this.endEpisode();
      return;
    }
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
      // The starting-episode model (file header): the episode's first gesture
      // opens a window, its first activating gesture re-arms it once unless
      // the context is already rendering, and nothing else opens one.
      const nowMs = this.clock();
      if (this.windowsOpened === 0) {
        this.windowsOpened = 1;
        this.openStartingWindow(ctx, nowMs);
      } else if (this.windowsOpened === 1 && !this.isRendering(ctx) && this.isActivation()) {
        this.windowsOpened = 2;
        // An expired window's voices must not ride into the new one; a live
        // window's may stay.
        if (nowMs >= this.startingUntilMs) this.pool.discardAll(ctx.currentTime);
        this.openStartingWindow(ctx, nowMs);
      }
      this.resumePending = true;
      ctx.resume().then(
        () => {
          this.resumePending = false;
        },
        (error: unknown) => {
          this.resumePending = false;
          this.reportResumeFailure("resume() was rejected", error);
        },
      );
    } catch (error) {
      this.resumePending = false;
      this.reportResumeFailure("resume() threw", error);
    }
  }

  /**
   * The engine observed `state === "running"`: the starting episode is over,
   * and a later drop back to suspended starts a fresh one.
   */
  private endEpisode(): void {
    this.windowsOpened = 0;
    this.rejectReported = false;
  }

  /** Report a failed `resume()` once per starting episode, not on every keydown. */
  private reportResumeFailure(message: string, error: unknown): void {
    if (this.rejectReported) return;
    this.rejectReported = true;
    report(message, error);
  }

  /** (Re)open the bounded starting window at wall-clock `nowMs`. */
  private openStartingWindow(ctx: AudioContextLike, nowMs: number): void {
    this.startingUntilMs = nowMs + STARTING_WINDOW_MS;
    this.startAudioT = ctx.currentTime;
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
   * context (running, rendering, or inside a starting window; see the file
   * header) it creates nothing, empties the queue and returns 0 (a cue is
   * never replayed later). A context that is not playable also has every
   * voice it still holds discarded: it cannot fire their `onended`, and they
   * must not burst out if it starts late. Observing a running context ends
   * the starting episode.
   * Call once per render frame.
   */
  flush(cues: CueQueue): number {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) {
      cues.clear();
      return 0;
    }
    if (ctx.state === "running") this.endEpisode();
    const rendering = this.isRendering(ctx);
    if (!rendering && !this.isStarting(ctx)) {
      this.pool.discardAll(ctx.currentTime);
      cues.clear();
      return 0;
    }
    if (this.muted) {
      cues.clear();
      return 0;
    }
    const t0 = ctx.currentTime + SCHEDULE_AHEAD_S;
    let started = 0;
    for (let i = 0; i < cues.size; i++) {
      const cue = cues.at(i);
      if (!cue) continue;
      try {
        if (this.play(ctx, master, cue, t0, rendering)) started++;
      } catch (error) {
        report("voice failed", error);
      }
    }
    cues.clear();
    return started;
  }

  /**
   * Running, or starting with its audio clock already advancing: `state`
   * lags real rendering, and treating such a context as not rendering would
   * tear down (steal) or discard voices that are audibly playing (IN-05).
   */
  private isRendering(ctx: AudioContextLike): boolean {
    if (ctx.state === "running") return true;
    return this.resumePending && ctx.state === "suspended" && ctx.currentTime > this.startAudioT;
  }

  /** Suspended with a resume in flight, inside the current starting window. */
  private isStarting(ctx: AudioContextLike): boolean {
    return this.resumePending && ctx.state === "suspended" && this.clock() < this.startingUntilMs;
  }

  /**
   * Build one cue's voice from its recipe. Returns true when it started.
   * `rendering` is false on a starting context whose audio clock has not
   * moved yet, where a stolen voice must be torn down by the pool because its
   * `onended` cannot fire.
   */
  private play(
    ctx: AudioContextLike,
    master: AudioNodeLike,
    cue: Cue,
    t0: number,
    rendering: boolean,
  ): boolean {
    const recipe = RECIPES[cue.kind];
    const s = cue.strength;
    const idSt = recipe.idSemitones?.[cue.elementId] ?? 0;
    const ratio = semitoneRatio(
      idSt + playbackSemitones(s, this.rng, recipe.maxSemitones, recipe.jitterCents),
    );
    const level = recipe.peak * (recipe.levelFromStrength ? strengthToGain(s) : 1);
    this.pool.admit(cue.kind, recipe.cap, t0, rendering);
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
      // Disconnect the whole voice; repeating it is harmless.
      const teardown = (): void => {
        for (let i = 0; i < nodes.length; i++) nodes[i]?.disconnect();
      };
      const handle: VoiceHandle = {
        kind: cue.kind,
        startedAt: t0,
        endsAt: lastStop,
        envs,
        sources,
        teardown,
      };
      this.pool.add(handle, rendering);
      // The latest-ending source tears down the whole voice; on a context
      // that is not rendering the pool does it on a steal or discard instead.
      last.onended = () => {
        this.pool.release(handle);
        teardown();
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
    // Built once: the handle stores the very points scheduled on the gain, so
    // a steal's live-level anchor cannot drift from the automation (IN-04).
    const points = envelopePoints(lt, envelope, peak);
    scheduleEnvelope(env.gain, points);
    const end = envelopeEnd(lt, envelope);
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
