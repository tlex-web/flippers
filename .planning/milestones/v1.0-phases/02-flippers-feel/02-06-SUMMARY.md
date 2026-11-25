---
plan: 02-06
phase: 02-flippers-feel
status: complete
type: checkpoint
requirements: [FLIP-01, FLIP-03]
completed: 2026-07-16
---

# Plan 02-06 Summary — By-Feel Acceptance (D-09 Heavy Verdict)

**The blocking human by-feel checkpoint (D-09) is APPROVED.** The operator played the
live sandbox (`npm run dev`) and accepted the flipper feel that Phase 1 explicitly deferred
to this phase. No code was written by this plan itself — it verifies the feel of code already
built (02-01..02-05) and numerically proven (02-05 + `npm run soak`). Two rounds of live-rig
feedback surfaced real defects that were fixed before acceptance.

## Verdict

Operator confirmed on the live rig:
- **FLIP-01** — each flipper raises on its own key press with near-instant (sub-frame) response
  and drops on release; holding a key (OS auto-repeat) does not twitch/re-fire; tab-blur leaves
  nothing stuck.
- **FLIP-03** — a ball caught on a raised flipper cradles dead-steady, no visible jitter.
- **FLIP-02 / D-09** — the feel reads **heavy, not floaty**, and a tip hit visibly out-launches
  a base hit. The deferred Phase-1 "heavy, not floaty" weight verdict is **settled**.

## Live-rig feedback loop (2 rounds before approval)

The by-feel checkpoint did its job — it caught two things the automated proofs could not:

1. **Raise-direction inversion (BLOCKER, caught by the phase verifier pre-checkpoint).**
   `setFlipperMotor(id, +1)` raised the right flipper but drooped the left, because the right
   flipper's body-angle-π mirror *preserves* rotational handedness. Fixed with a per-flipper
   `raiseSign` in the adapter `PlanckWorld.setFlipperMotor` (LEFT −1, RIGHT +1) — the FSM stays
   engine-agnostic (`+1`=raise). Commits `6c52beb`, `8955724`. Re-verified: both flippers raise
   on press (VERIFICATION.md → `passed`, 4/4).

2. **Unusable test rig (caught by the operator playing round 1).** The two flippers sat at
   different heights and the ball feed dropped balls that rolled off the right edge and piled in
   the corner, so the ball never reached the flipper faces. Fixed the throwaway rig (D-11): both
   pivots at the same y, mirror-symmetric about box centre (LEFT (0.35,2.6) / RIGHT (1.65,2.6),
   tips keep a ~0.31 m gap through the full sweep, no collision), and a single catchable ball
   dropped dead-centre with `removeBall()` re-feed on drain (no pile-up). Commit `51536af`.
   Round 2: operator approved.

## Non-blocking item carried forward

- **~125 ms release jam-lag** after a *long* cradle hold (reproduces; feel-level, non-blocking).
  Operator accepted it; recorded for future polish (Phase 6) if it ever reads wrong in play.

## Enabling commits (this checkpoint wrote no code of its own)

- `6c52beb` fix(02-01): correct mirrored flipper raise-direction inversion
- `8955724` docs(02-01): record 02-GAP-01 (flipper raise-direction fix)
- `51536af` fix(02): make the two-flipper feel rig symmetric + catchable (02-06 live-rig feedback)

## Outcome

Phase 2's Core Value is accepted by feel and guarded by the automated regression suite
(`npm test` 71/71, `npm run soak` 2/2 gates). The flippers respond instantly, transfer real
rotational momentum (tip > base), hold a jitter-free cradle via the explicit FSM, and can never
be swept through the ball — proven, tuned, and felt.
