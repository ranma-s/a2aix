/* SPDX-License-Identifier: Apache-2.0 */

import { spawn } from "node:child_process";
import { jobTag, sampleJob, sampleNow, samplePosterBound, sampleWorkerBound } from "@ix/agents";
import { verifyTranscript } from "@ix/verify";

const loopback = "127.0.0.1";
const trialMs = 20000;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const children = [];

function track(child) {
  children.push(child);
  return child;
}

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
}

function stopAll() {
  for (const child of children) {
    stop(child);
  }
}

function waitForListen(child) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error("listener did not bind 127.0.0.1"));
    }, 10000);
    function succeed(port) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(port);
    }
    function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = /ix: listening on 127\.0\.0\.1:(\d+)/.exec(buffer);
      if (match !== null && match[1] !== undefined) {
        const port = Number(match[1]);
        if (Number.isInteger(port) && port > 0) {
          succeed(port);
        }
      }
    });
    child.on("exit", (code) => {
      fail(new Error(`listener exited ${String(code)} before it was ready: ${buffer}`));
    });
    child.on("error", (error) => {
      fail(error);
    });
  });
}

function runRole(role, url) {
  return new Promise((resolve) => {
    const child = track(
      spawn(process.execPath, ["--import", "tsx", "scripts/local-ix.mjs", role], {
        cwd: process.cwd(),
        env: { ...process.env, IX_URL: url, IX_BIND: loopback },
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ role, code: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("exit", (code) => {
      resolve({ role, code: code ?? 1, stdout, stderr });
    });
  });
}

async function readJson(response) {
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid json";
    throw new Error(message, { cause: error });
  }
  if (!isRecord(parsed)) {
    throw new Error("response was not a JSON object");
  }
  return parsed;
}

const server = track(
  spawn(process.execPath, ["--import", "tsx", "scripts/local-ix.mjs", "serve"], {
    cwd: process.cwd(),
    env: { ...process.env, IX_BIND: loopback, IX_PORT: "0", IX_MODE: "open" },
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
let serverLog = "";
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});
const timer = setTimeout(() => {
  stopAll();
  console.error("trial timed out");
  process.exit(1);
}, trialMs);

try {
  const port = await waitForListen(server);
  const base = `http://${loopback}:${String(port)}`;
  const health = await readJson(await fetch(`${base}/health`));
  if (health["ok"] !== true || health["bind"] !== loopback || health["signatureVerification"] !== "deferred") {
    throw new Error("health did not report a deferred localhost relay");
  }
  const [poster, worker] = await Promise.all([runRole("poster", base), runRole("worker", base)]);
  if (poster.code !== 0 || worker.code !== 0) {
    throw new Error(`poster ${poster.stdout}${poster.stderr} worker ${worker.stdout}${worker.stderr}`);
  }
  if (!poster.stdout.includes("poster: agreed") || !worker.stdout.includes("worker: agreed")) {
    throw new Error(`expected agreed, poster ${poster.stdout} worker ${worker.stdout}`);
  }
  const queried = await readJson(
    await fetch(`${base}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: [{ name: jobTag, values: [sampleJob.jobId] }] }),
    }),
  );
  if (queried["ok"] !== true || !Array.isArray(queried["events"])) {
    throw new Error("query did not return events");
  }
  const events = queried["events"].slice().sort((left, right) => {
    if (!isRecord(left) || !isRecord(right) || typeof left["id"] !== "string" || typeof right["id"] !== "string") {
      return 0;
    }
    if (left["id"] < right["id"]) {
      return -1;
    }
    if (left["id"] > right["id"]) {
      return 1;
    }
    return 0;
  });
  const messages = [];
  for (const event of events) {
    if (!isRecord(event) || event["signatureVerification"] !== "deferred" || !isRecord(event["body"])) {
      throw new Error("event was not a deferred record");
    }
    if (event["body"]["record"] !== "negotiation") {
      continue;
    }
    const message = event["body"]["message"];
    if (message === undefined) {
      throw new Error("negotiation event has no message");
    }
    messages.push(message);
  }
  const first = messages[0];
  const report = verifyTranscript({
    jobId: sampleJob.jobId,
    maxRoundTrips: sampleJob.maxRoundTrips,
    expiresAt: sampleJob.expiresAt,
    now: sampleNow,
    messages,
    bounds: {
      posterMax: samplePosterBound.maxAmount,
      workerMin: sampleWorkerBound.minAmount,
      workerMaxHoursPerWeek: sampleWorkerBound.maxHoursPerWeek,
      excludedWork: sampleWorkerBound.excludedWork,
    },
    signature: "unverified-placeholder",
    jws: "unverified-placeholder",
    prevHash: "m-0001",
    jcsBody: first ?? null,
  });
  if (
    report.schema !== "pass" ||
    report.replay !== "pass" ||
    report.bounds !== "pass" ||
    report.deadlines !== "pass" ||
    report.phase !== "agreed"
  ) {
    throw new Error(`ix-verify failed: ${report.detail}`);
  }
  for (const check of report.deferred) {
    if (check.status !== "deferred") {
      throw new Error("a cryptographic check was not deferred");
    }
  }
  console.log(
    JSON.stringify({
      bind: loopback,
      port,
      poster: "agreed",
      worker: "agreed",
      schema: report.schema,
      replay: report.replay,
      bounds: report.bounds,
      deadlines: report.deadlines,
      phase: report.phase,
      deferred: report.deferred.map((check) => check.name),
    }),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "trial failed";
  console.error(message);
  if (serverLog.length > 0) {
    console.error(serverLog);
  }
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  stopAll();
}
