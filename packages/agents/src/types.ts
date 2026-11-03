import type { Money, NoDealReason } from "@ix/a2a-ext-negotiation";
import type { LocalTerms } from "@ix/a2a-ext-negotiation";

export const refusalReasons = [
  "outside_mandate",
  "deadline",
  "bad_message",
  "extensions_inactive",
  "publish_failed",
  "closed",
  "not_applied",
] as const;

export type RefusalReason = (typeof refusalReasons)[number];

export type Refusal = {
  readonly reason: RefusalReason;
  readonly detail: string;
};

export type MockJob = {
  readonly jobId: string;
  readonly title: string;
  readonly scope: string;
  readonly deliverables: readonly string[];
  readonly budgetMax: Money;
  readonly maxRoundTrips: number;
  readonly expiresAt: string;
  readonly hoursPerWeek: number;
  readonly deadline: string;
  readonly acceptanceCriteria: string;
  readonly revisionLimit: number;
  readonly localRules: string;
  readonly localTerms: LocalTerms;
};

export type PosterBound = {
  readonly maxAmount: Money;
};

export type WorkerBound = {
  readonly minAmount: Money;
  readonly maxHoursPerWeek: number;
  readonly excludedWork: readonly string[];
};

export type SideSnapshot = {
  readonly phase: "idle" | "negotiating" | "awaiting_approval" | "agreed" | "no_deal";
  readonly reason: NoDealReason | null;
  readonly refusals: readonly Refusal[];
};
