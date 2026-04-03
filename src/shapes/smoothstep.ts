export function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t)
}
