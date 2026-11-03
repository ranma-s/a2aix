export class CanonicalHashError extends Error {
  readonly code = "CANONICAL_HASH_FAILED" as const;

  constructor(detail: string, cause?: unknown) {
    const message = `SHA-256 of canonical UTF-8 bytes failed (${detail}).`;
    if (cause === undefined) {
      super(message);
    } else {
      super(message, { cause });
    }
    this.name = "CanonicalHashError";
  }
}
