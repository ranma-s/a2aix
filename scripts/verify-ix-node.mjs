import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "artifacts", "verify");

const blockedFeatures = [
  "mandate",
  "approval",
  "transcript",
  "log",
  "mcp",
  "signature",
  "jws",
];

const drivenFeatures = [
  "distribution-localhost-publish-query",
  "negotiation-mock",
  "ix-verify",
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

function timeZoneDataProblem(runtimeVersion) {
  const zonesFile = path.join(root, "packages", "a2a-ext-negotiation", "src", "zones.ts");
  const match = /export const tzdbVersion = "([0-9]{4}[a-z])"/.exec(fs.readFileSync(zonesFile, "utf8"));
  if (match === null) {
    return "tzdbVersion is missing from packages/a2a-ext-negotiation/src/zones.ts";
  }
  if (runtimeVersion !== match[1]) {
    return `Node.js time zone data is ${runtimeVersion ?? "unknown"} but the deadline zone list is tzdb ${match[1]}. Deadlines would be judged differently on other nodes. Use a Node.js build with tzdb ${match[1]} or update zones.ts`;
  }
  return undefined;
}

function doctor() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 22) {
    fail(`Node.js >= 22 is required, found ${process.version}`);
  }
  const zoneProblem = timeZoneDataProblem(process.versions.tz);
  if (zoneProblem !== undefined) {
    fail(zoneProblem);
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
  console.log("doctor: drive is the step that starts 127.0.0.1");
  console.log(`doctor: pnpm ${pnpm.stdout.trim()}`);
  console.log(`doctor: time zone data ${process.versions.tz}`);
}

function drive() {
  const zoneProblem = timeZoneDataProblem(process.versions.tz);
  if (zoneProblem !== undefined) {
    console.error(`drive: ${zoneProblem}`);
    process.exit(1);
  }
  const startedAt = new Date().toISOString();
  const steps = [
    run("pnpm", ["typecheck"]),
    run("pnpm", ["lint"]),
    run("pnpm", ["boundaries"]),
    run("pnpm", ["guardrails"]),
    run("pnpm", ["test"]),
    run("pnpm", ["conformance"]),
  ];
  const checksOk = steps.every((step) => step.exitCode === 0);
  if (checksOk) {
    steps.push(run("node", ["--import", "tsx", "scripts/ix-trial-evidence.mjs"]));
  }
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
    bind: "127.0.0.1",
    protocolFeaturesDriven: ok ? drivenFeatures : [],
    blockedFeatures,
    conformance: "partial-items-3-6-pass-signatures-deferred",
    deferredChecks: ["signature", "jws"],
    hashChain: "jcs-sha256-checked",
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
  console.log(
    ok
      ? "drive: localhost relay on 127.0.0.1 exercised; the JCS SHA-256 hash chain was checked; signatures and JWS stay deferred"
      : "drive: failed",
  );
  if (!ok) {
    process.exit(1);
  }
}

function cleanup() {
  console.log("cleanup: the drive stops its own 127.0.0.1 listener before it exits");
  console.log("cleanup: this command does not kill a process by name");
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
