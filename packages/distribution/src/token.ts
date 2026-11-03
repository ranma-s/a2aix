export function isPlainToken(value: string): boolean {
  return value.length > 0 && value === value.trim();
}
