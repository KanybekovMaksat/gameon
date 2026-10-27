import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, useGLTF, useTexture } from '@react-three/drei'
import { HelperBot } from '../HelperBot'
import {
  Box3, CylinderGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, SphereGeometry, Vector3,
  type BufferGeometry, type Group, type Material, type Mesh, type MeshBasicMaterial, type Object3D,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { QUEST_GOAL } from '../../app/store'
import {
  FOUNTAIN, KIOSK, LIGHTHOUSE, OFFICE, PLAZA, QUEST, ROAD_END, ROAD_LEN, ROAD_W, SCHOOL, islandU, roadAt, toU,
} from './layout'
import { GATES, PADS, STATIONS } from './plan'
import { PROPS } from './scatter'
import { clock as time } from './uniforms'
import { YAW, type Sim } from './sim'
import { NAVY, STONE, WHITE, Beam } from './stations'
import { BLUE, glyphTexture } from './textures'

const FURNITURE = '/models/kenney-furniture/'
const GLASS = '#bcd2fb'
// Marks a part that moves, so Merged leaves it drawing on its own.
const DYN = { dynamic: true }
const GLASS_DEEP = '#9bb9f2'
for (const f of ['pottedPlant', 'bench', 'books', 'lampRoundTable', 'bear', 'plantSmall2']) useGLTF.preload(FURNITURE + f + '.glb')

function useLogo() {
  return useTexture('/logo-gradient.png', (t) => { t.colorSpace = SRGBColorSpace })
}

// A furniture kit model scaled to a height, base on the ground, colors kept.
function Furniture({ file, height, ...rest }: { file: string; height: number; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const { scene } = useGLTF(FURNITURE + file + '.glb')
  const obj = useMemo(() => {
    const c = scene.clone(true)
    const box = new Box3().setFromObject(c)
    const s = height / (box.max.y - box.min.y || 1)
    c.scale.setScalar(s)
    const b2 = new Box3().setFromObject(c)
    const mid = b2.getCenter(new Vector3())
    c.position.set(-mid.x, -b2.min.y, -mid.z)
    c.traverse((o) => { if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true } })
    return c
  }, [scene, height])
  return <group {...rest}><primitive object={obj} /></group>
}

function Window({ w, h, position }: { w: number; h: number; position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={[w + 0.1, h + 0.1]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={GLASS} roughness={0.25} metalness={0.1} />
      </mesh>
      <mesh position={[-w * 0.18, h * 0.08, 0.008]} rotation={[0, 0, -0.5]}>
        <planeGeometry args={[w * 0.12, h * 0.9]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.45} toneMapped={false} />
      </mesh>
    </group>
  )
}

// The Codify school: a light two-storey building with the logo, a canopy over the glass door and planters.
export function School() {
  const logo = useLogo()
  const W = SCHOOL.w, D = SCHOOL.d
  const front = D / 2 + 0.005
  return (
    <group position={[SCHOOL.x, 0, SCHOOL.z]} rotation={[0, SCHOOL.rot, 0]}>
      <mesh position={[0, 0.08, 0.3]} receiveShadow>
        <boxGeometry args={[W + 0.6, 0.16, D + 1.2]} />
        <meshStandardMaterial color="#e7eaf0" />
      </mesh>
      <RoundedBox args={[W, 2.4, D]} radius={0.08} position={[0, 1.36, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={WHITE} />
      </RoundedBox>
      <mesh position={[0, 2.59, 0]} castShadow>
        <boxGeometry args={[W + 0.12, 0.08, D + 0.12]} />
        <meshStandardMaterial color="#dfe4ee" />
      </mesh>
      <RoundedBox args={[3.8, 1.5, 3.8]} radius={0.08} position={[-1.2, 3.38, -0.4]} castShadow receiveShadow>
        <meshStandardMaterial color={WHITE} />
      </RoundedBox>
      <mesh position={[-1.2, 4.16, -0.4]} castShadow>
        <boxGeometry args={[3.92, 0.08, 3.92]} />
        <meshStandardMaterial color="#dfe4ee" />
      </mesh>
      {/* The logo on the upper floor, windows beside it. */}
      <mesh position={[-1.2, 3.4, 1.506]}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial map={logo} toneMapped={false} />
      </mesh>
      <Window w={0.6} h={0.8} position={[-2.45, 3.36, 1.506]} />
      <Window w={0.6} h={0.8} position={[0.05, 3.36, 1.506]} />
      {/* Ground floor: glass door in the middle under a canopy, windows on both sides. */}
      {[-2.5, -1.45, 1.45, 2.5].map((x) => <Window key={x} w={0.8} h={1.05} position={[x, 1.25, front]} />)}
      <mesh position={[0, 1.05, front]}>
        <planeGeometry args={[1.5, 1.8]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} position={[x, 1.02, front + 0.005]}>
          <planeGeometry args={[0.62, 1.66]} />
          <meshStandardMaterial color={GLASS_DEEP} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 2.04, front + 0.5]} castShadow>
        <boxGeometry args={[2.3, 0.08, 1.0]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      {/* Side windows on the face the camera sees. */}
      {[-1.4, 0, 1.4].map((z) => (
        <group key={z} position={[-W / 2 - 0.005, 1.35, z]} rotation={[0, -Math.PI / 2, 0]}>
          <Window w={0.8} h={1.05} position={[0, 0, 0]} />
        </group>
      ))}
      <Furniture file="pottedPlant" height={0.9} position={[-1.35, 0.16, front + 0.45]} />
      <Furniture file="pottedPlant" height={0.9} position={[1.35, 0.16, front + 0.45]} />
      <mesh position={[0, 0.02, front + 1.35]} receiveShadow>
        <boxGeometry args={[2.4, 0.04, 1.7]} />
        <meshStandardMaterial color="#ebe5d8" />
      </mesh>
    </group>
  )
}

// The Codify office by the conditions gate: a glass front, the logo on the roof.
export function Office() {
  const logo = useLogo()
  const W = OFFICE.w, D = OFFICE.d
  const front = D / 2 + 0.005
  // The glass front and the door share the width: the door on the left, glass to the right of it.
  const dx = -W / 2 + 0.7, gw = W - 1.8, gx = W / 2 - 0.35 - gw / 2
  return (
    <group position={[OFFICE.x, 0, OFFICE.z]} rotation={[0, OFFICE.rot, 0]}>
      <mesh position={[0, 0.08, 0.3]} receiveShadow>
        <boxGeometry args={[W + 0.6, 0.16, D + 1.2]} />
        <meshStandardMaterial color="#e7eaf0" />
      </mesh>
      <RoundedBox args={[W, 3.9, D]} radius={0.08} position={[0, 2.11, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={WHITE} />
      </RoundedBox>
      <mesh position={[0, 4.1, 0]} castShadow>
        <boxGeometry args={[W + 0.14, 0.1, D + 0.14]} />
        <meshStandardMaterial color="#dfe4ee" />
      </mesh>
      {/* A glass front over two floors, with the floor line across; the door on the left under a canopy. */}
      <mesh position={[gx, 2.55, front]}>
        <planeGeometry args={[gw + 0.14, 2.5]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh position={[gx, 2.55, front + 0.004]}>
        <planeGeometry args={[gw, 2.36]} />
        <meshStandardMaterial color={GLASS} roughness={0.2} metalness={0.15} />
      </mesh>
      <mesh position={[gx, 2.55, front + 0.008]}>
        <planeGeometry args={[gw, 0.06]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} position={[gx + (k * gw) / 3, 2.55, front + 0.008]}>
          <planeGeometry args={[0.05, 2.36]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
      ))}
      <mesh position={[dx, 0.95, front]}>
        <planeGeometry args={[1.1, 1.55]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh position={[dx, 0.92, front + 0.004]}>
        <planeGeometry args={[0.96, 1.42]} />
        <meshStandardMaterial color={GLASS_DEEP} roughness={0.2} />
      </mesh>
      <mesh position={[dx, 1.84, front + 0.4]} castShadow>
        <boxGeometry args={[1.5, 0.07, 0.8]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      {/* The logo stands on the roof, turned to the camera. */}
      <group position={[0.6, 4.15, 0.2]} rotation={[0, YAW - OFFICE.rot, 0]}>
        <mesh position={[0, 0.9, -0.03]} castShadow>
          <boxGeometry args={[1.5, 1.5, 0.06]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
        <mesh position={[0, 0.9, 0.001]}>
          <planeGeometry args={[1.38, 1.38]} />
          <meshBasicMaterial map={logo} toneMapped={false} />
        </mesh>
        {[-0.5, 0.5].map((x) => (
          <mesh key={x} position={[x, 0.08, -0.05]}>
            <boxGeometry args={[0.06, 0.2, 0.06]} />
            <meshStandardMaterial color={NAVY} />
          </mesh>
        ))}
      </group>
      {[-0.3, 0, 0.3].map((k) => (
        <group key={k} position={[W / 2 + 0.005, 0, k * D]} rotation={[0, Math.PI / 2, 0]}>
          <Window w={0.7} h={0.9} position={[0, 1.2, 0]} />
          <Window w={0.7} h={0.9} position={[0, 2.9, 0]} />
        </group>
      ))}
      <Furniture file="pottedPlant" height={0.85} position={[dx + 0.95, 0.16, front + 0.4]} />
    </group>
  )
}

// The shop kiosk: a counter with the shop's own items, a striped awning and a codecoin turning above.
export function Kiosk() {
  const sign = useMemo(() => glyphTexture('bag', '#26304f'), [])
  useEffect(() => () => sign.dispose(), [sign])
  const coin = useRef<Group>(null)
  useFrame(() => {
    if (!coin.current) return
    coin.current.rotation.y = time.value * 1.4
    coin.current.position.y = 3.05 + Math.sin(time.value * 2) * 0.08
  })
  const W = KIOSK.w
  return (
    <group position={[KIOSK.x, 0, KIOSK.z]} rotation={[0, KIOSK.rot, 0]}>
      <mesh position={[0, 1.2, -0.72]} castShadow receiveShadow>
        <boxGeometry args={[W, 2.4, 0.14]} />
        <meshStandardMaterial color={WHITE} />
      </mesh>
      <RoundedBox args={[W, 0.95, 0.9]} radius={0.05} position={[0, 0.48, 0.3]} castShadow receiveShadow>
        <meshStandardMaterial color={WHITE} />
      </RoundedBox>
      <mesh position={[0, 0.1, 0.76]}>
        <boxGeometry args={[W - 0.04, 0.14, 0.02]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 - 0.06), 1.2, 0.7]} castShadow>
          <boxGeometry args={[0.08, 2.4, 0.08]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
      ))}
      {/* Awning: stripes, sloping to the front. */}
      <group position={[0, 2.42, 0.05]} rotation={[0.32, 0, 0]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[-W / 2 + (W / 7) * (i + 0.5), 0, 0.2]} castShadow>
            <boxGeometry args={[W / 7, 0.06, 1.7]} />
            <meshStandardMaterial color={i % 2 ? WHITE : '#cfdcf3'} />
          </mesh>
        ))}
      </group>
      <group position={[0, 2.25, 1.13]} rotation={[0.1, 0, 0]}>
        <mesh>
          <circleGeometry args={[0.32, 32]} />
          <meshStandardMaterial color={WHITE} />
        </mesh>
        <mesh position={[0, 0, 0.005]}>
          <planeGeometry args={[0.44, 0.44]} />
          <meshBasicMaterial map={sign} transparent toneMapped={false} />
        </mesh>
      </group>
      {/* The shop's desk items on the counter. */}
      <Furniture file="books" height={0.22} position={[-0.95, 0.95, 0.35]} rotation={[0, 0.4, 0]} />
      <Furniture file="lampRoundTable" height={0.5} position={[-0.4, 0.95, 0.2]} />
      <Furniture file="bear" height={0.4} position={[0.25, 0.95, 0.35]} rotation={[0, -0.3, 0]} />
      <Furniture file="plantSmall2" height={0.42} position={[0.9, 0.95, 0.3]} />
      <group userData={DYN} ref={coin} position={[0, 3.05, 0.3]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.08, 36]} />
          <meshStandardMaterial color="#ffc53d" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.045]}>
          <ringGeometry args={[0.24, 0.29, 36]} />
          <meshStandardMaterial color="#e0a100" />
        </mesh>
        <mesh position={[0, 0, -0.045]} rotation={[0, Math.PI, 0]}>
          <ringGeometry args={[0.24, 0.29, 36]} />
          <meshStandardMaterial color="#e0a100" />
        </mesh>
      </group>
    </group>
  )
}

// The class quest board: the group's mark and a 3D bar that fills toward the goal; its title and count are a label.
export function QuestBoard({ quest }: { quest: number }) {
  const tex = useMemo(() => glyphTexture('users', '#26304f'), [])
  useEffect(() => () => tex.dispose(), [tex])
  const fill = useRef<Mesh>(null)
  const shown = useRef(0)
  const TRACK = 2.5
  useFrame((_, dt) => {
    const f = fill.current
    if (!f) return
    const goal = Math.min(1, quest / QUEST_GOAL)
    shown.current += (goal - shown.current) * Math.min(1, dt * 3)
    f.scale.x = Math.max(0.001, shown.current)
    f.position.x = -TRACK / 2 + (TRACK * shown.current) / 2
  })
  return (
    <group position={[QUEST.x, 0, QUEST.z]} rotation={[0, QUEST.rot, 0]}>
      {[-1.45, 1.45].map((x) => (
        <mesh key={x} position={[x, 1.2, -0.05]} castShadow>
          <boxGeometry args={[0.1, 2.4, 0.1]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
      ))}
      <group position={[0, 1.72, 0]} rotation={[-0.12, 0, 0]}>
        <RoundedBox args={[3.1, 1.5, 0.08]} radius={0.04} castShadow>
          <meshStandardMaterial color={WHITE} />
        </RoundedBox>
        <mesh position={[0, 0.18, 0.042]}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
        <mesh position={[0.22, -0.46, 0.05]}>
          <boxGeometry args={[TRACK, 0.14, 0.03]} />
          <meshStandardMaterial color="#e6e7eb" />
        </mesh>
        <mesh userData={DYN} ref={fill} position={[0.22 - TRACK / 2, -0.46, 0.062]}>
          <boxGeometry args={[TRACK, 0.14, 0.03]} />
          <meshBasicMaterial color={BLUE} toneMapped={false} />
        </mesh>
        <group position={[0.22 + TRACK / 2 + 0.05, -0.46, 0.06]}>
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[0.03, 0.5, 0.03]} />
            <meshStandardMaterial color={NAVY} />
          </mesh>
          <mesh position={[0.1, 0.38, 0]}>
            <planeGeometry args={[0.2, 0.14]} />
            <meshStandardMaterial color={BLUE} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

// Materials cloned for one model; the geometry stays shared with the loaded file.
function disposeMaterials(root: Object3D) {
  root.traverse((o) => { const m = o as Mesh; if (m.isMesh) (m.material as MeshStandardMaterial).dispose() })
}

// The helper robot walks with the child: a step behind, or ahead on the way to a lesson. It waves when it starts
// to lead or when the child taps it. The sim moves its group; the robot animates itself inside it.
export function Robot({ sim }: { sim: Sim }) {
  const ref = useRef<Group>(null)
  useEffect(() => {
    if (ref.current) sim.setRig('bot', { group: ref.current, actions: {} })
    return () => sim.setRig('bot', null)
  }, [sim])
  return (
    <group ref={ref}>
      <HelperBot height={1.2} faceCamera motion={() => sim.bot.speed} wave={() => sim.takeWave()} />
    </group>
  )
}

// The fountain in the middle of the plaza, with rings on the water.
export function Fountain() {
  const rings = useRef<(Mesh | null)[]>([])
  useFrame(() => {
    rings.current.forEach((r, i) => {
      if (!r) return
      const k = (time.value * 0.45 + i / 3) % 1
      r.scale.setScalar(0.25 + k * 0.9)
      ;(r.material as MeshBasicMaterial).opacity = 0.6 * (1 - k)
    })
  })
  const R = FOUNTAIN.r
  return (
    <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R + 0.06, 0.4, 48]} />
        <meshStandardMaterial color={STONE} />
      </mesh>
      <mesh position={[0, 0.405, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R - 0.16, 48]} />
        <meshStandardMaterial color="#9fdcec" roughness={0.15} metalness={0.1} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} userData={DYN} ref={(m) => { rings.current[i] = m }} position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.0, 48]} />
          <meshBasicMaterial color="#ffffff" transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.75, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 0.7, 20]} />
        <meshStandardMaterial color={WHITE} />
      </mesh>
      <mesh position={[0, 1.12, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.3, 0.14, 28]} />
        <meshStandardMaterial color={WHITE} />
      </mesh>
      <mesh position={[0, 1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 28]} />
        <meshStandardMaterial color="#9fdcec" />
      </mesh>
    </group>
  )
}

// The lighthouse at the end of the road, where the next topics will come; its light turns slowly.
export function Lighthouse() {
  const beam = useRef<Group>(null)
  const sign = useMemo(() => glyphTexture('flag', '#26304f'), [])
  useEffect(() => () => sign.dispose(), [sign])
  useFrame(() => { if (beam.current) beam.current.rotation.y = time.value * 0.8 })
  const end = roadAt(ROAD_LEN)
  const bands = [0, 1, 2, 3]
  return (
    <>
      <group position={[LIGHTHOUSE.x, 0, LIGHTHOUSE.z]}>
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.5, 1.7, 0.4, 32]} />
          <meshStandardMaterial color={STONE} />
        </mesh>
        {bands.map((i) => (
          <mesh key={i} position={[0, 0.4 + i * 0.95 + 0.475, 0]} castShadow>
            <cylinderGeometry args={[0.95 - (i + 1) * 0.1, 0.95 - i * 0.1, 0.95, 28]} />
            <meshStandardMaterial color={i % 2 ? NAVY : WHITE} />
          </mesh>
        ))}
        <mesh position={[0, 4.35, 0]} castShadow>
          <cylinderGeometry args={[0.75, 0.75, 0.1, 28]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
        <mesh position={[0, 4.75, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.7, 20]} />
          <meshStandardMaterial color="#fff6d6" emissive="#ffd35a" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, 5.3, 0]} castShadow>
          <coneGeometry args={[0.6, 0.5, 20]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
        <group userData={DYN} ref={beam} position={[0, 4.75, 0]}>
          <group rotation={[0, 0, Math.PI / 2]} position={[2.6, 0, 0]}>
            <Beam height={5} radius={0.9} color="#ffd35a" strength={0.35} />
          </group>
        </group>
      </group>
      <group position={[end.x + 1.6, 0, end.z + 0.4]} rotation={[0, YAW, 0]}>
        <mesh position={[0, 0.6, -0.02]} castShadow>
          <boxGeometry args={[0.07, 1.2, 0.07]} />
          <meshStandardMaterial color={NAVY} />
        </mesh>
        <RoundedBox args={[0.7, 0.7, 0.06]} radius={0.05} position={[0, 1.4, 0]} castShadow>
          <meshStandardMaterial color={WHITE} />
        </RoundedBox>
        <mesh position={[0, 1.4, 0.035]}>
          <planeGeometry args={[0.56, 0.56]} />
          <meshBasicMaterial map={sign} transparent toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

// Street lamps along the road and around the plaza: two instanced meshes for all of them.
export function Lamps() {
  const spots = useMemo(() => {
    const out: { x: number; z: number }[] = []
    const avoid = [
      ...PADS.map((p) => ({ x: p.x, z: p.z, r: 2 })),
      ...STATIONS.map((s) => ({ ...s.sign, r: 1.8 })),
      ...STATIONS.map((s) => ({ ...s.landmark, r: 2.4 })),
      ...GATES.map((g) => ({ x: g.x, z: g.z, r: 4.8 })),
      { ...ROAD_END, r: 2.4 },
      { x: PLAZA.x, z: PLAZA.z, r: PLAZA.r + 0.8 },
    ]
    let side = 1
    for (let s = 2.5; s < ROAD_LEN - 2; s += 7.5) {
      const p = roadAt(s)
      const x = p.x + p.nx * side * (ROAD_W / 2 + 0.5), z = p.z + p.nz * side * (ROAD_W / 2 + 0.5)
      side = -side
      if (avoid.some((a) => (a.x - x) ** 2 + (a.z - z) ** 2 < a.r * a.r) || islandU(x, z) > 0.86) continue
      out.push({ x, z })
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5
      const x = PLAZA.x + Math.cos(a) * (PLAZA.r - 0.35), z = PLAZA.z + Math.sin(a) * (PLAZA.r - 0.35)
      if (Math.abs(Math.atan2(z - PLAZA.z, x - PLAZA.x) + Math.PI / 2) < 0.35) continue
      out.push({ x, z })
    }
    return out
  }, [])
  const meshes = useMemo(() => {
    const pole = new InstancedMesh(new CylinderGeometry(0.045, 0.06, 2, 8).translate(0, 1, 0), new MeshStandardMaterial({ color: NAVY }), spots.length)
    const globe = new InstancedMesh(new SphereGeometry(0.17, 16, 10), new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff1c9', emissiveIntensity: 0.55 }), spots.length)
    const m = new Matrix4()
    spots.forEach((s, i) => {
      pole.setMatrixAt(i, m.makeTranslation(s.x, 0, s.z))
      globe.setMatrixAt(i, m.makeTranslation(s.x, 2.1, s.z))
    })
    pole.castShadow = true
    globe.castShadow = true
    return { pole, globe }
  }, [spots])
  useEffect(() => () => {
    for (const m of [meshes.pole, meshes.globe]) { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose() }
  }, [meshes])
  return <><primitive object={meshes.pole} /><primitive object={meshes.globe} /></>
}

// Benches around the fountain and along the road, flower beds by the paths to the landmarks. All of them are merged
// into a few meshes: one draw call per material instead of one per bench.
export function PlazaProps() {
  const { scene } = useGLTF(FURNITURE + 'bench.glb')
  const parts = useMemo(() => {
    const benches = [
      ...[1.9, 2.8, 0.35, -0.6].map((a) => {
        const x = PLAZA.x + Math.cos(a) * 3.3, z = PLAZA.z + Math.sin(a) * 3.3
        return { x, z, rot: Math.atan2(PLAZA.x - x, PLAZA.z - z) }
      }),
      ...PROPS.filter((p) => p.kind === 'bench'),
    ]
    // The bench model scaled to its height, base on the ground, centred.
    scene.updateMatrixWorld(true)
    const box = new Box3().setFromObject(scene)
    const k = 0.72 / (box.max.y - box.min.y || 1)
    const mid = box.getCenter(new Vector3())
    const fit = new Matrix4().makeScale(k, k, k).multiply(new Matrix4().makeTranslation(-mid.x, -box.min.y, -mid.z))
    const byMat = new Map<string, { list: BufferGeometry[]; material: Material }>()
    const q = new Quaternion(), yAxis = new Vector3(0, 1, 0), one = new Vector3(1, 1, 1)
    for (const b of benches) {
      const place = new Matrix4().compose(new Vector3(b.x, 0.02, b.z), q.setFromAxisAngle(yAxis, b.rot + BENCH_TURN), one).multiply(fit)
      scene.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh) return
        const mat = m.material as Material
        const g = m.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(place, m.matrixWorld))
        const e = byMat.get(mat.uuid) ?? { list: [], material: mat }
        e.list.push(g)
        byMat.set(mat.uuid, e)
      })
    }
    const out = [...byMat.values()].map(({ list, material }) => {
      const geometry = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      return { geometry, material }
    }).filter((p): p is { geometry: BufferGeometry; material: Material } => !!p.geometry)
    // Flower beds: white planters and their soil.
    const planters: BufferGeometry[] = [], soil: BufferGeometry[] = []
    for (const b of PROPS) {
      if (b.kind !== 'bed') continue
      const at = new Matrix4().compose(new Vector3(b.x, 0, b.z), q.setFromAxisAngle(yAxis, b.rot), one)
      planters.push(new RoundedBoxGeometry(b.hw * 2, 0.3, b.hd * 2, 2, 0.06).translate(0, 0.15, 0).applyMatrix4(at))
      soil.push(new PlaneGeometry(b.hw * 2 - 0.12, b.hd * 2 - 0.12).rotateX(-Math.PI / 2).translate(0, 0.305, 0).applyMatrix4(at))
    }
    const merged = { benches: out, planters: mergeGeometries(planters, false), soil: mergeGeometries(soil, false) }
    planters.forEach((g) => g.dispose())
    soil.forEach((g) => g.dispose())
    return merged
  }, [scene])
  useEffect(() => () => {
    parts.benches.forEach((p) => p.geometry.dispose())
    parts.planters?.dispose()
    parts.soil?.dispose()
  }, [parts])
  return (
    <>
      {parts.benches.map((p, i) => <mesh key={i} geometry={p.geometry} material={p.material} castShadow receiveShadow />)}
      {parts.planters && (
        <mesh geometry={parts.planters} castShadow receiveShadow>
          <meshStandardMaterial color={WHITE} />
        </mesh>
      )}
      {parts.soil && (
        <mesh geometry={parts.soil}>
          <meshStandardMaterial color="#9c7b5e" roughness={1} />
        </mesh>
      )}
    </>
  )
}

// The furniture kit's bench faces -z; props face their `rot`.
const BENCH_TURN = Math.PI

export function Dock() {
  const canoe = useRef<Group>(null)
  const { scene } = useGLTF('/models/kenney-nature/canoe.glb')
  const boat = useMemo(() => {
    const c = scene.clone(true)
    const box = new Box3().setFromObject(c)
    c.scale.setScalar(2.2 / (box.max.x - box.min.x || 1))
    c.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const mat = (m.material as MeshStandardMaterial).clone()
      mat.color.set(mat.name === 'wood' ? '#d9a77c' : '#f2b36b')
      m.material = mat
      m.castShadow = true
    })
    return c
  }, [scene])
  useEffect(() => () => disposeMaterials(boat), [boat])
  const th = 0.62
  const base = toU(Math.cos(th), Math.sin(th), 0.93)
  const rot = Math.atan2(Math.cos(th), Math.sin(th) * 1.2)
  useFrame(() => {
    if (!canoe.current) return
    canoe.current.position.y = -0.12 + Math.sin(time.value * 1.3) * 0.03
    canoe.current.rotation.z = Math.sin(time.value * 1.1) * 0.03
  })
  return (
    <group position={[base.x, 0, base.z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.02, 2.2]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.1, 4.6]} />
        <meshStandardMaterial color="#d9a77c" />
      </mesh>
      {[0.6, 2.2, 3.9].map((z) => [-0.6, 0.6].map((x) => (
        <mesh key={`${x}${z}`} position={[x, -0.3, z]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.8, 8]} />
          <meshStandardMaterial color="#b88760" />
        </mesh>
      )))}
      <group userData={DYN} ref={canoe} position={[1.25, -0.12, 3.2]}>
        <primitive object={boat} rotation={[0, Math.PI / 2, 0]} />
      </group>
    </group>
  )
}

