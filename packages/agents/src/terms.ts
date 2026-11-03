import {
  applyTermMessage,
  buildTermAgreement,
  counterpartOf,
  openTermSession,
  readyForAgreement,
  sameTermValue,
  signatureVerification,
  valueHashVerification,
} from "@ix/a2a-ext-negotiation";
import type {
  Clock,
  Party,
  PresetTerm,
  TermJson,
  TermMessage,
  TermSession,
  TermSheet,
  TermState,
} from "@ix/a2a-ext-negotiation";

export type TermLimit =
  | { readonly kind: "money-max"; readonly currency: string; readonly taxIncluded: boolean; readonly ask: number; readonly max: number }
  | { readonly kind: "money-min"; readonly currency: string; readonly taxIncluded: boolean; readonly ask: number; readonly min: number }
  | { readonly kind: "date-by"; readonly ask: string; readonly latest: string }
  | { readonly kind: "date-from"; readonly ask: string; readonly earliest: string }
  | { readonly kind: "integer-range"; readonly ask: number; readonly min: number; readonly max: number }
  | { readonly kind: "one-of"; readonly values: readonly TermJson[] }
  | { readonly kind: "documents-held"; readonly files: { readonly [path: string]: string } };

export type TermMandate = {
  readonly [termId: string]: TermLimit;
};

export type HumanDecision = "approve" | "reject";

export type TermAgentConfig = {
  readonly party: Party;
  readonly mandate: TermMandate;
  readonly human: HumanDecision;
};

export type TermTrialInput = {
  readonly jobId: string;
  readonly sheet: TermSheet;
  readonly sheetSha256: string;
  readonly preset: readonly PresetTerm[];
  readonly roundLimitPerTerm: number;
  readonly client: TermAgentConfig;
  readonly worker: TermAgentConfig;
  readonly clock: Clock;
  readonly maxTurns: number;
};

export type TermTrialEscalation = {
  readonly party: Party;
  readonly termId: string;
  readonly reason: "outside_mandate" | "not_in_mandate" | "documents_mismatch";
};

export type TermTrialResult = {
  readonly session: TermSession;
  readonly transcript: readonly TermMessage[];
  readonly escalations: readonly TermTrialEscalation[];
  readonly refused: readonly string[];
};

type TermObject = { readonly [key: string]: TermJson };

function isTermObject(value: TermJson | undefined): value is TermObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTermArray(value: TermJson | undefined): value is readonly TermJson[] {
  return Array.isArray(value);
}

function envelope(party: Party, clock: Clock) {
  const now = clock.now();
  return {
    from: party,
    sentAt: now,
    expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
    prevHash: "unverified",
    signature: { verification: signatureVerification, material: "unverified" },
  };
}

function money(limit: { readonly currency: string; readonly taxIncluded: boolean }, amount: number): TermJson {
  return { amount, currency: limit.currency, taxIncluded: limit.taxIncluded };
}

function amountOf(value: TermJson | undefined, limit: { readonly currency: string; readonly taxIncluded: boolean }): number | undefined {
  if (!isTermObject(value)) {
    return undefined;
  }
  const amount = value["amount"];
  if (value["currency"] !== limit.currency || value["taxIncluded"] !== limit.taxIncluded || typeof amount !== "number") {
    return undefined;
  }
  return amount;
}

export function withinLimit(limit: TermLimit, value: TermJson | undefined): boolean {
  switch (limit.kind) {
    case "money-max": {
      const amount = amountOf(value, limit);
      return amount !== undefined && amount <= limit.max;
    }
    case "money-min": {
      const amount = amountOf(value, limit);
      return amount !== undefined && amount >= limit.min;
    }
    case "date-by":
      return typeof value === "string" && value <= limit.latest;
    case "date-from":
      return typeof value === "string" && value >= limit.earliest;
    case "integer-range":
      return typeof value === "number" && value >= limit.min && value <= limit.max;
    case "one-of":
      return limit.values.some((candidate) => sameTermValue(candidate, value));
    case "documents-held":
      return documentsMatch(limit.files, value);
  }
}

function documentsMatch(held: { readonly [path: string]: string }, value: TermJson | undefined): boolean {
  if (!isTermObject(value)) {
    return false;
  }
  const files = value["files"];
  if (!isTermArray(files)) {
    return false;
  }
  return files.every((file) => {
    if (!isTermObject(file)) {
      return false;
    }
    const path = file["path"];
    return typeof path === "string" && held[path] !== undefined && held[path] === file["sha256"];
  });
}

function preferred(limit: TermLimit): TermJson | undefined {
  switch (limit.kind) {
    case "money-max":
    case "money-min":
      return money(limit, limit.ask);
    case "date-by":
    case "date-from":
      return limit.ask;
    case "integer-range":
      return limit.ask;
    case "one-of":
      return limit.values[0];
    case "documents-held":
      return undefined;
  }
}

function concession(limit: TermLimit, offered: TermJson | undefined): TermJson | undefined {
  switch (limit.kind) {
    case "money-max": {
      const amount = amountOf(offered, limit);
      return amount === undefined ? money(limit, limit.max) : money(limit, Math.min(limit.max, Math.max(limit.ask, Math.round((amount + limit.max) / 2))));
    }
    case "money-min": {
      const amount = amountOf(offered, limit);
      return amount === undefined ? money(limit, limit.min) : money(limit, Math.max(limit.min, Math.min(limit.ask, Math.round((amount + limit.min) / 2))));
    }
    case "date-by":
      return limit.latest;
    case "date-from":
      return limit.earliest;
    case "integer-range":
      return typeof offered === "number" ? Math.min(limit.max, Math.max(limit.min, offered)) : limit.ask;
    case "one-of":
      return limit.values[0];
    case "documents-held":
      return undefined;
  }
}

type Turn = {
  readonly message?: TermMessage;
  readonly escalation?: TermTrialEscalation;
};

function decideTerm(config: TermAgentConfig, term: TermState, clock: Clock): Turn | undefined {
  const termId = term.definition.termId;
  const limit = config.mandate[termId];
  const base = envelope(config.party, clock);
  if (term.by === config.party) {
    return undefined;
  }
  switch (term.status) {
    case "add_requested":
    case "drop_requested":
    case "reopen_requested":
      return { message: { ...base, type: "TermAccept", termId, valueHash: valueHashVerification } };
    case "proposed": {
      if (limit === undefined) {
        return { escalation: { party: config.party, termId, reason: "not_in_mandate" } };
      }
      if (withinLimit(limit, term.value)) {
        const accepted = { ...base, type: "TermAccept" as const, termId, valueHash: valueHashVerification };
        return { message: term.value === undefined ? accepted : { ...accepted, value: term.value } };
      }
      if (limit.kind === "documents-held") {
        return { escalation: { party: config.party, termId, reason: "documents_mismatch" } };
      }
      const offer = concession(limit, term.value);
      if (offer === undefined) {
        return { escalation: { party: config.party, termId, reason: "outside_mandate" } };
      }
      return { message: { ...base, type: "TermCounter", termId, value: offer } };
    }
    case "open": {
      if (limit === undefined) {
        return undefined;
      }
      const value = preferred(limit);
      return value === undefined ? undefined : { message: { ...base, type: "TermPropose", termId, value } };
    }
    case "fixed":
    case "dropped":
      return undefined;
  }
}

function nextTurn(config: TermAgentConfig, session: TermSession, clock: Clock): Turn | undefined {
  const base = envelope(config.party, clock);
  if (session.phase === "awaiting_approval") {
    if (session.approvals.includes(config.party)) {
      return undefined;
    }
    return { message: { ...base, type: "TermApproval", decision: config.human } };
  }
  if (session.phase !== "negotiating") {
    return undefined;
  }
  for (const term of session.terms) {
    const turn = decideTerm(config, term, clock);
    if (turn !== undefined) {
      return turn;
    }
  }
  if (config.party === "client" && readyForAgreement(session)) {
    const agreement = buildTermAgreement(session, `${session.jobId}-agreement`, "unverified");
    return agreement === undefined ? undefined : { message: { ...base, type: "TermAgreementDraft", agreement } };
  }
  return undefined;
}

export function runTermTrial(input: TermTrialInput): TermTrialResult {
  const opened = openTermSession({
    jobId: input.jobId,
    sheet: input.sheet,
    sheetSha256: input.sheetSha256,
    preset: input.preset,
    roundLimitPerTerm: input.roundLimitPerTerm,
  });
  if (!opened.ok) {
    throw new Error(`term session did not open: ${opened.reason}`);
  }
  let session = opened.session;
  const escalations: TermTrialEscalation[] = [];
  const refused: string[] = [];
  let party: Party = "worker";
  let idle = 0;
  for (let turn = 0; turn < input.maxTurns && idle < 2; turn += 1) {
    const config = party === "client" ? input.client : input.worker;
    const next = nextTurn(config, session, input.clock);
    party = counterpartOf(party);
    if (next?.escalation !== undefined) {
      escalations.push(next.escalation);
      break;
    }
    if (next?.message === undefined) {
      idle += 1;
      continue;
    }
    idle = 0;
    const result = applyTermMessage(session, next.message, input.clock);
    if (!result.ok) {
      refused.push(result.reason);
      break;
    }
    session = result.session;
  }
  return { session, transcript: session.transcript, escalations, refused };
}
