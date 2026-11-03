import type { JsonValue } from "@ix/distribution";
import type { VerifyBounds } from "./bounds.js";
import { checkBounds } from "./bounds.js";
import { checkDeadlines } from "./deadlines.js";
import { deferredChecks } from "./deferred.js";
import { parseMessages } from "./schema.js";
import { replayTranscript } from "./replay.js";

export { checkBounds } from "./bounds.js";
export type { BoundResult, VerifyBounds } from "./bounds.js";
export { checkDeadlines } from "./deadlines.js";
export type { DeadlineResult } from "./deadlines.js";
export { checkJcs, checkJws, checkPrevHash, checkSignature, deferredCheckNames, deferredChecks } from "./deferred.js";
export type { DeferredCheck, DeferredCheckName } from "./deferred.js";
export { checkMessageSchema, parseMessages } from "./schema.js";
export type { SchemaResult, VerifyMessage } from "./schema.js";
export { replayTranscript } from "./replay.js";
export type { ReplayResult, ReplayStep } from "./replay.js";

export const verifyStatus = "non_cryptographic" as const;

export type VerifyReport = {
  readonly schema: "pass" | "fail";
  readonly replay: "pass" | "fail";
  readonly bounds: "pass" | "fail";
  readonly deadlines: "pass" | "fail";
  readonly phase: string;
  readonly schemaCount: number;
  readonly detail: string;
  readonly deferred: ReturnType<typeof deferredChecks>;
};

export function verifyTranscript(input: {
  readonly jobId: string;
  readonly maxRoundTrips: number;
  readonly expiresAt: string;
  readonly now: string;
  readonly messages: readonly JsonValue[];
  readonly bounds: VerifyBounds;
  readonly signature: string;
  readonly jws: string;
  readonly prevHash: string;
  readonly jcsBody: JsonValue;
}): VerifyReport {
  const deferred = deferredChecks({
    signature: input.signature,
    jws: input.jws,
    prevHash: input.prevHash,
    jcsBody: input.jcsBody,
  });
  const parsed = parseMessages(input.messages);
  if (!parsed.ok) {
    return report("fail", "fail", "fail", "fail", "", 0, `schema failed at ${String(parsed.index)}`, deferred);
  }
  const replay = replayTranscript({
    jobId: input.jobId,
    maxRoundTrips: input.maxRoundTrips,
    expiresAt: input.expiresAt,
    now: input.now,
    messages: parsed.messages,
  });
  const bounds = checkBounds(parsed.messages, input.bounds);
  const deadlines = checkDeadlines(parsed.messages, input.now);
  return report(
    "pass",
    replay.ok ? "pass" : "fail",
    bounds.ok ? "pass" : "fail",
    deadlines.ok ? "pass" : "fail",
    replay.ok ? replay.phase : "",
    parsed.messages.length,
    firstDetail(replay.ok ? "" : replay.detail, bounds.ok ? "" : bounds.detail, deadlines.ok ? "" : deadlines.detail),
    deferred,
  );
}

function firstDetail(replay: string, bounds: string, deadlines: string): string {
  if (replay.length > 0) {
    return replay;
  }
  if (bounds.length > 0) {
    return bounds;
  }
  return deadlines;
}

function report(
  schema: "pass" | "fail",
  replay: "pass" | "fail",
  bounds: "pass" | "fail",
  deadlines: "pass" | "fail",
  phase: string,
  schemaCount: number,
  detail: string,
  deferred: ReturnType<typeof deferredChecks>,
): VerifyReport {
  return { schema, replay, bounds, deadlines, phase, schemaCount, detail, deferred };
}
