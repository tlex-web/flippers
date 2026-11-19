---
phase: "03"
slug: "table-plunger-event-bus"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-19"
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

This phase has no network, storage, auth or user-data surface. The threat model is about integrity and availability: malformed geometry reaching the solver, calibrated proofs drifting, untrusted key input becoming a physics impulse, and the per-step event path staying allocation-free and deterministic. The register was written at plan time in each 03-0N-PLAN.md `<threat_model>` and verified at ASVS L1 by grep against the implementation.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| spec data -> resolve() -> Planck solver | Hand-authored geometry enters the solver; malformed data must fail loudly | static table descriptors (trusted, authored) |
| refactored adapter / default-world switch -> calibrated Phase-1/2 proofs | Structural or default changes could silently move seeded proofs onto different geometry | test fixtures, seeds |
| authored layout -> solver | Static fixtures near moving bats and narrow gaps can jam joints or trap the ball | geometry |
| real-table geometry -> swept-containment gate | A vacuous gate would certify nothing | soak cases |
| keyboard (Space) -> latch -> PlungerController -> applyImpulse -> solver | Untrusted, repeatable key input becomes a physics impulse | KeyboardEvent edges, impulse vector |
| solver callbacks -> pooled event source -> CollisionRouter -> listeners | In-process, one-way; listeners are trusted code registered once at startup | CollisionEvent records (pooled) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Denial of Service | resolve() on NaN/Infinity, degenerate, duplicate-id or self-intersecting descriptors | medium | mitigate | `src/table/resolve.ts` `fail()` throws `resolve: element {id} ...` before any body is built; `resolve.test.ts` table-driven rejection suite covers 8 cases (NaN, Infinity, radius 0, negative radius, duplicate id, bow-tie loop, sub-MIN_VERTEX_SPACING, one-vertex polyline) | closed |
| T-03-02 | Tampering (test integrity) | Spec-driven rebuild shifting calibrated seeds | medium | mitigate | `containment.ts` and `flipper-e2e.test.ts` byte-identical to 80869ae; proof-box + FLIP-04 soak gates green (`npm run soak` 3/3) | closed |
| T-03-03 | Information disclosure (report correctness) | Sensor segments leaking into the containment boundary / second geometry copy | low | mitigate | `getBoundarySegments()` is the solid subset of the one resolve; `table-world.test.ts:108` asserts drain sensor excluded from boundary | closed |
| T-03-04 | Denial of Service (availability) | Fixture overlapping a bat's sweep jams the revolute joint | medium | mitigate | `table-world.test.ts:358` "(c) sweeps each bat through its full raise and return with nothing in the way" (clearance BALL_RADIUS_M + 0.05); executor mutation check confirmed it fails on a slingshot intrusion | closed |
| T-03-05 | Tampering (feel regression) | Editing FLIPPER_* / INCLINE_DEG to fit the table | medium | mitigate | `git diff --numstat 80869ae -- src/physics/constants.ts` = 51 added / 0 deleted (plunger constants appended only; no flipper or incline value touched) | closed |
| T-03-06 | Denial of Service (availability) | Trap pocket ending play silently | low | mitigate | Seeded flow proof in `table-world.test.ts` requires every drop to reach DRAIN_Y within 30 s, reporting seed and drop point | closed |
| T-03-07 | Denial of Service (availability) | Ball escaping the real table through a seam, wedge or arc chord | medium | mitigate | `table-soak.gate.test.ts` 210 x 3 s = 630 s simulated (>= 600 s floor) on TABLE_SPEC, green; fast bounded run in `table-soak.test.ts` | closed |
| T-03-08 | Tampering (test integrity) | Origin filter making the real-table gate vacuous | medium | mitigate | `table-soak.gate.test.ts:70` asserts `casesRun == cases`; `table-soak.test.ts:90` filter exhaustion throws with seed (`MAX_ORIGIN_DRAWS = 64`); CCD-off RED control goes red on wall 100 | closed |
| T-03-09 | Tampering (test integrity) | Pinning five primitive proofs hides a regression | low | mitigate | Zero `expect(` lines changed in stability / flipper-feel / loop.tabblur / loop.determinism; smoke test's single changed `expect(` line differs only in the constructor argument `{ table: PROOF_BOX_SPEC }` | closed |
| T-03-18 | Tampering (test integrity) | Flipping the no-options default silently moves an unpinned caller | medium | mitigate | `substep.test.ts` pinned (0 `expect(` changes); `flipper-e2e.test.ts` byte-identical to 80869ae and green on the real bats; soak replays proof-box and FLIP-04 gates | closed |
| T-03-19 | Tampering (test integrity) | Narrowing SpyWorld deletes or rewords an assertion | low | mitigate | `flipper-controller.test.ts` `expect(` diff vs 80869ae = 0 | closed |
| T-03-10 | Denial of Service (availability/feel) | Held/spammed Space producing a pathological impulse | medium | mitigate | Charge clamped at PLUNGER_MAX_CHARGE and mapped onto [PLUNGER_MIN_IMPULSE, PLUNGER_MAX_IMPULSE] in `plunger-controller.ts`; `planck-world.ts:821` `applyImpulse` returns on non-finite components; measured full-charge launch 11.86 m/s, far under the 60 m/s soak ceiling | closed |
| T-03-11 | Tampering (replay integrity) | Wall-clock or global RNG in charge accumulation | medium | mitigate | 0 occurrences of `Date.now` / `performance.now` / `Math.random` in `plunger-controller.ts` and `plunger-input.ts`; charge derived from an integer step count; determinism suite in `plunger-controller.test.ts:199` | closed |
| T-03-12 | Tampering (input) | Auto-repeat double-charging; focus loss firing a launch | low | mitigate | `plunger-input.ts` ignores `event.repeat`; blur / hidden latch a cancel edge that never also latches a release; unit + e2e tested | closed |
| T-03-13 | Denial of Service | Impulse to a stale ball, a ball outside the chute, or mid-step | low | mitigate | `applyImpulse` unknown-id loop is a no-op; `PlungerController` guards on `PLUNGER_ZONE`; impulse applied between fixed steps with wake = true | closed |
| T-03-14 | Denial of Service (allocation/frame budget) | Per-event / per-dispatch allocation on the hot path | medium | mitigate | `planck-world.ts` reuses `nextEventSlot()` and `scratchWm`; `collision-router.test.ts:70-71` asserts listeners receive the same pooled records by reference (N x M calls) | closed |
| T-03-15 | Tampering (replay integrity) | Draining per render frame instead of per fixed step | medium | mitigate | `FixedStepLoop.advance(..., onPostStep)` invokes once per fixed step (`loop.ts:86`); sandbox dispatches from `onPostStep` (`main.ts:166`); one-dispatch-per-step asserted | closed |
| T-03-16 | Information disclosure (event correctness) | Misattributing the ball side, or losing sensor events | low | mitigate | Exported pure `normalizeContact` (`planck-world.ts:204`) tested in both argument orders (`collision-event.test.ts`); begin-contact sensor path tested for rollover and drain with impulse 0 (`sensor-event.test.ts`) | closed |
| T-03-17 | Denial of Service (availability) | Demo consumer flooding the console | low | mitigate | `main.ts:66` `SOLID_LOG_EVERY = 30` throttle; sensor kinds rare by construction; one consumer only | closed |
| T-03-SC | Tampering | npm/pip/cargo installs | low | accept | No packages installed this phase — `package.json` / lockfile unchanged across 3ccbc71..HEAD | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-SC | Supply-chain install surface: the phase adds no dependency (RESEARCH Package Legitimacy Audit), so there is nothing to vet. Disposition `accept` was set at plan time in all six plans and is confirmed by an unchanged `package.json` / lockfile. | plan-time threat model (03-01..03-06) | 2026-11-19 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-19 | 20 | 20 | 0 | gsd-secure-phase orchestrator (ASVS L1 grep-depth; auditor skipped per short-circuit: threats_open 0, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-19
