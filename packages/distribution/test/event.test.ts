import { describe, expect, it } from "vitest";
import { acceptEvent, sameStoredEvent, signatureVerification } from "../src/index.js";
import type { JsonValue, RelayEventInput, StoredEvent, Tag } from "../src/index.js";

function tag(name: string, value: string): Tag {
  return [name, value];
}

function base(): RelayEventInput {
  return {
    id: "not-a-hash",
    issuer: "did:example:issuer",
    kind: "JobPosting/1",
    tags: [tag("skill", "esco:copywriting"), tag("region", "JP-13")],
    createdAt: "2026-11-01T10:00:00+09:00",
    expiresAt: "2026-11-20T09:00:00+09:00",
    body: {
      title: "copy",
      budget: { amount: 1, currency: "JPY", taxIncluded: false },
    },
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

describe("relay event", () => {
  it("stores the caller id and sig and marks verification deferred", () => {
    const accepted = acceptEvent(base());
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }
    expect(accepted.event.id).toBe("not-a-hash");
    expect(accepted.event.sig).toBe("sig-placeholder");
    expect(accepted.event.signatureVerification).toBe(signatureVerification);
    expect(accepted.event.signatureVerification).toBe("deferred");
    expect(accepted.event.kind).toBe("JobPosting/1");
  });

  it("accepts an unknown kind and a non-object body", () => {
    const accepted = acceptEvent({
      ...base(),
      kind: "Mystery/9",
      tags: [tag("x-budget", "low")],
      body: "opaque",
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }
    expect(accepted.event.kind).toBe("Mystery/9");
    expect(accepted.event.body).toBe("opaque");
  });

  it("copies the body so a later edit does not change the stored event", () => {
    const body: { [key: string]: JsonValue } = { title: "one" };
    const accepted = acceptEvent({ ...base(), body });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }
    body["title"] = "two";
    expect(accepted.event.body).toEqual({ title: "one" });
  });

  it("treats object key order as the same event and tag order as different", () => {
    const left = stored({ ...base(), body: { a: 1, b: true } });
    const right = stored({ ...base(), body: { b: true, a: 1 } });
    expect(sameStoredEvent(left, right)).toBe(true);
    const forward = stored({ ...base(), tags: [tag("lang", "ja"), tag("skill", "esco:copywriting")] });
    const backward = stored({
      ...base(),
      tags: [tag("skill", "esco:copywriting"), tag("lang", "ja")],
    });
    expect(sameStoredEvent(forward, backward)).toBe(false);
    expect(sameStoredEvent(left, stored({ ...base(), body: { a: 1, b: true }, sig: "other" }))).toBe(
      false,
    );
  });

  it("rejects blank tokens, inverted times, and non-finite numbers", () => {
    expect(acceptEvent({ ...base(), id: "  " }).ok).toBe(false);
    expect(acceptEvent({ ...base(), issuer: "" })).toMatchObject({ reason: "empty_issuer" });
    expect(acceptEvent({ ...base(), kind: "" })).toMatchObject({ reason: "empty_kind" });
    expect(acceptEvent({ ...base(), sig: "" })).toMatchObject({ reason: "empty_sig" });
    expect(acceptEvent({ ...base(), tags: [tag("skill", " ")] })).toMatchObject({
      reason: "bad_tags",
    });
    expect(acceptEvent({ ...base(), createdAt: "2026-11-01" })).toMatchObject({
      reason: "bad_time",
    });
    expect(
      acceptEvent({
        ...base(),
        createdAt: "2026-11-20T09:00:00+09:00",
        expiresAt: "2026-11-01T10:00:00+09:00",
      }),
    ).toMatchObject({ reason: "bad_time" });
    expect(acceptEvent({ ...base(), body: { amount: Number.NaN } })).toMatchObject({
      reason: "bad_body",
    });
    expect(acceptEvent({ ...base(), body: [1, null, false] }).ok).toBe(true);
  });
});
