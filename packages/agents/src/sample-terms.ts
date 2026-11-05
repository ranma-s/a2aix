import type { TermMandate } from "./terms.js";
import type { TermJob } from "./term-relay.js";

export const sampleTermJob: TermJob = {
  jobId: "job-term-0001",
  sheetId: "ix:sheet/web-site",
  sheetVersion: 1,
  sheetSha256: "unverified",
  preset: [{ termId: "web:responsive", value: true }],
  roundLimitPerTerm: 3,
  description: "小さな会社のコーポレートサイト。5ページ、スマートフォン対応。",
  expiresAt: "2026-11-30T00:00:00.000Z",
};

export const sampleTermClientMandate: TermMandate = {
  "ix:price": { kind: "money-max", currency: "JPY", taxIncluded: true, ask: 150000, max: 180000 },
  "ix:deadline": { kind: "deadline-by", zone: "Asia/Tokyo", ask: "2026-12-10T18:00:00+09:00", latest: "2026-12-20T18:00:00+09:00" },
  "ix:revision-limit": { kind: "integer-range", ask: 3, min: 1, max: 3 },
  "ix:acceptance-window": { kind: "one-of", values: [{ value: 7, unit: "day" }] },
  "ix:deliverables": { kind: "one-of", values: [[{ code: "web-page", n: 5 }]] },
  "ix:deliverable-format": { kind: "one-of", values: [["text/html"]] },
  "web:page-count": { kind: "integer-range", ask: 5, min: 5, max: 5 },
  "web:responsive": { kind: "one-of", values: [true] },
};

export const sampleTermWorkerMandate: TermMandate = {
  "ix:price": { kind: "money-min", currency: "JPY", taxIncluded: true, ask: 200000, min: 170000 },
  "ix:deadline": { kind: "deadline-from", zone: "America/Los_Angeles", ask: "2026-12-25T17:00:00-08:00", earliest: "2026-12-15T01:00:00-08:00" },
  "ix:revision-limit": { kind: "integer-range", ask: 1, min: 1, max: 2 },
  "ix:acceptance-window": { kind: "one-of", values: [{ value: 7, unit: "day" }] },
  "ix:deliverables": { kind: "one-of", values: [[{ code: "web-page", n: 5 }]] },
  "ix:deliverable-format": { kind: "one-of", values: [["text/html"]] },
  "web:page-count": { kind: "integer-range", ask: 5, min: 3, max: 8 },
  "web:responsive": { kind: "one-of", values: [true] },
};
