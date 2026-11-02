import { isNodeMode } from "@ix/config";

export const adapterStatus = "stub" as const;

export function adapterRecognizesMode(value: string): boolean {
  return isNodeMode(value);
}
