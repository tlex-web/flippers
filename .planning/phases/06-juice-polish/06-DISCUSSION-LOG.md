# Phase 6: Juice & Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log keeps the alternatives that were considered.

**Date:** 2026-11-22
**Phase:** 06-juice-polish
**Areas discussed:** Skill shot rules, Ball save design, Bonus tally & high score, Shake, particles & glow
**Mode:** advisor (each area had one gsd-advisor-researcher pass and a comparison table before the decision; calibration tier: standard)

---

## Skill shot rules

Research probe: all 81 plunger charge steps on the real TABLE_SPEC. Charge already selects the lane:

| Charge | Result |
|---|---|
| < 0.637 | falls back |
| 0.637–0.70 | right orbit, no rollover |
| 0.713–0.737 | rollover 402 |
| 0.750 | rollover 400 (outlier) |
| 0.762–0.800 | rollover 401 |
| 0.813–0.838 | left inlane |
| 0.850–0.900 | rollover 400 (0.887 → 401) |
| ≥ 0.912 | orbit, no rollover |

| Option | Description | Selected |
|--------|-------------|----------|
| A. Rotate, freeze on press | The lit lane cycles while the ball rests and freezes on Space down. It pays if the first switch is the lit rollover. No geometry change. D is the fallback. | ✓ |
| B. Player-steered lane | The flipper keys move the lit lane before launch. Most player control, but center bias. | |
| C. Meter sweet-spot band | Releasing inside a charge band pays whichever lane the ball takes. The lit lane becomes cosmetic. | |
| D. A + geometry retune now | Widen the lane bands to 5+ steps this phase. Every table soak gate must be rerun. | |

**User's choice:** A (recommended)
**Notes:** Stated defaults accepted without objection:
- arm per serve; a weak fall-back stays armed
- the first switch decides
- 5,000, then +5,000 per further one made, capped at 25,000, reset per game
- the lit rollover still pays and lights
- a tilt disarms it

---

## Ball save design

| Option | Description | Selected |
|--------|-------------|----------|
| C + B. Virtual post + backstop | A center sensor plus the existing bumper kick bounces near-drains back up, with a drawn rising post. A drain any other way while armed re-serves. Soak gates stay green. | ✓ |
| C. Virtual post only | Kickback for center near-drains only. | |
| B. Timed save only | A drain while armed returns the ball to the plunger. The post is drawn only; not a kickback. | |
| A. Real pop-up post | A solid collider in the tip gap. Needs a new engine API and gates that change over time, with crush/eject risk in a 0.46 m gap. | |

**User's choice:** C + B (recommended)
**Notes:** Stated defaults accepted:
- arm when the ball leaves the chute; ~6–8 s; once per ball
- re-arm per serve; disarm on tilt or game over
- lamp above the drain, steady then blinking over the last ~2 s
- post flourish, sting and BALL SAVED status line
- armed save added to the reactive-table soak gate with a RED control

---

## Bonus tally & high score

**Bonus feed**

| Option | Description | Selected |
|--------|-------------|----------|
| Itemized lines | ROLLOVERS ×n, INLANES ×n, BANKS ×n (5,000 per bank), then TOTAL | ✓ |
| One counter | Each rollover or inlane pass adds 1,000, shown as one BONUS line | |
| Itemized + bumpers/slings | Also counts bumper and sling hits | |

**Tally hold**

| Option | Description | Selected |
|--------|-------------|----------|
| Hold, flipper skips | Deterministic bonus state up to ~2.5 s with flippers off; credit at the end, then serve; a flipper press skips | ✓ |
| Display only | Credit at the drain, serve immediately, HUD plays the tally over the plunger lane | |

**High score**

| Option | Description | Selected |
|--------|-------------|----------|
| Single best | One saved best, shown on attract and game over; NEW HIGH SCORE with sting and flash | ✓ |
| Top 5, no initials | Short list rotated on attract | |
| Champion + initials | Grand Champion plus top 4 with flipper-entered initials | |

**User's choice:** all three recommended options
**Notes:** Stated defaults accepted:
- exponential-chase count-up (display-only, tabular digits, snap under reduced motion)
- tilt forfeits the bonus
- fully guarded localStorage
- no odometer, since it would break D-01

---

## Shake, particles & glow

| Question | Options presented | Selected |
|----------|-------------------|----------|
| Shake | Hybrid (directional nudge kick + capped trauma) / Trauma only / Directional kick only | Hybrid ✓ |
| Particles | Per element type (bumper ring + sparks, sling sparks, sensor glint + motes) / Sparks everywhere / Rings only | Per element type ✓ |
| Depth | Fixed shadow + baked shading / Point-light shadow / Fixed shadow + live vignette | Fixed shadow + baked shading ✓ |
| Lamps | Rule lamps with lens + fade / Rule lamps, LED style / Rule lamps + bonus ladder | Rule lamps, lens + fade ✓ |

**User's choice:** all recommended options
**Notes:** Stated defaults accepted:
- shake off under prefers-reduced-motion
- blink = go get it, at 2 Hz or less; steady = earned
- attract lamp chase
- BG fill before the shaken blit

---

## Claude's Discretion

- Skill-shot rotation rate and blink cadence (≤ 2 Hz)
- Ball-save duration within ~6–8 s; kickback speed, sensor geometry and post animation
- Shake amplitudes, particle counts, colors and lifetimes within the stated ranges
- Tally line timing within the ~2.5 s cap; count-up τ
- Skill-shot indicator and inlane-arrow placement; lens tints; high-score placement in the HUD
- Module and file naming

## Deferred Ideas

- High-score initials / top-N table (new input mode)
- Bonus-ladder lamps (only once a v2 multiplier exists)
- Skill-shot geometry retune (only if UAT finds the bands feel random)
