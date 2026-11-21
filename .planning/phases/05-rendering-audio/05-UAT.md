---
status: testing
phase: 05-rendering-audio
source: [05-VERIFICATION.md]
started: 2026-11-21T00:00:00Z
updated: 2026-11-21T00:00:00Z
---

## Current Test

number: 1
name: "60 fps pacing: play 2 minutes in Chrome at 60 Hz with the diag readout and a DevTools Performance trace"
expected: |
  FPS holds at 60, no long frames, no GC spikes
awaiting: user response

## Tests

### 1. 60 fps pacing: play 2 minutes in Chrome at 60 Hz with the diag readout and a DevTools Performance trace
expected: FPS holds at 60, no long frames, no GC spikes
result: [pending]

### 2. 144 Hz smoothness: repeat on a 120/144 Hz display (or the DevTools FPS meter)
expected: Ball and both bats advance every frame, no visible stepping
result: [pending]

### 3. Visual polish at 1x and HiDPI (Ctrl + / Ctrl -), then open ?debug=1
expected: Dark space scene, stars, neon walls, glowing bumpers, sharp lines at every zoom, HUD legible and in theme; ?debug=1 shows the old debug drawing; Network tab shows no image, audio or font request
result: [pending]

### 4. Confirm the D-01 interpretation of ROADMAP SC1: the HUD is DOM text (src/ui/hud.ts), not painted on the Canvas
expected: Maintainer accepts "procedural, zero image assets" as meeting "HUD ... rendered on Canvas", or asks for a canvas HUD. If accepted, add an overrides: entry
result: [pending]

### 5. Hit each bumper, sling, rollover, wall, chute and both flippers
expected: Each flashes and decays cleanly, nothing outside the element flashes, walls and chute flash silently (RND-03)
result: [pending]

### 6. Headphone listening pass: bumper, slingshot, flipper up and down, launch short and full, drain, tilt, warning, start, game over, rollover, lane
expected: Every voice distinct and click-free, level and pitch follow impact strength, no distortion under bumper spam, nothing before the first gesture (AUD-01, SC4)
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
