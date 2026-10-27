import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import { sfx } from '../../../app/sfx'
import { Icon } from '../../../components'
import { CMD_WORD, countCommands, parseMap, plural, simulate, type Frame, type Level, type Pos } from '../../../exercises/robot'
import { Board, CmdIcon, type Mark } from '../../../exercises/robot-view'
import '../../../exercises/exercises.css'
import { HINTS, LEVELS, type DrawLevel } from './levels'
import { bestFold, isOpen, pathSteps, program, same, stepOfCmd, type Fold } from './logic'
import '../draw.css'

// «Нарисуй путь»: the child draws the robot's path with a finger and sees the commands appear, then runs it.
// After a good run the app shows the loop hidden in the path: the copies numbered on the board, the strip folding
// into «повтори N раз». Action, then picture, then code; the loop is explained, not built.

type Phase = 'draw' | 'run' | 'ok' | 'bad'
type Fail = keyof typeof HINTS
type Result = { name: string; from: number; to: number }
type Span = { lo: number; hi: number }

const STEP_MS = 360
const FIRST_MS = 260
const SETTLE_MS = 300
// The command strip: chip width, gap and row height (a loop block is the tallest item).
const CHIP = 35
const GAP = 4
const ROW = 48
const MIN_CELL = 36
const MAX_CELL = 60
const NOTE_MAX = 80
// The reveal after a good run: a pause, the copies numbered one by one, then the strip folds.
const REVEAL_AT = 450
const COPY_MS = 110
const FOLD_AFTER = 700

const startFrame = (lv: Level): Frame => ({ ...lv.start, turn: 0, at: null, rep: null, iter: 0, got: [], bump: false })
const cmdsWord = (n: number) => plural(n, 'команда', 'команды', 'команд')
const timesWord = (n: number) => plural(n, 'раз', 'раза', 'раз')
const samePath = (a: Pos[], b: Pos[]) => a.length === b.length && a.every((p, i) => same(p, b[i]))

function UndoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 14L4.5 9.5 9 5" /><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3" />
    </svg>
  )
}

const center = (p: Pos) => [p.x + 0.5, p.y + 0.5]

// A polyline through cell centers from cell `from` to cell `to`, cut back at the ends by a part of a cell.
function line(path: Pos[], from: number, to: number, cutA: number, cutB: number) {
  const pts = path.slice(from, to + 1).map(center)
  if (pts.length < 2) return ''
  const cut = (a: number[], b: number[], d: number) => [a[0] + (b[0] - a[0]) * d, a[1] + (b[1] - a[1]) * d]
  const n = pts.length - 1
  pts[0] = cut(pts[0], pts[1], cutA)
  pts[n] = cut(pts[n], pts[n - 1], cutB)
  return pts.map((p) => p.map((v) => v.toFixed(3)).join(',')).join(' ')
}

// The point halfway along the path between two cells, where a pass gets its number.
function midpoint(path: Pos[], lo: number, hi: number) {
  const m = (lo + hi) / 2
  const a = center(path[Math.floor(m)])
  const b = center(path[Math.ceil(m)])
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

// The ink over the board: the drawn path, the pen end while drawing, a wall that stopped the finger,
// and after a good run the numbered copies of the piece that repeats.
function Ink({ lv, path, phase, fold, bump, nudge }: {
  lv: Level; path: Pos[]; phase: Phase; fold: Fold | null; bump: { x: number; y: number; n: number } | null; nudge: number
}) {
  const last = path.length - 1
  const end = path[last]
  const atGoal = !!lv.goal && same(end, lv.goal)
  // The line starts at the robot's edge and stops before the flag, or before the robot where a short run left it.
  const cuts = (lo: number, hi: number, gap: number) => [lo === 0 ? 0.34 : gap, hi === last ? (atGoal ? 0.3 : phase === 'bad' ? 0.34 : gap) : gap]
  const seg = (s: Span, cls: string, gap: number) => {
    const [a, b] = cuts(s.lo, s.hi, gap)
    return <polyline className={cls} points={line(path, s.lo, s.hi, a, b)} />
  }
  const [a0, b0] = cuts(0, last, 0)
  return (
    <svg className={'lp-draw-ink is-' + phase} viewBox={`0 0 ${lv.cols} ${lv.rows}`} aria-hidden>
      {path.length === 1 && phase === 'draw' && (
        <circle key={nudge} className={'lp-draw-start' + (nudge ? ' is-nudge' : '')} cx={end.x + 0.5} cy={end.y + 0.5} r="0.45" />
      )}
      {last > 0 && <polyline className="lp-draw-line" points={line(path, 0, last, a0, b0)} />}
      {fold && Array.from({ length: fold.n }, (_, j) => {
        const lo = fold.start + j * fold.len
        const [mx, my] = midpoint(path, lo, lo + fold.len)
        return (
          <g key={j} className="lp-draw-pass" style={{ ['--i' as string]: j }}>
            {seg({ lo, hi: lo + fold.len }, 'lp-draw-pass-line', 0.12)}
            <circle cx={mx} cy={my} r="0.2" className="lp-draw-badge" />
            <text x={mx} y={my} className="lp-draw-badge-n">{j + 1}</text>
          </g>
        )
      })}
      {phase === 'draw' && last > 0 && !atGoal && (
        <circle key={`e${nudge}`} className={'lp-draw-pen' + (nudge ? ' is-nudge' : '')} cx={end.x + 0.5} cy={end.y + 0.5} r="0.17" />
      )}
      {bump && <rect key={bump.n} className="lp-draw-bump" x={bump.x + 0.06} y={bump.y + 0.06} width="0.88" height="0.88" rx="0.2" />}
    </svg>
  )
}

// The board takes the height left over, and the strip keeps room for the whole expected program, so nothing jumps.
// Measured when the level opens and when the screen changes size; the footer growing under feedback does not count.
function useFit(root: RefObject<HTMLDivElement | null>, body: RefObject<HTMLDivElement | null>, box: RefObject<HTMLDivElement | null>,
  strip: RefObject<HTMLDivElement | null>, note: RefObject<HTMLDivElement | null>, lv: Level, len: number) {
  const [fit, setFit] = useState({ cell: 48, strip: ROW + 14 })
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const b = body.current
      const bx = box.current
      const st = strip.current
      const col = bx?.parentElement
      if (!b || !bx || !st || !col) return
      const cs = getComputedStyle(b)
      const ss = getComputedStyle(st)
      const inner = st.clientWidth - parseFloat(ss.paddingLeft) - parseFloat(ss.paddingRight)
      const perRow = Math.max(1, Math.floor((inner + GAP) / (CHIP + GAP)))
      const rows = Math.ceil(len / perRow)
      const stripH = Math.ceil(rows * ROW + (rows - 1) * 4 + parseFloat(ss.paddingTop) + parseFloat(ss.paddingBottom) + 3)
      // The column stretches to the body, so add up what is not the board instead of reading the column's height.
      let other = (parseFloat(getComputedStyle(col).rowGap) || 0) * (col.children.length - 1) + stripH - st.offsetHeight
      for (const k of col.children) if (k !== bx) other += (k as HTMLElement).offsetHeight
      // The note above the button grows to three lines with a hint; keep room for that, so it never covers the program.
      const noteGrow = Math.max(0, NOTE_MAX - (note.current?.offsetHeight ?? NOTE_MAX))
      const free = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - other - 8 - noteGrow
      const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(free / lv.rows), Math.floor((col.clientWidth - 8) / lv.cols)))
      setFit((o) => (o.cell === cell && o.strip === stripH ? o : { cell, strip: stripH }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [root, body, box, strip, note, lv, len])
  return fit
}

function LevelView({ level, index, total, onNext }: { level: DrawLevel; index: number; total: number; onNext: (r: Result) => void }) {
  const lv = useMemo(() => parseMap(level.map), [level.map])
  const goal = lv.goal as Pos
  const home = useMemo(() => [{ x: lv.start.x, y: lv.start.y }], [lv])
  const [path, setPath] = useState<Pos[]>(home)
  const pathRef = useRef(path)
  const [history, setHistory] = useState<Pos[][]>([])
  const [phase, setPhase] = useState<Phase>('draw')
  const [frame, setFrame] = useState(0)
  // Wrong runs by kind, for hints that go from general to specific.
  const [tries, setTries] = useState<Record<Fail, number>>({ short: 0, stars: 0 })
  const [fail, setFail] = useState<Fail>('short')
  // The reveal after a good run: 0 nothing yet, 1 the copies numbered on the path, 2 the strip folded into a loop.
  const [reveal, setReveal] = useState(0)
  const [bump, setBump] = useState<{ x: number; y: number; n: number } | null>(null)
  const [nudge, setNudge] = useState(0)
  const drag = useRef<{ id: number; before: Pos[]; wall: string | null } | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const hitRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLDivElement>(null)
  const fit = useFit(rootRef, bodyRef, boxRef, stripRef, noteRef, lv, level.len)

  const steps = useMemo(() => pathSteps(lv, path), [lv, path])
  const drawn = useMemo(() => program(steps, []), [steps])
  const fold = useMemo(() => (phase === 'ok' ? bestFold(steps) : null), [phase, steps])
  const looped = useMemo(() => (fold ? program(steps, [fold]) : drawn), [fold, steps, drawn])
  const atGoal = same(path[path.length - 1], goal)
  const shown = phase === 'run' || phase === 'ok' || phase === 'bad'
  const run = useMemo(() => (shown ? simulate(lv, drawn) : null), [shown, lv, drawn])
  const lastFrame = run ? run.frames.length - 1 : 0
  const f = run ? run.frames[Math.min(frame, lastFrame)] : startFrame(lv)
  const folded = phase === 'ok' && reveal >= 2 && !!fold
  const count = folded ? countCommands(looped) : drawn.length

  // The robot drives the drawn path one command per tick; the result shows after it settles on the last cell.
  useEffect(() => {
    if (phase !== 'run' || !run) return
    if (frame >= lastFrame) {
      const t = setTimeout(() => {
        if (run.outcome === 'goal') {
          setPhase('ok')
          sfx('ok')
          return
        }
        const kind: Fail = run.outcome === 'stars' ? 'stars' : 'short'
        setFail(kind)
        setTries((n) => ({ ...n, [kind]: n[kind] + 1 }))
        setPhase('bad')
        sfx('bad')
      }, SETTLE_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setFrame((n) => n + 1), frame === 0 ? FIRST_MS : STEP_MS)
    return () => clearTimeout(t)
  }, [phase, frame, run, lastFrame])

  // After a good run the loop reveals itself. With reduced motion it is there at once.
  useEffect(() => {
    if (phase !== 'ok' || !fold) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const t1 = setTimeout(() => { setReveal(1); if (!still) sfx('tick') }, still ? 0 : REVEAL_AT)
    const t2 = setTimeout(() => { setReveal(2); sfx('coin') }, still ? 0 : REVEAL_AT + fold.n * COPY_MS + FOLD_AFTER)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [phase, fold])

  // A wall that stopped the finger lights up for a moment.
  useEffect(() => {
    if (!bump) return
    const t = setTimeout(() => setBump(null), 400)
    return () => clearTimeout(t)
  }, [bump])

  const setP = (p: Pos[]) => { pathRef.current = p; setPath(p) }
  const pointAt = (e: RPointerEvent) => {
    const r = (hitRef.current as HTMLDivElement).getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * lv.cols, y: ((e.clientY - r.top) / r.height) * lv.rows }
  }

  // Drawing. A stroke starts on the robot or on any cell of the path (the path is cut back there) and grows cell by cell.
  // After a wrong run the child fixes the path right here: the first touch clears the old verdict.
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (phase !== 'draw' && phase !== 'bad')) return
    const pt = pointAt(e)
    const cur = pathRef.current
    const i = cur.findIndex((p) => p.x === Math.floor(pt.x) && p.y === Math.floor(pt.y))
    if (phase === 'bad') { setPhase('draw'); setFrame(0) }
    if (i < 0) { setNudge((n) => n + 1); return }
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, before: cur, wall: null }
    if (i < cur.length - 1) setP(cur.slice(0, i + 1))
    setNudge(0)
    sfx('tick')
  }

  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const s = drag.current
    if (!s || s.id !== e.pointerId) return
    const pt = pointAt(e)
    const cx = Math.floor(pt.x)
    const cy = Math.floor(pt.y)
    // A cell counts once the finger is well inside it: no flicker on the border between two cells.
    const rx = pt.x - cx
    const ry = pt.y - cy
    if (rx < 0.15 || rx > 0.85 || ry < 0.15 || ry > 0.85) return
    let p = pathRef.current
    let added = 0
    let wall: Pos | null = null
    for (let guard = 0; guard < 32; guard++) {
      const last = p[p.length - 1]
      if (last.x === cx && last.y === cy) break
      // Dragging back along the fresh end of the path erases it.
      const j = p.findIndex((q) => q.x === cx && q.y === cy)
      if (j >= 0 && j >= p.length - 4) { p = p.slice(0, j + 1); break }
      if (same(last, goal)) break
      // A fast finger skips cells: walk toward it one cell at a time, along the axis it moved most.
      const sx = Math.sign(cx - last.x)
      const sy = Math.sign(cy - last.y)
      const order = Math.abs(pt.x - last.x - 0.5) >= Math.abs(pt.y - last.y - 0.5) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]]
      let next: Pos | null = null
      for (const [dx, dy] of order) {
        if (!dx && !dy) continue
        const n = { x: last.x + dx, y: last.y + dy }
        if (!isOpen(lv, n.x, n.y)) {
          if (n.x >= 0 && n.y >= 0 && n.x < lv.cols && n.y < lv.rows) wall ??= n
          continue
        }
        if (p.some((q) => same(q, n))) continue
        next = n
        break
      }
      if (!next) break
      p = [...p, next]
      added++
    }
    if (p !== pathRef.current) setP(p)
    if (added) {
      s.wall = null
      sfx(same(p[p.length - 1], goal) ? 'coin' : 'tick')
    } else if (wall) {
      const k = `${wall.x},${wall.y}`
      if (s.wall !== k) {
        s.wall = k
        const w = wall
        setBump((b) => ({ ...w, n: (b?.n ?? 0) + 1 }))
        sfx('bad')
      }
    }
  }

  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const s = drag.current
    if (!s || s.id !== e.pointerId) return
    drag.current = null
    if (!samePath(s.before, pathRef.current)) setHistory((h) => [...h, s.before])
  }

  const undo = () => {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setP(prev)
    sfx('tap')
  }
  const clear = () => {
    if (path.length < 2) return
    setHistory((h) => [...h, path])
    setP(home)
    sfx('tap')
  }
  const start = () => { setFrame(0); setReveal(0); setPhase('run'); sfx('tap') }
  const retry = () => { setFrame(0); setPhase('draw'); sfx('tap') }

  // The board.
  const marks = new Map<string, Mark>()
  if (run) for (let i = 0; i <= Math.min(frame, lastFrame); i++) marks.set(`${run.frames[i].x},${run.frames[i].y}`, 'trail')

  // The strip: live commands while drawing; during the reveal the repeated part lights up, then folds into a loop.
  const inCopies = (id: number) => {
    const s = stepOfCmd(id)
    return reveal === 1 && !!fold && s !== null && s >= fold.start && s < fold.start + fold.len * fold.n
  }
  const chipCls = (id: number) => 'lp-draw-chip'
    + ((phase === 'run' && f.at === id) || inCopies(id) ? ' is-hot' : '')
    + (phase === 'ok' && !inCopies(id) ? ' is-ok' : '')
  const strip = phase === 'draw'
    ? (drawn.length
      ? drawn.map((it, i) => (
        <span key={`${i}${it.t}`} className="lp-draw-chip is-in" role="img" aria-label={CMD_WORD[it.t as 'F']}><CmdIcon t={it.t as 'F'} size={20} /></span>
      ))
      : <span className="lp-draw-empty">Команды появятся здесь, пока ты рисуешь.</span>)
    : (folded ? looped : drawn).map((it) => {
      if (it.t !== 'rep') return <span key={it.id} className={chipCls(it.id)} role="img" aria-label={CMD_WORD[it.t]}><CmdIcon t={it.t} size={20} /></span>
      return (
        <span key={it.id} className="lp-draw-rep is-new is-ok" role="img" aria-label={`Повтори ${it.n} ${timesWord(it.n)}: ${it.body.map((c) => CMD_WORD[c.t]).join(', ')}`}>
          <span className="lp-draw-rep-n"><small>повтори</small><b>{it.n} {timesWord(it.n)}</b></span>
          {it.body.map((c) => <span key={c.id} className="lp-draw-chip is-ok"><CmdIcon t={c.t} size={20} /></span>)}
        </span>
      )
    })

  // The line above the main button: a tip while drawing, the result after the run, the loop after a good run.
  const tone = phase === 'ok' ? ' is-ok' : phase === 'bad' ? ' is-bad' : ''
  let note
  if (phase === 'ok') {
    const text = !fold ? `${count} ${cmdsWord(count)}.` : reveal >= 2 ? level.reveal(fold.n, timesWord(fold.n)) : 'Смотри, что повторяется в пути.'
    note = <><Icon name="check" size={20} /><span className="lp-draw-note-text"><b>Робот на флажке!</b>{text}</span></>
  } else if (phase === 'bad') {
    const got = f.got.length
    const title = fail === 'stars' ? `Робот собрал ${got} из ${lv.stars.length} ${plural(lv.stars.length, 'звезды', 'звёзд', 'звёзд')}.` : 'Робот не доехал до флажка.'
    const hints = HINTS[fail]
    note = <><Icon name="x" size={20} /><span className="lp-draw-note-text"><b>{title}</b>{hints[Math.min(tries[fail], hints.length) - 1]}</span></>
  } else {
    let tip: string
    if (phase === 'run') tip = 'Робот едет по твоему пути.'
    else if (nudge) tip = path.length > 1 ? 'Продолжай с конца пути или с любой его клетки.' : 'Начни с клетки, где стоит робот.'
    else if (atGoal) tip = 'Путь готов. Нажми «Пуск».'
    else if (path.length > 1) tip = 'Веди к флажку. Можно отпустить палец и продолжить с конца пути.'
    else tip = 'Поставь палец на робота и веди его путь к флажку.'
    note = <span className="lp-draw-note-text">{tip}</span>
  }

  const lastLevel = index + 1 >= total
  return (
    <div className="lp-draw" ref={rootRef}>
      <div className="lp-draw-body" ref={bodyRef}>
        <div className="lp-draw-col">
          <div className="lp-draw-head">
            <div className="lp-draw-level">
              <span>Уровень {index + 1} из {total} · {level.name}</span>
              <span className="lp-draw-segs" aria-hidden>{Array.from({ length: total }, (_, i) => <i key={i} className={i <= index ? 'is-on' : ''} />)}</span>
            </div>
            <p className="lp-draw-goal">{level.goal}</p>
          </div>
          <div className="lp-draw-board" ref={boxRef} style={{ width: lv.cols * fit.cell + 8 }}>
            <Board lv={lv} frame={f} marks={marks} cell={fit.cell} tone={phase === 'ok' ? 'ok' : phase === 'bad' ? 'bad' : undefined} win={phase === 'ok'} />
            <Ink lv={lv} path={path} phase={phase} fold={phase === 'ok' && reveal >= 1 ? fold : null} bump={bump} nudge={nudge} />
            {(phase === 'draw' || phase === 'bad') && (
              <div
                ref={hitRef}
                className="lp-draw-hit"
                aria-label="Поле. Веди пальцем от робота к флажку"
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onLostPointerCapture={up}
              />
            )}
          </div>
          <div className={'lp-draw-prog' + tone + (phase === 'run' ? ' is-code' : '')}>
            <div className="lp-draw-prog-head">
              <span>{folded ? 'С циклом' : 'Команды пути'}</span>
              <span className={'lp-draw-count' + tone}>
                {folded && <s>{drawn.length}</s>}<b key={count}>{count}</b> {cmdsWord(count)}
              </span>
            </div>
            <div className="lp-draw-strip" ref={stripRef} style={{ minHeight: fit.strip }}>{strip}</div>
          </div>
        </div>
      </div>
      <div className="lp-draw-foot">
        <div ref={noteRef} className={'lp-draw-note' + tone} aria-live="polite">{note}</div>
        <div className="lp-draw-actions">
          {phase === 'draw' && (
            <>
              <button className="btn btn-secondary btn-icon" aria-label="Отменить" title="Отменить" disabled={!history.length} onClick={undo}><UndoIcon /></button>
              <button className="btn btn-secondary btn-icon" aria-label="Стереть путь" title="Стереть путь" disabled={path.length < 2} onClick={clear}><CmdIcon t="back" size={22} /></button>
              <button className="btn lp-draw-main" disabled={path.length < 2} onClick={start}><Icon name="play" size={18} />Пуск</button>
            </>
          )}
          {phase === 'run' && <button className="btn lp-draw-main" disabled>Робот едет</button>}
          {phase === 'bad' && <button className="btn lp-draw-main" onClick={retry}>Исправить</button>}
          {phase === 'ok' && (
            <button className="btn btn-ok lp-draw-main" onClick={() => onNext({ name: level.name, from: drawn.length, to: fold ? countCommands(looped) : drawn.length })}>
              {lastLevel ? 'Завершить' : 'Дальше'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Finish({ results, onAgain }: { results: Result[]; onAgain: () => void }) {
  return (
    <div className="lp-draw">
      <div className="lp-draw-body">
        <div className="lp-draw-col lp-draw-fin">
          <span className="lp-draw-fin-mark"><Icon name="check" size={30} /></span>
          <h2>Три пути пройдены</h2>
          <p>В каждом пути нашёлся повтор. Цикл пишет повтор один раз, и программа становится короче.</p>
          <ul className="lp-draw-fin-list">
            {results.map((r) => (
              <li key={r.name}>
                <span className="lp-draw-fin-name"><b>{r.name}</b><small>{r.from} {cmdsWord(r.from)}, с циклом {r.to}</small></span>
                <span className="lp-draw-fin-bars" aria-hidden>
                  <i style={{ width: '100%' }} />
                  <i className="is-to" style={{ width: `${(r.to / r.from) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="lp-draw-foot">
        <div className="lp-draw-actions"><button className="btn lp-draw-main" onClick={onAgain}><Icon name="redo" size={18} />Ещё раз</button></div>
      </div>
    </div>
  )
}

export function DrawLesson() {
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  if (idx >= LEVELS.length) return <Finish results={results} onAgain={() => { setResults([]); setIdx(0); sfx('tap') }} />
  return (
    <LevelView
      key={idx}
      level={LEVELS[idx]}
      index={idx}
      total={LEVELS.length}
      onNext={(r) => {
        setResults((rs) => [...rs, r])
        setIdx(idx + 1)
        sfx(idx + 1 >= LEVELS.length ? 'finish' : 'tap')
      }}
    />
  )
}
