---
phase: 05
review: 05-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Mute ramp and Firefox voice-steal fade start from a stale event, so the 50 ms fade is effectively an instant cut"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Cues recorded before a new context reports \"running\" are dropped, so the first \"start\" jingle can be lost"
  - id: IN-01
    severity: info
    disposition: open
    title: "The flash clock runs one step ahead of the interpolated scene, and the first rendered frame of every flash is already past its hold"
  - id: IN-02
    severity: info
    disposition: open
    title: "`FixedStepLoop.advance` does not floor a negative delta, so `alpha` can go below 0 and interpolation extrapolates"
  - id: IN-03
    severity: info
    disposition: open
    title: "The mute key ignores modifiers and there is no on-screen mute state"
  - id: IN-04
    severity: info
    disposition: open
    title: "The asset-free gate has blind spots"
  - id: IN-05
    severity: info
    disposition: open
    title: "Per-element pitch offsets hard-code `TABLE_SPEC` ids inside the recipes"
  - id: IN-06
    severity: info
    disposition: open
    title: "`AudioEngine.unlock` edge cases: leaked context on a `build()` failure, and an error logged on every key with a closed context"
  - id: IN-07
    severity: info
    disposition: open
    title: "A global 30 s `testTimeout` applies to every test, not just the heavy simulation suites"
open: 9
total: 9
recorded: 2026-11-21T20:25:10.653Z
---

# Phase 05: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
