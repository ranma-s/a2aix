import { apply, openNegotiation } from "@ix/a2a-ext-negotiation";
import type { NegotiationEvent, NegotiationSession } from "@ix/a2a-ext-negotiation";
import { parseInstant } from "@ix/distribution";
import type { VerifyMessage } from "./schema.js";

export type ReplayStep = {
  readonly index: number;
  readonly from: NegotiationSession["phase"];
  readonly to: NegotiationSession["phase"];
};

export type ReplayResult =
  | {
      readonly ok: true;
      readonly phase: NegotiationSession["phase"];
      readonly round: number;
      readonly maxRoundTrips: number;
      readonly steps: readonly ReplayStep[];
    }
  | { readonly ok: false; readonly index: number; readonly detail: string };

export function replayTranscript(input: {
  readonly jobId: string;
  readonly maxRoundTrips: number;
  readonly expiresAt: string;
  readonly now: string;
  readonly messages: readonly VerifyMessage[];
}): ReplayResult {
  if (input.jobId.trim().length === 0) {
    return { ok: false, index: -1, detail: "jobId is empty" };
  }
  if (!Number.isSafeInteger(input.maxRoundTrips) || input.maxRoundTrips < 1) {
    return { ok: false, index: -1, detail: "maxRoundTrips is not a positive integer" };
  }
  if (parseInstant(input.expiresAt) === undefined || parseInstant(input.now) === undefined) {
    return { ok: false, index: -1, detail: "clock is not an instant" };
  }
  let session: NegotiationSession = openNegotiation({
    type: "request",
    jobId: input.jobId,
    maxRoundTrips: input.maxRoundTrips,
    expiresAt: input.expiresAt,
  });
  const steps: ReplayStep[] = [];
  const clock = {
    now() {
      return input.now;
    },
  };
  for (let index = 0; index < input.messages.length; index += 1) {
    const message = input.messages[index];
    if (message === undefined) {
      return { ok: false, index, detail: "missing message" };
    }
    const outcome = apply(session, toEvent(message), clock);
    if (!outcome.ok) {
      return { ok: false, index, detail: "the state machine refused the message" };
    }
    steps.push({ index, from: outcome.from, to: outcome.to });
    session = outcome.session;
  }
  return {
    ok: true,
    phase: session.phase,
    round: session.round,
    maxRoundTrips: session.maxRoundTrips,
    steps,
  };
}

function toEvent(message: VerifyMessage): NegotiationEvent {
  switch (message.type) {
    case "Proposal":
      return { type: "proposal", message };
    case "CounterProposal":
      return { type: "counter", message };
    case "AgreementDraft":
      return { type: "agreement_draft", message };
    case "ApprovalDecision":
      return { type: "approval", message };
  }
}
