import { useEffect, useEffectEvent, useSyncExternalStore } from 'react'

// A minimal router on the History API. Vite serves index.html for every path, so deep links work.
//
// The app moves through history the way a native app moves through its stack:
// - every entry has its place in the app (`idx`), so the app knows whether a step back stays inside it;
// - a secondary tab sits one step over home, and switching between secondary tabs replaces it;
// - a lesson sits one step over the tab it was opened from; leaving it steps back, never forward to `/`;
// - a sheet or the lesson's leave guard is a "layer": an entry on the same address. Back pops the top layer.

type Entry = { idx: number; tab?: boolean; layer?: boolean; base?: number }
export type PopReason = 'back' | 'navigate'
type Layer = { idx: number; onPop: (why: PopReason) => void; closed: boolean }

const listeners = new Set<() => void>()
let layers: Layer[] = []
// A step back that the app asked for; what runs when it lands.
let inFlight = false
let afterPop: (() => void)[] = []

const entry = (): Entry => (history.state && typeof history.state.idx === 'number' ? history.state : { idx: 0 })
const notify = () => listeners.forEach((fn) => fn())
// A lesson or the lab page: a screen over the tabs. It pushes over the tab it came from; back returns there.
const isLesson = (p: string) => p.startsWith('/lesson/') || p.startsWith('/lab/')
const pathOf = (to: string) => to.split(/[?#]/)[0]

// The first entry of the app is 0. A reload on a layer entry returns to the screen under it.
{
  const st = history.state as Entry | null
  if (!st || typeof st.idx !== 'number') {
    // A lesson opened by a link gets home under it, so back leaves the lesson, not the app.
    const here = location.pathname + location.search + location.hash
    if (isLesson(location.pathname)) { history.replaceState({ idx: 0 }, '', '/'); history.pushState({ idx: 1 }, '', here) }
    else history.replaceState({ idx: 0 }, '')
  } else if (st.layer && st.idx > (st.base ?? st.idx)) history.go((st.base ?? st.idx) - st.idx)
}

function stepBack(n: number, then?: () => void) {
  inFlight = true
  if (then) afterPop.push(then)
  history.go(-n)
}

// Layers closed by their owner leave history together, from the top.
let queued = false
function flush() {
  queued = false
  if (inFlight) return
  let n = 0
  for (let i = layers.length - 1; i >= 0 && layers[i].closed; i--) n++
  if (n) stepBack(n)
}

addEventListener('popstate', () => {
  const at = entry()
  const why: PopReason = inFlight ? 'navigate' : 'back'
  inFlight = false
  const gone = layers.filter((l) => l.idx > at.idx).reverse()
  layers = layers.filter((l) => l.idx <= at.idx)
  for (const l of gone) if (!l.closed) { l.closed = true; l.onPop(why) }
  // Forward onto a layer that is no longer open: return to its screen.
  if (at.layer && at.idx > (at.base ?? at.idx) && !layers.some((l) => l.idx === at.idx)) { stepBack(at.idx - (at.base ?? at.idx)); return }
  const next = afterPop
  afterPop = []
  next.forEach((fn) => fn())
  flush()
})

// Adds a layer entry; back pops it and calls `onPop`. The returned function closes it from the app.
export function openLayer(onPop: (why: PopReason) => void): () => void {
  const l: Layer = { idx: -1, onPop, closed: false }
  const push = () => {
    if (l.closed) return
    const at = entry()
    l.idx = at.idx + 1
    history.pushState({ idx: l.idx, layer: true, base: at.layer ? at.base : at.idx } satisfies Entry, '')
    layers.push(l)
  }
  if (inFlight) afterPop.push(push)
  else push()
  return () => {
    if (l.closed) return
    l.closed = true
    if (layers.includes(l) && !queued) { queued = true; queueMicrotask(flush) }
  }
}

// Keeps a layer while `on`. It opens a tick later, so StrictMode's trial mount adds no entry.
export function useLayer(on: boolean, onPop: (why: PopReason) => void) {
  const pop = useEffectEvent(onPop)
  useEffect(() => {
    if (!on) return
    let close: (() => void) | null = null
    const t = setTimeout(() => { close = openLayer((why) => { close = null; pop(why) }) }, 0)
    return () => { clearTimeout(t); close?.() }
  }, [on])
}

function write(mode: 'push' | 'replace', to: string, st: Entry) {
  if (mode === 'push') history.pushState(st, '', to)
  else history.replaceState(st, '', to)
  notify()
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  if (inFlight) { afterPop.push(() => navigate(to, opts)); return }
  // The screen already shown stays as it is, with its sheets and the lesson's leave guard.
  if (to === location.pathname + location.search + location.hash) return
  // Open sheets close first: the new screen replaces what was under them.
  if (layers.length) { stepBack(layers.length, () => navigate(to, opts)); return }
  const at = entry()
  const from = location.pathname
  const dest = pathOf(to)
  if (isLesson(from) && !isLesson(dest)) {
    // Leaving a lesson returns to the screen under it. A lesson opened by a link has none: it becomes the target.
    if (at.idx > 0) { stepBack(1, () => navigate(to)); return }
    write('replace', to, { idx: 0 })
    return
  }
  if (opts?.replace) { write('replace', to, { idx: at.idx, tab: at.tab }); return }
  if (isLesson(dest)) {
    if (isLesson(from)) write('replace', to, { idx: at.idx })
    else write('push', to, { idx: at.idx + 1 })
    return
  }
  // Tabs: back from a secondary tab goes home, then out of the app.
  if (dest === '/') {
    if (at.tab) stepBack(1, () => navigate(to))
    else write('replace', to, { idx: at.idx })
    return
  }
  if (from === '/') write('push', to, { idx: at.idx + 1, tab: true })
  else write('replace', to, { idx: at.idx, tab: at.tab })
}

// Leaves a lesson the way it came: back to the screen under it. A lesson opened by a link goes to `fallback`.
export function leave(fallback = '/') {
  if (inFlight) { afterPop.push(() => leave(fallback)); return }
  if (layers.length) { stepBack(layers.length, () => leave(fallback)); return }
  if (!isLesson(location.pathname)) return
  if (entry().idx > 0) stepBack(1)
  else write('replace', fallback, { idx: 0 })
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  window.addEventListener('popstate', fn)
  return () => { listeners.delete(fn); window.removeEventListener('popstate', fn) }
}

export function usePath() {
  return useSyncExternalStore(subscribe, () => location.pathname)
}

// The path with its query; a new query on the same path remounts what is keyed by it.
export function useHref() {
  return useSyncExternalStore(subscribe, () => location.pathname + location.search)
}

// `/rewards#character`: a tab that stays mounted reacts to the part after `#`.
export function useHash() {
  return useSyncExternalStore(subscribe, () => location.hash)
}

// Matches `/lesson/:id` style patterns; returns the params or null.
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const a = path.split('/').filter(Boolean)
  if (p.length !== a.length) return null
  const out: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) out[p[i].slice(1)] = decodeURIComponent(a[i])
    else if (p[i] !== a[i]) return null
  }
  return out
}
