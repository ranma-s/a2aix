import {
  assertEvent,
  assertInstant,
  isDue,
  signatureVerification,
  taskStateFor,
} from "./model.js";
import type {
  AgreementDraftMessage,
  AgreedSession,
  ApprovalDecisionMessage,
  ApprovalMarks,
  AwaitingApprovalSession,
  CounterProposalMessage,
  IdleSession,
  NegotiationEvent,
  NegotiationSession,
  NegotiatingSession,
  NoDealReason,
  NoDealSession,
  Party,
  ProposalMessage,
} from "./model.js";
import { transitionTable } from "./table.js";
import type { GuardName, TransitionId, TransitionRow } from "./table.js";

export type Clock = {
  readonly now: () => string;
};

export type AppliedTransition = {
  readonly ok: true;
  readonly id: TransitionId;
  readonly from: NegotiationSession["phase"];
  readonly to: NegotiationSession["phase"];
  readonly session: NegotiationSession;
};

export type RejectedTransition = {
  readonly ok: false;
  readonly reason: "forbidden";
  readonly from: NegotiationSession["phase"];
  readonly event: NegotiationEvent["type"];
};

export type TransitionResult = AppliedTransition | RejectedTransition;

type Context = {
  readonly session: NegotiationSession;
  readonly event: NegotiationEvent;
  readonly now: string;
};

export function apply(
  session: NegotiationSession,
  event: NegotiationEvent,
  clock: Clock,
): TransitionResult {
  const now = clock.now();
  assertInstant(now);
  assertEvent(event);
  const matches = matchingRows({ session, event, now });
  if (matches.length > 1) {
    throw new Error(`Overlapping negotiation transitions: ${rowIds(matches)}`);
  }
  const row = matches[0];
  if (row === undefined) {
    return {
      ok: false,
      reason: "forbidden",
      from: session.phase,
      event: event.type,
    };
  }
  const next = produce(row, session, event);
  if (next.phase !== row.to || next.reason !== row.reason) {
    throw new Error(
      `Transition ${row.id} produced ${next.phase}/${String(next.reason)}, table says ${row.to}/${String(row.reason)}`,
    );
  }
  const expectedTask = taskStateFor(next.phase, next.reason);
  if (next.taskState !== expectedTask) {
    throw new Error(`Transition ${row.id} produced task state ${String(next.taskState)}`);
  }
  return {
    ok: true,
    id: row.id,
    from: session.phase,
    to: next.phase,
    session: next,
  };
}

function matchingRows(context: Context): TransitionRow[] {
  const found: TransitionRow[] = [];
  for (const row of transitionTable) {
    if (row.from !== context.session.phase || row.event !== context.event.type) {
      continue;
    }
    if (matchesGuard(row.guard, context)) {
      found.push(row);
    }
  }
  return found;
}

function matchesGuard(guard: GuardName, context: Context): boolean {
  if (guard === "deadline_passed") {
    return isDue(context.session.expiresAt, context.now);
  }
  if (isDue(context.session.expiresAt, context.now)) {
    return false;
  }
  switch (guard) {
    case "tick_open":
      return context.event.type === "tick";
    case "proposal_stale":
      return proposalGuard(context, true);
    case "proposal_accepted":
      return proposalGuard(context, false);
    case "counter_stale":
      return counterStale(context);
    case "decline_client":
      return declineGuard(context, "client");
    case "decline_worker":
      return declineGuard(context, "worker");
    case "accept_terms":
      return acceptGuard(context);
    case "counter_continue":
      return counterMoveGuard(context, false);
    case "counter_round_limit":
      return counterMoveGuard(context, true);
    case "draft_stale":
      return draftGuard(context, true);
    case "draft_accepted":
      return draftGuard(context, false);
    case "approval_stale":
      return approvalGuard(context, "stale");
    case "approve_first":
      return approvalGuard(context, "first");
    case "approve_second":
      return approvalGuard(context, "second");
    case "human_reopen":
      return approvalGuard(context, "reopen");
    case "human_round_limit":
      return approvalGuard(context, "round_limit");
  }
}

function proposalGuard(context: Context, stale: boolean): boolean {
  if (context.session.phase !== "idle" || context.event.type !== "proposal") {
    return false;
  }
  if (context.event.message.jobId !== context.session.jobId) {
    return false;
  }
  return isDue(context.event.message.expiresAt, context.now) === stale;
}

function counterStale(context: Context): boolean {
  if (!isNegotiating(context.session) || context.event.type !== "counter") {
    return false;
  }
  if (context.event.message.party !== context.session.awaitingParty) {
    return false;
  }
  return isDue(context.event.message.expiresAt, context.now);
}

function declineGuard(context: Context, party: Party): boolean {
  if (!isNegotiating(context.session) || context.event.type !== "counter") {
    return false;
  }
  const message = context.event.message;
  if (message.party !== party || message.party !== context.session.awaitingParty) {
    return false;
  }
  if (message.decision !== "decline" || isDue(message.expiresAt, context.now)) {
    return false;
  }
  return true;
}

function acceptGuard(context: Context): boolean {
  if (!isNegotiating(context.session) || context.event.type !== "counter") {
    return false;
  }
  if (context.session.draftPending) {
    return false;
  }
  const message = context.event.message;
  if (message.party !== context.session.awaitingParty || message.decision !== "accept") {
    return false;
  }
  return !isDue(message.expiresAt, context.now);
}

function counterMoveGuard(context: Context, limit: boolean): boolean {
  if (!isNegotiating(context.session) || context.event.type !== "counter") {
    return false;
  }
  if (context.session.draftPending) {
    return false;
  }
  const message = context.event.message;
  if (message.party !== context.session.awaitingParty || message.decision !== "counter") {
    return false;
  }
  if (isDue(message.expiresAt, context.now)) {
    return false;
  }
  return counterWouldExceed(context.session, message.party) === limit;
}

function draftGuard(context: Context, stale: boolean): boolean {
  if (!isNegotiating(context.session) || !context.session.draftPending) {
    return false;
  }
  if (context.event.type !== "agreement_draft") {
    return false;
  }
  return isDue(context.event.message.expiresAt, context.now) === stale;
}

function approvalGuard(
  context: Context,
  kind: "stale" | "first" | "second" | "reopen" | "round_limit",
): boolean {
  if (!isAwaiting(context.session) || context.event.type !== "approval") {
    return false;
  }
  const message = context.event.message;
  if (message.agreementHash !== context.session.draft.transcriptHash) {
    return false;
  }
  const stale = isDue(message.expiresAt, context.now);
  if (kind === "stale") {
    return stale;
  }
  if (stale || Date.parse(message.decidedAt) > Date.parse(context.now)) {
    return false;
  }
  if (kind === "first" || kind === "second") {
    if (message.decision !== "approve") {
      return false;
    }
    const self = approved(context.session.approvals, message.party);
    const other = approved(context.session.approvals, opposite(message.party));
    if (self) {
      return false;
    }
    return kind === "first" ? !other : other;
  }
  if (message.decision !== "reject" && message.decision !== "revise") {
    return false;
  }
  const roundsRemain = context.session.round < context.session.maxRoundTrips;
  return kind === "reopen" ? roundsRemain : !roundsRemain;
}

function counterWouldExceed(session: NegotiatingSession, party: Party): boolean {
  if (party !== "worker" || session.roundOpen) {
    return false;
  }
  return session.round >= session.maxRoundTrips;
}

function approved(marks: ApprovalMarks, party: Party): boolean {
  if (party === "client") {
    return marks.client;
  }
  return marks.worker;
}

function opposite(party: Party): Party {
  if (party === "client") {
    return "worker";
  }
  return "client";
}

function isNegotiating(session: NegotiationSession): session is NegotiatingSession {
  return session.phase === "negotiating";
}

function isAwaiting(session: NegotiationSession): session is AwaitingApprovalSession {
  return session.phase === "awaiting_approval";
}

function produce(row: TransitionRow, session: NegotiationSession, event: NegotiationEvent): NegotiationSession {
  switch (row.id) {
    case "idle_tick_deadline":
    case "idle_proposal_deadline":
    case "idle_counter_deadline":
    case "idle_draft_deadline":
    case "idle_approval_deadline":
    case "negotiating_tick_deadline":
    case "negotiating_proposal_deadline":
    case "negotiating_counter_deadline":
    case "negotiating_draft_deadline":
    case "negotiating_approval_deadline":
    case "awaiting_approval_tick_deadline":
    case "awaiting_approval_proposal_deadline":
    case "awaiting_approval_counter_deadline":
    case "awaiting_approval_draft_deadline":
    case "awaiting_approval_approval_deadline":
    case "idle_proposal_stale":
    case "negotiating_counter_stale":
    case "negotiating_draft_stale":
    case "awaiting_approval_stale":
      return close(session, "expired", "TASK_STATE_CANCELED");
    case "idle_tick_open":
    case "negotiating_tick_open":
    case "awaiting_approval_tick_open":
      return session;
    case "idle_proposal_accepted":
      return acceptProposal(requireIdle(session, row.id), requireProposal(event, row.id));
    case "negotiating_counter_decline_client":
      return close(requireNegotiating(session, row.id), "declined", "TASK_STATE_REJECTED");
    case "negotiating_counter_decline_worker":
      return close(requireNegotiating(session, row.id), "withdrawn", "TASK_STATE_CANCELED");
    case "negotiating_counter_accept":
      return markAccepted(requireNegotiating(session, row.id), requireCounter(event, row.id));
    case "negotiating_counter_continue":
      return continueNegotiation(requireNegotiating(session, row.id), requireCounter(event, row.id));
    case "negotiating_counter_round_limit":
      return close(requireNegotiating(session, row.id), "round_limit", "TASK_STATE_CANCELED");
    case "negotiating_draft_accepted":
      return publishDraft(requireNegotiating(session, row.id), requireDraft(event, row.id));
    case "awaiting_approval_approve_first":
      return recordFirstApproval(requireAwaiting(session, row.id), requireApproval(event, row.id));
    case "awaiting_approval_approve_second":
      return recordSecondApproval(requireAwaiting(session, row.id), requireApproval(event, row.id));
    case "awaiting_approval_reopen":
      return reopen(requireAwaiting(session, row.id), requireApproval(event, row.id));
    case "awaiting_approval_round_limit":
      return close(requireAwaiting(session, row.id), "round_limit", "TASK_STATE_CANCELED");
  }
}

function acceptProposal(session: IdleSession, message: ProposalMessage): NegotiatingSession {
  return {
    phase: "negotiating",
    taskState: "TASK_STATE_INPUT_REQUIRED",
    reason: null,
    jobId: session.jobId,
    maxRoundTrips: session.maxRoundTrips,
    expiresAt: message.expiresAt,
    round: 1,
    roundOpen: false,
    awaitingParty: "client",
    draftPending: false,
    draft: null,
    approvals: { client: false, worker: false },
    signatureVerification,
  };
}

function markAccepted(session: NegotiatingSession, message: CounterProposalMessage): NegotiatingSession {
  return {
    phase: "negotiating",
    taskState: "TASK_STATE_INPUT_REQUIRED",
    reason: null,
    jobId: session.jobId,
    maxRoundTrips: session.maxRoundTrips,
    expiresAt: message.expiresAt,
    round: session.round,
    roundOpen: false,
    awaitingParty: "client",
    draftPending: true,
    draft: null,
    approvals: { client: false, worker: false },
    signatureVerification,
  };
}

function continueNegotiation(
  session: NegotiatingSession,
  message: CounterProposalMessage,
): NegotiatingSession {
  const round =
    message.party === "worker" && !session.roundOpen ? session.round + 1 : session.round;
  return {
    phase: "negotiating",
    taskState: "TASK_STATE_INPUT_REQUIRED",
    reason: null,
    jobId: session.jobId,
    maxRoundTrips: session.maxRoundTrips,
    expiresAt: message.expiresAt,
    round,
    roundOpen: false,
    awaitingParty: opposite(message.party),
    draftPending: false,
    draft: null,
    approvals: { client: false, worker: false },
    signatureVerification,
  };
}

function publishDraft(session: NegotiatingSession, message: AgreementDraftMessage): AwaitingApprovalSession {
  return {
    phase: "awaiting_approval",
    taskState: "TASK_STATE_INPUT_REQUIRED",
    reason: null,
    jobId: session.jobId,
    maxRoundTrips: session.maxRoundTrips,
    expiresAt: message.expiresAt,
    round: session.round,
    roundOpen: false,
    awaitingParty: "humans",
    draft: message,
    approvals: { client: false, worker: false },
    signatureVerification,
  };
}

function recordFirstApproval(
  session: AwaitingApprovalSession,
  message: ApprovalDecisionMessage,
): AwaitingApprovalSession {
  return {
    phase: "awaiting_approval",
    taskState: "TASK_STATE_INPUT_REQUIRED",
    reason: null,
    jobId: session.jobId,
    maxRoundTrips: session.maxRoundTrips,
    expiresAt: session.expiresAt,
    round: session.round,
    roundOpen: false,
    awaitingParty: "humans",
    draft: session.draft,
    approvals: grant(session.approvals, message.party),
    signatureVerification,
  };
}

function recordSecondApproval(
  session: AwaitingApprovalSession,
  message: ApprovalDecisionMessage,
): AgreedSession {
  const marks = grant(session.approvals, message.party);
  if (!marks.client || !marks.worker) {
    throw new Error("agreed requires both human approvals");
  }
  return {
    phase: "agreed",
    taskState: "TASK_STATE_COMPLETED",
    reason: null,
    jobId: session.jobId,
    maxRoundTrips: session.maxRoundTrips,
    expiresAt: session.expiresAt,
    round: session.round,
    roundOpen: false,
    awaitingParty: null,
    draft: session.draft,
    approvals: { client: true, worker: true },
    signatureVerification,
  };
}

function reopen(session: AwaitingApprovalSession, message: ApprovalDecisionMessage): NegotiatingSession {
  return {
    phase: "negotiating",
    taskState: "TASK_STATE_INPUT_REQUIRED",
    reason: null,
    jobId: session.jobId,
    maxRoundTrips: session.maxRoundTrips,
    expiresAt: message.expiresAt,
    round: session.round + 1,
    roundOpen: true,
    awaitingParty: message.party,
    draftPending: false,
    draft: null,
    approvals: { client: false, worker: false },
    signatureVerification,
  };
}

function close(
  session: NegotiationSession,
  reason: NoDealReason,
  taskState: "TASK_STATE_REJECTED" | "TASK_STATE_CANCELED",
): NoDealSession {
  return {
    phase: "no_deal",
    taskState,
    reason,
    jobId: session.jobId,
    maxRoundTrips: session.maxRoundTrips,
    expiresAt: session.expiresAt,
    round: session.round,
    roundOpen: false,
    awaitingParty: null,
    draft: carriedDraft(session),
    approvals: session.approvals,
    signatureVerification,
  };
}

function carriedDraft(session: NegotiationSession): AgreementDraftMessage | null {
  switch (session.phase) {
    case "awaiting_approval":
    case "agreed":
    case "no_deal":
      return session.draft;
    case "idle":
    case "negotiating":
      return null;
  }
}

function grant(marks: ApprovalMarks, party: Party): ApprovalMarks {
  if (party === "client") {
    return { client: true, worker: marks.worker };
  }
  return { client: marks.client, worker: true };
}

function requireIdle(session: NegotiationSession, id: TransitionId): IdleSession {
  if (session.phase !== "idle") {
    throw new Error(`${id} requires idle, found ${session.phase}`);
  }
  return session;
}

function requireNegotiating(session: NegotiationSession, id: TransitionId): NegotiatingSession {
  if (session.phase !== "negotiating") {
    throw new Error(`${id} requires negotiating, found ${session.phase}`);
  }
  return session;
}

function requireAwaiting(session: NegotiationSession, id: TransitionId): AwaitingApprovalSession {
  if (session.phase !== "awaiting_approval") {
    throw new Error(`${id} requires awaiting_approval, found ${session.phase}`);
  }
  return session;
}

function requireProposal(event: NegotiationEvent, id: TransitionId): ProposalMessage {
  if (event.type !== "proposal") {
    throw new Error(`${id} requires proposal, found ${event.type}`);
  }
  return event.message;
}

function requireCounter(event: NegotiationEvent, id: TransitionId): CounterProposalMessage {
  if (event.type !== "counter") {
    throw new Error(`${id} requires counter, found ${event.type}`);
  }
  return event.message;
}

function requireDraft(event: NegotiationEvent, id: TransitionId): AgreementDraftMessage {
  if (event.type !== "agreement_draft") {
    throw new Error(`${id} requires agreement_draft, found ${event.type}`);
  }
  return event.message;
}

function requireApproval(event: NegotiationEvent, id: TransitionId): ApprovalDecisionMessage {
  if (event.type !== "approval") {
    throw new Error(`${id} requires approval, found ${event.type}`);
  }
  return event.message;
}

function rowIds(rows: readonly TransitionRow[]): string {
  const ids: string[] = [];
  for (const row of rows) {
    ids.push(row.id);
  }
  return ids.join(", ");
}
