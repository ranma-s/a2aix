import { describe, expect, it } from "vitest";
import type { RelayEventInput, StoredEvent, Tag } from "@ix/distribution";
import { createRelay } from "@ix/node";
import { createLocalRelay, createMemoryEventStore } from "../src/index.js";

function tag(name: string, value: string): Tag {
  return [name, value];
}

function posting(id: string, expiresAt = "2026-11-25T00:00:00Z"): RelayEventInput {
  return {
    id,
    issuer: "did:example:issuer",
    kind: id === "mystery" ? "Mystery/9" : "JobPosting/1",
    tags:
      id === "mystery"
        ? [tag("x-budget", "low")]
        : [
            tag("skill", id === "design" ? "esco:design" : "esco:copywriting"),
            tag("skill", "x-web:landing-page"),
            tag("region", id === "design" ? "remote" : "JP-13"),
            tag("lang", "ja"),
            tag("rule", "jp-freelance/1.0"),
          ],
    createdAt: id === "design" ? "2026-11-02T10:00:00+09:00" : "2026-11-01T10:00:00+09:00",
    expiresAt,
    body: { title: id },
    sig: "sig-placeholder",
  };
}

describe("local relay", () => {
  it("publishes to memory and finds events by tag, kind, and time", () => {
    let now = "2026-11-04T00:00:00Z";
    const relay = createLocalRelay({ mode: "open", clock: { now: () => now } });
    expect(relay.publish(posting("copy", "2026-11-10T00:00:00Z")).ok).toBe(true);
    expect(relay.publish(posting("design")).ok).toBe(true);
    expect(relay.publish(posting("mystery")).ok).toBe(true);
    const bySkill = relay.query({
      tags: [
        { name: "skill", values: ["esco:copywriting"] },
        { name: "lang", values: ["ja"] },
      ],
    });
    expect(ids(bySkill)).toEqual(["copy"]);
    const byRegion = relay.query({ tags: [{ name: "region", values: ["JP-13", "remote"] }] });
    expect(ids(byRegion)).toEqual(["design", "copy"]);
    expect(ids(relay.query({ kinds: ["Mystery/9"] }))).toEqual(["mystery"]);
    expect(ids(relay.query({ limit: 1 }))).toEqual(["design"]);
    expect(
      ids(
        relay.query({
          since: "2026-11-02T10:00:00+09:00",
          until: "2026-11-02T01:00:00Z",
        }),
      ),
    ).toEqual(["design"]);
    now = "2026-11-10T00:00:00Z";
    expect(ids(relay.query({}))).toEqual(["design", "mystery"]);
    expect(relay.publish(posting("late", "2026-11-10T00:00:00Z"))).toMatchObject({
      reason: "expired",
    });
  });

  it("notifies only future matches and keeps one copy of the same event", () => {
    const relay = createLocalRelay({
      mode: "open",
      clock: { now: () => "2026-11-04T00:00:00Z" },
    });
    const seen: string[] = [];
    expect(relay.publish(posting("copy")).ok).toBe(true);
    const subscription = relay.subscribe(
      { tags: [{ name: "rule", values: ["jp-freelance/1.0"] }] },
      (event) => {
        seen.push(event.id);
        expect(event.signatureVerification).toBe("deferred");
        expect(event.sig).toBe("sig-placeholder");
        expect(event.id).toBe("design");
      },
    );
    expect(subscription).toMatchObject({ ok: true, id: "sub-1" });
    expect(seen).toEqual([]);
    const again = relay.publish({ ...posting("copy"), body: { b: 1, a: 1 } });
    expect(again).toMatchObject({ ok: false, reason: "id_conflict" });
    const same = relay.publish({ ...posting("copy"), body: { title: "copy" } });
    expect(same).toMatchObject({ ok: true, duplicate: true });
    expect(seen).toEqual([]);
    expect(relay.publish(posting("design")).ok).toBe(true);
    expect(seen).toEqual(["design"]);
    if (subscription.ok) {
      subscription.close();
    }
    expect(relay.publish(posting("mystery")).ok).toBe(true);
    expect(seen).toEqual(["design"]);
  });

  it("gives the same event to two relays and lets a closed relay read but not publish", () => {
    const clock = { now: () => "2026-11-04T00:00:00Z" };
    const left = createLocalRelay({ mode: "open", clock });
    const right = createLocalRelay({ mode: "open", clock });
    expect(left.publish(posting("copy")).ok).toBe(true);
    expect(right.publish(posting("copy")).ok).toBe(true);
    expect(ids(left.query({ ids: ["copy"] }))).toEqual(["copy"]);
    expect(ids(right.query({ ids: ["copy"] }))).toEqual(["copy"]);
    const store = createMemoryEventStore();
    const open = createRelay({ mode: "open", store, clock });
    expect(open.publish(posting("copy")).ok).toBe(true);
    const closed = createRelay({ mode: "closed", store, clock });
    expect(closed.publish(posting("design"))).toMatchObject({
      reason: "public_publish_refused",
    });
    expect(ids(closed.query({}))).toEqual(["copy"]);
    expect(closed.acceptsPublicPublish).toBe(false);
  });
});

function ids(result: { readonly ok: boolean; readonly events?: readonly StoredEvent[] }): readonly string[] {
  if (!result.ok || result.events === undefined) {
    throw new Error("query failed");
  }
  return result.events.map((event) => event.id);
}
