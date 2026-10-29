import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LESSONS, TOPICS } from '../content'
import { achievementOf } from '../rewards/achievements'
import { DEFAULT_CHARACTER, ITEMS, levelOf } from '../rewards/catalog'

export type HomeVersion = 'world' | 'map' | 'room'
// explain: the explanation comes first. try: the child first tries the task alone, then sees the explanation.
export type SessionVersion = 'explain' | 'try'

// An event the teacher's room reads. The app also posts each one to the local server for a live mentor screen.
export type LearnEvent =
  | { type: 'lesson-start'; lessonId: string; at: number }
  | { type: 'attempt'; lessonId: string; exId: string; correct: boolean; answer?: string; at: number }
  | { type: 'helper'; lessonId: string; exId: string; question: string; at: number }
  | { type: 'lesson-done'; lessonId: string; firstTry: number; total: number; xp: number; at: number }

type Data = {
  xp: number
  streak: number
  done: Record<string, true>
  officeDone: Record<string, true>
  unlockAll: boolean
  home: HomeVersion
  session: SessionVersion
  sound: boolean
  // The streak grows by one on the first finished lesson of a day.
  lastDay: string
  // The weekly class quest: missions the whole class did this week, toward a shared goal.
  quest: number
  events: LearnEvent[]
  // Rewards: desk items from achievements standing at the child's desk, the chosen character.
  desk: string[]
  character: string
  // Grows with each «Сбросить прогресс»: the island starts fresh when it changes.
  resets: number
}

type Actions = {
  addXp: (n: number) => void
  completeLesson: (lessonId: string) => void
  // One right answer is one step of the class quest.
  questStep: () => void
  log: (e: LearnEvent) => void
  set: (patch: Partial<Pick<Data, 'home' | 'session' | 'unlockAll' | 'sound'>>) => void
  toggleOffice: (topicId: string) => void
  putOnDesk: (itemId: string) => void
  takeFromDesk: (itemId: string) => void
  chooseCharacter: (id: string) => void
  reset: () => void
}

// A desk item is the child's once its achievement is earned; a character once the child reaches its level.
export function ownsItem(s: Pick<Data, 'xp' | 'streak' | 'done' | 'events'>, id: string) {
  const item = ITEMS[id]
  if (!item) return false
  if (item.kind === 'character') return levelOf(s.xp) >= (item.level ?? 1)
  return !!achievementOf(id)?.test(s)
}

// The demo starts in the middle of the island: mathematics is done, informatics is next.
const SEED: Data = {
  xp: 140,
  streak: 4,
  done: { 'math-1': true, 'math-2': true },
  officeDone: {},
  unlockAll: false,
  home: 'world',
  session: 'explain',
  sound: true,
  lastDay: '',
  quest: 142,
  events: [],
  resets: 0,
  desk: [],
  character: DEFAULT_CHARACTER,
}

export const QUEST_GOAL = 200
const today = () => new Date().toDateString()

export const useApp = create<Data & Actions>()(
  persist(
    (set) => ({
      ...SEED,
      addXp: (n) => set((s) => ({ xp: s.xp + n })),
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
      putOnDesk: (id) => set((s) => (ITEMS[id]?.kind === 'desk' && ownsItem(s, id) && !s.desk.includes(id) ? { desk: [...s.desk, id] } : s)),
      takeFromDesk: (id) => set((s) => ({ desk: s.desk.filter((d) => d !== id) })),
      chooseCharacter: (id) => set((s) => (ITEMS[id]?.kind === 'character' && ownsItem(s, id) ? { character: id } : s)),
      reset: () => set((s) => ({ ...SEED, home: s.home, session: s.session, sound: s.sound, resets: s.resets + 1 })),
    }),
    {
      name: 'bilimquest',
      version: 1,
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
