import { describe, expect, it } from "vitest";
import { CanonicalizationError, canonicalize } from "@ix/jcs";
import {
  CanonicalHashError,
  canonicalBodyHash,
  hashCanonicalBody,
  hashExcludingSignature,
  hashExcludingSignatureJson,
  signingInputExcludingSignature,
  signingInputFromJson,
  verifyCanonicalBodyHash,
} from "../src/index.js";
import { JsonParseError } from "@ix/jcs";

const rfcSample = {
  numbers: [Number("333333333.33333329"), 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
  string: "\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"/",
  literals: [null, true, false],
};

const rfcCanonical =
  "{\"literals\":[null,true,false],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27],\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\\\\\"/\"}";

const rfcHash = "2d5e01a318d0f0879ab568c4be289c8b1f64ef8921a53c6277d5e069978baacb";

const utf16Order = {
  "\u20ac": "Euro Sign",
  "\r": "Carriage Return",
  "\ufb33": "Hebrew Letter Dalet With Dagesh",
  "1": "One",
  "\ud83d\ude00": "Emoji: Grinning Face",
  "\u0080": "Control",
  "\u00f6": "Latin Small Letter O With Diaeresis",
};

const utf16OrderCanonical =
  "{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\u0080\":\"Control\",\"ö\":\"Latin Small Letter O With Diaeresis\",\"€\":\"Euro Sign\",\"😀\":\"Emoji: Grinning Face\",\"דּ\":\"Hebrew Letter Dalet With Dagesh\"}";

const utf16OrderHash = "5e321556d22018a9656991a9e94f77ec175fa193e52a2429d312f8419ec8b08c";

const nested = {
  b: { d: 1, c: [3, 2, 1] },
  a: [{ z: true, y: null }, false],
};

const nestedCanonical = '{"a":[{"y":null,"z":true},false],"b":{"c":[3,2,1],"d":1}}';
const nestedHash = "4123164b2d465884bbf65fe7e37674d8e484408700692997cf8f44df11ac22b3";

const proposal = {
  type: "Proposal",
  jobId: "job-1",
  price: { amount: 500000, currency: "JPY", taxIncluded: true },
  note: "weekday",
};

const proposalCanonical =
  '{"jobId":"job-1","note":"weekday","price":{"amount":500000,"currency":"JPY","taxIncluded":true},"type":"Proposal"}';

const proposalHash = "2b50ba90db4abfcefcdbda55472218c3e470e22274fa3a66c3f7f965b8ddc775";

function flipLastNibble(hex: string): string {
  const last = hex[63];
  if (last === undefined) {
    throw new Error("hash must be 64 hex chars");
  }
  return `${hex.slice(0, 63)}${last === "0" ? "1" : "0"}`;
}

describe("canonical body hash", () => {
  it("names SHA-256 lowercase hex of RFC 8785 UTF-8", () => {
    expect(canonicalBodyHash).toEqual({
      canonicalization: "RFC8785",
      algorithm: "SHA-256",
      encoding: "hex",
    });
  });

  it("hashes the RFC 8785 sample bytes", async () => {
    expect(canonicalize(rfcSample)).toBe(rfcCanonical);
    await expect(hashCanonicalBody(rfcSample)).resolves.toBe(rfcHash);
    await expect(verifyCanonicalBodyHash(rfcSample, rfcHash)).resolves.toBe(true);
  });

  it("hashes the UTF-16 sort sample and a nested value", async () => {
    expect(canonicalize(utf16Order)).toBe(utf16OrderCanonical);
    await expect(hashCanonicalBody(utf16Order)).resolves.toBe(utf16OrderHash);
    expect(canonicalize(nested)).toBe(nestedCanonical);
    await expect(hashCanonicalBody(nested)).resolves.toBe(nestedHash);
  });

  it("hashes small canonical texts", async () => {
    await expect(hashCanonicalBody({})).resolves.toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
    await expect(hashCanonicalBody([])).resolves.toBe(
      "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    );
    await expect(hashCanonicalBody(0)).resolves.toBe(
      "5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9",
    );
    await expect(hashCanonicalBody(-0)).resolves.toBe(
      "5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9",
    );
    await expect(hashCanonicalBody("abc")).resolves.toBe(
      "6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25",
    );
  });

  it("gives one hash to values that differ only by key order", async () => {
    await expect(hashCanonicalBody({ b: 1, a: 2 })).resolves.toBe(
      await hashCanonicalBody({ a: 2, b: 1 }),
    );
  });

  it("uses canonical text without the top-level signature as the signing input, not the hash", async () => {
    const signed = { ...proposal, signature: "sig" };
    const input = signingInputExcludingSignature(signed);
    expect(input).toBe(proposalCanonical);
    expect(input.includes("signature")).toBe(false);
    expect(/^[0-9a-f]{64}$/.test(input)).toBe(false);
    const bareHash = await hashCanonicalBody(signed);
    expect(bareHash).not.toBe(input);
    expect(bareHash).not.toBe(proposalHash);
    await expect(hashExcludingSignature(signed)).resolves.toBe(proposalHash);
    expect(signingInputFromJson('{"signature":"sig","type":"Proposal","jobId":"job-1","note":"weekday","price":{"amount":500000,"currency":"JPY","taxIncluded":true}}')).toBe(
      proposalCanonical,
    );
    await expect(
      hashExcludingSignatureJson(
        '{"signature":"sig","note":{"signature":"keep"},"a":1}',
      ),
    ).resolves.toBe(await hashCanonicalBody({ a: 1, note: { signature: "keep" } }));
    await expect(hashExcludingSignatureJson('{"a":1,"a":2}')).rejects.toBeInstanceOf(JsonParseError);
    await expect(hashExcludingSignatureJson("9007199254740993")).rejects.toBeInstanceOf(
      JsonParseError,
    );
  });

  it("hashes a proposal-shaped body and does not remove signature", async () => {
    expect(canonicalize(proposal)).toBe(proposalCanonical);
    await expect(hashCanonicalBody(proposal)).resolves.toBe(proposalHash);
    await expect(verifyCanonicalBodyHash(proposal, proposalHash)).resolves.toBe(true);
    await expect(
      verifyCanonicalBodyHash({ ...proposal, signature: "sig" }, proposalHash),
    ).resolves.toBe(false);
  });

  it("fails verification when the body, the hash, or the encoding is tampered", async () => {
    const tamperedPrice = {
      ...proposal,
      price: { amount: 500001, currency: "JPY", taxIncluded: true },
    };
    await expect(verifyCanonicalBodyHash(tamperedPrice, proposalHash)).resolves.toBe(false);
    await expect(verifyCanonicalBodyHash([1, 2], await hashCanonicalBody([2, 1]))).resolves.toBe(
      false,
    );
    await expect(verifyCanonicalBodyHash(rfcSample, flipLastNibble(rfcHash))).resolves.toBe(
      false,
    );
    await expect(verifyCanonicalBodyHash(rfcSample, rfcHash.toUpperCase())).resolves.toBe(false);
    await expect(verifyCanonicalBodyHash(rfcSample, rfcHash.slice(0, 63))).resolves.toBe(false);
    await expect(verifyCanonicalBodyHash(rfcSample, "")).resolves.toBe(false);
    await expect(verifyCanonicalBodyHash(rfcSample, ` ${rfcHash}`)).resolves.toBe(false);
    await expect(verifyCanonicalBodyHash("\u00e9", await hashCanonicalBody("e\u0301"))).resolves.toBe(
      false,
    );
  });

  it("throws when the value cannot be canonicalized, including for a well-formed expected hash", async () => {
    await expect(verifyCanonicalBodyHash({ a: undefined }, "a".repeat(64))).rejects.toBeInstanceOf(
      CanonicalizationError,
    );
    await expect(hashCanonicalBody(Number.NaN)).rejects.toBeInstanceOf(CanonicalizationError);
  });

  it("keeps the hash failure code", () => {
    const error = new CanonicalHashError("digest");
    expect(error.code).toBe("CANONICAL_HASH_FAILED");
    expect(error.name).toBe("CanonicalHashError");
    expect(error.message).toContain("SHA-256");
  });

  it("builds the event signing input from every field except id and sig", async () => {
    const { eventSigningInput } = await import("../src/index.js");
    const event = { id: "x", sig: "y", issuer: "did:key:z", kind: "k", tags: [["t", "v"]] as const, createdAt: "a", expiresAt: "b", body: { b: 1, a: 2 } };
    expect(eventSigningInput(event)).toBe('{"body":{"a":2,"b":1},"createdAt":"a","expiresAt":"b","issuer":"did:key:z","kind":"k","tags":[["t","v"]]}');
  });
});
