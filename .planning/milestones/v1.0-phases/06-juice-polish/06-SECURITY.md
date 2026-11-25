---
phase: "6"
slug: "juice-polish"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-23"
---

# Phase 6 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser storage → game | `localStorage` value `flippers.hiscore.v1` read once at boot by `HighScore` | Untrusted string (may be hostile/corrupt); parsed to a non-negative safe integer or 0 |
| Game → browser storage | New best written on game over | One decimal integer under one key; nothing else persisted |
| Physics bus → rule hooks | `RuleHooks.onSwitch` / post sensor events fire inside Planck contact dispatch | Element ids and contact points only; world writes deferred to `ReactiveElements.service()` |
| Simulation → presentation | Lamps, effects, particles, HUD, cues read session state | `Pick<>` getters and scalars only; presentation never writes the sim |
| OS / user → renderer | `prefers-reduced-motion` and display refresh rate | Boolean flag read once at boot + one change listener; fixed-step sim is cadence-independent |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-6-01 | Tampering (determinism) | SkillShot rotation / resolution | medium | mitigate | Pure step-counted module, no clock/RNG (skill-shot.ts); e2e identical at 60/120/144 Hz (skill-shot-e2e.test.ts) | closed |
| T-6-02 | Tampering (world integrity) | RuleHooks.onSwitch inside bus dispatch | medium | mitigate | onSwitch only awards/records (game-session.ts); world writes only in service(); reactive-elements.test.ts dispatch spy | closed |
| T-6-03 | DoS (frame budget) | Shadow pass and depth bake | medium | mitigate | Gradients/bakeShadow only in resize(); drawImage stamp per ball (table-renderer.ts) | closed |
| T-6-04 | Safety (photosensitive) | Lamp blink and chase | high | mitigate | 60-step (2 Hz) blink, 18-step chase dwell (lamps.ts); lamps.test.ts asserts exact cycles | closed |
| T-6-05 | DoS (frame budget) | Lamp pass in draw() | medium | mitigate | Float64Array vertices; halos baked at resize; no gradient/blur/text in draw() | closed |
| T-6-06 | Tampering (markup injection) | Status line text | low | mitigate | Fixed strings + formatScore(int), written via textContent only; no innerHTML in src | closed |
| T-6-07 | DoS (cue spam) | skillShot push | low | mitigate | Counter diff pushes once per increment (presentation-observer.ts) | closed |
| T-6-08 | Tampering (score integrity) | credit() bypassing integer guard | medium | mitigate | credit() keeps safe-integer ≥ 0 check and saturation (game-session.ts); MAX_SAFE_INTEGER test | closed |
| T-6-09 | Tampering (determinism) | Tally timing and skip | medium | mitigate | Fixed-step bonusEndsAt; skip latched and read in service(); game.determinism asserts skip + forfeit at 3 cadences | closed |
| T-6-10 | Tampering (rule integrity) | Post-tilt points leaking into bonus | medium | mitigate | Counters advance only while playing; isLive gates; tilt forfeits with no credit | closed |
| T-6-11 | DoS (DOM churn) | Count-up and bonus overlay | medium | mitigate | HudView/BonusView write-on-change caches (hud.ts); hud.test.ts write counts | closed |
| T-6-12 | DoS (frame budget) | Reduced-motion read | low | mitigate | matchMedia once at boot + one listener; frame() reads a boolean (main.ts) | closed |
| T-6-13 | EoP (game integrity) | Infinite saves via backstop re-serve | high | mitigate | reServe() never re-arms; consume() one-shot (ball-save.ts); second drain enters bonus test | closed |
| T-6-14 | Tampering (rule timing) | Save timer started by weak plunge | medium | mitigate | Strict `x + BALL_RADIUS_M < CHUTE_X` (ball-save.ts); exact-boundary tests | closed |
| T-6-15 | DoS (physics stability) | Post kick energy / trapping | high | mitigate | KICKBACK_SPEED 5.5 raise-only kick law; one save per ball; ≤ 15 m/s bound + RED control at 20 m/s (reactive-table.test.ts) | closed |
| T-6-16 | Tampering (world integrity) | Kick outside ordered write path | medium | mitigate | onPost records pendingBall only; impulse applied in service() | closed |
| T-6-17 | Tampering (rule correctness) | Downward kick into drain | medium | mitigate | `e.point.y < k.cy` gate before trySave; level/below unit cases | closed |
| T-6-18 | Safety (vestibular) | Shake/kick under prefers-reduced-motion | high | mitigate | shake.ts writes 0 under reduced motion + renderer-side guard (table-renderer.ts); presentation.determinism asserts 0 shaken frames | closed |
| T-6-19 | DoS (state leak) | Shaken frame | medium | mitigate | Preallocated ShakeOut; single resetWorld(); no save/restore | closed |
| T-6-20 | Safety (photosensitive) | Ring blink and post flash | high | mitigate | Ring uses 60-step blink; post uses FLASH_BUMPER timing, once per kickback; halo capped at HALO_SCALE·R | closed |
| T-6-21 | Repudiation (fake-looking save) | Drawn post radius vs collider | medium | mitigate | postR read from the element's own circle; test matches collider | closed |
| T-6-22 | Tampering | Hostile/corrupt stored best | medium | mitigate | parseBest accepts only safe integers ≥ 0 else 0 (high-score.ts); hostile-input table incl. markup, NaN, Infinity, 2^53+1 | closed |
| T-6-23 | DoS | localStorage getter/getItem/setItem throws | high | mitigate | safeLocalStorage() wraps getter (main.ts); getItem/setItem in try/catch; throwing/absent storage tests | closed |
| T-6-24 | Information Disclosure | Persisting more than the score | low | mitigate | One key, String(score) only on new best, nothing logged; write-shape test | closed |
| T-6-25 | Safety (photosensitive) | Ring and spark size/brightness | high | mitigate | Ring < 2.0R; spark life capped at emit (PARTICLE_MAX_TRAVEL_M 0.6); 1,000-burst ≤ 0.63 m test | closed |
| T-6-26 | Tampering (determinism) | Particle randomness | medium | mitigate | Dedicated mulberry32 stream; no Math.random in particles/effects/shake; same-seed test | closed |
| T-6-27 | DoS (memory/frame) | Unbounded particle allocation | medium | mitigate | Fixed 160-slot typed-array pool, overwrite-oldest; 10,000-emit test | closed |
| T-6-28 | Safety (photosensitive) | Glint and save-spark size/brightness | high | mitigate | STAR_GLINT_M 0.24 (< 0.4 m sensor), MOTE_RADIUS_M 0.018, f² alpha fade; footprint test | closed |
| T-6-29 | Tampering (determinism) | Presentation writing the sim | medium | mitigate | Observer holds Pick<> getters only; bare vs presented runs bit-identical (presentation.determinism.test.ts) | closed |
| T-6-30 | Tampering (test integrity) | Vacuous determinism/soak gates | high | mitigate | Explicit non-vacuity assertions in game/presentation determinism and soak gates (postKicks > 0) | closed |
| T-6-31 | Repudiation | Unreplayable soak failures with save armed | low | mitigate | Seeded replay case kept; save armed by default in ReactiveSoakWorld; describeFailure logging | closed |
| T-6-SC | Tampering (supply chain) | npm/pip/cargo installs | low | accept | No packages installed this phase — `git diff fdca68c -- package.json package-lock.json` empty | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-6-01 | T-6-SC | No dependencies added or changed during Phase 6 (package.json and package-lock.json unchanged since fdca68c); supply-chain surface is unchanged from prior phases | plan-time disposition (06-01…06-14 threat models), verified by gsd-security-auditor | 2026-11-23 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-23 | 32 | 32 | 0 | gsd-security-auditor (ASVS L1, block_on high; 16 mitigation test files / 486 tests run green) |

Informational (non-blocking): the `window.localStorage` getter guard in `main.ts` (T-6-23) has no unit test because `main.ts` has no seam for one; the guard code is present.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-23
