import { Euler, Vector3 } from 'three'

import type { DotShape, PointShapeData } from './types'

function sampleCubeShell(
  half: number,
  shellThick: number,
  tangFuzz: number,
  p: Vector3,
): void {
  const face = Math.floor(Math.random() * 6)
  let u: number
  let v: number
  const m = Math.random()

  if (m < 0.52) {
    const edge = Math.floor(Math.random() * 4)
    const span = (Math.random() * 2 - 1) * half
    if (edge === 0) {
      u = -half
      v = span
    } else if (edge === 1) {
      u = half
      v = span
    } else if (edge === 2) {
      u = span
      v = -half
    } else {
      u = span
      v = half
    }
  } else if (m < 0.86) {
    const rimPow = 0.62
    if (Math.random() < 0.5) {
      u = (Math.random() * 2 - 1) * half
      const sign = Math.random() < 0.5 ? -1 : 1
      v = sign * half * Math.pow(Math.random(), rimPow)
    } else {
      v = (Math.random() * 2 - 1) * half
      const sign = Math.random() < 0.5 ? -1 : 1
      u = sign * half * Math.pow(Math.random(), rimPow)
    }
  } else {
    const su = Math.random() < 0.5 ? -1 : 1
    const sv = Math.random() < 0.5 ? -1 : 1
    u = Math.pow(Math.random(), 0.52) * su * half
    v = Math.pow(Math.random(), 0.52) * sv * half
  }

  u += (Math.random() - 0.5) * tangFuzz
  v += (Math.random() - 0.5) * tangFuzz
  u = Math.max(-half, Math.min(half, u))
  v = Math.max(-half, Math.min(half, v))
  const s = Math.random() < 0.5 ? -1 : 1
  const depth = half - Math.random() * shellThick
  switch (face) {
    case 0:
      p.set(s * depth, u, v)
      break
    case 1:
      p.set(u, s * depth, v)
      break
    case 2:
      p.set(u, v, s * depth)
      break
    case 3:
      p.set(-s * depth, u, v)
      break
    case 4:
      p.set(u, -s * depth, v)
      break
    default:
      p.set(u, v, -s * depth)
      break
  }
}

/** Hollow axis-aligned cube shell, transformed by session rotation + scale. */
export class CubeDotShape implements DotShape {
  readonly rotation: Euler
  readonly scale: number
  readonly half: number

  constructor(rotation: Euler, scale: number, half = 0.5) {
    this.rotation = rotation
    this.scale = scale
    this.half = half
  }

  build(count: number): PointShapeData {
    const shellThick = this.half * 0.13
    const tangFuzz = 0.022
    const targets: Vector3[] = []
    const shell01 = new Float32Array(count)
    const p = new Vector3()

    for (let i = 0; i < count; i++) {
      sampleCubeShell(this.half, shellThick, tangFuzz, p)
      const ax = Math.abs(p.x)
      const ay = Math.abs(p.y)
      const az = Math.abs(p.z)
      shell01[i] = Math.min(1, Math.max(ax, ay, az) / this.half)
      p.applyEuler(this.rotation).multiplyScalar(this.scale)
      targets.push(p.clone())
    }

    return { targets, shell01 }
  }
}
