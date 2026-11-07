interface IxEd25519PublicKey {
  readonly type: string;
}

interface IxSha256Subtle {
  importKey(format: "raw", keyData: Uint8Array, algorithm: "Ed25519", extractable: false, usages: readonly ["verify"]): Promise<IxEd25519PublicKey>;
  verify(algorithm: "Ed25519", key: IxEd25519PublicKey, signature: Uint8Array, data: Uint8Array): Promise<boolean>;
}

interface IxTextDecoder {
  decode(input: Uint8Array): string;
}

declare const TextDecoder: {
  new (label: "utf-8", options: { readonly fatal: true }): IxTextDecoder;
};
