import { applyTermMessage, coreSheet, decodeTermMessage, openTermSession, webSiteSheet } from "@ix/a2a-ext-negotiation";
import type { FixedTerm, Party, PresetTerm, TermJson, TermSession, TermSheet } from "@ix/a2a-ext-negotiation";
import type { JsonObject, JsonValue } from "@ix/distribution";
import { deferredChecks } from "./deferred.js";

export type TermVerifyReport = {
  readonly schema: "pass" | "fail";
  readonly issuers: "pass" | "fail";
  readonly replay: "pass" | "fail";
  readonly deadlines: "pass" | "fail";
  readonly phase: string;
  readonly messageCount: number;
  readonly terms: readonly FixedTerm[];
  readonly detail: string;
  readonly deferred: ReturnType<typeof deferredChecks>;
};

const verifiableSheets: readonly TermSheet[] = [coreSheet, webSiteSheet];

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: JsonObject, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function byId(left: JsonValue, right: JsonValue): number {
  const a = isObject(left) ? (text(left, "id") ?? "") : "";
  const b = isObject(right) ? (text(right, "id") ?? "") : "";
  return a < b ? -1 : a > b ? 1 : 0;
}

function openFromJob(body: JsonObject, jobId: string): TermSession | string {
  const job = body["job"];
  if (!isObject(job) || text(job, "jobId") !== jobId) {
    return "the job record does not name this job";
  }
  const sheetId = text(job, "sheetId");
  const version = job["sheetVersion"];
  const sheetSha256 = text(job, "sheetSha256");
  const roundLimit = job["roundLimitPerTerm"];
  const preset = job["preset"];
  const sheet = verifiableSheets.find((entry) => entry.sheetId === sheetId && entry.version === version);
  if (sheet === undefined || sheetSha256 === undefined || typeof roundLimit !== "number" || !Array.isArray(preset)) {
    return "the job record names an unknown sheet or is incomplete";
  }
  const items: readonly JsonValue[] = preset;
  const entries: PresetTerm[] = [];
  for (const entry of items) {
    const termId = isObject(entry) ? text(entry, "termId") : undefined;
    if (!isObject(entry) || termId === undefined || entry["value"] === undefined) {
      return "a preset entry is malformed";
    }
    const value: TermJson = entry["value"];
    entries.push({ termId, value });
  }
  const opened = openTermSession({ jobId, sheet, sheetSha256, preset: entries, roundLimitPerTerm: roundLimit });
  return opened.ok ? opened.session : opened.reason;
}

export function verifyTermTranscript(input: {
  readonly jobId: string;
  readonly events: readonly JsonValue[];
  readonly issuers: { readonly client: string; readonly worker: string };
  readonly signature: string;
  readonly jws: string;
  readonly prevHash: string;
  readonly jcsBody: JsonValue;
}): TermVerifyReport {
  const deferred = deferredChecks({ signature: input.signature, jws: input.jws, prevHash: input.prevHash, jcsBody: input.jcsBody });
  const problems: string[] = [];
  let schema: "pass" | "fail" = "pass";
  let issuers: "pass" | "fail" = "pass";
  let replay: "pass" | "fail" = "pass";
  let deadlines: "pass" | "fail" = "pass";
  let session: TermSession | undefined;
  let count = 0;
  for (const event of input.events.slice().sort(byId)) {
    if (!isObject(event) || !isObject(event["body"])) {
      schema = "fail";
      problems.push("an event is not an object with a body");
      continue;
    }
    const body = event["body"];
    const issuer = text(event, "issuer");
    const createdAt = text(event, "createdAt") ?? "";
    if (body["record"] === "term-job") {
      if (issuer !== input.issuers.client) {
        issuers = "fail";
        problems.push("a job record was not issued by the client");
        continue;
      }
      if (session !== undefined) {
        replay = "fail";
        problems.push("a second job record");
        continue;
      }
      const opened = openFromJob(body, input.jobId);
      if (typeof opened === "string") {
        replay = "fail";
        problems.push(opened);
      } else {
        session = opened;
      }
      continue;
    }
    if (body["record"] !== "term") {
      continue;
    }
    count += 1;
    const decoded = decodeTermMessage(body["message"]);
    if (!decoded.ok) {
      schema = "fail";
      problems.push(`message ${String(count)}: ${decoded.reason}`);
      continue;
    }
    const from: Party = decoded.message.from;
    if (issuer !== input.issuers[from]) {
      issuers = "fail";
      problems.push(`message ${String(count)}: issuer does not match ${from}`);
      continue;
    }
    if (Number.isNaN(Date.parse(createdAt)) || Date.parse(decoded.message.expiresAt) <= Date.parse(createdAt)) {
      deadlines = "fail";
      problems.push(`message ${String(count)}: published at or after its expiry`);
      continue;
    }
    if (session === undefined) {
      replay = "fail";
      problems.push(`message ${String(count)}: before the job`);
      continue;
    }
    const applied = applyTermMessage(session, decoded.message, { now: () => createdAt });
    if (!applied.ok) {
      replay = "fail";
      problems.push(`message ${String(count)}: ${applied.reason}`);
      continue;
    }
    session = applied.session;
  }
  if (session === undefined) {
    replay = "fail";
    problems.push("no job record from the client");
  }
  return {
    schema,
    issuers,
    replay,
    deadlines,
    phase: session?.phase ?? "",
    messageCount: count,
    terms: session?.draft?.terms ?? [],
    detail: problems[0] ?? "",
    deferred,
  };
}
