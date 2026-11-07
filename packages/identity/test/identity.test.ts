import { describe, expect, it } from "vitest";
import {
  base58btcDecode,
  base58btcEncode,
  base64UrlDecode,
  base64UrlEncode,
  didKeyFromEd25519,
  ed25519FromDidKey,
  keyHandling,
  refuseKeyOperation,
  verifyDetachedJws,
  verifyEd25519,
} from "../src/index.js";

function hex(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 2) {
    bytes.push(Number.parseInt(text.slice(index, index + 2), 16));
  }
  return Uint8Array.from(bytes);
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function header(value: string): string {
  return base64UrlEncode(utf8(value));
}

const rfc8032 = [
  {
    publicKey: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    message: "",
    signature: "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
  },
  {
    publicKey: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
    message: "72",
    signature: "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
  },
];

const rfc8037PublicKey = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
const rfc8037SigningInput = "eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc";
const rfc8037Signature = "hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg";
const sampleDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";
const samplePayload = '{"from":"worker","termId":"ix:price","type":"TermPropose","value":{"amount":180000,"currency":"JPY","taxIncluded":true}}';
const sampleJws =
  "eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDprZXk6ejZNa3R3dXBkbUxYVlZxVHpDdzRpNDZyNHVHeW9zR1hSblIzWGpONFpxN29NTXN3In0..9HT0SzHogdj-nulbUSo98mJJGSxUY2I7P80TgMVzOiwvESJNRXOl1-wQJb_Cn3lHQesMgxyYzDHt97mRb5T3DQ";

function rfcKey(): Uint8Array {
  const key = base64UrlDecode(rfc8037PublicKey);
  if (key === undefined) {
    throw new Error("fixture");
  }
  return key;
}

describe("identity", () => {
  it("verifies but never creates keys or signatures", () => {
    expect(keyHandling).toBe("verify-only");
    expect(() => refuseKeyOperation("generate")).toThrow(/security reviewer/);
  });

  it("verifies the RFC 8032 Ed25519 vectors and rejects a changed message", async () => {
    for (const vector of rfc8032) {
      expect(await verifyEd25519(hex(vector.publicKey), hex(vector.signature), hex(vector.message))).toBe(true);
      expect(await verifyEd25519(hex(vector.publicKey), hex(vector.signature), hex(`${vector.message}00`))).toBe(false);
    }
  });

  it("verifies the RFC 8037 EdDSA JWS signature and rejects a changed character", async () => {
    const signature = base64UrlDecode(rfc8037Signature);
    if (signature === undefined) {
      throw new Error("fixture");
    }
    expect(await verifyEd25519(rfcKey(), signature, utf8(rfc8037SigningInput))).toBe(true);
    expect(await verifyEd25519(rfcKey(), signature, utf8(`${rfc8037SigningInput.slice(0, -1)}h`))).toBe(false);
    expect(await verifyEd25519(rfcKey().slice(1), signature, utf8(rfc8037SigningInput))).toBe(false);
    expect(await verifyEd25519(rfcKey(), signature.slice(1), utf8(rfc8037SigningInput))).toBe(false);
  });

  it("names the RFC 8037 public key as a did:key and reads it back", () => {
    expect(didKeyFromEd25519(rfcKey())).toBe(sampleDid);
    expect(ed25519FromDidKey(sampleDid)).toEqual(rfcKey());
    expect(ed25519FromDidKey(`${sampleDid}#${sampleDid.slice("did:key:".length)}`)).toEqual(rfcKey());
    expect(ed25519FromDidKey(`${sampleDid}#other`)).toBeUndefined();
    expect(ed25519FromDidKey(sampleDid.replace("z6Mk", "z6Mm"))).toBeUndefined();
    expect(ed25519FromDidKey(`did:key:z${base58btcEncode(Uint8Array.from([0xe7, 0x01, ...rfcKey()]))}`)).toBeUndefined();
    expect(ed25519FromDidKey("did:web:example.com")).toBeUndefined();
  });

  it("verifies a detached EdDSA JWS whose kid is the expected did:key", async () => {
    expect(await verifyDetachedJws({ jws: sampleJws, payload: samplePayload, expectedKid: sampleDid })).toEqual({ ok: true, kid: sampleDid });
  });

  it("rejects a changed payload, another key, an attached payload, and a loose header", async () => {
    const checks: readonly (readonly [string, string, string, RegExp])[] = [
      [sampleJws, samplePayload.replace("180000", "180001"), sampleDid, /does not verify/],
      [sampleJws, samplePayload, "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", /not the expected key/],
      [`${rfc8037SigningInput}.${rfc8037Signature}`, "Example of Ed25519 signing", sampleDid, /detached payload/],
      [`${header('{"alg":"EdDSA"}')}..${rfc8037Signature}`, "x", sampleDid, /exactly alg and kid/],
      [`${header(`{"alg":"EdDSA","kid":"${sampleDid}","b64":false}`)}..${rfc8037Signature}`, "x", sampleDid, /exactly alg and kid/],
      [`${header(`{"alg":"ES256","kid":"${sampleDid}"}`)}..${rfc8037Signature}`, "x", sampleDid, /alg must be EdDSA/],
      [`${header(`{"alg":"EdDSA","kid":"${sampleDid}","kid":"${sampleDid}"}`)}..${rfc8037Signature}`, "x", sampleDid, /not JSON/],
      [`${header('{"alg":"EdDSA","kid":"did:web:example.com"}')}..${rfc8037Signature}`, "x", "did:web:example.com", /not an Ed25519 did:key/],
      [`${sampleJws.split("..")[0] ?? ""}..${rfc8037Signature}=`, samplePayload, sampleDid, /not base64url/],
      [`${sampleJws}.x`, samplePayload, sampleDid, /detached payload/],
    ];
    for (const [jws, payload, expectedKid, reason] of checks) {
      const result = await verifyDetachedJws({ jws, payload, expectedKid });
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.reason).toMatch(reason);
    }
  });

  it("encodes and decodes base64url and base58btc strictly", () => {
    const bytes = Uint8Array.from([0, 0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
    expect(base58btcDecode(base58btcEncode(bytes))).toEqual(bytes);
    expect(base64UrlEncode(utf8("Example of Ed25519 signing"))).toBe("RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc");
    expect(base64UrlDecode("AB")).toBeUndefined();
    expect(base64UrlDecode("AA==")).toBeUndefined();
    expect(base64UrlDecode("A")).toBeUndefined();
    expect(base64UrlDecode("A+/A")).toBeUndefined();
    expect(base58btcDecode("0OIl")).toBeUndefined();
  });
});
