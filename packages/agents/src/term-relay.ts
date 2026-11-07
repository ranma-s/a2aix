import {
  applyChainedTermMessage,
  coreSheet,
  decodeTermMessage,
  expectedPrevHash,
  openTermSession,
  sameTermValue,
  sealTermMessage,
  termHash,
  termSheetHash,
  webSiteSheet,
} from "@ix/a2a-ext-negotiation";
import type { Clock, Party, PresetTerm, TermJson, TermMessage, TermSession, TermSheet } from "@ix/a2a-ext-negotiation";
import type { JsonObject, JsonValue, StoredEvent } from "@ix/distribution";
import type { JobBoard } from "./board.js";
import { jobKind, jobTag, mockExtensionsHeader, negotiationKind, posterIssuer, unverifiedSig, workerIssuer } from "./kinds.js";
import { redactFreeText } from "./redact.js";
import { checkTermMandate, nextTurn, withinLimit } from "./terms.js";
import type { TermAgentConfig, TermTrialEscalation } from "./terms.js";

export const knownTermSheets: readonly TermSheet[] = [coreSheet, webSiteSheet];

export type TermJob = {
  readonly jobId: string;
  readonly sheetId: string;
  readonly sheetVersion: number;
  readonly sheetSha256: string;
  readonly preset: readonly PresetTerm[];
  readonly roundLimitPerTerm: number;
  readonly description: string;
  readonly expiresAt: string;
};

export type TermSideReport = {
  readonly party: Party;
  readonly session: TermSession | undefined;
  readonly refusals: readonly string[];
  readonly escalations: readonly TermTrialEscalation[];
  readonly shownFreeText: readonly string[];
};

export type TermRelayReport = {
  readonly poster: TermSideReport;
  readonly worker: TermSideReport;
  readonly events: readonly StoredEvent[];
};

const maxRelaySteps = 400;
const maxIdAttempts = 3;
const termRecord = "term";
const termJobRecord = "term-job";

type Side = {
  readonly party: Party;
  readonly issuer: string;
  readonly config: TermAgentConfig;
  readonly jobId: string;
  readonly postedJob: TermJob | undefined;
  readonly now: () => string;
  jobExpiresAt: string | undefined;
  session: TermSession | undefined;
  readonly applied: Set<string>;
  readonly pending: { readonly id: string; readonly message: TermMessage }[];
  readonly refusals: string[];
  readonly escalations: TermTrialEscalation[];
  readonly shownFreeText: string[];
  stopped: boolean;
};

function toJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map(toJson);
  }
  if (typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) {
        out[key] = toJson(child);
      }
    }
    return out;
  }
  return null;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issuerOf(party: Party): string {
  return party === "client" ? posterIssuer : workerIssuer;
}

export function findTermSheet(sheetId: string, version: number): TermSheet | undefined {
  return knownTermSheets.find((sheet) => sheet.sheetId === sheetId && sheet.version === version);
}

function jobBody(job: TermJob): JsonObject {
  return {
    record: termJobRecord,
    job: {
      jobId: job.jobId,
      sheetId: job.sheetId,
      sheetVersion: job.sheetVersion,
      sheetSha256: job.sheetSha256,
      preset: job.preset.map((entry) => ({ termId: entry.termId, value: toJson(entry.value) })),
      roundLimitPerTerm: job.roundLimitPerTerm,
      description: job.description,
      expiresAt: job.expiresAt,
    },
  };
}

function readTermJob(body: JsonValue): TermJob | undefined {
  if (!isObject(body) || body["record"] !== termJobRecord || !isObject(body["job"])) {
    return undefined;
  }
  const job = body["job"];
  const preset = job["preset"];
  const { jobId, sheetId, sheetVersion, sheetSha256, roundLimitPerTerm, description, expiresAt } = job;
  if (
    typeof jobId !== "string" ||
    typeof sheetId !== "string" ||
    typeof sheetVersion !== "number" ||
    typeof sheetSha256 !== "string" ||
    typeof roundLimitPerTerm !== "number" ||
    typeof description !== "string" ||
    typeof expiresAt !== "string" ||
    !Array.isArray(preset)
  ) {
    return undefined;
  }
  const entries: PresetTerm[] = [];
  const items: readonly JsonValue[] = preset;
  for (const entry of items) {
    if (!isObject(entry) || typeof entry["termId"] !== "string" || entry["value"] === undefined) {
      return undefined;
    }
    const value: TermJson = entry["value"];
    entries.push({ termId: entry["termId"], value });
  }
  return { jobId, sheetId, sheetVersion, sheetSha256, preset: entries, roundLimitPerTerm, description, expiresAt };
}

export function termJobAnchor(job: TermJob): Promise<string> {
  return termHash(jobBody(job)["job"]);
}

async function openFor(job: TermJob): Promise<TermSession | string> {
  const sheet = findTermSheet(job.sheetId, job.sheetVersion);
  if (sheet === undefined) {
    return `unknown term sheet ${job.sheetId}/${String(job.sheetVersion)}`;
  }
  if (job.sheetSha256 !== (await termSheetHash(sheet))) {
    return "the job's sheetSha256 does not match the term sheet";
  }
  const opened = openTermSession({
    jobId: job.jobId,
    sheet,
    sheetSha256: job.sheetSha256,
    preset: job.preset,
    roundLimitPerTerm: job.roundLimitPerTerm,
    anchorHash: await termJobAnchor(job),
  });
  return opened.ok ? opened.session : opened.reason;
}

async function loadEvents(board: JobBoard, jobId: string): Promise<StoredEvent[]> {
  const result = await board.query({ tags: [{ name: jobTag, values: [jobId] }] });
  if (!result.ok) {
    throw new Error(result.detail);
  }
  return result.events.slice().sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

const maxIdDigits = 9;

function nextId(events: readonly StoredEvent[]): string {
  let max = 0;
  for (const event of events) {
    if (event.issuer !== posterIssuer && event.issuer !== workerIssuer) {
      continue;
    }
    const suffix = event.id.startsWith("t-") ? event.id.slice(2) : "";
    const value = suffix.length <= maxIdDigits && /^\d+$/.test(suffix) ? Number(suffix) : 0;
    if (Number.isSafeInteger(value) && value > max) {
      max = value;
    }
  }
  const taken = new Set(events.map((event) => event.id));
  let next = max + 1;
  while (taken.has(`t-${String(next).padStart(4, "0")}`)) {
    next += 1;
  }
  return `t-${String(next).padStart(4, "0")}`;
}

async function publish(input: {
  readonly board: JobBoard;
  readonly clock: Clock;
  readonly issuer: string;
  readonly jobId: string;
  readonly kind: string;
  readonly expiresAt: string;
  readonly body: JsonObject;
  readonly notAfter?: string;
}): Promise<string | undefined> {
  const createdAt = input.clock.now();
  if (input.notAfter !== undefined && Date.parse(input.notAfter) <= Date.parse(createdAt)) {
    return "the job has expired; nothing was published";
  }
  for (let attempt = 0; attempt < maxIdAttempts; attempt += 1) {
    const result = await input.board.publish({
      id: nextId(await loadEvents(input.board, input.jobId)),
      issuer: input.issuer,
      kind: input.kind,
      tags: [[jobTag, input.jobId]],
      createdAt,
      expiresAt: input.expiresAt,
      body: input.body,
      sig: unverifiedSig,
    });
    if (result.ok) {
      return undefined;
    }
    if (result.reason !== "id_conflict") {
      return `${result.reason}: ${result.detail}`;
    }
  }
  return "id_conflict: could not allocate an event id";
}

async function sync(side: Side, board: JobBoard, jobId: string, clock: Clock): Promise<void> {
  for (const event of await loadEvents(board, jobId)) {
    if (side.applied.has(event.id)) {
      continue;
    }
    side.applied.add(event.id);
    if (event.kind === jobKind) {
      await acceptJob(side, event);
      continue;
    }
    if (event.kind !== negotiationKind) {
      continue;
    }
    if (side.session === undefined) {
      side.refusals.push(`${event.id}: negotiation message before the job`);
      continue;
    }
    const body = event.body;
    if (!isObject(body) || body["record"] !== termRecord || body["extensionsHeader"] !== mockExtensionsHeader) {
      side.refusals.push(`${event.id}: not a term negotiation record`);
      continue;
    }
    const decoded = decodeTermMessage(body["message"]);
    if (!decoded.ok) {
      side.refusals.push(`${event.id}: ${decoded.reason}`);
      continue;
    }
    if (event.issuer !== issuerOf(decoded.message.from)) {
      side.refusals.push(`${event.id}: issuer does not match the sending party`);
      continue;
    }
    side.pending.push({ id: event.id, message: decoded.message });
  }
  await drainPending(side, clock);
}

async function drainPending(side: Side, clock: Clock): Promise<void> {
  for (let guard = side.pending.length; guard >= 0 && side.session !== undefined; guard -= 1) {
    const session = side.session;
    const expected = await expectedPrevHash(session);
    const index = side.pending.findIndex((entry) => entry.message.prevHash === expected);
    const next = side.pending[index];
    if (next === undefined) {
      return;
    }
    side.pending.splice(index, 1);
    const applied = await applyChainedTermMessage(session, next.message, clock);
    if (!applied.ok) {
      side.refusals.push(`${next.id}: ${applied.reason}`);
      continue;
    }
    side.session = applied.session;
    const note = noteOf(next.message);
    if (next.message.from !== side.party && note !== undefined) {
      side.shownFreeText.push(redactFreeText(note));
    }
  }
}

function sameJob(left: TermJob, right: TermJob): boolean {
  return (
    left.jobId === right.jobId &&
    left.sheetId === right.sheetId &&
    left.sheetVersion === right.sheetVersion &&
    left.sheetSha256 === right.sheetSha256 &&
    left.roundLimitPerTerm === right.roundLimitPerTerm &&
    left.description === right.description &&
    left.expiresAt === right.expiresAt &&
    left.preset.length === right.preset.length &&
    left.preset.every((entry, index) => {
      const peer = right.preset[index];
      return peer !== undefined && entry.termId === peer.termId && sameTermValue(entry.value, peer.value);
    })
  );
}

async function acceptJob(side: Side, event: StoredEvent): Promise<void> {
  if (side.stopped) {
    return;
  }
  if (event.issuer !== posterIssuer) {
    side.refusals.push(`${event.id}: a job event from ${event.issuer} is not from the poster`);
    return;
  }
  if (side.session !== undefined) {
    side.refusals.push(`${event.id}: a second job event for the same job`);
    return;
  }
  const job = readTermJob(event.body);
  if (job === undefined) {
    side.refusals.push(`${event.id}: the job event is not a term job`);
    return;
  }
  if (job.jobId !== side.jobId) {
    side.refusals.push(`${event.id}: the job id does not match the relay tag`);
    return;
  }
  if (Number.isNaN(Date.parse(job.expiresAt)) || Date.parse(job.expiresAt) <= Date.parse(side.now())) {
    side.refusals.push(`${event.id}: the job has expired`);
    side.stopped = true;
    return;
  }
  if (side.postedJob !== undefined && !sameJob(job, side.postedJob)) {
    side.refusals.push(`${event.id}: the job on the relay is not the job this side posted`);
    side.stopped = true;
    return;
  }
  const opened = await openFor(job);
  if (typeof opened === "string") {
    side.refusals.push(`${event.id}: ${opened}`);
    side.stopped = true;
    return;
  }
  side.session = opened;
  side.jobExpiresAt = job.expiresAt;
  if (side.party === "worker") {
    side.shownFreeText.push(redactFreeText(job.description));
  }
}

function noteOf(message: TermMessage): string | undefined {
  return message.type === "TermPropose" || message.type === "TermCounter" ? message.note : undefined;
}

function finished(side: Side): boolean {
  return side.stopped || side.session?.phase === "agreed" || side.session?.phase === "no_deal";
}

function jobExpired(side: Side): boolean {
  return side.jobExpiresAt !== undefined && Date.parse(side.jobExpiresAt) <= Date.parse(side.now());
}

async function step(side: Side, board: JobBoard, jobId: string, clock: Clock): Promise<boolean> {
  await sync(side, board, jobId, clock);
  if (finished(side) || side.session === undefined) {
    return false;
  }
  if (jobExpired(side)) {
    side.refusals.push("the job has expired during the negotiation");
    side.stopped = true;
    return false;
  }
  const turn = nextTurn(side.config, side.session, clock);
  if (turn?.escalation !== undefined) {
    side.escalations.push(turn.escalation);
    side.stopped = true;
    return false;
  }
  if (turn?.message === undefined) {
    return false;
  }
  const sealed = await sealTermMessage(side.session, turn.message);
  const failure = await publish({
    board,
    clock,
    issuer: side.issuer,
    jobId,
    kind: negotiationKind,
    expiresAt: sealed.expiresAt,
    body: { record: termRecord, extensionsHeader: mockExtensionsHeader, message: toJson(sealed) },
    ...(side.jobExpiresAt === undefined ? {} : { notAfter: side.jobExpiresAt }),
  });
  if (failure !== undefined) {
    side.refusals.push(failure);
    side.stopped = true;
    return false;
  }
  return true;
}

function newSide(party: Party, config: TermAgentConfig, jobId: string, postedJob: TermJob | undefined, now: () => string): Side {
  return {
    party,
    issuer: issuerOf(party),
    config,
    jobId,
    postedJob,
    now,
    jobExpiresAt: undefined,
    session: undefined,
    applied: new Set<string>(),
    pending: [],
    refusals: [],
    escalations: [],
    shownFreeText: [],
    stopped: false,
  };
}

function report(side: Side): TermSideReport {
  return {
    party: side.party,
    session: side.session,
    refusals: side.refusals,
    escalations: side.escalations,
    shownFreeText: side.shownFreeText,
  };
}

export type TermSideHandle = {
  readonly party: Party;
  readonly step: () => Promise<boolean>;
  readonly sync: () => Promise<void>;
  readonly finished: () => boolean;
  readonly report: () => TermSideReport;
};

export function createTermSide(input: {
  readonly board: JobBoard;
  readonly clock: Clock;
  readonly jobId: string;
  readonly config: TermAgentConfig;
  readonly postJob?: TermJob;
}): TermSideHandle {
  const problem = checkTermMandate(input.config.mandate);
  if (problem !== undefined) {
    throw new Error(`${input.config.party} mandate is not usable: ${problem}`);
  }
  if (input.postJob !== undefined) {
    if (input.config.party !== "client" || input.postJob.jobId !== input.jobId) {
      throw new Error("only the client side posts the job, under its own job id");
    }
    for (const entry of input.postJob.preset) {
      const limit = input.config.mandate[entry.termId];
      if (limit !== undefined && !withinLimit(limit, entry.value)) {
        throw new Error(`client preset ${entry.termId} is outside the client's own mandate`);
      }
    }
  }
  const side = newSide(input.config.party, input.config, input.jobId, input.postJob, input.clock.now);
  let needsPost = input.postJob !== undefined;
  return {
    party: side.party,
    async step() {
      if (needsPost && input.postJob !== undefined) {
        needsPost = false;
        const posted = await publish({
          board: input.board,
          clock: input.clock,
          issuer: posterIssuer,
          jobId: input.jobId,
          kind: jobKind,
          expiresAt: input.postJob.expiresAt,
          body: jobBody(input.postJob),
          notAfter: input.postJob.expiresAt,
        });
        if (posted !== undefined) {
          side.refusals.push(posted);
          side.stopped = true;
          return false;
        }
        return true;
      }
      return step(side, input.board, input.jobId, input.clock);
    },
    sync: () => sync(side, input.board, input.jobId, input.clock),
    finished: () => finished(side),
    report: () => report(side),
  };
}

export async function runTermRelay(input: {
  readonly board: JobBoard;
  readonly clock: Clock;
  readonly job: TermJob;
  readonly client: TermAgentConfig;
  readonly worker: TermAgentConfig;
}): Promise<TermRelayReport> {
  const poster = createTermSide({ board: input.board, clock: input.clock, jobId: input.job.jobId, config: input.client, postJob: input.job });
  const worker = createTermSide({ board: input.board, clock: input.clock, jobId: input.job.jobId, config: input.worker });
  let quiet = 0;
  for (let index = 0; index < maxRelaySteps && quiet < 2; index += 1) {
    const posterMoved = await poster.step();
    const workerMoved = await worker.step();
    quiet = posterMoved || workerMoved ? 0 : quiet + 1;
    if (poster.finished() && worker.finished()) {
      break;
    }
  }
  await poster.sync();
  await worker.sync();
  return { poster: poster.report(), worker: worker.report(), events: await loadEvents(input.board, input.job.jobId) };
}
