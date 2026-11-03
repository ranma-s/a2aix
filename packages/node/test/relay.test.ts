import { describe, expect, it } from "vitest";
import {
  copyStoredEvent,
  isDue,
  sameStoredEvent,
} from "@ix/distribution";
import type { Clock, EventStore, RelayEventInput, StoredEvent, Tag } from "@ix/distribution";
import { createRelay } from "../src/index.js";

function tag(name: string, value: string): Tag {
  return [name, value];
}

function posting(id = "event-1"): RelayEventInput {
  return {
    id,
    issuer: "did:example:issuer",
    kind: "JobPosting/1",
    tags: [tag("skill", "esco:copywriting"), tag("lang", "ja")],
    createdAt: "2026-11-01T10:00:00Z",
    expiresAt: "2026-11-20T00:00:00Z",
    body: { title: id },
    sig: "sig-placeholder",
  };
}

function clockAt(now: string): Clock {
  return { now: () => now };
}

function recordingStore(): { readonly store: EventStore; readonly putCount: () => number } {
  const events: StoredEvent[] = [];
  let puts = 0;
  return {
    putCount: () => puts,
    store: {
      put(event) {
        puts += 1;
        for (const existing of events) {
          if (existing.id !== event.id) {
            continue;
          }
          if (sameStoredEvent(existing, event)) {
            return { status: "duplicate", event: copyStoredEvent(existing) };
          }
          return { status: "conflict" };
        }
        const stored = copyStoredEvent(event);
        events.push(stored);
        return { status: "inserted", event: copyStoredEvent(stored) };
      },
      deleteExpired(now) {
        const kept: StoredEvent[] = [];
        for (const event of events) {
          if (!isDue(event.expiresAt, now)) {
            kept.push(event);
          }
        }
        events.length = 0;
        for (const event of kept) {
          events.push(event);
        }
      },
      list() {
        return events.map((event) => copyStoredEvent(event));
      },
    },
  };
}

describe("node relay", () => {
  it("refuses public publish on a closed node without writing", () => {
    const recorded = recordingStore();
    const relay = createRelay({
      mode: "closed",
      store: recorded.store,
      clock: clockAt("not-a-time"),
    });
    expect(relay.acceptsPublicPublish).toBe(false);
    expect(relay.publish(posting())).toEqual({
      ok: false,
      reason: "public_publish_refused",
      detail: "A closed node does not accept public publish.",
    });
    expect(recorded.putCount()).toBe(0);
  });

  it("rejects a bad event and a bad clock before writing", () => {
    const recorded = recordingStore();
    const relay = createRelay({
      mode: "open",
      store: recorded.store,
      clock: clockAt("2026-11-04T00:00:00Z"),
    });
    expect(relay.publish({ ...posting(), id: "" })).toMatchObject({ reason: "empty_id" });
    expect(recorded.putCount()).toBe(0);
    const broken = createRelay({
      mode: "open",
      store: recorded.store,
      clock: clockAt("yesterday"),
    });
    expect(() => broken.publish(posting())).toThrow(/ISO 8601/);
    expect(recorded.putCount()).toBe(0);
    expect(() => createRelay({ mode: "internal", store: recorded.store, clock: clockAt("2026-11-04T00:00:00Z") })).toThrow(
      /open/,
    );
  });

  it("publishes, queries by tag, and does not notify a duplicate or a closed subscription", () => {
    const recorded = recordingStore();
    const relay = createRelay({
      mode: "open",
      store: recorded.store,
      clock: clockAt("2026-11-04T00:00:00Z"),
    });
    const seen: string[] = [];
    const values = ["esco:copywriting"];
    const subscription = relay.subscribe({ tags: [{ name: "skill", values }] }, (event) => {
      seen.push(event.id);
    });
    expect(subscription.ok).toBe(true);
    if (!subscription.ok) {
      return;
    }
    values[0] = "esco:design";
    const published = relay.publish(posting());
    expect(published.ok).toBe(true);
    if (!published.ok) {
      return;
    }
    expect(published.duplicate).toBe(false);
    expect(published.event.signatureVerification).toBe("deferred");
    expect(published.event.sig).toBe("sig-placeholder");
    expect(seen).toEqual(["event-1"]);
    const again = relay.publish(posting());
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(seen).toEqual(["event-1"]);
    const conflict = relay.publish({ ...posting(), body: { title: "changed" } });
    expect(conflict).toMatchObject({ ok: false, reason: "id_conflict" });
    const found = relay.query({ tags: [{ name: "lang", values: ["ja"] }] });
    expect(found.ok).toBe(true);
    if (!found.ok) {
      return;
    }
    expect(found.events.map((event) => event.body)).toEqual([{ title: "event-1" }]);
    subscription.close();
    subscription.close();
    expect(relay.publish(posting("event-2")).ok).toBe(true);
    expect(seen).toEqual(["event-1"]);
    const missed = relay.subscribe({ tags: [{ name: "skill", values: ["missing"] }] }, (event) => {
      seen.push(event.id);
    });
    expect(missed.ok).toBe(true);
    expect(relay.publish(posting("event-3")).ok).toBe(true);
    expect(seen).toEqual(["event-1"]);
  });

  it("discards an event that is already expired and rejects a bad query", () => {
    const recorded = recordingStore();
    const relay = createRelay({
      mode: "open",
      store: recorded.store,
      clock: clockAt("2026-11-20T00:00:00Z"),
    });
    expect(relay.publish(posting())).toMatchObject({ reason: "expired" });
    expect(recorded.putCount()).toBe(0);
    expect(relay.query({ since: "nope" })).toMatchObject({ reason: "bad_filter" });
    expect(relay.subscribe({ limit: 1 }, () => undefined)).toMatchObject({
      detail: "subscribe does not take limit",
    });
  });
});
