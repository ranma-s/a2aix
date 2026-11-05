import type { Clock } from "@ix/a2a-ext-negotiation";

export const sampleNow = "2026-11-04T00:00:00.000Z" as const;

export function clockAt(now: string): Clock {
  return {
    now() {
      return now;
    },
  };
}
