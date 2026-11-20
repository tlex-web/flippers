---
phase: 04
review: 04-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "The e2e and determinism proofs test a hand-copied composition, not `main.ts`"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Auto-repeat keydowns on the flipper keys are not `preventDefault`ed (Firefox quick-find on a held `/`)"
  - id: IN-01
    severity: info
    disposition: open
    title: "A second kick on the same ball in one `service()` reads a stale velocity snapshot"
  - id: IN-02
    severity: info
    disposition: open
    title: "For one render frame after a drain or serve, the drained ball still shows and the new ball is missing"
  - id: IN-03
    severity: info
    disposition: open
    title: "`applyEdges` loses a press-release-press tap that lands inside one fixed-step window from idle"
  - id: IN-04
    severity: info
    disposition: open
    title: "A ball that never reaches the drain sensor soft-locks the game"
  - id: IN-05
    severity: info
    disposition: open
    title: "The controls hint uses \"/\" both as a separator and as the Slash key"
open: 7
total: 7
recorded: 2026-11-20T18:32:20.047Z
---

# Phase 04: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
