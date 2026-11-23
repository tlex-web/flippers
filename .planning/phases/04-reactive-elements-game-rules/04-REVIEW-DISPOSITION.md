---
phase: 04
review: 04-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Quick-tap sweep still has no timeout budget and now takes 4.2 s of the 5 s default under full-suite load (carry-over of `f3ab8be` WR-04)"
  - id: IN-01
    severity: info
    disposition: open
    title: "The timed re-press also fires for a SINGLE Shift held across a clear at slow typematic, which the `handleFocus` doc and header say cannot happen"
  - id: IN-02
    severity: info
    disposition: open
    title: "The header residual names only two ways to recover from a missed fast re-press; a slower re-press of the same Shift also works"
  - id: IN-03
    severity: info
    disposition: open
    title: "The timed re-press text is spliced into heal item (1), leaving \"(2) a\" dangling mid-paragraph"
  - id: WR-02
    severity: warning
    disposition: open
    title: "\"Drop both Shift codes\" heal also runs on Shift keydowns, not only on the documented keyup"
  - id: IN-04
    severity: info
    disposition: open
    title: "`keyLabel` accepts whitespace and control characters as a cap label"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "04-09 hid a bat-to-wall pinch ejection by changing the test rig; the same pinch exists on TABLE_SPEC and got worse"
  - id: WR-04
    severity: warning
    disposition: open
    title: "The new quick-tap sweep exceeds Vitest's default 5 s timeout under full-suite load"
  - id: IN-06
    severity: info
    disposition: open
    title: "`resting` has no position guard, and the entry tolerance allows about 3x the measured slop"
  - id: IN-07
    severity: info
    disposition: open
    title: "Dead `moved` writes on the returning path"
  - id: IN-08
    severity: info
    disposition: open
    title: "Stale \"upper/lower limit\" wording contradicts the mirrored-limit model"
  - id: IN-09
    severity: info
    disposition: open
    title: "The controls list does not say which nudge key goes which way, and key alternatives have no separator"
  - id: IN-05
    severity: info
    disposition: open
    title: "The controls hint uses \"/\" both as a separator and as the Slash key"
open: 12
total: 13
recorded: 2026-11-21T03:03:14.663Z
---

# Phase 04: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| WR-02 | warning | open | - (not in the current review) |
| IN-04 | info | open | - (not in the current review) |
| WR-03 | warning | fixed | 06.1-02 3653a41, fb4e81d: slings and inlane sensors moved 0.35 m up-table (D-01); seeded every-step inlane sweep ratio 1.00 vs no-sling control (was 2.43/2.64) with an old-geometry RED control; rule (1) case (e); user-approved |
| WR-04 | warning | open | - (not in the current review) |
| IN-06 | info | open | - (not in the current review) |
| IN-07 | info | open | - (not in the current review) |
| IN-08 | info | open | - (not in the current review) |
| IN-09 | info | open | - (not in the current review) |
| IN-05 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
