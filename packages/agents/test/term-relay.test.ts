import { describe, expect, it } from "vitest";
import { decodeTermMessage, signatureVerification } from "@ix/a2a-ext-negotiation";
import type { TermJson } from "@ix/a2a-ext-negotiation";
import type { RelayEventInput } from "@ix/distribution";
import type { EphemeralSigner } from "@ix/identity";
import { eventSigningInput } from "@ix/protocol-core";
import { clockAt, createTermSide, createTermSigners, jobKind, jobTag, mockExtensionsHeader, negotiationKind, peersOf, runTermRelay, signTermMessage, termJobAnchor } from "../src/index.js";
import type { TermSigners } from "../src/index.js";
import type { TermJob, TermMandate } from "../src/index.js";
import { createTestBoard } from "./board.js";

const clock = { now: () => "2026-11-03T00:00:00.000Z" };

const job: TermJob = {
  jobId: "job-relay-1",
  sheetId: "ix:sheet/web-site",
  sheetVersion: 1,
  sheetSha256: "1ef12f30693ddfc3f6f4eb9f48a87a95aee08aeabf39ae6b8c714a0cda80c67a",
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

function run(board = createTestBoard(clock), overrides: { readonly human?: "approve" | "reject"; readonly signers?: TermSigners } = {}) {
  return runTermRelay({
    board,
    clock,
    job,
    client: { party: "client", mandate: clientMandate, human: overrides.human ?? "approve" },
    worker: { party: "worker", mandate: workerMandate, human: "approve" },
    ...(overrides.signers === undefined ? {} : { signers: overrides.signers }),
  });
}

async function signedEvent(signer: EphemeralSigner, input: Omit<RelayEventInput, "issuer" | "sig">): Promise<RelayEventInput> {
  const fields = { ...input, issuer: signer.did };
  return { ...fields, sig: await signer.signDetached(eventSigningInput(fields)) };
}

function isPlainObject(value: TermJson): value is { readonly [key: string]: TermJson } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unsignedProposal(from: "client" | "worker", amount: number) {
  return {
    from,
    sentAt: "2026-11-03T00:00:00.000Z",
    expiresAt: "2026-11-04T00:00:00.000Z",
    prevHash: "unverified",
    signature: { verification: signatureVerification, material: "x" },
    type: "TermPropose",
    termId: "ix:price",
    value: { amount, currency: "JPY", taxIncluded: true },
  };
}

async function anchoredProposal(signer: EphemeralSigner, from: "client" | "worker", amount: number): Promise<TermJson> {
  const decoded = decodeTermMessage({ ...unsignedProposal(from, amount), prevHash: await termJobAnchor(job) });
  if (!decoded.ok) {
    throw new Error(decoded.reason);
  }
  return signTermMessage(decoded.message, signer);
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
    const signers = await createTermSigners();
    for (const [id, body] of [
      ["u-0001", { record: "term", extensionsHeader: mockExtensionsHeader, message: unsignedProposal("client", 1) }],
      ["u-0002", { record: "term", extensionsHeader: mockExtensionsHeader, message: null }],
    ] as const) {
      const answer = await board.publish(
        await signedEvent(signers.worker, { id, kind: negotiationKind, tags: [[jobTag, job.jobId]], createdAt: clock.now(), expiresAt: "2026-11-04T00:00:00.000Z", body }),
      );
      expect(answer.ok).toBe(true);
    }
    const result = await run(board, { signers });
    expect(result.poster.refusals.some((reason) => reason.includes("issuer does not match"))).toBe(true);
    expect(result.poster.refusals.some((reason) => reason.includes("u-0002"))).toBe(true);
    expect(result.poster.session?.phase).toBe("agreed");
  });

  it("refuses a forged event signature, a message signed by the other party's key, an unsigned message, and a changed signed message", async () => {
    const board = createTestBoard(clock);
    const signers = await createTermSigners();
    const outsider = (await createTermSigners()).worker;
    const base = { kind: negotiationKind, tags: [[jobTag, job.jobId]] as const, createdAt: clock.now(), expiresAt: "2026-11-04T00:00:00.000Z" };
    const realWorker = await anchoredProposal(signers.worker, "worker", 1);
    const byClientKey = await anchoredProposal(signers.client, "worker", 2);
    const changed = isPlainObject(realWorker) ? { ...realWorker, value: { amount: 3, currency: "JPY", taxIncluded: true } } : realWorker;
    const forgedEvent = await signedEvent(signers.worker, { ...base, id: "v-0001", body: { record: "term", extensionsHeader: mockExtensionsHeader, message: realWorker } });
    const fakeSig = await signedEvent(outsider, { ...base, id: "v-0001", body: forgedEvent.body });
    await board.publish({ ...forgedEvent, sig: fakeSig.sig });
    await board.publish(await signedEvent(signers.worker, { ...base, id: "v-0002", body: { record: "term", extensionsHeader: mockExtensionsHeader, message: byClientKey } }));
    await board.publish(await signedEvent(signers.worker, { ...base, id: "v-0003", body: { record: "term", extensionsHeader: mockExtensionsHeader, message: unsignedProposal("worker", 4) } }));
    await board.publish(await signedEvent(signers.worker, { ...base, id: "v-0004", body: { record: "term", extensionsHeader: mockExtensionsHeader, message: changed } }));
    const result = await run(board, { signers });
    const refusals = result.poster.refusals;
    expect(refusals.some((reason) => reason.startsWith("v-0001: event signature"))).toBe(true);
    expect(refusals.some((reason) => reason.startsWith("v-0002: message signature"))).toBe(true);
    expect(refusals.some((reason) => reason.startsWith("v-0003: message signature: the message is not signed"))).toBe(true);
    expect(refusals.some((reason) => reason.startsWith("v-0004: message signature"))).toBe(true);
    expect(result.poster.session?.phase).toBe("agreed");
    const price = result.poster.session?.draft?.terms.find((term) => term.termId === "ix:price")?.value;
    expect(price).toMatchObject({ currency: "JPY" });
    for (const amount of [1, 2, 3, 4]) {
      expect(price).not.toEqual({ amount, currency: "JPY", taxIncluded: true });
    }
  });

  it("records a second message after the same message as a fork and does not apply it", async () => {
    const board = createTestBoard(clock);
    const signers = await createTermSigners();
    const peers = peersOf(signers);
    const poster = createTermSide({ board, clock, jobId: job.jobId, config: { party: "client", mandate: clientMandate, human: "approve" }, signer: signers.client, peers, postJob: job });
    const worker = createTermSide({ board, clock, jobId: job.jobId, config: { party: "worker", mandate: workerMandate, human: "approve" }, signer: signers.worker, peers });
    for (let turn = 0; turn < 3; turn += 1) {
      await poster.step();
      await worker.step();
    }
    const listed = await board.query({ tags: [{ name: jobTag, values: [job.jobId] }] });
    const first = listed.ok ? listed.events.find((event) => event.kind === negotiationKind && event.issuer === peers.worker) : undefined;
    if (first === undefined) {
      throw new Error("the worker published nothing");
    }
    await poster.sync();
    await worker.sync();
    const before = poster.report().session?.transcript.length;
    const answer = await board.publish({ ...first, id: "zz-fork" });
    expect(answer.ok).toBe(true);
    await poster.sync();
    await worker.sync();
    expect(poster.report().refusals.some((reason) => reason.startsWith("zz-fork: a fork"))).toBe(true);
    expect(worker.report().refusals.some((reason) => reason.startsWith("zz-fork: a fork"))).toBe(true);
    expect(poster.report().session?.transcript.length).toBe(before);
  });

  it("refuses a negotiation message that arrives before the job", async () => {
    const board = createTestBoard(clock);
    const signers = await createTermSigners();
    await board.publish(
      await signedEvent(signers.worker, {
        id: "a-0001",
        kind: negotiationKind,
        tags: [[jobTag, job.jobId]],
        createdAt: clock.now(),
        expiresAt: "2026-11-04T00:00:00.000Z",
        body: { record: "term", extensionsHeader: mockExtensionsHeader, message: null },
      }),
    );
    const result = await run(board, { signers });
    expect(result.worker.refusals.some((reason) => reason.includes("before the job"))).toBe(true);
    expect(result.worker.session?.phase).toBe("agreed");
  });

  it("ignores a third party's fake job and the worker's fake job, and agrees only on the poster's job, inside the mandate", async () => {
    const board = createTestBoard(clock);
    const signers = await createTermSigners();
    const mallory = (await createTermSigners()).client;
    const fake = {
      kind: jobKind,
      tags: [[jobTag, job.jobId]] as const,
      createdAt: clock.now(),
      expiresAt: job.expiresAt,
      body: {
        record: "term-job",
        job: { ...job, preset: [{ termId: "ix:price", value: { amount: 900000, currency: "JPY", taxIncluded: true } }], roundLimitPerTerm: 1, description: "偽の依頼" },
      },
    };
    await board.publish(await signedEvent(mallory, { ...fake, id: "t-0001" }));
    await board.publish(await signedEvent(signers.worker, { ...fake, id: "t-0002" }));
    const result = await run(board, { signers });
    expect(result.poster.refusals.some((reason) => reason.includes("is neither party"))).toBe(true);
    expect(result.worker.refusals.some((reason) => reason.includes("is neither party"))).toBe(true);
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
    const signers = await createTermSigners();
    await board.publish(
      await signedEvent(signers.client, {
        id: "a-0001",
        kind: jobKind,
        tags: [[jobTag, job.jobId]],
        createdAt: clock.now(),
        expiresAt: job.expiresAt,
        body: { record: "term-job", job: { ...job, roundLimitPerTerm: 1 } },
      }),
    );
    const result = await run(board, { signers });
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
      const signers = await createTermSigners();
      const peers = peersOf(signers);
      const poster = createTermSide({ board, clock, jobId: job.jobId, config: { party: "client", mandate: clientMandate, human: "approve" }, signer: signers.client, peers, postJob: job });
      await poster.step();
      const worker = createTermSide({ board, clock: clockAt(workerNow), jobId: job.jobId, config: { party: "worker", mandate: workerMandate, human: "approve" }, signer: signers.worker, peers });
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
    const signers = await createTermSigners();
    for (const [id, header] of [["u-0001", "https://w3id.org/a2a-job/ext/negotiation/v1"], ["u-0002", ""]] as const) {
      await board.publish(
        await signedEvent(signers.worker, {
          id,
          kind: negotiationKind,
          tags: [[jobTag, job.jobId]],
          createdAt: clock.now(),
          expiresAt: "2026-11-04T00:00:00.000Z",
          body: { record: "term", extensionsHeader: header, message: await anchoredProposal(signers.worker, "worker", 1) },
        }),
      );
    }
    const result = await run(board, { signers });
    expect(result.poster.refusals.filter((reason) => reason.includes("not a term negotiation record")).length).toBe(2);
    expect(result.poster.session?.phase).toBe("agreed");
    const price = result.poster.session?.draft?.terms.find((term) => term.termId === "ix:price")?.value;
    expect(price).not.toEqual({ amount: 1, currency: "JPY", taxIncluded: true });
  });
});
