/**
 * Test-only Web Audio recorder (Phase 5, AUD-01 Wave 0).
 *
 * `FakeAudioContext` implements the narrow `AudioContextLike` seam and records
 * everything the engine does: every node created, its outgoing connections and
 * whether it was disconnected, every parameter automation event, and every
 * source's start/stop times. It mirrors the two browser rules the engine must
 * respect: an exponential ramp to a value <= 0 throws a RangeError (Pitfall 5),
 * and a source started twice throws (one start per node).
 *
 * `currentTime` and `state` are plain settable fields, so tests drive the
 * audio clock and the suspended/running lifecycle directly. Test code only;
 * never imported by production modules.
 */

import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  BufferSourceNodeLike,
  DynamicsCompressorNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
} from "../audio-context-like";

export type FakeNodeKind =
  "destination" | "gain" | "oscillator" | "biquad" | "bufferSource" | "compressor";

export type ParamEventType = "set" | "linear" | "exp" | "cancel" | "cancelAndHold";

export interface ParamEvent {
  readonly type: ParamEventType;
  /** NaN for the cancel events. */
  readonly value: number;
  readonly time: number;
}

/** Records every automation call on one parameter. */
export class FakeParam implements AudioParamLike {
  readonly events: ParamEvent[] = [];
  constructor(readonly name: string) {}
  setValueAtTime(value: number, time: number): this {
    this.events.push({ type: "set", value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ type: "linear", value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    if (!(value > 0)) {
      throw new RangeError(`exponentialRampToValueAtTime target must be positive, got ${value}`);
    }
    this.events.push({ type: "exp", value, time });
    return this;
  }
  cancelScheduledValues(time: number): this {
    this.events.push({ type: "cancel", value: Number.NaN, time });
    return this;
  }
  cancelAndHoldAtTime(time: number): this {
    this.events.push({ type: "cancelAndHold", value: Number.NaN, time });
    return this;
  }
}

/** A recorded node: its kind, outgoing edges and whether it was disconnected. */
export class FakeNode implements AudioNodeLike {
  readonly connections: FakeNode[] = [];
  disconnected = false;
  constructor(readonly kind: FakeNodeKind) {}
  connect(destination: AudioNodeLike): AudioNodeLike {
    if (!(destination instanceof FakeNode)) {
      throw new TypeError("FakeNode can only connect to another FakeNode");
    }
    this.connections.push(destination);
    return destination;
  }
  disconnect(): void {
    this.disconnected = true;
    this.connections.length = 0;
  }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam("gain");
  constructor() {
    super("gain");
  }
}

export class FakeBiquad extends FakeNode implements BiquadFilterNodeLike {
  type: BiquadFilterType = "lowpass";
  readonly frequency = new FakeParam("frequency");
  readonly Q = new FakeParam("Q");
  constructor() {
    super("biquad");
  }
}

export class FakeCompressor extends FakeNode implements DynamicsCompressorNodeLike {
  readonly threshold = new FakeParam("threshold");
  readonly knee = new FakeParam("knee");
  readonly ratio = new FakeParam("ratio");
  readonly attack = new FakeParam("attack");
  readonly release = new FakeParam("release");
  constructor() {
    super("compressor");
  }
}

/** Shared start/stop recording for the two source kinds. */
export class FakeSource extends FakeNode {
  startTime: number | null = null;
  startOffset: number | null = null;
  stopTime: number | null = null;
  onended: ((ev: Event) => void) | null = null;
  start(when = 0, offset = 0): void {
    if (this.startTime !== null) {
      throw new Error("InvalidStateError: start() called twice on one source");
    }
    this.startTime = when;
    this.startOffset = offset;
  }
  stop(when = 0): void {
    this.stopTime = when;
  }
}

export class FakeOscillator extends FakeSource implements OscillatorNodeLike {
  type: OscillatorType = "sine";
  readonly frequency = new FakeParam("frequency");
  readonly detune = new FakeParam("detune");
  constructor() {
    super("oscillator");
  }
}

export class FakeBufferSource extends FakeSource implements BufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  readonly playbackRate = new FakeParam("playbackRate");
  constructor() {
    super("bufferSource");
  }
}

export class FakeBuffer implements AudioBufferLike {
  private readonly channels: Float32Array[];
  constructor(numberOfChannels: number, length: number) {
    this.channels = [];
    for (let c = 0; c < numberOfChannels; c++) this.channels.push(new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new RangeError(`no channel ${channel}`);
    return data;
  }
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate = 48000;
  state = "running";
  resumeCalls = 0;
  readonly destination = new FakeNode("destination");
  /** Every node created through this context, in creation order. */
  readonly nodes: FakeNode[] = [];
  readonly buffers: FakeBuffer[] = [];

  resume(): Promise<void> {
    this.resumeCalls++;
    return Promise.resolve();
  }
  createGain(): FakeGain {
    return this.track(new FakeGain());
  }
  createOscillator(): FakeOscillator {
    return this.track(new FakeOscillator());
  }
  createBiquadFilter(): FakeBiquad {
    return this.track(new FakeBiquad());
  }
  createBufferSource(): FakeBufferSource {
    return this.track(new FakeBufferSource());
  }
  createDynamicsCompressor(): FakeCompressor {
    return this.track(new FakeCompressor());
  }
  createBuffer(numberOfChannels: number, length: number): FakeBuffer {
    const b = new FakeBuffer(numberOfChannels, length);
    this.buffers.push(b);
    return b;
  }

  /** Every source node created (oscillators and buffer sources). */
  sources(): FakeSource[] {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }

  /** Every node of one kind. */
  ofKind(kind: FakeNodeKind): FakeNode[] {
    return this.nodes.filter((n) => n.kind === kind);
  }

  /** Whether `node` reaches the destination along recorded connections. */
  reachesDestination(node: FakeNode): boolean {
    return reaches(node, this.destination);
  }

  /** Invoke every source's onended (as if each had played to its stop time). */
  fireAllEnded(): void {
    for (const s of this.sources()) {
      const handler = s.onended;
      if (handler) handler(new Event("ended"));
    }
  }

  /**
   * A plain, comparable record of everything created so far: per node (in
   * creation order) its kind, wave or filter type, outgoing edges as node
   * indices, start/stop times and every parameter's automation events. Two
   * runs that built the same graph with the same schedule give deep-equal logs.
   */
  log(): unknown[] {
    const index = (n: FakeNode): number => (n === this.destination ? -1 : this.nodes.indexOf(n));
    return this.nodes.map((n) => {
      const entry: Record<string, unknown> = {
        kind: n.kind,
        to: n.connections.map(index),
        disconnected: n.disconnected,
      };
      if (n instanceof FakeOscillator || n instanceof FakeBiquad) entry.type = n.type;
      if (n instanceof FakeSource) {
        entry.start = n.startTime;
        entry.offset = n.startOffset;
        entry.stop = n.stopTime;
      }
      for (const [key, value] of Object.entries(n)) {
        if (value instanceof FakeParam) entry[key] = value.events.slice();
      }
      return entry;
    });
  }

  private track<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
}

/** Whether `to` is reachable from `from` along recorded connections. */
export function reaches(from: FakeNode, to: FakeNode): boolean {
  const seen = new Set<FakeNode>();
  const stack: FakeNode[] = [from];
  while (stack.length > 0) {
    const n = stack.pop();
    if (!n || seen.has(n)) continue;
    if (n === to) return true;
    seen.add(n);
    for (const c of n.connections) stack.push(c);
  }
  return false;
}
