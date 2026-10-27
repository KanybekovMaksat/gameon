import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { sfx } from '../../app/sfx'
import { Icon } from '../../components'
import { boxOf, covered, run, same, segsOf, type Box, type Pt, type Prog, type Seg, type Step } from './turtle/geo'
import './turtle.css'

// «Узоры»: a loop draws a picture. The child sets how many times and how far to turn, the turtle draws it
// repeat by repeat while the code view lights the line it runs. Logo's turtle, after Papert's "Mindstorms".

type Key = 'n' | 'a'
type Vals = { n: number; a: number }
type Level = {
  name: string
  goal: string
  target: Prog
  start: Vals
  edit: Key[]
  // Guiding questions, general to specific: about the repeats while there are too few, then about the turn.
  nHints: string[]
  aHints: string[]
  // Why the right program works. Only the exact program passes, so the text names its numbers.
  why: string
}

const LEVELS: Level[] = [
  {
    name: 'Квадрат',
    goal: 'Нарисуй квадрат по серому следу. Сколько раз повторить?',
    target: { n: 4, a: 90, len: 90, inner: 0 },
    start: { n: 2, a: 90 },
    edit: ['n'],
    nHints: ['Посмотри на рисунок. Сколько сторон рисует один повтор?', 'Сколько сторон у квадрата? А сколько повторов в программе?'],
    aHints: [],
    why: 'Один повтор рисует одну сторону. Четыре повтора дают квадрат.',
  },
  {
    name: 'Шестиугольник',
    goal: 'Нарисуй шестиугольник. Подбери число повторов и поворот.',
    target: { n: 6, a: 60, len: 64, inner: 0 },
    start: { n: 4, a: 90 },
    edit: ['n', 'a'],
    nHints: ['Сколько сторон рисует один повтор?', 'Сколько сторон у фигуры? А сколько повторов в программе?'],
    aHints: [
      'Черепашка обошла фигуру и снова смотрит вверх. На сколько она повернулась за все повороты вместе?',
      'Все повороты одинаковые. Каким должен быть каждый, чтобы вместе вышел ровно один полный оборот?',
    ],
    why: '6 поворотов по 60° дают 360°: полный оборот, и фигура замкнулась.',
  },
  {
    name: 'Цветок',
    goal: 'Внутри цикла уже есть квадрат. Повтори его так, чтобы вышел цветок.',
    target: { n: 12, a: 30, len: 58, inner: 4 },
    start: { n: 4, a: 90 },
    edit: ['n', 'a'],
    nHints: ['Что рисует один повтор большого цикла?', 'Сколько квадратов в цветке? А сколько повторов в программе?'],
    aHints: [
      'Цветок замкнётся, когда черепашка сделает полный оборот. Сколько в нём градусов?',
      'Все квадраты повёрнуты на один и тот же угол. Каким он должен быть, чтобы вместе вышел ровно один оборот?',
    ],
    why: '12 квадратов, каждый повёрнут на 30°. Вместе 360°, ровно один оборот.',
  },
]

// The drawing covers the trace but the program does more than needed: extra repeats or extra full turns.
const EXTRA_HINTS = ['Фигура уже замкнулась. Что черепашка делала в последних повторах?', 'Черепашка прошла по своим следам. На каком повторе она вернулась в начало?']
const SPIN_HINTS = ['Рисунок совпал, но черепашка обошла круг несколько раз. Какой поворот обойдёт его ровно один раз?']

const A_SNAP = [15, 20, 30, 36, 40, 45, 60, 72, 90, 108, 120, 135, 144, 150, 180]
const N_MAX = 24
// The turtle and the wedge keep the same size on screen whatever the zoom: they scale with the view against this.
const VIEW = 220

const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const d = n % 10, h = n % 100
  if (d === 1 && h !== 11) return one
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few
  return many
}
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (p: number) => 0.5 - Math.cos(Math.PI * p) / 2
const progOf = (lv: Level, v: Vals): Prog => ({ ...lv.target, n: v.n, a: v.a })
const segD = (segs: Seg[]) => segs.map(([a, b]) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`).join('')

function baseView(lv: Level): Box {
  const b = boxOf(segsOf(run(lv.target)))
  const side = Math.max(b.w, b.h) * 1.2 + 70
  return { x: b.x + b.w / 2 - side / 2, y: b.y + b.h / 2 - side / 2, w: side, h: side }
}
function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

// A run, prepared once: when each step starts, and the path drawn before each step. A frame then adds one partial line.
type Drawing = { steps: Step[]; starts: number[]; total: number; before: string[] }
const pt = (p: Pt) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`

function prepare(steps: Step[]): Drawing {
  const starts: number[] = [], before: string[] = []
  let acc = 0, d = 'M0 0'
  for (const s of steps) {
    starts.push(acc)
    before.push(d)
    acc += s.dur
    if (s.kind === 'fd') d += `L${pt(s.to)}`
  }
  before.push(d)
  return { steps, starts, total: acc, before }
}

// Where the turtle is at time `t`, the step it runs (-1 when done) and the path drawn so far.
function frameAt(dr: Drawing, t: number) {
  const { steps, starts } = dr
  if (!steps.length || t >= dr.total) {
    const last = steps[steps.length - 1]
    return { pos: last ? last.to : { x: 0, y: 0 }, h: last ? last.h1 : 0, cur: -1, d: dr.before[steps.length] }
  }
  let lo = 0, hi = steps.length - 1
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= t) lo = m; else hi = m - 1 }
  const s = steps[lo]
  const p = ease((t - starts[lo]) / s.dur)
  if (s.kind === 'rt') return { pos: s.from, h: s.h0 + (s.h1 - s.h0) * p, cur: lo, d: dr.before[lo] }
  const pos = { x: s.from.x + (s.to.x - s.from.x) * p, y: s.from.y + (s.to.y - s.from.y) * p }
  return { pos, h: s.h0, cur: lo, d: `${dr.before[lo]}L${pt(pos)}` }
}

// The helper's mark, the same shapes as the robot in the lessons, with a pointer that shows the heading.
function TurtleMark({ pos, h, size }: { pos: Pt; h: number; size: number }) {
  const id = useId()
  const r = (h * Math.PI) / 180
  const k = size / 48
  return (
    <g transform={`translate(${pos.x} ${pos.y})`} className="lp-turtle-bot">
      <g transform={`rotate(${h})`}>
        <path d={`M0 ${-size * 0.98}L${size * 0.2} ${-size * 0.7}L${-size * 0.2} ${-size * 0.7}Z`} className="lp-turtle-nose" />
      </g>
      <g transform={`scale(${k}) translate(-24 -24)`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#00c4fa" />
            <stop offset="1" stopColor="#246fff" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="15" fill={`url(#${id})`} />
        <rect x="9" y="12" width="30" height="23" rx="8.5" fill="#fff" />
        <g transform={`translate(${Math.sin(r) * 3} ${-Math.cos(r) * 2.5})`}>
          <rect x="17" y="19.5" width="4.2" height="8.5" rx="2.1" fill="#0a1028" />
          <rect x="26.8" y="19.5" width="4.2" height="8.5" rx="2.1" fill="#0a1028" />
        </g>
      </g>
    </g>
  )
}

// A wedge from the heading `h0` clockwise by `a` degrees, centred at `c`.
function wedgeD(c: Pt, h0: number, a: number, rr: number) {
  const p = (d: number) => ({ x: c.x + Math.sin((d * Math.PI) / 180) * rr, y: c.y - Math.cos((d * Math.PI) / 180) * rr })
  const s = p(h0), e = p(h0 + a)
  return `M${c.x} ${c.y}L${s.x} ${s.y}A${rr} ${rr} 0 ${a > 180 ? 1 : 0} 1 ${e.x} ${e.y}Z`
}

// The angle as a small dial, next to the turn line of the code.
function Dial({ a }: { a: number }) {
  return (
    <svg className="lp-turtle-dial" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d={wedgeD({ x: 12, y: 12 }, 0, a, 9.5)} />
    </svg>
  )
}

// A − or + that steps on release. Held still, it repeats: slowly at first, a little faster later, so the child can let go
// on the number they want. A finger that moves is a scroll, not an answer.
function HoldBtn({ label, onStep, disabled, children }: { label: string; onStep: () => boolean; disabled: boolean; children: ReactNode }) {
  const st = useRef<{ id: number; x: number; y: number; held: boolean; timer: number } | null>(null)
  const step = useRef(onStep)
  useLayoutEffect(() => { step.current = onStep })
  const stop = () => { if (st.current) clearTimeout(st.current.timer); st.current = null }
  useEffect(() => { if (disabled) stop() }, [disabled])
  useEffect(() => stop, [])
  const repeat = (gap: number) => {
    const s = st.current
    if (!s) return
    s.held = true
    if (!step.current()) { stop(); return }
    s.timer = window.setTimeout(() => repeat(Math.max(170, gap - 25)), gap)
  }
  const mine = (e: PointerEvent) => st.current !== null && st.current.id === e.pointerId
  return (
    <button
      type="button"
      className="lp-turtle-hold"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0) return
        stop()
        st.current = { id: e.pointerId, x: e.clientX, y: e.clientY, held: false, timer: window.setTimeout(() => repeat(320), 450) }
      }}
      onPointerMove={(e) => { if (mine(e) && Math.hypot(e.clientX - st.current!.x, e.clientY - st.current!.y) > 8) stop() }}
      onPointerUp={(e) => { if (mine(e) && !st.current!.held) step.current(); stop() }}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onClick={(e) => { if (e.detail === 0) step.current() }}
    >
      {children}
    </button>
  )
}

type Phase = 'idle' | 'run' | 'ok' | 'bad'
type Result = { title: string; text: string; note?: string }

export function TurtleLab() {
  const [lv, setLv] = useState(0)
  const [vals, setVals] = useState<Vals>(LEVELS[0].start)
  const [phase, setPhase] = useState<Phase>('idle')
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [t, setT] = useState(0)
  const [view, setView] = useState<Box>(() => baseView(LEVELS[0]))
  const [result, setResult] = useState<Result | null>(null)
  // The last hint, kept as a neutral «Подумай» line once the child starts to fix the program.
  const [think, setThink] = useState<string | null>(null)
  const glowId = useId()
  const live = useRef({ vals, phase, view, result, wrongN: 0, wrongA: 0, wrongX: 0 })
  useLayoutEffect(() => { Object.assign(live.current, { vals, phase, view, result }) }, [vals, phase, view, result])
  const raf = useRef(0)
  const viewRaf = useRef(0)
  useEffect(() => () => { cancelAnimationFrame(raf.current); cancelAnimationFrame(viewRaf.current) }, [])

  const finished = lv >= LEVELS.length
  const level = LEVELS[Math.min(lv, LEVELS.length - 1)]
  const target = useMemo(() => segsOf(run(level.target)), [level])
  const targetD = useMemo(() => segD(target), [target])
  const base = useMemo(() => baseView(level), [level])

  // Moves the view to `to`; returns how long the move takes.
  function moveView(to: Box, ms = 300) {
    cancelAnimationFrame(viewRaf.current)
    const from = live.current.view
    const far = Math.abs(from.w - to.w) + Math.abs(from.h - to.h) + Math.abs(from.x - to.x) + Math.abs(from.y - to.y)
    if (far < 0.5 || reduced()) { setView(to); return 0 }
    let t0 = -1
    const tick = (now: number) => {
      if (t0 < 0) t0 = now
      const p = ease(Math.min(1, (now - t0) / ms))
      setView({ x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p, w: from.w + (to.w - from.w) * p, h: from.h + (to.h - from.h) * p })
      if (p < 1) viewRaf.current = requestAnimationFrame(tick)
    }
    viewRaf.current = requestAnimationFrame(tick)
    return ms
  }

  function startLevel(i: number) {
    cancelAnimationFrame(raf.current)
    Object.assign(live.current, { wrongN: 0, wrongA: 0, wrongX: 0 })
    setLv(i)
    setPhase('idle')
    setDrawing(null)
    setResult(null)
    setThink(null)
    if (i < LEVELS.length) {
      setVals(LEVELS[i].start)
      cancelAnimationFrame(viewRaf.current)
      setView(baseView(LEVELS[i]))
    }
  }

  // After a wrong try: the verdict goes, the drawing goes, the hint stays as a question to think about.
  function toThink() {
    const r = live.current.result
    live.current.phase = 'idle'
    setPhase('idle')
    setDrawing(null)
    setResult(null)
    setThink(r?.text ?? null)
    moveView(base)
  }

  function change(key: Key, dir: 1 | -1): boolean {
    const v = live.current.vals
    const ph = live.current.phase
    if (ph === 'run' || ph === 'ok') return false
    let next: number
    if (key === 'n') next = Math.max(1, Math.min(N_MAX, v.n + dir))
    else next = A_SNAP[Math.max(0, Math.min(A_SNAP.length - 1, A_SNAP.indexOf(v.a) + dir))]
    if (next === v[key]) return false
    const nv = { ...v, [key]: next }
    live.current.vals = nv
    setVals(nv)
    sfx('tick')
    if (ph === 'bad') toThink()
    return true
  }

  function settle(dr: Drawing) {
    const v = live.current.vals
    const goal = level.target
    const L = live.current
    // Only the exact program passes: a drawing that retraces the trace with extra repeats or extra turns does not.
    if (v.n === goal.n && v.a === goal.a) {
      const lines = goal.inner ? 5 : 3
      const flat = dr.steps.length
      setResult({
        title: 'Точно по следу',
        text: level.why,
        note: `Без цикла: ${flat} ${plural(flat, ['команда', 'команды', 'команд'])}. С циклом: ${lines} ${plural(lines, ['строка', 'строки', 'строк'])}.`,
      })
      setPhase('ok')
      sfx('ok')
      return
    }
    const pick = (list: string[], key: 'wrongN' | 'wrongA' | 'wrongX') => list[Math.min(L[key]++, list.length - 1)]
    const covers = same(segsOf(dr.steps), target)
    let r: Result
    if (covers && v.n > goal.n) r = { title: 'Лишние повторы', text: pick(EXTRA_HINTS, 'wrongX') }
    else if (covers) r = { title: 'Лишние обороты', text: pick(SPIN_HINTS, 'wrongX') }
    else if (v.n < goal.n || !level.aHints.length) r = { title: 'Пока не совпало', text: pick(level.nHints, 'wrongN') }
    else r = { title: 'Пока не совпало', text: pick(level.aHints, 'wrongA') }
    setResult(r)
    setPhase('bad')
    sfx('bad')
  }

  function draw() {
    cancelAnimationFrame(raf.current)
    const dr = prepare(run(progOf(level, live.current.vals)))
    const b = boxOf(segsOf(dr.steps))
    const pad = 18
    const delay = moveView(union(base, { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }))
    setDrawing(dr)
    setResult(null)
    setThink(null)
    live.current.phase = 'run'
    if (reduced()) { setT(dr.total); settle(dr); return }
    setPhase('run')
    setT(0)
    let t0 = -1
    let lastI = -1
    const tick = (now: number) => {
      if (t0 < 0) t0 = now + delay
      const el = Math.max(0, now - t0)
      if (el >= dr.total) { setT(dr.total); settle(dr); return }
      setT(el)
      const i = dr.steps[frameAt(dr, el).cur]?.i ?? -1
      if (i !== lastI && el > 0) { lastI = i; sfx('tap') }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  const onMain = () => {
    if (finished) { sfx('tap'); startLevel(0); return }
    if (phase === 'ok') {
      sfx(lv === LEVELS.length - 1 ? 'finish' : 'tap')
      startLevel(lv + 1)
      return
    }
    if (phase === 'bad') { sfx('tap'); toThink(); return }
    draw()
  }

  // Drawn lines after the run: on the trace in blue; off the trace, or drawn by extra repeats, in amber.
  const marked = useMemo(() => {
    if (!drawing || (phase !== 'ok' && phase !== 'bad')) return null
    const fds = drawing.steps.filter((s) => s.kind === 'fd')
    const off = (s: Step) => s.i >= level.target.n || !covered([s.from, s.to], target)
    const seg = (s: Step): Seg => [s.from, s.to]
    return { all: segD(fds.map(seg)), on: segD(fds.filter((s) => !off(s)).map(seg)), off: segD(fds.filter(off).map(seg)) }
  }, [drawing, phase, level, target])

  // One repeat, drawn as a dashed ghost with its turn: what the loop body does with the numbers set now.
  const ghost = useMemo(() => {
    if (phase !== 'idle') return null
    const one = run(progOf(level, { ...vals, n: 1 }))
    return { d: segD(segsOf(one)), turn: one[one.length - 1] }
  }, [phase, level, vals])

  if (finished) {
    return (
      <div className="lp-turtle">
        <div className="lp-turtle-scroll lp-turtle-end" key="end">
          <div className="lp-turtle-gallery">
            {LEVELS.map((l, i) => {
              const b = baseView(l)
              const d = segD(segsOf(run(l.target)))
              return (
                <svg key={l.name} viewBox={`${b.x + 30} ${b.y + 30} ${b.w - 60} ${b.h - 60}`} aria-label={l.name}>
                  <path className="lp-turtle-glow is-on" d={d} filter={`url(#${glowId}${i})`} />
                  <path className="lp-turtle-ink" d={d} />
                  <defs><filter id={`${glowId}${i}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter></defs>
                </svg>
              )
            })}
          </div>
          <h2>Три узора готовы</h2>
          <p>Ты не рисовал каждую линию. Ты сказал, что повторять и сколько раз, а черепашка сделала остальное.</p>
        </div>
        <div className="lp-turtle-foot">
          <button className="btn btn-block" onClick={onMain}><Icon name="redo" size={18} />Ещё раз</button>
        </div>
      </div>
    )
  }

  const running = phase === 'run'
  const shown = drawing && phase !== 'idle' ? frameAt(drawing, t) : null
  const cur = shown && shown.cur >= 0 ? drawing!.steps[shown.cur] : null
  const turtle = shown ?? { pos: { x: 0, y: 0 }, h: 0 }
  const k = Math.max(view.w, view.h) / VIEW

  // The steppers stay in place while the turtle draws, only disabled, so nothing on screen moves.
  const editable = !running && phase !== 'ok'
  const stepper = (key: Key, what: string) => {
    const v = vals[key]
    const lo = key === 'n' ? v <= 1 : v <= A_SNAP[0]
    const hi = key === 'n' ? v >= N_MAX : v >= A_SNAP[A_SNAP.length - 1]
    return (
      <span className="lp-turtle-steppers">
        <HoldBtn label={`Меньше: ${what}`} disabled={!editable || lo} onStep={() => change(key, -1)}><i className="lp-turtle-minus" /></HoldBtn>
        <HoldBtn label={`Больше: ${what}`} disabled={!editable || hi} onStep={() => change(key, 1)}><i className="lp-turtle-plus" /></HoldBtn>
      </span>
    )
  }
  const val = (key: Key, suffix = '') => (
    <span className={'lp-turtle-val' + (level.edit.includes(key) ? ' is-edit' : '')} key={`${key}${vals[key]}`}>{vals[key]}{suffix}</span>
  )
  const counter = (text: string | false | null) => text && <span className="lp-turtle-count">{text}</span>
  const line = (no: number, indent: number, body: ReactNode, right?: ReactNode) => (
    <div className={'lp-turtle-line' + (cur?.line === no ? ' is-now' : '')} style={{ ['--ind' as string]: indent }} key={no}>
      <span className="lp-turtle-src">{body}</span>
      {right}
    </div>
  )
  const nested = level.target.inner > 0
  const outerCount = counter(running && cur && `${cur.i + 1} из ${vals.n}`)
  const innerCount = counter(running && cur && cur.line !== 4 && `${cur.j + 1} из ${level.target.inner}`)
  const outerRight = level.edit.includes('n') && stepper('n', 'повторов')
  const turnRight = (
    <span className="lp-turtle-right">
      <Dial a={vals.a} />
      {level.edit.includes('a') && stepper('a', 'угол поворота')}
    </span>
  )
  const code = nested ? [
    line(0, 0, <><b className="k">повтори</b> {val('n')}:{outerCount}</>, outerRight),
    line(1, 1, <><b className="k">повтори</b> <span className="n">{level.target.inner}</span>:{innerCount}</>),
    line(2, 2, <><b className="k">вперёд</b> <span className="n">{level.target.len}</span></>),
    line(3, 2, <><b className="k">направо</b> <span className="n">{360 / level.target.inner}°</span></>),
    line(4, 1, <><b className="k">направо</b> {val('a', '°')}</>, turnRight),
  ] : [
    line(0, 0, <><b className="k">повтори</b> {val('n')}:{outerCount}</>, outerRight),
    line(1, 1, <><b className="k">вперёд</b> <span className="n">{level.target.len}</span></>),
    line(2, 1, <><b className="k">направо</b> {val('a', '°')}</>, turnRight),
  ]

  const tone = running ? 'run' : phase === 'ok' ? 'ok' : phase === 'bad' ? 'bad' : think ? 'think' : 'idle'

  return (
    <div className="lp-turtle">
      <div className="lp-turtle-scroll" key={lv}>
        <div className="lp-turtle-head">
          <span>Уровень {lv + 1} из {LEVELS.length} · <b>{level.name}</b></span>
          <span className="lp-turtle-dots" aria-hidden>
            {LEVELS.map((l, i) => <i key={l.name} className={i < lv ? 'is-done' : i === lv ? 'is-now' : ''} />)}
          </span>
        </div>
        <p className="lp-turtle-goal">{level.goal}</p>

        <div className={'lp-turtle-canvas' + (nested ? ' is-dense' : '')} data-state={tone === 'think' ? 'think' : phase}>
          <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Образец: ${level.name.toLowerCase()}`}>
            <defs>
              <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={4 * k} /></filter>
            </defs>
            <path className="lp-turtle-target" d={targetD} />
            {ghost?.turn && (
              <g className="lp-turtle-ghost">
                <path d={ghost.d} />
                <path className="lp-turtle-wedge" d={wedgeD(ghost.turn.from, ghost.turn.h0, ghost.turn.h1 - ghost.turn.h0, 22 * k)} />
              </g>
            )}
            {marked ? (
              <>
                <path className={'lp-turtle-glow' + (phase === 'ok' ? ' is-on' : '')} d={marked.all} filter={`url(#${glowId})`} />
                <path className="lp-turtle-ink" d={marked.on} />
                <path className="lp-turtle-ink is-off" d={marked.off} />
              </>
            ) : shown && <path className="lp-turtle-ink" d={shown.d} />}
            <TurtleMark pos={turtle.pos} h={turtle.h} size={22 * k} />
          </svg>
          {phase === 'ok' && result?.note && <span className="lp-turtle-note">{result.note}</span>}
        </div>

        <div className="code lp-turtle-code" aria-label="Программа">{code}</div>
      </div>

      <div className="lp-turtle-foot">
        <div className={`lp-turtle-fb is-${tone}`} role="status" key={tone + (result?.text ?? think ?? '')}>
          <span className="lp-turtle-fb-icon">
            {tone === 'idle' ? <i className="lp-turtle-dash" /> : <Icon name={tone === 'run' ? 'loop' : tone === 'ok' ? 'check' : tone === 'bad' ? 'x' : 'spark'} size={18} />}
          </span>
          <div>
            {tone === 'run' && <b>Повтор {(cur?.i ?? vals.n - 1) + 1} из {vals.n}</b>}
            {tone === 'idle' && <span>Пунктир показывает один повтор. Цикл повторит его столько раз, сколько ты скажешь.</span>}
            {tone === 'think' && <><b>Подумай</b><span>{think}</span></>}
            {(tone === 'ok' || tone === 'bad') && <><b>{result?.title}</b><span>{result?.text}</span></>}
          </div>
        </div>
        <button className={'btn btn-block' + (phase === 'ok' ? ' btn-ok' : '')} disabled={running} onClick={onMain}>
          {phase === 'ok' && <>{lv === LEVELS.length - 1 ? 'Завершить' : 'Дальше'}<Icon name="arrow" size={18} /></>}
          {phase === 'bad' && 'Исправить'}
          {(phase === 'idle' || running) && <><Icon name="play" size={18} />{running ? 'Рисую' : 'Рисовать'}</>}
        </button>
      </div>
    </div>
  )
}
