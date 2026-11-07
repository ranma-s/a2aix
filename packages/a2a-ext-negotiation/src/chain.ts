import { hashCanonicalBody } from "@ix/protocol-core";
import type { Clock } from "./model.js";
import type { PresetTerm, TermJson, TermMessage, TermSession, TermSheet, TermState } from "./terms.js";
import { applyTermMessage } from "./terms.js";

export const unsealedHash = "unverified" as const;

const hexPattern = /^[0-9a-f]{64}$/;

export function termHash(value: unknown): Promise<string> {
  return hashCanonicalBody(value);
}

export function termSheetHash(sheet: TermSheet): Promise<string> {
  return termHash(sheet);
}

export function manifestHash(files: TermJson): Promise<string> {
  return termHash({ files });
}

function isObject(value: TermJson | undefined): value is { readonly [key: string]: TermJson } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ChainedTermResult =
  | { readonly ok: true; readonly session: TermSession }
  | { readonly ok: false; readonly reason: string; readonly chain: boolean };

export async function chainedHashes(session: TermSession): Promise<string[]> {
  const hashes = [session.anchor];
  for (const message of session.transcript) {
    hashes.push(await termHash(message));
  }
  return hashes;
}

async function documentProblem(value: TermJson): Promise<string | undefined> {
  if (isObject(value) && typeof value["manifestSha256"] === "string" && value["files"] !== undefined) {
    return value["manifestSha256"] === (await manifestHash(value["files"])) ? undefined : "manifestSha256 does not match the file list";
  }
  return undefined;
}

export async function presetChainProblem(preset: readonly PresetTerm[]): Promise<string | undefined> {
  for (const entry of preset) {
    const problem = await documentProblem(entry.value);
    if (problem !== undefined) {
      return `preset ${entry.termId}: ${problem}`;
    }
  }
  return undefined;
}

export async function expectedPrevHash(session: TermSession): Promise<string> {
  const last = session.transcript[session.transcript.length - 1];
  return last === undefined ? session.anchor : termHash(last);
}

function findTerm(session: TermSession, termId: string): TermState | undefined {
  return session.terms.find((term) => term.definition.termId === termId);
}

export async function expectedValueHash(session: TermSession, termId: string): Promise<string | undefined> {
  const term = findTerm(session, termId);
  if (term === undefined) {
    return undefined;
  }
  if (term.status === "proposed") {
    return term.value === undefined ? undefined : termHash(term.value);
  }
  if (term.status === "add_requested") {
    return termHash({ termId, request: term.status, definition: term.definition, required: term.required });
  }
  if (term.status === "drop_requested" || term.status === "reopen_requested") {
    return termHash({ termId, request: term.status });
  }
  return undefined;
}

export async function sealTermMessage(session: TermSession, message: TermMessage): Promise<TermMessage> {
  const prevHash = await expectedPrevHash(session);
  switch (message.type) {
    case "TermAccept": {
      const valueHash = await expectedValueHash(session, message.termId);
      return { ...message, prevHash, valueHash: valueHash ?? unsealedHash };
    }
    case "TermAgreementDraft":
      return { ...message, prevHash, agreement: { ...message.agreement, transcriptHash: prevHash } };
    case "TermApproval":
      return session.draft === undefined ? { ...message, prevHash } : { ...message, prevHash, agreementHash: await termHash(session.draft) };
    case "TermPropose":
    case "TermCounter":
    case "TermAdd":
    case "TermDrop":
    case "TermReopen":
    case "TermRefuse":
    case "DealDecline":
      return { ...message, prevHash };
  }
}

async function chainProblem(session: TermSession, message: TermMessage): Promise<string | undefined> {
  if (!hexPattern.test(session.anchor)) {
    return "the session has no job anchor hash";
  }
  const prevHash = await expectedPrevHash(session);
  if (message.prevHash !== prevHash) {
    return "prevHash does not match the previous message";
  }
  switch (message.type) {
    case "TermAccept": {
      const valueHash = await expectedValueHash(session, message.termId);
      return valueHash !== undefined && message.valueHash === valueHash ? undefined : "valueHash does not match what is being accepted";
    }
    case "TermAgreementDraft":
      return message.agreement.transcriptHash === prevHash ? undefined : "transcriptHash does not match the history";
    case "TermApproval":
      if (session.draft === undefined) {
        return undefined;
      }
      return message.agreementHash === (await termHash(session.draft)) ? undefined : "agreementHash does not match the agreement draft";
    case "TermPropose":
    case "TermCounter":
      return documentProblem(message.value);
    case "TermAdd":
    case "TermDrop":
    case "TermReopen":
    case "TermRefuse":
    case "DealDecline":
      return undefined;
  }
}

export async function applyChainedTermMessage(session: TermSession, message: TermMessage, clock: Clock): Promise<ChainedTermResult> {
  const structural = applyTermMessage(session, message, clock);
  if (!structural.ok) {
    return { ok: false, reason: structural.reason, chain: false };
  }
  const problem = await chainProblem(session, message);
  return problem === undefined ? structural : { ok: false, reason: problem, chain: true };
}
