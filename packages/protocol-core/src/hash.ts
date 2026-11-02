import { canonicalize } from "@ix/jcs";
import { CanonicalHashError } from "./hash-error.js";

export const canonicalBodyHash = {
  canonicalization: "RFC8785",
  algorithm: "SHA-256",
  encoding: "hex",
} as const;

const sha256HexPattern = /^[0-9a-f]{64}$/;

export async function hashCanonicalBody(value: unknown): Promise<string> {
  const canonical = canonicalize(value);
  return sha256Hex(new TextEncoder().encode(canonical));
}

export async function verifyCanonicalBodyHash(
  value: unknown,
  expectedHex: string,
): Promise<boolean> {
  if (!sha256HexPattern.test(expectedHex)) {
    return false;
  }
  const actual = await hashCanonicalBody(value);
  return sameHex(actual, expectedHex);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest("SHA-256", bytes);
  } catch (error: unknown) {
    throw new CanonicalHashError("Web Crypto digest failed", error);
  }
  if (digest.byteLength !== 32) {
    throw new CanonicalHashError(`digest was ${String(digest.byteLength)} bytes`);
  }
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function sameHex(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}
