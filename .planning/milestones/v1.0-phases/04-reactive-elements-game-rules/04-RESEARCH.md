# Phase 4: Reactive Elements & Game Rules - Research

**Researched:** 2026-11-20
**Domain:** Game rules over an existing fixed-step Planck.js physics core. Covers active bumper and slingshot kicks, sensor scoring, a 3-ball FSM, nudge and tilt, and a score HUD.
**Confidence:** HIGH for the codebase seams and Planck behavior (read from source and probed). MEDIUM for the tuning numbers (probed, but still need a by-feel pass). LOW for the conventions marked `[ASSUMED]`.

## Summary

Phase 3 left every seam Phase 4 needs, so this phase adds no new dependencies and makes no engine change. Each contact arrives as a normalized `CollisionEvent` through a `CollisionRouter` that dispatches once per fixed step, at `FixedStepLoop`'s `onPostStep` seam. A generic `applyImpulse(ballId, ix, iy)` hook exists for kicks and nudges. `BallFeed` already shows the pattern this phase copies: the listener only records, and a `service()` call right after `router.dispatch()` mutates the world between steps. Every Phase 4 module is an engine-agnostic consumer layered on these seams in a new `src/game/` folder. `planck-world.ts`, `soak.ts` and `containment.ts` stay untouched.

The biggest trap is that a solid contact does not produce one event per hit. A probe on the real table showed a ball touching a bumper emitting a post-solve event on every fixed step, at about 0.0048 kg·m/s for a resting or rolling contact. A single step can also emit two events for the same contact: one from the regular solve and a zero-impulse one from the TOI pass. Scoring and kicking straight off the event stream would therefore score dozens of times per touch. The fix is a per-element re-arm cooldown counted in fixed steps, plus an impulse threshold for slingshots. That is also how real coils behave, since a coil needs time to recycle.

Kicks must be applied as a queued velocity change between steps, never inside a Planck callback. The world is mid-solve there, and the bus contract says listeners never call back into the world. A probe of the recommended kick law (raise the outward normal speed to a target) showed bounded energy and that every ball drains with dead flippers. The defaults are `BUMPER_KICK_SPEED` 5.5 m/s and `SLING_KICK_SPEED` 4.5 m/s, with a maximum observed speed of 7.47 m/s. At 7 / 6 m/s, 3 of 12 balls never drained in 60 s.

**Primary recommendation:** Build four engine-agnostic modules in `src/game/`:
- `ReactiveElements`: bus listener plus a post-dispatch `service()` that applies the queued kicks.
- `TiltMeter`: pure accumulate-and-decay meter.
- `GameSession`: the 3-ball FSM. It replaces `BallFeed` and owns score, liveness and serving.
- A tuning-constants module.

Add a `GameInput` latch (`KeyX`, `Period`, `ArrowUp` and `Enter`), `FlipperController.setEnabled()`, and a DOM HUD overlay. Prove it all with spy-world unit tests, real-table integration tests, a no-mocks e2e test, a determinism replay, and a reactive-table soak gate that plugs in through the existing `SoakConfig.makeWorld` hook.

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists for Phase 4.** The user skipped discuss-phase, so there are no locked user decisions for this phase. The open design decisions are surfaced below as **recommended defaults** (each with a short rationale) that the planner can adopt. Every one is HMR-tunable data, so a by-feel change later costs one constant.

### Locked Decisions
None for Phase 4. Upstream locks still apply. See *Project Constraints* and *Carry-forward locks* below.

### Claude's Discretion: recommended defaults

| # | Decision | Recommended default | Rationale |
|---|----------|--------------------|-----------|
| R1 | Bumper behavior | **Active kick.** On a triggered contact, raise the ball's outward normal speed (bumper center → ball center) to `BUMPER_KICK_SPEED = 5.5 m/s`, keeping the tangential velocity. | Restitution alone cannot "pop with added energy": Planck mixes restitution with `max`, and anything below `velocityThreshold = 1 m/s` is treated as inelastic. A fixed-target kick gives a consistent pop whatever the incoming speed, and the probe showed it bounded (max 7.47 m/s). |
| R2 | Slingshot behavior | **Active kick on the rubber face only.** The kick face is the slingshot loop's longest segment, with its normal oriented away from the polygon centroid. Trigger when `normalImpulse ≥ SLING_MIN_IMPULSE = 0.02` and the contact point is within `SLING_FACE_TOL = 0.05 m` of the face. Raise the normal speed to `SLING_KICK_SPEED = 4.5 m/s`. | Real slings fire only from the rubber face. The vertical inner face bounds the inlane and must stay passive. 0.02 sits well above the probed rolling-contact impulse (0.0015/step) and below a 1 m/s-class hit (0.039). |
| R3 | Re-arm cooldown | `KICKER_REARM_STEPS = 6` (50 ms) per element. Sensors: `SENSOR_REARM_STEPS = 30` (0.25 s) per element. | Collapses the per-step, TOI-duplicate and sub-step event bursts into one hit, the way a real coil recycles. Counted in steps, so it is deterministic. |
| R4 | Score values (original) | Bumper **1,000**; slingshot **500**; top rollover **1,000** (and lights it); all three top rollovers lit = **10,000** bonus, after which the lights reset; inlane **2,000**. | `[ASSUMED]` These are conventional modern magnitudes. Integer points, all in one tunable block. |
| R5 | Score HUD | **DOM overlay** (`<div id="hud">` over or beside the canvas), updated from the render frame and written only when a value changes. It shows score, `BALL n / 3`, a status line (PRESS ENTER / WARNING / TILT / GAME OVER) and a controls hint. | 03-UI-REVIEW found that the canvas HUD ignores the CSS fit and renders at about 3.4 px. A DOM overlay is crisp at any fit, accessible (canvas `aria-label` plus an `aria-live="polite"` status line), and testable with fake `{ textContent }` objects. Phase 5 can re-skin it. |
| R6 | Start / new game | Boot into **game-over/attract** (no ball, flippers dead, "PRESS ENTER TO START"). **`Enter`/`NumpadEnter`** starts a game: score 0, ball 1, served to `PLUNGER_REST`. Enter during a game is ignored. | This is the real start-button convention. Space is the plunger, so starting with Space would also latch a charge. |
| R7 | Drain → next ball | Serve immediately at the post-step boundary, using `BallFeed`'s remove-then-add on the drain bus event. After the 3rd drain, enter `game-over`: no ball, flippers disabled, final score kept on the HUD. | Simplest deterministic choice. The end-of-ball bonus tally and count-up delay belong to Phase 6 (PLSH-06). |
| R8 | Ball save | **None in Phase 4.** | It is PLSH-07 (Phase 6) by the roadmap. |
| R9 | Nudge keys and impulse | `KeyX` = nudge left, `Period` = nudge right, `ArrowUp` = nudge up (the keys reserved by Phase 2 D-09). The impulse goes to every live ball, `NUDGE_IMPULSE = 0.15 kg·m/s` (Δv ≈ 1.19 m/s at m ≈ 0.1257 kg). Directions: X → **+x**, `.` → **−x**, ↑ → **−y** (up-table). `NUDGE_COOLDOWN_STEPS = 30` (0.25 s). Nudge is ignored while tilted or in game-over. | Velocity only, through `applyImpulse`, so there is never a teleport. The directions follow a reaction model `[ASSUMED]`: shoving the cabinet left throws the ball right relative to the playfield. The direction table is one constant, so the user can flip it by feel. |
| R10 | Tilt model | Accumulate-and-decay meter. Each nudge adds `TILT_NUDGE_COST = 1.0`; decay is `TILT_DECAY_PER_S = 0.5` (applied per fixed step); a **WARNING** fires on the rising edge of `level ≥ TILT_WARNING_LEVEL = 2.0`; **TILT** fires when `level ≥ TILT_LEVEL = 3.0`. Meter and warnings reset when the next ball is served. | With the 0.25 s cooldown, 3 rapid nudges give a warning and 4 give a tilt. One nudge every 2 s never accumulates. This matches the factory "3 actuations" default on real machines (cited below). |
| R11 | What "goes dead" means | While tilted: there are no kicks and no points, and sensors do not light. The flippers drop (`setEnabled(false)` → both returning, presses ignored). Nudge is ignored. The plunger stays live, because it is mechanical. Tilt clears when the ball drains and the next one is served. | This is the PITFALLS.md #6 contract and real-machine behavior: "the current ball ends and all balls drain", and tilt clears after the drain. The probe confirms a ball with dead flippers and no kicks drains (mean 2.9 s). |
| R12 | Rollover lights | `ReactiveElements` holds a lit flag per top rollover (400–402), set on a live hit. When all three are lit, it awards the bonus and clears them. The flags reset on a new game, not a new ball. The debug renderer draws lit sensors brighter (an optional read-only `LightState` argument). | ELEM-03 says "trigger lights". This is the minimal visible light. Real glow is PLSH-04 (Phase 6) and flash is RND-03 (Phase 5). |

### Deferred Ideas (OUT OF SCOPE)
These come from the ROADMAP and REQUIREMENTS phase boundaries, not from a CONTEXT.md:
- Element flash on contact (RND-03), the real procedural renderer (RND-01/02) and synthesized SFX (AUD-01) belong to Phase 5. Expose read-only state only.
- Screen shake on nudge (PLSH-01), particles, glowing inserts, skill shot (PLSH-05), score count-up and bonus tally (PLSH-06), ball save (PLSH-07) and the localStorage high score (PLSH-08) belong to Phase 6.
- Missions, ranks, lock and jackpot, extra ball, and multiball are v2.
- Lane change (rotating lit lanes with the flipper buttons) is a v2-style rule. Do not build it.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ELEM-01 | Bumpers pop the ball back with added energy and award points on contact | R1 kick law, R3 cooldown, Pattern 2 (queued kick in `service()`), Pitfall 1 (event bursts), probe numbers |
| ELEM-02 | Slingshots/kickers near the flippers kick the ball on contact to keep it lively | R2 face-only kick, Pattern 3 (kick face derived from the resolved geometry), probed impulse threshold |
| ELEM-03 | Lanes and rollovers trigger lights and award points as the ball passes over them | Sensors already emit once per overlap begin (`begin-contact`). R4/R12 points and lights, sensor cooldown |
| GAME-01 | Player sees a live running score in an on-screen HUD | R5 DOM overlay, Pattern 6 (dirty-checked view), UI-REVIEW carry-forwards |
| GAME-02 | A 3-ball game loop: draining serves the next ball to the plunger; game over after the last ball | R6/R7, Pattern 4 (`GameSession` replaces `BallFeed`, drain read from the bus, never positional, CR-01) |
| GAME-03 | Player can nudge the table (small impulse); over-nudging triggers TILT, elements go dead and the flippers drop | R9/R10/R11, Pattern 5 (`TiltMeter`), `FlipperController.setEnabled`, the no-teleport proof |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Platform:** browser, no install. **Assets:** procedural only, so DOM text for the HUD is fine and no image or font assets are allowed.
- **Performance:** stable 60 fps. Avoid per-frame allocations on the hot path ("Reuse vector objects; avoid per-frame allocations").
- **Stack:** Planck.js 1.5 (installed `planck` `"1.5.0"`), Canvas 2D, vanilla TypeScript (TS pinned at `5.9.3` per STATE), Vite 8, raw Web Audio. **No framework, no state-machine library.** CLAUDE.md "What NOT to Use": "XState / a state-machine library for game states … ~5 states; a library is overkill → A hand-rolled `switch`/enum FSM". **No UI framework** ("Plain DOM (or a canvas overlay) for menus/score").
- **Flippers stay dynamic bodies on motorized revolute joints.** Never kinematic. Tilt "drops" them by driving the motor (−1), never by switching the body type.
- **Fixed timestep at 120 Hz with an accumulator.** Rules tick on fixed steps, never on wall-clock.
- **GSD workflow enforcement:** edits only through GSD commands. The planner emits PLAN.md files and execution goes through `/gsd-execute-phase`.
- **Carry-forward locks** (STATE.md and Phase 1–3 CONTEXT):
  - Only `src/physics/planck-world.ts` imports `planck`. This is grep-enforced.
  - Physics is reachable only through the `PhysicsWorld` interface.
  - The world is N-ball-ready (id-keyed).
  - Seeded `mulberry32`, never `Math.random`.
  - Feel constants stay byte-identical.
  - `containment.ts` and the swept invariant stay untouched.
  - Bus listeners never call back into the world.
  - Dispatch happens at `onPostStep`.
  - Element ids come from `TABLE_SPEC`.
  - The developer profile asks for exact versions and no unrequested dependencies. This phase adds **none**.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Contact detection and impulse reporting | Physics adapter (`planck-world.ts`) | — | Already done (Phase 3). Unchanged. |
| Bumper and sling kick decision (cooldown, face test, liveness) | Game rules (`src/game/reactive-elements.ts`) | — | Engine-agnostic policy over bus events. |
| Applying kick and nudge velocity | Physics adapter via `applyImpulse` | Game rules (caller) | The only engine mutation path. Called between steps. |
| Score, ball count, game FSM, tilt state | Game rules (`src/game/game-session.ts`, `tilt-meter.ts`) | — | Pure state and logic, testable with spy worlds. |
| Ball serve and removal on drain | Game rules (`GameSession.service()`) | Physics (`addBall`/`removeBall`) | Replaces `src/sandbox/ball-feed.ts`. Same bus-driven pattern. |
| Keyboard nudge and start edges | Input (`src/input/game-input.ts`) | — | Copies the `PlungerInput` latch pattern. |
| Flipper enable/disable (tilt drop) | Control (`FlipperController.setEnabled`) | Game rules (caller) | The FSM stays engine-agnostic and drives the motor −1. |
| Score/ball/status display | Browser DOM overlay (`src/ui/hud.ts`) | Canvas debug renderer (lit lights) | Crisp text independent of the canvas fit (UI-REVIEW #1). |
| Composition and step ordering | Composition root (`src/sandbox/main.ts`) | — | The only place modules are wired, as today. |

## Standard Stack

### Core (all already installed, no changes)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| planck | `1.5.0` `[VERIFIED: package.json + node_modules/planck/package.json]` | Physics: contacts, `applyLinearImpulse` | Engine is locked (Phase 1). |
| typescript | `5.9.3` `[VERIFIED: package.json]` | Language | Pinned for `@typescript-eslint` 8 compatibility (STATE Phase 01). |
| vitest | `^4.1.10` (resolved 4.1.10) `[VERIFIED: npx vitest --version]` | Unit, integration and gate tests | Existing harness, node environment, no DOM. |
| Canvas 2D / DOM | browser-native | Debug renderer plus HUD overlay | No dependency. |

### Supporting
None. Every Phase 4 capability is game logic over existing seams.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Active kick via `applyImpulse` | Bumper fixture `restitution > 1` | Rejected. It scales with incoming speed (a slow ball gets almost nothing). Contacts below the 1 m/s `velocityThreshold` get **no** restitution at all. There is no cooldown or liveness hook, so tilt cannot turn it off without an engine change, and it would also change the soak's physics. |
| Rules-side cooldown | New `begin`-flag on `CollisionEvent` (begin-contact for solids) | Rejected. It changes the adapter and the interface. Begin-contact has no impulse, and adding it for solids would double-report against the post-solve path (Phase 3 "no duplicates" test). |
| DOM HUD | Canvas HUD text scaled by 1/fit | Workable, but text quality depends on the fit and the backing size, it is not accessible, and Phase 5 rewrites the renderer anyway. |
| Hand-rolled FSM | XState | Forbidden by CLAUDE.md. |

**Installation:** none.

## Package Legitimacy Audit

This phase installs **no external packages**. Every capability uses the already-installed `planck@1.5.0` and browser built-ins.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 keyboard ──► FlipperInput ─┐            ┌─► FlipperController (setEnabled gate) ──► setFlipperMotor
 keyboard ──► PlungerInput ─┼─ onFixedStep (TOP of each 120 Hz step) ─► PlungerController ──► applyImpulse
 keyboard ──► GameInput ────┘   (release/cancel before press: IN-02)
                (X . ↑ Enter)    │
                                 ├─► GameSession.onStart()   (attract/game-over -> playing, serve ball 1)
                                 └─► GameSession.onNudge(dir) ──► TiltMeter.addNudge()  ──► WARNING / TILT
                                          │ (if live & cooldown ok)      │ TILT -> FlipperController.setEnabled(false)
                                          └─► applyImpulse(every ball)   │
                                 TiltMeter.update()  (decay, per step)   │
                                                                         ▼
                        world.step(FIXED_DT)  (Planck: N sub-steps, post-solve / begin-contact -> pooled events)
                                 │
                        onPostStep (BOTTOM of each step)
                                 ├─► router.dispatch()  ── one batch, fixed registration order ──┐
                                 │       listener 1: ReactiveElements.onEvent  (record trigger: cooldown,
                                 │                     face test, isLive? -> queue kick, award points, light)
                                 │       listener 2: GameSession.onEvent       (record drain of active ball)
                                 ├─► ReactiveElements.service()  ── queued kicks ──► applyImpulse (between steps)
                                 └─► GameSession.service()       ── drain? removeBall; ball<3 ? addBall(PLUNGER_REST)
                                                                     & reset tilt & enable flippers : game-over
 rAF frame ──► loop.advance(...) ──► DebugRenderer.draw(world, balls, hud, charge, lights)
                                 └─► HudView.update(session)  (DOM textContent, written only on change)
```

### Recommended Project Structure
```
src/
├── game/                       # NEW: engine-agnostic rules (no planck import, grep-enforced)
│   ├── tuning.ts               # HMR-tunable, per-const-documented: points, kick speeds, rearm, nudge, tilt
│   ├── reactive-elements.ts    # bumper/sling kick + sensor scoring + rollover lights (bus listener + service)
│   ├── tilt-meter.ts           # pure accumulate-and-decay meter
│   └── game-session.ts         # 3-ball FSM, score, serve/drain (supersedes sandbox/ball-feed.ts)
├── input/game-input.ts         # NEW: KeyX/Period/ArrowUp nudge + Enter/NumpadEnter start edge latch
├── control/flipper-controller.ts  # MOD: setEnabled(enabled)
├── control/plunger-controller.ts  # MOD: IN-01 rest-speed gate
├── physics/constants.ts        # MOD (additive): export BALL_DENSITY + ballMass(radius)
├── physics/types.ts            # MOD: drainEvents(): readonly CollisionEvent[] (IN-05)
├── ui/hud.ts                   # NEW: DOM overlay view (element-like injection for tests)
├── harness/reactive-world.ts   # NEW: PhysicsWorld decorator wiring rules into the soak via makeWorld
└── sandbox/main.ts, debug-draw.ts, index.html  # MOD: composition, lit-sensor drawing, HUD markup
```

### Pattern 1: Listener records, `service()` mutates (the BallFeed pattern)
**What:** Bus listeners only write into pooled state such as a pending-kick slot or a drained id. A `service()` method called from `onPostStep` **after** `router.dispatch()` performs world mutations.
**Why:** The bus contract is one-way. Quoting `src/app/collision-router.ts:14-18` `[VERIFIED: read this session]`:

> "- do not allocate per event (this runs on the 120 Hz step path);
> - records are pooled and mutated on the next step, so copy out anything kept past it, and never retain the record itself;
> - never call back into the world: the bus is strictly one-way."

`applyImpulse` documents the timing rule. From `src/physics/types.ts:179-181` `[VERIFIED]`: "Call it only BETWEEN fixed steps (the top-of-step hook), never inside `step()`." `onPostStep` runs after `world.step()` returns. From `src/sim/loop.ts:83-93` `[VERIFIED]`: `this.world.step(FIXED_DT); this.snapshotInto(this.currentStates); … if (onPostStep) onPostStep();`. So `onPostStep` is between steps as well, and `BallFeed.service()` already mutates there.

**Example skeleton:**
```typescript
// src/game/reactive-elements.ts — engine-agnostic; PhysicsWorld imported as a TYPE only.
import type { BallId, CollisionEvent, PhysicsWorld } from "../physics/types";
export type ReactiveWorld = Pick<PhysicsWorld, "getElements" | "getBalls" | "applyImpulse">;

interface Kicker {               // built ONCE from getElements() at construction
  readonly id: number;
  readonly kind: "bumper" | "slingshot";
  readonly cx: number; readonly cy: number;          // bumper center (bumpers)
  readonly ax: number; readonly ay: number;          // kick face endpoints (slings)
  readonly bx: number; readonly by: number;
  readonly nx: number; readonly ny: number;          // outward face normal (slings)
  armedAtStep: number;                               // cooldown
  pendingBall: BallId | -1;                          // queued kick (pooled, one per element)
}

export class ReactiveElements {
  private step = 0;
  // onEvent: bound once, registered on the router; NEVER touches the world.
  private readonly onEvent = (e: CollisionEvent): void => { /* see Pattern 2/3 */ };
  /** Call from onPostStep right after router.dispatch(). */
  service(): void { /* apply each pending kick via applyImpulse, then clear; this.step++ */ }
}
```

### Pattern 2: Bumper kick = raise the outward normal speed to a target
**What:** On a triggered bumper contact, take n̂ = normalize(ball center − bumper center) from `getBalls()` and the resolved circle center. With vₙ = v·n̂, if vₙ < `BUMPER_KICK_SPEED`, apply `ballMass(r) · (BUMPER_KICK_SPEED − vₙ) · n̂` through `applyImpulse`.
**When:** in `service()`, for every bumper whose `pendingBall` is set. Trigger in `onEvent` when `e.elementKind === "bumper"`, `e.normalImpulse > 0`, `step ≥ armedAtStep` and `session.isLive()`. Then set `armedAtStep = step + KICKER_REARM_STEPS`, award the points, and set `pendingBall`.
**Why this law:** it keeps the tangential velocity (glancing hits stay glancing) and always produces at least a fixed pop. The added energy is bounded: outgoing speed ≤ √(v_t² + target²), so there is no ping-pong runaway. Use the ball snapshot, not `e.point`, because the snapshot is the post-step state.

**Mass:** `m = BALL_DENSITY · π · r²`. `BALL_DENSITY = 1` is duplicated as a private const in four places: `src/physics/planck-world.ts:69` `const BALL_DENSITY = 1;`, `src/sandbox/main.ts:42` `const BALL_DENSITY = 1;`, `src/harness/flipper-feel.test.ts:44` and `src/harness/stability.test.ts:38` `[VERIFIED: read/grep this session]`. **Export `BALL_DENSITY` (and a `ballMass(radius)` helper) from `constants.ts`**, and have `planck-world.ts` import it. This is an additive constants change. The value is identical, so the soak and proofs stay byte-identical.

### Pattern 3: Slingshot kick face derived from the one resolve
**What:** At construction, for each `kind === "slingshot"` resolved element:
1. Take the longest of its `segments` as the kick face.
2. Orient the face's unit normal away from the vertex centroid.

Trigger only when `e.normalImpulse ≥ SLING_MIN_IMPULSE` and the distance from `e.point` to the face segment is ≤ `SLING_FACE_TOL`.
**Geometry:** the left sling is `src/table/spec.ts:267-271` `[VERIFIED]`:
```
const LEFT_SLING: readonly Vec2[] = [
  { x: 0.86, y: 4.2 },
  { x: 0.86, y: 4.95 },
  { x: 1.16, y: 5.1 },
];
```
The longest edge is the hypotenuse (0.86, 4.2)–(1.16, 5.1), length ≈ 0.949, against 0.75 for the vertical face and ≈ 0.335 for the bottom face. Its outward normal works out to ≈ (+0.949, −0.316): the kick goes right and slightly up-table. The right sling (`301`, `mirrorPath`) mirrors to ≈ (−0.949, −0.316). Unit-test both. The vertical face (x = 0.86) bounds the inlane and must never kick.
**Contact point tolerance:** the probe saw a sling hit at `pt (0.963,4.479)`. That is ≈ 0.01 m off the face line, because Planck's circle-vs-chain world-manifold point sits between the two surfaces. 0.05 m is safe.

### Pattern 4: `GameSession` FSM replaces `BallFeed`
States (hand-rolled union, `switch`): `"game-over"` (initial, the attract state, holding the last score) → `"playing"` ⇄ `"tilted"` → `"game-over"`.
- `onStart()` (Enter edge): only from `game-over`. Score 0, ball 1, tilt reset, flippers enabled, `addBall(PLUNGER_REST)`. Call it at the top of the step; `addBall` is legal between steps.
- Drain detection: copy `BallFeed`'s listener exactly. From `src/sandbox/ball-feed.ts:58-60` `[VERIFIED]`: `if (e.elementKind === "drain" && e.ballId === this.active) this.drained = e.ballId;`. **Never positional.** `PLUNGER_REST` (`{ x: 3.15, y: 6.2 }`, spec.ts:200) lies below `DRAIN_Y` (`6.05`, spec.ts:194). That was the CR-01 bug.
- `service()` after dispatch, on a drain:
  1. `removeBall`.
  2. If `ball < BALLS_PER_GAME` (3): `ball++`, reset the tilt meter and warnings, `flippers.setEnabled(true)`, state `"playing"`, `addBall(PLUNGER_REST)`.
  3. Otherwise: state `"game-over"`, `flippers.setEnabled(false)`, `active = -1`.
- `isLive()` = `state === "playing"`. Read by `ReactiveElements` for kicks, points and lights.
- `activeBallId` getter. The plunger release uses it, as `feed.activeBallId` does today. Return `-1` when there is no ball, so `applyImpulse` and `ballInZone` no-op.
- Points: `award(points)` adds only when `isLive()`.

### Pattern 5: `TiltMeter` (pure, step-driven)
```typescript
// src/game/tilt-meter.ts — no world, no clock. Constants from ./tuning.
export type NudgeOutcome = "ok" | "warning" | "tilt";
export class TiltMeter {
  private level = 0;
  private warned = false;            // rising-edge latch for the warning
  addNudge(): NudgeOutcome {
    this.level += TILT_NUDGE_COST;
    if (this.level >= TILT_LEVEL) return "tilt";
    if (!this.warned && this.level >= TILT_WARNING_LEVEL) { this.warned = true; return "warning"; }
    return "ok";
  }
  update(): void {                   // once per fixed step
    this.level = Math.max(0, this.level - TILT_DECAY_PER_S * FIXED_DT);
    if (this.level < TILT_WARNING_LEVEL) this.warned = false;
  }
  reset(): void { this.level = 0; this.warned = false; }
  getLevel(): number { return this.level; }   // read-only, for HUD/tests
}
```
Worked numbers with the R10 defaults (cooldown 0.25 s): nudges at t = 0, 0.25 and 0.5 s give level 3 − 0.25 = 2.75, which triggers the **warning** at the 3rd. A 4th at 0.75 s gives 2.75 − 0.125 + 1 = 3.625, which **tilts**. One nudge every 2 s peaks at 1.0, so it never warns. Nudging every 1 s nets +0.5/s, warning after about 4 s of sustained shaking and tilting after about 6 s.

### Pattern 6: DOM HUD, dirty-checked
```typescript
// src/ui/hud.ts — element-LIKE injection so vitest (node env, no DOM) can test it.
export interface TextSink { textContent: string | null; }
export interface HudSource { getScore(): number; getBall(): number; getState(): GameState; getWarningFlash(): boolean; }
const fmt = new Intl.NumberFormat("en-US");           // built ONCE
export class HudView {
  private lastScore = -1; /* lastBall, lastStatus … */
  constructor(private readonly score: TextSink, private readonly ball: TextSink, private readonly status: TextSink) {}
  update(src: HudSource): void {
    const s = src.getScore();
    if (s !== this.lastScore) { this.lastScore = s; this.score.textContent = fmt.format(s); } // alloc only on change
    // same for ball "BALL 2 / 3" and status ("PRESS ENTER TO START" | "WARNING" | "TILT" | "GAME OVER")
  }
}
```
Markup goes in `index.html` beside `#stage`:
- a `#hud` with score, ball and status lines;
- `aria-live="polite"` on the **status** line only, because the score changes too often to announce;
- a controls hint line;
- `aria-label` on the canvas.

These close UI-REVIEW priority fixes #1 and #3.

### Step ordering inside the fixed step (exact)
**`onFixedStep`** (top of the step):
1. Drain flipper edges and gate them through `setEnabled`, then `controller.update()`.
2. Drain plunger edges in **release → cancel → press** order (IN-02), then `plunger.update()`.
3. Drain game edges: `start` → `session.onStart()`, and each nudge → `session.onNudge(dir)`.
4. `tilt.update()`.

**`onPostStep`** (bottom of the step):
1. `router.dispatch()`. Listeners in registration order: `ReactiveElements`, then `GameSession`.
2. `reactive.service()`.
3. `session.service()`.

Kicks are applied before a drained ball is removed. Points scored in the drain step still count, because the reactive listener was registered first.

### Anti-Patterns to Avoid
- **Scoring or kicking once per `CollisionEvent`.** Solid contacts report every step, plus TOI duplicates and sub-step repeats. Always go through the per-element cooldown.
- **Calling `applyImpulse`, `addBall` or `removeBall` inside a router listener or a Planck callback.** It breaks the one-way bus. Inside `world.step()`, Planck's `createBody`/`destroyBody` silently return `null` or no-op (`if (this.isLocked()) return`).
- **A positional drain check (`y > DRAIN_Y`).** It respawns the parked ball every frame (CR-01).
- **Nudge by `setTransform` or a position offset.** That is a teleport and can tunnel. Nudge is velocity only.
- **Tilt by changing the flipper body type or destroying joints.** Drive the motor −1 through the FSM.
- **Wall-clock timers (`performance.now`, `setTimeout`) for cooldowns, decay or serve delay.** That breaks replay determinism. Count fixed steps.
- **`Math.random` for any variation.** Use seeded `mulberry32` if jitter is ever wanted.
- **Editing `planck-world.ts` contact handlers, bumper restitution, or any feel constant.** The soak and FLIP calibrations depend on them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Kick/nudge velocity change | Direct body velocity writes or a new engine hook | `PhysicsWorld.applyImpulse` (exists, rejects non-finite input, wakes the ball) | It is the D-09 generic primitive "the Phase 4 nudge reuses". |
| Drain detection | Position thresholds | Drain sensor `600` on the bus (`begin-contact`, once per overlap) | CR-01 regression. |
| Event fan-out | A second drain of `world.drainEvents()` | `router.register(listener)` | A second drain steals the batch from other consumers. |
| Key edge latching | Ad-hoc `keydown` handlers | Copy `PlungerInput` (repeat suppression, `preventDefault` only on bound keys, blur/visibility handling) | Proven against T-02-03 and T-03-12. |
| Containment proof with kicks active | A new soak engine | `runSoak({ table: TABLE_SPEC, makeWorld: () => new ReactiveSoakWorld(...) })` | `SoakConfig.makeWorld` already exists (`soak.ts:127`). `soak.ts` and `containment.ts` stay untouched. |
| Kick-face geometry | Hard-coded normals | Derive from `getElements()` (the one resolve) | What is hit is what is drawn (SC#4). Mirrors stay correct automatically. |
| Game FSM | XState | `switch` on a string-union state | CLAUDE.md. |

**Key insight:** every hard physics problem (CCD, sub-stepping, sensors, event identity) is already solved and gated. Phase 4 risk lives entirely in event semantics (bursts, duplicates, ordering) and in tuning. Both are cheap to prove headlessly with the existing harness.

## Common Pitfalls

### Pitfall 1: Solid contacts emit a burst of events per touch
**What goes wrong:** points and kicks fire dozens of times per bumper touch.
**Why it happens:** post-solve fires for every touching contact on every solve, and the adapter emits each one. Probe output on the real table (this session, ball dropped onto bumper 202):
```
bumper202 step 0 bumper#202 imp 0.0048 pt (1.479,3.100)
bumper202 step 0 bumper#202 imp 0.0000 pt (1.481,3.085)
bumper202 step 1 bumper#202 imp 0.0048 pt (1.481,3.085)
bumper202 step 2 bumper#202 imp 0.0048 pt (1.481,3.085)
...
bumper202 total=127 final (2.68,4.33) v=(0.96,1.73)
```
That is two events in step 0 (the second with impulse 0.0000 from the TOI pass) and one per step while the contact persists. Flipper motion adds sub-step repeats, up to 4 per step, per `planck-world.ts` `SUB_STEP_N_MAX`.
**How to avoid:** per-element `armedAtStep` cooldown (R3). Never assume `normalImpulse === 0` means "sensor". Use `elementKind`.
**Warning signs:** the score jumps by 10× the expected value on a single touch, or the bumper kick compounds.

### Pitfall 2: Rolling or resting contacts trigger slingshots
**What goes wrong:** a ball rolling down the sling face gets kicked repeatedly.
**Evidence (probe):** the sling hit was `imp 0.0393`, then rolling contact at `imp 0.0015` on every later step. Resting on a bumper gave `0.0048` per step, which is about m·g_inplane·dt = 0.1257·4.61/120 ≈ 0.0048.
**How to avoid:** `SLING_MIN_IMPULSE = 0.02` plus the face test plus the cooldown. Bumpers use `normalImpulse > 0` plus the cooldown, because a real pop bumper fires on any skirt touch.

### Pitfall 3: Kick or nudge applied mid-step or from a listener
**What goes wrong:** the velocity change is overwritten by the solver, events go non-deterministic, or a removed ball is targeted.
**How to avoid:** queue the change in the listener and apply it in `service()` (post-dispatch) or at top-of-step. `applyImpulse` already no-ops for unknown ids. Planck's own guards confirm the world is locked during a step: `planck.mjs:6132` `World2.prototype.createBody … if (this.isLocked()) { return null; }` `[VERIFIED: node_modules/planck/dist/planck.mjs]`. `applyLinearImpulse` (`planck.mjs:2898-2911`) has **no** lock guard. It just adds `invMass·impulse` to `m_linearVelocity` when awake, which is why calling it from a callback would *silently* interfere with the running solve instead of failing loudly.

### Pitfall 4: Kick tuning creates perpetual loops
**What goes wrong:** with strong kicks the ball ping-pongs between the bumpers and slings forever.
**Evidence (probe, 30 seeded drops with 12 valid origins, flippers dead, cooldown 6 steps, sling threshold 0.02):**
```
kick B=0 S=0: drained 12 stuck 0 meanDrainT 2.9s bumperHits 48 slingKicks 8 maxSpeed 4.29
kick B=4 S=3.5: drained 12 stuck 0 meanDrainT 5.7s bumperHits 85 slingKicks 14 maxSpeed 6.20
kick B=5.5 S=4.5: drained 12 stuck 0 meanDrainT 9.9s bumperHits 151 slingKicks 23 maxSpeed 7.47
kick B=7 S=6: drained 9 stuck 3 meanDrainT 10.4s bumperHits 168 slingKicks 10 maxSpeed 10.64
```
**How to avoid:** start at 5.5 / 4.5. Gate it with a seeded "every ball eventually drains with dead flippers" test (bounded at 60 s simulated) and a speed bound. Re-run both whenever a kick speed changes.

### Pitfall 5: Tilt leaves the flippers live, or the re-enable ignores held keys
**What goes wrong:** the flippers still work after a tilt, or the next ball starts with a key held and the bat stays down.
**How to avoid:** `setEnabled(false)` drives every up or flipping bat to `returning` (motor −1) and makes `onPressEdge` a no-op. Keep draining the input latches every step so stale edges do not fire later. On `setEnabled(true)`, re-issue `onPressEdge` for any side `FlipperInput` reports as held. This needs a small public `isHeld(side)` accessor (the existing private `isSideHeld` already computes it).

### Pitfall 6: Plunger meter dishonesty after nudges or fall-backs (IN-01)
**What goes wrong:** a nudged or falling ball in `PLUNGER_ZONE` gets the launch impulse added to its existing velocity.
**How to avoid:** add the IN-01 fix. Release launches only if `hypot(vx, vy) < PLUNGER_REST_SPEED_EPS` (e.g. 0.05 m/s) as well as being in the zone. This matters more now that nudge exists.

### Pitfall 7: New listeners corrupt the shared drain view (IN-05)
**What goes wrong:** Phase 4 adds the first multi-listener use of the bus. The mutable `CollisionEvent[]` return type lets a consumer `push` or `splice` the adapter's reused array.
**How to avoid:** change `drainEvents()` to return `readonly CollisionEvent[]` in `types.ts` and `planck-world.ts`. The router only reads it.

### Pitfall 8: Same-window edge ordering drops a press (IN-02)
**What goes wrong:** a release and re-press of Space, or a nudge followed by Enter, inside one 8.3 ms window can lose the press.
**How to avoid:** in the consumer, apply release → cancel → press. Do the same in `GameInput` consumption.

## Code Examples

### Applying a queued bumper kick (service-side)
```typescript
// Source: pattern derived from src/physics/types.ts:174-183 (applyImpulse contract)
// and src/sandbox/ball-feed.ts (service-after-dispatch). Values from ./tuning.
const balls = this.world.getBalls();
for (const k of this.kickers) {                 // fixed array built once
  if (k.pendingBall < 0) continue;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (!b || b.id !== k.pendingBall) continue;
    let nx = k.nx, ny = k.ny, target = SLING_KICK_SPEED;
    if (k.kind === "bumper") {
      const dx = b.x - k.cx, dy = b.y - k.cy, len = Math.hypot(dx, dy);
      if (len === 0) break;
      nx = dx / len; ny = dy / len; target = BUMPER_KICK_SPEED;
    }
    const vn = b.vx * nx + b.vy * ny;
    if (vn < target) {
      const j = ballMass(b.radius) * (target - vn);
      this.world.applyImpulse(b.id, j * nx, j * ny);
    }
    break;
  }
  k.pendingBall = -1;
}
```

### Nudge (top-of-step)
```typescript
// Source: applyImpulse contract (types.ts:174-183). NUDGE_DIRS is a tunable table, e.g.
// { left: {x: 1, y: 0}, right: {x: -1, y: 0}, up: {x: 0, y: -1} }  [ASSUMED convention, R9]
onNudge(dir: NudgeDir): void {
  if (this.state !== "playing") return;                 // dead while tilted / game-over
  if (this.step < this.nudgeReadyAtStep) return;        // spam guard
  this.nudgeReadyAtStep = this.step + NUDGE_COOLDOWN_STEPS;
  const d = NUDGE_DIRS[dir];
  const balls = this.world.getBalls();
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b) this.world.applyImpulse(b.id, d.x * NUDGE_IMPULSE, d.y * NUDGE_IMPULSE);
  }
  const outcome = this.tilt.addNudge();
  if (outcome === "warning") this.warningAtStep = this.step;   // HUD flash window
  if (outcome === "tilt") { this.state = "tilted"; this.flippers.setEnabled(false); }
}
```

### Reactive soak world (gate wiring, `soak.ts` untouched)
```typescript
// Source: SoakConfig.makeWorld (src/harness/soak.ts:123-127) — "Injectable world factory".
class ReactiveSoakWorld implements PhysicsWorld {
  private readonly inner = new PlanckWorld({ table: TABLE_SPEC });
  private readonly router = new CollisionRouter(this.inner);
  private readonly rules = new ReactiveElements(this.inner, this.router, ALWAYS_LIVE /* stub session */);
  step(dt: number): void { this.inner.step(dt); this.router.dispatch(); this.rules.service(); }
  // every other method delegates to this.inner (drainEvents returns the empty reused view)
}
```
The `bullet` option must still pass through to `PlanckWorld`, so the CCD-off RED control still works on this wrapper.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `BallFeed` (always re-feed) | `GameSession` (3-ball count, game over, Enter start) | This phase | Port the `ball-feed.test.ts` CR-01 cases into the session tests. Retire `BallFeed`. |
| One demo logging listener | Rules listeners (reactive, then session) plus an optionally throttled logger | This phase | Registration order is load-bearing (points before drain). |
| Canvas HUD (FPS/Hz/KE) | Debug HUD stays. A game HUD is added as a DOM overlay | This phase | UI-REVIEW #1 and #3 are addressed for the game-facing text. |

**Deprecated/outdated:** `src/sandbox/ball-feed.ts`. It is superseded by `GameSession`. Delete it, or keep it only if the planner wants a no-rules sandbox mode. The lean option is to delete it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Score values: bumper 1,000; sling 500; rollover 1,000; bank 10,000; inlane 2,000 | R4 | Low. They are cosmetic and one tunable block. |
| A2 | Nudge direction convention (X → ball +x, `.` → −x, ↑ → −y) | R9 | Low. The user may prefer the opposite sign. It is one constant table, so confirm by feel at UAT. |
| A3 | `NUDGE_IMPULSE = 0.15 kg·m/s` (Δv ≈ 1.19 m/s) feels "small but useful" | R9 | Medium. Needs a by-feel UAT. Do not go so large that nudge becomes free ball control. |
| A4 | Tilt numbers (cost 1, decay 0.5/s, warn 2, tilt 3, cooldown 0.25 s) feel fair | R10 | Medium. A by-feel UAT is needed. The worked numbers match the "3 actuations" factory convention. |
| A5 | Kick speeds 5.5 / 4.5 m/s feel lively without trapping | R1/R2 | Medium. They are probe-bounded (no trap, max 7.47 m/s) but need a by-feel pass. |
| A6 | Enter as the start key; boot into attract | R6 | Low. |
| A7 | Lights reset per game (not per ball); inlanes do not light | R12 | Low. |

## Open Questions

1. **Should the flippers be live in attract/game-over?**
   - What we know: real machines kill the flipper relay outside a game.
   - What's unclear: whether the user wants to play with the flippers in the sandbox before pressing Enter.
   - Recommendation: dead (real behavior). The HUD says "PRESS ENTER TO START".
2. **Should the five open Phase-3 info findings be fixed in Phase 4?** STATE.md asks for triage before Phase 4.
   - Recommendation: fix **IN-01, IN-02 and IN-05** (they touch code Phase 4 extends) and **IN-03** (doc-only) in the first plan. Mark **IN-04** (the real-table soak sweeps only the left bat) `deferred`, with the reason "rotational coverage comes from the proof-box FLIP-04 gate", or let the new reactive soak pick the swept flipper from the seed stream. Record the outcome in `03-REVIEW-DISPOSITION.md`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vitest, vite, tsc | ✓ | v26.13.1 | — |
| npm | scripts | ✓ | 11.10.0 | — |
| vitest | all tests | ✓ | 4.1.10 | — |
| Browser (Chrome) | human UAT of feel/HUD | ✓ (used for the Phase-3 UAT) | — | — |

Baseline: `npx vitest run` gives **24 files, 168 tests passed** (this session).

**Missing dependencies:** none.

## Validation Architecture

> nyquist_validation is enabled (`.planning/config.json` → `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10, `environment: "node"` (no DOM; synthetic `KeyEventLike` objects; element-like `{ textContent }` fakes) |
| Config file | `vitest.config.ts` (excludes `**/*.gate.test.ts`), `vitest.gate.config.ts` (soak gates) |
| Quick run command | `npx vitest run src/game src/input src/control src/ui` |
| Full suite command | `npx tsc --noEmit && npx eslint src && npx vitest run && npm run soak` |
| Determinism backbone | `FIXED_DT` steps, step-counted cooldowns/decay, `mulberry32` seeds (`src/harness/prng.ts`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ELEM-01 | Bumper trigger: one kick and one award per touch despite event bursts (cooldown); kick sets vₙ = `BUMPER_KICK_SPEED` along center→ball; no kick or points when not live | unit (spy world) | `npx vitest run src/game/reactive-elements.test.ts` | ❌ Wave 0 |
| ELEM-01 | Real table: ball dropped onto bumper 202 leaves with outward normal speed ≥ `BUMPER_KICK_SPEED` (> passive rebound), score +1,000 per distinct touch | integration | `npx vitest run src/game/reactive-table.test.ts` | ❌ Wave 0 |
| ELEM-02 | Sling kick face = hypotenuse for 300/301, normals mirror (≈ ±0.949, −0.316); vertical-face contact and rolling contacts (impulse < 0.02) never kick; face hit kicks along the normal | unit + integration | `npx vitest run src/game/reactive-elements.test.ts src/game/reactive-table.test.ts` | ❌ Wave 0 |
| ELEM-03 | Rollover 400–402 crossing: points + lit flag; all three lit gives bonus and reset; inlane 500/501 points; nothing while tilted; sensor cooldown | unit + integration | same as above | ❌ Wave 0 |
| ELEM-01/02 | Energy bounded: seeded drops with dead flippers and kicks active → every ball drains ≤ 60 s simulated, max speed ≤ 15 m/s | integration | `npx vitest run src/game/reactive-table.test.ts` | ❌ Wave 0 |
| ELEM-01/02 | Containment holds with kicks active (≥ 600 s simulated, CCD on; CCD-off RED control) | soak gate | `npm run soak` (`src/harness/reactive-table-soak.gate.test.ts`) + fast variant in `npx vitest run src/harness/reactive-soak.test.ts` | ❌ Wave 0 |
| GAME-01 | HUD writes score/ball/status text only on change; formatting `1,000`; status strings per state | unit | `npx vitest run src/ui/hud.test.ts` | ❌ Wave 0 |
| GAME-01 | Live score visible and updating in the browser | manual (UAT) | `npm run dev` | — (human) |
| GAME-02 | FSM: Enter → ball 1 served at `PLUNGER_REST`; drain → ball 2, 3; 3rd drain → game-over, no ball; Enter ignored mid-game; parked ball never respawned (CR-01 port) | unit (spy world) | `npx vitest run src/game/game-session.test.ts` | ❌ Wave 0 |
| GAME-02 | No mocks: Enter → Space launch → … three drains → game over; score persists; Enter restarts at 0 | e2e | `npx vitest run src/sandbox/game-e2e.test.ts` | ❌ Wave 0 |
| GAME-03 | `TiltMeter`: cost/decay/warn rising-edge/tilt thresholds with the worked numbers; reset | unit | `npx vitest run src/game/tilt-meter.test.ts` | ❌ Wave 0 |
| GAME-03 | `GameInput`: X/Period/ArrowUp/Enter edges; repeat ignored; `preventDefault` only on bound keys; blur-safe | unit | `npx vitest run src/input/game-input.test.ts` | ❌ Wave 0 |
| GAME-03 | Nudge is an impulse, not a teleport: against a control world, Δv ≈ `NUDGE_IMPULSE/m` along the direction, and the position after the step differs only by the integrated Δv·dt (no discontinuity); cooldown blocks spam | integration | `npx vitest run src/sandbox/game-e2e.test.ts` | ❌ Wave 0 |
| GAME-03 | Over-nudge → TILT: flippers return and ignore presses (`getPhase` ≠ held-up), bumper/sling/rollover award 0 and no kicks, ball drains, next ball re-enables | unit + e2e | `npx vitest run src/control/flipper-controller.test.ts src/game/game-session.test.ts src/sandbox/game-e2e.test.ts` | ⚠️ extend existing + ❌ new |
| GAME-01..03 | Replay determinism: the same scripted key timeline at 60/120/144 Hz render cadence gives identical score, ball number, state and final ball state | integration | `npx vitest run src/sandbox/game.determinism.test.ts` | ❌ Wave 0 |
| (carry) | IN-01: plunger ignores a moving ball in the zone | unit | `npx vitest run src/control/plunger-controller.test.ts` | ⚠️ extend |
| (carry) | Engine isolation: only `planck-world.ts` imports planck; `containment.ts`/`soak.ts` unchanged | grep / git | `grep -rl 'from "planck"' src` = 1 file; `git diff --exit-code 083aa58 -- src/harness/containment.ts src/harness/soak.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit && npx eslint src && npx vitest run` (the full fast suite is about 2 s today).
- **Per wave merge:** the full suite plus `npm run soak`.
- **Phase gate:** full suite and soak green, then the human UAT by feel (kick liveliness, nudge size, tilt fairness, HUD legibility) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/game/tilt-meter.test.ts`, covering GAME-03
- [ ] `src/input/game-input.test.ts` (copy `plunger-input.test.ts`), covering GAME-03/GAME-02
- [ ] `src/game/reactive-elements.test.ts` (spy world with a scripted event batch), covering ELEM-01/02/03
- [ ] `src/game/reactive-table.test.ts` (real `PlanckWorld`, seeded), covering ELEM-01/02/03
- [ ] `src/game/game-session.test.ts` (port the `ball-feed.test.ts` CR-01 cases), covering GAME-02/03
- [ ] `src/ui/hud.test.ts` (fake `TextSink`s), covering GAME-01
- [ ] `src/sandbox/game-e2e.test.ts` (copy the `launch-and-route.test.ts` composition), covering GAME-01..03
- [ ] `src/sandbox/game.determinism.test.ts` (copy `loop.determinism.test.ts`), for replay
- [ ] `src/harness/reactive-world.ts` + `reactive-table-soak.gate.test.ts` + `reactive-soak.test.ts`, for containment with kicks
- [ ] Extend `flipper-controller.test.ts` (`setEnabled`) and `plunger-controller.test.ts` (IN-01)

### Suggested plan slicing (mode: mvp, vertical slices)
1. **Tracer.**
   - Constants export (`BALL_DENSITY`/`ballMass`) and `src/game/tuning.ts`.
   - `GameSession` minimal (score + `isLive`, always playing) and `ReactiveElements` bumpers only.
   - DOM HUD score.
   - Wired in `main.ts`, so bumpers pop and the score climbs on screen (ELEM-01, GAME-01).
   - Also fold in IN-05 (`readonly drainEvents`) and IN-03 docs.
2. **Slings and sensors:** face-derived sling kicks, rollover/inlane points, lights, debug-draw lit state, reactive soak gate (ELEM-02/03).
3. **3-ball loop:** full `GameSession` FSM, `GameInput` Enter, retire `BallFeed`, HUD ball/status lines, e2e test (GAME-02).
4. **Nudge and tilt:** `GameInput` nudges, `TiltMeter`, `FlipperController.setEnabled`, IN-01/IN-02 fixes, determinism replay (GAME-03), then a human UAT checkpoint.

## Security Domain

`security_enforcement` is absent, so it is treated as enabled. The app is offline and client-only, with no network, accounts or persistence this phase. The localStorage high score is Phase 6.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts |
| V3 Session Management | no | No sessions ("GameSession" is game state, not auth) |
| V4 Access Control | no | No server |
| V5 Input Validation | yes (light) | Bound keys only (`event.code` allow-list); `repeat` ignored; `preventDefault` only for bound codes (ArrowUp scroll, Enter); `applyImpulse` already rejects non-finite input; nudge magnitude is a bounded constant |
| V6 Cryptography | no | None |

### Known Threat Patterns for the browser, client-side, offline stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Nudge key spam gives free ball control or energy injection | Tampering (game integrity) / DoS (feel) | `NUDGE_COOLDOWN_STEPS` plus the accumulating tilt; nudge is ignored when not live |
| Kick feedback loop runs ball speed away | DoS (availability/feel) | Target-speed law (bounded); cooldown; seeded drain and speed-bound test; reactive soak gate |
| A listener throws and freezes the loop | DoS | Already isolated by `CollisionRouter` (WR-04). Keep the listeners total and simple |
| Wall-clock or `Math.random` in rules breaks replay proofs | Tampering (test integrity) | Step-counted timers; determinism replay test |
| Swallowing unrelated keys (browser shortcuts) | Usability | `preventDefault` only on the bound allow-list (T-02-03 pattern) |

## Sources

### Primary (HIGH confidence)
- Codebase (read this session):
  - `src/physics/types.ts:149-203` (PhysicsWorld, applyImpulse contract, CollisionEvent)
  - `src/physics/planck-world.ts:64-73, 373-428, 725-789, 847-861`
  - `src/app/collision-router.ts:14-18, 65-82`
  - `src/sim/loop.ts:71-98`
  - `src/table/spec.ts:25-26, 194-208, 215, 267-277, 318-399`
  - `src/sandbox/ball-feed.ts`, `src/sandbox/main.ts`
  - `src/control/{flipper,plunger}-controller.ts`, `src/input/{flipper,plunger}-input.ts`
  - `src/physics/constants.ts:41-93, 214-254`
  - `src/harness/soak.ts:123-127`
- Planck 1.5.0 source:
  - `node_modules/planck/dist/planck.mjs:5079-5081` (`mixRestitution` returns max)
  - `:681` (`Settings2.velocityThreshold = 1`)
  - `:2898-2911` (`applyLinearImpulse`: no lock guard, wake, `addMul(invMass, impulse)`)
  - `:6132/6169/6216` (`createBody`/`destroyBody`/`createJoint` return when locked)
  - `:6346-6352` (`queueUpdate`)
- Empirical probes run this session against `PlanckWorld` on `TABLE_SPEC` (output pasted in Pitfalls 1, 2 and 4). The probe script was a throwaway vitest file under the session scratchpad; nothing was written to the repo.
- Planning docs:
  - `.planning/REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`
  - Phase 3 `03-CONTEXT.md`, `03-RESEARCH.md`, `03-06-SUMMARY.md`, `03-REVIEW.md` (IN-01..IN-05), `03-UI-REVIEW.md`
  - `02-CONTEXT.md` D-09 (nudge keys reserved: "`X`/`.`/`ArrowUp` (nudge, Phase 4)")
  - `research/PITFALLS.md` #6 (nudge/tilt)

### Secondary (MEDIUM confidence)
- Factory tilt-warning defaults: "Settings: 1 to 10, Factory Default: 3" ([Monster Bash manual p.42](https://www.planetarypinball.com/reference/gamemanuals/Monster_Bash/files/assets/basic-html/page42.html), [Revenge From Mars manual p.25](https://planetarypinball.com/reference/gamemanuals/Revenge_From_Mars/files/assets/basic-html/page25.html), [Road Kings manual p.21](https://www.planetarypinball.com/reference/gamemanuals/Road_Kings/files/assets/basic-html/page21.html)), via web search summary.
- Tilt behavior in a VPX framework: "When a tilt occurs, the current ball ends and all balls drain"; warnings reset when a new ball starts; a "MultipleHitWindow" groups rapid hits ([vpx-glf tilt docs](https://mpcarr.github.io/vpx-glf/tilt)).
- P3 SDK tilt settings: warnings range 2–10 and "time between warning detects 1.2 to 3.0 seconds". This is from the web search summary of [clempo2.github.io P3TechTips](https://clempo2.github.io/P3TechTips/Tilt.html); a direct fetch of that page returned 404, so treat it as LOW-MEDIUM.

### Tertiary (LOW confidence)
- Nudge direction convention and score magnitudes come from training knowledge. They are tagged `[ASSUMED]` (A1–A3).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Nothing new; versions were read from `package.json` and the installed modules.
- Architecture: HIGH. Every seam was read in source, and the pattern copies the proven `BallFeed`/router contract.
- Event semantics and pitfalls: HIGH. Probed on the real table this session.
- Tuning numbers: MEDIUM. Kick speeds are probe-bounded. Nudge and tilt numbers come from a worked model and still need a by-feel UAT.

**Research date:** 2026-11-20
**Valid until:** 2026-12-20 (stable: pinned deps, in-repo seams)
