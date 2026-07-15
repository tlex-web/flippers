import { defineConfig } from "vitest/config";

// Headless test runner for the physics gate + harness (plans 01-05 / 01-06).
// The soak gate and containment invariants are numeric/deterministic, so a
// plain `node` environment is used — no DOM is needed for the headless proof.
// `passWithNoTests` keeps the scaffold green until plan 01-02 adds the first
// smoke test.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,gate.test}.ts"],
    passWithNoTests: true,
  },
});
