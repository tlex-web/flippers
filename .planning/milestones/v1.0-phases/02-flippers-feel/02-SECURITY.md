---
phase: "02"
slug: "flippers-feel"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-25"
register_authored_at_plan_time: true
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Written retroactively at the v1.0 milestone ship. The register comes from the `<threat_model>` blocks in all six 02-0x PLAN files. Mitigations were checked against the code at HEAD (L1 grep depth). The Phase 2 input code was later hardened in Phase 4 (04-11..04-15), and those mitigations still hold in the current `src/input/flipper-input.ts`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| local keyboard → FlipperInput | Physical `event.code` key events from the same-privilege local user; the page sends nothing anywhere | Key codes and repeat flags |
| browser focus/visibility lifecycle → held-key set | Blur, focus and hidden-tab events can strand a held key | Focus state only (availability of flipper feel) |
| physics step → event bus / render snapshot | Sub-stepped solver output read by listeners and the renderer | In-memory contacts and poses |
| test harness → in-memory physics state | Seeded gates drive and read the world | Seeds and numeric state; nothing sensitive |

The game is fully client-side and offline, with no server, network, auth, persistence or DOM injection. XSS, CSRF, SQLi and authz do not apply.

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Denial of Service (feel/perf) | per-frame allocation in the stadium flipper draw | low | mitigate | `src/sandbox/debug-draw.ts:86,311`: styling built once at module load, with the rounded tip and hinge drawn as ctx paths only | closed |
| T-02-02 | Tampering (correctness) | `tipRadius` on the interface but unset by the adapter | low | mitigate | `src/physics/planck-world.ts:149,600` sets `tipRadius: FLIPPER_TIP_RADIUS_M`, and `planck-world.smoke.test.ts` asserts it | closed |
| T-02-03 | Denial of Service (feel) | stuck key after blur, or a swallowed browser key | medium | mitigate | `src/input/flipper-input.ts:418-420` force-clears on window `blur`/`focus` and `document` `visibilitychange`. `preventDefault` fires on bound codes only (`:17,302,323`) | closed |
| T-02-04 | Tampering (input integrity) | OS auto-repeat re-triggering flips | low | mitigate | `src/input/flipper-input.ts:14,310` ignores `e.repeat` keydowns; the only exception is the Windows second-Shift press (Phase 4 G-04-17). The held Set de-dupes codes | closed |
| T-02-05 | Denial of Service (feel) | per-frame allocation in the frame loop | low | mitigate | `src/sandbox/main.ts:276` builds input, controller and mapping state once and reuses drained views | closed |
| T-02-06 | Denial of Service (feel) | listeners never removed on teardown | low | mitigate | `attach()`/`detach()` add and remove the same bound handlers (`flipper-input.ts:284,418-427`), plus the T-02-03 force-clear. The residual (a single-page lifetime that never detaches) is accepted in the plan | closed |
| T-02-07 | Denial of Service (frame budget) | an unbounded sub-step count N from a pathological omega | medium | mitigate | `src/physics/planck-world.ts:105,732` clamps to `SUB_STEP_N_MAX` (4), asserted in `src/physics/substep.test.ts:22` | closed |
| T-02-08 | Tampering (correctness) | events dropped or double-counted across sub-steps; a torn snapshot | medium | mitigate | `planck-world.ts:313,742`: events accumulate across sub-steps, and pools and contacts sync once after the last sub-step | closed |
| T-02-09 | Repudiation/Determinism | N sized from wall-clock time | low | mitigate | `planck-world.ts` contains no `performance.now`/`Date.now` (whole file, including the 64-line `step()`). N comes from the live joint speed | closed |
| T-02-10 | Tampering (test integrity) | a false-green FLIP-04 gate | medium | mitigate | `src/harness/flipper-tunnel.test.ts:76,174`: the sub-stepping-off control (`subStepping: false`, bullet on) must go RED | closed |
| T-02-11 | Tampering (test integrity) | feel detectors that never fire | low | mitigate | `src/harness/flipper-feel.test.ts:353,358`: `firstMonotonicIncrease` must reject a synthetic speed-up before the green cradle run counts | closed |
| T-02-12 | Information Disclosure (misuse) | mulberry32 mistaken for a secure RNG | low | accept | `src/harness/prng.ts:12-13` documents it as non-cryptographic. No secrets exist | closed |
| T-02-13 | Denial of Service (feel) | a feel retune that silently breaks the anti-tunnel or cradle proofs | medium | mitigate | 02-06-SUMMARY records `npm test` 71/71 and `npm run soak` 2/2 after the retunes. The same gates run in every later phase | closed |
| T-02-SC | Tampering (supply chain) | npm installs | low | N/A | No new dependencies: `package.json` has no commits during Phase 2 (only 2026-07-15, 2026-11-19, 2026-11-25) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-12 | Seed-replayable test PRNG, documented as non-cryptographic. No secrets exist | Plan 02-05 threat model (disposition `accept`) | 2026-07-16 |
| AR-02-02 | T-02-06 (residual) | The sandbox and game run for one page lifetime and never detach. Force-clear on blur/visibility covers stuck keys | Plan 02-03 threat model ("accepted residual") | 2026-07-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-25 | 14 | 14 | 0 | /gsd-secure-phase 2 (orchestrator, L1 grep; auditor skipped per short-circuit: plan-time register, ASVS 1, 0 open) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-25
