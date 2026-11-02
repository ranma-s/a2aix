import { readNodeMode } from "@ix/config";
import type { NodeMode } from "@ix/config";

export const nodeStatus = "stub" as const;

export function describeNode(mode: string): {
  readonly mode: NodeMode;
  readonly acceptsPublicPublish: boolean;
} {
  const resolved = readNodeMode(mode);
  return {
    mode: resolved,
    acceptsPublicPublish: resolved === "open",
  };
}
