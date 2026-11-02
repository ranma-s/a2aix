import { describe, expect, it } from "vitest";
import { adapterRecognizesMode, adapterStatus } from "../src/index.js";

describe("adapters", () => {
  it("is the in-memory store and can see the node mode", () => {
    expect(adapterStatus).toBe("memory");
    expect(adapterRecognizesMode("open")).toBe(true);
    expect(adapterRecognizesMode("closed")).toBe(true);
    expect(adapterRecognizesMode("public")).toBe(false);
  });
});
