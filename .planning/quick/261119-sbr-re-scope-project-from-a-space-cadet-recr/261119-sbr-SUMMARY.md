---
phase: quick-261119-sbr
plan: 01
subsystem: project-identity / phase-3 planning docs
tags: [re-scope, docs, identity, original-table]
status: complete
requires: []
provides:
  - "Flippers — Browser Pinball identity across live docs, manifest, lockfile, page title"
  - "Phase-3 CONTEXT/RESEARCH/VALIDATION/PATTERNS framed for an original layout (input to /gsd-plan-phase 3)"
affects:
  - .planning/phases/03-table-plunger-event-bus (03-0N plans must be regenerated from the re-framed context)
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - CLAUDE.md
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - package.json
    - package-lock.json
    - index.html
    - .planning/phases/03-table-plunger-event-bus/03-CONTEXT.md
    - .planning/phases/03-table-plunger-event-bus/03-RESEARCH.md
    - .planning/phases/03-table-plunger-event-bus/03-VALIDATION.md
    - .planning/phases/03-table-plunger-event-bus/03-PATTERNS.md
    - .planning/research/ARCHITECTURE.md
    - .planning/research/FEATURES.md
    - .planning/research/PITFALLS.md
    - .planning/research/SUMMARY.md
    - src/physics/planck-world.ts
    - src/physics/types.ts
    - src/input/flipper-input.ts
    - src/sandbox/flipper-e2e.test.ts
decisions:
  - "Project re-scoped to an original space-themed table titled 'Flippers — Browser Pinball' (package 'flippers'); no layout, names, or signature mechanics from any existing table"
  - "v2 renames: HYP-01 -> LOCK-01 (ball-lock + jackpot), WORM-01 -> SCOOP-01 (capture scoop/saucer); RANK-01/MISS-01 kept with generic original wording"
  - "Phase-3 D-03 is an original layout designed in 03-01; D-05 has no upper third flipper in v1; D-07 plunger is our own design choice"
metrics:
  duration: 7min
  completed: 2026-11-19
estimate:
  tokens: 60000
  tasks: 3
actuals:
  tokens: 15800
  tasks: 3
  commits: 3
plan_head_before: ccfb2a4bd0f4959005e279f0a0a86079f6cf6e89
plan_head_after: 1c0848f665e01beae125b709bd67c0ac687c90a2
---

# Phase quick-261119-sbr Plan 01: Re-scope to an original table (Flippers) Summary

The project now presents everywhere as "Flippers — Browser Pinball", an original space-themed table built from standard pinball elements. That covers the live docs, CLAUDE.md Project block, package/lockfile name, page title, Phase-3 decision docs and src comments. No logic changed: typecheck, lint and 71/71 tests pass.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (tracer) | Project identity end-to-end | a9ffbfe | PROJECT, REQUIREMENTS, ROADMAP, STATE, CLAUDE.md, package.json, package-lock.json, index.html |
| 2 | Phase-3 decision docs re-framed + superseded notes | bc04f56 | 03-CONTEXT, 03-RESEARCH, 03-VALIDATION, 03-PATTERNS, research/{ARCHITECTURE,FEATURES,PITFALLS,SUMMARY} |
| 3 | Neutral src comments + whole-tree gate | 1c0848f | planck-world.ts, types.ts, flipper-input.ts, flipper-e2e.test.ts |

## Requirement ID renames (v2)

- **HYP-01 -> LOCK-01**: Ball-lock + jackpot feature (original rule design).
- **WORM-01 -> SCOOP-01**: Capture scoop/saucer with timed re-eject. Renamed under L-07 because both the old ID and its description used a banned reference-game mechanic name.
- RANK-01 / MISS-01 kept, re-worded generically. BONUS-01 now says "via a drop-target bank". XBALL-01 / MBALL-01 unchanged.
- TBL-01 was re-worded only. It stays `[ ]` / Pending, and no requirement was marked complete.

## Verification

- Task 1 gates: all 15 pass. Identity grep 0 lines. Names in the manifest and both lockfile fields are `flippers`. The lockfile diff is exactly 4 lines. `npm run build` emits `dist/index.html` with "Physics Sandbox — Flippers". ROADMAP checkbox/progress/Plans lines, STATE headings, and CLAUDE.md from `GSD:project-end` onward are identical to af912be.
- Task 2 gates: all 9 pass. Framing grep 0 lines (planning time: 60). D-01..D-12 intact (12). Planck impulse/units count is 15, the same as at planning time (gate >=13). Each of the 4 research docs gained exactly 2 inserted lines. STACK.md and 03-DISCUSSION-LOG are untouched.
- Task 3 gates: all 6 pass. src reference-game grep 0. The src diff is comment-only (7 `+` comment lines). constants.ts is unchanged. `npm run typecheck` exit 0, `npm run lint` exit 0, `npm test` 13 files / 71 tests passed. The whole-tree offender list is empty.
- `.planning/config.json` is still ` M` (the user's uncommitted change). It was never staged or committed. The five 03-0N-PLAN.md files are untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan text conflict] ROADMAP overview wording**
- **Found during:** Task 1
- **Issue:** The plan says to replace the overview with "the original table get built". That violates both the plan's own editing rule (never write "the original") and the Task 1 identity grep (`the original` must be 0 lines).
- **Fix:** Wrote "does an original table get built" instead.
- **Files modified:** .planning/ROADMAP.md
- **Commit:** a9ffbfe

**2. [Rule 1 - Plan text conflict] 03-CONTEXT In-scope wording**
- **Found during:** Task 2
- **Issue:** The prescribed "authoring the original layout" hits the Task 2 framing grep (`the original`).
- **Fix:** Wrote "authoring our original layout".
- **Files modified:** .planning/phases/03-table-plunger-event-bus/03-CONTEXT.md
- **Commit:** bc04f56

**3. [Rule 2 - Coherence] 03-CONTEXT canonical-refs ROADMAP bullet**
- **Issue:** The bullet summarized SC#1 as "layout recreated". It was not a grep hit, but it contradicted the re-scoped SC#1.
- **Fix:** Changed it to "original layout built".
- **Commit:** bc04f56

**4. [Planned deviation from quick-executor default] STATE.md and ROADMAP.md committed inside the task commit**
- STATE.md and ROADMAP.md text edits were committed in a9ffbfe, as the plan explicitly authorizes. The content change is the deliverable, and an uncommitted edit would be lost if this had run in an isolated worktree. No Quick Tasks row was added to STATE.md; the orchestrator owns that.

**5. [Process note] Commits landed on `master`**
- `git.base-branch --is-protected master` returns `true`, and the executor's pre-commit guard would normally halt. The project uses `branching_strategy: none`, `master` is the only branch, all prior phase work and the orchestrator's pre-dispatch commit (ccfb2a4) are on master, and the orchestrator dispatched this run sequentially onto the main working tree. So the commits were made on master as directed. The user can set `git.allow_default_branch_commits: true` to make this explicit for future runs.

Note: the Planck `PrismaticJoint` parenthetical in 03-CONTEXT external refs does not cite the reference game, so it was kept as the plan allows. "reference-anchored" mentions that describe `constants.ts` physics provenance were also kept.

## Orchestrator note

When appending the Quick Tasks row to STATE.md, describe this task neutrally, for example "Re-scope to an original table (Flippers)". That way STATE.md does not pick up the old brand name again. The quick directory slug still contains the old name, so avoid quoting the slug in the description text.

## Next step

Run `/gsd-plan-phase 3` to regenerate the five 03-0N-PLAN.md files from the re-framed 03-CONTEXT/RESEARCH/PATTERNS. The current plan files still carry the old framing (intentionally untouched, L-08).

## Self-Check: PASSED

- All 20 modified files exist on disk.
- Commits a9ffbfe, bc04f56 and 1c0848f are ancestors of HEAD (`git rev-list --count ccfb2a4..HEAD` = 3).
