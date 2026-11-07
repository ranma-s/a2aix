const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const chunk = (a << 16) | (b << 8) | c;
    const left = bytes.length - index;
    out += base64UrlAlphabet[(chunk >> 18) & 63] ?? "";
    out += base64UrlAlphabet[(chunk >> 12) & 63] ?? "";
    if (left > 1) {
      out += base64UrlAlphabet[(chunk >> 6) & 63] ?? "";
    }
    if (left > 2) {
      out += base64UrlAlphabet[chunk & 63] ?? "";
    }
  }
  return out;
}

export function base64UrlDecode(text: string): Uint8Array | undefined {
  if (text.length % 4 === 1) {
    return undefined;
  }
  const values: number[] = [];
  for (const character of text) {
    const value = base64UrlAlphabet.indexOf(character);
    if (value < 0) {
      return undefined;
    }
    values.push(value);
  }
  const bytes: number[] = [];
  for (let index = 0; index < values.length; index += 4) {
    const group = values.slice(index, index + 4);
    const chunk = ((group[0] ?? 0) << 18) | ((group[1] ?? 0) << 12) | ((group[2] ?? 0) << 6) | (group[3] ?? 0);
    bytes.push((chunk >> 16) & 255);
    if (group.length > 2) {
      bytes.push((chunk >> 8) & 255);
    }
    if (group.length > 3) {
      bytes.push(chunk & 255);
    }
  }
  const decoded = Uint8Array.from(bytes);
  return base64UrlEncode(decoded) === text ? decoded : undefined;
}

export function base58btcEncode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) {
    value = value * 256n + BigInt(byte);
  }
  let out = "";
  while (value > 0n) {
    out = (base58Alphabet[Number(value % 58n)] ?? "") + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }
    out = `1${out}`;
  }
  return out;
}

export function base58btcDecode(text: string): Uint8Array | undefined {
  let value = 0n;
  for (const character of text) {
    const digit = base58Alphabet.indexOf(character);
    if (digit < 0) {
      return undefined;
    }
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value % 256n));
    value /= 256n;
  }
  for (const character of text) {
    if (character !== "1") {
      break;
    }
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}
