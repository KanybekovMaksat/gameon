import {
  GRASS_U, KIOSK, LIGHTHOUSE, OFFICE, PLAZA, QUEST, ROAD_END, ROAD_W, SCHOOL, distToLine, distToRoad, islandU, nearestOnRoad, rectDist,
  rectOf, rng, roadAt, toU, type Circle, type P, type Rect,
} from './layout'
import { CREEK, CREEK_W, GATES, PADS, STATIONS } from './plan'

// Where the trees, bushes, flowers and stones grow, and the small things that make the island a place: paths to
// the landmarks, flower beds and benches. Seeded, so the island is the same on every load.
// Kinds name the Nature Kit models; `r` is the trunk radius the child bumps into (0 walks through).
type Plant = P & { kind: string; scale: number; rot: number; tint: number; r: number; y?: number }

export const PALMS = ['tree_palmTall', 'tree_palmBend', 'tree_palm']
export const TREES = ['tree_default', 'tree_oak', 'tree_fat', 'tree_cone', 'tree_small', 'tree_pineRoundA']
export const BUSHES = ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed']
export const FLOWERS = ['flower_yellowA', 'flower_purpleA', 'flower_yellowB']
export const TUFTS = ['grass_large', 'grass']
export const ROCKS = ['rock_largeA', 'rock_largeC', 'rock_smallA', 'rock_smallFlatA']
export const WATER_PLANTS = ['lily_large', 'lily_small']
export const EXTRAS = ['stump_round', 'log', 'mushroom_tanGroup', 'canoe']

// A short paved path from the road to each landmark.
export const SPURS: P[][] = STATIONS.map((st) => {
  const { s } = nearestOnRoad(st.landmark.x, st.landmark.z)
  const a = roadAt(s)
  const dx = st.landmark.x - a.x, dz = st.landmark.z - a.z
  const d = Math.hypot(dx, dz) || 1
  return [{ x: a.x + (dx / d) * 0.6, z: a.z + (dz / d) * 0.6 }, { x: st.landmark.x - (dx / d) * 1.5, z: st.landmark.z - (dz / d) * 1.5 }]
})

// Benches by the road and flower beds at the landmarks. A bench faces the road; a bed lies along it.
export type Prop = Rect & { kind: 'bench' | 'bed' }
export const PROPS: Prop[] = (() => {
  const out: Prop[] = []
  STATIONS.forEach((st, i) => {
    // A bed on each side of the path to the landmark, and a bench looking at the landmark.
    const [a, b] = SPURS[i]
    const dx = b.x - a.x, dz = b.z - a.z
    const d = Math.hypot(dx, dz) || 1
    const ux = dx / d, uz = dz / d
    const rot = Math.atan2(ux, uz)
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    for (const side of [-1, 1]) out.push({ kind: 'bed', x: mid.x + uz * side * 1.05, z: mid.z - ux * side * 1.05, hw: 0.3, hd: Math.max(0.5, d / 2 - 0.3), rot })
    const bx = st.landmark.x + uz * 2.3, bz = st.landmark.z - ux * 2.3
    out.push({ kind: 'bench', x: bx, z: bz, hw: 0.5, hd: 0.2, rot: Math.atan2(st.landmark.x - bx, st.landmark.z - bz) })
  })
  // Benches along the road, on the side away from the landmarks, every so often.
  for (let s = 9; s < 118; s += 13) {
    const p = roadAt(s)
    const x = p.x - p.nx * 1.5, z = p.z - p.nz * 1.5
    if (PADS.some((q) => Math.hypot(q.x - x, q.z - z) < 2.6) || STATIONS.some((st) => Math.hypot(st.sign.x - x, st.sign.z - z) < 2.4)) continue
    if (GATES.some((g) => Math.hypot(g.x - x, g.z - z) < 4) || islandU(x, z) > 0.86 || distToCreek(x, z) < CREEK_W + 0.8) continue
    out.push({ kind: 'bench', x, z, hw: 0.5, hd: 0.2, rot: Math.atan2(p.x - x, p.z - z) })
  }
  return out
})()

export function distToCreek(x: number, z: number) {
  let d = Infinity
  for (const arm of CREEK) d = Math.min(d, distToLine(arm, x, z))
  return d
}

// Areas kept clear: buildings, the plaza, stations, paths, the creek, the road and the pads. The gate keeps a wide
// clearing on the camera's side, so it is seen when it opens.
const BUILDINGS = [rectOf(SCHOOL, 1.4), rectOf(OFFICE, 1.4), rectOf(KIOSK, 1.2), rectOf(QUEST, 1.2)]
const SPOTS: Circle[] = [
  { ...PLAZA, r: PLAZA.r + 1.4 },
  { ...LIGHTHOUSE, r: 2.6 },
  { ...ROAD_END, r: 2.6 },
  ...STATIONS.map((s) => ({ x: s.landmark.x + 0.8, z: s.landmark.z + 1.1, r: 3.4 })),
  ...STATIONS.map((s) => ({ x: s.sign.x + 0.6, z: s.sign.z + 0.8, r: 2.3 })),
  // Pads, signs and landmarks keep a clearing on the camera's side, so no tree stands between them and the view.
  ...PADS.map((p) => ({ x: p.x + 1.1, z: p.z + 1.5, r: 3 })),
  ...GATES.map((g) => ({ x: g.x + 2.4, z: g.z + 3.4, r: 6.2 })),
  ...PROPS.map((p) => ({ x: p.x, z: p.z, r: 1.3 })),
]

function clear(x: number, z: number, road: number) {
  if (distToRoad(x, z) < ROAD_W / 2 + road) return false
  if (distToCreek(x, z) < CREEK_W + 0.7) return false
  if (SPURS.some((l) => distToLine(l, x, z) < 1.1)) return false
  if (BUILDINGS.some((b) => rectDist(b, x, z) < 0)) return false
  return !SPOTS.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r * c.r)
}

// Groves: low-frequency waves decide where trees gather and where meadows stay open.
function grove(x: number, z: number) {
  return Math.sin(x * 0.23 + 1.3) * Math.cos(z * 0.19 - 0.4) + 0.55 * Math.sin((x + z) * 0.11 + 2.2)
}

function build(): Plant[] {
  const r = rng(20260930)
  const out: Plant[] = []
  const add = (kind: string, x: number, z: number, scale: number, rad: number) =>
    out.push({ kind, x, z, scale, rot: r() * Math.PI * 2, tint: r(), r: rad })

  // Trees on a jittered grid, thicker in the groves.
  const step = 2.1
  for (let gx = -26; gx <= 26; gx += step) {
    for (let gz = -32; gz <= 30; gz += step) {
      const x = gx + (r() - 0.5) * step * 0.9
      const z = gz + (r() - 0.5) * step * 0.9
      const u = islandU(x, z)
      if (u > GRASS_U - 0.035) continue
      const g = grove(x, z)
      // The edge of the island has a ring of trees; the middle keeps meadows along the road.
      const edge = u > 0.78 ? 0.35 : 0
      if (g + edge < 0.25 || r() > 0.55 + g * 0.4 + edge) continue
      if (!clear(x, z, 1.9)) continue
      const kind = TREES[Math.floor(r() * TREES.length)]
      add(kind, x, z, 0.9 + r() * 0.55, 0.38)
    }
  }
  // Bushes and flowers line the road and fill the meadows.
  for (let i = 0; i < 520; i++) {
    const x = (r() - 0.5) * 50
    const z = (r() - 0.5) * 62
    const u = islandU(x, z)
    if (u > GRASS_U - 0.02) continue
    const d = distToRoad(x, z)
    const nearRoad = d > ROAD_W / 2 + 0.5 && d < ROAD_W / 2 + 1.8
    if (!nearRoad && r() > 0.45) continue
    if (!clear(x, z, 0.5)) continue
    if (out.some((p) => p.r > 0 && (p.x - x) ** 2 + (p.z - z) ** 2 < 1.2)) continue
    const pick = r()
    if (pick < 0.3) add(BUSHES[Math.floor(r() * BUSHES.length)], x, z, 0.8 + r() * 0.5, 0)
    else if (pick < 0.62) add(FLOWERS[Math.floor(r() * FLOWERS.length)], x, z, 0.9 + r() * 0.5, 0)
    else add(TUFTS[Math.floor(r() * TUFTS.length)], x, z, 0.8 + r() * 0.6, 0)
  }
  // Palms and stones on the beach.
  for (let i = 0; i < 26; i++) {
    const th = r() * Math.PI * 2
    const p = toU(Math.cos(th), Math.sin(th), GRASS_U + 0.02 + r() * 0.03)
    if (!clear(p.x, p.z, 1.2)) continue
    add(PALMS[Math.floor(r() * PALMS.length)], p.x, p.z, 1 + r() * 0.35, 0.28)
  }
  // A few small stones at the water line; the big ones stay modest so the shore stays light.
  for (let i = 0; i < 20; i++) {
    const th = r() * Math.PI * 2
    const p = toU(Math.cos(th), Math.sin(th), 0.95 + r() * 0.06)
    if (!clear(p.x, p.z, 1)) continue
    const big = r() < 0.3
    add(ROCKS[big ? Math.floor(r() * 2) : 2 + Math.floor(r() * 2)], p.x, p.z, big ? 0.7 + r() * 0.3 : 0.8 + r() * 0.6, big ? 0.6 : 0)
  }
  // Reeds along the creek.
  for (let i = 0; i < 140; i++) {
    const arm = CREEK[i % Math.max(1, CREEK.length)]
    if (!arm) break
    const k = Math.floor(r() * (arm.length - 1))
    const a = arm[k], b = arm[k + 1]
    const t = r()
    const side = r() < 0.5 ? -1 : 1
    const dx = b.x - a.x, dz = b.z - a.z
    const d = Math.hypot(dx, dz) || 1
    const x = a.x + dx * t + (dz / d) * side * (CREEK_W + 0.25), z = a.z + dz * t - (dx / d) * side * (CREEK_W + 0.25)
    if (islandU(x, z) > GRASS_U - 0.02 || distToRoad(x, z) < ROAD_W / 2 + 0.6 || r() > 0.55) continue
    add(r() < 0.6 ? 'grass_large' : BUSHES[0], x, z, 0.7 + r() * 0.5, 0)
  }
  // Water lilies close to the shore.
  for (let i = 0; i < 16; i++) {
    const th = r() * Math.PI * 2
    const p = toU(Math.cos(th), Math.sin(th), 1.05 + r() * 0.05)
    add(WATER_PLANTS[Math.floor(r() * 2)], p.x, p.z, 1 + r() * 0.6, 0)
  }
  // Flowers in the beds.
  for (const b of PROPS) {
    if (b.kind !== 'bed') continue
    const n = Math.max(2, Math.round(b.hd * 2.4))
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n * 2 - 1
      const lx = 0, lz = t * (b.hd - 0.2)
      const x = b.x + lx * Math.cos(b.rot) + lz * Math.sin(b.rot), z = b.z - lx * Math.sin(b.rot) + lz * Math.cos(b.rot)
      out.push({ kind: FLOWERS[k % 2], x, z, scale: 0.9, rot: r() * 6.28, tint: r(), r: 0, y: 0.3 })
    }
  }
  // A few stumps, logs and mushrooms in the groves.
  for (let i = 0; i < 60 && out.filter((p) => EXTRAS.includes(p.kind)).length < 12; i++) {
    const x = (r() - 0.5) * 44
    const z = (r() - 0.5) * 56
    if (islandU(x, z) > GRASS_U - 0.05 || grove(x, z) < 0.5 || !clear(x, z, 1.5)) continue
    if (out.some((p) => p.r > 0 && (p.x - x) ** 2 + (p.z - z) ** 2 < 1.4)) continue
    const kind = EXTRAS[Math.floor(r() * 3)]
    add(kind, x, z, 1, kind === 'mushroom_tanGroup' ? 0 : 0.35)
  }
  return out
}

export const PLANTS = build()
