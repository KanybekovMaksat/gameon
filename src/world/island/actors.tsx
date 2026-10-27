import { useEffect, useMemo, useRef } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import { Box3, Vector3, type Group, type Mesh, type Object3D } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { EMOTES, LOCO, type Rig } from './rig'
import { BLUE } from './textures'

// The child and the groupmates: Kenney Mini characters with idle, walk and sprint blended by speed.

const CHAR_H = 1.05

function useCharacter(file: string) {
  const { scene, animations } = useGLTF(file)
  const obj = useMemo(() => {
    const c = cloneSkinned(scene)
    c.updateMatrixWorld(true)
    const h = new Box3().setFromObject(c, true).getSize(new Vector3()).y
    c.scale.setScalar(CHAR_H / h)
    c.traverse((o) => { if ((o as Mesh).isMesh) o.castShadow = true })
    return c
  }, [scene])
  return { obj, animations }
}

function useRig(obj: Object3D, animations: Parameters<typeof useAnimations>[0], onRig: (r: Rig | null) => void) {
  const group = useRef<Group>(null)
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    for (const n of LOCO) {
      const act = actions[n]
      act?.reset().play()
      act?.setEffectiveWeight(n === 'idle' ? 1 : 0)
    }
    for (const n of EMOTES) actions[n]?.setEffectiveWeight(0)
    if (group.current) onRig({ group: group.current, actions })
    return () => {
      for (const n of LOCO) actions[n]?.stop()
      onRig(null)
    }
  }, [actions, onRig, obj])
  return group
}

// The child. A thin blue ring on the ground marks them among the group, as in the class room.
export function Player({ file, onRig }: { file: string; onRig: (r: Rig | null) => void }) {
  const { obj, animations } = useCharacter(file)
  const group = useRig(obj, animations, onRig)
  return (
    <group ref={group}>
      <primitive object={obj} />
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.44, 40]} />
        <meshBasicMaterial color={BLUE} toneMapped={false} transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  )
}

// A groupmate. The name tag is a label in the HUD, at a fixed size.
export function Mate({ file, onRig }: { file: string; onRig: (r: Rig | null) => void }) {
  const { obj, animations } = useCharacter(file)
  const group = useRig(obj, animations, onRig)
  return (
    <group ref={group}>
      <primitive object={obj} />
    </group>
  )
}

