import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const forbiddenExact = new Set([
  "AGENTS.md",
  "decisions.tsv",
  "packages/a2a-ext-approval",
  "packages/a2a-ext-mandate",
  "packages/approval-app",
  "packages/identity",
  "packages/jcs",
  "packages/log",
  "packages/protocol-core/src/hash-error.ts",
  "packages/protocol-core/src/hash.ts",
  "scripts/ix-job.mjs",
  "scripts/ix-job.test.mjs",
]);

const forbiddenPrefixes = [
  ".github/",
  "packages/a2a-ext-approval/",
  "packages/a2a-ext-mandate/",
  "packages/approval-app/",
  "packages/identity/",
  "packages/jcs/",
  "packages/log/",
];

const producers = {
  plan: "grok-plan",
  implement: "claude-code",
  testgen: "qwen-14b",
  "log-classify": "qwen-14b",
};

const schemaReasons = new Set([
  "bad-limit",
  "bad-mode",
  "domain-file-required",
  "bad-path",
  "bad-risk",
  "bad-sha",
  "bad-type",
  "duplicate-key",
  "duplicate-path",
  "invalid-json",
  "ledger-duplicate",
  "ledger-unreadable",
  "usage",
  "unknown-field",
]);

export function sha256Buffer(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function failParse(reason) {
  const error = new Error(reason);
  error.reason = reason;
  throw error;
}

export function parseStrictJson(text) {
  let index = 0;

  function skip() {
    while (index < text.length) {
      const char = text[index];
      if (char !== " " && char !== "\n" && char !== "\r" && char !== "\t") {
        return;
      }
      index += 1;
    }
  }

  function parseValue() {
    skip();
    if (index >= text.length) {
      failParse("invalid-json");
    }
    const char = text[index];
    if (char === "{") {
      return parseObject();
    }
    if (char === "[") {
      return parseArray();
    }
    if (char === '"') {
      return parseString();
    }
    if (char === "t") {
      return parseLiteral("true", true);
    }
    if (char === "f") {
      return parseLiteral("false", false);
    }
    if (char === "n") {
      return parseLiteral("null", null);
    }
    if (char === "-" || (char >= "0" && char <= "9")) {
      return parseNumber();
    }
    failParse("invalid-json");
  }

  function parseLiteral(word, value) {
    if (text.slice(index, index + word.length) !== word) {
      failParse("invalid-json");
    }
    index += word.length;
    return value;
  }

  function parseString() {
    if (text[index] !== '"') {
      failParse("invalid-json");
    }
    index += 1;
    let out = "";
    while (index < text.length) {
      const char = text[index];
      if (char === '"') {
        index += 1;
        return out;
      }
      if (char === "\\") {
        const escaped = text[index + 1];
        if (escaped === undefined) {
          failParse("invalid-json");
        }
        if (escaped === "u") {
          const hex = text.slice(index + 2, index + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            failParse("invalid-json");
          }
          out += String.fromCharCode(Number.parseInt(hex, 16));
          index += 6;
          continue;
        }
        const simple = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (!Object.hasOwn(simple, escaped)) {
          failParse("invalid-json");
        }
        out += simple[escaped];
        index += 2;
        continue;
      }
      if (char.charCodeAt(0) < 0x20) {
        failParse("invalid-json");
      }
      out += char;
      index += 1;
    }
    failParse("invalid-json");
  }

  function parseNumber() {
    const start = index;
    if (text[index] === "-") {
      index += 1;
    }
    if (text[index] === "0") {
      index += 1;
    } else if (text[index] >= "1" && text[index] <= "9") {
      while (text[index] >= "0" && text[index] <= "9") {
        index += 1;
      }
    } else {
      failParse("invalid-json");
    }
    if (text[index] === ".") {
      index += 1;
      if (!(text[index] >= "0" && text[index] <= "9")) {
        failParse("invalid-json");
      }
      while (text[index] >= "0" && text[index] <= "9") {
        index += 1;
      }
    }
    if (text[index] === "e" || text[index] === "E") {
      index += 1;
      if (text[index] === "+" || text[index] === "-") {
        index += 1;
      }
      if (!(text[index] >= "0" && text[index] <= "9")) {
        failParse("invalid-json");
      }
      while (text[index] >= "0" && text[index] <= "9") {
        index += 1;
      }
    }
    const value = Number(text.slice(start, index));
    if (!Number.isFinite(value)) {
      failParse("invalid-json");
    }
    return value;
  }

  function parseArray() {
    index += 1;
    const items = [];
    skip();
    if (text[index] === "]") {
      index += 1;
      return items;
    }
    while (index < text.length) {
      items.push(parseValue());
      skip();
      if (text[index] === "]") {
        index += 1;
        return items;
      }
      if (text[index] !== ",") {
        failParse("invalid-json");
      }
      index += 1;
    }
    failParse("invalid-json");
  }

  function parseObject() {
    index += 1;
    const obj = Object.create(null);
    const keys = new Set();
    skip();
    if (text[index] === "}") {
      index += 1;
      return obj;
    }
    while (index < text.length) {
      skip();
      const key = parseString();
      if (keys.has(key)) {
        failParse("duplicate-key");
      }
      keys.add(key);
      skip();
      if (text[index] !== ":") {
        failParse("invalid-json");
      }
      index += 1;
      obj[key] = parseValue();
      skip();
      if (text[index] === "}") {
        index += 1;
        return obj;
      }
      if (text[index] !== ",") {
        failParse("invalid-json");
      }
      index += 1;
    }
    failParse("invalid-json");
  }

  const value = parseValue();
  skip();
  if (index !== text.length) {
    failParse("invalid-json");
  }
  return value;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isObject(value)) {
    return false;
  }
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

function isBoundedInt(value, min, max) {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max;
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isCommitSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function isJobId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,62}$/.test(value);
}

export function normalizeRepoPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    return undefined;
  }
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0") || value.includes(":")) {
    return undefined;
  }
  const parts = value.split("/");
  for (const part of parts) {
    if (part.length === 0 || part === "." || part === ".." || part !== part.trim()) {
      return undefined;
    }
    for (let offset = 0; offset < part.length; offset += 1) {
      const code = part.charCodeAt(offset);
      if (code < 0x20 || code === 0x7f) {
        return undefined;
      }
    }
  }
  return value;
}

function pathClass(value) {
  const normalized = normalizeRepoPath(value);
  if (normalized === undefined) {
    return "bad-path";
  }
  if (forbiddenExact.has(normalized)) {
    return "forbidden-path";
  }
  for (const prefix of forbiddenPrefixes) {
    if (normalized.startsWith(prefix)) {
      return "forbidden-path";
    }
  }
  return undefined;
}

function finishShape(status, reasons, fields) {
  const outcome = {
    status,
    reasons,
    warnings: fields.warnings ?? [],
    verdictSource: fields.verdictSource,
  };
  for (const key of ["requestSha256", "resultSha256", "sourceSha", "reviewedSha", "modelClaimStatus", "executionExitCode", "freshness", "negativeCountIgnored"]) {
    if (fields[key] !== undefined) {
      outcome[key] = fields[key];
    }
  }
  return outcome;
}

function errorOutcome(reasons, fields = {}) {
  return finishShape("error", reasons, { ...fields, verdictSource: "schema" });
}

function readText(filePath) {
  try {
    return { ok: true, text: fs.readFileSync(filePath, "utf8"), bytes: fs.readFileSync(filePath) };
  } catch {
    return { ok: false };
  }
}

function hashRegularFile(filePath, symlinkReason, unsupportedReason, missingReason) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    return { ok: false, reasons: [missingReason] };
  }
  if (stat.isSymbolicLink()) {
    return { ok: false, reasons: [symlinkReason] };
  }
  if (!stat.isFile()) {
    return { ok: false, reasons: [unsupportedReason] };
  }
  if (stat.size > 200000) {
    return { ok: false, reasons: ["over-limit"] };
  }
  return { ok: true, sha256: sha256Buffer(fs.readFileSync(filePath)), bytes: stat.size };
}

function checkOptions(value) {
  if (!isObject(value)) {
    return "bad-type";
  }
  const keys = Object.keys(value);
  if (keys.length > 8) {
    return "bad-limit";
  }
  for (const key of keys) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(key)) {
      return "bad-type";
    }
    const item = value[key];
    const kind = typeof item;
    if (kind === "string") {
      if (item.length > 200) {
        return "bad-limit";
      }
    } else if (kind === "number") {
      if (!isBoundedInt(item, -1000000, 1000000)) {
        return "bad-type";
      }
    } else if (kind === "boolean") {
      continue;
    } else {
      return "bad-type";
    }
  }
  return undefined;
}

function checkDomain(value) {
  if (!exactKeys(value, ["acceptanceCategory", "positiveControlSha256", "rejectionReason", "validInputSha256"])) {
    return "unknown-field";
  }
  if (typeof value.acceptanceCategory !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value.acceptanceCategory)) {
    return "bad-type";
  }
  if (!isSha256(value.validInputSha256) || !isSha256(value.positiveControlSha256)) {
    return "bad-sha";
  }
  if (typeof value.rejectionReason !== "string" || value.rejectionReason.length < 1 || value.rejectionReason.length > 200) {
    return "bad-type";
  }
  return undefined;
}

export function evaluateRequest(value) {
  if (!isObject(value)) {
    return errorOutcome(["bad-type"]);
  }
  const keys = ["allowedPaths", "jobId", "mode", "model", "outputLimits", "promptSha256", "risk", "sourceSha"];
  if (Object.hasOwn(value, "domain")) {
    keys.push("domain");
  }
  if (!exactKeys(value, keys)) {
    return errorOutcome(["unknown-field"]);
  }
  if (!isJobId(value.jobId)) {
    return errorOutcome(["bad-type"]);
  }
  if (!isCommitSha(value.sourceSha) || !isSha256(value.promptSha256)) {
    return errorOutcome(["bad-sha"]);
  }
  if (!Object.hasOwn(producers, value.mode)) {
    return errorOutcome(["bad-mode"]);
  }
  if (value.risk !== "non-security") {
    return errorOutcome(["bad-risk"]);
  }
  if (!exactKeys(value.model, ["name", "options"])) {
    return errorOutcome(["unknown-field"]);
  }
  if (typeof value.model.name !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(value.model.name)) {
    return errorOutcome(["bad-type"]);
  }
  const optionsProblem = checkOptions(value.model.options);
  if (optionsProblem !== undefined) {
    return errorOutcome([optionsProblem]);
  }
  if (!exactKeys(value.outputLimits, ["maxBytes", "maxFiles"])) {
    return errorOutcome(["unknown-field"]);
  }
  if (!isBoundedInt(value.outputLimits.maxFiles, 1, 20) || !isBoundedInt(value.outputLimits.maxBytes, 1, 200000)) {
    return errorOutcome(["bad-limit"]);
  }
  if (!Array.isArray(value.allowedPaths) || value.allowedPaths.length < 1 || value.allowedPaths.length > value.outputLimits.maxFiles) {
    return errorOutcome(["bad-limit"]);
  }
  const seen = new Set();
  for (const entry of value.allowedPaths) {
    const problem = pathClass(entry);
    if (problem === "bad-path") {
      return errorOutcome(["bad-path"]);
    }
    if (problem === "forbidden-path") {
      return finishShape("rejected", ["forbidden-path"], { verdictSource: "contract", sourceSha: value.sourceSha });
    }
    if (seen.has(entry)) {
      return errorOutcome(["duplicate-path"]);
    }
    seen.add(entry);
  }
  if (value.mode === "plan" && Object.hasOwn(value, "domain")) {
    return finishShape("rejected", ["domain-unexpected"], { verdictSource: "contract", sourceSha: value.sourceSha });
  }
  if (value.mode === "testgen" && !Object.hasOwn(value, "domain")) {
    return finishShape("rejected", ["domain-required"], { verdictSource: "contract", sourceSha: value.sourceSha });
  }
  if (Object.hasOwn(value, "domain")) {
    const domainProblem = checkDomain(value.domain);
    if (domainProblem !== undefined) {
      return errorOutcome([domainProblem]);
    }
  }
  return { ok: true, request: value };
}

function checkExecutionDomain(request, execution) {
  const hasDomain = Object.hasOwn(request, "domain");
  const reported = Object.hasOwn(execution, "domain");
  if (hasDomain !== reported) {
    return errorOutcome([hasDomain ? "bad-type" : "unknown-field"]);
  }
  if (!hasDomain) {
    return { ok: true };
  }
  const domain = execution.domain;
  if (!exactKeys(domain, ["negativeCount", "observedRejectionReason", "positiveControlPassed"])) {
    return errorOutcome(["unknown-field"]);
  }
  if (typeof domain.positiveControlPassed !== "boolean") {
    return errorOutcome(["bad-type"]);
  }
  if (typeof domain.observedRejectionReason !== "string") {
    return errorOutcome(["bad-type"]);
  }
  if (!isBoundedInt(domain.negativeCount, 0, 1000)) {
    return errorOutcome(["bad-limit"]);
  }
  return { ok: true };
}

export function evaluateResult(request, value) {
  if (!isObject(value)) {
    return errorOutcome(["bad-type"]);
  }
  if (!exactKeys(value, ["execution", "jobId", "modelClaim", "producer", "requestSha256", "reviewedSha", "sourceSha"])) {
    return errorOutcome(["unknown-field"]);
  }
  if (value.jobId !== request.jobId) {
    return finishShape("rejected", ["job-id-mismatch"], { verdictSource: "contract", sourceSha: request.sourceSha });
  }
  if (!isSha256(value.requestSha256) || !isCommitSha(value.reviewedSha)) {
    return errorOutcome(["bad-sha"]);
  }
  if (value.sourceSha !== request.sourceSha) {
    return finishShape("review-invalid", ["stale-source-sha"], {
      verdictSource: "freshness",
      sourceSha: request.sourceSha,
      reviewedSha: value.reviewedSha,
      freshness: "stale",
    });
  }
  if (value.producer !== producers[request.mode]) {
    return finishShape("rejected", ["producer-mismatch"], { verdictSource: "contract", sourceSha: request.sourceSha });
  }
  if (!exactKeys(value.modelClaim, ["status", "text"])) {
    return errorOutcome(["unknown-field"]);
  }
  if (value.modelClaim.status !== "pass" && value.modelClaim.status !== "fail" && value.modelClaim.status !== "unreported") {
    return errorOutcome(["bad-type"]);
  }
  if (typeof value.modelClaim.text !== "string" || value.modelClaim.text.length > 2000) {
    return errorOutcome(["bad-type"]);
  }
  const execution = value.execution;
  const executionKeys = ["exitCode", "files", "runner", "sourceSha"];
  if (Object.hasOwn(execution, "domain")) {
    executionKeys.push("domain");
  }
  if (!exactKeys(execution, executionKeys)) {
    return errorOutcome(["unknown-field"]);
  }
  const expectedRunner = request.mode === "plan" ? "none" : "repo-test";
  if (execution.runner !== expectedRunner) {
    return finishShape("rejected", ["runner-mismatch"], { verdictSource: "contract", sourceSha: request.sourceSha });
  }
  if (!isBoundedInt(execution.exitCode, 0, 255) || execution.sourceSha !== request.sourceSha) {
    return execution.sourceSha === request.sourceSha ? errorOutcome(["bad-type"]) : finishShape("review-invalid", ["stale-source-sha"], { verdictSource: "freshness", sourceSha: request.sourceSha, freshness: "stale" });
  }
  if (!Array.isArray(execution.files)) {
    return errorOutcome(["bad-type"]);
  }
  if (request.mode !== "plan" && execution.files.length < 1) {
    return finishShape("rejected", ["output-missing"], { verdictSource: "contract", sourceSha: request.sourceSha });
  }
  if (execution.files.length > request.outputLimits.maxFiles) {
    return finishShape("rejected", ["over-limit"], { verdictSource: "contract", sourceSha: request.sourceSha });
  }
  const allowed = new Set(request.allowedPaths);
  const seen = new Set();
  let total = 0;
  for (const file of execution.files) {
    if (!exactKeys(file, ["bytes", "path", "sha256"])) {
      return errorOutcome(["unknown-field"]);
    }
    const problem = pathClass(file.path);
    if (problem !== undefined) {
      return problem === "bad-path" ? errorOutcome(["bad-path"]) : finishShape("rejected", ["forbidden-path"], { verdictSource: "contract", sourceSha: request.sourceSha });
    }
    if (!allowed.has(file.path)) {
      return finishShape("rejected", ["output-not-allowed"], { verdictSource: "contract", sourceSha: request.sourceSha });
    }
    if (seen.has(file.path) || !isSha256(file.sha256) || !isBoundedInt(file.bytes, 0, request.outputLimits.maxBytes)) {
      return errorOutcome([seen.has(file.path) ? "duplicate-path" : "bad-type"]);
    }
    seen.add(file.path);
    total += file.bytes;
  }
  if (total > request.outputLimits.maxBytes) {
    return finishShape("rejected", ["over-limit"], { verdictSource: "contract", sourceSha: request.sourceSha });
  }
  const domain = checkExecutionDomain(request, execution);
  if (!domain.ok) {
    return domain;
  }
  return { ok: true, result: value };
}

function loadEvidence(dir, expectedCount) {
  let rootStat;
  try {
    rootStat = fs.lstatSync(dir);
  } catch {
    return { ok: false, reasons: ["evidence-unreadable"] };
  }
  if (rootStat.isSymbolicLink()) {
    return { ok: false, reasons: ["evidence-symlink"] };
  }
  if (!rootStat.isDirectory()) {
    return { ok: false, reasons: ["evidence-unsupported"] };
  }
  let rootReal;
  try {
    rootReal = fs.realpathSync(dir);
  } catch {
    return { ok: false, reasons: ["evidence-unreadable"] };
  }
  const found = new Map();
  const pending = [rootReal];
  while (pending.length > 0) {
    const current = pending.pop();
    let names;
    try {
      names = fs.readdirSync(current);
    } catch {
      return { ok: false, reasons: ["evidence-unreadable"] };
    }
    for (const name of names) {
      const full = path.join(current, name);
      let stat;
      try {
        stat = fs.lstatSync(full);
      } catch {
        return { ok: false, reasons: ["evidence-unreadable"] };
      }
      if (stat.isSymbolicLink()) {
        return { ok: false, reasons: ["evidence-symlink"] };
      }
      if (stat.isDirectory()) {
        pending.push(full);
        continue;
      }
      if (!stat.isFile()) {
        return { ok: false, reasons: ["evidence-unsupported"] };
      }
      let fileReal;
      try {
        fileReal = fs.realpathSync(full);
      } catch {
        return { ok: false, reasons: ["evidence-unreadable"] };
      }
      const relative = path.relative(rootReal, fileReal);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return { ok: false, reasons: ["evidence-escape"] };
      }
      const listed = relative.split(path.sep).join("/");
      if (found.has(listed) || found.size >= expectedCount) {
        return { ok: false, reasons: ["evidence-extra"] };
      }
      if (stat.size > 200000) {
        return { ok: false, reasons: ["over-limit"] };
      }
      found.set(listed, { sha256: sha256Buffer(fs.readFileSync(full)), bytes: stat.size });
    }
  }
  return { ok: true, files: found };
}

function readLedger(filePath) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if (error instanceof Error && error.code === "ENOENT") {
      return { ok: true, records: [], missing: true };
    }
    return errorOutcome(["ledger-unreadable"]);
  }
  if (stat.isSymbolicLink()) {
    return finishShape("rejected", ["ledger-symlink"], { verdictSource: "contract" });
  }
  if (!stat.isFile()) {
    return errorOutcome(["ledger-unreadable"]);
  }
  const read = readText(filePath);
  if (!read.ok) {
    return errorOutcome(["ledger-unreadable"]);
  }
  let value;
  try {
    value = parseStrictJson(read.text);
  } catch (error) {
    const reason = error instanceof Error && error.reason === "duplicate-key" ? "duplicate-key" : "invalid-json";
    return errorOutcome([reason]);
  }
  if (!exactKeys(value, ["records"]) || !Array.isArray(value.records)) {
    return errorOutcome(["unknown-field"]);
  }
  const ids = new Set();
  const hashes = new Set();
  for (const record of value.records) {
    if (!exactKeys(record, ["jobId", "requestSha256", "resultSha256"])) {
      return errorOutcome(["unknown-field"]);
    }
    if (!isJobId(record.jobId) || !isSha256(record.requestSha256) || !isSha256(record.resultSha256)) {
      return errorOutcome(["bad-type"]);
    }
    if (ids.has(record.jobId) || hashes.has(record.requestSha256)) {
      return errorOutcome(["ledger-duplicate"]);
    }
    ids.add(record.jobId);
    hashes.add(record.requestSha256);
  }
  return { ok: true, records: value.records, missing: false };
}

function lookupLedger(records, jobId, requestSha256, resultSha256) {
  for (const record of records) {
    if (record.jobId === jobId && record.requestSha256 !== requestSha256) {
      return finishShape("rejected", ["job-id-conflict"], { verdictSource: "ledger", requestSha256, resultSha256 });
    }
  }
  for (const record of records) {
    if (record.requestSha256 === requestSha256 && record.resultSha256 === resultSha256) {
      return finishShape("recorded", [], { verdictSource: "ledger", requestSha256, resultSha256 });
    }
    if (record.requestSha256 === requestSha256) {
      return finishShape("rejected", ["duplicate-conflict"], { verdictSource: "ledger", requestSha256, resultSha256 });
    }
  }
  return undefined;
}

function writeLedger(filePath, records) {
  const payload = { records };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function domainFileReason(label) {
  if (label === "valid-input") {
    return { symlink: "valid-input-symlink", unsupported: "valid-input-unsupported", mismatch: "valid-input-mismatch", missing: "valid-input-unreadable" };
  }
  return { symlink: "positive-control-symlink", unsupported: "positive-control-unsupported", mismatch: "positive-control-mismatch", missing: "positive-control-unreadable" };
}

export function gateFromFiles(options) {
  const requestRead = readText(options.requestPath);
  if (!requestRead.ok) {
    return errorOutcome(["evidence-unreadable"]);
  }
  let requestValue;
  try {
    requestValue = parseStrictJson(requestRead.text);
  } catch (error) {
    const reason = error instanceof Error && error.reason === "duplicate-key" ? "duplicate-key" : "invalid-json";
    return errorOutcome([reason]);
  }
  const requestCheck = evaluateRequest(requestValue);
  if (!requestCheck.ok) {
    return requestCheck;
  }
  const request = requestCheck.request;
  const resultRead = readText(options.resultPath);
  if (!resultRead.ok) {
    return errorOutcome(["evidence-unreadable"]);
  }
  let resultValue;
  try {
    resultValue = parseStrictJson(resultRead.text);
  } catch (error) {
    const reason = error instanceof Error && error.reason === "duplicate-key" ? "duplicate-key" : "invalid-json";
    return errorOutcome([reason]);
  }
  const resultCheck = evaluateResult(request, resultValue);
  if (!resultCheck.ok) {
    return resultCheck;
  }
  const result = resultCheck.result;
  const requestSha256 = sha256Buffer(requestRead.bytes);
  const resultSha256 = sha256Buffer(resultRead.bytes);
  if (result.requestSha256 !== requestSha256) {
    return finishShape("rejected", ["request-hash-mismatch"], {
      verdictSource: "contract",
      requestSha256,
      resultSha256,
      sourceSha: request.sourceSha,
      modelClaimStatus: result.modelClaim.status,
    });
  }
  if (options.ledgerPath !== undefined) {
    const ledger = readLedger(options.ledgerPath);
    if (!ledger.ok) {
      return ledger;
    }
    const existing = lookupLedger(ledger.records, request.jobId, requestSha256, resultSha256);
    if (existing !== undefined) {
      existing.sourceSha = request.sourceSha;
      existing.reviewedSha = result.reviewedSha;
      existing.modelClaimStatus = result.modelClaim.status;
      existing.executionExitCode = result.execution.exitCode;
      return existing;
    }
    options.ledgerRecords = ledger.records;
  }
  const fields = {
    requestSha256,
    resultSha256,
    sourceSha: request.sourceSha,
    reviewedSha: result.reviewedSha,
    modelClaimStatus: result.modelClaim.status,
    executionExitCode: result.execution.exitCode,
  };
  if (result.reviewedSha !== request.sourceSha) {
    return finishShape("review-invalid", ["stale-reviewed-sha"], { ...fields, verdictSource: "freshness", freshness: "stale" });
  }
  if (options.head !== undefined) {
    if (!isCommitSha(options.head)) {
      return errorOutcome(["bad-sha"], fields);
    }
    if (options.head !== request.sourceSha) {
      return finishShape("review-invalid", ["stale-head"], { ...fields, verdictSource: "freshness", freshness: "stale" });
    }
  }
  const prompt = hashRegularFile(options.promptPath, "prompt-symlink", "prompt-unsupported", "prompt-unreadable");
  if (!prompt.ok) {
    return finishShape("rejected", prompt.reasons, { ...fields, verdictSource: "contract" });
  }
  if (prompt.sha256 !== request.promptSha256) {
    return finishShape("rejected", ["prompt-mismatch"], { ...fields, verdictSource: "contract" });
  }
  if (Object.hasOwn(request, "domain")) {
    if (options.validInputPath === undefined || options.positiveControlPath === undefined) {
      return errorOutcome(["domain-file-required"], fields);
    }
    const inputs = [
      ["valid-input", options.validInputPath, request.domain.validInputSha256],
      ["positive-control", options.positiveControlPath, request.domain.positiveControlSha256],
    ];
    for (const [label, filePath, expected] of inputs) {
      const names = domainFileReason(label);
      const hashed = hashRegularFile(filePath, names.symlink, names.unsupported, names.missing);
      if (!hashed.ok) {
        return finishShape("rejected", hashed.reasons, { ...fields, verdictSource: "contract" });
      }
      if (hashed.sha256 !== expected) {
        return finishShape("rejected", [names.mismatch], { ...fields, verdictSource: "contract" });
      }
    }
  } else if (options.validInputPath !== undefined || options.positiveControlPath !== undefined) {
    return errorOutcome(["unknown-field"], fields);
  }
  const evidence = loadEvidence(options.evidencePath, request.outputLimits.maxFiles);
  if (!evidence.ok) {
    const status = schemaReasons.has(evidence.reasons[0]) ? "error" : "rejected";
    return finishShape(status, evidence.reasons, { ...fields, verdictSource: status === "error" ? "schema" : "contract" });
  }
  if (evidence.files.size !== result.execution.files.length) {
    const reason = evidence.files.size > result.execution.files.length ? "evidence-extra" : "evidence-missing";
    return finishShape("rejected", [reason], { ...fields, verdictSource: "contract" });
  }
  for (const file of result.execution.files) {
    const actual = evidence.files.get(file.path);
    if (actual === undefined) {
      return finishShape("rejected", ["evidence-missing"], { ...fields, verdictSource: "contract" });
    }
    if (actual.sha256 !== file.sha256) {
      return finishShape("rejected", ["hash-mismatch"], { ...fields, verdictSource: "execution-evidence" });
    }
    if (actual.bytes !== file.bytes) {
      return finishShape("rejected", ["size-mismatch"], { ...fields, verdictSource: "execution-evidence" });
    }
  }
  const warnings = [];
  if (result.execution.exitCode !== 0) {
    if (result.modelClaim.status === "pass") {
      warnings.push("model-claim-differs");
    }
    return finishShape("rejected", ["execution-failed"], { ...fields, warnings, verdictSource: "execution-evidence", freshness: options.head === undefined ? "request-binding-only" : "head" });
  }
  if (result.modelClaim.status === "fail") {
    warnings.push("model-claim-differs");
  }
  if (Object.hasOwn(request, "domain")) {
    const domain = result.execution.domain;
    if (domain.positiveControlPassed !== true) {
      const extra = domain.negativeCount > 0 ? { negativeCountIgnored: true } : {};
      return finishShape("rejected", ["negative-without-positive-control"], {
        ...fields,
        ...extra,
        warnings,
        verdictSource: "execution-evidence",
        freshness: options.head === undefined ? "request-binding-only" : "head",
      });
    }
    if (domain.observedRejectionReason !== request.domain.rejectionReason) {
      return finishShape("rejected", ["reason-mismatch"], { ...fields, warnings, verdictSource: "execution-evidence" });
    }
  }
  const status = request.mode === "plan" ? "bound" : "gated";
  const verdictSource = request.mode === "plan" ? "file-hashes" : "execution-evidence";
  const outcome = finishShape(status, [], {
    ...fields,
    warnings,
    verdictSource,
    freshness: options.head === undefined ? "request-binding-only" : "head",
  });
  if (options.record === true && options.ledgerPath !== undefined && options.ledgerRecords !== undefined) {
    writeLedger(options.ledgerPath, [...options.ledgerRecords, { jobId: request.jobId, requestSha256, resultSha256 }]);
  }
  return outcome;
}

export function checkRequestFile(filePath) {
  const read = readText(filePath);
  if (!read.ok) {
    return errorOutcome(["evidence-unreadable"]);
  }
  let value;
  try {
    value = parseStrictJson(read.text);
  } catch (error) {
    const reason = error instanceof Error && error.reason === "duplicate-key" ? "duplicate-key" : "invalid-json";
    return errorOutcome([reason]);
  }
  const checked = evaluateRequest(value);
  if (!checked.ok) {
    return checked;
  }
  return finishShape("request-ok", [], { verdictSource: "schema", requestSha256: sha256Buffer(read.bytes), sourceSha: checked.request.sourceSha });
}

export function checkResultFiles(requestPath, resultPath) {
  const requestRead = readText(requestPath);
  const resultRead = readText(resultPath);
  if (!requestRead.ok || !resultRead.ok) {
    return errorOutcome(["evidence-unreadable"]);
  }
  let requestValue;
  let resultValue;
  try {
    requestValue = parseStrictJson(requestRead.text);
    resultValue = parseStrictJson(resultRead.text);
  } catch (error) {
    const reason = error instanceof Error && error.reason === "duplicate-key" ? "duplicate-key" : "invalid-json";
    return errorOutcome([reason]);
  }
  const requestCheck = evaluateRequest(requestValue);
  if (!requestCheck.ok) {
    return requestCheck;
  }
  const resultCheck = evaluateResult(requestCheck.request, resultValue);
  if (!resultCheck.ok) {
    return resultCheck;
  }
  const requestSha256 = sha256Buffer(requestRead.bytes);
  const resultSha256 = sha256Buffer(resultRead.bytes);
  if (resultCheck.result.requestSha256 !== requestSha256) {
    return finishShape("rejected", ["request-hash-mismatch"], {
      verdictSource: "none",
      requestSha256,
      resultSha256,
      sourceSha: requestCheck.request.sourceSha,
      modelClaimStatus: resultCheck.result.modelClaim.status,
      executionExitCode: resultCheck.result.execution.exitCode,
    });
  }
  return finishShape("result-shape-ok", [], {
    verdictSource: "none",
    requestSha256,
    resultSha256,
    sourceSha: requestCheck.request.sourceSha,
    reviewedSha: resultCheck.result.reviewedSha,
    modelClaimStatus: resultCheck.result.modelClaim.status,
    executionExitCode: resultCheck.result.execution.exitCode,
    warnings: ["shape-is-not-a-verdict"],
  });
}

function parseArgs(argv) {
  if (argv.length === 0) {
    return { ok: false };
  }
  const command = argv[0];
  if (command !== "check-request" && command !== "check-result" && command !== "gate") {
    return { ok: false };
  }
  const positionals = [];
  const flags = Object.create(null);
  const known = new Set(["evidence", "head", "ledger", "positive-control", "prompt", "valid-input"]);
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--record") {
      if (flags.record === true) {
        return { ok: false };
      }
      flags.record = true;
      continue;
    }
    if (token.startsWith("--")) {
      const name = token.slice(2);
      if (!known.has(name)) {
        return { ok: false };
      }
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--") || flags[name] !== undefined) {
        return { ok: false };
      }
      flags[name] = value;
      index += 1;
      continue;
    }
    positionals.push(token);
  }
  return { ok: true, command, positionals, flags };
}

function exitCode(status) {
  if (status === "error") {
    return 1;
  }
  if (status === "rejected") {
    return 2;
  }
  if (status === "review-invalid") {
    return 4;
  }
  return 0;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.log(JSON.stringify(errorOutcome(["usage"])));
    process.exit(1);
  }
  let outcome;
  if (parsed.command === "check-request") {
    if (parsed.positionals.length !== 1 || Object.keys(parsed.flags).length !== 0) {
      outcome = errorOutcome(["usage"]);
    } else {
      outcome = checkRequestFile(parsed.positionals[0]);
    }
  } else if (parsed.command === "check-result") {
    if (parsed.positionals.length !== 2 || Object.keys(parsed.flags).length !== 0) {
      outcome = errorOutcome(["usage"]);
    } else {
      outcome = checkResultFiles(parsed.positionals[0], parsed.positionals[1]);
    }
  } else if (parsed.positionals.length !== 2 || parsed.flags.evidence === undefined || parsed.flags.prompt === undefined) {
    outcome = errorOutcome(["usage"]);
  } else if (parsed.flags.record === true && parsed.flags.ledger === undefined) {
    outcome = errorOutcome(["usage"]);
  } else {
    outcome = gateFromFiles({
      requestPath: parsed.positionals[0],
      resultPath: parsed.positionals[1],
      evidencePath: parsed.flags.evidence,
      promptPath: parsed.flags.prompt,
      validInputPath: parsed.flags["valid-input"],
      positiveControlPath: parsed.flags["positive-control"],
      head: parsed.flags.head,
      ledgerPath: parsed.flags.ledger,
      record: parsed.flags.record === true,
    });
  }
  console.log(JSON.stringify(outcome));
  process.exit(exitCode(outcome.status));
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  main();
}
