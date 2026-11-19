# Pitfalls Research

> **Superseded framing (2026-11-19):** the project is now an original table. Space Cadet-specific layout, names, and mechanics below are background only, not targets.

**Domain:** Browser-based 2D pinball game — procedural rendering, custom real-time physics, Web Audio (Space Cadet clone)
**Researched:** 2026-07-15
**Confidence:** HIGH (physics + browser-loop pitfalls corroborated by Gaffer On Games, Box2D/Erin Catto CCD talk, Unity CCD docs, MDN; flipper-feel and Web Audio corroborated by domain sources)

> **Read this first.** For this project the make-or-break risk lives almost entirely in the physics core: **a fast ball tunneling through thin flippers/walls**, and **framerate-dependent instability**. Everything else (rendering, audio, scoring) is comparatively routine. The roadmap should prove the physics core as a vertical slice *before* building the table, and treat "ball can never escape and never jitters" as a hard gate.

---

## Critical Pitfalls

### Pitfall 1: Ball tunnels through thin walls/flippers at speed (THE #1 risk)

**What goes wrong:**
The ball is in front of a thin wall on one frame and past it on the next, so no overlap is ever detected and the ball escapes the table. This is *the* pinball failure mode. On a ~700px-tall table, a plunged or well-flipped ball can move **20–50+ px per 60fps frame**. A faithful wall or flipper edge is only **2–6px** thick. Discrete collision (check overlap once per frame) simply never sees the intersection.

**Why it happens:**
Naive collision detection only samples position at frame boundaries. Developers test with a slow ball (works fine), ship, then discover escapes only at high speed, on slow frames, or at thin joints/corners. Thin geometry + high speed + coarse timestep is the exact combination pinball demands, so this bites *harder here than in almost any other 2D game genre*.

**How to avoid (do all four; they compose):**
1. **Swept / continuous collision (CCD), not discrete.** Model the ball as a moving circle. Expand the wall by the ball radius (Minkowski sum) so the test becomes **ray/segment vs. segment**. Compute time-of-impact (TOI) along the ball's motion this step; if TOI < 1, advance the ball to the contact point, reflect the velocity, then continue with the *remaining* time in the same step (this "advance-to-TOI, reflect, repeat" loop also handles multiple bounces per step).
2. **Sub-step the physics.** Run the integrator at a high fixed rate (e.g. **240–480 Hz**, i.e. 4–8 sub-steps per rendered frame). Smaller displacement per step shrinks the tunneling window and keeps CCD cheap and robust.
3. **Give collision features real thickness / use capsule geometry.** Represent walls and flipper edges as line **segments with a radius** (capsules), never zero-width polylines. Thickness alone does *not* save you at speed, but combined with swept tests it makes near-miss/grazing contacts stable.
4. **Cap ball speed.** Enforce a max speed such that `speed * subStepDt < (featureThickness + ballRadius)` for the thinnest feature. This is the **governing invariant**: *max displacement per sub-step must stay below the smallest collision feature's half-thickness + ball radius.* Derive the speed cap and sub-step count from the thinnest wall in the table.

**Warning signs:**
Ball occasionally "disappears" or ends up outside the play area; escapes cluster at high speed, at wall joints/corners, or on frames after a hitch; ball count silently goes wrong because a "lost" ball wasn't a real drain.

**Phase to address:** Physics core (the very first spike — build ball + one thin wall and try to make the ball escape at max speed before anything else exists).

---

### Pitfall 2: Framerate-dependent physics / variable-timestep instability

**What goes wrong:**
Feeding the raw `requestAnimationFrame` delta straight into the integrator makes the simulation behave differently on every machine: it runs ~2× fast on a 120/144 Hz monitor (or, if you delta-scale but keep variable dt, springs and restitution behave inconsistently), physics "explodes" after a hitch, and results are non-deterministic. Large deltas after a stall cause the **spiral of death** (each big step needs more compute, falling further behind).

**Why it happens:**
`rAF` fires at the display refresh rate (60/75/120/144 Hz), and its callback frequency is *not* a stable physics clock. Variable-dt integration is fine for cosmetic animation but wrong for stiff collision physics, where step size changes energy and penetration behavior.

**How to avoid:**
Use the **fixed timestep + accumulator** loop (Glenn Fiedler, "Fix Your Timestep!"):
- Accumulate real elapsed time each frame; consume it in **fixed** chunks (e.g. `dt = 1/120` or `1/240` s), stepping physics 0..N times per rendered frame.
- **Clamp the frame delta** (e.g. max 0.25 s) *before* adding to the accumulator to prevent the spiral of death after tab-blur, a breakpoint, or a GC stall.
- **Render-interpolate** between the previous and current physics state using `alpha = accumulator / dt` for smooth visuals independent of the physics rate.
- Sub-stepping (Pitfall 1) and fixed timestep are the *same* loop — pick a fixed dt small enough to serve both stability and anti-tunneling.

**Note on determinism:** Full bit-exact determinism is *not* required for single-player pinball (no replays, no netcode) — don't over-invest in it. Framerate *independence* and *stability* are what matter here.

**Warning signs:**
Game speed differs across monitors; ball behaves differently in DevTools (throttled) vs. normal; physics blows up after alt-tab; "feel" changes when the tab is busy.

**Phase to address:** Physics core / game loop (fixed-timestep loop is foundational — build it before flippers or table).

---

### Pitfall 3: Fast-moving flipper passes *through* the ball (rotational CCD)

**What goes wrong:**
Even with perfect *ball* CCD, a flipper rotating at ~1000–1500 °/s sweeps a large arc between two physics steps. A ball sitting just above the flipper on one step is below the swept arc on the next — the flipper effectively "teleports" past it and never makes contact, so a fast flip whiffs or the ball slips through the flipper.

**Why it happens:**
Swept/linear CCD only handles **linear** translation of a body. It cannot represent a body that *rotates* about a pivot (this is a documented limitation of sweep-based CCD in Unity, Box2D, etc.). The flipper's contact edge has high linear velocity from angular motion, but the sweep never sees it.

**How to avoid:**
- **Sub-step the flipper's angular motion in lockstep with the ball** (same high-rate loop). At each sub-step, integrate the flipper angle a little, then do a **closest-point-on-segment (capsule) test** between ball and flipper edge. High sub-step rate keeps the per-step arc small enough that the capsule always catches the ball.
- Model the flipper as a **fat capsule** (segment + radius), never a thin line.
- Alternatively/additionally use **speculative contacts**: detect the ball is within a small margin of the flipper's swept region and resolve against the predicted contact. (This is the robust production technique when pure linear CCD can't represent rotation.)
- Make the flipper **kinematic (effectively infinite mass)** so the ball never displaces it; the flipper drives the ball, never vice versa.

**Warning signs:**
Fast flips let the ball pass through; can't reliably "catch" a ball on the flipper; flip outcome is inconsistent for the same incoming trajectory; the faster you flip, the more often it whiffs.

**Phase to address:** Flippers (angular sub-stepping must be designed in from the start of the flipper phase, not bolted on).

---

### Pitfall 4: Flipper feel is dead, weak, or unpredictable

**What goes wrong:**
The flip is unsatisfying: the ball dribbles off with no energy, or launches with a fixed speed regardless of where/when it was hit, or you can't hold a ball on a raised flipper ("cradle"), or a held ball jitters/sinks into the flipper. Feel is the stated core value of this project — get this wrong and "nothing else matters."

**Why it happens:**
- Treating the flipper as a **static reflector** (pure bounce) adds *no* energy → dead flips. Real flippers *add* kinetic energy from the moving surface.
- Adding a **fixed impulse** ignores the physics: launch speed should depend on contact distance from the pivot (`v = ω × r`) — hitting near the tip launches much faster than near the base.
- No explicit **flipper state machine**, so "held up" (cradle) isn't a stable resting surface and the ball buzzes.

**How to avoid:**
- On contact, **impart the flipper contact-point's linear velocity** (`v_contact = ω × r`, where `r` is the vector from pivot to contact) into the collision response, in addition to normal reflection. Farther from pivot ⇒ faster launch — this is what makes flips feel alive and skill-based.
- Drive the flipper with a **constant high angular velocity** toward its stops (Space Cadet–style flippers swing to a fixed up position); clamp at the end stops.
- Implement an explicit **state machine**: `resting` → `flipping-up` → `held-up (cradle)` → `returning` → `resting`. In `held-up`, the flipper is a solid kinematic surface; the ball rests on it via gravity + friction (a stable cradle), not a vibrating contact.
- Add a little **surface friction / spin** and a restitution slightly < 1 so cradling and controlled shots feel real.

**Warning signs:**
Flips feel mushy or weak; every flip launches the ball the same way regardless of contact point; can't trap/cradle; held ball jitters; backhand shots impossible.

**Phase to address:** Flippers → dedicated feel-tuning pass (budget explicit tuning time; this is the portfolio centerpiece).

---

### Pitfall 5: Physics instability — jitter, corner-sticking, energy gain/loss

**What goes wrong:**
A resting ball vibrates instead of sitting still. The ball gets stuck buzzing in an acute corner or pocket. The ball slowly *gains* energy and speeds up forever (or *loses* it and dies unrealistically). Overlap-resolution injects phantom velocity.

**Why it happens:**
- **Jitter:** gravity pushes the ball into a surface each step; collision pushes it out; the two fight every frame.
- **Corner-sticking:** two collision constraints (two walls of a sharp interior corner) alternately push the ball back and forth.
- **Energy gain:** restitution ≥ 1, or resolving penetration by adding velocity (instead of correcting position) pumps energy in each bounce; a ball that speeds up over time is a classic symptom and *also* makes tunneling worse.

**How to avoid:**
- **Separate position correction from velocity response.** Push the ball out of penetration along the contact normal (positional correction), *then* reflect velocity — never convert overlap into extra speed.
- Keep **restitution < 1** for walls (start ~0.4–0.6 and measure); verify total energy trends *down* absent active elements (flippers/bumpers).
- Add a small **velocity threshold / rest state**: below a threshold, damp to zero and let the ball settle (a lightweight "sleep") to kill jitter.
- **Round interior corners** (fillets) or build the table from **capsule/arc segments** so there are no infinitely sharp concave corners for the ball to lodge in.
- Resolve **one collision consistently per sub-step**; avoid double-resolving the same contact.

**Warning signs:**
Resting ball vibrates; ball trapped buzzing in a pocket; ball speed trends upward over a long session; energy readout (add a debug HUD) doesn't decay when it should.

**Phase to address:** Physics core (rest/jitter handling) + Table layout (corner geometry / fillets).

---

### Pitfall 6: Nudge/tilt implemented as a hack

**What goes wrong:**
Nudge is implemented by **teleporting the ball** (breaks physics, causes tunneling), tilt is either hair-trigger or never fires, there's no accumulation/decay so nudging can be spammed to "cheat" gravity, and tilt doesn't actually penalize the player (flippers stay live).

**Why it happens:**
Nudge/tilt is treated as a cosmetic afterthought rather than a physics event with its own small state, so it's bolted on with the crudest possible implementation.

**How to avoid:**
- Model nudge as an **impulse added to the ball's velocity** (directional: left/right/up), plus a small **visual table shift with spring-back** — never a position teleport.
- Maintain a **tilt meter** that increases with each nudge and **decays over time**. Crossing a warning threshold shows "TILT WARNING"; crossing the tilt threshold triggers **tilt**: disable flippers (they go dead), let the ball drain, and end the ball. This makes nudging a genuine risk/reward mechanic, matching the original.
- Rate-limit / accumulate so rapid nudging escalates toward tilt rather than granting free ball control.

**Warning signs:**
Ball jumps discontinuously on nudge; players can nudge endlessly with no penalty; tilt never triggers or triggers on the first tap; flippers still work after "tilt."

**Phase to address:** Nudge/tilt (after the core loop feels right — this is a layer *on top of* stable physics).

---

### Pitfall 7: requestAnimationFrame background/blur behavior drains or explodes the game

**What goes wrong:**
`rAF` is throttled/paused in background tabs. On return, the first frame's delta is huge — with an unclamped accumulator this teleports the ball (tunneling) or triggers the spiral of death. If the game doesn't pause on blur, the ball keeps draining while the player is away. The very first frame after load can also have a garbage/huge delta.

**Why it happens:**
Developers assume `rAF` ticks steadily. It doesn't when the tab is hidden, the laptop lid closes, or the machine sleeps.

**How to avoid:**
- **Clamp the per-frame delta** (Pitfall 2) — this alone prevents the teleport/spiral after a gap.
- **Pause the simulation** on `document.visibilitychange` (hidden) and/or window `blur`; on resume, **reset the accumulator** and re-baseline the timestamp.
- Use the **timestamp argument `rAF` provides**, not `Date.now()`/`performance.now()` snapshots taken elsewhere; guard the first frame (skip integrating on frame 0).

**Warning signs:**
Ball is gone or in a weird spot after alt-tab; game "fast-forwards" on return; ball drained while the tab was hidden; occasional huge jump right after page load.

**Phase to address:** Game loop / infrastructure (build clamping + pause-on-blur into the loop early, alongside Pitfall 2).

---

### Pitfall 8: Input handling — keydown auto-repeat, missed taps, page scroll, sticky keys

**What goes wrong:**
Using raw `keydown` to drive a flipper means the OS **key auto-repeat** fires repeated `keydown` events while held, re-triggering the flip continuously instead of a clean hold. Reading input only inside the render loop **misses fast taps** that happen between fixed steps. Spacebar/arrow keys **scroll the page**. After alt-tab, a `keyup` is lost and a key gets **stuck** (flipper frozen up).

**Why it happens:**
Browser keyboard events are event-driven and OS-mediated (repeat, focus loss), which doesn't match the "held button" and "sampled each tick" model games need.

**How to avoid:**
- Maintain a **key-state set** updated on `keydown`/`keyup`; **ignore `event.repeat === true`** so auto-repeat doesn't re-trigger flips.
- **Buffer edge events** (press/release) and **sample input at the start of each fixed physics step**, so a fast tap between renders still registers.
- Call **`preventDefault()`** on game keys (space, arrows) to stop page scroll.
- **Clear the key-state set on blur/visibility loss** so no key stays "held" after focus returns.

**Warning signs:**
Flipper stutters/retriggers while held; occasional missed flips on quick taps; page scrolls when playing; flipper stuck up after alt-tab.

**Phase to address:** Input layer (with Flippers).

---

### Pitfall 9: Web Audio clicks/pops, node leaks, and blocked-until-gesture context

**What goes wrong:**
Synthesized SFX **click/pop** on every hit (harsh, unprofessional). Over a long session, memory climbs from **leaked audio nodes**. On page load audio is **silent** (nothing plays) until something "unsticks" it. Too many simultaneous oscillators cause distortion and latency.

**Why it happens:**
- Setting `gain.value` directly (or ramping to exactly `0`) creates an instantaneous discontinuity → an audible click. Exponential ramps **cannot** reach 0.
- Creating nodes per sound and never `stop()`-ing/disconnecting leaks them.
- Browsers start the `AudioContext` **suspended** until a user gesture (autoplay policy), so audio scheduled before the first interaction is dropped.

**How to avoid:**
- **Envelope every sound.** Use `gain.setValueAtTime(current, now)` then `linearRampToValueAtTime`/`exponentialRampToValueAtTime` — ramp *to `0.0001`, not `0`* — for both attack and release. When retriggering, `cancelScheduledValues()` first, then re-anchor with `setValueAtTime`. Never assign `gain.value` directly in the hot path.
- **One-shot node pattern:** create oscillator + gain per hit, `start()`, schedule `stop()` at envelope end (nodes are GC'd after they stop). Keep a **single shared `AudioContext`** and a small master-gain graph; don't create a context per sound.
- **Resume the context on the first user gesture** (`audioCtx.resume()` on first keydown/click) to satisfy the autoplay policy.
- Budget simultaneous voices (cap concurrent oscillators; reuse a small voice pool for bumper spam) to avoid distortion/latency.

**Warning signs:**
Audible tick/click on each bumper/flipper hit; memory grows steadily during a long game; no sound until you click twice; audio distorts when many bumpers fire at once.

**Phase to address:** Audio synthesis (Web Audio) — but wire the "resume on first gesture" and shared-context pattern in from the first sound.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Discrete (non-swept) collision "for now" | Fast to write; works with a slow test ball | Guarantees tunneling once speed/thin walls arrive — the exact thing this game needs; forces a physics rewrite | **Never** for the ball/flipper core. Discrete is fine only for slow cosmetic particles. |
| Variable `rAF` delta into physics | Simplest possible loop | Framerate-dependent feel, blow-ups after hitches, 2× speed on 120/144 Hz | **Never** for physics. Fine for purely cosmetic tweens. |
| Use a full physics engine (Matter.js / Planck / Box2D-wasm) | Get bounces fast; less math | Generic engines share the rotational-CCD weakness (Pitfall 3) and Matter.js is known to tunnel fast/thin bodies; "feel" tuning through a black box is hard; portfolio value of hand-rolled physics is lost | Acceptable *only if* you can prove the flipper/ball feel and anti-tunneling through it; otherwise hand-roll the core. Legitimate tradeoff to evaluate early, not mid-project. |
| Redraw entire table procedurally every frame | Trivial render code | Wasted fill-rate; hard to hit 60fps once gradients/shadows are added | OK for the earliest spike; must move static geometry to a cached layer before the "juice" phase. |
| `ctx.shadowBlur` / `createRadialGradient` per frame for glow | Instant pretty glow | Very slow; kills 60fps on HiDPI | Never in the hot loop — pre-render glows to offscreen sprites. |
| Skip fixed-timestep, add it "later" | Ship a demo faster | Every physics tuning value you found is invalidated when you switch loops; re-tune from scratch | Never — the loop is foundational; retrofitting rebases all feel tuning. |
| Hardcode tuning constants inline | Quick | Feel tuning becomes archaeology | OK short-term; extract to a single tunables/config object before the feel pass. |

## Browser API Integration Gotchas

The "external services" here are browser APIs, not network services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `requestAnimationFrame` | Treating callback rate as a fixed 60Hz physics clock; using unclamped delta | Fixed-timestep accumulator; clamp delta; use the provided timestamp; pause on blur |
| Canvas 2D | Redraw everything each frame; ignore `devicePixelRatio` (blurry on HiDPI) or blindly scale by dpr (4× fill-rate on retina) | Layer static vs. dynamic; set backing store to `cssSize * dpr` but **cap dpr** (e.g. ≤2); dirty-rect where possible |
| Web Audio `AudioContext` | Created but suspended (autoplay policy) → silent; one context per sound | Single shared context; `resume()` on first user gesture |
| Web Audio `AudioParam` | `gain.value = x` or ramp-to-0 → clicks | `setValueAtTime` + ramp to `0.0001`; `cancelScheduledValues` on retrigger |
| Keyboard events | `keydown` auto-repeat retriggers actions; no `preventDefault` (page scrolls); stuck keys after blur | Ignore `event.repeat`; key-state set sampled per step; `preventDefault` game keys; clear state on blur |
| `performance.now()` vs. `rAF` timestamp | Mixing clocks; first-frame huge delta | Use the `rAF` timestamp consistently; guard frame 0 |

## Performance Traps

Patterns that work in an early spike but fail as the table, juice, and audio grow.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-frame allocations (new vectors/objects/arrays in the physics & render loop) | Periodic frame hitches (GC pauses); micro-stutter | Pre-allocate/mutate vectors; object pools for particles; no literals in hot loops | As soon as sub-stepping (4–8×/frame) multiplies allocations; worse with particle juice |
| Full procedural redraw of static table every frame | Can't hold 60fps once gradients/shadows added | Cache static table to an offscreen canvas / separate layer; only redraw ball, flippers, dynamic FX | When rendering complexity or HiDPI pixel count rises |
| `shadowBlur` / fresh gradients per frame | Sudden large frame-time spike when glow added | Pre-render glows/gradients to sprites once | Immediately on mid-range/integrated GPUs and HiDPI |
| Ignoring / over-applying `devicePixelRatio` | Blurry on retina, *or* 4× fill-rate tanks FPS | Backing store `= cssSize * min(dpr, 2)` | On any HiDPI/retina display |
| Unbounded simultaneous audio voices (bumper spam) | Distortion, clipping, rising latency | Cap concurrent oscillators; small voice pool | During bumper cluster hits / multiball-like moments |
| Leaked audio nodes (never stopped/disconnected) | Memory grows over a long session; eventual slowdown | One-shot nodes with scheduled `stop()`; reuse master graph | Over minutes of continuous play |

*Scale note: this game's "scale" is a **long single session on varied hardware (integrated GPUs, HiDPI, 60–144Hz)**, not many users. Optimize for sustained 60fps and zero GC hitches, not throughput.*

## Security / Data Mistakes

Minimal surface (no backend, no accounts in v1), so this is short and honest — don't over-invest.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Redistributing original MS/Cinematronics art or audio | Copyright violation (explicitly out of scope in PROJECT.md) | Procedural rendering + synthesized audio only, as already decided; keep the decompilation as a *behavior reference*, never an asset source |
| Trusting `localStorage` high scores as authoritative | Trivially editable — fine for a portfolio toy, not a leaderboard | Accept it for v1; do not build online leaderboards on unsigned client data |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visible plunger charge feedback | Player can't gauge launch power; feels random | Show a charging plunger/power meter while held; make power repeatable |
| Ball drain feels arbitrary / silent | Player doesn't understand why the ball was lost | Clear drain animation + sound + ball-count decrement; distinguish drain from a stuck ball |
| Flipper input latency | Game feels unresponsive (fatal for pinball) | Sample input at step start; keep input→flip latency to ~1 frame; resume audio context early so first hits sound |
| No "juice" on hits (bumpers/targets) | Feels flat despite correct physics | Flash + scale-pop + synchronized SFX + score popup on every reactive element |
| Tilt with no warning | Feels like a bug/punishment | "TILT WARNING" before the tilt threshold; visible tilt-meter feedback |
| Page scrolls / loses focus during play | Breaks immersion, drops inputs | `preventDefault` game keys; keep canvas focused; pause+overlay on blur |

## "Looks Done But Isn't" Checklist

- [ ] **Anti-tunneling:** Stress-test at max plunger power + fastest flips for 10+ minutes — ball **never** escapes the table; ball count never silently changes.
- [ ] **Framerate independence:** Verified identical speed/feel on 60Hz **and** 120/144Hz displays, and after alt-tab (no fast-forward, no explosion).
- [ ] **Flipper catch:** Ball can be **cradled/trapped** on a raised flipper without jitter, and cannot slip through on the *fastest* flip; backhand shots possible.
- [ ] **Flipper feel:** Launch speed varies with contact distance from pivot (tip vs. base) — not a fixed impulse.
- [ ] **Rest stability:** A ball resting in a pocket/lane sits still (no vibration) and doesn't gain energy over time.
- [ ] **Nudge/tilt:** Nudge is an impulse (no teleport); nudging can't be spammed for free control; tilt disables flippers; warning precedes tilt.
- [ ] **Drain reliability:** Ball resting exactly on the drain line doesn't oscillate in/out; drain fires cleanly, once.
- [ ] **Audio hygiene:** No clicks/pops on any hit; audio works after a fresh load (context resumed on first gesture); no memory growth / node leak over a long session; no distortion during bumper spam.
- [ ] **Input hygiene:** Held flipper doesn't retrigger (auto-repeat ignored); fast taps register; no page scroll; no stuck flipper after blur.
- [ ] **Rendering:** Holds 60fps on an integrated GPU and on a HiDPI display; no GC hitches over minutes of play.

## Recovery Strategies

When a pitfall slips through despite prevention.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Discovered tunneling after the table is built | HIGH | Retrofit swept CCD + sub-stepping into the core; re-derive speed cap from thinnest wall; re-tune restitution. Costly because table geometry and feel tuning depend on the collision model — this is *why* it must be proven first. |
| Variable-timestep loop shipped, feel is framerate-dependent | HIGH | Switch to fixed-timestep accumulator; **all** feel constants (restitution, flipper ω, gravity) must be re-tuned against the new step. |
| Flipper whiffs fast balls | MEDIUM | Add flipper angular sub-stepping + capsule closest-point test (or speculative contacts); raise sub-step rate. Contained to the flipper module if physics is modular. |
| Resting-ball jitter / corner-stick | MEDIUM | Add positional-correction/rest threshold; fillet the offending corners or convert to capsule/arc segments. |
| Audio clicks/leaks | LOW | Wrap all gain changes in the envelope helper; convert to one-shot nodes with scheduled stop; add context-resume. Localized to the audio module. |
| High-refresh 2× speed | LOW–MEDIUM | Already fixed by the accumulator; if not present, this is really the Pitfall 2 recovery. |

## Pitfall-to-Phase Mapping

Phase names are indicative (roadmap not yet created); ordering reflects "prove physics first."

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Ball tunneling | **Physics core spike (first)** — ball + one thin wall | Ball can't escape at max speed over a 10-min stress run |
| 2. Framerate-dependent instability | **Physics core / game loop (first)** | Identical speed on 60/120/144Hz; survives alt-tab |
| 3. Flipper passes through ball | **Flippers** | Fastest flip always contacts; no slip-through |
| 4. Flipper feel | **Flippers → feel-tuning pass** | Contact-point-dependent launch; stable cradle |
| 5. Jitter / corner-stick / energy | **Physics core + Table layout** | Resting ball still; energy trends down; no pockets trap |
| 6. Nudge/tilt hack | **Nudge/tilt (post core loop)** | Impulse not teleport; tilt disables flippers; warning shown |
| 7. rAF blur/spiral | **Game loop / infra (early)** | Pause on blur; no teleport/fast-forward on resume |
| 8. Input auto-repeat/scroll/stuck | **Input layer (with Flippers)** | No retrigger; taps register; no scroll; no stuck keys |
| 9. Web Audio clicks/leaks/gesture | **Audio synthesis** | No pops; resumes on gesture; flat memory over session |
| Rendering perf (overdraw/GC/dpr) | **Rendering + Juice phase** | 60fps on integrated GPU + HiDPI; no GC hitches |
| Scope creep (ECS/fidelity/missions) | **All phases — roadmap discipline** | Vertical slice works before frameworks; missions stay deferred |

## Scope & Portfolio Traps (project-specific)

- **Over-engineering an ECS/entity framework before the ball bounces.** A pinball table has a *fixed, small* set of entities (ball, 2 flippers, plunger, bumpers, walls). Building a generic ECS is pure ceremony. Build the **vertical slice** (ball + one wall + one flipper feeling right) first; add structure only when it earns its place.
- **Chasing pixel-perfect XP fidelity.** Explicitly out of scope in PROJECT.md — it burns time and reintroduces the copyright risk the procedural approach was chosen to avoid. Faithful *layout and behavior*, original clean *style*.
- **Building the mission/rank system before the core loop feels right.** Already deferred in PROJECT.md — reinforce it. The core value is the pinball loop; missions on top of mushy physics is wasted work.
- **Premature WebGL.** Canvas 2D easily renders one ball + table + modest particles at 60fps. WebGL adds real complexity; reach for it only if the "juice" phase demands heavy particle counts — and even then, measure first.
- **Reaching for a physics engine to skip the hard part.** Tempting, but the pinball-specific weakness (rotational flipper CCD) and the difficulty of tuning "feel" through a black box mean the engine may not save the day — and hand-rolled physics *is* the portfolio flex here. Evaluate this tradeoff **early** (Pitfall 3 / debt table), never mid-project.

## Sources

- Glenn Fiedler, "Fix Your Timestep!" — fixed timestep, accumulator, interpolation, spiral of death (canonical): https://gafferongames.com/post/fix_your_timestep/ (HIGH)
- Erin Catto (Box2D), "Continuous Collision" (GDC 2013) — TOI, swept collision, speculative contacts: https://box2d.org/files/ErinCatto_ContinuousCollision_GDC2013.pdf (HIGH)
- Unity Manual, Continuous Collision Detection & Sweep-based CCD — documents that sweep CCD handles linear, *not* angular (rotational) motion; recommends speculative CCD for rotation: https://docs.unity3d.com/6000.3/Documentation/Manual/sweep-based-ccd.html (HIGH)
- MDN, `requestAnimationFrame` — callback rate matches display refresh (60/120/144Hz); use the timestamp argument: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame (HIGH)
- MDN, `AudioParam.linearRampToValueAtTime` — ramping to avoid discontinuities: https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/linearRampToValueAtTime (HIGH)
- Alemangui, "Web Audio: the ugly click and the human ear" — clicks from direct gain changes; ramp-to-value, ramp to a tiny non-zero value: http://alemangui.github.io/ramp-to-value (MEDIUM)
- GameDev.net, "Flipper Physics" — imparting contact-point linear velocity (`v = ω × r`), launch speed vs. distance from pivot: https://gamedev.net/forums/topic/570191-flipper-physics/ (MEDIUM)
- Voxagon Blog, "Pinball physics" — sliding vs. rubber friction, linear↔angular momentum, flipper energy transfer: https://blog.voxagon.se/2016/02/25/pinball-physics.html (MEDIUM)
- The Pinball Spot, "The Physics of Pinball: Gravity, Momentum and Spin" — nudge/spin/momentum intuition: https://thepinballspot.com/pinball/physics-of-pinball/ (LOW–MEDIUM)
- MIT 6.005 Pingball spec — flipper rotates at constant 1080°/s; contact-point linear velocity added to bounce energy: https://web.mit.edu/6.005/www/sp14/projects/gb1/pingball-phase1-spec.html (MEDIUM)
- Domain/browser-game experience — Canvas layering, `devicePixelRatio`, per-frame allocation/GC, one-shot Web Audio node pattern, `keydown` auto-repeat & focus handling (MEDIUM, standard practice)

---
*Pitfalls research for: browser-based 2D pinball (procedural Space Cadet clone)*
*Researched: 2026-07-15*
