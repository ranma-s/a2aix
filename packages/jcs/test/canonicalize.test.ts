import { describe, expect, it } from "vitest";
import { CanonicalizationUnavailable, canonicalize } from "../src/index.js";

function expectUnavailable(value: unknown): void {
  let caught: unknown;
  try {
    canonicalize(value);
  } catch (error: unknown) {
    caught = error;
  }
  if (!(caught instanceof CanonicalizationUnavailable)) {
    throw new Error("expected CanonicalizationUnavailable");
  }
  expect(caught.code).toBe("JCS_NOT_IMPLEMENTED");
  expect(caught.message).toContain("RFC 8785");
  expect(caught.message).toContain("JSON.stringify");
}

describe("canonicalize", () => {
  it("does not canonicalize an object", () => {
    expectUnavailable({ b: 1, a: 2 });
  });

  it("does not canonicalize an array", () => {
    expectUnavailable([1, 2]);
  });

  it("does not canonicalize a string", () => {
    expectUnavailable("ix");
  });

  it("does not canonicalize a number", () => {
    expectUnavailable(1);
  });

  it("does not canonicalize null", () => {
    expectUnavailable(null);
  });

  it.todo("RFC 8785: sorts object keys by UTF-16 code units");
  it.todo("RFC 8785: emits no insignificant whitespace");
  it.todo("RFC 8785: preserves array order");
  it.todo("RFC 8785: serializes numbers as specified");
  it.todo("RFC 8785: escapes strings as specified");
});
