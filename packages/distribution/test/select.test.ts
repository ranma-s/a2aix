import { describe, expect, it } from "vitest";
import { acceptEvent, selectEvents, validateFilter } from "../src/index.js";
import type { RelayEventInput, StoredEvent, Tag } from "../src/index.js";

const now = "2026-11-04T00:00:00Z";

function tag(name: string, value: string): Tag {
  return [name, value];
}

function posting(id: string, createdAt: string, tags: readonly Tag[]): RelayEventInput {
  return {
    id,
    issuer: id === "other-issuer" ? "did:example:other" : "did:example:issuer",
    kind: id === "mystery" ? "Mystery/9" : "JobPosting/1",
    tags,
    createdAt,
    expiresAt: "2026-11-20T00:00:00Z",
    body: { title: id },
    sig: "sig-placeholder",
  };
}

function stored(input: RelayEventInput): StoredEvent {
  const accepted = acceptEvent(input);
  if (!accepted.ok) {
    throw new Error(accepted.detail);
  }
  return accepted.event;
}

const copywriting = stored(
  posting("copy", "2026-11-01T10:00:00+09:00", [
    tag("skill", "esco:copywriting"),
    tag("region", "JP-13"),
    tag("lang", "ja"),
  ]),
);
const remoteDesign = stored(
  posting("design", "2026-11-02T10:00:00+09:00", [
    tag("skill", "esco:design"),
    tag("region", "remote"),
    tag("lang", "ja"),
  ]),
);
const mystery = stored(posting("mystery", "2026-11-03T10:00:00Z", [tag("x-budget", "low")]));

describe("event selection", () => {
  it("matches every tag name and any value inside one name", () => {
    const events = [copywriting, remoteDesign, mystery];
    expect(ids(selectEvents(events, { tags: [skill("esco:copywriting")] }, now))).toEqual(["copy"]);
    expect(
      ids(
        selectEvents(events, { tags: [{ name: "region", values: ["JP-13", "remote"] }] }, now),
      ),
    ).toEqual(["design", "copy"]);
    expect(
      ids(
        selectEvents(
          events,
          {
            tags: [skill("esco:copywriting"), { name: "region", values: ["JP-13"] }],
          },
          now,
        ),
      ),
    ).toEqual(["copy"]);
    expect(ids(selectEvents(events, { kinds: ["Mystery/9"] }, now))).toEqual(["mystery"]);
    expect(ids(selectEvents(events, {}, now))).toEqual(["mystery", "design", "copy"]);
  });

  it("applies id, issuer, inclusive time windows, limit, and expiry", () => {
    const events = [copywriting, remoteDesign];
    expect(ids(selectEvents(events, { ids: ["copy"] }, now))).toEqual(["copy"]);
    expect(ids(selectEvents(events, { ids: [] }, now))).toEqual([]);
    expect(ids(selectEvents(events, { issuers: ["did:example:issuer"] }, now))).toEqual([
      "design",
      "copy",
    ]);
    expect(
      ids(
        selectEvents(
          events,
          { since: "2026-11-01T10:00:00+09:00", until: "2026-11-01T01:00:00Z" },
          now,
        ),
      ),
    ).toEqual(["copy"]);
    expect(
      ids(selectEvents(events, { since: "2026-11-01T01:00:01Z" }, now)),
    ).toEqual(["design"]);
    expect(ids(selectEvents(events, { limit: 1 }, now))).toEqual(["design"]);
    expect(selectEvents(events, { limit: 0 }, now)).toEqual([]);
    expect(selectEvents(events, {}, "2026-11-20T00:00:00Z")).toEqual([]);
  });

  it("orders equal instants by id and keeps an event one millisecond before expiry", () => {
    const first = stored(posting("b", "2026-11-02T01:00:00Z", [tag("lang", "ja")]));
    const second = stored(posting("a", "2026-11-02T10:00:00+09:00", [tag("lang", "ja")]));
    expect(ids(selectEvents([first, second], {}, now))).toEqual(["a", "b"]);
    const expiring = stored({
      ...posting("soon", "2026-11-01T00:00:00Z", [tag("lang", "ja")]),
      expiresAt: "2026-11-05T00:00:00.000Z",
    });
    expect(ids(selectEvents([expiring], {}, "2026-11-04T23:59:59.999Z"))).toEqual(["soon"]);
    expect(selectEvents([expiring], {}, "2026-11-05T00:00:00.000Z")).toEqual([]);
  });

  it("rejects a filter that cannot be applied", () => {
    expect(validateFilter({ since: "Tuesday" }, "query")).toMatchObject({ reason: "bad_filter" });
    expect(
      validateFilter(
        { since: "2026-11-05T00:00:00Z", until: "2026-11-01T00:00:00Z" },
        "query",
      ),
    ).toMatchObject({ detail: "since is after until" });
    expect(validateFilter({ limit: -1 }, "query")).toMatchObject({ reason: "bad_filter" });
    expect(validateFilter({ limit: 1.5 }, "query")).toMatchObject({ reason: "bad_filter" });
    expect(validateFilter({ ids: [" "] }, "query")).toMatchObject({ reason: "bad_filter" });
    expect(validateFilter({ tags: [{ name: "", values: ["ja"] }] }, "query")).toMatchObject({
      reason: "bad_filter",
    });
    expect(validateFilter({ limit: 1 }, "subscribe")).toMatchObject({
      detail: "subscribe does not take limit",
    });
    expect(validateFilter({ limit: 0 }, "query")).toEqual({ ok: true });
  });
});

function skill(value: string): { readonly name: string; readonly values: readonly string[] } {
  return { name: "skill", values: [value] };
}

function ids(events: readonly StoredEvent[]): readonly string[] {
  return events.map((event) => event.id);
}
