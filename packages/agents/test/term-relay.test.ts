import { describe, expect, it } from "vitest";
import { signatureVerification } from "@ix/a2a-ext-negotiation";
import type { TermJson } from "@ix/a2a-ext-negotiation";
import { clockAt, createTermSide, jobKind, jobTag, mockExtensionsHeader, negotiationKind, posterIssuer, runTermRelay, workerIssuer } from "../src/index.js";
import type { TermJob, TermMandate } from "../src/index.js";
import { createTestBoard } from "./board.js";

const clock = { now: () => "2026-11-03T00:00:00.000Z" };
const sha = (digit: string): string => digit.repeat(64);

const job: TermJob = {
  jobId: "job-relay-1",
  sheetId: "ix:sheet/web-site",
  sheetVersion: 1,
  sheetSha256: sha("a"),
  preset: [{ termId: "web:responsive", value: true }],
  roundLimitPerTerm: 3,
  description: "小さな会社のサイトです。質問は tanaka@example.com まで",
  expiresAt: "2026-11-10T00:00:00.000Z",
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
};

const workerMandate: TermMandate = {
  "ix:price": { kind: "money-min", currency: "JPY", taxIncluded: true, ask: 200000, min: 170000 },
  "ix:deadline": { kind: "deadline-from", zone: "America/Los_Angeles", ask: "2026-12-25T17:00:00-08:00", earliest: "2026-12-15T01:00:00-08:00" },
  "ix:revision-limit": { kind: "integer-range", ask: 1, min: 1, max: 2 },
  "ix:acceptance-window": { kind: "one-of", values: [{ value: 7, unit: "day" }] },
  "ix:deliverables": { kind: "one-of", values: [[{ code: "web-page", n: 5 }]] },
  "ix:deliverable-format": { kind: "one-of", values: [["text/html"]] },
  "web:page-count": { kind: "integer-range", ask: 5, min: 3, max: 8 },
  "web:responsive": { kind: "one-of", values: [true] },
};

function run(board = createTestBoard(clock), overrides: { readonly human?: "approve" | "reject" } = {}) {
  return runTermRelay({
    board,
    clock,
    job,
    client: { party: "client", mandate: clientMandate, human: overrides.human ?? "approve" },
    worker: { party: "worker", mandate: workerMandate, human: "approve" },
  });
}

describe("term negotiation over the relay", () => {
  it("reaches the same agreement on both sides from the relay's events", async () => {
    const result = await run();
    expect(result.poster.refusals).toEqual([]);
    expect(result.worker.refusals).toEqual([]);
    expect(result.poster.session?.phase).toBe("agreed");
    expect(result.worker.session?.phase).toBe("agreed");
    expect(result.worker.session?.draft).toEqual(result.poster.session?.draft);
    expect(result.events.length).toBeGreaterThan(10);
    expect(result.events.every((event) => event.tags.some(([name, value]) => name === jobTag && value === job.jobId))).toBe(true);
  });

  it("shows the job description to the worker's human only after removing contacts", async () => {
    const result = await run();
    expect(result.worker.shownFreeText[0]).toBe("小さな会社のサイトです。質問は [contact-removed] まで");
  });

  it("ends without a deal when a human rejects", async () => {
    const result = await run(createTestBoard(clock), { human: "reject" });
    expect(result.poster.session?.phase).toBe("no_deal");
    expect(result.worker.session?.phase).toBe("no_deal");
  });

  it("refuses relay events from the wrong issuer or with a broken body, and still agrees", async () => {
    const board = createTestBoard(clock);
    const forged: TermJson = {
      from: "client",
      sentAt: "2026-11-03T00:00:00.000Z",
      expiresAt: "2026-11-04T00:00:00.000Z",
      prevHash: "unverified",
      signature: { verification: signatureVerification, material: "x" },
      type: "TermPropose",
      termId: "ix:price",
      value: { amount: 1, currency: "JPY", taxIncluded: true },
    };
    for (const [id, body] of [
      ["u-0001", { record: "term", extensionsHeader: mockExtensionsHeader, message: forged }],
      ["u-0002", { record: "term", extensionsHeader: mockExtensionsHeader, message: null }],
    ] as const) {
      const answer = await board.publish({
        id,
        issuer: workerIssuer,
        kind: negotiationKind,
        tags: [[jobTag, job.jobId]],
        createdAt: clock.now(),
        expiresAt: "2026-11-04T00:00:00.000Z",
        body,
        sig: "x",
      });
      expect(answer.ok).toBe(true);
    }
    const result = await run(board);
    expect(result.poster.refusals.some((reason) => reason.includes("issuer"))).toBe(true);
    expect(result.poster.refusals.some((reason) => reason.includes("u-0002"))).toBe(true);
    expect(result.poster.session?.phase).toBe("agreed");
  });

  it("refuses a negotiation message that arrives before the job", async () => {
    const board = createTestBoard(clock);
    await board.publish({
      id: "a-0001",
      issuer: workerIssuer,
      kind: negotiationKind,
      tags: [[jobTag, job.jobId]],
      createdAt: clock.now(),
      expiresAt: "2026-11-04T00:00:00.000Z",
      body: { record: "term", extensionsHeader: mockExtensionsHeader, message: null },
      sig: "x",
    });
    const result = await run(board);
    expect(result.worker.refusals.some((reason) => reason.includes("before the job"))).toBe(true);
    expect(result.worker.session?.phase).toBe("agreed");
  });

  it("ignores a third party's fake job and agrees only on the poster's job, inside the mandate", async () => {
    const board = createTestBoard(clock);
    await board.publish({
      id: "t-0001",
      issuer: "did:example:mallory",
      kind: jobKind,
      tags: [[jobTag, job.jobId]],
      createdAt: clock.now(),
      expiresAt: job.expiresAt,
      body: {
        record: "term-job",
        job: { ...job, preset: [{ termId: "ix:price", value: { amount: 900000, currency: "JPY", taxIncluded: true } }], roundLimitPerTerm: 1, description: "偽の依頼" },
      },
      sig: "x",
    });
    const result = await run(board);
    expect(result.poster.refusals.some((reason) => reason.includes("not from the poster"))).toBe(true);
    expect(result.worker.refusals.some((reason) => reason.includes("not from the poster"))).toBe(true);
    expect(result.poster.session?.phase).toBe("agreed");
    const price = result.poster.session?.draft?.terms.find((term) => term.termId === "ix:price")?.value;
    expect(price).toMatchObject({ currency: "JPY" });
    expect(result.worker.session?.draft).toEqual(result.poster.session?.draft);
    expect(result.worker.shownFreeText).not.toContain("偽の依頼");
  });

  it("stops the poster when the poster-named job on the relay differs from the one it posted", async () => {
    const board = createTestBoard(clock);
    await board.publish({
      id: "a-0001",
      issuer: posterIssuer,
      kind: jobKind,
      tags: [[jobTag, job.jobId]],
      createdAt: clock.now(),
      expiresAt: job.expiresAt,
      body: { record: "term-job", job: { ...job, roundLimitPerTerm: 1 } },
      sig: "x",
    });
    const result = await run(board);
    expect(result.poster.refusals.some((reason) => reason.includes("not the job this side posted"))).toBe(true);
    expect(result.poster.session).toBeUndefined();
  });

  it("refuses a preset outside the poster's own mandate before posting", async () => {
    await expect(
      runTermRelay({
        board: createTestBoard(clock),
        clock,
        job: { ...job, preset: [{ termId: "ix:price", value: { amount: 900000, currency: "JPY", taxIncluded: true } }] },
        client: { party: "client", mandate: clientMandate, human: "approve" },
        worker: { party: "worker", mandate: workerMandate, human: "approve" },
      }),
    ).rejects.toThrow(/ix:price/);
  });

  it("keeps going when a third party takes a huge event id, and refuses deeply nested values", async () => {
    const board = createTestBoard(clock);
    let deep: TermJson = 1;
    for (let level = 0; level < 3000; level += 1) {
      deep = [deep];
    }
    await board.publish({
      id: "t-9007199254740991",
      issuer: "did:example:mallory",
      kind: negotiationKind,
      tags: [[jobTag, job.jobId]],
      createdAt: clock.now(),
      expiresAt: "2026-11-04T00:00:00.000Z",
      body: { record: "term", extensionsHeader: mockExtensionsHeader, message: { type: "TermPropose", termId: "ix:price", value: deep } },
      sig: "x",
    });
    const result = await run(board);
    expect(result.poster.session?.phase).toBe("agreed");
    expect(result.worker.session?.phase).toBe("agreed");
  });

  it("does not negotiate on a job at or after its expiry, even mid-negotiation", async () => {
    for (const workerNow of [job.expiresAt, "2026-11-10T00:00:00.001Z"]) {
      const board = createTestBoard(clock);
      const poster = createTermSide({ board, clock, jobId: job.jobId, config: { party: "client", mandate: clientMandate, human: "approve" }, postJob: job });
      await poster.step();
      const worker = createTermSide({ board, clock: clockAt(workerNow), jobId: job.jobId, config: { party: "worker", mandate: workerMandate, human: "approve" } });
      await worker.step();
      await worker.step();
      expect(worker.report().refusals.some((reason) => reason.includes("the job has expired"))).toBe(true);
      const listed = await board.query({ tags: [{ name: jobTag, values: [job.jobId] }] });
      expect(listed.ok && listed.events.filter((event) => event.kind === negotiationKind).length).toBe(0);
    }
    let at = Date.parse(clock.now());
    const ticking = { now: () => { at += 60000; return new Date(at).toISOString(); } };
    const shortExpiry = new Date(Date.parse(clock.now()) + 600000).toISOString();
    const result = await runTermRelay({
      board: createTestBoard(clock),
      clock: ticking,
      job: { ...job, expiresAt: shortExpiry },
      client: { party: "client", mandate: clientMandate, human: "approve" },
      worker: { party: "worker", mandate: workerMandate, human: "approve" },
    });
    expect(result.events.every((event) => Date.parse(event.createdAt) < Date.parse(shortExpiry))).toBe(true);
    expect(result.poster.session?.phase).not.toBe("agreed");
  });

  it("refuses a negotiation record whose extensions header does not activate negotiation", async () => {
    const board = createTestBoard(clock);
    for (const [id, header] of [["u-0001", "https://w3id.org/a2a-job/ext/negotiation/v1"], ["u-0002", ""]] as const) {
      await board.publish({
        id,
        issuer: workerIssuer,
        kind: negotiationKind,
        tags: [[jobTag, job.jobId]],
        createdAt: clock.now(),
        expiresAt: "2026-11-04T00:00:00.000Z",
        body: {
          record: "term",
          extensionsHeader: header,
          message: {
            from: "worker",
            sentAt: clock.now(),
            expiresAt: "2026-11-04T00:00:00.000Z",
            prevHash: "unverified",
            signature: { verification: signatureVerification, material: "x" },
            type: "TermPropose",
            termId: "ix:price",
            value: { amount: 1, currency: "JPY", taxIncluded: true },
          },
        },
        sig: "x",
      });
    }
    const result = await run(board);
    expect(result.poster.refusals.filter((reason) => reason.includes("not a term negotiation record")).length).toBe(2);
    expect(result.poster.session?.phase).toBe("agreed");
    const price = result.poster.session?.draft?.terms.find((term) => term.termId === "ix:price")?.value;
    expect(price).not.toEqual({ amount: 1, currency: "JPY", taxIncluded: true });
  });
});
