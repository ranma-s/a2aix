import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { ixPlugin, sourceCommentBanFiles, typeGuardRules } from "./scripts/type-guard-rules.mjs";

const typeFiles = sourceCommentBanFiles.filter((pattern) => pattern.endsWith(".ts"));
const scriptFiles = sourceCommentBanFiles.filter((pattern) => !pattern.endsWith(".ts"));

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "artifacts/**", "pnpm-lock.yaml", "fixtures/**"],
  },
  {
    files: scriptFiles,
    extends: [eslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      ix: ixPlugin,
    },
    rules: {
      "ix/no-code-comments": "error",
    },
  },
  {
    files: ["scripts/browser/entry.mjs"],
    languageOptions: {
      globals: {
        document: "readonly",
      },
    },
  },
  {
    files: typeFiles,
    extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      ix: ixPlugin,
    },
    rules: {
      ...typeGuardRules,
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
          message:
            "Do not canonicalize with JSON.stringify. Use canonicalize from @ix/jcs. Hashing and signing go through that function only.",
        },
      ],
    },
  },
  {
    files: ["packages/jcs/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
);
