import { decodeTermMessage, sameTermValue, signatureVerification, valueHashVerification } from "@ix/a2a-ext-negotiation";
import type { FixedTerm, TermJson, TermMessage } from "@ix/a2a-ext-negotiation";
import type { JsonObject, JsonValue, RelayEventInput, StoredEvent } from "@ix/distribution";
import {
  clockAt,
  jobKind,
  jobTag,
  mockExtensionsHeader,
  negotiationKind,
  posterIssuer,
  runTermRelay,
  sampleTermClientMandate,
  sampleTermJob,
  sampleTermWorkerMandate,
  termInjectionCases,
  withinLimit,
  workerIssuer,
} from "@ix/agents";
import type { JobBoard, TermInjectionCase, TermJob, TermMandate, TermRelayReport } from "@ix/agents";
import { verifyTermTranscript } from "@ix/verify";

export type OpenTermBoard = (now: string) => JobBoard;

export const termNow = "2026-11-04T00:00:00.000Z";

export type TermMessageEvidence = {
  readonly fuzzRejected: number;
  readonly handAccepted: boolean;
  readonly sawTermJob: boolean;
  readonly sameDraftBothSides: boolean;
  readonly independentReplay: boolean;
};

export type TermMandateEvidence = {
  readonly exactEdgeAgreed: boolean;
  readonly oneOutsideNoDeal: boolean;
  readonly everyMessageInsideOwnMandate: boolean;
  readonly agreedInsideBothMandates: boolean;
};

export type TermDeadlineEvidence = {
  readonly beforeDeadlineAgreed: boolean;
  readonly atDeadlineSilent: boolean;
  readonly afterDeadlineSilent: boolean;
  readonly expiredMessageRefused: boolean;
};

export type TermInjectionObservation = {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
};

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function run(
  openBoard: OpenTermBoard,
  input: {
    readonly now?: string;
    readonly job?: TermJob;
    readonly client?: TermMandate;
    readonly worker?: TermMandate;
    readonly wrap?: (board: JobBoard) => JobBoard;
    readonly seed?: (board: JobBoard) => Promise<void>;
  } = {},
): Promise<TermRelayReport> {
  const now = input.now ?? termNow;
  const raw = openBoard(now);
  const board = input.wrap === undefined ? raw : input.wrap(raw);
  const start = input.seed === undefined ? Promise.resolve() : input.seed(raw);
  return start.then(() =>
    runTermRelay({
      board,
      clock: clockAt(now),
      job: input.job ?? sampleTermJob,
      client: { party: "client", mandate: input.client ?? sampleTermClientMandate, human: "approve" },
      worker: { party: "worker", mandate: input.worker ?? sampleTermWorkerMandate, human: "approve" },
    }),
  );
}

function decodedMessages(events: readonly StoredEvent[]): readonly { readonly issuer: string; readonly message: TermMessage }[] {
  const out: { readonly issuer: string; readonly message: TermMessage }[] = [];
  for (const event of events) {
    const body = event.body;
    if (event.kind !== negotiationKind || !isObject(body) || body["record"] !== "term") {
      continue;
    }
    const decoded = decodeTermMessage(body["message"]);
    if (decoded.ok) {
      out.push({ issuer: event.issuer, message: decoded.message });
    }
  }
  return out;
}

function insideBoth(terms: readonly FixedTerm[]): boolean {
  return terms.every((term) =>
    [sampleTermClientMandate, sampleTermWorkerMandate].every((mandate) => {
      const limit = mandate[term.termId];
      return limit === undefined || withinLimit(limit, term.value);
    }),
  );
}

function sameDraft(report: TermRelayReport): boolean {
  const poster = report.poster.session?.draft;
  const worker = report.worker.session?.draft;
  return poster !== undefined && worker !== undefined && sameTermValue(toJson(poster), toJson(worker));
}

function agreedInsideBoth(report: TermRelayReport): boolean {
  const draft = report.poster.session?.draft;
  return (
    report.poster.session?.phase === "agreed" &&
    report.worker.session?.phase === "agreed" &&
    draft !== undefined &&
    sameDraft(report) &&
    insideBoth(draft.terms)
  );
}

function replayPasses(report: TermRelayReport): boolean {
  const verified = verifyTermTranscript({
    jobId: report.poster.session?.jobId ?? sampleTermJob.jobId,
    events: report.events.map((event) => toJson(event)),
    issuers: { client: posterIssuer, worker: workerIssuer },
    signature: "unverified",
    jws: "unverified",
    prevHash: "unverified",
    jcsBody: null,
  });
  return verified.schema === "pass" && verified.issuers === "pass" && verified.replay === "pass" && verified.deadlines === "pass";
}

const envelope = {
  sentAt: termNow,
  expiresAt: "2026-11-05T00:00:00.000Z",
  prevHash: "unverified",
  signature: { verification: signatureVerification, material: "unverified" },
};

function malformedMessages(): readonly unknown[] {
  const base = { ...envelope, from: "worker", type: "TermPropose", termId: "ix:price", value: { amount: 1, currency: "JPY", taxIncluded: true } };
  let deep: unknown = 1;
  for (let level = 0; level < 100; level += 1) {
    deep = [deep];
  }
  return [
    null,
    "TermPropose",
    [],
    { ...base, type: "Proposal" },
    { ...base, from: "admin" },
    { ...base, termId: 1 },
    { ...base, value: undefined },
    { ...base, value: Number.NaN },
    { ...base, value: deep },
    { ...base, evil: true },
    { ...base, signature: { verification: "verified", material: "x" } },
    { ...base, signature: null },
    { ...base, type: "TermApproval", decision: "maybe" },
    { ...base, type: "TermAdd", definition: { termId: "x:c", version: 1, valueType: "code", codes: [1] }, required: false },
    { ...base, type: "TermAgreementDraft", agreement: null },
    { ...base, sentAt: 5 },
  ];
}

export async function proveTermMessages(openBoard: OpenTermBoard): Promise<TermMessageEvidence> {
  const malformed = malformedMessages();
  const fuzzRejected = malformed.filter((raw) => !decodeTermMessage(raw).ok).length;
  const hand = decodeTermMessage({ ...envelope, from: "client", type: "TermAccept", termId: "ix:price", valueHash: valueHashVerification, value: { amount: 1, currency: "JPY", taxIncluded: true } });
  const report = await run(openBoard);
  const sawTermJob = report.events.some((event) => event.kind === jobKind && isObject(event.body) && event.body["record"] === "term-job");
  return {
    fuzzRejected: fuzzRejected === malformed.length ? fuzzRejected : 0,
    handAccepted: hand.ok,
    sawTermJob,
    sameDraftBothSides: sameDraft(report),
    independentReplay: replayPasses(report),
  };
}

function priceOf(message: TermMessage): number | undefined {
  if ((message.type !== "TermPropose" && message.type !== "TermCounter" && message.type !== "TermAccept") || message.termId !== "ix:price") {
    return undefined;
  }
  const value = toJson(message.value);
  if (!isObject(value)) {
    return undefined;
  }
  const amount = value["amount"];
  return typeof amount === "number" ? amount : undefined;
}

function everyMessageInside(report: TermRelayReport, client: TermMandate, worker: TermMandate): boolean {
  return decodedMessages(report.events).every(({ issuer, message }) => {
    if (message.type !== "TermPropose" && message.type !== "TermCounter" && message.type !== "TermAccept") {
      return true;
    }
    const mandate = issuer === posterIssuer ? client : worker;
    const limit = mandate[message.termId];
    return limit === undefined || message.value === undefined || withinLimit(limit, message.value);
  });
}

export async function proveTermMandate(openBoard: OpenTermBoard): Promise<TermMandateEvidence> {
  const exactWorker: TermMandate = { ...sampleTermWorkerMandate, "ix:price": { kind: "money-min", currency: "JPY", taxIncluded: true, ask: 200000, min: 180000 } };
  const exact = await run(openBoard, { worker: exactWorker });
  const exactPrice = exact.poster.session?.draft?.terms.find((term) => term.termId === "ix:price")?.value;
  const outsideWorker: TermMandate = { ...sampleTermWorkerMandate, "ix:price": { kind: "money-min", currency: "JPY", taxIncluded: true, ask: 200000, min: 180001 } };
  const outside = await run(openBoard, { worker: outsideWorker });
  const clientPrices = decodedMessages(outside.events).filter(({ issuer }) => issuer === posterIssuer).map(({ message }) => priceOf(message));
  const workerPrices = decodedMessages(outside.events).filter(({ issuer }) => issuer === workerIssuer).map(({ message }) => priceOf(message));
  const normal = await run(openBoard);
  return {
    exactEdgeAgreed: exact.poster.session?.phase === "agreed" && sameTermValue(exactPrice, { amount: 180000, currency: "JPY", taxIncluded: true }),
    oneOutsideNoDeal:
      outside.poster.session?.phase === "no_deal" &&
      clientPrices.every((amount) => amount === undefined || amount <= 180000) &&
      workerPrices.every((amount) => amount === undefined || amount >= 180001),
    everyMessageInsideOwnMandate:
      everyMessageInside(exact, sampleTermClientMandate, exactWorker) &&
      everyMessageInside(outside, sampleTermClientMandate, outsideWorker) &&
      everyMessageInside(normal, sampleTermClientMandate, sampleTermWorkerMandate),
    agreedInsideBothMandates: agreedInsideBoth(normal),
  };
}

function countMessages(report: TermRelayReport): number {
  return report.events.filter((event) => event.kind === negotiationKind).length;
}

async function publishAs(board: JobBoard, id: string, issuer: string, message: TermJson): Promise<void> {
  const answer = await board.publish({
    id,
    issuer,
    kind: negotiationKind,
    tags: [[jobTag, sampleTermJob.jobId]],
    createdAt: termNow,
    expiresAt: "2026-11-05T00:00:00.000Z",
    body: { record: "term", extensionsHeader: mockExtensionsHeader, message: toJson(message) },
    sig: "unverified",
  });
  if (!answer.ok) {
    throw new Error(`seeding ${id} failed: ${answer.detail}`);
  }
}

export async function proveTermDeadline(openBoard: OpenTermBoard): Promise<TermDeadlineEvidence> {
  const before = await run(openBoard);
  const atDeadline = await run(openBoard, { job: { ...sampleTermJob, expiresAt: termNow } });
  const after = await run(openBoard, { job: { ...sampleTermJob, expiresAt: "2026-11-03T00:00:00.000Z" } });
  const expired = await run(openBoard, {
    seed: (board) =>
      publishAs(board, "u-0001", workerIssuer, {
        ...envelope,
        expiresAt: "2026-11-03T00:00:00.000Z",
        from: "worker",
        type: "TermPropose",
        termId: "ix:price",
        value: { amount: 1, currency: "JPY", taxIncluded: true },
      }),
  });
  return {
    beforeDeadlineAgreed: agreedInsideBoth(before),
    atDeadlineSilent: countMessages(atDeadline) === 0 && atDeadline.worker.session === undefined,
    afterDeadlineSilent: countMessages(after) === 0 && after.worker.session === undefined,
    expiredMessageRefused: expired.poster.refusals.some((reason) => reason.includes("expired")) && agreedInsideBoth(expired),
  };
}

function noteBoard(board: JobBoard, issuer: string, note: string): JobBoard {
  return {
    publish(input: RelayEventInput) {
      const body = input.body;
      const message = isObject(body) ? body["message"] : undefined;
      if (input.issuer !== issuer || !isObject(body) || !isObject(message) || (message["type"] !== "TermPropose" && message["type"] !== "TermCounter")) {
        return board.publish(input);
      }
      return board.publish({ ...input, body: { ...body, message: { ...message, note } } });
    },
    query: (filter) => board.query(filter),
    subscribe: (filter, listener) => board.subscribe(filter, listener),
  };
}

function shownEverywhere(report: TermRelayReport): readonly string[] {
  return [...report.poster.shownFreeText, ...report.worker.shownFreeText];
}

function noContact(texts: readonly string[]): boolean {
  return texts.every((text) => !text.includes("@") && !/\d{2,4}-\d{2,4}-\d{4}/.test(text));
}

async function observe(openBoard: OpenTermBoard, entry: TermInjectionCase): Promise<TermInjectionObservation> {
  const fail = (detail: string): TermInjectionObservation => ({ id: entry.id, ok: false, detail });
  const pass = (detail: string): TermInjectionObservation => ({ id: entry.id, ok: true, detail });
  switch (entry.place) {
    case "description": {
      const report = await run(openBoard, { job: { ...sampleTermJob, description: entry.text } });
      const presets = report.poster.session?.terms.filter((term) => term.status === "fixed").length;
      if (!agreedInsideBoth(report) || !replayPasses(report) || presets === undefined) {
        return fail("the agreement left a mandate or the replay failed");
      }
      if (!noContact(report.worker.shownFreeText)) {
        return fail("a contact reached the worker's human");
      }
      return pass("agreed inside both mandates; the description changed no term");
    }
    case "worker-note":
    case "client-note": {
      const issuer = entry.place === "worker-note" ? workerIssuer : posterIssuer;
      const report = await run(openBoard, { wrap: (board) => noteBoard(board, issuer, entry.text) });
      const messages = decodedMessages(report.events);
      const approvals = messages.filter(({ message }) => message.type === "TermApproval" && message.decision === "approve").length;
      const issuers = new Set(report.events.map((event) => event.issuer));
      const currencyKept = messages.every(({ message }) => {
        const value = toJson(message.type === "TermPropose" || message.type === "TermCounter" ? message.value : null);
        return !isObject(value) || value["currency"] === undefined || value["currency"] === "JPY";
      });
      const noted = messages.some(({ message }) => (message.type === "TermPropose" || message.type === "TermCounter") && message.note === entry.text);
      if (!noted) {
        return fail("the note never reached the relay");
      }
      if (!agreedInsideBoth(report) || !replayPasses(report) || approvals !== 2 || !currencyKept) {
        return fail("the note changed the agreement, skipped approval, or changed the currency");
      }
      if ([...issuers].some((value) => value !== posterIssuer && value !== workerIssuer)) {
        return fail("an unexpected issuer appeared");
      }
      if (report.events.some((event) => { const verification: string = event.signatureVerification; return verification !== "deferred"; }) || !noContact(shownEverywhere(report))) {
        return fail("a signature was treated as verified or a contact reached a human");
      }
      return pass("the note was carried and shown redacted; terms, approvals, issuers, and signatures were unchanged");
    }
    case "decline-reason": {
      const report = await run(openBoard, {
        seed: (board) => publishAs(board, "u-0001", workerIssuer, { ...envelope, from: "worker", type: "DealDecline", reason: entry.text }),
      });
      return report.poster.session?.phase === "no_deal" && report.poster.session.reason === "declined" && report.worker.session?.phase === "no_deal"
        ? pass("the decline ended the deal on both sides")
        : fail("the decline did not end the deal");
    }
    case "added-label": {
      const report = await run(openBoard, {
        seed: (board) =>
          publishAs(board, "u-0001", workerIssuer, {
            ...envelope,
            from: "worker",
            type: "TermAdd",
            definition: { termId: "x-note:extra", version: 1, valueType: "boolean", label: { ja: entry.text } },
            required: false,
          }),
      });
      return agreedInsideBoth(report) ? pass("the added label changed no other term") : fail("the agreement left a mandate");
    }
    case "expired-note": {
      const report = await run(openBoard, {
        seed: (board) =>
          publishAs(board, "u-0001", workerIssuer, {
            ...envelope,
            expiresAt: "2026-11-03T00:00:00.000Z",
            from: "worker",
            type: "TermPropose",
            termId: "ix:price",
            value: { amount: 1, currency: "JPY", taxIncluded: true },
            note: entry.text,
          }),
      });
      return report.poster.refusals.some((reason) => reason.includes("expired")) && agreedInsideBoth(report)
        ? pass("the expired message was refused and the agreement stayed inside both mandates")
        : fail("the expired message was not refused");
    }
  }
}

export async function runTermInjectionSuite(openBoard: OpenTermBoard): Promise<readonly TermInjectionObservation[]> {
  const observations: TermInjectionObservation[] = [];
  for (const entry of termInjectionCases) {
    observations.push(await observe(openBoard, entry));
  }
  return observations;
}
