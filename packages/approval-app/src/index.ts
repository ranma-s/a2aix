import { refuseKeyOperation } from "@ix/identity";

export const approvalAppStatus = "stub" as const;

export function signApproval(party: string): never {
  return refuseKeyOperation(`approval signature for ${party}`);
}
