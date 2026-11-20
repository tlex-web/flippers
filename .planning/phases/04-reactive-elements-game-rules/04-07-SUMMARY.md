---
phase: 04-reactive-elements-game-rules
plan: 07
subsystem: ui
tags: [hud, dom-overlay, aria-live, write-on-change, game-state]

requires:
  - phase: 04-01
    provides: score HUD (TextSink, HudView write-on-change, #hud-score, requireTextSink)
  - phase: 04-05
    provides: GameSession 3-ball FSM (BALLS_PER_GAME, GameState, getBall, getState, hasPlayed)
  - phase: 04-06
    provides: nudge and TiltMeter, tilted state, isWarning()
provides:
  - ballText(state, ball) and statusText(state, hasPlayed, warning) pure mappings
  - three-line HudView(score, ball, status) with per-line write-on-change
  - "#hud-ball, #hud-status (role status, aria-live polite) and #hud-controls in index.html"
  - real-composition HUD walk-through from boot to game over
affects: [04-08, phase-05-renderer]

actuals:
  tokens: 3600
  tasks: 2
  commits: 2
plan_head_before: e0db0f1ba93a40027b38fdd93d076e820460da37
plan_head_after: 1f3a3f727d34992539a4e299109f625c6622f428

tech-stack:
  added: []
  patterns:
    - "Per-line HUD cache: each DOM line is keyed on its own inputs and rebuilt only when they change"
    - "Game.onFrame hook in the e2e harness mirrors main.ts calling hudView.update() after each frame"

key-files:
  created: []
  modified:
    - src/ui/hud.ts
    - src/ui/hud.test.ts
    - index.html
    - src/sandbox/main.ts
    - src/sandbox/game-e2e.test.ts

key-decisions:
  - "HUD ball line is keyed on state or ball (per plan), so the playing->tilted change rewrites the same BALL n / 3 text once; accepted as one write per state change"
  - "HudView tracks a written flag instead of a -1 score sentinel so the first update writes all three lines even at default inputs"

patterns-established:
  - "Status line is the only aria-live region; score and ball lines are not announced"

requirements-completed: [GAME-01, GAME-02, GAME-03]

coverage:
  - id: D1
    description: "ballText and statusText map every game state: start prompt, ball number, WARNING, TILT (wins over warning), GAME OVER prompt, empty in plain play"
    requirement: GAME-02
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts#statusText (GAME-02/03)"
        status: pass
      - kind: unit
        ref: "src/ui/hud.test.ts#ballText (GAME-02)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each HUD line is written only when its own inputs change (100 unchanged updates write nothing; ball/warning/score changes rewrite only their line); every 04-01 score case still passes"
    requirement: GAME-01
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts#HudView per-line write-on-change (R5, T-04-19)"
        status: pass
      - kind: unit
        ref: "src/ui/hud.test.ts#HudView write-on-change"
        status: pass
    human_judgment: false
  - id: D3
    description: "On the real table through the main.ts composition, the HUD follows boot, Enter, launch, four nudges (WARNING then TILT), the tilted drain (BALL 2 / 3), and the third drain (GAME OVER · PRESS ENTER, score kept)"
    requirement: GAME-03
    verification:
      - kind: integration
        ref: "src/sandbox/game-e2e.test.ts#HUD walk-through (GAME-01..03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "HUD markup: #hud-ball, #hud-status (role status, aria-live polite) and a controls hint listing every bound key, styled without #ef476f"
    requirement: GAME-02
    verification:
      - kind: other
        ref: "grep -c 'id=\"hud-status\"\\|id=\"hud-ball\"\\|id=\"hud-controls\"\\|aria-live=\"polite\"' index.html"
        status: pass
    human_judgment: true
    rationale: "HUD legibility, panel placement against the plunger meter and glyph rendering are visual; nudge direction/size and tilt fairness (A2-A4) are by-feel calls in the Task 2 human-check"

duration: 6min
completed: 2026-11-20
status: complete
---

# Phase 4 Plan 07: Game HUD Summary

**Three-line DOM HUD (score, BALL n / 3, status with start/WARNING/TILT/GAME OVER prompts) read straight from GameSession, written per line only on change, plus an on-screen controls hint**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-20T18:02:01Z
- **Completed:** 2026-11-20T18:07:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `ballText` / `statusText` pure mappings; `HudSource` widened with `getBall`, `getState`, `hasPlayed`, `isWarning`; `HudView(score, ball, status)` caches each line's inputs.
- `#hud-ball`, `#hud-status` (the only `aria-live` line) and `#hud-controls` in `index.html`; `main.ts` builds the view from all three sinks.
- Real-composition walk-through on the real table: PRESS ENTER TO START, BALL 1 / 3, WARNING on the third nudge, TILT on the fourth, BALL 2 / 3 after the tilted drain, GAME OVER · PRESS ENTER with the final score kept. It also pins the write counts on the real run: ball 6, status 6.
- Full gate green: tsc, eslint, 313/313 tests, `npm run soak` 4/4.

## Task Commits

1. **Task 1: Tracer, the HUD follows a real game from boot to game over** - `23ad7cb` (feat)
2. **Task 2: Every HUD mapping, per-line writes, controls hint** - `1f3a3f7` (test)

## Files Created/Modified
- `src/ui/hud.ts` - ballText, statusText, three-line HudView with per-line cache
- `src/ui/hud.test.ts` - FakeSource widened; status/ball mapping cases; per-line write cases; 04-01 score cases kept
- `index.html` - #hud-ball, #hud-status, #hud-controls and their styles
- `src/sandbox/main.ts` - HudView built from #hud-score, #hud-ball, #hud-status
- `src/sandbox/game-e2e.test.ts` - Game.onFrame hook; HUD walk-through case

## Decisions Made
- The ball line is keyed on state or ball, as the plan specifies, so the tilt rewrites "BALL 1 / 3" once with the same text. The walk-through counts that write explicitly instead of hiding it.
- A `written` flag replaces the 04-01 `lastScore = -1` sentinel, so the first update writes every line even when all inputs are at their defaults.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted the 04-01 HUD tests to the three-sink constructor in Task 1**
- **Found during:** Task 1
- **Issue:** `new HudView(sink)` and the score-only `FakeSource` no longer compile once `HudView` takes three sinks and `HudSource` is widened, which fails Task 1's `tsc` and `vitest src/ui` verify.
- **Fix:** Widened `FakeSource` and added a `makeView()` helper in Task 1. The 04-01 score assertions were left unchanged. The new mapping and write cases landed in Task 2 as planned.
- **Files modified:** src/ui/hud.test.ts
- **Committed in:** 23ad7cb

**2. [Rule 3 - Blocking] Added an `onFrame` hook to the e2e `Game` harness**
- **Found during:** Task 1
- **Issue:** The walk-through needs `hudView.update()` after every frame, as `main.ts` does. The shared `runSteps` / `pressEnter` / `launchAndDrain` helpers call `g.frame()` directly.
- **Fix:** Added `Game.onFrame` (null by default), called after each `loop.advance`. Earlier cases are unaffected.
- **Files modified:** src/sandbox/game-e2e.test.ts
- **Committed in:** 23ad7cb

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were needed to run the planned verify. There was no scope creep.

## Issues Encountered
- The first walk-through run expected 5 ball-line writes and got 6. The extra write is the playing->tilted state change, which is correct under the plan's "ball sink: state or ball" rule. Only the expected count was corrected.
- Prettier reports pre-existing formatting drift in `src/sandbox/main.ts` and `src/sandbox/game-e2e.test.ts` (an over-long `applyEdges(...)` line and a `for (...; )` spacing) that predates this plan. It was left untouched as out of scope. `npm run lint` (eslint) is clean.

## Human Check (end-of-phase)
Harvested from Task 2's `<human-check>`. Run `npm run dev` and do the following:
- Read the HUD before starting.
- Play all three balls.
- During one ball, nudge with X, . and Up: three times about a quarter-second apart, then a fourth time.

Expected:
- The HUD reads PRESS ENTER TO START before the first game, then BALL 1/2/3 / 3.
- The nudges push the ball in the right directions by a small but useful amount.
- The third nudge shows WARNING and the fourth shows TILT. Bumpers and slings then stay dead until the drain. The bats still respond until 04-08.
- The next ball starts clean.
- The game ends on GAME OVER · PRESS ENTER with the score kept.
- The hint is readable and does not overlap the plunger meter.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- The HUD is complete for Phase 4. 04-08 (flipper drop on tilt) can rely on the TILT status line already being visible.
- The Phase 5 carry-forward is still open: the canvas HUD scale and the `#ef476f` overload in the debug renderer. The DOM HUD added here does not use `#ef476f`.

## Self-Check: PASSED
- FOUND: src/ui/hud.ts, src/ui/hud.test.ts, index.html, src/sandbox/main.ts, src/sandbox/game-e2e.test.ts
- FOUND: 23ad7cb, 1f3a3f7

---
*Phase: 04-reactive-elements-game-rules*
*Completed: 2026-11-20*
