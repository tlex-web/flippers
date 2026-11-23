---
phase: 06-juice-polish
verified: 2026-11-23T02:40:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/06-juice-polish/06-01-PLAN.md
  - .planning/phases/06-juice-polish/06-01-SUMMARY.md
  - .planning/phases/06-juice-polish/06-02-PLAN.md
  - .planning/phases/06-juice-polish/06-02-SUMMARY.md
  - .planning/phases/06-juice-polish/06-03-PLAN.md
  - .planning/phases/06-juice-polish/06-03-SUMMARY.md
  - .planning/phases/06-juice-polish/06-04-PLAN.md
  - .planning/phases/06-juice-polish/06-04-SUMMARY.md
  - .planning/phases/06-juice-polish/06-05-PLAN.md
  - .planning/phases/06-juice-polish/06-05-SUMMARY.md
  - .planning/phases/06-juice-polish/06-06-PLAN.md
  - .planning/phases/06-juice-polish/06-06-SUMMARY.md
  - .planning/phases/06-juice-polish/06-07-PLAN.md
  - .planning/phases/06-juice-polish/06-07-SUMMARY.md
  - .planning/phases/06-juice-polish/06-08-PLAN.md
  - .planning/phases/06-juice-polish/06-08-SUMMARY.md
  - .planning/phases/06-juice-polish/06-09-PLAN.md
  - .planning/phases/06-juice-polish/06-09-SUMMARY.md
  - .planning/phases/06-juice-polish/06-10-PLAN.md
  - .planning/phases/06-juice-polish/06-10-SUMMARY.md
  - .planning/phases/06-juice-polish/06-11-PLAN.md
  - .planning/phases/06-juice-polish/06-11-SUMMARY.md
  - .planning/phases/06-juice-polish/06-12-PLAN.md
  - .planning/phases/06-juice-polish/06-12-SUMMARY.md
  - .planning/phases/06-juice-polish/06-13-PLAN.md
  - .planning/phases/06-juice-polish/06-13-SUMMARY.md
  - .planning/phases/06-juice-polish/06-14-PLAN.md
  - .planning/phases/06-juice-polish/06-14-SUMMARY.md
  - src/game/game-session.ts
  - src/game/high-score.ts
  - src/game/reactive-elements.ts
  - src/render/table-renderer.ts
  - src/sandbox/main.ts
covered_digest: "v4:sha256:5e57b6317c03c28d7074e7e5c77146d3627869ab00b1f75d7d3011cd2a599a47"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Play several balls: nudge, hit bumpers, drain; watch the canvas"
    expected: "Shake is subtle and decays quickly, the HUD never shakes, and reduced-motion OS setting removes the shake entirely"
    why_human: "Perceptual subtlety and timing cannot be asserted headlessly (plan 06-14 D5 explicitly defers this to UAT)"
  - test: "Look at the table at rest and in play"
    expected: "Ball drop shadow, light pool and vignette read as 2.5D depth; lit vs unlit inserts and rollover lenses are clearly distinct; attract-mode chase is legible"
    why_human: "Visual quality (glow, contrast, depth) is a perceptual judgement"
  - test: "Plunge repeatedly with the lit skill-shot lane rotating; use a learned hold length"
    expected: "A learned hold reliably reaches the lit lane (D-02 'bands not random'); SKILL SHOT status, sting and chevron glints fire; value ladder 5k..25k"
    why_human: "Whether the 3-4 step charge bands feel learnable, not random, is a feel judgement the plan itself flagged for UAT"
  - test: "Drain a ball in the center while the 7 s ball save is running, repeatedly, with the flippers idle and with them held"
    expected: "Decision needed on CR-01 (see Gaps / Warnings): after a kickback the ball can fall back through the bat gap and drain within the save window, costing a ball even though BALL SAVED was just shown. Confirm this is acceptable, or fix"
    why_human: "Open critical code-review finding with a design question (grace window vs accepted kickback behaviour)"
  - test: "Finish a game with a new best, hard-reload the page in a real browser, then also try with storage blocked"
    expected: "HIGH SCORE persists across reload and NEW HIGH SCORE fanfare plays; with storage blocked play continues silently"
    why_human: "Real-browser localStorage persistence across sessions is not exercised by the headless tests (injected StorageLike only)"
  - test: "Run on a 144 Hz display and a 60 Hz display"
    expected: "Stable 60 fps with particles, shadows, vignette and shake active; count-up and bonus tally pacing feel right"
    why_human: "Frame-rate and pacing feel need a real browser/GPU"
---

# Phase 6: Juice & Polish Verification Report

**Phase Goal:** The game crosses from correctly functioning to portfolio-grade: responsive feedback, depth, glowing lights, and rewarding flourishes that make play feel alive and shareable.
**Verified:** 2026-11-23
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

Everything the roadmap contract asks for exists, is substantive, is wired into the live composition root (`src/sandbox/main.ts`), and is covered by passing automated gates. No success criterion fails on code evidence. The phase cannot be called `passed` because (a) the phase is perceptual by nature and the plans themselves defer feel to UAT, and (b) the code review left one critical finding (CR-01) open and untriaged, which touches the ball-save behaviour and needs an explicit keep-or-fix decision.

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Big hits and nudges produce a subtle, decaying screen shake / camera kick; bumper/target hits emit particle bursts and light flares | VERIFIED (perceptual tuning to human) | `render/shake.ts` (210 lines, trauma model, 13 tests) fed by `EffectsTracker.onNudge -> shake.kick` (effects.ts:315); `table-renderer.ts:481-511` samples shake once, blits the static layer at the shake offset, applies shake to the world transform, then `drawParticles` (line 511). Reduced motion zeroes the offset (renderer lines 492-495). `particles.ts` (285 lines, 19 tests) plus bumper/sling/rollover emitters in effects.ts. `presentation.determinism.test.ts` asserts shaken blit, live particles and read-only presentation |
| 2 | Depth reads clearly (ball shadow, shading/vignette) and insert/lane lights have distinct lit vs unlit state | VERIFIED (perceptual to human) | `table-renderer.ts:304,457,509` baked ball shadow drawn per ball; `static-layer.ts` bakes light pool, drop shadows, unlit lenses and vignette (VIGNETTE_* palette tokens). `lamps.ts` (579 lines, 47 tests) `LampTracker` fade/blink, wired in main.ts:253 and `lamps.update()` at line 332 |
| 3 | A precise plunger charge over a lit lane earns a skill-shot bonus on launch | VERIFIED | `game/skill-shot.ts` + `GameSession` composition. `skill-shot-e2e.test.ts:248` "D-05 anchor: N=62 with 401 lit hits rollover 401 first and awards the skill shot" runs on the real `TABLE_SPEC` + `PlanckWorld` and passes in the full suite. Ladder and rotate/freeze rules unit-tested in `skill-shot.test.ts` |
| 4 | Scores count up with animation and an end-of-ball bonus tally; a near-drain can trigger a center-post ball-save flourish | VERIFIED with warning (CR-01) | Count-up in `ui/hud.ts` (0.20 s time constant on the step clock, wired at main.ts:555-556). `game/bonus.ts` + `GameSession` "bonus" state (service() lines 340-370) snapshot, tally, skip, forfeit. Center post element 610 + `ReactiveElements` post kicker (`hooks.trySave`) and `ball-save.ts`; post flourish in lamps.ts, sparks in effects.ts. Tests: bonus (16), ball-save (14), reactive-table kickback + energy-bound + RED control. Warning: see CR-01 |
| 5 | The local high score persists across sessions via `localStorage` | VERIFIED in code; real-browser reload to human | `game/high-score.ts` (94 lines) guarded get/set with try/catch; `main.ts:212` `new HighScore(safeLocalStorage())`, session submits once at game end; HUD best line and `highScore` fanfare. 22 tests incl. hostile storage. The real-browser reload is not exercised headlessly |

**Score:** 5/5 truths verified, 0 behavior-unverified, 0 overrides. Human items listed in frontmatter.

### Plan-level must-haves (spot-verified, not just trusted)

| Must-have | Status | Evidence |
|-----------|--------|----------|
| D-05 anchor: 62 charging steps, 401 lit, first scoring switch awards skill shot | VERIFIED | Test above passes (one of 1264) |
| Virtual center post element 610, kicks only above center, energy-bounded, RED control | VERIFIED | 06-08 truths; `reactive-table.test.ts` kickback tests pass; `hooks.trySave` wiring present in reactive-elements.ts |
| Presentation modules are read-only (bit-identical outcome with all attached, reduced motion on and off) | VERIFIED | `presentation.determinism.test.ts`, `game.determinism.test.ts` (60/120/144 Hz) pass in `npm test` |
| Rules-live soak with armed save, postKicks > 0 | UNVERIFIED BY ME (accepted from SUMMARY) | The fast soak variant runs inside `npm test` and passes. The 630 s `npm run soak` gate was not re-run by this verifier (time budget); 06-14 SUMMARY claims pass |

### Required Artifacts / Key Links

| Artifact / Link | Status | Details |
|-----------------|--------|---------|
| `game/skill-shot.ts`, `bonus.ts`, `ball-save.ts`, `high-score.ts`, `tuning.ts` | VERIFIED | Exist, substantive, imported by GameSession / main.ts |
| `render/shake.ts`, `particles.ts`, `effects.ts`, `lamps.ts`, `flash.ts`, `palette.ts`, `sprites.ts`, `static-layer.ts`, `table-renderer.ts` | VERIFIED | Substantive; `EffectsTracker` and `LampTracker` constructed in main.ts:227,253 and passed into the renderer frame (shake, lamps, effects, reducedMotion at main.ts:547) |
| `ui/hud.ts` (`HudView`, `BonusView`) | VERIFIED | Constructed main.ts:392,402; updated every frame at 555-556 |
| `ReactiveElements` -> `GameSession.trySave` via `RuleHooks` | WIRED | main.ts passes session as the rule hooks (main.ts:213) |
| `GameSession` -> `HighScore` -> `safeLocalStorage()` | WIRED | main.ts:210-215 |

### Data-Flow (Level 4)

Presentation reads session/world state through read-only getters; the determinism gates prove outcome equality with and without presentation attached and assert non-vacuity (particles live, lamp above 0.5, HUD and overlay written). No static/hollow data source found.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `npm test` | 60 files, 1264 tests passed (6.2 s) | PASS |
| Type check | `npx tsc --noEmit` | no output | PASS |
| Lint | `npx eslint .` | no output | PASS |
| Production build | `npm run build` | tsc + vite build OK, 49 modules, 77.9 kB gzip | PASS |
| Debt markers | grep TBD/FIXME/XXX in `src` | none | PASS |
| 630 s soak gate | `npm run soak` | not run by verifier | SKIPPED (see above) |

### Requirements Coverage

Every ID in the phase header appears in at least one PLAN `requirements:` field and is marked Complete in REQUIREMENTS.md. No orphaned requirements.

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| PLSH-01 | 06-09, 06-14 | Decaying screen shake / camera kick on big hits and nudges | SATISFIED | shake.ts, effects.ts onNudge, renderer shake transform, reduced-motion zeroing |
| PLSH-02 | 06-12, 06-13, 06-14 | Particle bursts and light flares on bumper/target hits | SATISFIED | particles.ts, effects.ts emitters, renderer drawParticles, contact flashes |
| PLSH-03 | 06-02, 06-14 | Ball-drop shadow and shading/vignette | SATISFIED | baked ball shadow, static-layer light pool, drop shadows, vignette |
| PLSH-04 | 06-03, 06-14 | Glowing insert/lane lights, lit vs unlit state | SATISFIED | lamps.ts, baked unlit lenses/rims, attract chase |
| PLSH-05 | 06-01, 06-03, 06-04, 06-14 | Skill shot on launch | SATISFIED | skill-shot.ts, D-05 anchor e2e test, stings and status line |
| PLSH-06 | 06-05, 06-06, 06-14 | Score count-up and end-of-ball bonus tally | SATISFIED | bonus.ts, "bonus" FSM state, HudView count-up, BonusView |
| PLSH-07 | 06-07, 06-08, 06-10, 06-14 | Center-post ball-save flourish on near-drain | SATISFIED with defect CR-01 | ball-save.ts, post element 610, kickback, flourish |
| PLSH-08 | 06-11, 06-14 | Persisted local high score | SATISFIED | high-score.ts, main.ts wiring, HUD best line |

### Anti-Patterns / Open Review Findings

06-REVIEW.md reported 1 critical, 4 warnings, 5 info; 06-REVIEW-DISPOSITION.md shows all 10 still `open` (untriaged). Debt-marker scan is clean.

| ID | Severity | Impact on goal |
|----|----------|----------------|
| CR-01 | Critical (reviewer) | I confirmed the mechanism in code. `GameSession.trySave` (game-session.ts ~537-545) consumes the one per-ball save as a kickback. `service()` (line 361) only backstops a drain when `savedAtStep === step`. A later drain falls through to the bonus state and the ball is lost, even inside the 7 s save window and after the player saw BALL SAVED, the sting and the post flourish. `game-session.test.ts:1213` ("a kickback followed by a drain on a LATER step is a real drain") pins this as intended, so it was a planned trade-off (research A4), not an oversight. The reviewer's headless probe says a dead-center drop falls back through the bat gap and drains about 100 steps later. I did not re-run that probe. It weakens the "ball-save" promise but does not make PLSH-07 / SC4 literally false ("can trigger a flourish" is met), so I rate it a WARNING needing a human decision, not a goal-blocking gap |
| WR-01 | Warning | "BALL SAVED" can show after the ball is lost and can outrank the GAME OVER prompt (hud.ts 296-315). Linked to CR-01 |
| WR-02 | Warning | Same-step kickback+drain plays post flourish/sparks for a ball that was re-served to the plunger (visual defect) |
| WR-03 | Warning | Chevron and arrow geometry plus skill-shot lane ids hard-coded, not derived from `TABLE_SPEC` (silent drift risk if the table moves) |
| WR-04 | Warning (necessity) | Dead `if (!d) return` guard in `ShakeTracker.kick` |
| IN-01..05 | Info | parseBest leniency, dead code, render-to-sandbox type import, backstop re-serve can reopen skill shot, lamp shape table built twice |

### Human Verification Required

See frontmatter `human_verification`. Summary: shake subtlety and reduced motion, depth and lamp look, skill-shot band learnability (D-02), the CR-01 keep-or-fix decision, real-browser high-score reload, and 60 fps on a real 144 Hz display.

### Gaps Summary

No must-have truth failed, no artifact is missing, stubbed or unwired, and all automated gates I ran are green. The phase is verified to the extent a headless check can. Two items hold it short of `passed`:

1. **CR-01 (and linked WR-01/WR-02) needs a decision.** Either fix it (the reviewer's `KICKBACK_GRACE_STEPS` backstop window, or kick toward a bat) and re-run the soak gates, or record it as `deferred`/`skipped` in 06-REVIEW-DISPOSITION.md with a reason. Until then a critical finding remains `open`. If you choose to fix, expect `game-session.test.ts:1213` and the e2e at `game-e2e.test.ts:1058` to need inverting, and the determinism/soak gates to be re-run.
2. **Perceptual UAT** the plans deferred to `/gsd-verify-work`.

The 630 s `npm run soak` gate was not re-run by this verifier. Its fast variant runs in `npm test`.

---

_Verified: 2026-11-23_
_Verifier: Claude (gsd-verifier)_
