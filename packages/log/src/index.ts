export const transparencyLog = "stub" as const;

export const recordKinds = [
  "AgreementRecord",
  "OutcomeRecord",
  "ReviewCommit",
  "ReviewReveal",
] as const;

export type RecordKind = (typeof recordKinds)[number];

export function proveInclusion(recordId: string): never {
  throw new Error(
    `Inclusion proofs are not implemented (record: ${recordId}). @ix/log is a stub.`,
  );
}
