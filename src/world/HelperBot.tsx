import { useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'

// The AI helper as a small cubic robot, the same character as the helper mark in the app: a white head with a
// dark screen and two glowing eyes. It hovers instead of walking, blinks, looks around, leans into its motion,
// and squints happily while it waves. Built from rounded boxes, so it needs no model file.
// Drawn 1 unit tall; `height` scales it. `motion` is its current speed (units per second) for the lean.
// `wave` is polled every frame: 1 waves one arm, 2 raises both arms with a small hop.

// Brand blue and its deeper shade, the navy of the app. The eyes glow in a light brand cyan; the pink cheeks
// are the one color only the robot has, it makes the face read as friendly.
const SHELL = '#ffffff'
const BLUE = '#246fff'
const DEEP = '#1f66e5'
const SCREEN = '#0a1028'
const EYE = '#7ee8ff'
const CHEEK = '#ff9db8'

const WAVE_TIME = 1.5
const here = new Vector3()
// The shortest turn from angle a to angle b.
const turnTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const reduce = matchMedia('(prefers-reduced-motion: reduce)')

type Props = {
  height?: number
  motion?: () => number
  wave?: () => number
  onClick?: (e: ThreeEvent<MouseEvent>) => void
  children?: ReactNode
  // Stopped or waving, the robot turns its face to the camera.
  faceCamera?: boolean
}

export function HelperBot({ height = 1, motion, wave, onClick, faceCamera }: Props) {
  const root = useRef<Group>(null)
  const turn = useRef<Group>(null)
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const antenna = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const eyes = useRef<Group>(null)
  const happy = useRef<Group>(null)
  const shadow = useRef<Mesh>(null)
  const shadowMat = useRef<MeshBasicMaterial>(null)
  // Motion state kept between frames, so nothing is allocated per frame.
  const s = useRef({ lean: 0, spring: 0, springV: 0, blinkAt: 2, wave: 0, kind: 0, seed: -1, still: 0 })

  useFrame(({ clock, camera }, delta) => {
    const dt = Math.min(delta, 0.05)
    const st = s.current
    // Each robot gets its own phase, so two robots never bob in step.
    if (st.seed < 0) st.seed = Math.random() * 10
    const t = clock.elapsedTime + st.seed
    const calm = reduce.matches
    const speed = motion?.() ?? 0

    const w = wave?.() ?? 0
    if (w) { st.wave = WAVE_TIME; st.kind = w }
    st.wave = Math.max(0, st.wave - dt)
    const waving = st.wave > 0
    const k = waving ? 1 - st.wave / WAVE_TIME : 0

    // Stopped for a moment or waving: turn to the camera; moving: face the way it goes.
    st.still = speed < 0.15 ? st.still + dt : 0
    if (turn.current && root.current) {
      let goal = 0
      if (faceCamera && st.still > (waving ? 0 : 0.6)) {
        const parentYaw = root.current.parent?.rotation.y ?? 0
        root.current.getWorldPosition(here)
        const yaw = Math.atan2(camera.position.x - here.x, camera.position.z - here.z)
        goal = turnTo(parentYaw, yaw)
      }
      turn.current.rotation.y += turnTo(turn.current.rotation.y, goal) * Math.min(1, dt * 5)
    }

    // Lean into the motion, with a spring on the antenna that lags behind.
    const leanTo = calm ? 0 : Math.min(0.28, speed * 0.07)
    const prev = st.lean
    st.lean += (leanTo - st.lean) * Math.min(1, dt * 6)
    st.springV += (-(st.lean - prev) / Math.max(dt, 1e-3) * 0.6 - st.spring * 60) * dt
    st.springV *= Math.exp(-6 * dt)
    st.spring = calm ? 0 : st.spring + st.springV * dt

    // Hover: a slow bob when idle, quicker while moving; a hop for the double wave.
    const move = waving && !calm
    const hop = move && st.kind === 2 ? Math.sin(Math.min(1, k * 2.2) * Math.PI) * 0.12 : 0
    const bob = calm ? 0 : Math.sin(t * (speed > 0.3 ? 5 : 2.2)) * 0.03
    if (body.current) {
      body.current.position.y = 0.06 + bob + hop
      body.current.rotation.x = st.lean
      body.current.rotation.z = calm ? 0 : Math.sin(t * 1.3) * 0.03
    }
    if (shadow.current && shadowMat.current) {
      const lift = bob + hop
      shadow.current.scale.setScalar(1 - lift * 1.5)
      shadowMat.current.opacity = 0.18 - lift * 0.5
    }
    if (head.current) {
      head.current.rotation.y = calm ? 0 : Math.sin(t * 0.7) * 0.25 + (waving ? Math.sin(k * Math.PI) * 0.15 : 0)
      head.current.rotation.z = move ? Math.sin(k * Math.PI * 2) * 0.08 : 0
    }
    if (antenna.current) antenna.current.rotation.x = st.spring + (calm ? 0 : Math.sin(t * 3.1) * 0.05)

    // Arms: a small swing; one arm waves, or both go up.
    const swing = calm ? 0 : Math.sin(t * (speed > 0.3 ? 8 : 2)) * (speed > 0.3 ? 0.35 : 0.08)
    // Raised, the arm points up and out beside the head (about 115 degrees), so the wave reads from afar.
    const up = move ? Math.sin(Math.min(1, k * 3) * Math.PI / 2) * Math.min(1, st.wave * 3) : 0
    if (armR.current) {
      armR.current.rotation.x = move ? 0 : swing
      armR.current.rotation.z = up * (2 + (st.kind === 1 ? Math.sin(t * 12) * 0.3 : 0))
    }
    if (armL.current) {
      armL.current.rotation.x = move && st.kind === 2 ? 0 : -swing
      armL.current.rotation.z = st.kind === 2 ? -up * 2 : 0
    }

    // Eyes: blink now and then; happy arcs while waving.
    if (t > st.blinkAt) st.blinkAt = t + 2.5 + Math.random() * 3
    const b = st.blinkAt - t
    const open = b < 0.12 ? Math.abs(b - 0.06) / 0.06 : 1
    if (eyes.current) { eyes.current.visible = !waving; eyes.current.scale.y = Math.max(0.1, open) }
    if (happy.current) happy.current.visible = waving
  })

  return (
    <group ref={root} scale={height} onClick={onClick}>
      {/* Above the island's plaza and road surfaces, which rise up to 0.02 above the ground. */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.26, 24]} />
        <meshBasicMaterial ref={shadowMat} color="#0a1028" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <group ref={turn}>
      <group ref={body}>
        {/* Body with a chest light */}
        <RoundedBox args={[0.36, 0.3, 0.3]} radius={0.08} position={[0, 0.3, 0]} castShadow>
          <meshStandardMaterial color={BLUE} roughness={0.45} />
        </RoundedBox>
        <mesh position={[0, 0.31, 0.152]}>
          <circleGeometry args={[0.035, 20]} />
          <meshBasicMaterial color={EYE} toneMapped={false} />
        </mesh>
        {/* Arms hang from the shoulders */}
        <group ref={armR} position={[0.24, 0.4, 0]}>
          <RoundedBox args={[0.08, 0.2, 0.1]} radius={0.035} position={[0, -0.09, 0]} castShadow>
            <meshStandardMaterial color={DEEP} roughness={0.45} />
          </RoundedBox>
        </group>
        <group ref={armL} position={[-0.24, 0.4, 0]}>
          <RoundedBox args={[0.08, 0.2, 0.1]} radius={0.035} position={[0, -0.09, 0]} castShadow>
            <meshStandardMaterial color={DEEP} roughness={0.45} />
          </RoundedBox>
        </group>
        {/* The big head: the screen face, eyes, cheeks, ear bolts and the antenna */}
        <group ref={head} position={[0, 0.66, 0]}>
          <RoundedBox args={[0.62, 0.5, 0.5]} radius={0.14} smoothness={5} castShadow>
            <meshStandardMaterial color={SHELL} roughness={0.35} />
          </RoundedBox>
          <RoundedBox args={[0.46, 0.32, 0.06]} radius={0.03} position={[0, 0.01, 0.23]}>
            <meshStandardMaterial color={SCREEN} roughness={0.25} metalness={0.1} />
          </RoundedBox>
          <group ref={eyes} position={[0, 0.02, 0.265]}>
            {[-0.11, 0.11].map((x) => (
              <RoundedBox key={x} args={[0.075, 0.13, 0.01]} radius={0.0045} position={[x, 0, 0]}>
                <meshBasicMaterial color={EYE} toneMapped={false} />
              </RoundedBox>
            ))}
          </group>
          <group ref={happy} position={[0, 0.0, 0.265]} visible={false}>
            {[-0.11, 0.11].map((x) => (
              <mesh key={x} position={[x, 0, 0]}>
                <torusGeometry args={[0.045, 0.014, 8, 20, Math.PI]} />
                <meshBasicMaterial color={EYE} toneMapped={false} />
              </mesh>
            ))}
          </group>
          {[-0.19, 0.19].map((x) => (
            <mesh key={x} position={[x, -0.1, 0.263]}>
              <circleGeometry args={[0.032, 20]} />
              <meshBasicMaterial color={CHEEK} transparent opacity={0.85} toneMapped={false} />
            </mesh>
          ))}
          {[-0.32, 0.32].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 0.05, 20]} />
              <meshStandardMaterial color={BLUE} roughness={0.45} />
            </mesh>
          ))}
          <group ref={antenna} position={[0, 0.25, 0]}>
            <mesh position={[0, 0.06, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.12, 8]} />
              <meshStandardMaterial color={DEEP} />
            </mesh>
            <mesh position={[0, 0.14, 0]} castShadow>
              <sphereGeometry args={[0.045, 16, 12]} />
              <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={0.5} />
            </mesh>
          </group>
        </group>
      </group>
      </group>
    </group>
  )
}
