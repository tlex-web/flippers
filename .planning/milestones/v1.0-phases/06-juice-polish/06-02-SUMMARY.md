---
phase: 06-juice-polish
plan: 02
subsystem: render
tags: [canvas-2d, depth, shadow, vignette, bake, palette, vitest]

requires:
  - phase: 05-procedural-rendering
    provides: TableRenderer frame contract, bakeStatic/traceElement, bakeHalo sprite pattern, recording context
provides:
  - Phase-6 palette token set (17 constants) in src/render/palette.ts
  - bakeShadow sprite + SHADOW_RADIUS_M / SHADOW_OFFSET_X_M / SHADOW_OFFSET_Y_M in src/render/sprites.ts
  - Per-ball soft shadow pass (drawBallShadows) in TableRenderer, after bats/plunger, before balls
  - Depth bake in bakeStatic - lighter light pool, per-element drop shadows (drawDropShadow), vignette last
affects: [06-03 lamps (consumes lamp palette tokens), 06-09 screen shake (moves the baked vignette), 06-10 ball-save post (POST_BODY, SAVE_*), later render plans re-pinning the frame contract]

actuals:
  tokens: 9050
  tasks: 2
  commits: 3
plan_head_before: 0a569c94d88ab1fa5c2081275b5ca779d5fa6751
plan_head_after: c18771f35c0eb2d881051767a9edbb5e40ae75fc

tech-stack:
  added: []
  patterns:
    - "Drop shadow by shifted world transform: setWorld(ctx, view, dx, dy) then traceElement, so shadows reuse the element trace with no geometry copy"
    - "Bake-state replay in tests: draws(rec) replays the recorder log to get transform, props and current path at every fill/stroke"

key-files:
  created: []
  modified:
    - src/render/palette.ts
    - src/render/sprites.ts
    - src/render/table-renderer.ts
    - src/render/table-renderer.test.ts
    - src/render/static-layer.ts
    - src/render/static-layer.test.ts

key-decisions:
  - "The light pool fills tableBounds(elements) in world meters (not the whole backing), so the lavender lift stays on the table and never over the space background outside it"
  - "Vignette uses an inner gradient radius of 0.5 x half-diagonal with stops 0 CLEAR / 1 EDGE; the test pins the effective radii (CLEAR at 0.5 hd, EDGE at hd), so either gradient form satisfies it"
  - "Bumper drop shadow resets shadowBlur to 0 before the bumper body, which then raises it again for its own bake-time glow (unchanged)"

patterns-established:
  - "Depth is bake-only: every gradient and shadowBlur for depth lives in bakeStatic or a resize-time sprite; draw() stamps one sprite per ball"

requirements-completed: [PLSH-03]

coverage:
  - id: D1
    description: "Every ball casts a soft baked shadow (r = 1.25 * BALL_RADIUS_M, offset (0.06, 0.09) m), stamped once per ball after the bats and plunger and before the balls; size independent of speed; no re-bake on draw"
    requirement: PLSH-03
    verification:
      - kind: unit
        ref: "src/render/table-renderer.test.ts#a frame with N balls has the static blit plus N shadow stamps, each at ball + offset, sized 2 * SHADOW_RADIUS_M"
        status: pass
      - kind: unit
        ref: "src/render/table-renderer.test.ts#stamps every shadow after the last bat fill and before the first ball fill, source-over at alpha 1"
        status: pass
      - kind: unit
        ref: "src/render/table-renderer.test.ts#the shadow does not scale with speed: a fast ball stamps the same size as a resting one"
        status: pass
      - kind: unit
        ref: "src/render/table-renderer.test.ts#a resize then two draws do not re-bake: bakeCount and createCount unchanged by draw()"
        status: pass
      - kind: manual_procedural
        ref: "Task 1 tracer human-verify checkpoint (npm run dev, launch a ball) - user response: approved"
        status: pass
    human_judgment: false
  - id: D2
    description: "Static bake depth: lighter LIGHT_POOL falloff first, DROP_SHADOW before every bumper, slingshot and wall at the planned offsets/blur/width, vignette last at identity; clean state on return; drawn-id list unchanged"
    requirement: PLSH-03
    verification:
      - kind: unit
        ref: "src/render/static-layer.test.ts#bakeStatic depth (PLSH-03)"
        status: pass
      - kind: unit
        ref: "src/render/static-layer.test.ts#produces identical call logs for two bakes of the same view (seeded starfield)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Depth reads as 2.5D at rest: bumper/sling/wall shadows fall down-right, corners gently darkened, lower-center slightly brighter, neon stays crisp"
    requirement: PLSH-03
    verification:
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: true
    rationale: "Shadow and vignette strength are perceptual; the bake order and parameters are machine-proven but whether it reads as depth is a UAT call (D-20)"
  - id: D4
    description: "Phase-6 palette token set (17 constants) exists as fixed strings; the shadow sprite and depth bake take colors from palette.ts only"
    requirement: PLSH-03
    verification:
      - kind: unit
        ref: "src/render/asset-free.test.ts"
        status: pass
      - kind: other
        ref: "grep SHADOW_CORE / SKILL_LIT src/render/palette.ts; npx tsc --noEmit"
        status: pass
    human_judgment: false

duration: 46min
completed: 2026-11-22
status: complete
---

# Phase 6 Plan 02: Depth (Ball Shadow, Light Pool, Drop Shadows, Vignette) Summary

**Baked soft ball shadow stamped once per ball, plus a bake-time light pool, down-right drop shadows under every bumper, sling and wall, and a final vignette in bakeStatic, all at zero per-frame gradient or blur cost.**

## Performance

- **Duration:** 46 min (includes the Task 1 tracer human-verify wait)
- **Started:** 2026-11-22T19:43:39Z
- **Completed:** 2026-11-22T20:29:31Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- All 17 Phase-6 palette tokens from the UI-SPEC table are in `palette.ts`, each with a one-line comment that says what it means.
- `bakeShadow` builds a radial sprite (SHADOW_CORE, then SHADOW_MID, then SHADOW_FADE) once per resize. `drawBallShadows` stamps it with one `drawImage` per ball at center + (0.06, 0.09) m. The user approved how it looks at the tracer checkpoint.
- `bakeStatic` adds a "lighter" light pool centered at (1.45, 4.6) m with radius 2.6 m. A new `drawDropShadow` runs before each bumper, slingshot and wall. The vignette is painted last, at identity, over the whole backing.
- The live frame contract still holds: `draw()` creates no gradient, sets no blur and paints no text. The bake returns with shadowBlur 0, globalAlpha 1 and source-over.

## Task Commits

1. **Task 1: Tracer, every ball casts a soft baked shadow** - `a14ef38` (feat). Tracer gate: human-verify (gate=blocking), user response "approved".
2. **Task 2: Light pool, drop shadows and vignette in the bake** - `2f955a9` (test, RED), `c18771f` (feat, GREEN)

## Files Created/Modified
- `src/render/palette.ts` - Phase-6 token set (lamp, save, post, shadow, drop-shadow, vignette, light-pool)
- `src/render/sprites.ts` - `bakeShadow`, `SHADOW_RADIUS_M`, `SHADOW_OFFSET_X_M`, `SHADOW_OFFSET_Y_M`
- `src/render/table-renderer.ts` - `ballShadow` sprite baked in resize, `drawBallShadows` pass, updated draw-order doc
- `src/render/table-renderer.test.ts` - re-pinned createCount and drawImage counts; shadow placement, order, fixed size and no re-bake cases
- `src/render/static-layer.ts` - `setWorld`, `drawLightPool`, `drawDropShadow`, `drawVignette`, wired into `bakeStatic`
- `src/render/static-layer.test.ts` - `bakeStatic depth (PLSH-03)` suite with a log-replay helper (transform, props and path at each draw)

## Decisions Made
- The light pool fills `tableBounds(elements)` in world meters, as the plan says, not the whole backing. The lift stays on the table.
- The vignette gradient runs from an inner radius of 0.5 x the half-diagonal to the half-diagonal, with stops CLEAR at 0 and EDGE at 1. This is the plan's action wording. The plan's behavior line says "VIGNETTE_CLEAR at 0.5". The test checks the effective radii, which matches both readings.
- The bumper drop shadow sets shadowBlur back to 0 before the bumper body draws. The body then raises it again for its existing glow, so the behavior "shadowBlur is 0 again before the element fill" holds as a reset between the two fills.

## Deviations from Plan

None. The plan was executed as written.

## TDD Gate Compliance

- **Task 2:** RED `2f955a9` was followed by GREEN `c18771f`.
  - **RED run:** `npx vitest run src/render/static-layer.test.ts --reporter=tap-flat` exited 1. The target test was "bakeStatic depth (PLSH-03) > draws a lighter radial light pool as the first fill after the background". It expected `fillRect` and got `stroke`. The classifier returned `RED_EVIDENCE_OK`.
  - **Semantic check:** the target ran and failed on its planned assertion, because the first draw in the world transform was a wall stroke and no light pool existed yet. The drop-shadow tests and the vignette test also failed on their planned assertions: 1 fill per bumper and 2 strokes per wall where more were expected, and a last fill that was `fill`, not `fillRect`. None of these were load, import or syntax failures.
  - **Cases that passed before GREEN:** the return-state and drawn-id-order cases. They are invariants the change must keep, not new behavior.
- **REFACTOR:** none needed.

## Issues Encountered
None.

## Known Stubs
None. The lamp, save and post palette tokens have no consumer yet, on purpose. Plans 06-03, 06-10 and later use them, as the plan's flagged assumptions record.

## User Setup Required
None. No external service configuration required.

## Verification
- `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (54 files, 935 tests) and `npm run build` all pass.
- `src/render/asset-free.test.ts` passes.
- All acceptance-criteria greps pass for both tasks.

## Next Phase Readiness
- 06-03 can use the lamp tokens (`SKILL_*`, `INLANE_*`, `SAVE_*`, `LAMP_HOTSPOT`, `LAMP_RIM`) straight away.
- Shadow sprite layer index: the shadow is baked after the two halos, so it is layer index 3 of each resize. Later sprites added after it shift the createCount literals again.
- The vignette is baked, so the 06-09 shake will move it along with the blit (research Pitfall 9). If UAT shows the vignette moving, add the deferred live overlay.

## Self-Check: PASSED
- All 6 key files are on disk. Commits a14ef38, 2f955a9 and c18771f are ancestors of HEAD, and evaluation-scope resolves all three for 06-02.

---
*Phase: 06-juice-polish*
*Completed: 2026-11-22*
