import type { LearnEvent } from '../app/store'
import type { IconName } from '../components'
import { TOPICS } from '../content'
import { levelOf } from './catalog'

// What an achievement looks at: the progress the store keeps.
export type Progress = { xp: number; streak: number; done: Record<string, true>; events: LearnEvent[] }

// An achievement is earned once its test passes; it stays earned while the progress holds. `item`: the desk item
// it brings.
export type Achievement = { id: string; title: string; text: string; icon: IconName; item: string; test: (p: Progress) => boolean }

const subjectDone = (p: Progress, id: string) => !!TOPICS.find((t) => t.id === id)?.lessons.every((l) => p.done[l.id])
const subjectsTried = (p: Progress) => TOPICS.filter((t) => t.lessons.some((l) => p.done[l.id])).length

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', title: 'Первый шаг', text: 'Пройди первый урок.', icon: 'flag', item: 'books', test: (p) => Object.keys(p.done).length > 0 },
  { id: 'math', title: 'Математик', text: 'Пройди все уроки математики.', icon: 'math', item: 'lamp', test: (p) => subjectDone(p, 'math') },
  { id: 'explorer', title: 'Исследователь', text: 'Пройди уроки по трём разным предметам.', icon: 'globe', item: 'cactus', test: (p) => subjectsTried(p) >= 3 },
  { id: 'robik', title: 'Спроси Робика', text: 'Попроси Робика объяснить трудное место.', icon: 'spark', item: 'bear', test: (p) => p.events.some((e) => e.type === 'helper') },
  { id: 'clean', title: 'Без ошибок', text: 'Реши все миссии урока с первой попытки.', icon: 'check', item: 'monitor', test: (p) => p.events.some((e) => e.type === 'lesson-done' && e.total > 0 && e.firstTry === e.total) },
  { id: 'streak', title: 'Пять дней подряд', text: 'Учись пять дней подряд.', icon: 'flame', item: 'speaker', test: (p) => p.streak >= 5 },
  { id: 'level', title: 'Уровень 3', text: 'Набери 300 XP.', icon: 'star', item: 'radio', test: (p) => levelOf(p.xp) >= 3 },
  { id: 'island', title: 'Весь остров', text: 'Пройди уроки по всем предметам.', icon: 'trophy', item: 'chair', test: (p) => subjectsTried(p) === TOPICS.length },
]

export const earned = (p: Progress) => ACHIEVEMENTS.filter((a) => a.test(p))
export const achievementOf = (item: string) => ACHIEVEMENTS.find((a) => a.item === item)
