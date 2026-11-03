import { extensionUris } from "@ix/protocol-core";
import type { JobBoard } from "@ix/agents";
import { proveDeadline, proveMandate, proveMessages } from "./run.js";

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
  | "injected_clock";

export type ConformanceResult = {
  readonly id: ConformanceItemId;
  readonly titleEn: string;
  readonly titleJa: string;
  readonly status: "pending" | "pass";
  readonly limit: ConformanceLimit;
  readonly noteEn: string;
  readonly noteJa: string;
};

export async function runConformance(
  openBoard: (now: string) => JobBoard,
): Promise<readonly ConformanceResult[]> {
  const messages = await proveMessages(openBoard);
  const mandate = await proveMandate(openBoard);
  await proveDeadline(openBoard);
  if (
    messages.fuzzRejected < 13 ||
    !messages.handAccepted ||
    !messages.sawJobFields ||
    !messages.sawLinkedDraft ||
    !mandate.exactCap ||
    !mandate.exactFloor ||
    !mandate.oneAboveCap ||
    !mandate.oneBelowFloor ||
    !mandate.posterBlocked250000 ||
    !mandate.workerBlocked1 ||
    !mandate.laterRoundBlocked
  ) {
    throw new Error("conformance evidence does not support the recorded passes");
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
        "Dates are RFC 3339, money is integer JPY, and a job post includes the card address, both budget ends, and required skills. The agreement placeholder contains the amount and is not a hash. Signatures are not checked.",
        "日付は RFC 3339、金額は円の整数、依頼票にはカードの住所と予算の下限と上限と必要なスキルがあります。合意のつなぎ文字には金額を含めますが、ハッシュではありません。署名は見ていません。",
      );
    case "proposals-stay-inside-mandate":
      return pass(
        item,
        "local_numeric_bound_signature_unverified",
        "The mock re-checks its private numeric bound on the opening offer, on an exact edge, on a later round, and before approval. A different amount is not the same agreement. The mandate extension stays a stub. No mandate signature is checked.",
        "模試は、最初の提案だけでなく、ちょうど上限と下限、次の往復、合意案、承認の前にも、自分の数値の範囲を見ます。金額が違えば、同じ合意としては受けません。委任の拡張はスタブのままです。委任状の署名は見ていません。",
      );
    case "responds-within-deadline":
      return pass(
        item,
        "injected_clock",
        "With an injected clock, the mock sends no negotiation message at the deadline and does send one before it. Signatures are not checked.",
        "渡した時計で、期限ちょうどには交渉のメッセージを出さず、期限前には出します。署名は見ていません。",
      );
    case "ignores-instructions-in-free-text":
      return pending(
        item,
        "The phase machine does not read note or comment, and one contradictory note is covered by a unit test. The spec's prompt-injection suite is not claimed.",
        "段階機械は自由文を読みません。矛盾したメモの単位試験はあります。仕様のプロンプトインジェクション一式は、まだ合格にしていません。",
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
    noteEn,
    noteJa,
  };
}

function pass(
  item: (typeof conformanceItems)[number],
  limit: Exclude<ConformanceLimit, "not_run">,
  noteEn: string,
  noteJa: string,
): ConformanceResult {
  return {
    id: item.id,
    titleEn: item.titleEn,
    titleJa: item.titleJa,
    status: "pass",
    limit,
    noteEn,
    noteJa,
  };
}
