import { extensionUris } from "@ix/protocol-core";

export const conformanceStatus = "placeholder" as const;

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

export type ConformanceResult = {
  readonly id: ConformanceItemId;
  readonly titleEn: string;
  readonly titleJa: string;
  readonly status: "pending";
};

export function runConformance(): readonly ConformanceResult[] {
  return conformanceItems.map((item) => {
    const result: ConformanceResult = {
      id: item.id,
      titleEn: item.titleEn,
      titleJa: item.titleJa,
      status: "pending",
    };
    return result;
  });
}
