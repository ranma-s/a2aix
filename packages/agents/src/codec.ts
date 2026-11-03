import type {
  AgreementDraftMessage,
  ApprovalDecisionMessage,
  CounterDecision,
  CounterProposalMessage,
  HumanDecision,
  LocalTerms,
  Money,
  Party,
  ProposalMessage,
  UnverifiedSignature,
} from "@ix/a2a-ext-negotiation";
import type { JsonObject, JsonValue } from "@ix/distribution";
import { extensionUris, negotiateExtensions } from "@ix/protocol-core";
import {
  credentialPlaceholder,
  signatureMaterial,
  specCurrency,
  unverifiedTranscript,
} from "./kinds.js";
import { redactFreeText } from "./redact.js";
import { isRfc3339 } from "./time.js";
import type { MockJob } from "./types.js";

export type NegotiationMessage =
  | ProposalMessage
  | CounterProposalMessage
  | AgreementDraftMessage
  | ApprovalDecisionMessage;

export type NegotiationRead =
  | { readonly ok: true; readonly message: NegotiationMessage }
  | {
      readonly ok: false;
      readonly reason: "bad_message" | "extensions_inactive" | "not_negotiation";
    };

export function buildProposal(input: {
  readonly job: MockJob;
  readonly price: Money;
  readonly prevHash: string;
  readonly note: string;
}): ProposalMessage {
  return {
    type: "Proposal",
    jobId: input.job.jobId,
    scope: input.job.scope,
    price: input.price,
    deadline: input.job.deadline,
    availability: { hoursPerWeek: input.job.hoursPerWeek },
    credentials: [credentialPlaceholder],
    note: input.note,
    expiresAt: input.job.expiresAt,
    prevHash: input.prevHash,
    signature: placeholderSignature(),
  };
}

export function buildCounter(input: {
  readonly party: Party;
  readonly decision: CounterDecision;
  readonly inReplyTo: string;
  readonly prevHash: string;
  readonly expiresAt: string;
  readonly note: string;
}): CounterProposalMessage {
  return {
    type: "CounterProposal",
    party: input.party,
    inReplyTo: input.inReplyTo,
    decision: input.decision,
    changes: [],
    note: input.note,
    expiresAt: input.expiresAt,
    prevHash: input.prevHash,
    signature: placeholderSignature(),
  };
}

export function buildDraft(input: {
  readonly job: MockJob;
  readonly price: Money;
  readonly expiresAt: string;
}): AgreementDraftMessage {
  return {
    type: "AgreementDraft",
    author: "client",
    agreementId: `agr-${input.job.jobId}`,
    transcriptHash: unverifiedTranscript(input.price.amount),
    scope: redactFreeText(input.job.scope),
    deliverables: scrubList(input.job.deliverables),
    price: input.price,
    deadline: input.job.deadline,
    acceptanceCriteria: redactFreeText(input.job.acceptanceCriteria),
    revisionLimit: input.job.revisionLimit,
    localRules: redactFreeText(input.job.localRules),
    localTerms: {
      paymentDueDate: input.job.localTerms.paymentDueDate,
      ipOwnership: redactFreeText(input.job.localTerms.ipOwnership),
    },
    expiresAt: input.expiresAt,
    signature: placeholderSignature(),
  };
}

export function buildApproval(input: {
  readonly party: Party;
  readonly decision: HumanDecision;
  readonly agreementHash: string;
  readonly comment: string;
  readonly decidedAt: string;
  readonly expiresAt: string;
}): ApprovalDecisionMessage {
  return {
    type: "ApprovalDecision",
    agreementHash: input.agreementHash,
    party: input.party,
    decision: input.decision,
    comment: input.comment,
    decidedAt: input.decidedAt,
    expiresAt: input.expiresAt,
    signature: placeholderSignature(),
  };
}

export function jobRecord(job: MockJob): JsonObject {
  return {
    record: "job",
    job: writeJob(job),
  };
}

export function negotiationRecord(message: NegotiationMessage, extensionsHeader: string): JsonObject {
  return {
    record: "negotiation",
    extensionsHeader,
    message: writeMessage(message),
  };
}

export function readJobRecord(body: JsonValue): MockJob | undefined {
  if (!isJsonObject(body) || body["record"] !== "job") {
    return undefined;
  }
  return readJob(body["job"]);
}

export function readNegotiationRecord(body: JsonValue): NegotiationRead {
  if (!isJsonObject(body) || body["record"] !== "negotiation") {
    return { ok: false, reason: "not_negotiation" };
  }
  const header = body["extensionsHeader"];
  if (typeof header !== "string" || !negotiationActive(header)) {
    return { ok: false, reason: "extensions_inactive" };
  }
  const message = readMessage(body["message"]);
  if (message === undefined) {
    return { ok: false, reason: "bad_message" };
  }
  return { ok: true, message };
}

function negotiationActive(header: string): boolean {
  const negotiated = negotiateExtensions({ requestedHeader: header });
  for (const uri of negotiated.activated) {
    if (uri === extensionUris.negotiation) {
      return true;
    }
  }
  return false;
}

function scrubList(values: readonly string[]): readonly string[] {
  const copy: string[] = [];
  for (const value of values) {
    const scrubbed = redactFreeText(value);
    if (scrubbed.trim().length > 0) {
      copy.push(scrubbed);
    }
  }
  return copy;
}

function placeholderSignature(): UnverifiedSignature {
  return { verification: "deferred", material: signatureMaterial };
}

function writeJob(job: MockJob): JsonObject {
  return {
    jobId: job.jobId,
    agentCard: job.agentCard,
    title: job.title,
    description: job.description,
    scope: job.scope,
    deliverables: writeStrings(job.deliverables),
    budgetMin: writeMoney(job.budgetMin),
    budgetMax: writeMoney(job.budgetMax),
    requiredSkills: writeStrings(job.requiredSkills),
    signature: writeSignature(job.signature),
    maxRoundTrips: job.maxRoundTrips,
    expiresAt: job.expiresAt,
    hoursPerWeek: job.hoursPerWeek,
    deadline: job.deadline,
    acceptanceCriteria: job.acceptanceCriteria,
    revisionLimit: job.revisionLimit,
    localRules: job.localRules,
    localTerms: writeLocalTerms(job.localTerms),
  };
}

function writeMessage(message: NegotiationMessage): JsonObject {
  switch (message.type) {
    case "Proposal":
      return {
        type: "Proposal",
        jobId: message.jobId,
        scope: message.scope,
        price: writeMoney(message.price),
        deadline: message.deadline,
        availability: { hoursPerWeek: message.availability.hoursPerWeek },
        credentials: writeStrings(message.credentials),
        note: message.note,
        expiresAt: message.expiresAt,
        prevHash: message.prevHash,
        signature: writeSignature(message.signature),
      };
    case "CounterProposal":
      return {
        type: "CounterProposal",
        party: message.party,
        inReplyTo: message.inReplyTo,
        decision: message.decision,
        changes: writeStrings(message.changes),
        note: message.note,
        expiresAt: message.expiresAt,
        prevHash: message.prevHash,
        signature: writeSignature(message.signature),
      };
    case "AgreementDraft":
      return {
        type: "AgreementDraft",
        author: message.author,
        agreementId: message.agreementId,
        transcriptHash: message.transcriptHash,
        scope: message.scope,
        deliverables: writeStrings(message.deliverables),
        price: writeMoney(message.price),
        deadline: message.deadline,
        acceptanceCriteria: message.acceptanceCriteria,
        revisionLimit: message.revisionLimit,
        localRules: message.localRules,
        localTerms: writeLocalTerms(message.localTerms),
        expiresAt: message.expiresAt,
        signature: writeSignature(message.signature),
      };
    case "ApprovalDecision":
      return {
        type: "ApprovalDecision",
        agreementHash: message.agreementHash,
        party: message.party,
        decision: message.decision,
        comment: message.comment,
        decidedAt: message.decidedAt,
        expiresAt: message.expiresAt,
        signature: writeSignature(message.signature),
      };
  }
}

function writeMoney(price: Money): JsonObject {
  return {
    amount: price.amount,
    currency: price.currency,
    taxIncluded: price.taxIncluded,
  };
}

function writeLocalTerms(terms: LocalTerms): JsonObject {
  return {
    paymentDueDate: terms.paymentDueDate,
    ipOwnership: terms.ipOwnership,
  };
}

function writeSignature(signature: UnverifiedSignature): JsonObject {
  return {
    verification: signature.verification,
    material: signature.material,
  };
}

function writeStrings(values: readonly string[]): JsonValue[] {
  const copy: JsonValue[] = [];
  for (const value of values) {
    copy.push(value);
  }
  return copy;
}

function readJob(value: JsonValue | undefined): MockJob | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const jobId = readRequiredText(value["jobId"]);
  const agentCard = readCard(value["agentCard"]);
  const title = readRequiredText(value["title"]);
  const description = readRequiredText(value["description"]);
  const scope = readRequiredText(value["scope"]);
  const deliverables = readStringList(value["deliverables"], 1);
  const budgetMin = readMoney(value["budgetMin"]);
  const budgetMax = readMoney(value["budgetMax"]);
  const requiredSkills = readStringList(value["requiredSkills"], 1);
  const maxRoundTrips = readCount(value["maxRoundTrips"]);
  const expiresAt = readInstantText(value["expiresAt"]);
  const hoursPerWeek = readCount(value["hoursPerWeek"]);
  const deadline = readInstantText(value["deadline"]);
  const acceptanceCriteria = readRequiredText(value["acceptanceCriteria"]);
  const revisionLimit = readCount(value["revisionLimit"]);
  const localRules = readRequiredText(value["localRules"]);
  const localTerms = readLocalTerms(value["localTerms"]);
  const signature = readSignature(value["signature"]);
  if (
    jobId === undefined ||
    agentCard === undefined ||
    title === undefined ||
    description === undefined ||
    scope === undefined ||
    deliverables === undefined ||
    budgetMin === undefined ||
    budgetMax === undefined ||
    budgetMin.amount > budgetMax.amount ||
    requiredSkills === undefined ||
    maxRoundTrips === undefined ||
    maxRoundTrips < 1 ||
    expiresAt === undefined ||
    hoursPerWeek === undefined ||
    deadline === undefined ||
    acceptanceCriteria === undefined ||
    revisionLimit === undefined ||
    localRules === undefined ||
    localTerms === undefined ||
    signature === undefined
  ) {
    return undefined;
  }
  return {
    jobId,
    agentCard,
    title,
    description,
    scope,
    deliverables,
    budgetMin,
    budgetMax,
    requiredSkills,
    maxRoundTrips,
    expiresAt,
    hoursPerWeek,
    deadline,
    acceptanceCriteria,
    revisionLimit,
    localRules,
    localTerms,
    signature,
  };
}

function readMessage(value: JsonValue | undefined): NegotiationMessage | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const type = value["type"];
  if (type === "Proposal") {
    return readProposal(value);
  }
  if (type === "CounterProposal") {
    return readCounter(value);
  }
  if (type === "AgreementDraft") {
    return readDraft(value);
  }
  if (type === "ApprovalDecision") {
    return readApproval(value);
  }
  return undefined;
}

function readProposal(value: JsonObject): ProposalMessage | undefined {
  const jobId = readRequiredText(value["jobId"]);
  const scope = readRequiredText(value["scope"]);
  const price = readMoney(value["price"]);
  const deadline = readInstantText(value["deadline"]);
  const availability = readHours(value["availability"]);
  const credentials = readStringList(value["credentials"], 1);
  const note = readText(value["note"]);
  const expiresAt = readInstantText(value["expiresAt"]);
  const prevHash = readRequiredText(value["prevHash"]);
  const signature = readSignature(value["signature"]);
  if (
    jobId === undefined ||
    scope === undefined ||
    price === undefined ||
    deadline === undefined ||
    availability === undefined ||
    credentials === undefined ||
    note === undefined ||
    expiresAt === undefined ||
    prevHash === undefined ||
    signature === undefined
  ) {
    return undefined;
  }
  return {
    type: "Proposal",
    jobId,
    scope,
    price,
    deadline,
    availability: { hoursPerWeek: availability },
    credentials,
    note,
    expiresAt,
    prevHash,
    signature,
  };
}

function readCounter(value: JsonObject): CounterProposalMessage | undefined {
  const party = readParty(value["party"]);
  const inReplyTo = readRequiredText(value["inReplyTo"]);
  const decision = readCounterDecision(value["decision"]);
  const changes = readStringList(value["changes"], 0);
  const note = readText(value["note"]);
  const expiresAt = readInstantText(value["expiresAt"]);
  const prevHash = readRequiredText(value["prevHash"]);
  const signature = readSignature(value["signature"]);
  if (
    party === undefined ||
    inReplyTo === undefined ||
    decision === undefined ||
    changes === undefined ||
    note === undefined ||
    expiresAt === undefined ||
    prevHash === undefined ||
    signature === undefined
  ) {
    return undefined;
  }
  return {
    type: "CounterProposal",
    party,
    inReplyTo,
    decision,
    changes,
    note,
    expiresAt,
    prevHash,
    signature,
  };
}

function readDraft(value: JsonObject): AgreementDraftMessage | undefined {
  if (value["author"] !== "client") {
    return undefined;
  }
  const agreementId = readRequiredText(value["agreementId"]);
  const price = readMoney(value["price"]);
  const transcriptHash = readRequiredText(value["transcriptHash"]);
  const scope = readRequiredText(value["scope"]);
  const deliverables = readStringList(value["deliverables"], 1);
  const deadline = readInstantText(value["deadline"]);
  const acceptanceCriteria = readRequiredText(value["acceptanceCriteria"]);
  const revisionLimit = readCount(value["revisionLimit"]);
  const localRules = readRequiredText(value["localRules"]);
  const localTerms = readLocalTerms(value["localTerms"]);
  const expiresAt = readInstantText(value["expiresAt"]);
  const signature = readSignature(value["signature"]);
  if (
    agreementId === undefined ||
    transcriptHash === undefined ||
    scope === undefined ||
    deliverables === undefined ||
    price === undefined ||
    deadline === undefined ||
    acceptanceCriteria === undefined ||
    revisionLimit === undefined ||
    localRules === undefined ||
    localTerms === undefined ||
    expiresAt === undefined ||
    signature === undefined ||
    transcriptHash !== unverifiedTranscript(price.amount)
  ) {
    return undefined;
  }
  return {
    type: "AgreementDraft",
    author: "client",
    agreementId,
    transcriptHash,
    scope,
    deliverables,
    price,
    deadline,
    acceptanceCriteria,
    revisionLimit,
    localRules,
    localTerms,
    expiresAt,
    signature,
  };
}

function readApproval(value: JsonObject): ApprovalDecisionMessage | undefined {
  const agreementHash = readLinkage(value["agreementHash"]);
  const party = readParty(value["party"]);
  const decision = readHumanDecision(value["decision"]);
  const comment = readText(value["comment"]);
  const decidedAt = readInstantText(value["decidedAt"]);
  const expiresAt = readInstantText(value["expiresAt"]);
  const signature = readSignature(value["signature"]);
  if (
    agreementHash === undefined ||
    party === undefined ||
    decision === undefined ||
    comment === undefined ||
    decidedAt === undefined ||
    expiresAt === undefined ||
    signature === undefined
  ) {
    return undefined;
  }
  return {
    type: "ApprovalDecision",
    agreementHash,
    party,
    decision,
    comment,
    decidedAt,
    expiresAt,
    signature,
  };
}

function readMoney(value: JsonValue | undefined): Money | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const amount = readCount(value["amount"]);
  const currency = readRequiredText(value["currency"]);
  const taxIncluded = value["taxIncluded"];
  if (
    amount === undefined ||
    currency !== specCurrency ||
    typeof taxIncluded !== "boolean"
  ) {
    return undefined;
  }
  return { amount, currency, taxIncluded };
}

function readLocalTerms(value: JsonValue | undefined): LocalTerms | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const paymentDueDate = readInstantText(value["paymentDueDate"]);
  const ipOwnership = readRequiredText(value["ipOwnership"]);
  if (paymentDueDate === undefined || ipOwnership === undefined) {
    return undefined;
  }
  return { paymentDueDate, ipOwnership };
}

function readSignature(value: JsonValue | undefined): UnverifiedSignature | undefined {
  if (!isJsonObject(value) || value["verification"] !== "deferred") {
    return undefined;
  }
  const material = readRequiredText(value["material"]);
  if (material === undefined) {
    return undefined;
  }
  return { verification: "deferred", material };
}

function readHours(value: JsonValue | undefined): number | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  return readCount(value["hoursPerWeek"]);
}

function readParty(value: JsonValue | undefined): Party | undefined {
  if (value === "client" || value === "worker") {
    return value;
  }
  return undefined;
}

function readCounterDecision(value: JsonValue | undefined): CounterDecision | undefined {
  if (value === "counter" || value === "accept" || value === "decline") {
    return value;
  }
  return undefined;
}

function readHumanDecision(value: JsonValue | undefined): HumanDecision | undefined {
  if (value === "approve" || value === "reject" || value === "revise") {
    return value;
  }
  return undefined;
}

function readStringList(value: JsonValue | undefined, minimum: number): readonly string[] | undefined {
  if (!isJsonArray(value) || value.length < minimum) {
    return undefined;
  }
  const copy: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return undefined;
    }
    copy.push(item);
  }
  return copy;
}

function readRequiredText(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function readText(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

function readInstantText(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string" || !isRfc3339(value)) {
    return undefined;
  }
  return value;
}

function readCard(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string" || !value.startsWith("https://") || value.includes(" ")) {
    return undefined;
  }
  if (value.length <= "https://".length) {
    return undefined;
  }
  return value;
}

function readLinkage(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string" || !/^transcript-unverified-\d+$/.test(value)) {
    return undefined;
  }
  return value;
}

function readCount(value: JsonValue | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}
