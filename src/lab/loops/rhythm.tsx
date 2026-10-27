import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { useApp } from '../../app/store'
import { Icon } from '../../components'
import { audio, hit, play, setMuted, ui, useMuted } from './rhythm/audio'
import {
  diagnose, emptyBuild, expandBuild, expandLevel, hint, INST_NAME, LEVELS, MAX_REPEAT, STEPS, steps, times, written,
  type Build, type Inst, type Level, type Miss,
} from './rhythm/levels'
import './rhythm.css'

// «Ритм»: the child hears a target rhythm and builds it from one bar of 4 steps and a repeat count.
// A timeline shows the target and the child's rhythm step by step, so the task works with the sound off too.

type State = 'idle' | 'active' | 'ok' | 'bad'
type Playing = { who: 'target' | 'mine'; i: number } | null

// Each instrument has its own shape, so rows read without color and without sound.
function Mark({ inst, size = 12 }: { inst: Inst; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 12 12', 'aria-hidden': true, className: 'lp-rhythm-mark' }
  if (inst === 'kick') return <svg {...p}><circle cx="6" cy="6" r="5" fill="currentColor" /></svg>
  if (inst === 'clap') return <svg {...p}><path d="M6 .8 11.2 6 6 11.2.8 6z" fill="currentColor" /></svg>
  return <svg {...p}><path d="M6 1.2 11.2 10.8H.8z" fill="currentColor" /></svg>
}

function Stop() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" /></svg>
}

function PlayBtn({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button className={'btn btn-secondary btn-sm lp-rhythm-play' + (on ? ' is-on' : '')} onClick={onClick} aria-pressed={on}>
      {on ? <Stop /> : <Icon name="play" size={16} />}{on ? 'Стоп' : label}
    </button>
  )
}

// One rhythm as a strip of steps: a row per instrument, steps grouped in bars of 4.
// `cols` is shared by both strips so their steps line up; `loopEnd` is where the repeats stop.
function Roll({ seq, cols, insts, loopEnd, mine, head, diff, ok }: {
  seq: number[]; cols: number; insts: Inst[]; loopEnd: number; mine?: boolean; head: number | null; diff?: boolean[]; ok?: boolean
}) {
  const groups: number[][] = []
  for (let i = 0; i < cols; i++) (groups[Math.floor(i / STEPS)] ??= []).push(i)
  return (
    <div className={'lp-rhythm-roll' + (mine ? ' is-mine' : '') + (ok ? ' is-ok' : '')} aria-hidden>
      <div className="lp-rhythm-roll-keys">{insts.map((k) => <Mark key={k} inst={k} size={9} />)}</div>
      {groups.map((g, gi) => (
        <div key={gi} className="lp-rhythm-bar" style={{ flex: g.length }}>
          {g.map((i) => {
            const cls = ['lp-rhythm-col']
            if (i >= seq.length) cls.push('is-void')
            else if (i >= loopEnd) cls.push('is-tail')
            if (head === i) cls.push('is-head')
            if (diff?.[i]) cls.push('is-diff')
            return (
              <div key={i} className={cls.join(' ')} style={{ '--i': i } as CSSProperties}>
                {insts.map((k, r) => <i key={k} className={i < seq.length && seq[i] & (1 << r) ? 'is-hit' : ''} />)}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// The result above the main button: a check in green, an `x` in amber, and a neutral «Подумай» once the child edits.
function Feedback({ st, text, why }: { st: State; text: string; why: string }) {
  if (st === 'ok') {
    return (
      <div className="lp-rhythm-fb is-ok" role="status">
        <b><Icon name="check" size={18} />Верно!</b>
        <p>{why}</p>
      </div>
    )
  }
  if (!text) return null
  const bad = st === 'bad'
  return (
    <div className={'lp-rhythm-fb ' + (bad ? 'is-bad' : 'is-hint')} role="status" key={bad ? text : 'hint'}>
      <b>{bad ? <><Icon name="x" size={18} />Не совсем</> : <><Icon name="spark" size={16} />Подумай</>}</b>
      <p>{text}</p>
    </div>
  )
}

// A press on the grid: a tap toggles the cell on release; a clear sideways move paints along the row;
// a vertical move is left to the browser, so the page scrolls.
type Gesture = { id: number; r: number; s: number; x0: number; y0: number; mode: 'press' | 'paint'; on: boolean; last: number }
const SLOP = 8

function Stage({ k, lv, last, onNext }: { k: number; lv: Level; last: boolean; onNext: () => void }) {
  const [b, setB] = useState<Build>(() => emptyBuild(lv))
  const bRef = useRef(b)
  const [st, setSt] = useState<State>('idle')
  const [miss, setMiss] = useState<Miss | null>(null)
  const [hintText, setHintText] = useState('')
  const [tries, setTries] = useState<Partial<Record<Miss['kind'], number>>>({})
  const [checked, setChecked] = useState<number[] | null>(null)
  const [playing, setPlaying] = useState<Playing>(null)
  const [press, setPress] = useState('')
  const stopRef = useRef<(() => void) | null>(null)
  const gest = useRef<Gesture | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const countRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  const sound = useApp((s) => s.sound)
  const muted = useMuted()

  const target = expandLevel(lv)
  const mine = expandBuild(b, lv)
  const cols = Math.max(target.length, mine.length, checked?.length ?? 0)
  const locked = st === 'ok'
  const n = lv.insts.length

  const stop = () => { stopRef.current?.(); stopRef.current = null; setPlaying(null) }
  useEffect(() => () => stopRef.current?.(), [])

  // The part a hint asks about comes into view above the result: the bar, the count or the closing step.
  // Only this scroll area moves; scrollIntoView could shift the phone frame around it too.
  const reveal = (m: Miss) => requestAnimationFrame(() => {
    const el = m.kind === 'pattern' ? gridRef.current : m.kind === 'count' ? countRef.current : afterRef.current
    const box = el?.closest('.lp-rhythm-scroll')
    if (!el || !box) return
    const r = el.getBoundingClientRect(), v = box.getBoundingClientRect()
    const dy = r.bottom > v.bottom - 12 ? r.bottom - v.bottom + 12 : r.top < v.top + 8 ? r.top - v.top - 8 : 0
    if (dy) box.scrollBy({ top: dy, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  })

  const start = (who: 'target' | 'mine') => {
    if (playing?.who === who) { stop(); return }
    stop()
    const get = who === 'target'
      ? (i: number) => (i < target.length ? target[i] : null)
      : (i: number) => { const s = expandBuild(bRef.current, lv); return i < s.length ? s[i] : null }
    stopRef.current = play(get, lv.insts, (i) => {
      if (i === null) { stopRef.current = null; setPlaying(null) } else setPlaying({ who, i })
    })
  }

  // Any edit clears the old verdict: the card goes back to blue, the hint stays as «Подумай».
  const edit = (fn: (x: Build) => Build) => {
    if (locked) return
    const next = fn(bRef.current)
    bRef.current = next
    setB(next)
    setChecked(null)
    if (st !== 'active') setSt('active')
  }

  const setCell = (r: number, s: number, on: boolean) => {
    edit((x) => ({ ...x, pat: x.pat.map((row, ri) => (ri === r ? row.map((v, si) => (si === s ? on : v)) : row)) }))
    ui('tick')
    if (on) hit(lv.insts[r])
  }

  const cellOf = (el: Element | null) => {
    const c = el?.closest<HTMLElement>('[data-cell]')
    return c && gridRef.current?.contains(c) ? { r: Number(c.dataset.r), s: Number(c.dataset.s) } : null
  }
  // The step under the finger in the row the paint started in, by x only: a small vertical drift keeps painting.
  const stepAt = (r: number, x: number) => {
    const cells = gridRef.current?.querySelectorAll<HTMLElement>(`[data-r="${r}"]`) ?? []
    for (const c of cells) { const q = c.getBoundingClientRect(); if (x >= q.left - 3 && x <= q.right + 3) return Number(c.dataset.s) }
    return null
  }
  const endGesture = () => { gest.current = null; setPress('') }
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (locked || !e.isPrimary || gest.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    const c = cellOf(e.target as Element)
    if (!c) return
    gest.current = { id: e.pointerId, r: c.r, s: c.s, x0: e.clientX, y0: e.clientY, mode: 'press', on: false, last: c.s }
    setPress(`${c.r}-${c.s}`)
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gest.current
    if (!g || e.pointerId !== g.id) return
    if (g.mode === 'press') {
      const dx = Math.abs(e.clientX - g.x0), dy = Math.abs(e.clientY - g.y0)
      if (dy > SLOP && dy >= dx) { endGesture(); return }
      if (dx <= SLOP || dx < dy * 1.5) return
      g.mode = 'paint'
      g.on = !bRef.current.pat[g.r][g.s]
      e.currentTarget.setPointerCapture(e.pointerId)
      setCell(g.r, g.s, g.on)
    }
    const s = stepAt(g.r, e.clientX)
    if (s === null || s === g.last) return
    g.last = s
    setPress(`${g.r}-${s}`)
    if (bRef.current.pat[g.r][s] !== g.on) setCell(g.r, s, g.on)
  }
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gest.current
    if (!g || e.pointerId !== g.id) return
    if (g.mode === 'press') setCell(g.r, g.s, !bRef.current.pat[g.r][g.s])
    endGesture()
  }
  const onCancel = (e: RPointerEvent<HTMLDivElement>) => { if (gest.current?.id === e.pointerId) endGesture() }
  // Capture moves from the cell to the grid when a paint starts; only a loss at the grid ends the gesture.
  const onLost = (e: RPointerEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onCancel(e) }

  const setN = (v: number) => { if (v !== b.n) { edit((x) => ({ ...x, n: v })); ui('tick') } }
  const toggleAfter = (r: number) => {
    const on = !b.after[r]
    edit((x) => ({ ...x, after: x.after.map((v, i) => (i === r ? on : v)) }))
    ui('tick')
    if (on) hit(lv.insts[r])
  }

  const check = () => {
    stop()
    const m = diagnose(b, lv)
    setMiss(m)
    setChecked(mine)
    if (!m) { setSt('ok'); ui('ok'); return }
    const t = tries[m.kind] ?? 0
    setTries({ ...tries, [m.kind]: t + 1 })
    setHintText(hint(m, t))
    setSt('bad')
    ui('bad')
    reveal(m)
  }
  // «Исправить»: back to work with the hint kept, and the part to fix in view.
  const fix = () => { ui('tap'); setSt('active'); setChecked(null); if (miss) reveal(miss) }

  // Where the playhead is on the child's loop: which repeat, which step of the bar, or the closing step.
  const onMine = playing?.who === 'mine' ? playing.i : null
  const loopEnd = STEPS * b.n
  const rep = onMine !== null && onMine < loopEnd ? Math.floor(onMine / STEPS) : null
  const col = onMine !== null && onMine < loopEnd ? onMine % STEPS : null
  const atAfter = onMine !== null && onMine >= loopEnd
  const status = rep !== null ? `повтор ${rep + 1} из ${b.n}` : atAfter ? 'потом' : `повтори ${times(b.n)}`
  const diff = st === 'bad' && checked ? Array.from({ length: cols }, (_, i) => target[i] !== checked[i]) : undefined
  const any = b.pat.some((r) => r.some(Boolean))
  const wrote = STEPS + (b.after.some(Boolean) ? 1 : 0)
  const silent = !sound || muted

  return (
    <>
      <div className="lp-rhythm-scroll">
        <div className="lp-rhythm-in" key={k}>
          <header className="lp-rhythm-head">
            <span className="lp-rhythm-level">Уровень {k + 1} из {LEVELS.length}<span aria-hidden> · </span>{lv.title}</span>
            <span className="lp-rhythm-dots" aria-hidden>{LEVELS.map((_, i) => <i key={i} className={i < k ? 'is-done' : i === k ? 'is-now' : ''} />)}</span>
            <button
              className="lp-rhythm-sound"
              aria-pressed={silent}
              disabled={!sound}
              aria-label={!sound ? 'Звук выключен в настройках' : muted ? 'Включить звук' : 'Выключить звук'}
              onClick={() => { setMuted(!muted); ui('tick') }}
            >
              <Icon name={silent ? 'mute' : 'sound'} size={20} />
            </button>
          </header>
          <p className="lp-rhythm-goal">{lv.goal}</p>

          <section className="lp-rhythm-strips">
            <div className="lp-rhythm-strip-head">
              <b>Образец</b><small>{steps(target.length)}</small>
              <PlayBtn on={playing?.who === 'target'} label="Слушать" onClick={() => start('target')} />
            </div>
            <Roll seq={target} cols={cols} insts={lv.insts} loopEnd={STEPS * lv.n} head={playing?.who === 'target' ? playing.i : null} />
            <div className="lp-rhythm-strip-head">
              <b>Твой ритм</b><small>{steps(mine.length)}, записано {wrote}</small>
            </div>
            <Roll seq={mine} cols={cols} insts={lv.insts} loopEnd={loopEnd} mine head={onMine} diff={diff} ok={st === 'ok'} />
          </section>

          <section className="lp-rhythm-card" data-state={st}>
            <div className="lp-rhythm-loop">
              <div className="lp-rhythm-loop-head">
                <Icon name="loop" size={18} />
                <span className={'lp-rhythm-status' + (onMine !== null ? ' is-live' : '')} aria-live="polite">{status}</span>
                <PlayBtn on={playing?.who === 'mine'} label="Играть" onClick={() => start('mine')} />
              </div>
              <div className="lp-rhythm-count" ref={countRef} role="radiogroup" aria-label="Сколько раз повторить">
                {Array.from({ length: MAX_REPEAT }, (_, i) => i + 1).map((v) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={v === b.n}
                    aria-label={`повторить ${times(v)}`}
                    disabled={locked}
                    className={'lp-rhythm-rep' + (v <= b.n ? ' is-on' : '') + (v === b.n && onMine === null ? ' is-n' : '') + (rep !== null && v === rep + 1 ? ' is-now' : '')}
                    onClick={() => setN(v)}
                  ><small>×</small>{v}</button>
                ))}
              </div>
              <div
                className={'lp-rhythm-grid' + (locked ? ' is-locked' : '')}
                ref={gridRef}
                data-rows={n}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onCancel}
                onLostPointerCapture={onLost}
              >
                <span className="lp-rhythm-num-label">шаг</span>
                {Array.from({ length: STEPS }, (_, s) => <span key={s} className={'lp-rhythm-num' + (col === s ? ' is-head' : '')}>{s + 1}</span>)}
                {lv.insts.map((inst, r) => [
                  <span key={inst} className="lp-rhythm-name"><Mark inst={inst} />{INST_NAME[inst]}</span>,
                  ...b.pat[r].map((on, s) => {
                    const key = `${r}-${s}`
                    return (
                      <button
                        key={key}
                        data-cell={key}
                        data-r={r}
                        data-s={s}
                        disabled={locked}
                        aria-pressed={on}
                        aria-label={`${INST_NAME[inst]}, шаг ${s + 1}`}
                        className={'lp-rhythm-cell' + (on ? ' is-on' : '') + (col === s ? ' is-head' : '') + (press === key ? ' is-press' : '')}
                        onClick={(e) => { if (e.detail === 0) setCell(r, s, !on) }}
                      ><Mark inst={inst} size={14} /></button>
                    )
                  }),
                ])}
              </div>
            </div>
            {lv.after && (
              <div className={'lp-rhythm-after' + (atAfter ? ' is-head' : '')} ref={afterRef}>
                <span className="lp-rhythm-after-label">потом</span>
                {lv.insts.map((inst, r) => (
                  <button
                    key={inst}
                    disabled={locked}
                    aria-pressed={b.after[r]}
                    aria-label={`потом: ${INST_NAME[inst]}`}
                    className={'lp-rhythm-hitchip' + (b.after[r] ? ' is-on' : '')}
                    onClick={() => toggleAfter(r)}
                  ><Mark inst={inst} />{INST_NAME[inst]}</button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <div className="lp-rhythm-foot">
        <Feedback st={st} text={hintText} why={lv.why} />
        {st === 'ok'
          ? <button className="btn btn-ok btn-block" onClick={onNext}>{last ? 'Завершить' : 'Дальше'}<Icon name="arrow" size={18} /></button>
          : st === 'bad'
            ? <button className="btn btn-bad btn-block" onClick={fix}>Исправить</button>
            : <button className="btn btn-block" disabled={!any} onClick={check}>Проверить</button>}
      </div>
    </>
  )
}

function Finish({ onAgain }: { onAgain: () => void }) {
  const wrote = LEVELS.reduce((a, lv) => a + written(lv), 0)
  const heard = LEVELS.reduce((a, lv) => a + expandLevel(lv).length, 0)
  return (
    <>
      <div className="lp-rhythm-scroll">
        <div className="lp-rhythm-in lp-rhythm-finish">
          <span className="lp-rhythm-finish-icon"><Icon name="check" size={30} /></span>
          <h2 className="lp-rhythm-title">Три ритма собраны</h2>
          <p className="lp-rhythm-goal">Ты записал {steps(wrote)}, а прозвучало {heard}. Так работает цикл: одна запись и много повторов.</p>
          <ol className="lp-rhythm-recap">
            {LEVELS.map((lv, i) => (
              <li key={i}>
                <i><Icon name="check" size={14} /></i>
                <span><b>{lv.title}</b><small>{lv.after ? `повтори ${times(lv.n)}, потом один шаг` : `повтори ${times(lv.n)}`}</small></span>
                <em>{written(lv)} → {expandLevel(lv).length}</em>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="lp-rhythm-foot">
        <button className="btn btn-block" onClick={onAgain}><Icon name="redo" size={18} />Ещё раз</button>
      </div>
    </>
  )
}

export function Rhythm() {
  const [k, setK] = useState(0)
  const next = () => {
    ui(k + 1 >= LEVELS.length ? 'finish' : 'tap')
    setK(k + 1)
  }
  // Browsers start audio only after a gesture, and a phone counts the release, not the touch:
  // every press, release and click wakes the drum machine.
  const wake = () => { audio() }
  return (
    <div className="lp-rhythm" onPointerDownCapture={wake} onPointerUpCapture={wake} onClickCapture={wake}>
      {k < LEVELS.length
        ? <Stage key={k} k={k} lv={LEVELS[k]} last={k === LEVELS.length - 1} onNext={next} />
        : <Finish onAgain={() => { ui('tap'); setK(0) }} />}
    </div>
  )
}
