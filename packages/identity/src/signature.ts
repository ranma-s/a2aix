import { parseJson } from "@ix/jcs";
import { base58btcDecode, base58btcEncode, base64UrlDecode, base64UrlEncode, isWellFormedText } from "./encoding.js";

export const jwsAlgorithm = "EdDSA" as const;
export const ed25519PublicKeyLength = 32;
export const ed25519SignatureLength = 64;
const ed25519Multicodec = [0xed, 0x01] as const;
const didKeyPrefix = "did:key:z";
const fieldPrime = 2n ** 255n - 19n;
const smallOrderY: readonly bigint[] = [
  0n,
  1n,
  fieldPrime - 1n,
  littleEndian(Uint8Array.from([0x26, 0xe8, 0x95, 0x8f, 0xc2, 0xb2, 0x27, 0xb0, 0x45, 0xc3, 0xf4, 0x89, 0xf2, 0xef, 0x98, 0xf0, 0xd5, 0xdf, 0xac, 0x05, 0xd3, 0xc6, 0x33, 0x39, 0xb1, 0x38, 0x02, 0x88, 0x6d, 0x53, 0xfc, 0x05])),
  littleEndian(Uint8Array.from([0xc7, 0x17, 0x6a, 0x70, 0x3d, 0x4d, 0xd8, 0x4f, 0xba, 0x3c, 0x0b, 0x76, 0x0d, 0x10, 0x67, 0x0f, 0x2a, 0x20, 0x53, 0xfa, 0x2c, 0x39, 0xcc, 0xc6, 0x4e, 0xc7, 0xfd, 0x77, 0x92, 0xac, 0x03, 0x7a])),
];

function littleEndian(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    const byte = bytes[index] ?? 0;
    value = value * 256n + BigInt(index === 31 ? byte & 0x7f : byte);
  }
  return value;
}

export function isUsableEd25519PublicKey(publicKey: Uint8Array): boolean {
  if (publicKey.length !== ed25519PublicKeyLength) {
    return false;
  }
  const y = littleEndian(publicKey);
  return y < fieldPrime && !smallOrderY.includes(y);
}

export type DetachedJwsResult = { readonly ok: true; readonly kid: string } | { readonly ok: false; readonly reason: string };

export function didKeyFromEd25519(publicKey: Uint8Array): string | undefined {
  if (publicKey.length !== ed25519PublicKeyLength) {
    return undefined;
  }
  return `${didKeyPrefix}${base58btcEncode(Uint8Array.from([...ed25519Multicodec, ...publicKey]))}`;
}

export function ed25519FromDidKey(kid: string): Uint8Array | undefined {
  const [did, fragment, ...extra] = kid.split("#");
  if (did === undefined || extra.length > 0 || !did.startsWith(didKeyPrefix)) {
    return undefined;
  }
  const identifier = did.slice("did:key:".length);
  if (fragment !== undefined && fragment !== identifier) {
    return undefined;
  }
  const bytes = base58btcDecode(identifier.slice(1));
  if (bytes === undefined || bytes.length !== ed25519Multicodec.length + ed25519PublicKeyLength || bytes[0] !== ed25519Multicodec[0] || bytes[1] !== ed25519Multicodec[1]) {
    return undefined;
  }
  const publicKey = bytes.slice(ed25519Multicodec.length);
  return didKeyFromEd25519(publicKey) === did && isUsableEd25519PublicKey(publicKey) ? publicKey : undefined;
}

export async function verifyEd25519(publicKey: Uint8Array, signature: Uint8Array, data: Uint8Array): Promise<boolean> {
  if (!isUsableEd25519PublicKey(publicKey) || signature.length !== ed25519SignatureLength) {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", publicKey, "Ed25519", false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, signature, data);
}

function readHeader(encoded: string): { readonly kid: string } | string {
  const bytes = base64UrlDecode(encoded);
  if (bytes === undefined) {
    return "the JWS header is not base64url";
  }
  let header: unknown;
  try {
    header = parseJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch (error) {
    return `the JWS header is not JSON: ${error instanceof Error ? error.message : "unreadable"}`;
  }
  if (typeof header !== "object" || header === null || Array.isArray(header)) {
    return "the JWS header is not an object";
  }
  const names = Object.keys(header).sort();
  if (names.length !== 2 || names[0] !== "alg" || names[1] !== "kid" || !("alg" in header) || !("kid" in header)) {
    return "the JWS header must hold exactly alg and kid";
  }
  const alg: unknown = header.alg;
  const kid: unknown = header.kid;
  if (alg !== jwsAlgorithm) {
    return `the JWS alg must be ${jwsAlgorithm}`;
  }
  if (typeof kid !== "string") {
    return "the JWS kid must be text";
  }
  return { kid };
}

export async function verifyDetachedJws(input: { readonly jws: string; readonly payload: string; readonly expectedKid: string }): Promise<DetachedJwsResult> {
  if (!isWellFormedText(input.payload)) {
    return { ok: false, reason: "the payload is not well-formed Unicode text" };
  }
  const parts = input.jws.split(".");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (parts.length !== 3 || encodedHeader === undefined || encodedPayload !== "" || encodedSignature === undefined) {
    return { ok: false, reason: "the JWS must be compact with a detached payload (header..signature)" };
  }
  const header = readHeader(encodedHeader);
  if (typeof header === "string") {
    return { ok: false, reason: header };
  }
  if (header.kid !== input.expectedKid) {
    return { ok: false, reason: "the JWS kid is not the expected key" };
  }
  const publicKey = ed25519FromDidKey(header.kid);
  if (publicKey === undefined) {
    return { ok: false, reason: "the JWS kid is not a usable Ed25519 did:key" };
  }
  const signature = base64UrlDecode(encodedSignature);
  if (signature === undefined) {
    return { ok: false, reason: "the JWS signature is not base64url" };
  }
  const encoder = new TextEncoder();
  const signingInput = encoder.encode(`${encodedHeader}.${base64UrlEncode(encoder.encode(input.payload))}`);
  const valid = await verifyEd25519(publicKey, signature, signingInput);
  return valid ? { ok: true, kid: header.kid } : { ok: false, reason: "the JWS signature does not verify" };
}
