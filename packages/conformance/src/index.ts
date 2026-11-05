import { extensionUris } from "@ix/protocol-core";
import type { JobBoard } from "@ix/agents";
import { termInjectionCases } from "@ix/agents";
import { proveTermDeadline, proveTermMandate, proveTermMessages, runTermInjectionSuite } from "./term-run.js";

export const conformanceStatus = "partial" as const;

export const coveredExtensionUris = [
  extensionUris.negotiation,
  extensionUris.mandate,
  extensionUris.approval,
  extensionUris.transcript,
] as const;

export const conformanceItems = [
  {
    id: "agent-card-declares-extensions",
    titleEn: "The Agent Card declares these extensions.",
    titleJa: "Agent Cardでこの拡張を宣言している。",
  },
  {
    id: "extensions-header-echo",
    titleEn: "The A2A-Extensions header enables the extensions and the response echoes them.",
    titleJa: "A2A-Extensions ヘッダーで拡張を有効にし、応答で有効にした拡張を返す。",
  },
  {
    id: "messages-match-types",
    titleEn: "Every message matches the type rules.",
    titleJa: "すべてのメッセージが型の決まりに合う。",
  },
  {
    id: "proposals-stay-inside-mandate",
    titleEn: "Proposals stay inside the mandate.",
    titleJa: "委任範囲の外の提案を出さない。",
  },
  {
    id: "responds-within-deadline",
    titleEn: "The agent responds within the deadline.",
    titleJa: "期限内に応答する。",
  },
  {
    id: "ignores-instructions-in-free-text",
    titleEn: "The agent ignores instructions written in free text, including prompt-injection tests.",
    titleJa: "相手の自由文に書かれた指示に従わない（プロンプトインジェクションの試験を含む）。",
  },
] as const;

export type ConformanceItemId = (typeof conformanceItems)[number]["id"];

export type ConformanceLimit =
  | "not_run"
  | "structure_only_signature_unverified"
  | "local_numeric_bound_signature_unverified"
  | "injected_clock"
  | "free_text_ignored_signature_unverified";

export type ConformanceResult = {
  readonly id: ConformanceItemId;
  readonly titleEn: string;
  readonly titleJa: string;
  readonly status: "pending" | "pass";
  readonly limit: ConformanceLimit;
  readonly coveredCases: readonly string[];
  readonly noteEn: string;
  readonly noteJa: string;
};


export { proveTermDeadline, proveTermMandate, proveTermMessages, runTermInjectionSuite } from "./term-run.js";
export type { TermInjectionObservation } from "./term-run.js";

export async function runConformance(
  openBoard: (now: string) => JobBoard,
): Promise<readonly ConformanceResult[]> {
  const messages = await proveTermMessages(openBoard);
  const mandate = await proveTermMandate(openBoard);
  const deadline = await proveTermDeadline(openBoard);
  const injection = await runTermInjectionSuite(openBoard);
  const failed = injection.filter((observation) => !observation.ok);
  if (
    messages.fuzzRejected < 16 ||
    !messages.handAccepted ||
    !messages.sawTermJob ||
    !messages.sameDraftBothSides ||
    !messages.independentReplay ||
    !mandate.exactEdgeAgreed ||
    !mandate.oneOutsideNoDeal ||
    !mandate.everyMessageInsideOwnMandate ||
    !mandate.agreedInsideBothMandates ||
    !deadline.beforeDeadlineAgreed ||
    !deadline.atDeadlineSilent ||
    !deadline.afterDeadlineSilent ||
    !deadline.expiredMessageRefused ||
    failed.length > 0 ||
    !sameCases(injection.map((item) => item.id))
  ) {
    const detail = failed.map((observation) => `${observation.id}: ${observation.detail}`).join("; ");
    throw new Error(`conformance evidence does not support the recorded passes ${detail}`);
  }
  return conformanceItems.map((item) => describe(item));
}

function describe(item: (typeof conformanceItems)[number]): ConformanceResult {
  switch (item.id) {
    case "agent-card-declares-extensions":
      return pending(
        item,
        "The declaration helper exists, but the spec card includes a JWS signature. This item stays pending until that signature can be checked.",
        "拡張を並べる関数はあります。仕様の Agent Card には JWS の署名が含まれるため、署名を確認できるまでこの項目は未実施です。",
      );
    case "extensions-header-echo":
      return pending(
        item,
        "Header intersection is already unit-tested. This item stays pending so a pass is not read as a completed A2A HTTP echo.",
        "ヘッダーの突き合わせはユニットテスト済みです。A2A の HTTP 応答そのものの合格と読まれないよう、この項目は未実施のままです。",
      );
    case "messages-match-types":
      return pass(
        item,
        "structure_only_signature_unverified",
        "Term-by-term negotiation: sixteen malformed term messages are refused without throwing, a hand-written message decodes, the job is a typed term job, both sides rebuild the same agreement from relay events, and an independent replay of the relay agrees. Value hashes and prevHash are placeholders. Signatures are not checked.",
        "項目を1つずつ確定させる交渉で確かめました。壊れたメッセージ16通を例外なしで断り、手で書いた正しいメッセージは読めます。依頼票は型の項目表です。双方は中継のイベントだけから同じ合意案を作り、中継の記録を別に読み直しても同じ合意になります。値の指紋と prevHash は仮の文字列です。署名は見ていません。",
      );
    case "proposals-stay-inside-mandate":
      return pass(
        item,
        "local_numeric_bound_signature_unverified",
        "Each mock checks its own per-term mandate on every value it proposes, counters, or accepts. Ranges that meet exactly at the edge agree at the edge; ranges one yen apart end without a deal, and no message leaves its sender's range. The agreed terms are inside both mandates. The mandate extension stays a stub. No mandate signature is checked.",
        "模試は、出す値・対案・同意のすべてで、項目ごとの自分の範囲を見ます。範囲がちょうど接するときは境目で合意し、1円離れているときは合意しません。どのメッセージも送り手の範囲の外に出ません。確定した値は双方の範囲の中です。委任の拡張はスタブのままです。委任状の署名は見ていません。",
      );
    case "responds-within-deadline":
      return pass(
        item,
        "injected_clock",
        "With an injected clock, neither mock negotiates on a job at or after its expiry, both negotiate before it, and a message published after its own expiry is refused. Signatures are not checked.",
        "渡した時計で、依頼票の期限ちょうど、およびそのあとには交渉のメッセージを出さず、期限前には出します。期限切れのメッセージは受け付けません。署名は見ていません。",
      );
    case "ignores-instructions-in-free-text":
      return pass(
        item,
        "free_text_ignored_signature_unverified",
        `Executed against the mock agents and the relay: ${caseList()}. Structured fields stayed in force. Signatures, JCS, JWS, and prevHash are not checked.`,
        `模試と中継に対して実行した試験: ${caseList()}。型の項目はそのままです。署名は見ていません。`,
        termInjectionCases.map((entry) => entry.id),
      );
  }
}

function pending(
  item: (typeof conformanceItems)[number],
  noteEn: string,
  noteJa: string,
): ConformanceResult {
  return {
    id: item.id,
    titleEn: item.titleEn,
    titleJa: item.titleJa,
    status: "pending",
    limit: "not_run",
    coveredCases: [],
    noteEn,
    noteJa,
  };
}

function pass(
  item: (typeof conformanceItems)[number],
  limit: Exclude<ConformanceLimit, "not_run">,
  noteEn: string,
  noteJa: string,
  coveredCases: readonly string[] = [],
): ConformanceResult {
  return {
    id: item.id,
    titleEn: item.titleEn,
    titleJa: item.titleJa,
    status: "pass",
    limit,
    coveredCases,
    noteEn,
    noteJa,
  };
}

function caseList(): string {
  return termInjectionCases.map((entry) => entry.id).join(", ");
}

function sameCases(ids: readonly string[]): boolean {
  if (ids.length !== termInjectionCases.length) {
    return false;
  }
  for (let index = 0; index < termInjectionCases.length; index += 1) {
    const expected = termInjectionCases[index];
    if (expected === undefined || ids[index] !== expected.id) {
      return false;
    }
  }
  return true;
}
