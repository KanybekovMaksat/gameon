// The island: its shape, the road of topics and where everything stands. Pure data and math without three.js,
// so the scene, the controls and the collisions read one source. Units: the child is about one unit tall.
// x goes east, z goes south (toward the camera at the start).

export type P = { x: number; z: number }
export type Circle = P & { r: number }
// An oriented rectangle: half width along its x, half depth along its z, turned by `rot` around y.
export type Rect = P & { hw: number; hd: number; rot: number }

// The island is longer north to south; its shore wobbles a little so it does not look drawn with a compass.
export const STRETCH = 1.2
const BASE_R = 23.5
const WAVES: [number, number, number][] = [[1.3, 3, 0.5], [0.8, 5, 1.3], [0.5, 2, 2.1]]
export function rimAt(theta: number) {
  return WAVES.reduce((r, [a, k, p]) => r + a * Math.sin(k * theta + p), BASE_R)
}
// The same shore for the water shader.
export const RIM_GLSL = WAVES.reduce((s, [a, k, p]) => `${s} + ${a.toFixed(2)} * sin(${k.toFixed(1)} * th + ${p.toFixed(2)})`, BASE_R.toFixed(2))

// 0 at the center, 1 at the water line.
export function islandU(x: number, z: number) {
  const qz = z / STRETCH
  return Math.hypot(x, qz) / rimAt(Math.atan2(qz, x))
}

// Grass ends at GRASS_U, the beach runs to the water line; the child may walk onto the wet sand.
export const GRASS_U = 0.9
export const WALK_U = 0.972
export const WATER_Y = -0.1

export function groundY(u: number) {
  if (u <= GRASS_U) return 0
  if (u <= 1) return -0.16 * (u - GRASS_U) / (1 - GRASS_U)
  return -0.16 - (u - 1) * 10
}

// The point on the island's edge at `u` in the direction of (x, z).
export function toU(x: number, z: number, u: number): P {
  const qz = z / STRETCH
  const th = Math.atan2(qz, x)
  const r = rimAt(th) * u
  return { x: Math.cos(th) * r, z: Math.sin(th) * r * STRETCH }
}

// Centripetal Catmull-Rom through the control points, sampled evenly: the road is a polyline with arc lengths.
function catmull(pts: P[], step: number) {
  const out: P[] = []
  const ext = [pts[0], ...pts, pts[pts.length - 1]]
  for (let i = 1; i < ext.length - 2; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]]
    const n = 24
    for (let k = 0; k < n; k++) {
      const t = k / n
      const t2 = t * t, t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      })
    }
  }
  out.push(pts[pts.length - 1])
  // Resample by arc length.
  const acc = [0]
  for (let i = 1; i < out.length; i++) acc.push(acc[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z))
  const total = acc[acc.length - 1]
  const res: P[] = []
  let j = 0
  for (let s = 0; s <= total; s += step) {
    while (acc[j + 1] < s) j++
    const f = (s - acc[j]) / (acc[j + 1] - acc[j] || 1)
    res.push({ x: out[j].x + (out[j + 1].x - out[j].x) * f, z: out[j].z + (out[j + 1].z - out[j].z) * f })
  }
  return res
}

export const ROAD_W = 1.7
export const ROAD_STEP = 0.25
export const PLAZA: Circle = { x: 0.5, z: 16.4, r: 5.4 }

// The road winds from the plaza in the south to the lighthouse in the north, back and forth across the island.
const ROAD_CTRL: P[] = [
  { x: 0.4, z: 11.4 }, { x: -3.5, z: 8.6 }, { x: -9.5, z: 7.0 }, { x: -14.5, z: 4.8 }, { x: -16.4, z: 0.6 },
  { x: -13.5, z: -2.6 }, { x: -6, z: -3.2 }, { x: 2, z: -2.4 }, { x: 9.5, z: -2.8 }, { x: 15.8, z: -5.4 },
  { x: 17.2, z: -9.8 }, { x: 13.2, z: -12.8 }, { x: 5, z: -12.4 }, { x: -3, z: -13.2 }, { x: -10.5, z: -13.6 },
  { x: -15.6, z: -16.6 }, { x: -14.4, z: -20.2 }, { x: -7.5, z: -21.1 }, { x: 0, z: -20.9 }, { x: 6.8, z: -21.9 },
]
export const ROAD: P[] = catmull(ROAD_CTRL, ROAD_STEP)
export const ROAD_LEN = (ROAD.length - 1) * ROAD_STEP

// Position and heading (angle of the road direction, as a y rotation where 0 faces +z) at arc length s.
export function roadAt(s: number) {
  const i = Math.max(0, Math.min(ROAD.length - 2, Math.floor(s / ROAD_STEP)))
  const f = Math.max(0, Math.min(1, s / ROAD_STEP - i))
  const a = ROAD[i], b = ROAD[i + 1]
  const dx = b.x - a.x, dz = b.z - a.z
  return { x: a.x + dx * f, z: a.z + dz * f, heading: Math.atan2(dx, dz), nx: dz / (Math.hypot(dx, dz) || 1), nz: -dx / (Math.hypot(dx, dz) || 1) }
}

// The nearest point of the road: its arc length and distance.
export function nearestOnRoad(x: number, z: number) {
  let best = Infinity, bi = 0
  for (let i = 0; i < ROAD.length; i++) {
    const d = (ROAD[i].x - x) ** 2 + (ROAD[i].z - z) ** 2
    if (d < best) { best = d; bi = i }
  }
  return { s: bi * ROAD_STEP, d: Math.sqrt(best) }
}

type TopicLike = { id: string; office?: string; lessons: { id: string }[] }

export type Station = {
  topicId: string
  index: number
  s: number
  // The sign stands by the road; the landmark further out on the same side.
  sign: P & { rot: number }
  landmark: P
  side: 1 | -1
  pads: { lessonId: string; s: number; x: number; z: number; heading: number }[]
  gate?: P & { heading: number; s: number }
}

const SIGN_TO_PAD = 3.4
const PAD_TO_PAD = 4.2
const GATE_AT = 1.7

// Where each topic's station stands, in TOPICS order: a point near the sign, the side of the road for the sign
// (1 is left of the way forward) and the landmark. Signs and landmarks stand north of their row, away from the
// camera, so the HUD at the bottom of the screen does not hide them; the last row's landmarks stand on the beach.
const STATION_AT: { sign: P; side: 1 | -1; landmark: P }[] = [
  { sign: { x: -4.2, z: 8.4 }, side: -1, landmark: { x: -6.4, z: 3.4 } },
  { sign: { x: -12.8, z: -2.7 }, side: 1, landmark: { x: -9.2, z: -7.9 } },
  { sign: { x: 0.2, z: -2.5 }, side: 1, landmark: { x: 5, z: -7.6 } },
  { sign: { x: 14.2, z: -12.5 }, side: -1, landmark: { x: 10.4, z: -17.2 } },
  { sign: { x: 0.8, z: -12.7 }, side: -1, landmark: { x: -4, z: -17.2 } },
  { sign: { x: -13.8, z: -20 }, side: -1, landmark: { x: -6.4, z: -23.8 } },
  { sign: { x: -1.8, z: -20.9 }, side: 1, landmark: { x: 3.2, z: -24 } },
]

export function buildStations(topics: TopicLike[]): Station[] {
  return topics.map((t, index) => {
    // A topic beyond the planned stations continues the road after the last one.
    const spec = STATION_AT[index] ?? STATION_AT[STATION_AT.length - 1]
    let s = nearestOnRoad(spec.sign.x, spec.sign.z).s
    const { side } = spec
    // Before a gate the sign stands further back, so the gate's own board does not cover it.
    const at = roadAt(t.office ? s - 1.6 : s)
    const sign = { x: at.x + at.nx * side * 2.1, z: at.z + at.nz * side * 2.1, rot: at.heading }
    const gateAt = t.office ? roadAt(s + GATE_AT) : null
    const station: Station = {
      topicId: t.id, index, s, sign, landmark: spec.landmark, side,
      pads: [],
      gate: gateAt ? { x: gateAt.x, z: gateAt.z, heading: gateAt.heading, s: s + GATE_AT } : undefined,
    }
    s += SIGN_TO_PAD
    t.lessons.forEach((l, li) => {
      if (li > 0) s += PAD_TO_PAD
      const p = roadAt(s)
      station.pads.push({ lessonId: l.id, s, x: p.x, z: p.z, heading: p.heading })
    })
    return station
  })
}

// Places on the plaza and beyond. A place faces the way of `rot` (y rotation, 0 faces +z); the child uses it
// standing at its front. Readable faces turn toward the camera, which looks from the south east.
export const SCHOOL = { x: -7.4, z: 13.2, rot: 1.1, w: 6.6, d: 5.0 }
export const KIOSK = { x: 6.2, z: 12.4, rot: -0.45, w: 2.8, d: 1.9 }
export const QUEST = { x: 3.0, z: 9.4, rot: 0.62, w: 3.2, d: 0.5 }
// The office stands on the open side of the creek, by the road before the gate its lesson opens, facing the road.
export const OFFICE = { x: -4.8, z: -7, rot: 0, w: 4.2, d: 3.4 }
export const FOUNTAIN: Circle = { x: 0.5, z: 16.4, r: 1.55 }
// The child starts on the plaza by the road, looking along it: the school, the first stations, the current
// lesson's beacon and a groupmate are in the first frame.
export const SPAWN = { x: 1.4, z: 13.6, face: -2.71 }
export const LIGHTHOUSE = { x: 10.2, z: -24.6 }
export const ROAD_END = ROAD[ROAD.length - 1]

// The point `dist` in front of a place.
export function frontOf(o: { x: number; z: number; rot: number; d?: number }, dist: number): P {
  const k = (o.d ?? 0) / 2 + dist
  return { x: o.x + Math.sin(o.rot) * k, z: o.z + Math.cos(o.rot) * k }
}

export function rectOf(o: { x: number; z: number; rot: number; w: number; d: number }, pad = 0): Rect {
  return { x: o.x, z: o.z, hw: o.w / 2 + pad, hd: o.d / 2 + pad, rot: o.rot }
}

// Point to rectangle distance (negative inside).
export function rectDist(r: Rect, x: number, z: number) {
  const c = Math.cos(r.rot), s = Math.sin(r.rot)
  const dx = x - r.x, dz = z - r.z
  const lx = dx * c - dz * s, lz = dx * s + dz * c
  const ox = Math.abs(lx) - r.hw, oz = Math.abs(lz) - r.hd
  return Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) + Math.min(Math.max(ox, oz), 0)
}

// Pushes a circle of radius `rad` at (x, z) out of a rectangle; returns the corrected point.
export function pushOutRect(r: Rect, p: P, rad: number): P {
  const c = Math.cos(r.rot), s = Math.sin(r.rot)
  const dx = p.x - r.x, dz = p.z - r.z
  const lx = dx * c - dz * s, lz = dx * s + dz * c
  const cx = Math.max(-r.hw, Math.min(r.hw, lx)), cz = Math.max(-r.hd, Math.min(r.hd, lz))
  let ox = lx - cx, oz = lz - cz
  let d = Math.hypot(ox, oz)
  let nlx = lx, nlz = lz
  if (d === 0) {
    // Inside: leave by the nearest side.
    const px = r.hw - Math.abs(lx), pz = r.hd - Math.abs(lz)
    if (px < pz) nlx = Math.sign(lx || 1) * (r.hw + rad)
    else nlz = Math.sign(lz || 1) * (r.hd + rad)
  } else if (d < rad) {
    ox /= d; oz /= d
    nlx = cx + ox * rad; nlz = cz + oz * rad
  } else return p
  // Back to world: inverse rotation.
  return { x: r.x + nlx * c + nlz * s, z: r.z - nlx * s + nlz * c }
}

// A small seeded random, so the island is the same on every load.
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function distToRoad(x: number, z: number) {
  return nearestOnRoad(x, z).d
}

// Distance from a point to a polyline, and the point on it.
export function distToLine(line: P[], x: number, z: number) {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1]
    const dx = b.x - a.x, dz = b.z - a.z
    const l2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2))
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
    if (d < best) best = d
  }
  return best
}
