# Phase 3: Table, Plunger & Event Bus - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

The real Space Cadet playfield geometry, a hold-to-charge plunger that launches the
ball up the chute, and a typed one-way collision-event bus — all sourced from **one
`table/spec`** so the collision model and the render model cannot drift apart (SC#4).
Behavior/coordinates only, no ripped assets. A ball can be charged and launched into
a playfield that recreates the original layout (launch chute, upper bumper cluster,
ramps, lanes, outer walls, center-bottom drain funnel) in its original relative
positions, and every ball-vs-element contact emits a typed event on a bus that is
wired and ready for downstream consumers.

**In scope:** the single engine-agnostic `table/spec` data module + its curve
resolver; recreating the Space Cadet layout as clean-room chain/edge/circle geometry
driven by that spec; **real** flipper placement on the playfield (replacing Phase 2's
throwaway two-flipper rig); the hold-to-charge → proportional-impulse plunger + its
input/controller + a debug charge visualization; growing the existing pooled
`drainEvents()` into a pull-then-dispatch event bus with element identity + one demo
consumer. Elements are **physical colliders only** this phase.

**Out of scope (own later phases):** reactive behavior — bumper kick energy,
slingshot kicks, lane/rollover lights, scoring, the 3-ball loop, nudge/tilt (Phase 4,
which reads this bus); the shipping procedural Canvas renderer + synthesized
per-element audio (Phase 5, which draws from this spec); juice/polish incl. the
skill-shot keyed to plunger charge (Phase 6). The original's upper-left third flipper
is deferred to Phase 4. Keybind/settings UI is out of scope for the whole project.

</domain>

<decisions>
## Implementation Decisions

### Table/spec — the single source of truth (SC#4, TBL-01) — **Typed data module**
- **D-01:** **One typed data module `src/table/spec.ts`** (engine-agnostic — no
  `planck` import) exporting an id-keyed set of element descriptors: outer walls as
  `Vec2` polylines, arcs as center/radius/angle descriptors, bumper circles, sensor
  lanes/rollovers, the launch chute, the drain funnel, and flipper mounts. A **shared
  resolver** (`toSegments`/`resolve`) tessellates curves to vertex lists **once**.
  `planck-world.ts` consumes the spec to build chain/edge/circle fixtures and stamp
  each body's `userData {kind, id}`; the debug renderer **and** the swept-containment
  harness read the **same resolved list**. This is the geometric sibling of
  `constants.ts` — plain exported, HMR-tunable, per-const reference-anchored, and able
  to `import { BALL_RADIUS_M }` to size drains/lanes and to mirror the right flipper
  cluster from the left (the way `IN_PLANE_GRAVITY` derives from `INCLINE_DEG`). It is
  the **only** option that makes SC#4's "what's hit == what's drawn" *structural*
  (Planck chain/edge walls and Canvas polylines are both vertex lists from the one
  resolve), and it **deletes today's latent drift**: `buildBoundary()` currently
  builds the Planck `Chain` from a `corners` array **and separately** returns a
  hand-authored `segment()` list — two copies that can already diverge.
- **D-02:** `getBoundarySegments()` **generalizes to an id-keyed element list**
  (`getElements()`) that debug-draw and containment both read. `WIDTH_M`/`HEIGHT_M`
  and the flipper pivots that live inside `planck-world.ts` today **move into the
  spec**. Optional `wall()`/`arc()`/`bumper()` **factory helpers** may be layered on
  top (D-01) — but only as authoring sugar that emits the same plain descriptors;
  adopt only if hand-written arcs/clusters get verbose. The contract stays *data*.

### Table fidelity & transcription (TBL-01, SC#1) — **Hybrid anchored-approximate**
- **D-03:** **Anchored-approximate, clean-room.** DECISIVE research finding: the
  original's collision geometry is **not in the decompilation source** — every
  collider is loaded at runtime from *attribute-type-600* float arrays inside the
  copyrighted binary `CADET.DAT`/`PINBALL.DAT`, keyed by group index and fed through
  `TEdgeSegment::install_wall()` with a `CollisionCompOffset`. "Exact transcription"
  therefore means reverse-parsing Microsoft's binary coordinate data — both off-brief
  ("faithful, not pixel-perfect") **and** the exact MEDIUM-confidence risk STATE.md
  flagged. Instead: measure a handful of **normalized anchors** (launch-chute mouth,
  upper bumper-cluster centers, the two lower flipper mounts, center-bottom drain
  funnel, outer bounding box) as **fractions** off the public reference image / table
  diagram, then hand-build the connecting walls, ramps, and lanes as clean-room
  polylines between them. Clean-room, no binary parsing, and the anchored positions
  keep the layout identity Phase 4 rules and Phase 5 rendering depend on from drifting.
- **D-04:** **Table scale derived from the already-proven Phase-2 flipper/ball
  constants**, NOT from real-world pinball dimensions. Size table width so
  `FLIPPER_LENGTH_M = 0.5` stays ~1/6–1/7 of width (the original's flipper-to-width
  proportion) → roughly **~3–4 m wide × ~5–7 m tall**, portrait, aspect taken from the
  reference image; every feature lands inside Planck's well-conditioned ~0.1–10 m band
  and **the Phase-2 feel constants stay untouched** (zero re-tuning risk).
  `PIXELS_PER_METER` remains a **render-only** mapping (the Phase-5 renderer scales
  physics→viewport to fit). Keep the codebase's existing **y-down, origin top-left,
  down-slope = +y** convention; the 28° incline is already modeled as reduced in-plane
  gravity, so Phase 3 needs **no** separate tilt-axis geometry (nudge/tilt is Phase 4).
- **D-05:** **Real flipper placement is this phase.** Replace the throwaway symmetric
  `FLIPPER_PIVOT_L/R` rig (Phase 2 D-11) with two lower flippers positioned **from the
  spec** at the drain funnel in the classic inverted-V (drain gap between the tips),
  reusing the proven feel constants **unchanged**. The original's **upper-left third
  flipper is DEFERRED to Phase 4** — `buildFlipper` is already per-id additive, so it
  is cheap to add later; deferring keeps Phase 3 scope tight.
- **D-06:** **Phase 3/Phase 4 boundary = physical colliders only.** Phase 3 ships the
  outer walls, chute, ramps/lanes, and drain funnel as static chain/edge geometry,
  **plus** bumpers/targets/slingshots as **inert static circle colliders or sensors**,
  each tagged with a stable `id` + semantic `kind`. They already emit typed events
  through the bus but carry **no** kick energy and **no** scoring. All reactive
  bounce/kick/scoring/3-ball/nudge/tilt behavior stays in Phase 4.

### Plunger (LNCH-01, LNCH-02) — **Impulse-on-release**
- **D-07:** **Impulse-on-release charge model.** DECISIVE research finding: the
  original `TPlunger` is **not a spring simulation** — it accumulates a scalar `Boost`
  over time while held, caps it at `MaxPullback`, and on release applies a direct
  **proportional impulse** (≈ `RandFloat()*Boost*0.1 + Boost`) as a velocity modifier.
  So a scalar-charge → `applyLinearImpulse` model **is** the faithful behavior; the
  "physical spring" (prismatic body) is paradoxically the *least* faithful **and**
  reintroduces the flipper-class fast-thin-moving-body tunneling problem Phases 1–2
  spent their budget solving. The ball already has `setBullet` CCD against the static
  chute, so launching it **up** a static chute needs **no** new anti-tunnel machinery.
- **D-08:** A **`PlungerController` above the `PhysicsWorld` interface** owns the
  charge, mirroring `FlipperInput → FlipperController → thin-hook` 1:1. **`Space`**
  (reserved in Phase 2 D-09) latches press/release edges that are drained at the top
  of each fixed 120 Hz step via the existing `onFixedStep` hook → deterministic and
  replayable. Charge rate, min/max impulse magnitude, and the chute axis are
  **HMR-tunable constants in `constants.ts`**.
- **D-09:** A **new thin, engine-agnostic hook `applyImpulse(ballId, ix, iy)`** on the
  `PhysicsWorld` interface (the adapter maps it to `body.applyLinearImpulse`), grain
  mirroring `setFlipperMotor`. **Keep it generic, not plunger-specific** — this is the
  same impulse primitive **Phase 4's nudge reuses**, so it pays for itself twice.
- **D-10:** **LNCH-02 charge visualization = read-only normalized charge state**
  exposed for the throwaway debug renderer (a pullback and/or charge meter), mirroring
  the `getFlippers()` read-only-accessor pattern. Phase 3 only needs the debug meter;
  Phase 5 turns it into the real procedural render — same discipline Phases 1–2 used
  with their throwaway debug-draw.

### Collision-event bus (SC#4) — **Pull-then-dispatch**
- **D-11:** **Pull-then-dispatch `CollisionRouter`.** Keep the existing zero-alloc
  pooled `drainEvents()` as the **sole** source; add a **thin app-level
  `CollisionRouter`** that drains **once per fixed step** and fans the reused view out
  to N registered listeners **in fixed registration order**. This preserves every
  hard-won property — zero per-frame allocation, strictly one-way (drain never pushes
  back), and determinism (one batch per simulated step → replay-stable) — while adding
  the only missing thing: multiple independent consumers off the same stream.
  `planck-world.ts`, the `PhysicsWorld` interface, and the headless soak are
  **untouched** (engine isolation + harness intact). Wire it at the **fixed-step seam**
  (`onFixedStep` / post-`world.step()`), NOT the rAF frame, so consumers see exactly
  one deterministic batch per step. Phase 3 satisfies "bus wired + one demo consumer"
  with a **single stub listener** (e.g. logs `elementKind` + `point`, or flashes) —
  **no** Phase 4 scoring rules pulled forward.
- **D-12:** **Event-model evolution — orthogonal element identity, not a pair-enum.**
  Broaden `BodyTag.kind` from `ball|wall|flipper` into a **spec-sourced `ElementKind`**
  taxonomy (`bumper | slingshot | lane | rollover | drain | chute | wall | flipper`)
  whose ids + kinds **originate from the single `table/spec`** (satisfying SC#4's "one
  source, can't drift"). Add to `CollisionEvent`: **`elementKind: ElementKind`** +
  **`elementId: number`**, **normalized** so the event always names the ball side and
  the element side unambiguously (this also fixes today's latent `aId`/`bId` order
  ambiguity). Keep an explicit **`ballId: BallId`** (N-ball-ready). **Do NOT** explode
  `CollisionEventType` into a combinatorial per-pair enum (`ball-bumper`, `ball-lane`,
  …) — an orthogonal `elementKind`/`elementId` pair keeps the coarse `type` optional
  and lets Phase 4/5 switch on kind + identity without touching the transport. Records
  stay pooled + mutated in place → **zero new per-frame allocation**.

### Cross-cutting — the four decisions interlock
- The spec (D-01) is the **single origin** for element ids → those ids ride the events
  (D-12) → the router (D-11) fans them to Phase 4 rules and Phase 5 render+audio. The
  plunger's generic `applyImpulse` hook (D-09) is the **same primitive** Phase 4 nudge
  uses. Build the spec first; the event model and real geometry hang off it.

### Claude's Discretion
- Exact anchor coordinates/proportions, table width/height within the derived
  ~3–4 m × ~5–7 m ballpark, and per-element polyline vertices — tuned by eye against
  the public reference image (D-03/D-04).
- The spec's exact descriptor TypeScript types, the resolver/tessellation API, and the
  file split (`spec.ts` vs a separate `resolve.ts`) — provided it stays engine-agnostic,
  HMR-tunable, and drives **both** fixtures and draw from **one** resolve (D-01).
- Plunger charge-curve values (rate, min/max impulse magnitude), the chute-axis vector,
  and the `PlungerController` FSM/latch details — provided the observable
  hold-to-charge → proportional-launch behavior and its determinism hold (D-07/D-08).
- The `CollisionRouter` API (register/listener signature), the demo stub consumer's
  behavior, and the exact `ElementKind` member set — provided fixed-order dispatch,
  zero-alloc, and spec-sourced ids hold (D-11/D-12).
- Whether the optional factory-DSL sugar (D-01) is introduced now or deferred; and
  module/file naming.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (internal)
- `.planning/ROADMAP.md` § "Phase 3: Table, Plunger & Event Bus" — goal + the 4
  success criteria that define done (layout recreated; hold-to-charge proportional
  launch; charge visualized; typed one-way bus from one `table/spec`).
- `.planning/REQUIREMENTS.md` — **LNCH-01** (hold-to-charge plunger, proportional
  impulse up the chute), **LNCH-02** (charge visualized), **TBL-01** (Space Cadet
  layout: chute, upper bumper cluster, ramps, lanes, outer walls, drain funnel).
- `.planning/PROJECT.md` § Context / Constraints — "faithful gameplay and table
  layout, but an original clean visual style — **not** a pixel-perfect copy";
  procedural-only, no ripped assets; names the SpaceCadetPinball decompilation as the
  behavior reference. § "Blockers/Concerns" in `.planning/STATE.md` — table geometry
  transcription flagged **MEDIUM-confidence** (de-risked by D-03: source coords live
  in the copyrighted binary, so anchored-approximate is the intended path).

### Carry-forward from Phases 1–2 (internal — locked upstream, do not re-derive)
- `.planning/phases/02-flippers-feel/02-CONTEXT.md` — **D-11** (the two-flipper rig is
  **throwaway**; real placement is Phase 3, now D-05 here), the `FlipperInput` (D-10) /
  `FlipperController` (D-05) input→FSM→thin-hook architecture the `PlungerController`
  mirrors, and **D-09** (control scheme — `Space` reserved for the plunger).
- `.planning/phases/01-physics-core-spike/01-CONTEXT.md` — the engine-agnostic
  interface + harness targeting the interface (D-05), the fixed-120 Hz accumulator +
  render interpolation, reference-anchored HMR constants, and the
  seeded/deterministic-replay discipline.

### Tech-stack & physics patterns (internal — authoritative, no ADRs exist yet)
- `CLAUDE.md` § Technology Stack — chain/edge static walls; Planck `setBullet` CCD;
  fixed-timestep accumulator @120 Hz + render interpolation; **"What NOT to Use"**
  (kinematic bodies interact worse with CCD and transfer momentum wrong — the reason
  the plunger is an impulse, not a moving body, D-07); reuse vectors / no per-frame
  allocation.

### Code this phase builds on (in-repo)
- `src/physics/types.ts` — the `PhysicsWorld` interface + `CollisionEvent` /
  `CollisionEventType` / `drainEvents()` (evolve per D-12: add `elementKind`/
  `elementId`/`ballId`); `getBoundarySegments()` generalizes to `getElements()` (D-02);
  add the `applyImpulse(ballId, ix, iy)` hook (D-09); `Segment`/`Vec2` used by the spec.
- `src/physics/planck-world.ts` — `buildBoundary()` (the imperative box + the
  **duplicated** `corners`/`segment()` lists to replace with the spec builder, D-01),
  `buildFlipper()` + `FLIPPER_PIVOT_L/R` (the throwaway rig → real spec-driven
  placement, D-05), `BodyTag`/`asTag`/`classifyContact` + the `post-solve` emit path
  (extend to spec-sourced `ElementKind` ids, D-12), `nextEventSlot`/`drainEvents`
  pooling (the zero-alloc source the router drains, D-11), `applyLinearImpulse`
  candidate site (D-09), the ball's `setBullet`-vs-static CCD (covers the launch, D-07).
- `src/physics/constants.ts` — the HMR-tunable, reference-anchored const pattern the
  `table/spec` mirrors; `WIDTH_M`/`HEIGHT_M` move into the spec (D-02); add plunger
  charge/impulse/chute-axis constants (D-08); `BALL_RADIUS_M`/`FLIPPER_LENGTH_M`/
  `INCLINE_DEG`/`PIXELS_PER_METER` are the scale anchors to preserve (D-04).
- `src/input/flipper-input.ts` + `src/control/flipper-controller.ts` — the
  `event.code`, repeat-safe, blur-clearing, edge-latching input → FSM → thin-hook
  pattern the plunger's `Space` handling and `PlungerController` copy (D-08).
- `src/sandbox/main.ts` — the composition root + the `onFixedStep` drain wiring; the
  `world.drainEvents()` seam where the `CollisionRouter` + demo consumer wire in
  (D-11), and where the plunger controller ticks (D-08).
- `src/sandbox/debug-draw.ts` — reads `FlipperState`/boundary segments; generalizes to
  read the resolved element list (D-02) and the read-only plunger charge state (D-10).
- `src/harness/{soak,containment}.ts` — the swept-containment gate reads the boundary;
  it must read the generalized element list from the same resolve (D-01/D-02) and stay
  otherwise **untouched** by the bus/router work (D-11).

### External references (behavior/values/structure only — NEVER copy assets)
- `k4zmu2a/SpaceCadetPinball` decomp — geometry is loaded from the binary data file,
  NOT the source: `SpaceCadetPinball/loader.cpp` (`query_float_attribute` attr-type-600
  arrays), `SpaceCadetPinball/TPinballTable.cpp` (component/group layout),
  `SpaceCadetPinball/TCollisionComponent.cpp` + `TEdgeSegment::install_wall` /
  `CollisionCompOffset` (edge install) — the evidence that exact transcription is
  impractical (D-03). `TPlunger` — scalar `Boost`/`MaxPullback` proportional impulse,
  NOT a spring (D-07). Behavior/structure only. https://github.com/k4zmu2a/SpaceCadetPinball
- Public layout reference for anchors (behavior/positions only, no art): StrategyWiki
  "3D Pinball for Windows: Space Cadet / Gameplay"
  (https://strategywiki.org/wiki/3D_Pinball_for_Windows:_Space_Cadet/Gameplay) and the
  GameFAQs table-diagram map
  (https://gamefaqs.gamespot.com/pc/563047-3d-pinball-space-cadet/map/3726-table-diagram).
- Planck.js docs — `Body.applyLinearImpulse` semantics (D-07/D-09); `PrismaticJoint`
  (noted as the rejected spring path — Box2D 2.4 has no native linear spring).
  https://piqnt.com/planck.js/docs
- Event Queue / one-way command-buffer patterns (dispatch-at-a-fixed-seam rationale,
  D-11): https://gameprogrammingpatterns.com/event-queue.html

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The pooled event pipeline** (`planck-world.ts` `post-solve` → `nextEventSlot` →
  `drainEvents()` reused view) is the zero-alloc, one-way source the `CollisionRouter`
  drains (D-11) — no rewrite, only a thin dispatcher above it.
- **`buildFlipper()`** is already per-id additive and mirror-aware — real flipper
  placement (D-05) and a future third flipper (Phase 4) are added by feeding it new
  spec-driven pivots, not by rewriting the flipper.
- **`FlipperInput` + `FlipperController` + `onFixedStep`** are the exact input→FSM→
  thin-hook template the `PlungerController` copies (D-08); `Space` is already reserved.
- **`constants.ts`** is the HMR-tunable, reference-anchored source-of-truth pattern the
  new `table/spec` mirrors (D-01) and where plunger constants live (D-08).
- **`getBoundarySegments()` + the harness/debug-draw readers** generalize to the spec's
  resolved element list (D-02) — one resolve feeds fixtures, draw, and containment.

### Established Patterns
- **Engine isolation** — only `planck-world.ts` imports `planck`; the `table/spec`,
  `PlungerController`, `CollisionRouter`, and `ElementKind` types MUST stay
  engine-agnostic (D-01/D-08/D-11/D-12).
- **Zero per-frame allocation** on step/render/drain hot paths — the router's fan-out,
  the evolved event fields, and the plunger charge read must all preserve it.
- **Deterministic, replayable simulation** — the plunger charge is a scalar drained on
  the fixed step (D-08); the router dispatches one batch per fixed step in fixed order
  (D-11); neither may read wall-clock.

### Integration Points
- **`table/spec` → adapter builder** replaces `buildBoundary()`; the same spec feeds
  debug-draw + containment (D-01/D-02).
- **`applyImpulse` hook** is a new thin seam on the interface (D-09), driven by the
  `PlungerController` and later by nudge.
- **`CollisionRouter`** wires in at the `world.drainEvents()` seam in `main.ts`, at the
  fixed-step boundary, feeding a demo stub consumer (D-11).
- **`ElementKind` ids** flow spec → `userData` tag → `CollisionEvent` (D-12).

</code_context>

<specifics>
## Specific Ideas

- Faithfulness here **points at simplicity**: the plunger and the table both turn out
  to be simpler than the "physical" alternative *because* that is what the original
  actually does (scalar-impulse plunger; approximate hand-built geometry, since the
  real coords are locked in a copyrighted binary). Lean into that — it is faithful,
  not a shortcut.
- SC#4's "cannot drift apart" is treated as a **structural** guarantee, not a
  discipline: because Planck chain/edge walls and Canvas polylines are both vertex
  lists produced by the **one** resolver, the collider and the drawn stroke are the
  same points by construction. This directly retires the latent two-copies drift in
  today's `buildBoundary()`.
- The bus is proven **wired, not built out**: Phase 3 ships the router + a single stub
  consumer, mirroring how Phases 1–2 proved a mechanism with a minimal artifact rather
  than pulling downstream scope forward.

</specifics>

<deferred>
## Deferred Ideas

- **Upper-left third flipper** — the original has two lower + one upper-left
  (pair-fired) flipper. Deferred to **Phase 4**'s reactive pass to keep Phase 3 scope
  tight; `buildFlipper` is per-id additive so it is cheap to add then (D-05).
- **Reactive element behavior** (bumper kick energy, slingshot kicks, lane/rollover
  lights, scoring, 3-ball loop, nudge/tilt) — **Phase 4**; Phase 3 ships those elements
  as inert colliders/sensors that already emit events (D-06). Not a deferral of Phase 3
  scope — a scoped boundary.
- **Procedural rendering of the table + charge meter, and synthesized per-element
  audio** — **Phase 5**, drawing from this same spec and bus (D-10/D-12).
- **Skill-shot bonus keyed to precise plunger charge** — **Phase 6** (PLSH-05).
- **Factory-DSL sugar** over the table spec (D-01) — an in-phase option, adopt only if
  arcs/clusters get verbose; not a separate feature.
- **Physical spring plunger / prismatic body** (D-07) — rejected, not deferred: it is
  less faithful and reintroduces a tunneling case.

</deferred>

---

*Phase: 3-Table, Plunger & Event Bus*
*Context gathered: 2026-07-16*
