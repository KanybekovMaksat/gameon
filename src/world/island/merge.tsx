import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, type Group, type Material, type MeshBasicMaterial, type MeshStandardMaterial, type Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Static parts of a building or a sign drawn as one mesh per look: the child meshes stay in the tree (React owns
// them) but are hidden, and a merged copy per material draws them. A child group marked `userData.dynamic` (a
// turning coin, a door) keeps drawing on its own. `version` redoes the merge when what is drawn changes.

function lookOf(m: Material) {
  const s = m as MeshStandardMaterial & MeshBasicMaterial
  return [
    m.type, s.color?.getHexString(), s.emissive?.getHexString(), s.emissiveIntensity, s.map?.uuid, m.transparent, m.opacity,
    s.roughness, s.metalness, m.side, m.toneMapped, m.depthWrite, s.flatShading,
  ].join('|')
}

function isDynamic(o: Object3D, root: Object3D) {
  for (let p: Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true
  return false
}

export function Merged({ children, version }: { children: ReactNode; version?: unknown }) {
  const ref = useRef<Group>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    root.updateMatrixWorld(true)
    const inv = new Matrix4().copy(root.matrixWorld).invert()
    const groups = new Map<string, { mat: Material; geos: BufferGeometry[]; cast: boolean; receive: boolean; order: number; src: Mesh[] }>()
    root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh || !m.visible || (m as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh || isDynamic(m, root)) return
      const mat = m.material as Material
      if (Array.isArray(mat)) return
      const key = lookOf(mat) + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '') + m.renderOrder
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a)
      if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      if (!g.attributes.normal) g.computeVertexNormals()
      g.applyMatrix4(new Matrix4().multiplyMatrices(inv, m.matrixWorld))
      const e = groups.get(key) ?? { mat, geos: [], cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder, src: [] }
      e.geos.push(g)
      e.src.push(m)
      groups.set(key, e)
    })
    const made: Mesh[] = []
    const hidden: Mesh[] = []
    for (const e of groups.values()) {
      // A look used once is already one draw call.
      if (e.geos.length < 2) { e.geos.forEach((g) => g.dispose()); continue }
      const geometry = mergeGeometries(e.geos, false)
      e.geos.forEach((g) => g.dispose())
      if (!geometry) continue
      const mesh = new Mesh(geometry, e.mat)
      mesh.castShadow = e.cast
      mesh.receiveShadow = e.receive
      mesh.renderOrder = e.order
      root.add(mesh)
      made.push(mesh)
      for (const s of e.src) { s.visible = false; hidden.push(s) }
    }
    return () => {
      for (const m of made) { root.remove(m); m.geometry.dispose() }
      for (const s of hidden) s.visible = true
    }
  }, [version])
  return <group ref={ref}>{children}</group>
}
