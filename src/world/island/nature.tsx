import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  BackSide, Box3, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Matrix4,
  MeshStandardMaterial, Quaternion, RepeatWrapping, SRGBColorSpace, ShaderMaterial, Vector3, type Material, type Mesh, type Object3D,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GRASS_U, PLAZA, RIM_GLSL, ROAD, ROAD_STEP, ROAD_W, STRETCH, WATER_Y, groundY, rimAt, roadAt, type P } from './layout'
import { clock, reduced, seeThrough } from './uniforms'
import { CREEK, CREEK_W } from './plan'
import { EXTRAS, FLOWERS, PALMS, PLANTS, ROCKS, SPURS, TREES, TUFTS, WATER_PLANTS, BUSHES } from './scatter'

// The ground, the water and everything that grows. Repeated models are merged into one mesh per material,
// so the whole island's nature costs a dozen draw calls.

const NATURE = '/models/kenney-nature/'
const KINDS = [...TREES, ...PALMS, ...BUSHES, ...FLOWERS, ...TUFTS, ...ROCKS, ...WATER_PLANTS, ...EXTRAS]
for (const k of KINDS) useGLTF.preload(NATURE + k + '.glb')

// Colors of the Nature Kit materials, redone for a light, calm island. Leaves get a small shift per plant.
const PAINT: Record<string, string> = {
  leafsGreen: '#8fcb74', leafsDark: '#6fb468', grass: '#98cf7c', woodBark: '#b88a66', woodBarkDark: '#a07558', woodInner: '#efdcc2',
  dirt: '#ddd4c4', stone: '#d6dae0', stoneDark: '#b9bfc8', colorYellow: '#ffd35a', colorPurple: '#b8a8f2', colorRed: '#ffffff',
  colorTan: '#f0c79a', wood: '#d9a77c', woodDark: '#b88760', leafsFall: '#f2b36b', _defaultMat: '#f4f1ea',
}
const SWAY = new Set(['leafsGreen', 'leafsDark', 'grass'])

// Heights the models are scaled to, in child heights.
function targetHeight(kind: string) {
  if (kind === 'tree_pineRoundA') return 3.8
  if (kind === 'tree_small') return 2.3
  if (TREES.includes(kind)) return 3.2
  if (PALMS.includes(kind)) return 3.9
  if (BUSHES.includes(kind)) return kind === 'plant_bushLarge' ? 1 : 0.75
  if (FLOWERS.includes(kind)) return 0.5
  if (TUFTS.includes(kind)) return 0.4
  if (kind === 'rock_largeA' || kind === 'rock_largeC') return 0.6
  if (ROCKS.includes(kind)) return 0.32
  if (WATER_PLANTS.includes(kind)) return 0.08
  if (kind === 'mushroom_tanGroup') return 0.4
  if (kind === 'stump_round') return 0.45
  if (kind === 'log') return 0.42
  return 1
}


function natureMaterial(color: string, sway: boolean) {
  const m = new MeshStandardMaterial({ color, roughness: 0.92, flatShading: true, vertexColors: true })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock
    shader.uniforms.uEye = seeThrough.eye
    shader.uniforms.uFocus = seeThrough.focus
    shader.vertexShader = 'uniform float uTime;\nvarying vec3 vWorld;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      ${sway ? `float sway = smoothstep(0.35, 3.2, position.y);
      transformed.x += sin(uTime * 1.6 + position.x * 0.55 + position.z * 0.35) * 0.06 * sway;
      transformed.z += cos(uTime * 1.3 + position.x * 0.3 - position.z * 0.5) * 0.04 * sway;` : ''}
      vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    )
    shader.fragmentShader = 'uniform vec3 uEye;\nuniform vec3 uFocus;\nvarying vec3 vWorld;\n' + shader.fragmentShader.replace(
      'void main() {',
      `void main() {
      vec3 seg = uFocus - uEye;
      float t = dot(vWorld - uEye, seg) / dot(seg, seg);
      if (t > 0.0 && t < 0.96) {
        float d = length(vWorld - (uEye + seg * t));
        float fade = 1.0 - smoothstep(0.9, 1.9, d);
        vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
        float b = mod(q.x * 3.0 + q.y * 2.0 + q.x * q.y, 4.0) / 4.0 + mod(q.y, 2.0) * 0.125;
        if (fade * 0.8 > b) discard;
      }`,
    )
  }
  m.customProgramCacheKey = () => (sway ? 'nature-sway' : 'nature')
  return m
}

type Batch = { geometry: BufferGeometry; material: Material; cast: boolean }

function useNatureBatches(): Batch[] {
  const gltfs = useGLTF(KINDS.map((k) => NATURE + k + '.glb'))
  return useMemo(() => {
    const byKind = new Map<string, { scene: Object3D; scale: number; minY: number }>()
    KINDS.forEach((k, i) => {
      const scene = gltfs[i].scene
      scene.updateMatrixWorld(true)
      const box = new Box3().setFromObject(scene)
      const h = box.max.y - box.min.y || 1
      byKind.set(k, { scene, scale: targetHeight(k) / h, minY: box.min.y })
    })
    const groups = new Map<string, { list: BufferGeometry[]; cast: boolean }>()
    const m = new Matrix4()
    const q = new Quaternion()
    const up = new Vector3(0, 1, 0)
    const tint = new Color()
    for (const p of PLANTS) {
      const src = byKind.get(p.kind)
      if (!src) continue
      const s = src.scale * p.scale
      const low = FLOWERS.includes(p.kind) || TUFTS.includes(p.kind) || WATER_PLANTS.includes(p.kind)
      const u = Math.hypot(p.x, p.z / STRETCH) / rimAt(Math.atan2(p.z / STRETCH, p.x))
      const y = (p.y ?? 0) + (WATER_PLANTS.includes(p.kind) ? WATER_Y + 0.01 : groundY(u) - src.minY * s - 0.02)
      m.compose(new Vector3(p.x, y, p.z), q.setFromAxisAngle(up, p.rot), new Vector3(s, s, s))
      src.scene.traverse((o) => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        const matName = (mesh.material as Material).name
        const g = mesh.geometry.clone()
        for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a)
        g.applyMatrix4(new Matrix4().multiplyMatrices(m, mesh.matrixWorld))
        // Each plant's leaves are a little lighter or darker, warmer or cooler.
        if (SWAY.has(matName)) tint.setHSL(0.02 * (p.tint - 0.5), 0.1, 1 - 0.14 * p.tint)
        else tint.setRGB(1, 1, 1)
        const n = g.attributes.position.count
        const col = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b }
        g.setAttribute('color', new BufferAttribute(col, 3))
        const key = matName + (low ? ':low' : '')
        const entry = groups.get(key) ?? { list: [], cast: !low }
        entry.list.push(g)
        groups.set(key, entry)
      })
    }
    const out: Batch[] = []
    for (const [key, { list, cast }] of groups) {
      const name = key.split(':')[0]
      const geometry = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      if (!geometry) continue
      const color = PAINT[name] ?? '#dddddd'
      const material = natureMaterial(color, SWAY.has(name))
      out.push({ geometry, material, cast })
    }
    return out
  }, [gltfs])
}

export function Nature() {
  const batches = useNatureBatches()
  useEffect(() => () => batches.forEach((b) => { b.geometry.dispose(); b.material.dispose() }), [batches])
  return (
    <group>
      {batches.map((b, i) => (
        <mesh key={i} geometry={b.geometry} material={b.material} castShadow={b.cast} receiveShadow />
      ))}
    </group>
  )
}

// The ground: grass in the middle, a sand beach, and a slope into the water. Vertex colors, flat shaded.
function terrainGeometry() {
  const SEG = 160
  const RINGS = [0, 0.12, 0.24, 0.36, 0.47, 0.57, 0.66, 0.74, 0.8, 0.85, 0.88, GRASS_U, 0.915, 0.94, 0.965, 1, 1.05, 1.12]
  const pos: number[] = []
  const col: number[] = []
  const grass = new Color('#c3e1a3'), grass2 = new Color('#b3d894'), edge = new Color('#cfe6ae')
  const sand = new Color('#f4e6c8'), wet = new Color('#e6d3ac'), deep = new Color('#d4c49c')
  const c = new Color()
  const vtx = (ri: number, si: number) => {
    const u = RINGS[ri]
    const th = (si / SEG) * Math.PI * 2
    const r = rimAt(th) * u
    const x = Math.cos(th) * r, z = Math.sin(th) * r * STRETCH
    // A little wobble in the ring keeps the flat shading from looking like a dartboard.
    // The last column repeats the first (si % SEG), so the ring closes without a crack.
    const j = ri > 0 && ri < RINGS.length - 1 ? Math.sin((si % SEG) * 12.9898 + ri * 78.233) * 0.18 : 0
    return { x: x + j, y: groundY(u), z: z - j * 0.7, u }
  }
  const colorAt = (x: number, z: number, u: number) => {
    if (u < GRASS_U - 0.01) {
      const n = 0.5 + 0.5 * Math.sin(x * 0.35 + Math.cos(z * 0.27) * 2) * Math.cos(z * 0.31 - x * 0.12)
      c.copy(grass).lerp(grass2, n * 0.8)
      if (u > GRASS_U - 0.06) c.lerp(edge, (u - (GRASS_U - 0.06)) / 0.05)
    } else if (u < 0.96) c.copy(sand)
    else if (u < 1.01) c.copy(wet)
    else c.copy(deep)
    return c
  }
  for (let ri = 0; ri < RINGS.length - 1; ri++) {
    for (let si = 0; si < SEG; si++) {
      const a = vtx(ri, si), b = vtx(ri, si + 1), d = vtx(ri + 1, si), e = vtx(ri + 1, si + 1)
      const tris = ri === 0 ? [[a, e, d]] : [[a, e, d], [a, b, e]]
      for (const t of tris) {
        const cx = (t[0].x + t[1].x + t[2].x) / 3, cz = (t[0].z + t[1].z + t[2].z) / 3, cu = (t[0].u + t[1].u + t[2].u) / 3
        const k = colorAt(cx, cz, cu)
        for (const v of t) { pos.push(v.x, v.y, v.z); col.push(k.r, k.g, k.b) }
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

export function Terrain() {
  const geometry = useMemo(() => terrainGeometry(), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  )
}

// Light paving: pale stones in a running bond, drawn once on a canvas and repeated along the road.
function paving(kind: 'road' | 'plaza') {
  const S = 512
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#ede7da'
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = '#dcd3c2'
  ctx.lineWidth = 5
  if (kind === 'road') {
    const rows = 6, h = S / rows
    for (let r = 0; r < rows; r++) {
      const w = S / 3
      const off = r % 2 ? w / 2 : 0
      for (let x = -w; x < S + w; x += w) {
        ctx.fillStyle = (r * 7 + Math.round(x)) % 3 === 0 ? '#f1ece1' : '#ece5d7'
        ctx.fillRect(x + off + 3, r * h + 3, w - 6, h - 6)
      }
      ctx.beginPath(); ctx.moveTo(0, r * h); ctx.lineTo(S, r * h); ctx.stroke()
    }
  } else {
    // Rings and spokes around the fountain.
    const cx = S / 2
    for (let r = 40; r < S * 0.72; r += 38) {
      ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.stroke()
      const n = Math.round((r * Math.PI * 2) / 60)
      for (let i = 0; i < n; i++) {
        const a = (i + (r / 38) * 0.5) * ((Math.PI * 2) / n)
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r); ctx.lineTo(cx + Math.cos(a) * (r + 38), cx + Math.sin(a) * (r + 38)); ctx.stroke()
      }
    }
  }
  const t = new CanvasTexture(cv)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  return t
}

// The road: a ribbon along the polyline with stone curbs.
function roadGeometry(width: number, y: number, vScale: number, offset = 0) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  ROAD.forEach((_, i) => {
    const p = roadAt(i * ROAD_STEP)
    const l = offset - width / 2, r = offset + width / 2
    pos.push(p.x + p.nx * l, y, p.z + p.nz * l, p.x + p.nx * r, y, p.z + p.nz * r)
    uv.push(0, (i * ROAD_STEP) / vScale, 1, (i * ROAD_STEP) / vScale)
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function Road() {
  const { road, curbL, curbR, tex, plaza, plazaTex, spurs } = useMemo(() => {
    const tex = paving('road')
    tex.repeat.set(1, 1)
    return {
      road: roadGeometry(ROAD_W, 0.014, ROAD_W),
      curbL: roadGeometry(0.16, 0.03, 1, -ROAD_W / 2 - 0.04),
      curbR: roadGeometry(0.16, 0.03, 1, ROAD_W / 2 + 0.04),
      tex,
      plaza: new CircleGeometry(PLAZA.r, 72).rotateX(-Math.PI / 2),
      plazaTex: paving('plaza'),
      // Short paths from the road to each landmark.
      spurs: mergeGeometries(SPURS.map((l) => ribbon(l, 1.0, 0.012)), false),
    }
  }, [])
  useEffect(() => () => {
    for (const g of [road, curbL, curbR, plaza, spurs]) g?.dispose()
    tex.dispose()
    plazaTex.dispose()
  }, [road, curbL, curbR, tex, plaza, plazaTex, spurs])
  return (
    <group>
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial map={tex} roughness={1} />
      </mesh>
      {spurs && (
        <mesh geometry={spurs} receiveShadow>
          <meshStandardMaterial map={tex} roughness={1} />
        </mesh>
      )}
      <mesh geometry={curbL} receiveShadow><meshStandardMaterial color="#d8cfbe" roughness={1} /></mesh>
      <mesh geometry={curbR} receiveShadow><meshStandardMaterial color="#d8cfbe" roughness={1} /></mesh>
      <mesh geometry={plaza} position={[PLAZA.x, 0.02, PLAZA.z]} receiveShadow>
        <meshStandardMaterial map={plazaTex} roughness={1} />
      </mesh>
      <mesh position={[PLAZA.x, 0.012, PLAZA.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[PLAZA.r - 0.02, PLAZA.r + 0.22, 72]} />
        <meshStandardMaterial color="#d8cfbe" roughness={1} side={DoubleSide} />
      </mesh>
    </group>
  )
}

// Water: shallow turquoise at the beach, deeper blue further out, a breathing foam line and slow rings.
const WATER_VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPos = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uFar;
uniform float uShore;
varying vec3 vPos;
float rim(float th) { return ${RIM_GLSL}; }
void main() {
  vec2 q = vec2(vPos.x, vPos.z / ${STRETCH.toFixed(3)});
  float th = atan(q.y, q.x);
  float R = rim(th);
  float d = (length(q) - R * uShore);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 9.0, d));
  float foam = smoothstep(0.9, 0.0, d) * (0.6 + 0.25 * sin(uTime * 1.2 + th * 11.0));
  float ring = 1.0 - smoothstep(0.0, 0.07, abs(fract(d * 0.28 - uTime * 0.09) - 0.5) - 0.43);
  ring *= smoothstep(10.0, 1.5, d) * smoothstep(0.3, 1.2, d) * 0.22;
  col = mix(col, uFoam, clamp(foam + ring, 0.0, 1.0));
  col = mix(col, uFar, smoothstep(50.0, 230.0, length(vPos.xz)));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

// Far away the sea melts into the haze at the horizon.
export const HORIZON = '#dcf0f6'
const ZENITH = '#8ccbe8'

export function Water() {
  const mat = useMemo(() => new ShaderMaterial({
    uniforms: {
      uTime: clock,
      uShallow: { value: new Color('#a9e6ee') },
      uDeep: { value: new Color('#79c9e2') },
      uFoam: { value: new Color('#ffffff') },
      uFar: { value: new Color(HORIZON) },
      uShore: { value: 0.9 + 0.1 * (WATER_Y / -0.16) },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  }), [])
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh position={[0, WATER_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <circleGeometry args={[380, 96]} />
    </mesh>
  )
}

// Soft low-poly clouds drifting around the island below the camera, and a few gulls circling over the sea.
function cloudGeometry(seed: number) {
  const parts: BufferGeometry[] = []
  const n = 4 + (seed % 3)
  for (let i = 0; i < n; i++) {
    const r = 0.9 + ((seed * 7 + i * 13) % 10) / 10
    parts.push(icosa(r).translate(i * 1.1 - n * 0.55, ((i * 5) % 3) * 0.2, ((i * 3) % 2) * 0.5))
  }
  const merged = mergeGeometries(parts, false)!
  parts.forEach((p) => p.dispose())
  merged.scale(1, 0.62, 1)
  return merged
}

function icosa(r: number) {
  // A low-poly ball: an icosahedron without its own class import cost.
  const t = (1 + Math.sqrt(5)) / 2
  const v = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1]
  const f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1]
  const pos: number[] = []
  for (const i of f) {
    const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2]
    const l = Math.hypot(x, y, z)
    pos.push((x / l) * r, (y / l) * r, (z / l) * r)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

const CLOUDS = [
  { a: 0.3, r: 34, y: 6.5, s: 1.6 }, { a: 1.5, r: 40, y: 7.5, s: 2 }, { a: 2.4, r: 31, y: 6, s: 1.3 },
  { a: 3.5, r: 38, y: 8, s: 1.8 }, { a: 4.6, r: 33, y: 6.8, s: 1.5 }, { a: 5.5, r: 42, y: 7, s: 2.2 },
]

export function Sky() {
  const clouds = useMemo(() => CLOUDS.map((c, i) => ({ ...c, geo: cloudGeometry(i + 3) })), [])
  useEffect(() => () => clouds.forEach((c) => c.geo.dispose()), [clouds])
  const group = useRef<Group>(null)
  const gulls = useRef<Group>(null)
  const wing = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.12, 0.55, 0.05, 0], 3))
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(() => () => wing.dispose(), [wing])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (group.current) group.current.rotation.y = reduced.value ? 0 : t * 0.006
    const g = gulls.current
    if (!g) return
    g.visible = !reduced.value
    g.children.forEach((bird, i) => {
      // Over the sea around the island, low: seen in the fly-over and from the shore, never close to the camera.
      const a = t * 0.08 + i * 0.35
      const r = 33 + (i % 3) * 1.5
      bird.position.set(Math.cos(a) * r, 4.5 + Math.sin(t * 0.7 + i) * 0.3 + (i % 2) * 0.6, Math.sin(a) * r * 1.2)
      bird.rotation.y = -a
      const flap = Math.sin(t * 7 + i * 1.3) * 0.5
      bird.children[0].rotation.z = flap
      bird.children[1].rotation.z = -flap
    })
  })
  return (
    <>
      <group ref={group}>
        {clouds.map((c, i) => (
          <mesh key={i} geometry={c.geo} position={[Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r * 1.15]} scale={c.s}>
            <meshStandardMaterial color="#ffffff" roughness={1} emissive="#ffffff" emissiveIntensity={0.25} />
          </mesh>
        ))}
      </group>
      <group ref={gulls}>
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={i}>
            <mesh geometry={wing}><meshBasicMaterial color="#ffffff" side={DoubleSide} toneMapped={false} /></mesh>
            <mesh geometry={wing} scale={[-1, 1, 1]}><meshBasicMaterial color="#ffffff" side={DoubleSide} toneMapped={false} /></mesh>
          </group>
        ))}
      </group>
    </>
  )
}

// The sky: a dome with haze at the horizon and clear blue above, seen in the fly-over and at the top of the frame.
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`
const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export function SkyDome() {
  const mat = useMemo(() => new ShaderMaterial({
    uniforms: { uHorizon: { value: new Color(HORIZON) }, uZenith: { value: new Color(ZENITH) } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
  }), [])
  useEffect(() => () => mat.dispose(), [mat])
  const dome = useRef<Mesh>(null)
  // The dome follows the camera, so it is always at the horizon.
  useFrame(({ camera }) => { dome.current?.position.copy(camera.position) })
  return (
    <mesh ref={dome} material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[300, 32, 16]} />
    </mesh>
  )
}

// The creek: water that flows from the middle of the island to both shores, with light sand banks.
const CREEK_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const CREEK_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uEdge;
uniform vec3 uFoam;
varying vec2 vUv;
void main() {
  float edge = abs(vUv.x - 0.5) * 2.0;
  vec3 col = mix(uDeep, uEdge, smoothstep(0.35, 1.0, edge));
  float ripple = smoothstep(0.93, 1.0, sin(vUv.y * 2.2 - uTime * 1.6 + sin(vUv.x * 9.0) * 0.6));
  col = mix(col, uFoam, ripple * 0.35 * (1.0 - edge));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

function ribbon(line: P[], width: number, y: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  let s = 0
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)]
    const dx = b.x - a.x, dz = b.z - a.z
    const l = Math.hypot(dx, dz) || 1
    const nx = dz / l, nz = -dx / l
    if (i > 0) s += Math.hypot(p.x - line[i - 1].x, p.z - line[i - 1].z)
    pos.push(p.x + nx * width / 2, y, p.z + nz * width / 2, p.x - nx * width / 2, y, p.z - nz * width / 2)
    uv.push(0, s, 1, s)
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3) }
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// A smooth line through the creek's points, sampled every half unit.
function smoothLine(pts: P[]) {
  const out: P[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / 0.5))
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      })
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

export function Creek() {
  const { water, banks, mat } = useMemo(() => {
    const lines = CREEK.map(smoothLine)
    return {
      water: lines.map((l) => ribbon(l, CREEK_W * 2, 0.006)),
      banks: lines.map((l) => ribbon(l, CREEK_W * 2 + 0.7, 0.004)),
      mat: new ShaderMaterial({
        uniforms: { uTime: clock, uDeep: { value: new Color('#7fcbe3') }, uEdge: { value: new Color('#b6e6f0') }, uFoam: { value: new Color('#ffffff') } },
        vertexShader: CREEK_VERT,
        fragmentShader: CREEK_FRAG,
      }),
    }
  }, [])
  useEffect(() => () => { mat.dispose(); water.forEach((g) => g.dispose()); banks.forEach((g) => g.dispose()) }, [mat, water, banks])
  return (
    <group>
      {banks.map((g, i) => (
        <mesh key={'b' + i} geometry={g} receiveShadow>
          <meshStandardMaterial color="#efe3c4" roughness={1} />
        </mesh>
      ))}
      {water.map((g, i) => <mesh key={'w' + i} geometry={g} material={mat} />)}
    </group>
  )
}
