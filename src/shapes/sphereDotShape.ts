import { Vector3 } from 'three'

import type { DotShape, PointShapeData } from './types'

const up = new Vector3(0, 1, 0)
const alt = new Vector3(1, 0, 0)

function sphereTangents(
  normal: Vector3,
  outT1: Vector3,
  outT2: Vector3,
): void {
  outT1.crossVectors(normal, up)
  if (outT1.lengthSq() < 1e-6) {
    outT1.crossVectors(normal, alt)
  }
  outT1.normalize()
  outT2.crossVectors(normal, outT1).normalize()
}

export type SphereTangentFrame = {
  normals: Vector3[]
  t1s: Vector3[]
  t2s: Vector3[]
}

/** Hollow spherical shell used as the rest pose and morph weight w0. */
export class SphereDotShape implements DotShape {
  readonly shellRadius: number

  constructor(shellRadius = 1.28) {
    this.shellRadius = shellRadius
  }

  build(count: number): PointShapeData {
    const targets: Vector3[] = []
    const shell01 = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const u = Math.random()
      const v = Math.random()
      const theta = 2 * Math.PI * u
      const phi = Math.acos(2 * v - 1)
      const r = this.shellRadius * (0.88 + Math.random() * 0.12)
      const x = r * Math.sin(phi) * Math.cos(theta)
      const y = r * Math.sin(phi) * Math.sin(theta)
      const z = r * Math.cos(phi)
      targets.push(new Vector3(x, y, z))
      shell01[i] = 1
    }
    return { targets, shell01 }
  }

  /** Tangent bases for radial / tangential motion from sphere normals. */
  tangentFrameFor(targets: readonly Vector3[]): SphereTangentFrame {
    const normals: Vector3[] = []
    const t1s: Vector3[] = []
    const t2s: Vector3[] = []
    const t1 = new Vector3()
    const t2 = new Vector3()
    for (const p of targets) {
      const n = p.clone().normalize()
      sphereTangents(n, t1, t2)
      normals.push(n)
      t1s.push(t1.clone())
      t2s.push(t2.clone())
    }
    return { normals, t1s, t2s }
  }
}
