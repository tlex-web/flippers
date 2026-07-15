import { defineConfig } from "vitest/config";

// Dedicated runner for the >=10-minute tunnel-proof SOAK GATE (`npm run soak`).
// The default config (vitest.config.ts) EXCLUDES `**/*.gate.test.ts` to keep
// `npm test` fast, so the gate needs its own include here. This is the sole
// pass/fail gate for PHYS-02 (D-03): it runs >=600s of SIMULATED fixed-step
// time and exits non-zero on any escape, printing the replayable seed(s).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.gate.test.ts"],
  },
});
