import { formatExtensionHeader, profileExtensionOrder } from "@ix/protocol-core";

export const jobKind = "JobPosting/1" as const;
export const negotiationKind = "x-mock/negotiation-message" as const;
export const jobTag = "x-job" as const;

export const mockExtensionsHeader = formatExtensionHeader(profileExtensionOrder);
