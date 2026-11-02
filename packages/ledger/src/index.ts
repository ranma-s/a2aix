import { recordKinds } from "@ix/log";
import type { RecordKind } from "@ix/log";

export const ledgerStatus = "stub" as const;

export function knownRecordKind(value: string): value is RecordKind {
  for (const kind of recordKinds) {
    if (kind === value) {
      return true;
    }
  }
  return false;
}
