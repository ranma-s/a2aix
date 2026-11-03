import { describe, expect, it } from "vitest";
import { extensionUris, protocolCoreStatus } from "../src/index.js";

describe("protocol-core", () => {
  it("owns the four profile extension URIs", () => {
    expect(protocolCoreStatus).toBe("extensions");
  });

  it("names the four profile extensions", () => {
    expect(extensionUris).toEqual({
      negotiation: "https://w3id.org/a2a-job/ext/negotiation/v1",
      mandate: "https://w3id.org/a2a-job/ext/mandate/v1",
      approval: "https://w3id.org/a2a-job/ext/approval/v1",
      transcript: "https://w3id.org/a2a-job/ext/transcript/v1",
    });
  });
});
