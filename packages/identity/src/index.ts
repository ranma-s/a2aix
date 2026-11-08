export const keyHandling = "verify-only" as const;

export type PublicIdentityRef = {
  readonly did: string;
};

export function refuseKeyOperation(operation: string): never {
  throw new Error(
    `Refusing identity operation "${operation}". Key generation, storage, and signing need a human security reviewer before implementation.`,
  );
}

export { base58btcDecode, base58btcEncode, base64UrlDecode, base64UrlEncode, isWellFormedText } from "./encoding.js";
export {
  didKeyFromEd25519,
  ed25519FromDidKey,
  ed25519PublicKeyLength,
  ed25519SignatureLength,
  isUsableEd25519PublicKey,
  jwsAlgorithm,
  verifyDetachedJws,
  verifyEd25519,
} from "./signature.js";
export type { DetachedJwsResult } from "./signature.js";
