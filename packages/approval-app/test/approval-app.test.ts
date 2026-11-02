import { describe, expect, it } from "vitest";
import { approvalAppStatus, signApproval } from "../src/index.js";

describe("approval app", () => {
  it("is a stub", () => {
    expect(approvalAppStatus).toBe("stub");
  });

  it("refuses to sign", () => {
    expect(() => signApproval("client")).toThrow(/security reviewer/);
  });
});
