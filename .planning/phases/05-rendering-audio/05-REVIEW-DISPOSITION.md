---
phase: 05
review: 05-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "[new, 9d1f3b1 WR-01 fix] Any activating gesture after expiry reopens the window, so a resume that never settles is unbounded again (regression of the previous WR-01 bound)"
  - id: WR-02
    severity: warning
    disposition: open
    title: "[new, 9d1f3b1 x 60c34ac] The reopen path discards and hard-cuts voices on a context that IN-05 already treats as rendering"
  - id: IN-01
    severity: info
    disposition: open
    title: "[new, 56df7b0 / 9d1f3b1 / 60c34ac] The window documentation still says \"at most STARTING_WINDOW_MS after the first resume()\""
  - id: IN-02
    severity: info
    disposition: open
    title: "[new, 47d0caa] `applyEnvelope` is now test-only, and the envelope header still describes \"one thin applier\""
  - id: IN-03
    severity: info
    disposition: open
    title: "[new, 3876b5b] The asset gate still misses a few ways to pull assets into the page from script"
  - id: IN-04
    severity: info
    disposition: open
    title: "[new, 60c34ac] IN-05's \"suspended with no resume pending stays not-rendering\" branch has no clock-advanced test"
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
open: 6
total: 9
recorded: 2026-11-21T23:31:53.209Z
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
| IN-05 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-06 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-07 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
