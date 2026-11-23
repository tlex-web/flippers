---
status: complete
phase: 06-juice-polish
source: [06-VERIFICATION.md]
started: 2026-11-23T02:40:00Z
updated: 2026-11-23T10:34:28.889Z
---

## Current Test

[testing complete]

## Tests

### 1. Play several balls: nudge, hit bumpers, drain; watch the canvas
expected: Shake is subtle and decays quickly, the HUD never shakes, and reduced-motion OS setting removes the shake entirely
result: pass

### 2. Look at the table at rest and in play
expected: Ball drop shadow, light pool and vignette read as 2.5D depth; lit vs unlit inserts and rollover lenses are clearly distinct; attract-mode chase is legible
result: pass

### 3. Plunge repeatedly with the lit skill-shot lane rotating; use a learned hold length
expected: A learned hold reliably reaches the lit lane (D-02 "bands not random"); SKILL SHOT status, sting and chevron glints fire; value ladder 5k..25k
result: pass

### 4. Drain a ball in the center while the 7 s ball save is running, repeatedly, with the flippers idle and with them held
expected: CR-01 fixed (24b6c31): BALL SAVED shows and the ball is kicked back; if it falls straight back through the gap within ~2 s it is re-served, not lost — the ball count never drops inside the save window
result: pass

### 5. Finish a game with a new best, hard-reload the page in a real browser, then also try with storage blocked
expected: HIGH SCORE persists across reload and NEW HIGH SCORE fanfare plays; with storage blocked play continues silently
result: pass

### 6. Run on a 144 Hz display and a 60 Hz display
expected: Stable 60 fps with particles, shadows, vignette and shake active; count-up and bonus tally pacing feel right
result: pass

### 7. Lose the last ball shortly after a ball save fires, so the game ends
expected: WR-01 fixed (c262aa1): BALL SAVED disappears once the ball is lost; the GAME OVER prompt shows cleanly and is never overridden by BALL SAVED
result: pass

### 8. Plunge and let the ball drain inside the ball save before it touches any scoring switch, so it is re-served
expected: IN-04 rule (40295c0): one skill shot per ball — the re-served ball sits in the plunger with no rotating lit skill-shot lane and no second attempt
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
