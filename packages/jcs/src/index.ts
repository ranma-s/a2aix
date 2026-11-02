export class CanonicalizationUnavailable extends Error {
  readonly code = "JCS_NOT_IMPLEMENTED" as const;

  constructor(valueKind: string) {
    super(
      `JCS (RFC 8785) canonicalization is not implemented (value kind: ${valueKind}). Test vectors are TODO. Do not hash or sign with JSON.stringify.`,
    );
    this.name = "CanonicalizationUnavailable";
  }
}

export function canonicalize(value: unknown): never {
  throw new CanonicalizationUnavailable(describeKind(value));
}

function describeKind(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}
