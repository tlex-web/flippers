---
phase: 05
review: 05-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "[new, WR-02 fix code] Voices queued on a frozen-clock suspended context are never torn down, so the 16-voice bound does not hold for the audio graph"
  - id: IN-01
    severity: info
    disposition: open
    title: "[new, WR-02 fix code] The sandbox header still says cues are dropped while the context is not running"
  - id: IN-02
    severity: info
    disposition: open
    title: "[new, IN-03 fix code] A second live region contradicts the \"only announced line\" documentation, and unmuting is silent to assistive tech"
  - id: IN-03
    severity: info
    disposition: open
    title: "[new, IN-04 fix code] The asset gate still misses remote stylesheets, fonts and scripts"
  - id: IN-04
    severity: info
    disposition: open
    title: "[new, WR-01 fix code] Envelope points are built twice per layer; the steal anchor relies on two independent calls staying in step"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Cues recorded before a new context reports \"running\" are dropped, so the first \"start\" jingle can be lost"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "Per-element pitch offsets hard-code `TABLE_SPEC` ids inside the recipes"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "`AudioEngine.unlock` edge cases: leaked context on a `build()` failure, and an error logged on every key with a closed context"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "A global 30 s `testTimeout` applies to every test, not just the heavy simulation suites"
open: 5
total: 9
recorded: 2026-11-21T22:18:45.573Z
---

# Phase 05: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| WR-02 | warning | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-05 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-06 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-07 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
