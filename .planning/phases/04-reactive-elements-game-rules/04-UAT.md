---
status: complete
phase: 04-reactive-elements-game-rules
source: [04-VERIFICATION.md]
started: 2026-11-20T18:36:39Z
updated: 2026-11-20T19:19:27.227Z
---

## Current Test

[testing complete]

## Tests

### 1. Bumper pop visibility
Launch a ball into the bumper cluster (200/201/202) with the sandbox open.
expected: The ball visibly pops away from each bumper with added speed (about 5.5 m/s outward), the score jumps by 1,000 per touch, and the ball does not stick or ping-pong forever.
result: pass

### 2. Slingshot snap
Roll or drop a ball onto the left and right sling faces near the flippers.
expected: The ball is snapped out along the face (about 4.5 m/s), +500 per hit, left and right behave as mirrors, and a ball rolling along the passive faces is not kicked.
result: pass

### 3. Nudge direction and size
In a game, tap X, Period and ArrowUp once each, spaced about 2 s apart.
expected: X pushes the ball right, Period pushes it left, ArrowUp pushes it up-table; each is a small shove (about 1.2 m/s), never a jump, and none triggers WARNING. (Assumption A2: flip a sign in NUDGE_DIRS if it feels backwards.)
result: pass
note: "Automated browser run (Claude, live page, scripted key events + measured state): X dv=+1.194 m/s (right), Period dv=-1.194 (left), ArrowUp dv=-1.194 in y (up-table); position change at the impulse = 0; 3 nudges 2 s apart peak tilt level 0.99, no WARNING. A2 direction is per spec; whether it feels backwards is still the user's call."

### 4. Tilt fairness
Tap nudge keys rapidly (3 times, then a 4th) and then nudge once every 2 s.
expected: Third rapid nudge shows WARNING, the fourth shows TILT. Slow nudging never warns. A tilt costs only the current ball: score is kept and the next ball serves normally.
result: pass
note: "Automated: 3 taps inside the 30-step cooldown accepted once; nudges 30 steps apart -> 3rd WARNING (level 2.73), 4th TILT (3.60). 2 s spacing never warned. Score 10,000 at TILT kept, no points while tilted, next ball served as BALL 3 / 3 with level 0 and flippers live."

### 5. TILT flipper drop (visual)
Hold a flipper key, then trigger TILT.
expected: The raised bat visibly falls, further presses do nothing until the next ball is served, and a key still held at the serve raises its bat at once.
result: pass
note: "Automated: held-up bat drops on TILT, R press ignored while tilted, L held through the drain re-raised at the serve (flipping-up on the serve step, held-up 10 steps later). The drop only starts ~15 steps (~130 ms) after the TILT; same cause as test 10."

### 6. HUD legibility and layout
Open the page at a typical window size, then charge the plunger.
expected: Score, BALL n / 3, status and the controls hint are readable and do not overlap or hide the plunger charge meter or the table. The controls hint reads clearly (04-REVIEW IN-05 notes the ambiguous slash separator).
result: issue
reported: "Automated run (Claude), 1280x684 @1.5x: score, BALL n / 3 and status are readable and nothing overlaps the table or the plunger meter. But the controls hint reads \"· / / → / Right Shift\": the Slash key is indistinguishable from the separator (IN-05, still open), and the wrap splits \"left / flipper\" and \"right / flipper\" across lines. Separately, the FPS / Physics Hz / Kinetic E readout in the canvas top-left renders ~3.5 px tall and is unreadable."
severity: cosmetic

### 7. Attract behavior
Load the page and do nothing, then press flipper keys and Space before Enter.
expected: No ball is on the table, the status line reads PRESS ENTER TO START, and flipper and plunger keys do nothing until Enter. After game over it reads GAME OVER · PRESS ENTER.
result: pass
note: "Automated: before Enter, ArrowLeft/Z/ArrowRight/Space left 0 balls and both bats resting; status PRESS ENTER TO START. After game over: GAME OVER · PRESS ENTER."

### 8. Tilt on the final drain in the same step
Tilt on ball 3 as the ball is draining.
expected: The game ends cleanly with GAME OVER, the score is kept, both bats are down, and no stray ball remains.
result: pass
note: "Automated: on ball 3, the 4th nudge (level 2.07 -> TILT) was applied at the top of the exact fixed step whose world.step reported the drain. After that step: GAME OVER · PRESS ENTER, score 22,000 kept, both bats resting at rest angle, 0 balls, flippers disabled."

### 9. Judgment-tier prohibitions
Confirm the four prohibitions in the sandbox.
expected: (1) Kicks do not trap or add unbounded energy. (2) Rules and strings are original. (3) A nudge never moves the ball by a position write. (4) A tilt costs only the current ball.
result: pass
note: "Automated: (1) reactive-table-soak gate passed; a 60,000-step live autoplay had a max ball speed of 21.2 m/s (bounded), and the ball never sat still >= 5 s off the plunger. (2) User-facing strings are generic (PRESS ENTER TO START, GAME OVER, WARNING, TILT, BALL n / 3). (3) Nudge path = applyLinearImpulse only; measured position delta 0. (4) Covered by test 4."

### 10. Flipper press/release response (user-reported during UAT)
Tap and hold the flipper keys (any binding) in a game.
expected: A bat starts rising within 1-2 fixed steps of a press and starts falling within 1-2 steps of a release, whatever the hold length, and a released bat always returns to rest.
result: issue
reported: "I noticed already that the flippers might get stuck when using the arrow keys"
severity: major
note: "Automated confirmation (Claude, live page, Z / Slash and arrows alike): (a) a tap released 5-8 fixed steps (40-65 ms) after the press leaves the bat stuck UP (FSM resting, motor 0) until the next press, in 20 of 800 fuzzed taps (7 arrows, 13 Z/Slash), about 25% of taps in that window; (b) after any hold of 10+ steps the bat stays motionless 15-16 steps (~130 ms) after release; (c) the press lag is 1-5 steps depending on the prior rest state. Not specific to the arrow keys: every binding shares the same side latch."

## Summary

total: 10
passed: 8
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-04-6
  truth: "Score, BALL n / 3, status and the controls hint are readable and do not overlap or hide the plunger charge meter or the table. The controls hint reads clearly."
  status: failed
  reason: "Automated run reported: controls hint reads '· / / → / Right Shift' (Slash key indistinguishable from the separator, IN-05 open) and wraps 'left / flipper' and 'right / flipper' across lines; the canvas FPS/Hz/KE readout renders ~3.5 px tall and is unreadable."
  severity: cosmetic
  test: 6
  root_cause: "index.html:82 hint text uses '/' as both separator and the Slash key name. The diagnostic readout is drawn at 14px in canvas logical space (debug-draw.ts:494), but the canvas (logical 1512x2708, backing 2268x4062 at dpr 1.5) is CSS-fit to 367x657 (~0.24x), so the text lands at ~3.4 px."
  artifacts:
    - path: "index.html"
      issue: "Controls hint '· / / → /' ambiguity (line 82) and unbalanced line wrap"
    - path: "src/sandbox/debug-draw.ts"
      issue: "drawHud readout font sized in canvas logical px, shrunk by the CSS fit-to-viewport scale"
  missing:
    - "Name the Slash key unambiguously in the hint (e.g. a key-cap style or the word 'Slash') and wrap per control group"
    - "Size the canvas readout for the displayed scale (or move it to the DOM / hide it outside a debug flag)"
  debug_session: ""

- gap_id: G-04-10
  truth: "A bat starts rising within 1-2 fixed steps of a press and starts falling within 1-2 steps of a release, whatever the hold length, and a released bat always returns to rest."
  status: failed
  reason: "User reported: I noticed already that the flippers might get stuck when using the arrow keys"
  severity: major
  test: 10
  root_cause: "Two coupled defects, neither key-specific. (1) Dead time: Planck 1.5's RevoluteJoint (Box2D 2.3 solver) warm-starts the accumulated motor impulse. Driving a bat into its limit at FLIPPER_MAX_MOTOR_TORQUE=500 saturates m_motorImpulse at dt*500=4.17, cancelled by the limit impulse. setFlipperMotor only changes the motor speed, so on reversal the solver unwinds that impulse a little per velocity iteration and the bat sits still ~15 steps (~130 ms) after release (1-5 steps on press). Zeroing joint.m_motorImpulse at release cut the lag from 15 to 1 step in-browser. (2) Stuck up: FlipperController's settle detector (ANGLE_SETTLE_EPS=1e-3; 'moved then stopped' = at limit) reads the limit position-correction drift during that dead time (e.g. 0.475 -> 0.436 -> 0.431 rad) as 'moved', then 'settled'. It flips returning -> resting with motor 0 while the bat is still raised, and motor 0 at 500 torque brakes it there until the next press."
  artifacts:
    - path: "src/physics/planck-world.ts"
      issue: "setFlipperMotor (~line 825) changes the motor speed only; the warm-started motor impulse survives a direction change"
    - path: "src/control/flipper-controller.ts"
      issue: "update()/returning: the settle detector enters resting (motor 0) without checking the bat is at its rest limit"
    - path: "src/physics/constants.ts"
      issue: "FLIPPER_MAX_MOTOR_TORQUE = 500 saturates the motor against the limit every hold"
    - path: "src/sandbox/flipper-e2e.test.ts"
      issue: "Press latency is only asserted from a fresh world; release-after-long-hold latency and quick-tap return are untested"
  missing:
    - "Clear/neutralise the warm-started motor impulse on every motor direction change (or stop saturating the motor against the limit) so press and release respond in <= 2 steps after any hold or rest length"
    - "Only enter resting (motor 0) when the bat is actually at its rest limit; a released bat must always return"
    - "Regression tests: release latency after a >= 60-step hold <= 2 steps; press latency after a long rest <= 2 steps; quick-tap sweep (hold 3-10 steps) never leaves a bat raised"
  debug_session: ""
