import { describe, expect, it } from "vitest";
import {
  clockAt,
  createTermSide,
  jobKind,
  jobTag,
  runTermRelay,
  sampleNow,
  sampleTermClientMandate,
  sampleTermJob,
  sampleTermWorkerMandate,
} from "@ix/agents";
import { createLocalRelay } from "../src/index.js";

describe("relay trial", () => {
  it("runs the term mock agents through the local relay until both humans approve", async () => {
    const clock = clockAt(sampleNow);
    const relay = createLocalRelay({ mode: "open", clock });
    const heard: string[] = [];
    const sub = relay.subscribe({ tags: [{ name: jobTag, values: [sampleTermJob.jobId] }] }, (event) => {
      heard.push(event.kind);
    });
    expect(sub.ok).toBe(true);
    const report = await runTermRelay({
      board: relay,
      clock,
      job: sampleTermJob,
      client: { party: "client", mandate: sampleTermClientMandate, human: "approve" },
      worker: { party: "worker", mandate: sampleTermWorkerMandate, human: "approve" },
    });
    expect(report.poster.session?.phase).toBe("agreed");
    expect(report.worker.session?.phase).toBe("agreed");
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
    const poster = createTermSide({
      board: relay,
      clock,
      jobId: sampleTermJob.jobId,
      config: { party: "client", mandate: sampleTermClientMandate, human: "approve" },
      postJob: sampleTermJob,
    });
    await poster.step();
    expect(poster.report().session).toBeUndefined();
    expect(poster.report().refusals.some((reason) => reason.startsWith("public_publish_refused"))).toBe(true);
    expect(relay.query({ tags: [{ name: jobTag, values: [sampleTermJob.jobId] }] })).toEqual({
      ok: true,
      events: [],
    });
  });
});
