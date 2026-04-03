import './style.css'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from 'three'
import { createDotCloud } from './dotCloud'
import { createZapSystem } from './zaps'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = ''

const scene = new Scene()
scene.background = new Color(0x000000)

const camera = new PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
)
camera.position.set(0, 0.15, 5.2)

const renderer = new WebGLRenderer({ antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMappingExposure = 1.05
renderer.domElement.setAttribute('aria-hidden', 'true')
app.appendChild(renderer.domElement)

const dotCloud = createDotCloud()
scene.add(dotCloud.group)

const zaps = createZapSystem(
  dotCloud.group,
  dotCloud.pointCount,
  () => dotCloud.pointPositions,
  () => dotCloud.pointTints,
  dotCloud.material,
)

const canvas = renderer.domElement

const pointer = {
  inside: false,
  targetX: 0,
  targetY: 0,
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  glow: 0,
  presence: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
}

canvas.addEventListener('pointerenter', () => {
  pointer.inside = true
})

canvas.addEventListener('pointermove', (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect()
  pointer.targetX = ((e.clientX - r.left) / r.width) * 2 - 1
  pointer.targetY = -(((e.clientY - r.top) / r.height) * 2 - 1)
})

canvas.addEventListener('pointerleave', () => {
  pointer.inside = false
  pointer.targetX = 0
  pointer.targetY = 0
})

function createStars(count: number): Points {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 40 + Math.random() * 80
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  const mat = new PointsMaterial({
    color: 0xffffff,
    size: 0.035,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    sizeAttenuation: true,
  })
  return new Points(geo, mat)
}

const stars = createStars(900)
scene.add(stars)

function onResize(): void {
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

window.addEventListener('resize', onResize)

const clock = { start: performance.now() }
let prevFrame = performance.now()

/** One full inhale+exhale cycle (seconds) — restful ~6 breaths/min. */
const breathPeriodSec = 10.5
const breathAmp = 0.045
const breathOmega = (Math.PI * 2) / breathPeriodSec

const maxYaw = 1.05
const maxPitch = 0.82
const maxRoll = 0.38

renderer.setAnimationLoop(() => {
  const now = performance.now()
  const t = (now - clock.start) * 0.001
  const dt = Math.min((now - prevFrame) / 1000, 0.05)
  prevFrame = now

  const smooth = 1 - Math.exp(-11 * dt)
  pointer.x += (pointer.targetX - pointer.x) * smooth
  pointer.y += (pointer.targetY - pointer.y) * smooth

  const presenceTarget = pointer.inside ? 1 : 0
  const presenceSmooth = 1 - Math.exp(-7 * dt)
  pointer.presence += (presenceTarget - pointer.presence) * presenceSmooth

  const vx = (pointer.x - pointer.prevX) / Math.max(dt, 1e-4)
  const vy = (pointer.y - pointer.prevY) / Math.max(dt, 1e-4)
  pointer.prevX = pointer.x
  pointer.prevY = pointer.y
  const speed = Math.hypot(vx, vy)
  if (pointer.inside) {
    pointer.glow = Math.min(
      1,
      pointer.glow * Math.exp(-2.8 * dt) + Math.min(speed * 0.038, 0.4),
    )
  } else {
    pointer.glow *= Math.exp(-5 * dt)
  }

  const rotSmooth = 1 - Math.exp(-9 * dt)
  const targetRy = pointer.inside ? pointer.x * maxYaw : 0
  const targetRx = pointer.inside ? -pointer.y * maxPitch : 0
  const targetRz = pointer.inside ? pointer.x * pointer.y * maxRoll : 0
  pointer.rotY += (targetRy - pointer.rotY) * rotSmooth
  pointer.rotX += (targetRx - pointer.rotX) * rotSmooth
  pointer.rotZ += (targetRz - pointer.rotZ) * rotSmooth

  dotCloud.material.uniforms.uPixelRatio.value = renderer.getPixelRatio()
  dotCloud.material.uniforms.uSpectrum.value = Math.sin(t * 0.2) * 0.5 + 0.5
  dotCloud.material.uniforms.uPointerGlow.value = pointer.glow
  dotCloud.material.uniforms.uCursorInside.value = pointer.presence

  dotCloud.group.position.set(0, 0, 0)

  const breath = Math.sin(t * breathOmega)
  const breathe =
    1 +
    breath * breathAmp +
    pointer.glow * 0.04 * pointer.presence
  dotCloud.group.scale.setScalar(breathe)

  dotCloud.group.rotation.set(pointer.rotX, pointer.rotY, pointer.rotZ)

  dotCloud.update(t)
  zaps.update(t, dt)

  const p = pointer.presence
  camera.position.x = pointer.x * 0.48 * p
  camera.position.y = 0.15 + pointer.y * 0.36 * p
  camera.position.z =
    5.2 + (-pointer.y * 0.06 + Math.abs(pointer.x) * 0.04) * p
  camera.lookAt(-pointer.x * 0.14 * p, pointer.y * 0.11 * p, 0)

  renderer.render(scene, camera)
})
