# Phase 3: Table, Plunger & Event Bus - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 3-Table, Plunger & Event Bus
**Areas discussed:** Table/spec single source, Plunger mechanism, Collision-event bus, Table geometry & fidelity
**Mode:** advisor (research-backed comparison tables; calibration tier `standard`; owner = technical)

---

## Table/spec single source

| Option | Description | Selected |
|--------|-------------|----------|
| Typed data module | `src/table/spec.ts` of engine-agnostic descriptors + a shared curve-resolver; adapter builds fixtures, renderer + containment read the same resolved list; generalize `getBoundarySegments()` → `getElements()` | ✓ |
| Data module + factory DSL | Same typed descriptors plus `wall()`/`arc()`/`bumper()` sugar | |
| External JSON file | Runtime-loaded table data; loses types/derivation/HMR | |
| Enrich adapter accessor | Geometry stays in `planck-world.ts`; doesn't fix the drift | |

**User's choice:** Typed data module (recommended).
**Notes:** Decisive point — today `buildBoundary()` builds the Planck `Chain` from a `corners` array **and separately** returns a hand-authored `segment()` list (two copies that can drift), which is exactly what SC#4 forbids. A single shared resolve makes "what's hit == what's drawn" structural. Factory helpers may be layered on top later as sugar emitting the same descriptors.

---

## Plunger mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Impulse-on-release | Charge scalar → `applyLinearImpulse` up the chute axis via a new thin `applyImpulse(ballId,ix,iy)` hook (reused by Phase 4 nudge) | ✓ |
| Physical spring plunger | Dynamic prismatic body + spring; emergent but a new tunneling case | |
| Hybrid driven tip | Kinematic pullback + computed impulse on contact | |

**User's choice:** Impulse-on-release (recommended).
**Notes:** Research found the original `TPlunger` is a scalar `Boost` accumulated over time, capped at `MaxPullback`, applied as a proportional impulse on release — **not** a spring. So the simplest model is the faithful one, it stays deterministic on the fixed step, and it adds no new fast-moving body (no new tunneling case). `PlungerController` mirrors `FlipperController`; charge exposed read-only for the LNCH-02 debug meter.

---

## Collision-event bus

| Option | Description | Selected |
|--------|-------------|----------|
| Pull-then-dispatch router | Thin `CollisionRouter` drains once per fixed step, fans the reused view to N listeners in fixed order; add `elementKind`/`elementId`/`ballId` from spec tags | ✓ |
| Pub/Sub EventBus | `subscribe(type, cb)` / `emit`; risks mid-solve reentrancy + per-emit GC churn | |
| Per-element callback registry | `elementId` → handler; really Phase 4's rules structure | |

**User's choice:** Pull-then-dispatch router (recommended).
**Notes:** Preserves the existing zero-alloc / one-way / deterministic `drainEvents()`; adapter + interface + harness untouched. Wire at the fixed-step seam, not the rAF frame. Evolve the event model with orthogonal `elementKind` + `elementId` (+ explicit `ballId`) sourced from the spec tags; do **not** explode `CollisionEventType` into per-pair enums. Phase 3 = bus wired + one stub consumer, no Phase 4 scoring pulled forward.

---

## Table geometry & fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid anchored-approximate | Normalized anchors off the reference image + hand-built clean-room polylines; scale from existing constants; Phase 3 = inert colliders only; third flipper deferred | ✓ |
| Pure hand-built approximation | Fully clean-room by eye; placement a judgement call | |
| Exact `.dat` transcription | Reverse-parse copyrighted binary; overshoots the brief + realizes the risk | |

**User's choice:** Hybrid anchored-approximate (recommended).
**Notes:** Decisive research finding — the original's collision geometry is **not** in the decompilation source; it's loaded at runtime from attr-type-600 float arrays in the copyrighted `CADET.DAT`, so exact transcription would mean parsing Microsoft's binary (off-brief + the flagged MEDIUM risk). Derive table scale from the proven Phase-2 flipper/ball constants (~3–4 m × ~5–7 m, feel constants untouched); real flippers in the inverted-V at the drain; upper-left third flipper deferred to Phase 4; Phase 3 ships physical colliders only.

---

## Claude's Discretion

- Exact anchor coordinates/proportions, table width/height within the derived ~3–4 m × ~5–7 m ballpark, and per-element polyline vertices (tuned by eye against the reference image).
- The spec's exact descriptor types, the resolver/tessellation API, and file split — provided it stays engine-agnostic, HMR-tunable, and drives fixtures + draw from one resolve.
- Plunger charge-curve values (rate, min/max impulse), chute-axis vector, and `PlungerController` FSM/latch details — provided the hold-to-charge → proportional-launch behavior and determinism hold.
- The `CollisionRouter` API, the demo stub consumer's behavior, and the exact `ElementKind` member set — provided fixed-order dispatch, zero-alloc, and spec-sourced ids hold.
- Whether the optional factory-DSL sugar is introduced now or deferred; module/file naming.

## Deferred Ideas

- Upper-left third flipper → Phase 4 (`buildFlipper` is per-id additive).
- Reactive element behavior (bumper kick, slingshot kicks, lane lights, scoring, 3-ball loop, nudge/tilt) → Phase 4 (elements ship inert this phase).
- Procedural table + charge-meter rendering and synthesized per-element audio → Phase 5.
- Skill-shot bonus keyed to precise plunger charge → Phase 6 (PLSH-05).
- Factory-DSL sugar over the spec → in-phase option, not a separate feature.
- Physical spring plunger / prismatic body → rejected (less faithful, reintroduces tunneling), not deferred.
