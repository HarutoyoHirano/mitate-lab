// node:crypto の代わり（試用版）
export function randomUUID(): string {
  return crypto.randomUUID();
}
export function randomInt(min: number, max: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return min + (a[0]! % (max - min));
}
