import { describe, expect, it } from "vitest";
import { knownRecordKind, ledgerStatus } from "../src/index.js";

describe("ledger", () => {
  it("is a stub that only recognizes log record kinds", () => {
    expect(ledgerStatus).toBe("stub");
    expect(knownRecordKind("AgreementRecord")).toBe(true);
    expect(knownRecordKind("ReviewCommit")).toBe(true);
    expect(knownRecordKind("Payment")).toBe(false);
  });
});
