import { describe, expect, it } from "vitest";
import { extensionUris } from "@ix/protocol-core";
import {
  awaitingPartyMetadataKey,
  phaseMetadataKey,
  reasonMetadataKey,
  requiredExtensionUris,
  roundMetadataKey,
  signatureVerification,
  status,
  uri,
} from "../src/index.js";

describe("negotiation extension", () => {
  it("keeps the profile URI and the three extensions it depends on", () => {
    expect(status).toBe("state_machine");
    expect(uri).toBe(extensionUris.negotiation);
    expect(requiredExtensionUris).toEqual([
      extensionUris.mandate,
      extensionUris.approval,
      extensionUris.transcript,
    ]);
  });

  it("names the spec metadata keys and leaves signatures unverified", () => {
    expect(signatureVerification).toBe("deferred");
    expect(phaseMetadataKey).toBe(`${uri}/phase`);
    expect(awaitingPartyMetadataKey).toBe(`${uri}/awaitingParty`);
    expect(roundMetadataKey).toBe(`${uri}/round`);
    expect(reasonMetadataKey).toBe(`${uri}/reason`);
  });
});
