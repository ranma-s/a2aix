import type { LocalTerms, Money, NoDealReason, UnverifiedSignature } from "@ix/a2a-ext-negotiation";

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
  readonly agentCard: string;
  readonly title: string;
  readonly description: string;
  readonly scope: string;
  readonly deliverables: readonly string[];
  readonly budgetMin: Money;
  readonly budgetMax: Money;
  readonly requiredSkills: readonly string[];
  readonly maxRoundTrips: number;
  readonly expiresAt: string;
  readonly hoursPerWeek: number;
  readonly deadline: string;
  readonly acceptanceCriteria: string;
  readonly revisionLimit: number;
  readonly localRules: string;
  readonly localTerms: LocalTerms;
  readonly signature: UnverifiedSignature;
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
  readonly round: number;
  readonly maxRoundTrips: number;
  readonly shownFreeText: readonly string[];
  readonly refusals: readonly Refusal[];
};
