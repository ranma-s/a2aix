import { describe, expect, it } from "vitest";
import { acceptEvent } from "@ix/distribution";
import type { JsonObject, JsonValue, RelayEventInput, StoredEvent } from "@ix/distribution";
import { createMemoryEventStore } from "../src/index.js";

function posting(body: JsonValue): RelayEventInput {
  return {
    id: "event-1",
    issuer: "did:example:issuer",
    kind: "JobPosting/1",
    tags: [["skill", "esco:copywriting"]],
    createdAt: "2026-11-01T00:00:00Z",
    expiresAt: "2026-11-20T00:00:00Z",
    body,
    sig: "sig-placeholder",
  };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stored(input: RelayEventInput): StoredEvent {
  const accepted = acceptEvent(input);
  if (!accepted.ok) {
    throw new Error(accepted.detail);
  }
  return accepted.event;
}

describe("memory event store", () => {
  it("keeps its own copy, reports duplicates, and rejects a different payload", () => {
    const store = createMemoryEventStore();
    const body: { [key: string]: JsonValue } = { title: "one" };
    const inserted = store.put(stored(posting(body)));
    expect(inserted.status).toBe("inserted");
    body["title"] = "two";
    const listed = store.list();
    const first = listed[0];
    expect(first).toEqual(expect.objectContaining({ id: "event-1" }));
    if (first === undefined || !isJsonObject(first.body)) {
      throw new Error("stored body was not an object");
    }
    expect(first.body["title"]).toBe("one");
    const duplicate = store.put(stored(posting({ title: "one" })));
    expect(duplicate.status).toBe("duplicate");
    const conflict = store.put(stored(posting({ title: "other" })));
    expect(conflict.status).toBe("conflict");
    const reordered = store.put(stored({ ...posting({ a: 1, b: 2 }), id: "event-2" }));
    expect(reordered.status).toBe("inserted");
    const sameOrder = store.put(stored({ ...posting({ b: 2, a: 1 }), id: "event-2" }));
    expect(sameOrder.status).toBe("duplicate");
    expect(store.list()).toHaveLength(2);
  });

  it("drops expired events and leaves them in place when the clock is unreadable", () => {
    const store = createMemoryEventStore();
    store.put(stored(posting({ title: "one" })));
    store.deleteExpired("2026-11-20T00:00:00Z");
    expect(store.list()).toEqual([]);
    store.put(
      stored({
        ...posting({ title: "later" }),
        id: "event-2",
        expiresAt: "2026-11-25T00:00:00Z",
      }),
    );
    expect(() => {
      store.deleteExpired("yesterday");
    }).toThrow(/ISO 8601/);
    expect(store.list().map((event) => event.id)).toEqual(["event-2"]);
  });
});
