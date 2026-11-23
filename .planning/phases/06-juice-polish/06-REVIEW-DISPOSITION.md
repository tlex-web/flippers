---
phase: 06
review: 06-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "A kickback spends the ball save, and the ball still drains inside the save window, costing a ball"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "\"BALL SAVED\" (and the live-region announcement) can outlive a lost ball and override the game-over prompt"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "The same-step kickback+drain path plays the post flourish and save sparks for a ball that was removed and re-served"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Lamp geometry and skill-shot lanes are hard-coded copies of spec positions and ids"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Impossible-state guard — `NUDGE_DIRS[dir]` undefined check in `ShakeTracker.kick`"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "`parseBest` accepts hex, exponent and padded strings, contrary to its \"decimal integer string\" contract"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "Dead code left by Phase 6"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "The render layer imports a type from the sandbox composition root"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "A backstop re-serve can reopen an unresolved skill shot, giving the same ball a second attempt"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "The lamp shape table is built twice"
open: 0
total: 10
recorded: 2026-11-23T10:05:28.358Z
---

# Phase 06: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 06-REVIEW-FIX.md |
| WR-01 | warning | fixed | 06-REVIEW-FIX.md |
| WR-02 | warning | fixed | 06-REVIEW-FIX.md |
| WR-03 | warning | fixed | 06-REVIEW-FIX.md |
| WR-04 | warning | fixed | 06-REVIEW-FIX.md |
| IN-01 | info | fixed | 06-REVIEW-FIX.md |
| IN-02 | info | fixed | 06-REVIEW-FIX.md |
| IN-03 | info | fixed | 06-REVIEW-FIX.md |
| IN-04 | info | fixed | 06-REVIEW-FIX.md |
| IN-05 | info | fixed | 06-REVIEW-FIX.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
