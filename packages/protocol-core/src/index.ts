export const protocolCoreStatus = "extensions" as const;

export { extensionUris } from "./uris.js";
export type { ExtensionName } from "./uris.js";
export {
  checkMessageExtensions,
  declareProfileExtensions,
  extensionHeaderName,
  formatExtensionHeader,
  negotiateExtensionHeaders,
  negotiateExtensions,
  negotiationRequiredUris,
  parseExtensionHeader,
  profileExtensionOrder,
  readExtensionHeader,
} from "./header.js";
export type {
  ExtensionDeclaration,
  ExtensionNegotiation,
  IgnoredExtension,
  IgnoredReason,
  MessageExtensionCheck,
} from "./header.js";
