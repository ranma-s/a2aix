import { describe, expect, it } from "vitest";
import { applyChainedTermMessage, buildTermAgreement, coreSheet, decodeTermMessage, jwsSignatureFormat, openTermSession, sealTermMessage, signatureVerification, termHash, termSheetHash, valueHashVerification } from "@ix/a2a-ext-negotiation";
import type { Party, TermJson, TermMessage } from "@ix/a2a-ext-negotiation";
import type { JsonValue } from "@ix/distribution";
import { createEphemeralSigner } from "@ix/identity";
import type { EphemeralSigner } from "@ix/identity";
import { eventSigningInput, signingInputExcludingSignature } from "@ix/protocol-core";
import { verifyTermTranscript } from "../src/index.js";

const signers = { client: await createEphemeralSigner(), worker: await createEphemeralSigner() };
const outsider = await createEphemeralSigner();
const approverSigners = { client: await createEphemeralSigner(), worker: await createEphemeralSigner() };
const issuers = { client: signers.client.did, worker: signers.worker.did };
const approvers = { client: approverSigners.client.did, worker: approverSigners.worker.did };
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
    const decoded = decodeTermMessage(await signMessage(await sealTermMessage(session, message), message.type === "TermApproval" ? approverSigners[message.from] : signers[message.from]));
    if (!decoded.ok) {
      throw new Error(decoded.reason);
    }
    const ready = decoded.message;
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

async function signMessage(message: TermMessage, signer: EphemeralSigner): Promise<JsonValue> {
  const plain = toJson({ ...message, signature: { verification: jwsSignatureFormat, material: "" } });
  const material = await signer.signDetached(signingInputExcludingSignature(plain));
  return toJson({ ...message, signature: { verification: jwsSignatureFormat, material } });
}

const profile = { jobKind: "job", negotiationKind: "neg", jobTag: "x-job", extensionsHeader: "h" };

async function signEvent(id: string, signer: EphemeralSigner, createdAt: string, body: JsonValue, kind?: string): Promise<JsonValue> {
  const record = isRecord(body) ? body["record"] : undefined;
  const fields = { issuer: signer.did, kind: kind ?? (record === "term-job" ? "job" : "neg"), tags: [["x-job", "j"]] as const, createdAt, expiresAt: "2026-11-05T00:00:00.000Z", body };
  return toJson({ ...fields, id, sig: await signer.signDetached(eventSigningInput(fields)) });
}

type EventOptions = {
  readonly createdAt?: (index: number) => string;
  readonly issuer?: (index: number, message: TermMessage) => EphemeralSigner;
  readonly author?: (index: number, message: TermMessage) => EphemeralSigner | undefined;
};

async function toEvents(job: JsonValue, sealed: readonly TermMessage[], options: EventOptions = {}): Promise<JsonValue[]> {
  const events: JsonValue[] = [await signEvent("t-0001", signers.client, at, { record: "term-job", job })];
  for (const [index, message] of sealed.entries()) {
    const own = signers[message.from];
    const author = message.type === "TermApproval" ? approverSigners[message.from] : own;
    const signedMessage = await signMessage(message, options.author?.(index, message) ?? author);
    events.push(await signEvent(`t-${String(index + 2).padStart(4, "0")}`, options.issuer?.(index, message) ?? own, options.createdAt?.(index) ?? at, { record: "term", extensionsHeader: "h", message: signedMessage }));
  }
  return events;
}

async function transcript(): Promise<JsonValue[]> {
  const { job, sealed } = await sealedMessages();
  return await toEvents(job, sealed);
}

function isRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !isList(value);
}

function isList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}


describe("independent term transcript verification", () => {
  it("replays the relay events to the same agreement and checks the hash chain", async () => {
    const report = await verifyTermTranscript({ jobId: "j", events: await transcript(), issuers, approvers, profile });
    expect(report).toMatchObject({ schema: "pass", issuers: "pass", replay: "pass", deadlines: "pass", chain: "pass", signatures: "pass", phase: "agreed" });
    expect(report.terms.find((term) => term.termId === "ix:price")?.value).toEqual(yen(180000));
  });

  it("fails when an event's issuer does not match its sender, a value is altered, or the job is missing", async () => {
    const { job, sealed } = await sealedMessages();
    const swapped = await toEvents(job, sealed, { issuer: (index) => (index === 0 ? signers.client : signers[sealed[index]?.from ?? "client"]) });
    expect((await verifyTermTranscript({ jobId: "j", events: swapped, issuers, approvers, profile })).issuers).toBe("fail");
    const first = sealed[0];
    if (first === undefined || first.type !== "TermPropose") {
      throw new Error("fixture");
    }
    const altered = await toEvents(job, [{ ...first, value: yen(1) }, ...sealed.slice(1)]);
    const report = await verifyTermTranscript({ jobId: "j", events: altered, issuers, approvers, profile });
    expect(report.chain).toBe("fail");
    expect(report.phase).not.toBe("agreed");
    expect((await verifyTermTranscript({ jobId: "j", events: (await transcript()).slice(1), issuers, approvers, profile })).replay).toBe("fail");
  });

  it("follows the hash chain, not relay order, and detects re-pointed messages, a changed job, and a rewritten agreement", async () => {
    const { job, sealed } = await sealedMessages();
    const [a, b, ...rest] = sealed;
    if (a === undefined || b === undefined) {
      throw new Error("fixture");
    }
    const shuffled = await verifyTermTranscript({ jobId: "j", events: await toEvents(job, [b, a, ...rest]), issuers, approvers, profile });
    expect(shuffled).toMatchObject({ chain: "pass", replay: "pass", phase: "agreed", forks: 0 });
    const fork: TermMessage = { ...envelope("client"), type: "TermPropose", termId: "ix:revision-limit", value: 2, prevHash: a.prevHash };
    const forked = await verifyTermTranscript({ jobId: "j", events: await toEvents(job, [a, b, ...rest, fork]), issuers, approvers, profile });
    expect(forked).toMatchObject({ chain: "pass", phase: "agreed", forks: 1 });
    const twice: TermMessage = { ...envelope("worker"), type: "TermPropose", termId: "ix:price", value: yen(1), prevHash: a.prevHash };
    const twiceReport = await verifyTermTranscript({ jobId: "j", events: await toEvents(job, [a, b, ...rest, twice]), issuers, approvers, profile });
    expect(twiceReport).toMatchObject({ chain: "fail", forks: 0 });
    expect(twiceReport.detail).toContain("two messages after the same message");
    const clientApproval = sealed[sealed.length - 2];
    const workerApproval = sealed[sealed.length - 1];
    if (clientApproval?.type !== "TermApproval" || workerApproval?.type !== "TermApproval") {
      throw new Error("fixture");
    }
    const early = { ...workerApproval, prevHash: clientApproval.prevHash };
    const goodFork = await verifyTermTranscript({ jobId: "j", events: await toEvents(job, [...sealed, early]), issuers, approvers, profile });
    expect(goodFork).toMatchObject({ chain: "pass", forks: 1 });
    const badForkReport = await verifyTermTranscript({ jobId: "j", events: await toEvents(job, [...sealed, { ...early, agreementHash: "0".repeat(64) }]), issuers, approvers, profile });
    expect(badForkReport).toMatchObject({ chain: "fail", forks: 0 });
    expect(badForkReport.detail).toContain("agreementHash");
    const repointed = await toEvents(job, [{ ...b, prevHash: a.prevHash }, { ...a, prevHash: "0".repeat(64) }, ...rest]);
    const repointedReport = await verifyTermTranscript({ jobId: "j", events: repointed, issuers, approvers, profile });
    expect(repointedReport.chain).toBe("fail");
    expect(repointedReport.phase).not.toBe("agreed");
    const otherJob = isRecord(job) ? { ...job, roundLimitPerTerm: 2 } : job;
    const reanchored = await verifyTermTranscript({ jobId: "j", events: await toEvents(otherJob, sealed), issuers, approvers, profile });
    expect(reanchored.chain).toBe("fail");
    const lastTwo = sealed.slice(-3);
    const draft = lastTwo[0];
    if (draft === undefined || draft.type !== "TermAgreementDraft") {
      throw new Error("fixture");
    }
    const rewritten = await toEvents(job, [...sealed.slice(0, -3), { ...draft, agreement: { ...draft.agreement, agreementId: "other" } }, ...sealed.slice(-2)]);
    const rewrittenReport = await verifyTermTranscript({ jobId: "j", events: rewritten, issuers, approvers, profile });
    expect(rewrittenReport.chain).toBe("fail");
    expect(rewrittenReport.phase).not.toBe("agreed");
  });

  it("fails signatures for a changed signed message, another party's key, an outsider's key, an unsigned message, and a changed event", async () => {
    const { job, sealed } = await sealedMessages();
    const events = await toEvents(job, sealed);
    const second = events[2];
    if (!isRecord(second) || !isRecord(second["body"]) || !isRecord(second["body"]["message"])) {
      throw new Error("fixture");
    }
    const changedBody = { ...second["body"], message: { ...second["body"]["message"], valueHash: "0".repeat(64) } };
    const relayChanged = { ...second, body: changedBody };
    const changedMessage = await signEvent("t-0003", signers.client, at, changedBody);
    const changedEvent = { ...second, createdAt: "2026-11-03T00:00:01.000Z" };
    const unsigned = await signEvent("t-0003", signers.client, at, { ...second["body"], message: { ...second["body"]["message"], signature: { verification: signatureVerification, material: "u" } } });
    const cases: readonly (readonly [JsonValue[], RegExp])[] = [
      [events.map((event, index) => (index === 2 ? changedMessage : event)), /message 2: message signature/],
      [events.map((event, index) => (index === 2 ? relayChanged : event)), /event signature/],
      [events.map((event, index) => (index === 2 ? changedEvent : event)), /event signature/],
      [events.map((event, index) => (index === 2 ? unsigned : event)), /the message is not signed/],
      [await toEvents(job, sealed, { author: (index) => (index === 1 ? signers.worker : undefined) }), /message 2: message signature/],
      [await toEvents(job, sealed, { author: (index) => (index === 1 ? outsider : undefined) }), /message 2: message signature/],
    ];
    for (const [tampered, reason] of cases) {
      const report = await verifyTermTranscript({ jobId: "j", events: tampered, issuers, approvers, profile });
      expect(report.signatures).toBe("fail");
      expect(report.phase).not.toBe("agreed");
      expect(report.detail).toMatch(reason);
    }
    const byOutsider = await toEvents(job, sealed, { issuer: (index, message) => (index === 1 ? outsider : signers[message.from]) });
    const outsiderReport = await verifyTermTranscript({ jobId: "j", events: byOutsider, issuers, approvers, profile });
    expect(outsiderReport.issuers).toBe("fail");
    expect(outsiderReport.phase).not.toBe("agreed");
  });

  it("checks each human approval against that party's approver did:key, not the agent key", async () => {
    const { job, sealed } = await sealedMessages();
    const clientApproval = sealed.length - 2;
    const wrongKeys: readonly EphemeralSigner[] = [signers.client, approverSigners.worker, outsider];
    for (const wrong of wrongKeys) {
      const events = await toEvents(job, sealed, { author: (index) => (index === clientApproval ? wrong : undefined) });
      const report = await verifyTermTranscript({ jobId: "j", events, issuers, approvers, profile });
      expect(report.signatures).toBe("fail");
      expect(report.phase).not.toBe("agreed");
      expect(report.detail).toMatch(new RegExp(`message ${String(clientApproval + 1)}: message signature`));
    }
    const sameAsAgent = await verifyTermTranscript({ jobId: "j", events: await transcript(), issuers, approvers: { ...approvers, worker: issuers.worker }, profile });
    expect(sameAsAgent.issuers).toBe("fail");
    expect(sameAsAgent.detail).toBe("the worker approver did:key is the worker agent did:key");
    const crossed = await verifyTermTranscript({ jobId: "j", events: await transcript(), issuers, approvers: { ...approvers, client: issuers.worker }, profile });
    expect(crossed.issuers).toBe("fail");
  });

  it("reads events by kind and tag like the agents, and treats an exact copy of a signed event as a duplicate", async () => {
    const { job, sealed } = await sealedMessages();
    const events = await toEvents(job, sealed);
    const first = events[1];
    const jobEvent = events[0];
    if (!isRecord(first) || !isRecord(jobEvent) || !isRecord(first["body"]) || !isRecord(jobEvent["body"])) {
      throw new Error("fixture");
    }
    const hidden = await signEvent("t-0002", signers.worker, at, first["body"], "ix.not-negotiation");
    const hiddenReport = await verifyTermTranscript({ jobId: "j", events: events.map((event, index) => (index === 1 ? hidden : event)), issuers, approvers, profile });
    expect(hiddenReport.phase).not.toBe("agreed");
    expect(hiddenReport.chain).toBe("fail");
    const jobAsMessage = await signEvent("t-0001", signers.client, at, jobEvent["body"], "neg");
    const jobAsMessageReport = await verifyTermTranscript({ jobId: "j", events: [jobAsMessage, ...events.slice(1)], issuers, approvers, profile });
    expect(jobAsMessageReport.phase).not.toBe("agreed");
    expect(jobAsMessageReport.schema).toBe("fail");
    const untagged = await verifyTermTranscript({ jobId: "other", events, issuers, approvers, profile });
    expect(untagged.phase).not.toBe("agreed");
    const copies = [...events, { ...first, id: "t-9998" }, { ...jobEvent, id: "t-9999" }];
    const copied = await verifyTermTranscript({ jobId: "j", events: copies, issuers, approvers, profile });
    expect(copied).toMatchObject({ phase: "agreed", chain: "pass", replay: "pass", signatures: "pass", duplicates: 2 });
  });

  it("fails deadlines when a message is published at or after its own expiry", async () => {
    const { job, sealed } = await sealedMessages();
    const late = await toEvents(job, sealed, { createdAt: (index) => (index === 0 ? "2026-11-04T00:00:00.000Z" : at) });
    expect((await verifyTermTranscript({ jobId: "j", events: late, issuers, approvers, profile })).deadlines).toBe("fail");
  });
});
