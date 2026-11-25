---
phase: 04
review: 04-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Quick-tap sweep still has no timeout budget and now takes 4.2 s of the 5 s default under full-suite load (carry-over of `f3ab8be` WR-04)"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "The timed re-press also fires for a SINGLE Shift held across a clear at slow typematic, which the `handleFocus` doc and header say cannot happen"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "The header residual names only two ways to recover from a missed fast re-press; a slower re-press of the same Shift also works"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "The timed re-press text is spliced into heal item (1), leaving \"(2) a\" dangling mid-paragraph"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "\"Drop both Shift codes\" heal also runs on Shift keydowns, not only on the documented keyup"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "`keyLabel` accepts whitespace and control characters as a cap label"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "04-09 hid a bat-to-wall pinch ejection by changing the test rig; the same pinch exists on TABLE_SPEC and got worse"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "The new quick-tap sweep exceeds Vitest's default 5 s timeout under full-suite load"
  - id: IN-06
    severity: info
    disposition: deferred
    title: "`resting` has no position guard, and the entry tolerance allows about 3x the measured slop"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "Dead `moved` writes on the returning path"
  - id: IN-08
    severity: info
    disposition: fixed
    title: "Stale \"upper/lower limit\" wording contradicts the mirrored-limit model"
  - id: IN-09
    severity: info
    disposition: skipped
    title: "The controls list does not say which nudge key goes which way, and key alternatives have no separator"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "The controls hint uses \"/\" both as a separator and as the Slash key"
open: 0
total: 13
recorded: 2026-11-21T03:03:14.663Z
---

# Phase 04: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 023ded9 (scoped 30 s timeout on the heavy suites, flipper-e2e.test.ts) |
| IN-01 | info | fixed | 06.1-03 1b35087, 085b833 (docs name the single-Shift timed re-press; test C4b) |
| IN-02 | info | fixed | 06.1-03 1b35087, 085b833 (residual names the slower same-Shift recovery; test C5b) |
| IN-03 | info | fixed | 06.1-03 085b833 (header heal list restructured as (1), (2), (3)) |
| WR-02 | warning | fixed | 7be129b (04-14: a Shift key's own event reconciles only on keyup; tests K1/K2) |
| IN-04 | info | fixed | 06.1-03 eb3f198, 17f56cc (keyLabel rejects whitespace, control and combining-mark values) |
| WR-03 | warning | fixed | 06.1-02 3653a41, fb4e81d: slings and inlane sensors moved 0.35 m up-table (D-01); seeded every-step inlane sweep ratio 1.00 vs no-sling control (was 2.43/2.64) with an old-geometry RED control; rule (1) case (e); user-approved |
| WR-04 | warning | fixed | 023ded9 (same fix as WR-01) |
| IN-06 | info | deferred | D-03 deferred: changes Core-Value flipper FSM behavior, not wording; measured resting slop 0.035 rad vs tolerance 0.1, harm theoretical (no UAT or test observed it); kept out of 06.1 so the sling geometry change stays the only feel change |
| IN-07 | info | fixed | 06.1-03 b69a924 (two dead moved stores removed from FlipperController) |
| IN-08 | info | fixed | 06.1-03 b69a924 (upper/lower wording replaced by raise limit and rest limit) |
| IN-09 | info | skipped | accepted in 04-UAT test 14 (the row lists keys only; result pass) |
| IN-05 | info | fixed | 04-10 (controls list as dl rows with kbd caps, index.html) |

## Lost to id reuse: 6590dce IN-04 (backlog, D-02)

6590dce's review raised IN-04, "A ball that never reaches the drain sensor soft-locks the game" (suggested fix: a ball-search timeout). c4c8a46 reused the id IN-04 for the keyLabel finding, so the gate replaced that open row silently. Phase 06.1 research found a concrete stuck spot: a dead-flipper rest at about (0.745, 5.21) on the left hinge against the funnel-wall end, and its mirror. 06.1-02's kickback search hit it again (6 candidates came to rest at (0.743, 5.208) or (2.159, 5.207), speed 0, bats dead). Per D-02 it goes to the backlog and is not fixed in 06.1. It is tracked by [the completed todo](../../todos/completed/2026-11-23-dead-flipper-hinge-pocket-soft-lock.md). It is not a table row because the id IN-04 is taken, and the gate would drop the row.

Resolved in phase 06.2 by plan 06.2-02 (aa4a5d7, c43b5be, fe10d58): a tilted-only ball search in GameSession kicks a ball that stays still outside PLUNGER_ZONE for 240 steps toward the playfield centre, and after 2 kicks forfeits it on the existing tilted path, with no geometry change. On the real table both hinge pockets were soft-locked at RED (aa4a5d7) and are searched free and forfeited at GREEN, with ball 2 served; a ballSearchSteps 0 control stays soft-locked.

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
