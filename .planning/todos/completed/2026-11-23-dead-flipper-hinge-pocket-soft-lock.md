---
created: 2026-11-23T13:42:44Z
title: Dead-flipper hinge pocket soft-locks the game (no ball search)
area: physics
severity: minor
files:
  - src/table/spec.ts
  - src/game/game-session.ts
---

## Problem

- Origin: the 6590dce review's IN-04, "A ball that never reaches the drain sensor soft-locks the game". That finding was lost when c4c8a46 reused the id IN-04 for the keyLabel finding. The 04 review ledger now records it as a prose note (section "Lost to id reuse: 6590dce IN-04").
- The stable rest: a ball placed at (0.741, 5.206) rests at about (0.745, 5.211) with speed 0 after 600 fixed steps. It sits on the left hinge circle against the funnel-wall end (0.6, 5.37), with the bats at rest. The mirror is near (2.155, 5.21).
- Seen again in 06.1-02: 6 of the kickback-search candidates came to rest at (0.743, 5.208) or its mirror (2.159, 5.207), velocity 0, with the flippers idle.
- One flip frees it. With the flippers dead (TILT), nothing frees it and no drain fires. `onStart()` is refused while playing or tilted, so the game cannot continue. Recovery today is a page reload.
- Phase 06.1 research measured that raising the slings 0.40 m (instead of 0.35) also traps a ball here.

Reproduction: build `PlanckWorld` on TABLE_SPEC with the bats at rest (motor 0 or dead), add a ball at (0.741, 5.206), step 600 fixed steps, and read the ball: position about (0.745, 5.211), speed 0.

## Solution

Options, none chosen yet:

- A ball-search timeout: if the active ball stays below a speed threshold outside PLUNGER_ZONE for N steps, treat it as drained or nudge it free.
- A pivot or funnel geometry change under spec rule (4) (funnel and trough walls end at least 0.12 m from a pivot).

Do not raise the slings beyond 0.35 m: at 0.40 m a ball is trapped here too.

This is backlog per decision D-02 of phase 06.1. It was recorded, not fixed, in 06.1.

## Resolution

Closed 2026-11-23 by plan 06.2-02 on evidence.

- Fix: a tilted-only ball search in GameSession. After BALL_SEARCH_STEPS (240) still steps outside PLUNGER_ZONE, the active ball is kicked toward the playfield centre (BALL_SEARCH_IMPULSE = NUDGE_IMPULSE). After BALL_SEARCH_KICKS (2) it is recorded as drained and forfeited on the existing tilted path. No geometry change. aa4a5d7 (real-table RED), c43b5be (fix), fe10d58 (spy-rig rule pins).
- Evidence: src/game/ball-search.table.test.ts, with both hinge pockets searched free and forfeited, then ball 2 served (left pocket: kick at session step 687, drain at 777; right pocket: kick at 723, drain at 814; one kick each), and a ballSearchSteps: 0 RED control that stays soft-locked for 3,000 steps. The spy-rig describe 'GameSession ball search (tilted soft-lock, 06.2)' has mutation teeth. `npm run soak` was green.
- Why not geometry: no funnel-only change removes the pocket (06.2-RESEARCH Probe 4); slings stay at 0.35 m.
