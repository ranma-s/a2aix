import { formatExtensionHeader, profileExtensionOrder } from "@ix/protocol-core";

export const jobKind = "JobPosting/1" as const;
export const negotiationKind = "x-mock/negotiation-message" as const;
export const jobTag = "x-job" as const;
export const unverifiedSig = "unverified-placeholder" as const;
export const signatureMaterial = "unverified-placeholder" as const;
export const specCurrency = "JPY" as const;

export function unverifiedTranscript(amount: number): string {
  return `transcript-unverified-${String(amount)}`;
}
export const posterIssuer = "did:example:poster" as const;
export const workerIssuer = "did:example:worker" as const;
export const credentialPlaceholder = "credential-placeholder" as const;

export const mockExtensionsHeader = formatExtensionHeader(profileExtensionOrder);
