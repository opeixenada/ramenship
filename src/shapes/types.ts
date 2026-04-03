import type { Vector3 } from 'three'

/** Per-particle target positions and shell hint for the point shader. */
export type PointShapeData = {
  targets: Vector3[]
  shell01: Float32Array
}

/**
 * A hollow-shell point distribution: builds fixed morph targets + shell attribute
 * for `count` particles (session-random pose lives in the implementation).
 */
export interface DotShape {
  build(count: number): PointShapeData
}
