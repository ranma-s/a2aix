import type { Clock } from "./apply.js";
import type { Party, UnverifiedSignature } from "./model.js";
import { signatureVerification } from "./model.js";

export type TermJson =
  | null
  | boolean
  | number
  | string
  | readonly TermJson[]
  | { readonly [key: string]: TermJson };

type TermJsonObject = { readonly [key: string]: TermJson };

export const termValueTypes = [
  "money",
  "date",
  "datetime",
  "integer",
  "duration",
  "boolean",
  "code",
  "codes",
  "count",
  "textRef",
  "documents",
] as const;

export type TermValueType = (typeof termValueTypes)[number];

export const durationUnits = ["day", "hour"] as const;

export const valueHashVerification = "deferred" as const;

export type TermDefinition = {
  readonly termId: string;
  readonly version: number;
  readonly valueType: TermValueType;
  readonly unit?: string;
  readonly codes?: readonly string[];
  readonly label?: { readonly [language: string]: string };
};

export type TermSheet = {
  readonly sheetId: string;
  readonly version: number;
  readonly extends?: string;
  readonly required: readonly TermDefinition[];
  readonly optional: readonly TermDefinition[];
};

export type SheetRef = {
  readonly sheetId: string;
  readonly version: number;
  readonly sha256: string;
};

export type PresetTerm = {
  readonly termId: string;
  readonly value: TermJson;
};

export const termMessageTypes = [
  "TermPropose",
  "TermCounter",
  "TermAccept",
  "TermAdd",
  "TermDrop",
  "TermReopen",
  "TermRefuse",
  "DealDecline",
  "TermAgreementDraft",
  "TermApproval",
] as const;

export type TermMessageType = (typeof termMessageTypes)[number];

type Envelope = {
  readonly from: Party;
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly prevHash: string;
  readonly signature: UnverifiedSignature;
};

export type TermProposeMessage = Envelope & {
  readonly type: "TermPropose" | "TermCounter";
  readonly termId: string;
  readonly value: TermJson;
  readonly note?: string;
};

export type TermAcceptMessage = Envelope & {
  readonly type: "TermAccept";
  readonly termId: string;
  readonly value?: TermJson;
  readonly valueHash: typeof valueHashVerification;
};

export type TermAddMessage = Envelope & {
  readonly type: "TermAdd";
  readonly definition: TermDefinition;
  readonly required: boolean;
};

export type TermDropMessage = Envelope & {
  readonly type: "TermDrop" | "TermReopen";
  readonly termId: string;
};

export type TermRefuseMessage = Envelope & {
  readonly type: "TermRefuse";
  readonly termId: string;
};

export type DealDeclineMessage = Envelope & {
  readonly type: "DealDecline";
  readonly reason: string;
};

export type TermAgreementDraftMessage = Envelope & {
  readonly type: "TermAgreementDraft";
  readonly agreement: TermAgreement;
};

export type TermApprovalMessage = Envelope & {
  readonly type: "TermApproval";
  readonly decision: "approve" | "reject" | "revise";
  readonly reopen?: readonly string[];
};

export type TermMessage =
  | TermProposeMessage
  | TermAcceptMessage
  | TermAddMessage
  | TermDropMessage
  | TermRefuseMessage
  | DealDeclineMessage
  | TermAgreementDraftMessage
  | TermApprovalMessage;

export type FixedTerm = {
  readonly termId: string;
  readonly value: TermJson;
};

export type TermAgreement = {
  readonly agreementId: string;
  readonly jobId: string;
  readonly sheet: SheetRef;
  readonly addedTerms: readonly TermDefinition[];
  readonly terms: readonly FixedTerm[];
  readonly transcriptHash: string;
};

export const termStatuses = [
  "open",
  "proposed",
  "fixed",
  "dropped",
  "add_requested",
  "drop_requested",
  "reopen_requested",
] as const;

export type TermStatus = (typeof termStatuses)[number];

export type TermState = {
  readonly definition: TermDefinition;
  readonly required: boolean;
  readonly status: TermStatus;
  readonly value?: TermJson;
  readonly by?: Party;
  readonly counters: number;
  readonly prior?: TermPrior;
};

export type TermPrior = {
  readonly status: TermStatus;
  readonly by?: Party;
};

export const termPhases = ["negotiating", "awaiting_approval", "agreed", "no_deal"] as const;

export type TermPhase = (typeof termPhases)[number];

export const termNoDealReasons = ["declined", "rejected", "round_limit"] as const;

export type TermNoDealReason = (typeof termNoDealReasons)[number];

export type TermSession = {
  readonly jobId: string;
  readonly sheet: SheetRef;
  readonly roundLimitPerTerm: number;
  readonly phase: TermPhase;
  readonly terms: readonly TermState[];
  readonly added: readonly TermDefinition[];
  readonly draft?: TermAgreement;
  readonly approvals: readonly Party[];
  readonly reason?: TermNoDealReason;
  readonly transcript: readonly TermMessage[];
  readonly signatureVerification: typeof signatureVerification;
};

export type TermResult =
  | { readonly ok: true; readonly session: TermSession }
  | { readonly ok: false; readonly reason: string };

export const coreTerms = [
  { termId: "ix:price", version: 1, valueType: "money", label: { ja: "金額", en: "Price" } },
  { termId: "ix:deadline", version: 1, valueType: "date", label: { ja: "納期", en: "Deadline" } },
  {
    termId: "ix:revision-limit",
    version: 1,
    valueType: "integer",
    label: { ja: "修正回数", en: "Revision limit" },
  },
  {
    termId: "ix:acceptance-window",
    version: 1,
    valueType: "duration",
    label: { ja: "検収期間", en: "Acceptance window" },
  },
  {
    termId: "ix:deliverables",
    version: 1,
    valueType: "count",
    label: { ja: "納品物", en: "Deliverables" },
  },
  {
    termId: "ix:deliverable-format",
    version: 1,
    valueType: "codes",
    codes: ["application/pdf", "text/html", "image/png", "image/svg+xml", "text/markdown"],
    label: { ja: "納品形式", en: "Deliverable format" },
  },
] as const satisfies readonly TermDefinition[];

export const initialSpecTerm = {
  termId: "ix:initial-spec",
  version: 1,
  valueType: "documents",
  label: { ja: "初期仕様書", en: "Initial specification" },
} as const satisfies TermDefinition;

export const coreSheet: TermSheet = {
  sheetId: "ix:core",
  version: 1,
  required: coreTerms,
  optional: [initialSpecTerm],
};

export const webSiteSheet: TermSheet = {
  sheetId: "ix:sheet/web-site",
  version: 1,
  extends: "ix:core/1",
  required: [
    ...coreTerms,
    { termId: "web:page-count", version: 1, valueType: "integer", label: { ja: "ページ数" } },
    { termId: "web:responsive", version: 1, valueType: "boolean", label: { ja: "スマートフォン対応" } },
  ],
  optional: [
    initialSpecTerm,
    {
      termId: "web:browsers",
      version: 1,
      valueType: "codes",
      codes: ["chrome", "safari", "edge", "firefox"],
      label: { ja: "対応ブラウザ" },
    },
    { termId: "web:hosting-included", version: 1, valueType: "boolean", label: { ja: "サーバー込み" } },
  ],
};

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const datetimePattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const kindCodePattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
export const iso4217Currencies = [
  "AED", "AFN", "ALL", "AMD", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD",
  "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY", "COP", "CRC", "CUP",
  "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP",
  "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD",
  "JPY", "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD",
  "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN",
  "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB",
  "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL",
  "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VES", "VND",
  "VUV", "WST", "XAF", "XCD", "XOF", "XPF", "YER", "ZAR", "ZMW", "ZWG",
] as const;

export function isCurrencyCode(value: string): boolean {
  return iso4217Currencies.some((code) => code === value);
}

function hasPathControl(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || char === "\\" || char === ":") {
      return true;
    }
  }
  return false;
}

export function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.length > 1024 || value.startsWith("/") || hasPathControl(value)) {
    return false;
  }
  return value.split("/").every((segment) => segment.length > 0 && segment.length <= 255 && segment !== "." && segment !== ".." && segment.trim() === segment);
}
const mediaTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const termIdPattern = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9/._-]*$/;

function isObject(value: TermJson | undefined): value is TermJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArray(value: TermJson | undefined): value is readonly TermJson[] {
  return Array.isArray(value);
}

function hasOnlyKeys(value: TermJsonObject, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isCount(value: TermJson | undefined, min: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

function isCalendarDate(value: string): boolean {
  const match = datePattern.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}


export function checkTermValue(definition: TermDefinition, value: TermJson): string | undefined {
  const codes = definition.codes;
  switch (definition.valueType) {
    case "money":
      if (
        isObject(value) &&
        hasOnlyKeys(value, ["amount", "currency", "taxIncluded"]) &&
        isCount(value["amount"], 0) &&
        typeof value["currency"] === "string" &&
        isCurrencyCode(value["currency"]) &&
        typeof value["taxIncluded"] === "boolean"
      ) {
        return undefined;
      }
      return "money needs an integer amount, an active ISO 4217 currency, and taxIncluded";
    case "date":
      return typeof value === "string" && isCalendarDate(value) ? undefined : "date must be YYYY-MM-DD";
    case "datetime":
      return typeof value === "string" &&
        datetimePattern.test(value) &&
        isCalendarDate(value.slice(0, 10)) &&
        !Number.isNaN(Date.parse(value))
        ? undefined
        : "datetime must be RFC 3339 with an offset";
    case "integer":
      return isCount(value, 0) ? undefined : "integer must be a whole number of 0 or more";
    case "duration":
      return isObject(value) &&
        hasOnlyKeys(value, ["value", "unit"]) &&
        isCount(value["value"], 1) &&
        (value["unit"] === "day" || value["unit"] === "hour")
        ? undefined
        : "duration needs a positive integer value and a unit of day or hour";
    case "boolean":
      return typeof value === "boolean" ? undefined : "boolean must be true or false";
    case "code":
      return typeof value === "string" && (codes === undefined || codes.includes(value))
        ? undefined
        : "code must be one of the listed codes";
    case "codes":
      return checkCodes(value, codes);
    case "count":
      return checkCountList(value);
    case "textRef":
      return checkFile(value, false);
    case "documents":
      return checkDocuments(value);
  }
}

function checkCodes(value: TermJson, codes: readonly string[] | undefined): string | undefined {
  if (!isArray(value) || value.length === 0) {
    return "codes must be a non-empty list";
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || seen.has(item) || (codes !== undefined && !codes.includes(item))) {
      return "codes must be distinct listed codes";
    }
    seen.add(item);
  }
  return undefined;
}

function checkCountList(value: TermJson): string | undefined {
  if (!isArray(value) || value.length === 0) {
    return "count must be a non-empty list of code and n";
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (
      !isObject(item) ||
      !hasOnlyKeys(item, ["code", "n"]) ||
      typeof item["code"] !== "string" ||
      !kindCodePattern.test(item["code"]) ||
      seen.has(item["code"]) ||
      !isCount(item["n"], 1)
    ) {
      return "each count needs a distinct lowercase kind code (a-z, 0-9, -) and n of 1 or more";
    }
    seen.add(item["code"]);
  }
  return undefined;
}

function checkFile(value: TermJson | undefined, withPath: boolean): string | undefined {
  const keys = withPath ? ["path", "sha256", "bytes", "mediaType"] : ["sha256", "bytes", "mediaType"];
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, keys) ||
    (withPath && (typeof value["path"] !== "string" || !isSafeRelativePath(value["path"]))) ||
    typeof value["sha256"] !== "string" ||
    !sha256Pattern.test(value["sha256"]) ||
    !isCount(value["bytes"], 0) ||
    typeof value["mediaType"] !== "string" ||
    !mediaTypePattern.test(value["mediaType"])
  ) {
    return "a file needs a lowercase SHA-256, a byte size, and a media type";
  }
  return undefined;
}

function checkDocuments(value: TermJson): string | undefined {
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ["manifestSha256", "files"]) ||
    typeof value["manifestSha256"] !== "string" ||
    !sha256Pattern.test(value["manifestSha256"]) ||
    !isArray(value["files"]) ||
    value["files"].length === 0
  ) {
    return "documents need a manifest SHA-256 and at least one file";
  }
  let previous = "";
  for (const file of value["files"]) {
    const problem = checkFile(file, true);
    if (problem !== undefined) {
      return problem;
    }
    const path = isObject(file) && typeof file["path"] === "string" ? file["path"] : "";
    if (path <= previous) {
      return "files must be sorted by path without duplicates";
    }
    previous = path;
  }
  return undefined;
}

export function sameTermValue(left: TermJson | undefined, right: TermJson | undefined): boolean {
  if (left === undefined || right === undefined) {
    return false;
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return left === right;
  }
  if (isArray(left) || isArray(right)) {
    if (!isArray(left) || !isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => sameTermValue(item, right[index]));
  }
  if (!isObject(left) || !isObject(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key, index) => key === rightKeys[index] && sameTermValue(left[key], right[key]));
}

export function checkTermDefinition(definition: TermDefinition): string | undefined {
  if (!termIdPattern.test(definition.termId)) {
    return "termId must look like namespace:name";
  }
  if (!Number.isSafeInteger(definition.version) || definition.version < 1) {
    return "version must be a positive integer";
  }
  if (!termValueTypes.includes(definition.valueType)) {
    return "valueType is not known";
  }
  if (definition.valueType === "code" || definition.valueType === "codes") {
    if (definition.codes === undefined || definition.codes.length === 0) {
      return "a code or codes term needs a non-empty code list";
    }
    if (new Set(definition.codes).size !== definition.codes.length || !definition.codes.every((code) => code.trim().length > 0)) {
      return "the code list must hold distinct non-empty codes";
    }
  } else if (definition.codes !== undefined) {
    return "only code and codes terms carry a code list";
  }
  if (!hasOnlyKeys(definitionFields(definition), definitionKeys)) {
    return "a term definition has an unknown field";
  }
  return undefined;
}

const definitionKeys = ["termId", "version", "valueType", "unit", "codes", "label"] as const;

function definitionFields(definition: TermDefinition): TermJsonObject {
  const fields: { [key: string]: TermJson } = {};
  for (const [key, value] of Object.entries(definition)) {
    fields[key] = jsonOf(value);
  }
  return fields;
}

function jsonOf(value: unknown): TermJson {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map(jsonOf);
  }
  if (typeof value === "object") {
    const out: { [key: string]: TermJson } = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = jsonOf(child);
    }
    return out;
  }
  return null;
}

export function openTermSession(input: {
  readonly jobId: string;
  readonly sheet: TermSheet;
  readonly sheetSha256: string;
  readonly preset: readonly PresetTerm[];
  readonly roundLimitPerTerm: number;
}): TermResult {
  if (!Number.isSafeInteger(input.roundLimitPerTerm) || input.roundLimitPerTerm < 1) {
    return { ok: false, reason: "roundLimitPerTerm must be a positive integer" };
  }
  const terms: TermState[] = [];
  for (const [list, required] of [
    [input.sheet.required, true],
    [input.sheet.optional, false],
  ] as const) {
    for (const definition of list) {
      const problem = checkTermDefinition(definition);
      if (problem !== undefined) {
        return { ok: false, reason: `${definition.termId}: ${problem}` };
      }
      if (terms.some((term) => term.definition.termId === definition.termId)) {
        return { ok: false, reason: `${definition.termId} appears twice in the sheet` };
      }
      terms.push({ definition, required, status: "open", counters: 0 });
    }
  }
  const seeded: TermState[] = [];
  for (const term of terms) {
    const preset = input.preset.filter((entry) => entry.termId === term.definition.termId);
    const first = preset[0];
    if (preset.length > 1) {
      return { ok: false, reason: `${term.definition.termId} is preset twice` };
    }
    if (first === undefined) {
      seeded.push(term);
      continue;
    }
    const problem = checkTermValue(term.definition, first.value);
    if (problem !== undefined) {
      return { ok: false, reason: `${term.definition.termId}: ${problem}` };
    }
    seeded.push({ ...term, status: "proposed", value: first.value, by: "client" });
  }
  for (const entry of input.preset) {
    if (!terms.some((term) => term.definition.termId === entry.termId)) {
      return { ok: false, reason: `${entry.termId} is not in the sheet` };
    }
  }
  return {
    ok: true,
    session: {
      jobId: input.jobId,
      sheet: { sheetId: input.sheet.sheetId, version: input.sheet.version, sha256: input.sheetSha256 },
      roundLimitPerTerm: input.roundLimitPerTerm,
      phase: "negotiating",
      terms: seeded,
      added: [],
      approvals: [],
      transcript: [],
      signatureVerification,
    },
  };
}

function other(party: Party): Party {
  return party === "client" ? "worker" : "client";
}

function refuse(reason: string): TermResult {
  return { ok: false, reason };
}

function replaceTerm(session: TermSession, next: TermState): readonly TermState[] {
  return session.terms.map((term) => (term.definition.termId === next.definition.termId ? next : term));
}

function findTerm(session: TermSession, termId: string): TermState | undefined {
  return session.terms.find((term) => term.definition.termId === termId);
}

export function applyTermMessage(session: TermSession, message: TermMessage, clock: Clock): TermResult {
  const now = Date.parse(clock.now());
  const expires = Date.parse(message.expiresAt);
  if (Number.isNaN(expires) || Number.isNaN(now) || expires <= now) {
    return refuse("message is expired or has no valid expiresAt");
  }
  const shape = checkEnvelope(message);
  if (shape !== undefined) {
    return refuse(shape);
  }
  const verification: string = message.signature.verification;
  if (verification !== signatureVerification) {
    return refuse("signature verification is deferred");
  }
  if (session.phase === "agreed" || session.phase === "no_deal") {
    return refuse(`negotiation is ${session.phase}`);
  }
  const result = step(session, message);
  if (!result.ok) {
    return result;
  }
  return { ok: true, session: { ...result.session, transcript: [...session.transcript, message] } };
}

const approvalDecisions = ["approve", "reject", "revise"] as const;

function checkEnvelope(message: TermMessage): string | undefined {
  const type: string = message.type;
  const from: string = message.from;
  if (!termMessageTypes.some((known) => known === type)) {
    return "unknown message type";
  }
  if (from !== "client" && from !== "worker") {
    return "from must be client or worker";
  }
  if (message.type === "TermApproval") {
    const decision: string = message.decision;
    if (!approvalDecisions.some((known) => known === decision)) {
      return "decision must be approve, reject, or revise";
    }
  }
  return undefined;
}

function step(session: TermSession, message: TermMessage): TermResult {
  if (message.type === "DealDecline") {
    return { ok: true, session: { ...session, phase: "no_deal", reason: "declined" } };
  }
  if (session.phase === "awaiting_approval") {
    if (message.type === "TermApproval") {
      return applyApproval(session, message);
    }
    return refuse("terms are frozen while the humans decide");
  }
  switch (message.type) {
    case "TermPropose":
    case "TermCounter":
      return applyPropose(session, message);
    case "TermAccept":
      return applyAccept(session, message);
    case "TermAdd":
      return applyAdd(session, message);
    case "TermDrop":
    case "TermReopen":
      return applyRequest(session, message);
    case "TermRefuse":
      return applyRefuse(session, message);
    case "TermAgreementDraft":
      return applyDraft(session, message);
    case "TermApproval":
      return refuse("there is no agreement draft to decide on");
  }
}

function applyPropose(session: TermSession, message: TermProposeMessage): TermResult {
  const term = findTerm(session, message.termId);
  if (term === undefined) {
    return refuse(`${message.termId} is not part of this negotiation`);
  }
  if (term.status !== "open" && term.status !== "proposed") {
    return refuse(`${message.termId} is ${term.status}`);
  }
  if (message.type === "TermCounter" && term.status !== "proposed") {
    return refuse(`${message.termId} has no value to counter`);
  }
  if (term.status === "proposed" && term.by === message.from) {
    return refuse(`${message.termId} already waits for the other side`);
  }
  const problem = checkTermValue(term.definition, message.value);
  if (problem !== undefined) {
    return refuse(`${message.termId}: ${problem}`);
  }
  const counters = term.status === "proposed" ? term.counters + 1 : term.counters;
  if (counters > session.roundLimitPerTerm) {
    if (!term.required) {
      const dropped: TermState = { definition: term.definition, required: false, status: "dropped", counters: term.counters };
      return { ok: true, session: { ...session, terms: replaceTerm(session, dropped) } };
    }
    return {
      ok: true,
      session: { ...session, phase: "no_deal", reason: "round_limit" },
    };
  }
  const next: TermState = { ...term, status: "proposed", value: message.value, by: message.from, counters };
  return { ok: true, session: { ...session, terms: replaceTerm(session, next) } };
}

function applyAccept(session: TermSession, message: TermAcceptMessage): TermResult {
  const term = findTerm(session, message.termId);
  if (term === undefined) {
    return refuse(`${message.termId} is not part of this negotiation`);
  }
  if (term.by === message.from) {
    return refuse("a side cannot accept its own request");
  }
  switch (term.status) {
    case "proposed": {
      if (!sameTermValue(term.value, message.value)) {
        return refuse(`${message.termId}: the accepted value is not the proposed value`);
      }
      const fixed: TermState = { definition: term.definition, required: term.required, status: "fixed", counters: term.counters };
      return settle(session, term.value === undefined ? fixed : { ...fixed, value: term.value });
    }
    case "add_requested":
      return settle(session, { definition: term.definition, required: term.required, status: "open", counters: 0 }, term.definition);
    case "drop_requested":
      return settle(session, { definition: term.definition, required: false, status: "dropped", counters: term.counters });
    case "reopen_requested":
      return settle(session, { definition: term.definition, required: term.required, status: "open", counters: term.counters });
    case "open":
    case "fixed":
    case "dropped":
      return refuse(`${message.termId} has nothing to accept`);
  }
}

function settle(session: TermSession, next: TermState, added?: TermDefinition): TermResult {
  return {
    ok: true,
    session: {
      ...session,
      terms: replaceTerm(session, next),
      added: added === undefined ? session.added : [...session.added, added],
    },
  };
}

function applyAdd(session: TermSession, message: TermAddMessage): TermResult {
  const problem = checkTermDefinition(message.definition);
  if (problem !== undefined) {
    return refuse(`${message.definition.termId}: ${problem}`);
  }
  if (findTerm(session, message.definition.termId) !== undefined) {
    return refuse(`${message.definition.termId} is already part of this negotiation`);
  }
  const next: TermState = {
    definition: message.definition,
    required: message.required,
    status: "add_requested",
    by: message.from,
    counters: 0,
  };
  return { ok: true, session: { ...session, terms: [...session.terms, next] } };
}

function applyRequest(session: TermSession, message: TermDropMessage): TermResult {
  const term = findTerm(session, message.termId);
  if (term === undefined) {
    return refuse(`${message.termId} is not part of this negotiation`);
  }
  if (message.type === "TermDrop") {
    if (term.required) {
      return refuse(`${message.termId} is required and cannot be dropped`);
    }
    if (term.status !== "open" && term.status !== "proposed") {
      return refuse(`${message.termId} is ${term.status}`);
    }
    return settleRequest(session, term, "drop_requested", message.from);
  }
  if (term.status !== "fixed") {
    return refuse(`${message.termId} is not fixed`);
  }
  return settleRequest(session, term, "reopen_requested", message.from);
}

function settleRequest(session: TermSession, term: TermState, status: TermStatus, by: Party): TermResult {
  const prior: TermPrior = term.by === undefined ? { status: term.status } : { status: term.status, by: term.by };
  const next: TermState = { ...term, status, by, prior };
  return { ok: true, session: { ...session, terms: replaceTerm(session, next) } };
}

function applyRefuse(session: TermSession, message: TermRefuseMessage): TermResult {
  const term = findTerm(session, message.termId);
  if (term === undefined) {
    return refuse(`${message.termId} is not part of this negotiation`);
  }
  if (term.by === message.from) {
    return refuse("a side cannot refuse its own request");
  }
  if (term.status === "add_requested") {
    return {
      ok: true,
      session: { ...session, terms: session.terms.filter((entry) => entry.definition.termId !== message.termId) },
    };
  }
  if ((term.status !== "drop_requested" && term.status !== "reopen_requested") || term.prior === undefined) {
    return refuse(`${message.termId} has no request to refuse`);
  }
  const base: TermState = { definition: term.definition, required: term.required, status: term.prior.status, counters: term.counters };
  const withValue: TermState = term.value === undefined ? base : { ...base, value: term.value };
  const restored: TermState = term.prior.by === undefined ? withValue : { ...withValue, by: term.prior.by };
  return { ok: true, session: { ...session, terms: replaceTerm(session, restored) } };
}

export function readyForAgreement(session: TermSession): boolean {
  return (
    session.phase === "negotiating" &&
    session.terms.every((term) =>
      term.required ? term.status === "fixed" : term.status === "fixed" || term.status === "dropped" || term.status === "open",
    )
  );
}

export function buildTermAgreement(session: TermSession, agreementId: string, transcriptHash: string): TermAgreement | undefined {
  if (!readyForAgreement(session)) {
    return undefined;
  }
  const terms: FixedTerm[] = [];
  for (const term of session.terms) {
    if (term.status === "fixed" && term.value !== undefined) {
      terms.push({ termId: term.definition.termId, value: term.value });
    }
  }
  terms.sort((left, right) => (left.termId < right.termId ? -1 : left.termId > right.termId ? 1 : 0));
  return {
    agreementId,
    jobId: session.jobId,
    sheet: session.sheet,
    addedTerms: session.added,
    terms,
    transcriptHash,
  };
}

const agreementKeys = ["agreementId", "jobId", "sheet", "addedTerms", "terms", "transcriptHash"] as const;
const sheetRefKeys = ["sheetId", "version", "sha256"] as const;
const fixedTermKeys = ["termId", "value"] as const;

export function sameTermAgreement(left: TermAgreement, right: TermAgreement): boolean {
  const received = jsonOf(right);
  if (
    !isObject(received) ||
    !hasOnlyKeys(received, agreementKeys) ||
    !isObject(received["sheet"]) ||
    !hasOnlyKeys(received["sheet"], sheetRefKeys) ||
    !isArray(received["terms"]) ||
    !received["terms"].every((term) => isObject(term) && hasOnlyKeys(term, fixedTermKeys))
  ) {
    return false;
  }
  return (
    left.agreementId === right.agreementId &&
    left.jobId === right.jobId &&
    left.transcriptHash === right.transcriptHash &&
    left.sheet.sheetId === right.sheet.sheetId &&
    left.sheet.version === right.sheet.version &&
    left.sheet.sha256 === right.sheet.sha256 &&
    left.addedTerms.length === right.addedTerms.length &&
    left.addedTerms.every((definition, index) => {
      const peer = right.addedTerms[index];
      return peer !== undefined && sameTermValue(definitionFields(definition), definitionFields(peer));
    }) &&
    left.terms.length === right.terms.length &&
    left.terms.every((term, index) => {
      const peer = right.terms[index];
      return peer !== undefined && term.termId === peer.termId && sameTermValue(term.value, peer.value);
    })
  );
}

function applyDraft(session: TermSession, message: TermAgreementDraftMessage): TermResult {
  const expected = buildTermAgreement(session, message.agreement.agreementId, message.agreement.transcriptHash);
  if (expected === undefined) {
    return refuse("required terms are not all fixed, or a request is still open");
  }
  if (!sameTermAgreement(expected, message.agreement)) {
    return refuse("the draft does not match the fixed terms in the history");
  }
  return { ok: true, session: { ...session, phase: "awaiting_approval", draft: expected, approvals: [] } };
}

function applyApproval(session: TermSession, message: TermApprovalMessage): TermResult {
  if (session.approvals.includes(message.from)) {
    return refuse(`${message.from} has already approved`);
  }
  if (message.decision === "reject") {
    return { ok: true, session: { ...session, phase: "no_deal", reason: "rejected" } };
  }
  if (message.decision === "revise") {
    const reopen = message.reopen ?? [];
    if (reopen.length === 0) {
      return refuse("revise must name the terms to reopen");
    }
    let terms = session.terms;
    for (const termId of reopen) {
      const term = terms.find((entry) => entry.definition.termId === termId);
      if (term === undefined || term.status !== "fixed") {
        return refuse(`${termId} is not a fixed term`);
      }
      terms = terms.map((entry) =>
        entry.definition.termId === termId
          ? { definition: entry.definition, required: entry.required, status: "open", counters: entry.counters }
          : entry,
      );
    }
    const reopened: TermSession = {
      jobId: session.jobId,
      sheet: session.sheet,
      roundLimitPerTerm: session.roundLimitPerTerm,
      phase: "negotiating",
      terms,
      added: session.added,
      approvals: [],
      transcript: session.transcript,
      signatureVerification: session.signatureVerification,
    };
    return { ok: true, session: reopened };
  }
  const approvals = [...session.approvals, message.from];
  const both = approvals.includes("client") && approvals.includes("worker");
  return { ok: true, session: { ...session, approvals, phase: both ? "agreed" : "awaiting_approval" } };
}

export function counterpartOf(party: Party): Party {
  return other(party);
}
