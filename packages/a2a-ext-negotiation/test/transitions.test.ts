import { describe, expect, it } from "vitest";
import { apply, machineStates, taskStateFor, transitionTable } from "../src/index.js";
import type {
  EventType,
  NegotiationEvent,
  NegotiationSession,
  TransitionId,
} from "../src/index.js";
import {
  approvalMessage,
  awaitClient,
  awaitingCapped,
  awaitingClientYes,
  awaitingOpen,
  awaitWorker,
  clockAt,
  closed,
  counterMessage,
  draftMessage,
  draftPending,
  fixtureFor,
  jobId,
  lastWorkerTurn,
  proposalMessage,
  request,
  snapshot,
  times,
  transcriptHash,
} from "./support.js";

const sessionLabels = [
  "idle",
  "await_client",
  "await_worker",
  "draft_pending",
  "last_worker_turn",
  "approval_open",
  "approval_client_yes",
  "approval_capped",
  "agreed",
  "closed",
] as const;

const eventLabels = [
  "tick",
  "proposal",
  "proposal_other_job",
  "client_counter",
  "client_accept",
  "client_decline",
  "worker_counter",
  "worker_accept",
  "worker_decline",
  "draft",
  "client_approve",
  "worker_approve",
  "client_reject",
  "worker_reject",
  "client_revise",
  "worker_revise",
  "client_approve_wrong_hash",
] as const;

type SessionLabel = (typeof sessionLabels)[number];
type EventLabel = (typeof eventLabels)[number];

const allowed: ReadonlyArray<readonly [SessionLabel, EventLabel, TransitionId]> = [
  ["idle", "tick", "idle_tick_open"],
  ["idle", "proposal", "idle_proposal_accepted"],
  ["await_client", "tick", "negotiating_tick_open"],
  ["await_client", "client_counter", "negotiating_counter_continue"],
  ["await_client", "client_accept", "negotiating_counter_accept"],
  ["await_client", "client_decline", "negotiating_counter_decline_client"],
  ["await_worker", "tick", "negotiating_tick_open"],
  ["await_worker", "worker_counter", "negotiating_counter_continue"],
  ["await_worker", "worker_accept", "negotiating_counter_accept"],
  ["await_worker", "worker_decline", "negotiating_counter_decline_worker"],
  ["draft_pending", "tick", "negotiating_tick_open"],
  ["draft_pending", "client_decline", "negotiating_counter_decline_client"],
  ["draft_pending", "draft", "negotiating_draft_accepted"],
  ["last_worker_turn", "tick", "negotiating_tick_open"],
  ["last_worker_turn", "worker_counter", "negotiating_counter_round_limit"],
  ["last_worker_turn", "worker_accept", "negotiating_counter_accept"],
  ["last_worker_turn", "worker_decline", "negotiating_counter_decline_worker"],
  ["approval_open", "tick", "awaiting_approval_tick_open"],
  ["approval_open", "client_approve", "awaiting_approval_approve_first"],
  ["approval_open", "worker_approve", "awaiting_approval_approve_first"],
  ["approval_open", "client_reject", "awaiting_approval_reopen"],
  ["approval_open", "worker_reject", "awaiting_approval_reopen"],
  ["approval_open", "client_revise", "awaiting_approval_reopen"],
  ["approval_open", "worker_revise", "awaiting_approval_reopen"],
  ["approval_client_yes", "tick", "awaiting_approval_tick_open"],
  ["approval_client_yes", "worker_approve", "awaiting_approval_approve_second"],
  ["approval_client_yes", "client_reject", "awaiting_approval_reopen"],
  ["approval_client_yes", "worker_reject", "awaiting_approval_reopen"],
  ["approval_client_yes", "client_revise", "awaiting_approval_reopen"],
  ["approval_client_yes", "worker_revise", "awaiting_approval_reopen"],
  ["approval_capped", "tick", "awaiting_approval_tick_open"],
  ["approval_capped", "client_approve", "awaiting_approval_approve_first"],
  ["approval_capped", "worker_approve", "awaiting_approval_approve_first"],
  ["approval_capped", "client_reject", "awaiting_approval_round_limit"],
  ["approval_capped", "worker_reject", "awaiting_approval_round_limit"],
  ["approval_capped", "client_revise", "awaiting_approval_round_limit"],
  ["approval_capped", "worker_revise", "awaiting_approval_round_limit"],
];

function sessionFor(label: SessionLabel): NegotiationSession {
  switch (label) {
    case "idle":
      return request();
    case "await_client":
      return awaitClient();
    case "await_worker":
      return awaitWorker();
    case "draft_pending":
      return draftPending();
    case "last_worker_turn":
      return lastWorkerTurn();
    case "approval_open":
      return awaitingOpen();
    case "approval_client_yes":
      return awaitingClientYes();
    case "approval_capped":
      return awaitingCapped();
    case "agreed":
      return agreedFromSupport();
    case "closed":
      return closed();
  }
}

function agreedFromSupport(): NegotiationSession {
  const one = awaitingClientYes();
  const result = apply(
    one,
    { type: "approval", message: approvalMessage("worker", "approve", one.draft.transcriptHash) },
    clockAt(times.fresh),
  );
  if (!result.ok || result.session.phase !== "agreed") {
    throw new Error("expected a signed-off agreement fixture");
  }
  return result.session;
}

function hashOf(session: NegotiationSession): string {
  if (session.phase === "awaiting_approval" || session.phase === "agreed") {
    return session.draft.transcriptHash;
  }
  if (session.phase === "no_deal" && session.draft !== null) {
    return session.draft.transcriptHash;
  }
  return transcriptHash;
}

function eventFor(session: NegotiationSession, label: EventLabel): NegotiationEvent {
  const hash = hashOf(session);
  switch (label) {
    case "tick":
      return { type: "tick" };
    case "proposal":
      return { type: "proposal", message: proposalMessage() };
    case "proposal_other_job":
      return { type: "proposal", message: proposalMessage({ jobId: "job-other" }) };
    case "client_counter":
      return { type: "counter", message: counterMessage("client", "counter") };
    case "client_accept":
      return { type: "counter", message: counterMessage("client", "accept") };
    case "client_decline":
      return { type: "counter", message: counterMessage("client", "decline") };
    case "worker_counter":
      return { type: "counter", message: counterMessage("worker", "counter") };
    case "worker_accept":
      return { type: "counter", message: counterMessage("worker", "accept") };
    case "worker_decline":
      return { type: "counter", message: counterMessage("worker", "decline") };
    case "draft":
      return { type: "agreement_draft", message: draftMessage() };
    case "client_approve":
      return { type: "approval", message: approvalMessage("client", "approve", hash) };
    case "worker_approve":
      return { type: "approval", message: approvalMessage("worker", "approve", hash) };
    case "client_reject":
      return { type: "approval", message: approvalMessage("client", "reject", hash) };
    case "worker_reject":
      return { type: "approval", message: approvalMessage("worker", "reject", hash) };
    case "client_revise":
      return { type: "approval", message: approvalMessage("client", "revise", hash) };
    case "worker_revise":
      return { type: "approval", message: approvalMessage("worker", "revise", hash) };
    case "client_approve_wrong_hash":
      return { type: "approval", message: approvalMessage("client", "approve", "wrong-hash") };
  }
}

function expected(sessionLabel: SessionLabel, eventLabel: EventLabel): TransitionId | "forbidden" {
  for (const [session, event, id] of allowed) {
    if (session === sessionLabel && event === eventLabel) {
      return id;
    }
  }
  return "forbidden";
}

function rowTo(id: TransitionId): { readonly to: NegotiationSession["phase"]; readonly reason: NegotiationSession["reason"] } {
  for (const row of transitionTable) {
    if (row.id === id) {
      return { to: row.to, reason: row.reason };
    }
  }
  throw new Error(`missing transition ${id}`);
}

describe("negotiation transition table", () => {
  it("lists each statechart row once, and agreed has a single entry", () => {
    const seen = new Set<string>();
    const agreed: string[] = [];
    for (const row of transitionTable) {
      expect(seen.has(row.id)).toBe(false);
      seen.add(row.id);
      expect(machineStates).toContain(row.from);
      expect(machineStates).toContain(row.to);
      if (row.to === "no_deal") {
        expect(row.reason).not.toBeNull();
      } else {
        expect(row.reason).toBeNull();
      }
      if (row.to === "agreed") {
        agreed.push(row.id);
      }
    }
    expect(agreed).toEqual(["awaiting_approval_approve_second"]);
    expect(seen.size).toBe(transitionTable.length);
  });

  it("fires every allowed row, including expiry and the round limit", () => {
    for (const row of transitionTable) {
      const fixture = fixtureFor(row.id);
      const result = apply(fixture.session, fixture.event, clockAt(fixture.clock));
      expect(result.ok, row.id).toBe(true);
      if (!result.ok) {
        throw new Error(row.id);
      }
      expect(result.id, row.id).toBe(row.id);
      expect(result.from, row.id).toBe(row.from);
      expect(result.to, row.id).toBe(row.to);
      expect(result.session.phase, row.id).toBe(row.to);
      expect(result.session.reason, row.id).toBe(row.reason);
      expect(result.session.taskState, row.id).toBe(taskStateFor(result.session.phase, result.session.reason));
      expect(result.session.signatureVerification).toBe("deferred");
    }
  });

  it("rejects every fresh event the table does not allow and leaves the session unchanged", () => {
    const seen = new Set<string>();
    let cases = 0;
    for (const [session, event] of allowed) {
      const key = `${session}|${event}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    for (const sessionLabel of sessionLabels) {
      for (const eventLabel of eventLabels) {
        cases += 1;
        const session = sessionFor(sessionLabel);
        const before = snapshot(session);
        const event = eventFor(session, eventLabel);
        const result = apply(session, event, clockAt(times.fresh));
        const name = `${sessionLabel} + ${eventLabel}`;
        const wanted = expected(sessionLabel, eventLabel);
        if (wanted === "forbidden") {
          expect(result.ok, name).toBe(false);
          if (result.ok) {
            throw new Error(name);
          }
          expect(result.reason, name).toBe("forbidden");
          expect(result.from, name).toBe(session.phase);
          expect(result.event, name).toBe(event.type);
          expect(snapshot(session), name).toBe(before);
        } else {
          expect(result.ok, name).toBe(true);
          if (!result.ok) {
            throw new Error(name);
          }
          const row = rowTo(wanted);
          expect(result.id, name).toBe(wanted);
          expect(result.session.phase, name).toBe(row.to);
          expect(result.session.reason, name).toBe(row.reason);
          expect(result.session.taskState, name).toBe(
            taskStateFor(result.session.phase, result.session.reason),
          );
        }
      }
    }
    expect(cases).toBe(sessionLabels.length * eventLabels.length);
    expect(jobId).toBe("job-1024");
  });

  it("covers every phase and event name used by the fresh matrix", () => {
    const phases = new Set<NegotiationSession["phase"]>();
    const events = new Set<EventType>();
    for (const label of sessionLabels) {
      phases.add(sessionFor(label).phase);
    }
    for (const label of eventLabels) {
      events.add(eventFor(request(), label).type);
    }
    expect([...phases].sort()).toEqual([...machineStates].sort());
    expect([...events].sort()).toEqual(["agreement_draft", "approval", "counter", "proposal", "tick"]);
  });
});
