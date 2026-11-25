---
phase: 05-rendering-audio
plan: 02
subsystem: rendering
tags: [canvas2d, procedural-art, hidpi, interpolation, offscreen-bake, vitest]

requires:
  - phase: 05-rendering-audio
    provides: "05-08 interpolateBalls/interpolateAngles, loop flipper-angle snapshots, RND-01 asset gate"
  - phase: 05-rendering-audio
    provides: "05-01 cue pipeline wiring in main.ts (left intact)"
  - phase: 03-table-plunger-event-bus
    provides: "resolve(TABLE_SPEC) ResolvedElement geometry, PLUNGER_REST/PLUNGER_ZONE, deriveKickFace"
provides:
  - "src/render/view-transform.ts: tableBounds, computeView (backing follows the CSS fit times dpr)"
  - "src/render/palette.ts: one-meaning-per-color palette plus line widths in meters"
  - "src/render/static-layer.ts: bakeStatic (seeded starfield, neon walls, bumpers, slings, inserts), Layer, LayerFactory"
  - "src/render/table-renderer.ts: TableRenderer (resize, draw, bakeCount), RenderFrame, LightState, CanvasTarget"
  - "src/sandbox/main.ts: TableRenderer live by default, ?debug=1 keeps DebugRenderer, matchMedia dpr re-arm, interpolated balls and bats"
  - "src/render/test/recording-context.ts: Proxy canvas recorder plus recording LayerFactory for frame-contract tests"
affects: [05-04, 05-06, 06-polish]

actuals:
  tokens: 14708
  tasks: 2
  commits: 2
plan_head_before: 2ca55ad9a5656f3caeba9471291ba9f85d6c2b93
plan_head_after: ef7ea540b5c46bdb9b4e2453f80700aad4b01100

tech-stack:
  added: []
  patterns:
    - "Static playfield baked once per resize into an offscreen layer, blitted with one drawImage at identity per frame"
    - "Renderer draws in world meters after one setTransform(scale, 0, 0, scale, offX, offY); gradients cached at resize, none created in draw()"
    - "Canvas, context and layer factory are injected (no DOM globals in src/render), so the frame contract is unit-tested through a Proxy recorder"
    - "Explicit end-of-frame resets (globalAlpha 1, source-over) instead of save/restore in the hot path"

key-files:
  created:
    - src/render/view-transform.ts
    - src/render/view-transform.test.ts
    - src/render/palette.ts
    - src/render/static-layer.ts
    - src/render/static-layer.test.ts
    - src/render/table-renderer.ts
    - src/render/table-renderer.test.ts
    - src/render/test/recording-context.ts
  modified:
    - src/sandbox/main.ts

key-decisions:
  - "Backing store sized from the display: CSS fit first, backing = round(css * dpr); at 1280x684 dpr 1.5 the area is under a tenth of the old 400 px/m formula (research Finding 1)"
  - "D-01 interpretation: ROADMAP SC1 'HUD on Canvas' is met in intent by the procedural DOM HUD; the canvas paints no text (proven: no fillText/strokeText across ten draws)"
  - "?debug=1 (exact string compare via URLSearchParams) selects the old DebugRenderer; any other URL draws through TableRenderer"
  - "Task 2 added no implementation change: the Task 1 tracer already met every behavior line; tests proven non-vacuous by a mutation probe"

patterns-established:
  - "Recording context: Proxy that logs calls and property sets, returns stored values (with canvas defaults), and returns GradientStub from create*Gradient"
  - "Frame-contract tests stain globalAlpha/composite before draw() so the reset is what is proven"

requirements-completed: [RND-01, RND-02]

coverage:
  - id: D1
    description: "Backing store follows the display (<= css*dpr+1 per axis, aspect preserved, under a tenth of the old area, safe dpr/viewport fallbacks)"
    requirement: RND-02
    verification:
      - kind: unit
        ref: "src/render/view-transform.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Static bake draws exactly the non-mount elements (arc per circle, lineTo along every polyline), reproducibly, and resets shadowBlur"
    requirement: RND-01
    verification:
      - kind: unit
        ref: "src/render/static-layer.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Frame contract: one bake across ten draws, identity setTransform then one drawImage, no gradients/blur/text in draw(), alpha and composite restored, ball in world meters, lit rollover stroke, rebake on resize"
    requirement: RND-02
    verification:
      - kind: unit
        ref: "src/render/table-renderer.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Zero image, audio or font assets in src/ and index.html"
    requirement: RND-01
    verification:
      - kind: unit
        ref: "src/render/asset-free.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live game shows the procedural space table crisply at every zoom with smooth ball and bats; ?debug=1 opens the diagnosis renderer"
    requirement: RND-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 tracer human-verify checkpoint (user response: approved)"
        status: pass
    human_judgment: true
    rationale: "Crispness, smoothness on real hardware and art direction are visual judgments; approved at the Task 1 checkpoint, still worth a UAT look at 144 Hz"
  - id: D6
    description: "Every drawn shape and color is original (no imitation of commercial table art)"
    verification: []
    human_judgment: true
    rationale: "Originality is a values constraint the asset gate cannot prove; routes to judgment review at UAT (plan prohibition)"

duration: 18min
completed: 2026-11-21
status: complete
---

# Phase 5 Plan 02: Procedural Table Renderer Summary

**Canvas 2D TableRenderer that bakes the space-themed playfield (seeded starfield, neon walls, gradient bumpers, amber sling rubbers) once per resize at the display's true backing size, then blits it and draws interpolated balls and bats each frame with no gradients, blur or text, proven by a Proxy canvas recorder.**

## Performance

- **Duration:** about 18 min (Task 1 before the checkpoint, Task 2 after resume)
- **Started:** 2026-11-21T13:55:51Z (after 05-08 close-out)
- **Completed:** 2026-11-21T14:14:00Z
- **Tasks:** 2
- **Files modified:** 9 (8 created, 1 modified)

## Accomplishments

- The live game draws the whole table through TableRenderer: space gradient, two nebulae, 220 seeded stars, two-pass neon walls and chute, red drain apron, dim lane and rollover inserts, glowing bumpers, sling bodies with the kick face stroked as rubber, stadium bats, ball with cached gradient and glint, plunger and charge meter.
- Backing store follows the display (CSS fit first, then times dpr), fixing the roughly 17x oversized canvas; a matchMedia listener re-arms on dpr change.
- main.ts now uses `interpolateBalls` and `interpolateAngles` from 05-08 (inline ball loop and `growTo` removed), so the ball and bats stay smooth at 120/144 Hz.
- `?debug=1` keeps the old DebugRenderer for diagnosis.
- The RND-02 frame rules are machine-proven by 14 new contract tests over a real PlanckWorld.

## Task Commits

1. **Task 1 (tracer): The live game draws the procedural space table through TableRenderer at display resolution, with interpolated balls and bats** - `df0afc5` (feat). Tracer human-verify checkpoint: approved.
2. **Task 2: The bake draws every table element, and the frame stays allocation-free and text-free** - `ef7ea54` (test)

**Plan metadata:** (this docs commit)

## TDD Gate Compliance

- **RED:** `ef7ea54` added `static-layer.test.ts` and `table-renderer.test.ts`. Run against the committed code, all 14 tests passed at once. Fail-fast rule 1 (unexpected GREEN) was checked. The cause is the plan's own design: Task 1 was a tracer that built the full renderer, and Task 2's action says to fix code "only where a behavior line exposes a gap". No gap showed up.
- **RED evidence (mutation probe):** To show the tests can fail, the committed code was broken on purpose in a temporary edit. draw() was made to create a linear gradient and set shadowBlur to 1, the end-of-frame alpha/composite reset was removed, and the bake's starfield seed and shadowBlur resets were removed. Five targets went red on their planned assertions: no gradients, no shadowBlur, alpha/composite restored, identical bake logs, and shadowBlur 0 on return. TAP record for the target `creates no linear or radial gradient during ten draws` (`npx vitest run --reporter=tap-flat src/render/table-renderer.test.ts`, exit 1): `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` (target_test_failed). Semantic assessment: the target ran and failed on `toHaveLength(0)` over gradient-creation calls because of the injected gradient. There was no load, syntax or fixture fault. The temporary edits were then undone with `git checkout -- <file>` and the suite went green.
- **GREEN:** there is no `feat(05-02)` commit after the RED commit. The implementation that satisfies these behaviors is `df0afc5` (Task 1), which comes before it. This is a known deviation from the test-then-feat order, and it follows directly from the tracer-first plan structure.
- **REFACTOR:** none.

## Files Created/Modified

- `src/render/view-transform.ts` - tableBounds (with meter and pullback margins), computeView (sanitized dpr/viewport, CSS fit, backing, scale, offsets), layout constants
- `src/render/view-transform.test.ts` - backing-size, aspect, fit, corner-mapping, dpr-fallback and dpr-2 invariants
- `src/render/palette.ts` - palette constants (one meaning each) and line widths in meters
- `src/render/static-layer.ts` - bakeStatic, traceElement, Layer, LayerFactory, STARFIELD_SEED, STAR_COUNT
- `src/render/table-renderer.ts` - TableRenderer with cached ball/flipper gradients and an allocation-free draw()
- `src/render/test/recording-context.ts` - Proxy canvas recorder, GradientStub, RecordingLayerFactory
- `src/render/static-layer.test.ts` - RND-01 bake contract (5 tests)
- `src/render/table-renderer.test.ts` - RND-02 frame contract (9 tests)
- `src/sandbox/main.ts` - debug flag, DOM LayerFactory, applyView with resize and matchMedia, pooled render frame, interpolated balls and bats

## Decisions Made

- The backing follows the display and never the other way round. The old renderer's sizing order was the root cause of the oversized canvas.
- D-01 holds: the HUD stays DOM text and the canvas paints no text.
- The recording context returns canvas defaults for globalAlpha, globalCompositeOperation and shadowBlur, so reading state back is meaningful before any write.

## Deviations from Plan

### TDD sequencing

**1. [TDD - Unexpected GREEN] Task 2 tests passed against the Task 1 implementation**
- **Found during:** Task 2 RED
- **Issue:** Every behavior line was already met by the tracer, so the RED run was green.
- **Fix:** Showed the tests can fail with a temporary mutation probe (RED_EVIDENCE_OK) and changed no production code, as the plan's action requires.
- **Files modified:** none outside the three new test files
- **Verification:** `npx vitest run src/render` passes 5 files and 39 tests. The mutated run failed 5 targets.
- **Committed in:** ef7ea54

**2. [Hygiene] Prettier applied to the three new files only**
- Prettier is not enforced repo-wide (30 files already fail the check), so Task 1 files were left as committed.

---

**Total deviations:** 1 TDD-sequencing note (no Rule 1-4 fixes needed) plus 1 hygiene note.
**Impact on plan:** None on scope. Production code is unchanged in Task 2.

## Issues Encountered

None.

## Verification

- `npx vitest run src/render`: 5 files, 39 tests pass (view-transform, interpolate, asset-free, static-layer, table-renderer)
- `npx vitest run`: 41 files, 576 tests pass (determinism suites included)
- `npx tsc --noEmit`: clean. `npx eslint src`: clean. `npm run build`: ok
- Only `src/physics/planck-world.ts` imports the engine package. `src/render` does not import it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 05-04 (flashes and halos) can add passes inside `TableRenderer.draw()`. The flash palette constants exist, and the frame-contract tests will catch any gradient or blur created per frame and any alpha/composite leak.
- UAT should still check pacing at 144 Hz on real hardware, plus originality judgment (D5, D6).

---
*Phase: 05-rendering-audio*
*Completed: 2026-11-21*

## Self-Check: PASSED
