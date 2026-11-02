import { describe, expect, it } from "vitest";
import { keyHandling, refuseKeyOperation } from "../src/index.js";

describe("identity", () => {
  it("does not implement key handling", () => {
    expect(keyHandling).toBe("absent");
  });

  it("refuses key operations", () => {
    expect(() => refuseKeyOperation("generate")).toThrow(/security reviewer/);
  });
});
