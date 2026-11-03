import type { Clock } from "@ix/a2a-ext-negotiation";
import type { MockJob, PosterBound, WorkerBound } from "./types.js";

export const sampleNow = "2026-11-04T00:00:00.000Z" as const;

export const sampleProposalNote = "平日夜と土曜に対応できます";

export const sampleJob: MockJob = {
  jobId: "job-1024",
  title: "新サービスLPの構成案とコピー",
  scope: "新サービスLPの構成案とコピー（3案）",
  deliverables: ["構成案（PDF）", "コピー（Googleドキュメント）"],
  budgetMax: { amount: 180000, currency: "JPY", taxIncluded: false },
  maxRoundTrips: 3,
  expiresAt: "2026-11-20T00:00:00.000Z",
  hoursPerWeek: 10,
  deadline: "2026-12-10",
  acceptanceCriteria: "納品から7日以内に検収",
  revisionLimit: 2,
  localRules: "jp-freelance/1.0",
  localTerms: {
    paymentDueDate: "2027-01-31",
    ipOwnership: "検収と支払い後に発注者へ移転",
  },
};

export const samplePosterBound: PosterBound = {
  maxAmount: { amount: 200000, currency: "JPY", taxIncluded: false },
};

export const sampleWorkerBound: WorkerBound = {
  minAmount: { amount: 100000, currency: "JPY", taxIncluded: false },
  maxHoursPerWeek: 20,
  excludedWork: ["常駐"],
};

export function clockAt(now: string): Clock {
  return {
    now() {
      return now;
    },
  };
}

export function sampleJobWith(patch: {
  readonly budgetAmount?: number;
  readonly scope?: string;
  readonly hoursPerWeek?: number;
}): MockJob {
  return {
    jobId: sampleJob.jobId,
    title: sampleJob.title,
    scope: patch.scope ?? sampleJob.scope,
    deliverables: sampleJob.deliverables,
    budgetMax: {
      amount: patch.budgetAmount ?? sampleJob.budgetMax.amount,
      currency: sampleJob.budgetMax.currency,
      taxIncluded: sampleJob.budgetMax.taxIncluded,
    },
    maxRoundTrips: sampleJob.maxRoundTrips,
    expiresAt: sampleJob.expiresAt,
    hoursPerWeek: patch.hoursPerWeek ?? sampleJob.hoursPerWeek,
    deadline: sampleJob.deadline,
    acceptanceCriteria: sampleJob.acceptanceCriteria,
    revisionLimit: sampleJob.revisionLimit,
    localRules: sampleJob.localRules,
    localTerms: sampleJob.localTerms,
  };
}
