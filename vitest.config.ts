import { defineConfig, configDefaults } from "vitest/config";

// Headless test runner for the physics gate + harness (plans 01-05 / 01-06).
// The soak gate and containment invariants are numeric/deterministic, so a
// plain `node` environment is used — no DOM is needed for the headless proof.
//
// The DEFAULT run (`npm test`) stays fast by EXCLUDING the full >=10-minute
// soak gate (`**/*.gate.test.ts`); that gate runs only via `npm run soak`
// (which points Vitest at a dedicated config, `vitest.gate.config.ts`). The
// fast bounded-green soak + CCD-off negative control live in `*.test.ts` and DO
// run here. `passWithNoTests` keeps the scaffold green before any test exists.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.gate.test.ts"],
    passWithNoTests: true,
    // The 5 s default testTimeout stays, so a hung fast unit test fails fast.
    // The heavy simulation suites (determinism, e2e, soak, loop-flipper) raise
    // their own limit to 30 s with vi.setConfig (05-REVIEW IN-07; they timed out
    // at 5 s under load, todo 2026-11-21-give-heavy-simulation-tests-an-explicit-timeout).
  },
});
