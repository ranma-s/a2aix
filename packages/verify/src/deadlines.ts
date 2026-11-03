import { parseInstant } from "@ix/distribution";
import type { VerifyMessage } from "./schema.js";

export type DeadlineResult = { readonly ok: true } | { readonly ok: false; readonly detail: string };

export function checkDeadlines(messages: readonly VerifyMessage[], now: string): DeadlineResult {
  const nowMs = parseInstant(now);
  if (nowMs === undefined) {
    return { ok: false, detail: "now is not an instant" };
  }
  for (const message of messages) {
    const expiresAt = parseInstant(message.expiresAt);
    if (expiresAt === undefined || nowMs >= expiresAt) {
      return { ok: false, detail: "a message is at or past its deadline" };
    }
  }
  return { ok: true };
}
