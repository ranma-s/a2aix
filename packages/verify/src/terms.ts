import { applyChainedTermMessage, coreSheet, decodeTermMessage, expectedPrevHash, jwsSignatureFormat, openTermSession, presetChainProblem, termHash, termSheetHash, webSiteSheet } from "@ix/a2a-ext-negotiation";
import type { FixedTerm, Party, PresetTerm, TermJson, TermMessage, TermSession, TermSheet } from "@ix/a2a-ext-negotiation";
import type { JsonObject, JsonValue } from "@ix/distribution";
import { verifyDetachedJws } from "@ix/identity";
import { eventSigningInput, signingInputExcludingSignature } from "@ix/protocol-core";

export type TermVerifyReport = {
  readonly schema: "pass" | "fail";
  readonly issuers: "pass" | "fail";
  readonly replay: "pass" | "fail";
  readonly deadlines: "pass" | "fail";
  readonly chain: "pass" | "fail";
  readonly signatures: "pass" | "fail";
  readonly forks: number;
  readonly duplicates: number;
  readonly phase: string;
  readonly messageCount: number;
  readonly terms: readonly FixedTerm[];
  readonly detail: string;
};

function eventTags(value: JsonValue | undefined): readonly (readonly [string, string])[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: readonly JsonValue[] = value;
  const tags: (readonly [string, string])[] = [];
  for (const item of items) {
    if (!Array.isArray(item)) {
      return undefined;
    }
    const pair: readonly JsonValue[] = item;
    const [name, tagValue] = pair;
    if (pair.length !== 2 || typeof name !== "string" || typeof tagValue !== "string") {
      return undefined;
    }
    tags.push([name, tagValue]);
  }
  return tags;
}

function signedContentOf(event: JsonObject, issuer: string): string {
  return eventSigningInput({
    issuer,
    kind: text(event, "kind") ?? "",
    tags: eventTags(event["tags"]) ?? [],
    createdAt: text(event, "createdAt") ?? "",
    expiresAt: text(event, "expiresAt") ?? "",
    body: event["body"],
  });
}

async function eventSignatureProblem(event: JsonObject, issuer: string): Promise<string | undefined> {
  const kind = text(event, "kind");
  const createdAt = text(event, "createdAt");
  const expiresAt = text(event, "expiresAt");
  const sig = text(event, "sig");
  const tags = eventTags(event["tags"]);
  if (kind === undefined || createdAt === undefined || expiresAt === undefined || sig === undefined || tags === undefined) {
    return "the event is missing a signed field";
  }
  const checked = await verifyDetachedJws({ jws: sig, payload: eventSigningInput({ issuer, kind, tags, createdAt, expiresAt, body: event["body"] }), expectedKid: issuer });
  return checked.ok ? undefined : checked.reason;
}

async function messageSignatureProblem(raw: JsonValue | undefined, message: TermMessage, kid: string): Promise<string | undefined> {
  const verification: string = message.signature.verification;
  if (verification !== jwsSignatureFormat) {
    return "the message is not signed";
  }
  const checked = await verifyDetachedJws({ jws: message.signature.material, payload: signingInputExcludingSignature(raw), expectedKid: kid });
  return checked.ok ? undefined : checked.reason;
}

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

async function openFromJob(body: JsonObject, jobId: string): Promise<TermSession | string> {
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
  if (sheetSha256 !== (await termSheetHash(sheet))) {
    return "the job's sheetSha256 does not match the term sheet";
  }
  const presetProblem = await presetChainProblem(entries);
  if (presetProblem !== undefined) {
    return presetProblem;
  }
  const opened = openTermSession({ jobId, sheet, sheetSha256, preset: entries, roundLimitPerTerm: roundLimit, anchorHash: await termHash(job) });
  return opened.ok ? opened.session : opened.reason;
}

export type TermRelayProfile = {
  readonly jobKind: string;
  readonly negotiationKind: string;
  readonly jobTag: string;
  readonly extensionsHeader: string;
};

export async function verifyTermTranscript(input: {
  readonly jobId: string;
  readonly events: readonly JsonValue[];
  readonly issuers: { readonly client: string; readonly worker: string };
  readonly profile: TermRelayProfile;
}): Promise<TermVerifyReport> {
  const problems: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let signatures: "pass" | "fail" = "pass";
  let schema: "pass" | "fail" = "pass";
  let issuers: "pass" | "fail" = "pass";
  let replay: "pass" | "fail" = "pass";
  let deadlines: "pass" | "fail" = "pass";
  let chain: "pass" | "fail" = "pass";
  let session: TermSession | undefined;
  let count = 0;
  const pending: { readonly label: string; readonly message: TermMessage; readonly createdAt: string }[] = [];
  for (const event of input.events.slice().sort(byId)) {
    if (!isObject(event) || !isObject(event["body"])) {
      schema = "fail";
      problems.push("an event is not an object with a body");
      continue;
    }
    const body = event["body"];
    const issuer = text(event, "issuer");
    const createdAt = text(event, "createdAt") ?? "";
    const kind = text(event, "kind");
    const tagged = eventTags(event["tags"])?.some(([name, value]) => name === input.profile.jobTag && value === input.jobId) ?? false;
    if (!tagged || (kind !== input.profile.jobKind && kind !== input.profile.negotiationKind)) {
      continue;
    }
    if (issuer === undefined || (issuer !== input.issuers.client && issuer !== input.issuers.worker)) {
      issuers = "fail";
      problems.push(`an event from ${issuer ?? "nobody"} is from neither party`);
      continue;
    }
    const eventProblem = await eventSignatureProblem(event, issuer);
    if (eventProblem !== undefined) {
      signatures = "fail";
      problems.push(`an event from ${issuer}: event signature: ${eventProblem}`);
      continue;
    }
    const signedContent = signedContentOf(event, issuer);
    if (seen.has(signedContent)) {
      duplicates += 1;
      continue;
    }
    seen.add(signedContent);
    if (kind === input.profile.jobKind) {
      if (body["record"] !== "term-job") {
        schema = "fail";
        problems.push("a job event does not carry a term job record");
        continue;
      }
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
      const opened = await openFromJob(body, input.jobId);
      if (typeof opened === "string") {
        replay = "fail";
        problems.push(opened);
      } else {
        session = opened;
      }
      continue;
    }
    if (body["record"] !== "term" || body["extensionsHeader"] !== input.profile.extensionsHeader) {
      schema = "fail";
      problems.push("a negotiation event is not a term record that activates negotiation");
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
    const messageProblem = await messageSignatureProblem(body["message"], decoded.message, input.issuers[from]);
    if (messageProblem !== undefined) {
      signatures = "fail";
      problems.push(`message ${String(count)}: message signature: ${messageProblem}`);
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
    pending.push({ label: `message ${String(count)}`, message: decoded.message, createdAt });
  }
  const states = new Map<string, { readonly session: TermSession; readonly senders: Set<Party> }>();
  for (let linked = 0; session !== undefined && linked <= count; linked += 1) {
    const current: TermSession = session;
    const expected = await expectedPrevHash(current);
    const index = pending.findIndex((entry) => entry.message.prevHash === expected);
    const next = pending[index];
    if (next === undefined) {
      break;
    }
    pending.splice(index, 1);
    const state = states.get(expected) ?? { session: current, senders: new Set<Party>() };
    state.senders.add(next.message.from);
    states.set(expected, state);
    const applied = await applyChainedTermMessage(current, next.message, { now: () => next.createdAt });
    if (!applied.ok) {
      if (applied.chain) {
        chain = "fail";
      }
      replay = "fail";
      problems.push(`${next.label}: ${applied.reason}`);
      continue;
    }
    session = applied.session;
  }
  if (session !== undefined) {
    const last = await expectedPrevHash(session);
    states.set(last, states.get(last) ?? { session, senders: new Set<Party>() });
  }
  let forks = 0;
  let broken = 0;
  for (const entry of pending) {
    const state = states.get(entry.message.prevHash);
    if (state === undefined) {
      broken += 1;
      continue;
    }
    if (state.senders.has(entry.message.from)) {
      chain = "fail";
      problems.push(`${entry.label}: ${entry.message.from} sent two messages after the same message`);
      continue;
    }
    state.senders.add(entry.message.from);
    const checked = await applyChainedTermMessage(state.session, entry.message, { now: () => entry.createdAt });
    if (!checked.ok) {
      chain = "fail";
      problems.push(`${entry.label}: a fork that is not a valid move: ${checked.reason}`);
      continue;
    }
    forks += 1;
  }
  if (broken > 0) {
    chain = "fail";
    problems.push(`${String(broken)} message(s) point to nothing in the hash chain`);
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
    chain,
    signatures,
    forks,
    duplicates,
    phase: session?.phase ?? "",
    messageCount: count,
    terms: session?.draft?.terms ?? [],
    detail: problems[0] ?? "",
  };
}
