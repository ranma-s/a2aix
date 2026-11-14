import { describe, expect, it } from "vitest";
import type { Party } from "@ix/a2a-ext-negotiation";
import { clockAt, createTermConsole, jobTag, createTermSide, createTermSigners, firstJsonObject, moveFromText, peersOf, sampleNow, sampleTermWorkerMandate } from "../src/index.js";
import type { ConsoleView, TermConsole } from "../src/index.js";
import { createTestBoard } from "./board.js";

const clock = clockAt(sampleNow);

const clientPlan: { readonly [termId: string]: string } = {
  "ix:price": `{"amount":175000,"currency":"JPY","taxIncluded":true}`,
  "ix:deadline": `{"at":"2026-12-18T18:00:00+09:00","zone":"Asia/Tokyo"}`,
  "ix:revision-limit": "2",
  "ix:acceptance-window": `{"value":7,"unit":"day"}`,
  "ix:deliverables": `[{"code":"web-page","n":5}]`,
  "ix:deliverable-format": `["text/html"]`,
  "web:page-count": "5",
};

function clientAssistant(view: ConsoleView): string | undefined {
  const open = view.terms.find((term) => term.status === "未定");
  if (open === undefined) {
    return undefined;
  }
  const value = clientPlan[open.termId];
  if (value === undefined) {
    return undefined;
  }
  return `はい、次の手はこちらです。\n\`\`\`json\n{"type":"TermPropose","termId":"${open.termId}","value":${value}}\n\`\`\`\nほかに必要なら言ってください。`;
}

function workerAssistant(view: ConsoleView): string | undefined {
  const proposed = view.terms.find((term) => term.status === "相手が提案中");
  if (proposed === undefined) {
    return undefined;
  }
  return `Sure! Here is my move: {"type":"TermAccept","termId":"${proposed.termId}"} — let me know if {anything} changes.`;
}

function viewOf(page: TermConsole, jobId: string, party: Party): ConsoleView {
  const view = page.view(jobId, party);
  if (view === undefined) {
    throw new Error(`no view of ${jobId}`);
  }
  return view;
}

async function registered(): Promise<{ readonly page: TermConsole; readonly jobId: string }> {
  const page = createTermConsole({ board: createTestBoard(clock), clock, signers: await createTermSigners() });
  const outcome = await page.registerSampleJob();
  expect(outcome.ok).toBe(true);
  const jobId = page.jobIds()[0];
  if (jobId === undefined) {
    throw new Error("no job was registered");
  }
  return { page, jobId };
}

describe("first JSON object in pasted text", () => {
  it("takes the object out of prose and a code fence", () => {
    expect(firstJsonObject('前置き {not json} そして\n```json\n{"type":"TermRefuse","termId":"ix:price"}\n```')).toEqual({ type: "TermRefuse", termId: "ix:price" });
  });

  it("finds nothing when there is no object", () => {
    expect(firstJsonObject("ok, accepted")).toBeUndefined();
  });

  it("rejects duplicate keys through parseJson", () => {
    expect(firstJsonObject('{"type":"TermRefuse","type":"TermAccept"}')).toBeUndefined();
  });

  it("does not fall back to an object inside a rejected one", () => {
    expect(firstJsonObject('{"type":"TermPropose","x":{"type":"TermRefuse","termId":"ix:price"},"type":"y"}')).toBeUndefined();
    expect(firstJsonObject('{"a":9007199254740993,"b":{"type":"DealDecline"}}')).toBeUndefined();
    expect(firstJsonObject(`${"{\"a\":".repeat(70)}1${"}".repeat(70)}`)).toBeUndefined();
  });

  it("takes a later object after a rejected one", () => {
    expect(firstJsonObject('{"a":1,"a":2} then {"type":"TermRefuse","termId":"ix:price"}')).toEqual({ type: "TermRefuse", termId: "ix:price" });
  });

  it("refuses a pasted approval or agreement draft", () => {
    expect(moveFromText('Done. {"type":"TermApproval","decision":"approve"}', "worker", clock).ok).toBe(false);
    expect(moveFromText('{"type":"TermAgreementDraft","agreement":{}}', "client", clock).ok).toBe(false);
  });

  it("refuses a field the message format does not know", () => {
    const move = moveFromText('{"type":"TermRefuse","termId":"ix:price","run":"rm -rf /"}', "worker", clock);
    expect(move.ok).toBe(false);
  });
});

describe("console page logic with two scripted assistants", () => {
  it("reaches agreed through decide, the mandate check, and the approval buttons", async () => {
    const { page, jobId } = await registered();
    expect(viewOf(page, jobId, "worker").phase).toBe("交渉中");
    for (let round = 0; round < 20; round += 1) {
      const clientText = clientAssistant(viewOf(page, jobId, "client"));
      if (clientText !== undefined) {
        expect((await page.pasteMove(jobId, "client", clientText)).ok).toBe(true);
      }
      const workerText = workerAssistant(viewOf(page, jobId, "worker"));
      if (workerText !== undefined) {
        expect((await page.pasteMove(jobId, "worker", workerText)).ok).toBe(true);
      }
      if (clientText === undefined && workerText === undefined) {
        break;
      }
    }
    expect(viewOf(page, jobId, "client").moves.some((move) => move.includes("合意案ボタン"))).toBe(true);
    expect((await page.draftAgreement(jobId)).ok).toBe(true);
    expect(viewOf(page, jobId, "worker").phase).toBe("合意案ができ、二人の承認待ち");
    const pastedApproval = await page.pasteMove(jobId, "worker", 'Great. {"type":"TermApproval","decision":"approve"}');
    expect(pastedApproval.ok).toBe(false);
    expect(pastedApproval.text).toContain("ボタン");
    expect(viewOf(page, jobId, "worker").phase).toBe("合意案ができ、二人の承認待ち");
    expect(viewOf(page, jobId, "worker").moves.some((move) => move.includes("承認ボタン"))).toBe(true);
    expect((await page.approve(jobId, "worker", "approve")).ok).toBe(true);
    expect((await page.approve(jobId, "client", "approve")).ok).toBe(true);
    for (const party of ["client", "worker"] as const) {
      const view = viewOf(page, jobId, party);
      expect(view.phase).toBe("合意しました");
      expect(view.refusals).toEqual([]);
      expect(view.escalations).toEqual([]);
    }
  });

  it("refuses a pasted move outside the mandate and sends nothing", async () => {
    const { page, jobId } = await registered();
    const outcome = await page.pasteMove(jobId, "worker", 'Counter: {"type":"TermPropose","termId":"ix:price","value":{"amount":100000,"currency":"JPY","taxIncluded":true}}');
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain("委任の範囲の外");
    const worker = viewOf(page, jobId, "worker");
    expect(worker.escalations).toEqual(["ix:price: 委任の範囲の外の値です"]);
    expect(viewOf(page, jobId, "client").terms.find((term) => term.termId === "ix:price")?.status).toBe("未定");
  });

  it("refuses a pasted move in the other party's name", async () => {
    const { page, jobId } = await registered();
    const outcome = await page.pasteMove(jobId, "worker", '{"from":"client","type":"TermPropose","termId":"ix:price","value":{"amount":175000,"currency":"JPY","taxIncluded":true}}');
    expect(outcome.ok).toBe(false);
    expect(viewOf(page, jobId, "worker").escalations).toEqual(["項目なし: 相手の名前で出された手です"]);
  });

  it("does not publish a move the term machine would refuse", async () => {
    const board = createTestBoard(clock);
    const page = createTermConsole({ board, clock, signers: await createTermSigners() });
    await page.registerSampleJob();
    const count = async () => {
      const answer = await board.query({ tags: [{ name: jobTag, values: ["job-trial-0001"] }] });
      return answer.ok ? answer.events.length : -1;
    };
    const before = await count();
    const outcome = await page.pasteMove("job-trial-0001", "worker", '{"type":"TermAccept","termId":"ix:price"}');
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain("交渉の決まりに合いません");
    expect(await count()).toBe(before);
    expect(viewOf(page, "job-trial-0001", "worker").moves.some((move) => move.includes("ix:price"))).toBe(true);
  });

  it("shows text with no JSON object as a problem and sends nothing", async () => {
    const { page, jobId } = await registered();
    const outcome = await page.pasteMove(jobId, "client", "I think 150000 yen is fair.");
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain("JSON");
    expect(viewOf(page, jobId, "client").refusals).toEqual([]);
  });
});

describe("decide hook findings of the PR #5 verifier", () => {
  it("stamps an escalation from decide with the agent's own party", async () => {
    const signers = await createTermSigners();
    const board = createTestBoard(clock);
    const page = createTermConsole({ board, clock, signers });
    await page.registerSampleJob();
    const worker = createTermSide({
      board,
      clock,
      jobId: "job-trial-0001",
      config: { party: "worker", mandate: sampleTermWorkerMandate, human: "approve", decide: () => ({ escalation: { party: "client", termId: "ix:price", reason: "outside_mandate" } }) },
      signer: signers.worker,
      approver: signers.approvers.worker,
      peers: peersOf(signers),
    });
    expect(await worker.step()).toBe(false);
    expect(worker.report().escalations).toEqual([{ party: "worker", termId: "ix:price", reason: "outside_mandate" }]);
  });

  it("records a throwing decide as a refusal and keeps the side open", async () => {
    const signers = await createTermSigners();
    const board = createTestBoard(clock);
    const page = createTermConsole({ board, clock, signers });
    await page.registerSampleJob();
    const worker = createTermSide({
      board,
      clock,
      jobId: "job-trial-0001",
      config: {
        party: "worker",
        mandate: sampleTermWorkerMandate,
        human: "approve",
        decide: () => {
          throw new Error("the assistant text could not be used");
        },
      },
      signer: signers.worker,
      approver: signers.approvers.worker,
      peers: peersOf(signers),
    });
    expect(await worker.step()).toBe(false);
    expect(worker.report().refusals).toEqual(["decide failed: the assistant text could not be used"]);
    expect(worker.finished()).toBe(false);
  });
});
