---
phase: 05-rendering-audio
reviewed: 2026-11-21T23:30:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - index.html
  - src/audio/audio-context-like.ts
  - src/audio/audio-engine.test.ts
  - src/audio/audio-engine.ts
  - src/audio/envelope.ts
  - src/audio/recipes.test.ts
  - src/audio/recipes.ts
  - src/audio/test/fake-audio-context.ts
  - src/audio/voice-pool.test.ts
  - src/audio/voice-pool.ts
  - src/game/reactive-table.test.ts
  - src/harness/flipper-tunnel.test.ts
  - src/harness/reactive-soak.test.ts
  - src/harness/soak.test.ts
  - src/harness/stability.test.ts
  - src/harness/table-soak.test.ts
  - src/input/flipper-input.ts
  - src/input/game-input.test.ts
  - src/input/game-input.ts
  - src/render/asset-free.test.ts
  - src/render/flash.test.ts
  - src/render/flash.ts
  - src/render/table-renderer.test.ts
  - src/sandbox/cue-pipeline.test.ts
  - src/sandbox/flipper-e2e.test.ts
  - src/sandbox/game-e2e.test.ts
  - src/sandbox/game.determinism.test.ts
  - src/sandbox/main.ts
  - src/sandbox/plunger-e2e.test.ts
  - src/sandbox/presentation.determinism.test.ts
  - src/sim/loop.determinism.test.ts
  - src/sim/loop.flippers.test.ts
  - src/sim/loop.tabblur.test.ts
  - src/sim/loop.ts
  - src/table/table-world.test.ts
  - src/ui/hud.test.ts
  - src/ui/hud.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
  necessity: 0
status: issues_found
---

# Phase 5: Code Review Report (incremental: review-fix commits)

**Reviewed:** 2026-11-21
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found
**Scope:** `git diff f6b825c..HEAD`, the 9 fix commits 11ab06a, c5d02e2, 2259d2e, 6956600, c91183a, 309a1b0, 5d73335, 69129bd, 023ded9

## Summary

This pass checks the fixes for the prior pass's 9 findings (WR-01, WR-02, IN-01 to IN-07). Every finding ID below is new and is about the fix code. None of them reopens a prior finding.

**Does each fix resolve its finding?**

| Prior | Verdict | Notes |
|---|---|---|
| WR-01 (stale-event fades) | Resolved | **Master:** the tracked linear segment plus `cancel(now)` / `set(level, now)` / `linear(target, now + MUTE_RAMP_S)` is exact. Two toggles in one frame at the same `currentTime` also work: the second cancel removes the first anchor, which is then re-set at its tracked level. **Steal, Chrome path:** the explicit `set` after `cancelAndHoldAtTime` covers the hold-segment case, where the spec inserts nothing. **Steal, Firefox path:** the `cancel` then `exp(value, now)` exactly retraces the attack, hold and decay segments, because every envelope point is a set or an exp between positive values. `envelopeValueAt` matches the Web Audio exponential formula. |
| WR-02 (starting context) | Resolved, with a new robustness gap (WR-01 below) | |
| IN-01 (flash lead) | Resolved | The first frame now reads age `alpha`. A hold-0 contact flash is 0.29 to 0.35 on the first frame (exactly 0.35 only at alpha 0). The fix report says it is drawn "at its 0.35 peak", which is slightly too strong. Every `record()` caller (CueFeedback, ContactFlash, PresentationObserver) runs inside `onPostStep` before `flash.tick()`, so the +1 stamp is consistent. |
| IN-02 (negative delta) | Resolved | `realDeltaMs > 0 ? min(...) : 0` handles negative, NaN and +Infinity deltas. |
| IN-03 (mute modifiers, marker) | Resolved | Minor documentation and accessibility drift (IN-02 below). |
| IN-04 (asset gate) | Resolved for the listed gaps | One gap remains (IN-03 below). |
| IN-05 (pitch maps) | Resolved | Resolved with tests, which is the review's option (b). |
| IN-06 (unlock edge cases) | Resolved | `ctx.close?.().catch(...)` short-circuits correctly when `close` is absent. |
| IN-07 (test timeout) | Resolved | Each heavy file calls `vi.setConfig` at module scope, before collection. |

**Other checks:**
- **Allocation:** the hot path stays allocation-free. `MuteView.update` and the loop clamp allocate nothing. The new `envs` arrays and point arrays are allocated once per voice, not per frame.
- **Determinism:** untouched. The mute toggle and the flash stamp are presentation-only.
- **Security:** no issues. No new trust-boundary input was added.
- **Necessity:** I read `necessity-review.md`. No finding meets its evidence rule. The `value > 0` branch of the exported `holdAt` is defensive for an exported helper, not provably dead.

## Warnings

### WR-01: [new, WR-02 fix code] Voices queued on a frozen-clock suspended context are never torn down, so the 16-voice bound does not hold for the audio graph

**File:** `src/audio/audio-engine.ts:266-275` (the `playable` rule), `src/audio/audio-engine.ts:214-224` (`resumePending`), `src/audio/audio-engine.ts:327-331` (teardown only in `onended`), `src/audio/voice-pool.ts:140-154` (steal only stops sources)

**Issue:** `flush()` now builds voices whenever `resumePending && state === "suspended"`. This state has no time bound. It ends only when the `resume()` promise settles, and per the Web Audio spec a context that is not allowed to start (or has no device) keeps that promise pending. Two defects follow while the context is in this state:

1. **The audio graph grows without bound.**
   - A voice is torn down (its nodes disconnected from the master bus) only in its last source's `onended`.
   - A context that is not rendering never fires `onended`.
   - `VoicePool.steal()` removes a stolen handle from `active` and calls `stop()`, but it disconnects nothing.
   - So every flush with cues adds oscillators, buffer sources, filters and gains that stay attached to `master` indefinitely.
   - The pool caps only its own `active` list. The fix report's mitigation, "The pool caps them at 16", is therefore incorrect for nodes and memory.
2. **Stale cues all play at once on start.**
   - `currentTime` is frozen, so every voice from every frame in the window gets the same `t0 = frozen + SCHEDULE_AHEAD_S`.
   - When the context finally starts, up to 16 surviving voices, possibly seconds old, fire in the same instant.
   - That burst is processed in the first render quanta together with every lingering stolen node.
   - This contradicts the module's own contract, "a stale cue is never replayed after a resume" (`audio-engine.ts:20-22`).

**How likely it is:** In normal start-up the window is tens of milliseconds, and the change works as intended there. The unbounded case needs a `resume()` that stays pending while the game produces cues. Examples are an output device that cannot open, or a context created in a gesture the browser does not count as activation (Chromium does not count a modifier-only keydown, such as the Shift flipper key, as activation; crbug 709765). The fake context cannot show any of this, because its `resume()` always settles and `fireAllEnded()` is manual.

**Fix:** Bound the starting window, and tear down stolen voices that cannot end on their own:

```ts
// audio-engine.ts
private startingUntilMs = 0;               // wall-clock deadline for the starting window
private static readonly STARTING_MAX_MS = 250;

// in unlock(), when calling resume():
this.resumePending = true;
this.startingUntilMs = performance.now() + AudioEngine.STARTING_MAX_MS; // or an injected clock

// in flush():
const starting =
  this.resumePending && ctx.state === "suspended" && performance.now() < this.startingUntilMs;
const playable = ctx !== null && (ctx.state === "running" || starting);
```

Also give `VoiceHandle` a `teardown()` that the engine supplies (the same body as `onended`), and have `steal()` call it when the context is not running. Then a stolen voice is disconnected even if `onended` never fires. Add a fake test that keeps `resume()` pending, flushes many bumper cues over many frames, and asserts that the number of connected nodes stays bounded.

## Info

### IN-01: [new, WR-02 fix code] The sandbox header still says cues are dropped while the context is not running

**File:** `src/sandbox/main.ts:55-58`

**Issue:** The header says: "a cue recorded before that, or while the context is not running, is dropped, never replayed." After c5d02e2, a suspended context with a resume in flight is playable, and its cues are voiced (`audio-engine.ts:266-271`). The composition root's documentation now contradicts the engine.

**Fix:** Reword it to: "a cue recorded before that, or while the context is suspended with no resume in flight (or closed), is dropped; cues on a still-starting context are scheduled and sound when it runs."

### IN-02: [new, IN-03 fix code] A second live region contradicts the "only announced line" documentation, and unmuting is silent to assistive tech

**File:** `index.html:79-80`, `index.html:89-90`, `index.html:189`, `src/ui/hud.ts:14-16`

**Issue:**
- `#hud-mute` is a second `role="status" aria-live="polite"` region.
- It sits inside the controls `<dl>`, which the CSS comment calls "a static key/action list, not announced" (lines 89-90).
- `.hud-status` is documented as "the one announced line" (lines 79-80), and `hud.ts:14-16` says the status line "is the only line announced to assistive tech".
- Unmuting writes `""`. Clearing a live region announces nothing, so a screen-reader user hears "MUTED" but never hears that the sound is back on.

**Fix:** Update the three comments to describe two live regions. Then either accept that unmuting is silent (and say so), or keep the announcement in a visually hidden sibling that reads "Sound on" or "Muted", while the visible span stays empty when unmuted.

### IN-03: [new, IN-04 fix code] The asset gate still misses remote stylesheets, fonts and scripts

**File:** `src/render/asset-free.test.ts:35-77`

**Issue:** The gate's stated contract is "no image, audio or font asset, and no network fetch that could pull one in". Several plausible regressions for a space-themed HUD still pass it:
- `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron">` has no asset extension, no `url(`, no `@font-face` in our own file and no `fetch`.
- `@import "https://…";` in a `.css` file passes for the same reasons.
- `<script src="https://cdn…">`, `<object>`, `<embed>`, `<iframe>`, `new WebSocket(`, `new EventSource(` and CSS `image-set(` all pass too.

**Fix:** Add patterns, each with a positive sample:

```ts
{ name: "remote URL in markup or CSS", re: /\b(href|src)\s*=\s*["']?(https?:)?\/\//i, sample: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">' },
{ name: "CSS @import", re: /@import\b/i, sample: '@import "https://x/y.css";' },
{ name: "embedded document element", re: /<(object|embed|iframe)\b/i, sample: '<iframe src="x"></iframe>' },
{ name: "streaming connection", re: /\bnew\s+(WebSocket|EventSource)\s*\(/, sample: 'new WebSocket("wss://x");' },
```

### IN-04: [new, WR-01 fix code] Envelope points are built twice per layer; the steal anchor relies on two independent calls staying in step

**File:** `src/audio/audio-engine.ts:375-376`, `src/audio/envelope.ts:108-123`

**Issue:**
- `buildLayer` calls `applyEnvelope(env.gain, lt, envelope, peak)`, which builds the points internally and schedules them.
- It then calls `envelopePoints(lt, envelope, peak)` a second time to store on the handle for `envelopeValueAt`.
- The steal fade is exact only if the stored points are the ones actually scheduled.
- Today the two calls agree because both are pure with the same inputs. If `applyEnvelope` ever schedules anything else (an extra point, a different clamp), the anchor silently drifts and the stale-level click from the prior WR-01 comes back.
- It also allocates the point array twice per layer. That happens per voice, not per frame, so it is minor.

**Fix:** Have `applyEnvelope` return the points it scheduled, or accept precomputed points, so one array is both scheduled and stored:

```ts
export function scheduleEnvelope(param: AudioParamLike, points: readonly EnvPoint[]): void { /* cancel from points[0].time, then apply */ }
// buildLayer:
const points = envelopePoints(lt, envelope, peak);
scheduleEnvelope(env.gain, points);
const end = envelopeEnd(lt, envelope);
```

---

_Reviewed: 2026-11-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
