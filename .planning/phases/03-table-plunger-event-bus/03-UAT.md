---
status: testing
phase: 03-table-plunger-event-bus
source: [03-VERIFICATION.md]
started: 2026-11-20T00:00:00Z
updated: 2026-11-20T00:00:00Z
---

## Current Test

number: 1
name: Layout readability and ball flow
expected: |
  Run `npm run dev`, open the sandbox, and watch the table. The chute, three-bumper cluster,
  rollover lanes, orbit guides, inlanes, slingshots, drain funnel and the inverted-V flippers
  read clearly as a coherent original pinball table, and a launched ball flows through the
  field to the flippers/drain with no obvious dead zones.
awaiting: user response

## Tests

### 1. Layout readability and ball flow
expected: Run `npm run dev`, open the sandbox and watch the table. The chute, three-bumper cluster, rollover lanes, orbit guides, inlanes, slingshots, drain funnel and inverted-V flippers read clearly as a coherent original table, and a launched ball flows through the field to the flippers/drain with no obvious dead zones.
result: [pending]

### 2. Charge meter readability
expected: Hold Space and watch the meter and plunger pullback, releasing at several fill levels. The meter fills smoothly bottom to top over about 0.67 s, longer holds visibly read as more charge, the pullback tracks the meter, and release launches proportionally.
result: [pending]

### 3. Live bus console lines
expected: With devtools open, launch a ball and let it fall through a rollover lane, an inlane and the drain. `[bus] ball N rollover/lane/drain #id at (x, y)` lines appear for sensors, throttled solid-contact lines appear for walls/bumpers/flippers, and a fresh ball is parked on the plunger after a drain.
result: [pending]

### 4. CR-01 playtest (parked ball and re-feed)
expected: Leave the parked ball idle, then launch several balls, including a drain and re-feed. The parked ball is never respawned while idle, each Space launch fires the ball up the chute, and a drained ball is replaced by exactly one fresh ball at the plunger. If you have a 120/144 Hz display, test on it.
result: [pending]

### 5. WR-02 render interpolation on respawn
expected: Watch a drain-and-respawn in the browser. No one-frame streak is drawn from the drain to the plunger when the ball respawns.
result: [pending]

### 6. WR-03 flipper drawing matches collider
expected: Compare the drawn flipper against the ball contact point at the tip and hinge. The ball touches the visible tip, and the resting tip-to-tip gap looks wider than the ball.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
