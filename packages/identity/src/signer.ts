import { canonicalize } from "@ix/jcs";
import { base64UrlEncode, isWellFormedText } from "./encoding.js";
import { didKeyFromEd25519, jwsAlgorithm } from "./signature.js";

export type EphemeralSigner = {
  readonly did: string;
  readonly signDetached: (payload: string) => Promise<string>;
};

export async function createEphemeralSigner(): Promise<EphemeralSigner> {
  const pair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const did = didKeyFromEd25519(publicKey);
  if (did === undefined) {
    throw new Error("the platform returned an Ed25519 public key of the wrong length");
  }
  const encoder = new TextEncoder();
  const header = base64UrlEncode(encoder.encode(canonicalize({ alg: jwsAlgorithm, kid: did })));
  return {
    did,
    async signDetached(payload: string): Promise<string> {
      if (!isWellFormedText(payload)) {
        throw new Error("refusing to sign a payload that is not well-formed Unicode text");
      }
      const signingInput = encoder.encode(`${header}.${base64UrlEncode(encoder.encode(payload))}`);
      const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", pair.privateKey, signingInput));
      return `${header}..${base64UrlEncode(signature)}`;
    },
  };
}
