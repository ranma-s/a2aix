import { applyTermMessage, buildTermAgreement, decodeTermMessage, readyForAgreement, signatureVerification, valueHashVerification } from "@ix/a2a-ext-negotiation";
import type { Clock, Party, TermApprovalMessage, TermMessage, TermSession, TermState } from "@ix/a2a-ext-negotiation";
import { canonicalize, parseJson } from "@ix/jcs";
import type { JobBoard } from "./board.js";
import { sampleTermClientMandate, sampleTermJob, sampleTermWorkerMandate } from "./sample-terms.js";
import { createTermSide, peersOf } from "./term-relay.js";
import type { TermJob, TermSideHandle, TermSigners } from "./term-relay.js";
import { errorText } from "./terms.js";
import type { TermMandate, TermTrialEscalation } from "./terms.js";

type Envelope = Omit<TermApprovalMessage, "type" | "decision" | "reopen" | "agreementHash">;

export const maxPastedText = 65536;

export type ConsoleOutcome = {
  readonly ok: boolean;
  readonly text: string;
};

export type ConsoleTermRow = {
  readonly termId: string;
  readonly label: string;
  readonly status: string;
  readonly value: string | undefined;
};

export type ConsoleView = {
  readonly jobId: string;
  readonly party: Party;
  readonly phase: string;
  readonly terms: readonly ConsoleTermRow[];
  readonly moves: readonly string[];
  readonly refusals: readonly string[];
  readonly escalations: readonly string[];
  readonly shownFreeText: readonly string[];
};

export type TermConsole = {
  readonly registerSampleJob: () => Promise<ConsoleOutcome>;
  readonly jobIds: () => readonly string[];
  readonly view: (jobId: string, party: Party) => ConsoleView | undefined;
  readonly pasteMove: (jobId: string, party: Party, text: string) => Promise<ConsoleOutcome>;
  readonly draftAgreement: (jobId: string) => Promise<ConsoleOutcome>;
  readonly approve: (jobId: string, party: Party, decision: "approve" | "reject") => Promise<ConsoleOutcome>;
};

type Hand = {
  slot: TermMessage | undefined;
  asked: boolean;
};

type Seat = {
  readonly side: TermSideHandle;
  readonly hand: Hand;
};

type ConsoleJob = {
  readonly jobId: string;
  readonly seats: { readonly client: Seat; readonly worker: Seat };
};

const partyName: { readonly [party in Party]: string } = { client: "依頼者", worker: "受注者" };

const phaseText: { readonly [phase in TermSession["phase"]]: string } = {
  negotiating: "交渉中",
  awaiting_approval: "合意案ができ、二人の承認待ち",
  agreed: "合意しました",
  no_deal: "不成立",
};

const escalationText: { readonly [reason in TermTrialEscalation["reason"]]: string } = {
  outside_mandate: "委任の範囲の外の値です",
  not_in_mandate: "委任にない項目です",
  documents_mismatch: "手元の文書と合いません",
  wrong_party: "相手の名前で出された手です",
};

function isPlainObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function closingBrace(text: string, start: number): number | undefined {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") {
        index += 1;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return undefined;
}

export function firstJsonObject(text: string): { readonly [key: string]: unknown } | undefined {
  if (text.length > maxPastedText) {
    return undefined;
  }
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const end = closingBrace(text, start);
    if (end === undefined) {
      return undefined;
    }
    let parsed: unknown;
    try {
      parsed = parseJson(text.slice(start, end + 1));
    } catch {
      continue;
    }
    if (isPlainObject(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function moveFromText(text: string, party: Party, clock: Clock): { readonly ok: true; readonly message: TermMessage } | { readonly ok: false; readonly reason: string } {
  const pasted = firstJsonObject(text);
  if (pasted === undefined) {
    return { ok: false, reason: "貼り付けた文章に、読める JSON のオブジェクトがありません" };
  }
  const base = envelopeForMessage(party, clock);
  const merged: { [key: string]: unknown } = {};
  for (const [key, value] of Object.entries(pasted)) {
    if (key !== "sentAt" && key !== "expiresAt" && key !== "prevHash" && key !== "signature" && key !== "valueHash") {
      merged[key] = value;
    }
  }
  for (const [key, value] of Object.entries(base)) {
    if (!(key in merged)) {
      merged[key] = value;
    }
  }
  if (merged["type"] === "TermAccept") {
    merged["valueHash"] = valueHashVerification;
  }
  const decoded = decodeTermMessage(merged);
  return decoded.ok ? { ok: true, message: decoded.message } : { ok: false, reason: `手の形が正しくありません: ${decoded.reason}` };
}

function shown(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return canonicalize(value);
  } catch (error) {
    return `（表示できない値: ${errorText(error)}）`;
  }
}

function termLabel(term: TermState): string {
  const label = term.definition.label?.["ja"];
  return label === undefined ? term.definition.termId : `${label}（${term.definition.termId}）`;
}

function statusText(term: TermState, party: Party): string {
  const by = term.by === undefined ? "" : term.by === party ? "こちらが" : "相手が";
  switch (term.status) {
    case "open":
      return "未定";
    case "proposed":
      return `${by}提案中`;
    case "fixed":
      return "確定";
    case "dropped":
      return "外した";
    case "add_requested":
      return `${by}追加を求めている`;
    case "drop_requested":
      return `${by}外すことを求めている`;
    case "reopen_requested":
      return `${by}やり直しを求めている`;
  }
}

function termMoves(term: TermState, party: Party): string | undefined {
  const termId = term.definition.termId;
  const label = termLabel(term);
  switch (term.status) {
    case "open":
      return `${label}: 提案できます。例 {"type":"TermPropose","termId":"${termId}","value":…}`;
    case "proposed":
      return term.by === party
        ? undefined
        : `${label}: 受け入れ {"type":"TermAccept","termId":"${termId}"}、対案 {"type":"TermCounter","termId":"${termId}","value":…}、断る {"type":"TermRefuse","termId":"${termId}"}`;
    case "add_requested":
    case "drop_requested":
    case "reopen_requested":
      return term.by === party ? undefined : `${label}: 受け入れ {"type":"TermAccept","termId":"${termId}"} か、断る {"type":"TermRefuse","termId":"${termId}"}`;
    case "fixed":
    case "dropped":
      return undefined;
  }
}

function legalMoves(session: TermSession | undefined, party: Party, stopped: boolean): string[] {
  if (session === undefined) {
    return ["仕事がまだ届いていません"];
  }
  if (stopped) {
    return ["この側は止まりました。新しい仕事を登録してください"];
  }
  switch (session.phase) {
    case "agreed":
      return ["合意しました。これ以上の手はありません"];
    case "no_deal":
      return [`不成立です（${session.reason ?? "理由なし"}）。これ以上の手はありません`];
    case "awaiting_approval":
      return session.approvals.includes(party) ? ["相手の承認を待っています"] : ["合意案を読み、承認ボタンか拒否ボタンを押してください（模試の人間の鍵で署名します）"];
    case "negotiating": {
      const moves = session.terms.map((term) => termMoves(term, party)).filter((move): move is string => move !== undefined);
      if (party === "client" && readyForAgreement(session)) {
        moves.push("すべて確定しました。合意案ボタンで合意案を出せます");
      }
      moves.push(`交渉をやめる {"type":"DealDecline","reason":"…"}`);
      return moves;
    }
  }
}

function withProposedValue(session: TermSession, message: TermMessage): TermMessage {
  if (message.type !== "TermAccept" || message.value !== undefined) {
    return message;
  }
  const term = session.terms.find((entry) => entry.definition.termId === message.termId);
  return term?.status === "proposed" && term.value !== undefined ? { ...message, value: term.value } : message;
}

function wasAsked(hand: Hand): boolean {
  return hand.asked;
}

function seatOf(job: ConsoleJob, party: Party): Seat {
  return party === "client" ? job.seats.client : job.seats.worker;
}

export function createTermConsole(input: {
  readonly board: JobBoard;
  readonly clock: Clock;
  readonly signers: TermSigners;
  readonly mandates?: { readonly client: TermMandate; readonly worker: TermMandate };
}): TermConsole {
  const peers = peersOf(input.signers);
  const mandates = input.mandates ?? { client: sampleTermClientMandate, worker: sampleTermWorkerMandate };
  const jobs: ConsoleJob[] = [];

  const makeSeat = (party: Party, jobId: string, postJob: TermJob | undefined): Seat => {
    const hand: Hand = { slot: undefined, asked: false };
    const side = createTermSide({
      board: input.board,
      clock: input.clock,
      jobId,
      config: {
        party,
        mandate: mandates[party],
        human: "reject",
        decide: (session, clock) => {
          hand.asked = true;
          const pasted = hand.slot;
          hand.slot = undefined;
          if (pasted === undefined) {
            return undefined;
          }
          const message = withProposedValue(session, pasted);
          const tried = applyTermMessage(session, message, clock);
          if (!tried.ok) {
            throw new Error(`交渉の決まりに合いません: ${tried.reason}`);
          }
          return { message };
        },
      },
      signer: input.signers[party],
      approver: input.signers.approvers[party],
      peers,
      ...(postJob === undefined ? {} : { postJob }),
    });
    return { side, hand };
  };

  const find = (jobId: string): ConsoleJob | undefined => jobs.find((job) => job.jobId === jobId);

  const submit = async (jobId: string, party: Party, message: TermMessage): Promise<ConsoleOutcome> => {
    const job = find(jobId);
    if (job === undefined) {
      return { ok: false, text: `仕事 ${jobId} はありません` };
    }
    const seat = seatOf(job, party);
    const other = seatOf(job, party === "client" ? "worker" : "client");
    const escalationsBefore = seat.side.report().escalations.length;
    const refusalsBefore = seat.side.report().refusals.length;
    seat.hand.slot = message;
    seat.hand.asked = false;
    const moved = await seat.side.step();
    const asked = wasAsked(seat.hand);
    seat.hand.slot = undefined;
    await other.side.sync();
    await seat.side.sync();
    const after = seat.side.report();
    if (moved) {
      return { ok: true, text: `${partyName[party]}の手（${message.type}）を署名して中継に出しました` };
    }
    const escalation = after.escalations[escalationsBefore];
    if (escalation !== undefined) {
      return { ok: false, text: `送りませんでした。${escalationText[escalation.reason]}（${escalation.termId === "" ? "項目なし" : escalation.termId}）。この側は止まり、人の判断を待ちます` };
    }
    const refusal = after.refusals[refusalsBefore];
    if (refusal !== undefined) {
      return { ok: false, text: `送りませんでした: ${refusal}` };
    }
    return { ok: false, text: asked ? "送りませんでした" : "今はこの側の手を受け付けません" };
  };

  return {
    async registerSampleJob() {
      const jobId = `job-trial-${String(jobs.length + 1).padStart(4, "0")}`;
      const job: TermJob = { ...sampleTermJob, jobId };
      let client: Seat;
      let worker: Seat;
      try {
        client = makeSeat("client", jobId, job);
        worker = makeSeat("worker", jobId, undefined);
      } catch (error) {
        return { ok: false, text: `仕事を登録できません: ${errorText(error)}` };
      }
      const posted = await client.side.step();
      await worker.side.sync();
      await client.side.sync();
      if (!posted) {
        return { ok: false, text: `仕事を中継に出せません: ${client.side.report().refusals.join(" / ")}` };
      }
      jobs.push({ jobId, seats: { client, worker } });
      return { ok: true, text: `見本の仕事 ${jobId} を登録しました` };
    },
    jobIds: () => jobs.map((job) => job.jobId),
    view(jobId, party) {
      const job = find(jobId);
      if (job === undefined) {
        return undefined;
      }
      const seat = seatOf(job, party);
      const report = seat.side.report();
      const session = report.session;
      const stopped = seat.side.finished() && session?.phase !== "agreed" && session?.phase !== "no_deal";
      return {
        jobId,
        party,
        phase: session === undefined ? "仕事待ち" : `${phaseText[session.phase]}${session.reason === undefined ? "" : `（${session.reason}）`}`,
        terms: (session?.terms ?? []).map((term) => ({
          termId: term.definition.termId,
          label: termLabel(term),
          status: statusText(term, party),
          value: shown(term.value),
        })),
        moves: legalMoves(session, party, stopped),
        refusals: report.refusals,
        escalations: report.escalations.map((escalation) => `${escalation.termId === "" ? "項目なし" : escalation.termId}: ${escalationText[escalation.reason]}`),
        shownFreeText: report.shownFreeText,
      };
    },
    async pasteMove(jobId, party, text) {
      const move = moveFromText(text, party, input.clock);
      if (!move.ok) {
        return { ok: false, text: move.reason };
      }
      return submit(jobId, party, move.message);
    },
    async draftAgreement(jobId) {
      const job = find(jobId);
      const session = job?.seats.client.side.report().session;
      if (session === undefined || session.phase !== "negotiating" || !readyForAgreement(session)) {
        return { ok: false, text: "まだ合意案を作れません。すべての項目が確定してから押してください" };
      }
      const agreement = buildTermAgreement(session, `${session.jobId}-agreement`, "unverified");
      if (agreement === undefined) {
        return { ok: false, text: "合意案を作れませんでした" };
      }
      return submit(jobId, "client", { ...envelopeForMessage("client", input.clock), type: "TermAgreementDraft", agreement });
    },
    async approve(jobId, party, decision) {
      return submit(jobId, party, { ...envelopeForMessage(party, input.clock), type: "TermApproval", decision });
    },
  };
}

function envelopeForMessage(party: Party, clock: Clock): Envelope {
  const now = clock.now();
  return {
    from: party,
    sentAt: now,
    expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
    prevHash: "unverified",
    signature: { verification: signatureVerification, material: "unverified" },
  };
}
