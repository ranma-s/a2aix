export const protocolCoreStatus = "stub" as const;

export const extensionUris = {
  negotiation: "https://w3id.org/a2a-job/ext/negotiation/v1",
  mandate: "https://w3id.org/a2a-job/ext/mandate/v1",
  approval: "https://w3id.org/a2a-job/ext/approval/v1",
  transcript: "https://w3id.org/a2a-job/ext/transcript/v1",
} as const;

export type ExtensionName = keyof typeof extensionUris;

export { CanonicalHashError } from "./hash-error.js";
export {
  canonicalBodyHash,
  hashCanonicalBody,
  verifyCanonicalBodyHash,
} from "./hash.js";
