import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLayer } from './router'
import './sheet.css'

const EASE = 'cubic-bezier(.32,.72,0,1)'
const IN = 320
const OUT = 240
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const offsetOf = (el: HTMLElement) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42

type Props = {
  label: string
  // Runs once the sheet has slid out; the owner then unmounts it.
  onClose: () => void
  className?: string
  children: ReactNode | ((close: () => void) => ReactNode)
}

// The one bottom sheet of the app. It runs to the bottom edge and keeps the home indicator's inset inside.
// A drag down (with a flick), the dim, the grip, Escape and the back gesture close it; back adds no extra step.
// Whether the last input was a key: a sheet closed from the keyboard returns focus with a visible ring.
let byKeys = false
addEventListener('keydown', () => { byKeys = true }, true)
addEventListener('pointerdown', () => { byKeys = false }, true)

export function Sheet({ label, onClose, className = '', children }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const done = useRef(onClose)
  useLayoutEffect(() => { done.current = onClose })

  // Slides out from where the sheet is now, mid-drag too; after a flick it keeps the finger's speed.
  function dismiss(speed = 0) {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    const el = panel.current
    const bg = scrim.current
    if (!el || !bg || reduce()) { done.current(); return }
    const y = offsetOf(el)
    const fade = parseFloat(getComputedStyle(bg).opacity)
    el.getAnimations().forEach((a) => a.cancel())
    bg.getAnimations().forEach((a) => a.cancel())
    el.style.transform = ''
    bg.style.opacity = ''
    const h = el.offsetHeight
    const ms = speed > 0 ? Math.max(140, Math.min(OUT, (h - y) / speed)) : OUT
    el.animate([{ transform: `translateY(${y}px)` }, { transform: `translateY(${h}px)` }], { duration: ms, easing: speed ? 'cubic-bezier(.2,.7,.4,1)' : EASE, fill: 'forwards' })
      .onfinish = () => done.current()
    bg.animate([{ opacity: fade }, { opacity: 0 }], { duration: ms, fill: 'forwards' })
  }

  // The sheet is a history entry while open: back closes it, and closing it here steps back.
  useLayer(!closing, () => dismiss())

  useLayoutEffect(() => {
    const el = panel.current
    const bg = scrim.current
    if (!el || !bg || reduce()) return
    const a = el.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: IN, easing: EASE })
    const b = bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: IN * 0.8 })
    return () => { a.cancel(); b.cancel() }
  }, [])

  // Focus moves into the sheet and goes back to where it was when the sheet closes.
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    panel.current?.focus({ preventScroll: true })
    // The ring is for keyboard users; after a touch or the back gesture focus returns without it.
    return () => back?.focus({ preventScroll: true, focusVisible: byKeys })
  }, [])

  // Escape closes; Tab stays inside the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = panel.current
      if (!el || closingRef.current) return
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); return }
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')]
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement
      if (!el.contains(at) || (e.shiftKey && (at === first || at === el)) || (!e.shiftKey && at === last)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first)?.focus()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // Drag down to close: anywhere on the sheet, and inside a scrolled list once it is at its top.
  useEffect(() => {
    const el = panel.current
    const bg = scrim.current
    if (!el || !bg) return
    type Grab = { x0: number; y0: number; list: HTMLElement | null; mode: 'wait' | 'drag' | 'skip'; off: number; trail: [number, number][] }
    let g: Grab | null = null
    const listAt = (t: EventTarget | null) => {
      for (let n = t instanceof HTMLElement ? t : null; n; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return n
        if (n === el) break
      }
      return null
    }
    const begin = (x: number, y: number, t: EventTarget | null) => {
      if (closingRef.current || (t instanceof Element && t.closest('input, textarea'))) return
      g = { x0: x, y0: y, list: listAt(t), mode: 'wait', off: 0, trail: [[performance.now(), y]] }
    }
    const move = (x: number, y: number, e: Event) => {
      if (!g || g.mode === 'skip') return
      if (g.mode === 'wait') {
        const dx = x - g.x0
        const dy = y - g.y0
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        if (dy <= Math.abs(dx) || (g.list && g.list.scrollTop > 0)) { g.mode = 'skip'; return }
        g.mode = 'drag'
        g.y0 = y
        el.getAnimations().forEach((a) => a.finish())
        bg.getAnimations().forEach((a) => a.finish())
      }
      if (e.cancelable) e.preventDefault()
      const d = y - g.y0
      g.off = d > 0 ? d : -Math.sqrt(-d) * 2
      el.style.transform = `translateY(${g.off}px)`
      bg.style.opacity = String(Math.max(0, 1 - g.off / el.offsetHeight))
      g.trail.push([performance.now(), y])
      if (g.trail.length > 8) g.trail.shift()
    }
    const end = () => {
      if (!g) return
      const { mode, off, trail } = g
      g = null
      if (mode !== 'drag') return
      // The drag was not a tap on what was under the finger.
      const eat = (e: Event) => { e.stopPropagation(); e.preventDefault() }
      el.addEventListener('click', eat, { capture: true, once: true })
      setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 350)
      const now = performance.now()
      const recent = trail.filter(([t]) => now - t < 100)
      const speed = recent.length > 1 ? (recent[recent.length - 1][1] - recent[0][1]) / Math.max(1, recent[recent.length - 1][0] - recent[0][0]) : 0
      if (off > Math.min(160, el.offsetHeight * 0.3) || (speed > 0.5 && off > 20)) { dismiss(Math.max(speed, 0.6)); return }
      el.style.transform = ''
      bg.style.opacity = ''
      if (reduce()) return
      el.animate([{ transform: `translateY(${off}px)` }, { transform: 'none' }], { duration: 280, easing: EASE })
      bg.animate([{ opacity: Math.max(0, 1 - off / el.offsetHeight) }, { opacity: 1 }], { duration: 280 })
    }

    const touchStart = (e: TouchEvent) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target); else g = null }
    const touchMove = (e: TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY, e)
    // A mouse drags the sheet too: the presenter shows it in the phone frame.
    const mouseMove = (e: PointerEvent) => move(e.clientX, e.clientY, e)
    const mouseUp = () => { removeEventListener('pointermove', mouseMove); end() }
    const mouseDown = (e: PointerEvent) => {
      // A mouse on text the child may copy selects it instead.
      if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target instanceof Element && e.target.closest('.selectable'))) return
      begin(e.clientX, e.clientY, e.target)
      addEventListener('pointermove', mouseMove)
      addEventListener('pointerup', mouseUp, { once: true })
    }
    el.addEventListener('touchstart', touchStart, { passive: true })
    el.addEventListener('touchmove', touchMove, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    el.addEventListener('pointerdown', mouseDown)
    return () => {
      el.removeEventListener('touchstart', touchStart)
      el.removeEventListener('touchmove', touchMove)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      el.removeEventListener('pointerdown', mouseDown)
      removeEventListener('pointermove', mouseMove)
      removeEventListener('pointerup', mouseUp)
    }
    // dismiss reads only refs, so the first one serves the whole life of the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => dismiss()
  return (
    <>
      <div ref={scrim} className={'sh-scrim' + (closing ? ' is-out' : '')} onClick={close} aria-hidden />
      <div ref={panel} className={'sh ' + className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} inert={closing}>
        <button className="sh-grip" aria-label="Закрыть" onClick={close} />
        {typeof children === 'function' ? children(close) : children}
      </div>
    </>
  )
}
