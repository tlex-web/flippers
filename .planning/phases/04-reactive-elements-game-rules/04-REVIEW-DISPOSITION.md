---
phase: 04
review: 04-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "A stale-Shift heal and a same-side press in one drain window drop the bat while the key is held"
  - id: WR-02
    severity: warning
    disposition: open
    title: "The Windows both-Shift lost keyup is never reconciled, because Shift-key events are excluded"
  - id: IN-01
    severity: info
    disposition: open
    title: "PlungerInput and GameInput lack the focus-regain clear, so the same late-keydown race strands a plunger charge"
  - id: IN-02
    severity: info
    disposition: open
    title: "`handleFocus` doc says \"window focus only follows a blur\", which is not always true"
  - id: IN-03
    severity: info
    disposition: open
    title: "The game-e2e comment says Space reaches every input, but `g.gameInput` is not fed"
  - id: WR-03
    severity: warning
    disposition: open
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
  - id: IN-04
    severity: info
    disposition: open
    title: "A ball that never reaches the drain sensor soft-locks the game"
  - id: IN-05
    severity: info
    disposition: open
    title: "The controls hint uses \"/\" both as a separator and as the Slash key"
open: 13
total: 13
recorded: 2026-11-20T22:45:53.783Z
---

# Phase 04: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| WR-03 | warning | open | - (not in the current review) |
| WR-04 | warning | open | - (not in the current review) |
| IN-06 | info | open | - (not in the current review) |
| IN-07 | info | open | - (not in the current review) |
| IN-08 | info | open | - (not in the current review) |
| IN-09 | info | open | - (not in the current review) |
| IN-04 | info | open | - (not in the current review) |
| IN-05 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
