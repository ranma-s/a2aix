import { maxCanonicalDepth } from "./canonicalize.js";

export type JsonParseCode =
  | "JSON_SYNTAX"
  | "JSON_DUPLICATE_KEY"
  | "JSON_UNSAFE_INTEGER"
  | "JSON_NON_FINITE"
  | "JSON_DEPTH";

export class JsonParseError extends Error {
  readonly code: JsonParseCode;

  constructor(code: JsonParseCode, detail: string) {
    super(`JSON text was rejected (${code}: ${detail}).`);
    this.name = "JsonParseError";
    this.code = code;
  }
}

const safeIntegerLimit = "9007199254740991";

export function parseJson(text: string): unknown {
  const parser = new Parser(text);
  const value = parser.parseValue(0);
  parser.skipWhitespace();
  if (!parser.atEnd()) {
    throw new JsonParseError("JSON_SYNTAX", "trailing data");
  }
  return value;
}

class Parser {
  private index = 0;

  constructor(private readonly text: string) {}

  atEnd(): boolean {
    return this.index >= this.text.length;
  }

  parseValue(depth: number): unknown {
    this.skipWhitespace();
    const ch = this.current();
    if (ch === "{") {
      return this.parseObject(depth);
    }
    if (ch === "[") {
      return this.parseArray(depth);
    }
    if (ch === '"') {
      return this.parseString();
    }
    if (ch === "t") {
      return this.parseLiteral("true", true);
    }
    if (ch === "f") {
      return this.parseLiteral("false", false);
    }
    if (ch === "n") {
      return this.parseLiteral("null", null);
    }
    if (ch === "-" || isDigit(ch)) {
      return this.parseNumber();
    }
    throw new JsonParseError("JSON_SYNTAX", "value");
  }

  private parseObject(depth: number): Record<string, unknown> {
    if (depth >= maxCanonicalDepth) {
      throw new JsonParseError("JSON_DEPTH", "nesting limit 64");
    }
    this.expect("{");
    const value: Record<string, unknown> = {};
    const seen = new Set<string>();
    this.skipWhitespace();
    if (this.current() === "}") {
      this.index += 1;
      return value;
    }
    while (this.index < this.text.length) {
      this.skipWhitespace();
      if (this.current() !== '"') {
        throw new JsonParseError("JSON_SYNTAX", "object key");
      }
      const key = this.parseString();
      if (seen.has(key)) {
        throw new JsonParseError("JSON_DUPLICATE_KEY", "object key");
      }
      seen.add(key);
      this.skipWhitespace();
      this.expect(":");
      const property = this.parseValue(depth + 1);
      Object.defineProperty(value, key, {
        value: property,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      this.skipWhitespace();
      const separator = this.current();
      if (separator === ",") {
        this.index += 1;
        continue;
      }
      if (separator === "}") {
        this.index += 1;
        return value;
      }
      throw new JsonParseError("JSON_SYNTAX", "object");
    }
    throw new JsonParseError("JSON_SYNTAX", "object");
  }

  private parseArray(depth: number): unknown[] {
    if (depth >= maxCanonicalDepth) {
      throw new JsonParseError("JSON_DEPTH", "nesting limit 64");
    }
    this.expect("[");
    const value: unknown[] = [];
    this.skipWhitespace();
    if (this.current() === "]") {
      this.index += 1;
      return value;
    }
    while (this.index < this.text.length) {
      value.push(this.parseValue(depth + 1));
      this.skipWhitespace();
      const separator = this.current();
      if (separator === ",") {
        this.index += 1;
        continue;
      }
      if (separator === "]") {
        this.index += 1;
        return value;
      }
      throw new JsonParseError("JSON_SYNTAX", "array");
    }
    throw new JsonParseError("JSON_SYNTAX", "array");
  }

  private parseString(): string {
    this.expect('"');
    let decoded = "";
    while (this.index < this.text.length) {
      const ch = this.current();
      if (ch === '"') {
        this.index += 1;
        if (!isWellFormedString(decoded)) {
          throw new JsonParseError("JSON_SYNTAX", "lone surrogate");
        }
        return decoded;
      }
      if (ch === "\\") {
        decoded += this.parseEscape();
        continue;
      }
      if (ch === undefined || ch.charCodeAt(0) < 0x20) {
        throw new JsonParseError("JSON_SYNTAX", "string");
      }
      decoded += ch;
      this.index += 1;
    }
    throw new JsonParseError("JSON_SYNTAX", "string");
  }

  private parseEscape(): string {
    this.expect("\\");
    const ch = this.current();
    this.index += 1;
    if (ch === '"' || ch === "\\" || ch === "/") {
      return ch;
    }
    if (ch === "b") {
      return "\b";
    }
    if (ch === "f") {
      return "\f";
    }
    if (ch === "n") {
      return "\n";
    }
    if (ch === "r") {
      return "\r";
    }
    if (ch === "t") {
      return "\t";
    }
    if (ch === "u") {
      return String.fromCharCode(this.parseHex4());
    }
    throw new JsonParseError("JSON_SYNTAX", "escape");
  }

  private parseHex4(): number {
    let hex = "";
    for (let count = 0; count < 4; count += 1) {
      const ch = this.current();
      if (!isHex(ch)) {
        throw new JsonParseError("JSON_SYNTAX", "unicode escape");
      }
      hex += ch;
      this.index += 1;
    }
    return Number.parseInt(hex, 16);
  }

  private parseLiteral(token: string, value: unknown): unknown {
    if (this.text.slice(this.index, this.index + token.length) !== token) {
      throw new JsonParseError("JSON_SYNTAX", "literal");
    }
    this.index += token.length;
    return value;
  }

  private parseNumber(): number {
    const start = this.index;
    if (this.current() === "-") {
      this.index += 1;
    }
    if (this.current() === "0") {
      this.index += 1;
    } else if (isDigit(this.current())) {
      while (isDigit(this.current())) {
        this.index += 1;
      }
    } else {
      throw new JsonParseError("JSON_SYNTAX", "number");
    }
    if (this.current() === ".") {
      this.index += 1;
      if (!isDigit(this.current())) {
        throw new JsonParseError("JSON_SYNTAX", "number");
      }
      while (isDigit(this.current())) {
        this.index += 1;
      }
    }
    const exponentMark = this.current();
    if (exponentMark === "e" || exponentMark === "E") {
      this.index += 1;
      const sign = this.current();
      if (sign === "+" || sign === "-") {
        this.index += 1;
      }
      if (!isDigit(this.current())) {
        throw new JsonParseError("JSON_SYNTAX", "number");
      }
      while (isDigit(this.current())) {
        this.index += 1;
      }
    }
    const lexeme = this.text.slice(start, this.index);
    assertSafeInteger(lexeme);
    const numeric = Number(lexeme);
    if (!Number.isFinite(numeric)) {
      throw new JsonParseError("JSON_NON_FINITE", "number");
    }
    return numeric;
  }

  skipWhitespace(): void {
    while (isWhitespace(this.current())) {
      this.index += 1;
    }
  }

  private expect(ch: string): void {
    if (this.current() !== ch) {
      throw new JsonParseError("JSON_SYNTAX", "delimiter");
    }
    this.index += 1;
  }

  private current(): string | undefined {
    return this.text[this.index];
  }
}

function assertSafeInteger(lexeme: string): void {
  const magnitude = integerMagnitude(lexeme.startsWith("-") ? lexeme.slice(1) : lexeme);
  if (magnitude === undefined) {
    return;
  }
  if (magnitude.length > safeIntegerLimit.length) {
    throw new JsonParseError("JSON_UNSAFE_INTEGER", "number");
  }
  if (magnitude.length === safeIntegerLimit.length && magnitude > safeIntegerLimit) {
    throw new JsonParseError("JSON_UNSAFE_INTEGER", "number");
  }
}

function integerMagnitude(body: string): string | undefined {
  const exponentAt = findExponent(body);
  const mantissa = exponentAt === -1 ? body : body.slice(0, exponentAt);
  const exponent = exponentAt === -1 ? 0 : readExponent(body.slice(exponentAt + 1));
  const point = mantissa.indexOf(".");
  const scale = point === -1 ? 0 : mantissa.length - point - 1;
  const digits = stripLeadingZeros(point === -1 ? mantissa : mantissa.replace(".", ""));
  if (/^0+$/.test(digits)) {
    return undefined;
  }
  if (exponent === "positive") {
    throw new JsonParseError("JSON_UNSAFE_INTEGER", "number");
  }
  if (exponent === "negative") {
    return undefined;
  }
  const adjusted = exponent - scale;
  if (adjusted >= 0) {
    const length = digits.length + adjusted;
    if (length > safeIntegerLimit.length) {
      throw new JsonParseError("JSON_UNSAFE_INTEGER", "number");
    }
    if (length < safeIntegerLimit.length) {
      return digits;
    }
    return `${digits}${"0".repeat(adjusted)}`;
  }
  const drop = -adjusted;
  if (drop >= digits.length) {
    return undefined;
  }
  if (!/^0+$/.test(digits.slice(digits.length - drop))) {
    return undefined;
  }
  return stripLeadingZeros(digits.slice(0, digits.length - drop));
}

function findExponent(body: string): number {
  const lower = body.indexOf("e");
  const upper = body.indexOf("E");
  if (lower === -1) {
    return upper;
  }
  if (upper === -1) {
    return lower;
  }
  return Math.min(lower, upper);
}

function readExponent(raw: string): number | "positive" | "negative" {
  let sign: "positive" | "negative" = "positive";
  let digits = raw;
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else if (digits.startsWith("-")) {
    sign = "negative";
    digits = digits.slice(1);
  }
  digits = stripLeadingZeros(digits);
  if (digits.length > 6) {
    return sign;
  }
  const magnitude = Number(digits);
  return sign === "negative" ? -magnitude : magnitude;
}

function stripLeadingZeros(digits: string): string {
  let index = 0;
  while (index < digits.length - 1 && digits[index] === "0") {
    index += 1;
  }
  return digits.slice(index);
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function isHex(ch: string | undefined): ch is string {
  return (
    isDigit(ch) ||
    (ch !== undefined && ch >= "a" && ch <= "f") ||
    (ch !== undefined && ch >= "A" && ch <= "F")
  );
}

function isWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
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
