import { Suspense, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useProgress, useTexture } from '@react-three/drei'
import { NeutralToneMapping, Raycaster, Vector2, Vector3, type DirectionalLight, type Mesh, type MeshBasicMaterial, type PerspectiveCamera } from 'three'
import { sfx } from '../../app/sfx'
import { useApp, useLessonStates, type LessonState } from '../../app/store'
import { KIDS } from '../../components'
import { TOPICS } from '../../content'
import { kidsAt } from '../../home/kids'
import { castOf, modelOf } from '../../shop/catalog'
import { PauseWhenHidden } from '../pause'
import { Mate, Player } from './actors'
import { island, playScene, type Command, type Scene } from './bus'
import { KIOSK, OFFICE, QUEST, ROAD_LEN, SCHOOL, SPAWN, islandU, nearestOnRoad, roadAt, type P, type Rect } from './layout'
import { IslandLoading } from './loading'
import { Creek, Nature, Road, Sky, SkyDome, Terrain, Water } from './nature'
import { Dock, Fountain, Kiosk, Lamps, Lighthouse, Office, PlazaProps, QuestBoard, Robot, School } from './places'
import { GATES, PLACES, STATIONS, goalOf, padOf, type PlaceId } from './plan'
import { preloadCharacters, type Rig } from './rig'
import { Sim, YAW, type Mate as MateState } from './sim'
import { Merged } from './merge'
import { Dust, Gate, Landmark, Pad, Sign } from './stations'
import { texturesReady } from './textures'
import { clock, flare, reduced, seeThrough } from './uniforms'

// The island as the home screen: the child walks it, the road of topics runs through it.
// The HUD (home/HomeWorld) sits on top; the two talk through props and the bus.

export type IslandProps = {
  paused: boolean
  // Something covers the island (the class room): its loading screen is not shown.
  covered: boolean
  onReady: () => void
  onNear: (key: string | null) => void
  // A groupmate's name or 'robot' was tapped; null closes the card.
  onKid: (name: string | null) => void
  onIntro: (playing: boolean) => void
  onMoved: () => void
  onEntered: () => void
  // The walk into the school ended without going in (a key, a drag or a tap took over, or a scene).
  onEnterEnd: () => void
  onAuto: (on: boolean) => void
  // The demo's gate moment: the HUD steps aside while the doors open, then shows the topic as open.
  onStage: (on: boolean) => void
  onGateOpen: (topicId: string) => void
  onBlocked: () => void
}

const FOV = 46
// About 37° down: the child's face shows, and the far part of the frame reaches the sea.
const PITCH = 0.6
// The camera looks a little ahead of the child, so more of the road ahead is in view.
const AHEAD = 3.2
// Island units across the screen at the child, on a phone held upright.
const VIEW_W = 9.8
const INTRO = 3
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

preloadCharacters([...new Set(castOf(useApp.getState().character).map(modelOf))])
useTexture.preload('/logo-gradient.png')

function followDistance(aspect: number) {
  const t = Math.tan(((FOV * Math.PI) / 180) / 2)
  return Math.max(VIEW_W / (2 * t * aspect), 12 / (2 * t))
}

// Buildings hide what stands behind them: a label behind the school or the office is not shown.
const BLOCKS: [Rect, number][] = [
  [{ x: SCHOOL.x, z: SCHOOL.z, hw: SCHOOL.w / 2, hd: SCHOOL.d / 2, rot: SCHOOL.rot }, 4.2],
  [{ x: OFFICE.x, z: OFFICE.z, hw: OFFICE.w / 2, hd: OFFICE.d / 2, rot: OFFICE.rot }, 4.2],
  [{ x: KIOSK.x, z: KIOSK.z, hw: KIOSK.w / 2, hd: KIOSK.d / 2, rot: KIOSK.rot }, 2.4],
]
const rayO = new Vector3(), rayD = new Vector3()
function hidden(eye: Vector3, x: number, y: number, z: number) {
  rayO.copy(eye)
  rayD.set(x - eye.x, y - eye.y, z - eye.z)
  const len = rayD.length()
  rayD.divideScalar(len || 1)
  for (const [r, h] of BLOCKS) {
    // The label of the building itself sits above it and is not hidden by it.
    if (Math.abs(x - r.x) < r.hw + 0.5 && Math.abs(z - r.z) < r.hd + 0.5) continue
    if (rayBox(rayO, rayD, r, h) < len - 0.5) return true
  }
  return false
}

// Picking: a ray against an upright box (a building) or cylinder (a person), in the island's units.
const slab = { t0: 0, t1: 0 }
// One axis of the box: narrows [t0, t1]; false when the ray misses. No allocation, it runs for every label.
function cut(p: number, v: number, lo: number, hi: number) {
  if (Math.abs(v) < 1e-9) return p >= lo && p <= hi
  let a = (lo - p) / v, b = (hi - p) / v
  if (a > b) { const t = a; a = b; b = t }
  if (a > slab.t0) slab.t0 = a
  if (b < slab.t1) slab.t1 = b
  return slab.t0 <= slab.t1
}
function rayBox(o: Vector3, d: Vector3, r: Rect, h: number) {
  const c = Math.cos(r.rot), s = Math.sin(r.rot)
  const ox = (o.x - r.x) * c - (o.z - r.z) * s, oz = (o.x - r.x) * s + (o.z - r.z) * c
  const dx = d.x * c - d.z * s, dz = d.x * s + d.z * c
  slab.t0 = 0; slab.t1 = Infinity
  if (!cut(ox, dx, -r.hw, r.hw) || !cut(o.y, d.y, 0, h) || !cut(oz, dz, -r.hd, r.hd)) return Infinity
  return slab.t0
}

type Anchor = { x: number; y: number; z: number; range: number; prio: number; mate?: string; w: number; h: number; seen: number; sx: number; sy: number; on: boolean; px: number; py: number; el: HTMLElement }
// Placing order: the more important label first, then the one nearer the bottom of the screen (nearer the camera).
const byPlace = (p: Anchor, q: Anchor) => q.prio - p.prio || q.sy - p.sy

type Ctl = {
  inited: boolean
  target: Vector3
  lead: Vector3
  intro: number
  introT: number
  introFrom: { s0: number; s1: number } | null
  skip: boolean
  entering: number
  stage: { topicId: string; t: number; opened: boolean; x: number; z: number } | null
  focusW: number
  beat: number
  cardHold: number
  offY: number
  appliedW: number
  appliedH: number
  appliedOff: number
  kid: string | null
  mark: { x: number; z: number; t: number } | null
  movedSent: boolean
  autoWas: boolean
  edgeX: number
  edgeY: number
  edgeA: number
  hidden: boolean
  frames: number
  enterWalk: boolean
  labelsV: number
}

function Controller({ sim, states, props }: { sim: Sim; states: Record<string, LessonState>; props: IslandProps }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const scene = useThree((s) => s.scene)
  const light = useRef<DirectionalLight>(null)
  const mark = useRef<Mesh>(null)
  const goal = useRef(goalOf(states))
  const cb = useRef(props)
  useLayoutEffect(() => {
    goal.current = goalOf(states)
    cb.current = props
  })
  const ctl = useRef<Ctl>({
    inited: false, target: new Vector3(), lead: new Vector3(), intro: 1, introT: 0, introFrom: null, skip: false, entering: -1, stage: null,
    focusW: 0, beat: -1, cardHold: 0, offY: 0, appliedW: 0, appliedH: 0, appliedOff: -1, kid: null, mark: null, movedSent: false,
    autoWas: false, edgeX: -1, edgeY: -1, edgeA: 0, hidden: false, frames: 0, enterWalk: false, labelsV: -1,
  })

  // Once per scene: the child starts on the road with the first stations in view; the fly-over waits for the
  // loading screen to fade. A Suspense re-show runs layout effects again, so this is guarded.
  useLayoutEffect(() => {
    const c = ctl.current
    if (c.inited) return
    c.inited = true
    // A scene asked before the island was on screen is taken now, without a frame: «Мир» and a reset start fresh
    // with the fly-over, «Класс» puts the child at the school door. The gate scene needs the first frame.
    const s = island.scene
    if (s === 'world' || s === 'reset' || s === 'class') island.scene = null
    const door = PLACES.find((p) => p.id === 'school')!
    const sp = s === 'class' ? { ...door.at, face: door.face } : s === 'world' || s === 'reset' ? SPAWN : island.spawn ?? SPAWN
    island.spawn = null
    sim.place(sp.x, sp.z, sp.face)
    c.target.set(sp.x - Math.sin(YAW) * AHEAD, 0.55, sp.z - Math.cos(YAW) * AHEAD)
    const playIntro = !island.introDone && !reduced.value && s !== 'class' && !island.scene
    c.intro = playIntro ? 0 : 1
    if (!playIntro) island.introDone = true
    cb.current.onIntro(playIntro)
    sim.listen(() => cb.current.onBlocked())
  }, [sim])

  // Hidden (a lesson over the tabs, another tab): keys held go; a spot asked for is taken when shown again.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      const c = ctl.current
      if (!e.isIntersecting) { c.hidden = true; sim.keys.clear(); sim.joy = { x: 0, y: 0, on: false, run: false }; island.joy?.classList.remove('is-on'); return }
      c.hidden = false
      const sp = island.spawn
      if (sp) {
        island.spawn = null
        // The class room closed on the way to a lesson: its exit to the door must not undo the spot by the pad.
        if (island.cmd?.kind === 'exit') island.cmd = null
        sim.place(sp.x, sp.z, sp.face)
        c.target.set(sp.x, 0.55, sp.z)
        c.lead.set(0, 0, 0)
        c.kid = null
      }
    })
    io.observe(gl.domElement)
    const vis = () => { if (document.hidden) sim.keys.clear() }
    document.addEventListener('visibilitychange', vis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [gl, sim])

  const walkToPlace = useCallback((id: PlaceId, then?: () => void) => {
    const pl = PLACES.find((p) => p.id === id)!
    const d = Math.hypot(pl.at.x - sim.me.x, pl.at.z - sim.me.z)
    const face = () => { sim.turn(pl.face); then?.() }
    if (d < 0.3) { face(); return true }
    return sim.goTo(pl.at, d > 7, face)
  }, [sim])

  const showKid = useCallback((name: string | null) => {
    ctl.current.kid = name
    cb.current.onKid(name)
  }, [])

  const endStage = useCallback(() => {
    const c = ctl.current
    if (!c.stage) return
    c.stage = null
    cb.current.onStage(false)
  }, [])

  const run = useCallback((cmd: Command) => {
    const c = ctl.current
    if (cmd.kind === 'lesson') {
      showKid(null)
      endStage()
      const g = goal.current
      const p = roadAt(g.s)
      const ok = sim.goTo({ x: g.x, z: g.z }, true, () => {
        sim.turn(p.heading)
        // Arrival: the beacon flares, a chime, the camera leans in, then the card rises.
        c.beat = 0
        c.cardHold = 0.35
        sfx('ok')
        sim.wave(2)
      }, { auto: true })
      if (ok) sim.wave(1)
    } else if (cmd.kind === 'stop') {
      sim.cancel()
    } else if (cmd.kind === 'enter') {
      showKid(null)
      c.enterWalk = true
      const ok = walkToPlace('school', () => { c.enterWalk = false; sim.emote('interact-right', 0.66); c.entering = 0 })
      // No way to the door: the HUD comes back.
      if (!ok) { c.enterWalk = false; cb.current.onEnterEnd() }
    } else if (cmd.kind === 'exit') {
      const pl = PLACES.find((p) => p.id === 'school')!
      const fx = Math.sin(SCHOOL.rot), fz = Math.cos(SCHOOL.rot)
      sim.place(pl.at.x - fx * 0.3, pl.at.z - fz * 0.3, SCHOOL.rot)
      c.target.set(sim.me.x, 0.55, sim.me.z)
      c.entering = -1
      sim.goTo({ x: pl.at.x + fx * 1.6, z: pl.at.z + fz * 1.6 }, false)
    } else if (cmd.kind === 'release') {
      endStage()
    }
  }, [sim, walkToPlace, showKid, endStage])

  // The demo scene «Офис и телефон»: the child stands before the gate and sees it open, the gate in the middle.
  const showGate = useCallback(() => {
    const g = GATES[0]
    if (!g) return
    const c = ctl.current
    const p = roadAt(g.s - 3.2)
    sim.place(p.x, p.z, p.heading)
    sim.replayGate(g.topicId)
    const fx = (g.x * 2 + p.x) / 3, fz = (g.z * 2 + p.z) / 3
    c.stage = { topicId: g.topicId, t: 0, opened: false, x: fx, z: fz }
    c.target.set(fx, 0.55, fz)
    c.focusW = reduced.value ? 1 : 0
    if (c.intro < 1) { c.intro = 1; island.introDone = true; cb.current.onIntro(false) }
    showKid(null)
    cb.current.onStage(true)
  }, [sim, showKid])

  // A demo scene or a reset, from whatever state the island is in: walks, the door push, the gate moment and cards
  // end first.
  const applyScene = useCallback((s: Scene) => {
    const c = ctl.current
    sim.cancel()
    if (c.enterWalk || c.entering >= 0) cb.current.onEnterEnd()
    c.enterWalk = false
    c.entering = -1
    c.beat = -1
    c.cardHold = 0
    c.mark = null
    endStage()
    showKid(null)
    if (s === 'gate') { showGate(); return }
    if (s === 'class') {
      // The child is inside the school: outside, they stand at its door.
      const pl = PLACES.find((p) => p.id === 'school')!
      sim.place(pl.at.x, pl.at.z, pl.face)
      c.target.set(pl.at.x, 0.55, pl.at.z)
      return
    }
    sim.place(SPAWN.x, SPAWN.z, SPAWN.face)
    c.target.set(SPAWN.x - Math.sin(YAW) * AHEAD, 0.55, SPAWN.z - Math.cos(YAW) * AHEAD)
    c.lead.set(0, 0, 0)
    sim.resetMoved()
    c.movedSent = false
    if (s === 'world') {
      const play = !reduced.value
      c.intro = play ? 0 : 1
      c.introT = 0
      c.introFrom = null
      island.introDone = !play
      cb.current.onIntro(play)
    }
  }, [sim, endStage, showKid, showGate])

  // Touch and mouse: drag anywhere for a floating joystick (far drag runs), tap to walk there or to pick.
  const tap = useCallback((x: number, y: number) => {
    const c = ctl.current
    if (c.intro < 1 || c.entering >= 0) return
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1), camera)
    const o = ray.ray.origin, d = ray.ray.direction
    let best = Infinity
    let pick: (() => void) | null = null
    // People are small targets: a hit on a person wins over a building, and among people the one whose middle is
    // closest to the tap.
    let person = false
    const consider = (t: number, f: () => void, who?: { x: number; z: number }) => {
      if (t === Infinity || (person && !who)) return
      let score = t
      if (who) {
        const px = who.x - o.x, py = 0.7 - o.y, pz = who.z - o.z
        const along = px * d.x + py * d.y + pz * d.z
        score = Math.hypot(px - d.x * along, py - d.y * along, pz - d.z * along)
      }
      if ((who && !person) || score < best) { best = score; pick = f; person = !!who }
    }
    // Groupmates and the robot first: a generous upright box around each.
    sim.mates.forEach((m) => consider(rayBox(o, d, { x: m.x, z: m.z, hw: 0.45, hd: 0.45, rot: 0 }, 1.5), () => {
      showKid(m.name)
      m.emote = { name: 'interact-right', t: 0, dur: 1.3 }
      sim.turn(Math.atan2(m.x - sim.me.x, m.z - sim.me.z))
    }, m))
    consider(rayBox(o, d, { x: sim.bot.x, z: sim.bot.z, hw: 0.5, hd: 0.5, rot: 0 }, 1.5), () => { showKid('robot'); sim.wave(1) }, sim.bot)
    const places: [PlaceId, Rect, number][] = [
      ['school', { x: SCHOOL.x, z: SCHOOL.z, hw: SCHOOL.w / 2, hd: SCHOOL.d / 2, rot: SCHOOL.rot }, 4.3],
      ['office', { x: OFFICE.x, z: OFFICE.z, hw: OFFICE.w / 2, hd: OFFICE.d / 2, rot: OFFICE.rot }, 5.2],
      ['shop', { x: KIOSK.x, z: KIOSK.z, hw: KIOSK.w / 2, hd: KIOSK.d / 2 + 0.4, rot: KIOSK.rot }, 3.4],
      ['quest', { x: QUEST.x, z: QUEST.z, hw: 1.6, hd: 0.3, rot: QUEST.rot }, 2.6],
    ]
    for (const [id, r, h] of places) consider(rayBox(o, d, r, h), () => { showKid(null); walkToPlace(id) })
    if (pick) { (pick as () => void)(); return }
    // The ground: walk there by a path; a pad nearby catches the tap. Across the creek, as far as the way goes.
    if (d.y >= 0) return
    const t = -o.y / d.y
    let p: P = { x: o.x + d.x * t, z: o.z + d.z * t }
    showKid(null)
    for (const st of STATIONS) for (const pad of st.pads) if (Math.hypot(pad.x - p.x, pad.z - p.z) < 1.1) p = { x: pad.x, z: pad.z }
    if (islandU(p.x, p.z) > 1.02) return
    const far = Math.hypot(p.x - sim.me.x, p.z - sim.me.z) > 7
    if (sim.goTo(p, far, undefined, { reach: true })) c.mark = { x: p.x, z: p.z, t: 0 }
  }, [camera, size, sim, showKid, walkToPlace])

  useEffect(() => {
    const el = gl.domElement
    let down: { id: number; x: number; y: number; t: number; ox: number; oy: number; h: number; drag: boolean } | null = null
    const MAX = 62
    const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, h: r.height } }
    const hide = () => { island.joy?.classList.remove('is-on'); sim.joy = { x: 0, y: 0, on: false, run: false } }
    const onDown = (e: PointerEvent) => {
      if (down || e.button > 0) return
      ctl.current.skip = true
      const { x, y, h } = local(e)
      // Steering is measured from where the finger went down; only the drawn base keeps clear of the dock.
      down = { id: e.pointerId, x, y, t: performance.now(), ox: x, oy: y, h, drag: false }
      try { el.setPointerCapture(e.pointerId) } catch { /* a synthetic pointer has nothing to capture */ }
    }
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id || ctl.current.intro < 1 || ctl.current.entering >= 0) return
      const { x, y } = local(e)
      if (!down.drag && Math.hypot(x - down.x, y - down.y) > 10) { down.drag = true; sim.cancel(); showKid(null) }
      if (!down.drag) return
      let dx = x - down.ox, dy = y - down.oy
      let d = Math.hypot(dx, dy)
      // The base follows a finger that goes far, so turning back is instant.
      const reach = MAX * 1.5
      if (d > reach) { down.ox = x - (dx / d) * reach; down.oy = y - (dy / d) * reach; dx = x - down.ox; dy = y - down.oy; d = reach }
      const m = Math.min(1, d / MAX)
      const running = d > MAX * 1.12
      sim.joy = { x: (dx / (d || 1)) * m, y: (dy / (d || 1)) * m, on: m > 0.1, run: running }
      const j = island.joy
      if (j) {
        j.classList.add('is-on')
        j.classList.toggle('is-run', running)
        const by = Math.max(island.insetTop + MAX + 8, Math.min(down.h - island.insetBottom - MAX - 20, down.oy))
        j.style.transform = `translate(${down.ox}px, ${by}px)`
        const k = Math.min(d, MAX)
        const knob = j.firstElementChild as HTMLElement | null
        if (knob) knob.style.transform = `translate(${(dx / (d || 1)) * k}px, ${(dy / (d || 1)) * k}px)`
      }
    }
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const isTap = !down.drag && performance.now() - down.t < 450 && e.type === 'pointerup'
      const { x, y } = down
      down = null
      hide()
      if (isTap) tap(x, y)
    }
    const typing = () => { const a = document.activeElement; return !!a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) }
    const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])
    const onKey = (e: KeyboardEvent) => {
      if (!KEYS.has(e.code)) return
      if (e.type === 'keyup') { sim.keys.delete(e.code); return }
      if (typing() || ctl.current.hidden || !el.isConnected || el.getBoundingClientRect().width === 0) return
      ctl.current.skip = true
      sim.keys.add(e.code)
      if (!e.code.startsWith('Shift')) e.preventDefault()
      showKid(null)
    }
    const clear = () => sim.keys.clear()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', clear)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', clear)
      clear()
      hide()
    }
  }, [gl, sim, tap, showKid])

  // Test hooks for the prototype's screenshots, in development only.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __isle?: object }
    const p = new Vector3()
    w.__isle = {
      place: (x: number, z: number, face = 0) => { const q = sim.resolve({ x, z }, 0.3); sim.place(q.x, q.z, face); ctl.current.target.set(q.x, 0.55, q.z); showKid(null) },
      me: () => ({ ...sim.me }),
      bot: () => ({ ...sim.bot }),
      near: () => sim.near,
      auto: () => sim.auto,
      mates: () => sim.mates.map((m) => ({ name: m.name, x: m.x, z: m.z })),
      screen: (x: number, z: number, y = 0.8) => { p.set(x, y, z).project(camera); return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height } },
      plan: { pads: STATIONS.flatMap((st) => st.pads), places: PLACES, gates: GATES },
      info: () => ({ ...gl.info.render, programs: gl.info.programs?.length, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures }),
      sim,
      intro: () => ctl.current.intro,
      gate: () => playScene('gate'),
      scene: (name: Scene) => playScene(name),
      frames: () => ctl.current.frames,
      time: () => clock.value,
      meshes: () => { const out: Record<string, number> = {}; scene.traverse((o) => { const m = o as Mesh; if (m.isMesh && m.visible) { const k = m.geometry.type + (m.castShadow ? '*' : ''); out[k] = (out[k] ?? 0) + 1 } }); return out },
    }
    return () => { delete w.__isle }
  }, [sim, camera, size, gl, showKid, scene])

  const v = useMemo(() => new Vector3(), [])
  const pos = useMemo(() => new Vector3(), [])
  const look = useMemo(() => new Vector3(), [])
  const anchorRef = useRef(new Map<HTMLElement, Anchor>())
  const shownRef = useRef<Anchor[]>([])
  const elsRef = useRef<HTMLElement[]>([])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    clock.value += reduced.value ? 0 : dt
    const c = ctl.current
    c.frames++
    // A scene clears the commands before it, so a command still queued is newer and runs after it.
    if (island.scene) { const s = island.scene; island.scene = null; applyScene(s) }
    if (island.cmd) { const cmd = island.cmd; island.cmd = null; run(cmd) }
    const me = sim.me

    // Fly-over: once per app load, after the loading screen has faded; ends behind the child. A touch skips it.
    if (c.intro < 1) {
      if (!c.introFrom) {
        const s1 = nearestOnRoad(me.x, me.z).s
        const s0 = Math.min(ROAD_LEN - 2, Math.max(goal.current.s + 12, s1 + 22))
        c.introFrom = { s0, s1 }
      }
      if (island.shown) c.introT += Math.min(delta, 0.25)
      if (c.skip && island.shown) c.introT = Math.max(c.introT, INTRO - 0.3)
      c.intro = Math.min(1, c.introT / INTRO)
      if (c.intro >= 1) { island.introDone = true; cb.current.onIntro(false) }
    }
    c.skip = false

    sim.freeze(c.intro < 1 || c.entering >= 0 || (!!c.stage && c.stage.t < 2.4))
    const walkedBefore = sim.moved
    sim.step(dt)
    // The child walked off during the gate moment: it ends.
    if (c.stage && c.stage.t > 2.4 && sim.moved && !walkedBefore) endStage()
    if (c.stage && sim.path.length) endStage()
    // The walk to the school door was cancelled (a key, a drag, a tap): the HUD comes back.
    if (c.enterWalk && !sim.path.length && c.entering < 0) { c.enterWalk = false; cb.current.onEnterEnd() }
    sim.applyRigs()

    // «К уроку» state for the HUD.
    if (sim.auto !== c.autoWas) { c.autoWas = sim.auto; cb.current.onAuto(sim.auto) }

    // What the child is near shows its card; not while walking to a lesson, and a moment after arriving.
    if (c.cardHold > 0) c.cardHold -= dt
    const near = c.intro < 1 || c.entering >= 0 || sim.auto || c.cardHold > 0 || c.stage ? null : sim.nearest()
    if (sim.setNear(near)) cb.current.onNear(near)
    if (c.kid) {
      // A groupmate's card closes when the child walks away; the robot walks along, so its card closes on the move.
      let other: { x: number; z: number } | null = c.kid === 'robot' ? sim.bot : null
      for (let k = 0; k < sim.mates.length; k++) if (sim.mates[k].name === c.kid) other = sim.mates[k]
      if (!other || Math.hypot(other.x - me.x, other.z - me.z) > 5.5 || (c.kid === 'robot' && me.speed > 1.2)) showKid(null)
    }
    if (sim.moved && !c.movedSent) { c.movedSent = true; cb.current.onMoved() }

    // The gate moment: the doors open about 2.1 s in; then the topic is shown as open.
    if (c.stage) {
      c.stage.t += Math.min(delta, 0.25)
      if (!c.stage.opened && c.stage.t > (reduced.value ? 0.2 : 2.3)) { c.stage.opened = true; cb.current.onGateOpen(c.stage.topicId) }
    }
    const opened = sim.takeOpened()
    if (opened && !c.stage) cb.current.onGateOpen(opened)

    // Entering the school: a short push toward the door, then the HUD shows the class.
    if (c.entering >= 0) {
      c.entering += dt
      if (c.entering > 0.75) { c.entering = -1; cb.current.onEntered() }
    }

    // Camera: follows a point a little ahead of the child, with damping; the gate moment frames the gate.
    v.set(me.vx, 0, me.vz).multiplyScalar(0.28)
    c.lead.lerp(v, 1 - Math.exp(-dt * 3))
    look.set(me.x + c.lead.x - Math.sin(YAW) * AHEAD, 0.55, me.z + c.lead.z - Math.cos(YAW) * AHEAD)
    c.target.lerp(look, reduced.value ? 1 : 1 - Math.exp(-dt * 6))
    const fw = c.stage ? 1 : 0
    c.focusW = reduced.value ? fw : c.focusW + (fw - c.focusW) * (1 - Math.exp(-dt * 3))
    look.copy(c.target)
    if (c.focusW > 0.001 && c.stage) look.lerp(v.set(c.stage.x, 0.8, c.stage.z), c.focusW)
    const aspect = size.width / Math.max(1, size.height)
    let dist = followDistance(aspect) * (1 - 0.06 * c.focusW)
    let pitch = PITCH
    let yaw = YAW
    // The arrival beat: the camera leans in by a tenth and back.
    if (c.beat >= 0) {
      c.beat += dt
      const k = Math.sin(Math.min(1, c.beat / 1.4) * Math.PI)
      dist *= 1 - 0.1 * k
      flare.value = k
      if (c.beat > 1.4) { c.beat = -1; flare.value = 0 }
    }
    if (c.entering >= 0) {
      const e = ease(Math.min(1, c.entering / 0.75))
      const door = PLACES.find((p) => p.id === 'school')!.at
      look.lerp(v.set(door.x, 1.1, door.z), e * 0.6)
      dist *= 1 - 0.45 * e
    }
    if (c.intro < 1 && c.introFrom) {
      // From high over the far end of the road, with sea and sky, down along the road past the stations to the child.
      const e = ease(c.intro)
      const r = roadAt(c.introFrom.s0 + (c.introFrom.s1 - c.introFrom.s0) * e)
      v.set(r.x, 0.55, r.z).lerp(look, smooth(0.62, 1, c.intro))
      look.copy(v)
      dist = Math.exp(Math.log(64) + (Math.log(dist) - Math.log(64)) * e)
      // It starts low enough to see the horizon, tips down to look over the stations, and settles behind the child.
      pitch = c.intro < 0.5 ? 0.3 + (0.95 - 0.3) * smooth(0, 0.5, c.intro) : 0.95 + (PITCH - 0.95) * smooth(0.5, 1, c.intro)
      yaw = YAW - 0.55 * (1 - e)
    }
    pos.set(
      look.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      look.y + Math.sin(pitch) * dist,
      look.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    )
    camera.position.copy(pos)
    camera.lookAt(look)
    seeThrough.eye.value.copy(pos)
    seeThrough.focus.value.set(look.x, c.stage ? 1 : 0.6, look.z)

    // What the camera centres sits in the middle of the free space between the header and the card.
    const want = c.intro < 1 ? 0 : (island.insetBottom - island.insetTop) / 2
    c.offY += (want - c.offY) * (1 - Math.exp(-dt * 5))
    const off = Math.round(c.offY * 2) / 2
    if (off !== c.appliedOff || size.width !== c.appliedW || size.height !== c.appliedH) {
      c.appliedOff = off; c.appliedW = size.width; c.appliedH = size.height
      camera.setViewOffset(size.width, size.height, 0, off, size.width, size.height)
      camera.updateProjectionMatrix()
    }

    // The sun follows the view, so a small shadow map stays sharp where the child is.
    const l = light.current
    if (l) {
      const fx = look.x - Math.sin(yaw) * 4, fz = look.z - Math.cos(yaw) * 4
      l.position.set(fx + 7, 16, fz + 5)
      l.target.position.set(fx, 0, fz)
      l.target.updateMatrixWorld()
    }

    // Tap marker.
    const mk = mark.current
    if (mk) {
      if (c.mark) {
        c.mark.t += dt
        const k = c.mark.t / 0.6
        mk.visible = k < 1
        mk.position.set(c.mark.x, 0.05, c.mark.z)
        mk.scale.setScalar(0.6 + k * 0.6)
        ;(mk.material as MeshBasicMaterial).opacity = 0.8 * (1 - k)
        if (k >= 1) c.mark = null
      } else mk.visible = false
    }

    const top = island.insetTop, bottom = size.height - island.insetBottom

    // Edge pointer toward the current lesson when it is off screen, after the first step.
    const el = island.edge
    let ex = -1, ey = -1, ea = 0
    if (el && c.intro >= 1 && c.entering < 0 && sim.moved && !sim.auto && !c.stage) {
      const g = goal.current
      v.set(g.x, 0.9, g.z).project(camera)
      let sx = ((v.x + 1) / 2) * size.width, sy = ((1 - v.y) / 2) * size.height
      if (v.z > 1) { sx = size.width - sx; sy = size.height - sy }
      const m = 30
      const t0 = top + 40, b0 = bottom - m, l0 = m, r0 = size.width - m
      if (sx < l0 || sx > r0 || sy < t0 || sy > b0) {
        const cx = size.width / 2, cy = (t0 + b0) / 2
        const dx = sx - cx, dy = sy - cy
        const k = Math.min((r0 - cx) / Math.abs(dx || 1e-6), (b0 - cy) / Math.abs(dy || 1e-6))
        ex = Math.round(cx + dx * k); ey = Math.round(cy + dy * k); ea = Math.round(Math.atan2(dy, dx) * 50) / 50
      }
    }
    if (el && (ex !== c.edgeX || ey !== c.edgeY || ea !== c.edgeA)) {
      c.edgeX = ex; c.edgeY = ey; c.edgeA = ea
      if (ex < 0) el.classList.remove('is-on')
      else {
        el.classList.add('is-on')
        el.style.transform = `translate(${ex}px, ${ey}px)`
        el.style.setProperty('--a', `${ea}rad`)
      }
    }

    // Labels over signs, places and groupmates: fixed screen size, shown near the child. Where labels would
    // overlap, the more important one keeps its place (the gate, then signs, groupmates, places) and the other
    // stacks above it; a label under the edge pointer steps aside.
    const anchors = anchorRef.current
    if (c.labelsV !== island.labelsV) {
      c.labelsV = island.labelsV
      elsRef.current = Array.from(island.labels.values())
      for (const [lab] of anchors) if (!lab.isConnected) anchors.delete(lab)
    }
    const els = elsRef.current
    const shown = shownRef.current
    shown.length = 0
    for (let i = 0; i < els.length; i++) {
      const lab = els[i]
      let a = anchors.get(lab)
      if (!a) {
        const ds = lab.dataset
        a = { x: +(ds.x ?? 0), y: +(ds.y ?? 2), z: +(ds.z ?? 0), range: +(ds.range ?? 14), prio: +(ds.prio ?? 1), mate: ds.mate, w: 0, h: 0, seen: 0, sx: 0, sy: 0, on: false, px: -1, py: -1, el: lab }
        anchors.set(lab, a)
      }
      let x = a.x, z = a.z
      if (a.mate) {
        for (let k = 0; k < sim.mates.length; k++) if (sim.mates[k].name === a.mate) { x = sim.mates[k].x; z = sim.mates[k].z }
      }
      a.on = false
      if (c.intro >= 1 && c.entering < 0 && Math.hypot(x - me.x, z - me.z) < a.range && !hidden(pos, x, a.y, z)) {
        v.set(x, a.y, z).project(camera)
        const sx = ((v.x + 1) / 2) * size.width, sy = ((1 - v.y) / 2) * size.height
        if (!a.w || ++a.seen % 60 === 0) {
          const span = lab.firstElementChild as HTMLElement | null
          a.w = span?.offsetWidth ?? 0
          a.h = span?.offsetHeight ?? 0
        }
        if (v.z < 1 && sx > -40 && sx < size.width + 40 && sy - a.h > top + 4 && sy < bottom - 4) {
          // A label near the edge slides in to stay whole on screen.
          const half = a.w / 2 + 8
          a.sx = Math.max(half, Math.min(size.width - half, sx))
          a.sy = sy
          a.on = true
          shown.push(a)
        }
      }
    }
    shown.sort(byPlace)
    for (let i = 0; i < shown.length; i++) {
      const p = shown[i]
      for (let j = 0; j < i; j++) {
        const q = shown[j]
        if (!q.on) continue
        if (Math.abs(p.sx - q.sx) < (p.w + q.w) / 2 + 4 && p.sy > q.sy - q.h - 3 && p.sy - p.h < q.sy + 3) p.sy = q.sy - q.h - 4
      }
      if (p.sy - p.h < top + 4) p.on = false
      // The edge pointer (46 px round) wins over a label.
      if (ex >= 0 && Math.abs(p.sx - ex) < p.w / 2 + 28 && p.sy > ey - 28 && p.sy - p.h < ey + 28) p.on = false
    }
    for (let i = 0; i < els.length; i++) {
      const a = anchors.get(els[i])
      if (!a) continue
      const px = a.on ? Math.round(a.sx) : -1, py = a.on ? Math.round(a.sy) : -1
      if (px === a.px && py === a.py) continue
      if (!a.on) a.el.classList.remove('is-on')
      else { a.el.classList.add('is-on'); a.el.style.transform = `translate(${px}px, ${py}px)` }
      a.px = px; a.py = py
    }
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#c4dcae', 1.2]} />
      <directionalLight
        ref={light}
        intensity={2.1}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />
      <mesh ref={mark} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.32, 0.42, 40]} />
        <meshBasicMaterial color="#ffffff" transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}

// Everything on the island. It mounts once models and fonts are in, which ends the loading state.
function Scene({ props, onReady }: { props: IslandProps; onReady: () => void }) {
  use(texturesReady)
  const sim = useMemo(() => new Sim(), [])
  const states = useLessonStates()
  const officeDone = useApp((s) => s.officeDone)
  const quest = useApp((s) => s.quest)
  const character = useApp((s) => s.character)
  const cast = castOf(character)
  const now = goalOf(states)

  // Groupmates online stand near the pad of the lesson they are on (the rule of the map), away ones are absent.
  const mates = useMemo(() => {
    const out: { index: number; name: string; at: P }[] = []
    for (const st of STATIONS) {
      const topic = TOPICS.find((t) => t.id === st.topicId)!
      st.pads.forEach((pad, li) => {
        kidsAt(topic, li).forEach((kid, j) => {
          const p = roadAt(pad.s + (j % 2 ? 1.1 : -1.1))
          const side = j % 2 ? 1 : -1
          out.push({ index: KIDS.indexOf(kid), name: kid.name, at: { x: p.x + p.nx * side * 1.5, z: p.z + p.nz * side * 1.5 } })
        })
      })
    }
    return out
  }, [])
  useLayoutEffect(() => {
    if (sim.mates.length) return
    sim.setMates(mates.map<MateState>((m, i) => ({
      x: m.at.x, z: m.at.z, face: YAW + (i % 2 ? 0.6 : -0.6), vx: 0, vz: 0, speed: 0, name: m.name, index: m.index,
      anchor: m.at, target: null, wait: 1 + i * 2, greeted: -100, emote: null,
    })))
  }, [sim, mates])

  const setMe = useCallback((r: Rig | null) => sim.setRig('me', r), [sim])
  const mateSetters = useMemo(() => mates.map((_, i) => (r: Rig | null) => sim.setRig(i, r)), [sim, mates])

  // Ready once the island has drawn: its shaders are compiled and the child can walk.
  const frames = useRef(0)
  useFrame(() => { if (++frames.current === 2) onReady() })
  const topicNow = now.key.startsWith('pad:') ? padOf(now.key.slice(4)) : null
  const currentTopic = STATIONS.find((st) => st.pads.some((p) => p.lessonId === topicNow?.lessonId))?.topicId

  return (
    <>
      <Controller sim={sim} states={states} props={props} />
      <SkyDome />
      <Terrain />
      <Water />
      <Creek />
      <Road />
      <Nature />
      <Sky />
      {STATIONS.map((st) => {
        const topic = TOPICS.find((t) => t.id === st.topicId)!
        // Each station is merged on its own, so the camera still skips stations out of view.
        const key = st.pads.map((p) => states[p.lessonId]).join() + (st.topicId === currentTopic)
        return (
          <Merged key={st.topicId} version={key}>
            <Sign station={st} topic={topic} current={st.topicId === currentTopic} />
            <Landmark station={st} current={st.topicId === currentTopic} />
            {st.pads.map((pad) => <Pad key={pad.lessonId} x={pad.x} z={pad.z} state={states[pad.lessonId]} icon={topic.icon} />)}
            {st.gate && <Gate station={st} open={!!officeDone[st.topicId]} sim={sim} />}
          </Merged>
        )
      })}
      <Merged>
        <School />
        <Office />
        <Kiosk />
        <QuestBoard quest={quest} />
        <Fountain />
        <Lighthouse />
        <Dock />
      </Merged>
      <Robot sim={sim} />
      <Lamps />
      <PlazaProps />
      <Dust sim={sim} />
      <Player key={character} file={modelOf(character)} onRig={setMe} />
      {mates.map((m, i) => <Mate key={m.name + cast[m.index]} file={modelOf(cast[m.index])} onRig={mateSetters[i]} />)}
    </>
  )
}

export default function Island(props: IslandProps) {
  const { active, progress } = useProgress()
  const [ready, setReady] = useState(false)
  const [gone, setGone] = useState(false)
  const onReadyProp = props.onReady
  const onReady = useCallback(() => { setReady(true); onReadyProp() }, [onReadyProp])
  // The loading state fades out, then leaves; only then may the fly-over start.
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => { setGone(true); island.shown = true }, 320)
    return () => clearTimeout(id)
  }, [ready])
  // In the phone frame on a wide screen the canvas draws at twice the pixels, so 3D edges stay crisp.
  const dpr = useMemo(() => (matchMedia('(min-width: 900px)').matches ? 2 : Math.min(2, devicePixelRatio || 1)), [])
  return (
    <>
      <Canvas
        shadows="percentage"
        dpr={dpr}
        camera={{ fov: FOV, near: 0.5, far: 420, position: [0, 40, 50] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.toneMapping = NeutralToneMapping }}
      >
        <PauseWhenHidden paused={props.paused} />
        <Suspense fallback={null}>
          <Scene props={props} onReady={onReady} />
        </Suspense>
      </Canvas>
      {!gone && !props.covered && <IslandLoading progress={active ? progress : undefined} done={ready} />}
    </>
  )
}
