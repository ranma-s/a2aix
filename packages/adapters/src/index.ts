import { isNodeMode } from "@ix/config";
import { createRelay } from "@ix/node";
import type { Clock } from "@ix/distribution";
import type { Relay } from "@ix/node";
import { createMemoryEventStore } from "./memory.js";

export const adapterStatus = "memory" as const;

export function adapterRecognizesMode(value: string): boolean {
  return isNodeMode(value);
}

export { createMemoryEventStore } from "./memory.js";

export function createLocalRelay(input: { readonly mode: string; readonly clock: Clock }): Relay {
  return createRelay({
    mode: input.mode,
    clock: input.clock,
    store: createMemoryEventStore(),
  });
}
