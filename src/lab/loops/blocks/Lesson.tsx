import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { sfx } from '../../../app/sfx'
import { Icon } from '../../../components'
import { CMD_WORD, countCommands, newId, plural, simulate, type Cmd, type Item, type Run } from '../../../exercises/robot'
import { Board, CmdIcon, RobotMark, type Mark } from '../../../exercises/robot-view'
import { COUNT_MAX, COUNT_MIN, LEVELS, whatHappened } from './levels'
import { isComplete, put, take, type Where } from './program'
import '../../../exercises/exercises.css'
import '../blocks.css'

// Block programming for a thumb: drag big blocks from the palette into the program; the repeat block is a C
// whose mouth holds the blocks it repeats. A line with a label shows where a block lands, inside the loop or after it.

const CAP = 10 // blocks in one program; more does not fit the screen
const MOVE = 8 // px a finger moves before a press becomes a drag or a scroll, so taps still work
const HOLD_MS = 300 // a finger that rests this long on a block picks it up without a sideways move
const STEP_MS = 380
const FIRST_MS = 220
const FLIP_MS = 220

// A place a block can land. top, left, w: the line inside the program, measured once when the drag starts.
type Slot = { where: Where; top: number; left: number; w: number; n: number }
type Target = { kind: 'slot'; slot: Slot } | { kind: 'trash' } | null
type Drag = {
  pid: number
  touch: boolean
  item: Item
  from: Where | null // the place in the program, null for a block from the palette
  src: HTMLElement
  sx: number; sy: number; px: number; py: number
  gx: number; gy: number // where the finger holds the block
  started: boolean
  slots: Slot[]
  target: Target
  raf: number
  hold: number
}
type Flip = { rects: Map<string, DOMRect>; enter?: { key: string; rect: DOMRect } }
type Result = { ok: boolean; title: string; text: string }

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const targetKey = (t: Target) => (!t ? '' : t.kind === 'trash' ? 'trash' : `${t.slot.where.rep ?? 'top'}:${t.slot.where.index}`)
const times = (n: number) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`

// The layout box of an element inside the program, without the transforms of running animations.
function offsetIn(el: HTMLElement, box: HTMLElement) {
  let top = 0
  let left = 0
  let e: HTMLElement | null = el
  while (e && e !== box) { top += e.offsetTop; left += e.offsetLeft; e = e.offsetParent as HTMLElement | null }
  return { top, left, bottom: top + el.offsetHeight, right: left + el.offsetWidth }
}

function Cmd({ t, cls = '', label, onDown }: { t: Cmd; cls?: string; label?: string; onDown?: (e: RPointerEvent<HTMLElement>) => void }) {
  return (
    <div className={'lp-blocks-cmd' + cls} onPointerDown={onDown} aria-label={label}>
      <CmdIcon t={t} size={20} />
      <span>{CMD_WORD[t]}</span>
    </div>
  )
}

// The count of the repeat block: a slider with a detent for every number. It moves only after a sideways move,
// so a vertical swipe that starts on it scrolls the screen; a tap puts the thumb where the finger is.
function Count({ n, disabled, onChange }: { n: number; disabled: boolean; onChange: (n: number) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const press = useRef<{ pid: number; x: number; y: number; sliding: boolean } | null>(null)
  const values = Array.from({ length: COUNT_MAX - COUNT_MIN + 1 }, (_, i) => COUNT_MIN + i)
  const at = (x: number) => {
    const r = track.current!.getBoundingClientRect()
    const k = Math.round(((x - r.left) / r.width) * values.length - 0.5)
    return values[Math.max(0, Math.min(values.length - 1, k))]
  }
  const set = (v: number) => { if (v !== n) { sfx('tick'); onChange(v) } }
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (disabled || !e.isPrimary || e.button > 0) return
    press.current = { pid: e.pointerId, x: e.clientX, y: e.clientY, sliding: e.pointerType === 'mouse' }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not needed for a mouse */ }
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const p = press.current
    if (!p || p.pid !== e.pointerId) return
    if (!p.sliding) {
      const dx = Math.abs(e.clientX - p.x)
      const dy = Math.abs(e.clientY - p.y)
      if (Math.max(dx, dy) < MOVE) return
      if (dy > dx) { press.current = null; return }
      p.sliding = true
    }
    set(at(e.clientX))
  }
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const p = press.current
    press.current = null
    if (p && p.pid === e.pointerId && e.type === 'pointerup') set(at(e.clientX))
  }
  const onKey = (e: RKeyboardEvent) => {
    if (disabled) return
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!d) return
    e.preventDefault()
    set(Math.max(COUNT_MIN, Math.min(COUNT_MAX, n + d)))
  }
  const k = values.indexOf(n)
  return (
    <div
      ref={track}
      className={'lp-blocks-count-slider' + (disabled ? ' is-off' : '')}
      role="slider" tabIndex={disabled ? -1 : 0}
      aria-label="Сколько раз повторить" aria-valuemin={COUNT_MIN} aria-valuemax={COUNT_MAX} aria-valuenow={n} aria-valuetext={times(n)}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={() => { press.current = null }}
      onKeyDown={onKey}
    >
      {values.map((v) => <i key={v}>{v}</i>)}
      <b style={{ left: `${((k + 0.5) / values.length) * 100}%` }}>{n}</b>
    </div>
  )
}

export function BlocksLesson() {
  const [level, setLevel] = useState(0)
  const [prog, setProg] = useState<Item[]>([])
  const [phase, setPhase] = useState<'edit' | 'run' | 'done'>('edit')
  const [frame, setFrame] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  // After a wrong try and an edit, the hint stays as a neutral question while the child fixes the program.
  const [think, setThink] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [ghost, setGhost] = useState<{ item: Item; x: number; y: number; w: number } | null>(null)
  const [lifted, setLifted] = useState<number | null>(null) // a program block under the finger: hidden, still mounted
  const [target, setTarget] = useState<Target>(null)
  const [dragFrom, setDragFrom] = useState<boolean | null>(null) // true: from the program, false: from the palette
  const [height, setHeight] = useState(0)

  const def = LEVELS[level]
  const finished = level >= LEVELS.length
  const run: Run | null = useMemo(() => (def ? simulate(def.lv, prog, def.max) : null), [def, prog])
  const count = countCommands(prog)
  const complete = isComplete(prog)
  const locked = phase === 'run' || !!result?.ok

  const root = useRef<HTMLDivElement>(null)
  const mainEl = useRef<HTMLDivElement>(null)
  const progEl = useRef<HTMLDivElement>(null)
  const palEl = useRef<HTMLDivElement>(null)
  const ghostEl = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const flip = useRef<Flip | null>(null)
  const detach = useRef<(() => void) | null>(null)
  const live = useRef({ prog, locked, count, lifted })
  useLayoutEffect(() => { live.current = { prog, locked, count, lifted } })

  // The board size follows the screen height only, never the program or the card, so nothing jumps while the child
  // builds or when a result comes. 284 px: the header, the goal, the gaps and the footer with a three-line card.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [finished])
  const cell = def ? Math.max(26, Math.min(46, Math.floor((height - 284 - def.progH) / def.lv.rows))) : 40

  // ---- Motion: blocks slide to their new places (FLIP), the repeat block grows and shrinks.
  const capture = () => {
    const rects = new Map<string, DOMRect>()
    progEl.current?.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.height > 0) rects.set(el.dataset.flip!, r)
    })
    return rects
  }
  useLayoutEffect(() => {
    const snap = flip.current
    flip.current = null
    const box = progEl.current
    if (!snap || !box) return
    const scroller = mainEl.current
    const added = snap.enter && box.querySelector<HTMLElement>(`[data-flip="${snap.enter.key}"]`)
    if (!reduced()) {
      const now = new Map<string, DOMRect>()
      const els = [...box.querySelectorAll<HTMLElement>('[data-flip]')]
      els.forEach((el) => now.set(el.dataset.flip!, el.getBoundingClientRect()))
      const before = (k: string) => snap.rects.get(k) ?? (snap.enter?.key === k ? snap.enter.rect : undefined)
      for (const el of els) {
        const k = el.dataset.flip!
        const a = before(k)
        const b = now.get(k)!
        if (!a || b.height === 0) continue
        let dx = a.left - b.left
        let dy = a.top - b.top
        // A block inside a repeat block moves with it, so only its own shift counts.
        const pk = el.parentElement?.closest<HTMLElement>('[data-flip]')?.dataset.flip
        const pa = pk ? before(pk) : undefined
        if (pk && pa) { const pb = now.get(pk)!; dx -= pa.left - pb.left; dy -= pa.top - pb.top }
        const grow = el.classList.contains('lp-blocks-rep') && snap.rects.has(k) && Math.abs(a.height - b.height) > 1
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !grow) continue
        el.animate([
          { transform: `translate(${dx}px, ${dy}px)`, ...(grow ? { height: `${a.height}px` } : {}) },
          { transform: 'none', ...(grow ? { height: `${b.height}px` } : {}) },
        ], { duration: FLIP_MS, easing: 'cubic-bezier(.3,.7,.3,1)' })
      }
    }
    // A block that lands below the fold comes into view.
    if (added && scroller) {
      const o = offsetIn(added, scroller)
      const bottom = o.bottom + 12 - scroller.clientHeight
      if (bottom > scroller.scrollTop) scroller.scrollTo({ top: bottom, behavior: reduced() ? 'auto' : 'smooth' })
    }
  }, [prog, lifted])

  // Any edit clears the old verdict: the board goes back to the start, the hint stays as a question.
  const clearVerdict = () => {
    if (result && !result.ok) setThink(result.text)
    setResult(null)
    setPhase('edit')
    setFrame(0)
    setNote(null)
  }
  const change = (next: Item[], enter?: { id: number; rect: DOMRect }) => {
    flip.current = { rects: capture(), enter: enter && { key: String(enter.id), rect: enter.rect } }
    setProg(next)
    setLifted(null)
    clearVerdict()
  }
  const restOf = (p: Item[], id: number | null) => (id === null ? p : take(p, id)?.rest ?? p)

  // ---- Drag: the places are measured once, when the block is lifted; the loop then only reads two rects a frame.
  const measure = (item: Item): Slot[] => {
    const box = progEl.current
    if (!box) return []
    const { prog: p, lifted: l } = live.current
    const items = restOf(p, l)
    const width = box.clientWidth
    const out: Slot[] = []
    const topSlot = (index: number, top: number) => out.push({ where: { rep: null, index }, top, left: 8, w: width - 16, n: 1 })
    if (!items.length) {
      const hole = box.querySelector<HTMLElement>('.lp-blocks-empty')
      topSlot(0, hole ? offsetIn(hole, box).top + 8 : 10)
      return out
    }
    items.forEach((it, i) => {
      const el = box.querySelector<HTMLElement>(`[data-blk="${it.id}"]`)
      if (!el) return
      const o = offsetIn(el, box)
      topSlot(i, o.top - 2)
      if (it.t === 'rep' && item.t !== 'rep') {
        const mouth = box.querySelector<HTMLElement>(`[data-mouth="${it.id}"]`)!
        const mo = offsetIn(mouth, box)
        const inner = [...mouth.querySelectorAll<HTMLElement>(':scope > .lp-blocks-inner')].filter((c) => c.offsetParent).map((c) => offsetIn(c, box))
        const left = mo.left + 6
        const slot = (index: number, top: number) => out.push({ where: { rep: it.id, index }, top, left, w: width - 8 - left, n: it.n })
        if (!inner.length) slot(0, mo.top + 8)
        inner.forEach((c, k) => slot(k, c.top - 2))
        if (inner.length) slot(inner.length, inner[inner.length - 1].bottom + 2)
      }
      if (i === items.length - 1) topSlot(i + 1, o.bottom + 2)
    })
    return out
  }
  useLayoutEffect(() => {
    const d = drag.current
    if (!d?.started) return
    d.slots = measure(d.item)
    // The repeat block animates its height while it closes the gap, and that moves the layout; measure again after.
    const anims = progEl.current?.getAnimations({ subtree: true }) ?? []
    if (anims.length) void Promise.allSettled(anims.map((a) => a.finished)).then(() => { if (drag.current === d) d.slots = measure(d.item) })
    // Only when a drag starts: the lifted block has left the layout by now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost?.item, lifted])

  const findTarget = (d: Drag, gx: number, gy: number): Target => {
    const pal = palEl.current?.getBoundingClientRect()
    const box = progEl.current?.getBoundingClientRect()
    if (pal && d.px < pal.right + 4 && d.py > pal.top - 12 && d.py < pal.bottom + 12) return { kind: 'trash' }
    if (!box || d.px < box.left - 8 || d.px > box.right + 24 || d.py < box.top - 48 || d.py > box.bottom + 48) return null
    let best: Slot | null = null
    let bestD = Infinity
    // The top left corner of the block picks the place: height counts most, the indent breaks a tie.
    for (const s of d.slots) {
      const dist = Math.abs(gy - (box.top + s.top)) + Math.abs(gx - (box.left + s.left)) * 0.4
      if (dist < bestD) { bestD = dist; best = s }
    }
    return best ? { kind: 'slot', slot: best } : null
  }

  const loop = () => {
    const d = drag.current
    const sc = mainEl.current
    const rt = root.current?.getBoundingClientRect()
    if (!d || !d.started || !rt) return
    // Near the top or the bottom edge of the screen, the lesson scrolls under the finger.
    if (sc && sc.scrollHeight > sc.clientHeight) {
      const r = sc.getBoundingClientRect()
      if (d.py < r.top + 36) sc.scrollTop -= 6
      else if (d.py > r.bottom - 36) sc.scrollTop += 6
    }
    let gx = d.px - d.gx
    let gy = d.py - d.gy
    const t = findTarget(d, gx, gy)
    if (targetKey(t) !== targetKey(d.target)) {
      d.target = t
      setTarget(t)
      if (t) sfx('tick')
    }
    // The magnet: close to its place the block is pulled toward it.
    const box = progEl.current?.getBoundingClientRect()
    if (t?.kind === 'slot' && box) {
      const sx = box.left + t.slot.left
      const sy = box.top + t.slot.top + 2
      const k = Math.max(0, 1 - Math.hypot(gx - sx, gy - sy) / 56) * 0.5
      gx += (sx - gx) * k
      gy += (sy - gy) * k
    }
    if (ghostEl.current) ghostEl.current.style.transform = `translate(${gx - rt.left}px, ${gy - rt.top}px)`
    d.raf = requestAnimationFrame(loop)
  }

  const clearDrag = () => { setGhost(null); setTarget(null); setDragFrom(null) }

  // The ghost flies to a rect and fades, then goes. Used when a block is removed or goes back to the palette.
  const dropGhost = (to: DOMRect | null) => {
    const g = ghostEl.current
    const rt = root.current?.getBoundingClientRect()
    if (!g || !rt || reduced()) return clearDrag()
    const from = g.style.transform
    const kf: Keyframe[] = to
      ? [{ transform: from, opacity: 1 }, { transform: `translate(${to.left - rt.left}px, ${to.top - rt.top}px)`, opacity: 0.2 }]
      : [{ transform: `${from} scale(1)`, opacity: 1 }, { transform: `${from} scale(0.6)`, opacity: 0 }]
    g.animate(kf, { duration: 180, easing: 'ease-in', fill: 'forwards' }).onfinish = clearDrag
  }

  const begin = (d: Drag) => {
    clearTimeout(d.hold)
    if (d.started) return
    if (!d.from && live.current.count + 1 > CAP) { setNote('Больше блоков не поместится.'); return finish(d, null) }
    d.started = true
    const r = d.src.getBoundingClientRect()
    const rt = root.current!.getBoundingClientRect()
    // A block from the program stays mounted, hidden, so the touch that lifted it keeps its target on iOS.
    if (d.from) { flip.current = { rects: capture() }; setLifted(d.item.id) }
    setGhost({ item: d.item, x: r.left - rt.left, y: r.top - rt.top, w: r.width })
    setDragFrom(!!d.from)
    sfx('tick')
    d.raf = requestAnimationFrame(loop)
  }

  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pid) return
    d.px = e.clientX
    d.py = e.clientY
    if (d.started) return
    const dx = Math.abs(d.px - d.sx)
    const dy = Math.abs(d.py - d.sy)
    if (Math.max(dx, dy) < (d.touch ? MOVE : 5)) return
    // A finger that goes up or down first scrolls the lesson; a sideways move picks the block up.
    if (d.touch && dy > dx) return finish(d, null)
    begin(d)
  }

  // The end of a press. `e` is null when the press is dropped without a result (a scroll, too many blocks).
  const finish = (d: Drag, e: PointerEvent | null) => {
    detach.current?.()
    clearTimeout(d.hold)
    cancelAnimationFrame(d.raf)
    drag.current = null
    try { if (d.src.hasPointerCapture(d.pid)) d.src.releasePointerCapture(d.pid) } catch { /* already released */ }
    const { prog: p, count: n } = live.current
    if (!d.started) {
      if (!e || e.type !== 'pointerup') return
      // A tap: a palette block goes to the end of the program; a program block explains how to move it.
      if (d.from) { setNote('Тащи блок вбок, чтобы переставить или убрать.'); return }
      if (n >= CAP) { setNote('Больше блоков не поместится.'); return }
      sfx('tick')
      change([...p, d.item], { id: d.item.id, rect: d.src.getBoundingClientRect() })
      return
    }
    const t = e?.type === 'pointerup' ? d.target : null
    const rest = restOf(p, d.from ? d.item.id : null)
    const rect = ghostEl.current?.getBoundingClientRect()
    if (t?.kind === 'slot') {
      sfx('tick')
      clearDrag()
      change(put(rest, t.slot.where, d.item), rect && { id: d.item.id, rect })
      return
    }
    if (t?.kind === 'trash' && d.from) {
      sfx('tap')
      change(rest)
      return dropGhost(null)
    }
    if (!d.from) return dropGhost(d.src.getBoundingClientRect())
    // Dropped nowhere: the block goes back where it was.
    clearDrag()
    flip.current = { rects: capture(), enter: rect && { key: String(d.item.id), rect } }
    setLifted(null)
  }

  const down = (e: RPointerEvent<HTMLElement>, item: Item, from: Where | null) => {
    e.stopPropagation()
    if (live.current.locked || drag.current || e.button > 0 || !e.isPrimary) return
    const src = e.currentTarget
    const r = src.getBoundingClientRect()
    const d: Drag = {
      pid: e.pointerId, touch: e.pointerType !== 'mouse', item, from, src,
      sx: e.clientX, sy: e.clientY, px: e.clientX, py: e.clientY,
      gx: e.clientX - r.left, gy: e.clientY - r.top, started: false, slots: [], target: null, raf: 0, hold: 0,
    }
    drag.current = d
    try { src.setPointerCapture(e.pointerId) } catch { /* a synthetic pointer */ }
    if (d.touch) d.hold = window.setTimeout(() => { if (drag.current === d) begin(d) }, HOLD_MS)
    const up = (ev: PointerEvent) => { if (ev.pointerId === d.pid && drag.current === d) finish(d, ev) }
    // The browser took the touch for a scroll before the block was lifted: let it scroll.
    const lost = () => { if (drag.current === d && !d.started) finish(d, null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    src.addEventListener('lostpointercapture', lost)
    detach.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      src.removeEventListener('lostpointercapture', lost)
    }
  }
  // A repeat block is held by its head, its side or its foot; its mouth belongs to the blocks inside.
  const downRep = (e: RPointerEvent<HTMLElement>, it: Item, where: Where) => {
    if ((e.target as Element).closest('.lp-blocks-mouth, .lp-blocks-count-slider')) return
    down(e, it, where)
  }
  const fromPalette = (t: Cmd | 'rep') => (e: RPointerEvent<HTMLElement>) =>
    down(e, t === 'rep' ? { id: newId(), t: 'rep', n: 2, body: [] } : { id: newId(), t }, null)

  // While a block is under the finger, the lesson must not scroll with it.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const stop = (e: TouchEvent) => { if (drag.current?.started && e.cancelable) e.preventDefault() }
    el.addEventListener('touchmove', stop, { passive: false })
    return () => {
      el.removeEventListener('touchmove', stop)
      detach.current?.()
      if (drag.current) { cancelAnimationFrame(drag.current.raf); clearTimeout(drag.current.hold) }
    }
  }, [finished])

  const setN = (id: number, n: number) => {
    if (locked) return
    change(prog.map((it) => (it.id === id && it.t === 'rep' ? { ...it, n } : it)))
  }

  // ---- The run.
  const last = run ? run.frames.length - 1 : 0
  useEffect(() => {
    if (phase !== 'run' || !run || !def) return
    if (frame >= last) {
      // The result comes when the robot has finished its last move.
      const t = setTimeout(() => {
        const ok = run.outcome === 'goal'
        const nextTries = ok ? tries : tries + 1
        setTries(nextTries)
        setResult({ ok, title: whatHappened(run, count, def.max), text: ok ? def.why : def.hint(run, prog, nextTries) })
        setPhase('done')
        sfx(ok ? 'ok' : 'bad')
        // The block to fix comes into view, so the result card never hides it.
        const box = progEl.current
        const sc = mainEl.current
        const bad = run.failId !== null ? box?.querySelector<HTMLElement>(`[data-flip="${run.failId}"]`) : null
        if (bad && sc) {
          const o = offsetIn(bad, sc)
          if (o.bottom > sc.scrollTop + sc.clientHeight - 8) sc.scrollTo({ top: o.bottom + 12 - sc.clientHeight, behavior: reduced() ? 'auto' : 'smooth' })
        }
      }, FIRST_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setFrame((f) => f + 1), frame === 0 ? FIRST_MS : STEP_MS)
    return () => clearTimeout(t)
  }, [phase, frame, last, run, def, tries, count, prog])

  const start = () => {
    if (!complete) return
    setResult(null)
    setThink(null)
    setNote(null)
    setFrame(0)
    setPhase('run')
  }
  const stop = () => { setPhase('edit'); setFrame(0) }
  const fix = () => { sfx('tap'); clearVerdict() }
  const next = () => {
    sfx(level === LEVELS.length - 1 ? 'finish' : 'tap')
    setLevel(level + 1)
    setProg([])
    setPhase('edit')
    setFrame(0)
    setResult(null)
    setThink(null)
    setTries(0)
    setNote(null)
    mainEl.current?.scrollTo({ top: 0 })
  }
  const again = () => { sfx('tap'); setLevel(0); setProg([]); setResult(null); setThink(null); setTries(0); setPhase('edit'); setFrame(0) }

  if (finished || !def || !run) {
    return (
      <div className="lp-blocks lp-blocks-finish" ref={root}>
        <div className="lp-blocks-finish-body">
          <div className="lp-blocks-finish-mark"><RobotMark dir={2} /><i><Icon name="check" size={18} /></i></div>
          <h2>Три программы готовы</h2>
          <p>Ты собрал их из блоков и ни разу не написал код.</p>
          <ul>
            <li><Icon name="check" size={16} />Повтор выполняет блоки внутри себя несколько раз.</li>
            <li><Icon name="check" size={16} />Число на повторе говорит, сколько раз.</li>
            <li><Icon name="check" size={16} />Блок после повтора выполнится один раз.</li>
          </ul>
        </div>
        <div className="lp-blocks-foot">
          <button className="btn btn-block" onClick={again}><Icon name="redo" size={18} />Ещё раз</button>
        </div>
      </div>
    )
  }

  const showing = phase !== 'edit'
  const f = run.frames[showing ? Math.min(frame, last) : 0]
  const done = phase === 'done'
  const marks = new Map<string, Mark>()
  if (showing) {
    for (let i = 0; i <= Math.min(frame, last); i++) marks.set(`${run.frames[i].x},${run.frames[i].y}`, 'trail')
    if (done) {
      if (run.hit) marks.set(`${run.hit.x},${run.hit.y}`, 'hit')
      if (run.outcome === 'short' || run.outcome === 'passed' || run.outcome === 'edge') marks.set(`${f.x},${f.y}`, 'end')
      if (run.outcome === 'stars') def.lv.stars.forEach((s, i) => { if (!f.got.includes(i)) marks.set(`${s.x},${s.y}`, 'miss') })
    }
  }
  const failId = done ? run.failId : null
  const nowId = phase === 'run' && frame > 0 ? f.at : null
  const inRep = phase === 'run' && frame > 0 ? f.rep : null
  const tgt = target?.kind === 'slot' ? target.slot : null
  const state = result ? (result.ok ? 'ok' : 'bad') : phase === 'run' || prog.length ? 'active' : 'idle'
  const over = count > def.max
  const shown = restOf(prog, lifted)

  const cmdCls = (id: number) => (nowId === id ? ' is-now' : '') + (failId === id ? ' is-fail' : '')

  const renderItem = (it: Item, where: Where | null): ReactNode => {
    const hide = where && it.id === lifted ? ' is-lifted' : ''
    if (it.t !== 'rep') {
      return (
        <div key={it.id} data-flip={it.id} data-blk={it.id} className={'lp-blocks-item' + hide}>
          <Cmd t={it.t} cls={where ? cmdCls(it.id) : ''} label={where ? `${CMD_WORD[it.t]}. Тащи вбок, чтобы переставить` : undefined} onDown={where ? (e) => down(e, it, where) : undefined} />
        </div>
      )
    }
    const inside = inRep === it.id
    const holeHot = tgt?.where.rep === it.id
    const body = it.body.filter((c) => c.id !== lifted)
    return (
      <div
        key={it.id}
        data-flip={it.id}
        data-blk={it.id}
        className={'lp-blocks-rep' + (inside ? ' is-in' : '') + hide}
        onPointerDown={where ? (e) => downRep(e, it, where) : undefined}
      >
        <div className="lp-blocks-rep-head">
          <span className="lp-blocks-rep-word">повтори</span>
          {inside
            ? <b className="lp-blocks-iter" aria-live="polite">{f.iter} из {it.n}</b>
            : <Count n={it.n} disabled={!where || locked} onChange={(n) => setN(it.id, n)} />}
        </div>
        <div className="lp-blocks-spine" />
        <div className="lp-blocks-mouth" data-mouth={it.id}>
          {it.body.map((c) => {
            const k = body.indexOf(c)
            return (
              <div key={c.id} data-flip={c.id} className={'lp-blocks-inner' + (c.id === lifted ? ' is-lifted' : '')}>
                <Cmd t={c.t} cls={where ? cmdCls(c.id) : ''} label={where ? `${CMD_WORD[c.t]} внутри повтора` : undefined} onDown={where ? (e) => down(e, c, { rep: it.id, index: k }) : undefined} />
              </div>
            )
          })}
          {body.length === 0 && <div className={'lp-blocks-hole' + (holeHot ? ' is-hot' : '')}>положи блок сюда</div>}
        </div>
        <div className="lp-blocks-rep-foot" />
      </div>
    )
  }

  const hasHole = shown.some((it) => it.t === 'rep' && !it.body.length)
  const editText = hasHole ? 'Внутри повтора пусто. Положи туда блок.'
    : note ?? (prog.length ? 'Готово? Нажми «Пуск» и смотри.' : 'Тащи блоки из левой колонки в программу.')

  return (
    <div className="lp-blocks" ref={root} data-state={state}>
      <div className="lp-blocks-main" ref={mainEl}>
        <div className="lp-blocks-top">
          <span className="lp-blocks-level">Уровень {level + 1} из {LEVELS.length} · {def.title}</span>
          <span className="lp-blocks-bars" aria-hidden>{LEVELS.map((_, i) => <i key={i} className={i < level ? 'is-done' : i === level ? 'is-on' : ''} />)}</span>
        </div>
        <p className="lp-blocks-goal">{def.goal}</p>
        <div className="lp-blocks-stage">
          <Board lv={def.lv} frame={f} marks={marks} cell={cell} tone={result ? (result.ok ? 'ok' : 'bad') : undefined} win={done && result?.ok} />
        </div>
        <div className="lp-blocks-work">
          <div className={'lp-blocks-side' + (dragFrom ? ' is-trash' : '') + (target?.kind === 'trash' && dragFrom ? ' is-hot' : '')}>
            <div ref={palEl} className={'lp-blocks-pal' + (locked ? ' is-locked' : '') + (count >= CAP ? ' is-full' : '')} aria-label="Блоки">
              {(['F', 'L', 'R'] as Cmd[]).map((t) => (
                <Cmd key={t} t={t} cls=" is-pal" onDown={fromPalette(t)} />
              ))}
              <div className="lp-blocks-rep is-pal" onPointerDown={fromPalette('rep')}>
                <div className="lp-blocks-rep-head"><CmdIcon t="rep" size={18} /><span className="lp-blocks-rep-word">повтори</span></div>
                <div className="lp-blocks-spine" />
                <div className="lp-blocks-mouth" />
                <div className="lp-blocks-rep-foot" />
              </div>
            </div>
            <div className={'lp-blocks-count' + (over ? ' is-over' : '')}><b>{count} из {def.max}</b><span>{plural(def.max, 'блока', 'блоков', 'блоков')}</span></div>
            <div className="lp-blocks-trash" aria-hidden><CmdIcon t="back" size={22} /><span>{target?.kind === 'trash' ? 'Отпусти, чтобы убрать' : 'Тащи сюда, чтобы убрать'}</span></div>
          </div>
          <div ref={progEl} className={'lp-blocks-prog' + (ghost ? ' is-drag' : '')} aria-label="Программа">
            {shown.length === 0 && <div className={'lp-blocks-empty' + (tgt ? ' is-hot' : '')}>Перетащи сюда первый блок</div>}
            {prog.map((it, i) => renderItem(it, { rep: null, index: shown.indexOf(it) >= 0 ? shown.indexOf(it) : i }))}
            {tgt && <Indicator slot={tgt} />}
          </div>
        </div>
      </div>
      <div className="lp-blocks-foot">
        <div className="lp-blocks-msg" aria-live="polite">
          {phase === 'run' ? (
            <div className="lp-blocks-card is-run"><Icon name="play" size={18} /><div><b>Робот выполняет программу</b><span>Шаг {frame} из {last}</span></div></div>
          ) : result ? (
            <div className={'lp-blocks-card ' + (result.ok ? 'is-ok' : 'is-bad')}>
              <Icon name={result.ok ? 'check' : 'x'} size={18} />
              <div><b>{result.title}</b><span>{result.text}</span></div>
            </div>
          ) : think && !hasHole ? (
            <div className="lp-blocks-card is-run"><Icon name="spark" size={18} /><div><b>Подумай</b><span>{think}</span></div></div>
          ) : (
            <div className="lp-blocks-card is-run is-note"><Icon name="arrow" size={18} /><div><span>{editText}</span></div></div>
          )}
        </div>
        {phase === 'run'
          ? <button className="btn btn-block btn-secondary" onClick={stop}><i className="lp-blocks-stop" />Стоп</button>
          : result?.ok
            ? <button className="btn btn-block btn-ok" onClick={next}>{level === LEVELS.length - 1 ? 'Завершить' : 'Дальше'}<Icon name="arrow" size={18} /></button>
            : result
              ? <button className="btn btn-block btn-bad" onClick={fix}>Исправить</button>
              : <button className="btn btn-block" disabled={!complete || !!ghost} onClick={start}><Icon name="play" size={18} />Пуск</button>}
      </div>
      {ghost && (
        <div ref={ghostEl} className="lp-blocks-ghost" style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)`, width: ghost.w }} aria-hidden>
          {renderItem(ghost.item, null)}
        </div>
      )}
    </div>
  )
}

// The line where the block will land, with how many times it will run there: the difference between
// inside the loop and after it is visible before the finger lets go.
function Indicator({ slot }: { slot: Slot }) {
  const inside = slot.where.rep !== null
  return (
    <div className={'lp-blocks-line' + (inside ? ' is-in' : '')} style={{ top: slot.top, left: slot.left, width: slot.w }}>
      <em>{inside ? `внутри: ${times(slot.n)}` : 'один раз'}</em>
    </div>
  )
}
