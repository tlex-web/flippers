---
status: complete
phase: 03-table-plunger-event-bus
source: [03-VERIFICATION.md]
started: 2026-11-20T00:00:00Z
updated: 2026-11-20T13:22:15.093Z
---

## Current Test

[testing complete]

## Tests

### 1. Layout readability and ball flow
expected: Run `npm run dev`, open the sandbox and watch the table. The chute, three-bumper cluster, rollover lanes, orbit guides, inlanes, slingshots, drain funnel and inverted-V flippers read clearly as a coherent original table, and a launched ball flows through the field to the flippers/drain with no obvious dead zones.
result: pass
automated_notes: "Flow half checked in Chrome (2026-11-20): 10 launched balls drained, 0 stalls >1 s outside the plunger lane. Full plunge takes the left orbit → left side → inlane #500 → left flipper → drain (skips lanes and bumpers); charge ~0.79 crosses rollover #401 → bumper #200 → inlane #501 → drain. Readability is a by-eye call left to the user."

### 2. Charge meter readability
expected: Hold Space and watch the meter and plunger pullback, releasing at several fill levels. The meter fills smoothly bottom to top over about 0.67 s, longer holds visibly read as more charge, the pullback tracks the meter, and release launches proportionally.
result: pass
source: automated
evidence: "Chrome run: fill 0→1 in 650 ms, monotonic. Canvas crops at charge 0/0.25/0.5/0.76/1.0 show bottom-to-top fill through the quarter ticks, red at full, tip retracting in step. Launch speed 3.96/5.15/7.61/10.0/11.9 m/s at charge 0.10/0.24/0.51/0.79/1.0, matching (0.4 + 1.1c)/m."

### 3. Live bus console lines
expected: With devtools open, launch a ball and let it fall through a rollover lane, an inlane and the drain. `[bus] ball N rollover/lane/drain #id at (x, y)` lines appear for sensors, throttled solid-contact lines appear for walls/bumpers/flippers, and a fresh ball is parked on the plunger after a drain.
result: pass
source: automated
evidence: "Chrome console: rollover #401, lane #500/#501, drain #600 lines; throttled wall/slingshot/bumper/flipper lines with impulse; next ball id logged at the plunger (3.15, 6.39) after every drain; no console errors."

### 4. CR-01 playtest (parked ball and re-feed)
expected: Leave the parked ball idle, then launch several balls, including a drain and re-feed. The parked ball is never respawned while idle, each Space launch fires the ball up the chute, and a drained ball is replaced by exactly one fresh ball at the plunger. If you have a 120/144 Hz display, test on it.
result: pass
source: automated
evidence: "Chrome run: parked ball idle for minutes plus 10 s / 3 s / 3 s watches, same id the whole time. 13 launches all went up the chute; 10 drains, each re-fed with exactly one ball (ids +1, never more than 1 ball). A real 120/144 Hz display was not available (the occluded tab ran a timer driver at ~52 fps); headless ball-feed tests cover 60/120/144 Hz."

### 5. WR-02 render interpolation on respawn
expected: Watch a drain-and-respawn in the browser. No one-frame streak is drawn from the drain to the plunger when the ball respawns.
result: pass
source: automated
evidence: "Recorded every drawn ball position: in all 10 respawns the drawn ball goes from the drain (~1.6, 5.87) straight to the spawn (3.150, 6.199) on the next frame, with no in-between position."

### 6. WR-03 flipper drawing matches collider
expected: Compare the drawn flipper against the ball contact point at the tip and hinge. The ball touches the visible tip, and the resting tip-to-tip gap looks wider than the ball.
result: pass
source: automated
evidence: "Live Planck fixtures: circles at local x 0.07/0.43 r0.07 plus a box at x 0.07..0.43, ±0.07 — identical to the drawn stadium (x 0..0.5, ±0.07). Resting cradle contact sits 0.005 m off the drawn surface (≈0.5 px); tip contacts are within −0.013..+0.015 m. Resting tip-to-tip gap is 0.588 m vs a 0.40 m ball."

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
