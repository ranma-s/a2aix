import { extensionUris } from "@ix/protocol-core";

export const uri = extensionUris.negotiation;
export const status = "state_machine" as const;
export const signatureVerification = "deferred" as const;

export const phaseMetadataKey = `${uri}/phase` as const;
export const awaitingPartyMetadataKey = `${uri}/awaitingParty` as const;
export const roundMetadataKey = `${uri}/round` as const;
export const reasonMetadataKey = `${uri}/reason` as const;

export const machineStates = [
  "idle",
  "negotiating",
  "awaiting_approval",
  "agreed",
  "no_deal",
] as const;

export const negotiationPhases = [
  "negotiating",
  "awaiting_approval",
  "agreed",
  "no_deal",
] as const;

export const eventTypes = [
  "proposal",
  "counter",
  "agreement_draft",
  "approval",
  "tick",
] as const;

export const parties = ["client", "worker"] as const;

export const counterDecisions = ["counter", "accept", "decline"] as const;

export const humanDecisions = ["approve", "reject", "revise"] as const;

export const noDealReasons = [
  "declined",
  "withdrawn",
  "expired",
  "round_limit",
] as const;

export const taskStates = [
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_COMPLETED",
  "TASK_STATE_REJECTED",
  "TASK_STATE_CANCELED",
] as const;

export type MachineState = (typeof machineStates)[number];
export type NegotiationPhase = (typeof negotiationPhases)[number];
export type EventType = (typeof eventTypes)[number];
export type Party = (typeof parties)[number];
export type AwaitingParty = Party | "humans";
export type CounterDecision = (typeof counterDecisions)[number];
export type HumanDecision = (typeof humanDecisions)[number];
export type NoDealReason = (typeof noDealReasons)[number];
export type TaskState = (typeof taskStates)[number];

export type UnverifiedSignature = {
  readonly verification: typeof signatureVerification;
  readonly material: string;
};

export type Money = {
  readonly amount: number;
  readonly currency: string;
  readonly taxIncluded: boolean;
};

export type NegotiationRequest = {
  readonly type: "request";
  readonly jobId: string;
  readonly maxRoundTrips: number;
  readonly expiresAt: string;
};

export type ProposalMessage = {
  readonly type: "Proposal";
  readonly jobId: string;
  readonly scope: string;
  readonly price: Money;
  readonly deadline: string;
  readonly availability: {
    readonly hoursPerWeek: number;
  };
  readonly credentials: readonly string[];
  readonly note: string;
  readonly expiresAt: string;
  readonly prevHash: string;
  readonly signature: UnverifiedSignature;
};

export type CounterProposalMessage = {
  readonly type: "CounterProposal";
  readonly party: Party;
  readonly inReplyTo: string;
  readonly decision: CounterDecision;
  readonly changes: readonly string[];
  readonly note: string;
  readonly expiresAt: string;
  readonly prevHash: string;
  readonly signature: UnverifiedSignature;
};

export type LocalTerms = {
  readonly paymentDueDate: string;
  readonly ipOwnership: string;
};

export type AgreementDraftMessage = {
  readonly type: "AgreementDraft";
  readonly author: "client";
  readonly agreementId: string;
  readonly transcriptHash: string;
  readonly scope: string;
  readonly deliverables: readonly string[];
  readonly price: Money;
  readonly deadline: string;
  readonly acceptanceCriteria: string;
  readonly revisionLimit: number;
  readonly localRules: string;
  readonly localTerms: LocalTerms;
  readonly expiresAt: string;
  readonly signature: UnverifiedSignature;
};

export type ApprovalDecisionMessage = {
  readonly type: "ApprovalDecision";
  readonly agreementHash: string;
  readonly party: Party;
  readonly decision: HumanDecision;
  readonly comment: string;
  readonly decidedAt: string;
  readonly expiresAt: string;
  readonly signature: UnverifiedSignature;
};

export type NegotiationEvent =
  | { readonly type: "proposal"; readonly message: ProposalMessage }
  | { readonly type: "counter"; readonly message: CounterProposalMessage }
  | { readonly type: "agreement_draft"; readonly message: AgreementDraftMessage }
  | { readonly type: "approval"; readonly message: ApprovalDecisionMessage }
  | { readonly type: "tick" };

export type ApprovalMarks = {
  readonly client: boolean;
  readonly worker: boolean;
};

type SessionBase = {
  readonly jobId: string;
  readonly maxRoundTrips: number;
  readonly expiresAt: string;
  readonly round: number;
  readonly roundOpen: boolean;
  readonly signatureVerification: typeof signatureVerification;
};

export type IdleSession = SessionBase & {
  readonly phase: "idle";
  readonly taskState: null;
  readonly reason: null;
  readonly awaitingParty: null;
  readonly draft: null;
  readonly approvals: ApprovalMarks;
};

export type NegotiatingSession = SessionBase & {
  readonly phase: "negotiating";
  readonly taskState: "TASK_STATE_INPUT_REQUIRED";
  readonly reason: null;
  readonly awaitingParty: Party;
  readonly draftPending: boolean;
  readonly draft: null;
  readonly approvals: ApprovalMarks;
};

export type AwaitingApprovalSession = SessionBase & {
  readonly phase: "awaiting_approval";
  readonly taskState: "TASK_STATE_INPUT_REQUIRED";
  readonly reason: null;
  readonly awaitingParty: "humans";
  readonly draft: AgreementDraftMessage;
  readonly approvals: ApprovalMarks;
};

export type AgreedSession = SessionBase & {
  readonly phase: "agreed";
  readonly taskState: "TASK_STATE_COMPLETED";
  readonly reason: null;
  readonly awaitingParty: null;
  readonly draft: AgreementDraftMessage;
  readonly approvals: {
    readonly client: true;
    readonly worker: true;
  };
};

export type NoDealSession = SessionBase & {
  readonly phase: "no_deal";
  readonly taskState: "TASK_STATE_REJECTED" | "TASK_STATE_CANCELED";
  readonly reason: NoDealReason;
  readonly awaitingParty: null;
  readonly draft: AgreementDraftMessage | null;
  readonly approvals: ApprovalMarks;
};

export type NegotiationSession =
  | IdleSession
  | NegotiatingSession
  | AwaitingApprovalSession
  | AgreedSession
  | NoDealSession;

export type NegotiationMetadata = {
  readonly phaseKey: typeof phaseMetadataKey;
  readonly phase: MachineState;
  readonly awaitingPartyKey: typeof awaitingPartyMetadataKey;
  readonly awaitingParty: AwaitingParty | null;
  readonly roundKey: typeof roundMetadataKey;
  readonly round: number;
  readonly reasonKey: typeof reasonMetadataKey;
  readonly reason: NoDealReason | null;
  readonly taskState: TaskState | null;
  readonly signatureVerification: typeof signatureVerification;
};

export function taskStateFor(phase: MachineState, reason: NoDealReason | null): TaskState | null {
  switch (phase) {
    case "idle":
      if (reason !== null) {
        throw new Error("idle has no no_deal reason");
      }
      return null;
    case "negotiating":
    case "awaiting_approval":
      if (reason !== null) {
        throw new Error(`${phase} has no no_deal reason`);
      }
      return "TASK_STATE_INPUT_REQUIRED";
    case "agreed":
      if (reason !== null) {
        throw new Error("agreed has no no_deal reason");
      }
      return "TASK_STATE_COMPLETED";
    case "no_deal":
      if (reason === "declined") {
        return "TASK_STATE_REJECTED";
      }
      if (reason === "withdrawn" || reason === "expired" || reason === "round_limit") {
        return "TASK_STATE_CANCELED";
      }
      throw new Error("no_deal requires declined, withdrawn, expired, or round_limit");
  }
}

export function negotiationMetadata(session: NegotiationSession): NegotiationMetadata {
  return {
    phaseKey: phaseMetadataKey,
    phase: session.phase,
    awaitingPartyKey: awaitingPartyMetadataKey,
    awaitingParty: session.awaitingParty,
    roundKey: roundMetadataKey,
    round: session.round,
    reasonKey: reasonMetadataKey,
    reason: session.reason,
    taskState: session.taskState,
    signatureVerification: session.signatureVerification,
  };
}

export function openNegotiation(request: NegotiationRequest): IdleSession {
  assertNonEmpty(request.jobId, "jobId");
  if (!Number.isSafeInteger(request.maxRoundTrips) || request.maxRoundTrips < 1) {
    throw new Error(
      `maxRoundTrips must be a positive integer. Received: ${String(request.maxRoundTrips)}`,
    );
  }
  assertInstant(request.expiresAt);
  return {
    phase: "idle",
    taskState: null,
    reason: null,
    jobId: request.jobId,
    maxRoundTrips: request.maxRoundTrips,
    expiresAt: request.expiresAt,
    round: 0,
    roundOpen: false,
    awaitingParty: null,
    draft: null,
    approvals: { client: false, worker: false },
    signatureVerification,
  };
}

export function assertEvent(event: NegotiationEvent): void {
  switch (event.type) {
    case "tick":
      return;
    case "proposal":
      assertProposal(event.message);
      return;
    case "counter":
      assertCounter(event.message);
      return;
    case "agreement_draft":
      assertDraft(event.message);
      return;
    case "approval":
      assertApproval(event.message);
      return;
  }
}

function assertProposal(message: ProposalMessage): void {
  assertNonEmpty(message.jobId, "jobId");
  assertNonEmpty(message.scope, "scope");
  assertMoney(message.price);
  assertNonEmpty(message.deadline, "deadline");
  assertSafeInteger(message.availability.hoursPerWeek, "hoursPerWeek", 0);
  assertTexts(message.credentials, "credentials");
  assertInstant(message.expiresAt);
  assertNonEmpty(message.prevHash, "prevHash");
  assertSignature(message.signature);
}

function assertCounter(message: CounterProposalMessage): void {
  assertNonEmpty(message.inReplyTo, "inReplyTo");
  assertTexts(message.changes, "changes");
  assertInstant(message.expiresAt);
  assertNonEmpty(message.prevHash, "prevHash");
  assertSignature(message.signature);
}

function assertDraft(message: AgreementDraftMessage): void {
  const author: string = message.author;
  if (author !== "client") {
    throw new Error("AgreementDraft is built by the client agent.");
  }
  assertNonEmpty(message.agreementId, "agreementId");
  assertNonEmpty(message.transcriptHash, "transcriptHash");
  assertNonEmpty(message.scope, "scope");
  assertTexts(message.deliverables, "deliverables");
  if (message.deliverables.length === 0) {
    throw new Error("deliverables must include at least one item.");
  }
  assertMoney(message.price);
  assertNonEmpty(message.deadline, "deadline");
  assertNonEmpty(message.acceptanceCriteria, "acceptanceCriteria");
  assertSafeInteger(message.revisionLimit, "revisionLimit", 0);
  assertNonEmpty(message.localRules, "localRules");
  assertNonEmpty(message.localTerms.paymentDueDate, "paymentDueDate");
  assertNonEmpty(message.localTerms.ipOwnership, "ipOwnership");
  assertInstant(message.expiresAt);
  assertSignature(message.signature);
}

function assertApproval(message: ApprovalDecisionMessage): void {
  assertNonEmpty(message.agreementHash, "agreementHash");
  assertInstant(message.decidedAt);
  assertInstant(message.expiresAt);
  assertSignature(message.signature);
}

function assertMoney(price: Money): void {
  assertSafeInteger(price.amount, "amount", 0);
  assertNonEmpty(price.currency, "currency");
}

function assertSignature(signature: UnverifiedSignature): void {
  const verification: string = signature.verification;
  if (verification !== signatureVerification) {
    throw new Error("Signature verification is deferred. A verified signature is not accepted here.");
  }
  assertNonEmpty(signature.material, "signature.material");
}

function assertTexts(values: readonly string[], label: string): void {
  for (const value of values) {
    assertNonEmpty(value, label);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be present.`);
  }
}

function assertSafeInteger(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      `${label} must be an integer >= ${String(minimum)}. Received: ${String(value)}`,
    );
  }
}

const instantPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

export function assertInstant(value: string): void {
  if (!instantPattern.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`Time must be ISO 8601. Received: ${value}`);
  }
}

export function isDue(expiresAt: string, now: string): boolean {
  return Date.parse(now) >= Date.parse(expiresAt);
}
