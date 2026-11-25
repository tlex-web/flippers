---
phase: "01"
slug: "physics-core-spike"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-25"
register_authored_at_plan_time: true
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Written retroactively at the v1.0 milestone ship. The register comes from the `<threat_model>` blocks in all seven 01-0x PLAN files. Mitigations were checked against the code at HEAD (L1 grep depth).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| local dev machine → npm registry | Installing planck, vite, typescript, vitest, eslint, prettier and @typescript-eslint. This is the only external boundary in the phase | Third-party package code (supply chain) |
| browser tab lifecycle → simulation loop | Backgrounding and foregrounding deliver arbitrarily large frame deltas into the fixed-step accumulator | Frame timing only (availability) |
| local user keyboard/DOM → sandbox | Local, same-privilege input into an offline canvas | Key events; no data leaves the page |
| test/soak harness → in-memory physics state | Harnesses drive and read state through the `PhysicsWorld` interface and write local failure logs (seed + numeric state) | Seeds and numeric state; nothing sensitive |

The phase is a client-side, offline, single-player physics spike, with no backend, network calls, accounts or personal data.

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Tampering (supply chain) | npm install of the toolchain | medium | mitigate | `package-lock.json` is committed, with resolved versions and integrity hashes. The runtime dependency `planck` and the build tools `vite`/`typescript` are exact pins. The legitimacy checkpoint is recorded in 01-01-SUMMARY Task 1. Deviation: eslint, @typescript-eslint, prettier and vitest use caret ranges in `package.json`, held only by the lockfile | closed |
| T-01-SC | Tampering | any install in this phase | medium | mitigate | Same controls as T-01-01. No package was substituted (01-01-SUMMARY) | closed |
| T-01-02 | Denial of Service | fixed-step accumulator fed a huge dt on tab blur (spiral of death) | low | mitigate | `src/sim/loop.ts:90` clamps `realDeltaMs` to `MAX_FRAME_MS`. Proven headlessly in plan 01-04 (bounded catch-up, finite state, recovery) | closed |
| T-03-01 | Denial of Service | render loop allocations causing GC hitches that break 60 fps | low | mitigate | `src/sandbox/main.ts:474` pre-allocates render buffers. `src/sandbox/debug-draw.ts:15,160` reuses buffers and paths, with no steady-state allocation | closed |
| T-05-01 | Tampering (test integrity) | a false-green gate that misses real tunneling | medium | mitigate | `src/harness/containment.ts` uses a swept invariant, not an endpoint check, unit-tested in `containment.test.ts`. The negative control is in `soak.test.ts` | closed |
| T-05-02 | Information Disclosure (misuse) | mulberry32 mistaken for a secure RNG | low | accept | `src/harness/prng.ts:12-13` documents it as deterministic by design and not cryptographically secure. No secrets exist | closed |
| T-06-01 | Tampering (test integrity) | a false-green gate that silently misses tunneling | medium | mitigate | The swept invariant runs every step. The CCD-off negative control (`src/harness/soak.test.ts:32`, `bullet: false`) must go RED with a replayable seed. Later phases repeat it on the real table (`reactive-soak.test.ts`) | closed |
| T-06-02 | Repudiation (irreproducible failure) | an escape that cannot be replayed | low | mitigate | `src/harness/soak.ts:13,48-50`: a seeded mulberry32 stream, with a per-case seed that replays through `{ seeds: [seed] }` | closed |
| T-07-01 | Repudiation (unfounded decision) | locking the engine without evidence | low | mitigate | ENGINE-DECISION.md cites the soak gate (commits 1197173 / 8c5fa1e, `npm run soak`), the CCD-off control and `src/harness/stability.test.ts` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01-01 | T-05-02 | The PRNG exists for seed-replayable tests and is documented as non-cryptographic. The game has no secrets, keys or tokens to protect | Plan 01-05 threat model (disposition `accept`) | 2026-07-15 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-25 | 9 | 9 | 0 | /gsd-secure-phase 1 (orchestrator, L1 grep; auditor skipped per short-circuit: plan-time register, ASVS 1, 0 open) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-25
