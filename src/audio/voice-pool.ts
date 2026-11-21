/** RED stub (05-03 Task 3): bookkeeping only, no admission control yet. */
import type { CueKind } from "../app/cue-queue";
import type { AudioParamLike, ScheduledSourceLike } from "./audio-context-like";

export const MAX_VOICES = 16;
export const STEAL_FADE_S = 0.005;

export interface VoiceHandle {
  readonly kind: CueKind;
  readonly startedAt: number;
  readonly endsAt: number;
  readonly envs: readonly { readonly gain: AudioParamLike }[];
  readonly sources: readonly ScheduledSourceLike[];
}

export class VoicePool {
  private readonly active: VoiceHandle[] = [];
  constructor(maxVoices: number = MAX_VOICES) {
    void maxVoices;
  }
  admit(kind: CueKind, cap: number, now: number): void {
    void kind;
    void cap;
    void now;
  }
  add(v: VoiceHandle): void {
    this.active.push(v);
  }
  release(v: VoiceHandle): void {
    const i = this.active.indexOf(v);
    if (i >= 0) this.active.splice(i, 1);
  }
  activeCount(kind?: CueKind): number {
    if (kind === undefined) return this.active.length;
    return this.active.filter((v) => v.kind === kind).length;
  }
}
