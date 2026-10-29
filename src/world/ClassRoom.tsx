import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, RoundedBox, useAnimations, useGLTF, useProgress } from '@react-three/drei'
import { Box3, Group, Vector3, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type Object3D, type OrthographicCamera as OrthoCamera } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useApp } from '../app/store'
import { KIDS } from '../components'
import { castOf, modelOf } from '../rewards/catalog'
import { PauseWhenHidden } from './pause'
import { HelperBot } from './HelperBot'
import { RoomLoading } from './RoomLoading'

// What is new at the child's desk: items just put on it and a newly chosen character.
export type DeskNews = { items: string[]; character: boolean }

// `inset`: pixels at the top that UI covers (the home header); the room centers in the space below it.
// `takeNews`: called when the room comes on screen; news brings the camera to the child's desk for a moment.
type Props = { selected: string | null; onSelect: (name: string | null) => void; inset?: number; takeNews?: () => DeskNews | null }
type V3 = [number, number, number]

const ACCENT = '#0f9180'
const ACCENT_2 = '#3fd6b0'
const M = '/models/'

const KID_HEIGHT = 1.5
const SIT_Y = 0.3

// Room: floor 9 x 7.4, back wall at z = -3.6, left wall at x = -4.6. Children face the camera (+z), so their faces show.
// The child sits in the front row, closest to the camera, so nothing hides their desk.
const SEATS: [number, number][] = [[1.6, 2.8], [1.6, -1.0], [-1.6, 0.9], [1.6, 0.9], [-1.6, 2.8], [-1.6, -1.0]]
const ISO_POLAR = Math.atan(Math.SQRT2)
const C = { bg: '#eef1f6', floor: '#e8ebff', wall: '#dde2ff', sky: '#bfefff' }

// Items from the shop at the child's desk, in seat coordinates. The desk top is at y = 0.75 and its front faces
// the camera; the child sits behind the desk (smaller z). Items are larger than life and painted in colors that
// stand out from the beige desk, so they read at the room's zoom. `turn` faces an item toward the camera.
type Placed = { file: string; height?: number; width?: number; at: [number, number, number]; turn?: number; paint?: Record<string, string>; glow?: string }
const TOP = 0.75
const FACE_CAMERA = Math.PI / 4
const NAVY = '#1f3b40'
const DESK_PROPS: Record<string, Placed[]> = {
  lamp: [{ file: 'lampRoundTable', height: 0.86, at: [-0.5, TOP, 0.32], glow: '#ffc94d' }],
  books: [{ file: 'books', height: 0.34, at: [-0.48, TOP, 0.84], turn: 0.3 }],
  speaker: [{ file: 'speakerSmall', height: 0.52, at: [0.6, TOP, 0.28], turn: FACE_CAMERA, paint: { wood: NAVY } }],
  cactus: [{ file: 'plantSmall2', height: 0.64, at: [0.52, TOP, 0.84], paint: { wood: '#0f9180' } }],
  // The bear hangs on the front of the desk, facing the room.
  bear: [{ file: 'bear', height: 0.52, at: [0.3, 0.12, 0.93], paint: { fur: '#8a5a36', wood: '#ffffff' } }],
  radio: [{ file: 'radio', height: 0.62, at: [1.1, 0, 0.5], turn: FACE_CAMERA, paint: { wood: '#ffc53d' } }],
  monitor: [
    { file: 'computerScreen', height: 0.44, at: [-0.08, TOP, 0.66], turn: Math.PI, paint: { metalDark: NAVY } },
    { file: 'computerKeyboard', width: 0.5, at: [0, TOP, 0.34], turn: Math.PI, paint: { metalDark: NAVY } },
    { file: 'computerMouse', height: 0.05, at: [0.32, TOP, 0.36], turn: Math.PI, paint: { metalDark: NAVY } },
  ],
}
const DESK_ORDER = Object.keys(DESK_PROPS)
const LAMP_LIGHT: V3 = [-0.5, TOP + 0.72, 0.32]
const CHAIR_AT: V3 = [0, 0, -0.25]

// Shop items load with the room, so an item put on the desk later appears at once.
for (const file of new Set([...Object.values(DESK_PROPS).flat().map((p) => p.file), 'loungeChair'])) useGLTF.preload(M + 'kenney-furniture/' + file + '.glb')

// Skinned models need fresh world matrices before their box is measured.
function sizeOf(o: Object3D) {
  o.updateMatrixWorld(true)
  return new Box3().setFromObject(o, true).getSize(new Vector3())
}

function shadows(o: Object3D) {
  o.traverse((c) => { if ((c as Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true } })
}

// Scales a static model to a target height (or width) and puts its base at y = 0.
// `tint` repaints a whole model, `paint` repaints its materials by name, `glow` lights up its lamp material.
function Prop({ file, height, width, tint, paint, glow, ...rest }: { file: string; height?: number; width?: number; tint?: string; paint?: Record<string, string>; glow?: string; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const { scene } = useGLTF(M + 'kenney-furniture/' + file + '.glb')
  const obj = useMemo(() => {
    const c = scene.clone(true)
    if (tint || paint || glow) c.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const mat = (m.material as MeshStandardMaterial).clone()
      const color = tint ?? paint?.[mat.name]
      if (color) mat.color.set(color)
      if (glow && mat.name === 'lamp') { mat.emissive.set(glow); mat.emissiveIntensity = 0.8 }
      m.material = mat
    })
    const size = sizeOf(c)
    c.scale.setScalar(width ? width / size.x : (height ?? 1) / size.y)
    const box = new Box3().setFromObject(c)
    const mid = box.getCenter(new Vector3())
    c.position.set(-mid.x, -box.min.y, -mid.z)
    shadows(c)
    const g = new Group()
    g.add(c)
    return g
  }, [scene, height, width, tint, paint, glow])
  return <primitive object={obj} {...rest} />
}

function Character({ file, onClick }: { file: string; onClick: () => void }) {
  const { scene, animations } = useGLTF(file)
  const ref = useRef<Group>(null)
  const obj = useMemo(() => {
    const c = cloneSkinned(scene)
    c.scale.setScalar(KID_HEIGHT / sizeOf(c).y)
    shadows(c)
    return c
  }, [scene])
  const { actions } = useAnimations(animations, ref)
  useEffect(() => {
    const a = actions.sit
    a?.reset().play()
    return () => { a?.stop() }
  }, [actions])
  return (
    <group
      ref={ref}
      position={[0, SIT_Y, 0]}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <primitive object={obj} />
    </group>
  )
}

// A new item grows in with a small overshoot when the camera arrives at the desk.
const backOut = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2)

function PopIn({ at, since, children }: { at: V3; since: number | null; children: ReactNode }) {
  const g = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!g.current) return
    const t = since == null ? 1 : (clock.elapsedTime - since) / 0.45
    g.current.scale.setScalar(t >= 1 ? 1 : t <= 0 ? 0.001 : backOut(t))
  })
  return <group ref={g} position={at}>{children}</group>
}

// Soft rings spread three times around something new, then stop.
function PulseRing({ at, radius, since }: { at: V3; radius: number; since: number }) {
  const ring = useRef<Mesh>(null)
  const mat = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (!ring.current || !mat.current) return
    const t = clock.elapsedTime - since
    ring.current.visible = t >= 0 && t < 3
    if (!ring.current.visible) return
    const k = (t % 1) / 1
    ring.current.scale.setScalar(0.65 + 0.7 * k)
    mat.current.opacity = 0.75 * (1 - k * k)
  })
  return (
    <mesh ref={ring} position={at} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[radius * 0.8, radius, 48]} />
      <meshBasicMaterial ref={mat} color={ACCENT} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

// The ring lies on the desk top for desk items and on the floor for the rest.
const ringAt = ([x, y, z]: V3): V3 => [x, y >= TOP ? TOP + 0.012 : 0.012, z]

type Spot = DeskNews & { since: number }

function Seat({ index, character, desk, spot, selected, onSelect }: { index: number; character: string; desk: string[]; spot: Spot | null; selected: boolean; onSelect: () => void }) {
  const kid = KIDS[index]
  const has = (id: string) => kid.me && desk.includes(id)
  const since = (id: string) => (kid.me && spot?.items.includes(id) ? spot.since : null)
  const chairSince = since('chair')
  const [x, z] = SEATS[index]
  const marker = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (!marker.current) return
    marker.current.position.y = 1.85 + Math.sin(clock.elapsedTime * 3) * 0.08
    marker.current.rotation.y = clock.elapsedTime * 2
  })
  return (
    <group position={[x, 0, z]}>
      <Prop file="desk" height={0.75} position={[0, 0, 0.55]} />
      {!has('monitor') && <Prop file="laptop" height={0.26} position={[0, 0.75, 0.6]} rotation={[0, Math.PI, 0]} />}
      {has('chair')
        ? <PopIn at={CHAIR_AT} since={chairSince}><Prop file="loungeChair" height={0.95} /></PopIn>
        : <Prop file="chairDesk" height={0.95} tint="#8fd3c4" position={[0, 0, -0.15]} />}
      {chairSince != null && <PulseRing at={ringAt(CHAIR_AT)} radius={0.7} since={chairSince} />}
      {DESK_ORDER.filter(has).map((id) => {
        const t = since(id)
        return (
          <group key={id}>
            {DESK_PROPS[id].map(({ at, turn = 0, ...p }) => (
              <PopIn key={p.file} at={at} since={t}><Prop {...p} rotation={[0, turn, 0]} /></PopIn>
            ))}
            {t != null && <PulseRing at={ringAt(DESK_PROPS[id][0].at)} radius={0.42} since={t} />}
          </group>
        )
      })}
      {kid.me && spot?.character && <PulseRing at={[0, 0.03, -0.1]} radius={0.85} since={spot.since} />}
      {has('lamp') && <pointLight position={LAMP_LIGHT} color="#ffc56b" intensity={1.6} distance={2.2} decay={1.6} />}
      {!kid.away && (
        <group position={[0, 0, -0.1]}>
          <Suspense fallback={null}>
            <Character key={character} file={modelOf(character)} onClick={onSelect} />
          </Suspense>
        </group>
      )}
      {(selected || kid.me) && (
        <mesh position={[0, 0.02, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.6, 40]} />
          <meshBasicMaterial color={ACCENT} toneMapped={false} />
        </mesh>
      )}
      {kid.me && (
        <mesh ref={marker} position={[0, 1.85, -0.1]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.16, 0.3, 4]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  )
}

// The AI helper: the cubic robot by the board. It waves now and then.
function Robot({ onClick }: { onClick: () => void }) {
  // The first wave comes 2 s after the room shows, then every 6 s.
  const next = useRef(-1)
  const wave = () => {
    const t = performance.now() / 1000
    if (next.current < 0) next.current = t + 2
    if (t < next.current) return 0
    next.current = t + 6
    return 1
  }
  return (
    <group
      position={[2.5, 0, -2.6]}
      rotation={[0, -0.4, 0]}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <HelperBot height={1.45} faceCamera wave={wave} onClick={(e) => { e.stopPropagation(); onClick() }} />
    </group>
  )
}

function Room() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.2]} receiveShadow>
        <planeGeometry args={[9, 7.4]} />
        <meshStandardMaterial color={C.floor} roughness={1} />
      </mesh>
      <mesh position={[0, 1.6, -3.6]} receiveShadow><boxGeometry args={[9.2, 3.2, 0.2]} /><meshStandardMaterial color={C.wall} /></mesh>
      <mesh position={[-4.6, 1.6, 0.2]} receiveShadow><boxGeometry args={[0.2, 3.2, 7.6]} /><meshStandardMaterial color={C.wall} /></mesh>

      <Prop file="rugRectangle" width={5.2} tint="#cfeee6" position={[0, 0.005, 0.9]} />

      {/* board */}
      <RoundedBox args={[4, 1.8, 0.1]} radius={0.06} position={[0.3, 1.75, -3.45]}>
        <meshStandardMaterial color="#122a2e" roughness={0.6} />
      </RoundedBox>
      {([[-1.1, 0.5, 1.4, ACCENT_2], [-0.7, 0.2, 1.8, '#fbbf24'], [-0.7, -0.1, 1.2, '#ffffff'], [-1.1, -0.4, 1.0, ACCENT_2]] as const).map(([x, y, w, col], i) => (
        <mesh key={i} position={[0.3 + x + w / 2, 1.75 + y, -3.39]}>
          <planeGeometry args={[w, 0.1]} />
          <meshBasicMaterial color={col} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[1.5, 1.75, -3.39]}>
        <ringGeometry args={[0.3, 0.42, 32, 1, 0.4, Math.PI * 1.6]} />
        <meshBasicMaterial color={ACCENT} toneMapped={false} />
      </mesh>

      {/* window */}
      <group position={[-4.48, 1.8, -0.4]} rotation={[0, Math.PI / 2, 0]}>
        <RoundedBox args={[2.4, 1.5, 0.08]} radius={0.04}><meshStandardMaterial color="#ffffff" /></RoundedBox>
        <mesh position={[0, 0, 0.05]}><planeGeometry args={[2.2, 1.3]} /><meshBasicMaterial color={C.sky} toneMapped={false} /></mesh>
        <mesh position={[0, 0, 0.06]}><boxGeometry args={[0.06, 1.3, 0.02]} /><meshStandardMaterial color="#ffffff" /></mesh>
      </group>

      <Prop file="bookcaseOpen" height={1.9} position={[-3.3, 0, -3.15]} />
      <Prop file="books" height={0.25} position={[-3.3, 1.9, -3.15]} />
      <Prop file="pottedPlant" height={1.2} position={[-4.0, 0, 2.9]} />
      <Prop file="lampSquareFloor" height={1.7} position={[-4.0, 0, 1.6]} />
      <Prop file="plantSmall2" height={0.5} position={[4.0, 0, -3.1]} />
    </group>
  )
}

// Frames the desks, the board and the robot as large as the view allows; the far floor corners may crop.
// At this angle they span about VIEW_W x VIEW_H units on screen around the orbit target.
const VIEW_W = 8.5
const VIEW_H = 7.2
const TARGET: V3 = [0.47, 1.5, 0.26]

// Up close: the camera moves to the child's desk and zooms in, holds, then returns on a tap or after a while.
type Focus = { v: number; goal: 0 | 1; until: number; zoom: number }
const FOCUS_AT = new Vector3(SEATS[0][0], 0.95, SEATS[0][1] + 0.38)
const FOCUS_ZOOM = 2.1
const FOCUS_TIME = 0.55
const FOCUS_HOLD = 4.5
const HOME_AT = new Vector3(...TARGET)
const step = new Vector3()

// The camera: fits the room to the view and, when the room comes on screen with news at the child's desk,
// slides and zooms to the desk, holds, then returns on a tap or after a while. Moving the orbit target and the
// camera together keeps the angle. Times are taken in a frame, after the clock has caught up with a pause.
function CameraRig({ inset, ready, takeNews, onSpot }: { inset: number; ready: boolean; takeNews?: () => DeskNews | null; onSpot: (s: Spot) => void }) {
  const gl = useThree((s) => s.gl)
  const focus = useRef<Focus>({ v: 0, goal: 0, until: 0, zoom: 1 })
  const pending = useRef<DeskNews | null>(null)
  const release = () => { focus.current.goal = 0 }

  useEffect(() => {
    if (!takeNews) return
    const el = gl.domElement
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) pending.current = takeNews() ?? pending.current })
    io.observe(el)
    const onDown = () => { focus.current.goal = 0 }
    el.addEventListener('pointerdown', onDown)
    return () => { io.disconnect(); el.removeEventListener('pointerdown', onDown) }
  }, [gl, takeNews])

  useFrame(({ camera, size, clock, controls }, dt) => {
    const f = focus.current
    const now = clock.elapsedTime
    if (ready && pending.current) {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!still) Object.assign(f, { goal: 1, until: now + FOCUS_HOLD })
      onSpot({ ...pending.current, since: now + (still ? 0 : FOCUS_TIME * 0.8) })
      pending.current = null
    }
    if (f.goal === 1 && now > f.until) f.goal = 0
    const d = Math.min(dt, 0.05) / FOCUS_TIME
    f.v = f.goal ? Math.min(1, f.v + d) : Math.max(0, f.v - d)
    const e = f.v * f.v * (3 - 2 * f.v)
    f.zoom = 1 + (FOCUS_ZOOM - 1) * e
    const orbit = controls as unknown as { target: Vector3 } | null
    if (orbit) {
      step.copy(HOME_AT).lerp(FOCUS_AT, e).sub(orbit.target)
      if (step.lengthSq() > 1e-10) { orbit.target.add(step); camera.position.add(step) }
    }
    // Fit: the room as large as the view allows; moving the frustum up by half the inset centers it below the header.
    const cam = camera as OrthoCamera
    const zoom = Math.min(size.width / VIEW_W, (size.height - inset) / VIEW_H) * f.zoom
    const top = size.height / 2 + inset / 2 / zoom
    if (Math.abs(cam.zoom - zoom) > 0.01 || Math.abs(cam.top - top) > 0.001) {
      cam.zoom = zoom
      cam.top = top
      cam.bottom = top - size.height
      cam.updateProjectionMatrix()
    }
  })

  return (
    <OrbitControls
      makeDefault
      onStart={release}
      target={TARGET}
      enablePan={false}
      enableZoom={false}
      minPolarAngle={ISO_POLAR}
      maxPolarAngle={ISO_POLAR}
      minAzimuthAngle={0.05}
      maxAzimuthAngle={Math.PI / 2 - 0.05}
      enableDamping
    />
  )
}

// The room's contents; it mounts once its models are loaded, which ends the loading state.
function Scene({ selected, onSelect, spot, onReady }: Pick<Props, 'selected' | 'onSelect'> & { spot: Spot | null; onReady: () => void }) {
  const cast = castOf(useApp((s) => s.character))
  const desk = useApp((s) => s.desk)
  useEffect(onReady, [onReady])
  return (
    <>
      <Room />
      <Robot onClick={() => onSelect('robot')} />
      {KIDS.map((kid, i) => (
        <Seat key={kid.name} index={i} character={cast[i]} desk={desk} spot={spot} selected={selected === kid.name} onSelect={() => onSelect(kid.name)} />
      ))}
    </>
  )
}

export default function ClassRoom({ selected, onSelect, inset = 0, takeNews }: Props) {
  const { active, progress } = useProgress()
  const [ready, setReady] = useState(false)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [loaded, setLoaded] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  // The loading state fades out, then leaves.
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => setLoaded(true), 300)
    return () => clearTimeout(id)
  }, [ready])
  return (
    <>
      <Canvas shadows="percentage" dpr={[1, 2]} onPointerMissed={() => onSelect(null)}>
        <color attach="background" args={[C.bg]} />
        <OrthographicCamera makeDefault position={[12, 12, 12]} near={0.1} far={100} />
        <CameraRig inset={inset} ready={ready} takeNews={takeNews} onSpot={setSpot} />
        <PauseWhenHidden />
        <hemisphereLight args={['#ffffff', '#cfe7e0', 1.1]} />
        <directionalLight
          position={[5, 9, 6]}
          intensity={1.8}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-7}
          shadow-camera-right={7}
          shadow-camera-top={7}
          shadow-camera-bottom={-7}
          shadow-bias={-0.0005}
        />
        <Suspense fallback={null}>
          <Scene selected={selected} onSelect={onSelect} spot={spot} onReady={onReady} />
        </Suspense>
      </Canvas>
      {/* A percent only while models download; before and after that the line just runs. */}
      {!loaded && <RoomLoading inset={inset} progress={active ? progress : undefined} done={ready} />}
    </>
  )
}
