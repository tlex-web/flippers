# Requirements: Space Cadet Pinball — Browser Edition

**Defined:** 2026-07-15
**Core Value:** The moment-to-moment pinball loop — plunger, flippers, ball physics, and bumpers — feels satisfying and faithful to the original.

## v1 Requirements

Requirements for the initial release: a polished, faithful, browser-playable core pinball table on the Space Cadet layout. Each maps to a roadmap phase.

### Physics (PHYS)

- [ ] **PHYS-01**: Ball moves under stable 2D physics (gravity, momentum, restitution, friction) and feels heavy, not floaty
- [ ] **PHYS-02**: The ball never tunnels through thin walls or flippers, even at maximum speed (continuous collision detection)
- [ ] **PHYS-03**: Simulation runs on a fixed timestep decoupled from rendering, so ball feel is identical at 60/120/144Hz and survives a tab-blur without exploding

### Flippers (FLIP)

- [ ] **FLIP-01**: Left and right flippers are controlled by the keyboard with near-instant (sub-frame) response
- [ ] **FLIP-02**: Flippers transfer correct rotational momentum to the ball (the tip launches the ball faster than the base)
- [ ] **FLIP-03**: Player can catch and cradle the ball on a raised flipper and hold it steady without jitter
- [ ] **FLIP-04**: A fast-moving flipper never passes through the ball (rotational continuous collision)

### Launch (LNCH)

- [ ] **LNCH-01**: Player launches the ball with a hold-to-charge plunger that fires a proportional impulse up the launch chute
- [ ] **LNCH-02**: Plunger charge is visualized (pullback and/or charge meter) so launch feels intentional

### Table (TBL)

- [ ] **TBL-01**: The table recreates Space Cadet's layout — launch chute, upper bumper cluster, ramps, lanes, outer walls, and center-bottom drain funnel

### Reactive Elements (ELEM)

- [ ] **ELEM-01**: Bumpers pop the ball back with added energy and award points on contact
- [ ] **ELEM-02**: Slingshots/kickers near the flippers kick the ball on contact to keep it lively
- [ ] **ELEM-03**: Lanes and rollovers trigger lights and award points as the ball passes over them

### Game Rules (GAME)

- [ ] **GAME-01**: Player sees a live running score in an on-screen HUD
- [ ] **GAME-02**: A 3-ball game loop — draining serves the next ball to the plunger; game over after the last ball
- [ ] **GAME-03**: Player can nudge the table (small impulse); over-nudging triggers TILT — elements go dead and the flippers drop

### Audio (AUD)

- [ ] **AUD-01**: Each element produces a distinct runtime-synthesized sound (bumper, flipper, slingshot, drain, launch) with velocity/pitch variation and no audio files

### Rendering (RND)

- [ ] **RND-01**: The entire table is rendered procedurally in code (Canvas) with no image assets
- [ ] **RND-02**: The game holds a stable 60fps via render interpolation
- [ ] **RND-03**: Elements flash on contact to confirm the hit registered

### Polish (PLSH — portfolio "juice", in scope for v1)

- [ ] **PLSH-01**: Subtle, decaying screen shake / camera kick on big hits and nudges
- [ ] **PLSH-02**: Particle bursts and light flares on bumper/target hits
- [ ] **PLSH-03**: Depth cues — a soft ball-drop shadow and playfield shading/vignette that imply 2.5D depth
- [ ] **PLSH-04**: Glowing insert/lane lights with a lit-vs-unlit playfield state
- [ ] **PLSH-05**: Skill shot on launch — a bonus for a precise plunger charge over a lit lane
- [ ] **PLSH-06**: Score count-up animation and an end-of-ball bonus tally
- [ ] **PLSH-07**: Simple ball-save (center-post kickback flourish) on a near-drain
- [ ] **PLSH-08**: Local high-score persisted in the browser (`localStorage`)

## v2 Requirements

Deferred to a future "Space Cadet progression" milestone. Documented but not in the current roadmap. All sit on top of collision events the v1 core loop already emits — low physics risk (except multiball).

### Progression

- **RANK-01**: Rank/promotion system (Cadet → Fleet Admiral) tracked via rank lights
- **MISS-01**: Mission engine plus ~20 data-driven mission definitions with fuel timers and lit-light choreography
- **HYP-01**: Hyperspace lights (0–4) cascade → center post / extra ball / gravity well
- **BONUS-01**: Bonus + multiplier via booster drop targets, tallied and paid out at end of ball
- **XBALL-01**: Extra ball / "Shoot Again" reward hooked into the ball-count loop
- **WORM-01**: Wormholes (capture + timed re-eject)
- **MBALL-01**: Multiball — the one deferred feature with real physics risk (ball-ball collision + multi-body CCD). v1 physics stays N-ball-ready so this is additive, not a rewrite.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multiple tables / level editor | Each table is a full physics+layout effort; an editor is its own product |
| 3D rendered table / rotating camera | Off-brief; original was 2.5D pre-rendered; true 3D is a much larger project |
| Pixel-perfect replica of XP artwork | Copyright risk + an art pipeline this project deliberately avoids |
| Mobile / touch controls | A separate UX design problem; desktop keyboard feel comes first |
| Online leaderboards / accounts / multiplayer | Backend/auth/anti-cheat — none core to "does it feel good" |
| Settings/tuning UI (physics knobs, keybinds, difficulty) | Config bloat; sane fixed defaults, maybe a mute toggle. Tune in code, not UI |
| Save/resume mid-game state | Serializing live physics is fiddly and needless for minutes-long sessions |
| Loading original audio samples | Copyright + the asset pipeline this project rejects; audio is synthesized |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| _(populated by the roadmapper)_ | — | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 28 ⚠️

---
*Requirements defined: 2026-07-15*
*Last updated: 2026-07-15 after initial definition*
