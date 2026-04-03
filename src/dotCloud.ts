import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'

import {
  CubeDotShape,
  DodecahedronDotShape,
  MORPH_PERIOD,
  morphWeightsThreeShapes,
  SphereDotShape,
} from './shapes'

const COUNT = 2800
const RADIAL_TIERS = 8
const RADIAL_FREQ = 1.02

const vertexShader = /* glsl */ `
  attribute float aScale;
  attribute float aTint;

  varying float vTint;
  varying float vViewZ;

  uniform float uPixelRatio;
  uniform float uSizeRef;

  void main() {
    vTint = aTint;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewZ = -mvPosition.z;

    float zFloor = 0.31;
    float px = aScale * uSizeRef / max(vViewZ, zFloor);
    px *= uPixelRatio;
    gl_PointSize = clamp(px, 0.8, 7.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  varying float vTint;
  varying float vViewZ;

  uniform float uSpectrum;
  uniform float uPointerGlow;
  uniform float uCursorInside;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float r = length(c);
    if (r > 0.5) discard;

    float zNear = 1.65;
    float zFar = 8.5;
    float farFloor = 0.18;
    float farDark = mix(1.0, farFloor, smoothstep(zNear, zFar, vViewZ));
    float midBoost = mix(1.06, 1.0, smoothstep(2.0, 5.0, vViewZ));
    float closePop = 1.0 + 0.09 * (1.0 - smoothstep(1.4, 4.2, vViewZ));

    vec3 cRed = vec3(1.0, 0.22, 0.45);
    vec3 cMagenta = vec3(0.98, 0.32, 0.82);
    vec3 cPurple = vec3(0.74, 0.42, 1.0);

    float along = clamp(vTint * 0.4 + uSpectrum * 0.6, 0.0, 1.0);
    vec3 baseCol = mix(cRed, cMagenta, smoothstep(0.0, 0.52, along));
    baseCol = mix(baseCol, cPurple, smoothstep(0.38, 1.0, along));

    float bright = 1.0 + uCursorInside * 0.58 + uPointerGlow * 0.28;
    vec3 col = baseCol * farDark * midBoost * closePop * bright;
    gl_FragColor = vec4(col, 1.0);
  }
`

export function createDotCloud(): {
  group: Group
  material: ShaderMaterial
  update: (t: number) => void
} {
  const group = new Group()

  const radialFreqSession = RADIAL_FREQ * (0.86 + Math.random() * 0.32)
  const radialTimePhase = Math.random() * Math.PI * 2
  const wGlobal = 0.4 + Math.random() * 0.22
  const wHarm = 0.08 + Math.random() * 0.05
  const wTier = 1 - wGlobal - wHarm

  const tierSeeds = Array.from(
    { length: RADIAL_TIERS },
    () => Math.random() * Math.PI * 2,
  )

  const cubeRot = new Euler(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    'XYZ',
  )
  const dodecaRot = new Euler(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    'XYZ',
  )
  /** One scale for cube + dodeca so they share the same envelope size. */
  const morphShapeScale = 1.68 + Math.random() * 0.3
  const morphPhase = Math.random() * MORPH_PERIOD

  const cubeHalf = 0.5
  /** Cube corners & dodeca vertices share this distance from center (after scale). */
  const polyCircumR = cubeHalf * Math.sqrt(3) * morphShapeScale
  /**
   * Sphere shell radii are shellRadius × [0.88, 1.0]. Keep outer edge ~inside poly
   * circumradius so the ball doesn’t read larger than cube/dodeca.
   */
  const sphereShellR = polyCircumR * 0.88
  const dodecaLocalRadius = cubeHalf * Math.sqrt(3)

  const sphereShape = new SphereDotShape(sphereShellR)
  const cubeShape = new CubeDotShape(cubeRot, morphShapeScale, cubeHalf)
  const dodecaShape = new DodecahedronDotShape(
    dodecaRot,
    morphShapeScale,
    dodecaLocalRadius,
  )

  const sphereData = sphereShape.build(COUNT)
  const cubeData = cubeShape.build(COUNT)
  const dodecaData = dodecaShape.build(COUNT)

  const bases = sphereData.targets
  const { normals, t1s, t2s } = sphereShape.tangentFrameFor(bases)
  const cubeTargets = cubeData.targets
  const dodecaTargets = dodecaData.targets

  const positions = new Float32Array(COUNT * 3)
  const tints = new Float32Array(COUNT)
  const scales = new Float32Array(COUNT)

  const tangPhase: number[] = []
  const radialPhases: number[] = []
  const freq: number[] = []

  for (let i = 0; i < COUNT; i++) {
    const base = bases[i]!
    tangPhase.push(Math.random() * Math.PI * 2)
    const tier = Math.floor(Math.random() * RADIAL_TIERS)
    radialPhases.push(
      tierSeeds[tier] +
        (Math.random() - 0.5) * Math.PI * 1.15 +
        (Math.random() - 0.5) * 0.65,
    )
    freq.push(0.72 + Math.random() * 0.62)
    scales[i] = 0.12 + Math.random() * 0.2
    tints[i] = Math.random()

    positions[i * 3] = base.x
    positions[i * 3 + 1] = base.y
    positions[i * 3 + 2] = base.z
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aTint', new BufferAttribute(tints, 1))
  geometry.setAttribute('aScale', new BufferAttribute(scales, 1))

  const material = new ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uSizeRef: { value: 40 },
      uSpectrum: { value: 0 },
      uPointerGlow: { value: 0 },
      uCursorInside: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  })

  const points = new Points(geometry, material)
  group.add(points)

  const pos = new Vector3()
  const radial = new Vector3()
  const tang = new Vector3()
  const posArr = positions

  function update(t: number) {
    const ampR = 0.055
    const ampT = 0.016

    const [w0, w1, w2] = morphWeightsThreeShapes(t, morphPhase, MORPH_PERIOD)
    const morphAmt = Math.min(1, w1 + w2)

    for (let i = 0; i < COUNT; i++) {
      const base = bases[i]!
      const cubeEnd = cubeTargets[i]!
      const dodecaEnd = dodecaTargets[i]!
      const n = normals[i]!
      const t1 = t1s[i]!
      const t2 = t2s[i]!
      const tph = tangPhase[i]!
      const rp = radialPhases[i]!
      const f = freq[i]!

      pos.copy(base).multiplyScalar(w0)
      pos.addScaledVector(cubeEnd, w1)
      pos.addScaledVector(dodecaEnd, w2)

      const ft = t * radialFreqSession + radialTimePhase
      const globalR = Math.sin(ft)
      const tierR = Math.sin(ft + rp)
      const radialWave =
        globalR * wGlobal +
        tierR * wTier +
        Math.sin(ft * 2 + rp * 1.02) * wHarm

      const buzzScale = 1 - morphAmt * 0.35
      radial.copy(n).multiplyScalar(ampR * radialWave * buzzScale)

      const tf = f * 1.28
      const tw1 =
        Math.sin(t * tf + tph * 0.7) +
        0.32 * Math.sin(t * tf * 2.05 + tph * 1.2)
      const tw2 =
        Math.cos(t * tf * 0.97 + tph) +
        0.28 * Math.cos(t * tf * 1.88 + tph * 0.55)
      tang
        .copy(t1)
        .multiplyScalar(tw1 * ampT * buzzScale)
        .addScaledVector(t2, tw2 * ampT * buzzScale)

      pos.add(radial).add(tang)
      const i3 = i * 3
      posArr[i3] = pos.x
      posArr[i3 + 1] = pos.y
      posArr[i3 + 2] = pos.z
    }
    geometry.attributes.position.needsUpdate = true
  }

  return { group, material, update }
}
