# Phase 6: Juice & Polish - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 takes the game from correctly functioning to portfolio-grade (PLSH-01..08). It adds the following on top of the existing Phase 1–5 table, physics, rules and presentation:

- feedback: screen shake, a nudge kick, particles and flares
- depth: ball shadow, baked shading, vignette
- glowing insert lamps with lit and unlit states
- four small rules:
  - a skill shot on launch
  - a center-post ball save with a timed-save backstop
  - an itemized end-of-ball bonus tally with a score count-up
  - a single local high score in `localStorage`

New table geometry, targets, multipliers, multiball, missions and settings UI are out of scope. The table has no targets. PLSH-02's "bumper/target hits" therefore means the elements that exist: bumpers, slingshots, rollovers and inlanes.

</domain>

<decisions>
## Implementation Decisions

### Skill shot (PLSH-05)
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

### Ball save (PLSH-07)
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

### End-of-ball bonus & score count-up (PLSH-06)
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

### High score (PLSH-08)
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

### Shake, particles, depth & lamps (PLSH-01..04)
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

### Cross-cutting
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` § Phase 6 — goal, the 5 success criteria, `**Mode:** mvp`
- `.planning/REQUIREMENTS.md` § Polish (PLSH-01..08), § v2 Requirements (BONUS-01 multiplier stays deferred), § Out of Scope (no settings UI, no online leaderboards, no save/resume)
- `.planning/PROJECT.md` — core value, constraints, Key Decisions table (DOM HUD, single world-write path, typed collision bus, one `table/spec`)

### Prior phase decisions that constrain this phase
- `.planning/phases/03-table-plunger-event-bus/03-CONTEXT.md` — D-01/D-02 (one `table/spec` → `resolve()` drives colliders and drawing), D-07 (impulse-on-release plunger, made deterministic for the skill shot)
- `.planning/phases/05-rendering-audio/05-VERIFICATION.md` — D-01 DOM HUD override, accepted presentation gates
- `.planning/phases/05-rendering-audio/05-RESEARCH.md` — renderer and audio architecture (baked static layer, flash pass, cue → voice pipeline)
- `.planning/phases/05-rendering-audio/05-UI-REVIEW.md` — palette, "one meaning per color", CSS custom properties

### Code that is the source of truth
- `src/table/spec.ts` — rollover ids 400/401/402 at `ROLLOVER_Y`, `CHUTE_X`/`CHUTE_TOP_Y`, `DRAIN_Y`, `LEFT_PIVOT`, drain sensor 600; the place for a new ball-save sensor element
- `src/control/plunger-controller.ts` — `getCharge()`, press and release edges (skill-shot freeze)
- `src/game/reactive-elements.ts` — `RulesGate` (`isLive`/`award`), `ReactiveFeedback`, the bumper kick law to reuse for the virtual post, rollover lit and bank rules
- `src/game/game-session.ts` — 3-ball FSM, drain → `service()`, `onNudge`; home of the `"bonus"` state, save, skill-shot arming
- `src/game/tuning.ts` — point values and rule constants (new skill-shot, save and bonus constants go here)
- `src/app/cue-queue.ts` — `CueKind` (add `nudge` + direction, and skill-shot, save and high-score cues)
- `src/render/table-renderer.ts` — `LightState`, `setTransform` reset sites, flash pass, `drawBalls` order
- `src/render/static-layer.ts` — bake-time shading, vignette, drop shadows, lens lamps
- `src/render/sprites.ts` — `bakeHalo`, `HALO_SCALE` (lamp halo, ball shadow, star glint sprites)
- `src/render/flash.ts` — `FlashTracker` step-clock decay pattern (copy it for lamps, shake, particles)
- `src/render/palette.ts` — color families
- `src/ui/hud.ts` — DOM HUD write-on-change, aria-live status line (count-up, tally, high score, BALL SAVED)
- `src/audio/recipes.ts` — synthesized cue recipes (new stings)
- `src/sandbox/game.determinism.test.ts`, `src/sandbox/presentation.determinism.test.ts`, `src/harness/reactive-table-soak.gate.test.ts` — gates that must stay green

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FlashTracker` / `flashLevel` (src/render/flash.ts): a preallocated, step-clock decay pattern. Copy it for lamp levels, the shake trauma and the particle pool.
- `bakeHalo` (src/render/sprites.ts): baked glow sprites, which give glow without per-frame `shadowBlur`. Use it for lamp halos, the ball shadow and the star glint.
- `ReactiveFeedback` (src/game/reactive-elements.ts): it already reports registered kicks and sensor passes, with the bank flag, to presentation. Particles and lamps hang off it.
- The bumper kick law in `ReactiveElements.service()` can be reused directly for the virtual center post.
- `deriveKickFace`: sling face normal for sling sparks.
- `isLit(elementId)` / `resetLights()`: the rollover lit state that the new lamps extend.
- `mulberry32` (src/harness/prng.ts): seeded PRNG for particle variation.
- `NUDGE_DIRS` (src/game/tuning.ts): direction vectors for the nudge kick.
- The HUD write-on-change pattern and the aria-live status line (src/ui/hud.ts).

### Established Patterns
- **Record-then-service:** bus listeners only record and award; `ReactiveElements.service()` is the only world writer.
- **Presentation is strictly read-only,** proven by the bare-vs-presented replay test.
- **Step-clock timing everywhere** (never wall-clock), so things freeze on tab blur and replays stay identical.
- **The live frame allocates nothing,** has no per-frame `shadowBlur`, and paints no canvas text; all text is DOM.
- **Every new collider or kick needs a seeded soak gate with a RED negative control.**
- Fixed 120 Hz step; rules are bit-identical at 60/120/144 Hz render cadences.

### Integration Points
- `GameSession` FSM: add the `"bonus"` state, skill-shot arming on serve, ball-save arming when the ball leaves the chute, and the backstop re-serve.
- `src/table/spec.ts`: one new circular sensor element for the virtual post, with the drawing reading the same radius.
- `CueKind` / `RECIPES`: new cues for nudge (with direction), skill shot, ball save and new high score.
- `TableRenderer`: shake offset at the blit and at every `setTransform`, the shadow pass, the particle pass, and the lamp pass.
- `static-layer.ts` bake: vignette, falloff, drop shadows, unlit lenses.
- `main.ts`: flipper-press latch to skip the tally, the reduced-motion boolean, high-score storage injection.

</code_context>

<specifics>
## Specific Ideas

- "Precise plunger charge over a lit lane" is meant literally. The table geometry already makes charge pick the lane, so the skill shot rewards a learned hold length, not a meter trick. A full plunge always orbits past the rollovers, which rewards restraint.
- The ball save should read as a real center-post kickback on a near-drain, not a re-serve. The re-serve is only a backstop so an armed save never feels broken.
- Lamps should read like real playfield plastic inserts lit from below: a dim tinted lens when off, a warm fading glow when on.
- Shake stays subtle. The nudge should feel like shoving the cabinet, and bumper chains should never become constant jitter.
- Every new effect is judged perceptually at UAT (placement, timing, lighting), not just by tests.

</specifics>

<deferred>
## Deferred Ideas

- High-score initials entry / Grand Champion plus top-N table (Williams convention). Considered and deferred because it needs a new input mode and FSM state.
- Bonus-ladder insert lamps. They only pay off once a bonus multiplier exists (v2 BONUS-01).
- Skill-shot geometry retune (D-02). Done only if UAT finds the 25–33 ms charge bands feel random.

</deferred>

---

*Phase: 06-juice-polish*
*Context gathered: 2026-11-22*
