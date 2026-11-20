---
status: testing
phase: 04-reactive-elements-game-rules
source: [04-VERIFICATION.md]
started: 2026-11-20T18:36:39Z
updated: 2026-11-20T18:36:39Z
---

## Current Test

number: 1
name: Bumper pop visibility
expected: |
  The ball visibly pops away from each bumper with added speed (about 5.5 m/s outward), the score jumps by 1,000 per touch, and the ball does not stick or ping-pong forever.
awaiting: user response

## Tests

### 1. Bumper pop visibility
Launch a ball into the bumper cluster (200/201/202) with the sandbox open.
expected: The ball visibly pops away from each bumper with added speed (about 5.5 m/s outward), the score jumps by 1,000 per touch, and the ball does not stick or ping-pong forever.
result: [pending]

### 2. Slingshot snap
Roll or drop a ball onto the left and right sling faces near the flippers.
expected: The ball is snapped out along the face (about 4.5 m/s), +500 per hit, left and right behave as mirrors, and a ball rolling along the passive faces is not kicked.
result: [pending]

### 3. Nudge direction and size
In a game, tap X, Period and ArrowUp once each, spaced about 2 s apart.
expected: X pushes the ball right, Period pushes it left, ArrowUp pushes it up-table; each is a small shove (about 1.2 m/s), never a jump, and none triggers WARNING. (Assumption A2: flip a sign in NUDGE_DIRS if it feels backwards.)
result: [pending]

### 4. Tilt fairness
Tap nudge keys rapidly (3 times, then a 4th) and then nudge once every 2 s.
expected: Third rapid nudge shows WARNING, the fourth shows TILT. Slow nudging never warns. A tilt costs only the current ball: score is kept and the next ball serves normally.
result: [pending]

### 5. TILT flipper drop (visual)
Hold a flipper key, then trigger TILT.
expected: The raised bat visibly falls, further presses do nothing until the next ball is served, and a key still held at the serve raises its bat at once.
result: [pending]

### 6. HUD legibility and layout
Open the page at a typical window size, then charge the plunger.
expected: Score, BALL n / 3, status and the controls hint are readable and do not overlap or hide the plunger charge meter or the table. The controls hint reads clearly (04-REVIEW IN-05 notes the ambiguous slash separator).
result: [pending]

### 7. Attract behavior
Load the page and do nothing, then press flipper keys and Space before Enter.
expected: No ball is on the table, the status line reads PRESS ENTER TO START, and flipper and plunger keys do nothing until Enter. After game over it reads GAME OVER · PRESS ENTER.
result: [pending]

### 8. Tilt on the final drain in the same step
Tilt on ball 3 as the ball is draining.
expected: The game ends cleanly with GAME OVER, the score is kept, both bats are down, and no stray ball remains.
result: [pending]

### 9. Judgment-tier prohibitions
Confirm the four prohibitions in the sandbox.
expected: (1) Kicks do not trap or add unbounded energy. (2) Rules and strings are original. (3) A nudge never moves the ball by a position write. (4) A tilt costs only the current ball.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
