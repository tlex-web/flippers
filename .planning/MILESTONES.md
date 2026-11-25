# Milestones

## v1.0 MVP (Shipped: 2026-11-25)

**Delivered:** A complete, playable original space-themed pinball table in the browser: tunnel-proof fixed-step physics, weighty keyboard flippers, a procedural Canvas 2D table, runtime-synthesized audio, a full 3-ball ruleset and portfolio-grade juice, with zero art or audio assets.

**Phases completed:** 12 phases (1–6 plus 6 inserted: 06.1, 06.2, 06.3, 06.4, 06.4.1, 06.4.1.1), 84 plans, 195 tasks

**Stats:**

- Timeline: 2026-07-15 → 2026-11-25 (133 days), 788 commits
- Git range: `feat(01-02)` 618819e → `fix(06.4.1.1-06)` 0b2c95a; audited at e6ab1a5; tag `v1.0` on the final archive commit
- Code: 122 files and about 44,600 lines in `src/` + `index.html` (about 15,750 lines of non-test TypeScript; 69 test files, 1,523 tests, soak 4/4)
- Build: about 311 kB JS (79 kB gzip), zero image, font or audio assets

**Key accomplishments:**

1. **Tunnel-proof physics (Phase 1):** Planck.js 1.5 with `setBullet` CCD on a fixed 120 Hz step. A 630 s seeded swept-containment soak stays green, with a CCD-off control that goes red, and state is bit-identical at 60/120/144 Hz.
2. **Flippers with real feel (Phase 2):** dynamic capsule bats on motorized revolute joints, a cradle FSM, sub-frame input and adaptive angular sub-stepping, so a bat can never sweep through the ball. "Heavy, not floaty" was approved by hand.
3. **Original table and game (Phases 3–4):** one parametric `table/spec` drives both colliders and drawing; a hold-to-charge plunger; a typed collision bus; bumpers, slingshots, rollovers and inlanes that score; nudge/tilt; and a 3-ball loop that replays bit-identically. Flipper input is hardened against Windows Shift quirks.
4. **Procedural look and sound (Phase 5):** a baked Canvas 2D playfield with interpolated moving parts at a stable 60 fps, and 13 Web Audio-synthesized cue voices on a 16-voice pool, guarded by an asset-free gate.
5. **Juice and rules (Phase 6):** screen shake, seeded particles, lamps and lighting, a rotating skill shot, an end-of-ball bonus tally, a 7 s ball save with a center-post kickback, and a localStorage high score with a fanfare. Reduced motion is honored throughout.
6. **Tech-debt hardening (06.1–06.4.1.1):** fixed the bat/sling pinch (2.6× → 1.00×), added a tilted-only ball search for the hinge-pocket soft-lock, trimmed the slings so mid-bat-to-tip flips clear them (61 → 0 of 94), added a measured narrow-viewport HUD bar, a procedural favicon behind a jsdom-validated gate, and an honest ready-only bar hint.

**Closeout type:** override_closeout

**Known verification overrides:** 3 newly acknowledged, 0 carried forward from a prior close (see STATE.md Deferred Items)

- 2 debug sessions (`left-shift-sticky-keys-flipper-stuck`, `shift-flipper-residual-stick`) still say `diagnosed`. Both were diagnosis-only, and their fixes shipped in gap-closure plans 04-11 to 04-14.
- 1 pending todo (`2026-11-24-rescale-bat-to-ball-for-root-shots`) is carried to the next milestone.
- 8 phase verifications are stale (3, 4, 5, 6, 06.1, 06.2, 06.3, 06.4). Their VERIFICATION.md says `passed`, but later tech-debt phases changed covered files. The user accepted the v1.0 audit at HEAD e6ab1a5 in place of re-verification: requirements 28/28, integration 36/36, flows 8/8, status `tech_debt`.

**Known gaps:** none. All 28 v1 requirements were checked off. The tech debt is listed in `milestones/v1.0-MILESTONE-AUDIT.md`.

**Archives:** `milestones/v1.0-ROADMAP.md`, `milestones/v1.0-REQUIREMENTS.md`, `milestones/v1.0-MILESTONE-AUDIT.md`, `milestones/v1.0-phases/`, `milestones/v1.0-quick/`

---
