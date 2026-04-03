import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  ShaderMaterial,
} from 'three'

type ZapSlot =
  | { kind: 'idle' }
  | {
      kind: 'active'
      i0: number
      i1: number
      started: number
      duration: number
    }

const POOL = 34
/** Avoid spawning too many in one frame after a long pause. */
const MAX_SPAWNS_PER_FRAME = 6
const MIN_GAP = 0.2
const MAX_GAP = 3.65

const zapVertexShader = /* glsl */ `
  attribute float aAlong;
  attribute float aTint;
  varying float vAlong;
  varying float vTint;
  varying float vViewZ;

  void main() {
    vAlong = aAlong;
    vTint = aTint;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewZ = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const zapFragmentShader = /* glsl */ `
  varying float vAlong;
  varying float vTint;
  varying float vViewZ;

  uniform float uZapT;
  uniform float uEnvelope;
  uniform float uSpectrum;
  uniform float uPointerGlow;
  uniform float uCursorInside;

  void main() {
    float travel = 0.5 + 0.5 * sin(uZapT * 4.5);
    float band = exp(-pow((vAlong - travel) * 19.5, 2.0));
    float taper =
      min(smoothstep(0.0, 0.072, vAlong), smoothstep(1.0, 0.928, vAlong));
    float a = band * taper * uEnvelope * 0.9;
    if (a < 0.003) discard;

    float zNear = 1.65;
    float zFar = 8.5;
    float farFloor = 0.18;
    float farDark = mix(1.0, farFloor, smoothstep(zNear, zFar, vViewZ));
    float midBoost = mix(1.06, 1.0, smoothstep(2.0, 5.0, vViewZ));
    float closePop = 1.0 + 0.09 * (1.0 - smoothstep(1.4, 4.2, vViewZ));

    vec3 cRed = vec3(1.0, 0.22, 0.45);
    vec3 cMagenta = vec3(0.98, 0.32, 0.82);
    vec3 cPurple = vec3(0.74, 0.42, 1.0);

    float alongTint = clamp(vTint * 0.4 + uSpectrum * 0.6, 0.0, 1.0);
    vec3 baseCol = mix(cRed, cMagenta, smoothstep(0.0, 0.52, alongTint));
    baseCol = mix(baseCol, cPurple, smoothstep(0.38, 1.0, alongTint));

    float bright = 1.0 + uCursorInside * 0.58 + uPointerGlow * 0.28;
    vec3 col = baseCol * farDark * midBoost * closePop * bright * 1.08;
    // Premultiplied RGB: non-premult AdditiveBlending does srcRGB*srcAlpha+dst, which
    // would square our mask if we put alpha in both (invisible when a is small).
    gl_FragColor = vec4(col * a, 1.0);
  }
`

function pickPair(count: number, arr: Float32Array): [number, number] {
  for (let attempt = 0; attempt < 55; attempt++) {
    const i = Math.floor(Math.random() * count)
    const j = Math.floor(Math.random() * count)
    if (i === j) continue
    const i3 = i * 3
    const j3 = j * 3
    const dx = arr[i3]! - arr[j3]!
    const dy = arr[i3 + 1]! - arr[j3 + 1]!
    const dz = arr[i3 + 2]! - arr[j3 + 2]!
    const d = Math.hypot(dx, dy, dz)
    if (d >= MIN_GAP && d <= MAX_GAP) {
      return [i, j]
    }
  }
  const j = count > 1 ? 1 : 0
  return [0, j]
}

function envelope(age: number, dur: number): number {
  const fadeIn = 0.16
  const fadeOut = 0.28
  if (age < fadeIn) {
    return age / fadeIn
  }
  if (age > dur - fadeOut) {
    return Math.max(0, (dur - age) / fadeOut)
  }
  return 1
}

function syncDotUniforms(
  dst: ShaderMaterial['uniforms'],
  src: ShaderMaterial['uniforms'],
): void {
  dst.uSpectrum!.value = src.uSpectrum!.value
  dst.uPointerGlow!.value = src.uPointerGlow!.value
  dst.uCursorInside!.value = src.uCursorInside!.value
}

/**
 * Short “electric” segments between random point pairs; gradient pulses along
 * the segment (tint + spectrum match the points shader) then the line hides.
 */
export function createZapSystem(
  parent: Group,
  pointCount: number,
  getPositions: () => Float32Array,
  getTints: () => Float32Array,
  dotMaterial: ShaderMaterial,
): { update: (t: number, dt: number) => void } {
  const slots: ZapSlot[] = Array.from({ length: POOL }, () => ({ kind: 'idle' }))
  const lines: Line[] = []
  const geoms: BufferGeometry[] = []
  const mats: ShaderMaterial[] = []
  const posBufs: Float32Array[] = []

  for (let k = 0; k < POOL; k++) {
    const pos = new Float32Array(6)
    const along = new Float32Array([0, 1])
    const tintAlong = new Float32Array(2)
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(pos, 3))
    geom.setAttribute('aAlong', new BufferAttribute(along, 1))
    geom.setAttribute('aTint', new BufferAttribute(tintAlong, 1))
    const mat = new ShaderMaterial({
      uniforms: {
        uZapT: { value: 0 },
        uEnvelope: { value: 0 },
        uSpectrum: { value: 0 },
        uPointerGlow: { value: 0 },
        uCursorInside: { value: 0 },
      },
      vertexShader: zapVertexShader,
      fragmentShader: zapFragmentShader,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
    })
    const line = new Line(geom, mat)
    line.visible = false
    line.frustumCulled = false
    parent.add(line)
    lines.push(line)
    geoms.push(geom)
    mats.push(mat)
    posBufs.push(pos)
  }

  let spawnCooldown = 0.04 + Math.random() * 0.12

  function trySpawn(t: number): boolean {
    const idx = slots.findIndex((s) => s.kind === 'idle')
    if (idx < 0) return false
    const arr = getPositions()
    const tints = getTints()
    const [i0, i1] = pickPair(pointCount, arr)
    const duration = 0.88 + Math.random() * 0.42
    slots[idx] = { kind: 'active', i0, i1, started: t, duration }
    const tintAttr = geoms[idx]!.getAttribute('aTint') as BufferAttribute
    const ta = tintAttr.array as Float32Array
    ta[0] = tints[i0]!
    ta[1] = tints[i1]!
    tintAttr.needsUpdate = true
    lines[idx]!.visible = true
    return true
  }

  function update(t: number, dt: number): void {
    spawnCooldown -= dt
    let spawns = 0
    while (spawnCooldown <= 0 && spawns < MAX_SPAWNS_PER_FRAME) {
      if (!trySpawn(t)) {
        spawnCooldown += 0.04
        break
      }
      spawnCooldown += 0.045 + Math.random() * 0.14
      spawns++
    }

    const arr = getPositions()
    const dotU = dotMaterial.uniforms

    for (let k = 0; k < POOL; k++) {
      const slot = slots[k]!
      const line = lines[k]!
      const geom = geoms[k]!
      const mat = mats[k]!
      const pos = posBufs[k]!

      if (slot.kind === 'idle') {
        line.visible = false
        continue
      }

      const age = t - slot.started
      if (age >= slot.duration) {
        slots[k] = { kind: 'idle' }
        line.visible = false
        continue
      }

      const i0 = slot.i0 * 3
      const i1 = slot.i1 * 3
      pos[0] = arr[i0]!
      pos[1] = arr[i0 + 1]!
      pos[2] = arr[i0 + 2]!
      pos[3] = arr[i1]!
      pos[4] = arr[i1 + 1]!
      pos[5] = arr[i1 + 2]!

      geom.attributes.position!.needsUpdate = true
      syncDotUniforms(mat.uniforms, dotU)
      mat.uniforms.uZapT!.value = age
      mat.uniforms.uEnvelope!.value = envelope(age, slot.duration)
    }
  }

  return { update }
}
