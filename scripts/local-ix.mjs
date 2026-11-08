/* SPDX-License-Identifier: Apache-2.0 */

import { createServer } from "node:http";
import { createLocalRelay } from "@ix/adapters";
import { parseJson } from "@ix/jcs";
import {
  clockAt,
  createTermSide,
  createTermSigner,
  createTermSigners,
  runTermRelay,
  sampleNow,
  sampleTermClientMandate,
  sampleTermJob,
  sampleTermWorkerMandate,
} from "@ix/agents";

const loopback = "127.0.0.1";
const maxBodyBytes = 65536;

function readBind() {
  const bind = process.env.IX_BIND ?? loopback;
  if (bind !== loopback) {
    console.error("refusing to bind; IX_BIND must be 127.0.0.1");
    process.exit(1);
  }
  return bind;
}

function readPort() {
  const raw = process.env.IX_PORT ?? "8787";
  if (!/^\d+$/.test(raw)) {
    console.error("IX_PORT must be an integer");
    process.exit(1);
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("IX_PORT is out of range");
    process.exit(1);
  }
  return port;
}

function readMode() {
  const mode = process.env.IX_MODE ?? "open";
  if (mode !== "open" && mode !== "closed") {
    console.error("IX_MODE must be open or closed");
    process.exit(1);
  }
  return mode;
}

function readNow() {
  return process.env.IX_NOW ?? sampleNow;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLoopback(remote) {
  return remote === "127.0.0.1" || remote === "::ffff:127.0.0.1";
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) {
        return;
      }
      size += chunk.length;
      if (size > maxBodyBytes) {
        failed = true;
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) {
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (error) => {
      if (failed) {
        return;
      }
      failed = true;
      reject(error);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = parseJson(text);
  } catch (error) {
    throw new Error("invalid json", { cause: error });
  }
  if (!response.ok) {
    const detail =
      isRecord(parsed) && typeof parsed.detail === "string" ? parsed.detail : text;
    throw new Error(detail);
  }
  return parsed;
}

function httpBoard(base) {
  return {
    publish(input) {
      return postJson(`${base}/publish`, input);
    },
    query(filter) {
      return postJson(`${base}/query`, filter);
    },
    subscribe() {
      return {
        ok: false,
        reason: "bad_filter",
        detail: "the private trial polls with query",
      };
    },
  };
}

async function waitForHealth(url) {
  let last = "IX node did not answer on 127.0.0.1";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      last = `health status ${String(response.status)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : "health request failed";
    }
    await delay(100);
  }
  throw new Error(last);
}

function serve() {
  const bind = readBind();
  const port = readPort();
  const relay = createLocalRelay({ mode: readMode(), clock: clockAt(readNow()) });
  const server = createServer((req, res) => {
    handle(req, res, relay).catch((error) => {
      const message = error instanceof Error ? error.message : "request failed";
      if (!res.headersSent) {
        send(res, 500, { ok: false, reason: "publish_failed", detail: message });
        return;
      }
      res.destroy();
    });
  });
  server.requestTimeout = 5000;
  server.on("error", (error) => {
    console.error(error instanceof Error ? error.message : "listen failed");
    process.exit(1);
  });
  server.listen(port, bind, () => {
    const address = server.address();
    if (address === null || typeof address === "string" || address.address !== loopback) {
      console.error("listener is not bound to 127.0.0.1");
      process.exit(1);
    }
    console.log(`ix: listening on 127.0.0.1:${String(address.port)}`);
  });
}

async function handle(req, res, relay) {
  if (!isLoopback(req.socket.remoteAddress)) {
    send(res, 403, { ok: false, reason: "closed", detail: "localhost only" });
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, { ok: true, bind: loopback, signatureVerification: "deferred" });
    return;
  }
  if (req.method !== "POST" || (url.pathname !== "/publish" && url.pathname !== "/query")) {
    send(res, 404, { ok: false, reason: "bad_filter", detail: "not found" });
    return;
  }
  let text;
  try {
    text = await readBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "body failed";
    send(res, 400, { ok: false, reason: "bad_body", detail: message });
    return;
  }
  let parsed;
  try {
    parsed = parseJson(text.length === 0 ? "{}" : text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid json";
    send(res, 400, { ok: false, reason: "bad_body", detail: message });
    return;
  }
  if (!isRecord(parsed)) {
    send(res, 400, { ok: false, reason: "bad_body", detail: "body must be a JSON object" });
    return;
  }
  let result;
  try {
    result = url.pathname === "/publish" ? relay.publish(parsed) : relay.query(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "relay rejected the body";
    send(res, 400, { ok: false, reason: "bad_body", detail: message });
    return;
  }
  send(res, 200, result);
}

const didPattern = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;

function readPeer() {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error("no peer did:key names arrived on stdin"));
    }, 10000);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      const line = buffer.split("\n")[0] ?? "";
      if (!buffer.includes("\n")) {
        return;
      }
      clearTimeout(timer);
      process.stdin.pause();
      const names = line.startsWith("peer ") ? line.slice("peer ".length).trim().split(" ") : [];
      const [agent, approver] = names;
      if (names.length === 2 && didPattern.test(agent) && didPattern.test(approver)) {
        resolve({ agent, approver });
      } else {
        reject(new Error("the peer line is not two did:key names"));
      }
    });
  });
}

async function runRole(role) {
  const base = process.env.IX_URL ?? "http://127.0.0.1:8787";
  await waitForHealth(`${base}/health`);
  const board = httpBoard(base);
  const clock = clockAt(readNow());
  const signer = await createTermSigner();
  const approver = await createTermSigner();
  console.log(`did ${signer.did} ${approver.did}`);
  const peer = await readPeer();
  const peers =
    role === "poster"
      ? { client: signer.did, worker: peer.agent, approvers: { client: approver.did, worker: peer.approver } }
      : { client: peer.agent, worker: signer.did, approvers: { client: peer.approver, worker: approver.did } };
  const side =
    role === "poster"
      ? createTermSide({
          board,
          clock,
          jobId: sampleTermJob.jobId,
          config: { party: "client", mandate: sampleTermClientMandate, human: "approve" },
          signer,
          approver,
          peers,
          postJob: sampleTermJob,
        })
      : createTermSide({
          board,
          clock,
          jobId: sampleTermJob.jobId,
          config: { party: "worker", mandate: sampleTermWorkerMandate, human: "approve" },
          signer,
          approver,
          peers,
        });
  for (let index = 0; index < 400; index += 1) {
    await side.step();
    const phase = side.report().session?.phase;
    if (phase === "agreed" || phase === "no_deal" || side.finished()) {
      console.log(`${role}: ${phase ?? "stopped"}`);
      if (phase !== "agreed") {
        console.error(JSON.stringify(side.report().refusals));
        process.exit(1);
      }
      return;
    }
    await delay(20);
  }
  console.error(`${role}: stopped in ${side.report().session?.phase ?? "no session"}`);
  process.exit(1);
}

async function exchange() {
  const now = readNow();
  const relay = createLocalRelay({ mode: readMode(), clock: clockAt(now) });
  const report = await runTermRelay({
    board: relay,
    clock: clockAt(now),
    job: sampleTermJob,
    client: { party: "client", mandate: sampleTermClientMandate, human: "approve" },
    worker: { party: "worker", mandate: sampleTermWorkerMandate, human: "approve" },
    signers: await createTermSigners(),
  });
  const posterPhase = report.poster.session?.phase ?? "none";
  const workerPhase = report.worker.session?.phase ?? "none";
  console.log(`poster: ${posterPhase}`);
  console.log(`worker: ${workerPhase}`);
  for (const event of report.events) {
    if (event.signatureVerification !== "deferred") {
      console.error("signature verification must stay deferred");
      process.exit(1);
    }
  }
  if (posterPhase !== "agreed" || workerPhase !== "agreed") {
    process.exit(1);
  }
}

const command = process.argv[2];
if (command === "serve") {
  serve();
} else if (command === "poster") {
  await runRole("poster");
} else if (command === "worker") {
  await runRole("worker");
} else if (command === "exchange") {
  await exchange();
} else {
  console.error("usage: node --import tsx scripts/local-ix.mjs serve|poster|worker|exchange");
  process.exit(1);
}
