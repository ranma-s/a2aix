export const keyHandling = "absent" as const;

export type PublicIdentityRef = {
  readonly did: string;
};

export function refuseKeyOperation(operation: string): never {
  throw new Error(
    `Refusing identity operation "${operation}". Key generation, storage, and signing need a human security reviewer before implementation.`,
  );
}
