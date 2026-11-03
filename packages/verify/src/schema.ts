import type {
  AgreementDraftMessage,
  ApprovalDecisionMessage,
  CounterDecision,
  CounterProposalMessage,
  HumanDecision,
  Money,
  Party,
  ProposalMessage,
} from "@ix/a2a-ext-negotiation";
import { parseInstant } from "@ix/distribution";
import type { JsonObject, JsonValue } from "@ix/distribution";

export type VerifyMessage =
  | ProposalMessage
  | CounterProposalMessage
  | AgreementDraftMessage
  | ApprovalDecisionMessage;

export type SchemaResult =
  | { readonly ok: true; readonly message: VerifyMessage }
  | { readonly ok: false; readonly reason: "bad_message" };

export function checkMessageSchema(value: JsonValue): SchemaResult {
  const message = readMessage(value);
  if (message === undefined) {
    return { ok: false, reason: "bad_message" };
  }
  return { ok: true, message };
}

export function parseMessages(
  values: readonly JsonValue[],
): { readonly ok: true; readonly messages: readonly VerifyMessage[] } | { readonly ok: false; readonly index: number } {
  const messages: VerifyMessage[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) {
      return { ok: false, index };
    }
    const parsed = checkMessageSchema(value);
    if (!parsed.ok) {
      return { ok: false, index };
    }
    messages.push(parsed.message);
  }
  return { ok: true, messages };
}

function readMessage(value: JsonValue): VerifyMessage | undefined {
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
  const hours = readHours(value["availability"]);
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
    hours === undefined ||
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
    availability: { hoursPerWeek: hours },
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
  const transcriptHash = readRequiredText(value["transcriptHash"]);
  const scope = readRequiredText(value["scope"]);
  const deliverables = readStringList(value["deliverables"], 1);
  const price = readMoney(value["price"]);
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
    signature === undefined
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
  const agreementHash = readRequiredText(value["agreementHash"]);
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
  if (amount === undefined || currency === undefined || typeof taxIncluded !== "boolean") {
    return undefined;
  }
  return { amount, currency, taxIncluded };
}

function readLocalTerms(value: JsonValue | undefined): { readonly paymentDueDate: string; readonly ipOwnership: string } | undefined {
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

function readSignature(value: JsonValue | undefined): { readonly verification: "deferred"; readonly material: string } | undefined {
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
  if (typeof value !== "string" || parseInstant(value) === undefined) {
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
