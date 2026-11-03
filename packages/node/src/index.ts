import { readNodeMode } from "@ix/config";
import type { NodeMode } from "@ix/config";

export const nodeStatus = "local_relay" as const;

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

export { createRelay } from "./relay.js";
export type {
  EventListener,
  PublishReason,
  PublishResult,
  QueryResult,
  Relay,
  SubscribeResult,
} from "./relay.js";
