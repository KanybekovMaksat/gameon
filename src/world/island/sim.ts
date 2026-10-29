import {
  FOUNTAIN, KIOSK, LIGHTHOUSE, OFFICE, QUEST, ROAD_W, SCHOOL, WALK_U, distToRoad, islandU, pushOutRect, rectOf, toU,
  type Circle, type P, type Rect,
} from './layout'
import { CREEK, CREEK_W, GATES, PADS, PLACES, STATIONS } from './plan'
import { RUN, WALK, blend, type Emote, type Rig } from './rig'
import { PLANTS, PROPS } from './scatter'

// The island's motion without drawing: the child, the helper robot, the groupmates, collisions, paths and what
// the child is near. The scene reads it every frame and moves its models.

const RADIUS = 0.3
// «К миссии» is a brisk run.
const AUTO = 6.4
// The camera looks from this direction (y rotation around the child): from the south east.
export const YAW = 0.62
export const GATE_HALF = ROAD_W / 2 + 0.15
// Keys of what the child can stand near, made once.
const PAD_KEYS = PADS.map((p) => 'pad:' + p.lessonId)
const GATE_KEYS = GATES.map((g) => 'gate:' + g.topicId)
// The wall a closed gate puts across the road, in GATES order.
const GATE_WALLS = GATES.map((g) => ({ x: g.x, z: g.z, hw: GATE_HALF, hd: 0.2, rot: g.heading }))

type Mover = { x: number; z: number; face: number; vx: number; vz: number; speed: number }

export type Mate = Mover & {
  name: string
  index: number
  anchor: P
  target: P | null
  wait: number
  greeted: number
  emote: Emote | null
}

type Seg = { ax: number; az: number; bx: number; bz: number; r: number }

const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

// Across the road at a gate: the road's normal.
const across = (heading: number) => ({ x: Math.cos(heading), z: -Math.sin(heading) })

function staticColliders() {
  const circles: Circle[] = [
    { ...FOUNTAIN, r: FOUNTAIN.r + 0.1 },
    { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 1.5 },
    ...STATIONS.map((s) => ({ ...s.landmark, r: 1.75 })),
    // A sign is one post under a small board.
    ...STATIONS.map((s) => ({ x: s.sign.x, z: s.sign.z, r: 0.4 })),
    ...PLANTS.filter((p) => p.r > 0).map((p) => ({ x: p.x, z: p.z, r: p.r * p.scale })),
  ]
  const rects: Rect[] = [
    rectOf(SCHOOL, 0.05), rectOf(OFFICE, 0.05), rectOf(KIOSK, 0.05), rectOf(QUEST, 0),
    ...PROPS.map((p) => ({ x: p.x, z: p.z, hw: p.hw, hd: p.hd, rot: p.rot })),
  ]
  const segs: Seg[] = []
  for (const g of GATES) {
    const n = across(g.heading)
    // Posts, and railings along both road edges over the creek.
    for (const side of [-1, 1]) {
      circles.push({ x: g.x + n.x * GATE_HALF * side, z: g.z + n.z * GATE_HALF * side, r: 0.2 })
      rects.push({ x: g.x + n.x * (GATE_HALF + 0.05) * side, z: g.z + n.z * (GATE_HALF + 0.05) * side, hw: 0.08, hd: 1.4, rot: g.heading })
    }
  }
  // The creek, from the railings to the shores.
  CREEK.forEach((arm) => {
    const g = GATES[0]
    const n = across(g.heading)
    const side = arm === CREEK[0] ? 1 : -1
    const pts = [{ x: g.x + n.x * 1.85 * side, z: g.z + n.z * 1.85 * side }, ...arm.slice(1)]
    for (let i = 0; i < pts.length - 1; i++) segs.push({ ax: pts[i].x, az: pts[i].z, bx: pts[i + 1].x, bz: pts[i + 1].z, r: CREEK_W })
  })
  return { circles, rects, segs }
}

// A grid over the island for paths: 0.5 units a cell. Road cells are cheaper, so paths keep to the road.
const CELL = 0.5
const GX0 = -27, GZ0 = -33
const GW = 108, GH = 128

class Heap {
  items: number[] = []
  prio: number[] = []
  push(i: number, p: number) {
    const a = this.items, q = this.prio
    a.push(i); q.push(p)
    let k = a.length - 1
    while (k > 0) {
      const up = (k - 1) >> 1
      if (q[up] <= q[k]) break
      ;[a[up], a[k]] = [a[k], a[up]]; [q[up], q[k]] = [q[k], q[up]]
      k = up
    }
  }
  pop() {
    const a = this.items, q = this.prio
    const top = a[0]
    const li = a.pop()!, lp = q.pop()!
    if (a.length) {
      a[0] = li; q[0] = lp
      let k = 0
      for (;;) {
        const l = k * 2 + 1, r = l + 1
        let m = k
        if (l < a.length && q[l] < q[m]) m = l
        if (r < a.length && q[r] < q[m]) m = r
        if (m === k) break
        ;[a[m], a[k]] = [a[k], a[m]]; [q[m], q[k]] = [q[k], q[m]]
        k = m
      }
    }
    return top
  }
  get size() { return this.items.length }
}

export class Sim {
  me: Mover = { x: 0, z: 0, face: 0, vx: 0, vz: 0, speed: 0 }
  meEmote: Emote | null = null
  // The helper robot walks with the child, a step behind; on the way to a lesson it leads.
  bot: Mover = { x: 0, z: 0, face: 0, vx: 0, vz: 0, speed: 0 }
  // The robot waves (1) or shows a thumbs up (2) once; the robot's model takes it.
  private botWave = 0
  wave(kind: 1 | 2) { this.botWave = kind }
  takeWave() { const w = this.botWave; this.botWave = 0; return w }
  mates: Mate[] = []
  // Screen joystick: x right, y down, length up to 1 for walking; run beyond.
  joy = { x: 0, y: 0, on: false, run: false }
  keys = new Set<string>()
  path: P[] = []
  pathRun = false
  // «К миссии» walks on its own; cards wait until the child arrives.
  auto = false
  onArrive: (() => void) | null = null
  private onBlocked: (() => void) | null = null
  listen(onBlocked: () => void) { this.onBlocked = onBlocked }
  stuck = 0
  frozen = false
  moved = false
  idle = 0
  greeted = false
  circles: Circle[]
  rects: Rect[]
  segs: Seg[]
  gateOpen: Record<string, boolean> = {}
  // A gate the demo scene wants to see opening.
  gateReplay: string | null = null
  near: string | null = null
  time = 0
  private walk: Uint8Array
  private road: Uint8Array
  private gateCells: { topicId: string; cells: number[] }[] = []
  private goal: P | null = null
  private replanned = false
  private q = { x: 0, z: 0 }
  // The models the scene moves: the child, the robot and the groupmates, in the order of `mates`.
  private rigMe: Rig | null = null
  private rigBot: Rig | null = null
  private rigMates: (Rig | null)[] = []

  constructor() {
    const c = staticColliders()
    this.circles = c.circles
    this.rects = c.rects
    this.segs = c.segs
    this.walk = new Uint8Array(GW * GH)
    this.road = new Uint8Array(GW * GH)
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (j + 0.5) * CELL
        const k = j * GW + i
        this.walk[k] = this.free(x, z, RADIUS + 0.05) ? 1 : 0
        this.road[k] = distToRoad(x, z) < ROAD_W / 2 - 0.1 ? 1 : 0
      }
    }
    // The cells a closed gate takes.
    for (const g of GATES) {
      const wall = { x: g.x, z: g.z, hw: GATE_HALF, hd: 0.2 + RADIUS, rot: g.heading }
      const cells: number[] = []
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (j + 0.5) * CELL
        if (Math.abs(x - g.x) > 3 || Math.abs(z - g.z) > 3) continue
        const c = Math.cos(wall.rot), s = Math.sin(wall.rot)
        const lx = (x - wall.x) * c - (z - wall.z) * s, lz = (x - wall.x) * s + (z - wall.z) * c
        if (Math.abs(lx) <= wall.hw + 0.1 && Math.abs(lz) <= wall.hd) cells.push(j * GW + i)
      }
      this.gateCells.push({ topicId: g.topicId, cells })
    }
  }

  // No static obstacle within `rad` of the point, and on the island.
  private free(x: number, z: number, rad: number) {
    if (islandU(x, z) > WALK_U) return false
    for (const c of this.circles) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + rad) ** 2) return false
    for (const r of this.rects) {
      const p = pushOutRect(r, { x, z }, rad)
      if (p.x !== x || p.z !== z) return false
    }
    for (const s of this.segs) if (segDist(s, x, z) < s.r + rad) return false
    return true
  }

  setMates(list: Mate[]) { this.mates = list }
  // True when it changed.
  setNear(key: string | null) {
    if (key === this.near) return false
    this.near = key
    return true
  }
  setRig(index: number | 'me' | 'bot', rig: Rig | null) {
    if (index === 'me') this.rigMe = rig
    else if (index === 'bot') this.rigBot = rig
    else this.rigMates[index] = rig
  }
  freeze(on: boolean) { this.frozen = on }
  // A fresh start (a scene or a reset): the first step shows the hint again.
  resetMoved() { this.moved = false; this.idle = 0; this.greeted = false }
  turn(face: number) { this.me.face = face }
  replayGate(topicId: string) { this.gateReplay = topicId }
  // The gate takes the demo's request once.
  takeReplay(topicId: string) {
    if (this.gateReplay !== topicId) return false
    this.gateReplay = null
    return true
  }
  setGateOpen(topicId: string, open: boolean) { this.gateOpen[topicId] = open }
  // A gate that has just opened in view, for the HUD.
  private opened: string[] = []
  gateOpened(topicId: string) { this.opened.push(topicId) }
  takeOpened() { return this.opened.shift() ?? null }
  botRig() { return this.rigBot }

  // Models follow the simulation; animation weights follow speed.
  applyRigs() {
    const r = this.rigMe
    if (r) {
      r.group.position.set(this.me.x, 0, this.me.z)
      r.group.rotation.y = this.me.face
      blend(r, this.me.speed, this.meEmote)
    }
    for (let i = 0; i < this.mates.length; i++) {
      const m = this.mates[i], g = this.rigMates[i]
      if (!g) continue
      g.group.position.set(m.x, 0, m.z)
      g.group.rotation.y = m.face
      blend(g, m.speed, m.emote)
    }
    const b = this.rigBot
    if (b) {
      b.group.position.set(this.bot.x, 0, this.bot.z)
      b.group.rotation.y = this.bot.face
    }
  }

  place(x: number, z: number, face: number) {
    Object.assign(this.me, { x, z, face, vx: 0, vz: 0, speed: 0 })
    // The robot stands beside the child, on the right as the camera sees it.
    Object.assign(this.bot, { x: x + Math.cos(YAW) * 1.05 - Math.sin(YAW) * 0.45, z: z - Math.sin(YAW) * 1.05 - Math.cos(YAW) * 0.45, face, vx: 0, vz: 0, speed: 0 })
    this.cancel()
    this.idle = 0
  }

  // Pushes a circle at (x, z) out of everything; the result is written to `out` (no allocation per frame).
  resolveInto(out: P, x: number, z: number, rad: number, skip?: Mover) {
    let qx = x, qz = z
    for (let it = 0; it < 3; it++) {
      for (const c of this.circles) {
        const dx = qx - c.x, dz = qz - c.z
        const min = c.r + rad
        const d2 = dx * dx + dz * dz
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-4
          qx = c.x + (dx / d) * min; qz = c.z + (dz / d) * min
        }
      }
      for (const s of this.segs) {
        const dx = s.bx - s.ax, dz = s.bz - s.az
        const l2 = dx * dx + dz * dz || 1
        const t = Math.max(0, Math.min(1, ((qx - s.ax) * dx + (qz - s.az) * dz) / l2))
        const cx = s.ax + dx * t, cz = s.az + dz * t
        const ex = qx - cx, ez = qz - cz
        const d = Math.hypot(ex, ez)
        const min = s.r + rad
        if (d < min) {
          if (d > 1e-5) { qx = cx + (ex / d) * min; qz = cz + (ez / d) * min }
          else { qx = cx - (dz / Math.sqrt(l2)) * min; qz = cz + (dx / Math.sqrt(l2)) * min }
        }
      }
      for (let i = -2; i < this.mates.length; i++) {
        const m = i === -2 ? this.me : i === -1 ? this.bot : this.mates[i]
        // The robot makes way for the child, never the other way round.
        if (m === skip || (skip === this.me && m === this.bot)) continue
        const dx = qx - m.x, dz = qz - m.z
        const min = 0.32 + rad
        const d2 = dx * dx + dz * dz
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2)
          qx = m.x + (dx / d) * min; qz = m.z + (dz / d) * min
        }
      }
      this.q.x = qx; this.q.z = qz
      for (const r of this.rects) { const p = pushOutRect(r, this.q, rad); this.q.x = p.x; this.q.z = p.z }
      for (let i = 0; i < GATES.length; i++) {
        if (this.gateOpen[GATES[i].topicId]) continue
        const p = pushOutRect(GATE_WALLS[i], this.q, rad)
        this.q.x = p.x; this.q.z = p.z
      }
      qx = this.q.x; qz = this.q.z
      if (islandU(qx, qz) > WALK_U) { const e = toU(qx, qz, WALK_U); qx = e.x; qz = e.z }
    }
    out.x = qx; out.z = qz
    return out
  }

  resolve(p: P, rad: number, skip?: Mover): P {
    return this.resolveInto({ x: 0, z: 0 }, p.x, p.z, rad, skip)
  }

  // --- Paths over the grid ---

  private cellOf(x: number, z: number) {
    const i = Math.floor((x - GX0) / CELL), j = Math.floor((z - GZ0) / CELL)
    if (i < 0 || j < 0 || i >= GW || j >= GH) return -1
    return j * GW + i
  }
  private center(k: number): P { return { x: GX0 + ((k % GW) + 0.5) * CELL, z: GZ0 + (Math.floor(k / GW) + 0.5) * CELL } }
  private open(k: number) {
    if (!this.walk[k]) return false
    for (const g of this.gateCells) if (!this.gateOpen[g.topicId] && g.cells.includes(k)) return false
    return true
  }
  // The nearest open cell to a point, searching outward.
  private nearOpen(x: number, z: number) {
    const k0 = this.cellOf(x, z)
    if (k0 >= 0 && this.open(k0)) return k0
    const i0 = Math.floor((x - GX0) / CELL), j0 = Math.floor((z - GZ0) / CELL)
    for (let r = 1; r < 8; r++) {
      let best = -1, bd = Infinity
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
        const i = i0 + di, j = j0 + dj
        if (i < 0 || j < 0 || i >= GW || j >= GH) continue
        const k = j * GW + i
        if (!this.open(k)) continue
        const c = this.center(k)
        const d = (c.x - x) ** 2 + (c.z - z) ** 2
        if (d < bd) { bd = d; best = k }
      }
      if (best >= 0) return best
    }
    return -1
  }

  // A* from one point to another. Returns waypoints, or null when the goal cannot be reached (a closed gate).
  // `reach` returns the reachable cell nearest the goal instead of null.
  findPath(from: P, to: P, opts: { reach?: boolean } = {}): P[] | null {
    const s = this.nearOpen(from.x, from.z), t = this.nearOpen(to.x, to.z)
    if (s < 0 || t < 0) return null
    const g = new Float32Array(GW * GH).fill(Infinity)
    const came = new Int32Array(GW * GH).fill(-1)
    const closed = new Uint8Array(GW * GH)
    const tx = t % GW, tz = Math.floor(t / GW)
    const h = (k: number) => {
      const dx = Math.abs((k % GW) - tx), dz = Math.abs(Math.floor(k / GW) - tz)
      return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz))
    }
    const heap = new Heap()
    g[s] = 0
    heap.push(s, h(s))
    let best = s, bestH = h(s)
    while (heap.size) {
      const k = heap.pop()
      if (closed[k]) continue
      closed[k] = 1
      if (k === t) { best = t; break }
      const hk = h(k)
      if (hk < bestH) { bestH = hk; best = k }
      const i = k % GW, j = Math.floor(k / GW)
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ni = i + di, nj = j + dj
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue
        const n = nj * GW + ni
        if (closed[n] || !this.open(n)) continue
        // No cutting corners past a blocked cell.
        if (di && dj && (!this.open(j * GW + ni) || !this.open(nj * GW + i))) continue
        const step = (di && dj ? 1.414 : 1) * (this.road[n] ? 1 : 1.8)
        const ng = g[k] + step
        if (ng < g[n]) { g[n] = ng; came[n] = k; heap.push(n, ng + h(n)) }
      }
    }
    if (best !== t && !opts.reach) return null
    const cells: number[] = []
    for (let k = best; k >= 0; k = came[k]) cells.push(k)
    cells.reverse()
    return this.smooth(cells, best === t ? to : null)
  }

  // Straightens a cell path where the way is clear, without leaving the road for the grass.
  private smooth(cells: number[], end: P | null): P[] {
    const out: P[] = []
    let a = 0
    while (a < cells.length - 1) {
      let b = Math.min(cells.length - 1, a + 14)
      while (b > a + 1 && !this.clearLine(cells[a], cells[b])) b--
      out.push(this.center(cells[b]))
      a = b
    }
    if (end && this.open(this.cellOf(end.x, end.z))) {
      if (out.length) out[out.length - 1] = { x: end.x, z: end.z }
      else out.push({ x: end.x, z: end.z })
    }
    return out
  }
  private clearLine(ka: number, kb: number) {
    const a = this.center(ka), b = this.center(kb)
    const onRoad = this.road[ka] && this.road[kb]
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL * 0.5))
    for (let i = 1; i < n; i++) {
      const k = this.cellOf(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)
      if (k < 0 || !this.open(k) || (onRoad && !this.road[k])) return false
    }
    return true
  }

  // Cells the child can reach from where they stand (for tests and for taps across the creek).
  reachable(from: P) {
    const s = this.nearOpen(from.x, from.z)
    const seen = new Uint8Array(GW * GH)
    if (s < 0) return seen
    const stack = [s]
    seen[s] = 1
    while (stack.length) {
      const k = stack.pop()!
      const i = k % GW, j = Math.floor(k / GW)
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue
        const n = nj * GW + ni
        if (!seen[n] && this.open(n)) { seen[n] = 1; stack.push(n) }
      }
    }
    return seen
  }
  gridInfo() { return { CELL, GX0, GZ0, GW, GH, walk: this.walk } }

  // Walks to a point by a path; `run` for far goals. `then` runs on arrival. False when there is no way.
  goTo(to: P, run: boolean, then?: () => void, opts: { auto?: boolean; reach?: boolean } = {}) {
    const path = this.findPath(this.me, to, { reach: opts.reach })
    if (!path) { this.onBlocked?.(); return false }
    this.path = path
    this.pathRun = run
    this.auto = !!opts.auto
    this.goal = to
    this.replanned = false
    this.onArrive = then ?? null
    this.stuck = 0
    return true
  }

  cancel() {
    this.path = []
    this.onArrive = null
    this.auto = false
    this.goal = null
  }

  emote(name: string, dur: number) {
    this.meEmote = { name, t: 0, dur }
  }

  // Keys and the joystick, turned from screen directions into the island's: screen up walks away from the camera.
  private steer(out: { x: number; z: number; run: boolean }) {
    let sx = 0, sy = 0, run = false
    const k = this.keys
    if (k.has('KeyW') || k.has('ArrowUp')) sy -= 1
    if (k.has('KeyS') || k.has('ArrowDown')) sy += 1
    if (k.has('KeyA') || k.has('ArrowLeft')) sx -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) sx += 1
    if (sx || sy) {
      const l = Math.hypot(sx, sy)
      sx /= l; sy /= l
      run = k.has('ShiftLeft') || k.has('ShiftRight')
    } else if (this.joy.on) {
      sx = this.joy.x; sy = this.joy.y
      run = this.joy.run
    }
    if (!sx && !sy) return false
    const c = Math.cos(YAW), s = Math.sin(YAW)
    // Right on screen: (cos, -sin); up on screen: (-sin, -cos).
    out.x = sx * c + sy * s
    out.z = -sx * s + sy * c
    out.run = run
    return true
  }

  private input = { x: 0, z: 0, run: false }
  private want = { x: 0, z: 0 }

  step(dt: number) {
    this.time += dt
    const me = this.me
    const want = this.want
    want.x = 0; want.z = 0
    let speed = 0
    const input = this.input
    if (!this.frozen && this.steer(input)) {
      if (this.path.length) this.cancel()
      const m = Math.min(1, Math.hypot(input.x, input.z))
      want.x = input.x / (m || 1); want.z = input.z / (m || 1)
      speed = input.run ? RUN : WALK * Math.max(0.35, m)
      this.moved = true
    } else if (this.path.length && !this.frozen) {
      const t = this.path[0]
      const dx = t.x - me.x, dz = t.z - me.z
      const d = Math.hypot(dx, dz)
      const last = this.path.length === 1
      if (d < (last ? 0.12 : 0.55)) {
        this.path.shift()
        if (!this.path.length) {
          const f = this.onArrive
          this.auto = false
          this.onArrive = null
          this.goal = null
          f?.()
        }
      } else {
        want.x = dx / d; want.z = dz / d
        this.avoid(want, d)
        this.moved = true
        const top = this.auto ? AUTO : this.pathRun ? RUN : WALK
        // Slow down on the last few steps so the child stops on the spot.
        speed = top * (last ? Math.min(1, 0.35 + d / 1.6) : 1)
      }
    }
    // Ease the velocity toward the wish: quick to start, a short glide to stop.
    const k = 1 - Math.exp(-dt * (speed > 0 ? 9 : 12))
    me.vx += (want.x * speed - me.vx) * k
    me.vz += (want.z * speed - me.vz) * k
    const px = me.x, pz = me.z
    this.resolveInto(me, me.x + me.vx * dt, me.z + me.vz * dt, RADIUS, me)
    const real = Math.hypot(me.x - px, me.z - pz) / (dt || 1)
    if (this.path.length && speed > 0) {
      this.stuck = real < speed * 0.2 ? this.stuck + dt : 0
      if (this.stuck > 0.5) {
        // Someone stood in the way: plan again once, then tell the child.
        const goal = this.goal, then = this.onArrive, run = this.pathRun, auto = this.auto
        this.cancel()
        if (goal && !this.replanned) {
          const ok = this.goTo(goal, run, then ?? undefined, { auto })
          this.replanned = true
          if (!ok) this.onBlocked?.()
        } else this.onBlocked?.()
      }
    }
    me.speed += (real - me.speed) * (1 - Math.exp(-dt * 14))
    if (Math.hypot(me.vx, me.vz) > 0.25 && speed > 0) {
      me.face = lerpAngle(me.face, Math.atan2(want.x, want.z), 1 - Math.exp(-dt * 11))
      this.idle = 0
      this.greeted = false
    } else if (!this.frozen) {
      // Standing still a moment, the child turns to the camera and waves.
      this.idle += dt
      if (this.idle > 1.5) {
        me.face = lerpAngle(me.face, YAW, 1 - Math.exp(-dt * 5))
        if (!this.greeted && this.idle > 1.8) { this.greeted = true; this.emote('interact-right', 0.66 * 2) }
      }
    }
    if (this.meEmote) {
      this.meEmote.t += dt
      if (this.meEmote.t > this.meEmote.dur) this.meEmote = null
    }
    this.stepBot(dt)
    this.stepMates(dt)
  }

  // On the way to a goal, round obstacles ahead (a groupmate, the robot) are passed on the side they leave open.
  private avoid(want: { x: number; z: number }, dist: number) {
    const me = this.me
    const nx = want.z, nz = -want.x
    let wx = want.x, wz = want.z
    for (let i = -1; i < this.mates.length; i++) {
      const o = i === -1 ? this.bot : this.mates[i]
      if (o === this.bot && this.auto) continue
      const rx = o.x - me.x, rz = o.z - me.z
      const along = rx * want.x + rz * want.z
      if (along <= 0 || along > Math.min(dist, 1.4) + 0.3) continue
      const side = rx * nx + rz * nz
      const clear = 0.3 + RADIUS + 0.2
      if (Math.abs(side) >= clear) continue
      const k = ((clear - Math.abs(side)) / clear) * 1.6
      const dir = side > 0 ? -1 : 1
      wx += nx * dir * k
      wz += nz * dir * k
    }
    const l = Math.hypot(wx, wz) || 1
    want.x = wx / l; want.z = wz / l
  }

  // The robot: a step behind the child; on the way to a lesson a step ahead along the path.
  private botGoal = { x: 0, z: 0 }
  private botSide: 1 | -1 = 1
  private stepBot(dt: number) {
    const b = this.bot, me = this.me
    const goal = this.botGoal
    const end = this.path[this.path.length - 1]
    const nearEnd = end ? Math.hypot(end.x - me.x, end.z - me.z) < 2.8 : false
    if (this.auto && this.path.length && !nearEnd) {
      // A point about 1.6 ahead along the path.
      let left = 1.6, ax = me.x, az = me.z
      goal.x = ax; goal.z = az
      for (const p of this.path) {
        const d = Math.hypot(p.x - ax, p.z - az)
        if (d >= left) { goal.x = ax + ((p.x - ax) / d) * left; goal.z = az + ((p.z - az) / d) * left; left = 0; break }
        left -= d; ax = p.x; az = p.z; goal.x = ax; goal.z = az
      }
    } else {
      // Beside the child as the camera sees it, a little further away, so it never stands in front of the child.
      // It changes sides when the child walks toward it.
      const rx = Math.cos(YAW), rz = -Math.sin(YAW)
      const toward = (me.vx * rx + me.vz * rz) * this.botSide
      if (toward > 1.2) this.botSide = -this.botSide as 1 | -1
      goal.x = me.x + rx * 1.05 * this.botSide - Math.sin(YAW) * 0.45
      goal.z = me.z + rz * 1.05 * this.botSide - Math.cos(YAW) * 0.45
    }
    const dx = goal.x - b.x, dz = goal.z - b.z
    const d = Math.hypot(dx, dz)
    const leading = this.auto && this.path.length > 0 && !nearEnd
    // A dead zone keeps the robot calm while the child turns in place.
    const speed = d < (leading ? 0.15 : 0.5) ? 0 : Math.min(leading ? AUTO * 1.25 : 7, d * (leading ? 5 : 2.6))
    const k = 1 - Math.exp(-dt * 8)
    b.vx += ((d ? dx / d : 0) * speed - b.vx) * k
    b.vz += ((d ? dz / d : 0) * speed - b.vz) * k
    const px = b.x, pz = b.z
    this.resolveInto(b, b.x + b.vx * dt, b.z + b.vz * dt, 0.3, b)
    // Far behind or stuck: the robot catches up at once.
    if (Math.hypot(b.x - me.x, b.z - me.z) > 9) { b.x = goal.x; b.z = goal.z }
    const real = Math.hypot(b.x - px, b.z - pz) / (dt || 1)
    b.speed += (real - b.speed) * (1 - Math.exp(-dt * 10))
    if (b.speed > 0.3) b.face = lerpAngle(b.face, Math.atan2(b.vx, b.vz), 1 - Math.exp(-dt * 8))
    else b.face = lerpAngle(b.face, Math.atan2(me.x - b.x, me.z - b.z), 1 - Math.exp(-dt * 3))
  }

  private stepMates(dt: number) {
    const me = this.me
    for (const m of this.mates) {
      const toMe = Math.hypot(me.x - m.x, me.z - m.z)
      let wx = 0, wz = 0
      let speed = 0
      if (m.target) {
        const dx = m.target.x - m.x, dz = m.target.z - m.z
        const d = Math.hypot(dx, dz)
        if (d < 0.15) {
          m.target = null
          m.wait = 3 + Math.random() * 4
        } else {
          wx = dx / d; wz = dz / d
          speed = 0.95
        }
      } else if ((m.wait -= dt) <= 0 && toMe > 2.6) {
        // A short stroll between nearby spots.
        const a = Math.random() * Math.PI * 2
        const r = 0.5 + Math.random() * 1.4
        m.target = { x: m.anchor.x + Math.cos(a) * r, z: m.anchor.z + Math.sin(a) * r }
      }
      const k = 1 - Math.exp(-dt * 8)
      m.vx += (wx * speed - m.vx) * k
      m.vz += (wz * speed - m.vz) * k
      const px = m.x, pz = m.z
      this.resolveInto(m, m.x + m.vx * dt, m.z + m.vz * dt, 0.28, m)
      const real = Math.hypot(m.x - px, m.z - pz) / (dt || 1)
      m.speed += (real - m.speed) * (1 - Math.exp(-dt * 10))
      if (speed > 0) m.face = lerpAngle(m.face, Math.atan2(wx, wz), 1 - Math.exp(-dt * 6))
      else if (toMe < 3.2) m.face = lerpAngle(m.face, Math.atan2(me.x - m.x, me.z - m.z), 1 - Math.exp(-dt * 4))
      // A groupmate waves hello when the child comes close, now and then.
      if (toMe < 2.4 && this.time - m.greeted > 12 && !m.target) {
        m.greeted = this.time
        m.emote = { name: 'interact-right', t: 0, dur: 0.66 * 2 }
      }
      if (m.emote && (m.emote.t += dt) > m.emote.dur) m.emote = null
    }
  }

  // The thing the child stands near: a pad, a place, or a closed gate. It keeps a little extra reach once near,
  // so the card does not flicker at the edge.
  nearest(): string | null {
    const me = this.me
    let best: string | null = null
    let bestD = Infinity
    for (let i = 0; i < PADS.length; i++) {
      const p = PADS[i]
      const key = PAD_KEYS[i]
      const d = Math.hypot(me.x - p.x, me.z - p.z)
      const reach = key === this.near ? 1.6 : 1.15
      if (d < reach && d < bestD) { best = key; bestD = d }
    }
    for (const pl of PLACES) {
      const d = Math.hypot(me.x - pl.at.x, me.z - pl.at.z)
      const reach = pl.id === this.near ? pl.r + 0.45 : pl.r
      if (d < reach && d < bestD) { best = pl.id; bestD = d }
    }
    for (let i = 0; i < GATES.length; i++) {
      const g = GATES[i]
      if (this.gateOpen[g.topicId]) continue
      const key = GATE_KEYS[i]
      // Standing on the road before the gate.
      const fx = g.x - Math.sin(g.heading) * 1.4, fz = g.z - Math.cos(g.heading) * 1.4
      const d = Math.hypot(me.x - fx, me.z - fz)
      const reach = key === this.near ? 2.05 : 1.6
      if (d < reach && d < bestD) { best = key; bestD = d }
    }
    return best
  }
}

function segDist(s: Seg, x: number, z: number) {
  const dx = s.bx - s.ax, dz = s.bz - s.az
  const l2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2))
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t))
}
