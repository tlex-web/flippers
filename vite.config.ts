import { defineConfig } from "vite";

// Sandbox dev server + production bundle config.
// The physics sandbox entry is index.html -> src/sandbox/main.ts.
// Vite transpiles TypeScript with esbuild and does NOT type-check;
// `tsc --noEmit` (npm run typecheck / build) is the separate type gate.
export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,
  },
});
