import type { JsonValue } from "@ix/distribution";

export const deferredCheckNames = ["signature", "jcs", "jws", "prevHash"] as const;

export type DeferredCheckName = (typeof deferredCheckNames)[number];

export type DeferredCheck = {
  readonly name: DeferredCheckName;
  readonly status: "deferred";
  readonly received: boolean;
};

export function checkSignature(material: string): DeferredCheck {
  return deferred("signature", material.length > 0);
}

export function checkJws(material: string): DeferredCheck {
  return deferred("jws", material.length > 0);
}

export function checkPrevHash(prevHash: string): DeferredCheck {
  return deferred("prevHash", prevHash.length > 0);
}

export function checkJcs(body: JsonValue): DeferredCheck {
  return deferred("jcs", jsonWasSupplied(body));
}

export function deferredChecks(input: {
  readonly signature: string;
  readonly jws: string;
  readonly prevHash: string;
  readonly jcsBody: JsonValue;
}): readonly DeferredCheck[] {
  return [
    checkSignature(input.signature),
    checkJcs(input.jcsBody),
    checkJws(input.jws),
    checkPrevHash(input.prevHash),
  ];
}

function deferred(name: DeferredCheckName, received: boolean): DeferredCheck {
  return { name, status: "deferred", received };
}

function jsonWasSupplied(body: JsonValue): boolean {
  if (body === null) {
    return true;
  }
  switch (typeof body) {
    case "string":
    case "number":
    case "boolean":
      return true;
    case "object":
      return true;
  }
}
