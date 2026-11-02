import { ixPlugin } from "./no-code-comments.mjs";

export { ixPlugin };

export const sourceCommentBanFiles = [
  "packages/**/*.ts",
  "vitest.config.ts",
  "vitest.conformance.config.ts",
  "scripts/**/*.mjs",
  "eslint.config.js",
  "eslint.guardrails.config.js",
];

export const typeGuardRules = {
  "@typescript-eslint/consistent-type-assertions": [
    "error",
    { assertionStyle: "never" },
  ],
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-expect-error": true,
      "ts-ignore": true,
      "ts-nocheck": true,
      "ts-check": true,
    },
  ],
  "ix/no-code-comments": "error",
};
