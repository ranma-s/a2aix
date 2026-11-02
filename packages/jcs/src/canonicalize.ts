export const maxCanonicalDepth = 64;

export type CanonicalizationCode = "JCS_INVALID_VALUE" | "JCS_DEPTH" | "JCS_CYCLE";

export class CanonicalizationError extends Error {
  readonly code: CanonicalizationCode;

  constructor(code: CanonicalizationCode, detail: string) {
    super(`JCS (RFC 8785) rejected the value (${code}: ${detail}).`);
    this.name = "CanonicalizationError";
    this.code = code;
  }
}

export function canonicalize(value: unknown): string {
  return serialize(value, new WeakSet(), 0);
}

function serialize(value: unknown, stack: WeakSet<object>, depth: number): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return serializeNumber(value);
    case "string":
      return serializeString(value);
    case "bigint":
      throw new CanonicalizationError("JCS_INVALID_VALUE", "bigint");
    case "symbol":
      throw new CanonicalizationError("JCS_INVALID_VALUE", "symbol");
    case "function":
      throw new CanonicalizationError("JCS_INVALID_VALUE", "function");
    case "undefined":
      throw new CanonicalizationError("JCS_INVALID_VALUE", "undefined");
    case "object":
      return serializeContainer(value, stack, depth);
    default:
      throw new CanonicalizationError("JCS_INVALID_VALUE", "unsupported");
  }
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError("JCS_INVALID_VALUE", "non-finite number");
  }
  return JSON.stringify(value);
}

function serializeString(value: string): string {
  if (!isWellFormedString(value)) {
    throw new CanonicalizationError("JCS_INVALID_VALUE", "lone surrogate");
  }
  return JSON.stringify(value);
}

function serializeContainer(value: object, stack: WeakSet<object>, depth: number): string {
  if (depth >= maxCanonicalDepth) {
    throw new CanonicalizationError("JCS_DEPTH", "nesting limit");
  }
  if (stack.has(value)) {
    throw new CanonicalizationError("JCS_CYCLE", "cycle");
  }
  stack.add(value);
  try {
    if (isArray(value)) {
      return serializeArray(value, stack, depth);
    }
    return serializeObject(value, stack, depth);
  } finally {
    stack.delete(value);
  }
}

function isArray(value: object): value is readonly unknown[] {
  return Array.isArray(value);
}

function serializeArray(
  value: readonly unknown[],
  stack: WeakSet<object>,
  depth: number,
): string {
  assertArrayShape(value);
  const parts: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    parts.push(serialize(value[index], stack, depth + 1));
  }
  return `[${parts.join(",")}]`;
}

function assertArrayShape(value: readonly unknown[]): void {
  if ("toJSON" in value) {
    throw new CanonicalizationError("JCS_INVALID_VALUE", "toJSON");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CanonicalizationError("JCS_INVALID_VALUE", "symbol property");
  }
  const indexes = new Set<number>();
  for (const name of Object.getOwnPropertyNames(value)) {
    if (name === "length") {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (descriptor === undefined || descriptor.enumerable === true) {
        throw new CanonicalizationError("JCS_INVALID_VALUE", "array length");
      }
      continue;
    }
    if (!isCanonicalIndex(name, value.length)) {
      throw new CanonicalizationError("JCS_INVALID_VALUE", "array property");
    }
    assertDataProperty(value, name);
    indexes.add(Number(name));
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!indexes.has(index)) {
      throw new CanonicalizationError("JCS_INVALID_VALUE", "sparse array");
    }
  }
}

function isCanonicalIndex(name: string, length: number): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(name)) {
    return false;
  }
  const index = Number(name);
  return Number.isSafeInteger(index) && index < length;
}

function serializeObject(value: object, stack: WeakSet<object>, depth: number): string {
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new CanonicalizationError("JCS_INVALID_VALUE", "non-plain object");
  }
  if ("toJSON" in value) {
    throw new CanonicalizationError("JCS_INVALID_VALUE", "toJSON");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CanonicalizationError("JCS_INVALID_VALUE", "symbol property");
  }
  const names = Object.getOwnPropertyNames(value);
  for (const name of names) {
    if (!isWellFormedString(name)) {
      throw new CanonicalizationError("JCS_INVALID_VALUE", "lone surrogate");
    }
    assertDataProperty(value, name);
  }
  const parts: string[] = [];
  for (const name of [...names].sort()) {
    parts.push(
      `${JSON.stringify(name)}:${serialize(readDataProperty(value, name), stack, depth + 1)}`,
    );
  }
  return `{${parts.join(",")}}`;
}

function assertDataProperty(value: object, name: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (
    descriptor === undefined ||
    descriptor.enumerable !== true ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    !("value" in descriptor)
  ) {
    throw new CanonicalizationError("JCS_INVALID_VALUE", "property");
  }
}

function readDataProperty(value: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new CanonicalizationError("JCS_INVALID_VALUE", "property");
  }
  const property: unknown = descriptor.value;
  return property;
}

function isWellFormedString(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const nextIndex = index + 1;
      if (nextIndex >= text.length) {
        return false;
      }
      const next = text.charCodeAt(nextIndex);
      if (next < 0xdc00 || next > 0xdfff) {
        return false;
      }
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}
