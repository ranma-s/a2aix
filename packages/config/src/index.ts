export const nodeModes = ["open", "closed"] as const;

export type NodeMode = (typeof nodeModes)[number];

export type NodeConfig = {
  readonly mode: NodeMode;
};

export function isNodeMode(value: string): value is NodeMode {
  for (const mode of nodeModes) {
    if (mode === value) {
      return true;
    }
  }
  return false;
}

export function readNodeMode(value: string): NodeMode {
  if (isNodeMode(value)) {
    return value;
  }
  throw new Error(`Node mode must be "open" or "closed". Received: ${value}`);
}
