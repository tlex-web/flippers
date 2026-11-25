---
created: 2026-11-21T00:07:25Z
title: Give heavy simulation tests an explicit timeout so the suite is load-stable
area: testing
severity: minor
files:
  - src/harness/soak.test.ts
  - src/harness/table-soak.test.ts
  - src/harness/reactive-soak.test.ts
  - src/sandbox/game.determinism.test.ts
  - src/sandbox/flipper-e2e.test.ts
  - vite.config.ts
---

## Problem

`npm test` (vitest run, 16 workers in parallel) intermittently fails with
`Test timed out in 5000ms` on the CPU-heavy simulation tests. Seen during the phase 04
gap-closure run (04-12/04-13) post-wave test gate: 3 consecutive full runs failed 4-5 tests,
all timeouts, zero assertion failures.

Evidence it is load-dependent and pre-existing, not a regression:
- The failing files in isolation: 65/65 pass in ~2.5s.
- Baseline commit 1e71979 (before 04-12/04-13): 416/416 green twice, then 3/416 timed out on a third run.
- Current tree (c68f5f8) passed 482/482 on the next run.
- Worst single test ~4.3s even in a passing run: flipper-e2e "no quick tap (3-10 steps, any rest, all six bindings) leaves a bat raised" (G-04-10) -- under 5s only by a thin margin.

## Solution

Give the simulation-heavy tests an explicit per-test or per-file timeout (e.g. 20-30s) instead of
the 5s default, or cap vitest worker count. Keep the soak gate config (vitest.gate.config.ts) as is.
Verify with several back-to-back full runs while the machine is loaded.

## Resolution

Closed 2026-11-21 by plan 05-07 on evidence.

- Fix: `testTimeout: 30000` in `vitest.config.ts` (added by plan 05-01), in place of the 5 s default. The soak gate config (`vitest.gate.config.ts`) is unchanged.
- Evidence: two back-to-back full runs (`npx vitest run`) during the phase-05 execution: 48 files, 668/668 passed each time (5.5 s and 5.9 s), and no "Test timed out" line in either. `npm run soak` was also green (4/4).
