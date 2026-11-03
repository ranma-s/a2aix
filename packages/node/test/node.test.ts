import { describe, expect, it } from "vitest";
import { describeNode, nodeStatus } from "../src/index.js";

describe("node", () => {
  it("is an in-process relay and still has no listening port", () => {
    expect(nodeStatus).toBe("local_relay");
  });

  it("treats open as a public exchange and closed as a private one", () => {
    expect(describeNode("open")).toEqual({ mode: "open", acceptsPublicPublish: true });
    expect(describeNode("closed")).toEqual({ mode: "closed", acceptsPublicPublish: false });
  });

  it("rejects an unknown mode", () => {
    expect(() => describeNode("internal")).toThrow(/must be "open" or "closed"/);
  });
});
