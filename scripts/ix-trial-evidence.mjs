/* SPDX-License-Identifier: Apache-2.0 */

import { spawn } from "node:child_process";
import {
  jobTag,
  sampleTermClientMandate,
  sampleTermJob,
  sampleTermWorkerMandate,
  termRelayProfile,
  withinLimit,
} from "@ix/agents";
import { parseJson } from "@ix/jcs";
import { verifyTermTranscript } from "@ix/verify";

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

const didLine = /^did (did:key:z[1-9A-HJ-NP-Za-km-z]+)$/m;

function runRole(role, url) {
  let announce;
  const did = new Promise((resolve) => {
    announce = resolve;
  });
  const done = new Promise((resolve) => {
    const child = track(
      spawn(process.execPath, ["--import", "tsx", "scripts/local-ix.mjs", role], {
        cwd: process.cwd(),
        env: { ...process.env, IX_URL: url, IX_BIND: loopback },
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const found = didLine.exec(stdout);
      if (found !== null) {
        announce({ did: found[1], tell: (peer) => child.stdin.end(`peer ${peer}\n`) });
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ role, code: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("exit", (code) => {
      announce({ did: "", tell: () => undefined });
      resolve({ role, code: code ?? 1, stdout, stderr });
    });
  });
  return { did, done };
}

async function readJson(response) {
  const text = await response.text();
  let parsed;
  try {
    parsed = parseJson(text);
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
  const posterRun = runRole("poster", base);
  const workerRun = runRole("worker", base);
  const [posterId, workerId] = await Promise.all([posterRun.did, workerRun.did]);
  if (posterId.did === "" || workerId.did === "" || posterId.did === workerId.did) {
    throw new Error("the roles did not announce two different did:key names");
  }
  posterId.tell(workerId.did);
  workerId.tell(posterId.did);
  const peers = { client: posterId.did, worker: workerId.did };
  const [poster, worker] = await Promise.all([posterRun.done, workerRun.done]);
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
      body: JSON.stringify({ tags: [{ name: jobTag, values: [sampleTermJob.jobId] }] }),
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
  for (const event of events) {
    if (!isRecord(event) || event["signatureVerification"] !== "deferred" || !isRecord(event["body"])) {
      throw new Error("event was not a deferred record");
    }
  }
  const report = await verifyTermTranscript({
    jobId: sampleTermJob.jobId,
    events,
    issuers: peers,
    profile: termRelayProfile,
  });
  if (
    report.schema !== "pass" ||
    report.issuers !== "pass" ||
    report.replay !== "pass" ||
    report.deadlines !== "pass" ||
    report.chain !== "pass" ||
    report.signatures !== "pass" ||
    report.phase !== "agreed"
  ) {
    throw new Error(`ix-verify failed: ${report.detail}`);
  }
  for (const term of report.terms) {
    for (const mandate of [sampleTermClientMandate, sampleTermWorkerMandate]) {
      const limit = mandate[term.termId];
      if (limit !== undefined && !withinLimit(limit, term.value)) {
        throw new Error(`agreed ${term.termId} is outside a mandate`);
      }
    }
  }
  console.log(
    JSON.stringify({
      bind: loopback,
      port,
      poster: "agreed",
      worker: "agreed",
      negotiation: "term-by-term",
      schema: report.schema,
      issuers: report.issuers,
      replay: report.replay,
      bounds: "pass",
      deadlines: report.deadlines,
      chain: report.chain,
      forks: report.forks,
      duplicates: report.duplicates,
      phase: report.phase,
      messages: report.messageCount,
      signatures: report.signatures,
      signer: "ed25519-in-memory",
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
