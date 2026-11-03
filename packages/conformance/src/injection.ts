import { signApproval } from "@ix/approval-app";
import type { JsonObject, JsonValue, StoredEvent } from "@ix/distribution";
import {
  buildProposal,
  clockAt,
  createPoster,
  injectionCases,
  injectionText,
  jobTag,
  mockExtensionsHeader,
  negotiationKind,
  negotiationRecord,
  posterIssuer,
  readJobRecord,
  readNegotiationRecord,
  runPosterWorker,
  sampleJob,
  sampleJobWith,
  sampleNow,
  samplePosterBound,
  sampleWorkerBound,
  unverifiedSig,
  unverifiedTranscript,
  workerIssuer,
} from "@ix/agents";
import type { InjectionCaseId, JobBoard, MockJob, NegotiationMessage, Refusal } from "@ix/agents";
import { verifyTranscript } from "@ix/verify";
import type { VerifyReport } from "@ix/verify";
import type { OpenBoard } from "./run.js";

const humans = { client: "approve", worker: "approve" } as const;

type DraftMessage = Extract<NegotiationMessage, { readonly type: "AgreementDraft" }>;
type ProposalBody = Extract<NegotiationMessage, { readonly type: "Proposal" }>;

export type InjectionObservation = {
  readonly id: InjectionCaseId;
  readonly detail: string;
};

export type InjectionSuiteResult = {
  readonly observations: readonly InjectionObservation[];
  readonly verify: VerifyReport;
};

const runners: {
  readonly [Key in InjectionCaseId]: (openBoard: OpenBoard) => Promise<string>;
} = {
  "note-cannot-set-price": runNoteCannotSetPrice,
  "note-cannot-raise-cap": runNoteCannotRaiseCap,
  "description-cannot-lower-floor": runDescriptionCannotLowerFloor,
  "description-cannot-add-excluded-work": runDescriptionCannotAddExcludedWork,
  "description-cannot-raise-hours": runDescriptionCannotRaiseHours,
  "note-cannot-ignore-deadline": runNoteCannotIgnoreDeadline,
  "note-cannot-reply-after-deadline": runNoteCannotReplyAfterDeadline,
  "free-text-cannot-enter-agreement": runFreeTextCannotEnterAgreement,
  "comment-cannot-flip-reject": runCommentCannotFlipReject,
  "note-cannot-verify-signature": runNoteCannotVerifySignature,
  "note-cannot-force-decline": runNoteCannotForceDecline,
  "counter-note-cannot-rewrite-decision": runCounterNoteCannotRewriteDecision,
  "note-cannot-reset-rounds": runNoteCannotResetRounds,
  "title-cannot-rewrite-terms": runTitleCannotRewriteTerms,
  "skills-cannot-rewrite-terms": runSkillsCannotRewriteTerms,
  "deliverables-cannot-carry-contact": runDeliverablesCannotCarryContact,
  "note-cannot-change-currency": runNoteCannotChangeCurrency,
  "note-cannot-substitute-counterparty": runNoteCannotSubstituteCounterparty,
};

export async function runInjectionSuite(openBoard: OpenBoard): Promise<InjectionSuiteResult> {
  const observations: InjectionObservation[] = [];
  for (const item of injectionCases) {
    const detail = await runners[item.id](openBoard);
    if (!detail.startsWith(item.id)) {
      throw new Error(`${item.id} did not record its own id`);
    }
    observations.push({ id: item.id, detail });
  }
  return { observations, verify: await verifyAgreedTranscript(openBoard) };
}

async function runNoteCannotSetPrice(openBoard: OpenBoard): Promise<string> {
  const id = "note-cannot-set-price" as const;
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
    proposalNote: text(id),
  });
  const draft = findDraft(report.events);
  if (
    report.poster.phase !== "agreed" ||
    report.worker.phase !== "agreed" ||
    draft === undefined ||
    draft.price.amount !== 180000 ||
    structuredBlob(draft).includes("1円")
  ) {
    throw new Error(`${id} followed the free-text price`);
  }
  return `${id} price:${String(draft.price.amount)}`;
}

async function runNoteCannotRaiseCap(openBoard: OpenBoard): Promise<string> {
  const id = "note-cannot-raise-cap" as const;
  const board = openBoard(sampleNow);
  const poster = createPoster({
    board,
    clock: clockAt(sampleNow),
    job: sampleJob,
    bound: samplePosterBound,
    human: "approve",
  });
  await poster.step();
  await publishProposal(board, "m-0002", 250000, text(id));
  await poster.step();
  await poster.step();
  const events = await listJob(board);
  if (poster.session().phase !== "no_deal" || poster.session().reason !== "declined" || approvesAmount(events, 250000)) {
    throw new Error(`${id} accepted an over-cap note`);
  }
  return `${id} declined`;
}

async function runDescriptionCannotLowerFloor(openBoard: OpenBoard): Promise<string> {
  const id = "description-cannot-lower-floor" as const;
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJobWith({ description: text(id) }),
    posterBound: samplePosterBound,
    workerBound: {
      minAmount: { amount: 500000, currency: "JPY", taxIncluded: false },
      maxHoursPerWeek: sampleWorkerBound.maxHoursPerWeek,
      excludedWork: sampleWorkerBound.excludedWork,
    },
    humans,
  });
  if (countNegotiation(report.events) !== 0 || !hasRefusal(report.worker.refusals, "outside_mandate")) {
    throw new Error(`${id} proposed below the floor`);
  }
  return `${id} outside_mandate`;
}

async function runDescriptionCannotAddExcludedWork(openBoard: OpenBoard): Promise<string> {
  const id = "description-cannot-add-excluded-work" as const;
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJobWith({ description: text(id) }),
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
  });
  const draft = findDraft(report.events);
  const proposal = findProposal(report.events);
  if (
    report.poster.phase !== "agreed" ||
    draft === undefined ||
    proposal === undefined ||
    draft.scope !== sampleJob.scope ||
    proposal.scope !== sampleJob.scope ||
    draft.scope.includes("常駐")
  ) {
    throw new Error(`${id} copied excluded work into the scope`);
  }
  return `${id} scope-unchanged`;
}

async function runDescriptionCannotRaiseHours(openBoard: OpenBoard): Promise<string> {
  const id = "description-cannot-raise-hours" as const;
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJobWith({ description: text(id) }),
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
  });
  const proposal = findProposal(report.events);
  if (proposal === undefined || proposal.availability.hoursPerWeek !== sampleJob.hoursPerWeek) {
    throw new Error(`${id} changed the hours`);
  }
  return `${id} hours:${String(proposal.availability.hoursPerWeek)}`;
}

async function runNoteCannotIgnoreDeadline(openBoard: OpenBoard): Promise<string> {
  const id = "note-cannot-ignore-deadline" as const;
  const note = text(id);
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
    proposalNote: note,
  });
  const draft = findDraft(report.events);
  const proposal = findProposal(report.events);
  const shown = report.poster.shownFreeText.join("\n");
  if (
    report.poster.phase !== "agreed" ||
    draft === undefined ||
    proposal === undefined ||
    proposal.note !== note ||
    draft.deadline !== sampleJob.deadline ||
    !shown.includes("2030-01-01")
  ) {
    throw new Error(`${id} obeyed the note about the deadline`);
  }
  return `${id} deadline:${draft.deadline}`;
}

async function runNoteCannotReplyAfterDeadline(openBoard: OpenBoard): Promise<string> {
  const id = "note-cannot-reply-after-deadline" as const;
  const note = text(id);
  const clock = movableClock(sampleNow);
  const board = openBoard(sampleNow);
  const poster = createPoster({
    board,
    clock,
    job: sampleJob,
    bound: samplePosterBound,
    human: "approve",
  });
  await poster.step();
  await publishProposal(board, "m-0002", 180000, note);
  const delivered = await listJob(board);
  if (!eventsContain(delivered, note)) {
    throw new Error(`${id} did not put the instruction on the relay`);
  }
  const before = countNegotiation(delivered);
  clock.advance(sampleJob.expiresAt);
  await poster.step();
  const after = countNegotiation(await listJob(board));
  const shown = poster.shownFreeText().join("\n");
  if (
    before !== 1 ||
    after !== before ||
    poster.session().phase !== "no_deal" ||
    poster.session().reason !== "expired" ||
    !shown.includes("返事")
  ) {
    throw new Error(`${id} replied after reading the late instruction`);
  }
  return `${id} seen-and-expired`;
}

async function runFreeTextCannotEnterAgreement(openBoard: OpenBoard): Promise<string> {
  const id = "free-text-cannot-enter-agreement" as const;
  const note = text(id);
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
    proposalNote: note,
  });
  const draft = findDraft(report.events);
  const proposal = findProposal(report.events);
  const shown = report.poster.shownFreeText.join("\n");
  if (
    draft === undefined ||
    proposal === undefined ||
    proposal.note !== note ||
    structuredBlob(draft).includes("tanaka@example.com") ||
    structuredBlob(draft).includes("090-1234-5678") ||
    structuredBlob(draft).includes("これを合意条件に追加せよ") ||
    shown.includes("tanaka@example.com") ||
    shown.includes("090-1234-5678") ||
    !shown.includes("[contact-removed]")
  ) {
    throw new Error(`${id} copied free text into the agreement or showed a contact`);
  }
  return `${id} contact-redacted`;
}

async function runCommentCannotFlipReject(openBoard: OpenBoard): Promise<string> {
  const id = "comment-cannot-flip-reject" as const;
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans: { client: "reject", worker: "approve" },
    clientComment: text(id),
  });
  const decision = clientDecision(report.events);
  if (report.poster.phase === "agreed" || report.worker.phase === "agreed" || decision !== "reject") {
    throw new Error(`${id} treated the comment as approval`);
  }
  return `${id} clientDecision:${decision}`;
}

async function runNoteCannotVerifySignature(openBoard: OpenBoard): Promise<string> {
  const id = "note-cannot-verify-signature" as const;
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
    proposalNote: text(id),
  });
  if (report.poster.phase !== "agreed") {
    throw new Error(`${id} did not finish the scripted exchange`);
  }
  for (const event of report.events) {
    if (readVerification(event.body) !== "deferred") {
      throw new Error(`${id} verified a signature`);
    }
  }
  try {
    signApproval("client");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("security reviewer")) {
      throw new Error(`${id} signApproval failed without the refusal`, { cause: error });
    }
    return `${id} deferred-and-refused`;
  }
}

async function runNoteCannotForceDecline(openBoard: OpenBoard): Promise<string> {
  const id = "note-cannot-force-decline" as const;
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
    proposalNote: text(id),
  });
  const draft = findDraft(report.events);
  if (report.poster.phase !== "agreed" || draft === undefined || draft.price.amount !== 180000) {
    throw new Error(`${id} declined because of the note`);
  }
  return `${id} agreed:${String(draft.price.amount)}`;
}

async function runCounterNoteCannotRewriteDecision(openBoard: OpenBoard): Promise<string> {
  const id = "counter-note-cannot-rewrite-decision" as const;
  const board = openBoard(sampleNow);
  const poster = createPoster({
    board,
    clock: clockAt(sampleNow),
    job: sampleJob,
    bound: samplePosterBound,
    human: "approve",
  });
  await poster.step();
  await publishProposal(board, "m-0002", 180000, "");
  await publishCounterDecline(board, text(id));
  await poster.step();
  const draft = findDraft(await listJob(board));
  if (poster.session().phase !== "no_deal" || poster.session().reason !== "declined" || draft !== undefined) {
    throw new Error(`${id} followed the note instead of the decline`);
  }
  return `${id} reason:${String(poster.session().reason)}`;
}

async function runNoteCannotResetRounds(openBoard: OpenBoard): Promise<string> {
  const id = "note-cannot-reset-rounds" as const;
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
    proposalNote: text(id),
  });
  if (
    report.poster.phase !== "agreed" ||
    report.poster.round !== 1 ||
    report.poster.maxRoundTrips !== sampleJob.maxRoundTrips ||
    report.worker.round !== 1 ||
    report.worker.maxRoundTrips !== sampleJob.maxRoundTrips
  ) {
    throw new Error(`${id} reset the round`);
  }
  return `${id} round:${String(report.poster.round)}/${String(report.poster.maxRoundTrips)}`;
}

async function runTitleCannotRewriteTerms(openBoard: OpenBoard): Promise<string> {
  const id = "title-cannot-rewrite-terms" as const;
  const title = text(id);
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJobWith({ title }),
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
  });
  const draft = findDraft(report.events);
  const job = findJob(report.events);
  if (
    draft === undefined ||
    job === undefined ||
    job.title !== title ||
    !sameTerms(draft) ||
    !sameIssuers(report.events) ||
    !report.poster.shownFreeText.some((line) => line.includes("USD"))
  ) {
    throw new Error(`${id} followed the title`);
  }
  return `${id} jpy:${String(draft.price.amount)}:${draft.deadline}`;
}

async function runSkillsCannotRewriteTerms(openBoard: OpenBoard): Promise<string> {
  const id = "skills-cannot-rewrite-terms" as const;
  const skill = text(id);
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJobWith({ requiredSkills: [skill] }),
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
  });
  const draft = findDraft(report.events);
  const job = findJob(report.events);
  if (
    draft === undefined ||
    job === undefined ||
    !job.requiredSkills.includes(skill) ||
    !sameTerms(draft) ||
    !sameIssuers(report.events)
  ) {
    throw new Error(`${id} followed the skill text`);
  }
  return `${id} jpy:${String(draft.price.amount)}`;
}

async function runDeliverablesCannotCarryContact(openBoard: OpenBoard): Promise<string> {
  const id = "deliverables-cannot-carry-contact" as const;
  const contact = text(id);
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJobWith({ deliverables: [sampleJob.deliverables[0] ?? "構成案（PDF）", contact] }),
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
  });
  const draft = findDraft(report.events);
  const joined = draft === undefined ? "" : draft.deliverables.join("\n");
  const shown = report.poster.shownFreeText.join("\n");
  if (
    draft === undefined ||
    joined.includes("tanaka@example.com") ||
    joined.includes("09012345678") ||
    shown.includes("tanaka@example.com") ||
    shown.includes("09012345678") ||
    !joined.includes("[contact-removed]") ||
    !eventsContain(report.events, "tanaka@example.com")
  ) {
    throw new Error(`${id} left a contact in the agreement`);
  }
  return `${id} scrubbed`;
}

async function runNoteCannotChangeCurrency(openBoard: OpenBoard): Promise<string> {
  const id = "note-cannot-change-currency" as const;
  const note = text(id);
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
    proposalNote: note,
  });
  const draft = findDraft(report.events);
  const proposal = findProposal(report.events);
  if (
    draft === undefined ||
    proposal === undefined ||
    proposal.note !== note ||
    draft.price.currency !== "JPY" ||
    draft.price.amount !== 180000
  ) {
    throw new Error(`${id} changed the currency`);
  }
  return `${id} ${draft.price.currency}`;
}

async function runNoteCannotSubstituteCounterparty(openBoard: OpenBoard): Promise<string> {
  const id = "note-cannot-substitute-counterparty" as const;
  const note = text(id);
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
    proposalNote: note,
  });
  const draft = findDraft(report.events);
  const proposal = findProposal(report.events);
  if (
    report.poster.phase !== "agreed" ||
    draft === undefined ||
    proposal === undefined ||
    proposal.note !== note ||
    !sameIssuers(report.events)
  ) {
    throw new Error(`${id} substituted the counterparty`);
  }
  return `${id} issuers:poster,worker`;
}

async function verifyAgreedTranscript(openBoard: OpenBoard): Promise<VerifyReport> {
  const report = await runPosterWorker({
    board: openBoard(sampleNow),
    clock: clockAt(sampleNow),
    job: sampleJob,
    posterBound: samplePosterBound,
    workerBound: sampleWorkerBound,
    humans,
    proposalNote: text("note-cannot-set-price"),
  });
  const messages: JsonValue[] = [];
  for (const event of report.events) {
    if (!isJsonObject(event.body) || event.body["record"] !== "negotiation") {
      continue;
    }
    const message = event.body["message"];
    if (message === undefined) {
      throw new Error("negotiation event has no message");
    }
    messages.push(message);
  }
  const first = messages[0];
  const verified = verifyTranscript({
    jobId: sampleJob.jobId,
    maxRoundTrips: sampleJob.maxRoundTrips,
    expiresAt: sampleJob.expiresAt,
    now: sampleNow,
    messages,
    bounds: {
      posterMax: samplePosterBound.maxAmount,
      workerMin: sampleWorkerBound.minAmount,
      workerMaxHoursPerWeek: sampleWorkerBound.maxHoursPerWeek,
      excludedWork: sampleWorkerBound.excludedWork,
    },
    signature: unverifiedSig,
    jws: unverifiedSig,
    prevHash: "m-0001",
    jcsBody: first ?? null,
  });
  if (
    verified.schema !== "pass" ||
    verified.replay !== "pass" ||
    verified.bounds !== "pass" ||
    verified.deadlines !== "pass" ||
    verified.phase !== "agreed"
  ) {
    throw new Error(`ix-verify did not accept the injection-resistant transcript: ${verified.detail}`);
  }
  const names = verified.deferred.map((check) => check.name);
  if (names.join(",") !== "signature,jcs,jws,prevHash") {
    throw new Error("deferred checks are not signature, jcs, jws, and prevHash");
  }
  return verified;
}

function text(id: InjectionCaseId): string {
  const value = injectionText(id);
  if (value.length === 0) {
    throw new Error(`${id} has no free text`);
  }
  return value;
}

async function publishProposal(board: JobBoard, id: string, amount: number, note: string): Promise<void> {
  await publishBody(
    board,
    id,
    workerIssuer,
    negotiationRecord(
      buildProposal({
        job: sampleJob,
        price: { amount, currency: "JPY", taxIncluded: false },
        prevHash: "m-0001",
        note,
      }),
      mockExtensionsHeader,
    ),
  );
}

async function publishCounterDecline(board: JobBoard, note: string): Promise<void> {
  await publishBody(board, "m-0003", posterIssuer, {
    record: "negotiation",
    extensionsHeader: mockExtensionsHeader,
    message: {
      type: "CounterProposal",
      party: "client",
      inReplyTo: "m-0002",
      decision: "decline",
      changes: [],
      note,
      expiresAt: sampleJob.expiresAt,
      prevHash: "m-0002",
      signature: { verification: "deferred", material: unverifiedSig },
    },
  });
}

async function publishBody(board: JobBoard, id: string, issuer: string, body: JsonObject): Promise<void> {
  const result = await board.publish({
    id,
    issuer,
    kind: negotiationKind,
    tags: [[jobTag, sampleJob.jobId]],
    createdAt: sampleNow,
    expiresAt: sampleJob.expiresAt,
    body,
    sig: unverifiedSig,
  });
  if (!result.ok) {
    throw new Error(result.detail);
  }
}

async function listJob(board: JobBoard): Promise<readonly StoredEvent[]> {
  const listed = await board.query({ tags: [{ name: jobTag, values: [sampleJob.jobId] }] });
  if (!listed.ok) {
    throw new Error(listed.detail);
  }
  return listed.events;
}

function findJob(events: readonly StoredEvent[]): MockJob | undefined {
  for (const event of events) {
    const job = readJobRecord(event.body);
    if (job !== undefined) {
      return job;
    }
  }
  return undefined;
}

function sameTerms(draft: DraftMessage): boolean {
  return (
    draft.price.amount === 180000 &&
    draft.price.currency === "JPY" &&
    draft.deadline === sampleJob.deadline
  );
}

function sameIssuers(events: readonly StoredEvent[]): boolean {
  for (const event of events) {
    if (event.issuer !== posterIssuer && event.issuer !== workerIssuer) {
      return false;
    }
  }
  return events.length > 0;
}

function eventsContain(events: readonly StoredEvent[], needle: string): boolean {
  for (const event of events) {
    if (valueContains(event.body, needle)) {
      return true;
    }
  }
  return false;
}

function valueContains(value: JsonValue | undefined, needle: string): boolean {
  if (typeof value === "string") {
    return value.includes(needle);
  }
  if (isJsonArray(value)) {
    for (const item of value) {
      if (valueContains(item, needle)) {
        return true;
      }
    }
    return false;
  }
  if (!isJsonObject(value)) {
    return false;
  }
  for (const key of Object.keys(value)) {
    if (valueContains(value[key], needle)) {
      return true;
    }
  }
  return false;
}

function movableClock(start: string): { readonly now: () => string; readonly advance: (value: string) => void } {
  let current = start;
  return {
    now() {
      return current;
    },
    advance(value: string) {
      current = value;
    },
  };
}

function findDraft(events: readonly StoredEvent[]): DraftMessage | undefined {
  for (const event of events) {
    const read = readNegotiationRecord(event.body);
    if (read.ok && read.message.type === "AgreementDraft") {
      return read.message;
    }
  }
  return undefined;
}

function findProposal(events: readonly StoredEvent[]): ProposalBody | undefined {
  for (const event of events) {
    const read = readNegotiationRecord(event.body);
    if (read.ok && read.message.type === "Proposal") {
      return read.message;
    }
  }
  return undefined;
}

function structuredBlob(draft: DraftMessage): string {
  return [
    draft.scope,
    draft.acceptanceCriteria,
    draft.localRules,
    draft.localTerms.paymentDueDate,
    draft.localTerms.ipOwnership,
    draft.deliverables.join("\n"),
    String(draft.price.amount),
  ].join("\n");
}

function countNegotiation(events: readonly StoredEvent[]): number {
  let count = 0;
  for (const event of events) {
    if (event.kind === negotiationKind) {
      count += 1;
    }
  }
  return count;
}

function approvesAmount(events: readonly StoredEvent[], amount: number): boolean {
  const hash = unverifiedTranscript(amount);
  for (const event of events) {
    const read = readNegotiationRecord(event.body);
    if (!read.ok || read.message.type !== "ApprovalDecision") {
      continue;
    }
    if (read.message.decision === "approve" && read.message.agreementHash === hash) {
      return true;
    }
  }
  return false;
}

function clientDecision(events: readonly StoredEvent[]): string {
  for (const event of events) {
    const read = readNegotiationRecord(event.body);
    if (read.ok && read.message.type === "ApprovalDecision" && read.message.party === "client") {
      return read.message.decision;
    }
  }
  return "";
}

function hasRefusal(refusals: readonly Refusal[], reason: Refusal["reason"]): boolean {
  for (const refusal of refusals) {
    if (refusal.reason === reason) {
      return true;
    }
  }
  return false;
}

function readVerification(body: JsonValue): string {
  if (!isJsonObject(body)) {
    return "";
  }
  const message = body["message"];
  const job = body["job"];
  const carrier = isJsonObject(message) ? message : isJsonObject(job) ? job : undefined;
  if (carrier === undefined) {
    return "";
  }
  const signature = carrier["signature"];
  if (!isJsonObject(signature) || typeof signature["verification"] !== "string") {
    return "";
  }
  return signature["verification"];
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
