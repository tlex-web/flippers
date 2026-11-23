---
created: 2026-11-23T21:10:00Z
title: Shots off the flipper root deflect off the slingshot's lower face
area: physics
severity: major
files:
  - src/table/spec.ts
---

## Problem

- User report during the 06.2-03 visual check (2026-11-23): "When i use the flipper to shoot the ball up when the ball is located at the root of the flipper it always bounces of the triangle located above the respective flipper which makes smooth gameplay difficult."
- Not caused by 06.2-03. Lanes 500/501 are `sensor: true`, and 2a6e2ff moved only that sensor line and the arrow lamp pins. The sling geometry has not changed since 06.1-02 (fb4e81d), which moved both slings 0.35 m up-table.
- Likely mechanism (a hand calculation, not yet simulated). The left bat rests at a 22.5° droop (π/8, `src/physics/constants.ts`), so its top surface points about 67° up and to the right. A ball near the hinge (pivot (0.69, 5.45), ball at about x 0.78) is struck at the very start of the swing and leaves along that line. It meets LEFT_SLING's lower face, (0.86, 4.6) to (1.16, 4.75), at about (1.05, 4.70). Only later in the swing, when the bat is near horizontal, does a ball go straight up the inlane instead. The mirror case is the same on the right.
- This hits the core value directly: flipper feel and shot control.

Reproduction (to build): seed a ball resting near the left hinge (about x 0.78 on the bat), flip, and record the first contact. Expect the sling's lower face (a sling bus hit), not open playfield.

## Solution

Options, none chosen yet. Each must keep the existing proofs green:

- Re-shape or shorten the sling's lower face, so the 60–70° root-shot line passes clear of it.
- Re-angle or move the sling within the limits below.
- Re-tune the bat's rest droop, which moves the surface angle at contact. This affects every shot, so it is risky.

Constraints that bound any change:

- Rule (1): the sling's lower face must clear the raised bat over the whole sweep, limit overshoot included (WR-03).
- Do not raise the slings beyond 0.35 m: at 0.40 m a dead-flipper ball is trapped near the hinge (see [[2026-11-23-dead-flipper-hinge-pocket-soft-lock]]).
- The bat/sling pinch proof (`src/harness/sling-pinch.test.ts`, reworked in 06.2-04) must stay GREEN, including its liveness and missing-ball checks.
- The inlane sensor (LEFT_INLANE) and the sling's lower-left vertex share INLANE_Y.

Plan before v1.0 closes, as a gap plan or a 06.3 insert (user decision, 2026-11-23, option A at the 06.2-03 checkpoint).
