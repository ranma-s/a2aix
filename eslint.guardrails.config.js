import tseslint from "typescript-eslint";
import { ixPlugin, typeGuardRules } from "./scripts/type-guard-rules.mjs";

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "artifacts/**", "coverage/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      ix: ixPlugin,
    },
    rules: typeGuardRules,
  },
  {
    files: ["**/*.mjs", "eslint.config.js", "eslint.guardrails.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      ix: ixPlugin,
    },
    rules: {
      "ix/no-code-comments": "error",
    },
  },
];
