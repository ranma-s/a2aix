import { isPlainToken } from "./token.js";
import { parseInstant } from "./time.js";

export const signatureVerification = "deferred" as const;

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject;

export type Tag = readonly [string, string];

export type RelayEventInput = {
  readonly id: string;
  readonly issuer: string;
  readonly kind: string;
  readonly tags: readonly Tag[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly body: JsonValue;
  readonly sig: string;
};

export type StoredEvent = {
  readonly id: string;
  readonly issuer: string;
  readonly kind: string;
  readonly tags: readonly Tag[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly body: JsonValue;
  readonly sig: string;
  readonly signatureVerification: typeof signatureVerification;
};

export type AcceptReason =
  | "empty_id"
  | "empty_issuer"
  | "empty_kind"
  | "empty_sig"
  | "bad_tags"
  | "bad_time"
  | "bad_body";

export type AcceptResult =
  | { readonly ok: true; readonly event: StoredEvent }
  | { readonly ok: false; readonly reason: AcceptReason; readonly detail: string };

export type PutResult =
  | { readonly status: "inserted"; readonly event: StoredEvent }
  | { readonly status: "duplicate"; readonly event: StoredEvent }
  | { readonly status: "conflict" };

export type EventStore = {
  readonly put: (event: StoredEvent) => PutResult;
  readonly deleteExpired: (now: string) => void;
  readonly list: () => readonly StoredEvent[];
};

export function acceptEvent(input: RelayEventInput): AcceptResult {
  if (!isPlainToken(input.id)) {
    return { ok: false, reason: "empty_id", detail: "id must be a non-empty token" };
  }
  if (!isPlainToken(input.issuer)) {
    return { ok: false, reason: "empty_issuer", detail: "issuer must be a non-empty token" };
  }
  if (!isPlainToken(input.kind)) {
    return { ok: false, reason: "empty_kind", detail: "kind must be a non-empty token" };
  }
  if (!isPlainToken(input.sig)) {
    return {
      ok: false,
      reason: "empty_sig",
      detail: "sig must be present and is not verified",
    };
  }
  const tags = copyAcceptedTags(input.tags);
  if (!tags.ok) {
    return { ok: false, reason: "bad_tags", detail: tags.detail };
  }
  const created = parseInstant(input.createdAt);
  const expires = parseInstant(input.expiresAt);
  if (created === undefined || expires === undefined) {
    return {
      ok: false,
      reason: "bad_time",
      detail: "createdAt and expiresAt must be ISO 8601",
    };
  }
  if (expires < created) {
    return { ok: false, reason: "bad_time", detail: "expiresAt is before createdAt" };
  }
  if (!jsonOk(input.body)) {
    return { ok: false, reason: "bad_body", detail: "body must be finite JSON" };
  }
  return {
    ok: true,
    event: {
      id: input.id,
      issuer: input.issuer,
      kind: input.kind,
      tags: tags.tags,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      body: copyJson(input.body),
      sig: input.sig,
      signatureVerification,
    },
  };
}

export function copyStoredEvent(event: StoredEvent): StoredEvent {
  return {
    id: event.id,
    issuer: event.issuer,
    kind: event.kind,
    tags: copyTags(event.tags),
    createdAt: event.createdAt,
    expiresAt: event.expiresAt,
    body: copyJson(event.body),
    sig: event.sig,
    signatureVerification: event.signatureVerification,
  };
}

export function sameStoredEvent(left: StoredEvent, right: StoredEvent): boolean {
  return (
    left.id === right.id &&
    left.issuer === right.issuer &&
    left.kind === right.kind &&
    left.createdAt === right.createdAt &&
    left.expiresAt === right.expiresAt &&
    left.sig === right.sig &&
    sameTags(left.tags, right.tags) &&
    sameJson(left.body, right.body)
  );
}

function copyAcceptedTags(
  tags: readonly Tag[],
): { readonly ok: true; readonly tags: readonly Tag[] } | { readonly ok: false; readonly detail: string } {
  const copy: Tag[] = [];
  for (const tag of tags) {
    const name = tag[0];
    const value = tag[1];
    if (!isPlainToken(name) || !isPlainToken(value)) {
      return { ok: false, detail: "tags must be non-empty name/value pairs" };
    }
    copy.push([name, value]);
  }
  return { ok: true, tags: copy };
}

function copyTags(tags: readonly Tag[]): readonly Tag[] {
  const copy: Tag[] = [];
  for (const tag of tags) {
    copy.push([tag[0], tag[1]]);
  }
  return copy;
}

function sameTags(left: readonly Tag[], right: readonly Tag[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftTag = left[index];
    const rightTag = right[index];
    if (
      leftTag === undefined ||
      rightTag === undefined ||
      leftTag[0] !== rightTag[0] ||
      leftTag[1] !== rightTag[1]
    ) {
      return false;
    }
  }
  return true;
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonOk(value: JsonValue): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (isJsonArray(value)) {
    for (const item of value) {
      if (!jsonOk(item)) {
        return false;
      }
    }
    return true;
  }
  if (!isJsonObject(value)) {
    return false;
  }
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (child === undefined || !jsonOk(child)) {
      return false;
    }
  }
  return true;
}

function copyJson(value: JsonValue): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (isJsonArray(value)) {
    const copy: JsonValue[] = [];
    for (const item of value) {
      copy.push(copyJson(item));
    }
    return copy;
  }
  if (!isJsonObject(value)) {
    throw new Error("body must be finite JSON");
  }
  const copy: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (child === undefined) {
      continue;
    }
    copy[key] = copyJson(child);
  }
  return copy;
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  if (typeof left === "string" || typeof left === "boolean" || typeof left === "number") {
    return left === right;
  }
  if (typeof right === "string" || typeof right === "boolean" || typeof right === "number") {
    return false;
  }
  if (isJsonArray(left) || isJsonArray(right)) {
    if (!isJsonArray(left) || !isJsonArray(right) || left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      const leftItem = left[index];
      const rightItem = right[index];
      if (leftItem === undefined || rightItem === undefined || !sameJson(leftItem, rightItem)) {
        return false;
      }
    }
    return true;
  }
  if (!isJsonObject(left) || !isJsonObject(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (let index = 0; index < leftKeys.length; index += 1) {
    const leftKey = leftKeys[index];
    const rightKey = rightKeys[index];
    if (leftKey === undefined || rightKey === undefined || leftKey !== rightKey) {
      return false;
    }
    const leftValue = left[leftKey];
    const rightValue = right[rightKey];
    if (leftValue === undefined || rightValue === undefined || !sameJson(leftValue, rightValue)) {
      return false;
    }
  }
  return true;
}
