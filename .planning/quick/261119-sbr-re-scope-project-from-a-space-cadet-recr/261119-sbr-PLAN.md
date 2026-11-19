---
phase: quick-261119-sbr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
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
autonomous: true
requirements: [QUICK-261119-sbr]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Every live project doc (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, CLAUDE.md Project block) names the project 'Flippers — Browser Pinball' and frames it as an ORIGINAL space-themed table. None of them names the reference game, its publishers, or its signature mechanics, and none says the layout is anchored to or copied from an existing table."
    - "The core value reads '...feels satisfying, weighty, and true to real pinball' in PROJECT.md, REQUIREMENTS.md, STATE.md and CLAUDE.md. The Fidelity constraint reads 'Original table design built on standard pinball conventions; authentic-feeling physics; clean procedural visual style.' in PROJECT.md and CLAUDE.md."
    - "TBL-01, ROADMAP Phase-3 goal and SC#1 describe an original layout built from standard pinball elements and positioned for good ball flow. The v2 list keeps RANK-01 and MISS-01 with generic original wording and replaces the hyperspace and wormhole items with LOCK-01 and SCOOP-01."
    - "Phase-3 CONTEXT/RESEARCH/VALIDATION describe D-03 as an original layout designed in 03-01 and D-07 as our own plunger design choice. D-01..D-12 IDs are intact, no decompilation or reference-table citation is used as design authority, and every Planck technical finding is preserved."
    - "The four historical research docs carry the superseded-framing note directly under their H1 and are otherwise unchanged."
    - "package.json and both package-lock.json top-level names are 'flippers'. The built page title is 'Physics Sandbox — Flippers'. src comments no longer name the reference game, and typecheck, lint and all 71 tests pass with zero logic changes."
    - "The five 03-0N-PLAN.md files, .planning/config.json, ROADMAP checkbox/progress state, CLAUDE.md sections outside the Project block, and src/physics/constants.ts are untouched."
  artifacts:
    - path: ".planning/PROJECT.md"
      provides: "Original-table identity, core value, fidelity constraint, Key Decision row"
      contains: "Original table design (not a recreation of any existing table)"
    - path: ".planning/REQUIREMENTS.md"
      provides: "Re-scoped TBL-01 + original v2 progression items"
      contains: "LOCK-01"
    - path: ".planning/ROADMAP.md"
      provides: "Re-worded title, Phase-3 goal/SC#1/03-01 line, Phase-4 goal"
      contains: "# Roadmap: Flippers — Browser Pinball"
    - path: ".planning/phases/03-table-plunger-event-bus/03-CONTEXT.md"
      provides: "D-03 original layout, D-05 no third flipper in v1, D-07 own-design plunger — feeds /gsd-plan-phase 3 regeneration"
      contains: "Original layout"
    - path: "package.json"
      provides: "Package identity"
      contains: "\"name\": \"flippers\""
    - path: "index.html"
      provides: "Page title"
      contains: "Physics Sandbox — Flippers"
  key_links:
    - from: "CLAUDE.md"
      to: ".planning/PROJECT.md"
      via: "GSD:project-start block mirrors PROJECT.md title / What This Is / Core Value / Constraints verbatim"
      pattern: "Flippers — Browser Pinball"
    - from: ".planning/ROADMAP.md"
      to: ".planning/REQUIREMENTS.md"
      via: "Phase-3 SC#1 restates TBL-01 (original layout from standard elements, positioned for good flow)"
      pattern: "positioned for good ball flow"
    - from: ".planning/phases/03-table-plunger-event-bus/03-CONTEXT.md"
      to: ".planning/ROADMAP.md"
      via: "D-03 layout decision matches the Phase-3 goal and SC#1 that /gsd-plan-phase 3 will plan against"
      pattern: "Original layout"
    - from: "package.json"
      to: "package-lock.json"
      via: "top-level name field and packages[''].name agree"
      pattern: "\"name\": \"flippers\""
---

<objective>
Re-scope the project from a recreation of an existing commercial pinball table to an ORIGINAL space-themed pinball table titled "Flippers — Browser Pinball" (package `flippers`). This changes wording and scope only. Physics, flipper code, and the Phase-3 architecture stay as they are: spec-first `TABLE_SPEC` + `resolve()`, a single coordinate source, the typed collision-event bus, and the hold-to-charge scalar-impulse plunger.

Purpose: the user decided we are not copying another game's table layout, names, or signature mechanics, even as clean-room geometry. Phase-3 planning docs must say so before `/gsd-plan-phase 3` regenerates the five 03-0N plans from them.

Output: re-worded project docs, phase-3 context/research/validation, superseded-framing notes on the historical research docs, the renamed package/page title, and neutral src comments.

Requirement note: `requirements: [QUICK-261119-sbr]` is a quick-task tracking ID on purpose. This task REWORDS TBL-01 but does not complete it. TBL-01 must stay `[ ]` / Pending, so do not mark any REQUIREMENTS.md ID complete.

Locked decisions (from the orchestrator's planning context; labelled L-NN here for traceability):
- L-01 Title `Flippers — Browser Pinball`; package name `flippers`.
- L-02 Original space-themed theme. No reference-game, platform, or publisher naming. No reference-game mechanic names (rank ladder, light cascades, capture-and-eject portals, gravity effects, fuel missions). No layout anchored to, positioned relative to, or copied from any existing table.
- L-03 Original layout from standard elements: outer walls, right-side launch chute, upper bumper cluster, lanes/rollovers, some guide walls/ramps, center-bottom drain funnel, and two lower flippers in an inverted-V. Positions are chosen for good ball flow and sized from the unchanged Phase-2 feel constants. No upper third flipper in v1; it may be listed only as an optional later original-design idea.
- L-04 Plunger: hold-to-charge scalar accumulator plus a proportional impulse on release, framed as our own design choice. Decompilation citations are removed as design authority.
- L-05 Core value: "...feels satisfying, weighty, and true to real pinball".
- L-06 Fidelity constraint: "Original table design built on standard pinball conventions; authentic-feeling physics; clean procedural visual style."
- L-07 v2: keep RANK-01 and MISS-01 with generic original wording. Replace the hyperspace item with an original concept under a new ID. The milestone name becomes "progression milestone".
- L-08 Do NOT edit the five `03-0N-PLAN.md` files.
- L-09 Do NOT change ROADMAP progress state or checkboxes. ROADMAP TEXT edits ARE authorized for this task: title, overview sentence, phase-3 summary, goal, SC#1, the 03-01 plan-list description, and the phase-4 goal. This explicitly overrides the default quick-executor rule "Do NOT update ROADMAP.md".
- L-10 Never stage, commit, revert, or edit `.planning/config.json`. It holds an unrelated uncommitted user change.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/PROJECT.md

Planning-time base commit: `af912be`. Every diff-based gate below compares against it. HEAD values in gates were measured at planning time (2026-11-19).

Scope authority (MUTABLE-SCOPE): the line numbers named in task actions are a planning-time grep observation. Before editing each task's files, re-run that task's gate grep without the `wc -l` (use `grep -niE` with the same pattern and files) to list the live hit lines. That live list is the authoritative edit scope for the task. Edit a hit line only if it is in a file listed in the task's `<files>`.

Editing rules for all tasks:
- Use the Edit tool for every change. Do not use `sed -i` or other shell rewrites: the files contain UTF-8 em-dashes and arrows.
- Change wording only. Keep the surrounding markdown structure: headings, tables, list markers, checkbox state, and frontmatter.
- In new text, never write the phrase "the original" (write "our", "an original", or "the table"). Never write words of the form "faithful" or any word starting "transcri". Never refer to "reference image".
- Stage explicit paths only (`git add <path> ...`). Never use `git add -A`, `git add .`, or `git add -u`. Before each commit, run `git diff --cached --name-only` and confirm it lists neither `.planning/config.json` nor any `03-0N-PLAN.md`.
- Do not run `npm install`, because it could rewrite the lockfile. Edit the lockfile name fields by hand.
</context>

<!-- planner-discipline-allow: HYP-01 -->
<!-- planner-discipline-allow: WORM-01 -->

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): Project identity end-to-end — project docs, CLAUDE.md Project block, package manifest/lockfile, HTML entry</name>
  <files>.planning/PROJECT.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md, .planning/STATE.md, CLAUDE.md, package.json, package-lock.json, index.html</files>
  <action>
This task carries the new identity through every layer it ships in: planning docs, agent instructions, the package manifest and lockfile, and the HTML entry. The production build then proves the renamed package produces a page titled "Flippers". Implements L-01, L-02, L-03, L-05, L-06, L-07, L-09 and L-10. First list live scope with the task gate grep (see context).

.planning/PROJECT.md:
- Title (L1): replace with `# Flippers — Browser Pinball`.
- "What This Is" paragraph (L5): replace with "A browser-based pinball game with an original space-themed table, built as an HTML5 game rendered entirely in code — no hand-painted or copied art, with sound synthesized at runtime. Built as a portfolio/demo piece: a polished pinball game anyone can play in their browser with no install."
- Core Value (L9), per L-05: replace the trailing "...feels satisfying and <reference-game clause>." with "feels satisfying, weighty, and true to real pinball." Keep the sentence that follows it unchanged.
- Active requirement on the table layout (L25): replace with "- [ ] Original space-themed table layout built from standard pinball elements: right-side launch chute, upper bumper cluster, lanes/rollovers, guide walls/ramps, and center-bottom drain funnel, positioned for good ball flow". Keep the checkbox `[ ]`.
- Out of Scope (L40): replace with "- Copying any existing table's art, layout, names, or sounds — this is an original table in a clean procedural style (avoids copyright and an art pipeline)".
- Out of Scope (L41): replace with "- Extracting or redistributing any third-party game assets (art, audio) — copyright risk; procedural approach sidesteps it".
- Out of Scope (L45): replace with "- Level editor / multiple tables — single original table for v1".
- Context section: replace the reference-game bullet (L49) with "- **Genre:** Original space-themed pinball — a broad, well-established pinball theme; the table layout, names, and rules are our own design." Delete the decompilation "Useful reference" bullet (L52) entirely. Keep the Rendering and Technical-crux bullets.
- Constraints, Fidelity line (L58), per L-06: replace with "- **Fidelity**: Original table design built on standard pinball conventions; authentic-feeling physics; clean procedural visual style." Discretion: in the Assets line (L57), change "original art/sound" to "third-party art/sound", because "original" now means our own design.
- Key Decisions table (L70): replace the row about recreating the reference table layout with "| Original table design (not a recreation of any existing table) | Avoids copying another game's layout, names, or signature mechanics; standard pinball elements arranged for good ball flow | ✓ Decided 2026-11-19 |".
- Footer: replace it with "*Last updated: 2026-11-19 after re-scope to an original table (quick task 261119-sbr)*".

CLAUDE.md, per L-01, L-05 and L-06: edit ONLY the lines between `<!-- GSD:project-start source:PROJECT.md -->` and `<!-- GSD:project-end -->`. Make the block mirror the new PROJECT.md text verbatim:
- Title line: `**Flippers — Browser Pinball**`.
- The "What This Is" paragraph.
- The `**Core Value:**` line.
- The Constraints list, including the new Fidelity line and the Assets "third-party" wording.
Do not touch anything from `<!-- GSD:project-end -->` onward (Technology Stack, Conventions, Architecture, Skills, Workflow, Developer Profile).

.planning/REQUIREMENTS.md:
- Title (L1): `# Requirements: Flippers — Browser Pinball`.
- Core Value (L4): same new wording as PROJECT.md.
- Intro (L8): "Requirements for the initial release: a polished, browser-playable core pinball game on an original space-themed table. Each maps to a roadmap phase."
- TBL-01 (L30), per L-03: "- [ ] **TBL-01**: The table is an original layout built from standard pinball elements — launch chute (right side), upper bumper cluster, ramps/guide walls, lanes, outer walls, and center-bottom drain funnel — positioned for good ball flow". Keep `[ ]` and keep the Traceability row Pending.
- v2 intro (L67): change the quoted milestone name to "progression". The sentence becomes "Deferred to a future progression milestone." and the rest of the paragraph is unchanged.
- v2 Progression list, per L-07:
  - RANK-01: "- **RANK-01**: Original rank/progression ladder (rank names TBD) tracked via rank lights".
  - MISS-01: "- **MISS-01**: Mission/mode engine with original, data-driven mission definitions (names and content TBD), timed objectives, and lit-light choreography".
  - Replace the HYP-01 item with "- **LOCK-01**: Ball-lock + jackpot feature — locking balls lights a jackpot shot (original rule design)".
  - BONUS-01 (discretion): "via booster drop targets" becomes "via a drop-target bank".
  - Replace the WORM-01 item with "- **SCOOP-01**: Capture scoop/saucer — holds the ball, then re-ejects it after a timed delay". This applies L-07's rename rule, because the old ID and description use a banned mechanic name.
  - Keep XBALL-01 and MBALL-01 unchanged.
- Out of Scope table:
  - The 3D-table row reason becomes "Off-brief; the target is a 2D top-down table with 2.5D depth cues; true 3D is a much larger project".
  - Replace the replica-artwork row with "| Copying any existing table's art, layout, names, or sounds | Copyright risk + this is an original table; all art is procedural |".
  - The audio-samples row feature becomes "Loading audio sample files" (reason unchanged).
- Footer: "*Last updated: 2026-11-19 after re-scope to an original table (quick task 261119-sbr)*".

.planning/ROADMAP.md, text only per L-09:
- Title (L1): `# Roadmap: Flippers — Browser Pinball`.
- Overview (L5): "the real <reference-game> table get built" becomes "the original table get built".
- Phase-3 summary bullet (L18): replace only the text after " - " with "An original space-themed table layout, a hold-to-charge plunger, and a typed collision-event bus". Keep `- [ ]` exactly.
- Phase-3 Goal (L98): replace the opening clause with "An original space-themed playfield exists". The rest of the sentence is unchanged.
- Phase-3 SC#1 (L104): "  1. The playfield is an original layout built from standard pinball elements — launch chute (right side), upper bumper cluster, ramps/guide walls, lanes, outer walls, and center-bottom drain funnel, with two lower flippers in an inverted-V — positioned for good ball flow (procedural geometry only; no layout, names, or assets copied from any existing table)."
- 03-01 plan-list line (L113): change the parenthetical to "(the single one-resolve origin; original-layout descriptors)". Keep `- [ ]` and `[wave 1]`.
- Phase-4 Goal (L133): "behaves faithfully" becomes "behaves like a real table".
- Do NOT touch any checkbox, the Progress table, `**Plans**:` lines, or the phase list order.

.planning/STATE.md, keeping its structure intact:
- Core value line (L23): new L-05 wording.
- "See:" line (L21): "(updated 2026-11-19)".
- Phase-3 Blockers/Concerns bullet (L106): replace with "- [Phase 3]: Table layout is an original design authored in 03-01 from standard pinball elements (positions chosen for good ball flow, sized from the unchanged Phase-2 feel constants) — no external layout source."
- Deferred Items row (L115): the Item cell becomes "Original rank/mission/lock-jackpot/multiball layer (v2)". The other cells are unchanged.
- Leave the frontmatter and every heading unchanged. The orchestrator appends a Quick Tasks row afterwards.

package.json: set `"name": "flippers"` and `"description": "Browser-based pinball with an original space-themed table, procedural rendering, and synthesized audio."`.

package-lock.json: change ONLY the two top-level name values, the root `"name"` and `packages[""].name`, to `"flippers"`.

index.html: set the title element text to `Physics Sandbox — Flippers`.

Commit: stage exactly these 8 paths and commit with "docs(quick-261119-sbr): re-scope project identity to an original table (Flippers)". STATE.md IS committed here on purpose, even though the default quick rule says not to commit it: the content change is the deliverable, and an uncommitted edit would be lost if this runs in an isolated worktree.
  </action>
  <verify>
    <automated>test "$(grep -hiE 'cadet|3d pinball|windows xp|\bxp\b|hyperspace|fleet admiral|full tilt|maxis|cinematronics|wormhole|gravity well|decompil|tplunger|faithful|the original' CLAUDE.md .planning/PROJECT.md .planning/REQUIREMENTS.md .planning/ROADMAP.md .planning/STATE.md package.json package-lock.json index.html | wc -l)" -eq 0  # [HEAD=39 EXPECT==0 @af912be]</automated>
    <automated>test "$(node -p "const p=require('./package.json'),l=require('./package-lock.json');[p.name,l.name,l.packages[''].name].filter(n=>n==='flippers').length")" -eq 3  # [HEAD=0 EXPECT==3 @af912be]</automated>
    <automated>test "$(node -p "require('./package.json').description==='Browser-based pinball with an original space-themed table, procedural rendering, and synthesized audio.'?1:0")" -eq 1  # [HEAD=0 EXPECT==1 @af912be]</automated>
    <automated>L=$(git diff af912be --numstat -- package-lock.json) && test "$(printf '%s\n' "$L" | awk '{s+=$1+$2} END{print s+0}')" -eq 4  # lockfile diff = exactly 2 lines out, 2 in [HEAD=0 EXPECT==4 @af912be]</automated>
    <automated>npm run build && test "$(grep -cF 'Physics Sandbox — Flippers' dist/index.html)" -ge 1  # [HEAD=0 EXPECT>=1 @af912be]</automated>
    <automated>test "$(cat .planning/PROJECT.md CLAUDE.md .planning/REQUIREMENTS.md .planning/ROADMAP.md | grep -cE '^(# |\*\*|# Requirements: |# Roadmap: )Flippers — Browser Pinball')" -ge 4  # [HEAD=0 EXPECT>=4 @af912be]</automated>
    <automated>test "$(grep -lF 'feels satisfying, weighty, and true to real pinball' CLAUDE.md .planning/PROJECT.md .planning/REQUIREMENTS.md .planning/STATE.md | wc -l)" -eq 4  # files carrying new core value [HEAD=0 EXPECT==4 @af912be]</automated>
    <automated>test "$(grep -lF 'Original table design built on standard pinball conventions; authentic-feeling physics; clean procedural visual style.' CLAUDE.md .planning/PROJECT.md | wc -l)" -eq 2  # files carrying new fidelity line [HEAD=0 EXPECT==2 @af912be]</automated>
    <automated>test "$(grep -cF '| Original table design (not a recreation of any existing table) |' .planning/PROJECT.md)" -ge 1  # [HEAD=0 EXPECT>=1 @af912be]</automated>
    <automated>test "$(grep -cE '^- \*\*(LOCK-01|SCOOP-01)\*\*' .planning/REQUIREMENTS.md)" -ge 2  # [HEAD=0 EXPECT>=2 @af912be]</automated>
    <automated>test "$(grep -cE '^- \*\*(RANK-01|MISS-01)\*\*' .planning/REQUIREMENTS.md)" -ge 2  # [HEAD=2 EXPECT>=2 @af912be GUARD MUTATION: deleting the RANK-01 or MISS-01 line]</automated>
    <automated>test "$(cat .planning/REQUIREMENTS.md .planning/ROADMAP.md .planning/STATE.md | grep -cE 'HYP-01|WORM-01')" -eq 0  # [HEAD=2 EXPECT==0 @af912be]</automated>
    <automated>R=$(git show af912be:.planning/ROADMAP.md) && test "$(diff <(printf '%s\n' "$R" | tr -d '\r' | grep -E '^\s*- \[[ x]\]|^\| [0-9]|^\*\*Plans\*\*' | sed -E 's/^(\s*- \[[ x]\]).*/\1/') <(tr -d '\r' < .planning/ROADMAP.md | grep -E '^\s*- \[[ x]\]|^\| [0-9]|^\*\*Plans\*\*' | sed -E 's/^(\s*- \[[ x]\]).*/\1/') | wc -l)" -eq 0  # checkbox states + progress rows + Plans lines vs base [HEAD=0 EXPECT==0 @af912be GUARD MUTATION: toggling any ROADMAP checkbox or editing a progress/Plans line]</automated>
    <automated>S=$(git show af912be:.planning/STATE.md) && C=$(git show af912be:CLAUDE.md) && test "$( { diff <(printf '%s\n' "$S" | tr -d '\r' | grep -E '^#{1,3} ') <(tr -d '\r' < .planning/STATE.md | grep -E '^#{1,3} '); diff <(printf '%s\n' "$C" | tr -d '\r' | sed -n '/GSD:project-end/,$p') <(tr -d '\r' < CLAUDE.md | sed -n '/GSD:project-end/,$p'); } | wc -l)" -eq 0  # [HEAD=0 EXPECT==0 @af912be GUARD MUTATION: editing a STATE.md heading or any CLAUDE.md line after GSD:project-end]</automated>
    <automated>A=$(git diff --cached --name-only -- .planning/config.json) && B=$(git log af912be..HEAD --name-only --format= -- .planning/config.json) && P=$(git diff --name-only af912be -- '.planning/phases/03-table-plunger-event-bus/03-0[1-5]-PLAN.md') && test -z "$A$B$P"  # [HEAD=0 EXPECT==0 @af912be GUARD MUTATION: staging config.json or editing a 03-0N-PLAN.md]</automated>
  </verify>
  <done>All eight files carry the Flippers identity and original-table framing. The identity grep returns 0 lines. Package and lockfile names are `flippers`. The production build emits a page titled "Physics Sandbox — Flippers". The core value and fidelity text are identical across the docs. v2 has RANK-01, MISS-01, LOCK-01 and SCOOP-01. ROADMAP checkboxes, progress table and Plans lines, the STATE headings, and CLAUDE.md outside the Project block are byte-identical to af912be. config.json and the 03-0N plans are untouched. One commit landed.</done>
</task>

<task type="auto">
  <name>Task 2: Phase-3 decision docs re-framed + superseded notes on historical research</name>
  <files>.planning/phases/03-table-plunger-event-bus/03-CONTEXT.md, .planning/phases/03-table-plunger-event-bus/03-RESEARCH.md, .planning/phases/03-table-plunger-event-bus/03-VALIDATION.md, .planning/phases/03-table-plunger-event-bus/03-PATTERNS.md, .planning/research/ARCHITECTURE.md, .planning/research/FEATURES.md, .planning/research/PITFALLS.md, .planning/research/SUMMARY.md</files>
  <action>
These docs are what `/gsd-plan-phase 3` regenerates the 03-0N plans from, so they must state the original-table scope. Implements L-02, L-03 and L-04 and keeps L-08: do NOT open or edit any `03-0N-PLAN.md`; `03-DISCUSSION-LOG.md` is a historical log, so leave it too. First list live scope with the task gate grep.

03-CONTEXT.md. Keep every decision ID D-01..D-12 and the section structure. Change content only:
- Phase Boundary (L9-16): rewrite the opening as "An original space-themed playfield, a hold-to-charge plunger that launches the ball up the chute, and a typed one-way collision-event bus — all sourced from **one `table/spec`** so the collision model and the render model cannot drift apart (SC#4). Procedural geometry only; no layout, names, or assets copied from any existing table. A ball can be charged and launched into a playfield built from standard pinball elements (right-side launch chute, upper bumper cluster, ramps/guide walls, lanes/rollovers, outer walls, center-bottom drain funnel, two lower flippers in an inverted-V), positioned for good ball flow, and every ball-vs-element contact emits a typed event on a bus that is wired and ready for downstream consumers."
- In scope (L19): "recreating the <reference> layout" becomes "authoring the original layout".
- Out of scope (L30): replace the deferred upper-left-flipper sentence with "No upper third flipper in v1 (listed under Deferred Ideas as an optional later original-design idea)."
- D-01 (L47): "per-const reference-anchored" becomes "per-const documented". Leave mentions that describe `constants.ts` itself as reference-anchored (L202, L224, L273) alone, because those are physics provenance.
- Section heading (L62): "### Table layout (TBL-01, SC#1) — **Original design**".
- D-03 (L63-75), new content: "**Original layout, designed in 03-01.** The table is our own design, composed from standard pinball elements: outer walls, a right-side launch chute, an upper bumper cluster, lanes/rollovers, a few guide walls/ramps, a center-bottom drain funnel, and two lower flippers in an inverted-V. Element positions are chosen for good ball flow (a clear launch path into the upper field, the bumper cluster feeding the lanes, return paths toward the flippers) and expressed as normalized layout points in the spec. The connecting walls, ramps, and lanes are hand-built clean-room polylines between them. There is no external layout source of any kind. The spec fixes the layout so Phase-4 rules and Phase-5 rendering build on stable element ids and positions."
- D-04 (L76-85): "(the original's flipper-to-width proportion)" becomes "(a conventional single-level-table flipper-to-width proportion)". "aspect taken from the reference image" becomes "portrait aspect chosen for good ball flow". Everything else in D-04 is unchanged.
- D-05 (L86-91): replace the third-flipper sentence with "**No upper third flipper in v1** — `buildFlipper` is already per-id additive, so an extra flipper stays cheap to add later if an original-design reason emerges."
- D-07 (L100-108), new content, per L-04: "**Impulse-on-release charge model — our design choice.** While Space is held, a scalar charge accumulates per fixed step up to a cap; on release a proportional impulse is applied to the ball along the chute axis. Chosen because it is deterministic and replayable, makes charge→power directly readable (good for the Phase-6 skill shot), and avoids a physical spring plunger (prismatic body), which would reintroduce the fast-thin-moving-body tunneling class Phases 1–2 spent their budget solving. The ball already has `setBullet` CCD against the static chute, so launching it **up** a static chute needs **no** new anti-tunnel machinery."
- Claude's Discretion (L159-161): "Exact layout points/proportions, table width/height within the derived ~3–4 m × ~5–7 m ballpark, and per-element polyline vertices — chosen for good ball flow and tuned by eye in the debug render (D-03/D-04)."
- Canonical refs:
  - L186-187: TBL-01 parenthetical becomes "(original layout: chute, upper bumper cluster, ramps/guide walls, lanes, outer walls, drain funnel)".
  - L188-193: rewrite as "`.planning/PROJECT.md` § Context / Constraints — "Original table design built on standard pinball conventions; authentic-feeling physics; clean procedural visual style"; procedural-only, nothing copied from any existing table. `.planning/STATE.md` § Blockers/Concerns — the Phase-3 layout is an original design authored in 03-01 (D-03)."
  - L240-252: retitle the section "### External references (APIs and patterns)". Delete the decompilation bullet and the public-layout-reference bullet entirely. Keep the Planck.js docs bullet, but drop "(noted as the rejected spring path — Box2D 2.4 has no native linear spring)" only if it cites the reference game; otherwise keep it. Keep the Event Queue bullet.
- Specifics (L302-306), new content: "Simplicity wins here: the scalar-impulse plunger and hand-built clean-room geometry are both simpler than the "physical" alternatives (a prismatic spring body; imported coordinate data), and both lean on Planck built-ins. That is a deliberate design choice, not a shortcut."
- Deferred Ideas:
  - L321-323: "**Upper third flipper** — not in v1; an optional later original-design idea only (`buildFlipper` is per-id additive, D-05)."
  - L333-334: replace "less faithful and" with "it adds no feel benefit over the impulse model and".
- Footer: add a line "*Re-scoped: 2026-11-19 — original table (quick task 261119-sbr)*".

03-RESEARCH.md. Keep every Planck technical finding: impulse units, ball mass, sensors versus post-solve, chain/edge, the router seam, and test re-anchoring. Re-word only the framing:
- L5: drop the trailing clause citing the reference-game source. It becomes "(all decisive facts verified against the installed `planck@1.5.0` types and the in-repo code)".
- L9: rewrite the "two most consequential ones" clause as "an original clean-room layout (D-03) and a scalar-impulse plunger (D-07) — both lean on Planck built-ins and add no new tunneling surface". Delete the binary-data-file and plunger-source evidence clause. Keep the final sentence about answering how, not whether.
- L55 and L271: delete the "less faithful AND" wording. The rest of each table cell is unchanged.
- L191: "**What:** Hold-to-charge scalar plunger (our design, D-07) — accumulate a scalar charge per fixed step while Space is held, cap it at a max, apply a proportional impulse on release." Delete the CITED clause and the source-mechanics sentence.
- L197: shorten the trailing code comment to "// normalized cap".
- L210: begin with "**Determinism note:** optional launch jitter breaks replay if backed by `Math.random`." Keep the rest of the note.
- L276: "**Key insight:** simplicity wins here — the scalar plunger and hand-built geometry are both simpler than the "physical" alternatives, so leaning on Planck's built-ins (Chain, applyLinearImpulse, existing CCD) is less code and fewer failure modes."
- L317: replace the ball-proportion comparison sentence with "Note: the ball reads proportionally large relative to table width (~1/16) — an accepted D-04 tradeoff, since re-tuning feel is the larger risk."
- Assumptions:
  - A1 (L390): "Confirm final W/H by eye against reference" becomes "Confirm final W/H by eye in the debug render".
  - A4 (L393): "| A4 | An original layout designed in 03-01 for good ball flow satisfies SC#1 | D-03 | Low — positions are Claude's discretion, judged by eye in the debug render for flow and readability. |".
  - L397: "**A4 needs no separate confirmation** — D-03 locks an original layout judged by eye for flow."
- L402: "(right, per the original)" becomes "(right side, per D-03)".
- Sources: delete the L505 plunger-source bullet and the L508 layout-diagram bullet.
- Confidence:
  - L519: "- Plunger model: HIGH — scalar-charge → impulse is our design choice (D-07); Planck impulse units confirmed from types."
  - L520: "- Table layout: MEDIUM — original design (D-03); positions are by-eye discretion, not a verifiable constant."
  - L524: "only the table anchors are judgment-based" becomes "only the table layout positions are judgment-based".

03-VALIDATION.md, Manual-Only row (L81): "| Layout reads clearly and plays with good flow | TBL-01 / SC#1 | Original-layout flow and readability is a by-eye judgment (D-03) — no verifiable constant | 03-05 Task 3 checkpoint: `npm run dev`, confirm chute/bumper cluster/lanes/walls/drain funnel + inverted-V flippers read clearly and the ball flows well by eye |".

03-PATTERNS.md: this is a conditional one-line edit, needed because the regenerated 03-01 plan reads it. On L34, in the "Copy this exact framing" list, find the item that asks the spec to anchor to a behavior reference (it sits between the "single source of truth" item and the HMR item). Replace that one item with "documented per-const rationale" and change nothing else. Leave the "Reference-anchored HMR constants" heading alone, because it describes constants.ts.

Research docs, ARCHITECTURE.md, FEATURES.md, PITFALLS.md and SUMMARY.md: do NOT rewrite them. In each, insert exactly one blockquote line followed by one blank line, directly below the H1 title (line 1). The blockquote reads, verbatim: "> **Superseded framing (2026-11-19):** the project is now an original table. Space Cadet-specific layout, names, and mechanics below are background only, not targets." Leave STACK.md untouched.

Commit: stage exactly these 8 paths and commit with "docs(quick-261119-sbr): re-frame phase-3 decisions for an original table; mark research framing superseded".
  </action>
  <verify>
    <automated>test "$(grep -hiE 'cadet|3d pinball|windows xp|\bxp\b|hyperspace|fleet admiral|full tilt|maxis|cinematronics|wormhole|gravity well|decompil|tplunger|maxpullback|randfloat|k4zmu2a|faithful|the original|original relative|strategywiki|gamefaqs|pinball\.dat|anchored-approximate|reference image|transcri' .planning/phases/03-table-plunger-event-bus/03-CONTEXT.md .planning/phases/03-table-plunger-event-bus/03-RESEARCH.md .planning/phases/03-table-plunger-event-bus/03-VALIDATION.md | wc -l)" -eq 0  # [HEAD=60 EXPECT==0 @af912be]</automated>
    <automated>test "$(grep -c 'Original layout' .planning/phases/03-table-plunger-event-bus/03-CONTEXT.md)" -ge 1  # [HEAD=0 EXPECT>=1 @af912be]</automated>
    <automated>test "$(grep -c 'Layout reads clearly and plays with good flow' .planning/phases/03-table-plunger-event-bus/03-VALIDATION.md)" -ge 1  # [HEAD=0 EXPECT>=1 @af912be]</automated>
    <automated>test "$(grep -ci 'behavior-only anchoring' .planning/phases/03-table-plunger-event-bus/03-PATTERNS.md)" -eq 0  # [HEAD=1 EXPECT==0 @af912be]</automated>
    <automated>test "$(grep -cE '^- \*\*D-(0[1-9]|1[0-2]):\*\*' .planning/phases/03-table-plunger-event-bus/03-CONTEXT.md)" -ge 12  # [HEAD=12 EXPECT>=12 @af912be GUARD MUTATION: deleting or renumbering a D-NN decision]</automated>
    <automated>test "$(grep -cE 'applyLinearImpulse|kg·m/s|getWorldCenter' .planning/phases/03-table-plunger-event-bus/03-RESEARCH.md)" -ge 13  # tolerance 2 for re-worded framing lines [HEAD=15 EXPECT>=13 @af912be GUARD MUTATION: deleting the Pattern-3 Planck impulse/units section]</automated>
    <automated>test "$(for f in ARCHITECTURE FEATURES PITFALLS SUMMARY; do head -4 .planning/research/$f.md; done | grep -c 'Superseded framing (2026-11-19)')" -ge 4  # note within first 4 lines of each doc [HEAD=0 EXPECT>=4 @af912be]</automated>
    <automated>N=$(git diff af912be --numstat -- .planning/research/) && test "$(printf '%s\n' "$N" | awk 'NF && ($2!=0 || $1>2 || $3 ~ /STACK/) {b++} END{print b+0}')" -eq 0  # research bodies: insert-only, <=2 lines/file, STACK.md untouched [HEAD=0 EXPECT==0 @af912be GUARD MUTATION: rewriting a research-doc body line or touching STACK.md]</automated>
    <automated>A=$(git diff --name-only af912be -- '.planning/phases/03-table-plunger-event-bus/03-0[1-5]-PLAN.md' .planning/phases/03-table-plunger-event-bus/03-DISCUSSION-LOG.md) && B=$(git log af912be..HEAD --name-only --format= -- .planning/config.json) && test -z "$A$B"  # [HEAD=0 EXPECT==0 @af912be GUARD MUTATION: editing a 03-0N-PLAN.md / the discussion log, or committing config.json]</automated>
  </verify>
  <done>03-CONTEXT, 03-RESEARCH and 03-VALIDATION frame the table as an original layout designed in 03-01 (D-03), with no upper third flipper in v1 (D-05) and the plunger as our design choice (D-07). D-01..D-12 are intact and the Planck findings preserved. The framing grep returns 0 lines. 03-PATTERNS no longer asks the spec for reference anchoring. The four research docs carry the superseded note under the H1 with no other change, and STACK.md is untouched. The 03-0N plans, the discussion log and config.json are untouched. One commit landed.</done>
</task>

<task type="auto">
  <name>Task 3: Neutral src comments (zero logic change) + full-tree re-scope gate</name>
  <files>src/physics/planck-world.ts, src/physics/types.ts, src/input/flipper-input.ts, src/sandbox/flipper-e2e.test.ts</files>
  <action>
Change comment text only, with zero changes to code tokens. Do not touch `src/physics/constants.ts`: its provenance comments are generic physics facts and are explicitly kept. First list live scope with `grep -rniE 'cadet|3d pinball|windows xp' src | grep -v '^src/physics/constants.ts'`.
- src/physics/planck-world.ts ~L64: the bounded-play-box comment ends "Test scaffold only — the real table geometry is Phase 3." Remove the reference-game name before "table".
- src/physics/planck-world.ts ~L80: "NOT real <reference> table layout" becomes "NOT real table layout". Keep the rest of the comment block.
- src/physics/types.ts L2: " * Engine-agnostic physics contract for Flippers."
- src/input/flipper-input.ts ~L61-62: replace the sentence about keeping the reference game's keys "for fidelity" with "The classic `Z` + `/` bindings are kept; the far-edge Shift keys support the constant both-flipper cradle." Keep the line wrapping inside the JSDoc block.
- src/sandbox/flipper-e2e.test.ts ~L110: "/** The two controllable sides, each with its classic primary key. */".

Then run typecheck, lint and the full test suite, plus the whole-tree gate below. The gate excludes these paths, which are allowed to keep historical mentions:
- `.planning/research/` (bodies carry the superseded note)
- `src/physics/constants.ts`
- the five untouched `03-0N-PLAN.md` files
- `03-DISCUSSION-LOG.md`
- prior `.planning/phases/01-*` and `02-*` artifacts
- `.planning/quick/` (this plan and its summary necessarily name the old framing)

Commit: stage exactly these 4 paths and commit with "chore(quick-261119-sbr): neutralize reference-game naming in src comments".
  </action>
  <verify>
    <automated>test "$(grep -rniE 'cadet|3d pinball|windows xp' src | grep -v '^src/physics/constants.ts' | wc -l)" -eq 0  # [HEAD=5 EXPECT==0 @af912be]</automated>
    <automated>D=$(git diff af912be -- src) && test "$(printf '%s\n' "$D" | grep -E '^[+-][^+-]' | grep -vcE '^[+-]\s*(//|\*|/\*\*)')" -eq 0  # non-comment changed src lines [HEAD=0 EXPECT==0 @af912be GUARD MUTATION: changing any non-comment src line]</automated>
    <automated>D=$(git diff af912be -- src) && test "$(printf '%s\n' "$D" | grep -cE '^\+\s*(//|\*|/\*\*)')" -ge 5  # re-worded comment lines [HEAD=0 EXPECT>=5 @af912be]</automated>
    <automated>C=$(git diff --name-only af912be -- src/physics/constants.ts) && test -z "$C"  # [HEAD=0 EXPECT==0 @af912be GUARD MUTATION: editing constants.ts]</automated>
    <automated>npm run typecheck && npm run lint && npm test</automated>
    <automated>test "$(grep -rliE 'space cadet|spacecadet|3d pinball|windows xp|hyperspace|fleet admiral' .planning CLAUDE.md package.json index.html src | grep -vE '^\.planning/research/|^src/physics/constants\.ts$|^\.planning/phases/03-table-plunger-event-bus/03-0[1-5]-PLAN\.md$|^\.planning/phases/03-table-plunger-event-bus/03-DISCUSSION-LOG\.md$|^\.planning/phases/0[12]-|^\.planning/quick/' | wc -l)" -eq 0  # whole-tree offending files [HEAD=14 EXPECT==0 @af912be]</automated>
  </verify>
  <done>No src file except constants.ts names the reference game. The src diff against af912be is comment-only, at least 5 comment lines changed, and constants.ts is byte-identical. Typecheck, lint and all 71 tests pass. The whole-tree re-scope grep returns no file outside the allowed historical set. One commit landed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| working tree → git history | The executor stages and commits files in a checkout that also holds an unrelated, uncommitted user change in `.planning/config.json`. |
| planning docs → `/gsd-plan-phase 3` | The re-worded 03-CONTEXT/RESEARCH/PATTERNS are the input the next planner regenerates the 03-0N plans from. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-sbr-01 | Tampering | `.planning/config.json` (user's uncommitted change) | high | mitigate | Explicit-path `git add` only. A `git diff --cached --name-only` check runs before each commit, and the Task 1/2 gates assert config.json is neither staged nor in any commit since af912be. |
| T-sbr-02 | Tampering | src logic accidentally altered while rewording comments | medium | mitigate | Task 3 gate: the src diff against af912be must contain only comment lines (`//`, `*`, `/**`). constants.ts must be byte-identical. Typecheck, lint and 71/71 tests must stay green. |
| T-sbr-03 | Tampering | ROADMAP progress state / checkbox drift | medium | mitigate | Task 1 invariant: the checkbox sequence, the Progress-table rows and the `**Plans**:` lines are diffed against af912be and must be identical. |
| T-sbr-04 | Tampering | 03-0N-PLAN.md edited before regeneration | medium | mitigate | Task 1/2 gate: `git diff --quiet af912be` on the five plan files and on the discussion log. |
| T-sbr-05 | Repudiation | Stale reference-table framing survives in docs that feed the Phase-3 regeneration | medium | mitigate | Task 2 framing grep over CONTEXT/RESEARCH/VALIDATION must reach 0 lines (HEAD=60), plus the Task 3 whole-tree gate. |
| T-sbr-SC | Tampering | npm/pip/cargo installs | low | accept | No package installs in this task. `npm install` is forbidden. The lockfile diff is gated to exactly the 2 name lines (4 diff lines), so the dependency graph cannot change. |
</threat_model>

<verification>
Run from the repo root after Task 3:
- All three tasks' `<automated>` gates pass.
- `git log af912be..HEAD --oneline` shows the three task commits, and `git show --stat` of each lists only that task's `<files>`.
- `git status --porcelain .planning/config.json` still shows the user's ` M`. It is skipped in an isolated worktree, where the file is unmodified by design.
- By-eye skim of `.planning/PROJECT.md` and `.planning/phases/03-table-plunger-event-bus/03-CONTEXT.md` D-03/D-05/D-07: the result reads as a coherent original-table brief, not a find-and-replace.
</verification>

<success_criteria>
- The project is named "Flippers — Browser Pinball" / `flippers` in every live doc, the manifest, the lockfile and the page title.
- The core value, fidelity constraint, TBL-01, ROADMAP Phase-3 goal and SC#1, and Phase-4 goal carry the original-table wording. The v2 list is original and generic, with RANK-01, MISS-01, LOCK-01 and SCOOP-01.
- 03-CONTEXT D-03/D-05/D-07 and 03-RESEARCH state an original layout and an own-design plunger, with D-IDs stable and the Planck findings intact. The research docs are marked superseded.
- Zero logic change: typecheck, lint and 71/71 tests are green.
- Untouched: the 03-0N plans, config.json, ROADMAP progress state, CLAUDE.md non-Project sections and constants.ts.
</success_criteria>

<output>
Create `.planning/quick/261119-sbr-re-scope-project-from-a-space-cadet-recr/261119-sbr-SUMMARY.md` when done (frontmatter `status: complete`). Note in it: the WORM-01 → SCOOP-01 and HYP-01 → LOCK-01 renames; the STATE.md commit deviation, and why; and that the orchestrator's Quick Tasks row should describe this task neutrally (for example "Re-scope to an original table (Flippers)") so STATE.md does not re-gain the old brand name.
</output>
