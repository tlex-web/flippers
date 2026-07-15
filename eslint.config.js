import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

// Flat ESLint config (ESLint 9). Type-aware linting is deliberately NOT enabled
// yet (no `parserOptions.project`) — the non-type-checked `recommended` ruleset
// is enough for the scaffold and keeps lint fast. Formatting is owned by
// Prettier (.prettierrc.json), so no stylistic rules live here.
export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
];
