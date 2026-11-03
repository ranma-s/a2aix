const instantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export type Clock = {
  readonly now: () => string;
};

export function parseInstant(value: string): number | undefined {
  if (!instantPattern.test(value)) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}

export function readInstant(value: string): number {
  const parsed = parseInstant(value);
  if (parsed === undefined) {
    throw new Error(`Time must be ISO 8601. Received: ${value}`);
  }
  return parsed;
}

export function isDue(expiresAt: string, now: string): boolean {
  return readInstant(now) >= readInstant(expiresAt);
}
