import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LESSONS, TOPICS } from '../content'
import { DEFAULT_CHARACTER, ITEMS, type Order } from '../shop/catalog'

export type HomeVersion = 'world' | 'map' | 'room'
// explain: the explanation comes first. try: the child first tries the task alone, then sees the explanation.
export type SessionVersion = 'explain' | 'try'

// An event the mentor screen reads. The app also posts each one to the local server for a live mentor screen.
export type LearnEvent =
  | { type: 'lesson-start'; lessonId: string; at: number }
  | { type: 'attempt'; lessonId: string; exId: string; correct: boolean; answer?: string; at: number }
  | { type: 'helper'; lessonId: string; exId: string; question: string; at: number }
  | { type: 'lesson-done'; lessonId: string; firstTry: number; total: number; coins: number; at: number }

type Data = {
  coins: number
  streak: number
  done: Record<string, true>
  officeDone: Record<string, true>
  unlockAll: boolean
  home: HomeVersion
  session: SessionVersion
  sound: boolean
  // The streak grows by one on the first finished lesson of a day.
  lastDay: string
  // The weekly class quest: exercises the whole class did this week, toward a shared goal.
  quest: number
  events: LearnEvent[]
  // Shop: bought desk items and characters, desk items at the child's desk, the chosen character, real prize orders.
  owned: Record<string, true>
  desk: string[]
  character: string
  orders: Order[]
  // Grows with each «Сбросить прогресс»: the island starts fresh when it changes.
  resets: number
}

type Actions = {
  addCoins: (n: number) => void
  completeLesson: (lessonId: string) => void
  // One right answer is one step of the class quest.
  questStep: () => void
  log: (e: LearnEvent) => void
  set: (patch: Partial<Pick<Data, 'home' | 'session' | 'unlockAll' | 'sound'>>) => void
  toggleOffice: (topicId: string) => void
  // Spends codecoins; false when the balance is short. A prize becomes an order.
  buy: (itemId: string) => boolean
  putOnDesk: (itemId: string) => void
  takeFromDesk: (itemId: string) => void
  chooseCharacter: (id: string) => void
  reset: () => void
}

const SHOP_SEED: Pick<Data, 'owned' | 'desk' | 'character' | 'orders'> = { owned: {}, desk: [], character: DEFAULT_CHARACTER, orders: [] }

export const ownsItem = (s: Pick<Data, 'owned'>, id: string) => ITEMS[id]?.price === 0 || !!s.owned[id]

// The demo starts in the middle of a course: the first topic is done, loops are next.
const SEED: Data = {
  coins: 120,
  streak: 4,
  done: { 'algorithms-1': true, 'algorithms-2': true },
  officeDone: {},
  unlockAll: false,
  home: 'world',
  session: 'explain',
  sound: true,
  lastDay: '',
  quest: 142,
  events: [],
  resets: 0,
  ...SHOP_SEED,
}

export const QUEST_GOAL = 200
const today = () => new Date().toDateString()

export const useApp = create<Data & Actions>()(
  persist(
    (set, get) => ({
      ...SEED,
      addCoins: (n) => set((s) => ({ coins: s.coins + n })),
      questStep: () => set((s) => ({ quest: s.quest + 1 })),
      completeLesson: (id) => set((s) => ({
        done: { ...s.done, [id]: true },
        streak: s.lastDay === today() ? s.streak : s.streak + 1,
        lastDay: today(),
      })),
      log: (e) => {
        set((s) => ({ events: [...s.events, e].slice(-500) }))
        fetch('/api/events', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) }).catch(() => {})
      },
      set: (patch) => set(patch),
      toggleOffice: (id) => set((s) => {
        const next = { ...s.officeDone }
        if (next[id]) delete next[id]
        else next[id] = true
        return { officeDone: next }
      }),
      buy: (id) => {
        const item = ITEMS[id]
        const s = get()
        if (!item || s.coins < item.price || (item.kind !== 'prize' && ownsItem(s, id))) return false
        if (item.kind === 'prize') set({ coins: s.coins - item.price, orders: [...s.orders, { no: 1041 + s.orders.length, prize: id, at: Date.now() }] })
        else set({ coins: s.coins - item.price, owned: { ...s.owned, [id]: true } })
        return true
      },
      putOnDesk: (id) => set((s) => (s.owned[id] && !s.desk.includes(id) ? { desk: [...s.desk, id] } : s)),
      takeFromDesk: (id) => set((s) => ({ desk: s.desk.filter((d) => d !== id) })),
      chooseCharacter: (id) => set((s) => (ITEMS[id]?.kind === 'character' && ownsItem(s, id) ? { character: id } : s)),
      reset: () => set((s) => ({ ...SEED, home: s.home, session: s.session, sound: s.sound, resets: s.resets + 1 })),
    }),
    {
      name: 'codify-proto',
      version: 3,
      // Version 2 adds the shop; saved progress keeps its fields. Version 3 makes the island the home once.
      migrate: (saved, version) => {
        const s = { ...SHOP_SEED, ...(saved as Partial<Data>) }
        if (version < 3) s.home = 'world'
        return s as Data & Actions
      },
    },
  ),
)

export type LessonState = 'done' | 'now' | 'open' | 'locked' | 'office'

// A lesson opens when the lesson before it is done (mastery before moving on) and its topic is not waiting for the office.
export function lessonStates(s: Pick<Data, 'done' | 'officeDone' | 'unlockAll'>): Record<string, LessonState> {
  const out: Record<string, LessonState> = {}
  let prevDone = true
  let nowSet = false
  for (const { topic, lesson } of LESSONS) {
    let st: LessonState
    if (s.done[lesson.id]) st = 'done'
    else if (topic.office && !s.officeDone[topic.id] && !s.unlockAll) st = 'office'
    else if (prevDone || s.unlockAll) st = nowSet ? 'open' : 'now'
    else st = 'locked'
    if (st === 'now') nowSet = true
    out[lesson.id] = st
    prevDone = st === 'done'
  }
  return out
}

export function useLessonStates() {
  const done = useApp((s) => s.done)
  const officeDone = useApp((s) => s.officeDone)
  const unlockAll = useApp((s) => s.unlockAll)
  return lessonStates({ done, officeDone, unlockAll })
}

// The lesson the home screen offers next: the first open one, or the last lesson when all are done.
export function nextLesson(states: Record<string, LessonState>) {
  return LESSONS.find(({ lesson }) => states[lesson.id] === 'now') ?? LESSONS[LESSONS.length - 1]
}

export function topicProgress(topicId: string, done: Record<string, true>) {
  const t = TOPICS.find((x) => x.id === topicId)
  if (!t) return 0
  return t.lessons.filter((l) => done[l.id]).length / t.lessons.length
}
