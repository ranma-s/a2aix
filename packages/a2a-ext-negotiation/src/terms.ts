import type { Clock, Party, UnverifiedSignature } from "./model.js";
import { jwsSignatureFormat, signatureVerification } from "./model.js";
import { ianaZoneNames } from "./zones.js";

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
  "deadline",
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
  readonly valueHash: string;
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
  readonly agreementHash?: string;
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
  readonly anchor: string;
  readonly signatureVerification: typeof signatureVerification;
};

export type TermResult =
  | { readonly ok: true; readonly session: TermSession }
  | { readonly ok: false; readonly reason: string };

export const coreTerms = [
  { termId: "ix:price", version: 1, valueType: "money", label: { ja: "金額", en: "Price" } },
  { termId: "ix:deadline", version: 1, valueType: "deadline", label: { ja: "納期", en: "Deadline" } },
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
const kindCodePattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
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
  "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VED", "VES",
  "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XOF", "XPF", "YER", "ZAR", "ZMW", "ZWG",
] as const;

export function isCurrencyCode(value: string): boolean {
  return iso4217Currencies.some((code) => code === value);
}

const invisiblePathCodes = new Set([0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x180e, 0x3164, 0xfeff, 0xffa0]);

function isInvisibleOrControl(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x2060 && code <= 0x2069) ||
    (code >= 0xe0000 && code <= 0xe007f) ||
    invisiblePathCodes.has(code)
  );
}

function hasPathControl(value: string): boolean {
  if (value.normalize("NFC") !== value) {
    return true;
  }
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (isInvisibleOrControl(code) || char === "\\" || char === ":") {
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
      return typeof value === "string" && isInstant(value)
        ? undefined
        : "datetime must be RFC 3339 with an offset";
    case "deadline":
      return checkDeadline(value);
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

export function isZoneName(zone: string): boolean {
  return ianaZoneNames.some((name) => name === zone);
}

export function zoneOffsetMinutes(zone: string, instantMs: number): number | undefined {
  if (!isZoneName(zone) || !Number.isFinite(instantMs)) {
    return undefined;
  }
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      return undefined;
    }
    throw error;
  }
  const parts: { [type: string]: number } = {};
  for (const part of format.formatToParts(new Date(instantMs))) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }
  const local = Date.UTC(
    parts["year"] ?? 0,
    (parts["month"] ?? 1) - 1,
    parts["day"] ?? 1,
    parts["hour"] ?? 0,
    parts["minute"] ?? 0,
    parts["second"] ?? 0,
  );
  const whole = instantMs - (instantMs % 1000 + 1000) % 1000;
  return Math.round((local - whole) / 60000);
}

function offsetOf(at: string): number | undefined {
  if (at.endsWith("Z")) {
    return 0;
  }
  const match = /([+-])(\d{2}):(\d{2})$/.exec(at);
  if (match === null || at.endsWith("-00:00")) {
    return undefined;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function isInstant(value: string): boolean {
  return datetimePattern.test(value) && isCalendarDate(value.slice(0, 10)) && !Number.isNaN(Date.parse(value));
}

function checkDeadline(value: TermJson): string | undefined {
  if (!isObject(value) || !hasOnlyKeys(value, ["at", "zone"]) || typeof value["at"] !== "string" || typeof value["zone"] !== "string") {
    return "deadline needs at (RFC 3339 with offset) and zone (IANA time zone)";
  }
  const at = value["at"];
  if (!isInstant(at)) {
    return "deadline at must be RFC 3339 with an offset";
  }
  const expected = zoneOffsetMinutes(value["zone"], Date.parse(at));
  if (expected === undefined) {
    return "deadline zone must be an IANA time zone such as Asia/Tokyo";
  }
  if (offsetOf(at) !== expected) {
    return "the offset in deadline at does not match the zone at that moment";
  }
  return undefined;
}

export function deadlineIn(instantMs: number, zone: string): TermJson | undefined {
  const offset = zoneOffsetMinutes(zone, instantMs);
  if (offset === undefined) {
    return undefined;
  }
  const local = new Date(instantMs + offset * 60000).toISOString();
  const clock = instantMs % 1000 === 0 ? local.slice(0, 19) : local.slice(0, 23);
  const sign = offset < 0 ? "-" : "+";
  const size = Math.abs(offset);
  const hours = String(Math.floor(size / 60)).padStart(2, "0");
  const minutes = String(size % 60).padStart(2, "0");
  return { at: `${clock}${sign}${hours}:${minutes}`, zone };
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
    if (new Set(definition.codes).size !== definition.codes.length || !definition.codes.every((code) => typeof code === "string" && code.trim().length > 0)) {
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
  readonly anchorHash?: string;
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
      anchor: input.anchorHash ?? "unverified",
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
  const raw: unknown = message;
  const malformed = checkMessageShape(raw);
  if (malformed !== undefined) {
    return refuse(malformed);
  }
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
  if (verification !== signatureVerification && verification !== jwsSignatureFormat) {
    return refuse("the signature format is not known");
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

type Loose = { readonly [key: string]: unknown };

function isLoose(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looseList(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: readonly unknown[] = value;
  return items;
}

function isStringList(value: unknown): boolean {
  const items = looseList(value);
  return items !== undefined && items.every((item) => typeof item === "string");
}

function checkDefinitionShape(value: unknown): string | undefined {
  if (!isLoose(value) || typeof value["termId"] !== "string" || typeof value["version"] !== "number" || typeof value["valueType"] !== "string") {
    return "a term definition needs termId, version, and valueType";
  }
  if (value["unit"] !== undefined && typeof value["unit"] !== "string") {
    return "unit must be text";
  }
  if (value["codes"] !== undefined && !isStringList(value["codes"])) {
    return "codes must be a list of text";
  }
  const label = value["label"];
  if (label !== undefined && (!isLoose(label) || !Object.values(label).every((text) => typeof text === "string"))) {
    return "label must map languages to text";
  }
  return undefined;
}

function checkMessageShape(raw: unknown): string | undefined {
  if (!isLoose(raw)) {
    return "a message must be an object";
  }
  for (const key of ["type", "from", "sentAt", "expiresAt", "prevHash"]) {
    if (typeof raw[key] !== "string") {
      return `${key} must be text`;
    }
  }
  const signature = raw["signature"];
  if (!isLoose(signature) || typeof signature["verification"] !== "string" || typeof signature["material"] !== "string") {
    return "signature must carry verification and material";
  }
  switch (raw["type"]) {
    case "TermPropose":
    case "TermCounter":
      return typeof raw["termId"] === "string" && raw["value"] !== undefined ? undefined : "a proposal needs termId and value";
    case "TermAccept":
      return typeof raw["termId"] === "string" && typeof raw["valueHash"] === "string" ? undefined : "an accept needs termId and valueHash";
    case "TermDrop":
    case "TermReopen":
    case "TermRefuse":
      return typeof raw["termId"] === "string" ? undefined : "this message needs termId";
    case "TermAdd":
      return typeof raw["required"] === "boolean" ? checkDefinitionShape(raw["definition"]) : "required must be true or false";
    case "DealDecline":
      return typeof raw["reason"] === "string" ? undefined : "a decline needs a reason";
    case "TermApproval":
      if (raw["agreementHash"] !== undefined && typeof raw["agreementHash"] !== "string") {
        return "agreementHash must be text";
      }
      return raw["reopen"] === undefined || isStringList(raw["reopen"]) ? undefined : "reopen must be a list of termIds";
    case "TermAgreementDraft": {
      const agreement = raw["agreement"];
      if (
        !isLoose(agreement) ||
        typeof agreement["agreementId"] !== "string" ||
        typeof agreement["jobId"] !== "string" ||
        typeof agreement["transcriptHash"] !== "string" ||
        !isLoose(agreement["sheet"])
      ) {
        return "an agreement draft needs agreementId, jobId, sheet, and transcriptHash";
      }
      const added = looseList(agreement["addedTerms"]);
      const terms = looseList(agreement["terms"]);
      if (added === undefined || terms === undefined) {
        return "an agreement draft needs addedTerms and terms lists";
      }
      for (const definition of added) {
        const problem = checkDefinitionShape(definition);
        if (problem !== undefined) {
          return problem;
        }
      }
      return terms.every((term) => isLoose(term) && typeof term["termId"] === "string" && term["value"] !== undefined)
        ? undefined
        : "each agreed term needs termId and value";
    }
    default:
      return "unknown message type";
  }
}

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
      anchor: session.anchor,
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

export type TermDecodeResult =
  | { readonly ok: true; readonly message: TermMessage }
  | { readonly ok: false; readonly reason: string };

function looseText(value: Loose, key: string): string {
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function decodeDefinition(value: unknown): TermDefinition | undefined {
  if (!isLoose(value) || checkDefinitionShape(value) !== undefined) {
    return undefined;
  }
  const valueType = termValueTypes.find((known) => known === value["valueType"]);
  const version = value["version"];
  if (valueType === undefined || typeof version !== "number") {
    return undefined;
  }
  const base: TermDefinition = { termId: looseText(value, "termId"), version, valueType };
  const unit = value["unit"];
  const withUnit: TermDefinition = typeof unit === "string" ? { ...base, unit } : base;
  const codes = looseList(value["codes"]);
  const withCodes: TermDefinition =
    codes === undefined ? withUnit : { ...withUnit, codes: codes.filter((code): code is string => typeof code === "string") };
  const label = value["label"];
  if (!isLoose(label)) {
    return withCodes;
  }
  const names: { [language: string]: string } = {};
  for (const [language, text] of Object.entries(label)) {
    if (typeof text === "string") {
      names[language] = text;
    }
  }
  return { ...withCodes, label: names };
}

export const maxTermMessageDepth = 64;

type Snapshot = { readonly ok: true; readonly json: TermJson } | { readonly ok: false; readonly reason: string };

function snapshotJson(value: unknown, depth: number): Snapshot {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return { ok: true, json: value };
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? { ok: true, json: value } : { ok: false, reason: "numbers must be finite" };
  }
  if (typeof value !== "object") {
    return { ok: false, reason: "only JSON values are allowed" };
  }
  if (depth >= maxTermMessageDepth) {
    return { ok: false, reason: `nesting deeper than ${String(maxTermMessageDepth)} is refused` };
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return { ok: false, reason: "symbol keys are refused" };
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return { ok: false, reason: "only plain arrays are allowed" };
    }
    const items: unknown[] = value;
    const out: TermJson[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const slot = Object.getOwnPropertyDescriptor(items, index);
      if (slot === undefined || !("value" in slot)) {
        return { ok: false, reason: "arrays must not have holes or accessors" };
      }
      const child = snapshotJson(slot.value, depth + 1);
      if (!child.ok) {
        return child;
      }
      out.push(child.json);
    }
    return { ok: true, json: out };
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return { ok: false, reason: "only plain objects are allowed" };
  }
  const out: { [key: string]: TermJson } = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (key === "__proto__" || slot === undefined || !("value" in slot) || slot.enumerable !== true) {
      return { ok: false, reason: `field ${key} is not a plain data field` };
    }
    const child = snapshotJson(slot.value, depth + 1);
    if (!child.ok) {
      return child;
    }
    out[key] = child.json;
  }
  return { ok: true, json: out };
}

const envelopeFields = ["type", "from", "sentAt", "expiresAt", "prevHash", "signature"];
const messageFields: { readonly [type: string]: readonly string[] } = {
  TermPropose: ["termId", "value", "note"],
  TermCounter: ["termId", "value", "note"],
  TermAccept: ["termId", "valueHash", "value"],
  TermDrop: ["termId"],
  TermReopen: ["termId"],
  TermRefuse: ["termId"],
  TermAdd: ["definition", "required"],
  DealDecline: ["reason"],
  TermApproval: ["decision", "reopen", "agreementHash"],
  TermAgreementDraft: ["agreement"],
};

function onlyFields(value: TermJson | undefined, allowed: readonly string[]): boolean {
  return isObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function checkKnownFields(message: TermJson): string | undefined {
  if (!isObject(message) || typeof message["type"] !== "string") {
    return "a message must be an object with a type";
  }
  const extra = messageFields[message["type"]];
  if (extra === undefined) {
    return "unknown message type";
  }
  if (!onlyFields(message, [...envelopeFields, ...extra])) {
    return "the message has an unknown field";
  }
  if (!onlyFields(message["signature"], ["verification", "material"])) {
    return "the signature has an unknown field";
  }
  const definition = message["definition"];
  if (definition !== undefined && !onlyFields(definition, definitionKeys)) {
    return "the term definition has an unknown field";
  }
  const agreement = message["agreement"];
  if (agreement !== undefined) {
    if (!onlyFields(agreement, agreementKeys) || !isObject(agreement) || !onlyFields(agreement["sheet"], sheetRefKeys)) {
      return "the agreement has an unknown field";
    }
    const added = agreement["addedTerms"];
    const terms = agreement["terms"];
    if (isArray(added) && !added.every((entry) => onlyFields(entry, definitionKeys))) {
      return "an added term definition has an unknown field";
    }
    if (isArray(terms) && !terms.every((entry) => onlyFields(entry, fixedTermKeys))) {
      return "an agreed term has an unknown field";
    }
  }
  return undefined;
}

export function decodeTermMessage(input: unknown): TermDecodeResult {
  const snapshot = snapshotJson(input, 0);
  if (!snapshot.ok) {
    return { ok: false, reason: snapshot.reason };
  }
  const unknownField = checkKnownFields(snapshot.json);
  if (unknownField !== undefined) {
    return { ok: false, reason: unknownField };
  }
  const raw: unknown = snapshot.json;
  const problem = checkMessageShape(raw);
  if (problem !== undefined || !isLoose(raw)) {
    return { ok: false, reason: problem ?? "a message must be an object" };
  }
  const from: Party | undefined = raw["from"] === "client" ? "client" : raw["from"] === "worker" ? "worker" : undefined;
  const signature = raw["signature"];
  const format = isLoose(signature) ? signature["verification"] : undefined;
  const verification = format === signatureVerification ? signatureVerification : format === jwsSignatureFormat ? jwsSignatureFormat : undefined;
  if (from === undefined || !isLoose(signature) || verification === undefined) {
    return { ok: false, reason: "from or signature is not acceptable" };
  }
  const envelope: Envelope = {
    from,
    sentAt: looseText(raw, "sentAt"),
    expiresAt: looseText(raw, "expiresAt"),
    prevHash: looseText(raw, "prevHash"),
    signature: { verification, material: looseText(signature, "material") },
  };
  const termId = looseText(raw, "termId");
  const note = raw["note"];
  switch (raw["type"]) {
    case "TermPropose":
    case "TermCounter": {
      const message: TermProposeMessage = {
        ...envelope,
        type: raw["type"] === "TermPropose" ? "TermPropose" : "TermCounter",
        termId,
        value: jsonOf(raw["value"]),
      };
      return { ok: true, message: typeof note === "string" ? { ...message, note } : message };
    }
    case "TermAccept": {
      const message: TermAcceptMessage = { ...envelope, type: "TermAccept", termId, valueHash: looseText(raw, "valueHash") };
      return { ok: true, message: raw["value"] === undefined ? message : { ...message, value: jsonOf(raw["value"]) } };
    }
    case "TermDrop":
    case "TermReopen":
      return { ok: true, message: { ...envelope, type: raw["type"] === "TermDrop" ? "TermDrop" : "TermReopen", termId } };
    case "TermRefuse":
      return { ok: true, message: { ...envelope, type: "TermRefuse", termId } };
    case "TermAdd": {
      const definition = decodeDefinition(raw["definition"]);
      const required = raw["required"];
      if (definition === undefined || typeof required !== "boolean") {
        return { ok: false, reason: "TermAdd needs a definition and required" };
      }
      return { ok: true, message: { ...envelope, type: "TermAdd", definition, required } };
    }
    case "DealDecline":
      return { ok: true, message: { ...envelope, type: "DealDecline", reason: looseText(raw, "reason") } };
    case "TermApproval": {
      const decision = approvalDecisions.find((known) => known === raw["decision"]);
      if (decision === undefined) {
        return { ok: false, reason: "decision must be approve, reject, or revise" };
      }
      const reopen = looseList(raw["reopen"]);
      const agreementHash = raw["agreementHash"];
      const plain: TermApprovalMessage = { ...envelope, type: "TermApproval", decision };
      const base: TermApprovalMessage = typeof agreementHash === "string" ? { ...plain, agreementHash } : plain;
      return {
        ok: true,
        message: reopen === undefined ? base : { ...base, reopen: reopen.filter((item): item is string => typeof item === "string") },
      };
    }
    case "TermAgreementDraft": {
      const agreement = raw["agreement"];
      if (!isLoose(agreement) || !isLoose(agreement["sheet"])) {
        return { ok: false, reason: "an agreement draft needs an agreement" };
      }
      const sheet = agreement["sheet"];
      const version = sheet["version"];
      const added = (looseList(agreement["addedTerms"]) ?? []).map(decodeDefinition);
      const terms = looseList(agreement["terms"]) ?? [];
      if (typeof version !== "number" || added.some((definition) => definition === undefined)) {
        return { ok: false, reason: "an agreement draft has a bad sheet or added term" };
      }
      const decoded: TermAgreement = {
        agreementId: looseText(agreement, "agreementId"),
        jobId: looseText(agreement, "jobId"),
        sheet: { sheetId: looseText(sheet, "sheetId"), version, sha256: looseText(sheet, "sha256") },
        addedTerms: added.filter((definition): definition is TermDefinition => definition !== undefined),
        terms: terms.map((term) => ({ termId: isLoose(term) ? looseText(term, "termId") : "", value: isLoose(term) ? jsonOf(term["value"]) : null })),
        transcriptHash: looseText(agreement, "transcriptHash"),
      };
      return { ok: true, message: { ...envelope, type: "TermAgreementDraft", agreement: decoded } };
    }
    default:
      return { ok: false, reason: "unknown message type" };
  }
}
