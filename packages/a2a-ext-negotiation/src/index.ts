import { uri as approvalUri } from "@ix/a2a-ext-approval";
import { uri as mandateUri } from "@ix/a2a-ext-mandate";
import { uri as transcriptUri } from "@ix/a2a-ext-transcript";
import { extensionUris } from "@ix/protocol-core";

export const uri = extensionUris.negotiation;
export const status = "stub" as const;
export const requiredExtensionUris = [mandateUri, approvalUri, transcriptUri] as const;
