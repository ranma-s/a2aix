import { describe, expect, it } from "vitest";
import { adapterRecognizesMode, adapterStatus } from "../src/index.js";

describe("adapters", () => {
  it("is a stub that can see the node mode only", () => {
    expect(adapterStatus).toBe("stub");
    expect(adapterRecognizesMode("open")).toBe(true);
    expect(adapterRecognizesMode("closed")).toBe(true);
    expect(adapterRecognizesMode("public")).toBe(false);
  });
});
