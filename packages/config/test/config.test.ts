import { describe, expect, it } from "vitest";
import { isNodeMode, readNodeMode } from "../src/index.js";

describe("node mode", () => {
  it("accepts open and closed", () => {
    expect(readNodeMode("open")).toBe("open");
    expect(readNodeMode("closed")).toBe("closed");
    expect(isNodeMode("open")).toBe(true);
    expect(isNodeMode("closed")).toBe(true);
  });

  it("rejects any other mode", () => {
    expect(isNodeMode("public")).toBe(false);
    expect(() => readNodeMode("public")).toThrow(/must be "open" or "closed"/);
  });
});
