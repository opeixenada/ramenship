import { smoothstep01 } from './smoothstep'

/**
 * Seconds for one full cycle through all shapes (sphere → … → back to sphere).
 */
export const MORPH_PERIOD = 96

/** Per transition between adjacent shapes in the cycle (fraction of one period). */
const TRANSITION = 0.014

/**
 * Piecewise schedule: hold shape i, ease to i+1, …, last eases back to 0.
 * `out` must have length ≥ n; only first n entries are written.
 */
export function morphWeightsNShapesInto(
  out: number[],
  n: number,
  t: number,
  phase: number,
  period: number,
): void {
  if (n < 1) {
    return
  }
  out.fill(0, 0, n)

  let u = ((t + phase) / period) % 1
  if (u < 0) u += 1

  const hold = (1 - n * TRANSITION) / n

  for (let i = 0; i < n; i++) {
    const startHold = i * (hold + TRANSITION)
    const endHold = startHold + hold
    const endTrans = endHold + TRANSITION

    if (u >= startHold && u < endHold) {
      out[i] = 1
      return
    }
    if (u >= endHold && u < endTrans) {
      const k = smoothstep01((u - endHold) / TRANSITION)
      const next = (i + 1) % n
      out[i] = 1 - k
      out[next] = k
      return
    }
  }
}
