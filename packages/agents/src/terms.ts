import {
  applyTermMessage,
  buildTermAgreement,
  checkTermValue,
  counterpartOf,
  deadlineIn,
  isCurrencyCode,
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
  | { readonly kind: "deadline-by"; readonly zone: string; readonly ask: string; readonly latest: string }
  | { readonly kind: "deadline-from"; readonly zone: string; readonly ask: string; readonly earliest: string }
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
    case "deadline-by": {
      const at = instantOf(value);
      return at !== undefined && at <= Date.parse(limit.latest);
    }
    case "deadline-from": {
      const at = instantOf(value);
      return at !== undefined && at >= Date.parse(limit.earliest);
    }
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


const instantTerm = { termId: "ix:instant", version: 1, valueType: "datetime" } as const;
const deadlineTerm = { termId: "ix:deadline", version: 1, valueType: "deadline" } as const;

function isInstant(value: string): boolean {
  return checkTermValue(instantTerm, value) === undefined;
}

function instantOf(value: TermJson | undefined): number | undefined {
  if (value === undefined || checkTermValue(deadlineTerm, value) !== undefined || !isTermObject(value)) {
    return undefined;
  }
  const at = value["at"];
  return typeof at === "string" ? Date.parse(at) : undefined;
}

function deadlineAt(zone: string, instant: string): TermJson | undefined {
  return isInstant(instant) ? deadlineIn(Date.parse(instant), zone) : undefined;
}

export function checkTermLimit(limit: TermLimit): string | undefined {
  switch (limit.kind) {
    case "money-max":
      return isCurrencyCode(limit.currency) && Number.isSafeInteger(limit.ask) && Number.isSafeInteger(limit.max) && limit.ask >= 0 && limit.ask <= limit.max
        ? undefined
        : "money-max needs a currency and 0 <= ask <= max";
    case "money-min":
      return isCurrencyCode(limit.currency) && Number.isSafeInteger(limit.ask) && Number.isSafeInteger(limit.min) && limit.min >= 0 && limit.ask >= limit.min
        ? undefined
        : "money-min needs a currency and 0 <= min <= ask";
    case "deadline-by":
      return isInstant(limit.ask) && isInstant(limit.latest) && deadlineAt(limit.zone, limit.ask) !== undefined && Date.parse(limit.ask) <= Date.parse(limit.latest)
        ? undefined
        : "deadline-by needs an IANA zone and RFC 3339 instants with ask at or before latest";
    case "deadline-from":
      return isInstant(limit.ask) && isInstant(limit.earliest) && deadlineAt(limit.zone, limit.ask) !== undefined && Date.parse(limit.ask) >= Date.parse(limit.earliest)
        ? undefined
        : "deadline-from needs an IANA zone and RFC 3339 instants with ask at or after earliest";
    case "integer-range":
      return Number.isSafeInteger(limit.min) && Number.isSafeInteger(limit.max) && Number.isSafeInteger(limit.ask) && limit.min <= limit.ask && limit.ask <= limit.max
        ? undefined
        : "integer-range needs min <= ask <= max";
    case "one-of":
      return limit.values.length > 0 ? undefined : "one-of needs at least one value";
    case "documents-held":
      return undefined;
  }
}

export function checkTermMandate(mandate: TermMandate): string | undefined {
  for (const [termId, limit] of Object.entries(mandate)) {
    const problem = checkTermLimit(limit);
    if (problem !== undefined) {
      return `${termId}: ${problem}`;
    }
  }
  return undefined;
}

function preferred(limit: TermLimit): TermJson | undefined {
  switch (limit.kind) {
    case "money-max":
    case "money-min":
      return money(limit, limit.ask);
    case "deadline-by":
    case "deadline-from":
      return deadlineAt(limit.zone, limit.ask);
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
    case "deadline-by":
      return deadlineAt(limit.zone, limit.latest);
    case "deadline-from":
      return deadlineAt(limit.zone, limit.earliest);
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
      if (offer === undefined || !withinLimit(limit, offer)) {
        return { escalation: { party: config.party, termId, reason: "outside_mandate" } };
      }
      return { message: { ...base, type: "TermCounter", termId, value: offer } };
    }
    case "open": {
      if (limit === undefined) {
        return undefined;
      }
      const value = preferred(limit);
      if (value === undefined) {
        return undefined;
      }
      if (!withinLimit(limit, value)) {
        return { escalation: { party: config.party, termId, reason: "outside_mandate" } };
      }
      return { message: { ...base, type: "TermPropose", termId, value } };
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
  for (const config of [input.client, input.worker]) {
    const problem = checkTermMandate(config.mandate);
    if (problem !== undefined) {
      throw new Error(`${config.party} mandate is not usable: ${problem}`);
    }
  }
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
