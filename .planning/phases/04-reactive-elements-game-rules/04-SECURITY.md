---
phase: "04"
slug: "reactive-elements-game-rules"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-20"
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

This phase has no network, storage, auth or user-data surface. The threat model is about game integrity and availability: rules injecting energy into the ball (kicks, nudges), untrusted key input becoming impulses or new bodies, scoring that a rolling contact or a repeated event could inflate, replay determinism, and the HUD writing text into the page. The register was written at plan time in each 04-0N-PLAN.md `<threat_model>` and verified at ASVS L1 by grep against the implementation. The cited test files were re-run at HEAD (15 files, 227 tests green) and `tsc --noEmit` exits 0. The gap-closure plans 04-09 (G-04-10, flipper latency) and 04-10 (G-04-6, HUD legibility) added T-04-21..T-04-26; their cited test files were re-run at 45bb2a1 (5 files, 105 tests green). The gap-closure plan 04-11 (G-04-11, a lost Shift keyup pinning a bat) added T-04-27..T-04-30; its cited test files were re-run at 8ac8792 (4 files, 83 tests green), with `tsc --noEmit`, `eslint src` and the 4-file soak gate clean.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| solver -> pooled events -> router -> rules listener -> service() -> applyImpulse | In-process, one-way; the only path by which bumper/sling rules change ball motion | CollisionEvent records (pooled), impulse vector |
| rules (applyImpulse between steps) -> solver CCD | Rule-injected velocity must never defeat continuous collision | impulse vector |
| adapter's reused event view -> every bus consumer | Shared mutable memory across listeners | `readonly CollisionEvent[]` view |
| keyboard (Space) -> latch -> applyEdges -> applyImpulse | Untrusted, repeatable key input becomes a plunger impulse | KeyboardEvent edges |
| keyboard (Enter/NumpadEnter) -> GameInput -> GameSession.onStart -> addBall | Untrusted, repeatable key input creates bodies | KeyboardEvent edges, ball spec |
| drain bus event -> GameSession.service -> removeBall/addBall | Rules mutate the world's body set between steps | ball id |
| keyboard (X . ArrowUp) -> GameInput -> GameSession.onNudge -> applyImpulse | Untrusted, repeatable input injects velocity into the ball | KeyboardEvent edges, impulse vector |
| keyboard (flipper keys) -> FlipperInput -> FlipperController (enable gate) -> setFlipperMotor | Untrusted input drives the bats; the session decides when input is honored | KeyboardEvent edges, motor command |
| rules/session state -> DOM HUD text | Constant strings and formatted numbers written as text into the page | score, ball number, status string |
| game state -> replay determinism | Any hidden time or ordering source would break replay and the proofs built on it | step counts |
| keyboard (six flipper bindings) -> FlipperInput latch -> FlipperController FSM -> setFlipperMotor -> Planck joint (04-09) | Untrusted, arbitrarily timed key input; tap timing must never leave a bat stuck raised | KeyboardEvent edges, motor command |
| application code -> planck@1.5.0 RevoluteJoint (04-09) | Third-party solver behavior the limit-impulse reset depends on | joint limit flag, motor speed |
| simulation numbers -> DOM text sink `#hud-diag` (04-10) | Formatted numbers written into the page on the HUD throttle | FPS, physics Hz, kinetic energy |
| static markup (index.html) -> assistive tech (04-10) | The controls hint and the readout are exposed to screen readers | static text |
| OS keyboard layer (Sticky Keys prompt, modifier latching) -> browser key events -> FlipperInput held set (04-11) | The OS can take or withhold a keyup, so the page's view of which keys are down can go stale | KeyboardEvent code, repeat, shiftKey; window focus |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Denial of Service (feel/energy) | ReactiveElements trigger on per-step post-solve bursts | medium | mitigate | `reactive-elements.ts:340` requires `normalImpulse > 0`; `:349` arms `KICKER_REARM_STEPS` (`tuning.ts:34` = 6) per kicker; `reactive-elements.test.ts:159` burst-collapse and `:175` cooldown-oracle (`ceil(30 / KICKER_REARM_STEPS)`) cases | closed |
| T-04-02 | Tampering (bus integrity) | A listener mutating the world mid-dispatch | medium | mitigate | `onEvent` (`reactive-elements.ts:329`) only records `pendingBall` and awards; `applyImpulse` is called only from `service()` -> `kick()` (`:270`, `:300`); spy world `reactive-elements.test.ts:220` asserts no world call while `router.dispatch()` runs | closed |
| T-04-03 | Denial of Service (frame budget) | Per-event allocation or a DOM write every frame | low | mitigate | Fixed `kickers` array plus `kickerById` Map lookup (`reactive-elements.ts:261-262`); `HudView.update()` (`hud.ts:102-126`) writes only on change; `hud.test.ts:83` "100 further updates at an unchanged score write nothing" | closed |
| T-04-04 | Tampering (meter honesty) | PlungerController release on a moving ball in the zone (IN-01) | low | mitigate | `plunger-controller.ts:188` gates on `inZone && Math.hypot(vx, vy) < PLUNGER_REST_SPEED_EPS` (0.05); boundary cases `plunger-controller.test.ts:211/218/223`; real-chute fall-back case `plunger-e2e.test.ts:184` | closed |
| T-04-05 | Denial of Service (input reliability) | Same-window edge order dropping a press or stranding a charge (IN-02) | low | mitigate | `PlungerController.applyEdges` (`plunger-controller.ts:132`) orders edges by the latch's held state at drain time; four same-window cases `plunger-controller.test.ts:240/250/260/268` | closed |
| T-04-06 | Denial of Service (availability/feel) | Kick feedback loop: ball ping-pongs forever or runs away in speed | medium | mitigate | Target-speed law adds only `targetSpeed - vn` when `vn < targetSpeed` (`reactive-elements.ts:297-301`); per-element cooldown; `reactive-table.test.ts:405` 12 seeded dead-flipper drops all drain within 60 s, never exceed 15 m/s, and `kicks > 0` | closed |
| T-04-07 | Tampering (scoring integrity) | A rolling or resting contact re-triggering a sling every step | low | mitigate | `reactive-elements.ts:344-346` requires `normalImpulse >= SLING_MIN_IMPULSE` and `distanceToSegment(...) <= SLING_FACE_TOL`, plus the kicker cooldown; spy cases `reactive-elements.test.ts:296` (vertical face) and `:304` (rolling 0.0015) | closed |
| T-04-08 | Tampering (scoring integrity) | A sensor double-scoring one pass | low | mitigate | Sensors emit on `begin-contact` only (`planck-world.ts:382-383`, once per overlap); `reactive-elements.ts:313` arms `SENSOR_REARM_STEPS` (`tuning.ts:78` = 30); re-arm boundary case `reactive-elements.test.ts:329-337` | closed |
| T-04-09 | Tampering (test integrity) | A rules-live soak that never actually kicks, or a gate that cannot fail | medium | mitigate | `ReactiveSoakWorld` counts every rule `applyImpulse` (`reactive-world.ts:65`); `kicks > 0` asserted in `reactive-soak.test.ts:76` and `reactive-table-soak.gate.test.ts:86`; CCD-off RED control `reactive-soak.test.ts:79` and seed replay `:92` on the same decorator | closed |
| T-04-10 | Tampering (shared state) | A consumer pushing into or splicing the adapter's reused drain array (IN-05) | low | mitigate | `drainEvents(): readonly CollisionEvent[]` in `types.ts:208`, `planck-world.ts:894`, `reactive-world.ts:115`; `CollisionRouter` consumes via `Pick<PhysicsWorld, "drainEvents">` (`collision-router.ts:40`); `tsc --noEmit` exits 0. Test spies returning a plain array are assignable to the readonly signature, as the plan allows | closed |
| T-04-11 | Denial of Service (game integrity) | Positional drain check respawning the parked ball (CR-01), or a duplicate drain double-serving | medium | mitigate | Drain recorded only from the bus and only for the active id (`game-session.ts` `onEvent`: `elementKind === "drain" && ballId === this.active`); `service()` clears `drained` after one serve; cases `game-session.test.ts:252` (non-active id), `:261` (600 steps, CR-01), `:311` (duplicate drain in one batch serves once); e2e `game-e2e.test.ts:321` | closed |
| T-04-12 | Denial of Service (usability) | The start latch swallowing browser keys or auto-repeat re-starting | low | mitigate | `GameInput.handleKeyDown` (`game-input.ts:89-97`) returns before `preventDefault()` for unbound codes, ignores `e.repeat`, de-dupes held keys; `onStart()` acts only from `"game-over"`; latch cases `game-input.test.ts:31/49/67/210`. Note: plan 04-06 added the nudge codes (KeyX, Period, ArrowUp) to the bound set, so `preventDefault()` now also covers those by design; flipper keys and Space stay untouched (`:210`) | closed |
| T-04-13 | Tampering (body leak) | Bodies accumulating if a serve skips the removal | low | mitigate | `GameSession.service()` calls `removeBall(drained)` before any `addBall` (`game-session.ts` `service()`); `game-session.test.ts:226` asserts remove-before-serve; `game-e2e.test.ts:264/276/291/313/328` assert `getBalls()` has length 1 per serve | closed |
| T-04-14 | Tampering (game integrity) | Nudge spam as free ball control or energy injection | medium | mitigate | `onNudge` returns unless `state === "playing"` and `step >= nudgeReadyAtStep`, then arms `NUDGE_COOLDOWN_STEPS` and feeds the accumulating `TiltMeter`; cases `game-session.test.ts:351` (game-over ignored), `:358` (warning), `:374` (tilt), `:388` (tilted applies nothing) | closed |
| T-04-15 | Tampering (no-teleport) | A nudge writing the ball's position and tunneling it through a wall | medium | mitigate | Nudge is velocity-only via `world.applyImpulse`; twin-world position-continuity case `game-e2e.test.ts:488`; guard `grep -rhE "setTransform\|setPosition" src/game` (non-comment) = 0 at HEAD | closed |
| T-04-16 | Tampering (replay integrity) | A wall-clock or unseeded random source in cooldown, decay or warning timing | low | mitigate | `GameSession.tick()` and `TiltMeter.update()` advance per fixed step (`tilt-meter.ts:56` `decayPerS * FIXED_DT`); guard `grep -rhE "Math.random\|performance.now\|Date.now\|setTimeout\|setInterval" src/game` (non-comment) = 0 at HEAD; full replay proof in T-04-18 | closed |
| T-04-17 | Tampering (game integrity) | Flippers staying live after TILT or outside a game | medium | mitigate | `FlipperController.setEnabled` (`flipper-controller.ts:116`) drops up bats to returning, and `onPressEdge` returns while disabled (`:133`); `GameSession` calls `setEnabled(false)` at boot, on tilt and at game over, `true` on start/serve; unit cases `flipper-controller.test.ts:248-328`, session cases `game-session.test.ts:497/510/539`, e2e `game-e2e.test.ts:711` | closed |
| T-04-18 | Tampering (replay integrity) | Cadence-dependent rules (cooldowns, decay, serves) | medium | mitigate | `game.determinism.test.ts:212` drives the same scripted key timeline at 60/120/144 Hz and asserts identical steps, score, ball, state, ball and flipper states; non-vacuous: `hasPlayed` and `sawTilt` true in every run (`:221-222`) | closed |
| T-04-19 | Denial of Service (frame budget) | HudView rebuilding strings or writing three DOM nodes every frame | low | mitigate | Per-line cache of last inputs (`hud.ts:89-93`); each line's string is built and written only when its own inputs change (`:111-118`); `hud.test.ts:168` (100 unchanged updates write nothing) and `:174/183/192` (single-line rewrites) | closed |
| T-04-20 | Tampering (DOM integrity) | HUD text interpreted as markup | low | mitigate | Every HUD write assigns `TextSink.textContent` with constant strings or `formatScore` output (`hud.ts:112/115/118`); guard `grep -rn "innerHTML" src` = 0 at HEAD, and no `outerHTML` / `insertAdjacentHTML` / `document.write` in `src` or `index.html` | closed |
| T-04-21 | Denial of Service (game integrity) | FlipperController returning -> resting on drift; a tap timing parks a bat raised (04-09) | high | mitigate | `flipper-controller.ts:75` `REST_ANGLE_TOL = 0.1`, `:83` `REST_SETTLE_UPDATES = 2`; `:212-220` enters resting only after 2 settled updates within tolerance of `restLimitAngle`, else keeps motor -1; `drop()` resets the counter (`:244`). Spy cases `flipper-controller.test.ts:351` (drift short of rest), `:371` (mirror), `:394` (first observation), `:415` (never-moved tap); e2e six-binding 192-tap sweep with per-step resting invariant `flipper-e2e.test.ts:299` | closed |
| T-04-22 | Tampering (dependency drift) | setFlipperMotor reset relying on Planck solver internals (04-09) | medium | mitigate | Public `RevoluteJoint.enableLimit(false)` / `(true)` only, on a commanded sign change (`planck-world.ts:883-887`); non-comment grep for `m_motorImpulse\|m_impulse` = 0; adapter-level latency pin `flipper-response.test.ts:71` (TABLE_SPEC + PROOF_BOX_SPEC, both ids); `package.json:18` pins `"planck": "1.5.0"` exactly; `planck-world.ts` is the only planck importer in `src` | closed |
| T-04-23 | Denial of Service (frame budget) | setFlipperMotor allocating a search closure at 120 Hz (04-09) | low | mitigate | Indexed for-loop lookup `planck-world.ts:879`; `grep -c "flipperJoints.find(" src/physics/planck-world.ts` = 0 | closed |
| T-04-24 | Tampering (markup injection) | DiagView writing `#hud-diag` (04-10) | low | mitigate | `hud.ts:176` assigns `TextSink.textContent` only; `diagText` (`hud.ts:142-143`) builds the line from `toFixed` numbers and constant text; `grep -rn innerHTML src index.html` = 0, and no `outerHTML` / `insertAdjacentHTML` / `document.write` | closed |
| T-04-25 | Denial of Service (frame budget) | Per-frame DOM writes and string building from the readout (04-10) | low | mitigate | `DiagView.update` (`hud.ts:167-181`) returns before building a string when the three cached numbers are unchanged; fed on the `HUD_UPDATE_MS` 200 ms throttle (`main.ts:81`, `:304`, `:317`); write-count cases `hud.test.ts:235` (first update writes once) and `:241` (same numbers write nothing) | closed |
| T-04-26 | Information disclosure (a11y noise) | Developer readout announced to screen readers (04-10) | low | mitigate | `index.html:135` `#hud-diag` carries `aria-hidden="true"`; the only `aria-live` region is `#hud-status` (`index.html:121`) | closed |
| T-04-27 | Denial of Service (game integrity) | FlipperInput held set: a keyup lost to an OS dialog pins a side raised, masks its other bindings and survives every serve (04-11) | high | mitigate | `flipper-input.ts:197` `handleFocus()` force-clears the held set; window `focus` listener added in `attach()` (`:240`) and removed in `detach()` (`:249`); `dropStaleShift` (`:280`) runs on every keydown/keyup (`:153`, `:178`). Unit `flipper-input.test.ts:225` "focus regain (G-04-11)" and `:298` stale-Shift B1-B4; keyboard-to-Planck `flipper-e2e.test.ts:368` (focus regain releases on every binding) and `:416` (stale Shift released by the side's other keys); full game `game-e2e.test.ts:811` (left bat stays down on ball 2) | closed |
| T-04-28 | Denial of Service (false release) | dropStaleShift wrongly dropping a genuinely held Shift (D-09 both-Shift cradle) (04-11) | medium | mitigate | `flipper-input.ts:281` returns unless `e.shiftKey === false` strictly and the event is not ShiftLeft/ShiftRight; guards `flipper-input.test.ts:364` (B5 held Shift kept), `:380` (B6 Shift-key events never reconcile), `:393` (B7 absent field never reconciles); cradle `flipper-e2e.test.ts:447` | closed |
| T-04-29 | Denial of Service (environment residual) | Windows Sticky Keys ON keeps Shift logically down and withholds its keyup until the next non-modifier key (04-11) | medium | accept | No browser-visible signal exists (`shiftKey` reads true); the bat releases with the next non-modifier key; documented as AR-04-02 | closed |
| T-04-30 | Tampering (page behavior) | preventDefault scope while the handlers are restructured (04-11) | low | mitigate | `flipper-input.ts:154-164`: repeat and unbound codes return through `commitTransitions` before `preventDefault()`, which stays on bound non-repeat keydowns only; `flipper-input.test.ts:336` (B2 unbound heal key not prevented), `:354` (B4 repeat heals but never prevents), `:91` reserved-key case unchanged | closed |
| T-04-SC | Tampering | npm/pip/cargo installs | low | accept | No packages installed this phase: `package.json` / lockfile unchanged across 8871026..HEAD, including the 04-09/04-10 gap closure (`git diff 2cd8dbf..45bb2a1 -- package.json package-lock.json` empty) and 04-11 (`git diff 0bc2ee1..8ac8792 -- package.json package-lock.json` empty) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-SC | Supply-chain install surface: the phase adds no dependency (RESEARCH Package Legitimacy Audit: none), so there is nothing to vet. Disposition `accept` was set at plan time in all eight plans and is confirmed by an unchanged `package.json` / lockfile. | plan-time threat model (04-01..04-11) | 2026-11-20 |
| AR-04-02 | T-04-29 | With Windows Sticky Keys turned ON, the OS keeps Shift logically down, reports `shiftKey` true and withholds the Shift keyup until the next non-modifier key, so no browser check can detect the stale Shift. Impact is bounded: the bat releases on the next non-modifier key event. Keeping Shift as a default flipper binding is a user decision (Phase 2 D-09), recorded as a non-blocking note. | plan-time threat model (04-11) | 2026-11-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 21 | 21 | 0 | gsd-secure-phase orchestrator (ASVS L1 grep-depth plus re-run of the cited tests; auditor skipped per short-circuit: threats_open 0, register authored at plan time) |
| 2026-11-20 | 27 | 27 | 0 | gsd-secure-phase orchestrator, gap-closure re-audit for 04-09/04-10 (T-04-21..T-04-26 added; ASVS L1 grep-depth plus re-run of the cited tests; auditor skipped per the same short-circuit) |
| 2026-11-20 | 31 | 31 | 0 | gsd-secure-phase orchestrator, gap-closure re-audit for 04-11 (T-04-27..T-04-30 added, T-04-29 accepted as AR-04-02; ASVS L1 grep-depth plus re-run of the cited tests; auditor skipped per the same short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-20

## Security Audit 2026-11-20

| Metric | Count |
|---|---|
| Threats found | 27 |
| Closed | 27 |
| Open | 0 |

## Security Audit 2026-11-20

| Metric | Count |
|---|---|
| Threats found | 31 |
| Closed | 31 |
| Open | 0 |
