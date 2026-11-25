# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-11-25
**Phases:** 12 (6 planned + 6 inserted) | **Plans:** 84 | **Sessions:** not tracked

### What Was Built

- Tunnel-proof fixed-step physics: Planck.js CCD at 120 Hz, a seeded 630 s swept-containment soak with a proven-red CCD-off control, and bit-identical state at 60/120/144 Hz.
- Weighty keyboard flippers on motorized revolute joints, with a cradle FSM, sub-frame input and adaptive angular sub-stepping. Windows Shift quirks are healed.
- An original space-themed table from one parametric `table/spec`, a hold-to-charge plunger, a typed collision bus, and a full 3-ball ruleset with nudge/tilt, skill shot, bonus, ball save with kickback, and a local high score.
- A procedural Canvas 2D look and 13 runtime-synthesized Web Audio voices, with zero assets enforced by a test gate.
- Juice: shake, particles, lamps, lighting and count-up score, all honoring reduced motion. Then six tech-debt phases hardened slings, HUD layout and the favicon gate.

### What Worked

- **Risk-first ordering.** Physics (Phase 1) and flipper feel (Phase 2) were proven in isolation before any table existed, so the Core Value was never at risk late.
- **RED-control gates.** Every safety proof (CCD soak, sub-stepping, pinch sweep, own-sling gate, ball search) shipped with a negative control that goes red. That made "green" trustworthy.
- **Determinism replays.** Bit-identical replays at 60/120/144 Hz, with and without presentation attached, caught presentation code that leaked into the sim, and made render-only claims checkable ("byte-identical to <sha>").
- **One spec for colliders and drawing.** No hit/draw drift bugs appeared after Phase 3.
- **By-hand feel checkpoints** (D-09, D-12, the UAT rounds) as blocking gates for anything feel-related. Numbers alone would have approved the pre-06.3 sling.
- **Throughput after the re-scope.** Phases 3 through 06.4.1.1 (71 plans) ran in 7 days (2026-11-19 → 11-25) on the established gate pattern.

### What Was Inefficient

- **Six inserted tech-debt phases (06.1–06.4.1.1) after the planned scope finished**, each spawned partly by the review and re-review of the one before. Review-disposition ledgers kept re-opening (re-reviews reused ids, so fixed rows were dropped). The milestone closed with ~30 info-level rows still open.
- **Slingshot geometry against flipper shots** took three phases (06.1 pinch, 06.3 trim, 06.4 rim) and still leaves the root-strip limit. The real cause is the bat-to-ball scale (2.5 ball radii vs ~5.6 on a real table), which was set in Phase 2 and never revisited against table geometry.
- **Windows Shift handling** took 5 of Phase 4's 15 plans (04-11..04-15) and two debug sessions. Platform keyboard quirks were not considered at input-design time.
- **Stale verifications.** Later tech-debt phases touched covered files, so 8 of 12 VERIFICATION reports went stale and the milestone needed an override close.
- **Planning overhead.** 452 of 788 commits are `docs`. The ratio of planning artifacts to code was high for the small-fix phases.

### Patterns Established

- Every safety or containment proof ships with a permanent RED control and a replayable seed.
- Render/DOM-only changes state their boundary as byte-identical files against a named sha and prove it with both determinism replays.
- The world write path is single and ordered: bus listeners only record and award, and `service()` applies impulses.
- Read-only getters for presentation (`isBallOnPlunger`, `getBallSearchCount`) that the sim never reads.
- Measured layout decisions (`sideHudClears`, `heightUnderBar`) instead of breakpoints.
- `.prettierignore` keeps tooling out of `.planning/`, so review ledgers are never reformatted.

### Key Lessons

1. Fix proportions before geometry. Check physical ratios (bat length vs ball radius) against the real-world reference when they are first set. Tuning table geometry around a wrong scale costs several phases and still leaves residuals.
2. Cap review loops. Decide up front how many re-review rounds a fix phase gets (06.4.1.1 D-09 did this), and disposition info-level rows in the same phase instead of carrying them forward.
3. Re-verify once, at the end. When tech-debt phases touch earlier phases' files, plan a single end-of-milestone re-verification instead of letting reports go stale one by one.
4. Treat target-platform input quirks (Windows VK_SHIFT merge, Sticky Keys) as design inputs for keyboard games, not UAT discoveries.

### Cost Observations

- Model mix: not tracked (config `model_profile: quality`)
- Sessions: not tracked
- Commits: 788 total (feat 100, fix 91, test 134, docs 452, other 11)
- Notable: two bursts. Phases 1–2 took 2 days (2026-07-15/16). After a four-month pause and the 2026-11-19 re-scope to an original table, everything else took 7 days at 47–151 commits a day.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | — | 12 (6 inserted) | Risk-first phases, RED-control gates, determinism replays as the render-only boundary proof |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 1,523 (+ soak 4/4) | not measured | 1 runtime dep (planck); jsdom dev-only |

### Top Lessons (Verified Across Milestones)

1. (Pending: needs a second milestone to cross-validate.)
