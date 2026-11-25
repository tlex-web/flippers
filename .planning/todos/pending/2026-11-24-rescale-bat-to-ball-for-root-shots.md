---
created: 2026-11-24T00:00:00Z
title: Rescale bat length vs ball size so root shots clear the slingshot
area: physics
severity: minor
files:
  - src/physics/constants.ts
  - src/table/spec.ts
audit_acknowledged:
  milestone: v1.0
  at: 2026-11-25
---

## Problem

- Phase 06.3 trimmed the slings so that flips from mid-bat to the tip (d in [0.25, 0.45] m from the hinge) clear their own sling (own-sling gate, 06.3-CONTEXT D-13). Tip cross shots can still graze the opposite sling's lower face, capped by the gate at 30 contacts and 2 knocked down.
- Flips from the root strip (d below 0.25 m, where a ball lands fresh off the inlane) still hit the sling's inlane corner (06.3-CONTEXT D-03). Measured: 10/139 root flips clear at t = 0.28, against 118/139 with no slings.
- Root cause, measured in the 06.3 discussion research: with FLIPPER_LENGTH_M 0.5 and BALL_RADIUS_M 0.2, the bat is 2.5 ball radii long, against about 5.6 on a real table. A root flip rises almost vertically, inside x ≈ 0.64–1.10. To clear, it needs a sling-free column at x ∈ [0.44, 1.30], y 3.65–4.95, and the sling sits inside that column. Under the locked constraints (inlane width, centre lane, rule (1), the 0.35 m raise limit) no table-geometry change clears it.

## Solution

Not chosen. It needs its own phase:
- Lengthen the bat relative to the ball (or shrink the ball), then refit the hinges, funnels, trough and slings together.
- This changes flipper feel, which is the core value, and every flipper-feel/FLIP-04 calibration, the proof-box gates and every table proof.
- Real tables also block the sharpest base backhands, so the goal is a narrower root strip, not zero.

Source: `.planning/phases/06.3-fix-slingshot-deflection-on-flipper-root-shots/06.3-CONTEXT.md` (`<deferred>`).
