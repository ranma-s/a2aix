import { describe, expect, it } from "vitest";
import { createRelay } from "@ix/node";
import {
  conformanceItems,
  conformanceStatus,
  coveredExtensionUris,
  runConformance,
  runInjectionSuite,
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

  it("passes items 3 to 6 without a signature check and leaves the card and header pending", async () => {
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
      ["ignores-instructions-in-free-text", "pass", "free_text_ignored_signature_unverified"],
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
      "description-cannot-add-excluded-work",
      "description-cannot-raise-hours",
      "note-cannot-ignore-deadline",
      "note-cannot-reply-after-deadline",
      "free-text-cannot-enter-agreement",
      "comment-cannot-flip-reject",
      "note-cannot-verify-signature",
      "note-cannot-force-decline",
      "counter-note-cannot-rewrite-decision",
      "note-cannot-reset-rounds",
      "title-cannot-rewrite-terms",
      "skills-cannot-rewrite-terms",
      "deliverables-cannot-carry-contact",
      "note-cannot-change-currency",
      "note-cannot-substitute-counterparty",
    ]);
    for (const id of freeText.coveredCases) {
      expect(freeText.noteJa.includes(id)).toBe(true);
      expect(freeText.noteEn.includes(id)).toBe(true);
    }
  });

  it("records a distinct observation for every injection case and defers cryptography", async () => {
    const suite = await runInjectionSuite((now) =>
      createRelay({
        mode: "open",
        clock: { now: () => now },
        store: createConformanceStore(),
      }),
    );
    expect(suite.observations.map((item) => item.id)).toEqual([
      "note-cannot-set-price",
      "note-cannot-raise-cap",
      "description-cannot-lower-floor",
      "description-cannot-add-excluded-work",
      "description-cannot-raise-hours",
      "note-cannot-ignore-deadline",
      "note-cannot-reply-after-deadline",
      "free-text-cannot-enter-agreement",
      "comment-cannot-flip-reject",
      "note-cannot-verify-signature",
      "note-cannot-force-decline",
      "counter-note-cannot-rewrite-decision",
      "note-cannot-reset-rounds",
      "title-cannot-rewrite-terms",
      "skills-cannot-rewrite-terms",
      "deliverables-cannot-carry-contact",
      "note-cannot-change-currency",
      "note-cannot-substitute-counterparty",
    ]);
    const details = new Set(suite.observations.map((item) => item.detail));
    expect(details.size).toBe(suite.observations.length);
    expect(suite.observations.map((item) => item.detail)).toEqual([
      "note-cannot-set-price price:180000",
      "note-cannot-raise-cap declined",
      "description-cannot-lower-floor outside_mandate",
      "description-cannot-add-excluded-work scope-unchanged",
      "description-cannot-raise-hours hours:10",
      "note-cannot-ignore-deadline deadline:2026-12-10T00:00:00.000Z",
      "note-cannot-reply-after-deadline seen-and-expired",
      "free-text-cannot-enter-agreement contact-redacted",
      "comment-cannot-flip-reject clientDecision:reject",
      "note-cannot-verify-signature deferred-and-refused",
      "note-cannot-force-decline agreed:180000",
      "counter-note-cannot-rewrite-decision reason:declined",
      "note-cannot-reset-rounds round:1/3",
      "title-cannot-rewrite-terms jpy:180000:2026-12-10T00:00:00.000Z",
      "skills-cannot-rewrite-terms jpy:180000",
      "deliverables-cannot-carry-contact scrubbed",
      "note-cannot-change-currency JPY",
      "note-cannot-substitute-counterparty issuers:poster,worker",
    ]);
    expect(suite.verify.deferred.map((check) => [check.name, check.status])).toEqual([
      ["signature", "deferred"],
      ["jcs", "deferred"],
      ["jws", "deferred"],
      ["prevHash", "deferred"],
    ]);
  });
});
