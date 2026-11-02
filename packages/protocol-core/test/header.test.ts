import { describe, expect, it } from "vitest";
import { extensionUris } from "../src/index.js";
import {
  checkMessageExtensions,
  declareProfileExtensions,
  extensionHeaderName,
  formatExtensionHeader,
  negotiateExtensionHeaders,
  negotiateExtensions,
  negotiationRequiredUris,
  parseExtensionHeader,
  profileExtensionOrder,
} from "../src/index.js";

const specHeader =
  "https://w3id.org/a2a-job/ext/negotiation/v1, https://w3id.org/a2a-job/ext/mandate/v1, https://w3id.org/a2a-job/ext/approval/v1, https://w3id.org/a2a-job/ext/transcript/v1";

describe("A2A-Extensions header", () => {
  it("declares the four profile extensions as required", () => {
    const declared = declareProfileExtensions();
    expect(declared.map((entry) => entry.uri)).toEqual([...profileExtensionOrder]);
    expect(declared.map((entry) => entry.required)).toEqual([true, true, true, true]);
    expect(declared.map((entry) => entry.description)).toEqual([
      "仕事の交渉を型で扱う",
      "委任範囲と委任状",
      "人間の鍵による承認",
      "署名とハッシュでつないだ交渉履歴",
    ]);
    expect(negotiationRequiredUris).toEqual([
      extensionUris.mandate,
      extensionUris.approval,
      extensionUris.transcript,
    ]);
  });

  it("echoes the spec header when every profile URI is requested", () => {
    expect(extensionHeaderName).toBe("A2A-Extensions");
    expect(formatExtensionHeader(profileExtensionOrder)).toBe(specHeader);
    const result = negotiateExtensions({ requestedHeader: specHeader });
    expect(result.activated).toEqual([...profileExtensionOrder]);
    expect(result.ignored).toEqual([]);
    expect(result.responseHeader).toBe(specHeader);
  });

  it("uses canonical order when the client lists the URIs backwards", () => {
    const reversed = [...profileExtensionOrder].reverse().join(", ");
    const result = negotiateExtensions({ requestedHeader: reversed });
    expect(result.responseHeader).toBe(specHeader);
  });

  it("parses commas, spaces, and duplicates", () => {
    expect(
      parseExtensionHeader(
        ` ${extensionUris.mandate} , ${extensionUris.mandate}, , ${extensionUris.approval} `,
      ),
    ).toEqual([extensionUris.mandate, extensionUris.approval]);
  });

  it("does not replace an unsupported version with v1", () => {
    const v2 = "https://w3id.org/a2a-job/ext/negotiation/v2";
    const result = negotiateExtensions({
      requestedHeader: [
        v2,
        extensionUris.mandate,
        extensionUris.approval,
        extensionUris.transcript,
      ].join(", "),
    });
    expect(result.activated).toEqual([
      extensionUris.mandate,
      extensionUris.approval,
      extensionUris.transcript,
    ]);
    expect(result.activated).not.toContain(extensionUris.negotiation);
    expect(result.ignored).toEqual([{ uri: v2, reason: "unsupported" }]);
  });

  it("drops negotiation when a required extension is missing", () => {
    const result = negotiateExtensions({
      requestedHeader: [
        extensionUris.negotiation,
        extensionUris.mandate,
        extensionUris.approval,
      ].join(","),
    });
    expect(result.activated).toEqual([extensionUris.mandate, extensionUris.approval]);
    expect(result.ignored).toEqual([
      { uri: extensionUris.negotiation, reason: "missing_requirement" },
    ]);
    expect(result.responseHeader).toBe(
      `${extensionUris.mandate}, ${extensionUris.approval}`,
    );
  });

  it("activates nothing when only negotiation is requested", () => {
    const result = negotiateExtensions({ requestedHeader: extensionUris.negotiation });
    expect(result.activated).toEqual([]);
    expect(result.ignored).toEqual([
      { uri: extensionUris.negotiation, reason: "missing_requirement" },
    ]);
    expect(result.responseHeader).toBe("");
  });

  it("activates the required extensions without negotiation", () => {
    const result = negotiateExtensions({
      requestedHeader: formatExtensionHeader(negotiationRequiredUris),
    });
    expect(result.activated).toEqual([...negotiationRequiredUris]);
    expect(result.ignored).toEqual([]);
  });

  it("ignores a URI that differs only by case", () => {
    const shouted = "HTTPS://w3id.org/a2a-job/ext/mandate/v1";
    const result = negotiateExtensions({ requestedHeader: shouted });
    expect(result.activated).toEqual([]);
    expect(result.ignored).toEqual([{ uri: shouted, reason: "unsupported" }]);
  });

  it("follows a caller-supplied supported list and drops negotiation if a requirement is unsupported", () => {
    const result = negotiateExtensions({
      requestedHeader: specHeader,
      supported: [extensionUris.transcript, extensionUris.mandate, extensionUris.negotiation],
    });
    expect(result.activated).toEqual([extensionUris.transcript, extensionUris.mandate]);
    expect(result.ignored).toEqual([
      { uri: extensionUris.negotiation, reason: "missing_requirement" },
      { uri: extensionUris.approval, reason: "unsupported" },
    ]);
  });

  it("reads the header name without case sensitivity", () => {
    const result = negotiateExtensionHeaders({
      headers: { "a2a-extensions": specHeader },
    });
    expect(result.responseHeader).toBe(specHeader);
    expect(readMissing()).toBe("");
  });

  it("checks message extensions against the activated set", () => {
    const activated = negotiateExtensions({ requestedHeader: specHeader }).activated;
    expect(
      checkMessageExtensions(
        [extensionUris.negotiation, extensionUris.transcript],
        activated,
      ),
    ).toEqual({ ok: true });
    expect(checkMessageExtensions([], activated)).toEqual({ ok: true });
    const inactive = checkMessageExtensions(
      [extensionUris.approval, extensionUris.approval],
      [extensionUris.mandate],
    );
    expect(inactive).toEqual({ ok: false, inactive: [extensionUris.approval] });
  });
});

function readMissing(): string {
  return negotiateExtensionHeaders({ headers: { accept: "application/json" } }).responseHeader;
}
