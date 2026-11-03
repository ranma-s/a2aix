import { describe, expect, it } from "vitest";
import { JsonParseError, canonicalize, parseJson } from "../src/index.js";
import type { JsonParseCode } from "../src/index.js";

function expectParseError(text: string, code: JsonParseCode): void {
  let caught: unknown;
  try {
    parseJson(text);
  } catch (error: unknown) {
    caught = error;
  }
  if (!(caught instanceof JsonParseError)) {
    throw new Error("expected JsonParseError");
  }
  expect(caught.code).toBe(code);
}

function nestedJson(count: number): string {
  return `${"{\"n\":".repeat(count)}1${"}".repeat(count)}`;
}

describe("parseJson", () => {
  it("parses JSON text and canonicalizes the result", () => {
    expect(canonicalize(parseJson(' { "b" : 1, "a" : 2 } '))).toBe('{"a":2,"b":1}');
    expect(parseJson("true")).toBe(true);
    expect(parseJson("null")).toBe(null);
    expect(parseJson("[]")).toEqual([]);
    expect(Object.is(parseJson("-0"), -0)).toBe(true);
    expect(parseJson("1e+2")).toBe(100);
    expect(parseJson("1e+0000001")).toBe(10);
    expect(parseJson("1e+0000007")).toBe(10000000);
    expect(parseJson("10.0")).toBe(10);
    expect(parseJson("1000e-1")).toBe(100);
    expect(parseJson("1.5")).toBe(1.5);
    expect(parseJson("9007199254740991")).toBe(9007199254740991);
    expect(parseJson("9007199254740991.0")).toBe(9007199254740991);
    expect(parseJson("-9007199254740991")).toBe(-9007199254740991);
  });

  it("keeps a __proto__ key as an own property", () => {
    const parsed = parseJson('{"__proto__":{"admin":true},"a":1}');
    if (parsed === null || typeof parsed !== "object") {
      throw new Error("expected object");
    }
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(canonicalize(parsed)).toBe('{"__proto__":{"admin":true},"a":1}');
  });

  it("rejects duplicate keys, including names that differ only by escaping", () => {
    expectParseError('{"a":1,"a":2}', "JSON_DUPLICATE_KEY");
    expectParseError('{"a":1,"\\u0061":2}', "JSON_DUPLICATE_KEY");
    expectParseError('{"a":{"b":1,"b":2}}', "JSON_DUPLICATE_KEY");
  });

  it("rejects integers outside the safe range and keeps inexact fractions", () => {
    expectParseError("9007199254740992", "JSON_UNSAFE_INTEGER");
    expectParseError("9007199254740993", "JSON_UNSAFE_INTEGER");
    expectParseError("-9007199254740992", "JSON_UNSAFE_INTEGER");
    expectParseError("9007199254740992.0", "JSON_UNSAFE_INTEGER");
    expectParseError("1e+21", "JSON_UNSAFE_INTEGER");
    expectParseError("1E30", "JSON_UNSAFE_INTEGER");
    expectParseError("1e+309", "JSON_UNSAFE_INTEGER");
    expect(parseJson("1e-27")).toBe(1e-27);
    expect(canonicalize(parseJson("4.5"))).toBe("4.5");
  });

  it("rejects non-finite numbers, bad syntax, and one nesting level past 64", () => {
    expectParseError("1e+9999999", "JSON_UNSAFE_INTEGER");
    expectParseError("01", "JSON_SYNTAX");
    expectParseError('{"a":1,}', "JSON_SYNTAX");
    expectParseError('{"a":1} true', "JSON_SYNTAX");
    expectParseError("\uFEFF{}", "JSON_SYNTAX");
    expectParseError('"\\uD800"', "JSON_SYNTAX");
    expect(parseJson('"\\uD83D\\uDE00"')).toBe("😀");
    expect(canonicalize(parseJson(nestedJson(64))).startsWith('{"n":')).toBe(true);
    expectParseError(nestedJson(65), "JSON_DEPTH");
    let caught: unknown;
    try {
      parseJson(nestedJson(65));
    } catch (error: unknown) {
      caught = error;
    }
    if (!(caught instanceof JsonParseError)) {
      throw new Error("expected JsonParseError");
    }
    expect(caught.message).toContain("64");
  });
});
