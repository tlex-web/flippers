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

## Resolution

Closed 2026-11-24 by phase 06.3 (plans 06.3-01, 06.3-02, 06.3-03) on evidence.

- Mechanism, refined by research: root flips leave at 86-95°, not 67°, and mid-bat flips hit the sling's lower-right corner too (06.3-CONTEXT).
- Fix:
  - The kick face is named explicitly: each slingshot carries `kickFace: 2` (the hypotenuse) in TABLE_SPEC, `deriveKickFace` uses it, and `resolve()` fails loudly on a missing or invalid kickFace (D-09). 622cb77 (RED), 55b0a7e, 45160ea.
  - Both slings were trimmed by sliding the lower-right corner up the hypotenuse to t = 0.28: LEFT_SLING (0.944, 4.102), mirrored (1.956, 4.102) (D-14). 3e8b086 (RED), e2dbf10 (fix), 323dab1 (controls).
  - The kick normal and speed are unchanged. The kick face went from 0.949 m to 0.266 m.
- Evidence:
  - `src/harness/root-shot.test.ts` on TABLE_SPEC with live kicks: gated 94, own-sling failures 0 (knocked down 0), opposite-sling contacts 30 (knocked down 2), timeouts 0, kept inlane 17/17. The pre-trim RED control fails with 61 own-sling contacts, 49 knocked down. The no-sling control clears all 94 gated flips (kept 17/17). The walled-off (BLIND_SPEC) control gates 0 flips and fails the liveness floor, as intended.
  - Own-sling classification is by first sling contact (D-13). The one t = 0.28 cross shot that ricochets off the opposite sling into its own sling and drops counts as one of the 2 allowed opposite-sling knock-downs. The user confirmed this definition at the D-12 checkpoint (ruling A), over the literal "never touches its own sling" reading.
  - The sling-pinch proof (`src/harness/sling-pinch.test.ts`, 6 cases) and table-world case (e) are green.
  - The full gate is green on 61ebed3: `npx vitest run` 63 files / 1331 tests, `tsc --noEmit`, `eslint .`, `npm run soak` 4/4 with 0 `ESCAPE[` lines, `prettier --check .`, `npm run build`.
  - The user's D-12 verdict on the live build, in their words: "approved A".
- Scope: this resolves own-side flips from mid-bat to the tip (d in [0.25, 0.45] m), on both bats at every tested timing. It does not resolve two things:
  - The root strip (d < 0.25 m) stays blocked by the sling's inlane corner (D-03). Measured: 10/139 root flips clear at t = 0.28, against 118/139 with no slings. Deferred to [the bat-to-ball rescale backlog todo](../pending/2026-11-24-rescale-bat-to-ball-for-root-shots.md).
  - Tip cross shots can graze the opposite sling. They are capped by the gate at 30 contacts and 2 knocked down (D-13).
- Note: the 'today 0%' figure in 06.3-CONTEXT D-05 was 3/94 on the literal any-sling gate.
