/**
 * Test support: a recording `CanvasRenderingContext2D` and a recording
 * `LayerFactory` (plan 05-02 Task 2, RND-01/RND-02 frame contract).
 *
 * The recorder is a Proxy over a plain store. Every property write is logged as
 * a `set` entry and stored, so a later read returns the last value written (or
 * the canvas default for the state the contract checks: globalAlpha 1,
 * globalCompositeOperation "source-over", shadowBlur 0). Every other read
 * returns a function that logs a `call` entry with its arguments. The two
 * gradient factories return a `GradientStub` whose `addColorStop` records its
 * stops, so gradient creation is visible and the stub is structurally
 * comparable across bakes. Same hand-rolled fake style as hud.test.ts's
 * CountingSink; the casts to the DOM types are allowed here only.
 */

import type { Layer, LayerFactory } from "../static-layer";

/** One recorded method call. */
export interface CallEntry {
  readonly kind: "call";
  readonly name: string;
  readonly args: readonly unknown[];
}

/** One recorded property write. */
export interface SetEntry {
  readonly kind: "set";
  readonly name: string;
  readonly value: unknown;
}

export type LogEntry = CallEntry | SetEntry;

/** The object create*Gradient returns: records its color stops. */
export class GradientStub {
  readonly type: "linear" | "radial";
  readonly params: readonly unknown[];
  readonly stops: [number, string][] = [];
  constructor(type: "linear" | "radial", params: readonly unknown[]) {
    this.type = type;
    this.params = params;
  }
  addColorStop(offset: number, color: string): void {
    this.stops.push([offset, color]);
  }
}

/** A recording context plus its log. */
export interface Recorder {
  readonly ctx: CanvasRenderingContext2D;
  readonly log: LogEntry[];
  /** Every call entry named `name`, in order. */
  calls(name: string): CallEntry[];
  /** Every set entry for property `name`, in order. */
  sets(name: string): SetEntry[];
  /** Empty the log (stored property values are kept). */
  clear(): void;
}

/** Canvas defaults for the state the frame contract reads back. */
const DEFAULTS: Readonly<Record<string, unknown>> = {
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  shadowBlur: 0,
};

export function createRecordingContext(): Recorder {
  const log: LogEntry[] = [];
  const store = new Map<string, unknown>(Object.entries(DEFAULTS));

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (store.has(prop)) return store.get(prop);
      return (...args: unknown[]): unknown => {
        log.push({ kind: "call", name: prop, args });
        if (prop === "createLinearGradient") return new GradientStub("linear", args);
        if (prop === "createRadialGradient") return new GradientStub("radial", args);
        return undefined;
      };
    },
    set(_target, prop, value: unknown) {
      if (typeof prop !== "string") return false;
      log.push({ kind: "set", name: prop, value });
      store.set(prop, value);
      return true;
    },
  };

  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    log,
    calls: (name) => log.filter((e): e is CallEntry => e.kind === "call" && e.name === name),
    sets: (name) => log.filter((e): e is SetEntry => e.kind === "set" && e.name === name),
    clear: () => {
      log.length = 0;
    },
  };
}

/** A layer the recording factory created: its fake canvas and its own recorder. */
export interface RecordingLayer extends Layer {
  readonly width: number;
  readonly height: number;
  readonly recorder: Recorder;
}

/** Counts create() calls and gives each layer its own recorder. */
export class RecordingLayerFactory implements LayerFactory {
  readonly layers: RecordingLayer[] = [];

  get createCount(): number {
    return this.layers.length;
  }

  create(width: number, height: number): Layer {
    const recorder = createRecordingContext();
    const canvas = {
      layerIndex: this.layers.length,
      width,
      height,
    } as unknown as CanvasImageSource;
    const layer: RecordingLayer = { canvas, ctx: recorder.ctx, width, height, recorder };
    this.layers.push(layer);
    return layer;
  }
}
