---
phase: 05
review: 05-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Invariant 2 holds only for the episode's first two gestures. After a failed device start, the recovering Enter's \"start\" figure is dropped"
  - id: IN-01
    severity: info
    disposition: open
    title: "The rendering test compares the clock with a per-window anchor, so an unobserved run makes a frozen, suspended context count as \"rendering\" forever"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "A resume() that rejects re-arms the window on every gesture, so the bound only holds for a resume that stays pending"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Impossible-state guard: `activationReopened = false` in the fresh-resume branch"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "The remote-module asset pattern misses side-effect imports and template-literal specifiers"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "[new, 3876b5b] The asset gate still misses a few ways to pull assets into the page from script"
  - id: IN-04
    severity: info
    disposition: fixed
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
open: 2
total: 10
recorded: 2026-11-22T00:29:39.800Z
---

# Phase 05: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| IN-01 | info | open | - |
| WR-02 | warning | fixed | 05-REVIEW-FIX.md (not in the current review) |
| WR-03 | warning | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-02 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-03 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-04 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-05 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-06 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |
| IN-07 | info | fixed | 05-REVIEW-FIX.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
