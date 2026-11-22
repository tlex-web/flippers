# Phase 6: Juice & Polish - Research

**Researched:** 2026-11-22
**Domain:** In-repo integration: rules additions on a deterministic fixed-step pinball FSM, plus allocation-free Canvas 2D / DOM presentation effects
**Confidence:** HIGH. The codebase was read and probed this session, and no external libraries are involved.

## Summary

Phase 6 adds nothing to the dependency tree. Every requirement maps onto seams that already exist:

| Requirement | Existing seam it reuses |
|-------------|-------------------------|
| PLSH-05/06/07 rules | `GameSession` FSM, `ReactiveElements` record-then-service kick path |
| PLSH-01/02/04 timing | `FlashTracker` step-clock pattern |
| Sounds | cue ring → `RECIPES` voice path |
| Glows and shadow sprite | `bakeHalo` sprite bake |
| Count-up, bonus overlay, high score | `HudView` write-on-change `TextSink` HUD |

The work is integration and discipline, not technology choice. The architecture has three hard invariants, all regression-gated today:
- rules are bit-identical at 60/120/144 Hz
- presentation is read-only (bare-vs-presented replay)
- the frame allocates nothing, has no blur or filter, and paints no canvas text

Probes on the real table this session confirmed several facts:
- **D-05 anchor:** charge step N=62 (0.775) sends the ball first to rollover 401.
- **The full D-01 charge-to-lane band table reproduces exactly.**
- **Post sensor is inert:** adding a circular sensor fixture for the virtual center post changes nothing bit-for-bit on the real table. Lane bands and 900-step final states were identical across all 81 charge steps.
- **Kickback is energy-bounded:** a one-shot kickback at the bumper kick law's 5.5 m/s stays bounded (16/16 seeded dead-flipper drops reach the post, get kicked, then drain; peak 7.44 m/s). A 20 m/s RED control breaks the existing 15 m/s bound (peak 19.96 m/s).

Some decisions in CONTEXT.md and UI-SPEC.md clash with the current code. None blocks the phase, but the planner must handle each explicitly:
- The presentation observer infers drains from the ball number going up. That fails once a `"bonus"` state delays the serve, and once a backstop save re-serves without a new ball.
- `award()` is gated to `"playing"`, so the bonus credit needs a separate path.
- The test spy worlds report balls at (0, 0). A positional "left the chute" rule would arm the save at once and turn every legacy drain test into a backstop save.
- "Re-arms on every serve" contradicts "one save per ball" for the backstop re-serve.
- Several renderer frame-contract tests pin the Phase 5 draw order and sprite count, so they will need updating on purpose.

**Primary recommendation:** Build four small, pure rule modules composed into `GameSession`:
- `SkillShot`
- `BallSave`
- `BonusTally`
- `HighScore`

Add three step-clock presentation trackers:
- `ShakeTracker`
- `ParticlePool`
- `LampTracker`

Feed them from the existing `ReactiveFeedback` → `CueFeedback` path and from new read-only counters on `GameSession`, diffed by `PresentationObserver`. Extend `TableRenderer`/`static-layer`/`HudView` last, and close with the determinism, energy-bound and soak gates.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Skill shot (PLSH-05)
- **D-01:** **The lit lane rotates and freezes on press (physics-true).** While the served ball rests in the plunger lane, the lit rollover cycles across 400, 401 and 402 on the fixed-step clock, with no RNG. It freezes on the Space press edge. A skill shot is awarded when the ball's first scoring switch after launch is the lit rollover. There is no meter sweet-spot and no geometry change. The table already maps charge to lane. The researcher probed every one of the 81 charge steps on the real `TABLE_SPEC`, with PLUNGER_REST, a 120-step settle, then release:
  - charge < 0.637: falls back and rests again, so it can be relaunched
  - 0.637–0.70: exits down the right orbit, no rollover
  - 0.713–0.737: rollover 402 (3 steps)
  - 0.750: rollover 400 (one-step outlier)
  - 0.762–0.800: rollover 401 (4 steps, the widest band)
  - 0.813–0.838: left inlane 500
  - 0.850–0.900: rollover 400 (0.887 → 401 outlier)
  - ≥ 0.912, including a full plunge: orbit to inlane 500. A full plunge is never a skill shot.
- **D-02:** **Fallback if the bands feel random.** If UAT finds the 3–4-step (25–33 ms) bands feel like luck rather than skill, widen them by retuning the lane-guide geometry. Every table soak and flow gate must then be rerun. Never fall back to a meter sweet-spot band, which breaks "true to real pinball".
- **D-03:** **Arming and resolution.**
  - The skill shot arms on each serve (game start and every next ball). It does not arm when the ball is merely resting in the plunger zone, so a playfield ball that falls back into the chute never re-arms it.
  - A weak plunge that falls back stays armed and can be relaunched with no penalty.
  - The first scoring switch after launch decides it, with no timer. The lit rollover means award. Any other rollover, inlane, bumper or sling disarms it.
  - A tilt disarms it.
- **D-04:** **Value.**
  - 5,000 for the first skill shot of a game, +5,000 for each further one made, capped at 25,000.
  - Resets on a new game.
  - The lit rollover still pays its normal 1,000 and lights through the existing `ReactiveElements` rule, so it counts toward the 3-lit bank bonus with no special case.
- **D-05:** **Deterministic regression anchor.** Charge step N=62 (0.775) on the real table gives first switch 401. With 401 lit, it must award the skill shot.

#### Ball save (PLSH-07)
- **D-06:** **Virtual center post plus a timed-save backstop (no new solid geometry).** There is no center post today. A real pop-up collider is rejected for two reasons. First, it breaks the built-once, gate-proven containment boundary: it would need a new collider on/off API and a containment boundary that changes over time. Second, the drooped tip gap is about 0.46 m against a 0.4 m ball, which gives crush, eject and resting-ball risks.
- **D-07:** **Primary save is a center kickback.**
  - A circular sensor sits on the mirror axis above the drain, between the bat tips and `DRAIN_Y`.
  - While the save is armed, a ball entering the sensor gets the existing bumper kick law: the normal runs post center → ball center, normal speed is raised to a target, and tangential speed is kept. The kick goes through `ReactiveElements.service()` / `applyImpulse`, the single ordered world-write path.
  - A post is drawn rising at the sensor center. The sensor radius and the drawn post must come from one spec value, so the bounce never reads as fake.
  - Only center drains are kicked. A ball running down the outlane trough walls under the bats must not be kicked into the flipper undersides.
- **D-08:** **Backstop.** A drain through any other route while the save is armed doesn't cost the ball. `GameSession` re-serves it to the plunger.
- **D-09:** **Arming rules.**
  - The timer starts when the ball leaves the chute, not at serve, so holding the plunger doesn't burn it.
  - It lasts a fixed number of steps, about 6–8 s at 120 Hz; tune by feel.
  - One save per ball, by kickback or backstop.
  - Re-arms on every serve. Disarmed by tilt and at game over.
- **D-10:** **Signalling and gate.**
  - A ball-save insert lamp sits above the drain. It is steady while armed and blinks over the last ~2 s.
  - A save gets this flourish: the post rises, flashes and glows, a synthesized save sting plays, and a short "BALL SAVED" appears on the status line.
  - The armed save must join the reactive-table soak gate, with a RED negative control, so the new kick stays energy-bounded and never traps the ball.

#### End-of-ball bonus & score count-up (PLSH-06)
- **D-11:** **Itemized bonus.**
  - Lines: ROLLOVERS ×n, INLANES ×n, BANKS ×n (5,000 per completed bank of 3), then TOTAL.
  - The counters advance next to the existing award sites. Because `award()` is gated on `isLive()`, nothing scored after a tilt leaks in.
  - Bumpers and slings don't feed the bonus.
  - No multiplier and no drop targets; BONUS-01 stays v2. Bonus counts reset every serve and are not carried between balls.
- **D-12:** **The tally holds the serve, and a flipper press skips it.** — **Reversibility:** costly — this adds a `"bonus"` state to the `GameSession` FSM. Undoing it would touch `game-session.ts`, `hud.ts` ball and status text, the `main.ts` input latch, and the scripted steps in `game-session.test.ts`, `game-e2e.test.ts` and `game.determinism.test.ts`.
  - On drain, the session enters a rule-level `"bonus"` state for a counted number of fixed steps: a per-line budget, with the total capped at about 2.5 s (~300 steps). Flippers are off.
  - The bonus is credited when the tally ends, then the next ball is served. This also covers the last ball before GAME OVER.
  - A flipper press latched at a fixed step skips straight to the end.
  - It stays deterministic (counted steps, latched input), so the 60/120/144 Hz replay must still be bit-identical.
- **D-13:** **A tilt forfeits the bonus.** A tilted ball credits nothing and briefly shows "TILT · NO BONUS". It may skip the bonus state or run a short fixed hold so the message can be read.
- **D-14:** **Count-up is an exponential chase, display-only.**
  - The HUD score value follows `shown += (target − shown)·(1 − exp(−dt/τ))`, rounded, and snaps when within a few points.
  - It stays the single `textContent` score line (D-01 holds), written only when the shown integer changes.
  - Digits use `font-variant-numeric: tabular-nums`.
  - It snaps with no animation under `prefers-reduced-motion` and on a new game, so 0 never counts down.
  - `getScore()` stays the true value.
  - No odometer or rolling digits, because they would break D-01.

#### High score (PLSH-08)
- **D-15:** **A single best score.** — **Reversibility:** costly — renaming or reformatting the key later orphans every player's saved best unless migration code reads the old key.
  - Stored under one versioned key, `flippers.hiscore.v1`.
  - Shown on attract and on game over.
  - Beating it at game over puts "NEW HIGH SCORE" on the existing aria-live status line, with a synthesized sting and a flash.
  - It lives in a new module behind an injected `Storage`-like interface, so it's node-testable like `TextSink`.
- **D-16:** **Storage failures are fully guarded.**
  - Every access is wrapped in try/catch, including reading `window.localStorage` itself, which throws `SecurityError` in sandboxed or third-party iframes and with cookies blocked.
  - `setItem` may throw `QuotaExceededError`.
  - Only `Number.isSafeInteger(n) && n >= 0` is accepted; anything else counts as 0 and is overwritten on the next new best.
  - An in-memory copy keeps the session working without storage.
  - Read once at boot, written only at game over, never per frame. Failures are silent with no error UI.

#### Shake, particles, depth & lamps (PLSH-01..04)
- **D-17:** **Hybrid shake.** Two models, both presentation-only on the step clock:
  - a directional spring-damper kick for nudges, 5–7 CSS px along `NUDGE_DIRS`, ζ ≈ 0.5–0.6, ~8 Hz
  - a capped trauma shake: offset = maxOff · trauma² · a deterministic sum-of-sines, max ~8 CSS px · dpr, linear decay ~1.5/s
  - Trauma per event: tilt +0.7, drain +0.25, bumper +0.12·strength, sling +0.08·strength. The bank bonus gets lights only, no shake.
  - A new `nudge` cue carrying its direction is required; `CueKind` has none today.
  - Fill `BG_BOTTOM` before the baked-layer blit so an offset never uncovers an edge strip. Apply the shaken offset at the blit and at every `setTransform` reset.
- **D-18:** **Reduced motion.** Read `matchMedia('(prefers-reduced-motion: reduce)')` at boot, plus a `change` listener outside `draw()`, injected as a boolean. When set, shake and kick are zero. Particles, flashes and lamp blinks stay, since they're local, not whole-view motion. No settings UI.
- **D-19:** **Particles per element type.**
  - All particles come from one allocation-free struct-of-arrays `Float32Array` pool of about 128–160 that overwrites the oldest. They tick on the step clock and are interpolated by alpha, drawn under `"lighter"`, with their own seeded mulberry32 stream, never `Math.random`.
  - Bumpers: an expanding shockwave ring plus 12–16 spark streaks at 1.5–3 m/s with 0.3–0.45 s life.
  - Slings: about 8 sparks along the kick-face normal from `deriveKickFace`.
  - Rollovers, inlanes and the skill shot: a baked star glint plus 3–4 slow motes. This "reward" look is distinct from the "impact" sparks.
  - Keep the existing photosensitivity rule that nothing is drawn larger than its element.
- **D-20:** **Depth: fixed soft shadow plus baked shading.**
  - A baked radial ball-shadow sprite (~1.25r, core alpha ~0.4), offset down-right about (+0.3r, +0.45r) to match the existing top-left `BALL_GLINT`. It's drawn after the bats and before the balls.
  - Baked into the static layer at zero per-frame cost:
    - a vignette (0 → ~0.4 black at the corners, inner radius ~0.5 of the half-diagonal)
    - a soft lower-center light falloff
    - bake-time drop shadows under bumpers, slings and walls
  - No point-light shadow, because with no ramps it would misread as height. No live vignette overlay unless UAT notices the vignette moving with the shake.
- **D-21:** **Insert lamps tied to rules, with a lens look and incandescent fade.**
  - Lamp set: the 3 existing rollover lamps plus a skill-shot indicator, the ball-save lamp above the drain, and 2 inlane arrows. Every lamp shows state the rules actually track, and there is no bonus ladder.
  - Unlit is a dim tinted lens baked at 25–35% value with a faint specular rim, extending today's `ROLLOVER_UNLIT` approach.
  - Lit is a bright fill plus a baked halo (`bakeHalo`) under `"lighter"` plus a white hot-spot. Lamps fade in about 4 steps and out about 15 steps through a per-lamp level array, FlashTracker-style.
  - Lamp state reaches the renderer read-only, by extending `LightState`.
- **D-22:** **Lamp animation rules.**
  - Steady means earned. Blinking means available or collect now: the skill-shot lane during launch, and the ball save in its last ~2 s.
  - Blinks are at most 2 Hz, under the WCAG 2.3.1 limit of 3 flashes per second.
  - Attract mode runs a slow chase across the rollovers and arrows on the step clock.

#### Cross-cutting
- **D-23:** **Rules versus presentation.** The skill shot, ball save, bonus state and high score are game rules. They must be deterministic on the fixed 120 Hz step and keep `game.determinism.test.ts` bit-identical at 60/120/144 Hz. Shake, particles, lamps, count-up and depth are presentation. They read cues and state and never write to the sim, and the bare-vs-presented replay gate (`presentation.determinism.test.ts`) must stay green.
- **D-24:** **The frame contract holds.** The live `draw()` has no `shadowBlur` and no `ctx.filter`, no closures, index loops only, and allocates nothing. Sprites are baked at resize. The asset-free test stays green and the canvas paints no text. Hold 60 fps, and step every frame at 144 Hz.
- **D-25:** **New sounds** (skill shot, ball save, new high score, bonus tally ticks if any) are new synthesized `RECIPES` entries through the existing cue → `AudioEngine` path. No audio files.

### Claude's Discretion
- Skill-shot lane rotation rate and the exact blink cadence (≤ 2 Hz).
- The exact ball-save duration within ~6–8 s, kickback target speed, sensor radius and position, and post rise animation.
- Exact shake amplitudes and decay within the stated ranges; tune by feel, but keep it subtle.
- Particle counts, colors (palette families) and lifetimes within the stated ranges.
- Per-line tally timing within the ~2.5 s cap; the count-up τ.
- Placement and shape of the skill-shot indicator and inlane arrows; lens tint values.
- Where the high score sits in the DOM HUD (attract and game over).
- Module and file naming.

**UI-SPEC.md (approved 2026-11-22) resolves most discretion items with prescriptive values.** Treat it as locked alongside CONTEXT. It fixes:
- 72-step lane rotation
- 60-step / 2 Hz blink
- shake 8 Hz / ζ 0.55 / 6 px peak, with trauma sines at 13.1/19.7 Hz (x) and 15.3/22.9 Hz (y)
- a 160-slot particle pool
- post radius 0.09 m at (1.45, 5.80)
- tally timing of 48 steps per row plus a 120-step TOTAL
- τ = 0.20 s
- the `#hud-best` line
- status priority table and durations
- the full palette additions

### Deferred Ideas (OUT OF SCOPE)
- High-score initials entry / Grand Champion plus top-N table (Williams convention). Considered and deferred because it needs a new input mode and FSM state.
- Bonus-ladder insert lamps. They only pay off once a bonus multiplier exists (v2 BONUS-01).
- Skill-shot geometry retune (D-02). Done only if UAT finds the 25–33 ms charge bands feel random.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- **Platform:** browser HTML5, no install. **Assets:** procedural rendering and synthesized audio only. No image, font or audio files, guarded by `src/render/asset-free.test.ts`.
- **Performance:** stable 60 fps is non-negotiable. The physics runs a fixed 120 Hz step with render interpolation.
- **Stack is locked:** Planck.js 1.5.0 behind the `PhysicsWorld` interface, Canvas 2D, Vite 8.1.4 and raw Web Audio. TypeScript is pinned at **5.9.3**, not 7.0, because of the @typescript-eslint compatibility issue (STATE.md, Phase 01). No framework, no state-machine library (use a hand-rolled string-union FSM) and no UI framework.
- **Engine isolation:** only `src/physics/planck-world.ts` imports planck. Rules, controllers and presentation talk through `PhysicsWorld` `Pick<>` slices.
- **Flippers** stay dynamic bodies on motorized revolute joints. Never kinematic.
- **Reuse vectors and avoid per-frame allocation.** No `shadowBlur` or `ctx.filter` in the live frame.
- **Type-check gate:** `tsc --noEmit` (Vite does not type-check). Lint with `eslint .`.
- **GSD workflow enforcement:** edits only through GSD commands, so execution goes through `/gsd-execute-phase`.
- **Developer profile (user-global CLAUDE.md):**
  - Pin exact versions.
  - Confirm before adding any dependency (this phase adds none).
  - Treat visual and perceptual defects as first-class bugs.
  - Verify a fix by re-running the failing case before reporting it done.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLSH-01 | Subtle, decaying screen shake / camera kick on big hits and nudges | `ShakeTracker` (closed-form damped kick + trauma² sum-of-sines) fed by `CueFeedback.onKick` and `PresentationObserver` (tilt/drain/nudge). Offset applied at the 4 `setTransform` sites plus the blit (Pattern 5) |
| PLSH-02 | Particle bursts and light flares on bumper/target hits | `ParticlePool` SoA ring, emitted on the step path from an extended `ReactiveFeedback.onKick(..., px, py)`. Existing `FlashTracker` flashes stay as the "light flare" (Pattern 6) |
| PLSH-03 | Depth cues: ball shadow, shading/vignette | A `bakeShadow` sprite plus `bakeStatic` additions (light pool, drop shadows, vignette last) (Pattern 8) |
| PLSH-04 | Glowing insert/lane lights, lit vs unlit | `LampTracker` level arrays on the step clock and a lamp pass replacing `drawLitRollovers`. Unlit lenses are baked (Pattern 7) |
| PLSH-05 | Skill shot on launch | `SkillShot` rule in `GameSession` plus a rule hook `onSwitch` from `ReactiveElements`. D-05 anchor verified by probe (Pattern 2) |
| PLSH-06 | Score count-up and end-of-ball bonus tally | `"bonus"` FSM state with counted steps and a private credit path. `HudView` chase on the step-derived dt. New `BonusView` (Patterns 3, 9) |
| PLSH-07 | Ball save (center-post kickback flourish) | New `ElementKind` `"post"` circle sensor, a post kicker in `ReactiveElements` using the bumper law, and `BallSave` in the session with a backstop. Probe-verified energy-bounded (Pattern 4) |
| PLSH-08 | Local high score in `localStorage` | `HighScore` module over an injected `StorageLike`, read once at boot, written only at game over, fully try/catch guarded (Pattern 10) |
</phase_requirements>

## Architectural Responsibility Map

The tiers here are the project's own layers. The game is a single-page client with no server.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Skill-shot arming, rotation, award | Rules (`src/game`) | Controls (plunger phase read) | Scores points, so it must be deterministic (D-23) |
| Ball-save arming, kickback, backstop | Rules (`src/game`: `GameSession` + `ReactiveElements`) | Physics (sensor fixture via `TABLE_SPEC`) | The kick writes the world, so it goes only through `ReactiveElements.service()` (D-07) |
| Bonus counters, tally state, credit | Rules (`GameSession`) | UI (`BonusView` reads only) | Holds the serve and credits points |
| High-score persistence | Rules/domain module (`src/game/high-score.ts`) | Composition root (`main.ts` injects storage) | I/O injected so it is node-testable (D-15) |
| Screen shake, particles, lamp levels | Presentation (`src/render`) on the step clock | Cue path (`src/app/cue-queue.ts`) | Read-only, step clock, deterministic visuals |
| Depth (shadow, vignette, falloff) | Presentation, static bake | — | Zero per-frame cost (D-20) |
| Count-up, status line, bonus overlay, best line | UI (`src/ui/hud.ts`, `index.html`) | — | DOM text only (D-01 holds) |
| Stings | Audio (`src/audio/recipes.ts`) | Cue path | New `RECIPES` entries only (D-25) |
| Reduced motion, storage access | Composition root (`src/sandbox/main.ts`) | — | DOM globals live only in `main.ts` |

## Standard Stack

### Core

No change. Everything in this phase is built on the existing stack.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| planck | 1.5.0 (exact pin) | Physics, including the new circle sensor fixture | Already locked. Circle sensors are supported (`resolve()` CircleSpec has `sensor?`; `buildTable` creates `new Circle(...)` with `isSensor: el.sensor`) [VERIFIED: src/physics/planck-world.ts:451-461, src/table/spec.ts:63-69] |
| Canvas 2D | browser-native | Lamps, particles, shadow, post | Already locked (CLAUDE.md) |
| Web Audio | browser-native | 5 new stings | Already locked (D-25) |
| DOM `localStorage` | browser-native | High score | D-15 [CITED: developer.mozilla.org/en-US/docs/Web/API/Window/localStorage] |
| `matchMedia('(prefers-reduced-motion: reduce)')` | browser-native | Reduced-motion flag | D-18 [CITED: developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion]. `main.ts` already uses `matchMedia(...).addEventListener("change", ...)` for the dpr watch, so that is the in-repo precedent [VERIFIED: src/sandbox/main.ts:338-342] |

### Supporting

None. `mulberry32` already exists in `src/harness/prng.ts`, and `static-layer.ts` already imports it into the render tier, so that precedent stands [VERIFIED: src/render/static-layer.ts:13].

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Closed-form damped-oscillator kick | Per-step semi-implicit Euler spring | Euler is stable here (ω·dt ≈ 0.42), but the closed form is exact at any `step + alpha`, needs no interpolation state and is trivially testable. **Use the closed form.** |
| Sum-of-sines trauma noise (UI-SPEC) | Perlin noise (Eiserloh's original) | Perlin would add code or a dependency. The locked UI-SPEC already picks sines. |
| Separate `FxSink` on `CueFeedback` | Effects reading the `CueQueue` in the frame | The cue ring is cleared by `audio.flush()` per frame, and frame-time emission would make particle RNG consumption cadence-dependent. **Emit on the step path.** |
| New `ElementKind` `"post"` | Reusing `"drain"` or `"lane"` for the sensor | `GameSession` treats any `"drain"` event as a drain [VERIFIED: src/game/game-session.ts:284]. `"lane"` would score as an inlane in `ReactiveElements`. A new kind is required. |

**Installation:** none. No `npm install` in this phase.

## Package Legitimacy Audit

No external packages are installed in this phase. `package.json` dependencies stay `"planck": "1.5.0"`, and devDependencies are unchanged [VERIFIED: package.json].

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 keydown/keyup (window)                       rAF frame(now)
        │                                          │
        ▼                                          ▼
 FlipperInput / PlungerInput / GameInput     loop.advance(dt, onFixedStep, onPostStep)  ──► steps n
   (edge latches)                                   │
        │            ┌──────────────── per fixed 120 Hz step ────────────────┐
        └──────────► │ onFixedStep (top):                                     │
                     │   flipper edges → FlipperController                    │
                     │   [NEW] any flipper press edge → session.onFlipperPress() (bonus skip)
                     │   plunger edges → PlungerController.applyEdges/update  │
                     │   start/nudge edges → session.onStart / onNudge        │
                     │   session.tick()  ── [NEW] SkillShot rotate/freeze (reads plunger phase),
                     │                       BallSave chute-exit + countdown, bonus countdown
                     │ world.step(FIXED_DT)  (Planck: sensors incl. [NEW] post 610 begin-contact)
                     │ onPostStep:                                            │
                     │   router.dispatch() ─► GameSession.onEvent (drain record)
                     │                     ─► ReactiveElements.onEvent (award, queue kick,
                     │                          [NEW] hooks.onSwitch(kind,id,bank),
                     │                          [NEW] post: hooks.trySave() → queue post kick,
                     │                          feedback.onKick(kind,id,J,[NEW] px,py))
                     │                              └─► CueFeedback ─► CueQueue, FlashTracker,
                     │                                               [NEW] FxSink (shake trauma, particles)
                     │                     ─► ContactFlash (walls/chute/bats)
                     │   reactive.service()   (ONLY world writes: bumper/sling/[NEW] post kicks)
                     │   session.service()    (drain → [NEW] backstop | "bonus" state | serve/game over,
                     │                          [NEW] bonus end → credit → serve / game over → HighScore.submit)
                     │   observer.observe()   (diff getters → cues; [NEW] nudge/skillShot/ballSave/
                     │                          bonusTick/highScore cues, drain via drain COUNTER,
                     │                          shake trauma for tilt/drain/nudge, save sparks)
                     │   [NEW] lamps.update() (rule state → per-lamp target → level arrays)
                     │   [NEW] effects.tick() (particles integrate, shake trauma decay)
                     │   flash.tick()
                     └────────────────────────────────────────────────────────┘
                                                   │
                     audio.flush(cues)  ◄──────────┤
                                                   ▼
                     TableRenderer.draw(frame @ alpha):
                       fill BG_BOTTOM → blit static (+shake) → world xform (+shake)
                       → lamp pass → flash pass → post → bats → plunger → shadows → balls
                       → particles ("lighter") → reset
                     HudView.update(session, dt = n·FIXED_DT, reducedMotion)  (count-up, status, best)
                     [NEW] BonusView.update(session)                          (overlay rows)
```

### Recommended Project Structure (new and touched files)

```
src/
├── game/
│   ├── skill-shot.ts        # NEW pure rule: arm/rotate/freeze/resolve/value (step-driven)
│   ├── ball-save.ts         # NEW pure rule: armed/timer/spent, lamp phase, chute-exit test
│   ├── bonus.ts             # NEW counters + tally schedule (pure fns of elapsed steps)
│   ├── high-score.ts        # NEW StorageLike + HighScore (guarded read/submit)
│   ├── game-session.ts      # +"bonus" state, composes the above, read-only counters/getters
│   ├── reactive-elements.ts # +RuleHooks (onSwitch, trySave), post kicker, onKick(px, py)
│   └── tuning.ts            # +skill/save/bonus/kickback constants
├── table/spec.ts            # +ElementKind "post", element 610 (circle sensor), export CHUTE_X
├── render/
│   ├── shake.ts             # NEW ShakeTracker (closed-form kick + trauma)
│   ├── particles.ts         # NEW ParticlePool (SoA Float32Array, 160, mulberry32)
│   ├── lamps.ts             # NEW LampTracker (Float32Array levels, blink/chase)
│   ├── effects.ts           # NEW FxSink impl: routes kicks/sensors/events to shake+particles
│   ├── table-renderer.ts    # new draw order, shake at all transforms, lamp/post/shadow/particle passes
│   ├── static-layer.ts      # light pool, drop shadows, unlit lenses, vignette (last)
│   ├── sprites.ts           # bakeShadow, bakeStar; colors imported from palette
│   ├── flash.ts             # FLASH_TIMING gets "post"
│   └── palette.ts           # UI-SPEC constants
├── app/cue-queue.ts         # +5 CueKinds, CueFeedback(fx) and onKick(px, py)
├── audio/recipes.ts         # +5 recipes
├── sandbox/
│   ├── presentation-observer.ts # drain counter, new cues, fx calls
│   ├── debug-draw.ts        # KIND_STYLE gets "post" (compile-forced)
│   └── main.ts              # wiring: storage, reduced motion, skip latch, new trackers
├── ui/hud.ts                # count-up, status priority, best line, BonusView, AttrSink
└── (index.html)             # #hud-best, #hud-bonus, --accent-glow, keyframes
```

### Pattern 1: Rule hooks from ReactiveElements (record-then-service preserved)

**What:** Add a fifth optional constructor argument `hooks: RuleHooks` (default a frozen no-op, like `NO_FEEDBACK`). `GameSession` implements it, and `main.ts` passes `session` twice: as the gate and as the hooks.

```ts
export type SwitchKind = "bumper" | "slingshot" | "rollover" | "lane";
export interface RuleHooks {
  /** A REGISTERED scoring switch (same gates as ReactiveFeedback), after award. */
  onSwitch(kind: SwitchKind, elementId: number, bank: boolean): void;
  /** Called on a post-sensor overlap with the ball above the post; true = consume the save and kick. */
  trySave(ballId: BallId): boolean;
}
```

**Why not extend `RulesGate`?** Seven files implement or consume `RulesGate` (`SumGate`, `ALWAYS_LIVE` in `reactive-world.ts`, test gates). An optional separate argument keeps every existing call site compiling [VERIFIED: grep for RulesGate gives src/game/game-session.ts, reactive-elements.ts, reactive-elements.test.ts, reactive-table.test.ts, harness/reactive-world.ts, render/contact-flash.test.ts, sandbox/cue-pipeline.test.ts].

**Call placement:** in each registered branch, right after the `award(...)` and before `feedback.on*`. This mirrors the Phase 5 rule that feedback is the last statement (Pitfall 8). The hook is a rule, so it runs before presentation. `onSwitch` drives both the skill-shot resolution (D-03) and the bonus counters (D-11). Bumper and sling calls only disarm the skill shot and never count toward the bonus.

**Where `award` is gated:**

```ts
// Source: src/game/game-session.ts:259-269 (read this session)
isLive(): boolean {
  return this.state === "playing";
}
award(points: number): void {
  if (!Number.isSafeInteger(points) || points < 0) return;
  if (!this.isLive()) return;
```

The skill-shot award happens inside `onSwitch` while the state is `"playing"`, so it passes through `award()` unchanged.

### Pattern 2: Skill shot (PLSH-05)

- **Arming:**
  - `SkillShot.arm()` is called from `onStart()` and from the next-ball serve in `service()`.
  - It is **not** called from the backstop re-serve (see Pitfall 4).
  - `disarm()` is called on tilt and at game over.
- **Rotation (UI-SPEC):** the lit index advances every **72 steps**, in the order 400 → 401 → 402 → 400, while armed and not frozen. Counting starts from the arm step. On resume after a fall-back, rotation continues from the frozen index (discretion; deterministic either way).
- **Freeze:** set when the plunger phase is `"charging"`, read in `session.tick()`. `tick()` runs after `plunger.applyEdges(...)` in `onFixedStep`, so a press on step N freezes the lane shown on step N [VERIFIED: src/sandbox/main.ts:254-276].
- **Unfreeze:** when the plunger is `"idle"` **and** the active ball is resting in `PLUNGER_ZONE`, meaning a weak plunge fell back (D-03). Do not re-implement the rest test. Export a pure `isRestingInZone(ball, zone)` from `plunger-controller.ts`, so both use the same `PLUNGER_REST_SPEED_EPS = 0.05` [VERIFIED: src/control/plunger-controller.ts:55, 208-218].
- **Session access to the plunger:** inject a read-only `Pick<PlungerController, "getPhase">` into `GameSession` as an optional constructor argument (default: always `"idle"`), so the existing session tests compile.
- **Resolution:** the first `onSwitch` while armed decides the shot.
  - `kind === "rollover" && elementId === litLane` → award `value` (5,000 + 5,000 per previous award this game, capped at 25,000) and record `skillShotCount++`, `lastSkillValue` and `lastSkillStep`.
  - Any other switch disarms with no award.
- **Verified on the real table this session** (probe: PLUNGER_REST, 120-step settle, N `update()`s, release). These are the first scoring switches by charge step:

```
N=0..50 → none (falls back)   N=51 → 201  N=52 → 501  N=53 → 201  N=54..56 → 501
N=57..59 → 402                N=60 → 400  N=61..64 → 401          N=65..67 → 500
N=68..70 → 400                N=71 → 401  N=72 → 400              N=73..80 → 500
```

This matches D-01 exactly, and **N=62 (0.7750) → rollover 401** confirms the D-05 anchor. A weak plunge at N=40 rises to a minimum y of 1.849 but never leaves x = 3.150 (see Pitfall 3) [VERIFIED: probe run on TABLE_SPEC this session].

### Pattern 3: The `"bonus"` FSM state (PLSH-06)

`GameState` today is exactly:

```ts
// Source: src/game/game-session.ts:77
export type GameState = "game-over" | "playing" | "tilted";
```

Recommended: `"game-over" | "playing" | "tilted" | "bonus"`. Exhaustive `switch`es in `onStart()`, `ballText()` and `statusText()` then become compile errors until each one handles `"bonus"`, which is desirable [VERIFIED: src/ui/hud.ts:55-80, src/game/game-session.ts:142-158].

`service()` on a recorded drain of the active ball:

1. **Backstop save** applies if `BallSave` is running (the timer has started) **or** a post kick for this ball was consumed this step (Pitfall 5), and the state is not tilted. Then:
   - remove the ball and `addBall(spawn)`
   - state stays `"playing"`, flippers on
   - save spent, `saveCount++`, `lastSaveKind = "backstop"`
   - bonus counters kept (same ball)
   - skill shot not re-armed
2. **Tilted:** remove the ball, enter `"bonus"` with `forfeit = true`, run a fixed 120-step hold (UI-SPEC priority 2) and credit nothing.
3. **Otherwise:** remove the ball and enter `"bonus"`:
   - snapshot the counters into tally rows (rows with n ≥ 1 only)
   - `endsAt = step + 48·rows + 120`, or `+ 60` when all rows are zero
   - flippers off (they stay off)
   - `drainCount++`
4. **While in `"bonus"`:** the tally ends at the first step where `step >= endsAt` or `skipRequested` (set by `onFlipperPress()`, ignored in other states). `service()` then:
   - credits through a **private `credit(points)`** that bypasses `isLive()` but keeps the saturating integer guard
   - serves the next ball with the counters reset, skill shot armed and save armed, or ends the game and calls `highScore.submit(score)`

`award()` cannot be reused for the credit, because `isLive()` is false in `"bonus"` (Pitfall 1).

**Tally display is a pure function** of the elapsed steps (in `bonus.ts`): `rowRevealed(i, elapsed)` and `rowValue(i, elapsed) = round(value_i · min(1, (elapsed − 48i)/48))`. `BonusView` reads these through session getters, so the timing is rule-level and deterministic, and the DOM only mirrors it.

### Pattern 4: Ball save, virtual post (PLSH-07)

**Spec.** Add `"post"` to `ElementKind`. This is the only union, documented as "Defined HERE and nowhere else" [VERIFIED: src/table/spec.ts:20-26, quoted: `"wall" | "chute" | "drain" | "bumper" | "slingshot" | "lane" | "rollover" | "flipper"`]. Add the element after the drain:

```ts
// UI-SPEC recommended values; the drawn post reads el.circle.radius, the same field.
{ id: 610, kind: "post", center: { x: PLAYFIELD_CENTER_X, y: 5.8 }, radius: 0.09, sensor: true },
```

**Compile-forced updates** when the kind is added:
- `FLASH_TIMING: Record<ElementKind, ...>` [VERIFIED: src/render/flash.ts:47]
- `KIND_STYLE: Record<ElementKind, ...>` [VERIFIED: src/sandbox/debug-draw.ts:96-107]
- `bakeStatic`'s `never` default. Add `case "post": continue;`, because the post is drawn live [VERIFIED: src/render/static-layer.ts:246-248]

`classifyContact` maps any non-ball, non-flipper kind to `"ball-wall"`, so the bus needs no change [VERIFIED: src/physics/planck-world.ts:183-194].

**Probe facts** (this session, real table):
- **No physics perturbation.** Inserting the 610 sensor (before the flipper mounts, as `buildTable` does) left all 81 charge-step first switches identical and every 900-step final state bit-identical.
- **Center drains reach the post with drooped bats.** 16/16 seeded dead-flipper drops (seed 0x0403, OPEN_FIELD_REGION x, y 3.6–4.0) rolled off a drooped tip and overlapped the post sensor at a ball center near (1.40–1.52, 5.52–5.54). The ball was moving at about (±1.3, +1.3) m/s and the normal was n ≈ (±0.2, −1.0), always upward.
- **Speed bounds.** With the bumper kick law at a 5.5 m/s target, every drop subsequently drained with one save each, peak 7.44 m/s. At a 4.0 m/s target the peak was 6.97 m/s. At a 20 m/s target the peak was 19.96 m/s, which breaks the existing `ENERGY_MAX_SPEED = 15` bound: a usable RED control.
- **No same-step drain and no downward normal** occurred in these drops.

**Trough exclusion (D-07)**, computed from the spec:
- `LEFT_TROUGH` runs (0.62, 5.62) → (1.05, 6.4) [VERIFIED: src/table/spec.ts:302-305]. A ball rolling down that wall has its center about 0.2 m off the wall, at x ≈ 0.95 near y = 5.8.
- The post sensor only begins contact when the ball center is within 0.09 + 0.20 = 0.29 m of (1.45, 5.80), which means x ≥ 1.16. That leaves about 0.2 m of clearance.
- Trough-runners therefore never touch the sensor and fall to the backstop. This is [ASSUMED]: computed geometry, not probed.

**Kicker in `ReactiveElements`:**
1. Add a `post` record built from the `"post"` element: center plus `targetSpeed = KICKBACK_SPEED`.
2. In `onEvent`, handle `kind === "post"` before the bumper/sling branch. A sensor reports `normalImpulse` 0 and `point` = ball center [VERIFIED: src/physics/planck-world.ts:389-393, 426-431].
3. Run these checks in order:
   - `gate.isLive()`
   - `e.point.y < post.cy`, i.e. the ball is above the post center, so the normal has an upward component (Pitfall 6)
   - `hooks.trySave(e.ballId)`
   - then set `pendingBall`
4. `service()` applies the existing kick law unchanged: normal from the post center to the ball center, raise `vn` to the target, keep the tangential component [VERIFIED: src/game/reactive-elements.ts:313-337].

`KICKBACK_SPEED` starts at **5.5 m/s** (probe-bounded) and is tuned by feel.

**`BallSave` rule** (session-owned):
- `arm()` on each next-ball serve and on game start. It is **not** called on the backstop re-serve.
- The timer starts on the first `tick()` where the active ball's `x + BALL_RADIUS_M < CHUTE_X` (Pitfall 3).
- `BALL_SAVE_STEPS = 840` (7 s, discretion).
- Blink when `remaining <= 240`.
- Disarmed on tilt and game over.
- `trySave` returns true only if the save is armed and the ball is the active one, and marks the save spent with `kind = "kickback"`.

Lamp phases: `off | steady | blink`. Steady covers both "armed, ball in chute" and "running with more than 240 steps left".

### Pattern 5: Screen shake on the step clock (PLSH-01)

- **Nudge kick, closed form, no integrator.** A kick at step `k0` with direction `d = −NUDGE_DIRS[dir]` (the view moves opposite the ball impulse, per UI-SPEC):
  `x(t) = A·e^(−ζωt)·sin(ω_d·t)`, where:
  - `t = (step + alpha − k0)·FIXED_DT`
  - `ω = 2π·8`
  - `ζ = 0.55`
  - `ω_d = ω·√(1−ζ²)`
  - `A = 6 CSS px / 0.4355 ≈ 13.8 CSS px` (× dpr)
  - Derivation: the peak is reached at `ω_d·t = atan(ω_d/(ζω)) ≈ 0.988 rad`, where `e^(−0.651)·sin(0.988) ≈ 0.4355`.
  - The envelope rate `ζω ≈ 27.6/s` gives about 1% amplitude after 0.17 s. That fits "a single shove-and-settle of about 0.25 s" and the 30-step nudge cooldown, so a new kick simply **replaces** the old one. [ASSUMED: derived math, verify with a unit test asserting the peak at 6 ± 0.1 px.]
- **Trauma.**
  - `trauma` is decremented by `1.5·FIXED_DT` per `tick()`, clamped to [0, 1].
  - Increments: tilt +0.70, drain +0.25, bumper +0.12·s, sling +0.08·s, bank 0.
  - Offset = `8·dpr·trauma(step+alpha)²·n(t)`, where each axis of `n(t)` is the mean of two sines (x: 13.1 and 19.7 Hz; y: 15.3 and 22.9 Hz) at the continuous `t = (step+alpha)·FIXED_DT`, with fixed phases.
  - Squaring trauma follows Eiserloh's GDC 2016 trauma model [CITED: gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing; implementation convention confirmed via bevy.org/examples/camera/2d-screen-shake/].
- **Output:**
  - `shakeX = round(clamp(kickX + traumaX, ±12·dpr))` in device px. Rounding keeps the neon lines crisp (UI-SPEC).
  - Exactly 0 when `reducedMotion` is set (D-18).
  - Sampled once per `draw()` into two private numbers. Use a method writing into preallocated fields, never a returned object.
- **Inputs:**
  - bumper/sling via `FxSink.kick(...)` from `CueFeedback`
  - tilt/drain/nudge via `PresentationObserver`
  - Nudge needs read-only `GameSession` counters `getNudgeCount()` and `getLastNudgeDir()`. This is the same pattern as `PlungerController.getReleaseCount()` (STATE 05-05) [VERIFIED: src/control/plunger-controller.ts:188-199].
- **Renderer:** compute `this.tx = view.offX + shakeX` and `this.ty = view.offY + shakeY` once per frame. Replace all four `ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY)` sites with a private `resetWorld()`: the frame start, the flipper flash, `drawFlippers` and `drawBalls` [VERIFIED: src/render/table-renderer.ts:321, 433, 486, 551]. Blit the static layer at `(shakeX, shakeY)` after `fillRect` with `BG_BOTTOM` at identity.

### Pattern 6: Particle pool (PLSH-02)

- **Storage:** struct-of-arrays `Float32Array`s of length 160, one array per field:
  - `x, y, px, py, vx, vy, age, life, size`
  - plus `Uint8Array type`
- **Overwrite:** a ring `head` overwrites the oldest slot. `alive` is `age < life`.
- **Emission:** happens on the step path only. The bumper and sling emitters run inside the bus dispatch (through `CueFeedback`); sensor glints and save sparks run from the observer. Emission draws from a dedicated `mulberry32(PARTICLE_SEED)` stream, so particle visuals are identical at every render cadence.
- **Seeding:** set `px = x` at spawn, so the first drawn frame starts at the emitter.
- **`tick()`, once per step:**
  - copy `x,y` → `px,py`
  - `v *= (1 − drag·dt)`, `vy += g·dt`
  - `x += v·dt`, `age += dt`
- **Contact point:**
  - `ReactiveFeedback.onKick` currently receives no point:

    ```ts
    // Source: src/game/reactive-elements.ts:76-79
    export interface ReactiveFeedback {
      onKick(kind: "bumper" | "slingshot", elementId: number, normalImpulse: number): void;
      onSensor(kind: "rollover" | "lane", elementId: number, bank: boolean): void;
    }
    ```

  - Extend `onKick` with scalar `px, py`. The listener already holds `e.point`.
  - The bumper outward normal is `(p − c)/|p − c|`, with `c` taken from the element geometry, which `EffectsTracker` precomputes from `getElements()` at construction.
  - The sling normal is the per-id `deriveKickFace` normal, also precomputed.
- **Draw:** an index loop per type under `"lighter"`, with each fixed color string assigned once per type. Streaks are a `moveTo/lineTo` per particle, with `globalAlpha = (1 − age/life)²`. Glints use a baked star sprite per color via `drawImage`.

### Pattern 7: Lamps (PLSH-04)

- **`LampTracker` state:**
  - `Float32Array prev` and `cur`, one slot per lamp, about 11 lamps:
    - 3 rollovers
    - 3 chevrons
    - 2 inlane arrows
    - 1 save ring
  - `update(src)` runs once per step:
    - compute each lamp's target (0 or 1) from rule state plus its own step counter
    - move `cur` toward the target by `+1/4` per step, or `−1/15` per step
    - copy `cur` into `prev` first, so the renderer can lerp at `alpha`
- **Blink and attract chase:**
  - Blink: `(lampStep % 60) < 30`, which gives 2 Hz. WCAG 2.3.1's limit is three flashes in any one second [CITED: w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html].
  - Attract chase: a ping-pong of 8 positions at an 18-step dwell, while the state is `"game-over"`.
- **Source interface:** the source is a new read-only `LampSource` built once in `main.ts` as a small adapter object (closures at boot are fine, but never inside `draw()`). It provides:
  - `isLit(id)` (rollovers, from `reactive`)
  - `getSkillLamp()`: lane id and phase
  - `isInlaneScored(id)`
  - `getSaveLamp()`
  - `getState()`

  Today's `LightState` is exactly `isLit(elementId: number): boolean` [VERIFIED: src/render/table-renderer.ts:68-70]. Extend or replace it per D-21, and keep `RenderFrame.lights` optional so old tests compile.
- **Awarded skill chevron:** steady for 60 steps after `getSkillShotCount()` increments. The tracker diffs the count, like the observer does.

### Pattern 8: Depth bake (PLSH-03)

**Static-layer order:**
1. Background
2. **Light pool** (`"lighter"` radial gradient)
3. Per element: a **drop shadow** first (offset fill or stroke in `DROP_SHADOW`, bake-time `shadowBlur` allowed here only, then reset to 0), then the element
4. **Unlit lenses** for chevrons, arrows and the save ring, plus `LAMP_RIM`
5. **Vignette last**, at identity

`bakeStatic` already resets `shadowBlur` to 0 before it returns, and the existing test asserts it [VERIFIED: src/render/static-layer.ts:253, static-layer.test.ts:92].

**Ball shadow:** `bakeShadow(layers, sizePx)` in `sprites.ts`. The radial stops are `SHADOW_CORE` → `rgba(0,0,0,0.25)` at 50% → `SHADOW_FADE`. Draw it in world meters with `drawImage(shadow, b.x+0.06−0.25, b.y+0.09−0.25, 0.5, 0.5)`, after the plunger and before the balls.

### Pattern 9: HUD count-up and status priority (PLSH-06, D-14)

- **Count-up input:** `HudView.update(src, dtSeconds, reducedMotion)` with `dtSeconds = steps·FIXED_DT`, where `steps` is the value `loop.advance` already returns in `frame()`. This puts the chase on the step clock: it freezes on tab blur and is deterministic in tests [VERIFIED: src/sandbox/main.ts:408].
- **Count-up rules:**
  - `shown += (target − shown)·(1 − exp(−dt/0.2))`
  - snap if `|target − shown| ≤ 10`, if `target < shown` (new game: no countdown), or if `reducedMotion`
  - write `#hud-score` only when `Math.round(shown)` changes
- **Status line:** compute a small integer **status code** plus a numeric arg from the session getters, following the UI-SPEC priority table. Build the string only when `(code, arg)` changes, so steady frames build no strings.
  - Transient expiry compares `session.getStep()` against `last*Step + duration`, all on the fixed step.
  - Today's `statusText` signature is `(state, hasPlayed, warning)` [VERIFIED: src/ui/hud.ts:71-80]. Replace it with `statusText(code, arg)`.
- **`#hud-best` and the bonus overlay rows:** written through the existing `TextSink`. Visibility and the `data-new` pulse go through a new injected `AttrSink { setAttribute(n, v); removeAttribute(n) }`, which `HTMLElement` satisfies structurally. That keeps them node-testable.

### Pattern 10: High score (PLSH-08)

```ts
// src/game/high-score.ts (recommended shape)
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export const HISCORE_KEY = "flippers.hiscore.v1";            // D-15, locked string
export function parseBest(raw: string | null): number {      // D-16
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}
export class HighScore {
  private best: number;
  constructor(private readonly storage: StorageLike | null) {
    let raw: string | null = null;
    try { raw = storage ? storage.getItem(HISCORE_KEY) : null; } catch { raw = null; }
    this.best = parseBest(raw);
  }
  getBest(): number { return this.best; }
  /** Game over only. Returns true on a new best; the in-memory best always updates. */
  submit(score: number): boolean {
    if (!Number.isSafeInteger(score) || score <= this.best) return false;
    this.best = score;
    try { this.storage?.setItem(HISCORE_KEY, String(score)); } catch { /* QuotaExceededError etc: silent (D-16) */ }
    return true;
  }
}
// main.ts
function safeLocalStorage(): StorageLike | null {
  try { return window.localStorage; } catch { return null; }   // SecurityError on the getter itself
}
```

The `window.localStorage` getter throws `SecurityError` for opaque origins (`file:`, `data:`) or when policy blocks persistence, for example when cookies are blocked [CITED: developer.mozilla.org/en-US/docs/Web/API/Window/localStorage]. `setItem` throws `QuotaExceededError` when the quota is exhausted [CITED: developer.mozilla.org/en-US/docs/Web/API/Storage/setItem].

Inject `HighScore` (or a `{ submit, getBest }` slice) into `GameSession` as an optional argument that defaults to in-memory. That keeps the determinism tests storage-free.

### Anti-Patterns to Avoid

- **Presentation reading the `CueQueue` to trigger effects in the frame.** `audio.flush()` clears it, and frame-time RNG consumption breaks cadence-independence. Use the step-path `FxSink` instead.
- **Inferring a drain from `ball > prevBall`.** The bonus state delays the increment and the backstop never increments. Add `getDrainCount()`.
- **A positional `y < CHUTE_TOP_Y` "left chute" test.** It fires on weak plunges that fall back (probe: y min 1.849 < 1.9 at x = 3.150).
- **Calling `award()` for the bonus credit.** It is silently dropped because `isLive()` is false outside `"playing"`.
- **A new world write from `GameSession` for the kickback.** D-07 routes the kick through `ReactiveElements.service()`. `GameSession` writes only add/remove ball and nudge impulses, as today.
- **Building status strings every frame,** or `formatScore` on unchanged values. Keep write-on-change.
- **`Math.random` anywhere in rules or particles.** Audio jitter keeps its injected RNG, which is never a sim stream.
- **Using `ctx.save()`/`restore()` to undo the shake.** The renderer's contract is explicit resets. `save`/`restore` also hides state leaks from the recorder tests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seeded randomness for particles | A new PRNG | `mulberry32` (src/harness/prng.ts) | Already proven deterministic and used by the starfield |
| Glow sprites | Per-frame radial gradients or `shadowBlur` | `bakeHalo(layers, hex, sizePx)` at resize | Frame contract (D-24), already tested |
| Step-clock decay | Wall-clock timers or `setTimeout` | The `FlashTracker` pattern (stamp step+1, read at `step + alpha`) | Freezes on blur and replays identically |
| Kick physics for the post | A new impulse formula | The existing `ReactiveElements.kick()` law | Energy-bounded by 04 gates and this session's probe |
| Contact routing | A second event drain | `CollisionRouter.register` | One drain per step, zero-copy |
| Rest detection | A duplicate speed or zone test | An exported `isRestingInZone` from `plunger-controller.ts` | One threshold, one meaning |
| Score formatting | A new formatter | `formatScore` (`Intl.NumberFormat("en-US")`, built once) | Copy rules in UI-SPEC |
| Storage access | Direct `localStorage` calls scattered around | `HighScore` over `StorageLike` | D-16 guards in one place, node-testable |

**Key insight:** every hard part of this phase (determinism, zero allocation, energy bounds) already has a proven local pattern. Bespoke code is where the regressions will come from.

## Common Pitfalls

### Pitfall 1: Bonus credit silently dropped
**What goes wrong:** the tally finishes but the score does not change.
**Why it happens:** `award()` returns early unless `state === "playing"`, and the credit runs in `"bonus"`.
**How to avoid:** use a private `credit()` with the same saturating integer guard, and credit before the serve flips the state back to `"playing"`.
**Warning signs:** a session unit test drains with rollover counts but the score is unchanged after `endsAt`.

### Pitfall 2: Drain cue, drain flash and drain trauma fire late or never
**What goes wrong:** the drain sound plays 2.2 s late (after the tally), or never plays on a backstop save.
**Why it happens:** `PresentationObserver` uses `prev !== "game-over" && (ball > this.prevBall || becameGameOver)` [VERIFIED: src/sandbox/presentation-observer.ts:130-134].
**How to avoid:** add `getDrainCount()` to `GameSession` (incremented on every drain of the active ball, saved or not) and diff it. Update the observer tests (155-185) accordingly.
**Warning signs:** a presentation.determinism tally shows a drain count of 0 while the ball number advanced.

### Pitfall 3: Save timer starts at the wrong time
**What goes wrong:** the save starts while the ball is still in the lane, or never starts in tests.
**Why it happens:**
- `y < CHUTE_TOP_Y (1.9)` is crossed by a weak plunge that falls straight back (probe N=40: min y 1.849, x stayed 3.150).
- Spy worlds in `game-session.test.ts` report every ball at (0, 0) (`spyBall` → `x: 0, y: 0`), so any positional rule fires on the first tick [VERIFIED: src/game/game-session.test.ts:111-114].

**How to avoid:**
- Use `x + BALL_RADIUS_M < CHUTE_X`. Probe: every launching charge crossed it 83–128 steps after release, and no ball re-entered the chute. Export `CHUTE_X` from spec.ts, where today it is `const CHUTE_X = 2.9;`, a non-exported module const [VERIFIED: src/table/spec.ts:185].
- Give `GameSession` an options object with production defaults from `tuning.ts`: `{ ballSaveSteps, bonusEnabled }`. Legacy FSM tests that check drain → serve semantics pass `ballSaveSteps: 0`, and a `finishBonus(rig)` helper ticks past the tally. New tests cover the production defaults.

**Warning signs:** `"a drain of the active ball removes it BEFORE serving the next, then ball 2"` fails with ball still 1.

### Pitfall 4: Infinite saves through the backstop re-serve
**What goes wrong:** the player can never lose a ball inside the save window.
**Why it happens:** D-09 says both "Re-arms on every serve" and "One save per ball". If the backstop re-serve counts as a serve, the save re-arms forever.
**How to avoid:** a backstop re-serve is not a new ball. The save stays spent, the bonus counters carry over, the ball number is unchanged and the skill shot is **not** re-armed. [ASSUMED: interpretation, confirm at plan-check; low risk.]
**Warning signs:** a repeated-drain unit test keeps the ball number at 1.

### Pitfall 5: Post kick and drain on the same step
**What goes wrong:** the save is consumed by the kickback, but the ball drains in the same step and is lost.
**Why it happens:** sensor begin-contacts for the post (center y ≤ 6.09) and the drain (rim overlap at center y ≥ 5.85) can both fire in one step for a fast, near-tangent ball. `reactive.service()` kicks, then `session.service()` removes the ball [VERIFIED: src/sandbox/main.ts:285-294].
**How to avoid:** `trySave` records `savedAtStep`. In `service()`, a drain with `savedAtStep === step` is treated as a backstop save (the ball is not lost, still one save). This session's probe saw 0 such cases in 16 drops, but the window exists geometrically.
**Warning signs:** a unit test that delivers post and drain events in one batch costs a ball.

### Pitfall 6: Kick pointing downward
**What goes wrong:** a ball overlapping the post below its center is "kicked" into the drain.
**Why it happens:** the bumper law's normal runs post center → ball center, so a ball below the center gets a downward normal, and "raise vn to target" accelerates it into the drain.
**How to avoid:** gate on `e.point.y < post.cy` (the sensor event point is the ball center) before `trySave`. Otherwise the ball falls to the backstop. The probe saw 0 downward normals.
**Warning signs:** a ball-save sting plays with no visible bounce.

### Pitfall 7: Renderer frame-contract tests break, by design
**What goes wrong:** several existing tests assert Phase 5 specifics [VERIFIED: src/render/table-renderer.test.ts:40, 117-132, 201-226, 313-326]:
- `HALO_LAYERS = 2`, and `createCount` = 1 + 2 (sprite count)
- `calls[1]` is the static `drawImage` at (0, 0), plus "exactly one drawImage"
- a `ROLLOVER_LIT` stroke
- "blits only the static layer"

**Why it happens:** the new draw order adds `fillRect`, a shadow sprite `drawImage` per ball, a lamp pass and more baked sprites.
**How to avoid:** the plan updates these assertions explicitly in the same task as the renderer change. Keep the invariants and change the literals:
- the first call is an identity `setTransform`
- the static blit lands at the rounded shake offset
- no gradient, no blur, no text
- clean end state

**Warning signs:** a red test "fixed" by deleting it rather than re-pinning it.

### Pitfall 8: Shake desynchronizes layers
**What goes wrong:** bats or balls "swim" against the table during a tilt shake.
**Why it happens:** one of the four `setTransform` resets kept `view.offX/offY` without the offset.
**How to avoid:** use a single `resetWorld()` helper. A recorder test asserts that every world `setTransform` in a shaken frame carries the same (e, f), and that the blit `drawImage` uses `(shakeX, shakeY)`.

### Pitfall 9: Vignette moves with the shake, and the edge strip color
**What goes wrong:** the vignette is baked into the static layer, so it shifts with the blit. The uncovered edge strip is unvignetted `BG_BOTTOM`.
**Why it happens:** this is a deliberate D-20 trade-off.
**How to avoid:** nothing at plan time. Flag it for the perceptual UAT. A visible issue there is the trigger for the deferred "live vignette overlay".

### Pitfall 10: Game tests and determinism scripts drift
**What goes wrong:** `game-e2e "plays a full 3-ball game"` and the determinism scripts assume an immediate serve after a drain. The save backstop can also keep the ball number from advancing.
**How to avoid:**
- In determinism tests the comparison is relative, so cadence equality still holds. Re-check the non-vacuity assertions (`ball >= 2`, `sawTilt`). In the scripted timeline, ball 1 is tilted at about step 496, which disarms the save, so ball 1 still costs a ball.
- In e2e tests, tick through the tally. Where a test drains a launched ball to reach game over, either wait out `BALL_SAVE_STEPS` or set `ballSaveSteps: 0` through the session options.

## Code Examples

### Lamp level update (FlashTracker-style, allocation-free)

```ts
// Pattern source: src/render/flash.ts (step-clock decay). Fade rates per UI-SPEC: in 4 steps, out 15.
update(src: LampSource): void {
  this.step++;
  const blinkOn = this.step % BLINK_PERIOD_STEPS < BLINK_PERIOD_STEPS / 2; // 60 → 2 Hz
  for (let i = 0; i < LAMP_COUNT; i++) {
    this.prev[i] = this.cur[i] ?? 0;
    const target = this.targetOf(i, src, blinkOn) ? 1 : 0;
    const c = this.cur[i] ?? 0;
    this.cur[i] = target > c ? Math.min(1, c + 1 / 4) : Math.max(0, c - 1 / 15);
  }
}
level(i: number, alpha: number): number {
  const p = this.prev[i] ?? 0;
  return p + ((this.cur[i] ?? 0) - p) * alpha;
}
```

### Shaken frame start (replacing table-renderer.ts:319-321)

```ts
// The existing first three lines are:
//   ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer.canvas, 0, 0);
//   ctx.setTransform(view.scale, 0, 0, view.scale, view.offX, view.offY);
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.fillStyle = BG_BOTTOM;                       // "#0b0420" [VERIFIED: src/render/palette.ts:12]
ctx.fillRect(0, 0, view.backingW, view.backingH);
this.shake?.sample(frame.alpha, view.dpr, this.reducedMotion, this.shakeOut); // writes shakeOut.x/.y, no alloc
const sx = this.shakeOut.x, sy = this.shakeOut.y; // already rounded device px
ctx.drawImage(layer.canvas, sx, sy);
this.tx = view.offX + sx; this.ty = view.offY + sy;
this.resetWorld();                               // ctx.setTransform(view.scale, 0, 0, view.scale, this.tx, this.ty)
```

### Values the code above and the tests depend on, quoted from source read this session

```ts
// src/physics/constants.ts:48, 85, 235, 238
export const BALL_RADIUS_M = 0.2;
export const FIXED_DT = 1 / 120;
export const PLUNGER_CHARGE_RATE = 1.5;
export const PLUNGER_MAX_CHARGE = 1;
// src/table/spec.ts:185, 188, 195, 201, 293
const CHUTE_X = 2.9;
const CHUTE_TOP_Y = 1.9;
export const DRAIN_Y = 6.05;
export const PLUNGER_REST: Vec2 = { x: 3.15, y: 6.2 };
const LEFT_PIVOT: Vec2 = { x: 0.69, y: 5.45 };
// src/game/tuning.ts:24, 127-131
export const BUMPER_KICK_SPEED = 5.5;
export const NUDGE_DIRS: Readonly<Record<NudgeDir, Vec2>> = {
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
};
// src/render/sprites.ts:12, 15
export const HALO_SCALE = 2.4;
export const SENSOR_HALO_M = 0.18;
// src/render/flash.ts:36
export const FLASH_BUMPER: FlashTiming = Object.freeze({ holdSteps: 2, decaySteps: 10 });
// src/app/cue-queue.ts:27-40 (13 kinds today; CUE_KINDS length pinned at 13 in cue-queue.test.ts:165-171)
export type CueKind = "bumper" | "slingshot" | "rollover" | "lane" | "bank" | "flipperUp"
  | "flipperDown" | "launch" | "drain" | "tilt" | "warning" | "start" | "gameOver";
```

**New `CueKind`s (5):** `"nudge"`, `"skillShot"`, `"ballSave"`, `"highScore"` and `"bonusTick"`, which brings the total to 18.
- The nudge direction travels in `elementId` as an index: left 0, right 1, up 2. Today's `Cue` carries only `kind`, `elementId` and `strength` [VERIFIED: src/app/cue-queue.ts:60-65].
- `RECIPES: Readonly<Record<CueKind, CueRecipe>>` makes a missing recipe a compile error [VERIFIED: src/audio/recipes.ts:109].
- Update the pinned counts in `cue-queue.test.ts:165` and `voice-pool.test.ts:69`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Random-offset screen shake proportional to hit strength | Trauma model: shake ∝ trauma² × smooth noise, with trauma decaying linearly | Popularized by GDC 2016 (Eiserloh) | Light hits barely move the view and big events read clearly. UI-SPEC adopts it. [CITED: gdcvault.com/play/1023146] |
| `MediaQueryList.addListener` | `addEventListener("change", …)` | Long-standing; `addListener` is deprecated | The repo already uses `addEventListener` for the dpr watch [VERIFIED: src/sandbox/main.ts:341] |

**Deprecated/outdated:** none relevant to this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Trough-runners never overlap the post sensor (about 0.2 m clearance), computed from `LEFT_TROUGH` and ball radius, not probed | Pattern 4 | A trough ball could get kicked into a bat underside. Mitigation: a unit/probe test dropping balls along the trough walls asserting no post event |
| A2 | Closed-form kick peak factor 0.4355 gives a 6 px peak at A ≈ 13.8 px | Pattern 5 | Wrong amplitude, caught by a unit test asserting the peak |
| A3 | A backstop re-serve does not re-arm the save or the skill shot and keeps the bonus counters | Pitfall 4 | Infinite saves, or lost bonus counts. Confirm with the user at plan-check |
| A4 | A drain on the same step as a consumed kickback counts as a (backstop) save | Pitfall 5 | Rare lost ball on a save. Low impact |
| A5 | `BALL_SAVE_STEPS = 840` (7 s), `KICKBACK_SPEED = 5.5 m/s`, `ROLLOVER/INLANE` bonus units 1,000/2,000 (from UI-SPEC's example rows) | Patterns 3–4 | Feel only. Tune at UAT |
| A6 | The skill-shot rotation resumes from the frozen lane after a fall-back | Pattern 2 | Feel only |
| A7 | The trauma-squared convention is attributed to Eiserloh's talk via secondary sources (Bevy, Godot recipes). The talk was not transcribed | Pattern 5 | None: UI-SPEC already locks the formula |

## Open Questions

1. **Does a backstop save re-arm anything?**
   - What we know: D-09 says one save per ball, re-armed on every serve.
   - What's unclear: whether the backstop re-serve counts as a "serve".
   - Recommendation: it does not (A3). Note it in the plan's must-haves so plan-check surfaces it.
2. **Drain sound on a backstop save?**
   - What we know: the observer will push `drain` from the drain counter, then `ballSave`.
   - Recommendation: keep both. Real machines sound the drain and then the save. Adjust at UAT if it feels noisy.
3. **Where the high-score submit lives.**
   - Recommendation: `GameSession` calls the injected `HighScore.submit` once on entering `"game-over"` from the bonus end, and records `newBest` plus `gameOverStep` for the HUD priority-4 line. It stays out of `main.ts`, so the determinism tests cover it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vitest, tsc, vite | ✓ | v26.13.1 | — |
| npm | scripts | ✓ | 11.10.0 | — |
| TypeScript | `npm run typecheck` | ✓ | 5.9.3 (pinned) | — |
| Vitest | tests | ✓ | 4.1.10 | — |
| Vite | build | ✓ | 8.1.4 | — |
| Browser with `localStorage` / `matchMedia` | runtime | (UAT machine) | — | `HighScore` in-memory, reduced motion defaults to false |

**Baseline this session:** `npm test` gives **52 files, 891 tests, all passed, 18.65 s**.

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10, node environment |
| Config file | `vitest.config.ts` (excludes `**/*.gate.test.ts`), `vitest.gate.config.ts` (gates) |
| Quick run command | `npx vitest run src/<path>.test.ts` |
| Full suite command | `npm run typecheck && npm run lint && npm test` (~20 s today) |
| Gate command | `npm run soak` (≥ 600 s simulated per gate, excluded from `npm test`) |
| Build | `npm run build` (`tsc --noEmit && vite build`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLSH-01 | Trauma add/clamp/linear decay; kick peak 6 ± 0.1 CSS px and under 1% by 30 steps; exactly 0 under reduced motion; offset a pure function of (step, alpha) | unit | `npx vitest run src/render/shake.test.ts` | ❌ Wave 0 |
| PLSH-01 | A shaken frame: blit `drawImage` at (sx, sy), every world `setTransform` has `offX+sx`/`offY+sy`, `fillRect` with `BG_BOTTOM` first; reduced motion leaves (0, 0) | unit (recorder) | `npx vitest run src/render/table-renderer.test.ts` | ✅ (extend) |
| PLSH-01 | An accepted nudge increments `getNudgeCount` with its dir; the observer pushes `nudge` with elementId dir and kicks the shake; a cooldown-rejected nudge pushes nothing | unit | `npx vitest run src/sandbox/presentation-observer.test.ts src/game/game-session.test.ts` | ✅ (extend) |
| PLSH-02 | Pool: 160 slots, overwrite oldest, typed-array lengths constant after 10k emits; bumper count `round(12+4s)`, sling `round(6+4s)`, glint plus 3–4 motes; alpha `(1−age/life)²`; same seed gives an identical state | unit | `npx vitest run src/render/particles.test.ts` | ❌ Wave 0 |
| PLSH-02 | `onKick` carries the contact point; a registered bumper kick emits from the rim point; a tilted (not live) hit emits nothing | integration (real table) | `npx vitest run src/sandbox/cue-pipeline.test.ts` | ✅ (extend) |
| PLSH-02 | Particle pass under `"lighter"`, no gradient or blur, ends clean | unit (recorder) | `npx vitest run src/render/table-renderer.test.ts` | ✅ (extend) |
| PLSH-03 | Bake: light-pool gradient after the background, a drop shadow before each bumper/sling/wall, vignette last with `VIGNETTE_*` stops, `shadowBlur` 0 on return, two bakes identical | unit (recorder) | `npx vitest run src/render/static-layer.test.ts` | ✅ (extend) |
| PLSH-03 | Shadow sprite drawn per ball at (+0.06, +0.09) m, after bats and before balls | unit (recorder) | `npx vitest run src/render/table-renderer.test.ts` | ✅ (extend) |
| PLSH-04 | Fade in 4 / out 15 steps; blink period 60 steps (≤ 2 Hz); attract chase order and 18-step dwell; UI-SPEC state map per FSM state (rotating, frozen, awarded, missed, save steady/blink, tilted) | unit | `npx vitest run src/render/lamps.test.ts` | ❌ Wave 0 |
| PLSH-04 | Lamp pass: lit lamp draws fill + halo (`"lighter"`) + hot-spot at level L; an unlit lamp draws nothing live | unit (recorder) | `npx vitest run src/render/table-renderer.test.ts` | ✅ (replace ROLLOVER_LIT case) |
| PLSH-05 | Rotation every 72 steps; freeze on charging; unfreeze on rest + idle; award 5k/10k/…/25k cap; any other switch disarms; tilt disarms; not armed by fall-back; reset on new game | unit | `npx vitest run src/game/skill-shot.test.ts` | ❌ Wave 0 |
| PLSH-05 | **D-05 anchor:** real table, serve, wait until 401 is lit, press, 62 `update()`s, release; the skill shot is awarded (score includes 1,000 + 5,000), with `getSkillShotCount() === 1` | integration (real table) | `npx vitest run src/sandbox/skill-shot-e2e.test.ts` | ❌ Wave 0 |
| PLSH-06 | Counters advance only on live registered rollover/inlane/bank; `"bonus"` lasts `48·rows+120` (60 when all zero); flipper press skips; credit at the end via `credit()`; tilted drain gives a 120-step hold with no credit; last ball goes bonus → game over | unit | `npx vitest run src/game/game-session.test.ts src/game/bonus.test.ts` | ✅ / ❌ Wave 0 |
| PLSH-06 | Count-up: τ chase on the step dt, snap ≤ 10, snap on new game (no countdown), snap under reduced motion, `getScore()` true; write only when the rounded value changes (CountingSink) | unit | `npx vitest run src/ui/hud.test.ts` | ✅ (extend) |
| PLSH-06 | `BonusView`: rows with n ≥ 1 laid out hidden, revealed per 48 steps, linear count, TOTAL last; `aria-hidden`; hidden outside the bonus state | unit | `npx vitest run src/ui/hud.test.ts` | ✅ (extend) |
| PLSH-07 | `BallSave`: timer starts at `x+r < CHUTE_X`, never on weak fall-back; 840 steps; blink ≤ 240; one save per ball; backstop re-serve keeps the ball number; tilt/game-over disarm; same-step kick and drain counts as a save | unit | `npx vitest run src/game/ball-save.test.ts src/game/game-session.test.ts` | ❌ Wave 0 / ✅ |
| PLSH-07 | Post kicker: kicks only when live, armed and ball above the center; bumper-law impulse magnitude; one kick per save | unit | `npx vitest run src/game/reactive-elements.test.ts` | ✅ (extend) |
| PLSH-07 | **Energy bound with save armed** (one save per drop): 12 seeded dead-flipper drops each get one post kick, all drain within 60 s, max ≤ 15 m/s; **RED control** at `KICKBACK_SPEED = 20` exceeds 15 m/s | integration (real table) | `npx vitest run src/game/reactive-table.test.ts` | ✅ (extend) |
| PLSH-07 | Rules-live swept containment with the save **always armed** (post sensor live), CCD-off RED and replay; full ≥ 600 s gate | soak | `npx vitest run src/harness/reactive-soak.test.ts` · `npm run soak` | ✅ (extend `ReactiveSoakWorld` with an always-armed hooks option) |
| PLSH-07 | Trough-runner never triggers the post (A1) | integration | `npx vitest run src/game/reactive-table.test.ts` | ❌ Wave 0 |
| PLSH-08 | `parseBest` (null, "", "abc", "-5", "1.5", "9007199254740993" → 0; "48250" → 48250); getter-throws gives in-memory; `setItem` throwing `QuotaExceededError` is silent with the best still updated; written only on a new best; key `flippers.hiscore.v1` | unit | `npx vitest run src/game/high-score.test.ts` | ❌ Wave 0 |
| PLSH-08 | `#hud-best` empty when best = 0 and during play; `HIGH SCORE n` at game over; `data-new` set on a new best and cleared at start; `NEW HIGH SCORE` for 360 steps | unit | `npx vitest run src/ui/hud.test.ts` | ✅ (extend) |
| D-23 | Rules bit-identical at 60/120/144 Hz with a script that exercises the skill shot (N=62 hold), a backstop or kickback save, a bonus skip and a tilt forfeit | integration | `npx vitest run src/sandbox/game.determinism.test.ts` | ✅ (extend script) |
| D-23 | Bare-vs-presented identical, with presented including shake, particles, lamps, new cues and `HudView` dt | integration | `npx vitest run src/sandbox/presentation.determinism.test.ts` | ✅ (extend) |
| D-24 | No asset files, no canvas text, no blur, no gradient in `draw()` | static/unit | `npx vitest run src/render/asset-free.test.ts src/render/table-renderer.test.ts` | ✅ |
| D-25 | 18 cue kinds, each with a distinct recipe | unit | `npx vitest run src/audio/recipes.test.ts src/app/cue-queue.test.ts` | ✅ (re-pin 13 → 18) |

### Sampling Rate
- **Per task commit:** the touched files' `npx vitest run <files>` plus `npm run typecheck`
- **Per wave merge:** `npm run typecheck && npm run lint && npm test`
- **Phase gate:** full suite + `npm run soak` + `npm run build` green before `/gsd-verify-work`. Then a perceptual UAT (shake subtlety, lamp look, post flourish, skill-shot band feel per D-02, 60 fps at 144 Hz)

### Wave 0 Gaps
- [ ] `src/render/shake.test.ts`: covers PLSH-01
- [ ] `src/render/particles.test.ts`: covers PLSH-02
- [ ] `src/render/lamps.test.ts`: covers PLSH-04
- [ ] `src/game/skill-shot.test.ts`, `src/sandbox/skill-shot-e2e.test.ts`: cover PLSH-05 and the D-05 anchor
- [ ] `src/game/bonus.test.ts`: covers PLSH-06 tally schedule
- [ ] `src/game/ball-save.test.ts`: covers PLSH-07 rule
- [ ] `src/game/high-score.test.ts`: covers PLSH-08
- [ ] `game-session.test.ts` helper `finishBonus(rig)` and a session options fixture (`ballSaveSteps: 0`) for the legacy FSM cases
- [ ] `ReactiveSoakWorld` option for an always-armed `RuleHooks`, for the PLSH-07 soak stress
- Framework install: none (Vitest present)

## Security Domain

`security_enforcement` is absent from `.planning/config.json`, so this section is enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (no accounts; online leaderboards are out of scope) |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | The `localStorage` value is untrusted input. Accept it only if `Number.isSafeInteger(n) && n >= 0`, else 0 (D-16). All HUD text goes through `textContent`, never markup [VERIFIED: src/ui/hud.ts header, "it assigns `textContent`, never parses markup"] |
| V6 Cryptography | no | — (`mulberry32` is explicitly non-crypto and never used for secrets [VERIFIED: src/harness/prng.ts:12-13]) |
| V7 Error Handling | yes | Storage exceptions are caught and silent, with no error UI and no logging of storage contents (D-16) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered `localStorage` best (huge, negative, NaN, script text) | Tampering | `parseBest` validation. Displayed through `formatScore` + `textContent` only |
| Storage blocked or throwing (sandboxed iframe, cookies blocked, quota) | Denial of Service | Try/catch on the getter and on `setItem`, with an in-memory fallback [CITED: MDN localStorage, Storage.setItem] |
| Photosensitive flashing from new blinks or particles | (Safety) | Blinks at most 2 Hz, under the 3 flashes/s limit [CITED: W3C WCAG 2.2 SC 2.3.1]. Nothing larger than its element's halo footprint (UI-SPEC) |
| Unbounded per-frame allocation or DOM churn | DoS (performance) | Preallocated typed arrays, write-on-change DOM, recorder tests |

## Sources

### Primary (HIGH confidence)
- **Codebase, read this session:**
  - `src/game/{game-session,reactive-elements,tuning}.ts`
  - `src/sandbox/{main,presentation-observer}.ts`
  - `src/render/{table-renderer,static-layer,sprites,flash,palette,contact-flash,interpolate,view-transform}.ts`
  - `src/app/cue-queue.ts`
  - `src/ui/hud.ts`
  - `src/table/{spec,resolve}.ts`
  - `src/control/plunger-controller.ts`
  - `src/physics/planck-world.ts` (sensor/circle/classify paths)
  - `src/harness/{reactive-world,soak(circles),prng}.ts`
  - `src/sim/loop.ts`
  - tests: `game.determinism`, `presentation.determinism` (header), `reactive-soak`, `reactive-table` (energy bound), `table-renderer`, `table-world`, `cue-queue`, `game-session` fakes
  - `index.html`
- **Probes on the real `TABLE_SPEC` this session** (Vitest, scratch config):
  - the 81-step charge → first-switch table, including D-05
  - chute-exit and fall-back geometry
  - post-sensor non-perturbation (81 steps, bit-identical finals)
  - one-shot kickback energy bound at 5.5/4.0/20 m/s over 16 seeded drops
- **Baseline `npm test`:** 52 files, 891 passed

### Secondary (MEDIUM confidence)
- MDN, Window.localStorage (SecurityError conditions): https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- MDN, Storage.setItem (QuotaExceededError): https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem
- MDN, prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- W3C, Understanding SC 2.3.1 Three Flashes or Below Threshold: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html

### Tertiary (LOW confidence)
- Eiserloh, GDC 2016 "Math for Game Programmers: Juicing Your Cameras With Math" (https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing). The trauma² convention was confirmed only via secondary implementations: https://bevy.org/examples/camera/2d-screen-shake/ and https://kidscancode.org/godot_recipes/3.x/2d/screen_shake/

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new dependencies, and every API was read in the repo.
- Architecture: HIGH. Each seam was read, and the riskiest physics claims (D-05, post inertness, kick energy bound, chute-exit test) were probed on the real table.
- Pitfalls: HIGH for the code-grounded ones (1, 2, 3, 5, 7, 8, 10). MEDIUM for the interpretation ones (4) and the geometry-only one (A1).

**Research date:** 2026-11-22
**Valid until:** 2026-12-22 (stable, in-repo; re-verify if `spec.ts`, `game-session.ts` or `table-renderer.ts` change before planning)
