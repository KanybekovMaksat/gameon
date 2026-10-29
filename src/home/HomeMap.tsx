import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent } from 'react'
import { navigate } from '../app/router'
import { Sheet } from '../app/Sheet'
import { sfx } from '../app/sfx'
import { useApp, useLessonStates, type LessonState } from '../app/store'
import { Avatar, Icon, KIDS, type Kid } from '../components'
import { TOPICS } from '../content'
import type { Lesson, Topic } from '../content/types'
import { kidsAt } from './kids'
import { ClassNow, HomeTop, QuestCard } from './parts'
import './map.css'

// The road: one curve through every topic. Each topic is one bend of the road: its station stands at one edge,
// the road swings to the other edge, and the next topic's station waits there. Stops sit on the curve by their height.
const GAP = 86
// Room above the child's stop for the "you are here" pin.
const HERE_GAP = 44

type Side = 'left' | 'right'
type Station = { kind: 'station'; key: string; x: number; y: number; topic: Topic; side: Side; reached: boolean; room: number }
type Gate = { kind: 'gate'; key: string; x: number; y: number; topic: Topic; side: Side; open: boolean }
type Stop = { kind: 'lesson'; key: string; x: number; y: number; topic: Topic; lesson: Lesson; state: LessonState; kids: Kid[]; side: Side; stacked: boolean }
type Point = [number, number]
type Bend = [Point, Point, Point, Point]

// Where the child stands: the current lesson; else the office gate the topic waits for; else the last lesson.
function hereKey(states: Record<string, LessonState>) {
  const now = Object.keys(states).find((id) => states[id] === 'now')
  if (now) return now
  const waits = TOPICS.find((t) => t.lessons.some((l) => states[l.id] === 'office'))
  if (waits) return waits.id + ':gate'
  return TOPICS[TOPICS.length - 1].lessons.at(-1)!.id
}

const ease = (u: number) => u * u * (3 - 2 * u)

function layout(w: number, states: Record<string, LessonState>) {
  const c = w / 2
  const amp = Math.min(116, Math.max(88, c - 62))
  const here = hereKey(states)
  const items: (Station | Gate | Stop)[] = []
  const bends: Bend[] = []
  let y = 30
  let reached = true
  TOPICS.forEach((topic, ti) => {
    const dir = ti % 2 ? 1 : -1
    const x0 = c + dir * amp
    const x1 = c - dir * amp
    const y0 = y
    items.push({ kind: 'station', key: topic.id, x: x0, y: y0, topic, side: dir < 0 ? 'right' : 'left', reached, room: c + amp - 34 })
    const inner: Stop[] = []
    const step = (key: string) => {
      y += GAP + (key === here ? HERE_GAP : 0)
      if (key === here) reached = false
    }
    // The office checkpoint stands on a straight stretch right after the station, so the gate lies level across the road.
    let top = y0
    if (topic.office) {
      step(topic.id + ':gate')
      items.push({ kind: 'gate', key: topic.id + ':gate', x: x0, y, topic, side: dir < 0 ? 'right' : 'left', open: !topic.lessons.some((l) => states[l.id] === 'office') })
      bends.push([[x0, y0], [x0, y0 + (y - y0) / 3], [x0, y - (y - y0) / 3], [x0, y]])
      top = y
    }
    topic.lessons.forEach((lesson, li) => {
      step(lesson.id)
      inner.push({ kind: 'lesson', key: lesson.id, x: 0, y, topic, lesson, state: states[lesson.id], kids: kidsAt(topic, li), side: 'right', stacked: false })
    })
    y += GAP
    const h = y - top
    for (const s of inner) {
      s.x = x0 + (x1 - x0) * ease((s.y - top) / h)
      s.side = s.x <= c ? 'right' : 'left'
      if (s.kids.length) {
        const room = s.side === 'right' ? w - s.x - 50 : s.x - 50
        const n = Math.min(3, s.kids.length)
        s.stacked = 34 + 20 * (n - 1) + kidsLabel(s.kids).length * 7 > room
      }
    }
    items.push(...inner)
    // The road bends from here to the next station: a cubic with vertical ends and y linear in t.
    bends.push([[x0, top], [x0, top + h / 3], [x1, y - h / 3], [x1, y]])
  })
  const at = items.find((s) => s.key === here)!
  return { items, bends, height: y, here: at, ...roadAt(bends, at.y) }
}

// Splits the road at height y into the walked part and the part ahead.
function roadAt(bends: Bend[], y: number) {
  const k = bends.findIndex((b) => y <= b[3][1])
  const b = bends[k]
  const t = (y - b[0][1]) / (b[3][1] - b[0][1])
  const mix = (p: Point, q: Point): Point => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
  const a1 = mix(b[0], b[1]), a2 = mix(b[1], b[2]), a3 = mix(b[2], b[3])
  const m1 = mix(a1, a2), m2 = mix(a2, a3), p = mix(m1, m2)
  const d = (list: Bend[]) => `M${list[0][0].join(' ')}` + list.map((q) => ` C${q[1].join(' ')} ${q[2].join(' ')} ${q[3].join(' ')}`).join('')
  return {
    walked: d([...bends.slice(0, k), [b[0], a1, m1, p]]),
    ahead: d([[p, m2, a3, b[3]], ...bends.slice(k + 1)]),
  }
}

// A browser restarts CSS animations when a hidden tab shows again; an animation that has played is switched off.
const played = (e: AnimationEvent<Element>) => { if (e.target === e.currentTarget) e.currentTarget.classList.add('is-drawn') }

const kidsLabel = (kids: Kid[]) => (kids.length === 1 ? kids[0].name : `${kids[0].name} и ещё ${kids.length - 1}`)

function LessonNode({ stop, onClick }: { stop: Stop; onClick: () => void }) {
  const { state, kids, topic } = stop
  const cls = state === 'done' ? 'is-done' : state === 'now' || state === 'open' ? 'is-now' : 'is-locked'
  return (
    <div className="map-node" style={{ left: stop.x, top: stop.y }}>
      {kids.length > 0 && (
        <div className={'map-kids is-' + stop.side + (stop.stacked ? ' is-stacked' : '')} title={kids.map((k) => k.name).join(', ')}>
          <div className="stack">{kids.slice(0, 3).map((k) => <Avatar key={k.name} kid={k} />)}</div>
          <small>{kidsLabel(kids)}</small>
        </div>
      )}
      <button className={'node ' + cls + (state === 'open' ? ' is-open' : '')} onClick={onClick} aria-label={`Урок «${stop.lesson.title}»`}>
        {state === 'done' ? <Icon name="check" size={26} /> : state === 'locked' ? <Icon name="lock" /> : state === 'office' ? <Icon name="building" /> : <Icon name={topic.icon} size={26} />}
      </button>
    </div>
  )
}

function StationSign({ stop, done }: { stop: Station; done: number }) {
  const { topic } = stop
  return (
    <div className={'map-station is-' + stop.side + (stop.reached ? ' is-reached' : '')} style={{ left: stop.x, top: stop.y }}>
      <span className="map-icon"><Icon name={topic.icon} size={22} /></span>
      <div className="map-label" style={{ maxWidth: stop.room }}>
        <b>{topic.title}<span className="map-count">{done} из {topic.lessons.length}</span></b>
        <small>{topic.subtitle}</small>
      </div>
    </div>
  )
}

// The lesson with the teacher is a checkpoint on the road: the gate stays shut until that lesson opens the subject.
function OfficeGate({ stop }: { stop: Gate }) {
  return (
    <div className={'map-gate is-' + stop.side + (stop.open ? ' is-open' : '')} style={{ left: stop.x, top: stop.y }}>
      <span className="map-bar"><i /><i /></span>
      <div className="map-label">
        <b><Icon name="building" size={16} />Урок с учителем</b>
        <small>{stop.open ? 'Предмет открыт' : 'После него откроется предмет'}</small>
      </div>
    </div>
  )
}

type Picked = { topic: Topic; lesson: Lesson; state: LessonState }

function MapRoad({ onPick }: { onPick: (p: Picked) => void }) {
  const states = useLessonStates()
  const done = useApp((s) => s.done)
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // Behind another tab the home is hidden and measures 0; the road keeps its last layout, so the scroll stays.
    const measure = () => { if (el.clientWidth) setW(el.clientWidth) }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])
  const map = w ? layout(w, states) : null
  // The walked line draws in from where the child stood before: the whole line on open, only the new stretch
  // when the stop moves. Lengths are measured before paint; a repeated run for the same line keeps its start.
  const walked = useRef<SVGPathElement>(null)
  const drawn = useRef<{ d: string; len: number; from: number } | null>(null)
  const line = map?.walked
  useLayoutEffect(() => {
    const el = walked.current
    if (!el || !line) return
    if (drawn.current?.d !== line) {
      const len = el.getTotalLength()
      drawn.current = { d: line, len, from: Math.max(0, len - (drawn.current?.len ?? 0)) }
    }
    el.style.setProperty('--len', String(drawn.current.len))
    el.style.setProperty('--from', String(drawn.current.from))
  }, [line])
  const here = map?.here
  const start = here?.kind === 'lesson' && here.state === 'now' ? here : null
  const lift = here?.kind === 'gate' ? 18 : here?.kind === 'lesson' && here.state === 'now' ? 36 : 32

  return (
    <div className="map" ref={box} style={{ height: map?.height }}>
      {map && here && (
        <>
          <svg className="map-road" width={w} height={map.height} aria-hidden>
            <path className="map-road-ahead" d={map.ahead} />
            {/* Keyed by the child's stop: the walked line draws in again when the stop moves. */}
            <path key={here.key} ref={walked} className="map-road-walked" d={map.walked} onAnimationEnd={played} />
          </svg>
          {map.items.map((s) =>
            s.kind === 'station' ? <StationSign key={s.key} stop={s} done={s.topic.lessons.filter((l) => done[l.id]).length} />
              : s.kind === 'gate' ? <OfficeGate key={s.key} stop={s} />
                : <LessonNode key={s.key} stop={s} onClick={() => onPick({ topic: s.topic, lesson: s.lesson, state: s.state })} />,
          )}
          <div key={here.key} className="map-me" onAnimationEnd={played} style={{ left: here.x, top: here.y - lift - 10 }}>
            {start
              ? <button className="map-me-in" aria-label={`Начать урок «${start.lesson.title}»`} onClick={() => onPick({ topic: start.topic, lesson: start.lesson, state: start.state })}><Avatar kid={KIDS[0]} /><span>Начать</span></button>
              : <div className="map-me-in"><Avatar kid={KIDS[0]} /></div>}
          </div>
        </>
      )}
    </div>
  )
}

function LessonSheet({ picked, onClose }: { picked: Picked; onClose: () => void }) {
  const { topic, lesson, state } = picked
  const open = state === 'now' || state === 'open' || state === 'done'
  const count = lesson.practice.length
  return (
    <Sheet label={lesson.title} className="lesson-sheet" onClose={onClose}>
      {(close) => (
        <>
          <div className="ex-kind">{topic.title}</div>
          <h3>{lesson.title}</h3>
          {open && <p className="t-small">{count} {count < 5 ? 'задания' : 'заданий'} · около {lesson.minutes} минут</p>}
          {state === 'locked' && <p className="t-small">Сначала пройди урок перед этим. Так каждая тема ложится на уже понятную.</p>}
          {state === 'office' && <p className="t-small">{topic.office}</p>}
          {open
            ? <button className="btn btn-block" onClick={() => navigate(`/lesson/${lesson.id}`)}>{state === 'done' ? 'Пройти ещё раз' : 'Начать урок'}</button>
            : <button className="btn btn-secondary btn-block" onClick={close}>Понятно</button>}
        </>
      )}
    </Sheet>
  )
}

export function HomeMap() {
  const states = useLessonStates()
  const [picked, setPicked] = useState<Picked | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const nowId = Object.keys(states).find((id) => states[id] === 'now')

  // The map opens at the top (greeting, class, quest), scrolled only as far as the current lesson needs to clear
  // the tab bar. When the current lesson moves (a finished lesson, the office unlock) the map brings it to the
  // middle. Behind a lesson or another tab the map is hidden and measures 0: the scroll waits until it shows.
  const seen = useRef<string | undefined>(undefined)
  const pending = useRef<'open' | 'moved' | null>('open')
  useEffect(() => {
    if (seen.current !== undefined && seen.current !== (nowId ?? '')) pending.current = 'moved'
    seen.current = nowId ?? ''
    const box = scroller.current
    if (!box) return
    const follow = () => {
      const mode = pending.current
      const node = box.querySelector<HTMLElement>('.node.is-now:not(.is-open)')
      if (!mode || !node || !box.clientHeight) return
      pending.current = null
      const b = box.getBoundingClientRect()
      const r = node.getBoundingClientRect()
      const bar = box.closest('.tabs-layer')?.querySelector('.tabbar')?.getBoundingClientRect()
      const bottom = bar?.height ? Math.min(b.bottom, bar.top) : b.bottom
      if (mode === 'moved') {
        const top = r.top - b.top + box.scrollTop
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches
        box.scrollTo({ top: Math.max(0, top - (bottom - b.top) / 2), behavior: still ? 'auto' : 'smooth' })
      } else if (r.bottom + 24 > bottom) box.scrollTo({ top: box.scrollTop + r.bottom + 24 - bottom })
    }
    follow()
    const ro = new ResizeObserver(follow)
    ro.observe(box)
    const map = box.querySelector('.map')
    if (map) ro.observe(map)
    return () => ro.disconnect()
  }, [nowId])

  return (
    <div className="home">
      <div className="home-scroll" ref={scroller}>
        <HomeTop />
        <ClassNow />
        <QuestCard />
        <MapRoad onPick={(p) => { sfx('tap'); setPicked(p) }} />
        <div className="map-end">Дальше новые темы. Они откроются по ходу курса.</div>
      </div>
      {picked && <LessonSheet picked={picked} onClose={() => setPicked(null)} />}
    </div>
  )
}
