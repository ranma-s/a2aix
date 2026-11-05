import { describe, expect, it } from "vitest";
import { buildTermAgreement, openTermSession, applyTermMessage, coreSheet, signatureVerification, valueHashVerification } from "@ix/a2a-ext-negotiation";
import type { Party, TermJson, TermMessage } from "@ix/a2a-ext-negotiation";
import type { JsonValue } from "@ix/distribution";
import { checkJcs, checkJws, checkPrevHash, checkSignature, verifyTermTranscript } from "../src/index.js";

const issuers = { client: "did:example:poster", worker: "did:example:worker" };
const at = "2026-11-03T00:00:00.000Z";
const yen = (amount: number): TermJson => ({ amount, currency: "JPY", taxIncluded: true });

function envelope(from: Party) {
  return { from, sentAt: at, expiresAt: "2026-11-04T00:00:00.000Z", prevHash: "unverified", signature: { verification: signatureVerification, material: "u" } };
}

const messages: TermMessage[] = [
  { ...envelope("worker"), type: "TermPropose", termId: "ix:price", value: yen(180000) },
  { ...envelope("client"), type: "TermAccept", termId: "ix:price", valueHash: valueHashVerification, value: yen(180000) },
  { ...envelope("worker"), type: "TermPropose", termId: "ix:deadline", value: { at: "2026-12-20T18:00:00+09:00", zone: "Asia/Tokyo" } },
  { ...envelope("client"), type: "TermAccept", termId: "ix:deadline", valueHash: valueHashVerification, value: { at: "2026-12-20T18:00:00+09:00", zone: "Asia/Tokyo" } },
  { ...envelope("client"), type: "TermPropose", termId: "ix:revision-limit", value: 2 },
  { ...envelope("worker"), type: "TermAccept", termId: "ix:revision-limit", valueHash: valueHashVerification, value: 2 },
  { ...envelope("client"), type: "TermPropose", termId: "ix:acceptance-window", value: { value: 7, unit: "day" } },
  { ...envelope("worker"), type: "TermAccept", termId: "ix:acceptance-window", valueHash: valueHashVerification, value: { value: 7, unit: "day" } },
  { ...envelope("client"), type: "TermPropose", termId: "ix:deliverables", value: [{ code: "web-page", n: 5 }] },
  { ...envelope("worker"), type: "TermAccept", termId: "ix:deliverables", valueHash: valueHashVerification, value: [{ code: "web-page", n: 5 }] },
  { ...envelope("worker"), type: "TermAccept", termId: "ix:deliverable-format", valueHash: valueHashVerification, value: ["text/html"] },
];

function toJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map(toJson);
  }
  if (typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) {
        out[key] = toJson(child);
      }
    }
    return out;
  }
  return null;
}

function transcript(): JsonValue[] {
  const opened = openTermSession({ jobId: "j", sheet: coreSheet, sheetSha256: "u", preset: [{ termId: "ix:deliverable-format", value: ["text/html"] }], roundLimitPerTerm: 3 });
  if (!opened.ok) {
    throw new Error(opened.reason);
  }
  let session = opened.session;
  const all: TermMessage[] = [...messages];
  for (const message of messages) {
    const applied = applyTermMessage(session, message, { now: () => at });
    if (!applied.ok) {
      throw new Error(applied.reason);
    }
    session = applied.session;
  }
  const agreement = buildTermAgreement(session, "agr", "unverified");
  if (agreement === undefined) {
    throw new Error("not ready");
  }
  all.push({ ...envelope("client"), type: "TermAgreementDraft", agreement });
  all.push({ ...envelope("client"), type: "TermApproval", decision: "approve" });
  all.push({ ...envelope("worker"), type: "TermApproval", decision: "approve" });
  const events: JsonValue[] = [
    { id: "t-0001", issuer: issuers.client, createdAt: at, body: { record: "term-job", job: { jobId: "j", sheetId: "ix:core", sheetVersion: 1, sheetSha256: "u", preset: [{ termId: "ix:deliverable-format", value: ["text/html"] }], roundLimitPerTerm: 3 } } },
  ];
  all.forEach((message, index) => {
    events.push({ id: `t-${String(index + 2).padStart(4, "0")}`, issuer: message.from === "client" ? issuers.client : issuers.worker, createdAt: at, body: { record: "term", message: toJson(message) } });
  });
  return events;
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !isList(value);
}

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

const deferredInput = { signature: "u", jws: "u", prevHash: "u", jcsBody: null };

describe("independent term transcript verification", () => {
  it("replays the relay events to the same agreement", () => {
    const report = verifyTermTranscript({ jobId: "j", events: transcript(), issuers, ...deferredInput });
    expect(report).toMatchObject({ schema: "pass", issuers: "pass", replay: "pass", deadlines: "pass", phase: "agreed" });
    expect(report.terms.find((term) => term.termId === "ix:price")?.value).toEqual(yen(180000));
    expect(report.deferred.map((check) => check.name)).toEqual(["signature", "jcs", "jws", "prevHash"]);
  });

  it("fails when an event's issuer does not match its sender, a value is altered, or the job is missing", () => {
    const swapped = transcript().map((event, index) => (index === 1 && isRecord(event) ? { ...event, issuer: issuers.client } : event));
    expect(verifyTermTranscript({ jobId: "j", events: swapped, issuers, ...deferredInput }).issuers).toBe("fail");
    const altered = transcript().map((event, index) => {
      if (index !== 2 || !isRecord(event)) {
        return event;
      }
      return { ...event, body: { record: "term", message: toJson({ ...messages[1], value: yen(1) }) } };
    });
    expect(verifyTermTranscript({ jobId: "j", events: altered, issuers, ...deferredInput }).replay).toBe("fail");
    expect(verifyTermTranscript({ jobId: "j", events: transcript().slice(1), issuers, ...deferredInput }).replay).toBe("fail");
  });

  it("keeps the four cryptographic checks deferred", () => {
    const report = verifyTermTranscript({ jobId: "j", events: transcript(), issuers, ...deferredInput });
    expect(report.deferred.map((check) => check.status)).toEqual(["deferred", "deferred", "deferred", "deferred"]);
    for (const check of [checkSignature("x"), checkJcs({ a: 1 }), checkJws("x"), checkPrevHash("x")]) {
      expect(check.status).toBe("deferred");
    }
  });

  it("fails deadlines when a message is published at or after its own expiry", () => {
    const late = transcript().map((event, index) => (index === 1 && isRecord(event) ? { ...event, createdAt: "2026-11-04T00:00:00.000Z" } : event));
    expect(verifyTermTranscript({ jobId: "j", events: late, issuers, ...deferredInput }).deadlines).toBe("fail");
  });
});
