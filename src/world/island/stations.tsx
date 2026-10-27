import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { AdditiveBlending, DoubleSide, Shape, ShaderMaterial, Color, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three'
import { sfx } from '../../app/sfx'
import type { LessonState } from '../../app/store'
import type { IconName } from '../../components'
import type { Topic } from '../../content/types'
import type { Station } from './layout'
import { GATE_HALF, YAW, type Sim } from './sim'
import { clock as time, flare, reduced } from './uniforms'
import { BLUE, codeTexture, glyphTexture, signTexture } from './textures'

// Topic stations along the road: a sign, a landmark that shows the idea of the topic, a pad per lesson,
// and the gate before a topic that waits for the office lesson.

export const WHITE = '#fbfcfe'
export const NAVY = '#26304f'
export const STONE = '#eceff4'
const LINE = '#b8ccff'
// Marks a part that moves or changes, so Merged leaves it drawing on its own.
const DYN = { dynamic: true }
const GREY = '#e1e3e9'

// A canvas texture is freed when a new one replaces it.
function useDispose(t: { dispose: () => void }) {
  useEffect(() => () => t.dispose(), [t])
}

// A station's sign: one post under a square board with the topic's icon. Its title and count are a label in the
// HUD, drawn at a fixed size so they stay readable on a phone.
export function Sign({ station, topic, current }: { station: Station; topic: Topic; current: boolean }) {
  const tex = useMemo(() => signTexture(topic.icon, current), [topic, current])
  useDispose(tex)
  return (
    <group position={[station.sign.x, 0, station.sign.z]} rotation={[0, YAW, 0]}>
      <mesh position={[0, 0.7, -0.08]} castShadow>
        <boxGeometry args={[0.09, 1.4, 0.09]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <group position={[0, 1.55, 0]} rotation={[-0.35, 0, 0]}>
        <RoundedBox args={[0.92, 0.92, 0.08]} radius={0.06} castShadow>
          <meshStandardMaterial color={WHITE} />
        </RoundedBox>
        <mesh position={[0, 0, 0.042]}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

const PAD_LOOK: Record<LessonState, { top: string; rim: string; glyph: string }> = {
  done: { top: '#1b2442', rim: '#7fa7ff', glyph: '#ffffff' },
  now: { top: '#ffffff', rim: BLUE, glyph: BLUE },
  open: { top: '#ffffff', rim: LINE, glyph: '#1f66e5' },
  locked: { top: GREY, rim: '#d4d6dc', glyph: '#8a909e' },
  office: { top: GREY, rim: '#d4d6dc', glyph: '#8a909e' },
}

function padGlyph(state: LessonState, icon: IconName): IconName {
  return state === 'done' ? 'check' : state === 'locked' ? 'lock' : state === 'office' ? 'building' : icon
}

// A lesson pad on the road. Done pads are lit with a check; the current one pulses under a beacon.
export function Pad({ x, z, state, icon }: { x: number; z: number; state: LessonState; icon: IconName }) {
  const look = PAD_LOOK[state]
  const glyph = useMemo(() => glyphTexture(padGlyph(state, icon), PAD_LOOK[state].glyph), [state, icon])
  useDispose(glyph)
  const lit = state === 'done' || state === 'now'
  return (
    <group position={[x, 0, z]} rotation={[0, YAW, 0]}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[0.9, 0.94, 0.07, 48]} />
        {lit ? <meshBasicMaterial color={look.rim} toneMapped={false} /> : <meshStandardMaterial color={look.rim} />}
      </mesh>
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[0.76, 0.8, 0.07, 48]} />
        <meshStandardMaterial color={look.top} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.137, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.92, 0.92]} />
        <meshBasicMaterial map={glyph} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {state === 'now' && <NowMark />}
    </group>
  )
}

// A column of soft blue light, seen from across the island.
const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
uniform float uFlare;
varying vec2 vUv;
void main() {
  float a = pow(1.0 - vUv.y, 1.6) * uStrength * (0.82 + 0.18 * sin(uTime * 2.2)) * (1.0 + uFlare * 1.6);
  gl_FragColor = vec4(uColor * a, a);
}`

export function Beam({ height, radius, color = BLUE, strength = 0.5, flares = false }: { height: number; radius: number; color?: string; strength?: number; flares?: boolean }) {
  const mat = useMemo(() => new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uTime: time, uStrength: { value: strength }, uFlare: flares ? flare : { value: 0 } },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  }), [color, strength, flares])
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh position={[0, height / 2, 0]} material={mat} renderOrder={2}>
      <cylinderGeometry args={[radius * 0.7, radius, height, 32, 1, true]} />
    </mesh>
  )
}

function NowMark() {
  const rings = useRef<(Mesh | null)[]>([])
  const gem = useRef<Mesh>(null)
  useFrame(() => {
    const t = time.value
    rings.current.forEach((r, i) => {
      if (!r) return
      r.visible = !reduced.value
      const k = ((t * 0.7 + i * 0.5) % 1)
      r.scale.setScalar(1 + k * 0.9)
      ;(r.material as MeshBasicMaterial).opacity = 0.7 * (1 - k) * (1 - k)
    })
    if (gem.current) {
      gem.current.position.y = 2.2 + Math.sin(t * 2.4) * 0.12
      gem.current.rotation.y = t * 1.6
    }
  })
  return (
    <>
      {[0, 1].map((i) => (
        <mesh key={i} userData={DYN} ref={(m) => { rings.current[i] = m }} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.02, 56]} />
          <meshBasicMaterial color={BLUE} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <Beam height={16} radius={0.62} flares />
      <mesh userData={DYN} ref={gem} position={[0, 2.2, 0]} castShadow>
        <octahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={0.55} />
      </mesh>
    </>
  )
}

// Every landmark stands on the same round stone; the current topic's stone has a blue edge.
function Plinth({ current, children, x, z }: { current: boolean; children: ReactNode; x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.07, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.6, 1.68, 0.14, 48]} />
        <meshStandardMaterial color={STONE} />
      </mesh>
      <mesh position={[0, 0.142, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.44, 1.56, 64]} />
        {current ? <meshBasicMaterial color={BLUE} toneMapped={false} /> : <meshStandardMaterial color="#d9dde5" />}
      </mesh>
      <group position={[0, 0.14, 0]} rotation={[0, YAW, 0]}>{children}</group>
    </group>
  )
}

// Algorithms: steps, and a small cube that climbs them one by one.
function Steps() {
  const cube = useRef<Mesh>(null)
  useFrame(() => {
    const c = cube.current
    if (!c) return
    const t = (time.value * 1.4) % 5
    const i = Math.min(3, Math.floor(t))
    const f = Math.min(1, t - Math.floor(t))
    const hop = i < 3 && t < 4 ? f : 0
    const from = i, to = Math.min(3, i + (t < 4 ? 1 : 0))
    const k = hop < 0.6 ? hop / 0.6 : 1
    const x = -0.9 + (from + (to - from) * k) * 0.6
    const y = 0.3 * (from + 1) + (0.3 * (to - from)) * k + Math.sin(Math.min(1, k) * Math.PI) * 0.25
    c.position.set(x, y + 0.13, 0.1)
    c.scale.setScalar(t >= 4 ? Math.max(0.001, 1 - (t - 4) * 3) : Math.min(1, t * 4))
  })
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <group key={i}>
          <mesh position={[-0.9 + i * 0.6, 0.15 * (i + 1), 0]} castShadow receiveShadow>
            <boxGeometry args={[0.58, 0.3 * (i + 1), 1.3]} />
            <meshStandardMaterial color={WHITE} />
          </mesh>
          <mesh position={[-0.9 + i * 0.6, 0.3 * (i + 1) + 0.012, 0.66]}>
            <boxGeometry args={[0.6, 0.024, 0.03]} />
            <meshStandardMaterial color={NAVY} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.9, 1.2 + 0.55, -0.4]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 1.1, 8]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh position={[1.12, 2.1, -0.4]}>
        <planeGeometry args={[0.44, 0.28]} />
        <meshStandardMaterial color={BLUE} side={DoubleSide} />
      </mesh>
      <mesh userData={DYN} ref={cube} castShadow>
        <boxGeometry args={[0.26, 0.26, 0.26]} />
        <meshStandardMaterial color={BLUE} />
      </mesh>
    </>
  )
}

// Loops: an upright ring with a ball that goes round and round.
function Loop() {
  const balls = useRef<(Mesh | null)[]>([])
  useFrame(() => {
    const t = time.value * 1.8
    balls.current.forEach((b, i) => {
      if (!b) return
      const a = t - i * 0.22
      b.position.set(Math.cos(a) * 1.02, 1.3 + Math.sin(a) * 1.02, 0)
    })
  })
  return (
    <>
      <mesh position={[0, 1.3, 0]} castShadow>
        <torusGeometry args={[1.02, 0.12, 14, 64]} />
        <meshStandardMaterial color={WHITE} />
      </mesh>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.12, 0]} castShadow>
          <boxGeometry args={[0.3, 0.24, 0.5]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} userData={DYN} ref={(m) => { balls.current[i] = m }} scale={1 - i * 0.2}>
          <sphereGeometry args={[0.15, 18, 12]} />
          <meshStandardMaterial color={BLUE} transparent opacity={1 - i * 0.24} />
        </mesh>
      ))}
    </>
  )
}

const arrowShape = (() => {
  const s = new Shape()
  s.moveTo(0, -0.17); s.lineTo(0.62, -0.17); s.lineTo(0.62, -0.28); s.lineTo(0.9, 0); s.lineTo(0.62, 0.28); s.lineTo(0.62, 0.17); s.lineTo(0, 0.17); s.closePath()
  return s
})()

// Conditions: a signpost with two ways; the way that is chosen lights up in turn.
function Fork() {
  const a = useRef<MeshStandardMaterial>(null)
  const b = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    const left = Math.floor(time.value / 1.6) % 2 === 0
    if (a.current) a.current.emissiveIntensity = left ? 0.55 : 0
    if (b.current) b.current.emissiveIntensity = left ? 0 : 0.55
  })
  return (
    <>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 2.2, 10]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh userData={DYN} position={[0.05, 1.7, 0]} castShadow>
        <extrudeGeometry args={[arrowShape, { depth: 0.08, bevelEnabled: false }]} />
        <meshStandardMaterial ref={a} color={WHITE} emissive={BLUE} emissiveIntensity={0} />
      </mesh>
      <mesh userData={DYN} position={[-0.05, 1.25, 0.1]} rotation={[0, Math.PI, 0]} castShadow>
        <extrudeGeometry args={[arrowShape, { depth: 0.08, bevelEnabled: false }]} />
        <meshStandardMaterial ref={b} color={WHITE} emissive={BLUE} emissiveIntensity={0} />
      </mesh>
      <mesh position={[0, 2.26, 0]} castShadow>
        <sphereGeometry args={[0.12, 16, 10]} />
        <meshStandardMaterial color={BLUE} />
      </mesh>
    </>
  )
}

// Variables: boxes with names on them, and a value that jumps in and out of one.
function Boxes() {
  const labels = useMemo(() => [codeTexture('x'), codeTexture('score'), codeTexture('name')], [])
  const value = useMemo(() => codeTexture('5', true), [])
  useEffect(() => () => { labels.forEach((t) => t.dispose()); value.dispose() }, [labels, value])
  const cube = useRef<Group>(null)
  useFrame(() => {
    const t = time.value
    if (cube.current) {
      cube.current.position.y = 1.05 + Math.abs(Math.sin(t * 1.5)) * 0.55
      cube.current.rotation.y = Math.sin(t * 0.8) * 0.4
    }
  })
  const boxes: [number, number, number][] = [[-0.62, 0.8, 0.2], [0.55, 0.62, -0.25], [0.2, 0.5, 0.75]]
  return (
    <>
      {boxes.map(([x, s, z], i) => (
        <group key={i} position={[x, s / 2, z]}>
          <RoundedBox args={[s, s, s]} radius={0.04} castShadow receiveShadow>
            <meshStandardMaterial color={i === 0 ? WHITE : '#f1f3f7'} />
          </RoundedBox>
          <mesh position={[0, 0, s / 2 + 0.005]}>
            <planeGeometry args={[s * 0.86, s * 0.43]} />
            <meshBasicMaterial map={labels[i]} toneMapped={false} transparent />
          </mesh>
        </group>
      ))}
      <group userData={DYN} ref={cube} position={[-0.62, 1.05, 0.2]}>
        <RoundedBox args={[0.34, 0.34, 0.34]} radius={0.05} castShadow>
          <meshStandardMaterial color={BLUE} />
        </RoundedBox>
        <mesh position={[0, 0, 0.175]}>
          <planeGeometry args={[0.3, 0.3]} />
          <meshBasicMaterial map={value} transparent toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

// Logic: two switches and a lamp that lights only when both are on.
function Logic() {
  const levers = useRef<(Group | null)[]>([])
  const bulb = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    const n = Math.floor(time.value / 1.1) % 4
    const on = [n & 1, (n >> 1) & 1]
    levers.current.forEach((l, i) => { if (l) l.rotation.x += ((on[i] ? -0.55 : 0.55) - l.rotation.x) * 0.2 })
    if (bulb.current) {
      const lit = on[0] && on[1]
      bulb.current.emissiveIntensity += ((lit ? 1.1 : 0) - bulb.current.emissiveIntensity) * 0.2
    }
  })
  return (
    <>
      {[-0.75, 0.05].map((x, i) => (
        <group key={x} position={[x, 0, 0.45]}>
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.46, 0.4, 0.46]} />
            <meshStandardMaterial color={WHITE} />
          </mesh>
          <group userData={DYN} ref={(g) => { levers.current[i] = g }} position={[0, 0.4, 0]}>
            <mesh position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.4, 8]} />
              <meshStandardMaterial color={NAVY} />
            </mesh>
            <mesh position={[0, 0.42, 0]}>
              <sphereGeometry args={[0.07, 12, 8]} />
              <meshStandardMaterial color={BLUE} />
            </mesh>
          </group>
          <mesh position={[0.35 - i * 0.2, 0.012, -0.35]}>
            <boxGeometry args={[0.7 + i * 0.4, 0.02, 0.05]} />
            <meshStandardMaterial color={NAVY} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.8, 0.9, -0.3]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 1.8, 10]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh userData={DYN} position={[0.8, 1.95, -0.3]} castShadow>
        <sphereGeometry args={[0.26, 20, 14]} />
        <meshStandardMaterial ref={bulb} color="#fff6d8" emissive="#ffc93d" emissiveIntensity={0} />
      </mesh>
    </>
  )
}

// Binary: four pillars count in bits; a lit cap is a one.
function Bits() {
  const caps = useRef<(MeshStandardMaterial | null)[]>([])
  useFrame(() => {
    const n = Math.floor(time.value / 0.9) % 16
    caps.current.forEach((m, i) => {
      if (!m) return
      const on = (n >> (3 - i)) & 1
      m.emissiveIntensity += ((on ? 0.7 : 0) - m.emissiveIntensity) * 0.25
      m.color.set(on ? BLUE : '#dfe2e8')
    })
  })
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[-0.9 + i * 0.6, 0, 0]}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.42, 1.1, 0.42]} />
            <meshStandardMaterial color={WHITE} />
          </mesh>
          <mesh userData={DYN} position={[0, 1.27, 0]} castShadow>
            <boxGeometry args={[0.46, 0.34, 0.46]} />
            <meshStandardMaterial ref={(m) => { caps.current[i] = m }} color="#dfe2e8" emissive={BLUE} emissiveIntensity={0} />
          </mesh>
        </group>
      ))}
    </>
  )
}

// Sorting: bars that sort themselves by bubble sort, then shuffle and start again.
function Sort() {
  const bars = useRef<(Group | null)[]>([])
  const mats = useRef<(MeshStandardMaterial | null)[]>([])
  const st = useRef({ order: [3, 0, 4, 1, 2], j: 0, swapped: false, t: 0, hold: 0, pos: [0, 1, 2, 3, 4] })
  const H = [0.45, 0.7, 0.95, 1.2, 1.45]
  useFrame((_, dt) => {
    if (reduced.value) return
    const s = st.current
    s.t += Math.min(dt, 0.05)
    if (s.hold > 0) {
      s.hold -= Math.min(dt, 0.05)
      if (s.hold <= 0) { s.order = [2, 4, 0, 3, 1]; s.j = 0; s.swapped = false; s.t = 0 }
    } else if (s.t > 0.75) {
      s.t = 0
      const { order } = s
      if (order[s.j] > order[s.j + 1]) { [order[s.j], order[s.j + 1]] = [order[s.j + 1], order[s.j]]; s.swapped = true }
      s.j++
      if (s.j >= order.length - 1) {
        if (!s.swapped) s.hold = 2
        s.j = 0
        s.swapped = false
      }
    }
    s.order.forEach((bar, slot) => {
      const g = bars.current[bar]
      if (g) g.position.x += ((-1 + slot * 0.5) - g.position.x) * Math.min(1, dt * 9)
      const m = mats.current[bar]
      if (m) m.color.set(s.hold > 0 || ((slot === s.j || slot === s.j + 1) && s.t < 0.6) ? BLUE : WHITE)
    })
  })
  return (
    <>
      {H.map((h, i) => (
        <group key={i} userData={DYN} ref={(g) => { bars.current[i] = g }} position={[-1 + [3, 0, 4, 1, 2].indexOf(i) * 0.5, 0, 0]}>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.36, h, 0.5]} />
            <meshStandardMaterial ref={(m) => { mats.current[i] = m }} color={WHITE} />
          </mesh>
        </group>
      ))}
    </>
  )
}

const LANDMARKS: Record<string, () => ReactNode> = {
  algorithms: () => <Steps />,
  loops: () => <Loop />,
  conditions: () => <Fork />,
  variables: () => <Boxes />,
  logic: () => <Logic />,
  binary: () => <Bits />,
  sorting: () => <Sort />,
}

export function Landmark({ station, current }: { station: Station; current: boolean }) {
  const make = LANDMARKS[station.topicId] ?? LANDMARKS.algorithms
  return <Plinth x={station.landmark.x} z={station.landmark.z} current={current}>{make()}</Plinth>
}

// The gate before a topic that opens after the office lesson. The doors swing open when the lesson is marked done.
export function Gate({ station, open, sim }: { station: Station; open: boolean; sim: Sim }) {
  const g = station.gate!
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const board = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const st = useRef({ v: open ? 1 : 0, delay: 0, pulse: -1, announce: false, was: open })
  const lockTex = useMemo(() => glyphTexture('building', '#26304f'), [])
  useDispose(lockTex)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const s = st.current
    // The demo scene asks to see the gate open: it shows closed for a moment, then opens in view.
    if (sim.takeReplay(station.topicId)) { s.v = 0; s.delay = 0.9; s.announce = open }
    // A change while the island is mounted animates; the frame loop waits while the island is hidden.
    if (open !== s.was) { s.was = open; s.announce = open }
    if (s.delay > 0 && !reduced.value) s.delay -= dt
    else {
      if (s.announce) { s.announce = false; s.pulse = reduced.value ? -1 : 0; sfx('finish'); if (open) sim.gateOpened(station.topicId) }
      const target = open ? 1 : 0
      // Reduced motion: the gate is open or closed at once.
      s.v = reduced.value ? target : s.v + Math.sign(target - s.v) * Math.min(Math.abs(target - s.v), dt / 1.2)
    }
    sim.setGateOpen(station.topicId, s.v > 0.55)
    const e = s.v < 0.5 ? 4 * s.v ** 3 : 1 - (-2 * s.v + 2) ** 3 / 2
    if (left.current) left.current.rotation.y = -1.75 * e
    if (right.current) right.current.rotation.y = 1.75 * e
    if (board.current) board.current.scale.setScalar(Math.max(0.001, 1 - e * 1.4))
    if (ring.current) {
      if (s.pulse >= 0) s.pulse += dt
      if (s.pulse > 1.4) s.pulse = -1
      const k = s.pulse / 1.4
      ring.current.visible = s.pulse >= 0
      ring.current.scale.setScalar(1 + k * 2.5)
      ;(ring.current.material as MeshBasicMaterial).opacity = 0.8 * (1 - k)
    }
  })
  const half = GATE_HALF
  const doorW = half - 0.1
  return (
    <group position={[g.x, 0, g.z]} rotation={[0, g.heading, 0]}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * half, 1.05, 0]} castShadow>
            <boxGeometry args={[0.24, 2.1, 0.24]} />
            <meshStandardMaterial color={WHITE} />
          </mesh>
          <mesh position={[side * half, 2.14, 0]} castShadow>
            <boxGeometry args={[0.3, 0.1, 0.3]} />
            <meshStandardMaterial color={NAVY} />
          </mesh>
          {/* The gate stands on a small bridge: railings along both road edges over the creek. */}
          <group position={[side * (half + 0.05), 0, 0]}>
            {[-1.35, -0.45, 0.45, 1.35].map((z) => (
              <mesh key={z} position={[0, 0.4, z]} castShadow>
                <boxGeometry args={[0.1, 0.8, 0.1]} />
                <meshStandardMaterial color={WHITE} />
              </mesh>
            ))}
            {[0.36, 0.7].map((y) => (
              <mesh key={y} position={[0, y, 0]} castShadow>
                <boxGeometry args={[0.07, 0.07, 2.8]} />
                <meshStandardMaterial color={WHITE} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
      {/* The bridge deck over the water. */}
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[half * 2 + 0.3, 0.06, 2.9]} />
        <meshStandardMaterial color="#e6dccb" />
      </mesh>
      <group userData={DYN} ref={left} position={[-half + 0.1, 0, 0]}>
        <Door w={doorW} />
      </group>
      <group userData={DYN} ref={right} position={[half - 0.1, 0, 0]}>
        <group scale={[-1, 1, 1]}><Door w={doorW} /></group>
      </group>
      <group userData={DYN} ref={board} position={[0, 2.35, 0]} rotation={[0, YAW - g.heading, 0]}>
        <group rotation={[-0.3, 0, 0]} position={[0, 0.5, 0]}>
          <RoundedBox args={[0.8, 0.8, 0.07]} radius={0.06} castShadow>
            <meshStandardMaterial color={WHITE} />
          </RoundedBox>
          <mesh position={[0, 0, 0.037]}>
            <planeGeometry args={[0.66, 0.66]} />
            <meshBasicMaterial map={lockTex} transparent toneMapped={false} />
          </mesh>
        </group>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.07, 0.3, 0.07]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
      </group>
      {/* The beam over the gate carries the board. */}
      <mesh position={[0, 2.2, 0]} castShadow>
        <boxGeometry args={[half * 2 + 0.3, 0.14, 0.18]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh userData={DYN} ref={ring} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.8, 0.95, 56]} />
        <meshBasicMaterial color={BLUE} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Door({ w }: { w: number }) {
  return (
    <group position={[w / 2, 0, 0]}>
      <mesh position={[0, 0.78, 0]} castShadow>
        <boxGeometry args={[w, 1.2, 0.08]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[w - 0.16, 1.04, 0.1]} />
        <meshStandardMaterial color={WHITE} />
      </mesh>
      {[-0.25, 0, 0.25].map((x) => (
        <mesh key={x} position={[x * w, 0.78, 0]}>
          <boxGeometry args={[0.04, 1.04, 0.12]} />
          <meshStandardMaterial color="#c9d2e6" />
        </mesh>
      ))}
    </group>
  )
}

// Dust puffs at the child's feet while running: a small pool of soft discs that grow and fade.
export function Dust({ sim }: { sim: Sim }) {
  const puffs = useRef<(Mesh | null)[]>([])
  const st = useRef({ next: 0, i: 0, life: new Float32Array(10) })
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const s = st.current
    const me = sim.me
    s.next -= dt
    if (!reduced.value && me.speed > 4 && s.next <= 0) {
      s.next = 0.09
      const p = puffs.current[s.i]
      s.i = (s.i + 1) % 10
      if (p) {
        p.position.set(me.x - Math.sin(me.face) * 0.25 + (Math.random() - 0.5) * 0.2, 0.08, me.z - Math.cos(me.face) * 0.25 + (Math.random() - 0.5) * 0.2)
        s.life[puffs.current.indexOf(p)] = 1
      }
    }
    puffs.current.forEach((p, k) => {
      if (!p) return
      const l = s.life[k]
      p.visible = l > 0
      if (l <= 0) return
      s.life[k] = l - dt * 2.2
      p.scale.setScalar(0.12 + (1 - l) * 0.3)
      p.position.y += dt * 0.25
      ;(p.material as MeshBasicMaterial).opacity = 0.55 * l
    })
  })
  return (
    <>
      {Array.from({ length: 10 }, (_, k) => (
        <mesh key={k} ref={(m) => { puffs.current[k] = m }} visible={false}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color="#f3ecdf" transparent depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}
