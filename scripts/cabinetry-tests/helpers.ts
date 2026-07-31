export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
