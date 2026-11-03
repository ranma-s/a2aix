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
  await proveMessages(openBoard);
  await proveMandate(openBoard);
  await proveDeadline(openBoard);
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
        "Required fields, money, and time match the type rules. The signature slot must say deferred. JWS, JCS, and prevHash digests are not checked.",
        "必須項目、金額、日時が型に合うことと、署名欄が deferred であることを見ました。JWS、JCS、prevHash のハッシュは見ていません。署名の正しさは未確認です。",
      );
    case "proposals-stay-inside-mandate":
      return pass(
        item,
        "local_numeric_bound_signature_unverified",
        "The mock keeps a private numeric bound and does not send an offer outside it. The mandate extension stays a stub. No mandate signature is checked.",
        "模試の係は、自分の数値の上限・下限の外には提案も受諾も出しません。委任の拡張はスタブのままです。委任状の署名は見ていません。",
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
