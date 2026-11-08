import { describe, expect, it } from "vitest";
import { checkTermValue, initialSpecTerm } from "../src/index.js";
import type { TermJson } from "../src/index.js";

const sha = (digit: string): string => digit.repeat(64);
const file = (path: string): TermJson => ({ manifestSha256: sha("9"), files: [{ path, sha256: sha("1"), bytes: 1, mediaType: "application/pdf" }] });
const pathRefusal = "a file needs a lowercase SHA-256, a byte size, and a media type";

type Outcome = "refusal" | "acceptance";

interface PathRow {
  name: string;
  path: string;
  outcome: Outcome;
}

const rows: PathRow[] = [
  { name: "colon-only", path: "notes:draft.pdf", outcome: "refusal" },
  { name: "backslash-only", path: "spec\\file.pdf", outcome: "refusal" },
  { name: "trailing-space", path: "requirements.pdf ", outcome: "refusal" },
  { name: "empty-segment", path: "spec/", outcome: "refusal" },
  { name: "dot", path: ".", outcome: "refusal" },
  { name: "dotdot", path: "..", outcome: "refusal" },
  { name: "ordinary-relative", path: "readme.md", outcome: "acceptance" },
];

const expected = (outcome: Outcome): string | undefined => (outcome === "refusal" ? pathRefusal : undefined);

describe("documents term path gaps", () => {
  it.each(rows)("$name: $path is a $outcome", ({ path, outcome }) => {
    expect(checkTermValue(initialSpecTerm, file(path))).toBe(expected(outcome));
  });
});