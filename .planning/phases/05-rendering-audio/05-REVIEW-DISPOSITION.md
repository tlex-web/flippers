---
phase: 05
review: 05-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "[new, f1b2a1e WR-01 fix code] The starting window never reopens while the first resume is pending, so the \"start\" cue is dropped when a real activation finally starts the context"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "[new, WR-02 fix code] The sandbox header still says cues are dropped while the context is not running"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "[new, IN-03 fix code] A second live region contradicts the \"only announced line\" documentation, and unmuting is silent to assistive tech"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "[new, IN-04 fix code] The asset gate still misses remote stylesheets, fonts and scripts"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "[new, WR-01 fix code] Envelope points are built twice per layer; the steal anchor relies on two independent calls staying in step"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "[new, f1b2a1e WR-01 fix code] `state === \"running\"` lags real rendering, so a steal or discard during start-up can cut a voice that is already sounding"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "[new, f1b2a1e WR-01 fix code] The \"starts inside the window\" test cannot detect a too-short window, and the double-teardown path has no test"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "[new, f1b2a1e WR-01 fix code] Already-defended-elsewhere: `add()`'s steal loop, and the `rendering` flag added to it, never run from the engine"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Cues recorded before a new context reports \"running\" are dropped, so the first \"start\" jingle can be lost"
open: 0
total: 9
recorded: 2026-11-21T23:05:52.848Z
---

# Phase 05: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 05-REVIEW-FIX.md |
| IN-01 | info | fixed | 05-REVIEW-FIX.md |
| IN-02 | info | fixed | 05-REVIEW-FIX.md |
| IN-03 | info | fixed | 05-REVIEW-FIX.md |
| IN-04 | info | fixed | 05-REVIEW-FIX.md |
| IN-05 | info | fixed | 05-REVIEW-FIX.md |
| IN-06 | info | fixed | 05-REVIEW-FIX.md |
| IN-07 | info | fixed | 05-REVIEW-FIX.md |
| WR-02 | warning | fixed | 05-REVIEW-FIX.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
