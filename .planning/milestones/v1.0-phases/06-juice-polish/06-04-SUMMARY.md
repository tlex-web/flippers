---
phase: 06-juice-polish
plan: 04
subsystem: audio, ui
tags: [web-audio, cue-queue, recipes, hud, status-line, skill-shot, fixed-step, vitest]

requires:
  - phase: 06-juice-polish
    provides: "06-01 skill-shot getters on GameSession (getStep, getSkillShotCount, getLastSkillValue, getLastSkillStep, getLastSkillLane) and SKILL_SHOT_MAX_POINTS = 25000"
  - phase: 05-procedural-rendering
    provides: "CueQueue -> AudioEngine path, RECIPES vocabulary, PresentationObserver step diff, HudView write-on-change"
provides:
  - "src/app/cue-queue.ts: CueKind adds nudge, skillShot, ballSave, highScore, bonusTick; CUE_KINDS has 18 entries"
  - "src/audio/recipes.ts: RECIPES.nudge, RECIPES.skillShot, RECIPES.ballSave, RECIPES.highScore, RECIPES.bonusTick (synthesized, pairwise distinct)"
  - "src/sandbox/presentation-observer.ts: ObserverSession widened with getSkillShotCount/getLastSkillValue/getLastSkillLane; one skillShot cue per count increment, between warning and drain"
  - "src/ui/hud.ts: StatusCode, STATUS_TRANSIENT_STEPS = 180, statusText(code, value), HudSource.getStep/getSkillShotCount/getLastSkillValue/getLastSkillStep, HudView resolved (code, value) status cache"
  - "index.html: white-space: nowrap on .hud-status"
affects: [06-05 TILT NO BONUS and BONUS status rows, 06-06 bonusTick push, 06-09 nudge push, 06-10 ballSave push and BALL SAVED row, 06-11 highScore push and NEW HIGH SCORE row]

actuals:
  tokens: 6604
  tasks: 2
  commits: 3
plan_head_before: 07d7f41dc3964a457dc9db0b37ba913cf5a5df5c
plan_head_after: 685ef0351a9e58e9ac1ddaa9393c3db0cf218071

tech-stack:
  added: []
  patterns:
    - "Status priority resolver: HudView resolves the status line to a (StatusCode, value) pair with no allocation each frame and rebuilds and writes text only when the pair changes; later plans add a code and a row, not a new cache"
    - "Transient statuses expire on the session's fixed-step clock (getStep() < lastStep + STATUS_TRANSIENT_STEPS), never the wall clock"

key-files:
  created: []
  modified:
    - src/app/cue-queue.ts
    - src/app/cue-queue.test.ts
    - src/audio/recipes.ts
    - src/audio/recipes.test.ts
    - src/sandbox/presentation-observer.ts
    - src/sandbox/presentation-observer.test.ts
    - src/ui/hud.ts
    - src/ui/hud.test.ts
    - index.html

key-decisions:
  - "The SKILL SHOT status is not gated on the playing state: only TILT outranks it, matching the UI-SPEC table (row 5 above the row-6 prompts); it requires getSkillShotCount() > 0 so a stale lastSkillStep never shows"
  - "skillShot cue strength is the paid value over SKILL_SHOT_MAX_POINTS (0.2 to 1.0); the recipe ignores level, so strength stays informational"
  - "statusText takes (code, value); the old (state, hasPlayed, warning) signature is gone and its only callers were HudView and its tests"

patterns-established:
  - "Phase-6 stings land as one compile-forced CueKind <-> RECIPES set ahead of their observer pushes, so each later plan only adds a push"

requirements-completed: [PLSH-05]

coverage:
  - id: D1
    description: "A skill shot pushes exactly one skillShot cue per getSkillShotCount() increment, on getLastSkillLane() at value / 25,000, in the fixed push order; no increment pushes none"
    requirement: PLSH-05
    verification:
      - kind: unit
        ref: "src/sandbox/presentation-observer.test.ts#a playing step with no skill-shot increment pushes nothing"
        status: pass
      - kind: unit
        ref: "src/sandbox/presentation-observer.test.ts#an increment with value 5000 on lane 401 pushes one skillShot on 401 at strength 0.2"
        status: pass
      - kind: unit
        ref: "src/sandbox/presentation-observer.test.ts#a warning edge, a skill increment and a drain in one step push warning, skillShot, drain"
        status: pass
      - kind: unit
        ref: "src/sandbox/presentation-observer.test.ts#construction with count 3 pushes nothing on the first observe"
        status: pass
      - kind: manual_procedural
        ref: "Task 1 tracer human-verify checkpoint (npm run dev, land a skill shot, listen for the rising two-note sting over the rollover chime) - user response: approved"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Phase-6 sting set exists as synthesized RECIPES (nudge, skillShot, ballSave, highScore, bonusTick); CUE_KINDS holds 18 distinct kinds and every recipe signature is pairwise distinct"
    requirement: PLSH-05
    verification:
      - kind: unit
        ref: "src/app/cue-queue.test.ts#CUE_KINDS holds 18 distinct kinds and none is wall or chute (D-03)"
        status: pass
      - kind: unit
        ref: "src/audio/recipes.test.ts (keys equal CUE_KINDS; signatures pairwise distinct)"
        status: pass
      - kind: unit
        ref: "src/render/asset-free.test.ts (no audio file in the tree)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The status line resolves TILT, then SKILL SHOT <value> for 180 fixed steps, then the prompts, then WARNING, else empty, and writes only when the resolved (code, value) changes"
    requirement: PLSH-05
    verification:
      - kind: unit
        ref: "src/ui/hud.test.ts#statusText (GAME-02/03, 06-UI-SPEC status line)"
        status: pass
      - kind: unit
        ref: "src/ui/hud.test.ts#falls back to the next row at step = award + 180"
        status: pass
      - kind: unit
        ref: "src/ui/hud.test.ts#tilted shows TILT even inside the skill window"
        status: pass
      - kind: unit
        ref: "src/ui/hud.test.ts#SKILL SHOT outranks WARNING, and WARNING shows once the window expires"
        status: pass
      - kind: unit
        ref: "src/ui/hud.test.ts#50 updates with an unchanged source write the status sink once"
        status: pass
      - kind: unit
        ref: "src/ui/hud.test.ts#a step change inside the skill window writes nothing"
        status: pass
      - kind: unit
        ref: "src/ui/hud.test.ts#the window expiring writes exactly once"
        status: pass
      - kind: unit
        ref: "src/sandbox/game-e2e.test.ts (HUD walk-through still reads its prompts)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 04: Skill-Shot Sting and Status Resolver Summary

**A skill shot now plays its own synthesized rising two-note sting and the status line announces SKILL SHOT with the value paid for 1.5 s, under a fixed-step priority resolver; the full five-sting Phase-6 set (nudge, skillShot, ballSave, highScore, bonusTick) is defined.**

## Performance

- **Duration:** about 10 min of executor time (plan start 2026-11-22T21:09:38Z; Task 1 paused at its tracer checkpoint)
- **Completed:** 2026-11-22
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Five new cue kinds and synthesized recipes, all pairwise distinct, no audio files (D-25).
- The observer pushes one `skillShot` cue per skill-shot count increment, ordered after `warning` and before `drain`.
- `HudView` resolves the UI-SPEC status priority (TILT > SKILL SHOT > prompts > WARNING > empty) on the fixed-step clock and writes only on a changed (code, value) pair.
- `.hud-status` cannot wrap (UI E3); the longest new text, `SKILL SHOT 25,000`, is 17 characters, under the existing 23.

## Task Commits

1. **Task 1 (tracer): skill-shot sting and the Phase-6 sting set** - `f94d364` (feat)
2. **Task 2: status priority resolver with SKILL SHOT <value>**
   - RED: `28705a7` (test)
   - GREEN: `685ef03` (feat)

## TDD Gate Compliance

- RED `28705a7`: 14 new cases failed on assertions (statusText returned undefined for the new codes, SKILL SHOT never shown, STATUS_TRANSIENT_STEPS undefined), 38 existing passed.
- GREEN `685ef03`: 52/52 in `src/ui/hud.test.ts`, 998/998 overall.
- REFACTOR: none needed.

## Files Created/Modified

- `src/app/cue-queue.ts`, `src/app/cue-queue.test.ts` - five new CueKind members, 18-kind pin
- `src/audio/recipes.ts`, `src/audio/recipes.test.ts` - five recipes; ELEMENT_ID map entries for the new kinds
- `src/sandbox/presentation-observer.ts`, `.test.ts` - skillShot push from the counter diff
- `src/ui/hud.ts`, `src/ui/hud.test.ts` - StatusCode, STATUS_TRANSIENT_STEPS, statusText(code, value), resolver
- `index.html` - `white-space: nowrap` on `.hud-status`

## Decisions Made

- SKILL SHOT is outranked only by TILT, never gated on `playing` (follows the UI-SPEC table and the plan's flagged assumption).
- Skill cue strength = value / 25,000, informational only (recipe ignores level).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] recipes.test.ts ELEMENT_ID map extended**
- **Found during:** Task 1
- **Issue:** `ELEMENT_ID: Record<CueKind, number>` in `src/audio/recipes.test.ts` failed tsc once CueKind gained five members.
- **Fix:** Added entries for nudge, skillShot, ballSave, highScore and bonusTick; no assertion changed.
- **Files modified:** src/audio/recipes.test.ts
- **Commit:** f94d364

---

**Total deviations:** 1 auto-fixed (Rule 3). No scope change.

## Issues Encountered

- Pre-existing `prettier --check` failures at the plan base, not caused by this plan and left untouched: `src/audio/recipes.ts` (the rollover layers array) and `index.html` (the `radial-gradient` background line near line 30). The lines this plan touched are formatted.

## User Setup Required

None.

## Verification

- `npx tsc --noEmit`, `npx eslint src`: clean.
- `npx vitest run` / `npm test`: 55 files, 998 tests passed.
- `npm run build`: succeeded.
- `src/sandbox/game-e2e.test.ts` and `src/render/asset-free.test.ts`: pass.
- Task 1 tracer checkpoint (human-verify, gate=blocking): user approved the sting by ear.

## Next Phase Readiness

- nudge, ballSave, highScore and bonusTick recipes exist but are not played until 06-09, 06-10, 06-11 and 06-06 push them.
- Later status rows (TILT · NO BONUS, BONUS, BALL SAVED, NEW HIGH SCORE) plug in as new `StatusCode` members plus one branch in `HudView.update`'s priority chain.

## Self-Check: PASSED

- FOUND: src/app/cue-queue.ts, src/audio/recipes.ts, src/sandbox/presentation-observer.ts, src/ui/hud.ts, src/ui/hud.test.ts, index.html
- FOUND: f94d364, 28705a7, 685ef03
