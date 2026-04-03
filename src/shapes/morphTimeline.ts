import { smoothstep01 } from './smoothstep'

/**
 * Seconds for one full sphere → cube → dodecahedron → sphere cycle.
 * Long enough for several visual breath cycles (~10.5s each) per shape hold.
 */
export const MORPH_PERIOD = 96

/** Same transition length (each of 3); small = snappy morphs. */
const TRANSITION = 0.016

/** Same hold for sphere, cube, and dodecahedron: (1 − 3·transition) / 3. */
const HOLD = (1 - 3 * TRANSITION) / 3

export type MorphWeights3 = readonly [number, number, number]

/** [sphere, cube, dodecahedron] weights; always sum to 1. */
export function morphWeightsThreeShapes(
  t: number,
  phase: number,
  period: number,
): MorphWeights3 {
  let u = ((t + phase) / period) % 1
  if (u < 0) u += 1
  const a1 = HOLD
  const a2 = a1 + TRANSITION
  const a3 = a2 + HOLD
  const a4 = a3 + TRANSITION
  const a5 = a4 + HOLD
  if (u < a1) {
    return [1, 0, 0]
  }
  if (u < a2) {
    const k = smoothstep01((u - a1) / TRANSITION)
    return [1 - k, k, 0]
  }
  if (u < a3) {
    return [0, 1, 0]
  }
  if (u < a4) {
    const k = smoothstep01((u - a3) / TRANSITION)
    return [0, 1 - k, k]
  }
  if (u < a5) {
    return [0, 0, 1]
  }
  const k = smoothstep01((u - a5) / TRANSITION)
  return [k, 0, 1 - k]
}
