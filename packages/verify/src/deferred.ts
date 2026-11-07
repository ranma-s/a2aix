export const deferredCheckNames = ["signature", "jws"] as const;

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

export function deferredChecks(input: { readonly signature: string; readonly jws: string }): readonly DeferredCheck[] {
  return [checkSignature(input.signature), checkJws(input.jws)];
}

function deferred(name: DeferredCheckName, received: boolean): DeferredCheck {
  return { name, status: "deferred", received };
}
