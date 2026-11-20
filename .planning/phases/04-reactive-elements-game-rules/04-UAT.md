---
status: diagnosed
phase: 04-reactive-elements-game-rules
source: [04-VERIFICATION.md]
started: 2026-11-20T18:36:39Z
updated: 2026-11-20T21:55:43Z
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

### 11. Flipper feel on all six bindings (UAT test 10 re-test). Run `npm run dev`, press Enter. On each of Z, Left Shift, Left Arrow, /, Right Shift, Right Arrow: make quick taps of varied length, hold a long cradle then release, and over-nudge to TILT once while holding a bat up.
expected: Each bat snaps up the instant its key goes down and starts falling the instant it comes up, even after a multi-second cradle. No tap leaves a bat hanging raised. On TILT the held bat drops at once with no visible ~130 ms pause. Cradle and catch still feel heavy (the Phase 2 approval was given on the pre-04-09 dynamics).
result: issue
reported: "i was only able to test the flippers with the arrow keys. i noticed that the shift key is not working properly since the left shift is activating sticky keys after many clicks and the flipper gets stuck."
severity: major
note: "Arrow keys were tested and not reported as faulty. Left Shift: repeated presses trigger the Windows Sticky Keys prompt and the bat then stays stuck up. Z, / and Right Shift were not tested."

### 12. Real-table flipper launch / pinch check (code-review WR-03). On the real table, raise each bat with the ball resting near the base (about 30 percent of bat length), the middle, and the tip, with the ball resting against the bat under the slingshot.
expected: A tip hit still launches visibly harder than a base hit, and a base or mid-bat flip does not fire the ball out at an unnaturally high speed (reviewer measured a 19.4 m/s peak for a left-bat base flip; verifier measured 9 to 16 m/s peaks across 0.3-0.8 reach, with no reactive layer).
result: pass

### 13. HUD panel layout at 1280x684, 150% display scaling (UAT test 6 re-test). Open the page, press Enter, charge the plunger.
expected: The controls panel shows five rows (Start, Launch, Left flipper, Right flipper, Nudge), each with its key caps on one line and no wrap. The Slash key shows as its own key cap. The bottom-left FPS / PHYS / KE readout is comfortably legible. Neither panel covers the table or the plunger charge meter. Score, BALL n / 3 and status look as before.
result: pass

### 14. Nudge key directions are discoverable (04-REVIEW IN-09). Read the Nudge row of the controls list.
expected: A new player can tell which of X, period and Up nudges which way, or the user accepts that the row only lists keys.
result: pass

### 15. Carried from the first verification, already passed in UAT (automated, 04-UAT tests 1-5, 7-9): bumper pop feel, sling snap feel, nudge direction convention (assumption A2), tilt fairness, attract behavior, judgment-tier prohibitions.
expected: No regression after 04-09. The user may re-glance during the flipper-feel pass above.
result: pass

## Summary

total: 15
passed: 12
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-04-6
  truth: "Score, BALL n / 3, status and the controls hint are readable and do not overlap or hide the plunger charge meter or the table. The controls hint reads clearly."
  status: resolved
  resolved_by: 04-10-PLAN.md
  resolved_at: 2026-11-20
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
  status: resolved
  resolved_by: 04-09-PLAN.md
  resolved_at: 2026-11-20
  reason: "User reported: I noticed already that the flippers might get stuck when using the arrow keys"
  severity: major
  test: 10
  root_cause: "Two coupled defects, neither key-specific. (1) Dead time: Planck 1.5's RevoluteJoint (Box2D 2.3 solver) warm-starts the accumulated motor impulse. Driving a bat into its limit at FLIPPER_MAX_MOTOR_TORQUE=500 saturates m_motorImpulse at dt*500=4.17, cancelled by the limit impulse. setFlipperMotor only changes the motor speed, so on reversal the solver unwinds that impulse a little per velocity iteration and the bat sits still ~15 steps (~130 ms) after release (1-5 steps on press). Zeroing both joint.m_motorImpulse and m_impulse.z at release cut the lag from 15 to 1 step in-browser; the 04-09 planner spike showed the warm-started limit impulse (m_impulse.z) is the part that pins the bat (zeroing the motor impulse alone changes nothing). (2) Stuck up: FlipperController's settle detector (ANGLE_SETTLE_EPS=1e-3; 'moved then stopped' = at limit) reads the limit position-correction drift during that dead time (e.g. 0.475 -> 0.436 -> 0.431 rad) as 'moved', then 'settled'. It flips returning -> resting with motor 0 while the bat is still raised, and motor 0 at 500 torque brakes it there until the next press."
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

- gap_id: G-04-11
  truth: "Each bat snaps up the instant its key goes down and starts falling the instant it comes up, on all six bindings. No tap leaves a bat hanging raised."
  status: failed
  reason: "User reported: i was only able to test the flippers with the arrow keys. i noticed that the shift key is not working properly since the left shift is activating sticky keys after many clicks and the flipper gets stuck."
  severity: major
  test: 11
  root_cause: "FlipperInput's held-key set is updated only by keydown/keyup pairs plus forceClear on blur/visibilitychange; it never re-checks itself (no clear on window focus, no shiftKey/getModifierState check). When Windows swallows a Shift keyup (Sticky Keys switched ON from the 5x-Shift prompt holds Shift down until a non-modifier key; or a keydown lands after the dialog's blur and its keyup goes to the dialog), the stale ShiftLeft keeps the whole left side held: Z and ArrowLeft cannot release the bat, a new ShiftLeft keydown is a no-op, and flipperGate.setEnabled(true) re-raises the bat on every serve. Right side identical with ShiftRight. Input and flipper logic are correct whenever keydown/keyup arrive paired (headless experiment S1-S7); not key-identity related (keys on event.code)."
  artifacts:
    - path: "src/input/flipper-input.ts"
      issue: "Held set never self-heals: forceClear only on blur/hidden; no clear on focus regain; one stale code pins its whole side"
    - path: "src/sandbox/main.ts"
      issue: "flipperGate.setEnabled(true) re-presses any side input.isHeld() reports, so a stale key survives every serve"
    - path: "index.html"
      issue: "Left/Right Shift are default bindings (Phase 2 D-09); the OS Sticky Keys shortcut cannot be blocked by preventDefault"
  missing:
    - "Clear held flipper keys when the window regains focus (focus/pageshow), not only on blur, to cover the late-keydown/lost-keyup case"
    - "Drop a held ShiftLeft/ShiftRight when any later key event reports shiftKey false"
    - "Regression tests: keydown with no keyup followed by focus regain ends released; a stale ShiftLeft does not stop Z or ArrowLeft releasing the left bat (same for right)"
    - "Design note (user call, not required): a Sticky-Keys-held Shift still reads as down to the browser, so no JS check can release it; consider whether Shift stays a default binding or gets a hint"
  debug_session: ".planning/debug/left-shift-sticky-keys-flipper-stuck.md"
