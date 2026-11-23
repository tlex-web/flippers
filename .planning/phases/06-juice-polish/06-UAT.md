---
status: testing
phase: 06-juice-polish
source: [06-VERIFICATION.md]
started: 2026-11-23T02:40:00Z
updated: 2026-11-23T02:40:00Z
---

## Current Test

number: 1
name: Play several balls: nudge, hit bumpers, drain; watch the canvas
expected: |
  Shake is subtle and decays quickly, the HUD never shakes, and reduced-motion OS setting removes the shake entirely
awaiting: user response

## Tests

### 1. Play several balls: nudge, hit bumpers, drain; watch the canvas
expected: Shake is subtle and decays quickly, the HUD never shakes, and reduced-motion OS setting removes the shake entirely
result: [pending]

### 2. Look at the table at rest and in play
expected: Ball drop shadow, light pool and vignette read as 2.5D depth; lit vs unlit inserts and rollover lenses are clearly distinct; attract-mode chase is legible
result: [pending]

### 3. Plunge repeatedly with the lit skill-shot lane rotating; use a learned hold length
expected: A learned hold reliably reaches the lit lane (D-02 "bands not random"); SKILL SHOT status, sting and chevron glints fire; value ladder 5k..25k
result: [pending]

### 4. Drain a ball in the center while the 7 s ball save is running, repeatedly, with the flippers idle and with them held
expected: Decision needed on CR-01 (see 06-VERIFICATION.md Gaps / Warnings and 06-REVIEW.md): after a kickback the ball can fall back through the bat gap and drain within the save window, costing a ball even though BALL SAVED was just shown. Confirm this is acceptable, or fix
result: [pending]

### 5. Finish a game with a new best, hard-reload the page in a real browser, then also try with storage blocked
expected: HIGH SCORE persists across reload and NEW HIGH SCORE fanfare plays; with storage blocked play continues silently
result: [pending]

### 6. Run on a 144 Hz display and a 60 Hz display
expected: Stable 60 fps with particles, shadows, vignette and shake active; count-up and bonus tally pacing feel right
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
