import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "artifacts", "verify");

const blockedFeatures = [
  "distribution",
  "negotiation",
  "mandate",
  "approval",
  "transcript",
  "log",
  "mcp",
];

function fail(message) {
  console.error(`doctor: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    command: [command, ...args].join(" "),
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - started,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error === undefined ? undefined : result.error.message,
  };
}

function doctor() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 22) {
    fail(`Node.js >= 22 is required, found ${process.version}`);
  }
  const pnpm = run("pnpm", ["--version"]);
  if (pnpm.exitCode !== 0) {
    fail("pnpm is not available");
  }
  for (const relativePath of ["node_modules/typescript", "node_modules/vitest", "pnpm-lock.yaml"]) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      fail(`missing ${relativePath}. Run pnpm install --frozen-lockfile`);
    }
  }
  const boundaries = run("node", ["scripts/check-boundaries.mjs"]);
  if (boundaries.exitCode !== 0) {
    process.stderr.write(boundaries.stdout);
    process.stderr.write(boundaries.stderr);
    fail("boundary check failed");
  }
  console.log("doctor: ok");
  console.log("doctor: the private localhost trial is not started");
  console.log(`doctor: pnpm ${pnpm.stdout.trim()}`);
}

function drive() {
  const startedAt = new Date().toISOString();
  const steps = [
    run("pnpm", ["typecheck"]),
    run("pnpm", ["lint"]),
    run("pnpm", ["boundaries"]),
    run("pnpm", ["guardrails"]),
    run("pnpm", ["test"]),
    run("pnpm", ["conformance"]),
  ];
  const ok = steps.every((step) => step.exitCode === 0);
  const finishedAt = new Date().toISOString();
  const stamp = startedAt.replaceAll(":", "").replaceAll(".", "");
  const directory = path.join(evidenceRoot, `${stamp}-${String(process.pid)}`);
  fs.mkdirSync(directory, { recursive: true });
  const evidence = {
    skill: "verify-ix-node",
    mode: "drive",
    startedAt,
    finishedAt,
    node: process.version,
    protocolFeaturesDriven: [],
    blockedFeatures,
    conformance: "partial-items-3-5-pass-signatures-pending",
    ok,
    steps: steps.map((step) => ({
      command: step.command,
      exitCode: step.exitCode,
      signal: step.signal,
      durationMs: step.durationMs,
      error: step.error ?? null,
    })),
  };
  fs.writeFileSync(path.join(directory, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  const output = steps
    .map((step) => `$ ${step.command}\n${step.stdout}${step.stderr}`)
    .join("\n");
  fs.writeFileSync(path.join(directory, "output.txt"), output);
  console.log(`evidence: ${directory}`);
  console.log(`drive: ${ok ? "ok" : "failed"}`);
  console.log("drive: listening trial was not started; conformance items 3-5 pass without signature checks");
  if (!ok) {
    process.exit(1);
  }
}

function cleanup() {
  console.log("cleanup: no node process was started");
  console.log(`cleanup: evidence kept under ${evidenceRoot}`);
}

const command = process.argv[2];
if (command === "doctor") {
  doctor();
} else if (command === "drive") {
  drive();
} else if (command === "cleanup") {
  cleanup();
} else {
  console.error("usage: node scripts/verify-ix-node.mjs <doctor|drive|cleanup>");
  process.exit(1);
}
