import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { sfx } from '../../../app/sfx'
import { CMD_WORD, STEP, plural, type Level, type Run, type Simple } from '../../../exercises/robot'
import { CmdIcon, RobotMark } from '../../../exercises/robot-view'

// The count of the repeat block: a wide track with a detent per number and a thumb that snaps to it.
// Drag it or tap a number; each new number ticks. While the robot runs, the passes done fill the track.
const PAD = 20 // half the thumb: the first and last detents sit this far from the ends

// A touch on the slider or on a chip becomes a drag only after a clear sideways move.
// A vertical move scrolls the page (the surfaces allow `pan-y`), and the browser then cancels the pointer.
type Gesture = { id: number; x0: number; y0: number; on: boolean }
const SLOP = 6
// Touch captures the pointer to the element under the finger (the thumb, an icon) until we capture it ourselves;
// that hand-over fires `lostpointercapture` on the child, which bubbles up and must not end the drag.
const lostOwn = (e: PointerEvent) => e.target === e.currentTarget
function intentOf(g: Gesture, e: PointerEvent) {
  const dx = Math.abs(e.clientX - g.x0)
  const dy = Math.abs(e.clientY - g.y0)
  if (dx > SLOP && dx > dy * 1.2) return 'drag'
  if (dy > SLOP * 1.5) return 'scroll'
  return null
}

export function CountSlider({ value, min, max, locked, busy, pass, onChange }: {
  value: number; min: number; max: number; locked?: boolean; busy?: boolean; pass: number; onChange: (n: number) => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [drag, setDrag] = useState(false)
  const frozen = locked || busy
  const at = (v: number) => `calc(${PAD}px + (100% - ${PAD * 2}px) * ${(v - min) / (max - min)})`

  const set = (v: number) => {
    const n = Math.max(min, Math.min(max, v))
    if (n === value) return
    sfx('tick')
    onChange(n)
  }
  const fromX = (x: number) => {
    const r = track.current!.getBoundingClientRect()
    return Math.round(min + ((x - r.left - PAD) / (r.width - PAD * 2)) * (max - min))
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (frozen || !e.isPrimary) return
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    if (!g.on) {
      const intent = intentOf(g, e)
      if (intent === 'scroll') { gesture.current = null; return }
      if (intent !== 'drag') return
      g.on = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag(true)
    }
    set(fromX(e.clientX))
  }
  // A tap without a drag jumps to the number under the finger.
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    if (!g.on) set(fromX(e.clientX))
    end()
  }
  const end = () => { gesture.current = null; setDrag(false) }
  const key = (e: KeyboardEvent) => {
    if (frozen) return
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]
    if (d) { e.preventDefault(); set(value + d) }
  }
  // The filled part: up to the chosen number, or up to the pass the robot is on.
  const fill = busy ? Math.max(pass, min) : value
  const ticks = []
  for (let v = min; v <= max; v++) {
    const cls = 'lp-dial-tick' + (v <= fill && !(busy && pass === 0) ? ' is-in' : '') + (v === value ? ' is-val' : '')
    ticks.push(<span key={v} className={cls} style={{ left: at(v) }}><i /><b>{v}</b></span>)
  }
  return (
    <div
      ref={track}
      className={'lp-dial-track' + (drag ? ' is-drag' : '') + (locked ? ' is-locked' : '') + (busy ? ' is-busy' : '')}
      role="slider"
      tabIndex={frozen ? -1 : 0}
      aria-label="Сколько раз повторить"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={frozen || undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={end}
      onLostPointerCapture={(e) => { if (lostOwn(e)) end() }}
      onKeyDown={key}
    >
      <span className="lp-dial-rail"><span style={{ width: `calc((100% - 8px) * ${(fill - min) / (max - min)})`, opacity: busy && pass === 0 ? 0 : 1 }} /></span>
      {ticks}
      <span className="lp-dial-thumb" style={{ left: at(value) }}>{value}</span>
    </div>
  )
}

// The commands inside the repeat block. Tap a chip to remove it; drag it sideways to move it.
// While a chip is dragged, the parent gets the order it would have, so the path on the board follows the finger.
const SLOT = 50 // chip width 44 + gap 6

export function BodyRow({ body, max, locked, busy, now, onChange, onPreview }: {
  body: Simple[]; max: number; locked?: boolean; busy?: boolean; now: number | null
  onChange: (b: Simple[]) => void; onPreview: (b: Simple[] | null) => void
}) {
  const gesture = useRef<(Gesture & { chip: number; from: number }) | null>(null)
  // The chip being dragged: its start slot, the slot it would take and how far the finger went.
  const [drag, setDrag] = useState<{ id: number; from: number; to: number; dx: number; moved: boolean } | null>(null)
  const frozen = locked || busy
  const remove = (id: number) => { sfx('tap'); onChange(body.filter((c) => c.id !== id)) }

  const down = (e: PointerEvent<HTMLButtonElement>, c: Simple) => {
    if (frozen || !e.isPrimary) return
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, chip: c.id, from: body.indexOf(c) }
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    if (!g.on) {
      const intent = intentOf(g, e)
      if (intent === 'scroll') { gesture.current = null; return }
      if (intent !== 'drag') return
      g.on = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    const dx = e.clientX - g.x0
    const to = Math.max(0, Math.min(body.length - 1, g.from + Math.round(dx / SLOT)))
    if (to !== (drag?.to ?? g.from)) { sfx('tick'); onPreview(reorder(body, g.from, to)) }
    setDrag({ id: g.chip, from: g.from, to, dx, moved: true })
  }
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    gesture.current = null
    if (!g.on) { remove(g.chip); return }
    const to = drag?.to ?? g.from
    setDrag(null)
    onPreview(null)
    if (to !== g.from) onChange(reorder(body, g.from, to))
  }
  // A second finger, a scroll that took over or a lost capture: the drag ends and nothing changes.
  const cancel = () => {
    if (!gesture.current && !drag) return
    gesture.current = null
    setDrag(null)
    onPreview(null)
  }

  return (
    <div className={'lp-dial-body' + (drag?.moved ? ' is-dragging' : '')}>
      {body.map((c, i) => {
        const me = drag?.id === c.id
        // The DOM order stays while dragging, so the chip keeps the pointer: the others slide aside instead.
        let shift = 0
        if (drag?.moved) {
          if (me) shift = Math.max(-drag.from * SLOT, Math.min((body.length - 1 - drag.from) * SLOT, drag.dx))
          else if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -SLOT
          else if (drag.to < drag.from && i >= drag.to && i < drag.from) shift = SLOT
        }
        return (
          <button
            key={c.id}
            className={'lp-dial-chip' + (me && drag?.moved ? ' is-lift' : '') + (now === c.id ? ' is-now' : '') + (frozen ? ' is-fixed' : '')}
            style={shift || (me && drag?.moved) ? { transform: `translateX(${shift}px)${me ? ' scale(1.06)' : ''}` } : undefined}
            aria-label={frozen ? CMD_WORD[c.t] : `${CMD_WORD[c.t]}, команда ${i + 1}. Нажми, чтобы убрать`}
            tabIndex={frozen ? -1 : undefined}
            onPointerDown={(e) => down(e, c)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
            onLostPointerCapture={(e) => { if (lostOwn(e)) cancel() }}
            onKeyDown={(e) => { if (!frozen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); remove(c.id) } }}
          >
            <CmdIcon t={c.t} size={22} />
          </button>
        )
      })}
      {!frozen && body.length < max && <span className="lp-dial-slot" aria-hidden />}
      {body.length === 0 && <span className="lp-dial-empty">Добавь команду</span>}
    </div>
  )
}

function reorder<T>(list: T[], from: number, to: number) {
  const out = [...list]
  const [x] = out.splice(from, 1)
  out.splice(to, 0, x)
  return out
}

// The loop as a short program in Russian words, redrawn with every change. The line the robot runs lights up.
export function CodeView({ n, body, nowLine, flash }: { n: number; body: Simple[]; nowLine: number | null; flash: number }) {
  const flat = n * body.length
  return (
    <div className="lp-dial-code-wrap">
      <pre className="code lp-dial-code" aria-label={`Код: повтори ${n} ${plural(n, 'раз', 'раза', 'раз')}`}>
        <span className={'lp-dial-line' + (nowLine === 0 ? ' is-now' : '')}>
          <span className="k">повтори</span> <span key={flash} className="n lp-dial-num">{n}</span>:
        </span>
        {body.map((c, i) => (
          <span key={c.id} className={'lp-dial-line is-in' + (nowLine === i + 1 ? ' is-now' : '')}>{CMD_WORD[c.t]}</span>
        ))}
        {body.length === 0 && <span className="lp-dial-line is-in"><span className="c">пусто</span></span>}
      </pre>
      <p className="lp-dial-flat">Без цикла: <b>{flat}</b> {plural(flat, 'строка', 'строки', 'строк')}</p>
    </div>
  )
}

// The ghost: where the robot would go with the program as it is now, drawn over the board.
// A dashed line through every cell, the number of each finished pass where it ends, a ring on each star it would take,
// a cross where it would hit a wall, or else a pale robot where it would stop. One mark per cell corner, so nothing piles up.
export function Ghost({ lv, run, dim }: { lv: Level; run: Run; dim: boolean }) {
  const pts: [number, number][] = []
  for (const f of run.frames) {
    const p: [number, number] = [f.x + 0.5, f.y + 0.5]
    const last = pts[pts.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p)
  }
  const end = run.frames[run.frames.length - 1]
  let crash: [number, number] | null = null
  if (run.failId !== null) {
    const [dx, dy] = STEP[end.dir]
    crash = [end.x + 0.5 + dx * 0.44, end.y + 0.5 + dy * 0.44]
    pts.push(crash)
  }
  // A pass is finished when its last command ran; its number goes where the robot stands then.
  const passes = new Map<string, { x: number; y: number; k: number }>()
  run.frames.forEach((f, i) => {
    if (f.rep === null) return
    const next = run.frames[i + 1]
    const closes = !next || next.iter !== f.iter
    // The cell where the robot hits a wall shows only the cross.
    const onCrash = crash !== null && f.x === end.x && f.y === end.y
    if (closes && !onCrash) passes.set(`${f.x},${f.y}`, { x: f.x, y: f.y, k: f.iter })
  })
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
  return (
    <div className={'lp-dial-ghost' + (dim ? ' is-dim' : '')} aria-hidden>
      <svg viewBox={`0 0 ${lv.cols} ${lv.rows}`} width="100%" height="100%">
        {end.got.map((s) => <circle key={s} className="lp-dial-ring" cx={lv.stars[s].x + 0.5} cy={lv.stars[s].y + 0.5} r={0.36} />)}
        {pts.length > 1 && <path className="lp-dial-path" d={d} />}
        {crash && (
          <g className="lp-dial-cross" transform={`translate(${crash[0]} ${crash[1]})`}>
            <circle r={0.2} />
            <path d="M-0.08 -0.08L0.08 0.08M0.08 -0.08L-0.08 0.08" />
          </g>
        )}
        {[...passes.values()].map((p) => (
          <g key={`${p.x},${p.y}`} className="lp-dial-pass" transform={`translate(${p.x + 0.5 + 0.3} ${p.y + 0.5 - 0.3})`}>
            <circle r={0.17} />
            <text dy="0.01">{p.k}</text>
          </g>
        ))}
      </svg>
      {!dim && !crash && pts.length > 1 && (
        <span className="lp-dial-shade" style={{ left: `${(end.x / lv.cols) * 100}%`, top: `${(end.y / lv.rows) * 100}%`, width: `${100 / lv.cols}%`, height: `${100 / lv.rows}%` }}>
          <RobotMark dir={end.dir} />
        </span>
      )}
    </div>
  )
}
