import { apply, openNegotiation } from "../src/index.js";
import type {
  AgreementDraftMessage,
  AgreedSession,
  ApprovalDecisionMessage,
  AwaitingApprovalSession,
  Clock,
  CounterDecision,
  CounterProposalMessage,
  EventType,
  HumanDecision,
  IdleSession,
  Money,
  NegotiationEvent,
  NegotiationSession,
  NegotiatingSession,
  NoDealSession,
  Party,
  ProposalMessage,
  TransitionId,
  TransitionResult,
} from "../src/index.js";

export const jobId = "job-1024";
export const transcriptHash = "draft-hash-placeholder";

export const times = {
  stale: "2026-10-01T00:00:00.000Z",
  fresh: "2026-11-01T00:00:00.000Z",
  mid: "2026-11-10T00:00:00.000Z",
  offer: "2026-11-20T00:00:00.000Z",
  request: "2026-12-01T00:00:00.000Z",
  offset: "2026-11-05T09:00:00+09:00",
  offsetUtc: "2026-11-05T00:00:00.000Z",
  beforeOffset: "2026-11-04T23:59:59.000Z",
} as const;

const price: Money = { amount: 180000, currency: "JPY", taxIncluded: false };

export function clockAt(now: string): Clock {
  return {
    now(): string {
      return now;
    },
  };
}

export function freshClock(): Clock {
  return clockAt(times.fresh);
}

export function request(maxRoundTrips = 3, expiresAt: string = times.request): IdleSession {
  return openNegotiation({
    type: "request",
    jobId,
    maxRoundTrips,
    expiresAt,
  });
}

export function proposalMessage(fields?: {
  readonly jobId?: string;
  readonly expiresAt?: string;
  readonly note?: string;
  readonly prevHash?: string;
  readonly material?: string;
}): ProposalMessage {
  return {
    type: "Proposal",
    jobId: fields?.jobId ?? jobId,
    scope: "新サービスLPの構成案とコピー（3案）",
    price,
    deadline: "2026-12-10",
    availability: { hoursPerWeek: 10 },
    credentials: ["credential-placeholder"],
    note: fields?.note ?? "",
    expiresAt: fields?.expiresAt ?? times.offer,
    prevHash: fields?.prevHash ?? "job-posting-id-placeholder",
    signature: {
      verification: "deferred",
      material: fields?.material ?? "signature-placeholder",
    },
  };
}

export function counterMessage(
  party: Party,
  decision: CounterDecision,
  fields?: {
    readonly expiresAt?: string;
    readonly note?: string;
    readonly prevHash?: string;
    readonly material?: string;
  },
): CounterProposalMessage {
  return {
    type: "CounterProposal",
    party,
    inReplyTo: "msg-prev",
    decision,
    changes: decision === "counter" ? ["price"] : [],
    note: fields?.note ?? "",
    expiresAt: fields?.expiresAt ?? times.offer,
    prevHash: fields?.prevHash ?? "prev-hash-placeholder",
    signature: {
      verification: "deferred",
      material: fields?.material ?? "signature-placeholder",
    },
  };
}

export function draftMessage(expiresAt: string = times.offer): AgreementDraftMessage {
  return {
    type: "AgreementDraft",
    author: "client",
    agreementId: "agr-5521",
    transcriptHash,
    scope: "新サービスLPの構成案とコピー（3案）",
    deliverables: ["構成案（PDF）"],
    price: { amount: 170000, currency: "JPY", taxIncluded: false },
    deadline: "2026-12-10",
    acceptanceCriteria: "納品から7日以内に検収",
    revisionLimit: 2,
    localRules: "jp-freelance/1.0",
    localTerms: {
      paymentDueDate: "2027-01-31",
      ipOwnership: "検収と支払い後に発注者へ移転",
    },
    expiresAt,
    signature: { verification: "deferred", material: "signature-placeholder" },
  };
}

export function approvalMessage(
  party: Party,
  decision: HumanDecision,
  agreementHash: string,
  fields?: {
    readonly expiresAt?: string;
    readonly decidedAt?: string;
    readonly comment?: string;
    readonly material?: string;
  },
): ApprovalDecisionMessage {
  return {
    type: "ApprovalDecision",
    agreementHash,
    party,
    decision,
    comment: fields?.comment ?? "",
    decidedAt: fields?.decidedAt ?? times.fresh,
    expiresAt: fields?.expiresAt ?? times.offer,
    signature: {
      verification: "deferred",
      material: fields?.material ?? "signature-placeholder",
    },
  };
}

export function mustIdle(result: TransitionResult): IdleSession {
  if (!result.ok) {
    throw new Error(`expected idle, forbidden ${result.event}`);
  }
  if (result.session.phase !== "idle") {
    throw new Error(`expected idle, found ${result.session.phase} via ${result.id}`);
  }
  return result.session;
}

export function mustNegotiating(result: TransitionResult): NegotiatingSession {
  if (!result.ok) {
    throw new Error(`expected negotiating, forbidden ${result.event}`);
  }
  if (result.session.phase !== "negotiating") {
    throw new Error(`expected negotiating, found ${result.session.phase} via ${result.id}`);
  }
  return result.session;
}

export function mustAwaiting(result: TransitionResult): AwaitingApprovalSession {
  if (!result.ok) {
    throw new Error(`expected awaiting_approval, forbidden ${result.event}`);
  }
  if (result.session.phase !== "awaiting_approval") {
    throw new Error(`expected awaiting_approval, found ${result.session.phase} via ${result.id}`);
  }
  return result.session;
}

export function mustAgreed(result: TransitionResult): AgreedSession {
  if (!result.ok) {
    throw new Error(`expected agreed, forbidden ${result.event}`);
  }
  if (result.session.phase !== "agreed") {
    throw new Error(`expected agreed, found ${result.session.phase} via ${result.id}`);
  }
  return result.session;
}

export function mustNoDeal(result: TransitionResult): NoDealSession {
  if (!result.ok) {
    throw new Error(`expected no_deal, forbidden ${result.event}`);
  }
  if (result.session.phase !== "no_deal") {
    throw new Error(`expected no_deal, found ${result.session.phase} via ${result.id}`);
  }
  return result.session;
}

function atFresh(session: NegotiationSession, event: NegotiationEvent): TransitionResult {
  return apply(session, event, freshClock());
}

export function awaitClient(): NegotiatingSession {
  return mustNegotiating(atFresh(request(), { type: "proposal", message: proposalMessage() }));
}

export function awaitWorker(): NegotiatingSession {
  return mustNegotiating(
    atFresh(awaitClient(), { type: "counter", message: counterMessage("client", "counter") }),
  );
}

export function draftPending(): NegotiatingSession {
  const next = mustNegotiating(
    atFresh(awaitClient(), { type: "counter", message: counterMessage("client", "accept") }),
  );
  if (!next.draftPending || next.awaitingParty !== "client") {
    throw new Error("expected the client to owe an agreement draft");
  }
  return next;
}

export function awaitingOpen(): AwaitingApprovalSession {
  return mustAwaiting(
    atFresh(draftPending(), { type: "agreement_draft", message: draftMessage() }),
  );
}

export function awaitingClientYes(): AwaitingApprovalSession {
  const open = awaitingOpen();
  const next = mustAwaiting(
    atFresh(open, {
      type: "approval",
      message: approvalMessage("client", "approve", open.draft.transcriptHash),
    }),
  );
  if (!next.approvals.client || next.approvals.worker) {
    throw new Error("expected only the client human to have approved");
  }
  return next;
}

export function lastWorkerTurn(): NegotiatingSession {
  const steps: readonly CounterProposalMessage[] = [
    counterMessage("client", "counter"),
    counterMessage("worker", "counter"),
    counterMessage("client", "counter"),
    counterMessage("worker", "counter"),
    counterMessage("client", "counter"),
  ];
  let session: NegotiationSession = awaitClient();
  for (const message of steps) {
    session = mustNegotiating(atFresh(session, { type: "counter", message }));
  }
  if (session.round !== 3 || session.awaitingParty !== "worker" || session.roundOpen) {
    throw new Error("expected round 3, the worker to speak, and no open human round");
  }
  return session;
}

export function awaitingCapped(): AwaitingApprovalSession {
  const pending = mustNegotiating(
    atFresh(lastWorkerTurn(), { type: "counter", message: counterMessage("worker", "accept") }),
  );
  const waiting = mustAwaiting(
    atFresh(pending, { type: "agreement_draft", message: draftMessage() }),
  );
  if (waiting.round !== 3) {
    throw new Error("expected the capped negotiation to be on round 3");
  }
  return waiting;
}

export function agreedSession(): AgreedSession {
  const one = awaitingClientYes();
  return mustAgreed(
    atFresh(one, {
      type: "approval",
      message: approvalMessage("worker", "approve", one.draft.transcriptHash),
    }),
  );
}

export function closed(): NoDealSession {
  return mustNoDeal(
    atFresh(awaitClient(), { type: "counter", message: counterMessage("client", "decline") }),
  );
}

export type Fixture = {
  readonly session: NegotiationSession;
  readonly event: NegotiationEvent;
  readonly clock: string;
};

function liveCounter(): NegotiationEvent {
  return { type: "counter", message: counterMessage("client", "counter") };
}

function deadlineEvent(event: EventType): NegotiationEvent {
  switch (event) {
    case "tick":
      return { type: "tick" };
    case "proposal":
      return { type: "proposal", message: proposalMessage() };
    case "counter":
      return liveCounter();
    case "agreement_draft":
      return { type: "agreement_draft", message: draftMessage() };
    case "approval":
      return {
        type: "approval",
        message: approvalMessage("client", "approve", transcriptHash),
      };
  }
}

export function fixtureFor(id: TransitionId): Fixture {
  switch (id) {
    case "idle_tick_deadline":
      return { session: request(), event: deadlineEvent("tick"), clock: times.request };
    case "idle_proposal_deadline":
      return { session: request(), event: deadlineEvent("proposal"), clock: times.request };
    case "idle_counter_deadline":
      return { session: request(), event: deadlineEvent("counter"), clock: times.request };
    case "idle_draft_deadline":
      return { session: request(), event: deadlineEvent("agreement_draft"), clock: times.request };
    case "idle_approval_deadline":
      return { session: request(), event: deadlineEvent("approval"), clock: times.request };
    case "negotiating_tick_deadline":
      return { session: awaitClient(), event: deadlineEvent("tick"), clock: times.offer };
    case "negotiating_proposal_deadline":
      return { session: awaitClient(), event: deadlineEvent("proposal"), clock: times.offer };
    case "negotiating_counter_deadline":
      return { session: awaitClient(), event: deadlineEvent("counter"), clock: times.offer };
    case "negotiating_draft_deadline":
      return { session: awaitClient(), event: deadlineEvent("agreement_draft"), clock: times.offer };
    case "negotiating_approval_deadline":
      return { session: awaitClient(), event: deadlineEvent("approval"), clock: times.offer };
    case "awaiting_approval_tick_deadline":
      return { session: awaitingOpen(), event: deadlineEvent("tick"), clock: times.offer };
    case "awaiting_approval_proposal_deadline":
      return { session: awaitingOpen(), event: deadlineEvent("proposal"), clock: times.offer };
    case "awaiting_approval_counter_deadline":
      return { session: awaitingOpen(), event: deadlineEvent("counter"), clock: times.offer };
    case "awaiting_approval_draft_deadline":
      return { session: awaitingOpen(), event: deadlineEvent("agreement_draft"), clock: times.offer };
    case "awaiting_approval_approval_deadline":
      return { session: awaitingOpen(), event: deadlineEvent("approval"), clock: times.offer };
    case "idle_tick_open":
      return { session: request(), event: { type: "tick" }, clock: times.fresh };
    case "negotiating_tick_open":
      return { session: awaitClient(), event: { type: "tick" }, clock: times.fresh };
    case "awaiting_approval_tick_open":
      return { session: awaitingOpen(), event: { type: "tick" }, clock: times.fresh };
    case "idle_proposal_stale":
      return {
        session: request(),
        event: { type: "proposal", message: proposalMessage({ expiresAt: times.stale }) },
        clock: times.mid,
      };
    case "idle_proposal_accepted":
      return {
        session: request(),
        event: { type: "proposal", message: proposalMessage() },
        clock: times.fresh,
      };
    case "negotiating_counter_stale":
      return {
        session: awaitClient(),
        event: {
          type: "counter",
          message: counterMessage("client", "counter", { expiresAt: times.stale }),
        },
        clock: times.mid,
      };
    case "negotiating_counter_decline_client":
      return {
        session: awaitClient(),
        event: { type: "counter", message: counterMessage("client", "decline") },
        clock: times.fresh,
      };
    case "negotiating_counter_decline_worker":
      return {
        session: awaitWorker(),
        event: { type: "counter", message: counterMessage("worker", "decline") },
        clock: times.fresh,
      };
    case "negotiating_counter_accept":
      return {
        session: awaitClient(),
        event: { type: "counter", message: counterMessage("client", "accept") },
        clock: times.fresh,
      };
    case "negotiating_counter_continue":
      return {
        session: awaitClient(),
        event: { type: "counter", message: counterMessage("client", "counter") },
        clock: times.fresh,
      };
    case "negotiating_counter_round_limit":
      return {
        session: lastWorkerTurn(),
        event: { type: "counter", message: counterMessage("worker", "counter") },
        clock: times.fresh,
      };
    case "negotiating_draft_stale":
      return {
        session: draftPending(),
        event: { type: "agreement_draft", message: draftMessage(times.stale) },
        clock: times.mid,
      };
    case "negotiating_draft_accepted":
      return {
        session: draftPending(),
        event: { type: "agreement_draft", message: draftMessage() },
        clock: times.fresh,
      };
    case "awaiting_approval_stale":
      return {
        session: awaitingOpen(),
        event: {
          type: "approval",
          message: approvalMessage("client", "approve", transcriptHash, {
            expiresAt: times.stale,
            decidedAt: times.mid,
          }),
        },
        clock: times.mid,
      };
    case "awaiting_approval_approve_first":
      return {
        session: awaitingOpen(),
        event: {
          type: "approval",
          message: approvalMessage("client", "approve", transcriptHash),
        },
        clock: times.fresh,
      };
    case "awaiting_approval_approve_second":
      return {
        session: awaitingClientYes(),
        event: {
          type: "approval",
          message: approvalMessage("worker", "approve", transcriptHash),
        },
        clock: times.fresh,
      };
    case "awaiting_approval_reopen":
      return {
        session: awaitingOpen(),
        event: {
          type: "approval",
          message: approvalMessage("worker", "revise", transcriptHash),
        },
        clock: times.fresh,
      };
    case "awaiting_approval_round_limit":
      return {
        session: awaitingCapped(),
        event: {
          type: "approval",
          message: approvalMessage("client", "reject", transcriptHash),
        },
        clock: times.fresh,
      };
  }
}

export function snapshot(session: NegotiationSession): string {
  const awaiting = session.awaitingParty ?? "-";
  const reason = session.reason ?? "-";
  return [
    session.phase,
    String(session.round),
    session.roundOpen ? "open" : "closed",
    awaiting,
    reason,
    session.approvals.client ? "client" : "",
    session.approvals.worker ? "worker" : "",
    session.expiresAt,
  ].join("|");
}
