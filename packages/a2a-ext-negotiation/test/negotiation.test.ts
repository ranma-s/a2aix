import { describe, expect, it } from "vitest";
import { extensionUris } from "@ix/protocol-core";
import { requiredExtensionUris, status, uri } from "../src/index.js";

describe("negotiation extension", () => {
  it("requires mandate, approval, and transcript and does not negotiate", () => {
    expect(status).toBe("stub");
    expect(uri).toBe(extensionUris.negotiation);
    expect(requiredExtensionUris).toEqual([
      extensionUris.mandate,
      extensionUris.approval,
      extensionUris.transcript,
    ]);
  });
});
