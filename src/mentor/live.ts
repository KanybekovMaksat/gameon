import { useSyncExternalStore } from 'react'
import { useApp, type LearnEvent } from '../app/store'
import { eventKey, parseEvent } from './data'

// The real child's events: from the local server (any phone) and from the store (a lesson in another tab of this browser).
// The same event comes from both; its key keeps one copy.

export type LiveStatus = 'wait' | 'live' | 'off'
// The lesson a new event touched. `n` grows with each arrival, so the same lesson animates again.
export type Fresh = { lessonId: string; n: number }
type Snapshot = { events: LearnEvent[]; status: LiveStatus; fresh: Fresh | null }

const POLL = 2000
const FRESH = 2600
// A request that hangs longer than this is dropped, so the next poll still happens.
const TIMEOUT = 5000
// One failed poll can be a hiccup; this many in a row means the connection is lost.
const LOST_AFTER = 2

let snap: Snapshot = { events: [], status: 'wait', fresh: null }
const listeners = new Set<() => void>()
const seen = new Set<string>()
let cursor = 0
// The id of the server's start: a new id means the server restarted and counts its events from zero again.
let boot: string | null = null
let failures = 0
// Events before the first answer of the server are the starting state: they do not animate.
let ready = false
let freshCount = 0
let timer: ReturnType<typeof setTimeout> | undefined
let freshTimer: ReturnType<typeof setTimeout> | undefined
let unsubStore: (() => void) | undefined
// Each start begins a new poll loop; a loop from an earlier start stops by itself.
let gen = 0

function emit(next: Partial<Snapshot>) {
  snap = { ...snap, ...next }
  listeners.forEach((fn) => fn())
}

function add(list: LearnEvent[]) {
  const added = list.filter((e) => {
    const k = eventKey(e)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (!added.length) return
  const events = [...snap.events, ...added].sort((a, b) => a.at - b.at)
  if (!ready) { emit({ events }); return }
  const latest = added.reduce((a, b) => (b.at >= a.at ? b : a))
  clearTimeout(freshTimer)
  freshTimer = setTimeout(() => emit({ fresh: null }), FRESH)
  emit({ events, fresh: { lessonId: latest.lessonId, n: ++freshCount } })
}

const valid = (list: unknown) => (Array.isArray(list) ? list.map(parseEvent).filter((e): e is LearnEvent => !!e) : [])

async function poll(g: number) {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT)
  let delay = POLL
  try {
    const res = await fetch(`/api/events?since=${cursor}`, { cache: 'no-store', signal: ctrl.signal })
    if (!res.ok) throw new Error(String(res.status))
    const body = (await res.json()) as { next?: unknown; events?: unknown; boot?: unknown }
    const next = typeof body.next === 'number' ? body.next : 0
    const id = typeof body.boot === 'string' ? body.boot : null
    // The server keeps events in memory. After a restart it has a new start id (an older server shows a smaller count):
    // ask again from zero at once. Events already seen keep their keys, so nothing doubles.
    const restarted = (boot !== null && id !== boot) || next < cursor
    boot = id
    if (restarted) {
      cursor = 0
      delay = 0
    } else {
      cursor = next
      add(valid(body.events))
    }
    failures = 0
    if (snap.status !== 'live') emit({ status: 'live' })
  } catch {
    failures++
    if (failures >= LOST_AFTER && snap.status !== 'off') emit({ status: 'off' })
  } finally {
    clearTimeout(timeout)
  }
  ready = true
  if (g === gen && listeners.size) timer = setTimeout(() => void poll(g), delay)
}

// Another tab writes the store to localStorage; reading it again brings its events here.
function onStorage(e: StorageEvent) {
  if (e.key === useApp.persist.getOptions().name) void useApp.persist.rehydrate()
}

// Store events come from localStorage, which any page on this address can write: they pass the same check as the server's.
function start() {
  gen++
  add(valid(useApp.getState().events))
  unsubStore = useApp.subscribe((s) => add(valid(s.events)))
  window.addEventListener('storage', onStorage)
  void poll(gen)
}

function stop() {
  gen++
  clearTimeout(timer)
  unsubStore?.()
  window.removeEventListener('storage', onStorage)
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (listeners.size === 1) start()
  return () => {
    listeners.delete(fn)
    if (!listeners.size) stop()
  }
}

export function useLive() {
  return useSyncExternalStore(subscribe, () => snap)
}
