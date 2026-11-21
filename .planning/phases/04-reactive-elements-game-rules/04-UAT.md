---
status: complete
phase: 04-reactive-elements-game-rules
source: [04-VERIFICATION.md]
started: 2026-11-20T18:36:39Z
updated: 2026-11-21T22:20:00.000Z
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

### 16. UAT test 11 re-test on a real Windows keyboard. Confirm Sticky Keys is OFF, run `npm run dev`, press Enter. On each of Z, Left Shift, Left Arrow, /, Right Shift, Right Arrow make quick taps of varied length, hold a long cradle then release, and hold both Shifts together for a cradle. Then tap Left Shift five times to open the Sticky Keys prompt, close it with the mouse (No), return to the game and tap Z, Left Arrow, then Left Shift. Also over-nudge to TILT once while holding a bat up.
expected: Each bat snaps up on its key and falls on release on all six bindings. The both-Shift cradle holds both bats up. After the prompt closes, no bat stays raised once the window has focus; a tap of Z, Left Arrow or Space releases a raised bat; every binding works afterwards. On TILT the held bat drops at once. Cradle and catch still feel heavy. Known residual, not a failure: if Sticky Keys was turned ON by the prompt, Windows itself holds Shift down after a Shift tap until the next non-Shift key.
result: pass

### 17. Windows both-Shift release (code-review WR-02). Hold ShiftLeft and ShiftRight together (both bats up), release ShiftLeft first, then ShiftRight, then watch both bats.
expected: Both bats drop. If the left bat stays raised after both Shifts are up (Windows emits no keyup for the first Shift released while both are held), it is the unhealed WR-02 residual and clears on the next non-Shift key press or a focus regain.
result: issue
reported: "the shift keys are still a bit more buggy than the arrow keys - sometimes they get stuck but can be quickly released"
severity: minor

### 18. Shift as a default binding (plan 04-11 flagged design note, T-04-29 accepted). Decide whether Left/Right Shift stay default flipper bindings (Phase 2 D-09) given the OS Sticky Keys shortcut, and whether the controls list should hint at it.
expected: A recorded user decision. Bindings are unchanged in the code today.
result: pass
note: "Presented: recommendation A (keep Shift as a default binding, add a controls-list hint that Z, / and the arrow keys are the most reliable on Windows) vs B (drop Shift). User answered 'pass': recorded as A. The hint can ride along with the G-04-17 fix."

### 19. UAT test 17 re-test on the real Windows keyboard (04-12 Task 3 human-check). Sticky Keys OFF, `npm run dev`, press Enter. Hold Left Shift, then also press Right Shift: both bats must be up. Release Left Shift first, then Right Shift. Repeat with the other three orders (LD RD RU LU; RD LD LU RU; RD LD RU LU). Then tap each Shift alone a few times, and finally hold Left Shift and tap the key printed Y while also tapping X.
expected: In every order both bats rise while both Shifts are held and both drop the moment the second Shift comes up. No bat is left raised after both Shifts are up, and none rises again on the next serve. Single Shift taps flip and drop as before. Known residual, not a failure: after releasing the first Shift while the other is held, that bat stays up until the second Shift is released (Windows sends the page nothing).
result: pass
source: automated
note: "Automated live run at the user's request (Claude): Chrome 157 / Win11 on the running dev server, real OS key events via SendInput (scancodes), Sticky Keys off (Flags=26), bat angles read through a read-only CDP-injected probe. All four orders (LD RD LU RU, LD RD RU LU, RD LD LU RU, RD LD RU LU): both bats UP while both Shifts held (second Shift arrives repeat:true and is accepted), the first-released bat stays up until the second release (documented residual), both bats start falling 14-16 ms after the second Shift keyup, held set empty. Single taps 3x per Shift: rise and drop. Hold Left Shift + tap Y (KeyZ) + tap X: left bat stays up, drops on Shift release. Serve check: launch, LD RD LU RU with no other key, ball drained and BALL 2 served with both bats at rest (max 0.010 rad off rest) and nothing held for 1 s."

### 20. UAT 18 decision A visual check (04-13 Task 2 human-check). Chrome, German QWERTZ, 1280x684 window at 150% scaling. Press Enter, read the controls panel, then press the key printed Y and the key printed - . Optionally open in Firefox.
expected: Chrome: Left flipper row reads Y <- Left Shift, Right flipper row reads - -> Right Shift, Nudge reads X . up-arrow. Under the list a small note reads 'On Windows, <- -> Y - are the most reliable flipper keys. Shift can stick.' wrapped inside the panel; panel no wider than before and covering neither table nor plunger meter. Y raises the left bat and - raises the right. Firefox: note reads 'On Windows, <- -> are the most reliable flipper keys. Shift can stick.' and the rows keep their markup labels.
result: pass
source: automated
note: "Automated live run (Claude): Chrome 157, this machine's German QWERTZ layout, viewport 1281x684 @ dpr 1.5, Keyboard Map API present, secure context. Rows read 'Y ← Left Shift', '- → Right Shift', 'X . ↑'. Note reads 'On Windows, ← → Y - are the most reliable flipper keys. Shift can stick.' and wraps inside the panel. Panel is 268 css px wide with and without the note (no wider); its right edge x=284 vs table canvas left x=457, so it covers neither the table nor the plunger meter (screenshot checked). KeyZ (printed Y) raises only the left bat, Slash (printed -) only the right. Firefox is not installed: the optional Firefox check was not run."

### 21. Decide disposition of open review findings WR-01 (second-Shift press after a force-clear is dropped on Windows) and WR-02 (Shift keydown reporting shiftKey false drops the other Shift).
expected: A recorded user decision: fix in a follow-up gap plan, or accept as residual.
result: issue
reported: "a"
severity: major
note: "Decision A (recommended): fix both WR-01 and WR-02 in a follow-up gap plan rather than accept them as residuals."

### 22. 04-15 Task 3 real-keyboard cradle check. Windows, Sticky Keys OFF, Chrome, npm run dev, press Enter. Hold BOTH Shifts (left bat and right bat up), click another window (not the taskbar) and click back; both bats drop. Keep holding both Shifts about 1 s (the last-pressed Shift auto-repeats and is ignored), release and re-press the Shift that was pressed LAST, then repeat with the other Shift. Also repeat the 04-14 single-Shift check: hold Left Shift across the focus change, then press Right Shift, and the mirror.
expected: Re-pressing the last-pressed Shift raises its bat (provided the pause since its last auto-repeat exceeds 450 ms), the bat drops when the last Shift is released, and nothing stays latched. A re-press within 450 ms of its previous auto-repeat may be missed and is then picked up by its own first auto-repeat (documented residual). A second Shift within about 0.5 s of returning focus may be missed (04-14 residual). Regression: 04-15 changed the Shift path, so also re-run test 19's four both-Shift orders and one serve with no other key; they must behave exactly as recorded there.
result: pass

### 23. Controls and HUD panel layout after the Phase 5 restyle (05-06). Chrome, 1280x684 at 150% scaling, press Enter, charge the plunger. Read the panel: Start, Launch, Left flipper, Right flipper, Nudge, Mute rows (six rows now, was five), the Windows note, the MUTED marker beside the M key cap.
expected: Key caps on one line per row (Slash shows as its own cap), layout labels correct on the player's layout (Y / - on QWERTZ), the Windows note wraps inside the panel, and neither the HUD panel nor the diag readout covers the table or the plunger charge meter. Score, BALL n / 3 and status read clearly.
result: [pending]

## Summary

total: 23
passed: 17
issues: 5
pending: 1
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
  status: resolved
  resolved_by: 04-11-PLAN.md
  resolved_at: 2026-11-20
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

- gap_id: G-04-17
  truth: "Hold ShiftLeft and ShiftRight together, release ShiftLeft first, then ShiftRight: both bats drop (Shift bindings behave as reliably as the arrow keys)."
  status: resolved
  resolved_by: 04-12-PLAN.md
  resolved_at: 2026-11-21
  reason: "User reported: the shift keys are still a bit more buggy than the arrow keys - sometimes they get stuck but can be quickly released"
  severity: minor
  test: 17
  root_cause: "Windows folds both Shift keys into one virtual key (VK_SHIFT), and FlipperInput discards both event-level traces of that. (1) Press: the second Shift pressed while the other is held arrives as keydown repeat:true (OS-flagged, even 2.6 s later); handleKeyDown drops every repeat, so the second-pressed bat never rises in a both-Shift hold (new, not in WR-02). (2) Release (WR-02): the first Shift released while both are held emits NO keyup; only the last release fires, with shiftKey:false, and dropStaleShift early-returns for Shift-key events (04-11 design, pinned by test B6), so the first-pressed Shift stays in held. It sticks only when first-pressed is also first-released (hence 'sometimes'); a lone re-tap of that Shift, any non-Shift key, or a focus change clears it, else flipperGate re-presses it on the next serve. Verified live (Chrome 157 / Win11, SendInput-injected Shift events, GetAsyncKeyState correct throughout) and by replaying the captured sequences through the real flipper-input.ts. Matches ThinLinc bug 7416 and noVNC's Windows-only both-Shift heal."
  artifacts:
    - path: "src/input/flipper-input.ts"
      issue: "handleKeyDown ignores every repeat keydown, including the OS-flagged second Shift press; dropStaleShift early-returns for ShiftLeft/ShiftRight events so the final shiftKey:false Shift keyup cannot clear the other Shift"
    - path: "src/input/flipper-input.test.ts"
      issue: "B6 pins the current keep-the-other-Shift behaviour; must change for a Windows-gated heal (repeat-ignore test uses KeyZ, unaffected)"
    - path: "src/sandbox/main.ts"
      issue: "Gate re-press (~143-150) keeps a stale Shift alive across serves; drain applies press before release (~170-174, WR-01), which the release heal can trigger"
    - path: "index.html"
      issue: "Controls list needs the UAT 18 hint; user's layout is German QWERTZ (00000407), so KeyZ/Slash are labelled Y and - and a literal 'Z, /' hint would be wrong"
  missing:
    - "Accept a repeat keydown for ShiftLeft/ShiftRight when that code is not held and the other Shift is held (a held Shift's own auto-repeat stays de-duped)"
    - "On a ShiftLeft/ShiftRight keyup with shiftKey === false, drop both Shift codes; gate to Windows (platform check injected as an option so tests cover both), as noVNC does — Linux shiftKey semantics are unverified"
    - "Fix WR-01 in the same plan: apply release before press in the drain so a heal-release and same-side press in one batch cannot drop a held bat"
    - "Regression tests from the captured sequences: all four both-Shift orders end with both bats having risen and both released; single taps and a held Shift's auto-repeat unchanged; non-Windows path keeps B6 behaviour"
    - "Document the browser-impossible residual: a bat whose Shift is released while the other Shift is still held stays up until the other Shift is released"
    - "UAT 18 decision A: controls-list hint naming the reliable keys layout-correctly (name the arrow keys, or label from navigator.keyboard.getLayoutMap()) — not a literal 'Z, /'"
  debug_session: ".planning/debug/shift-flipper-residual-stick.md"

- gap_id: G-04-21
  truth: "On Windows, a Shift pressed while the other Shift is held raises its bat even after a focus change, blur or hidden tab cleared the held set (WR-01), and a Shift keydown reporting shiftKey false never drops the other held Shift (WR-02)."
  status: resolved
  resolved_by: 04-15-PLAN.md
  resolved_at: 2026-11-21
  reason: "User reported: a (decision: fix review findings WR-01 and WR-02 in a follow-up gap plan)"
  severity: major
  test: 21
  root_cause: "Both from the 04-12 Windows both-Shift heal in src/input/flipper-input.ts, confirmed against the current code. (WR-01) isSecondShiftPress (lines 369-374) accepts a repeat-flagged Shift keydown only when the OTHER Shift code is already in held. forceClear() (blur, focus regain, hidden tab) empties held, so if the player is holding one Shift across a clear, a genuine press of the other Shift arrives repeat:true (Windows VK_SHIFT merge), fails the held check and is dropped as auto-repeat; the held Shift's own repeats are ignored too, so neither Shift can raise a bat until every Shift is released. Real trigger: the Sticky Keys prompt or a Shift+click stealing focus mid-Shift (G-04-11). (WR-02) handleKeyDown calls dropStaleShift(e) (line 219), and with windowsShiftHeal on the Shift-code exemption is gone (line 357), so a ShiftLeft/ShiftRight KEYDOWN reporting shiftKey:false deletes the other held Shift and drops its bat. The documented contract (header lines 47-49, windowsShiftHeal option doc line 103, dropStaleShift doc) is keyup-only; the VK_SHIFT reasoning justifies only the keyup case. Sources of such keydowns: NumLock-numpad fake Shift pairs, remote desktop, IME injection."
  artifacts:
    - path: "src/input/flipper-input.ts"
      issue: "isSecondShiftPress requires the other Shift in held, which forceClear empties (WR-01); handleKeyDown runs dropStaleShift on Shift keydowns with the heal on (WR-02)"
    - path: "src/input/flipper-input.test.ts"
      issue: "No heal-on test for a second-Shift press after handleFocus/handleBlur, and none pinning Shift-keydown shiftKey:false behaviour"
    - path: "src/sandbox/main.ts"
      issue: "IN-01: flipperGate comment (lines 142-144) omits the Windows Shift-keyup heal source (G-04-17); fix alongside"
  missing:
    - "WR-01: remember the Shift code carried by ignored Shift auto-repeats since the last clear (reset in forceClear and on a Shift keyup with shiftKey false); a repeat-flagged keydown for the OTHER Shift code is then a new physical press even when held is empty"
    - "WR-01: document in the module's Residual paragraph that a second press landing before the first OS auto-repeat (~500 ms) after a clear is still missed"
    - "WR-02: restrict the Shift keys' own-event reconciliation to keyup (dropStaleShift takes isKeyUp; false from handleKeyDown, true from handleKeyUp)"
    - "Heal-on regression tests: focus -> ShiftLeft repeat -> ShiftRight repeat => rightPress; ShiftRight held, then a ShiftLeft keydown with shiftKey:false keeps right held; existing G-04-17 four-order and B6 tests stay green"
  debug_session: ".planning/phases/04-reactive-elements-game-rules/04-REVIEW.md (WR-01, WR-02)"
