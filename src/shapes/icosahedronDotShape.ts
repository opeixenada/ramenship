import { Euler, IcosahedronGeometry, Vector3 } from 'three'
import type { BufferAttribute, InterleavedBufferAttribute } from 'three'

import type { DotShape, PointShapeData } from './types'

function sampleTriangleEdge(a: Vector3, b: Vector3, c: Vector3, p: Vector3): void {
  const e = Math.floor(Math.random() * 3)
  const t = Math.random()
  if (e === 0) {
    p.lerpVectors(a, b, t)
  } else if (e === 1) {
    p.lerpVectors(b, c, t)
  } else {
    p.lerpVectors(c, a, t)
  }
}

type Tri = { va: Vector3; vb: Vector3; vc: Vector3 }

function vKey(v: Vector3, prec = 5): string {
  return `${v.x.toFixed(prec)},${v.y.toFixed(prec)},${v.z.toFixed(prec)}`
}

function extractUniqueVertices(
  pos: BufferAttribute | InterleavedBufferAttribute,
): Vector3[] {
  const map = new Map<string, Vector3>()
  const tmp = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i)
    const k = vKey(tmp)
    if (!map.has(k)) {
      map.set(k, tmp.clone())
    }
  }
  return [...map.values()]
}

/** Undirected edges of the regular icosahedron (equal-length, minimum vertex separation). */
function extractPolyhedronEdges(verts: Vector3[]): [Vector3, Vector3][] {
  if (verts.length < 2) {
    return []
  }
  const d = new Vector3()
  let dMin = Infinity
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      d.subVectors(verts[i]!, verts[j]!)
      const len = d.length()
      if (len > 1e-12 && len < dMin) {
        dMin = len
      }
    }
  }
  if (!Number.isFinite(dMin) || dMin <= 0) {
    return []
  }
  const tol = Math.max(dMin * 2e-5, 1e-7)
  const edges: [Vector3, Vector3][] = []
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      d.subVectors(verts[i]!, verts[j]!)
      const len = d.length()
      if (Math.abs(len - dMin) <= tol) {
        edges.push([verts[i]!.clone(), verts[j]!.clone()])
      }
    }
  }
  return edges
}

type IcosaCaches = {
  edges: [Vector3, Vector3][]
  tris: Tri[]
  cumArea: number[]
  totalArea: number
}

function buildIcosaCaches(radius: number): IcosaCaches {
  const geo = new IcosahedronGeometry(radius, 0)
  const pos = geo.attributes.position
  const verts = extractUniqueVertices(pos)
  const edges = extractPolyhedronEdges(verts)

  const ab = new Vector3()
  const ac = new Vector3()
  const tris: Tri[] = []
  const areas: number[] = []
  let totalArea = 0

  for (let i = 0; i < pos.count; i += 3) {
    const va = new Vector3().fromBufferAttribute(pos, i)
    const vb = new Vector3().fromBufferAttribute(pos, i + 1)
    const vc = new Vector3().fromBufferAttribute(pos, i + 2)
    ab.subVectors(vb, va)
    ac.subVectors(vc, va)
    const area = ab.cross(ac).length() * 0.5
    tris.push({ va, vb, vc })
    areas.push(area)
    totalArea += area
  }

  geo.dispose()

  const cumArea: number[] = []
  let acc = 0
  for (const a of areas) {
    acc += a
    cumArea.push(acc)
  }

  return { edges, tris, cumArea, totalArea }
}

function pickTriangle(
  tris: Tri[],
  cumArea: number[],
  totalArea: number,
): Tri {
  const r = Math.random() * totalArea
  for (let j = 0; j < cumArea.length; j++) {
    if (r < cumArea[j]!) {
      return tris[j]!
    }
  }
  return tris[tris.length - 1]!
}

function triangleOutwardNormal(
  va: Vector3,
  vb: Vector3,
  vc: Vector3,
  ab: Vector3,
  ac: Vector3,
  n: Vector3,
): void {
  ab.subVectors(vb, va)
  ac.subVectors(vc, va)
  n.crossVectors(ab, ac).normalize()
}

/**
 * Regular icosahedron: dots heavily on true polyhedron edges (30), lightly on
 * triangulation edges, rarely in triangle interiors.
 */
export class IcosahedronDotShape implements DotShape {
  readonly rotation: Euler
  readonly scale: number
  readonly radius: number
  readonly edges: [Vector3, Vector3][]
  readonly tris: Tri[]
  readonly cumArea: number[]
  readonly totalArea: number
  readonly thick: number

  /**
   * @param radius Circumradius in local space (vertex distance from origin).
   *   Match cube: `half * Math.sqrt(3)` for the same bounding sphere as a cube of half-edge `half`.
   */
  constructor(rotation: Euler, scale: number, radius = 0.5 * Math.sqrt(3)) {
    this.rotation = rotation
    this.scale = scale
    this.radius = radius
    this.thick = radius * 0.12
    const { edges, tris, cumArea, totalArea } = buildIcosaCaches(radius)
    this.edges = edges
    this.tris = tris
    this.cumArea = cumArea
    this.totalArea = totalArea
  }

  build(count: number): PointShapeData {
    const targets: Vector3[] = []
    const shell01 = new Float32Array(count)
    const p = new Vector3()
    const ab = new Vector3()
    const ac = new Vector3()
    const n = new Vector3()

    const { edges, tris, cumArea, totalArea } = this

    for (let i = 0; i < count; i++) {
      const roll = Math.random()
      let sh: number

      if (edges.length > 0 && roll < 0.22) {
        const e = edges[Math.floor(Math.random() * edges.length)]!
        const t = Math.random()
        p.lerpVectors(e[0], e[1], t)
        sh = 0.92
        n.copy(p).normalize()
      } else if (roll < 0.52) {
        const { va, vb, vc } = pickTriangle(tris, cumArea, totalArea)
        sampleTriangleEdge(va, vb, vc, p)
        sh = 0.78
        triangleOutwardNormal(va, vb, vc, ab, ac, n)
      } else {
        const { va, vb, vc } = pickTriangle(tris, cumArea, totalArea)
        let r1 = Math.random()
        let r2 = Math.random()
        if (r1 + r2 > 1) {
          r1 = 1 - r1
          r2 = 1 - r2
        }
        const w0 = 1 - r1 - r2
        const w1 = r1
        const w2 = r2
        p.copy(va)
          .multiplyScalar(w0)
          .addScaledVector(vb, w1)
          .addScaledVector(vc, w2)
        sh = Math.min(1, 0.2 + 2.4 * Math.min(w0, w1, w2))
        triangleOutwardNormal(va, vb, vc, ab, ac, n)
      }

      shell01[i] = sh
      p.addScaledVector(n, -Math.random() * this.thick)
      p.applyEuler(this.rotation).multiplyScalar(this.scale)
      targets.push(p.clone())
    }

    return { targets, shell01 }
  }
}
