import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import productionConfig from "../eslint.config.js";
import guardrailConfig from "../eslint.guardrails.config.js";
import { checkRepository, runSelfTest } from "./boundaries-lib.mjs";
import { sourceCommentBanFiles, typeGuardRules } from "./type-guard-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function problem(message) {
  failures.push(message);
}

function filesOf(block) {
  if (block.files === undefined) {
    return [];
  }
  const files = Array.isArray(block.files) ? block.files : [block.files];
  return files.map(String);
}

function relativePath(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function matchesBan(pattern, fileName) {
  if (pattern === "packages/**/*.ts") {
    return fileName.startsWith("packages/") && fileName.endsWith(".ts");
  }
  if (pattern === "scripts/**/*.mjs") {
    return fileName.startsWith("scripts/") && fileName.endsWith(".mjs");
  }
  if (
    pattern === "vitest.config.ts" ||
    pattern === "vitest.conformance.config.ts" ||
    pattern === "eslint.config.js" ||
    pattern === "eslint.guardrails.config.js"
  ) {
    return pattern === fileName;
  }
  return true;
}

const lintFailures = new Map([
  ["fixtures/guardrails/lint/explicit-any.ts", "@typescript-eslint/no-explicit-any"],
  ["fixtures/guardrails/lint/type-assertion.ts", "@typescript-eslint/consistent-type-assertions"],
  [
    "fixtures/guardrails/lint/angle-type-assertion.ts",
    "@typescript-eslint/consistent-type-assertions",
  ],
  [
    "fixtures/guardrails/lint/non-null-assertion.ts",
    "@typescript-eslint/no-non-null-assertion",
  ],
  ["fixtures/guardrails/lint/ts-ignore.ts", "@typescript-eslint/ban-ts-comment"],
  ["fixtures/guardrails/lint/code-comment.ts", "ix/no-code-comments"],
  ["fixtures/guardrails/lint/spdx-line-comment.ts", "ix/no-code-comments"],
  ["fixtures/guardrails/lint/spdx-not-leading.ts", "ix/no-code-comments"],
  ["fixtures/guardrails/lint/spdx-extra-text.ts", "ix/no-code-comments"],
  ["fixtures/guardrails/lint/starred-spdx-header.ts", "ix/no-code-comments"],
  ["fixtures/guardrails/lint/spdx-mit.ts", "ix/no-code-comments"],
]);

const mustPass = [
  "fixtures/guardrails/lint/license-header-ok.ts",
  "fixtures/guardrails/lint/const-assertion-ok.ts",
  "fixtures/guardrails/lint/clean.ts",
  "fixtures/guardrails/lint/shebang-and-header.mjs",
  "fixtures/guardrails/boundaries/core-imports-adapter/packages/core-pkg/src/index.ts",
  "fixtures/guardrails/boundaries/core-imports-app/packages/core-pkg/src/index.ts",
  "fixtures/guardrails/boundaries/legal-core-imports-core/packages/user/src/index.ts",
  "packages/config/src/index.ts",
  "packages/jcs/src/index.ts",
  "scripts/check-boundaries.mjs",
  "scripts/prove-guardrails.mjs",
  "scripts/license-header.mjs",
  "eslint.config.js",
  "eslint.guardrails.config.js",
  "vitest.config.ts",
  "vitest.conformance.config.ts",
];

const docPaths = [
  "docs/team.md",
  "docs/spec/ix-spec-v0.3.md",
  "AGENTS.md",
  "README.md",
  "LICENSE",
  "NOTICE",
  "decisions.tsv",
  "fixtures/guardrails/docs-are-exempt.md",
  "policy/boundaries.json",
  "pnpm-workspace.yaml",
];

function assertProductionConfig() {
  const ignores = productionConfig.flatMap((block) => block.ignores ?? []);
  if (!ignores.includes("fixtures/**")) {
    problem("eslint.config.js must globally ignore fixtures/**");
  }
  const guardIgnores = guardrailConfig.flatMap((block) => block.ignores ?? []);
  if (guardIgnores.some((pattern) => String(pattern).includes("fixtures"))) {
    problem("eslint.guardrails.config.js must lint fixtures");
  }
  const commentFiles = [
    ...new Set(
      productionConfig
        .filter((block) => block.rules?.["ix/no-code-comments"] === "error")
        .flatMap(filesOf),
    ),
  ].sort();
  const expected = [...sourceCommentBanFiles].sort();
  if (commentFiles.join("\n") !== expected.join("\n")) {
    problem(
      `comment ban files differ. actual: ${commentFiles.join(", ")}. expected: ${expected.join(", ")}`,
    );
  }
  const packageBlock = productionConfig.find(
    (block) =>
      filesOf(block).includes("packages/**/*.ts") &&
      block.rules?.["ix/no-code-comments"] === "error",
  );
  if (packageBlock === undefined) {
    const summary = productionConfig.map((block) => ({
      files: filesOf(block),
      rules: block.rules === undefined ? [] : Object.keys(block.rules),
    }));
    problem(`missing packages lint block ${JSON.stringify(summary)}`);
    return;
  }
  for (const [ruleId, setting] of Object.entries(typeGuardRules)) {
    const actual = packageBlock.rules?.[ruleId];
    if (JSON.stringify(actual) !== JSON.stringify(setting)) {
      problem(
        `packages lint block rule ${ruleId} is ${JSON.stringify(actual)}, expected ${JSON.stringify(setting)}`,
      );
    }
  }
  for (const docPath of docPaths) {
    const matched = commentFiles.filter((pattern) => matchesBan(pattern, docPath));
    if (matched.length > 0) {
      problem(`${docPath} matches the comment ban (${matched.join(", ")})`);
    }
  }
}

function assertExcludedFromNormalBuild() {
  const tsconfig = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8"));
  const exclude = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : [];
  if (!exclude.includes("fixtures")) {
    problem("tsconfig.json exclude must include fixtures");
  }
  const include = Array.isArray(tsconfig.include) ? tsconfig.include.join("\n") : "";
  if (include.includes("fixtures")) {
    problem("tsconfig.json include must not list fixtures");
  }
  for (const fileName of ["vitest.config.ts", "vitest.conformance.config.ts"]) {
    const text = fs.readFileSync(path.join(root, fileName), "utf8");
    if (!text.includes('"fixtures/**"')) {
      problem(`${fileName} must exclude fixtures/**`);
    }
  }
  const workspace = fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
  if (workspace.includes("fixtures")) {
    problem("pnpm-workspace.yaml must not include fixtures");
  }
  if (!workspace.includes("packages/*")) {
    problem("pnpm-workspace.yaml must keep the packages/* workspace");
  }
  const doc = fs.readFileSync(
    path.join(root, "fixtures/guardrails/docs-are-exempt.md"),
    "utf8",
  );
  for (const token of ["//", "/*", ": any", "as number"]) {
    if (!doc.includes(token)) {
      problem(`docs-are-exempt.md must contain ${JSON.stringify(token)}`);
    }
  }
}

function assertLayerFixture(label, dirName, fromLayer, toLayer) {
  const violations = checkRepository(path.join(root, "fixtures/guardrails/boundaries", dirName));
  const layers = violations.filter((violation) => violation.reason === "layer");
  const other = violations.filter((violation) => violation.reason !== "layer");
  if (other.length > 0 || layers.length !== 3) {
    problem(
      `${label}: expected exactly 3 layer violations and no others, got ${JSON.stringify(violations)}`,
    );
    return;
  }
  const policyHit = layers.some((violation) => violation.message.includes("policy edge"));
  const sourceHit = layers.some((violation) =>
    violation.message.includes("packages/core-pkg/src/index.ts"),
  );
  const manifestHit = layers.some(
    (violation) =>
      violation.message.includes("cannot depend on") &&
      !violation.message.includes("packages/core-pkg/src/index.ts"),
  );
  const blob = layers.map((violation) => violation.message).join("\n");
  if (!policyHit || !sourceHit || !manifestHit || !blob.includes(fromLayer) || !blob.includes(toLayer)) {
    problem(`${label}: policy, manifest, or source did not report ${fromLayer} -> ${toLayer}: ${blob}`);
    return;
  }
  console.log(`guardrails: ${label} failed as required (3 layer violations)`);
}

function assertBoundaries() {
  assertLayerFixture("core-imports-adapter", "core-imports-adapter", "core", "adapter");
  assertLayerFixture("core-imports-app", "core-imports-app", "core", "app");
  const legal = checkRepository(
    path.join(root, "fixtures/guardrails/boundaries/legal-core-imports-core"),
  );
  if (legal.length > 0) {
    problem(`legal-core-imports-core should pass, got ${JSON.stringify(legal)}`);
  } else {
    console.log("guardrails: legal-core-imports-core passed");
  }
  const real = checkRepository(root);
  if (real.length > 0) {
    problem(`real tree boundary check failed: ${JSON.stringify(real)}`);
  } else {
    console.log("guardrails: real tree dependency check passed");
  }
  const selfTest = runSelfTest();
  if (!selfTest.ok) {
    problem(`boundary self-test failed: ${selfTest.failures.join("\n")}`);
  } else {
    console.log(
      `guardrails: in-memory boundary self-test passed (${String(selfTest.cases)} cases)`,
    );
  }
}

async function assertLint() {
  const production = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: productionConfig,
    allowInlineConfig: false,
    concurrency: "off",
  });
  const dummyPath = path.join(root, "fixtures/guardrails/lint/explicit-any.ts");
  const packagePath = path.join(root, "packages/config/src/index.ts");
  if (!(await production.isPathIgnored(dummyPath))) {
    problem("production eslint must ignore fixtures/guardrails/lint/explicit-any.ts");
  } else {
    console.log("guardrails: production lint ignores the violating fixtures");
  }
  if (await production.isPathIgnored(packagePath)) {
    problem("production eslint must lint packages/config/src/index.ts");
  }
  const guard = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: guardrailConfig,
    allowInlineConfig: false,
    concurrency: "off",
  });
  const results = await guard.lintFiles([
    "**/*.ts",
    "**/*.mjs",
    "eslint.config.js",
    "eslint.guardrails.config.js",
  ]);
  console.log(`guardrails: linted ${String(results.length)} files with the guard rules`);
  const byPath = new Map(results.map((result) => [relativePath(result.filePath), result]));
  if (byPath.has("fixtures/guardrails/docs-are-exempt.md")) {
    problem("docs-are-exempt.md was linted; markdown stays outside the comment ban");
  }
  for (const [fileName, ruleId] of lintFailures) {
    const result = byPath.get(fileName);
    if (result === undefined) {
      problem(`${fileName} was not linted`);
      continue;
    }
    const rules = result.messages.map((message) => message.ruleId);
    if (!rules.includes(ruleId) || result.errorCount < 1) {
      problem(`${fileName}: expected ${ruleId}, got ${JSON.stringify(result.messages)}`);
      continue;
    }
    console.log(`guardrails: ${fileName} failed as required (${ruleId})`);
  }
  for (const fileName of mustPass) {
    const result = byPath.get(fileName);
    if (result === undefined) {
      problem(`${fileName} was not linted, so a pass was not proven`);
      continue;
    }
    if (result.errorCount > 0 || result.fatalErrorCount > 0) {
      problem(`${fileName} should pass, got ${JSON.stringify(result.messages)}`);
      continue;
    }
    console.log(`guardrails: ${fileName} passed`);
  }
  for (const [fileName, result] of byPath) {
    if (lintFailures.has(fileName)) {
      continue;
    }
    if (result.errorCount > 0 || result.fatalErrorCount > 0) {
      problem(
        `unexpected guardrail failure in ${fileName}: ${JSON.stringify(result.messages)}`,
      );
    }
  }
}

assertProductionConfig();
assertExcludedFromNormalBuild();
assertBoundaries();
await assertLint();

if (failures.length > 0) {
  console.error(`guardrails: failed (${String(failures.length)})`);
  for (const message of failures) {
    console.error(message);
  }
  process.exit(1);
}

console.log("guardrails: ok");
