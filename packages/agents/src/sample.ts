import type { Clock } from "@ix/a2a-ext-negotiation";
import { signatureMaterial } from "./kinds.js";
import type { MockJob, PosterBound, WorkerBound } from "./types.js";

export const sampleNow = "2026-11-04T00:00:00.000Z" as const;

export const sampleProposalNote = "平日夜と土曜に対応できます";

export const sampleCard = "https://agent.example.com/.well-known/agent-card.json";

export const sampleJob: MockJob = {
  jobId: "job-1024",
  agentCard: sampleCard,
  title: "新サービスLPの構成案とコピー",
  description: "新サービスの案内ページに使う構成と文章を作る仕事です。",
  scope: "新サービスLPの構成案とコピー（3案）",
  deliverables: ["構成案（PDF）", "コピー（Googleドキュメント）"],
  budgetMin: { amount: 150000, currency: "JPY", taxIncluded: false },
  budgetMax: { amount: 180000, currency: "JPY", taxIncluded: false },
  requiredSkills: ["esco:copywriting"],
  maxRoundTrips: 3,
  expiresAt: "2026-11-20T00:00:00.000Z",
  hoursPerWeek: 10,
  deadline: "2026-12-10T00:00:00.000Z",
  acceptanceCriteria: "納品から7日以内に検収",
  revisionLimit: 2,
  localRules: "jp-freelance/1.0",
  localTerms: {
    paymentDueDate: "2027-01-31T00:00:00.000Z",
    ipOwnership: "検収と支払い後に発注者へ移転",
  },
  signature: { verification: "deferred", material: signatureMaterial },
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
  readonly description?: string;
}): MockJob {
  const amount = patch.budgetAmount ?? sampleJob.budgetMax.amount;
  const minimum = patch.budgetAmount ?? sampleJob.budgetMin.amount;
  return {
    jobId: sampleJob.jobId,
    agentCard: sampleJob.agentCard,
    title: sampleJob.title,
    description: patch.description ?? sampleJob.description,
    scope: patch.scope ?? sampleJob.scope,
    deliverables: sampleJob.deliverables,
    budgetMin: {
      amount: minimum,
      currency: sampleJob.budgetMin.currency,
      taxIncluded: sampleJob.budgetMin.taxIncluded,
    },
    budgetMax: {
      amount,
      currency: sampleJob.budgetMax.currency,
      taxIncluded: sampleJob.budgetMax.taxIncluded,
    },
    requiredSkills: sampleJob.requiredSkills,
    maxRoundTrips: sampleJob.maxRoundTrips,
    expiresAt: sampleJob.expiresAt,
    hoursPerWeek: patch.hoursPerWeek ?? sampleJob.hoursPerWeek,
    deadline: sampleJob.deadline,
    acceptanceCriteria: sampleJob.acceptanceCriteria,
    revisionLimit: sampleJob.revisionLimit,
    localRules: sampleJob.localRules,
    localTerms: sampleJob.localTerms,
    signature: sampleJob.signature,
  };
}
