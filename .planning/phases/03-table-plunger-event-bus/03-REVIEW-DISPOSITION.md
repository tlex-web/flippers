---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "The plunger rest position is below the drain line, so the parked ball respawns every frame and launches are lost"
  - id: CR-02
    severity: critical
    disposition: fixed
    title: "Sensor events (lane/rollover/drain) report a stale point from an unrelated contact"
  - id: WR-01
    severity: warning
    disposition: open
    title: "`addBall` steps the entire world outside the loop, which breaks the one-batch-per-step bus contract and determinism"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Render interpolation pairs balls by array index, so a respawn draws a one-frame streak from the drain to the plunger"
  - id: WR-03
    severity: warning
    disposition: open
    title: "The flipper is drawn 0.07 m longer than its collider at both ends, so what is drawn is not what is hit"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "A throwing bus listener permanently freezes the game loop and desyncs the accumulator"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "The real-table containment gate cannot see bumpers"
  - id: IN-01
    severity: info
    disposition: open
    title: "The plunger launches any ball in the zone, not only a resting one"
  - id: IN-02
    severity: info
    disposition: open
    title: "Edges latched in the same drain window are applied press-first, which can drop a new press"
  - id: IN-03
    severity: info
    disposition: open
    title: "Stale and contradictory documentation after the table switch"
  - id: IN-04
    severity: info
    disposition: open
    title: "The real-table soak only sweeps flipper 0, so the right bat is never driven"
  - id: IN-05
    severity: info
    disposition: open
    title: "`drainEvents()` exposes the adapter's internal reused array as mutable"
open: 8
total: 12
recorded: 2026-11-19T23:01:53.216Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 03-REVIEW-FIX.md |
| CR-02 | critical | fixed | 03-REVIEW-FIX.md |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | fixed | 03-REVIEW-FIX.md |
| WR-05 | warning | fixed | 03-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
