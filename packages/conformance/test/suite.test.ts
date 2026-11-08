import { describe, expect, it } from "vitest";
import { createRelay } from "@ix/node";
import {
  conformanceItems,
  conformanceStatus,
  coveredExtensionUris,
  runConformance,
  runTermInjectionSuite,
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

  it("passes items 3 to 6 with mock agent signatures checked and leaves the card and header pending", async () => {
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
      ["messages-match-types", "pass", "structure_only_mock_agent_signatures"],
      ["proposals-stay-inside-mandate", "pass", "local_numeric_bound_signature_unverified"],
      ["responds-within-deadline", "pass", "injected_clock"],
      ["ignores-instructions-in-free-text", "pass", "free_text_ignored_mock_agent_signatures"],
    ]);
    for (const result of results) {
      if (result.status === "pass") {
        expect(result.noteJa.includes("見ていません")).toBe(true);
        expect(result.noteJa.includes("検証した")).toBe(false);
      }
    }
    const freeText = results[5];
    expect(freeText).toBeDefined();
    if (freeText === undefined) {
      throw new Error("missing free-text result");
    }
    expect(freeText.coveredCases).toEqual([
      "note-cannot-set-price",
      "note-cannot-raise-cap",
      "description-cannot-lower-floor",
      "description-cannot-preset-terms",
      "description-cannot-change-deadline",
      "note-cannot-count-as-accept",
      "note-cannot-skip-approval",
      "note-cannot-verify-signature",
      "note-cannot-change-currency",
      "note-cannot-substitute-counterparty",
      "note-cannot-reset-rounds",
      "note-cannot-reopen-fixed-term",
      "note-cannot-drop-required-term",
      "note-contact-is-redacted",
      "description-contact-is-redacted",
      "decline-reason-cannot-mean-accept",
      "label-cannot-rewrite-terms",
      "expired-note-is-not-applied",
    ]);
    for (const id of freeText.coveredCases) {
      expect(freeText.noteJa.includes(id)).toBe(true);
      expect(freeText.noteEn.includes(id)).toBe(true);
    }
  });

  it("runs every term injection case through the mock agents and the relay, and each one holds", async () => {
    const observations = await runTermInjectionSuite((now) =>
      createRelay({
        mode: "open",
        clock: { now: () => now },
        store: createConformanceStore(),
      }),
    );
    expect(observations.map((item) => item.id)).toEqual([
      "note-cannot-set-price",
      "note-cannot-raise-cap",
      "description-cannot-lower-floor",
      "description-cannot-preset-terms",
      "description-cannot-change-deadline",
      "note-cannot-count-as-accept",
      "note-cannot-skip-approval",
      "note-cannot-verify-signature",
      "note-cannot-change-currency",
      "note-cannot-substitute-counterparty",
      "note-cannot-reset-rounds",
      "note-cannot-reopen-fixed-term",
      "note-cannot-drop-required-term",
      "note-contact-is-redacted",
      "description-contact-is-redacted",
      "decline-reason-cannot-mean-accept",
      "label-cannot-rewrite-terms",
      "expired-note-is-not-applied",
    ]);
    for (const observation of observations) {
      expect([observation.id, observation.ok, observation.detail]).toEqual([observation.id, true, observation.detail]);
    }
  });
});
