export { checkJws, checkSignature, deferredCheckNames, deferredChecks } from "./deferred.js";
export type { DeferredCheck, DeferredCheckName } from "./deferred.js";
export { verifyTermTranscript } from "./terms.js";
export type { TermVerifyReport } from "./terms.js";

export const verifyStatus = "non_cryptographic" as const;
