import { extensionUris } from "./uris.js";

export const extensionHeaderName = "A2A-Extensions" as const;

export const profileExtensionOrder = [
  extensionUris.negotiation,
  extensionUris.mandate,
  extensionUris.approval,
  extensionUris.transcript,
] as const;

export const negotiationRequiredUris = [
  extensionUris.mandate,
  extensionUris.approval,
  extensionUris.transcript,
] as const;

const descriptions: {
  readonly [uri in (typeof profileExtensionOrder)[number]]: string;
} = {
  [extensionUris.negotiation]: "仕事の交渉を型で扱う",
  [extensionUris.mandate]: "委任範囲と委任状",
  [extensionUris.approval]: "人間の鍵による承認",
  [extensionUris.transcript]: "署名とハッシュでつないだ交渉履歴",
};

export type ExtensionDeclaration = {
  readonly uri: (typeof profileExtensionOrder)[number];
  readonly description: string;
  readonly required: true;
};

export type IgnoredReason = "unsupported" | "missing_requirement";

export type IgnoredExtension = {
  readonly uri: string;
  readonly reason: IgnoredReason;
};

export type ExtensionNegotiation = {
  readonly activated: readonly string[];
  readonly ignored: readonly IgnoredExtension[];
  readonly responseHeader: string;
};

export type MessageExtensionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly inactive: readonly string[] };

export function declareProfileExtensions(): readonly ExtensionDeclaration[] {
  const declared: ExtensionDeclaration[] = [];
  for (const uri of profileExtensionOrder) {
    declared.push({
      uri,
      description: descriptions[uri],
      required: true,
    });
  }
  return declared;
}

export function parseExtensionHeader(value: string): readonly string[] {
  const tokens: string[] = [];
  for (const part of value.split(",")) {
    tokens.push(part.trim());
  }
  return unique(tokens);
}

export function formatExtensionHeader(uris: readonly string[]): string {
  return uris.join(", ");
}

export function readExtensionHeader(headers: Readonly<Record<string, string>>): string {
  const expected = extensionHeaderName.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== expected) {
      continue;
    }
    const value = headers[key];
    if (value === undefined) {
      continue;
    }
    return value;
  }
  return "";
}

export function negotiateExtensions(input: {
  readonly requestedHeader: string;
  readonly supported?: readonly string[];
}): ExtensionNegotiation {
  const requested = parseExtensionHeader(input.requestedHeader);
  const supportedOrder = unique(input.supported ?? profileExtensionOrder);
  const supported = new Set(supportedOrder);
  const candidates = new Set<string>();
  for (const uri of requested) {
    if (supported.has(uri)) {
      candidates.add(uri);
    }
  }
  const negotiation = extensionUris.negotiation;
  const dropNegotiation = candidates.has(negotiation) && !requirementsActive(candidates);
  if (dropNegotiation) {
    candidates.delete(negotiation);
  }
  const ignored: IgnoredExtension[] = [];
  for (const uri of requested) {
    if (candidates.has(uri)) {
      continue;
    }
    const reason: IgnoredReason =
      uri === negotiation && dropNegotiation ? "missing_requirement" : "unsupported";
    ignored.push({ uri, reason });
  }
  const activated: string[] = [];
  for (const uri of supportedOrder) {
    if (candidates.has(uri)) {
      activated.push(uri);
    }
  }
  return {
    activated,
    ignored,
    responseHeader: formatExtensionHeader(activated),
  };
}

export function negotiateExtensionHeaders(input: {
  readonly headers: Readonly<Record<string, string>>;
  readonly supported?: readonly string[];
}): ExtensionNegotiation {
  const requestedHeader = readExtensionHeader(input.headers);
  if (input.supported === undefined) {
    return negotiateExtensions({ requestedHeader });
  }
  return negotiateExtensions({
    requestedHeader,
    supported: input.supported,
  });
}

export function checkMessageExtensions(
  messageExtensions: readonly string[],
  activated: readonly string[],
): MessageExtensionCheck {
  const seen = new Set<string>();
  const inactive: string[] = [];
  for (const uri of messageExtensions) {
    if (seen.has(uri)) {
      continue;
    }
    seen.add(uri);
    if (!activated.includes(uri)) {
      inactive.push(uri);
    }
  }
  if (inactive.length === 0) {
    return { ok: true };
  }
  return { ok: false, inactive };
}

function requirementsActive(active: ReadonlySet<string>): boolean {
  for (const uri of negotiationRequiredUris) {
    if (!active.has(uri)) {
      return false;
    }
  }
  return true;
}

function unique(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}
