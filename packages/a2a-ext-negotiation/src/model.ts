import { extensionUris } from "@ix/protocol-core";

export const uri = extensionUris.negotiation;
export const status = "term_machine" as const;
export const signatureVerification = "deferred" as const;

export const parties = ["client", "worker"] as const;

export type Party = (typeof parties)[number];

export type UnverifiedSignature = {
  readonly verification: typeof signatureVerification;
  readonly material: string;
};

export type Clock = {
  readonly now: () => string;
};
