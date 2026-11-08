import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkResultFiles, evaluateRequest, gateFromFiles, parseStrictJson, sha256Buffer } from "./ix-job.mjs";

const scriptPath = fileURLToPath(new URL("./ix-job.mjs", import.meta.url));
const root = path.resolve(path.dirname(scriptPath), "..");
const sourceSha = "bd3dbe4eff2cfa0e34989b718fe6c7eadb4eb77e";

function stage(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ix-job-"));
  const prompt = "prompt text\n";
  const output = "export const sample = 1;\n";
  const rel = "packages/agents/test/example.test.ts";
  fs.mkdirSync(path.join(dir, "evidence", "packages", "agents", "test"), { recursive: true });
  fs.writeFileSync(path.join(dir, "prompt.txt"), prompt);
  fs.writeFileSync(path.join(dir, "evidence", rel), output);
  const request = {
    allowedPaths: [rel],
    jobId: "job-1",
    mode: "implement",
    model: { name: "claude-code", options: { turns: 1 } },
    outputLimits: { maxBytes: 4000, maxFiles: 2 },
    promptSha256: sha256Buffer(Buffer.from(prompt)),
    risk: "non-security",
    sourceSha,
  };
  const result = {
    execution: {
      exitCode: 0,
      files: [{ bytes: Buffer.byteLength(output), path: rel, sha256: sha256Buffer(Buffer.from(output)) }],
      runner: "repo-test",
      sourceSha,
    },
    jobId: "job-1",
    modelClaim: { status: "pass", text: "claimed" },
    producer: "claude-code",
    requestSha256: "a".repeat(64),
    reviewedSha: sourceSha,
    sourceSha,
  };
  const bag = { dir, request, result, rel, keepHash: false };
  if (mutate !== undefined) {
    mutate(bag);
  }
  const requestPath = path.join(dir, "request.json");
  const resultPath = path.join(dir, "result.json");
  fs.writeFileSync(requestPath, `${JSON.stringify(bag.request)}\n`);
  if (!bag.keepHash) {
    bag.result.requestSha256 = sha256Buffer(fs.readFileSync(requestPath));
  }
  fs.writeFileSync(resultPath, `${JSON.stringify(bag.result)}\n`);
  return {
    dir,
    requestPath,
    resultPath,
    promptPath: path.join(dir, "prompt.txt"),
    evidencePath: path.join(dir, "evidence"),
  };
}

function gate(staged, extra = {}) {
  return gateFromFiles({
    requestPath: staged.requestPath,
    resultPath: staged.resultPath,
    evidencePath: staged.evidencePath,
    promptPath: staged.promptPath,
    ...extra,
  });
}

function runCli(args) {
  const run = spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
  return { status: run.status, parsed: parseStrictJson(run.stdout) };
}

test("a matching implement ticket gates on execution evidence", () => {
  const outcome = gate(stage());
  assert.equal(outcome.status, "gated");
  assert.equal(outcome.verdictSource, "execution-evidence");
  assert.equal(outcome.reasons.length, 0);
});

test("check-result does not treat a model pass as a verdict", () => {
  const staged = stage();
  const outcome = checkResultFiles(staged.requestPath, staged.resultPath);
  assert.equal(outcome.status, "result-shape-ok");
  assert.equal(outcome.verdictSource, "none");
  assert.equal(outcome.modelClaimStatus, "pass");
  assert.deepEqual(outcome.warnings, ["shape-is-not-a-verdict"]);
});

test("a model pass with a failing execution is rejected", () => {
  const outcome = gate(stage(({ result }) => {
    result.execution.exitCode = 1;
  }));
  assert.equal(outcome.status, "rejected");
  assert.deepEqual(outcome.reasons, ["execution-failed"]);
  assert.deepEqual(outcome.warnings, ["model-claim-differs"]);
});

test("schema damage is an error, not a found bug", () => {
  const outcome = gate(stage(({ result }) => {
    result.execution.exitCode = 1.5;
  }));
  assert.equal(outcome.status, "error");
  assert.deepEqual(outcome.reasons, ["bad-type"]);
});

test("unknown command and executable fields are rejected", () => {
  const staged = stage(({ request }) => {
    request.command = "node evil.mjs";
  });
  const outcome = gate(staged);
  assert.equal(outcome.status, "error");
  assert.deepEqual(outcome.reasons, ["unknown-field"]);
  const usage = runCli(["run-tests"]);
  assert.equal(usage.status, 1);
  assert.deepEqual(usage.parsed.reasons, ["usage"]);
});

test("duplicate keys are an error", () => {
  assert.throws(() => parseStrictJson('{"a":1,"a":2}'), (error) => error.reason === "duplicate-key");
});

test("a proto key does not change object prototype", () => {
  parseStrictJson('{"__proto__":{"polluted":true}}');
  assert.equal(Object.prototype.polluted, undefined);
});

test("risk is not a security proof and high-risk paths stay closed", () => {
  const opened = evaluateRequest({
    allowedPaths: ["packages/identity/src/index.ts"],
    jobId: "job-1",
    mode: "implement",
    model: { name: "claude-code", options: {} },
    outputLimits: { maxBytes: 100, maxFiles: 1 },
    promptSha256: "a".repeat(64),
    risk: "non-security",
    sourceSha,
  });
  assert.equal(opened.status, "rejected");
  assert.deepEqual(opened.reasons, ["forbidden-path"]);
  const named = evaluateRequest({
    allowedPaths: ["packages/agents/test/example.test.ts"],
    jobId: "job-1",
    mode: "implement",
    model: { name: "claude-code", options: {} },
    outputLimits: { maxBytes: 100, maxFiles: 1 },
    promptSha256: "a".repeat(64),
    risk: "security",
    sourceSha,
  });
  assert.equal(named.status, "error");
  assert.deepEqual(named.reasons, ["bad-risk"]);
});

test("traversal, absolute paths, and a nearby name are classified", () => {
  const base = {
    jobId: "job-1",
    mode: "implement",
    model: { name: "claude-code", options: {} },
    outputLimits: { maxBytes: 100, maxFiles: 1 },
    promptSha256: "b".repeat(64),
    risk: "non-security",
    sourceSha,
  };
  assert.equal(evaluateRequest({ ...base, allowedPaths: ["../etc/passwd"] }).reasons[0], "bad-path");
  assert.equal(evaluateRequest({ ...base, allowedPaths: ["/tmp/x"] }).reasons[0], "bad-path");
  assert.equal(evaluateRequest({ ...base, allowedPaths: ["packages/jcs-extra/file.ts"] }).ok, true);
});

test("a stale reviewed sha or head is not a pass", () => {
  const reviewed = gate(stage(({ result }) => {
    result.reviewedSha = "a".repeat(40);
  }));
  assert.equal(reviewed.status, "review-invalid");
  assert.equal(reviewed.freshness, "stale");
  const head = gate(stage(), { head: "c".repeat(40) });
  assert.equal(head.status, "review-invalid");
  assert.deepEqual(head.reasons, ["stale-head"]);
});

test("symlink, extra output, and hash mismatch are rejected", () => {
  const linked = stage(({ dir, rel }) => {
    fs.symlinkSync(path.join(dir, "evidence", rel), path.join(dir, "evidence", "link.ts"));
  });
  assert.deepEqual(gate(linked).reasons, ["evidence-symlink"]);
  const extra = stage(({ dir }) => {
    fs.writeFileSync(path.join(dir, "evidence", "extra.txt"), "nope\n");
  });
  assert.deepEqual(gate(extra).reasons, ["evidence-extra"]);
  const mismatch = gate(stage(({ result }) => {
    result.execution.files[0].sha256 = "d".repeat(64);
  }));
  assert.equal(mismatch.status, "rejected");
  assert.deepEqual(mismatch.reasons, ["hash-mismatch"]);
});

test("a file passed as the evidence directory is unsupported", () => {
  const staged = stage();
  const outcome = gateFromFiles({
    requestPath: staged.requestPath,
    resultPath: staged.resultPath,
    evidencePath: staged.promptPath,
    promptPath: staged.promptPath,
  });
  assert.equal(outcome.status, "rejected");
  assert.deepEqual(outcome.reasons, ["evidence-unsupported"]);
});

test("negative counts are ignored until the positive control passes", () => {
  const outcome = gate(stage(({ request, result, dir }) => {
    request.mode = "testgen";
    request.model.name = "qwen2.5-coder:14b";
    const valid = '{"shape":"other"}\n';
    const good = '{"shape":"control"}\n';
    fs.writeFileSync(path.join(dir, "valid.json"), valid);
    fs.writeFileSync(path.join(dir, "good.json"), good);
    request.domain = {
      acceptanceCategory: "custom-shape",
      positiveControlSha256: sha256Buffer(Buffer.from(good)),
      rejectionReason: "custom reason",
      validInputSha256: sha256Buffer(Buffer.from(valid)),
    };
    result.producer = "qwen-14b";
    result.execution.domain = { negativeCount: 4, observedRejectionReason: "custom reason", positiveControlPassed: false };
  }));
  const staged = stage(({ request, result, dir }) => {
    request.mode = "testgen";
    request.model.name = "qwen2.5-coder:14b";
    const valid = '{"shape":"other"}\n';
    const good = '{"shape":"control"}\n';
    fs.writeFileSync(path.join(dir, "valid.json"), valid);
    fs.writeFileSync(path.join(dir, "good.json"), good);
    request.domain = {
      acceptanceCategory: "custom-shape",
      positiveControlSha256: sha256Buffer(Buffer.from(good)),
      rejectionReason: "custom reason",
      validInputSha256: sha256Buffer(Buffer.from(valid)),
    };
    result.producer = "qwen-14b";
    result.execution.domain = { negativeCount: 4, observedRejectionReason: "custom reason", positiveControlPassed: false };
  });
  assert.equal(outcome.status, "error");
  assert.deepEqual(outcome.reasons, ["domain-file-required"]);
  const rejected = gate(staged, { validInputPath: path.join(staged.dir, "valid.json"), positiveControlPath: path.join(staged.dir, "good.json") });
  assert.equal(rejected.status, "rejected");
  assert.deepEqual(rejected.reasons, ["negative-without-positive-control"]);
  assert.equal(rejected.negativeCountIgnored, true);
});

test("a wrong rejection reason is not a positive pass", () => {
  const staged = stage(({ request, result, dir }) => {
    request.mode = "testgen";
    request.model.name = "qwen2.5-coder:14b";
    const valid = '{"shape":"other"}\n';
    const good = '{"shape":"control"}\n';
    fs.writeFileSync(path.join(dir, "valid.json"), valid);
    fs.writeFileSync(path.join(dir, "good.json"), good);
    request.domain = {
      acceptanceCategory: "custom-shape",
      positiveControlSha256: sha256Buffer(Buffer.from(good)),
      rejectionReason: "custom reason",
      validInputSha256: sha256Buffer(Buffer.from(valid)),
    };
    result.producer = "qwen-14b";
    result.execution.domain = { negativeCount: 1, observedRejectionReason: "different reason", positiveControlPassed: true };
  });
  const outcome = gate(staged, {
    validInputPath: path.join(staged.dir, "valid.json"),
    positiveControlPath: path.join(staged.dir, "good.json"),
  });
  assert.equal(outcome.status, "rejected");
  assert.deepEqual(outcome.reasons, ["reason-mismatch"]);
});

test("the same request returns the recorded result and a different body conflicts", () => {
  const staged = stage();
  const ledgerPath = path.join(staged.dir, "ledger.json");
  const first = gate(staged, { ledgerPath, record: true });
  assert.equal(first.status, "gated");
  const again = gate(staged, { ledgerPath });
  assert.equal(again.status, "recorded");
  assert.equal(again.verdictSource, "ledger");
  const other = stage(({ request }) => {
    request.model.options = { turns: 2 };
  });
  const conflict = gate(other, { ledgerPath });
  assert.equal(conflict.status, "rejected");
  assert.deepEqual(conflict.reasons, ["job-id-conflict"]);
});

test("a second result for the same request bytes conflicts", () => {
  const staged = stage();
  const ledgerPath = path.join(staged.dir, "ledger.json");
  assert.equal(gate(staged, { ledgerPath, record: true }).status, "gated");
  const rewritten = stage();
  const parsed = parseStrictJson(fs.readFileSync(rewritten.resultPath, "utf8"));
  parsed.modelClaim.text = "other claim";
  fs.writeFileSync(rewritten.resultPath, `${JSON.stringify(parsed)}\n`);
  const requestText = fs.readFileSync(staged.requestPath);
  fs.writeFileSync(rewritten.requestPath, requestText);
  parsed.requestSha256 = sha256Buffer(requestText);
  fs.writeFileSync(rewritten.resultPath, `${JSON.stringify(parsed)}\n`);
  const outcome = gate(rewritten, { ledgerPath });
  assert.equal(outcome.status, "rejected");
  assert.deepEqual(outcome.reasons, ["duplicate-conflict"]);
});

test("testgen requires a domain and a plan binds files without calling that a test pass", () => {
  const missing = gate(stage(({ request, result }) => {
    request.mode = "testgen";
    request.model.name = "qwen2.5-coder:14b";
    result.producer = "qwen-14b";
  }));
  assert.equal(missing.status, "rejected");
  assert.deepEqual(missing.reasons, ["domain-required"]);
  const planned = gate(stage(({ request, result }) => {
    request.mode = "plan";
    request.model.name = "grok";
    result.producer = "grok-plan";
    result.execution.runner = "none";
  }));
  assert.equal(planned.status, "bound");
  assert.equal(planned.verdictSource, "file-hashes");
});

test("the validator does not embed a domain fixture or a process runner", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.equal(source.includes("manifestSha256"), false);
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("spawn"), false);
});

test("the checked-in example gates only as execution evidence for its own sha", () => {
  const fixture = path.join(root, "automation", "fixtures");
  const outcome = runCli([
    "gate",
    path.join(fixture, "request.json"),
    path.join(fixture, "result.json"),
    "--prompt",
    path.join(fixture, "prompt.txt"),
    "--valid-input",
    path.join(fixture, "valid-input.json"),
    "--positive-control",
    path.join(fixture, "positive-control.json"),
    "--evidence",
    path.join(fixture, "evidence"),
    "--head",
    sourceSha,
  ]);
  assert.equal(outcome.status, 0);
  assert.equal(outcome.parsed.status, "gated");
  assert.equal(outcome.parsed.verdictSource, "execution-evidence");
  assert.equal(outcome.parsed.freshness, "head");
  assert.equal(outcome.parsed.sourceSha, sourceSha);
});
