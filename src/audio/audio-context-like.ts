/**
 * Narrow structural Web Audio seam (Phase 5, AUD-01).
 *
 * The engine depends on these interfaces, never on the DOM `AudioContext`
 * directly, so it runs under Vitest's node environment against a hand-rolled
 * recorder (`src/audio/test/fake-audio-context.ts`). The real browser objects
 * satisfy every interface structurally: `main.ts` hands
 * `() => new AudioContext(...)` to a parameter typed `() => AudioContextLike`
 * with no cast, so `tsc --noEmit` is the compatibility proof (research A5).
 * If a DOM lib update breaks that, widen these types; never cast in production.
 *
 * Types only: no DOM globals are touched at module scope.
 */

/** A schedulable parameter (`AudioParam` satisfies it). */
export interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  /** The target must be strictly positive (the browser throws otherwise). */
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
  cancelAndHoldAtTime(time: number): unknown;
}

/** A graph node (`AudioNode` satisfies it). */
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}

/** A one-shot source: start once, stop once (`AudioScheduledSourceNode`). */
export interface ScheduledSourceLike extends AudioNodeLike {
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
  onended: ((ev: Event) => void) | null;
}

/** A sample buffer (`AudioBuffer` satisfies it). */
export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface OscillatorNodeLike extends ScheduledSourceLike {
  type: OscillatorType;
  readonly frequency: AudioParamLike;
  readonly detune: AudioParamLike;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterType;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
}

export interface BufferSourceNodeLike extends ScheduledSourceLike {
  buffer: AudioBufferLike | null;
  readonly playbackRate: AudioParamLike;
}

export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  readonly threshold: AudioParamLike;
  readonly knee: AudioParamLike;
  readonly ratio: AudioParamLike;
  readonly attack: AudioParamLike;
  readonly release: AudioParamLike;
}

/** The slice of `AudioContext` the engine uses. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  /** "suspended" | "running" | "closed", plus "interrupted" on Safari. */
  readonly state: string;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBufferSource(): BufferSourceNodeLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
  createDynamicsCompressor(): DynamicsCompressorNodeLike;
}
