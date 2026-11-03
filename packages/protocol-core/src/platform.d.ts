interface IxSha256Subtle {
  digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
}

interface IxWebCrypto {
  readonly subtle: IxSha256Subtle;
}

declare const crypto: IxWebCrypto;

interface IxTextEncoder {
  encode(input: string): Uint8Array;
}

declare const TextEncoder: {
  new (): IxTextEncoder;
};
