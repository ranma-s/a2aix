import { apply, openNegotiation } from "@ix/a2a-ext-negotiation";
import type {
  AgreementDraftMessage,
  Clock,
  HumanDecision,
  Money,
  NegotiationSession,
  Party,
} from "@ix/a2a-ext-negotiation";
import { isDue } from "@ix/distribution";
import type { JsonObject, StoredEvent } from "@ix/distribution";
import type { JobBoard } from "./board.js";
import { posterAllows, sameMoney, workerAllows } from "./bounds.js";
import {
  buildApproval,
  buildCounter,
  buildDraft,
  buildProposal,
  jobRecord,
  negotiationRecord,
  readJobRecord,
  readNegotiationRecord,
} from "./codec.js";
import type { NegotiationMessage } from "./codec.js";
import {
  jobKind,
  jobTag,
  mockExtensionsHeader,
  negotiationKind,
  posterIssuer,
  unverifiedSig,
  unverifiedTranscript,
  workerIssuer,
} from "./kinds.js";
import { sampleProposalNote } from "./sample.js";
import type { MockJob, PosterBound, Refusal, SideSnapshot, WorkerBound } from "./types.js";

export type MockSide = {
  readonly party: Party;
  readonly session: () => NegotiationSession;
  readonly refusals: () => readonly Refusal[];
  readonly step: () => Promise<void>;
};

export type ExchangeReport = {
  readonly poster: SideSnapshot;
  readonly worker: SideSnapshot;
  readonly events: readonly StoredEvent[];
};

const maxExchangeSteps = 24;
const maxIdAttempts = 3;

export function createPoster(input: {
  readonly board: JobBoard;
  readonly clock: Clock;
  readonly job: MockJob;
  readonly bound: PosterBound;
  readonly human: HumanDecision;
  readonly humanComment?: string;
}): MockSide {
  return createSide({
    board: input.board,
    clock: input.clock,
    job: input.job,
    party: "client",
    issuer: posterIssuer,
    human: input.human,
    humanComment: input.humanComment ?? "",
    proposalNote: sampleProposalNote,
    posterBound: input.bound,
    workerBound: undefined,
  });
}

export function createWorker(input: {
  readonly board: JobBoard;
  readonly clock: Clock;
  readonly job: MockJob;
  readonly bound: WorkerBound;
  readonly human: HumanDecision;
  readonly humanComment?: string;
  readonly proposalNote?: string;
}): MockSide {
  return createSide({
    board: input.board,
    clock: input.clock,
    job: input.job,
    party: "worker",
    issuer: workerIssuer,
    human: input.human,
    humanComment: input.humanComment ?? "",
    proposalNote: input.proposalNote ?? sampleProposalNote,
    posterBound: undefined,
    workerBound: input.bound,
  });
}

export async function runPosterWorker(input: {
  readonly board: JobBoard;
  readonly clock: Clock;
  readonly job: MockJob;
  readonly posterBound: PosterBound;
  readonly workerBound: WorkerBound;
  readonly humans: {
    readonly client: HumanDecision;
    readonly worker: HumanDecision;
  };
}): Promise<ExchangeReport> {
  const poster = createPoster({
    board: input.board,
    clock: input.clock,
    job: input.job,
    bound: input.posterBound,
    human: input.humans.client,
  });
  const worker = createWorker({
    board: input.board,
    clock: input.clock,
    job: input.job,
    bound: input.workerBound,
    human: input.humans.worker,
  });
  for (let index = 0; index < maxExchangeSteps; index += 1) {
    await poster.step();
    await worker.step();
    if (isTerminal(poster.session()) && isTerminal(worker.session())) {
      break;
    }
  }
  return {
    poster: snapshot(poster),
    worker: snapshot(worker),
    events: await loadEvents(input.board, input.job.jobId),
  };
}

type SideInput = {
  readonly board: JobBoard;
  readonly clock: Clock;
  readonly job: MockJob;
  readonly party: Party;
  readonly issuer: string;
  readonly human: HumanDecision;
  readonly humanComment: string;
  readonly proposalNote: string;
  readonly posterBound: PosterBound | undefined;
  readonly workerBound: WorkerBound | undefined;
};

function createSide(input: SideInput): MockSide {
  let session: NegotiationSession = openNegotiation({
    type: "request",
    jobId: input.job.jobId,
    maxRoundTrips: input.job.maxRoundTrips,
    expiresAt: input.job.expiresAt,
  });
  const refusals: Refusal[] = [];
  const seen = new Set<string>();
  let posted: MockJob | undefined;
  let jobEventId: string | undefined;
  let lastMessageId: string | undefined;
  let latest: Money | undefined;
  let draftHash: string | undefined;
  let deadlineNoted = false;
  let jobSettled = false;
  let proposalSettled = false;
  let termsSettled = false;
  let draftSettled = false;
  let approvalSettled = false;

  function remember(reason: Refusal["reason"], detail: string): void {
    refusals.push({ reason, detail });
  }

  async function publishBody(kind: string, expiresAt: string, body: JsonObject): Promise<boolean> {
    const result = await publishEvent({
      board: input.board,
      clock: input.clock,
      issuer: input.issuer,
      jobId: input.job.jobId,
      kind,
      expiresAt,
      body,
    });
    if (result.ok) {
      return true;
    }
    remember(result.reason === "public_publish_refused" ? "closed" : "publish_failed", result.detail);
    return false;
  }

  async function ingest(): Promise<void> {
    for (const event of await loadEvents(input.board, input.job.jobId)) {
      if (seen.has(event.id)) {
        continue;
      }
      seen.add(event.id);
      if (event.kind === jobKind) {
        const job = readJobRecord(event.body);
        if (job === undefined || job.jobId !== input.job.jobId) {
          remember("bad_message", event.id);
          continue;
        }
        if (posted === undefined) {
          posted = job;
          jobEventId = event.id;
        }
        continue;
      }
      if (event.kind !== negotiationKind) {
        continue;
      }
      const read = readNegotiationRecord(event.body);
      if (!read.ok) {
        remember(read.reason === "not_negotiation" ? "bad_message" : read.reason, event.id);
        continue;
      }
      if (read.message.type === "AgreementDraft" && !acceptableDraft(read.message)) {
        continue;
      }
      const outcome = apply(session, toEvent(read.message), input.clock);
      if (!outcome.ok) {
        remember("not_applied", event.id);
        continue;
      }
      session = outcome.session;
      lastMessageId = event.id;
      if (read.message.type === "Proposal") {
        latest = read.message.price;
      }
      if (read.message.type === "AgreementDraft") {
        latest = read.message.price;
        draftHash = read.message.transcriptHash;
      }
    }
  }

  function allowsPrice(price: Money): boolean {
    if (input.party === "client") {
      return input.posterBound !== undefined && posterAllows(input.posterBound, price);
    }
    if (input.workerBound === undefined) {
      return false;
    }
    const hours = posted === undefined ? input.job.hoursPerWeek : posted.hoursPerWeek;
    const scope = posted === undefined ? input.job.scope : posted.scope;
    return workerAllows(input.workerBound, price, hours, scope);
  }

  function acceptableDraft(draft: AgreementDraftMessage): boolean {
    if (draft.transcriptHash !== unverifiedTranscript(draft.price.amount)) {
      remember("bad_message", "agreement amount is not bound into the linkage");
      return false;
    }
    if (!allowsPrice(draft.price)) {
      remember("outside_mandate", "the agreement is outside the bound");
      return false;
    }
    if (latest !== undefined && !sameMoney(latest, draft.price)) {
      remember("outside_mandate", "the agreement amount differs from the offer");
      return false;
    }
    return true;
  }

  function tickDeadline(detail: string): void {
    if (!deadlineNoted) {
      remember("deadline", detail);
      deadlineNoted = true;
    }
    const outcome = apply(session, { type: "tick" }, input.clock);
    if (outcome.ok) {
      session = outcome.session;
    }
  }

  async function step(): Promise<void> {
    if (isTerminal(session)) {
      return;
    }
    if (isDue(session.expiresAt, input.clock.now())) {
      tickDeadline("the deadline passed before a response");
      return;
    }
    await ingest();
    if (isTerminal(session)) {
      return;
    }
    if (input.party === "client") {
      await actPoster();
      return;
    }
    await actWorker();
  }

  async function actPoster(): Promise<void> {
    const bound = input.posterBound;
    if (bound === undefined) {
      return;
    }
    if (!jobSettled) {
      jobSettled = true;
      if (!posterAllows(bound, input.job.budgetMax) || !posterAllows(bound, input.job.budgetMin)) {
        remember("outside_mandate", "the job budget is above the poster maximum");
        return;
      }
      await publishBody(jobKind, input.job.expiresAt, jobRecord(input.job));
      return;
    }
    if (
      session.phase === "negotiating" &&
      session.awaitingParty === "client" &&
      !session.draftPending &&
      !termsSettled
    ) {
      if (latest === undefined || lastMessageId === undefined) {
        return;
      }
      termsSettled = true;
      const decision = posterAllows(bound, latest) ? "accept" : "decline";
      if (decision === "decline") {
        remember("outside_mandate", "the proposal is above the poster maximum");
      }
      const counter = buildCounter({
        party: "client",
        decision,
        inReplyTo: lastMessageId,
        prevHash: lastMessageId,
        expiresAt: input.job.expiresAt,
        note: "",
      });
      await publishBody(negotiationKind, input.job.expiresAt, negotiationRecord(counter, mockExtensionsHeader));
      return;
    }
    if (session.phase === "negotiating" && session.draftPending && !draftSettled) {
      if (latest === undefined) {
        return;
      }
      if (!allowsPrice(latest)) {
        remember("outside_mandate", "the draft would leave the bound");
        draftSettled = true;
        return;
      }
      draftSettled = true;
      const draft = buildDraft({
        job: input.job,
        price: latest,
        expiresAt: input.job.expiresAt,
      });
      await publishBody(negotiationKind, input.job.expiresAt, negotiationRecord(draft, mockExtensionsHeader));
      return;
    }
    await publishApproval();
  }

  async function actWorker(): Promise<void> {
    const bound = input.workerBound;
    if (bound === undefined || proposalSettled || session.phase !== "idle") {
      await publishApproval();
      return;
    }
    if (posted === undefined || jobEventId === undefined) {
      return;
    }
    proposalSettled = true;
    if (isDue(posted.expiresAt, input.clock.now())) {
      tickDeadline("the posted job has expired");
      return;
    }
    if (!workerAllows(bound, posted.budgetMax, posted.hoursPerWeek, posted.scope)) {
      remember("outside_mandate", "the offer is outside the worker bound");
      return;
    }
    const proposal = buildProposal({
      job: posted,
      price: posted.budgetMax,
      prevHash: jobEventId,
      note: input.proposalNote,
    });
    await publishBody(negotiationKind, posted.expiresAt, negotiationRecord(proposal, mockExtensionsHeader));
  }

  async function publishApproval(): Promise<void> {
    if (session.phase !== "awaiting_approval" || approvalSettled || draftHash === undefined) {
      return;
    }
    const draft = session.draft;
    if (
      !allowsPrice(draft.price) ||
      draft.transcriptHash !== unverifiedTranscript(draft.price.amount) ||
      (latest !== undefined && !sameMoney(latest, draft.price))
    ) {
      remember(
        allowsPrice(draft.price) ? "bad_message" : "outside_mandate",
        "the agreement was not approved",
      );
      approvalSettled = true;
      return;
    }
    const already = input.party === "client" ? session.approvals.client : session.approvals.worker;
    if (already) {
      return;
    }
    approvalSettled = true;
    const approval = buildApproval({
      party: input.party,
      decision: input.human,
      agreementHash: draftHash,
      comment: input.humanComment,
      decidedAt: input.clock.now(),
      expiresAt: input.job.expiresAt,
    });
    await publishBody(negotiationKind, input.job.expiresAt, negotiationRecord(approval, mockExtensionsHeader));
  }

  return {
    party: input.party,
    session() {
      return session;
    },
    refusals() {
      return refusals.slice();
    },
    step,
  };
}

async function publishEvent(input: {
  readonly board: JobBoard;
  readonly clock: Clock;
  readonly issuer: string;
  readonly jobId: string;
  readonly kind: string;
  readonly expiresAt: string;
  readonly body: JsonObject;
}): Promise<
  { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: string; readonly detail: string }
> {
  let id = nextId(await loadEvents(input.board, input.jobId));
  for (let attempt = 0; attempt < maxIdAttempts; attempt += 1) {
    const result = await input.board.publish({
      id,
      issuer: input.issuer,
      kind: input.kind,
      tags: [[jobTag, input.jobId]],
      createdAt: input.clock.now(),
      expiresAt: input.expiresAt,
      body: input.body,
      sig: unverifiedSig,
    });
    if (result.ok) {
      return { ok: true, id: result.event.id };
    }
    if (result.reason !== "id_conflict") {
      return result;
    }
    id = nextId(await loadEvents(input.board, input.jobId));
  }
  return {
    ok: false,
    reason: "id_conflict",
    detail: "could not allocate an event id",
  };
}

async function loadEvents(board: JobBoard, jobId: string): Promise<StoredEvent[]> {
  const result = await board.query({ tags: [{ name: jobTag, values: [jobId] }] });
  if (!result.ok) {
    throw new Error(result.detail);
  }
  return result.events.slice().sort(byId);
}

function nextId(events: readonly StoredEvent[]): string {
  let max = 0;
  for (const event of events) {
    if (!event.id.startsWith("m-")) {
      continue;
    }
    const suffix = event.id.slice(2);
    if (!/^\d+$/.test(suffix)) {
      continue;
    }
    const value = Number(suffix);
    if (Number.isSafeInteger(value) && value > max) {
      max = value;
    }
  }
  return `m-${String(max + 1).padStart(4, "0")}`;
}

function byId(left: StoredEvent, right: StoredEvent): number {
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

function toEvent(message: NegotiationMessage): Parameters<typeof apply>[1] {
  switch (message.type) {
    case "Proposal":
      return { type: "proposal", message };
    case "CounterProposal":
      return { type: "counter", message };
    case "AgreementDraft":
      return { type: "agreement_draft", message };
    case "ApprovalDecision":
      return { type: "approval", message };
  }
}

function isTerminal(session: NegotiationSession): boolean {
  return session.phase === "agreed" || session.phase === "no_deal";
}

function snapshot(side: MockSide): SideSnapshot {
  const session = side.session();
  return {
    phase: session.phase,
    reason: session.reason,
    refusals: side.refusals(),
  };
}
