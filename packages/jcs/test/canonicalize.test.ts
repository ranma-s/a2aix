import { describe, expect, it } from "vitest";
import {
  CanonicalizationError,
  canonicalize,
  maxCanonicalDepth,
} from "../src/index.js";
import type { CanonicalizationCode } from "../src/index.js";

const rfcCanonical =
  "{\"literals\":[null,true,false],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27],\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\\\\\"/\"}";

const utf16OrderCanonical =
  "{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\u0080\":\"Control\",\"ö\":\"Latin Small Letter O With Diaeresis\",\"€\":\"Euro Sign\",\"😀\":\"Emoji: Grinning Face\",\"דּ\":\"Hebrew Letter Dalet With Dagesh\"}";

function expectRejected(value: unknown, code: CanonicalizationCode): void {
  let caught: unknown;
  try {
    canonicalize(value);
  } catch (error: unknown) {
    caught = error;
  }
  if (!(caught instanceof CanonicalizationError)) {
    throw new Error("expected CanonicalizationError");
  }
  expect(caught.code).toBe(code);
  expect(caught.message).toContain("RFC 8785");
}

function ieee64(hex: string): number {
  if (!/^[0-9a-f]{16}$/.test(hex)) {
    throw new Error("ieee hex must be 16 lowercase digits");
  }
  const bytes = new Uint8Array(8);
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return new DataView(bytes.buffer).getFloat64(0, false);
}

function nestedObjects(count: number): unknown {
  let value: unknown = 1;
  for (let index = 0; index < count; index += 1) {
    value = { n: value };
  }
  return value;
}

function expectedJsonString(text: string): string {
  let encoded = '"';
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) {
      throw new Error("missing code point");
    }
    if (code === 0x08) {
      encoded += "\\b";
    } else if (code === 0x09) {
      encoded += "\\t";
    } else if (code === 0x0a) {
      encoded += "\\n";
    } else if (code === 0x0c) {
      encoded += "\\f";
    } else if (code === 0x0d) {
      encoded += "\\r";
    } else if (code < 0x20) {
      encoded += `\\u${code.toString(16).padStart(4, "0")}`;
    } else if (code === 0x22) {
      encoded += '\\"';
    } else if (code === 0x5c) {
      encoded += "\\\\";
    } else {
      encoded += char;
    }
  }
  return `${encoded}"`;
}

describe("canonicalize", () => {
  it("emits the RFC 8785 section 3.2.3 sample, including rounded numbers and escapes", () => {
    expect(
      canonicalize({
        numbers: [Number("333333333.33333329"), 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
        string: "\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"/",
        literals: [null, true, false],
      }),
    ).toBe(rfcCanonical);
  });

  it("sorts object keys by UTF-16 code units, so the RFC 8785 emoji key precedes U+FB33", () => {
    expect(
      canonicalize({
        "\u20ac": "Euro Sign",
        "\r": "Carriage Return",
        "\ufb33": "Hebrew Letter Dalet With Dagesh",
        "1": "One",
        "\ud83d\ude00": "Emoji: Grinning Face",
        "\u0080": "Control",
        "\u00f6": "Latin Small Letter O With Diaeresis",
      }),
    ).toBe(utf16OrderCanonical);
  });

  it("sorts shorter keys first and does not sort digit keys numerically", () => {
    expect(canonicalize({ ab: 1, aa: 2, a: 3, "": 4 })).toBe('{"":4,"a":3,"aa":2,"ab":1}');
    expect(canonicalize({ "10": 1, "2": 2 })).toBe('{"10":1,"2":2}');
  });

  it("emits no insignificant whitespace and preserves array order", () => {
    const encoded = canonicalize({ b: 1, a: [2, 1, 2] });
    expect(encoded).toBe('{"a":[2,1,2],"b":1}');
    expect(encoded.includes(" ")).toBe(false);
    expect(canonicalize({ note: "a b" })).toBe('{"note":"a b"}');
  });

  it("sorts nested objects and preserves nested array order", () => {
    expect(
      canonicalize({
        b: { d: 1, c: [3, 2, 1] },
        a: [{ z: true, y: null }, false],
      }),
    ).toBe('{"a":[{"y":null,"z":true},false],"b":{"c":[3,2,1],"d":1}}');
  });

  it("uses the same bytes for either insertion order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("serializes empty containers and the JSON literals", () => {
    expect(canonicalize({})).toBe("{}");
    expect(canonicalize([])).toBe("[]");
    expect(canonicalize("")).toBe('""');
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
  });

  it("serializes RFC 8785 appendix B numbers, including minus zero as 0", () => {
    const samples: readonly (readonly [string, string])[] = [
      ["0000000000000000", "0"],
      ["8000000000000000", "0"],
      ["0000000000000001", "5e-324"],
      ["8000000000000001", "-5e-324"],
      ["7fefffffffffffff", "1.7976931348623157e+308"],
      ["ffefffffffffffff", "-1.7976931348623157e+308"],
      ["4340000000000000", "9007199254740992"],
      ["c340000000000000", "-9007199254740992"],
      ["4430000000000000", "295147905179352830000"],
      ["44b52d02c7e14af5", "9.999999999999997e+22"],
      ["44b52d02c7e14af6", "1e+23"],
      ["44b52d02c7e14af7", "1.0000000000000001e+23"],
      ["444b1ae4d6e2ef4e", "999999999999999700000"],
      ["444b1ae4d6e2ef4f", "999999999999999900000"],
      ["444b1ae4d6e2ef50", "1e+21"],
      ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
      ["3eb0c6f7a0b5ed8d", "0.000001"],
      ["41b3de4355555553", "333333333.3333332"],
      ["41b3de4355555554", "333333333.33333325"],
      ["41b3de4355555555", "333333333.3333333"],
      ["41b3de4355555556", "333333333.3333334"],
      ["41b3de4355555557", "333333333.33333343"],
      ["becbf647612f3696", "-0.0000033333333333333333"],
      ["43143ff3c1cb0959", "1424953923781206.2"],
    ];
    expect(Object.is(ieee64("8000000000000000"), -0)).toBe(true);
    for (const [hex, expected] of samples) {
      expect(canonicalize(ieee64(hex))).toBe(expected);
    }
    expect(canonicalize(-0)).toBe("0");
    expect(canonicalize(0)).toBe("0");
  });

  it("rejects non-finite numbers from appendix B", () => {
    expectRejected(ieee64("7fffffffffffffff"), "JCS_INVALID_VALUE");
    expectRejected(ieee64("7ff0000000000000"), "JCS_INVALID_VALUE");
    expectRejected(ieee64("fff0000000000000"), "JCS_INVALID_VALUE");
    expectRejected(Number.NaN, "JCS_INVALID_VALUE");
    expectRejected(Number.POSITIVE_INFINITY, "JCS_INVALID_VALUE");
    expectRejected(Number.NEGATIVE_INFINITY, "JCS_INVALID_VALUE");
  });

  it("escapes controls, quotes, and backslashes, and leaves slash and non-ASCII as themselves", () => {
    expect(canonicalize("a/b")).toBe('"a/b"');
    expect(canonicalize('say "hi" \\')).toBe(expectedJsonString('say "hi" \\'));
    expect(canonicalize("\u2028\u2029")).toBe("\"\u2028\u2029\"");
    expect(canonicalize("😀")).toBe('"😀"');
    for (let code = 0; code < 0x20; code += 1) {
      const text = String.fromCharCode(code);
      expect(canonicalize(text)).toBe(expectedJsonString(text));
    }
  });

  it("does not Unicode-normalize", () => {
    expect(canonicalize("\u00e9")).not.toBe(canonicalize("e\u0301"));
  });

  it("repeats a shared object and rejects a cycle", () => {
    const shared = { a: 1 };
    expect(canonicalize({ x: shared, y: shared })).toBe('{"x":{"a":1},"y":{"a":1}}');
    const loop: { self?: unknown } = {};
    loop.self = loop;
    expectRejected(loop, "JCS_CYCLE");
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expectRejected(cyclic, "JCS_CYCLE");
  });

  it("accepts 64 nested objects and rejects one more", () => {
    expect(maxCanonicalDepth).toBe(64);
    expect(canonicalize(nestedObjects(64)).startsWith('{"n":')).toBe(true);
    expectRejected(nestedObjects(65), "JCS_DEPTH");
  });

  it("accepts a null-prototype object", () => {
    const value = {};
    Object.setPrototypeOf(value, null);
    Object.defineProperty(value, "b", {
      value: 1,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(value, "a", {
      value: 2,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(canonicalize(value)).toBe('{"a":2,"b":1}');
  });

  it("rejects values JSON would coerce or drop", () => {
    expectRejected(undefined, "JCS_INVALID_VALUE");
    expectRejected({ a: undefined }, "JCS_INVALID_VALUE");
    expectRejected([undefined], "JCS_INVALID_VALUE");
    expectRejected(1n, "JCS_INVALID_VALUE");
    expectRejected(Symbol("x"), "JCS_INVALID_VALUE");
    expectRejected(() => 1, "JCS_INVALID_VALUE");
    expectRejected(new Number(1), "JCS_INVALID_VALUE");
    expectRejected(new String("a"), "JCS_INVALID_VALUE");
    expectRejected(new Date(0), "JCS_INVALID_VALUE");
    expectRejected(new Map(), "JCS_INVALID_VALUE");
    const sparse = [1, 2, 3];
    sparse.length = 1;
    sparse.length = 3;
    expectRejected(sparse, "JCS_INVALID_VALUE");
    const hidden = {};
    Object.defineProperty(hidden, "a", { value: 1, enumerable: false });
    expectRejected(hidden, "JCS_INVALID_VALUE");
    const extra = [1];
    Object.defineProperty(extra, "tail", { value: true, enumerable: true });
    expectRejected(extra, "JCS_INVALID_VALUE");
    expectRejected("\uD800", "JCS_INVALID_VALUE");
    expectRejected("\uDFFF", "JCS_INVALID_VALUE");
    expectRejected({ "\uD800": 1 }, "JCS_INVALID_VALUE");
    const symbols = { a: 1 };
    Object.defineProperty(symbols, Symbol("s"), { value: 2, enumerable: true });
    expectRejected(symbols, "JCS_INVALID_VALUE");
  });

  it("does not call a getter or toJSON", () => {
    let reads = 0;
    const accessor = {};
    Object.defineProperty(accessor, "a", {
      enumerable: true,
      get() {
        reads += 1;
        return 1;
      },
    });
    expectRejected(accessor, "JCS_INVALID_VALUE");
    const converted = {
      a: 1,
      toJSON() {
        reads += 1;
        return { b: 2 };
      },
    };
    expectRejected(converted, "JCS_INVALID_VALUE");
    expect(reads).toBe(0);
  });
});
