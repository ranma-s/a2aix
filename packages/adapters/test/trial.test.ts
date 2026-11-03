import { describe, expect, it } from "vitest";
import {
  clockAt,
  createPoster,
  jobKind,
  jobTag,
  runPosterWorker,
  sampleJob,
  sampleNow,
  samplePosterBound,
  sampleWorkerBound,
} from "@ix/agents";
import { createLocalRelay } from "../src/index.js";

const humans = { client: "approve", worker: "approve" } as const;

describe("relay trial", () => {
  it("runs the mock agents through the local relay until both humans approve", async () => {
    const clock = clockAt(sampleNow);
    const relay = createLocalRelay({ mode: "open", clock });
    const heard: string[] = [];
    const sub = relay.subscribe({ tags: [{ name: jobTag, values: [sampleJob.jobId] }] }, (event) => {
      heard.push(event.kind);
    });
    expect(sub.ok).toBe(true);
    const report = await runPosterWorker({
      board: relay,
      clock,
      job: sampleJob,
      posterBound: samplePosterBound,
      workerBound: sampleWorkerBound,
      humans,
    });
    expect(report.poster.phase).toBe("agreed");
    expect(report.worker.phase).toBe("agreed");
    expect(heard[0]).toBe(jobKind);
    for (const event of report.events) {
      expect(event.signatureVerification).toBe("deferred");
    }
    if (sub.ok) {
      sub.close();
    }
  });

  it("refuses the poster when the relay is closed", async () => {
    const clock = clockAt(sampleNow);
    const relay = createLocalRelay({ mode: "closed", clock });
    const poster = createPoster({
      board: relay,
      clock,
      job: sampleJob,
      bound: samplePosterBound,
      human: "approve",
    });
    await poster.step();
    expect(poster.session().phase).toBe("idle");
    expect(poster.refusals().map((refusal) => refusal.reason)).toContain("closed");
    expect(relay.query({ tags: [{ name: jobTag, values: [sampleJob.jobId] }] })).toEqual({
      ok: true,
      events: [],
    });
  });
});
