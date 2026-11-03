import { describe, expect, it } from "vitest";
import { createRelay } from "@ix/node";
import {
  conformanceItems,
  conformanceStatus,
  coveredExtensionUris,
  runConformance,
} from "../src/index.js";
import { createConformanceStore } from "./store.js";

describe("conformance suite", () => {
  it("lists the six spec items and the four extension URIs", () => {
    expect(conformanceStatus).toBe("partial");
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

  it("passes only the unsigned structure, bound, and deadline items", async () => {
    const results = await runConformance((now) =>
      createRelay({
        mode: "open",
        clock: { now: () => now },
        store: createConformanceStore(),
      }),
    );
    expect(results.map((result) => [result.id, result.status, result.limit])).toEqual([
      ["agent-card-declares-extensions", "pending", "not_run"],
      ["extensions-header-echo", "pending", "not_run"],
      ["messages-match-types", "pass", "structure_only_signature_unverified"],
      ["proposals-stay-inside-mandate", "pass", "local_numeric_bound_signature_unverified"],
      ["responds-within-deadline", "pass", "injected_clock"],
      ["ignores-instructions-in-free-text", "pending", "not_run"],
    ]);
    for (const result of results) {
      if (result.status === "pass") {
        expect(result.noteJa.includes("見ていません")).toBe(true);
        expect(result.noteJa.includes("検証した")).toBe(false);
      }
    }
  });
});
