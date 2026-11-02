import { describe, expect, it } from "vitest";
import { proveInclusion, recordKinds, transparencyLog } from "../src/index.js";

describe("log", () => {
  it("is a stub with the four record kinds", () => {
    expect(transparencyLog).toBe("stub");
    expect(recordKinds).toEqual([
      "AgreementRecord",
      "OutcomeRecord",
      "ReviewCommit",
      "ReviewReveal",
    ]);
  });

  it("does not produce an inclusion proof", () => {
    expect(() => proveInclusion("record-1")).toThrow(/not implemented/);
  });
});
