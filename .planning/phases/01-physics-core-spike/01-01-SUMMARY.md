---
phase: 01-physics-core-spike
plan: 01
subsystem: infra
tags: [vite, typescript, vitest, eslint, prettier, planck, scaffold, tooling]

# Dependency graph
requires: []
provides:
  - "Buildable Vite 8 + TypeScript project shell (dev server, production build)"
  - "Strict tsconfig type-check gate (npm run typecheck / tsc --noEmit)"
  - "Flat ESLint 9 + @typescript-eslint config and Prettier config (npm run lint / format)"
  - "Vitest (node env) test runner configured, green on empty scaffold (npm test)"
  - "planck@1.5.0 installed and lockfile committed (physics engine ready for plan 01-02)"
  - "index.html + src/sandbox/main.ts boot-stub entry (sandbox filled in by plan 01-03)"
  - "npm scripts: dev, build, typecheck, lint, format, test, soak"
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, all-downstream-phases]

# Tech tracking
tech-stack:
  added:
    - "planck@1.5.0 (Box2D JS/TS rewrite — physics)"
    - "vite@8.1.4 (dev server + bundler)"
    - "typescript@5.9.3 (type-check gate — see deviation re: plan-pinned 7.0.2)"
    - "vitest@^4.1.10 (headless test runner)"
    - "eslint@^9 + @typescript-eslint@^8 (parser + plugin)"
    - "prettier@^3.9.5 (formatting)"
  patterns:
    - "tsc --noEmit is a SEPARATE type gate from Vite's esbuild transpile"
    - "Exact-pinned core deps + committed lockfile as the supply-chain control (threat T-01-01)"
    - "Headless tests run in node env (no DOM) — the physics proof is numeric/deterministic"

key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - vite.config.ts
    - vitest.config.ts
    - eslint.config.js
    - .prettierrc.json
    - .gitignore
    - index.html
    - src/sandbox/main.ts
  modified: []

key-decisions:
  - "TypeScript pinned to 5.9.3 (not the plan's 7.0.2): @typescript-eslint 8 caps its TS peer at <6.1.0 and crashes at import under TS 7.0's native-compiler API. CLAUDE.md § Version Compatibility explicitly prescribes pinning to 5.x when a tool assumes the old JS tsc API; per CLAUDE.md precedence this overrides the plan's literal 7.0.2 pin. Exact-pin + lockfile supply-chain control is preserved."
  - "Vitest env = node (not happy-dom): the headless soak gate / containment proofs are numeric and need no DOM; avoids an extra dependency."
  - "vitest.config passWithNoTests: true so the scaffold's npm test is green until plan 01-02 adds the first smoke test."
  - "ESLint pinned to the 9.x line (typescript-eslint 8's supported peer); type-aware linting deferred (no parserOptions.project) to keep lint fast on the scaffold."

patterns-established:
  - "Strict TS config: strict + noUnchecked/exactOptional/noUnused/verbatimModuleSyntax/isolatedModules for physics correctness"
  - "Flat ESLint config using @typescript-eslint recommended (non-type-checked) rules; formatting owned by Prettier"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-07-15
---

# Phase 1 Plan 01: Project Scaffold Summary

**Buildable Vite 8 + strict-TypeScript shell — tsc type-check gate, flat ESLint 9 + Prettier, a node-env Vitest runner, and a `src/sandbox/main.ts` boot stub — with planck@1.5.0 pinned and the lockfile committed; every gate (typecheck, lint, test, build, dev boot) is green.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-15T00:44:17Z
- **Completed:** 2026-07-15T00:54:26Z
- **Tasks:** 2 (Task 1 supply-chain gate — pre-approved; Task 2 scaffold — executed)
- **Files created:** 10

## Accomplishments

- Scaffolded a vanilla-TypeScript Vite project and installed the exact-pinned, supply-chain-verified stack; regenerated a clean, peer-valid lockfile and committed it.
- Strict `tsconfig.json`; `npx tsc --noEmit` exits 0 (separate from Vite's esbuild transpile).
- Flat `eslint.config.js` (ESLint 9 + `@typescript-eslint` parser/plugin) and `.prettierrc.json`; `npx eslint .` exits 0.
- `vitest.config.ts` (node env, `passWithNoTests`); `npx vitest run --passWithNoTests` exits 0 — the headless test runner is wired for plans 01-05/01-06.
- `index.html` mounts `src/sandbox/main.ts`, a boot stub logging `"skeleton boot"`; `npm run dev` boots Vite and serves both the page and the transpiled entry (HTTP 200); `npm run build` (tsc + vite build) succeeds.
- npm scripts present: `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `soak` (soak targets `src/harness/soak.gate.test.ts`, created in plan 01-06).

## Task Commits

1. **Task 1: Verify dependency package legitimacy** — no commit (blocking-human supply-chain gate; **pre-approved by the operator** for the exact pinned set: planck 1.5.0, vite 8.1.4, typescript, vitest, eslint, prettier, @typescript-eslint/*). No package substitution occurred.
2. **Task 2: Scaffold the Vite + TypeScript project** — `cd390da` (chore)

**Plan metadata:** (final docs commit — this SUMMARY + STATE + ROADMAP)

## Files Created/Modified

- `package.json` — pinned deps + scripts (dev/build/typecheck/lint/format/test/soak)
- `package-lock.json` — clean, peer-valid lockfile (supply-chain control)
- `tsconfig.json` — strict TypeScript config, `noEmit` type-check gate
- `vite.config.ts` — dev server + production build config (es2022, sourcemaps)
- `vitest.config.ts` — node-env headless runner, `passWithNoTests`
- `eslint.config.js` — flat config, `@typescript-eslint` recommended rules
- `.prettierrc.json` — formatting rules
- `.gitignore` — node_modules, dist, caches, editor/OS noise
- `index.html` — sandbox entry mounting `src/sandbox/main.ts`
- `src/sandbox/main.ts` — boot stub (`"skeleton boot"`), filled in by plan 01-03

## Decisions Made

- **TypeScript 5.9.3 instead of the plan-pinned 7.0.2.** See Deviations — this is a CLAUDE.md-precedence resolution of a hard tool incompatibility, and it should be ratified (or explicitly overridden) at the next gate.
- **Vitest node environment** (not happy-dom) — the headless physics proof is numeric; no DOM dependency added.
- **ESLint 9.x + non-type-aware linting** — matches `@typescript-eslint` 8's supported peer and keeps lint fast; type-aware rules can be enabled later once real physics code exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [CLAUDE.md-precedence / Rule 3 - Blocking] TypeScript pinned to 5.9.3, not the plan's 7.0.2**
- **Found during:** Task 2 verification — `npx eslint .` crashed with `TypeError: Cannot read properties of undefined (reading 'Cjs')` inside `@typescript-eslint/typescript-estree` at import time, and `npm install` of `@typescript-eslint/parser` raised `ERESOLVE` (its TS peer is `>=4.8.4 <6.1.0`).
- **Issue:** `@typescript-eslint` 8 (the latest, and a plan-required package) does not support `typescript@7.0.2` — TS 7.0 is the new native-compiler line whose JS API surface differs from the old `tsc` API the linter depends on. The plan simultaneously requires (a) `typescript@7.0.2` pinned and (b) `npx eslint .` passing with `@typescript-eslint`; both cannot hold given the current registry.
- **Fix:** Pinned `typescript@5.9.3` (latest 5.x, satisfies the linter's peer) per **CLAUDE.md § Version Compatibility**, which explicitly states: *"If any tool assumes the old JS `tsc` API, pin to `typescript@5.x` — but for `--noEmit` type-checking in this project, 7.0 is fine."* CLAUDE.md directives take precedence over plan instructions. TS 5.9.3 performs the identical `--noEmit` gate role; the exact-pin + committed-lockfile supply-chain control (threat T-01-01) is fully preserved (a different exact version, still pinned + locked + from a verified official publisher).
- **Files modified:** package.json, package-lock.json
- **Verification:** After re-pin, a clean `npm install` resolves with no peer conflicts and zero vulnerabilities; `tsc --noEmit`, `eslint .`, `vitest run --passWithNoTests`, `vite dev` boot, and `vite build` all exit 0.
- **Committed in:** cd390da (Task 2 commit)
- **Ratification note:** The plan's `must_haves` truth literally names "typescript 7.0.2". A human/verifier should confirm this substitution is acceptable (recommended) or direct a different resolution (e.g., drop `@typescript-eslint` until it supports TS 7). Downstream plans will typecheck/build under TS 5.9.3; a future chore can bump TypeScript once `@typescript-eslint` supports the 7.x line.

**2. [Rule 3 - Blocking, superseded] Intermediate `--legacy-peer-deps` install**
- **Found during:** Task 2 install, before deviation #1 was fully resolved.
- **Issue:** Installing `@typescript-eslint/*` against the then-pinned `typescript@7.0.2` failed `ERESOLVE`.
- **Fix:** Briefly installed with `--legacy-peer-deps` to empirically confirm whether typescript-eslint would function against TS 7.0 at runtime — it did not (crash above). After re-pinning to TS 5.9.3, `node_modules` and `package-lock.json` were **deleted and regenerated cleanly** without any peer override, so the committed lockfile contains no `--legacy-peer-deps` artifacts.
- **Files modified:** package-lock.json (regenerated clean)
- **Verification:** Fresh `npm install` (no flags) succeeds; no ERESOLVE.
- **Committed in:** cd390da (Task 2 commit)

**3. [Rule 3 - Blocking, additive config] `passWithNoTests` in vitest.config.ts**
- **Found during:** Task 2 (test-runner acceptance).
- **Issue:** `vitest run` (the `test` script) fails on an empty scaffold with no test files.
- **Fix:** Set `test.passWithNoTests: true` so `npm test` is green now and stays meaningful once plan 01-02 adds the first smoke test. (Claude's-discretion item per CONTEXT § test runner.)
- **Files modified:** vitest.config.ts
- **Committed in:** cd390da (Task 2 commit)

---

**Total deviations:** 3 (1 CLAUDE.md-precedence version change requiring ratification; 2 blocking-config fixes).
**Impact on plan:** The plan's functional goal — a buildable, type-checked, lint-clean, test-ready shell with pinned + lockfile-committed deps — is fully met. The only substantive deviation is the TypeScript version number (5.9.3 vs 7.0.2), forced by a real, current incompatibility between two plan-required tools and resolved per CLAUDE.md's own documented escape hatch. No scope creep; no security regression (exact-pin + lockfile intact).

## Issues Encountered

- `@typescript-eslint` 8 is incompatible with `typescript@7.0.2` (peer `<6.1.0`; runtime crash on the native-compiler API). Resolved by the CLAUDE.md-prescribed TS 5.x pin — see Deviations #1/#2.

## User Setup Required

None — no external service configuration required. Supply-chain gate (Task 1) was pre-approved by the operator; no secrets or accounts involved.

## Next Phase Readiness

- **Ready for plan 01-02:** planck@1.5.0 is installed; the buildable shell, strict typecheck gate, and node-env Vitest runner are in place for the engine-agnostic ball/flipper/event interface + Planck adapter + fixed-120Hz loop + smoke test.
- **Sandbox entry stub** exists so plan 01-03's debug sandbox has a mount point.
- **Open item to ratify:** TypeScript is pinned to 5.9.3, not 7.0.2 (see Deviations #1). Confirm at the next gate, or decide to revisit when `@typescript-eslint` supports TS 7.

## Self-Check: PASSED

All 10 scaffold files + this SUMMARY exist on disk; Task 2 commit `cd390da` is present in git history.

---
*Phase: 01-physics-core-spike*
*Completed: 2026-07-15*
