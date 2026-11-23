---
phase: 06
review: 06-REVIEW.md
titles: json
findings:
  - id: IN-01
    severity: info
    disposition: open
    title: "The new HUD test \"a skill step cleared to -1 shows nothing\" passes without the guard it claims to pin"
  - id: IN-02
    severity: info
    disposition: open
    title: "`SaveKind` is still declared in `ball-save.ts`, which no longer uses it"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "The kickback grace is a fixed 2 s, so a kicked ball that drains later but still inside the save window costs a ball (CR-01 only partly fixed)"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "A grace backstop shows BALL SAVED but sounds like a lost ball: drain cue and shake, no ballSave cue"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "The same-step path rewrites the session's save kind but not `BallSave`'s"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "The test title still claims the skill phase carries over a backstop"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "The chevron loop silently drops skill lanes beyond three, and the WR-03 test computes lamp indices by arithmetic"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "The lamp shape table now pulls in the effects runtime for one geometry helper"
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
open: 2
total: 11
recorded: 2026-11-23T11:21:23.346Z
---

# Phase 06: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| CR-01 | critical | fixed | 06-REVIEW-FIX.md (not in the current review) |
| WR-01 | warning | fixed | 06-REVIEW-FIX.md (not in the current review) |
| IN-03 | info | fixed | 06-REVIEW-FIX.md (not in the current review) |
| IN-04 | info | fixed | 06-REVIEW-FIX.md (not in the current review) |
| IN-05 | info | fixed | 06-REVIEW-FIX.md (not in the current review) |
| IN-06 | info | fixed | 06-REVIEW-FIX.md (not in the current review) |
| WR-02 | warning | fixed | 06-REVIEW-FIX.md (not in the current review) |
| WR-03 | warning | fixed | 06-REVIEW-FIX.md (not in the current review) |
| WR-04 | warning | fixed | 06-REVIEW-FIX.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
