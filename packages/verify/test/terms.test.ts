import { describe, expect, it } from "vitest";
import { applyChainedTermMessage, buildTermAgreement, coreSheet, openTermSession, sealTermMessage, signatureVerification, termHash, termSheetHash, valueHashVerification } from "@ix/a2a-ext-negotiation";
import type { Party, TermJson, TermMessage } from "@ix/a2a-ext-negotiation";
import type { JsonValue } from "@ix/distribution";
import { checkJws, checkSignature, verifyTermTranscript } from "../src/index.js";

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

async function sealedMessages(): Promise<{ readonly job: JsonValue; readonly sealed: TermMessage[] }> {
  const preset = [{ termId: "ix:deliverable-format", value: ["text/html"] }];
  const job = { jobId: "j", sheetId: "ix:core", sheetVersion: 1, sheetSha256: await termSheetHash(coreSheet), preset, roundLimitPerTerm: 3 };
  const opened = openTermSession({ jobId: "j", sheet: coreSheet, sheetSha256: job.sheetSha256, preset, roundLimitPerTerm: 3, anchorHash: await termHash(job) });
  if (!opened.ok) {
    throw new Error(opened.reason);
  }
  let session = opened.session;
  const sealed: TermMessage[] = [];
  const push = async (message: TermMessage): Promise<void> => {
    const ready = await sealTermMessage(session, message);
    const applied = await applyChainedTermMessage(session, ready, { now: () => at });
    if (!applied.ok) {
      throw new Error(applied.reason);
    }
    session = applied.session;
    sealed.push(ready);
  };
  for (const message of messages) {
    await push(message);
  }
  const agreement = buildTermAgreement(session, "agr", "unverified");
  if (agreement === undefined) {
    throw new Error("not ready");
  }
  await push({ ...envelope("client"), type: "TermAgreementDraft", agreement });
  await push({ ...envelope("client"), type: "TermApproval", decision: "approve" });
  await push({ ...envelope("worker"), type: "TermApproval", decision: "approve" });
  return { job: toJson(job), sealed };
}

function toEvents(job: JsonValue, sealed: readonly TermMessage[]): JsonValue[] {
  const events: JsonValue[] = [{ id: "t-0001", issuer: issuers.client, createdAt: at, body: { record: "term-job", job } }];
  sealed.forEach((message, index) => {
    events.push({ id: `t-${String(index + 2).padStart(4, "0")}`, issuer: message.from === "client" ? issuers.client : issuers.worker, createdAt: at, body: { record: "term", message: toJson(message) } });
  });
  return events;
}

async function transcript(): Promise<JsonValue[]> {
  const { job, sealed } = await sealedMessages();
  return toEvents(job, sealed);
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !isList(value);
}

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

const deferredInput = { signature: "u", jws: "u" };

describe("independent term transcript verification", () => {
  it("replays the relay events to the same agreement and checks the hash chain", async () => {
    const report = await verifyTermTranscript({ jobId: "j", events: await transcript(), issuers, ...deferredInput });
    expect(report).toMatchObject({ schema: "pass", issuers: "pass", replay: "pass", deadlines: "pass", chain: "pass", phase: "agreed" });
    expect(report.terms.find((term) => term.termId === "ix:price")?.value).toEqual(yen(180000));
    expect(report.deferred.map((check) => check.name)).toEqual(["signature", "jws"]);
  });

  it("fails when an event's issuer does not match its sender, a value is altered, or the job is missing", async () => {
    const swapped = (await transcript()).map((event, index) => (index === 1 && isRecord(event) ? { ...event, issuer: issuers.client } : event));
    expect((await verifyTermTranscript({ jobId: "j", events: swapped, issuers, ...deferredInput })).issuers).toBe("fail");
    const { job, sealed } = await sealedMessages();
    const first = sealed[0];
    if (first === undefined || first.type !== "TermPropose") {
      throw new Error("fixture");
    }
    const altered = toEvents(job, [{ ...first, value: yen(1) }, ...sealed.slice(1)]);
    const report = await verifyTermTranscript({ jobId: "j", events: altered, issuers, ...deferredInput });
    expect(report.chain).toBe("fail");
    expect(report.phase).not.toBe("agreed");
    expect((await verifyTermTranscript({ jobId: "j", events: (await transcript()).slice(1), issuers, ...deferredInput })).replay).toBe("fail");
  });

  it("follows the hash chain, not relay order, and detects re-pointed messages, a changed job, and a rewritten agreement", async () => {
    const { job, sealed } = await sealedMessages();
    const [a, b, ...rest] = sealed;
    if (a === undefined || b === undefined) {
      throw new Error("fixture");
    }
    const shuffled = await verifyTermTranscript({ jobId: "j", events: toEvents(job, [b, a, ...rest]), issuers, ...deferredInput });
    expect(shuffled).toMatchObject({ chain: "pass", replay: "pass", phase: "agreed", forks: 0 });
    const forked = await verifyTermTranscript({ jobId: "j", events: toEvents(job, [a, b, ...rest, { ...b, expiresAt: a.expiresAt }]), issuers, ...deferredInput });
    expect(forked).toMatchObject({ chain: "pass", phase: "agreed", forks: 1 });
    const repointed = toEvents(job, [{ ...b, prevHash: a.prevHash }, { ...a, prevHash: "0".repeat(64) }, ...rest]);
    const repointedReport = await verifyTermTranscript({ jobId: "j", events: repointed, issuers, ...deferredInput });
    expect(repointedReport.chain).toBe("fail");
    expect(repointedReport.phase).not.toBe("agreed");
    const otherJob = isRecord(job) ? { ...job, roundLimitPerTerm: 2 } : job;
    const reanchored = await verifyTermTranscript({ jobId: "j", events: toEvents(otherJob, sealed), issuers, ...deferredInput });
    expect(reanchored.chain).toBe("fail");
    const lastTwo = sealed.slice(-3);
    const draft = lastTwo[0];
    if (draft === undefined || draft.type !== "TermAgreementDraft") {
      throw new Error("fixture");
    }
    const rewritten = toEvents(job, [...sealed.slice(0, -3), { ...draft, agreement: { ...draft.agreement, agreementId: "other" } }, ...sealed.slice(-2)]);
    const rewrittenReport = await verifyTermTranscript({ jobId: "j", events: rewritten, issuers, ...deferredInput });
    expect(rewrittenReport.chain).toBe("fail");
    expect(rewrittenReport.phase).not.toBe("agreed");
  });

  it("keeps signature and JWS deferred", async () => {
    const report = await verifyTermTranscript({ jobId: "j", events: await transcript(), issuers, ...deferredInput });
    expect(report.deferred.map((check) => check.status)).toEqual(["deferred", "deferred"]);
    for (const check of [checkSignature("x"), checkJws("x")]) {
      expect(check.status).toBe("deferred");
    }
  });

  it("fails deadlines when a message is published at or after its own expiry", async () => {
    const late = (await transcript()).map((event, index) => (index === 1 && isRecord(event) ? { ...event, createdAt: "2026-11-04T00:00:00.000Z" } : event));
    expect((await verifyTermTranscript({ jobId: "j", events: late, issuers, ...deferredInput })).deadlines).toBe("fail");
  });
});
