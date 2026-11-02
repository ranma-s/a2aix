import { describe, expect, it } from "vitest";
import { conformanceItems, conformanceStatus, coveredExtensionUris, runConformance } from "../src/index.js";

describe("conformance placeholder", () => {
  it("lists the six spec items and the four extension URIs", () => {
    expect(conformanceStatus).toBe("placeholder");
    expect(conformanceItems.map((item) => item.id)).toEqual([
      "agent-card-declares-extensions",
      "extensions-header-echo",
      "messages-match-types",
      "proposals-stay-inside-mandate",
      "responds-within-deadline",
      "ignores-instructions-in-free-text",
    ]);
    expect(coveredExtensionUris).toEqual([
      "https://w3id.org/a2a-job/ext/negotiation/v1",
      "https://w3id.org/a2a-job/ext/mandate/v1",
      "https://w3id.org/a2a-job/ext/approval/v1",
      "https://w3id.org/a2a-job/ext/transcript/v1",
    ]);
  });

  it("does not report a pass", () => {
    const results = runConformance();
    expect(results).toHaveLength(6);
    for (const result of results) {
      expect(result.status).toBe("pending");
    }
  });
});
