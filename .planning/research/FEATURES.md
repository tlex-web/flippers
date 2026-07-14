# Feature Research

**Domain:** Browser pinball game (faithful clone of *3D Pinball for Windows – Space Cadet*)
**Researched:** 2026-07-15
**Confidence:** HIGH (core pinball mechanics + Space Cadet features cross-verified across StrategyWiki, GameFAQs, Neoseeker rule sheets; MEDIUM on a few exact point values and multiball version nuances)

## Overview

Pinball's feature set splits cleanly into two layers, which maps directly onto this project's v1/deferred boundary:

1. **The physical table + core loop** — plunger, flippers, ball, bumpers, drain, score, tilt. This is "what a pinball machine *is*." Every one of these is table stakes; a game missing any single one does not read as pinball. **This is v1.**
2. **The rules/progression layer** — Space Cadet's ranks, missions, multiball, hyperspace, gravity well, bonus multipliers, extra balls. This is "what makes *this specific table* Space Cadet." It sits *on top of* a working core loop and is almost pure state-machine/scoring logic once the physics exists. **This is deferred.**

The critical insight for the roadmap: the deferred layer has **near-zero physics risk** — it is event handlers reacting to collisions the core loop already reports. The entire technical crux (stable, non-tunneling physics + good flipper feel) lives in the table-stakes layer. Deferring progression is therefore the correct de-risking move: it defers *content*, not *risk*.

---

## Feature Landscape

### Table Stakes (v1 — Must Have or It Isn't Pinball)

Missing any of these makes the product read as "broken" or "not really pinball." No credit for having them; heavy penalty for absence.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Stable 2D ball physics** (gravity, momentum, restitution, friction/spin) | The ball *is* the game; wrong feel = nothing else matters (per Core Value) | HIGH | Fixed-timestep integration decoupled from render. Ball must feel *heavy*, not floaty — tune gravity scale + restitution carefully. Foundation for everything else. |
| **Continuous collision detection (CCD/swept)** | Ball must not tunnel through thin flippers/walls at speed | HIGH | The make-or-break risk called out in PROJECT.md. Swept circle-vs-segment / circle-vs-arc. Prove this first with a spike. |
| **Plunger with variable/charge power** | Standard ball launch; hold-to-charge is the expected verb | MEDIUM | Hold key → charge meter builds → release fires proportional impulse up the launch chute. Enables skill shot later. |
| **Two flippers (L/R), correct rotational physics** | The primary player verb; must transfer angular momentum to ball | HIGH | Kinematic rotating bodies. Tip moves faster than base (correct momentum transfer). Needs snappy response, end-of-stroke behavior, and "flipper cradle"/hold. Second-highest feel risk after CCD. |
| **Bumpers (pop/attack bumpers)** | Iconic pinball element; ball bounces off with added energy | MEDIUM | On contact: reflect + add impulse (kick) + flash + sound + points. Space Cadet has a cluster of 4 "attack bumpers" up top. |
| **Slingshots / kickers / rebounds** | Fast reactive bounces near the flippers; keep the ball alive and lively | MEDIUM | Angled walls that impart a kick impulse on contact (not passive bounce). Space Cadet has left/right rebounds near the flippers. |
| **Lanes + rollovers** | Ball rolls over a trigger → lights + points; core scoring texture | LOW-MED | Trigger zones the ball passes through. Rollovers toggle lights; lane sets (re-entry/launch lanes) are the scaffolding missions later hang off. |
| **Static walls / table geometry** (launch chute, ramps, outer walls, drain funnel) | Defines the playfield; recreates the Space Cadet layout | MEDIUM | Line segments + arcs. Recreate the *actual* Space Cadet layout (faithfulness is the point) — chute right side, bumper cluster top, ramps, drain center-bottom. |
| **Drain + ball-count game loop (3 balls)** | Losing the ball and "you have N balls" is the fundamental game structure | LOW | Drain zone at bottom detects lost ball → decrement count → serve next ball to plunger → game over after last. Simple state machine. |
| **Live scoring + score display** | Pinball is a score-chasing game; must see the number climb | LOW | Collision events emit points; HUD renders running total. Trivial once collisions report events. |
| **Tilt / nudge (with over-nudge penalty)** | Expected skill/risk mechanic; nudging to save the ball, tilt as punishment | MEDIUM | Nudge = small impulse to whole ball + slight visual shake. Over-nudge (too many/too fast, or held too long) → **TILT**: all elements go dead, flippers drop, ball drains. Needs a tilt-bob accumulator that decays over time. |
| **Sound feedback (synthesized)** | Silent pinball feels dead; each element needs an audible response | MEDIUM | Web Audio synthesis (no files). Distinct sound per element (bumper "pop," flipper "clack," slingshot, drain, launch). Pitch/velocity variation prevents machine-gun repetition. |
| **Visual hit feedback** (flash on bumpers/targets) | Confirms the hit registered; baseline "juice" | LOW-MED | Flash the element white/bright for a few frames on contact. Cheap but essential — the line between "responsive" and "cheap." |
| **Stable 60fps** | Physics feel is framerate-sensitive; judder ruins it | MED-HIGH | Fixed physics timestep (e.g. 120–240Hz) with interpolated rendering, so feel is decoupled from display refresh. Non-negotiable per constraints. |

### Differentiators (Portfolio-Grade "Juice" — What Makes It Feel GOOD vs Cheap)

Not required to *be* pinball, but this is where a portfolio piece earns its "impressive." Should concentrate here after the core loop is proven. This directly serves the Core Value ("feels satisfying and faithful").

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Excellent flipper feel** (instant response, EOS snap, ball "grab"/cradle) | The single biggest differentiator between "good" and "cheap" pinball | HIGH | Sub-frame input latency, correct angular velocity at contact, ability to catch/cradle and hold the ball on a raised flipper. This is *the* skill ceiling of the genre. |
| **Ball-drop shadow + playfield shading** | Sells depth and physicality on a 2D table without 3D | MEDIUM | Offset soft shadow under the ball; gradient/vignette playfield lighting. Cheap-looking pinball is flat and evenly lit. |
| **Screen shake / camera kick on big hits + nudge** | Kinesthetic feedback; makes impacts feel weighty | LOW | Small, decaying screen offset on bumper hits, tilt warnings, and nudges. Must be subtle — overdone shake reads as amateur. |
| **Particle bursts + light flares on hits** | "Pop" and reward for hitting things | MEDIUM | Sparks/glow on bumper and target hits. Pair with the flash + sound for a satisfying triple-feedback. |
| **Layered, velocity-scaled synth audio** | Rich soundscape; the difference between "beep" and "arcade" | MED-HIGH | Impact sound pitch/gain scales with collision velocity; layered noise+tone for metallic pings; subtle background hum/GI ambience. Fully synthesized (Web Audio) per constraints. |
| **Insert / GI lighting model** (glowing lit inserts, general illumination) | The visual soul of a pinball table; lit vs unlit playfield state | MEDIUM | Additive-glow "bulbs" for rollover/lane/rank lights. Even without missions, lane and rollover lights lighting up sells the feel. |
| **Plunger charge visualization** | Makes the launch feel intentional and skillful | LOW | Visible pullback of the plunger and/or a charge meter; sets up the skill-shot payoff. |
| **Skill shot on launch** | Rewards a precise plunger charge — high value, low cost once plunger + lit lanes exist | LOW-MED | Space Cadet: ball exiting the deployment chute over a specific lit light awards bonus (verified ~15k–75k by light position). Great early "differentiator" because it reuses plunger + lane lights only. |
| **Subtle ball motion blur / spin visualization** | Conveys speed; high-velocity ball shouldn't look like a slow sprite | LOW-MED | Short trail or streak at high speed; optional rotation marking to show spin. Keep subtle. |
| **Score-count animation + bonus tally** | The satisfying "ka-chunk" of numbers rolling up | LOW | Animate score increments; end-of-ball bonus count-up. Cheap to add, big perceived-quality gain. |
| **Ball-save drama / "shoot again" flourish** | Turns a near-drain into a moment | LOW | Center-post kickback + a visual/audio flourish. (In Space Cadet the center post is a rules reward — see deferred — but a simple ball-save can ship in v1 as pure juice.) |

### Anti-Features (Deliberately NOT Building for v1)

Documented to prevent scope creep. These seem reasonable but would bloat a portfolio v1 or dilute the core-loop focus.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full mission/rank/promotion system** | It's iconic Space Cadet | ~20 missions × completion logic = large content/state effort with zero physics payoff; buries the core-loop risk | Ship polished core loop first; add progression as a v2 milestone (fully specced in Deferred section below). |
| **Multiball** | Signature pinball excitement | Multiple simultaneous balls multiply physics edge cases (ball-ball collision, CCD across N balls, perf); risky before single-ball physics is rock-solid | Defer to v2 with the mission layer. Single-ball loop must be flawless first. |
| **Multiple tables / level editor** | "More content" | Each table is a full physics+layout+art effort; editor is a whole product of its own | One faithful Space Cadet table, done extremely well (per Out of Scope). |
| **3D rendered table / rotating camera** | Looks flashy | The original was 2.5D pre-rendered; true 3D physics+render is a different, much larger project and off-brief | 2D top-down physics with 2.5D shading (shadows/gradients) to *imply* depth. |
| **Pixel-perfect replica of XP artwork** | Nostalgia / faithfulness | Copyright risk + an art pipeline this project explicitly avoids | Clean original procedural style; faithful *layout & behavior*, not faithful *pixels* (per Constraints). |
| **Mobile / touch controls** | Broader reach | Touch flipper/nudge UX is a separate design problem; splits focus from desktop feel | Desktop keyboard first; revisit later (per Out of Scope). |
| **Online leaderboards / accounts / multiplayer** | Competition, retention | Backend, auth, anti-cheat — none core to the "does it feel good" value | Local high-score in `localStorage` at most; no backend. |
| **Options/settings overload** (physics tuning UI, keybinds, difficulty) | Flexibility | Config surface area balloons; players want to *play*, reviewers want to *see it work* | Sane fixed defaults; maybe a mute toggle. Tune physics in code, not UI. |
| **Save/resume mid-game state** | Convenience | Serializing live physics state is fiddly and unneeded for short arcade sessions | Sessions are minutes long; just replay. |
| **Loading original audio samples** | Authenticity | Copyright + asset pipeline this project rejects | Runtime Web Audio synthesis (per Constraints). |

---

## Deferred: Space Cadet Progression Systems (v2+)

**Not in v1.** Documented in enough detail to rebuild faithfully later. All of this is scoring/state-machine logic layered on top of the v1 collision events — **low physics risk, moderate content/logic effort.** Confidence HIGH on structure, MEDIUM on some exact point values (sources: StrategyWiki, GameFAQs/Neoseeker rule sheets; a few values vary between the Windows "demo" ruleset and the full *Full Tilt! Pinball* ruleset).

### Rank / Promotion System

Nine ranks, lowest → highest:

`Cadet → Ensign → Lieutenant → Captain → Lt. Commander → Commander → Commodore → Admiral → Fleet Admiral`

- Rank is shown by **rank lights** (1 light = Cadet … 9 lights = Fleet Admiral).
- You **advance by completing missions** at your current rank. General rule: complete **3 missions** at a rank to promote (accumulating "progress lights"), with shortcut paths — e.g. certain mission types (Science, Secret, Cosmic Plague) can promote in fewer completions.
- Promotion is the game's long-arc goal; reaching **Fleet Admiral** is "beating" the table.
- **Complexity:** MEDIUM (state machine + progress-light tracking + HUD). No physics.

### Missions (~20 total, grouped by rank tier)

Player selects/activates a mission via the **Mission Selection targets** (left side), then follows flashing lights to complete objectives. A mission ends by **completion** (award points + progress) or **abort** (running out of "**fuel**," shown by lights in the passage under the launch ramp — a per-mission timer).

Representative missions by tier (verified names):

- **Cadet:** Launch Training, Re-entry Training, Target Practice (hit the 4 attack bumpers 8×), Science.
- **Ensign / Lieutenant:** Bug Hunt, Rescue, Alien Menace, Secret Mission.
- **Captain / Lt. Commander:** Stray Comet, Space Radiation, Black Hole Threat (light 3 launch-lane lights to upgrade launch bumpers, then hit the Black Hole kickout below the launch ramp), Cosmic Plague (hit flags — a counter from 75 down to 0 — then touch the Space Warp rollover).
- **Commander / Commodore:** Satellite Retrieval, Reconnaissance, Doomsday Machine.
- **Admiral / Fleet Admiral:** the highest-tier missions culminating in promotion to Fleet Admiral.

**Design pattern:** each mission = "hit target set X, Y times, within a fuel timer, following lit-light guidance." Highly reusable template — build one mission engine, data-drive the ~20 definitions.

- **Complexity:** MEDIUM-HIGH (one mission engine + ~20 data definitions + light choreography). No physics.

### Multiball

- Signature multi-ball mode. In the full *Full Tilt! Pinball* ruleset it is tied to the **Wormhole scoops**; the Windows "demo" ruleset's multiball rules differ (MEDIUM confidence on exact trigger).
- Typical behavior: lock ball(s) via a specific target/scoop; on the lock condition, release **2–3 balls simultaneously**, often with jackpots/boosted scoring; mode ends when all but one ball drains.
- **Physics dependency:** requires solid **ball-ball collision** + CCD across multiple balls + perf headroom — the reason it is deferred until single-ball physics is proven.
- **Complexity:** HIGH (physics extension + mode logic). This is the one deferred feature with real physics risk.

### Hyperspace Lights (0–4) + Kickout

The **hyperspace kickout** fires the ball back to the main playfield and lights one **hyperspace light** per entry. Escalating rewards (Windows ruleset, MEDIUM confidence on values):

- 0 lights → 5,000 pts
- 1 light → Bonus awarded
- 2 lights → **Center Post** (ball-save kickback) activated + 20,000 pts
- 3 lights → **Extra Ball** lights turned on + 50,000 pts
- 4 lights → **Gravity Well** activated + 150,000 pts

Lights extinguish in order after ~60s if not maintained — a decay timer creates urgency.

- **Complexity:** MEDIUM (counter + timers + reward dispatch). No physics beyond a kickout impulse (which v1 already has via kickers).

### Gravity Well

- Located at the **center of the ring of lights** on the lower playfield.
- When activated (via 4 hyperspace lights), it awards **150,000 pts** and functions as a special capture: **deactivated by getting the ball to come to rest on the Gravity Well light**.
- Thematically "pulls" the ball toward center — could be modeled later as a localized attractive force field when active.
- **Complexity:** MEDIUM (a toggled radial force + rest-detection). Mild physics extension.

### Wormholes (3)

Three scoop/hole targets: **Yellow** (right of the booster target bank), **Red** (right of the re-entry lanes), **Green** (left of the re-entry lanes). Capture the ball and re-eject it; in the full ruleset they gate multiball and teleport-style scoring.

- **Complexity:** LOW-MED (capture + timed re-eject; reuses kicker/plunger impulse).

### Bonus + Multiplier

- **Booster targets** (3 drop targets): dropping all 3 repeatedly (e.g. 3rd consecutive time) triggers **Bonus Activated** — points accumulate into a **Bonus** pool during the ball.
- Bonus (and any multiplier) is **tallied and awarded at end of ball** (classic pinball convention), then reset for the next ball.
- **Complexity:** LOW-MED (drop-target state + accumulator + end-of-ball payout animation). No physics.

### Extra Ball / Replay ("Shoot Again")

- **Extra Ball lights** (lit via hyperspace level 3, or via outlane awards) grant an extra ball: on drain with an extra ball owed, a new ball is served to the plunger *without* decrementing ball count ("Shoot Again").
- Serves as the ball-save / reward mechanism reducing drain penalty.
- **Complexity:** LOW (a flag checked at drain, hooking the existing ball-count loop).

---

## Feature Dependencies

```
[Fixed-timestep physics loop]                         ← foundation, build first
    └──requires──> [Continuous Collision Detection]   ← anti-tunneling; THE crux
                       ├──enables──> [Flippers]        ← thin fast body; needs CCD
                       ├──enables──> [Table walls/geometry]
                       ├──enables──> [Bumpers / slingshots / kickers]
                       └──enables──> [Drain detection]

[Collision events] ──emit──> [Scoring] ──feeds──> [Score HUD]
[Collision events] ──emit──> [Sound triggers] + [Visual flash / particles]

[Plunger] ──enables──> [Skill shot]           (skill shot needs plunger + lit lanes)
[Lanes/rollovers] ──enables──> [Lit-light state] ──enables──> [Missions] (deferred)

[Drain detection] ──enables──> [Ball-count loop (3 balls)]
                                   └──enables──> [Extra ball / Shoot Again] (deferred)

[Nudge impulse] ──requires──> [Tilt accumulator] ──enables──> [Tilt penalty]

--- Deferred layer (all sit ON TOP of the v1 core loop) ---
[Missions engine] ──requires──> [Lit-light state] + [Mission-select targets] + [fuel timer]
[Rank system] ──requires──> [Missions engine]
[Hyperspace lights] ──enables──> [Center post], [Extra ball], [Gravity well]
[Multiball] ──requires──> [Ball-ball collision] + [multi-ball CCD]   ← ONLY deferred feature with real physics risk
[Bonus/multiplier] ──requires──> [Drop-target state] + [end-of-ball payout]
```

### Dependency Notes

- **Everything requires the physics loop + CCD.** These two are the entire technical risk. Spike them before committing to layout or art.
- **Flippers require CCD specifically:** a fast-swinging thin body against a fast ball is the worst-case tunneling scenario. If CCD is right, flippers work; if not, nothing does.
- **Scoring/sound/visual feedback are all downstream of collision events** — build a clean event bus in the physics layer and these become cheap to attach.
- **The deferred progression layer depends on lit-light state and mission-select targets,** which are just rollovers/targets the v1 core loop already reports. This is why deferral is low-risk: v1 naturally produces the events v2 consumes.
- **Multiball is the exception** — it needs ball-ball collision the single-ball v1 doesn't. Keep the physics architecture ready for N balls (data structures, broad-phase) even while shipping 1 ball, so multiball is additive not a rewrite.
- **Skill shot conflicts with nothing and reuses plunger + lane lights** — cheapest high-value differentiator; can sneak into late v1 if time allows.

---

## MVP Definition

### Launch With (v1)

The full table-stakes list — this is the "core pinball loop" milestone:

- [ ] Fixed-timestep physics + CCD — *the entire technical crux; nothing else matters if this is wrong*
- [ ] Plunger with hold-to-charge variable power — *the launch verb*
- [ ] Two flippers with correct rotational physics + snappy feel — *the primary player verb; the feel differentiator*
- [ ] Space Cadet table layout (chute, bumper cluster, ramps, lanes, drain) — *faithfulness = the identity*
- [ ] Bumpers, slingshots/kickers, lanes/rollovers reacting (bounce + flash + sound + points) — *the reactive playfield*
- [ ] Drain + 3-ball game loop + game over — *the game structure*
- [ ] Live score + HUD — *the goal*
- [ ] Tilt/nudge with over-nudge penalty — *expected skill/risk mechanic*
- [ ] Synthesized SFX + visual flash feedback ("juice") — *the difference between responsive and dead*
- [ ] Stable 60fps — *non-negotiable for feel*

### Add After Validation (v1.x — cheap polish once core is proven)

- [ ] Skill shot on launch — *reuses plunger + lane lights; high value, low cost*
- [ ] Screen shake, particle bursts, ball shadow, insert-light glow — *portfolio-grade juice pass*
- [ ] Score-count / bonus tally animation — *perceived-quality boost*
- [ ] Simple ball-save (center-post kickback as pure juice) — *drama on near-drains*
- [ ] Local high-score (`localStorage`) — *lightweight replay incentive*

### Future Consideration (v2+ — the deferred Space Cadet progression milestone)

- [ ] Mission engine + ~20 mission definitions — *content layer; needs lit-light + mission-select scaffolding from v1*
- [ ] Rank/promotion system (Cadet → Fleet Admiral) — *the long-arc goal; needs missions*
- [ ] Hyperspace lights → center post / extra ball / gravity well cascade — *escalating reward chain*
- [ ] Bonus + multiplier (booster drop targets) — *scoring depth*
- [ ] Extra ball / "Shoot Again" — *reward loop; hooks existing ball-count*
- [ ] Wormholes (capture + re-eject) — *scoop mechanic; gates multiball*
- [ ] **Multiball** — *defer until single-ball physics is flawless; only deferred feature with real physics risk*

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Physics loop + CCD (anti-tunneling) | HIGH | HIGH | P1 |
| Flippers (feel) | HIGH | HIGH | P1 |
| Plunger (variable power) | HIGH | MEDIUM | P1 |
| Table layout + walls | HIGH | MEDIUM | P1 |
| Bumpers / slingshots / kickers | HIGH | MEDIUM | P1 |
| Lanes / rollovers | MEDIUM | LOW-MED | P1 |
| Drain + 3-ball loop | HIGH | LOW | P1 |
| Score + HUD | HIGH | LOW | P1 |
| Tilt / nudge | MEDIUM | MEDIUM | P1 |
| Synth SFX + visual flash | HIGH | MEDIUM | P1 |
| Stable 60fps | HIGH | MED-HIGH | P1 |
| Skill shot | MEDIUM | LOW-MED | P2 |
| Juice pass (shake/particles/shadow/glow) | HIGH | MEDIUM | P2 |
| Score/bonus animation | MEDIUM | LOW | P2 |
| Simple ball-save | MEDIUM | LOW | P2 |
| Missions + ranks | HIGH (depth) | MED-HIGH | P3 (v2) |
| Hyperspace/gravity well/wormholes | MEDIUM | MEDIUM | P3 (v2) |
| Bonus/multiplier + extra ball | MEDIUM | LOW-MED | P3 (v2) |
| Multiball | HIGH | HIGH | P3 (v2) |

**Priority key:** P1 = must have for v1 launch · P2 = cheap polish, add once core works · P3 = deferred to v2 progression milestone

---

## Competitor / Reference Feature Analysis

| Feature | Original XP Space Cadet | Modern browser pinball (e.g. HTML5 clones, Pinball on the web) | Our Approach |
|---------|------------------------|---------------------------------------------------------------|--------------|
| Ball physics | Tuned 2.5D, no tunneling | Varies wildly — many feel floaty or tunnel at speed | Fixed-timestep + CCD; tune for a *heavy* ball. The differentiator. |
| Flipper feel | Snappy, cradle-able | Often mushy/laggy in cheap clones | Sub-frame input + correct momentum transfer + cradle. |
| Rendering | Pre-rendered 2.5D bitmaps | Sprites or Canvas/WebGL | Procedural Canvas/WebGL with 2.5D shading (shadows/gradients) — no ripped art. |
| Audio | Sampled SFX | Sampled files | Runtime Web Audio synthesis — zero asset load, sidesteps copyright. |
| Missions/ranks | Full 9-rank, ~20-mission system | Rare in browser clones | Deferred to v2; documented above for faithful rebuild. |
| Multiball | Present (fuller in *Full Tilt!*) | Rare | Deferred to v2 (physics risk). |
| Tilt/nudge | Yes, with tilt penalty | Frequently omitted (cheapens feel) | Included in v1 — a faithfulness + skill differentiator many clones skip. |

**Takeaway:** the two things that most separate a *good* browser pinball from a *cheap* one are (1) non-tunneling, heavy-feeling ball physics and (2) snappy, cradle-able flippers — both squarely in v1. Tilt/nudge and synthesized-audio variety are "faithfulness details" cheap clones omit, and are cheap wins here.

---

## Sources

- StrategyWiki — *3D Pinball for Windows: Space Cadet* rank & mission pages (Cadet; Ensign/Lieutenant; Captain/Lt. Commander; Commander/Commodore; Admiral/Fleet Admiral; Getting Started) — https://strategywiki.org/wiki/3D_Pinball_for_Windows:_Space_Cadet — **rank order, mission grouping, promotion rules** (HIGH)
- GameFAQs — froesch14 Walkthrough & alaskanpie/ANTICAN/frother Rule Sheets — https://gamefaqs.gamespot.com/pc/563047-3d-pinball-space-cadet — **skill shot values, hyperspace lights, gravity well, mission mechanics** (HIGH structure / MEDIUM exact values)
- Neoseeker — 3D Pinball: Space Cadet Rule Sheet & FAQ — https://www.neoseeker.com/3d-pinball-spacecadet — **9 ranks, progress lights, mission basics, tilt/nudge behavior** (HIGH)
- 3dpinball-spacecadet.net — "So Many Rules!" — https://www.3dpinball-spacecadet.net — **Windows vs Full Tilt! ruleset differences, wormhole multiball note** (MEDIUM)
- General pinball domain knowledge (table-stakes mechanics, "juice," fixed-timestep + CCD physics conventions) — cross-referenced with the above (HIGH)
- PROJECT.md — scope, constraints, out-of-scope boundaries — `.planning/PROJECT.md`

---
*Feature research for: browser pinball (Space Cadet clone)*
*Researched: 2026-07-15*
