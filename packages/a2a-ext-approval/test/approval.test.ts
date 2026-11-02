import { describe, expect, it } from "vitest";
import { extensionUris } from "@ix/protocol-core";
import { status, uri } from "../src/index.js";

describe("approval extension", () => {
  it("points at the profile URI and does not sign", () => {
    expect(status).toBe("stub");
    expect(uri).toBe(extensionUris.approval);
  });
});
