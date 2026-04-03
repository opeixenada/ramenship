import { Euler, Vector3 } from 'three'

import type { DotShape, PointShapeData } from './types'

/**
 * Torus in XZ plane; major R + minor r ≈ reference circumradius for consistent scale.
 */
export class TorusDotShape implements DotShape {
  readonly rotation: Euler
  readonly scale: number
  readonly R: number
  readonly r: number
  readonly thick: number

  constructor(rotation: Euler, scale: number, referenceRadius: number) {
    this.rotation = rotation
    this.scale = scale
    this.R = referenceRadius * 0.58
    this.r = referenceRadius * 0.38
    this.thick = referenceRadius * 0.1
  }

  build(count: number): PointShapeData {
    const targets: Vector3[] = []
    const shell01 = new Float32Array(count)
    const p = new Vector3()
    const du = new Vector3()
    const dv = new Vector3()
    const n = new Vector3()

    const { R, r } = this

    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2
      const v = Math.random() * Math.PI * 2
      const cv = Math.cos(v)
      const sv = Math.sin(v)
      const cu = Math.cos(u)
      const su = Math.sin(u)

      p.set((R + r * cv) * cu, r * sv, (R + r * cv) * su)

      du.set(-(R + r * cv) * su, 0, (R + r * cv) * cu)
      dv.set(-r * sv * cu, r * cv, -r * sv * su)
      n.crossVectors(du, dv).normalize()

      const roll = Math.random()
      let sh: number
      if (roll < 0.55) {
        sh = 0.9
      } else if (roll < 0.88) {
        sh = 0.72
      } else {
        sh = 0.55
      }
      shell01[i] = sh
      p.addScaledVector(n, -Math.random() * this.thick)
      p.applyEuler(this.rotation).multiplyScalar(this.scale)
      targets.push(p.clone())
    }

    return { targets, shell01 }
  }
}
