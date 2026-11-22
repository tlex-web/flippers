/**
 * Presentation effects (06-09, D-17, D-23/D-24): the one tracker the step path
 * writes and the renderer reads.
 *
 * Inputs, all step-path scalar writes:
 * - `FxSink` (from `CueFeedback`): registered bumper and slingshot kicks add
 *   trauma at TRAUMA_BUMPER / TRAUMA_SLING times the kick strength; sensor
 *   passes add nothing (D-17: the bank bonus gets lights only);
 * - `ObserverFx` (from `PresentationObserver`): an accepted nudge kicks the view,
 *   a tilt adds TRAUMA_TILT, a drain adds TRAUMA_DRAIN.
 * `tick()` runs once per fixed step in `onPostStep` (after `lamps.update()`,
 * before `flash.tick()`) and advances every effect clock.
 *
 * Read-only by construction: it holds the resolved table geometry (the particle
 * plans precompute emitter geometry from it) and no world or rules handle, so
 * nothing here can write the simulation. Allocation-free after construction.
 */

import type { FxSink } from "../app/cue-queue";
import type { NudgeDir } from "../game/tuning";
import type { ObserverFx } from "../sandbox/presentation-observer";
import type { ResolvedElement } from "../table/resolve";
import { ShakeTracker, TRAUMA_BUMPER, TRAUMA_DRAIN, TRAUMA_SLING, TRAUMA_TILT } from "./shake";

export class EffectsTracker implements FxSink, ObserverFx {
  /** The whole-view shake (kick and trauma). */
  readonly shake: ShakeTracker = new ShakeTracker();
  /** The resolved table, for the emitter geometry the particle plans precompute. */
  readonly elements: readonly ResolvedElement[];

  constructor(elements: readonly ResolvedElement[]) {
    this.elements = elements;
  }

  /** A registered kick: trauma scaled by the kick strength. */
  onKick(kind: "bumper" | "slingshot", _elementId: number, strength: number): void {
    this.shake.addTrauma((kind === "bumper" ? TRAUMA_BUMPER : TRAUMA_SLING) * strength);
  }

  /** A sensor pass or bank completion: no shake (D-17: the bank gets lights only). */
  onSensor(): void {
    // Lights only; the particle plans add sensor glints here.
  }

  /** An accepted nudge: the view kicks opposite the ball's impulse. */
  onNudge(dir: NudgeDir): void {
    this.shake.kick(dir);
  }

  /** The game tilted. */
  onTilt(): void {
    this.shake.addTrauma(TRAUMA_TILT);
  }

  /** A drain (one per drain-count increment). */
  onDrain(): void {
    this.shake.addTrauma(TRAUMA_DRAIN);
  }

  /** Advance every effect one fixed step. */
  tick(): void {
    this.shake.tick();
  }
}

/** The renderer's read side of the effects. */
export type EffectsReader = Pick<EffectsTracker, "shake">;
