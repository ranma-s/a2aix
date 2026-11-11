import { describe, expect, it } from "vitest";
import { signatureVerification, valueHashVerification, webSiteSheet } from "@ix/a2a-ext-negotiation";
import type { Party, TermJson, TermMessage } from "@ix/a2a-ext-negotiation";
import { runTermTrial } from "../src/index.js";
import type { TermDecider, TermMandate, TermTrialInput } from "../src/index.js";

const clock = { now: () => "2026-11-03T00:00:00.000Z" };
const sha = (digit: string): string => digit.repeat(64);

const spec: TermJson = {
  manifestSha256: sha("9"),
  files: [
    { path: "requirements.pdf", sha256: sha("1"), bytes: 182344, mediaType: "application/pdf" },
    { path: "sitemap.png", sha256: sha("2"), bytes: 52011, mediaType: "image/png" },
  ],
};

const clientMandate: TermMandate = {
  "ix:price": { kind: "money-max", currency: "JPY", taxIncluded: true, ask: 150000, max: 180000 },
  "ix:deadline": { kind: "deadline-by", zone: "Asia/Tokyo", ask: "2026-12-10T18:00:00+09:00", latest: "2026-12-20T18:00:00+09:00" },
  "ix:revision-limit": { kind: "integer-range", ask: 3, min: 1, max: 3 },
  "ix:acceptance-window": { kind: "one-of", values: [{ value: 7, unit: "day" }] },
  "ix:deliverables": { kind: "one-of", values: [[{ code: "web-page", n: 5 }]] },
  "ix:deliverable-format": { kind: "one-of", values: [["text/html"]] },
  "web:page-count": { kind: "integer-range", ask: 5, min: 5, max: 5 },
  "web:responsive": { kind: "one-of", values: [true] },
  "ix:initial-spec": { kind: "one-of", values: [spec] },
};

const workerMandate: TermMandate = {
  "ix:price": { kind: "money-min", currency: "JPY", taxIncluded: true, ask: 200000, min: 170000 },
  "ix:deadline": { kind: "deadline-from", zone: "America/Los_Angeles", ask: "2026-12-25T17:00:00-08:00", earliest: "2026-12-15T01:00:00-08:00" },
  "ix:revision-limit": { kind: "integer-range", ask: 1, min: 1, max: 2 },
  "ix:acceptance-window": { kind: "one-of", values: [{ value: 7, unit: "day" }, { value: 5, unit: "day" }] },
  "ix:deliverables": { kind: "one-of", values: [[{ code: "web-page", n: 5 }]] },
  "ix:deliverable-format": { kind: "one-of", values: [["text/html"]] },
  "web:page-count": { kind: "integer-range", ask: 5, min: 3, max: 8 },
  "web:responsive": { kind: "one-of", values: [true] },
  "ix:initial-spec": { kind: "documents-held", files: { "requirements.pdf": sha("1"), "sitemap.png": sha("2") } },
};

function trial(overrides: Partial<TermTrialInput> = {}): TermTrialInput {
  return {
    jobId: "job-web-1",
    sheet: webSiteSheet,
    sheetSha256: sha("a"),
    preset: [{ termId: "web:responsive", value: true }],
    roundLimitPerTerm: 3,
    client: { party: "client", mandate: clientMandate, human: "approve" },
    worker: { party: "worker", mandate: workerMandate, human: "approve" },
    clock,
    maxTurns: 200,
    ...overrides,
  };
}

function fixedValue(result: ReturnType<typeof runTermTrial>, termId: string): TermJson | undefined {
  return result.session.draft?.terms.find((term) => term.termId === termId)?.value;
}

function priceAmount(value: TermJson | undefined): number {
  if (typeof value !== "object" || value === null || isList(value)) {
    return 0;
  }
  const amount = value["amount"];
  return typeof amount === "number" ? amount : 0;
}

function isList(value: TermJson): value is readonly TermJson[] {
  return Array.isArray(value);
}

describe("mock agents negotiating term by term", () => {
  it("fixes every required term inside both mandates and agrees with both humans", () => {
    const result = runTermTrial(trial());
    expect(result.refused).toEqual([]);
    expect(result.escalations).toEqual([]);
    expect(result.session.phase).toBe("agreed");
    const price = fixedValue(result, "ix:price");
    expect(price).toMatchObject({ currency: "JPY", taxIncluded: true });
    const amount = priceAmount(price);
    expect(amount).toBeGreaterThanOrEqual(170000);
    expect(amount).toBeLessThanOrEqual(180000);
    expect(fixedValue(result, "ix:deadline")).toEqual({ at: "2026-12-15T01:00:00-08:00", zone: "America/Los_Angeles" });
    expect(fixedValue(result, "ix:initial-spec")).toEqual(spec);
    expect(result.transcript.some((message) => message.type === "TermCounter")).toBe(true);
  });

  it("escalates to the human when the received spec files do not match the manifest", () => {
    const result = runTermTrial(
      trial({
        worker: {
          party: "worker",
          mandate: { ...workerMandate, "ix:initial-spec": { kind: "documents-held", files: { "requirements.pdf": sha("3"), "sitemap.png": sha("2") } } },
          human: "approve",
        },
      }),
    );
    expect(result.escalations).toEqual([{ party: "worker", termId: "ix:initial-spec", reason: "documents_mismatch" }]);
    expect(result.session.phase).toBe("negotiating");
  });

  it("ends without a deal when the price ranges never meet", () => {
    const result = runTermTrial(
      trial({
        worker: {
          party: "worker",
          mandate: { ...workerMandate, "ix:price": { kind: "money-min", currency: "JPY", taxIncluded: true, ask: 300000, min: 250000 } },
          human: "approve",
        },
      }),
    );
    expect(result.session.phase).toBe("no_deal");
    expect(result.session.reason).toBe("round_limit");
  });

  it("stops at no_deal when a human rejects the agreement", () => {
    const result = runTermTrial(trial({ client: { party: "client", mandate: clientMandate, human: "reject" } }));
    expect(result.session.phase).toBe("no_deal");
    expect(result.session.reason).toBe("rejected");
  });

  it("refuses to start with a mandate whose opening ask is outside its own range", () => {
    expect(() =>
      runTermTrial(
        trial({
          client: {
            party: "client",
            mandate: { ...clientMandate, "ix:deadline": { kind: "deadline-by", zone: "Asia/Tokyo", ask: "2027-06-01T18:00:00+09:00", latest: "2026-12-20T18:00:00+09:00" } },
            human: "approve",
          },
        }),
      ),
    ).toThrow(/ix:deadline/);
    expect(() =>
      runTermTrial(
        trial({
          worker: {
            party: "worker",
            mandate: { ...workerMandate, "ix:revision-limit": { kind: "integer-range", ask: 9, min: 0, max: 3 } },
            human: "approve",
          },
        }),
      ),
    ).toThrow(/ix:revision-limit/);
  });

  it("never fixes a value outside either side's mandate", () => {
    const result = runTermTrial(trial());
    const deadline = fixedValue(result, "ix:deadline");
    const at = typeof deadline === "object" && deadline !== null && !isList(deadline) ? deadline["at"] : undefined;
    const instant = typeof at === "string" ? Date.parse(at) : Number.NaN;
    expect(instant >= Date.parse("2026-12-15T09:00:00Z") && instant <= Date.parse("2026-12-20T18:00:00+09:00")).toBe(true);
    const revisions = fixedValue(result, "ix:revision-limit");
    expect(typeof revisions === "number" && revisions >= 1 && revisions <= 2).toBe(true);
  });

  it("refuses date limits that are not real dates", () => {
    for (const latest of ["9999-99-99T00:00:00Z", "zzz", "", "2026-12-20"]) {
      expect(() =>
        runTermTrial(trial({ client: { party: "client", mandate: { ...clientMandate, "ix:deadline": { kind: "deadline-by", zone: "Asia/Tokyo", ask: "2026-12-01T18:00:00+09:00", latest } }, human: "approve" } })),
      ).toThrow(/ix:deadline/);
    }
    for (const zone of ["Mars/Olympus", "+09:00", ""]) {
      expect(() =>
        runTermTrial(trial({ worker: { party: "worker", mandate: { ...workerMandate, "ix:deadline": { kind: "deadline-from", zone, ask: "2026-12-31T18:00:00+09:00", earliest: "2026-12-15T00:00:00Z" } }, human: "approve" } })),
      ).toThrow(/ix:deadline/);
    }
  });

  it("refuses mandate limits whose offset does not match the agent's zone", () => {
    for (const latest of ["2026-12-20T18:00:00-05:00", "2026-12-20T09:00:00Z", "2026-12-20T18:00:00-00:00"]) {
      expect(() =>
        runTermTrial(trial({ client: { party: "client", mandate: { ...clientMandate, "ix:deadline": { kind: "deadline-by", zone: "Asia/Tokyo", ask: "2026-12-10T18:00:00+09:00", latest } }, human: "approve" } })),
      ).toThrow(/ix:deadline/);
    }
    expect(() =>
      runTermTrial(trial({ worker: { party: "worker", mandate: { ...workerMandate, "ix:deadline": { kind: "deadline-from", zone: "America/Los_Angeles", ask: "2026-12-25T17:00:00-08:00", earliest: "2026-12-15T09:00:00Z" } }, human: "approve" } })),
    ).toThrow(/ix:deadline/);
  });

  describe("a caller-supplied decision hook", () => {
    const yen = (amount: number): TermJson => ({ amount, currency: "JPY", taxIncluded: true });
    const envelope = (from: Party) => ({
      from,
      sentAt: "2026-11-03T00:00:00.000Z",
      expiresAt: "2026-11-04T00:00:00.000Z",
      prevHash: "unverified",
      signature: { verification: signatureVerification, material: "unverified" },
    });
    const propose = (from: Party, amount: number): TermMessage => ({ ...envelope(from), type: "TermPropose", termId: "ix:price", value: yen(amount) });
    const once = (message: TermMessage): TermDecider => {
      let used = false;
      return () => {
        if (used) {
          return undefined;
        }
        used = true;
        return { message };
      };
    };
    const withDecide = (decide: TermDecider, mandate: TermMandate = workerMandate): TermTrialInput =>
      trial({ worker: { party: "worker", mandate, human: "approve", decide } });

    it("sends a move that is inside the mandate", () => {
      const result = runTermTrial(withDecide(once(propose("worker", 200000))));
      expect(result.escalations).toEqual([]);
      const first = result.transcript[0];
      expect(first?.type).toBe("TermPropose");
      expect(first?.from).toBe("worker");
    });

    it("turns a proposal outside the mandate into an escalation and sends nothing", () => {
      const result = runTermTrial(withDecide(once(propose("worker", 100000))));
      expect(result.escalations).toEqual([{ party: "worker", termId: "ix:price", reason: "outside_mandate" }]);
      expect(result.transcript).toEqual([]);
    });

    it("refuses a term the mandate does not cover", () => {
      const withoutPrice: TermMandate = Object.fromEntries(Object.entries(workerMandate).filter(([termId]) => termId !== "ix:price"));
      const result = runTermTrial(withDecide(once(propose("worker", 200000)), withoutPrice));
      expect(result.escalations).toEqual([{ party: "worker", termId: "ix:price", reason: "not_in_mandate" }]);
    });

    it("refuses a move sent in the other party's name", () => {
      const result = runTermTrial(withDecide(once(propose("client", 200000))));
      expect(result.escalations).toEqual([{ party: "worker", termId: "", reason: "wrong_party" }]);
      expect(result.transcript).toEqual([]);
    });

    it("does not let the hook accept a value outside the mandate", () => {
      const accept: TermDecider = (session) => {
        const price = session.terms.find((term) => term.definition.termId === "ix:price");
        return price?.status === "proposed" ? { message: { ...envelope("worker"), type: "TermAccept", termId: "ix:price", valueHash: valueHashVerification } } : undefined;
      };
      const result = runTermTrial(withDecide(accept));
      expect(result.escalations).toEqual([{ party: "worker", termId: "ix:price", reason: "outside_mandate" }]);
      expect(result.session.phase).toBe("negotiating");
    });
  });
});
