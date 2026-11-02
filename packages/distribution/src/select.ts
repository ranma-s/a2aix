import { isDue, parseInstant, readInstant } from "./time.js";
import { isPlainToken } from "./token.js";
import type { StoredEvent, Tag } from "./event.js";

export type TagConstraint = {
  readonly name: string;
  readonly values: readonly string[];
};

export type EventFilter = {
  readonly ids?: readonly string[];
  readonly issuers?: readonly string[];
  readonly kinds?: readonly string[];
  readonly tags?: readonly TagConstraint[];
  readonly since?: string;
  readonly until?: string;
  readonly limit?: number;
};

export type FilterUse = "query" | "subscribe";

export type FilterCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "bad_filter"; readonly detail: string };

export function validateFilter(filter: EventFilter, use: FilterUse): FilterCheck {
  const ids = checkTokens(filter.ids, "ids");
  if (!ids.ok) {
    return ids;
  }
  const issuers = checkTokens(filter.issuers, "issuers");
  if (!issuers.ok) {
    return issuers;
  }
  const kinds = checkTokens(filter.kinds, "kinds");
  if (!kinds.ok) {
    return kinds;
  }
  const tags = checkTags(filter.tags);
  if (!tags.ok) {
    return tags;
  }
  if (use === "subscribe" && filter.limit !== undefined) {
    return { ok: false, reason: "bad_filter", detail: "subscribe does not take limit" };
  }
  if (
    filter.limit !== undefined &&
    (!Number.isSafeInteger(filter.limit) || filter.limit < 0)
  ) {
    return {
      ok: false,
      reason: "bad_filter",
      detail: "limit must be a non-negative integer",
    };
  }
  const since = readFilterInstant(filter.since, "since");
  if (!since.ok) {
    return since;
  }
  const until = readFilterInstant(filter.until, "until");
  if (!until.ok) {
    return until;
  }
  if (since.ms !== undefined && until.ms !== undefined && since.ms > until.ms) {
    return { ok: false, reason: "bad_filter", detail: "since is after until" };
  }
  return { ok: true };
}

export function eventMatches(event: StoredEvent, filter: EventFilter): boolean {
  if (!allows(event.id, filter.ids)) {
    return false;
  }
  if (!allows(event.issuer, filter.issuers)) {
    return false;
  }
  if (!allows(event.kind, filter.kinds)) {
    return false;
  }
  if (!allowsTags(event, filter.tags)) {
    return false;
  }
  return inWindow(event, filter);
}

export function selectEvents(
  events: readonly StoredEvent[],
  filter: EventFilter,
  now: string,
): readonly StoredEvent[] {
  const matched: StoredEvent[] = [];
  for (const event of events) {
    if (isDue(event.expiresAt, now)) {
      continue;
    }
    if (eventMatches(event, filter)) {
      matched.push(event);
    }
  }
  matched.sort(byNewest);
  const limit = filter.limit;
  if (limit !== undefined && matched.length > limit) {
    return matched.slice(0, limit);
  }
  return matched;
}

function checkTokens(values: readonly string[] | undefined, label: string): FilterCheck {
  if (values === undefined) {
    return { ok: true };
  }
  for (const value of values) {
    if (!isPlainToken(value)) {
      return {
        ok: false,
        reason: "bad_filter",
        detail: `${label} must be non-empty tokens`,
      };
    }
  }
  return { ok: true };
}

function checkTags(tags: readonly TagConstraint[] | undefined): FilterCheck {
  if (tags === undefined) {
    return { ok: true };
  }
  for (const tag of tags) {
    if (!isPlainToken(tag.name)) {
      return {
        ok: false,
        reason: "bad_filter",
        detail: "tag name must be a non-empty token",
      };
    }
    const values = checkTokens(tag.values, "tag value");
    if (!values.ok) {
      return values;
    }
  }
  return { ok: true };
}

function readFilterInstant(
  value: string | undefined,
  label: string,
): { readonly ok: true; readonly ms: number | undefined } | { readonly ok: false; readonly reason: "bad_filter"; readonly detail: string } {
  if (value === undefined) {
    return { ok: true, ms: undefined };
  }
  const ms = parseInstant(value);
  if (ms === undefined) {
    return {
      ok: false,
      reason: "bad_filter",
      detail: `${label} must be ISO 8601`,
    };
  }
  return { ok: true, ms };
}

function allows(value: string, allowed: readonly string[] | undefined): boolean {
  if (allowed === undefined) {
    return true;
  }
  for (const item of allowed) {
    if (item === value) {
      return true;
    }
  }
  return false;
}

function allowsTags(event: StoredEvent, tags: readonly TagConstraint[] | undefined): boolean {
  if (tags === undefined) {
    return true;
  }
  for (const constraint of tags) {
    if (!hasTag(event.tags, constraint)) {
      return false;
    }
  }
  return true;
}

function hasTag(tags: readonly Tag[], constraint: TagConstraint): boolean {
  if (constraint.values.length === 0) {
    return false;
  }
  for (const tag of tags) {
    if (tag[0] !== constraint.name) {
      continue;
    }
    for (const value of constraint.values) {
      if (tag[1] === value) {
        return true;
      }
    }
  }
  return false;
}

function inWindow(event: StoredEvent, filter: EventFilter): boolean {
  const created = readInstant(event.createdAt);
  if (filter.since !== undefined && created < readInstant(filter.since)) {
    return false;
  }
  if (filter.until !== undefined && created > readInstant(filter.until)) {
    return false;
  }
  return true;
}

function byNewest(left: StoredEvent, right: StoredEvent): number {
  const delta = readInstant(right.createdAt) - readInstant(left.createdAt);
  if (delta !== 0) {
    return delta;
  }
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}
