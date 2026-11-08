interface IxEd25519PublicKey {
  readonly type: string;
}

interface IxEd25519KeyPair {
  readonly publicKey: IxEd25519PublicKey;
  readonly privateKey: IxEd25519PublicKey;
}

interface IxSha256Subtle {
  importKey(format: "raw", keyData: Uint8Array, algorithm: "Ed25519", extractable: false, usages: readonly ["verify"]): Promise<IxEd25519PublicKey>;
  verify(algorithm: "Ed25519", key: IxEd25519PublicKey, signature: Uint8Array, data: Uint8Array): Promise<boolean>;
  generateKey(algorithm: "Ed25519", extractable: false, usages: readonly ["sign", "verify"]): Promise<IxEd25519KeyPair>;
  exportKey(format: "raw", key: IxEd25519PublicKey): Promise<ArrayBuffer>;
  sign(algorithm: "Ed25519", key: IxEd25519PublicKey, data: Uint8Array): Promise<ArrayBuffer>;
}

interface IxTextDecoder {
  decode(input: Uint8Array): string;
}

declare const TextDecoder: {
  new (label: "utf-8", options: { readonly fatal: true; readonly ignoreBOM: true }): IxTextDecoder;
};
