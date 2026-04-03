import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'

const POOL = 480
const PER_BURST_MIN = 22
const PER_BURST_MAX = 36
const COOLDOWN_SEC = 0.28

type Slot = {
  active: boolean
  start: Vector3
  targetIdx: number
  t0: number
  duration: number
  fuzzSeed: number
}

const vertexShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aScale;
  attribute float aTint;
  varying float vAlpha;
  varying float vViewZ;
  varying float vTint;
  uniform float uPixelRatio;
  uniform float uSizeRef;
  uniform float uCastSizeMul;

  void main() {
    vAlpha = aAlpha;
    if (aAlpha < 1e-4) {
      gl_PointSize = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewZ = -mvPosition.z;
    vTint = aTint;
    float zFloor = 0.31;
    float zSize = min(vViewZ, 2.35);
    float px = aScale * uCastSizeMul * uSizeRef / max(zSize, zFloor);
    px *= uPixelRatio;
    gl_PointSize = clamp(px, 1.1, 12.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vViewZ;
  varying float vTint;
  uniform float uSpectrum;
  uniform float uPointerGlow;
  uniform float uCursorInside;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float r = length(c) * 2.0;
    float soft = exp(-r * r * 4.2);
    float a = vAlpha * soft;
    if (a < 0.006) discard;

    float zF = min(vViewZ, 2.1);
    float zNear = 1.65;
    float zFar = 8.5;
    float farFloor = 0.18;
    float farDark = mix(1.0, farFloor, smoothstep(zNear, zFar, zF));
    float midBoost = mix(1.06, 1.0, smoothstep(2.0, 5.0, zF));
    float closePop = 1.0 + 0.09 * (1.0 - smoothstep(1.4, 4.2, zF));

    vec3 cRed = vec3(1.0, 0.22, 0.45);
    vec3 cMagenta = vec3(0.98, 0.32, 0.82);
    vec3 cPurple = vec3(0.74, 0.42, 1.0);

    float along = clamp(vTint * 0.4 + uSpectrum * 0.6, 0.0, 1.0);
    vec3 baseCol = mix(cRed, cMagenta, smoothstep(0.0, 0.52, along));
    baseCol = mix(baseCol, cPurple, smoothstep(0.38, 1.0, along));

    float bright = 1.0 + uCursorInside * 0.58 + uPointerGlow * 0.28;
    vec3 col = baseCol * farDark * midBoost * closePop * bright;
    gl_FragColor = vec4(col * a, 1.0);
  }
`

function smoothPath01(x: number): number {
  return x * x * (3 - 2 * x)
}

function envelopeAlpha(u: number): number {
  const fadeIn = Math.min(1, u / 0.14)
  const fadeOut = 1 - Math.max(0, (u - 0.74) / 0.26) ** 1.35
  return fadeIn * fadeOut
}

export function createMergeBurst(options: {
  parent: Group
  pointCount: number
  getPositions: () => Float32Array
}): {
  spawnAtWorld: (worldPoint: Vector3, timeSec: number) => void
  update: (t: number, dt: number) => void
  setSpectrum: (v: number) => void
  setPixelRatio: (v: number) => void
  setSizeRef: (v: number) => void
  setPointerGlow: (v: number) => void
  setCursorInside: (v: number) => void
} {
  const { parent, pointCount, getPositions } = options

  const slots: Slot[] = Array.from({ length: POOL }, () => ({
    active: false,
    start: new Vector3(),
    targetIdx: 0,
    t0: 0,
    duration: 2.8,
    fuzzSeed: 0,
  }))

  const posAttr = new Float32Array(POOL * 3)
  const alphaAttr = new Float32Array(POOL)
  const scaleAttr = new Float32Array(POOL)
  scaleAttr.fill(0.2)
  const tintAttr = new Float32Array(POOL)
  tintAttr.fill(0.5)

  const geom = new BufferGeometry()
  geom.setAttribute('position', new BufferAttribute(posAttr, 3))
  geom.setAttribute('aAlpha', new BufferAttribute(alphaAttr, 1))
  geom.setAttribute('aScale', new BufferAttribute(scaleAttr, 1))
  geom.setAttribute('aTint', new BufferAttribute(tintAttr, 1))

  const mat = new ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uSizeRef: { value: 40 },
      uCastSizeMul: { value: 1.38 },
      uSpectrum: { value: 0.5 },
      uPointerGlow: { value: 0 },
      uCursorInside: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    premultipliedAlpha: true,
  })

  const points = new Points(geom, mat)
  points.frustumCulled = false
  points.renderOrder = 2
  parent.add(points)

  const end = new Vector3()
  let lastSpawnT = -999
  const wobble = new Vector3()

  function findFreeSlot(): number {
    for (let i = 0; i < POOL; i++) {
      if (!slots[i]!.active) return i
    }
    return -1
  }

  function spawnAtWorld(worldPoint: Vector3, timeSec: number): void {
    if (timeSec - lastSpawnT < COOLDOWN_SEC) return
    lastSpawnT = timeSec

    parent.updateMatrixWorld(true)
    const local = new Vector3().copy(worldPoint)
    parent.worldToLocal(local)

    const spread = 0.17 + Math.random() * 0.1
    const n = PER_BURST_MIN + Math.floor(Math.random() * (PER_BURST_MAX - PER_BURST_MIN + 1))

    for (let k = 0; k < n; k++) {
      const idx = findFreeSlot()
      if (idx < 0) break
      const s = slots[idx]!
      s.active = true
      s.targetIdx = Math.floor(Math.random() * pointCount)
      s.t0 = timeSec
      s.duration = 2.6 + Math.random() * 2.2
      s.fuzzSeed = Math.random() * Math.PI * 2
      s.start.copy(local)
      s.start.x += (Math.random() - 0.5) * spread
      s.start.y += (Math.random() - 0.5) * spread
      s.start.z += (Math.random() - 0.5) * spread
      scaleAttr[idx] = 0.12 + Math.random() * 0.2
      tintAttr[idx] = Math.random()
    }
  }

  function update(t: number, _dt: number): void {
    const arr = getPositions()

    for (let i = 0; i < POOL; i++) {
      const s = slots[i]!
      const i3 = i * 3
      if (!s.active) {
        posAttr[i3] = 0
        posAttr[i3 + 1] = 0
        posAttr[i3 + 2] = 0
        alphaAttr[i] = 0
        continue
      }

      const age = t - s.t0
      if (age >= s.duration) {
        s.active = false
        posAttr[i3] = 0
        posAttr[i3 + 1] = 0
        posAttr[i3 + 2] = 0
        alphaAttr[i] = 0
        continue
      }

      const u = age / s.duration
      const te = smoothPath01(u)
      const j = s.targetIdx * 3
      end.set(arr[j]!, arr[j + 1]!, arr[j + 2]!)
      const ph = s.fuzzSeed
      const tt = t
      const wAmp = 0.092 * (0.4 + 0.6 * (1 - te))
      wobble.set(
        Math.sin(tt * 2.15 + ph) + 0.42 * Math.sin(tt * 5.1 + ph * 1.9),
        Math.cos(tt * 1.88 + ph * 1.2) + 0.38 * Math.sin(tt * 6.3 + ph),
        Math.sin(tt * 2.6 + ph * 0.7) + 0.45 * Math.cos(tt * 4.7 + ph * 2.2),
      )
      wobble.multiplyScalar(wAmp)
      posAttr[i3] = s.start.x + (end.x - s.start.x) * te + wobble.x
      posAttr[i3 + 1] = s.start.y + (end.y - s.start.y) * te + wobble.y
      posAttr[i3 + 2] = s.start.z + (end.z - s.start.z) * te + wobble.z
      alphaAttr[i] = envelopeAlpha(u)
    }

    geom.attributes.position!.needsUpdate = true
    geom.attributes.aAlpha!.needsUpdate = true
    geom.attributes.aScale!.needsUpdate = true
    geom.attributes.aTint!.needsUpdate = true
  }

  return {
    spawnAtWorld,
    update,
    setSpectrum(v: number) {
      mat.uniforms.uSpectrum!.value = v
    },
    setPixelRatio(v: number) {
      mat.uniforms.uPixelRatio!.value = v
    },
    setSizeRef(v: number) {
      mat.uniforms.uSizeRef!.value = v
    },
    setPointerGlow(v: number) {
      mat.uniforms.uPointerGlow!.value = v
    },
    setCursorInside(v: number) {
      mat.uniforms.uCursorInside!.value = v
    },
  }
}
